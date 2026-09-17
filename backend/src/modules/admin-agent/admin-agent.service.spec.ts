import { Test, TestingModule } from '@nestjs/testing';
import { AdminAgentService } from './admin-agent.service';
import { LlmService } from '../llm/llm.service';
import { AgentSessionService } from './services/agent-session.service';
import { AgentToolExecutorService } from './services/agent-tool-executor.service';
import { SwaggerToolsParser } from './services/swagger-tools.parser';
import { RenderSpecService } from './render-spec/render-spec.service';
import { McpBridgeService } from '../mcp-bridge/mcp-bridge.service';
import { GoogleCalendarService } from '../google-calendar/google-calendar.service';
import { LlmToolCall } from '../llm/types/llm.types';

function makeService(): AdminAgentService {
  return new AdminAgentService(
    {} as LlmService,
    {} as SwaggerToolsParser,
    {} as AgentSessionService,
    {} as AgentToolExecutorService,
    new RenderSpecService(),
    { getTools: () => [], hasTool: () => false } as unknown as McpBridgeService,
    {} as GoogleCalendarService,
  );
}

describe('AdminAgentService.truncateForStorage', () => {
  const hebrewLine =
    'תיאור זן עם הרבה עברית: יציב, מרגיע, עם ניחוחות הדרים ואדמה. ';
  const hebrewHeavyContent = hebrewLine.repeat(3000); // ~138 KB of mostly Hebrew

  it('returns the original content when it fits within maxBytes (Hebrew)', () => {
    const smallContent = hebrewLine.repeat(50); // ~2.3 KB
    const svc = makeService();
    const max = 50_000;

    const result = (svc as any).truncateForStorage(smallContent, max);

    expect(Buffer.byteLength(result, 'utf8')).toBeLessThanOrEqual(max);
    expect(result).toBe(smallContent);
  });

  it('truncates Hebrew content so the encoded byte length is at or under maxBytes', () => {
    const svc = makeService();
    const max = 50_000;

    const result = (svc as any).truncateForStorage(hebrewHeavyContent, max);

    expect(Buffer.byteLength(result, 'utf8')).toBeLessThanOrEqual(max);
    expect(result).toContain('"_truncated":true');
    expect(result).toContain(`"_originalLength":${hebrewHeavyContent.length}`);
  });

  it('truncates mixed Hebrew + JSON payload (realistic genetics response) to <= maxBytes', () => {
    const realistic = JSON.stringify(
      Array.from({ length: 200 }, (_, i) => ({
        id: i,
        name: `זן מספר ${i}`,
        description: hebrewLine.repeat(10),
        effects: ['מרגיע', 'מעורר', 'מרומם'],
        scent: 'הדרים, אדמה, אורן',
      })),
    );
    const svc = makeService();
    const max = 50_000;

    const result = (svc as any).truncateForStorage(realistic, max);

    expect(Buffer.byteLength(result, 'utf8')).toBeLessThanOrEqual(max);
    expect(result).toContain('"_truncated":true');
  });

  it('preserves ASCII content exactly when under budget', () => {
    const ascii = 'Hello world! '.repeat(100); // ~1.3 KB
    const svc = makeService();

    const result = (svc as any).truncateForStorage(ascii, 50_000);

    expect(result).toBe(ascii);
  });

  it('truncates large ASCII payload and includes marker', () => {
    const largeAscii = 'x'.repeat(100_000); // 100 KB
    const svc = makeService();
    const max = 50_000;

    const result = (svc as any).truncateForStorage(largeAscii, max);

    expect(Buffer.byteLength(result, 'utf8')).toBeLessThanOrEqual(max);
    expect(result).toContain('"_truncated":true');
    expect(result).toContain(`"_originalLength":${largeAscii.length}`);
  });

  it('backtracks to valid UTF-8 boundary when cut lands mid-character', () => {
    const svc = makeService();
    const hebrewChar = 'א'; // U+05D0 → 2 bytes in UTF-8: 0xD6 0xB0

    // Build content: 21 ASCII bytes + 1 Hebrew char + 500 ASCII bytes
    // Byte layout: [0..20] ASCII 'x' | [21] 0xD6 [22] 0xB0 | [23..522] ASCII 'y'
    // String length = 522, byte length = 21 + 2 + 500 = 523
    const asciiPrefix = 'x'.repeat(21);
    const asciiSuffix = 'y'.repeat(500);
    const content = asciiPrefix + hebrewChar + asciiSuffix;

    // Compute the actual marker size for this content's string length
    const marker = JSON.stringify({
      _truncated: true,
      _originalLength: content.length,
      _note: 'Tool result was truncated before persistence to stay within message-size limits. Re-call the tool with a narrower filter if the full payload is required.',
    });
    const markerBytes = Buffer.byteLength(marker, 'utf8');

    // Set maxBytes so previewBudget = 21.
    // Byte 21 is the leading byte 0xD6 of the Hebrew char (U+05D0) — this is NOT a continuation
    // byte, so the char is complete at the boundary. But if we had previewBudget=22,
    // byte 22 is 0xB0 (continuation byte) — the backtrack would fire.
    //
    // To test the backtrack path specifically, we want the cut to land ON a
    // continuation byte. Set previewBudget = 22 so the cut is at byte 22 (0xB0).
    const previewBudget = 22; // lands on continuation byte 0xB0
    const maxBytes = previewBudget + markerBytes;

    // Verify setup: content must exceed maxBytes for truncation to trigger
    expect(Buffer.byteLength(content, 'utf8')).toBeGreaterThan(maxBytes);
    // Verify byte 22 is a continuation byte (0xB0)
    expect(Buffer.from(content, 'utf8')[22] & 0xC0).toBe(0x80);

    const result = (svc as any).truncateForStorage(content, maxBytes);

    // 1. Must fit within budget
    expect(Buffer.byteLength(result, 'utf8')).toBeLessThanOrEqual(maxBytes);
    // 2. No replacement char — the incomplete Hebrew char was removed by backtrack
    expect(result).not.toContain('\uFFFD');
    // 3. Preview ends at byte 21 (21 ASCII 'x' chars), not at byte 22
    expect(result.startsWith(asciiPrefix.slice(0, 21))).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(21);
    // 4. Marker present
    expect(result).toContain('"_truncated":true');
  });
});

function makeToolCall(name: string, args: Record<string, unknown> | string = {}): LlmToolCall {
  return {
    id: `call_${name}_${Math.random().toString(36).slice(2, 8)}`,
    type: 'function',
    function: {
      name,
      arguments: typeof args === 'string' ? args : JSON.stringify(args),
    },
  };
}

describe('AdminAgentService.toolCallLoopBreaker', () => {
  it('allows the first call to a tool+args pair (count=1, no break)', () => {
    const svc = makeService();
    (svc as any).resetToolCallCounter();

    const call = makeToolCall('WeatherController_getWeather', { city: 'Petah Tikva' });
    const count = (svc as any).recordToolCall(call);

    expect(count).toBe(1);
    expect((svc as any).findDuplicateToolCall([call])).toBeNull();
  });

  it('allows the second call to the same tool+args pair (count=2, no break)', () => {
    const svc = makeService();
    (svc as any).resetToolCallCounter();

    const call = makeToolCall('WeatherController_getWeather', { city: 'Petah Tikva' });
    (svc as any).recordToolCall(call);
    const second = (svc as any).recordToolCall(call);

    expect(second).toBe(2);
    // A pending 2nd call request is still allowed; breaker only trips on the 3rd.
    expect((svc as any).findDuplicateToolCall([call])).toBeNull();
  });

  it('trips the breaker on the third call to the same tool+args pair (count=3)', () => {
    const svc = makeService();
    (svc as any).resetToolCallCounter();

    const call = makeToolCall('WeatherController_getWeather', { city: 'Petah Tikva' });
    (svc as any).recordToolCall(call);
    (svc as any).recordToolCall(call);
    (svc as any).recordToolCall(call);

    const dup = (svc as any).findDuplicateToolCall([call]);

    expect(dup).not.toBeNull();
    expect(dup.function.name).toBe('WeatherController_getWeather');
  });

  it('does NOT trip the breaker when the same tool is called with different args', () => {
    const svc = makeService();
    (svc as any).resetToolCallCounter();

    (svc as any).recordToolCall(makeToolCall('WeatherController_getWeather', { city: 'Petah Tikva' }));
    (svc as any).recordToolCall(makeToolCall('WeatherController_getWeather', { city: 'Tel Aviv' }));
    (svc as any).recordToolCall(makeToolCall('WeatherController_getWeather', { city: 'Haifa' }));

    const newCall = makeToolCall('WeatherController_getWeather', { city: 'Eilat' });
    expect((svc as any).findDuplicateToolCall([newCall])).toBeNull();
  });

  it('does NOT trip the breaker when different tools are called with the same args', () => {
    const svc = makeService();
    (svc as any).resetToolCallCounter();

    (svc as any).recordToolCall(makeToolCall('WeatherController_getWeather', { city: 'Petah Tikva' }));
    (svc as any).recordToolCall(makeToolCall('WeatherController_getForecast', { city: 'Petah Tikva' }));

    const newCall = makeToolCall('UsersController_getById', { id: 1 });
    expect((svc as any).findDuplicateToolCall([newCall])).toBeNull();
  });

  it('treats semantically equal args with different key order as the same call', () => {
    const svc = makeService();
    (svc as any).resetToolCallCounter();

    (svc as any).recordToolCall(makeToolCall('WeatherController_getWeather', { city: 'Petah Tikva', units: 'metric' }));
    (svc as any).recordToolCall(makeToolCall('WeatherController_getWeather', { units: 'metric', city: 'Petah Tikva' }));
    (svc as any).recordToolCall(makeToolCall('WeatherController_getWeather', { units: 'metric', city: 'Petah Tikva' }));

    const third = makeToolCall('WeatherController_getWeather', JSON.stringify({ city: 'Petah Tikva', units: 'metric' }));
    expect((svc as any).findDuplicateToolCall([third])).not.toBeNull();
  });

  it('resets the counter between turns', () => {
    const svc = makeService();
    (svc as any).resetToolCallCounter();

    const call = makeToolCall('WeatherController_getWeather', { city: 'Petah Tikva' });
    (svc as any).recordToolCall(call);
    (svc as any).recordToolCall(call);
    (svc as any).recordToolCall(call);

    (svc as any).resetToolCallCounter();

    expect((svc as any).findDuplicateToolCall([call])).toBeNull();
    const fresh = (svc as any).recordToolCall(call);
    expect(fresh).toBe(1);
  });

  it('trips the per-turn budget after 20 executed calls, even with distinct args', () => {
    const svc = makeService();
    (svc as any).resetToolCallCounter();

    for (let id = 1; id <= 20; id++) {
      (svc as any).recordToolCall(makeToolCall('X_update', { id }));
    }

    // 20 executed + 1 more pending exceeds the budget of 20.
    expect((svc as any).overToolBudget(1)).toBe(true);
    expect((svc as any).overToolBudget(0)).toBe(false);
  });

  it('resets the per-turn budget between turns', () => {
    const svc = makeService();
    (svc as any).resetToolCallCounter();

    (svc as any).recordToolCall(makeToolCall('X_y', { id: 1 }));
    (svc as any).resetToolCallCounter();

    expect((svc as any).overToolBudget(1)).toBe(false);
  });

  it('builds a Hebrew breaker error message that names the stuck tool and its args', () => {
    const svc = makeService();
    const msg = (svc as any).breakerErrorMessage('WeatherController_getWeather', { city: 'Petah Tikva' }) as string;

    expect(msg).toContain('WeatherController_getWeather');
    expect(msg).toContain('Petah Tikva');
    // Hex range covers the Hebrew Unicode block. Ensures the breaker
    // message is genuinely Hebrew, not an English fallback.
    const hebrewRange = /[֐-׿]/;
    expect(msg).toMatch(hebrewRange);
  });

  it('rescues the Google Calendar auth loop — presents the URL instead of the raw breaker error', async () => {
    const saveMessage = jest.fn().mockResolvedValue(undefined);
    const generateResponse = jest.fn().mockResolvedValue({
      content: 'הנה הקישור לחיבור היומן: https://accounts.google.com/o/oauth2/auth?state=abc',
    });
    const svc = new AdminAgentService(
      { generateResponse } as unknown as LlmService,
      {} as SwaggerToolsParser,
      { saveMessage } as unknown as AgentSessionService,
      {} as AgentToolExecutorService,
      new RenderSpecService(),
      { getTools: () => [], hasTool: () => false } as unknown as McpBridgeService,
      {} as GoogleCalendarService,
    );

    const history = [
      {
        role: 'tool',
        content: JSON.stringify({ url: 'https://accounts.google.com/o/oauth2/auth?state=abc' }),
      },
    ];

    const rescued = await (svc as any).tryAuthUrlRescue({
      toolName: 'GoogleCalendarController_auth',
      history,
      userId: 1,
      sessionId: 2,
      systemContext: 'ctx',
    });

    expect(rescued).toContain('https://accounts.google.com/o/oauth2/auth?state=abc');

    // The injected context names the URL and instructs the model to present it —
    // no CJK characters (regression: the old message contained Chinese 尝试).
    const toolSave = saveMessage.mock.calls.find((c: any[]) => c[2] === 'tool');
    expect(toolSave).toBeDefined();
    const contextMsg = toolSave[3];
    expect(contextMsg).toContain('https://accounts.google.com/o/oauth2/auth?state=abc');
    expect(contextMsg).toMatch(/[֐-׿]/);
    expect(contextMsg).not.toMatch(/[\u4E00-\u9FFF]/);

    // Final turn: no tools, model only writes the link for the user.
    const finalCall = generateResponse.mock.calls[0][0];
    expect(finalCall.tools).toEqual([]);
    expect(finalCall.messageHistory).toEqual(
      expect.arrayContaining([expect.objectContaining({ role: 'user', content: contextMsg })]),
    );
  });

  it('does not rescue when the looped tool has no setup instruction', async () => {
    const saveMessage = jest.fn().mockResolvedValue(undefined);
    const generateResponse = jest.fn().mockResolvedValue({ content: 'x' });
    const svc = new AdminAgentService(
      { generateResponse } as unknown as LlmService,
      {} as SwaggerToolsParser,
      { saveMessage } as unknown as AgentSessionService,
      {} as AgentToolExecutorService,
      new RenderSpecService(),
      { getTools: () => [], hasTool: () => false } as unknown as McpBridgeService,
      {} as GoogleCalendarService,
    );

    const rescued = await (svc as any).tryAuthUrlRescue({
      toolName: 'WeatherController_getWeather',
      history: [{ role: 'tool', content: JSON.stringify({ url: 'https://example.com' }) }],
      userId: 1,
      sessionId: 2,
      systemContext: 'ctx',
    });

    expect(rescued).toBeNull();
    expect(saveMessage).not.toHaveBeenCalled();
    expect(generateResponse).not.toHaveBeenCalled();
  });

  it('does not rescue when no auth URL exists in the conversation history', async () => {
    const saveMessage = jest.fn().mockResolvedValue(undefined);
    const generateResponse = jest.fn().mockResolvedValue({ content: 'x' });
    const svc = new AdminAgentService(
      { generateResponse } as unknown as LlmService,
      {} as SwaggerToolsParser,
      { saveMessage } as unknown as AgentSessionService,
      {} as AgentToolExecutorService,
      new RenderSpecService(),
      { getTools: () => [], hasTool: () => false } as unknown as McpBridgeService,
      {} as GoogleCalendarService,
    );

    const rescued = await (svc as any).tryAuthUrlRescue({
      toolName: 'GoogleCalendarController_auth',
      history: [{ role: 'assistant', content: 'no url here' }],
      userId: 1,
      sessionId: 2,
      systemContext: 'ctx',
    });

    expect(rescued).toBeNull();
    expect(saveMessage).not.toHaveBeenCalled();
    expect(generateResponse).not.toHaveBeenCalled();
  });
});
