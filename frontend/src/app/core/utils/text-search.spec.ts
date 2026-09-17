import { filterBySearch, matchesSearch, normalizeSearchToken, tokenizeSearchQuery } from './text-search';

describe('text-search', () => {
    describe('normalizeSearchToken', () => {
        it('lowercases and drops dots, dashes and underscores', () => {
            expect(normalizeSearchToken('Nemotron-3.5_Ultra.Pro')).toBe('nemotron35ultrapro');
        });

        it('also drops slashes and colons', () => {
            expect(normalizeSearchToken('openai/gpt-4o')).toBe('openaigpt4o');
            expect(normalizeSearchToken('https://api.openai.com')).toBe('httpsapiopenaicom');
        });
    });

    describe('tokenizeSearchQuery', () => {
        it('splits on whitespace, drops empties and normalizes each token', () => {
            expect(tokenizeSearchQuery('  Nemo   3.5-ultra ')).toEqual(['nemo', '35ultra']);
        });

        it('treats null/undefined as an empty query', () => {
            expect(tokenizeSearchQuery(null)).toEqual([]);
            expect(tokenizeSearchQuery(undefined)).toEqual([]);
        });
    });

    describe('matchesSearch', () => {
        it('requires every token, in any order', () => {
            expect(matchesSearch('lightning 30b', 'nvidia/nemotron-3.5-lightning-30b-a3b')).toBe(true);
            expect(matchesSearch('30b lightning', 'nvidia/nemotron-3.5-lightning-30b-a3b')).toBe(true);
            expect(matchesSearch('lightning 70b', 'nvidia/nemotron-3.5-lightning-30b-a3b')).toBe(false);
        });

        it('ignores dot/dash/underscore differences', () => {
            const key = 'nvidia/nemotron-3.5-lightning-30b-a3b';
            expect(matchesSearch('nemo 35', key)).toBe(true);
            expect(matchesSearch('nemo 3.5', key)).toBe(true);
            expect(matchesSearch('nemotron 35', key)).toBe(true);
        });

        it('ignores slash/colon differences', () => {
            expect(matchesSearch('openai gpt', 'openai/gpt-4o')).toBe(true);
            expect(matchesSearch('api openai', 'https://api.openai.com')).toBe(true);
        });

        it('is case-insensitive and matches across several haystack parts', () => {
            expect(matchesSearch('CONTENT safety', 'model-key', 'Content Safety Guard')).toBe(true);
        });

        it('skips null/undefined haystack parts', () => {
            expect(matchesSearch('glm', 'glm-4.6', null, undefined)).toBe(true);
        });

        it('matches everything for an empty query', () => {
            expect(matchesSearch('', 'anything')).toBe(true);
            expect(matchesSearch('   ', 'anything')).toBe(true);
        });

        it('does not match a token that only spans two haystack parts', () => {
            expect(matchesSearch('safetyguard', 'Content Safety', 'Guard')).toBe(false);
        });
    });

    describe('filterBySearch', () => {
        const items = [{ label: 'GPT-4o' }, { label: 'GLM-4.6' }, { label: 'Nemotron-3.5' }];

        it('returns a copy of every item for an empty query', () => {
            expect(filterBySearch(items, '', (i) => i.label)).toEqual(items);
            expect(filterBySearch(items, '', (i) => i.label)).not.toBe(items);
        });

        it('keeps only items whose haystack holds all tokens', () => {
            expect(filterBySearch(items, 'glm 46', (i) => i.label)).toEqual([{ label: 'GLM-4.6' }]);
            expect(filterBySearch(items, 'nemotron 35', (i) => i.label)).toEqual([{ label: 'Nemotron-3.5' }]);
            expect(filterBySearch(items, 'gpt glm', (i) => i.label)).toEqual([]);
        });
    });
});
