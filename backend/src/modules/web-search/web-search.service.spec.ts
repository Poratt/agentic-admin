import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { WebSearchService } from './web-search.service';
import { RedditSearchService } from './reddit-search.service';
import { of, throwError } from 'rxjs';
import { AxiosResponse } from 'axios';

describe('WebSearchService', () => {
  let service: WebSearchService;
  let httpService: { get: jest.Mock; post: jest.Mock };
  let configService: { get: jest.Mock };
  let redditSearch: { isConfigured: jest.Mock; search: jest.Mock };

  const mockSearchResponse: AxiosResponse = {
    data: {
      query: 'test query',
      number_of_results: 2,
      results: [
        { title: 'Result 1', url: 'https://example.com/1', content: 'Content 1' },
        { title: 'Result 2', url: 'https://example.com/2', content: 'Content 2' },
      ],
      answers: ['Sample answer'],
    },
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {} as any,
  };

  beforeEach(async () => {
    httpService = { get: jest.fn(), post: jest.fn() };
    configService = { get: jest.fn() };
    // Reddit is unconfigured by default so the pre-existing tests keep exercising
    // the SearXNG path; the routing tests opt in explicitly.
    redditSearch = { isConfigured: jest.fn().mockReturnValue(false), search: jest.fn() };
    configService.get.mockImplementation((key: string, defaultVal: any) => {
      if (key === 'SEARXNG_URL') return 'https://searxng.example.com';
      if (key === 'SEARXNG_API_KEY') return 'test-api-key';
      return defaultVal;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebSearchService,
        { provide: HttpService, useValue: httpService },
        { provide: ConfigService, useValue: configService },
        { provide: RedditSearchService, useValue: redditSearch },
      ],
    }).compile();

    service = module.get(WebSearchService);
    jest.clearAllMocks();
  });

  describe('search', () => {
    it('returns results from SearXNG on success', async () => {
      httpService.get.mockReturnValueOnce(of(mockSearchResponse));

      const result = await service.search('test query');

      expect(result.success).toBe(true);
      expect(result.result?.query).toBe('test query');
      expect(result.result?.results).toHaveLength(2);
      expect(result.result?.results[0].title).toBe('Result 1');
      expect(result.result?.answer).toBe('Sample answer');
      expect(httpService.get.mock.calls[0][1].params.language).toBe('en');
    });

    it('returns error when API call fails', async () => {
      httpService.get.mockReturnValueOnce(throwError(() => new Error('Network error')));

      const result = await service.search('failing query');

      expect(result.success).toBe(false);
      expect(result.result).toBeNull();
    });

    it('returns error when baseUrl is not configured', async () => {
      configService.get.mockImplementation((key: string, defaultVal: any) => {
        if (key === 'SEARXNG_URL') return '';
        return defaultVal;
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          WebSearchService,
          { provide: HttpService, useValue: httpService },
          { provide: ConfigService, useValue: configService },
          { provide: RedditSearchService, useValue: redditSearch },
        ],
      }).compile();

      const freshService = module.get(WebSearchService);
      const result = await freshService.search('query');

      expect(result.success).toBe(false);
      expect(result.message).toContain('SEARXNG_URL');
    });

    it('strips Hebrew by default but preserves it when preserveHebrew is set', async () => {
      httpService.get.mockReturnValueOnce(of(mockSearchResponse));

      await service.search('אובמה ראנטז cannabis strain genetics parents origin');
      let call = httpService.get.mock.calls[0];
      expect(call[1].params.q).not.toContain('ראנטז');

      httpService.get.mockReturnValueOnce(of(mockSearchResponse));
      await service.search('אובמה ראנטז cannabis strain genetics parents origin', true);
      call = httpService.get.mock.calls[1];
      expect(call[1].params.q).toContain('אובמה ראנטז');
    });
  });

  describe('searchHackerNews', () => {
    it('maps HN Algolia hits to trusted-domain results', async () => {
      httpService.get.mockReturnValueOnce(
        of({
          data: {
            hits: [
              { objectID: 'h1', title: 'Ask HN: SaaS pain', story_text: 'story body' },
              { objectID: 'h2', story_title: 'Story from comment', comment_text: 'comment body' },
              { objectID: 'h3' },
            ],
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as any,
        } as AxiosResponse),
      );

      const result = await service.searchHackerNews('saas pain');

      expect(result.success).toBe(true);
      expect(result.result?.results).toHaveLength(2);
      expect(result.result?.results[0].url).toBe('https://news.ycombinator.com/item?id=h1');
      expect(result.result?.results[0].content).toBe('story body');
      expect(result.result?.results[1].title).toBe('Story from comment');
    });

    it('returns error when HN Algolia call fails', async () => {
      httpService.get.mockReturnValueOnce(throwError(() => new Error('Network error')));

      const result = await service.searchHackerNews('failing query');

      expect(result.success).toBe(false);
      expect(result.result).toBeNull();
    });

    it('strips site:/OR/quotes and shortens to 3 significant words for HN', async () => {
      httpService.get.mockReturnValueOnce(
        of({
          data: { hits: [] },
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as any,
        } as AxiosResponse),
      );

      await service.searchHackerNews('site:reddit.com ecommerce "abandoned cart" OR "conversion"');

      const call = httpService.get.mock.calls[0];
      expect(call[1].params.query).toBe('ecommerce abandoned cart');
    });
  });

  describe('search site: operator enforcement', () => {
    const siteResponse = (results: { title: string; url: string }[]): AxiosResponse =>
      ({
        data: {
          query: 'q',
          results: results.map((r, i) => ({ ...r, content: `content ${i}` })),
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      }) as AxiosResponse;

    it('drops bing garbage and keeps only reddit.com results (incl. subdomains) for site:reddit.com', async () => {
      // Exact case from the live investigation on 2026-08-16: bing returned shopify/wikipedia
      // for site:reddit.com (...) while google cse returned reddit correctly.
      httpService.get.mockReturnValueOnce(
        of(
          siteResponse([
            { title: 'Shopify', url: 'https://www.shopify.com/' }, // bing
            { title: 'Reddit Etsy', url: 'https://www.reddit.com/r/Etsy/comments/1ov' }, // google cse
            { title: 'Wikipedia Shopify', url: 'https://en.wikipedia.org/wiki/Shopify' }, // bing
            { title: 'Reddit startups', url: 'https://www.reddit.com/r/startups/x' }, // google cse
            { title: 'Bare host', url: 'https://reddit.com/r/all' }, // exact-host match
          ]),
        ),
      );

      const result = await service.search('site:reddit.com (shopify amazon etsy) "losing money"');

      expect(result.success).toBe(true);
      expect(result.result?.results).toHaveLength(3);
      expect(result.result?.results.every((r) => new URL(r.url).hostname.endsWith('reddit.com'))).toBe(true);
    });

    it('keeps only indiehackers.com for site:indiehackers.com (chatgpt/openai dropped)', async () => {
      // Exact case from the investigation: site:indiehackers.com "churn" returned TRT Spor
      // from bing while google cse returned indiehackers correctly.
      httpService.get.mockReturnValueOnce(
        of(
          siteResponse([
            { title: 'ChatGPT', url: 'https://chatgpt.com/' }, // bing
            { title: 'OpenAI', url: 'https://openai.com/index/chatgpt/' }, // bing
            { title: 'IH churn', url: 'https://www.indiehackers.com/post/churn-is-inevitable' }, // google cse
          ]),
        ),
      );

      const result = await service.search('site:indiehackers.com "churn"');

      expect(result.success).toBe(true);
      expect(result.result?.results).toHaveLength(1);
      expect(result.result?.results[0].url).toContain('indiehackers.com');
    });

    it('does not filter when no site: operator is present', async () => {
      httpService.get.mockReturnValueOnce(
        of(
          siteResponse([
            { title: 'A', url: 'https://a.com/1' },
            { title: 'B', url: 'https://b.com/2' },
          ]),
        ),
      );

      const result = await service.search('plain query');

      expect(result.success).toBe(true);
      expect(result.result?.results).toHaveLength(2);
    });

    it('excludes the -site: domain while keeping everything else', async () => {
      // Query 5 from buildSignalQueries: -site:reddit.com should exclude
      // reddit and keep the other forums, not be treated as a positive filter.
      httpService.get.mockReturnValueOnce(
        of(
          siteResponse([
            { title: 'Reddit', url: 'https://www.reddit.com/r/x' },
            { title: 'Forum', url: 'https://forum.example.com/t/1' },
          ]),
        ),
      );

      const result = await service.search('niche forum "wish there was" -site:reddit.com');

      expect(result.success).toBe(true);
      expect(result.result?.results).toHaveLength(1);
      expect(result.result?.results[0].url).toContain('forum.example.com');
    });

    it('drops results with unparseable URLs when a site: filter is active', async () => {
      httpService.get.mockReturnValueOnce(
        of(
          siteResponse([
            { title: 'Junk', url: 'not-a-valid-url' },
            { title: 'Reddit', url: 'https://www.reddit.com/r/ok' },
          ]),
        ),
      );

      const result = await service.search('site:reddit.com test');

      expect(result.success).toBe(true);
      expect(result.result?.results).toHaveLength(1);
      expect(result.result?.results[0].url).toContain('reddit.com');
    });
  });

  describe('search Reddit routing', () => {
    const redditContainer = {
      success: true,
      message: 'נמצאו 1 תוצאות',
      result: {
        query: 'site:reddit.com x',
        results: [{ title: 'Reddit hit', url: 'https://www.reddit.com/r/x/comments/1', content: 'body' }],
      },
    };

    it('routes a reddit-only query to the Reddit API and skips SearXNG', async () => {
      redditSearch.isConfigured.mockReturnValue(true);
      redditSearch.search.mockResolvedValue(redditContainer);

      const result = await service.search('site:reddit.com x');

      expect(redditSearch.search).toHaveBeenCalledTimes(1);
      expect(httpService.get).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.result?.results[0].url).toContain('reddit.com');
    });

    it('keeps a -site:reddit.com query on SearXNG', async () => {
      redditSearch.isConfigured.mockReturnValue(true);
      httpService.get.mockReturnValueOnce(of(mockSearchResponse));

      await service.search('niche forum "wish there was" -site:reddit.com');

      expect(redditSearch.search).not.toHaveBeenCalled();
      expect(httpService.get).toHaveBeenCalledTimes(1);
    });

    it('keeps a mixed-site query on SearXNG', async () => {
      redditSearch.isConfigured.mockReturnValue(true);
      httpService.get.mockReturnValueOnce(of(mockSearchResponse));

      await service.search('site:reddit.com site:indiehackers.com churn');

      expect(redditSearch.search).not.toHaveBeenCalled();
      expect(httpService.get).toHaveBeenCalledTimes(1);
    });

    it('falls back to SearXNG when the Reddit provider fails', async () => {
      redditSearch.isConfigured.mockReturnValue(true);
      redditSearch.search.mockResolvedValue({ success: false, message: 'boom', result: null });
      httpService.get.mockReturnValueOnce(of(mockSearchResponse));

      const result = await service.search('site:reddit.com fallback');

      expect(httpService.get).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
    });

    it('does not call Reddit at all while it is unconfigured', async () => {
      redditSearch.isConfigured.mockReturnValue(false);
      httpService.get.mockReturnValueOnce(of(mockSearchResponse));

      await service.search('site:reddit.com x');

      expect(redditSearch.search).not.toHaveBeenCalled();
      expect(httpService.get).toHaveBeenCalledTimes(1);
    });

    it('falls back to SearXNG when Reddit returns an empty result set', async () => {
      redditSearch.isConfigured.mockReturnValue(true);
      redditSearch.search.mockResolvedValue({ success: true, message: 'none', result: { query: 'q', results: [] } });
      // SearXNG is given a reddit.com hit so it survives the site: post-filter.
      httpService.get.mockReturnValueOnce(
        of({
          data: { results: [{ title: 'SearXNG hit', url: 'https://www.reddit.com/r/x/comments/9', content: 'body' }] },
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as any,
        } as AxiosResponse),
      );

      const result = await service.search('site:reddit.com empty case');

      expect(httpService.get).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
      expect(result.result?.results).toHaveLength(1);
    });

    it('does not freeze an empty Reddit result in the cache', async () => {
      redditSearch.isConfigured.mockReturnValue(true);
      redditSearch.search.mockResolvedValue({ success: true, message: 'none', result: { query: 'q', results: [] } });
      httpService.get.mockReturnValue(of(mockSearchResponse));

      await service.search('site:reddit.com empty case');
      await service.search('site:reddit.com empty case');

      // The second call is served by the SearXNG cache entry, so Reddit is not
      // consulted again — and the empty listing never became the cached value.
      expect(redditSearch.search).toHaveBeenCalledTimes(1);
      expect(httpService.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('search result cache', () => {
    it('serves an identical query from cache without hitting the network twice', async () => {
      httpService.get.mockReturnValue(of(mockSearchResponse));

      const first = await service.search('cache probe');
      const second = await service.search('cache probe');

      expect(httpService.get).toHaveBeenCalledTimes(1);
      expect(second.result?.results).toHaveLength(first.result?.results.length ?? 0);
    });

    it('does not cache a failed search', async () => {
      httpService.get.mockReturnValueOnce(throwError(() => new Error('Network error')));
      const failed = await service.search('fail probe');
      expect(failed.success).toBe(false);

      httpService.get.mockReturnValueOnce(of(mockSearchResponse));
      const retried = await service.search('fail probe');

      expect(httpService.get).toHaveBeenCalledTimes(2);
      expect(retried.success).toBe(true);
    });

    it('keeps the same keywords with different site: routing in separate entries', async () => {
      httpService.get.mockReturnValue(of(mockSearchResponse));

      await service.search('site:reddit.com keyword');
      await service.search('keyword');

      expect(httpService.get).toHaveBeenCalledTimes(2);
    });

    it('treats preserveHebrew as part of the cache key', async () => {
      httpService.get.mockReturnValue(of(mockSearchResponse));

      await service.search('אובמה ראנטז cannabis', false);
      await service.search('אובמה ראנטז cannabis', true);

      expect(httpService.get).toHaveBeenCalledTimes(2);
    });

    it('re-fetches once the TTL has expired', async () => {
      const nowSpy = jest.spyOn(Date, 'now');
      let now = 1_000_000;
      nowSpy.mockImplementation(() => now);
      httpService.get.mockReturnValue(of(mockSearchResponse));

      try {
        await service.search('ttl probe');
        now += 31 * 60 * 1000; // one minute past the 30-minute TTL
        await service.search('ttl probe');

        expect(httpService.get).toHaveBeenCalledTimes(2);
      } finally {
        nowSpy.mockRestore();
      }
    });

    it('serves from cache while still inside the TTL', async () => {
      const nowSpy = jest.spyOn(Date, 'now');
      let now = 1_000_000;
      nowSpy.mockImplementation(() => now);
      httpService.get.mockReturnValue(of(mockSearchResponse));

      try {
        await service.search('ttl probe fresh');
        now += 29 * 60 * 1000; // still inside the TTL
        await service.search('ttl probe fresh');

        expect(httpService.get).toHaveBeenCalledTimes(1);
      } finally {
        nowSpy.mockRestore();
      }
    });
  });

  describe('searchGoogleCse', () => {
    // Builds a service whose ConfigService reports Google CSE credentials. The
    // shared `service` above is deliberately left unconfigured.
    async function buildWithCse(apiKey: string, cx: string): Promise<WebSearchService> {
      configService.get.mockImplementation((key: string, defaultVal: any) => {
        if (key === 'SEARXNG_URL') return 'https://searxng.example.com';
        if (key === 'SEARXNG_API_KEY') return 'test-api-key';
        if (key === 'GOOGLE_CSE_API_KEY') return apiKey;
        if (key === 'GOOGLE_CSE_CX') return cx;
        return defaultVal;
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          WebSearchService,
          { provide: HttpService, useValue: httpService },
          { provide: ConfigService, useValue: configService },
          { provide: RedditSearchService, useValue: redditSearch },
        ],
      }).compile();

      return module.get(WebSearchService);
    }

    const cseResponse = (items: { title: string; link: string }[]): AxiosResponse =>
      ({
        data: { items: items.map((item, i) => ({ ...item, snippet: `snippet ${i}` })) },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      }) as AxiosResponse;

    it('fails quietly without touching the network while unconfigured', async () => {
      const result = await service.searchGoogleCse('anything');

      expect(result.success).toBe(false);
      expect(result.result).toBeNull();
      expect(httpService.get).not.toHaveBeenCalled();
    });

    it('maps Google CSE items and sends the key/cx as params', async () => {
      const cse = await buildWithCse('key-123', 'cx-123');
      httpService.get.mockReturnValueOnce(of(cseResponse([{ title: 'Hit', link: 'https://www.indiehackers.com/post/x' }])));

      const result = await cse.searchGoogleCse('churn');

      expect(result.success).toBe(true);
      expect(result.result?.results).toHaveLength(1);
      expect(result.result?.results[0].title).toBe('Hit');
      expect(result.result?.results[0].content).toBe('snippet 0');
      const call = httpService.get.mock.calls[0];
      expect(call[1].params.key).toBe('key-123');
      expect(call[1].params.cx).toBe('cx-123');
    });

    it('applies a positive site: filter to the returned items', async () => {
      const cse = await buildWithCse('key-123', 'cx-123');
      httpService.get.mockReturnValueOnce(
        of(
          cseResponse([
            { title: 'Reddit', link: 'https://www.reddit.com/r/x' },
            { title: 'IH', link: 'https://www.indiehackers.com/post/y' },
            { title: 'PH', link: 'https://www.producthunt.com/posts/z' },
          ]),
        ),
      );

      const result = await cse.searchGoogleCse('site:indiehackers.com churn');

      expect(result.result?.results).toHaveLength(1);
      expect(result.result?.results[0].url).toContain('indiehackers.com');
    });

    it('applies a -site: filter to the returned items', async () => {
      const cse = await buildWithCse('key-123', 'cx-123');
      httpService.get.mockReturnValueOnce(
        of(
          cseResponse([
            { title: 'Reddit', link: 'https://www.reddit.com/r/x' },
            { title: 'IH', link: 'https://www.indiehackers.com/post/y' },
          ]),
        ),
      );

      const result = await cse.searchGoogleCse('niche forum -site:reddit.com');

      expect(result.result?.results).toHaveLength(1);
      expect(result.result?.results[0].url).toContain('indiehackers.com');
    });

    it('returns a quiet failure when the API call fails', async () => {
      const cse = await buildWithCse('key-123', 'cx-123');
      httpService.get.mockReturnValueOnce(throwError(() => new Error('Network error')));

      const result = await cse.searchGoogleCse('failing query');

      expect(result.success).toBe(false);
      expect(result.result).toBeNull();
    });
  });

  describe('searchTavily', () => {
    // Builds a service whose ConfigService reports a Tavily key. The shared
    // `service` above is deliberately left unconfigured.
    async function buildWithTavily(apiKey: string): Promise<WebSearchService> {
      configService.get.mockImplementation((key: string, defaultVal: any) => {
        if (key === 'SEARXNG_URL') return 'https://searxng.example.com';
        if (key === 'SEARXNG_API_KEY') return 'test-api-key';
        if (key === 'TAVILY_API_KEY') return apiKey;
        return defaultVal;
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          WebSearchService,
          { provide: HttpService, useValue: httpService },
          { provide: ConfigService, useValue: configService },
          { provide: RedditSearchService, useValue: redditSearch },
        ],
      }).compile();

      return module.get(WebSearchService);
    }

    const tavilyResponse = (items: { title: string; url: string }[]): AxiosResponse =>
      ({
        data: { results: items.map((item, i) => ({ ...item, content: `content ${i}` })) },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      }) as AxiosResponse;

    it('fails quietly without touching the network while unconfigured', async () => {
      const result = await service.searchTavily('anything');

      expect(result.success).toBe(false);
      expect(result.result).toBeNull();
      expect(httpService.post).not.toHaveBeenCalled();
    });

    it('passes site: hosts as include_domains and sends the key as a Bearer token', async () => {
      const tavily = await buildWithTavily('tvly-test');
      httpService.post.mockReturnValueOnce(
        of(tavilyResponse([{ title: 'Reddit hit', url: 'https://www.reddit.com/r/vending/comments/1x' }])),
      );

      const result = await tavily.searchTavily('site:reddit.com inventory spreadsheet headache');

      expect(result.success).toBe(true);
      expect(result.result?.results).toHaveLength(1);
      expect(result.result?.results[0].title).toBe('Reddit hit');
      expect(result.result?.results[0].content).toBe('content 0');

      const call = httpService.post.mock.calls[0];
      expect(call[0]).toContain('api.tavily.com');
      expect(call[1].include_domains).toEqual(['reddit.com']);
      expect(call[1].exclude_domains).toEqual([]);
      // site:/quotes must not survive into the query itself — Tavily filters by
      // parameter and would read the operators as literal words.
      expect(call[1].query).toBe('inventory spreadsheet headache');
      expect(call[2].headers.Authorization).toBe('Bearer tvly-test');
    });

    it('passes -site: hosts as exclude_domains', async () => {
      const tavily = await buildWithTavily('tvly-test');
      httpService.post.mockReturnValueOnce(of(tavilyResponse([{ title: 'Forum', url: 'https://forum.example.com/t/1' }])));

      await tavily.searchTavily('niche forum "wish there was" -site:reddit.com');

      const call = httpService.post.mock.calls[0];
      expect(call[1].include_domains).toEqual([]);
      expect(call[1].exclude_domains).toEqual(['reddit.com']);
    });

    it('drops results that fall outside the site: filter', async () => {
      const tavily = await buildWithTavily('tvly-test');
      httpService.post.mockReturnValueOnce(
        of(
          tavilyResponse([
            { title: 'Reddit', url: 'https://www.reddit.com/r/x' },
            { title: 'Other', url: 'https://example.com/y' },
          ]),
        ),
      );

      const result = await tavily.searchTavily('site:reddit.com inventory');

      expect(result.result?.results).toHaveLength(1);
      expect(result.result?.results[0].url).toContain('reddit.com');
    });

    it('returns a quiet failure when the API call fails', async () => {
      const tavily = await buildWithTavily('tvly-test');
      httpService.post.mockReturnValueOnce(throwError(() => new Error('Network error')));

      const result = await tavily.searchTavily('failing query');

      expect(result.success).toBe(false);
      expect(result.result).toBeNull();
    });

    describe('searchCannabis', () => {
      it('scopes Tavily to cannabis domains and returns its results', async () => {
        const tavily = await buildWithTavily('tvly-test');
        httpService.post.mockReturnValueOnce(
          of(tavilyResponse([{ title: 'Leafly hit', url: 'https://www.leafly.com/strains/x' }])),
        );

        const result = await tavily.searchCannabis('33 Splitter cannabis strain');

        expect(result.success).toBe(true);
        expect(result.result?.results).toHaveLength(1);
        const call = httpService.post.mock.calls[0];
        expect(call[1].include_domains).toEqual(
          expect.arrayContaining(['leafly.com', 'allbud.com', 'weedmaps.com', 'seedfinder.eu']),
        );
        expect(httpService.get).not.toHaveBeenCalled();
      });

      it('falls back to SearXNG when Tavily comes back empty', async () => {
        const tavily = await buildWithTavily('tvly-test');
        httpService.post.mockReturnValueOnce(of(tavilyResponse([])));
        httpService.get.mockReturnValueOnce(of(mockSearchResponse));

        const result = await tavily.searchCannabis('33 Splitter cannabis strain');

        expect(httpService.post).toHaveBeenCalled();
        expect(httpService.get).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });

      it('goes straight to SearXNG while Tavily is unconfigured', async () => {
        httpService.get.mockReturnValueOnce(of(mockSearchResponse));

        const result = await service.searchCannabis('33 Splitter cannabis strain');

        expect(httpService.post).not.toHaveBeenCalled();
        expect(httpService.get).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });
    });
  });

  // SearXNG is the scarce channel — it is the only one that fans a single query
  // out to every enabled engine from one egress IP, which is what gets it
  // rate-limited. These tests pin the routing that keeps queries off it.
  describe('searchChannels routing', () => {
    it('skips SearXNG entirely for a Hacker-News-only query', async () => {
      httpService.get.mockReturnValue(of(mockSearchResponse));

      const channels = service.searchChannels('site:news.ycombinator.com inventory Ask HN');

      expect(channels).toHaveLength(2);
      await Promise.allSettled(channels);

      expect(httpService.get).toHaveBeenCalledTimes(1);
      expect(httpService.get.mock.calls[0][0]).toContain('hn.algolia.com');
    });

    it('does not spend the scarce Tavily quota on a Hacker-News-only query', () => {
      // Tavily has a 1,000/month free tier while HN Algolia covers Hacker News
      // natively and without a quota, so the HN branch must not include it.
      const stub = { success: false, message: 'stub', result: null };
      const tavilySpy = jest.spyOn(service, 'searchTavily').mockResolvedValue(stub);
      jest.spyOn(service, 'searchHackerNews').mockResolvedValue(stub);
      jest.spyOn(service, 'searchGoogleCse').mockResolvedValue(stub);

      service.searchChannels('site:news.ycombinator.com inventory Ask HN');

      expect(tavilySpy).not.toHaveBeenCalled();
    });

    it('serves a reddit-only query from Tavily and never touches SearXNG', async () => {
      const hit = {
        success: true,
        message: 'ok',
        result: { query: 'q', results: [{ title: 't', url: 'https://www.reddit.com/r/x', content: 'c' }] },
      };
      const tavilySpy = jest.spyOn(service, 'searchTavily').mockResolvedValue(hit);
      const searxngSpy = jest.spyOn(service, 'search').mockResolvedValue(hit);
      jest.spyOn(service, 'searchHackerNews').mockResolvedValue(hit);
      jest.spyOn(service, 'searchGoogleCse').mockResolvedValue(hit);

      const channels = service.searchChannels('site:reddit.com inventory headache');

      expect(channels).toHaveLength(3);
      await Promise.allSettled(channels);

      expect(tavilySpy).toHaveBeenCalledTimes(1);
      expect(searxngSpy).not.toHaveBeenCalled();
    });

    it('falls back to SearXNG when Tavily has nothing for a reddit-only query', async () => {
      const hit = {
        success: true,
        message: 'ok',
        result: { query: 'q', results: [{ title: 't', url: 'https://www.reddit.com/r/x', content: 'c' }] },
      };
      jest.spyOn(service, 'searchTavily').mockResolvedValue({ success: true, message: 'none', result: { query: 'q', results: [] } });
      const searxngSpy = jest.spyOn(service, 'search').mockResolvedValue(hit);
      jest.spyOn(service, 'searchHackerNews').mockResolvedValue(hit);
      jest.spyOn(service, 'searchGoogleCse').mockResolvedValue(hit);

      await Promise.allSettled(service.searchChannels('site:reddit.com inventory headache'));

      expect(searxngSpy).toHaveBeenCalledTimes(1);
    });

    it('runs SearXNG, HN Algolia, Google CSE and Tavily for a query with no direct API', async () => {
      httpService.get.mockReturnValue(of(mockSearchResponse));

      const channels = service.searchChannels('site:indiehackers.com inventory headache');

      expect(channels).toHaveLength(4);
      await Promise.allSettled(channels);

      const urls = httpService.get.mock.calls.map((c) => c[0] as string);
      expect(urls.some((u) => u.includes('searxng.example.com'))).toBe(true);
      expect(urls.some((u) => u.includes('hn.algolia.com'))).toBe(true);
    });

    it('keeps a -site:reddit.com query on SearXNG as well', async () => {
      httpService.get.mockReturnValue(of(mockSearchResponse));

      const channels = service.searchChannels('niche forum "wish there was" -site:reddit.com');

      expect(channels).toHaveLength(4);
      await Promise.allSettled(channels);

      expect(httpService.get.mock.calls.some((c) => (c[0] as string).includes('searxng.example.com'))).toBe(true);
    });
  });
});
