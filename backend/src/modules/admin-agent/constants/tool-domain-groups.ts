// FILE: src/modules/admin-agent/constants/tool-domain-groups.ts

/**
 * Static tool tier filter data — domain groups + keyword rules.
 *
 * The chat agent injects ~75 tools into every LLM call. This data lets
 * ToolTierFilterService pick a small set of domain groups based on the user
 * prompt: ALWAYS_TAGS are kept in every filtered turn, DOMAIN_GROUPS are
 * added when a keyword hits, and anything else falls back to the full set.
 *
 * Hebrew keywords are bare substrings (no \b — Hebrew letters are not \w
 * in JS regex, so \b boundaries never fire around them). A false-positive
 * in Hebrew keeps a few extra tools, which is the safe direction: the
 * system falls back to MORE tools, never fewer. Latin keywords keep \b
 * boundaries, which work on ASCII word characters.
 */

/** Tags kept in every filtered turn (always-on, even if no group matched). */
export const ALWAYS_TAGS = new Set<string>([
  'app',
  'auth',
  'system',
  'Admin Agent',
  'database-monitor',
]);

/** A domain group: the swagger tags to include when any keyword hits. */
export interface DomainGroup {
  /** Swagger @ApiTags to include when this group matches. */
  tags: string[];
  /** Any regex match on the user prompt activates this group. */
  keywords: RegExp[];
}

/** All domain groups, evaluated in order on every prompt. */
export const DOMAIN_GROUPS: DomainGroup[] = [
  {
    tags: ['strain-hunter', 'genetics', 'terpenes'],
    keywords: [
      /זן/,
      /גנטיקה/,
      /טרפן/,
      /הכלאה/,
      /\bstrain\b/i,
      /\bgenetic/i,
      /\bterpene/i,
      /\bTHC\b/,
      /\bCBD\b/,
      /\bindica\b/i,
      /\bsativa\b/i,
    ],
  },
  {
    tags: ['llm', 'LLM Provider'],
    keywords: [
      /מודל/,
      /ספק/,
      /טסט/,
      /סטטיסטיקה/,
      /תמונה/,
      /וידאו/,
      /\bembedding\b/i,
      /\bLLM\b/,
      /\bimage generation\b/i,
      /\bvideo generation\b/i,
    ],
  },
  {
    tags: ['ideas'],
    keywords: [/רעיון/, /סיעור/, /לילה/, /\bidea\b/i, /\bbrainstorm\b/i],
  },
  {
    tags: ['calendar'],
    keywords: [/יומן/, /פגישה/, /\bGoogle Calendar\b/i, /\bcalendar\b/i, /\bevent\b/i, /\boAuth\b/i],
  },
  {
    tags: ['users', 'auth', 'analytics'],
    keywords: [/משתמש/, /הרשאה/, /\badmin\b/i, /\brole\b/i, /\banalytic/i, /\bchart\b/i],
  },
  {
    tags: ['currency'],
    keywords: [/מטבע/, /שער/, /\bcurrency\b/i, /\bexchange rate\b/i],
  },
  {
    tags: ['web-search'],
    keywords: [/חיפוש/, /ויקיפדיה/, /\bweb search\b/i, /\bsearch\b/i],
  },
];

/** Shortest user prompt that may trigger filtering; shorter → full set. */
export const MIN_PROMPT_LENGTH_FOR_HEURISTIC = 8; // chars

/** Minimum keyword hits (across all groups) to trust the classification. */
export const MIN_KEYWORD_HITS_TO_TRUST = 1; // at least 1 hit