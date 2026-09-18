// FILE: src/modules/admin-agent/services/tool-tier-filter.service.spec.ts

import { Reflector } from '@nestjs/core';
import { SwaggerToolsParser } from './swagger-tools.parser';
import { ToolTierFilterService } from './tool-tier-filter.service';

/**
 * Tool Tier Filtering — Phase 2: filterToolsForPrompt edge cases.
 *
 * allTools come from the real swagger-spec.json via SwaggerToolsParser, so
 * tags and counts are live. The safety net is asserted strictly: empty /
 * whitespace / short / unmatched prompts return the SAME full array (no
 * filtering at all), so the agent never sees fewer tools than before.
 */
describe('ToolTierFilterService — Phase 2: domain filtering', () => {
  let filter: ToolTierFilterService;
  let toolNames: Map<string, string[]>;

  beforeAll(() => {
    filter = new ToolTierFilterService();
    toolNames = new Map(
      new SwaggerToolsParser(new Reflector() as any)
        .getTools()
        .map((t) => [t.function?.name ?? '', t.tags ?? []]),
    );
  });

  it('empty prompt returns the full tool set', () => {
    const full = [...toolNames.keys()];
    const result = filter.filterToolsForPrompt('', full as any);
    expect(result).toBe(full);
  });

  it('whitespace-only prompt returns the full tool set', () => {
    const full = [...toolNames.keys()];
    const result = filter.filterToolsForPrompt('   \t  ', full as any);
    expect(result).toBe(full);
  });

  it('unmatched prompt (no keyword) returns the full tool set — the safety net', () => {
    const full = [...toolNames.keys()];
    const result = filter.filterToolsForPrompt('שלום מה שלומך היום', full as any);
    expect(result).toBe(full);
  });

  it('single Hebrew keyword (≥8 chars) returns a filtered set in its domain', () => {
    const result = filter.filterToolsForPrompt('ויקיפדיה', buildTools());
    const names = result.map((t) => t.function?.name ?? '');
    expect(result.length).toBeLessThan(buildTools().length);
    expect(names).toContain('WebSearchController_search');
    expect(names).not.toContain('GeneticsController_findAll');
  });

  it('cross-domain prompt keeps BOTH matched groups plus the always-on tags', () => {
    const result = filter.filterToolsForPrompt('תביא זן ואז תעשה לי תמונה', buildTools());
    const names = result.map((t) => t.function?.name ?? '');

    // strain group
    expect(names).toContain('StrainHunterController_fetchData');
    expect(names).toContain('GeneticsController_findAll');
    expect(names).toContain('TerpeneController_findAll');
    // llm group
    expect(names).toContain('LlmController_generateImage');
    expect(names).toContain('LlmProviderController_findAll');
    // always-on tags
    expect(names).toContain('AuthController_me');
    expect(names).toContain('SystemController_getStatus');
    expect(names).toContain('AdminAgentController_getSessions');
    expect(names).toContain('DatabaseMonitorController_getStorage');
    // unrelated domain excluded
    expect(names).not.toContain('GoogleCalendarController_events');
    expect(names).not.toContain('IdeasController_generate');

    // token-reduction sanity: filtered but still above the always-on baseline
    expect(result.length).toBeLessThan(buildTools().length);
  });

  it('English prompt with no Hebrew still classifies (Latin keywords)', () => {
    const result = filter.filterToolsForPrompt('what is the exchange rate today?', buildTools());
    const names = result.map((t) => t.function?.name ?? '');
    expect(names).toContain('CurrencyController_getRates');
    expect(names).not.toContain('GeneticsController_findAll');
  });

  it('user-management prompt activates the users group', () => {
    const result = filter.filterToolsForPrompt('תביא לי את כל המשתמשים', buildTools());
    const names = result.map((t) => t.function?.name ?? '');
    expect(names).toContain('UsersController_list');
    expect(names).toContain('AnalyticsController_query');
    expect(names).not.toContain('TerpeneController_findAll');
  });

  function buildTools() {
    return [...toolNames.entries()].map(
      ([name, tags]): any => ({
        type: 'function',
        source: 'swagger',
        tags,
        function: { name },
      }),
    );
  }
});