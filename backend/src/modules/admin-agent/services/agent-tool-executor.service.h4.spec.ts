import { of } from 'rxjs';
import { AgentToolExecutorService } from './agent-tool-executor.service';
import { LlmToolCall } from '../../llm/types/llm.types';

/**
 * H4 e2e verification: SSRF / URL-injection defense-in-depth guard
 * (agent-tool-executor.service.ts).
 *
 * The guard (assertSafeTargetUrl) is invoked right after
 * SwaggerToolsParser.resolveArguments() and before httpService.request().
 * Even if the parser substitutes LLM-supplied args into the URL path, the
 * executor refuses to dispatch any URL that:
 *  1. does not start with the trusted baseUrl (scheme/host escape), or
 *  2. contains `..` (path traversal) / `?` / `#` (parameter injection)
 *     in the remainder after the baseUrl.
 */
describe('H4: safe target URL guard in AgentToolExecutorService', () => {
  const BASE_URL = 'http://localhost:3000';

  let userRepository: any;
  let httpService: any;
  let jwtService: any;
  let configService: any;
  let parser: any;
  let mcpBridge: any;
  let service: AgentToolExecutorService;

  beforeEach(() => {
    userRepository = { findOne: jest.fn() };
    httpService = { request: jest.fn() };
    jwtService = { sign: jest.fn().mockReturnValue('mock-token') };
    configService = {
      get: jest.fn((key: string, fallback?: any) => (key === 'PORT' ? 3000 : fallback)),
    };
    parser = {
      getEndpoint: jest.fn(),
      resolveArguments: jest.fn(),
      requiresConfirmation: jest.fn().mockReturnValue(false),
    };
    mcpBridge = {
      hasTool: jest.fn().mockReturnValue(false),
      callTool: jest.fn(),
    };

    service = new AgentToolExecutorService(
      userRepository,
      httpService,
      jwtService,
      configService,
      parser,
      mcpBridge,
    );
  });

  const call = (name = 'GeneticsController_getGene'): LlmToolCall => ({
    id: 'call_h4_1',
    type: 'function',
    function: { name, arguments: '{}' },
  });

  describe('guard rejects unsafe resolved URLs', () => {
    const guard = (targetUrl: string) => (service as any).assertSafeTargetUrl(targetUrl, BASE_URL);

    it('rejects a URL that does not start with the base URL (scheme/host escape)', () => {
      expect(() => guard('http://evil.com/private/secret')).toThrow(/חסימת אבטחה/);
      expect(() => guard('https://localhost:3000/health')).toThrow(/חסימת אבטחה/);
    });

    it('rejects a URL whose remainder contains .. (path traversal)', () => {
      expect(() => guard(`${BASE_URL}/../../etc/passwd`)).toThrow(/חסימת אבטחה/);
    });

    it('rejects a URL whose remainder contains ? (parameter injection)', () => {
      expect(() => guard(`${BASE_URL}/users?id=admin`)).toThrow(/חסימת אבטחה/);
    });

    it('rejects a URL whose remainder contains # (fragment injection)', () => {
      expect(() => guard(`${BASE_URL}/users#admin`)).toThrow(/חסימת אבטחה/);
    });

    it('passes a normal safe URL under the base URL', () => {
      expect(() => guard(`${BASE_URL}/genetics/גורילה%20גלו`)).not.toThrow();
    });

    it('passes when the target equals the base URL exactly', () => {
      expect(() => guard(BASE_URL)).not.toThrow();
    });
  });

  describe('executeToolCall wires the guard before dispatching HTTP', () => {
    beforeEach(() => {
      parser.getEndpoint.mockReturnValue({ path: '/genetics/{name}', method: 'get', summary: 'get gene' });
    });

    it('returns a 403 error envelope and does NOT call httpService for an escaped host', async () => {
      parser.resolveArguments.mockReturnValue({
        targetUrl: 'http://evil.com/genetics/gorilla',
        body: {},
        queryParams: {},
      });

      const result = await service.executeToolCall(call(), 1);

      expect(httpService.request).not.toHaveBeenCalled();
      const envelope = JSON.parse(result);
      expect(envelope.status).toBe(403);
      expect(envelope.error).toContain('חסימת אבטחה');
    });

    it('returns a 403 error envelope and does NOT call httpService for a traversal path', async () => {
      parser.resolveArguments.mockReturnValue({
        targetUrl: `${BASE_URL}/../../etc/passwd`,
        body: {},
        queryParams: {},
      });

      const result = await service.executeToolCall(call(), 1);

      expect(httpService.request).not.toHaveBeenCalled();
      const envelope = JSON.parse(result);
      expect(envelope.status).toBe(403);
      expect(envelope.error).toContain('חסימת אבטחה');
    });

    it('dispatches the request for a safe resolved URL', async () => {
      parser.resolveArguments.mockReturnValue({
        targetUrl: `${BASE_URL}/genetics/גורילה%20גלו`,
        body: {},
        queryParams: {},
      });
      userRepository.findOne.mockResolvedValue({ id: 1, email: 'user@test.com', role: 2 });
      httpService.request.mockReturnValue(of({ data: { ok: true, id: 1 } }));

      const result = await service.executeToolCall(call(), 1);

      expect(httpService.request).toHaveBeenCalledTimes(1);
      expect(result).toBe('{"ok":true,"id":1}');
    });
  });
});

describe('internal token cache — re-signs before the JWT expires', () => {
  let userRepository: any;
  let httpService: any;
  let jwtService: any;
  let configService: any;
  let parser: any;
  let mcpBridge: any;
  let service: AgentToolExecutorService;

  beforeEach(() => {
    jest.useFakeTimers();
    userRepository = { findOne: jest.fn() };
    httpService = { request: jest.fn() };
    jwtService = { sign: jest.fn().mockReturnValue('token-A') };
    configService = {
      get: jest.fn((key: string, fallback?: any) => (key === 'PORT' ? 3000 : fallback)),
    };
    parser = {
      getEndpoint: jest.fn(),
      resolveArguments: jest.fn(),
      requiresConfirmation: jest.fn().mockReturnValue(false),
    };
    mcpBridge = {
      hasTool: jest.fn().mockReturnValue(false),
      callTool: jest.fn(),
    };

    service = new AgentToolExecutorService(
      userRepository,
      httpService,
      jwtService,
      configService,
      parser,
      mcpBridge,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('never hands out a cached token older than the internal JWT 5m expiry', async () => {
    userRepository.findOne.mockResolvedValue({ id: 7, email: 'a@b.c', role: 'user' });

    // First sign → cached.
    const headers1 = await (service as any).getSystemHeadersForUser(7);
    expect(headers1.Authorization).toBe('Bearer token-A');
    expect(jwtService.sign).toHaveBeenCalledTimes(1);

    // +1m: still inside the JWT lifetime → cached token reused.
    jest.advanceTimersByTime(60_000);
    const headers2 = await (service as any).getSystemHeadersForUser(7);
    expect(headers2.Authorization).toBe('Bearer token-A');
    expect(jwtService.sign).toHaveBeenCalledTimes(1);

    // Old cache TTL was 10m while the JWT only lives 5m → calls between 5-10m
    // sent an expired JWT and got 401 (seen live 2026-08-26). Now the cache
    // re-signs at 4m, well inside the JWT lifetime.
    jest.advanceTimersByTime(5 * 60_000); // total 6m after first sign
    jwtService.sign.mockReturnValue('token-B');
    const headers3 = await (service as any).getSystemHeadersForUser(7);
    expect(headers3.Authorization).toBe('Bearer token-B');
    expect(jwtService.sign).toHaveBeenCalledTimes(2);
  });

  describe('getSemanticActionDescription', () => {
    it('appends the identifying arg so repeated steps are distinguishable', () => {
      parser.getEndpoint.mockReturnValue({ summary: 'מעדכן מודל' });

      expect(service.getSemanticActionDescription('X_updateModel', { id: 171 })).toBe('מעדכן מודל (id 171)');
    });

    it('returns the bare summary when no identifying arg exists', () => {
      parser.getEndpoint.mockReturnValue({ summary: 'מרענן' });

      expect(service.getSemanticActionDescription('X_refresh', {})).toBe('מרענן');
    });

    it('falls back for unknown tools, still with detail', () => {
      parser.getEndpoint.mockReturnValue(undefined);

      expect(service.getSemanticActionDescription('Mystery_tool', { city: 'Haifa' })).toBe(
        'מפעיל את כלי המערכת: Mystery_tool (city Haifa)',
      );
    });
  });
});
