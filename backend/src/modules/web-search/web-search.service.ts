import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { ServiceResultContainer } from '../../core/models/service-result-container.model';
import { WebSearchResultDto } from './dto/web-search-result.dto';
import { RedditSearchService } from './reddit-search.service';

/**
 * How long a successful search result stays cached. Long enough to deduplicate
 * the repeated queries inside a single nightly run (the same search term is
 * reused across domains, and the fallback discovery queries are constant),
 * short enough that a later run never serves stale signals.
 */
const SEARCH_CACHE_TTL_MS = 30 * 60 * 1000;

/** Hard cap on cache entries so a long-lived process cannot grow unbounded. */
const SEARCH_CACHE_MAX_ENTRIES = 500;

/**
 * Cannabis reference domains for enrichment search. SearXNG keyword matching on strain
 * names returns multilingual noise (numbers, movies, porn), so enrichment queries go to
 * Tavily restricted to these hosts; SearXNG stays only as the empty-fallback floor.
 */
const CANNABIS_DOMAINS = [
  'leafly.com',
  'allbud.com',
  'weedmaps.com',
  'seedfinder.eu',
  'cannaconnection.com',
  'hightimes.com',
];

type SearXNGResult = {
  title: string;
  url: string;
  content: string;
};

type SearXNGResponse = {
  query?: string;
  number_of_results?: number;
  results?: SearXNGResult[];
  answers?: string[];
};

type HnHit = {
  objectID: string;
  title?: string | null;
  story_title?: string | null;
  story_text?: string | null;
  comment_text?: string | null;
};

type HnSearchResponse = {
  hits?: HnHit[];
};

type GoogleCseItem = {
  title?: string | null;
  link?: string | null;
  snippet?: string | null;
};

type GoogleCseResponse = {
  items?: GoogleCseItem[];
};

type TavilyResultItem = {
  title?: string | null;
  url?: string | null;
  content?: string | null;
};

type TavilySearchResponse = {
  results?: TavilyResultItem[];
};

@Injectable()
export class WebSearchService {
  private readonly logger = new Logger(WebSearchService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly googleCseApiKey: string;
  private readonly googleCseCx: string;
  private readonly tavilyApiKey: string;

  /**
   * Direct keyless endpoints for trusted signal sources. A self-hosted SearXNG
   * is quickly blocked by ddg/google/brave/startpage (CAPTCHA
   * "/Suspended: too many requests"), so it is not enough on its own for the nightly
   * ideas cron. HN Algolia is a public API with no bot-detection. PullPush
   * (Reddit archive) was removed — the API returns a permanent 429 "does not provide free
   * scraping resources for agents" since 2026-08.
   */
  private readonly HN_ALGOLIA_URL = 'https://hn.algolia.com/api/v1/search';

  /**
   * Google Custom Search JSON API. Unlike SearXNG this is a single upstream with
   * its own quota and no per-engine fan-out, and unlike HN Algolia it honours
   * `site:` — which the signal queries are built on. The key and CX come from the
   * environment; without both, the channel is skipped entirely.
   */
  private readonly GOOGLE_CSE_URL = 'https://www.googleapis.com/customsearch/v1';

  /**
   * Tavily Search API. The one channel that takes its domain restriction as a
   * structured parameter instead of a `site:` operator inside the query, which is
   * what makes it the best fit for the signal queries: the hosts parsed by
   * `parseSiteOperators` are handed over as-is, so no upstream has to understand
   * search-engine syntax for the filter to hold.
   */
  private readonly TAVILY_URL = 'https://api.tavily.com/search';

  /**
   * Short-lived in-memory cache of successful results, keyed by the raw query
   * (plus the `preserveHebrew` flag, because it changes both the cleaned query
   * and therefore the outcome). It exists to cut request volume against the
   * upstream engines, which rate-limit the single egress IP — not to serve as
   * a long-term store, so it is deliberately not persisted.
   */
  private readonly searchCache = new Map<string, { expiresAt: number; value: ServiceResultContainer<WebSearchResultDto | null> }>();

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly redditSearch: RedditSearchService,
  ) {
    this.baseUrl = this.configService.get<string>('SEARXNG_URL', '').replace(/\/+$/, '');
    this.apiKey = this.configService.get<string>('SEARXNG_API_KEY', '');
    this.googleCseApiKey = this.configService.get<string>('GOOGLE_CSE_API_KEY', '');
    this.googleCseCx = this.configService.get<string>('GOOGLE_CSE_CX', '');
    this.tavilyApiKey = this.configService.get<string>('TAVILY_API_KEY', '');
    if (!this.baseUrl) {
      this.logger.warn('SEARXNG_URL is not set — web search will fail.');
    }
  }

  /**
   * Simplifies a complex search query into a clean query that SearXNG can digest.
   * Removes Hebrew text, quotes around long phrases, and redundant stop words.
   */
  private simplifyQuery(rawQuery: string, preserveHebrew = false): string {
    // 1. Remove Hebrew text — except for calls that ask to preserve it (strain/terpene enrichment: the Hebrew strain name is the central search term)
    const withoutHebrew = preserveHebrew ? rawQuery : rawQuery.replace(/[֐-׿]+/g, '');

    // 2. Shorten quotes around long phrases (>30 chars) to the first 4 words
    const withoutLongQuotes = withoutHebrew.replace(/"([^"]{30,})"/g, (_match, inner: string) => {
      const words = inner.trim().split(/\s+/).slice(0, 4);
      return `"${words.join(' ')}"`;
    });

    // 3. Remove punctuation and stop words
    const cleaned = withoutLongQuotes
      .replace(/[–—|]/g, ' ')
      .replace(/\b(for|the|and|or|with|of|a|an)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // 4. Fallback: if too little remains, return the original
    if (cleaned.split(/\s+/).length < 2) {
      return rawQuery;
    }

    this.logger.debug(`[QueryRewrite] "${rawQuery.slice(0, 80)}..." → "${cleaned}"`);
    return cleaned;
  }

  /**
   * Parses the `site:` and `-site:` operators from the original query. SearXNG passes
   * the query raw to each engine and enforcement depends on the engine itself — bing ignores
   * the operator entirely for anonymous traffic (tested live 2026-08: bing.com returned
   * speedtest.net for site:reddit.com), while google cse and brave honor
   * it, and SearXNG's result merge mixes both. The operators are therefore
   * enforced here on the merged results. Supports multiple operators, including inside
   * parentheses.
   */
  private parseSiteOperators(query: string): { requiredHosts: string[]; excludedHosts: string[] } {
    const requiredHosts: string[] = [];
    const excludedHosts: string[] = [];
    for (const match of query.matchAll(/(^|[\s(])(-?)site:([^\s()"]+)/gi)) {
      const host = match[3].replace(/[.,;:]+$/, '').toLowerCase();
      if (host) {
        (match[2] === '-' ? excludedHosts : requiredHosts).push(host);
      }
    }
    return { requiredHosts, excludedHosts };
  }

  /**
   * Checks whether a URL belongs to a site: operator domain — exact match or
   * subdomain (www.reddit.com matches site:reddit.com). An invalid URL
   * will not pass a positive filter.
   */
  private urlMatchesSite(url: string, host: string): boolean {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      return hostname === host || hostname.endsWith(`.${host}`);
    } catch {
      return false;
    }
  }

  /**
   * Cleans a query before sending it to direct APIs (HN Algolia). These
   * APIs search literal text and do not understand search-engine syntax — `site:`,
   * `OR`, minus and quotes become meaningless tokens that zero out the results.
   * Leaves only the keywords themselves.
   */
  private toDirectApiQuery(rawQuery: string): string {
    const cleaned = rawQuery
      .replace(/\b(site|domain):[^\s"]+(?:"[^"]*")?/gi, ' ')
      .replace(/(^|\s)-[^\s"]*/g, '$1')
      .replace(/\bOR\b/gi, ' ')
      .replace(/[()[\]"']/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleaned) {
      // A query that was entirely operators — return the original so as not to block the channel
      return rawQuery;
    }

    return cleaned;
  }

  /**
   * Reads a still-valid cached result.
   *
   * @param key Cache key (raw query + preserveHebrew flag).
   * @returns The cached container, or null when absent or expired.
   */
  private readCache(key: string): ServiceResultContainer<WebSearchResultDto | null> | null {
    const entry = this.searchCache.get(key);
    if (!entry) {
      return null;
    }
    if (Date.now() >= entry.expiresAt) {
      this.searchCache.delete(key);
      return null;
    }
    return entry.value;
  }

  /**
   * Stores a successful result. Only successful containers are cached — a
   * transient engine failure must not be remembered and replayed.
   *
   * @param key Cache key (raw query + preserveHebrew flag).
   * @param value The successful container to store.
   */
  private writeCache(key: string, value: ServiceResultContainer<WebSearchResultDto | null>): void {
    // Only evict when the key is genuinely new — overwriting an existing key
    // must not throw away an unrelated live entry.
    if (!this.searchCache.has(key) && this.searchCache.size >= SEARCH_CACHE_MAX_ENTRIES) {
      // Map preserves insertion order, so the first key is the oldest entry.
      const oldest = this.searchCache.keys().next().value;
      if (oldest !== undefined) {
        this.searchCache.delete(oldest);
      }
    }
    this.searchCache.set(key, { expiresAt: Date.now() + SEARCH_CACHE_TTL_MS, value });
  }

  /**
   * Decides whether a query should be served by the official Reddit API
   * instead of SearXNG. True only when every required `site:` host is Reddit
   * and nothing is excluded — a query like `-site:reddit.com` deliberately
   * wants the rest of the web, so it must stay on SearXNG.
   *
   * @param requiredHosts Hosts required by positive `site:` operators.
   * @param excludedHosts Hosts excluded by `-site:` operators.
   * @returns true when Reddit is the sole intended source.
   */
  private isRedditOnlyQuery(requiredHosts: string[], excludedHosts: string[]): boolean {
    if (requiredHosts.length === 0 || excludedHosts.length > 0) {
      return false;
    }
    return requiredHosts.every((host) => host === 'reddit.com' || host.endsWith('.reddit.com'));
  }

  async search(query: string, preserveHebrew = false): Promise<ServiceResultContainer<WebSearchResultDto | null>> {
    // Keyed on the raw query, not the cleaned one: cleaning strips the `site:`
    // operators that decide which provider serves the query, so two queries
    // with the same keywords but different routing must not share an entry.
    const cacheKey = `${preserveHebrew ? 'h' : 'n'}:${query.trim()}`;
    const cached = this.readCache(cacheKey);
    if (cached) {
      this.logger.debug(`[Cache] hit for "${query}"`);
      return cached;
    }

    // Reddit-targeted queries go to the official API when it is configured.
    // This is the dominant load source on SearXNG, so offloading it is what
    // actually reduces the CAPTCHA pressure. On any failure we fall through to
    // SearXNG rather than returning an empty result.
    const { requiredHosts, excludedHosts } = this.parseSiteOperators(query);
    if (this.isRedditOnlyQuery(requiredHosts, excludedHosts) && this.redditSearch.isConfigured()) {
      const redditResult = await this.redditSearch.search(query);
      // An empty Reddit result is NOT treated as final. Reddit's own search is
      // weak on niche terms, so accepting an empty listing would return nothing
      // where SearXNG previously found hits — and would freeze that emptiness
      // in the cache for the whole TTL.
      if (redditResult.success && redditResult.result && redditResult.result.results.length > 0) {
        this.writeCache(cacheKey, redditResult);
        return redditResult;
      }
      this.logger.warn(`Reddit provider yielded no results for "${query}" — falling back to SearXNG`);
    }

    if (!this.baseUrl) {
      return {
        success: false,
        message: 'SEARXNG_URL is not configured on the server',
        result: null,
      };
    }

    const cleanQuery = this.simplifyQuery(query, preserveHebrew);

    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const response$ = this.httpService.get<SearXNGResponse>(`${this.baseUrl}/search`, {
        params: {
          q: cleanQuery,
          format: 'json',
          categories: 'general',
          language: 'en',
        },
        headers,
        timeout: 10_000,
      });

      const response = await firstValueFrom(response$);
      const data = response.data;

      // Enforce site:/-site: on the merged results — see parseSiteOperators.
      // requiredHosts is OR semantics (a result lives on exactly one host); every()
      // would demand the impossible for multi-site queries and zero all results.
      const results = (data.results ?? [])
        .map((r) => ({
          title: r.title,
          url: r.url,
          content: r.content,
        }))
        .filter(
          (r) =>
            (requiredHosts.length === 0 || requiredHosts.some((host) => this.urlMatchesSite(r.url, host))) &&
            !excludedHosts.some((host) => this.urlMatchesSite(r.url, host)),
        );

      const answer = data.answers && data.answers.length ? data.answers[0] : undefined;

      this.logger.debug(`[SearXNG] Query: "${query}"`);
      this.logger.debug(`[SearXNG] Answer: ${answer || '(none)'}`);
      this.logger.debug(`[SearXNG] Results: ${results.length}`);
      for (const r of results) {
        this.logger.debug(`  - ${r.title}: ${r.content.slice(0, 150)}...`);
      }

      const result: ServiceResultContainer<WebSearchResultDto | null> = {
        success: true,
        message: `נמצאו ${results.length} תוצאות עבור "${query}"`,
        result: {
          query,
          results,
          answer,
        },
      };
      this.writeCache(cacheKey, result);
      return result;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`SearXNG search failed: ${msg}`);
      return {
        success: false,
        message: 'שגיאה בפנייה לשירות חיפוש הרשת',
        result: null,
      };
    }
  }

  /**
   * Searches Hacker News stories via the public Algolia API (keyless,
   * no bot-detection). Returns links to discussions on news.ycombinator.com so
   * all results pass the trusted-domain filter in IdeasService.
   */
  async searchHackerNews(rawQuery: string): Promise<ServiceResultContainer<WebSearchResultDto | null>> {
    // HN Algolia joins words with AND — long queries of 8-10 keywords
    // return 0 results. The first two-three words work great (tested live:
    // "abandoned cart" → 5 relevant stories). Every result is news.ycombinator.com
    // and therefore passes the trusted-domain filter.
    const cleaned = this.toDirectApiQuery(rawQuery);
    const shortQuery =
      cleaned
        .split(' ')
        .filter((w) => /^[a-z0-9]{3,}$/i.test(w))
        .slice(0, 3)
        .join(' ') || cleaned;
    const query = shortQuery;
    try {
      const response$ = this.httpService.get<HnSearchResponse>(this.HN_ALGOLIA_URL, {
        params: { query, hitsPerPage: 25, tags: 'story' },
        headers: { Accept: 'application/json' },
        timeout: 10_000,
      });
      const { data } = await firstValueFrom(response$);

      const results = (data.hits ?? [])
        .filter((h) => h.title || h.story_title)
        .map((h) => ({
          title: h.title ?? h.story_title ?? '',
          url: `https://news.ycombinator.com/item?id=${h.objectID}`,
          content: (h.story_text || h.comment_text || h.title || '').slice(0, 500),
        }));

      this.logger.debug(`[HN Algolia] Query: "${query}" → ${results.length} results`);

      return {
        success: true,
        message: `נמצאו ${results.length} תוצאות עבור "${query}" ב-Hacker News`,
        result: { query, results },
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`HN Algolia search failed: ${msg}`);
      return { success: false, message: 'שגיאה בפנייה ל-HN Algolia', result: null };
    }
  }

  /**
   * Searches the web through the Google Custom Search JSON API.
   *
   * The channel exists to take open-web load off SearXNG: Google is a single
   * upstream with its own quota, so it adds reach without fanning the query out
   * to every engine behind one egress IP. It also honours `site:` (unlike Bing
   * for anonymous traffic), which the signal queries depend on.
   *
   * The channel is skipped — with a quiet failure, never an exception — when
   * `GOOGLE_CSE_API_KEY` or `GOOGLE_CSE_CX` is unset, so callers fall through to
   * the remaining channels.
   *
   * NOTE: this channel is currently inert by circumstance, not only by
   * configuration. Google states the Custom Search JSON API "is closed to new
   * customers" (existing customers lose it on 2027-01-01), so creating a
   * Programmable Search Engine no longer grants usable access. The code is kept
   * intact so the channel resumes working if that ever reopens.
   *
   * @param rawQuery Raw query, including any `site:` / `-site:` operators.
   * @returns A successful container with the mapped results, or `success: false`
   * with `result: null` when the channel is unconfigured or the request fails.
   */
  async searchGoogleCse(rawQuery: string): Promise<ServiceResultContainer<WebSearchResultDto | null>> {
    if (!this.googleCseApiKey || !this.googleCseCx) {
      return {
        success: false,
        message: 'Google CSE is not configured (missing GOOGLE_CSE_API_KEY / GOOGLE_CSE_CX)',
        result: null,
      };
    }

    const cleanQuery = this.simplifyQuery(rawQuery);
    // Google honours `site:` itself, but the operators are enforced here anyway so
    // this channel cannot return results the SearXNG path would have filtered out.
    const { requiredHosts, excludedHosts } = this.parseSiteOperators(rawQuery);

    try {
      const response$ = this.httpService.get<GoogleCseResponse>(this.GOOGLE_CSE_URL, {
        params: {
          key: this.googleCseApiKey,
          cx: this.googleCseCx,
          q: cleanQuery,
          num: 10,
        },
        headers: { Accept: 'application/json' },
        timeout: 10_000,
      });
      const { data } = await firstValueFrom(response$);

      const results = (data.items ?? [])
        .map((item) => ({
          title: item.title ?? '',
          url: item.link ?? '',
          content: (item.snippet ?? '').slice(0, 500),
        }))
        .filter(
          (r) =>
            r.url.length > 0 &&
            requiredHosts.every((host) => this.urlMatchesSite(r.url, host)) &&
            !excludedHosts.some((host) => this.urlMatchesSite(r.url, host)),
        );

      this.logger.debug(`[Google CSE] Query: "${cleanQuery}" → ${results.length} results`);

      return {
        success: true,
        message: `נמצאו ${results.length} תוצאות עבור "${cleanQuery}" ב-Google`,
        result: { query: cleanQuery, results },
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Google CSE search failed: ${msg}`);
      return { success: false, message: 'שגיאה בפנייה ל-Google CSE', result: null };
    }
  }

  /**
   * Searches the web through the Tavily Search API.
   *
   * Tavily takes its domain restriction as a structured parameter rather than as a
   * `site:` operator inside the query, which is what makes it the best fit for the
   * signal queries: the hosts from `parseSiteOperators` are passed straight
   * through, so no upstream has to understand search-engine syntax for the filter
   * to hold. Verified live: `include_domains: ['reddit.com']` returns only reddit
   * threads, and `exclude_domains` removes them.
   *
   * The channel is skipped — with a quiet failure, never an exception — when
   * `TAVILY_API_KEY` is unset, so callers fall through to the remaining channels.
   * The free tier is 1,000 searches/month, which makes this the scarce channel:
   * callers should route selectively to it rather than every query.
   *
   * @param rawQuery Raw query, including any `site:` / `-site:` operators.
   * @returns A successful container with the mapped results, or `success: false`
   * with `result: null` when the channel is unconfigured or the request fails.
   */
  async searchTavily(rawQuery: string): Promise<ServiceResultContainer<WebSearchResultDto | null>> {
    if (!this.tavilyApiKey) {
      return {
        success: false,
        message: 'Tavily is not configured (missing TAVILY_API_KEY)',
        result: null,
      };
    }

    // The domains travel as parameters, so the query itself must not carry
    // `site:` / `OR` / quotes — a semantic engine would read them as literal words.
    const cleanQuery = this.toDirectApiQuery(rawQuery);
    const { requiredHosts, excludedHosts } = this.parseSiteOperators(rawQuery);

    try {
      const response$ = this.httpService.post<TavilySearchResponse>(
        this.TAVILY_URL,
        {
          query: cleanQuery,
          max_results: 10,
          search_depth: 'basic',
          include_domains: requiredHosts,
          exclude_domains: excludedHosts,
        },
        {
          headers: {
            Authorization: `Bearer ${this.tavilyApiKey}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          timeout: 10_000,
        },
      );
      const { data } = await firstValueFrom(response$);

      const results = (data.results ?? [])
        .map((item) => ({
          title: item.title ?? '',
          url: item.url ?? '',
          content: (item.content ?? '').slice(0, 500),
        }))
        .filter(
          (r) =>
            r.url.length > 0 &&
            (requiredHosts.length === 0 || requiredHosts.some((host) => this.urlMatchesSite(r.url, host))) &&
            !excludedHosts.some((host) => this.urlMatchesSite(r.url, host)),
        );

      this.logger.debug(`[Tavily] Query: "${cleanQuery}" → ${results.length} results`);

      return {
        success: true,
        message: `נמצאו ${results.length} תוצאות עבור "${cleanQuery}" ב-Tavily`,
        result: { query: cleanQuery, results },
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Tavily search failed: ${msg}`);
      return { success: false, message: 'שגיאה בפנייה ל-Tavily', result: null };
    }
  }

  /**
   * Returns the channel promises that should serve `query`.
   *
   * Routing exists because SearXNG is the scarce channel: it is the only one that
   * fans a single query out to every enabled engine from one egress IP, which is
   * what gets it rate-limited and CAPTCHA'd. A query aimed at a source that has
   * its own API (Hacker News) is therefore served by that API and by Google CSE,
   * and never reaches SearXNG at all. Every other query still runs on all
   * channels, so a single failure cannot produce a night with zero signals.
   *
   * @param query Raw query, including any `site:` / `-site:` operators.
   * @param preserveHebrew Forwarded to the SearXNG channel; see `search`.
   * @returns The promises to settle for this query, in a stable order.
   */
  searchChannels(query: string, preserveHebrew = false): Promise<ServiceResultContainer<WebSearchResultDto | null>>[] {
    const { requiredHosts, excludedHosts } = this.parseSiteOperators(query);
    const hackerNewsOnly =
      requiredHosts.length > 0 && excludedHosts.length === 0 && requiredHosts.every((host) => host === 'news.ycombinator.com');

    if (hackerNewsOnly) {
      // HN Algolia covers Hacker News natively and without a quota, so the scarce
      // Tavily quota is deliberately not spent on this query.
      return [this.searchHackerNews(query), this.searchGoogleCse(query)];
    }

    // Reddit-targeted queries are the ones that were getting SearXNG rate-limited,
    // and Tavily serves them from its own index (the host travels as
    // `include_domains`). They are taken off SearXNG entirely — with a fall-through
    // so an unconfigured or empty Tavily cannot silently drop the signal.
    if (this.isRedditOnlyQuery(requiredHosts, excludedHosts)) {
      return [this.searchTavilyOrSearxng(query, preserveHebrew), this.searchHackerNews(query), this.searchGoogleCse(query)];
    }

    return [this.search(query, preserveHebrew), this.searchHackerNews(query), this.searchGoogleCse(query), this.searchTavily(query)];
  }

  /**
   * Serves a reddit-only query from Tavily, falling back to the SearXNG path when
   * Tavily is unconfigured or comes back empty.
   *
   * Reddit-targeted queries were the dominant cause of SearXNG being rate-limited,
   * so moving them off it is the point of this branch. The result is cached under
   * the same key `search` uses, because the key identifies the query rather than
   * the provider — a later call for the same query should reuse it either way.
   *
   * The fall-through keeps the previous behaviour as the floor: an empty Tavily
   * result is never accepted as final, exactly as with the Reddit provider.
   *
   * @param query Raw query, including the `site:reddit.com` operator.
   * @param preserveHebrew Forwarded to the SearXNG fallback; see `search`.
   * @returns Tavily's container when it produced results, otherwise SearXNG's.
   */
  private async searchTavilyOrSearxng(query: string, preserveHebrew: boolean): Promise<ServiceResultContainer<WebSearchResultDto | null>> {
    const cacheKey = `${preserveHebrew ? 'h' : 'n'}:${query.trim()}`;
    const cached = this.readCache(cacheKey);
    if (cached) {
      return cached;
    }

    const tavilyResult = await this.searchTavily(query);
    if (tavilyResult.success && tavilyResult.result && tavilyResult.result.results.length > 0) {
      this.writeCache(cacheKey, tavilyResult);
      return tavilyResult;
    }

    this.logger.debug(`Tavily did not serve "${query}" — falling back to SearXNG`);
    return this.search(query, preserveHebrew);
  }

  /**
   * Enrichment search: Tavily restricted to cannabis reference domains, SearXNG as fallback.
   *
   * Strain/terpene names are hostile to keyword search ("33 Splitter" matches the number
   * 33 and a film); the domain allowlist travels as `site:` operators, which searchTavily
   * forwards as structured `include_domains` and the SearXNG path enforces on results.
   * Hebrew is preserved — the strain name is the central search term. An empty Tavily
   * result falls through (never accepted as final), same contract as the reddit path.
   *
   * @param query Enrichment query (strain/terpene name + context words).
   * @returns Tavily's container when it produced results, otherwise SearXNG's.
   */
  async searchCannabis(query: string): Promise<ServiceResultContainer<WebSearchResultDto | null>> {
    const scoped = `${query} ${CANNABIS_DOMAINS.map((d) => `site:${d}`).join(' ')}`;
    return this.searchTavilyOrSearxng(scoped, true);
  }
}
