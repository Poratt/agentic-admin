import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { ServiceResultContainer } from '../../core/models/service-result-container.model';
import { WebSearchResultDto } from './dto/web-search-result.dto';

/**
 * A single post from a Reddit listing — only the fields this provider consumes.
 * `url` is the external destination (e.g. example.com) and is deliberately not
 * returned; the link we emit is built from `permalink` instead.
 */
type RedditPost = {
  title?: string | null;
  selftext?: string | null;
  permalink?: string | null;
  subreddit?: string | null;
  score?: number | null;
  url?: string | null;
};

type RedditListingChild = {
  data?: RedditPost;
};

type RedditListingResponse = {
  data?: {
    children?: RedditListingChild[];
  };
};

type RedditTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
};

/**
 * Reddit search provider backed by the official API (OAuth2
 * client-credentials, 100 requests/minute, non-commercial use). Four of the
 * five signal queries in `IdeasService` (`buildSignalQueries`) target
 * `site:reddit.com`, which makes Reddit the dominant load source on SearXNG —
 * and the one that gets CAPTCHA'd / "Suspended: too many requests" because of
 * the single egress IP. Moving those queries to the official API takes the
 * load off SearXNG and returns more reliable results.
 *
 * The provider is functional but inert while credentials are missing:
 * `isConfigured()` returns false and `search()` returns a quiet failure
 * (never throws) so the caller can fall back to SearXNG.
 */
@Injectable()
export class RedditSearchService {
  private readonly logger = new Logger(RedditSearchService.name);

  /** Token issuance endpoint — requires Basic auth, not Bearer. */
  private readonly REDDIT_TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';

  /** Search endpoint — requires a Bearer token and a User-Agent. */
  private readonly REDDIT_SEARCH_URL = 'https://oauth.reddit.com/search';

  /** Maximum snippet length, matching the 280-char slices used elsewhere. */
  private readonly SNIPPET_MAX_LENGTH = 280;

  /** Safety margin before token expiry — refresh once less than this remains. */
  private readonly TOKEN_SAFETY_MARGIN_MS = 5 * 60 * 1000;

  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly userAgent: string;

  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;
  private tokenRequest: Promise<string> | null = null;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.clientId = this.configService.get<string>('REDDIT_CLIENT_ID', '');
    this.clientSecret = this.configService.get<string>('REDDIT_CLIENT_SECRET', '');
    this.userAgent = this.configService.get<string>('REDDIT_USER_AGENT', '');
    if (!this.isConfigured()) {
      this.logger.warn('REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET / REDDIT_USER_AGENT are not set — Reddit search will be skipped.');
    }
  }

  /**
   * Reports whether all three Reddit environment variables are set.
   *
   * @returns true only when REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET and
   * REDDIT_USER_AGENT are all non-empty; false otherwise.
   */
  isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret && this.userAgent);
  }

  /**
   * Cleans a query before sending it to a direct API (Reddit OAuth). Reddit
   * matches literal text and does not understand search-engine syntax —
   * `site:`, `OR`, minus and quotes become meaningless tokens that zero out
   * the results. Only the keywords themselves are kept. Identical to the
   * logic in WebSearchService.
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
      // Query was nothing but operators — return the original so the channel
      // is not silently blocked.
      return rawQuery;
    }

    return cleaned;
  }

  /**
   * Returns a valid access token, from cache when possible. The token lives
   * ~3600 seconds and is refreshed ahead of expiry with a safety margin.
   * Concurrent calls share the same in-flight request so more than one token
   * is never issued at the same time.
   *
   * @returns Bearer token for use against Reddit search.
   * @throws Error when the endpoint returns no access_token (caught by search).
   */
  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.accessToken && now < this.accessTokenExpiresAt - this.TOKEN_SAFETY_MARGIN_MS) {
      return this.accessToken;
    }
    if (this.tokenRequest) {
      return this.tokenRequest;
    }
    this.tokenRequest = this.fetchAccessToken();
    try {
      return await this.tokenRequest;
    } finally {
      this.tokenRequest = null;
    }
  }

  /**
   * Issues a fresh token against Reddit. Reddit requires Basic auth
   * (client_id:client_secret) at this endpoint — a Bearer header will not
   * work here. The User-Agent is mandatory: Reddit blocks generic agents.
   */
  private async fetchAccessToken(): Promise<string> {
    const response$ = this.httpService.post<RedditTokenResponse>(
      this.REDDIT_TOKEN_URL,
      new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
      {
        auth: { username: this.clientId, password: this.clientSecret },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': this.userAgent,
        },
        timeout: 10_000,
      },
    );
    const { data } = await firstValueFrom(response$);
    const token = data?.access_token;
    if (!token) {
      throw new Error('Reddit token endpoint returned no access_token');
    }
    const expiresInSec = typeof data.expires_in === 'number' && data.expires_in > 0 ? data.expires_in : 3600;
    this.accessToken = token;
    this.accessTokenExpiresAt = Date.now() + expiresInSec * 1000;
    return token;
  }

  /**
   * Builds the content snippet for a result item. `selftext` is empty on link
   * posts, in which case we fall back gracefully to a readable description
   * (subreddit + score). Long text is truncated to a sane length.
   */
  private buildContent(post: RedditPost): string {
    const body = (post.selftext ?? '').trim();
    if (body) {
      return body.slice(0, this.SNIPPET_MAX_LENGTH);
    }
    const subreddit = post.subreddit ? `r/${post.subreddit}` : 'Reddit';
    const score = typeof post.score === 'number' ? post.score : 0;
    return `${subreddit} · ${score} points`;
  }

  /**
   * Searches Reddit posts through the official API and maps them to search
   * results. The returned link is always a reddit.com permalink (never the
   * external URL) so it survives the caller's trusted-domain filter.
   *
   * @param rawQuery Raw search query (may contain `site:` / `OR` / quotes).
   * @returns ServiceResultContainer with the results, or `success: false` and
   * `result: null` when Reddit is unconfigured or the call fails — never throws.
   */
  async search(rawQuery: string): Promise<ServiceResultContainer<WebSearchResultDto | null>> {
    if (!this.isConfigured()) {
      return {
        success: false,
        message: 'Reddit is not configured (missing REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET / REDDIT_USER_AGENT)',
        result: null,
      };
    }

    const query = this.toDirectApiQuery(rawQuery);

    try {
      const token = await this.getAccessToken();

      const response$ = this.httpService.get<RedditListingResponse>(this.REDDIT_SEARCH_URL, {
        params: { q: query, limit: 25, sort: 'relevance', type: 'link' },
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': this.userAgent,
          Accept: 'application/json',
        },
        timeout: 10_000,
      });
      const { data } = await firstValueFrom(response$);

      const results = (data?.data?.children ?? [])
        .map((child) => child.data)
        .filter((post): post is RedditPost & { title: string; permalink: string } => Boolean(post?.title && post?.permalink))
        .map((post) => ({
          title: post.title,
          url: `https://www.reddit.com${post.permalink}`,
          content: this.buildContent(post),
        }));

      this.logger.debug(`[Reddit] Query: "${query}" → ${results.length} results`);

      return {
        success: true,
        message: `נמצאו ${results.length} תוצאות עבור "${query}" ב-Reddit`,
        result: { query, results },
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Reddit search failed: ${msg}`);
      return { success: false, message: 'שגיאה בפנייה ל-Reddit', result: null };
    }
  }
}
