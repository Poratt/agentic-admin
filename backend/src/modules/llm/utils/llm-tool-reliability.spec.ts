import { LlmToolCall, LlmToolSchema } from '../types/llm.types';
import { computeToolCallReliability } from './llm-tool-reliability';

const tools: LlmToolSchema[] = [
  { type: 'function', function: { name: 'search', parameters: { type: 'object' } } },
  { type: 'function', function: { name: 'calculate', parameters: { type: 'object' } } },
];

function toolCall(name: string, args: string): LlmToolCall {
  return { id: `call_${name}`, type: 'function', function: { name, arguments: args } };
}

describe('computeToolCallReliability', () => {
  it('scores 100 when every tool call has a requested name and parseable object arguments', () => {
    expect(
      computeToolCallReliability(tools, [
        toolCall('search', '{"query":"strain"}'),
        toolCall('calculate', '{"a":2,"b":3}'),
      ]),
    ).toBe(100);
  });

  it('returns null when no tools were requested', () => {
    expect(computeToolCallReliability(undefined, [toolCall('search', '{}')])).toBeNull();
    expect(computeToolCallReliability([], [toolCall('search', '{}')])).toBeNull();
  });

  it('returns null when the model emitted no tool calls', () => {
    expect(computeToolCallReliability(tools, [])).toBeNull();
    expect(computeToolCallReliability(tools, undefined)).toBeNull();
  });

  it('returns null when the request carries no declaring name to verify against', () => {
    const anonymous = [{ type: 'function', function: { name: '', parameters: {} } } as LlmToolSchema];
    expect(computeToolCallReliability(anonymous, [toolCall('', '{}')])).toBeNull();
  });

  it('scores 0 when the model invokes a function that was never offered', () => {
    expect(computeToolCallReliability(tools, [toolCall('hack_into_mainframes', '{}')])).toBe(0);
  });

  it('scores 0 when arguments are not JSON at all', () => {
    // The classic quantized/free-tier failure: the model prints the tool call as prose.
    expect(computeToolCallReliability(tools, [toolCall('search', 'query=strain, limit=5')])).toBe(0);
  });

  it('scores 0 when arguments parse to a non-object', () => {
    expect(computeToolCallReliability(tools, [toolCall('search', 'null')])).toBe(0);
    expect(computeToolCallReliability(tools, [toolCall('search', '[1,2]')])).toBe(0);
    expect(computeToolCallReliability(tools, [toolCall('search', '"a string"')])).toBe(0);
  });

  it('scores the share of valid calls when some fail', () => {
    expect(
      computeToolCallReliability(tools, [
        toolCall('search', '{"query":"strain"}'),
        toolCall('search', 'broken json'),
        toolCall('unknown', '{}'),
      ]),
    ).toBe(33);
  });

  it('accepts whitespace-padded arguments', () => {
    expect(computeToolCallReliability(tools, [toolCall('search', '  {"query":"x"}  ')])).toBe(100);
  });

  it('accepts nested object arguments', () => {
    expect(computeToolCallReliability(tools, [toolCall('search', '{"filter":{"priceMax":100,"tags":["a"]}}')])).toBe(100);
  });
});