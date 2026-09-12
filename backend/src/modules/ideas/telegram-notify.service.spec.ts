import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { TelegramNotifyService, buildNightlyIdeasMessage, buildTranslationTrackerSection, esc, GroundedCronResult } from './telegram-notify.service';
import { translationTracker } from '../../core/services/translation-tracker';

function makeGrounded(domain: string, scores: number[], descriptions?: string[]): GroundedCronResult {
  return {
    topic: { domain, searchQuery: `${domain} search`, rationale: `rationale for ${domain}` },
    response: {
      success: true,
      message: 'ok',
      partial: false,
      result: scores.map((score, i) => ({
        title: `${domain} idea ${i + 1}`,
        description: descriptions?.[i] ?? `short description for idea ${i + 1}`,
        targetMarket: 'market',
        validationScore: score,
        validationReason: 'reason',
        risks: [],
        competitors: [],
        nextSteps: [],
        signalsReferenced: [],
        groundedInSignals: true,
      })),
    },
  };
}

describe('esc — HTML escaping for parse_mode', () => {
  it('escapes the three dangerous characters and nothing else', () => {
    expect(esc('5 & 6 < 7 > 4')).toBe('5 &amp; 6 &lt; 7 &gt; 4');
    expect(esc('עברית רגילה, פיסוק! ?')).toBe('עברית רגילה, פיסוק! ?');
    expect(esc('')).toBe('');
  });
});

describe('buildNightlyIdeasMessage — Hebrew summary of the nightly run', () => {
  it('builds a header with bold topic and idea counts', () => {
    const msg = buildNightlyIdeasMessage([
      makeGrounded('ניהול חשבוניות', [7]),
      makeGrounded('אנליטיקה', [5, 6]),
    ]);

    expect(msg).toContain('ריצת הלילה הסתיימה — <b>2 נושאים, 3 רעיונות חדשים</b>');
    expect(msg).toContain('📌 <b>ניהול חשבוניות</b>');
    expect(msg).toContain('📌 <b>אנליטיקה</b>');
  });

  it('escapes LLM-supplied content so a stray < or & cannot break the send', () => {
    const msg = buildNightlyIdeasMessage([
      makeGrounded('ניהול <מסמכים> & דיווח', [7], ['תיאור עם <תגית> ו-& סימן']),
    ]);

    expect(msg).toContain('📌 <b>ניהול &lt;מסמכים&gt; &amp; דיווח</b>');
    expect(msg).toContain('תיאור עם &lt;תגית&gt; ו-&amp; סימן');
    expect(msg).not.toContain('<תגית>');
  });

  it('lists idea titles with scores, best score first per domain', () => {
    const msg = buildNightlyIdeasMessage([makeGrounded('כלי AI', [4, 9])]);

    const idx9 = msg.indexOf('כלי AI idea 2 — 9/10');
    const idx4 = msg.indexOf('כלי AI idea 1 — 4/10');
    expect(idx9).toBeGreaterThan(-1);
    expect(idx4).toBeGreaterThan(-1);
    expect(idx9).toBeLessThan(idx4); // sorted descending
    expect(msg).toContain('short description for idea 2');
  });

  it('caps at 5 ideas per domain and reports the remainder', () => {
    // Scores 1..7 → sorted descending, so ideas 7..3 are shown, 2 and 1 are cut.
    const msg = buildNightlyIdeasMessage([makeGrounded('ריבוי', [1, 2, 3, 4, 5, 6, 7])]);

    expect(msg).toContain('idea 7 — 7/10');
    expect(msg).toContain('idea 3 — 3/10');
    expect(msg).not.toContain('idea 2');
    expect(msg).not.toContain('idea 1');
    expect(msg).toContain('… ועוד 2 רעיונות');
  });

  it('hard-caps the whole message at 4000 chars', () => {
    const msg = buildNightlyIdeasMessage([makeGrounded('x'.repeat(5000), [8])]);

    expect(msg.length).toBe(4000);
    expect(msg.endsWith('…')).toBe(true);
  });
});

describe('buildTranslationTrackerSection — nightly harvest block', () => {
  beforeEach(() => {
    translationTracker.reset();
  });

  it('returns an empty string when nothing was recorded (quiet day — summary stays clean)', () => {
    expect(buildTranslationTrackerSection()).toBe('');
  });

  it('renders genetics misses and terpene translations with escaped names', () => {
    translationTracker.recordGeneticsMiss('אוראוז', 'Oreoz');
    translationTracker.recordTerpeneTranslation('ריח <גבוה>', 'Strong & Scent');

    const section = buildTranslationTrackerSection();

    expect(section).toContain('מפת גנטיקה');
    expect(section).toContain('1 שמות חדשים');
    expect(section).toContain('אוראוז→Oreoz');
    expect(section).toContain('טרפנים');
    // parse_mode='HTML' — names from the LLM/inventory are never trustworthy
    expect(section).toContain('ריח &lt;גבוה&gt;→Strong &amp; Scent');
  });

  it('is included in buildNightlyIdeasMessage when records exist', () => {
    translationTracker.recordGeneticsMiss('אוראוז', 'Oreoz');

    const msg = buildNightlyIdeasMessage([makeGrounded('ניהול חשבוניות', [7])]);

    expect(msg).toContain('אוראוז→Oreoz');
  });
});

describe('TelegramNotifyService — sendMessage', () => {
  let service: TelegramNotifyService;
  let httpService: { post: jest.Mock };
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    process.env = { ...originalEnv };
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;

    httpService = { post: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [TelegramNotifyService, { provide: HttpService, useValue: httpService }],
    }).compile();

    service = module.get(TelegramNotifyService);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns false without calling the API when the bot is not configured', async () => {
    const sent = await service.sendMessage('היי');

    expect(sent).toBe(false);
    expect(httpService.post).not.toHaveBeenCalled();
  });

  it('posts a JSON body (Hebrew-safe) to the Bot API and resolves true on ok', async () => {
    process.env.TELEGRAM_BOT_TOKEN = '123:token';
    process.env.TELEGRAM_CHAT_ID = '42';
    httpService.post.mockReturnValue(of({ data: { ok: true } }));

    const sent = await service.sendMessage('🌙 ריצת הלילה הסתיימה');

    expect(sent).toBe(true);
    expect(httpService.post).toHaveBeenCalledTimes(1);
    const [url, body, config] = httpService.post.mock.calls[0];
    expect(url).toBe('https://api.telegram.org/bot123:token/sendMessage');
    expect(body).toEqual({
      chat_id: '42',
      text: '🌙 ריצת הלילה הסתיימה',
      parse_mode: 'HTML', // bold renders — ** literal-asterisk era is over
      disable_web_page_preview: true,
    });
    expect(config.timeout).toBe(10_000);
  });

  it('does NOT retry API rejections (ok:false — terminal: expired token, unknown chat)', async () => {
    process.env.TELEGRAM_BOT_TOKEN = '123:token';
    process.env.TELEGRAM_CHAT_ID = '42';
    httpService.post.mockReturnValue(of({ data: { ok: false, description: 'Unauthorized' } }));

    const sent = await service.sendMessage('היי');

    expect(sent).toBe(false);
    expect(httpService.post).toHaveBeenCalledTimes(1); // no retry — would waste time
  });

  it('does NOT retry HTTP 4xx (terminal)', async () => {
    process.env.TELEGRAM_BOT_TOKEN = '123:token';
    process.env.TELEGRAM_CHAT_ID = '42';
    httpService.post.mockReturnValue(
      throwError(() => Object.assign(new Error('bad request'), { response: { status: 400 } })),
    );

    const sent = await service.sendMessage('היי');

    expect(sent).toBe(false);
    expect(httpService.post).toHaveBeenCalledTimes(1);
  });

  it('retries transient network failures with the exact backoff gaps (500ms then 1000ms), then gives up', async () => {
    process.env.TELEGRAM_BOT_TOKEN = '123:token';
    process.env.TELEGRAM_CHAT_ID = '42';
    httpService.post.mockReturnValue(throwError(() => new Error('network down')));

    jest.useFakeTimers();
    try {
      const promise = service.sendMessage('היי');

      // attempt 1 fires immediately
      expect(httpService.post).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(499);
      expect(httpService.post).toHaveBeenCalledTimes(1); // backoff not elapsed yet
      await jest.advanceTimersByTimeAsync(1); // t=500 → attempt 2
      expect(httpService.post).toHaveBeenCalledTimes(2);
      await jest.advanceTimersByTimeAsync(999);
      expect(httpService.post).toHaveBeenCalledTimes(2); // second backoff not elapsed yet
      await jest.advanceTimersByTimeAsync(1); // t=1500 → attempt 3
      expect(httpService.post).toHaveBeenCalledTimes(3);

      await jest.advanceTimersByTimeAsync(10_000); // flush any leftovers
      await expect(promise).resolves.toBe(false); // run survives, returns false
    } finally {
      jest.useRealTimers();
    }
  });

  it('retries HTTP 5xx (transient) up to 3 attempts, then gives up without throwing', async () => {
    process.env.TELEGRAM_BOT_TOKEN = '123:token';
    process.env.TELEGRAM_CHAT_ID = '42';
    httpService.post.mockReturnValue(
      throwError(() => Object.assign(new Error('server error'), { response: { status: 503 } })),
    );

    jest.useFakeTimers();
    try {
      const promise = service.sendMessage('היי');
      await jest.advanceTimersByTimeAsync(5_000);
      await expect(promise).resolves.toBe(false);
    } finally {
      jest.useRealTimers();
    }
    expect(httpService.post).toHaveBeenCalledTimes(3);
  });

  it('succeeds on the second attempt after a transient first failure (recovery)', async () => {
    process.env.TELEGRAM_BOT_TOKEN = '123:token';
    process.env.TELEGRAM_CHAT_ID = '42';
    httpService.post
      .mockReturnValueOnce(throwError(() => new Error('network down')))
      .mockReturnValueOnce(of({ data: { ok: true } }));

    jest.useFakeTimers();
    try {
      const promise = service.sendMessage('היי');
      await jest.advanceTimersByTimeAsync(501);
      await expect(promise).resolves.toBe(true);
    } finally {
      jest.useRealTimers();
    }
    expect(httpService.post).toHaveBeenCalledTimes(2);
  });
});
