import { parseLlmJson } from './llm-json-parser';

describe('parseLlmJson', () => {
  it('returns parsed JSON from plain string', () => {
    const result = parseLlmJson('{"key":"value"}', 'test');
    expect(result).toEqual({ key: 'value' });
  });

  it('strips markdown code fences with json label', () => {
    const input = '```json\n{"key":"value"}\n```';
    const result = parseLlmJson(input, 'test');
    expect(result).toEqual({ key: 'value' });
  });

  it('strips markdown code fences without label', () => {
    const input = '```\n{"key":"value"}\n```';
    const result = parseLlmJson(input, 'test');
    expect(result).toEqual({ key: 'value' });
  });

  it('returns null on invalid JSON', () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    const result = parseLlmJson('not json at all', 'test');
    expect(result).toBeNull();
    consoleSpy.mockRestore();
  });

  it('returns null on null input', () => {
    const result = parseLlmJson(null, 'test');
    expect(result).toBeNull();
  });

  it('returns null on empty string', () => {
    const result = parseLlmJson('', 'test');
    expect(result).toBeNull();
  });

  it('returns null on whitespace-only after fence stripping', () => {
    const input = '```\n\n```';
    const result = parseLlmJson(input, 'test');
    expect(result).toBeNull();
  });

  it('handles nested objects', () => {
    const input = '{"outer":{"inner":"value"},"arr":[1,2,3]}';
    const result = parseLlmJson(input, 'test');
    expect(result).toEqual({ outer: { inner: 'value' }, arr: [1, 2, 3] });
  });

  it('handles arrays at root level', () => {
    const input = '[{"id":1},{"id":2}]';
    const result = parseLlmJson(input, 'test');
    expect(result).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('trims whitespace around valid JSON', () => {
    const input = '  {"key":"value"}  ';
    const result = parseLlmJson(input, 'test');
    expect(result).toEqual({ key: 'value' });
  });

  it('strips fences with leading/trailing whitespace', () => {
    const input = '  ```json\n  {"key":"value"}  \n```  ';
    const result = parseLlmJson(input, 'test');
    expect(result).toEqual({ key: 'value' });
  });

  describe('almost-JSON recovery', () => {
    it('recovers an unescaped ASCII quote inside a Hebrew string value', () => {
      // `מע"מ` (VAT) is normally typed with a plain quote. Inside a JSON string that
      // quote terminates the value early, which is what produced the production
      // failure "Expected ',' or '}' after property value".
      const input = '[{"title":"מחשבון מע"מ","description":"כלי לפרילנסרים"}]';
      const result = parseLlmJson<{ title: string; description: string }[]>(input, 'test');
      expect(result).toEqual([{ title: 'מחשבון מע"מ', description: 'כלי לפרילנסרים' }]);
    });

    it('recovers several Hebrew abbreviations in one payload', () => {
      const input = '```json\n[\n  {\n    "title": "מחשבון מע"מ",\n    "targetMarket": "סוכני נדל"ן",\n  },\n]\n```';
      const result = parseLlmJson<{ title: string; targetMarket: string }[]>(input, 'test');
      expect(result).toEqual([{ title: 'מחשבון מע"מ', targetMarket: 'סוכני נדל"ן' }]);
    });

    it('escapes raw newlines inside string values', () => {
      const input = '{"description":"שורה ראשונה\nשורה שנייה"}';
      const result = parseLlmJson<{ description: string }>(input, 'test');
      expect(result).toEqual({ description: 'שורה ראשונה\nשורה שנייה' });
    });

    it('drops trailing commas before closing brackets', () => {
      const input = '{"a":[1,2,],"b":"c",}';
      const result = parseLlmJson(input, 'test');
      expect(result).toEqual({ a: [1, 2], b: 'c' });
    });

    it('ignores prose wrapped around the JSON payload', () => {
      const input = 'הנה הרעיונות שביקשת:\n[{"title":"כלי"}]\nמקווה שזה עוזר!';
      const result = parseLlmJson(input, 'test');
      expect(result).toEqual([{ title: 'כלי' }]);
    });

    it('leaves valid JSON with properly escaped quotes untouched', () => {
      const input = '{"note":"say \\"hi\\""}';
      const result = parseLlmJson<{ note: string }>(input, 'test');
      expect(result).toEqual({ note: 'say "hi"' });
    });

    it('does not resurrect genuinely broken input', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const result = parseLlmJson('no brackets or json here', 'test');
      expect(result).toBeNull();
      consoleSpy.mockRestore();
    });
  });
});
