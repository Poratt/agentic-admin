import { FilterService } from 'primeng/api';
import { matchesSearch } from '../utils/text-search';

/**
 * Match mode for p-table's `filterGlobal`/`filter` so PrimeNG applies the same
 * token-search semantics as every hand-written search field instead of a single
 * substring match.
 */
export const TOKEN_SEARCH_MATCH_MODE = 'tokenContains';

/** Registers the match mode on PrimeNG's FilterService — call once at bootstrap. */
export function registerTokenSearchMatchMode(filterService: FilterService): void {
    filterService.register(TOKEN_SEARCH_MATCH_MODE, (value: unknown, filter: unknown) =>
        matchesSearch(typeof filter === 'string' ? filter : '', value === null || value === undefined ? '' : String(value)),
    );
}
