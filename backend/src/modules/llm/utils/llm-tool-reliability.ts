import { LlmToolCall, LlmToolSchema } from '../types/llm.types';

/**
 * Computes how syntactically sound a model's tool output is, 0-100.
 *
 * A tool call counts as valid only when BOTH hold:
 * 1. the invoked function name is one the request actually offered, and
 * 2. the `arguments` string parses as JSON into a non-null, non-array object.
 *
 * Anything else — an unknown function name, a broken JSON blip, an argument
 * blob that is `null`, a bare array or a primitive — is the exact failure mode
 * of free-tier and heavily-quantized models under load: the agent loop then
 * fails at parse time even though the call "succeeded" on the wire.
 *
 * Returns `null` when there is nothing to measure (no tools requested, or the
 * model emitted no tool calls) so statistics can distinguish "no sample" from
 * "0% reliable".
 */
export function computeToolCallReliability(
  tools: LlmToolSchema[] | undefined,
  toolCalls: LlmToolCall[] | undefined,
): number | null {
  if (!tools?.length || !toolCalls?.length) return null;

  const requested = new Set(tools.map((t) => t.function?.name).filter((name): name is string => Boolean(name)));
  if (requested.size === 0) return null;

  let valid = 0;
  for (const call of toolCalls) {
    if (!call.function?.name || !requested.has(call.function.name)) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(call.function.arguments);
    } catch {
      continue;
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) continue;

    valid += 1;
  }

  return Math.round((valid / toolCalls.length) * 100);
}