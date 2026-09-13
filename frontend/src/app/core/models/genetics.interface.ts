/**
 * Single genetics/strain record returned by the backend genetics catalog API.
 *
 * `description`, `parent1`, `parent2`, `origin`, and `type` are optional —
 * the seed populates most rows with all fields, but the schema allows partial
 * records (e.g. phenotype-only strains end up with `parent1 = parent2 = null`).
 *
 * `color` is the raw AI-generated hex accent.
 * `colorDark` / `colorLight` are WCAG AA-safe variants derived from `color`
 * for dark and light theme backgrounds respectively.
 */
export interface IGenetics {
    id: number;
    name: string;
    englishName?: string;
    description?: string;
    parent1?: string;
    parent2?: string;
    origin?: string;
    type?: string;
    thcRange?: string;
    terpenes?: string;
    effects?: string;
    color: string;
    colorDark: string;
    colorLight: string;
}