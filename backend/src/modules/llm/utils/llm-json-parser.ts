/**
 * Best-effort parser for JSON produced by an LLM.
 *
 * Models routinely return almost-JSON: wrapped in markdown fences, surrounded by
 * a sentence of prose, carrying trailing commas, or with raw newlines inside
 * string values. The failure that matters most in this project is an unescaped
 * ASCII double quote inside Hebrew text — `מע"מ` (VAT), `נדל"ן` (real estate) —
 * where the inner quote terminates the JSON string early and `JSON.parse` then
 * reports `Expected ',' or '}' after property value`.
 *
 * The parser therefore escalates through increasingly aggressive candidates and
 * returns the first one that parses. It never throws: the caller receives `null`
 * and decides how to log and recover.
 *
 * Used by reference-catalog enrichment (`GeneticsService`, `TerpeneService`) and
 * by every LLM stage of the ideas pipeline (discovery, topic discovery, signals,
 * generation, validation).
 *
 * @param content Raw LLM response content. May be `null`, empty, fenced, or
 *   surrounded by prose. The function does not throw on any of these.
 * @param context Short label used in the failure log message — for example
 *   `'ideas-generation'`. Helps when multiple stages share this helper.
 * @returns Parsed JSON value, or `null` if no candidate parsed.
 */
export function parseLlmJson<T>(content: string | null, context: string): T | null {
  if (!content) {
    return null;
  }

  const fenced = stripCodeFences(content);
  if (!fenced) {
    return null;
  }

  const extracted = extractOutermostJson(fenced);

  const errors: string[] = [];

  const candidates = uniqueCandidates([fenced, extracted, repairJsonText(fenced), extracted ? repairJsonText(extracted) : null]);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'unknown');
    }
  }

  // errors[0] belongs to the first candidate, so its offsets match `fenced`.
  const primaryError = errors[0] ?? 'unknown';
  // eslint-disable-next-line no-console
  console.warn(`[${context}] Failed to parse LLM JSON: ${primaryError}${describeFailureWindow(fenced, primaryError)}`);
  return null;
}

/**
 * Removes a wrapping markdown code fence (` ```json ... ``` `), which a few
 * models emit even when explicitly told to return JSON only.
 */
function stripCodeFences(content: string): string {
  let cleaned = content.trim();

  if (cleaned.startsWith('```')) {
    cleaned = cleaned
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
  }

  return cleaned;
}

/**
 * Returns the substring spanning the first balanced JSON value — `{...}` or
 * `[...]` — ignoring brackets that appear inside string literals. This drops any
 * prose the model wrapped around the payload.
 *
 * Returns `null` when the text holds no JSON opener or when the brackets never
 * balance (truncated response), leaving recovery to the repair pass.
 */
function extractOutermostJson(text: string): string | null {
  const start = text.search(/[[{]/);
  if (start === -1) {
    return null;
  }

  const opener = text[start];
  const closer = opener === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === opener) {
      depth++;
    } else if (ch === closer) {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}

/**
 * Rewrites almost-JSON into strictly valid JSON by walking the text once and
 * tracking whether it is inside a string literal:
 *
 * - escapes raw control characters (newlines, tabs) that appear inside strings
 * - escapes double quotes that are content rather than a delimiter — the
 *   `מע"מ` case — by treating a quote as a closing delimiter only when what
 *   follows it could legally follow one (see `quoteClosesString`)
 * - drops trailing commas before `}` / `]`
 *
 * Valid JSON passes through unchanged.
 */
function repairJsonText(text: string): string {
  let out = '';
  let inString = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (!inString) {
      if (ch === '"') {
        inString = true;
        out += ch;
        continue;
      }

      if (ch === ',') {
        const next = nextSignificantChar(text, i + 1);
        if (next === '}' || next === ']') {
          continue;
        }
      }

      out += ch;
      continue;
    }

    if (ch === '\\') {
      const escaped = text[i + 1];
      if (escaped === undefined) {
        // Lone trailing backslash: escape it so it cannot swallow a quote.
        out += '\\\\';
        continue;
      }
      if ('"\\/bfnrtu'.includes(escaped)) {
        // Legal JSON escape — pass through as-is.
        out += ch + escaped;
      } else {
        // Invalid escape target (e.g. PHP namespaces: League\Csv) —
        // double the backslash so the character survives as literal text.
        out += '\\\\' + escaped;
      }
      i++;
      continue;
    }

    if (ch === '"') {
      if (quoteClosesString(text, i)) {
        inString = false;
        out += ch;
      } else {
        out += '\\"';
      }
      continue;
    }

    out += ch < ' ' ? escapeControlChar(ch) : ch;
  }

  return out;
}

/**
 * Characters that may legitimately follow a comma inside JSON: the start of the next key or value,
 * plus `}`/`]` for a trailing comma.
 */
const JSON_AFTER_COMMA = '"{}[]-0123456789tfn';

/**
 * Decides whether the quote at `index` closes the string it sits in, or is content inside it.
 *
 * Content is the easy half: `מע"מ` puts a quote before a letter, and a letter can never follow a
 * closing delimiter, so the quote is obviously content.
 *
 * The hard half is a quote that is followed by a comma — legal after a real delimiter, but also
 * the exact shape of the live failure that lost a whole topic:
 *
 *     "description": "המערכת מייצרת "Audit חודשי", ומספקת דוח"
 *
 * Here the inner quote in `"Audit חודשי",` closed the value, leaving `ומספקת דוח"` to be read as
 * garbage. The comma alone cannot settle it, but what comes *after* the comma can: a closing
 * delimiter must be followed by the next key or value, and prose is neither. So the quote closes
 * the string only when a JSON token could start after the comma.
 */
function quoteClosesString(text: string, index: number): boolean {
  const nextIndex = nextSignificantIndex(text, index + 1);
  if (nextIndex === -1) {
    // End of text: a closing delimiter is the only reading that leaves anything to parse.
    return true;
  }

  const next = text[nextIndex];
  if (next === '}' || next === ']' || next === ':') {
    return true;
  }

  if (next !== ',') {
    return false;
  }

  const afterComma = nextSignificantIndex(text, nextIndex + 1);
  return afterComma !== -1 && JSON_AFTER_COMMA.includes(text[afterComma]);
}

/** First non-whitespace character at or after `from`, or `null` at end of text. */
function nextSignificantChar(text: string, from: number): string | null {
  const index = nextSignificantIndex(text, from);
  return index === -1 ? null : text[index];
}

/** Index of the first non-whitespace character at or after `from`, or `-1` at end of text. */
function nextSignificantIndex(text: string, from: number): number {
  for (let i = from; i < text.length; i++) {
    if (!/\s/.test(text[i])) {
      return i;
    }
  }

  return -1;
}

/** JSON escape sequence for a raw control character. */
function escapeControlChar(ch: string): string {
  switch (ch) {
    case '\n':
      return '\\n';
    case '\r':
      return '\\r';
    case '\t':
      return '\\t';
    case '\b':
      return '\\b';
    case '\f':
      return '\\f';
    default:
      return `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`;
  }
}

/** Drops empty candidates and duplicates while preserving order. */
function uniqueCandidates(values: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }

  return result;
}

/**
 * Quotes the text around the position reported by `JSON.parse`, so a future
 * failure can be diagnosed from the log without replaying the LLM call.
 */
function describeFailureWindow(text: string, message: string): string {
  const match = /position (\d+)/.exec(message);
  if (!match) {
    return '';
  }

  const position = Number(match[1]);
  if (!Number.isFinite(position) || position > text.length) {
    return '';
  }

  const start = Math.max(0, position - 80);
  const end = Math.min(text.length, position + 80);

  return ` | near: …${text.slice(start, end).replace(/\n/g, '\\n')}…`;
}
