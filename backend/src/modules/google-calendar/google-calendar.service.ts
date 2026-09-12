import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { google, calendar_v3 } from 'googleapis';
import { randomBytes } from 'crypto';

import { EncryptionService } from '../../core/services/encryption.service';
import { GoogleCalendarTokenEntity } from './entities/google-calendar-token.entity';

const STATE_TTL_MS = 10 * 60 * 1000; // OAuth state is valid for 10 minutes

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);

  constructor(
    @InjectRepository(GoogleCalendarTokenEntity)
    private readonly tokenRepo: Repository<GoogleCalendarTokenEntity>,
    private readonly encryption: EncryptionService,
  ) {}

  /**
   * Creates a fresh OAuth2 client per call. A shared singleton must not be used
   * because setCredentials() on a shared client would leak tokens between users.
   */
  private createOAuthClient() {
    return new google.auth.OAuth2(
      process.env.GOOGLE_CALENDAR_CLIENT_ID,
      process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
      process.env.GOOGLE_CALENDAR_REDIRECT_URI,
    );
  }

  /**
   * Starts the OAuth flow for an authenticated user.
   *
   * Generates a short-lived random `state`, persists it bound to the user, and
   * returns the Google consent URL. The controller stores `state` in an
   * httpOnly cookie so /calendar/callback can validate it (CSRF protection).
   */
  async getAuthUrl(userId: number): Promise<{ url: string; state: string }> {
    let row = await this.tokenRepo.findOneBy({ userId });
    const now = Date.now();

    // Idempotent: reuse a still-valid state instead of overwriting it. With the
    // old overwrite behavior, a second /calendar/auth call (e.g. an agent retry
    // loop) destroyed the state of the flow the user already started, so the
    // callback failed with "OAuth state is invalid or expired". Repeated calls
    // now return the same consent URL until the state is used or expires.
    // ponytail: check-then-write — two truly simultaneous auth calls for the
    // same user could both observe the stale state and both write. Single-user
    // tool with ~zero concurrency; revisit with a per-user row lock or
    // per-flow states if it ever matters.
    if (row?.state && row.stateExpiresAt && row.stateExpiresAt.getTime() > now) {
      this.logger.log(
        `[OAuthAuth] userId=${userId} — reusing fresh state (valid until ${row.stateExpiresAt.toISOString()})`,
      );
      return { url: this.buildAuthUrl(row.state), state: row.state };
    }

    const state = randomBytes(32).toString('hex');
    const stateExpiresAt = new Date(now + STATE_TTL_MS);

    if (!row) {
      row = this.tokenRepo.create({ userId, state, stateExpiresAt });
    } else {
      // Preserve any existing refreshToken; only refresh the CSRF state.
      row.state = state;
      row.stateExpiresAt = stateExpiresAt;
    }
    await this.tokenRepo.save(row);

    this.logger.log(`[OAuthAuth] userId=${userId} — issued new state (valid until ${stateExpiresAt.toISOString()})`);
    return { url: this.buildAuthUrl(state), state };
  }

  private buildAuthUrl(state: string): string {
    return this.createOAuthClient().generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/calendar'],
      state,
    });
  }

  /**
   * Handles the Google OAuth callback (browser redirect — no JWT header).
   *
   * Validates the CSRF state (must match the httpOnly cookie set by /auth and a
   * non-expired row in the DB), exchanges the code for tokens, and stores the
   * refresh token encrypted at rest, bound to the user that started the flow.
   *
   * The response intentionally never contains access_token / refresh_token.
   */
  async handleCallback(code: string, state: string | undefined, cookieState: string | undefined) {
    if (!code) {
      throw new BadRequestException('Missing authorization code');
    }

    // When the OAuth flow is initiated by the agent (internal HTTP call), the
    // gcal_state cookie is set on the agent's response and never reaches the
    // user's browser. Fall back to DB-only validation: the state is already
    // bound to a specific user in the DB, which is sufficient.
    if (!state) {
      throw new BadRequestException('Missing OAuth state parameter');
    }
    if (cookieState && state !== cookieState) {
      throw new BadRequestException('OAuth state mismatch. The flow was not started from this browser.');
    }

    const row = await this.tokenRepo.findOneBy({ state });
    if (!row || !row.stateExpiresAt || row.stateExpiresAt.getTime() < Date.now()) {
      if (row) {
        row.state = null;
        row.stateExpiresAt = null;
        await this.tokenRepo.save(row);
      }
      this.logger.warn(
        `[OAuthCallback] state rejected (${row ? 'expired' : 'unknown'}) — userId=${row?.userId ?? 'n/a'}`,
      );
      throw new BadRequestException('OAuth state is invalid or expired. Start the flow again via /calendar/auth');
    }

    const oauth2Client = this.createOAuthClient();
    let tokens: { refresh_token?: string | null } | undefined;
    try {
      tokens = (await oauth2Client.getToken({ code })).tokens;
    } catch {
      // Google rejected the code (invalid_grant, expired, replayed, ...) —
      // surface it as a controlled 400, not a 500 (matches the swagger docs).
      throw new BadRequestException(
        'Google rejected the authorization code. Start the flow again via /calendar/auth',
      );
    }

    if (!tokens?.refresh_token) {
      throw new BadRequestException('Google did not return a refresh token. Reconnect with consent.');
    }

    row.refreshToken = this.encryption.encrypt(tokens.refresh_token);
    row.state = null;
    row.stateExpiresAt = null;
    await this.tokenRepo.save(row);

    this.logger.log(`[OAuthCallback] userId=${row.userId} — tokens stored, state cleared`);
    return { success: true, message: 'Google Calendar connected' };
  }

  /**
   * Loads and decrypts the refresh token for the authenticated user.
   * The token is always resolved server-side from the JWT identity — it is
   * never accepted as client input and can never target another user's calendar.
   */
  private async getRefreshToken(userId: number): Promise<string> {
    const row = await this.tokenRepo.findOneBy({ userId });
    if (!row?.refreshToken) {
      throw new BadRequestException('Google Calendar is not connected. Start the OAuth flow via /calendar/auth');
    }
    return this.encryption.decrypt(row.refreshToken);
  }

  private getCalendar(refreshToken: string) {
    const oauth2Client = this.createOAuthClient();
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    return google.calendar({ version: 'v3', auth: oauth2Client });
  }

  async listEvents(userId: number, date?: string, q?: string) {
    const refreshToken = await this.getRefreshToken(userId);
    const calendar = this.getCalendar(refreshToken);

    const now = new Date();
    let timeMin: Date;
    let timeMax: Date;

    if (date) {
      // Specific date requested: fetch the full day in local midnight boundaries.
      // Use month arithmetic (not +86400000ms) to stay correct across DST transitions.
      const target = new Date(date);
      timeMin = new Date(target.getFullYear(), target.getMonth(), target.getDate());
      timeMax = new Date(target.getFullYear(), target.getMonth(), target.getDate() + 1);
    } else if (q) {
      // Text search with no date: scan −1 month → +1 year so both past
      // ("what did I have yesterday") and far-future ("disability tag expires" months away)
      // events are included. Uses month arithmetic to avoid DST/leap drift.
      timeMin = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      timeMax = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
    } else {
      // No date and no query: today → +7 days (default overview).
      timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      timeMax = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
    }

    // For q-scans paginate until nextPageToken is exhausted — the API reliably
    // stops returning tokens at the end of the result set.
    // Hard cap at 10 000 total items to prevent flooding LLM context on calendars
    // with many recurring events (e.g. daily meetings × 13 months).
    // Non-q calls use a single page (20-event overview).
    const MAX_ITEMS = 10_000;
    const allItems: calendar_v3.Schema$Event[] = [];
    let pageToken: string | undefined;

    do {
      const res = await calendar.events.list({
        calendarId: 'primary',
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        // 2500 is the Google Calendar API maximum per page.
        maxResults: q ? 2500 : 20,
        singleEvents: true,
        orderBy: 'startTime',
        q: q || undefined,
        pageToken,
      });

      allItems.push(...(res.data.items ?? []));
      pageToken = res.data.nextPageToken ?? undefined;

      // Non-q calls never need pagination.
      if (!q) break;

      if (allItems.length >= MAX_ITEMS) {
        this.logger.warn(`q-scan reached ${MAX_ITEMS}-item cap; remaining pages skipped.`);
        break;
      }
    } while (pageToken);

    return allItems;
  }

  async createEvent(
    userId: number,
    summary: string,
    startTime: string,
    endTime: string,
    description?: string,
    location?: string,
  ) {
    const refreshToken = await this.getRefreshToken(userId);
    const calendar = this.getCalendar(refreshToken);

    const event = {
      summary,
      description,
      location,
      start: {
        dateTime: startTime,
        timeZone: 'Asia/Jerusalem',
      },
      end: {
        dateTime: endTime,
        timeZone: 'Asia/Jerusalem',
      },
    };

    const res = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
    });

    return res.data;
  }

  async deleteEvent(userId: number, eventId: string) {
    const refreshToken = await this.getRefreshToken(userId);
    const calendar = this.getCalendar(refreshToken);

    await calendar.events.delete({
      calendarId: 'primary',
      eventId,
    });

    return { success: true, message: 'Event deleted successfully' };
  }

  async updateEvent(
    userId: number,
    eventId: string,
    summary?: string,
    startTime?: string,
    endTime?: string,
    description?: string,
    location?: string,
  ) {
    const refreshToken = await this.getRefreshToken(userId);
    const calendar = this.getCalendar(refreshToken);

    const requestBody: any = {};
    if (summary) requestBody.summary = summary;
    if (description) requestBody.description = description;
    if (location) requestBody.location = location;
    if (startTime) {
      requestBody.start = { dateTime: startTime, timeZone: 'Asia/Jerusalem' };
    }
    if (endTime) {
      requestBody.end = { dateTime: endTime, timeZone: 'Asia/Jerusalem' };
    }

    const res = await calendar.events.patch({
      calendarId: 'primary',
      eventId,
      requestBody,
    });

    return res.data;
  }
}
