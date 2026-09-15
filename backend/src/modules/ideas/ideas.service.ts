import { Injectable, Logger, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { LlmClientService } from '../llm/services/llm-client.service';
import { WebSearchService } from '../web-search/web-search.service';
import { parseLlmJson } from '../llm/utils/llm-json-parser';
import { LlmProvider } from '../llm/types/llm.types';
import {
  Signal,
  RawIdea,
  ValidationResult,
  ValidationBreakdown,
  BusinessIdea,
  GenerateIdeasResponse,
  IdeasProgressEvent,
  DiscoveredTopic,
} from './interfaces/idea.interface';
import {
  SIGNAL_GATHERING_PROMPT,
  IDEA_GENERATION_PROMPT,
  VALIDATION_PROMPT,
  TOPIC_DISCOVERY_PROMPT,
  DISCOVERY_QUERY_GENERATION_PROMPT,
} from './constants/idea-prompts.constant';
import { SavedIdeaSession } from './entities/saved-idea-session.entity';
import { SavedIdea } from './entities/saved-idea.entity';

const MAX_DOMAIN_LENGTH = 500;
const MAX_PARALLEL_VALIDATION = 3;
// Candidate sessions are independent (own searches, signals, LLM calls), so they run
// in bounded-parallel batches. Kept at 3: higher bursts hit provider 429s on free tiers.
const MAX_PARALLEL_SESSIONS = 3;
// Two domains are duplicates when their token overlap is this high — prevents a run of
// five sessions on near-identical topics ("agency profitability" x5).
const DOMAIN_DUPLICATE_JACCARD = 0.6;
const OVERALL_TIMEOUT_MS = 150_000;
// Search engines (incl. SearXNG) return noisy/empty results on long boolean
// queries. Cap `searchQuery` to a short, focused phrase so buildSignalQueries
// produces queries SearXNG can actually index.
const MAX_SEARCH_QUERY_WORDS = 6;
// SearXNG sits behind a single egress IP, and every query fans out to each
// enabled engine. Firing all queries at once (e.g. 5 queries x 2 channels)
// produces a burst of dozens of requests from one address — which is exactly
// what triggers the engines' "Suspended: too many requests" / CAPTCHA blocks.
// Cap concurrency at one query so the request rate stays restrained.
export const MAX_PARALLEL_SEARCH = 1;
// Short pause between consecutive queries. Without it, even a concurrency of 1
// still produces a dense burst; the gap lets the engines breathe and spreads
// the requests out along the time axis.
export const SEARCH_STAGGER_MS = 300;

@Injectable()
export class IdeasService {
  private readonly logger = new Logger(IdeasService.name);

  /**
   * Deterministic blocklist enforced in code (not just in prompts) so that
   * scraped-ad / trend-mapper ideas cannot slip through even when the LLM
   * ignores the textual blacklist. Matched case-insensitively as substrings
   * against the domain, idea title, and idea description.
   */
  private readonly BLACKLISTED_DOMAIN_KEYWORDS = [
    'ad librar',
    'meta ads',
    'tiktok ads',
    'google trends',
    'pinterest',
    'adspy',
    'ad spy',
    'competitor ad',
    'trend mapper',
    'creative auditor',
  ];

  /**
   * Domains we trust as a source of real user pain points. Anything outside
   * this list is treated as noise and dropped before reaching the LLM.
   * Reason: SearXNG frequently returns off-topic results (random marketing
   * pages, foreign-language menus, login screens) even when the query uses
   * `site:reddit.com`. Without this filter the LLM happily hallucinates
   * plausible "signals" out of the garbage and the `groundedInSignals` flag
   * becomes a false positive.
   */
  private readonly TRUSTED_SIGNAL_DOMAINS = ['reddit.com', 'indiehackers.com', 'news.ycombinator.com', 'producthunt.com', 'quora.com'];

  /**
   * Static search queries used as a fallback when the LLM fails to generate
   * current, date-aware discovery queries. Kept so the nightly cron still has
   * something to search even if the query-generation step fails.
   * Each query targets a TRUSTED_SIGNAL_DOMAINS site via `site:` so the
   * trusted-domain filter downstream does not drop everything as off-domain.
   */
  private readonly FALLBACK_DISCOVERY_QUERIES = [
    'site:reddit.com agency manual reporting hours wasted',
    'site:reddit.com B2B spreadsheet process bottleneck',
    'site:news.ycombinator.com Ask HN willing to pay tool',
    'site:indiehackers.com validated micro saas pain point',
  ];

  constructor(
    private readonly llm: LlmClientService,
    private readonly webSearch: WebSearchService,
    @InjectRepository(SavedIdeaSession)
    private readonly sessionRepository: Repository<SavedIdeaSession>,
    @InjectRepository(SavedIdea)
    private readonly ideaRepository: Repository<SavedIdea>,
    private readonly dataSource: DataSource,
  ) {}

  // ---------------------------------------------------------------------------
  // Persistence layer (Phase 1)
  // ---------------------------------------------------------------------------

  /**
   * Maps one generated BusinessIdea to a SavedIdea persistence row.
   * Centralized here so the field mapping exists in exactly one place.
   */
  private mapIdeaToSaved(userId: number, sessionId: number, idea: BusinessIdea): SavedIdea {
    const saved = new SavedIdea();
    saved.userId = userId;
    saved.sessionId = sessionId;
    saved.title = idea.title;
    saved.description = idea.description;
    saved.targetMarket = idea.targetMarket;
    saved.validationScore = idea.validationScore;
    saved.validationBreakdown = idea.validationBreakdown ?? null;
    saved.validationReason = idea.validationReason ?? null;
    saved.risks = idea.risks?.length ? idea.risks : null;
    saved.competitors = idea.competitors?.length ? idea.competitors : null;
    saved.nextSteps = idea.nextSteps?.length ? idea.nextSteps : null;
    saved.signalsReferenced = idea.signalsReferenced?.length ? idea.signalsReferenced : null;
    saved.techStackSuggestion = idea.techStackSuggestion ?? null;
    saved.firstDistributionStep = idea.firstDistributionStep ?? null;
    saved.estimatedMvpDays = idea.estimatedMvpDays ?? null;
    saved.groundedInSignals = idea.groundedInSignals;
    saved.isFavorite = false;
    return saved;
  }

  /**
   * Persists a full generation run (one session + all its ideas) in a single
   * transaction. Returns the new session id. Best-effort for callers — wrap in
   * try/catch at the call site and never let a save failure break the response.
   */
  async saveGeneration(
    userId: number,
    domain: string,
    provider: string | null,
    model: string | null,
    response: GenerateIdeasResponse,
    opts?: { nightly?: boolean; unread?: boolean },
  ): Promise<number> {
    const ideas = response.result ?? [];
    if (ideas.length === 0) {
      return 0;
    }

    const session = new SavedIdeaSession();
    session.userId = userId;
    session.domain = domain;
    session.provider = provider ?? null;
    session.model = model ?? null;
    session.nightly = opts?.nightly ?? false;
    session.unread = opts?.unread ?? false;

    await this.dataSource.transaction(async (manager) => {
      const savedSession = await manager.save(session);
      const savedIdeas = ideas.map((idea) => this.mapIdeaToSaved(userId, savedSession.id, idea));
      await manager.save(SavedIdea, savedIdeas);
    });

    return session.id;
  }

  /**
   * Lists the user's saved sessions (newest first). When `nightly` is true,
   * only nightly cron sessions are returned. When `favorites` is true, only
   * sessions that contain at least one favorited idea are returned.
   */
  async listSessions(userId: number, filters?: { nightly?: boolean; favorites?: boolean }): Promise<SavedIdeaSession[]> {
    const qb = this.sessionRepository
      .createQueryBuilder('session')
      .loadRelationCountAndMap('session.ideasCount', 'session.ideas')
      .where('session.userId = :userId', { userId });

    if (filters?.nightly) {
      qb.andWhere('session.nightly = :nightly', { nightly: true });
    }

    if (filters?.favorites) {
      qb.andWhere(`session.id IN (SELECT DISTINCT idea.sessionId FROM saved_ideas idea WHERE idea.userId = :userId AND idea.isFavorite = :fav)`, {
        fav: true,
      });
    }

    qb.orderBy('session.createdAt', 'DESC');
    return qb.getMany();
  }

  /**
   * Returns one session with its ideas. Throws ForbiddenException if the session
   * does not exist or is not owned by the user.
   */
  async getSession(userId: number, sessionId: number): Promise<SavedIdeaSession> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId, userId },
      relations: ['ideas'],
    });

    if (!session) {
      throw new ForbiddenException('אינך מורשה לגשת לשמירת רעיונות זו או שהיא אינה קיימת.');
    }

    return session;
  }

  /**
   * Deletes a session and (via cascade) all its ideas. Throws ForbiddenException
   * if the session does not exist or is not owned by the user.
   */
  async deleteSession(userId: number, sessionId: number): Promise<void> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId, userId },
    });

    if (!session) {
      throw new ForbiddenException('אינך מורשה למחוק שמירת רעיונות זו או שהיא אינה קיימת.');
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(SavedIdeaSession, sessionId);
    });
  }

  /**
   * Toggles the favorite flag on a single idea. Ownership is enforced via the
   * idea's denormalized `userId` column (no session join needed). Throws
   * ForbiddenException if the idea does not exist or is not owned by the user.
   */
  async setFavorite(userId: number, ideaId: number, isFavorite: boolean): Promise<void> {
    const idea = await this.ideaRepository.findOne({
      where: { id: ideaId, userId },
    });

    if (!idea) {
      throw new ForbiddenException('אינך מורשה לשנות רעיון זה או שהוא אינו קיים.');
    }

    idea.isFavorite = isFavorite;
    await this.ideaRepository.save(idea);
  }

  /**
   * Counts the user's nightly sessions that have not yet been read. Drives the
   * "new ideas this morning" banner in the UI.
   */
  async unreadNightlyCount(userId: number): Promise<number> {
    return this.sessionRepository.count({
      where: { userId, nightly: true, unread: true },
    });
  }

  /**
   * Marks all of the user's unread nightly sessions as read.
   */
  async markNightlyRead(userId: number): Promise<void> {
    await this.sessionRepository.update({ userId, nightly: true, unread: true }, { unread: false });
  }

  async generateIdeas(
    domain: string,
    count: number,
    onProgress?: (event: IdeasProgressEvent) => void,
    userId?: number,
    providerOverride?: string,
    modelOverride?: string,
    searchQuery?: string,
  ): Promise<GenerateIdeasResponse> {
    const cleanDomain = this.sanitizeDomain(domain);
    if (!cleanDomain) {
      throw new BadRequestException('התחום ריק או מכיל תווים לא חוקיים');
    }

    const providerKey = providerOverride as LlmProvider | undefined;
    const deadline = Date.now() + OVERALL_TIMEOUT_MS;
    const searchTerm = this.sanitizeSearchQuery(searchQuery) ?? cleanDomain;

    const { signals, groundedInSignals } = await this.gatherSignals(
      cleanDomain,
      searchTerm,
      onProgress,
      deadline,
      userId,
      providerKey,
      modelOverride,
    );

    onProgress?.({ phase: 1, status: 'מייצר רעיונות...' });
    const rawIdeas = await this.generateIdeasFromSignals(cleanDomain, signals, count, userId, providerKey, modelOverride);

    onProgress?.({ phase: 2, status: 'מאמת מול מתחרים...' });
    const { ideas, failedCount } = await this.validateIdeas(rawIdeas, signals, searchTerm, onProgress, deadline, userId, providerKey, modelOverride);

    const partial = failedCount > 0 || !groundedInSignals;
    const result = this.sortByScore(ideas);

    const message = !groundedInSignals
      ? 'נוצרו רעיונות ללא עיגון במחקר שוק — התוצאות עשויות להיות פחות מבוססות'
      : `נוצרו ${result.length} רעיונות עבור "${cleanDomain}"`;

    const response: GenerateIdeasResponse = {
      success: true,
      message,
      partial,
      result,
      ...(failedCount > 0 ? { failedCount } : {}),
    };

    onProgress?.({ phase: 'done', result: response });
    return response;
  }

  /**
   * Discovers N topics/domains suitable for a solo bootstrapped developer by
   * searching the web for trends and pain points, then asking the LLM to
   * extract concrete domains. Used by the nightly cron to replace the static
   * IDEAS_NIGHTLY_DOMAINS list.
   *
   * Returns an array of `{ domain, rationale }` objects where `domain` is the
   * sanitized search term passed to `generateIdeas` and `rationale` is the
   * LLM's reasoning for why it fits a solo developer. Returns an empty array
   * on failure (caller should skip the run).
   */
  /**
   * Generates date-aware web-search queries for topic discovery by asking the
   * LLM to suggest currently hot/trending pain points instead of relying on a
   * static evergreen list. Today's date is injected into the prompt so the
   * suggestions stay current.
   *
   * @param userId - optional user id passed through to the LLM client for
   *   provider/model resolution and usage attribution.
   * @param providerOverride - optional explicit LLM provider.
   * @param modelOverride - optional explicit LLM model.
   * @returns An array of 1-6 non-empty search query strings. Falls back to
   *   {@link FALLBACK_DISCOVERY_QUERIES} if the LLM call fails or returns no
   *   usable queries, so the nightly cron never loses its search step.
   */
  private async generateDiscoveryQueries(userId?: number, providerOverride?: LlmProvider, modelOverride?: string): Promise<string[]> {
    const today = new Date().toISOString().slice(0, 10);
    const prompt = `Today's date: ${today}\n\nSuggest 4 specific web-search queries in English to find recent software pain points and underserved niches for solo builders. Return ONLY a JSON array of strings.`;

    try {
      const res = await this.llm.generateResponse({
        prompt,
        systemContext: DISCOVERY_QUERY_GENERATION_PROMPT,
        // Thinking models (OmniRoute auto, glm-4.7-flash) burn a significant part
        // of the budget on invisible reasoning tokens — 1024 cut the JSON off
        // in the middle (finish_reason=length after only ~300 chars of content)
        maxTokens: 3072,
        userId,
        providerOverride,
        modelOverride,
      });

      const parsed = parseLlmJson<string[]>(res.content, 'discovery-query-generation');
      const queries = Array.isArray(parsed) ? parsed.filter((q) => typeof q === 'string' && q.trim().length > 0).slice(0, 6) : [];

      if (queries.length > 0) {
        return queries;
      }
    } catch (error) {
      this.logger.warn(`Discovery query generation failed, using fallback queries: ${error instanceof Error ? error.message : 'unknown'}`);
    }

    return this.FALLBACK_DISCOVERY_QUERIES;
  }

  async discoverTopics(count: number, userId?: number, providerOverride?: LlmProvider, modelOverride?: string): Promise<DiscoveredTopic[]> {
    const queries = await this.generateDiscoveryQueries(userId, providerOverride, modelOverride);

    // Channels per query are decided by WebSearchService.searchChannels: SearXNG
    // (best-effort — its engines are often flagged as bots and blocked), HN Algolia
    // (direct API, reliable, returns only trusted domains) and Google CSE. Running
    // several channels means a failure of one does not produce a night with zero topics.
    // PullPush (Reddit archive) was removed — the API blocks agents with a permanent 429.
    // Queries themselves run gradually via runSearchesThrottled, so the engines
    // are never hit by a burst of requests from a single IP address.
    const settled = await this.runSearchesThrottled(queries, (q) => this.webSearch.searchChannels(q));

    const contents: string[] = [];
    let trustedCount = 0;
    let droppedCount = 0;
    for (const s of settled) {
      if (s.status === 'fulfilled' && s.value.success && s.value.result) {
        for (const r of s.value.result.results) {
          if (this.isTrustedSignalUrl(r.url)) {
            // Snippet shortening: reasoning models burn budget in proportion to input size —
            // with 26+ full snippets both attempts (2048/3072) returned empty
            // content, and with 4 short snippets it passed. Trimming to 280 chars.
            contents.push(`${r.title}: ${r.content.slice(0, 280)}`);
            trustedCount += 1;
          } else {
            droppedCount += 1;
          }
        }
      }
    }
    if (droppedCount > 0) {
      this.logger.warn(`Signal discovery: dropped ${droppedCount} off-domain result(s) (kept ${trustedCount} from trusted signal sources)`);
    }

    if (contents.length === 0) {
      this.logger.warn(
        'Topic discovery: no trusted-domain results (SearXNG may be returning off-domain noise — check engine config and language setting)',
      );
      return [];
    }

    const recentDomains = userId ? await this.getRecentDomains(userId) : [];
    const avoidText = recentDomains.length
      ? `נישות/פלטפורמות שנבדקו לאחרונה - אל תציע אותן שוב ואל תציע תת-נישה קרובה אליהן:\n${recentDomains.join('\n')}`
      : '';

    const prompt = `תוצאות חיפוש:\n${contents.slice(0, 12).join('\n\n')}\n\n${avoidText}\n\nכמה נושאים לגלות: ${count}`;
    try {
      // Two failure modes of reasoning models on a low budget: (a) completely empty
      // content ("Returned no content or tool calls") — the call throws an error; (b) truncation
      // at the end of the budget (finish_reason=length) — truncated JSON that fails parsing. Both
      // need a retry: the loop covers both the call and the parsing, and the second
      // attempt gets 8192 — the budget proven to work for heavy prompts (idea generation).
      let topics: { domain: string; searchQuery?: string; rationale?: string }[] | null = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        let res;
        try {
          res = await this.llm.generateResponse({
            prompt,
            systemContext: TOPIC_DISCOVERY_PROMPT,
            maxTokens: attempt === 1 ? 4096 : 8192,
            userId,
            providerOverride,
            modelOverride,
          });
        } catch (error) {
          if (attempt === 2) throw error;
          this.logger.warn(
            `Topic discovery LLM attempt 1 failed (${error instanceof Error ? error.message : 'unknown'}) — retrying with larger budget`,
          );
          continue;
        }

        const parsed = parseLlmJson<{ topics: { domain: string; searchQuery?: string; rationale?: string }[] }>(res.content, 'topic-discovery');
        if (parsed?.topics && Array.isArray(parsed.topics) && parsed.topics.length > 0) {
          topics = parsed.topics;
          break;
        }
        if (attempt === 1) {
          this.logger.warn(
            `Topic discovery attempt 1 returned no usable topics (empty/truncated JSON, finish_reason=${res.finishReason ?? 'unknown'}) — retrying with larger budget`,
          );
        }
      }

      if (!topics) {
        throw new Error('empty topics');
      }

      const sanitized = topics
        .slice(0, count)
        .map((t) => ({
          domain: this.sanitizeDomain(t.domain),
          searchQuery: this.sanitizeSearchQuery(t.searchQuery),
          rationale: typeof t.rationale === 'string' ? t.rationale : '',
        }))
        .filter((t) => t.domain.length > 0 && !this.isBlacklistedDomain(t.domain));

      if (sanitized.length < topics.slice(0, count).length) {
        this.logger.warn(`Topic discovery: dropped ${topics.slice(0, count).length - sanitized.length} topic(s) by deterministic blacklist`);
      }

      return sanitized;
    } catch (error) {
      this.logger.warn(`Topic discovery failed: ${error instanceof Error ? error.message : 'unknown'}`);
      return [];
    }
  }

  /**
   * Cron-only hard-gate orchestrator. Discovers up to `targetCount * 3`
   * candidate topics, then for each runs `generateIdeas` and keeps the
   * candidate only if at least one of its ideas is `groundedInSignals`.
   * Candidates that fail to gather real signals are dropped (logged) — we
   * would rather skip a topic than persist a session full of LLM
   * speculation that shows "⚠️ ללא עיגון מלא" ("no full grounding") in the UI.
   *
   * Per-candidate failures are isolated so a single timeout does not abort
   * the whole batch. Returns up to `targetCount` grounded results in
   * discovery order.
   */
  async generateGroundedIdeasForCron(
    targetCount: number,
    userId: number,
    providerOverride?: LlmProvider,
    modelOverride?: string,
  ): Promise<{ topic: DiscoveredTopic; response: GenerateIdeasResponse }[]> {
    const candidatePoolSize = targetCount * 3;
    this.logger.log(`Grounded cron: discovering ${candidatePoolSize} candidate topics for target of ${targetCount} grounded sessions`);

    const candidates = await this.discoverTopics(candidatePoolSize, userId, providerOverride, modelOverride);

    if (candidates.length === 0) {
      this.logger.warn('Grounded cron: no candidates from discoverTopics');
      return [];
    }

    const results: { topic: DiscoveredTopic; response: GenerateIdeasResponse }[] = [];
    for (let i = 0; i < candidates.length && results.length < targetCount; i += MAX_PARALLEL_SESSIONS) {
      const batch = candidates.slice(i, i + MAX_PARALLEL_SESSIONS);
      const settled = await Promise.allSettled(
        batch.map(async (candidate) => ({
          topic: candidate,
          response: await this.generateIdeas(candidate.domain, 5, undefined, userId, providerOverride, modelOverride, candidate.searchQuery),
        })),
      );

      for (const s of settled) {
        if (results.length >= targetCount) break;
        if (s.status === 'rejected') {
          this.logger.warn(`Grounded cron: candidate failed: ${s.reason instanceof Error ? s.reason.message : 'unknown'}`);
          continue;
        }
        const { topic, response } = s.value;
        const grounded = (response.result ?? []).some((idea) => idea.groundedInSignals);
        if (!grounded || (response.result ?? []).length === 0) {
          this.logger.warn(`Grounded cron: skipping ungrounded candidate domain: "${topic.domain}"`);
          continue;
        }
        if (this.isDuplicateDomain(topic.domain, results.map((r) => r.topic.domain))) {
          this.logger.warn(`Grounded cron: skipping near-duplicate domain: "${topic.domain}"`);
          continue;
        }
        results.push({ topic, response });
        this.logger.log(`Grounded cron: accepted "${topic.domain}" (${response.result?.length} ideas, grounded)`);
      }
    }

    this.logger.log(`Grounded cron: produced ${results.length}/${targetCount} grounded session(s) from ${candidates.length} candidate(s)`);
    return results;
  }

  /**
   * Jaccard token overlap between a domain and accepted ones. Hebrew and Latin tokens
   * mix freely — tokenization is whitespace only, comparison is exact-match.
   */
  private isDuplicateDomain(domain: string, accepted: string[]): boolean {
    const tokensOf = (text: string): Set<string> =>
      new Set(text.toLowerCase().split(/\s+/).filter((t) => t.length > 1));
    const tokens = tokensOf(domain);
    if (tokens.size === 0) return false;
    return accepted.some((other) => {
      const otherTokens = tokensOf(other);
      if (otherTokens.size === 0) return false;
      const intersection = [...tokens].filter((t) => otherTokens.has(t)).length;
      const union = new Set([...tokens, ...otherTokens]).size;
      return union > 0 && intersection / union > DOMAIN_DUPLICATE_JACCARD;
    });
  }

  private sanitizeDomain(domain: string): string {
    const collapsed = domain.trim().replace(/\s+/g, ' ');
    const stripped = collapsed
      .replace(/[`<>"]/g, '')
      .replace(/[\r\n]/g, ' ')
      .trim();

    if (stripped.length > MAX_DOMAIN_LENGTH) {
      return '';
    }
    return stripped;
  }

  /**
   * Trims an LLM-generated `searchQuery` to a short, search-engine-friendly
   * phrase. Strips the same noise chars as `sanitizeDomain`, then hard-caps
   * the word count so the queries that `buildSignalQueries` produces stay
   * inside SearXNG's sweet spot. Returns `undefined` if nothing usable
   * remains, so callers fall back to the cleaned domain.
   */
  private sanitizeSearchQuery(raw: string | undefined | null): string | undefined {
    if (!raw) return undefined;
    const cleaned = raw
      .replace(/[`<>"']/g, '')
      .replace(/[\r\n]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned.length === 0) return undefined;
    const words = cleaned.split(' ').slice(0, MAX_SEARCH_QUERY_WORDS);
    const trimmed = words.join(' ').trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  /**
   * Returns true if `text` contains any of the hard-coded blocklisted
   * keywords. Used as a deterministic guard against heavy-scraping / AdSpy
   * ideas that the prompt-level blacklist does not always enforce.
   */
  private isBlacklistedDomain(text: string): boolean {
    if (!text) return false;
    const lower = text.toLowerCase();
    return this.BLACKLISTED_DOMAIN_KEYWORDS.some((kw) => lower.includes(kw));
  }

  /**
   * Returns true only when `url` belongs to one of the trusted signal
   * domains (or a subdomain thereof). Used to drop off-topic / spam /
   * foreign-language results that SearXNG returns when its `site:` operator
   * silently fails (e.g. pizza menus, Arabic gaming sites, Facebook login
   * pages) before they get fed to the LLM as "grounded signals".
   */
  private isTrustedSignalUrl(url: string | undefined): boolean {
    if (!url) return false;
    let hostname: string;
    try {
      hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      return false;
    }
    return this.TRUSTED_SIGNAL_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`));
  }

  /**
   * Returns the domains the user explored in their most recent sessions,
   * newest-first. Injected into the topic-discovery prompt so the LLM can
   * avoid re-suggesting the same / nearby niches (anti-anchoring).
   */
  private async getRecentDomains(userId: number, limit = 15): Promise<string[]> {
    const sessions = await this.sessionRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return sessions.map((s) => s.domain).filter((d) => d && d.length > 0);
  }

  private buildSignalQueries(searchTerm: string): string[] {
    // Strip noise chars but keep the term short and natural. Search engines
    // (incl. SearXNG) handle short, phrase-anchored queries much better than
    // long boolean expressions with `OR`/`NOT` operators. The LLM's
    // `searchQuery` often already carries `site:`/`OR` — strip them here so
    // they don't double up with the operators this builder adds itself
    // (`site:reddit.com site:reddit.com ...` confused SearXNG completely).
    const term = searchTerm
      .replace(/\b(site|domain):[^\s"]+/gi, ' ')
      .replace(/(^|\s)-[^\s"]*/g, '$1')
      .replace(/\bOR\b/gi, ' ')
      .replace(/[\(\)\[\]"']/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Mix: two Reddit queries keep the sharpest pain-signal shapes — a concrete
    // complaint and an explicit demand for a tool — which is what Reddit is
    // genuinely good at. Reddit used to take four of the five slots, which made it
    // the dominant load source on SearXNG, the channel that was getting
    // rate-limited; the freed slots now target the other trusted signal domains
    // instead (see TRUSTED_SIGNAL_DOMAINS).
    //
    // The Hacker News query never reaches SearXNG: a query whose only `site:`
    // target is news.ycombinator.com is routed to the keyless Algolia API and to
    // Google CSE (see WebSearchService.searchChannels), so it costs SearXNG nothing.
    return [
      `site:reddit.com ${term} manual process hours`,
      `site:reddit.com ${term} "wish there was a tool"`,
      `site:news.ycombinator.com ${term} Ask HN`,
      `site:indiehackers.com ${term} "too expensive" OR alternative`,
      `${term} forum "how do you handle" -site:reddit.com`,
    ];
  }

  /**
   * Runs the search queries with bounded concurrency (`MAX_PARALLEL_SEARCH`)
   * and a pause (`SEARCH_STAGGER_MS`) between batches, instead of dispatching
   * them all at once. Keeps the request rate low enough that the upstream
   * engines do not treat the single egress IP as a bot.
   *
   * Throttling trades latency for rate: the old all-at-once dispatch could
   * finish in one timeout window, whereas serial batches can take several. The
   * optional `deadline` caps that cost — once it passes, the remaining queries
   * are abandoned and whatever settled so far is returned, leaving budget for
   * the later pipeline stages. Same guard shape as `validateIdeas`.
   *
   * @param queries - Raw query strings to execute.
   * @param buildTasks - Maps one query to the channel promises to settle for it.
   * @param deadline - Epoch ms after which no further batches are started.
   * @returns Settled results in the same order the tasks were created, so
   * callers can keep iterating them and checking `status` / `value.success`.
   */
  private async runSearchesThrottled<T>(
    queries: string[],
    buildTasks: (query: string) => Promise<T>[],
    deadline?: number,
  ): Promise<PromiseSettledResult<T>[]> {
    const settled: PromiseSettledResult<T>[] = [];
    for (let i = 0; i < queries.length; i += MAX_PARALLEL_SEARCH) {
      if (deadline !== undefined && Date.now() > deadline) {
        break;
      }
      if (i > 0) {
        await this.delay(SEARCH_STAGGER_MS);
      }
      const batch = queries.slice(i, i + MAX_PARALLEL_SEARCH);
      settled.push(...(await Promise.allSettled(batch.flatMap((q) => buildTasks(q)))));
    }
    return settled;
  }

  /** Minimal async pause — spreads search requests out along the time axis. */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async gatherSignals(
    domain: string,
    searchTerm: string,
    onProgress: ((event: IdeasProgressEvent) => void) | undefined,
    deadline: number,
    userId?: number,
    providerOverride?: LlmProvider,
    modelOverride?: string,
  ): Promise<{ signals: Signal[]; groundedInSignals: boolean }> {
    onProgress?.({ phase: 0, status: 'מחפש סיגנלים בשוק...' });

    const queries = this.buildSignalQueries(searchTerm);
    // Channels per query come from WebSearchService.searchChannels (as in
    // discoverTopics): SearXNG best-effort, HN Algolia and Google CSE, all of which
    // return only trusted domains. PullPush was removed (permanent 429 for agents).
    // The site: operators in the queries are enforced by our own filtering, so bing's
    // junk does not undermine the grounding of the ideas.
    // Queries run gradually (runSearchesThrottled), never as one burst, and the
    // deadline is passed through so throttling cannot starve the later
    // generate/validate stages of the shared overall budget.
    const settled = await this.runSearchesThrottled(queries, (q) => this.webSearch.searchChannels(q), deadline);

    const contents: string[] = [];
    let trustedCount = 0;
    let droppedCount = 0;
    for (const s of settled) {
      if (s.status === 'fulfilled' && s.value.success && s.value.result) {
        for (const r of s.value.result.results) {
          if (this.isTrustedSignalUrl(r.url)) {
            contents.push(`${r.title}: ${r.content}`);
            trustedCount += 1;
          } else {
            droppedCount += 1;
          }
        }
      }
    }
    if (droppedCount > 0) {
      this.logger.warn(`Signal discovery: dropped ${droppedCount} off-domain result(s) (kept ${trustedCount} from trusted signal sources)`);
    }

    if (contents.length === 0) {
      this.logger.warn(
        'Signal gathering: no trusted-domain results (SearXNG may be returning off-domain noise — check engine config and language setting) — fallback mode',
      );
      return { signals: [], groundedInSignals: false };
    }

    const prompt = `תחום: ${domain}\n\nתוצאות חיפוש:\n${contents.slice(0, 20).join('\n\n')}`;
    try {
      const res = await this.llm.generateResponse({
        prompt,
        systemContext: SIGNAL_GATHERING_PROMPT,
        maxTokens: 4096,
        userId,
        providerOverride,
        modelOverride,
      });

      // RAW DEBUG LOG
      this.logger.log(`[SIGNALS RAW] finish_reason=${res.finishReason} content_length=${res.content?.length ?? 0}`);
      if (!res.content || res.content.length === 0) {
        this.logger.warn(`[SIGNALS RAW] EMPTY content — rawCompletion=${JSON.stringify(res.rawCompletion).slice(0, 500)}`);
      } else {
        this.logger.log(`[SIGNALS RAW] content=${res.content.slice(0, 300)}`);
      }

      const signals = parseLlmJson<Signal[]>(res.content, 'ideas-signals');
      if (!signals || !Array.isArray(signals) || signals.length === 0) {
        throw new Error('empty signals');
      }
      return { signals, groundedInSignals: true };
    } catch (error) {
      this.logger.warn(`Signal extraction failed — fallback mode: ${error instanceof Error ? error.message : 'unknown'}`);
      return { signals: [], groundedInSignals: false };
    }
  }

  private async generateIdeasFromSignals(
    domain: string,
    signals: Signal[],
    count: number,
    userId?: number,
    providerOverride?: LlmProvider,
    modelOverride?: string,
  ): Promise<RawIdea[]> {
    const signalsText = signals.length ? signals.map((s) => `- ${s.signal} (מקור: ${s.source})`).join('\n') : '(ללא סיגנלים — השתמש בידע הכללי שלך)';

    const prompt = `תחום: ${domain}\nמספר רעיונות נדרש: ${count}\n\nסיגנלים:\n${signalsText}`;
    try {
      const res = await this.llm.generateResponse({
        prompt,
        systemContext: IDEA_GENERATION_PROMPT,
        maxTokens: 8192,
        userId,
        providerOverride,
        modelOverride,
      });
      const ideas = parseLlmJson<RawIdea[]>(res.content, 'ideas-generation');
      if (!ideas || !Array.isArray(ideas)) {
        throw new Error('invalid ideas JSON');
      }
      return ideas.slice(0, count);
    } catch (error) {
      this.logger.error(`Idea generation failed: ${error instanceof Error ? error.message : 'unknown'}`);
      return [];
    }
  }

  private async validateIdeas(
    rawIdeas: RawIdea[],
    signals: Signal[],
    searchTerm: string,
    onProgress: ((event: IdeasProgressEvent) => void) | undefined,
    deadline: number,
    userId?: number,
    providerOverride?: LlmProvider,
    modelOverride?: string,
  ): Promise<{ ideas: BusinessIdea[]; failedCount: number }> {
    if (rawIdeas.length === 0) {
      return { ideas: [], failedCount: 0 };
    }

    const batches: RawIdea[][] = [];
    for (let i = 0; i < rawIdeas.length; i += MAX_PARALLEL_VALIDATION) {
      batches.push(rawIdeas.slice(i, i + MAX_PARALLEL_VALIDATION));
    }

    const ideas: BusinessIdea[] = [];
    let failedCount = 0;
    let globalIndex = 0;

    for (const batch of batches) {
      if (Date.now() > deadline) {
        failedCount += batch.length;
        break;
      }

      const settled = await Promise.allSettled(
        batch.map((idea) => this.validateSingle(idea, signals, searchTerm, userId, providerOverride, modelOverride)),
      );

      for (const s of settled) {
        if (s.status === 'fulfilled' && s.value) {
          ideas.push(s.value);
          onProgress?.({
            phase: 2,
            status: 'מאמת מול מתחרים...',
            ideaIndex: globalIndex,
            idea: s.value,
          });
        } else {
          failedCount += 1;
        }
        globalIndex += 1;
      }
    }

    return { ideas, failedCount };
  }

  private async validateSingle(
    idea: RawIdea,
    signals: Signal[],
    searchTerm: string,
    userId?: number,
    providerOverride?: LlmProvider,
    modelOverride?: string,
  ): Promise<BusinessIdea | null> {
    // Deterministic blacklist guard — skip LLM call entirely if the idea
    // touches a banned category. Saves tokens and produces a clear score=0
    // result instead of a misleading 5/10 with fuzzy competitor data.
    if (this.isBlacklistedDomain(idea.title) || this.isBlacklistedDomain(idea.description)) {
      this.logger.warn(`[BLACKLIST] rejected idea="${idea.title}" — matches deterministic blocklist`);
      return {
        title: idea.title,
        description: idea.description,
        targetMarket: idea.targetMarket,
        validationScore: 0,
        validationBreakdown: {
          competition: 0,
          signalFit: 0,
          feasibility: 0,
          marketSize: 0,
          riskPenalty: 0,
        },
        validationReason: 'פסילה אוטומטית: רעיון בקטגוריה אסורה (Scraping כבד / Ad Libraries / מיפוי טרנדים). נחסם על ידי הבלקליסט הדטרמיניסטי.',
        risks: [],
        competitors: [],
        nextSteps: [],
        signalsReferenced: [],
        groundedInSignals: false,
        techStackSuggestion: undefined,
        firstDistributionStep: undefined,
        estimatedMvpDays: undefined,
      };
    }

    const competitorQuery = this.buildCompetitorQuery(idea, searchTerm);
    const searchResult = await this.webSearch.search(competitorQuery);

    const searchResults = searchResult.success && searchResult.result ? searchResult.result.results : [];

    const competitorCount = searchResults.length;

    const searchText =
      searchResults
        .map((r) => `${r.title}: ${r.content}`)
        .slice(0, 10)
        .join('\n\n') || '(ללא תוצאות חיפוש)';

    const signalsText = signals.length ? signals.map((s) => `- ${s.signal}`).join('\n') : '(ללא סיגנלים)';

    const prompt = `רעיון:\nכותרת: ${idea.title}\nתיאור: ${idea.description}\nקהל יעד: ${idea.targetMarket}\n\nתוצאות חיפוש מתחרים (${competitorCount} תוצאות):\n${searchText}\n\nסיגנלים:\n${signalsText}`;

    try {
      const res = await this.llm.generateResponse({
        prompt,
        systemContext: VALIDATION_PROMPT,
        maxTokens: 8192,
        userId,
        providerOverride,
        modelOverride,
      });

      // RAW DEBUG LOG
      this.logger.log(`[VALIDATION RAW] idea="${idea.title}" finish_reason=${res.finishReason} content_length=${res.content?.length ?? 0}`);
      if (res.content && res.content.length > 0) {
        this.logger.log(`[VALIDATION RAW] content=${res.content}`);
      } else {
        this.logger.warn(`[VALIDATION RAW] EMPTY content — rawCompletion=${JSON.stringify(res.rawCompletion).slice(0, 500)}`);
      }

      const v = parseLlmJson<ValidationResult>(res.content, 'ideas-validation');
      if (!v) {
        throw new Error('invalid validation JSON');
      }

      const breakdown: ValidationBreakdown | undefined = v.validationBreakdown
        ? {
            competition: this.clampBreakdownScore(v.validationBreakdown.competition, 3),
            signalFit: this.clampBreakdownScore(v.validationBreakdown.signalFit, 3),
            feasibility: this.clampBreakdownScore(v.validationBreakdown.feasibility, 2),
            marketSize: this.clampBreakdownScore(v.validationBreakdown.marketSize, 2),
            riskPenalty: this.clampBreakdownScore(v.validationBreakdown.riskPenalty, 3),
          }
        : undefined;

      // Sanity check: if competition=3 (no competitors) but competitors list is not empty → clamp down
      const competitors = v.competitors ?? [];
      if (breakdown && breakdown.competition === 3 && competitors.length > 0) {
        this.logger.warn(
          `[SANITY] "${idea.title}": competition=3 but ${competitors.length} competitors found → clamping to ${Math.min(2, competitors.length)} `,
        );
        breakdown.competition = Math.min(2, competitors.length);
      }

      // Sanity check #2: if there are no search results at all, do not give a high competition score
      if (breakdown && competitorCount === 0 && breakdown.competition >= 3) {
        this.logger.warn(`[SANITY] "${idea.title}": competition=${breakdown.competition} but 0 search results → clamping to 2`);
        breakdown.competition = 2;
      }

      // Sanity check #3: if all results are noise (detected by the LLM in validationReason),
      // make sure the score is not inflated
      if (breakdown && v.validationReason?.includes('לא רלוונטיות') && breakdown.competition > 2) {
        this.logger.warn(`[SANITY] "${idea.title}": irrelevant search results detected → clamping competition to 2`);
        breakdown.competition = 2;
      }

      // Score = sum of criteria minus riskPenalty, clamped to 1-10 server-side
      // so the LLM cannot inflate it by omitting the penalty.
      const computedScore = breakdown
        ? this.clampScore(breakdown.competition + breakdown.signalFit + breakdown.feasibility + breakdown.marketSize - breakdown.riskPenalty)
        : this.clampScore(v.validationScore);

      return {
        title: idea.title,
        description: idea.description,
        targetMarket: idea.targetMarket,
        validationScore: computedScore,
        validationBreakdown: breakdown,
        validationReason: v.validationReason ?? '',
        risks: v.risks ?? [],
        competitors,
        nextSteps: v.nextSteps ?? [],
        signalsReferenced: v.signalsReferenced ?? [],
        groundedInSignals: signals.length > 0,
        techStackSuggestion: this.sanitizeOptionalText(v.techStackSuggestion),
        firstDistributionStep: this.sanitizeOptionalText(v.firstDistributionStep),
        estimatedMvpDays: this.sanitizeMvpDays(v.estimatedMvpDays),
      };
    } catch (error) {
      this.logger.warn(`Validation failed for "${idea.title}": ${error instanceof Error ? error.message : 'unknown'}`);
      return null;
    }
  }

  private clampScore(score: number | undefined): number {
    if (typeof score !== 'number' || Number.isNaN(score)) {
      return 1;
    }
    return Math.min(10, Math.max(1, Math.round(score)));
  }

  private clampBreakdownScore(score: number, max: number): number {
    if (typeof score !== 'number' || Number.isNaN(score)) {
      return 0;
    }
    return Math.min(max, Math.max(0, Math.round(score)));
  }

  /** Keeps only non-empty strings from optional LLM text fields. */
  private sanitizeOptionalText(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  /** Rounds the solo-dev MVP estimate and clamps it to a sane 1-365 day range. */
  private sanitizeMvpDays(value: unknown): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return undefined;
    }
    return Math.min(365, Math.max(1, Math.round(value)));
  }

  private sortByScore(ideas: BusinessIdea[]): BusinessIdea[] {
    return [...ideas].sort((a, b) => b.validationScore - a.validationScore);
  }

  /**
   * Builds a clean competitor search query in English only.
   * Separates the title/target audience (Hebrew) from the searchTerm (English).
   */
  private buildCompetitorQuery(idea: RawIdea, searchTerm: string): string {
    // Extract only the meaningful English part from the searchTerm
    const englishMatches = searchTerm.match(/[a-zA-Z][\w\s-]{3,}/g);
    const englishPart = englishMatches?.join(' ').trim() ?? '';

    // Prefer the clean English part; fallback to the title (which will go through simplifyQuery)
    const coreTerms = englishPart.length > 10 ? englishPart : idea.title;

    return `${coreTerms} software competitors alternative`;
  }
}
