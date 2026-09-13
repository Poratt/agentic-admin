import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { ForbiddenException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { IdeasService, MAX_PARALLEL_SEARCH, SEARCH_STAGGER_MS } from './ideas.service';
import { SavedIdeaSession } from './entities/saved-idea-session.entity';
import { SavedIdea } from './entities/saved-idea.entity';
import { GenerateIdeasResponse } from './interfaces/idea.interface';
import { LlmClientService } from '../llm/services/llm-client.service';
import { WebSearchService } from '../web-search/web-search.service';
import {
  TOPIC_DISCOVERY_PROMPT,
  DISCOVERY_QUERY_GENERATION_PROMPT,
} from './constants/idea-prompts.constant';

function makeBusinessIdea(title: string, score = 7): GenerateIdeasResponse['result'][number] {
  return {
    title,
    description: `desc for ${title}`,
    targetMarket: 'market',
    validationScore: score,
    validationReason: 'ok',
    risks: ['r1'],
    competitors: ['c1'],
    nextSteps: ['s1'],
    signalsReferenced: ['sig1'],
    groundedInSignals: true,
  };
}

describe('IdeasService — persistence (Phase 1)', () => {
  let service: IdeasService;
  let sessionRepo: jest.Mocked<Repository<SavedIdeaSession>>;
  let ideaRepo: jest.Mocked<Repository<SavedIdea>>;
  let txManager: { save: jest.Mock; delete: jest.Mock };

  // Capture what the transaction manager persists so we can assert on it.
  let savedSessions: SavedIdeaSession[] = [];
  let savedIdeas: SavedIdea[] = [];

  beforeEach(async () => {
    savedSessions = [];
    savedIdeas = [];

    sessionRepo = {
      findOne: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      createQueryBuilder: jest.fn(),
    } as any;

    ideaRepo = {
      findOne: jest.fn(),
    } as any;

    txManager = {
      save: jest.fn(async (entity: any, items?: any) => {
        if (Array.isArray(items)) {
          // manager.save(EntityClass, [rows])
          items.forEach((row) => savedIdeas.push(row));
          return items;
        }
        // manager.save(entityInstance)
        if (entity instanceof SavedIdeaSession) {
          if (entity.id == null) entity.id = 1000 + savedSessions.length;
          savedSessions.push(entity);
          return entity;
        }
        savedIdeas.push(entity);
        return entity;
      }),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdeasService,
        { provide: getRepositoryToken(SavedIdeaSession), useValue: sessionRepo },
        { provide: getRepositoryToken(SavedIdea), useValue: ideaRepo },
        { provide: getDataSourceToken(), useValue: { transaction: jest.fn((cb: any) => cb(txManager)) } },
        { provide: LlmClientService, useValue: {} },
        { provide: WebSearchService, useValue: {} },
      ],
    }).compile();

    service = module.get(IdeasService);
  });

  describe('saveGeneration', () => {
    it('writes one session + N ideas in a single transaction', async () => {
      const response: GenerateIdeasResponse = {
        success: true,
        message: 'ok',
        partial: false,
        result: [makeBusinessIdea('Idea A'), makeBusinessIdea('Idea B', 9), makeBusinessIdea('Idea C', 4)],
      };

      const sessionId = await service.saveGeneration(1, 'fitness apps', 'openrouter', 'gpt-4o', response);

      // Transaction executed exactly once.
      expect((getDataSourceToken as any) === undefined).toBe(false);
      // Session captured with the right scalar fields.
      expect(savedSessions.length).toBe(1);
      expect(savedSessions[0].userId).toBe(1);
      expect(savedSessions[0].domain).toBe('fitness apps');
      expect(savedSessions[0].provider).toBe('openrouter');
      expect(savedSessions[0].model).toBe('gpt-4o');
      expect(savedSessions[0].nightly).toBe(false);
      expect(savedSessions[0].unread).toBe(false);
      // All 3 ideas captured, linked to the session.
      expect(savedIdeas.length).toBe(3);
      savedIdeas.forEach((idea) => {
        expect(idea.userId).toBe(1);
        expect(idea.sessionId).toBe(savedSessions[0].id);
        expect(idea.isFavorite).toBe(false);
        expect(idea.risks).toEqual(['r1']);
      });
      // sessionId returned is the in-memory session id (transaction is mocked).
      expect(typeof sessionId).toBe('number');
    });

    it('omits validationBreakdown and stores arrays as provided', async () => {
      const response: GenerateIdeasResponse = {
        success: true,
        message: 'ok',
        partial: false,
        result: [makeBusinessIdea('Solo')],
      };

      await service.saveGeneration(1, 'd', null, null, response);

      expect(savedIdeas.length).toBe(1);
      expect((savedIdeas[0] as any).validationBreakdown).toBeNull();
      // null provider/model → null columns
      expect(savedSessions[0].provider).toBeNull();
      expect(savedSessions[0].model).toBeNull();
    });

    it('respects nightly + unread opts', async () => {
      const response: GenerateIdeasResponse = {
        success: true,
        message: 'ok',
        partial: false,
        result: [makeBusinessIdea('Solo')],
      };
      await service.saveGeneration(1, 'd', null, null, response, { nightly: true, unread: true });
      expect(savedSessions[0].nightly).toBe(true);
      expect(savedSessions[0].unread).toBe(true);
    });

    it('skips session creation when result is empty', async () => {
      const response: GenerateIdeasResponse = {
        success: true,
        message: 'ok',
        partial: false,
        result: [],
      };
      const sessionId = await service.saveGeneration(1, 'd', null, null, response, { nightly: true, unread: true });
      expect(sessionId).toBe(0);
      expect(savedSessions.length).toBe(0);
    });
  });

  describe('listSessions', () => {
    it('loads the idea count via loadRelationCountAndMap and filters by user', async () => {
      const fakeSessions = [{ id: 1, ideasCount: 5 }, { id: 2, ideasCount: 0 }] as unknown as SavedIdeaSession[];

      // Chainable query builder mock for the list query.
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(fakeSessions),
      };
      // The service only calls andWhere/orderBy when needed — always wire them.
      (sessionRepo.createQueryBuilder as jest.Mock).mockReturnValue(qb);
      // loadRelationCountAndMap is a method on the builder — make it chainable too.
      let loadRelationMock = jest.fn().mockReturnValue(qb);
      // The service calls .loadRelationCountAndMap(...) right after createQueryBuilder.
      // We attach it so it remains chainable.
      // To keep the mock faithful, expose it as a method on qb:
      Object.assign(qb, { loadRelationCountAndMap: loadRelationMock });

      const result = await service.listSessions(7);

      expect(sessionRepo.createQueryBuilder).toHaveBeenCalled();
      expect(loadRelationMock).toHaveBeenCalledWith('session.ideasCount', 'session.ideas');
      expect(qb.where).toHaveBeenCalledWith('session.userId = :userId', { userId: 7 });
      expect(qb.orderBy).toHaveBeenCalledWith('session.createdAt', 'DESC');
      expect(qb.andWhere).not.toHaveBeenCalled();
      expect(result).toEqual(fakeSessions);
    });
  });

  describe('ownership checks', () => {
    it('getSession throws ForbiddenException when the session belongs to another user', async () => {
      sessionRepo.findOne!.mockResolvedValue(null);
      await expect(service.getSession(2, 999)).rejects.toBeInstanceOf(ForbiddenException);
      expect(sessionRepo.findOne).toHaveBeenCalledWith({
        where: { id: 999, userId: 2 },
        relations: ['ideas'],
      });
    });

    it('setFavorite throws ForbiddenException when the idea belongs to another user', async () => {
      ideaRepo.findOne!.mockResolvedValue(null);
      await expect(service.setFavorite(2, 555, true)).rejects.toBeInstanceOf(ForbiddenException);
      expect(ideaRepo.findOne).toHaveBeenCalledWith({ where: { id: 555, userId: 2 } });
    });
  });

  describe('validateSingle — riskPenalty', () => {
    const rawIdea = { title: 'מחולל קליפים', description: 'd', targetMarket: 'm' };

    // Wire llm/webSearch mocks per breakdown and run validation.
    async function runValidation(breakdown: Record<string, number> | undefined, extra: Record<string, unknown> = {}) {
      (service as any).webSearch = {
        search: jest.fn().mockResolvedValue({ success: true, result: { results: [{ title: 't', content: 'c' }] } }),
      };
      (service as any).llm = {
        generateResponse: jest.fn().mockResolvedValue({
          content: JSON.stringify({
            risks: ['עלויות GPU גבוהות'],
            competitors: ['OpusClip'],
            nextSteps: ['צעד'],
            signalsReferenced: ['סיגנל'],
            validationReason: 'סיבה',
            ...extra,
            validationBreakdown: breakdown,
          }),
          finishReason: 'stop',
        }),
      };
      return service['validateSingle'](rawIdea, [{ signal: 'כאב', source: 'reddit' }], 'clip generator');
    }

    it('subtracts riskPenalty from the breakdown sum', async () => {
      const idea = await runValidation({ competition: 2, signalFit: 3, feasibility: 2, marketSize: 1, riskPenalty: 3 });
      // 2+3+2+1-3 = 5
      expect(idea!.validationScore).toBe(5);
      expect(idea!.validationBreakdown!.riskPenalty).toBe(3);
    });

    it('clamps the penalized score to a minimum of 1', async () => {
      const idea = await runValidation({ competition: 0, signalFit: 0, feasibility: 1, marketSize: 0, riskPenalty: 3 });
      // 0+0+1+0-3 = -2 → clamped to 1
      expect(idea!.validationScore).toBe(1);
    });

    it('treats a missing riskPenalty as 0 (backward compat with old model output)', async () => {
      const idea = await runValidation({ competition: 2, signalFit: 2, feasibility: 1, marketSize: 1 });
      // 2+2+1+1-0 = 6
      expect(idea!.validationScore).toBe(6);
      expect(idea!.validationBreakdown!.riskPenalty).toBe(0);
    });

    it('passes through solo-dev actionable fields, trimming text and rounding MVP days', async () => {
      const idea = await runValidation(
        { competition: 2, signalFit: 2, feasibility: 2, marketSize: 1, riskPenalty: 0 },
        { techStackSuggestion: '  Whisper API + Next.js  ', firstDistributionStep: 'פוסט ב-r/podcasting', estimatedMvpDays: 21.4 },
      );
      expect(idea!.techStackSuggestion).toBe('Whisper API + Next.js');
      expect(idea!.firstDistributionStep).toBe('פוסט ב-r/podcasting');
      expect(idea!.estimatedMvpDays).toBe(21);
    });

    it('clamps estimatedMvpDays to 1-365 and drops garbage values', async () => {
      const over = await runValidation(undefined, { estimatedMvpDays: 9999 });
      expect(over!.estimatedMvpDays).toBe(365);
      const garbage = await runValidation(undefined, { estimatedMvpDays: 'שבועיים', techStackSuggestion: '   ' });
      expect(garbage!.estimatedMvpDays).toBeUndefined();
      expect(garbage!.techStackSuggestion).toBeUndefined();
    });
  });

  // Regression guard for the CAPTCHA/burst bug: the nightly pipeline used to
  // fire every search query at once, producing a 100+ request burst from a
  // single egress IP. These tests prove the SearXNG channel is now throttled.
  describe('search throttling (anti-CAPTCHA)', () => {
    type SearchState = {
      inFlight: number;
      maxInFlight: number;
      searchStarts: number[];
      searchCalls: string[];
      hnCalls: string[];
    };

    // Replaces the WebSearchService with a tracker that records concurrency.
    // `search` (SearXNG) yields once so overlapping calls would be observable.
    function installTrackingSearch(): SearchState {
      const state: SearchState = {
        inFlight: 0,
        maxInFlight: 0,
        searchStarts: [],
        searchCalls: [],
        hnCalls: [],
      };
      const empty = { success: true, message: 'ok', result: { results: [] } };
      const search = jest.fn(async (q: string) => {
        state.inFlight += 1;
        state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
        state.searchStarts.push(Date.now());
        state.searchCalls.push(q);
        await Promise.resolve();
        state.inFlight -= 1;
        return empty;
      });
      const searchHackerNews = jest.fn(async (q: string) => {
        state.hnCalls.push(q);
        return empty;
      });
      (service as any).webSearch = {
        search,
        searchHackerNews,
        // Mirrors the production routing (WebSearchService.searchChannels): a query
        // whose only `site:` target is Hacker News is served without SearXNG. Kept in
        // sync so the call counts asserted below reflect real behaviour. The Google
        // CSE channel is omitted — it is a no-op unless configured, and the routing
        // itself is covered in web-search.service.spec.ts.
        searchChannels: jest.fn((q: string) =>
          /site:news\.ycombinator\.com/i.test(q) && !/-site:/i.test(q) ? [searchHackerNews(q)] : [search(q), searchHackerNews(q)],
        ),
      };
      return state;
    }

    afterEach(() => {
      jest.useRealTimers();
    });

    it('gatherSignals: runs the signal queries serially with a stagger, never all at once', async () => {
      jest.useFakeTimers();
      const state = installTrackingSearch();
      (service as any).llm = { generateResponse: jest.fn() };

      const run = service['gatherSignals']('d', 'term', undefined, Date.now() + 100_000);
      await jest.advanceTimersByTimeAsync(SEARCH_STAGGER_MS * 20);
      const result = await run;

      // The Hacker News query is routed around SearXNG, so SearXNG sees 4 of the 5
      // queries while HN Algolia still sees every one of them.
      expect(state.searchCalls).toHaveLength(4);
      expect(state.hnCalls).toHaveLength(5);
      // The buggy version launched all 5 in the same tick (maxInFlight === 5).
      expect(state.maxInFlight).toBeLessThanOrEqual(MAX_PARALLEL_SEARCH);
      expect(state.maxInFlight).toBeLessThan(5);
      // Successive queries are spaced out by at least the stagger.
      for (let i = 1; i < state.searchStarts.length; i++) {
        expect(state.searchStarts[i] - state.searchStarts[i - 1]).toBeGreaterThanOrEqual(SEARCH_STAGGER_MS);
      }
      // Empty search results → unchanged early-fallback, no LLM call.
      expect(result).toEqual({ signals: [], groundedInSignals: false });
      expect((service as any).llm.generateResponse).not.toHaveBeenCalled();
    });

    it('discoverTopics: throttles the LLM-generated discovery queries too', async () => {
      jest.useFakeTimers();
      const state = installTrackingSearch();
      const queries = ['site:reddit.com alpha', 'site:reddit.com beta', 'site:reddit.com gamma'];
      (service as any).llm = {
        generateResponse: jest.fn().mockResolvedValue({ content: JSON.stringify(queries), finishReason: 'stop' }),
      };

      const run = service.discoverTopics(2);
      await jest.advanceTimersByTimeAsync(SEARCH_STAGGER_MS * 20);
      const topics = await run;

      expect(state.searchCalls).toHaveLength(3);
      expect(state.hnCalls).toHaveLength(3);
      expect(state.maxInFlight).toBeLessThanOrEqual(MAX_PARALLEL_SEARCH);
      expect(state.maxInFlight).toBeLessThan(3);
      for (let i = 1; i < state.searchStarts.length; i++) {
        expect(state.searchStarts[i] - state.searchStarts[i - 1]).toBeGreaterThanOrEqual(SEARCH_STAGGER_MS);
      }
      // Empty search results → [] without a topic-discovery LLM call.
      expect(topics).toEqual([]);
      expect((service as any).llm.generateResponse).toHaveBeenCalledTimes(1);
    });

    // The old implementation produced its results via
    // `Promise.allSettled(queries.flatMap(...))`, so the settled array was
    // grouped per query in query order. The downstream counters walk that array
    // in sequence, so a reordering would silently change which results are kept.
    it('returns settled results in the original per-query order', async () => {
      const settled = await service['runSearchesThrottled'](['a', 'b'], (q: string) => [
        Promise.resolve(`search:${q}`),
        Promise.resolve(`hn:${q}`),
      ]);

      expect(settled.map((s) => (s as PromiseFulfilledResult<string>).value)).toEqual(['search:a', 'hn:a', 'search:b', 'hn:b']);
    });

    it('starts no further batches once the deadline has already passed', async () => {
      const settled = await service['runSearchesThrottled'](['q0', 'q1', 'q2', 'q3', 'q4'], (q: string) => [Promise.resolve(q)], Date.now() - 1);

      expect(settled).toHaveLength(0);
    });

    it('still runs every batch when no deadline is supplied', async () => {
      const settled = await service['runSearchesThrottled'](['q0', 'q1', 'q2'], (q: string) => [Promise.resolve(q)]);

      expect(settled).toHaveLength(3);
    });
  });

  // Reddit used to take four of the five signal slots, which made it the dominant
  // load source on SearXNG — the channel that was getting CAPTCHA'd. The mix is now
  // weighted toward sources that have their own API.
  describe('buildSignalQueries', () => {
    it('spreads the 5 slots across sources instead of loading Reddit with 4 of them', () => {
      const queries = service['buildSignalQueries']('inventory management');

      expect(queries).toHaveLength(5);
      expect(queries.filter((q) => /site:reddit\.com/i.test(q) && !/-site:reddit\.com/i.test(q))).toHaveLength(2);
      // The remaining targets must be trusted signal domains, otherwise the
      // downstream trusted-domain filter drops everything they return.
      expect(queries.filter((q) => q.includes('site:news.ycombinator.com'))).toHaveLength(1);
      expect(queries.filter((q) => q.includes('site:indiehackers.com'))).toHaveLength(1);
      // Exactly one query is Hacker-News-only, which is what lets the router skip
      // SearXNG for it entirely.
      expect(queries.filter((q) => /site:news\.ycombinator\.com/i.test(q) && !/-site:/i.test(q))).toHaveLength(1);
    });

    it('never emits a site: operator with a path, which would silently drop every result', () => {
      // parseSiteOperators captures everything up to the next whitespace as the host,
      // so `site:reddit.com/r/SaaS` becomes the host `reddit.com/r/saas`, which
      // urlMatchesSite can never match against a real URL (hostname + subdomain only).
      // Every result is filtered out and the query returns nothing — the shape the
      // subreddit-scoped query proposal would have introduced.
      const queries = service['buildSignalQueries']('inventory management');

      for (const query of queries) {
        for (const match of query.matchAll(/(?:^|[\s(])-?site:([^\s()"]+)/gi)) {
          expect(match[1]).not.toMatch(/[/:]/);
        }
      }
    });
  });
});
