// FILE: src/modules/admin-agent/services/tool-tier-filter.service.ts

import { Injectable, Logger } from '@nestjs/common';
import type { LlmToolSchema } from './swagger-tools.parser';
import {
  ALWAYS_TAGS,
  DOMAIN_GROUPS,
  MIN_PROMPT_LENGTH_FOR_HEURISTIC,
} from '../constants/tool-domain-groups';

/**
 * Static tool tier filter — keyword/regex heuristic that picks a small set
 * of domain groups based on the user prompt.
 *
 * Runs entirely in-process (zero new latency): no embedding call, no HTTP.
 * Safety model: when the prompt is empty/short or no keyword matches, the
 * FULL tool set is returned — the system never sees fewer tools than before.
 *
 * @see constants/tool-domain-groups.ts for the domain data
 */
@Injectable()
export class ToolTierFilterService {
  private readonly logger = new Logger(ToolTierFilterService.name);

  /**
   * Filters the full tool list down to the always-on tags plus the domain
   * groups whose keywords appear in the prompt.
   *
   * @param prompt - the raw USER prompt (not the iteration prompt, which is
   *   empty for iterations > 0)
   * @param allTools - the full swagger tool list (HIDDEN_FROM_LLM already
   *   removed by SwaggerToolsParser)
   * @returns the filtered subset, or the original full list on fallback
   *   (empty/whitespace/short prompt, no keyword matched)
   */
  filterToolsForPrompt(prompt: string, allTools: LlmToolSchema[]): LlmToolSchema[] {
    if (!prompt || prompt.trim().length < MIN_PROMPT_LENGTH_FOR_HEURISTIC) {
      this.logDebug(allTools, allTools, 'fallback: prompt too short');
      return allTools;
    }

    const matchedTags = new Set<string>(ALWAYS_TAGS);
    const matchedGroups: string[] = [];
    let anyHit = false;

    for (const group of DOMAIN_GROUPS) {
      if (group.keywords.some((rx) => rx.test(prompt))) {
        anyHit = true;
        matchedGroups.push(group.tags.join(', '));
        for (const tag of group.tags) {
          matchedTags.add(tag);
        }
      }
    }

    if (!anyHit) {
      this.logDebug(allTools, allTools, 'fallback: no keyword matched');
      return allTools;
    }

    // Untagged tools (tags.length === 0) are kept — a tool without a domain
    // cannot be classified, so hiding it would risk lost capability.
    const filtered = allTools.filter((tool) => {
      const tags = tool.tags ?? [];
      return tags.length === 0 || tags.some((tag) => matchedTags.has(tag));
    });

    this.logDebug(filtered, allTools, `matched: ${matchedGroups.join(', ')}`);
    return filtered;
  }

  private logDebug(filtered: LlmToolSchema[], allTools: LlmToolSchema[], reason: string): void {
    this.logger.debug(`Tier filter: kept ${filtered.length}/${allTools.length} tools (${reason})`);
  }
}