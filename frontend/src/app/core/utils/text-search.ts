/**
 * Shared search semantics for every search field in the app.
 *
 * The query is split on whitespace into tokens; every token must appear in the
 * haystack, order-free ("nemo 35" finds "nvidia/nemotron-3.5-lightning").
 * Dots, dashes and underscores are noise, so "nemo 3.5" and "nemotron 35" are
 * the same query. Matching is case-insensitive substring inside the normalized
 * haystack.
 */

export function normalizeSearchToken(value: string): string {
    return value.toLowerCase().replace(/[.\-_]/g, '');
}

export function tokenizeSearchQuery(query: string | null | undefined): string[] {
    return (query ?? '')
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .map(normalizeSearchToken);
}

function matchesTokens(tokens: string[], haystackParts: readonly (string | null | undefined)[]): boolean {
    const haystack = normalizeSearchToken(haystackParts.filter(Boolean).join(' '));
    return tokens.every((token) => haystack.includes(token));
}

export function matchesSearch(query: string | null | undefined, ...haystackParts: (string | null | undefined)[]): boolean {
    const tokens = tokenizeSearchQuery(query);
    return tokens.length === 0 || matchesTokens(tokens, haystackParts);
}

export function filterBySearch<T>(
    items: readonly T[],
    query: string | null | undefined,
    toHaystack: (item: T) => string,
): T[] {
    const tokens = tokenizeSearchQuery(query);
    if (tokens.length === 0) return [...items];
    return items.filter((item) => matchesTokens(tokens, [toHaystack(item)]));
}
