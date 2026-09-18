import { SwaggerToolsParser } from './swagger-tools.parser';
import { Reflector } from '@nestjs/core';

/**
 * C5 H3 + H5 + H6 — verify that getTools() excludes AdminAgentController_confirmAction
 * (LLM self-confirmation), AdminAgentController_streamChat (agent recursion),
 * and GoogleCalendarController_callback (external OAuth redirect target).
 *
 * The parser reads the real swagger-spec.json in its constructor, so tests
 * work against the actual spec rather than mocks. The denylist filter runs
 * after spec loading — if it works, tool count drops by exactly 3.
 */
describe('SwaggerToolsParser — C5 H3 + H5 + H6: confirmAction + streamChat + callback hidden from LLM', () => {
  let parser: SwaggerToolsParser;
  let toolNames: string[];

  beforeAll(() => {
    parser = new SwaggerToolsParser(new Reflector() as any);
    toolNames = parser.getTools().map((t) => t.function?.name ?? '');
  });

  it('confirmAction is excluded from the LLM tool list', () => {
    expect(toolNames).not.toContain('AdminAgentController_confirmAction');
  });

  it('streamChat (query-stream) is excluded from the LLM tool list', () => {
    expect(toolNames).not.toContain('AdminAgentController_streamChat');
  });

  it('callback (OAuth redirect target) is excluded from the LLM tool list', () => {
    // The agent has no browser session or code/state — calling it can only fail
    // and tempts the same re-call loop the auth tool had (sessions 227-228).
    expect(toolNames).not.toContain('GoogleCalendarController_callback');
  });

  it('dangerous operations are still exposed (no over-filtering)', () => {
    expect(toolNames).toContain('UsersController_delete');
    expect(toolNames).toContain('UsersController_updateRole');
    expect(toolNames).toContain('LlmProviderController_cleanupTestResults');
  });

  it('getEndpoint still returns confirmAction metadata (UI calls it directly)', () => {
    // The endpoint is still reachable — only the tool exposure is blocked
    const endpoint = parser.getEndpoint('AdminAgentController_confirmAction');
    expect(endpoint).toBeDefined();
    expect(endpoint?.path).toContain('confirm-action');
  });

  it('getEndpoint still returns streamChat metadata (UI calls it directly)', () => {
    // The chat page calls query-stream directly — only the tool exposure is blocked
    const endpoint = parser.getEndpoint('AdminAgentController_streamChat');
    expect(endpoint).toBeDefined();
    expect(endpoint?.path).toContain('query-stream');
  });

  it('confirmAction + streamChat + callback are the only tools filtered (total = spec tools minus 3)', () => {
    // The post-denylist tool list currently holds 75 entries.
    // Band is a sanity guard for over/under-filtering, tolerant to tool churn.
    // If someone adds more tools to the denylist, this test will need updating.
    expect(toolNames.length).toBeGreaterThanOrEqual(70);
    expect(toolNames.length).toBeLessThanOrEqual(75); // tolerance for spec changes
  });
});

/**
 * H4 — SSRF/URL injection: resolveArguments must percent-encode path-param
 * values (encodeURIComponent) so LLM-supplied input can never introduce URL
 * structure characters (/, ?, #, ...) and escape the declared endpoint.
 * Note: encodeURIComponent intentionally preserves '.' (RFC 3986 unreserved),
 * so a value like '1/../../sessions/5' still contains literal '..' — but the
 * slashes are %2F, so the whole value stays one encoded path segment and can
 * never be parsed as path traversal or a different route.
 */
describe('SwaggerToolsParser — H4 SSRF/URL injection: path params are encoded', () => {
  let parser: SwaggerToolsParser;

  beforeAll(() => {
    parser = new SwaggerToolsParser(new Reflector() as any);
  });

  it('encodes traversal input (1/../../sessions/5) — cannot escape the declared path', () => {
    const { targetUrl } = parser.resolveArguments(
      '/genetics/{name}',
      'get',
      { name: '1/../../sessions/5' },
      'http://localhost:3000',
    );

    // No raw '/' can be forged, so no /sessions segment can ever be reached
    expect(targetUrl).not.toContain('/sessions');
    expect(targetUrl).toContain('%2F');
    // The value stays a single encoded path segment
    expect(targetUrl).toBe('http://localhost:3000/genetics/1%2F..%2F..%2Fsessions%2F5');
  });

  it('encodes query-injection characters (? and =)', () => {
    const { targetUrl } = parser.resolveArguments(
      '/genetics/{name}',
      'get',
      { name: 'x?admin=true' },
      'http://localhost:3000',
    );

    // No raw '?' can start a query string beyond the declared path
    expect(targetUrl).not.toContain('?admin=true');
    expect(targetUrl).toContain('%3F');
    expect(targetUrl).toBe('http://localhost:3000/genetics/x%3Fadmin%3Dtrue');
  });

  it('encodes Hebrew strain names with spaces (UTF-8 + %20)', () => {
    const { targetUrl } = parser.resolveArguments(
      '/genetics/{name}',
      'get',
      { name: 'גורילה גלו' },
      'http://localhost:3000',
    );

    expect(targetUrl).toContain('%20');
    expect(targetUrl).toContain('%D7%92'); // 'ג' as UTF-8
    expect(targetUrl).toBe(
      'http://localhost:3000/genetics/%D7%92%D7%95%D7%A8%D7%99%D7%9C%D7%94%20%D7%92%D7%9C%D7%95',
    );
  });

  it('non-path args with GET still land in queryParams (unchanged behavior)', () => {
    const { targetUrl, body, queryParams } = parser.resolveArguments(
      '/genetics/{name}',
      'get',
      { name: 'strain1', limit: '10' },
      'http://localhost:3000',
    );

    expect(targetUrl).toBe('http://localhost:3000/genetics/strain1');
    expect(queryParams).toEqual({ limit: '10' });
    expect(body).toEqual({});
  });

  it('non-path args with POST still land in body (unchanged behavior)', () => {
    const { targetUrl, body, queryParams } = parser.resolveArguments(
      '/users/{id}',
      'post',
      { id: '42', role: 'admin' },
      'http://localhost:3000',
    );

    expect(targetUrl).toBe('http://localhost:3000/users/42');
    expect(body).toEqual({ role: 'admin' });
    expect(queryParams).toEqual({});
  });
});

/**
 * Tool Tier Filtering — Phase 1: op.tags captured end-to-end.
 *
 * The parser reads the real swagger-spec.json, so this proves the @ApiTags
 * array survives the load → clean → cache pipeline and lands on each tool.
 * Exact casing matters: 'LLM Provider' is capitalized differently from the
 * other kebab-case tags and must round-trip verbatim (ToolTierFilterService
 * matches tags by exact string).
 */
describe('SwaggerToolsParser — Phase 1: op.tags captured on each tool', () => {
  let parser: SwaggerToolsParser;
  let toolByName: Map<string, ReturnType<SwaggerToolsParser['getTools']>[number]>;

  beforeAll(() => {
    parser = new SwaggerToolsParser(new Reflector() as any);
    toolByName = new Map(parser.getTools().map((t) => [t.function?.name ?? '', t]));
  });

  it('every exposed swagger tool carries a non-empty tags array', () => {
    const tools = parser.getTools();
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      expect(Array.isArray(tool.tags)).toBe(true);
      expect(tool.tags!.length).toBeGreaterThan(0);
    }
  });

  it('kebab-case tags round-trip verbatim (users)', () => {
    expect(toolByName.get('UsersController_delete')?.tags).toEqual(['users']);
  });

  it('capitalized tag "LLM Provider" round-trips with exact casing', () => {
    expect(toolByName.get('LlmProviderController_cleanupTestResults')?.tags).toEqual(['LLM Provider']);
  });

  it('domain tags map to their controllers (strain-hunter)', () => {
    expect(toolByName.get('StrainHunterController_fetchData')?.tags).toEqual(['strain-hunter']);
    expect(toolByName.get('GeneticsController_findAll')?.tags).toEqual(['genetics']);
    expect(toolByName.get('LlmController_generateImage')?.tags).toEqual(['llm']);
  });
});
