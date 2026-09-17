import { FilterService } from 'primeng/api';
import { TOKEN_SEARCH_MATCH_MODE, registerTokenSearchMatchMode } from './token-search-filter';

describe('registerTokenSearchMatchMode', () => {
    const filterService = new FilterService();

    beforeAll(() => registerTokenSearchMatchMode(filterService));

    const match = (fieldValue: unknown, filterValue: string) =>
        filterService.filters[TOKEN_SEARCH_MATCH_MODE](fieldValue, filterValue, undefined);

    it('registers the token match mode on PrimeNG FilterService', () => {
        expect(typeof filterService.filters[TOKEN_SEARCH_MATCH_MODE]).toBe('function');
    });

    it('requires every whitespace-separated token, in any order', () => {
        expect(match('nvidia/nemotron-3.5-lightning-30b', 'lightning 30b')).toBe(true);
        expect(match('nvidia/nemotron-3.5-lightning-30b', '30b lightning')).toBe(true);
        expect(match('nvidia/nemotron-3.5-lightning-30b', 'lightning 70b')).toBe(false);
    });

    it('ignores dot/dash/underscore differences and case', () => {
        expect(match('glm-4.6', 'glm 4.6')).toBe(true);
        expect(match('GPT-4o', 'gpt 4o')).toBe(true);
    });

    it('matches everything for a blank filter', () => {
        expect(match('anything', '')).toBe(true);
        expect(match(undefined, '   ')).toBe(true);
    });

    it('never throws on null/undefined field values', () => {
        expect(match(null, 'glm')).toBe(false);
        expect(match(undefined, 'glm')).toBe(false);
    });

    it('stringifies non-string field values', () => {
        expect(match(42, '42')).toBe(true);
    });
});
