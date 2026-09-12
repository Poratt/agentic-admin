import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { AxiosResponse } from 'axios';
import { RedditSearchService } from './reddit-search.service';

describe('RedditSearchService', () => {
  let httpService: { get: jest.Mock; post: jest.Mock };
  let configService: { get: jest.Mock };

  const REDDIT_CONFIG: Record<string, string> = {
    REDDIT_CLIENT_ID: 'test-client-id',
    REDDIT_CLIENT_SECRET: 'test-client-secret',
    REDDIT_USER_AGENT: 'agentic-admin/1.0 by tester',
  };

  const tokenResponse = (): AxiosResponse =>
    ({
      data: { access_token: 'tok-123', token_type: 'bearer', expires_in: 3600 },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any,
    }) as AxiosResponse;

  const listingResponse = (posts: unknown[]): AxiosResponse =>
    ({
      data: { data: { children: posts.map((data) => ({ data })) } },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any,
    }) as AxiosResponse;

  /** Builds an instance with the given config map (missing key -> empty default). */
  const createService = async (config: Record<string, string>): Promise<RedditSearchService> => {
    configService.get.mockImplementation((key: string, defaultVal: any) => config[key] ?? defaultVal);
    const module: TestingModule = await Test.createTestingModule({
      providers: [RedditSearchService, { provide: HttpService, useValue: httpService }, { provide: ConfigService, useValue: configService }],
    }).compile();
    return module.get(RedditSearchService);
  };

  beforeEach(() => {
    httpService = { get: jest.fn(), post: jest.fn() };
    configService = { get: jest.fn() };
    jest.clearAllMocks();
  });

  describe('isConfigured', () => {
    it('returns true only when all three env vars are present', async () => {
      const service = await createService({ ...REDDIT_CONFIG });
      expect(service.isConfigured()).toBe(true);
    });

    it.each(['REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET', 'REDDIT_USER_AGENT'])('returns false when %s is missing', async (missing) => {
      const config = { ...REDDIT_CONFIG };
      delete config[missing];
      const service = await createService(config);
      expect(service.isConfigured()).toBe(false);
    });
  });

  describe('search when not configured', () => {
    it('returns success:false and does not throw', async () => {
      const service = await createService({});
      await expect(service.search('site:reddit.com foo')).resolves.toEqual(
        expect.objectContaining({ success: false, result: null }),
      );
      expect(httpService.post).not.toHaveBeenCalled();
      expect(httpService.get).not.toHaveBeenCalled();
    });
  });

  describe('search token handling', () => {
    it('fetches the token once and reuses it across two searches', async () => {
      const service = await createService({ ...REDDIT_CONFIG });
      httpService.post.mockReturnValue(of(tokenResponse()));
      httpService.get.mockReturnValue(of(listingResponse([])));

      await service.search('first query');
      await service.search('second query');

      expect(httpService.post).toHaveBeenCalledTimes(1);
      expect(httpService.get).toHaveBeenCalledTimes(2);
      // The token endpoint requires Basic auth (client_id:client_secret), not Bearer.
      expect(httpService.post.mock.calls[0][2].auth).toEqual({ username: 'test-client-id', password: 'test-client-secret' });
      expect(httpService.get.mock.calls[0][1].headers.Authorization).toBe('Bearer tok-123');
    });

    it('cleans the query to plain keywords before hitting the Reddit API', async () => {
      const service = await createService({ ...REDDIT_CONFIG });
      httpService.post.mockReturnValue(of(tokenResponse()));
      httpService.get.mockReturnValue(of(listingResponse([])));

      await service.search('site:reddit.com foo "bar" OR baz');

      expect(httpService.get.mock.calls[0][1].params.q).toBe('foo bar baz');
      expect(httpService.get.mock.calls[0][1].params.limit).toBe(25);
      expect(httpService.get.mock.calls[0][1].params.sort).toBe('relevance');
      expect(httpService.get.mock.calls[0][1].params.type).toBe('link');
    });

    it('sends the mandatory User-Agent on both the token and search requests', async () => {
      const service = await createService({ ...REDDIT_CONFIG });
      httpService.post.mockReturnValue(of(tokenResponse()));
      httpService.get.mockReturnValue(of(listingResponse([])));

      await service.search('pain point');

      // Reddit blocks generic user agents, so this header is not optional on
      // either call — dropping it silently turns into 429s in production.
      expect(httpService.post.mock.calls[0][2].headers['User-Agent']).toBe(REDDIT_CONFIG.REDDIT_USER_AGENT);
      expect(httpService.get.mock.calls[0][1].headers['User-Agent']).toBe(REDDIT_CONFIG.REDDIT_USER_AGENT);
    });
  });

  describe('search mapping', () => {
    it('maps selftext and link posts to reddit.com permalinks with non-empty content', async () => {
      const service = await createService({ ...REDDIT_CONFIG });
      httpService.post.mockReturnValue(of(tokenResponse()));
      httpService.get.mockReturnValue(
        of(
          listingResponse([
            { title: 'Selftext post', selftext: 'a real body of text', permalink: '/r/x/comments/1', subreddit: 'x', score: 5 },
            {
              title: 'Link post',
              selftext: '',
              permalink: '/r/y/comments/2',
              subreddit: 'y',
              score: 12,
              url: 'https://example.com/thing',
            },
          ]),
        ),
      );

      const result = await service.search('pain point');

      expect(result.success).toBe(true);
      expect(result.result?.results).toHaveLength(2);
      expect(result.result?.results[0].url).toBe('https://www.reddit.com/r/x/comments/1');
      expect(result.result?.results[0].content).toBe('a real body of text');
      // The external URL (example.com) is replaced by the reddit permalink so it
      // survives the trusted-domain filter.
      expect(result.result?.results[1].url).toBe('https://www.reddit.com/r/y/comments/2');
      expect(result.result?.results[1].content.length).toBeGreaterThan(0);
      expect(result.result?.results[1].content).toContain('r/y');
      expect(result.result?.results.every((r) => new URL(r.url).hostname.endsWith('reddit.com'))).toBe(true);
    });

    it('drops entries missing a title or a permalink', async () => {
      const service = await createService({ ...REDDIT_CONFIG });
      httpService.post.mockReturnValue(of(tokenResponse()));
      httpService.get.mockReturnValue(
        of(
          listingResponse([
            { title: 'No permalink', permalink: null },
            { title: null, permalink: '/r/z/comments/3' },
            { title: 'Keep me', permalink: '/r/z/comments/4', selftext: 'body' },
          ]),
        ),
      );

      const result = await service.search('query');

      expect(result.success).toBe(true);
      expect(result.result?.results).toHaveLength(1);
      expect(result.result?.results[0].title).toBe('Keep me');
    });
  });

  describe('search failures', () => {
    it('returns success:false rather than throwing when the search call fails', async () => {
      const service = await createService({ ...REDDIT_CONFIG });
      httpService.post.mockReturnValue(of(tokenResponse()));
      httpService.get.mockReturnValue(throwError(() => new Error('Network error')));

      const result = await service.search('failing query');

      expect(result.success).toBe(false);
      expect(result.result).toBeNull();
    });

    it('returns success:false when the token endpoint fails', async () => {
      const service = await createService({ ...REDDIT_CONFIG });
      httpService.post.mockReturnValue(throwError(() => new Error('token boom')));

      const result = await service.search('failing query');

      expect(result.success).toBe(false);
      expect(result.result).toBeNull();
      expect(httpService.get).not.toHaveBeenCalled();
    });
  });
});
