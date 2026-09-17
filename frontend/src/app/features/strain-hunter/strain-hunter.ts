import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
    Component,
    DestroyRef,
    ElementRef,
    OnInit,
    computed,
    effect,
    inject,
    signal,
    viewChild,
    ChangeDetectionStrategy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { SortEvent } from 'primeng/api';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SliderModule } from 'primeng/slider';
import { Table, TableModule } from 'primeng/table';
import { Subscription, timeout } from 'rxjs';
import { environment } from '../../environments/environment';
import { ServiceResultContainer } from '../../core/models/service-result-container.model';
import { PageStates } from '../../core/enums/page-states.enum';
import { MatchingEngineStore, ScoredStrain, ScoreBreakdown } from '../../core/store/matching-engine.store';
import { TerpeneStore } from '../../core/store/terpene.store';
import { GeneticsStore } from '../../core/store/genetics.store';
import { Tooltip, TooltipCategory } from '../../components/shared/tooltip/tooltip';
import { ScoreTooltip } from '../../components/shared/score-tooltip/score-tooltip';
import { MatchingPreferencesDrawer } from './matching-preferences-drawer/matching-preferences-drawer';
import { TooltipDirective } from '../../core/directives/tooltip.directive';
import { matchesSearch } from '../../core/utils/text-search';
import { AuthStore } from '../../core/store/auth.store';
import { UserRole } from '../../core/enums/user-role.enum';

type ScoreTooltipPos = {
    breakdown: ScoreBreakdown;
    top: number;
    left: number;
};

type TooltipPos = {
    name: string;
    category: TooltipCategory;
    top: number;
    left: number;
    /** false until the post-render measurement re-positions; keeps the
     *  tooltip invisible during the estimate→correct gap (no jump). */
    ready: boolean;
};

type StrainRow = ScoredStrain<Record<string, unknown>>;

type StrainHunterResponse = {
    items: Record<string, unknown>[];
    lastScrapedAt?: string | null;
};

type StrainHunterFilterField =
    | 'originStrain'
    | 'parent1'
    | 'parent2'
    | 'marketer'
    | 'manufacturer'
    | 'brand'
    | 'packageType'
    | 'countryOfOrigin'
    | 'terpenes'
    | 'isNew'
    | 'category'
    | 'family'
    | 'growType'
    | 'symbols';

type StrainHunterFilter = {
    key: string;
    fields: StrainHunterFilterField[];
    label: string;
    value: string;
    name: string;
};

const FILTER_STORAGE_KEY = 'strain-hunter-filters:v1';

type PersistedFilterState = {
    activeFilters: StrainHunterFilter[];
    priceRange: [number, number];
    activeSortField: string | null;
};

const FILTER_FIELD_NAMES: Record<string, string> = {
    originStrain: 'זן מקור',
    parent1: 'הורה 1',
    parent2: 'הורה 2',
    marketer: 'משווק',
    manufacturer: 'מגדל',
    brand: 'מותג',
    packageType: 'אריזה',
    countryOfOrigin: 'ארץ מקור',
    terpenes: 'טרפנים',
    isNew: 'חדש',
    category: 'קטגוריה',
    family: 'משפחה',
    growType: 'גידול',
    symbols: 'סמלים',
};

type TerpeneFilter = {
    name: string;
    label: string;
};

type ComparisonSort = {
    field: string;
    order: 1 | -1;
};

const TOOLTIP_W = 240;
const TOOLTIP_GAP = 8;
const TOOLTIP_DELAY_MS = 400;

type TerpeneTooltipPos = {
    name: string;
    top: number;
    left: number;
    openUp: boolean;
    /** false until the post-render measurement re-positions; keeps the
     *  tooltip invisible during the estimate→correct gap (no jump). */
    ready: boolean;
};

@Component({
    selector: 'app-strain-hunter',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        TableModule,
        InputTextModule,
        DialogModule,
        SliderModule,
        MatchingPreferencesDrawer,
        Tooltip,
        ScoreTooltip,
        TooltipDirective,
    ],
    templateUrl: './strain-hunter.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrls: ['./strain-hunter.css'],
})
export class StrainHunter implements OnInit {
    private http = inject(HttpClient);
    private matchingEngine = inject(MatchingEngineStore);
    private readonly terpeneStore = inject(TerpeneStore);
    private readonly geneticsStore = inject(GeneticsStore);
    private readonly authStore = inject(AuthStore);
    protected isAdmin = computed(() => this.authStore.userRole() === UserRole.Admin);
    private base = `${environment.apiUrl}/strain-hunter`;
    private table = viewChild<Table>('table');
    private compareTable = viewChild<Table>('compareTable');
    protected hostContainer = inject(ElementRef).nativeElement as HTMLElement;
    private readonly destroyRef = inject(DestroyRef);
    readonly showScrollTop = signal(false);
    private scrollContainer: HTMLElement | null = null;
    private requestSubscription: Subscription | null = null;
    private readonly numericSortColumns = new Set(['price', 'catalogPrice', 'matchScore']);
    private readonly textCollator = new Intl.Collator('he', { numeric: true, sensitivity: 'base' });
    private readonly tooltipWidth = 240;
    private readonly tooltipHeight = 140;
    private readonly tooltipGap = 8;

    protected readonly PageStates = PageStates;
    protected readonly columnLabels: Record<string, string> = {
        name: 'שם',
        matchScore: 'התאמה',
        characterization: 'אפיון',
        enName: 'שם באנגלית',
        isNew: 'חדש',
        rating: 'רייטינג',
        deal: 'מבצע',
        marketer: 'משווק',
        manufacturer: 'מגדל',
        brand: 'מותג',
        expiry: 'תוקף',
        price: 'מחיר',
        catalogPrice: 'מחיר קטלוג',
        parent1: 'הורה 1',
        parent2: 'הורה 2',
        originStrain: 'גנטיקה',
        countryOfOrigin: 'מקור',
        terpenes: 'טרפנים',
        packageType: 'אריזה',
        growType: 'גידול',
        thc: 'THC',
        cbd: 'CBD',
    };
    /** Stable reference for the default multi-sort — avoids the array-literal
        reset: each CD re-evaluates a literal into a new array, which PrimeNG's
        input-sync effect interprets as a "change" and resets the internal
        multiSortMeta, dropping user-added columns. */
    readonly initialSortMeta = [{ field: 'price', order: 1 }];
    private readonly preferredColumns = [
        'name',
        'matchScore',
        'characterization',
        'price',
        'originStrain',
        'marketer',
        'countryOfOrigin',
        'expiry',
        'packageType',
    ];
    private readonly embeddedColumns = [
        'id',
        'enName',
        'deal',
        'rating',
        'isNew',
        'catalogPrice',
        'terpenes',
        'parent1',
        'parent2',
        'manufacturer',
        'brand',
        'symbols',
        'imageUrl',
        'productUrl',
        'category',
        'family',
        'thc',
        'cbd',
        'score',
        'penalty',
        'penaltyIngredient',
        'breakdown',
        'batch',
        'growType',
        'lastScrapedAt',
    ];

    rawItems = signal<any[]>([]);
    loading = signal(true);
    refreshing = signal(false);
    error = signal<string | null>(null);
    selectedImageUrl = signal<string | null>(null);
    imageDialogVisible = signal(false);
    matchDrawerVisible = signal(false);
    /** Ids of strains picked for comparison (selection order, session-only). */
    compareIds = signal<(string | number)[]>([]);
    compareDialogVisible = signal(false);
    comparisonSort = signal<ComparisonSort | null>(null);
    readonly lastUpdated = signal<Date | null>(null);
    readonly tooltip = signal<TooltipPos | null>(null);
    readonly activeScoreTooltip = signal<ScoreTooltipPos | null>(null);
    private readonly tooltipTimeout = signal<ReturnType<typeof setTimeout> | null>(null);
    private readonly scoreTooltipTimeout = signal<ReturnType<typeof setTimeout> | null>(null);

    priceRange = signal<[number, number]>([0, 0]);
    priceBounds = signal<[number, number]>([0, 0]);
    filtersExpanded = signal(false);

    activeFilters = signal<StrainHunterFilter[]>([]);
    searchQuery = signal('');
    activeSortField = signal<string | null>(null);

    /** Previous single-click sort — lets the third click (asc → desc → reset) be detected. */
    private lastSort: { field: string; order: number } | null = null;

    /** Bumped on every sort interaction so the header re-renders and the custom
        sort badge re-reads the table's multiSortMeta. */
    readonly sortTick = signal(0);

    constructor() {
        this.hydrateFilters();

        effect(() => {
            const snapshot: PersistedFilterState = {
                activeFilters: this.activeFilters(),
                priceRange: this.priceRange(),
                activeSortField: this.activeSortField(),
            };

            try {
                localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(snapshot));
            } catch {
                // Storage unavailable
            }
        });
    }

    /** Fixed-position terpene tooltip state — null = hidden */
    readonly terpeneTooltip = signal<TerpeneTooltipPos | null>(null);

    /** Text of one searched column — symbols render as a comma-joined string. */
    private columnText(item: StrainRow, field: string): string {
        return (
            field === 'symbols'
                ? this.getSymbols(item.symbols)
                      .map((s) => s.alt)
                      .join(', ')
                : this.formatValue(item[field])
        ).trim();
    }

    items = computed<StrainRow[]>(() => {
        const raw = this.rawItems();
        const filters = this.activeFilters();
        const [priceMin, priceMax] = this.priceRange();
        const [boundsMin, boundsMax] = this.priceBounds();
        const hasPriceFilter = priceMin > boundsMin || priceMax < boundsMax;

        const filtered = raw.filter((item) => {
            if (hasPriceFilter) {
                const price = this.toNumber(this.formatValue(item.price));
                if (price === null || price < priceMin || price > priceMax) {
                    return false;
                }
            }

            // Token search across every searched column: all whitespace-separated
            // tokens must appear somewhere (order-free, dot/dash-insensitive).
            if (!matchesSearch(this.searchQuery(), ...this.searchColumns().map((field) => this.columnText(item, field)))) {
                return false;
            }

            if (filters.length === 0) return true;

            return filters.every((filter) => {
                const val = filter.value.toLowerCase().trim();
                return filter.fields.some((field) => {
                    const valueToCompare =
                        field === 'symbols'
                            ? this.getSymbols(item.symbols)
                                  .map((s) => s.alt)
                                  .join(', ')
                            : this.formatValue(item[field]);
                    return valueToCompare.trim().toLowerCase().includes(val);
                });
            });
        });

        return filtered.map((item) => this.matchingEngine.calculateScore(item));
    });

    pageState = computed<PageStates>(() => {
        if (this.loading()) {
            return PageStates.Loading;
        }
        if (this.error()) {
            return PageStates.Error;
        }
        // Empty results render inside the table (settings-style #emptymessage)
        // instead of replacing it with a page-level empty state.
        return PageStates.Ready;
    });

    columns = computed(() => {
        const knownAlways = ['name'];
        if (this.matchingEngine.hasAnyPreference()) {
            knownAlways.push('matchScore');
        }

        const keys = new Set<string>(knownAlways);
        this.rawItems().forEach((item) => {
            Object.keys(item).forEach((key) => {
                keys.add(key);
            });
        });

        const knownColumns = this.preferredColumns.filter((key) => {
            return key === 'matchScore' || keys.has(key);
        });
        const extraColumns = Array.from(keys).filter((key) => {
            return (
                !this.preferredColumns.includes(key) &&
                !this.embeddedColumns.includes(key) &&
                key !== 'id' &&
                key !== 'name'
            );
        });

        return [...knownColumns, ...extraColumns];
    });

    searchColumns = computed(() => {
        const columns = new Set([...this.columns(), ...this.embeddedColumns]);
        return Array.from(columns);
    });

    ngOnInit() {
        this.load(false);
    }

    ngAfterViewInit() {
        // The app scrolls the layout's .content-shell, an ancestor of this page.
        // Match by the declared overflow (not scrollHeight, which is 0 until the
        // async data fills the page) so we bind before content loads.
        let el = this.hostContainer.parentElement;
        while (el && !['auto', 'scroll'].includes(getComputedStyle(el).overflowY)) {
            el = el.parentElement;
        }
        this.scrollContainer = el;
        const onScroll = () => this.showScrollTop.set((this.scrollContainer?.scrollTop ?? 0) > 300);
        el?.addEventListener('scroll', onScroll, { passive: true });
        this.destroyRef.onDestroy(() => el?.removeEventListener('scroll', onScroll));
        onScroll();
    }

    scrollToTop(): void {
        this.scrollContainer?.scrollTo({ top: 0, behavior: 'smooth' });
    }

    load(forceRefresh = false) {
        this.requestSubscription?.unsubscribe();

        if (!forceRefresh) {
            this.loading.set(true);
            this.error.set(null);
        } else {
            this.refreshing.set(true);
        }

        const url = forceRefresh ? `${this.base}/fetch?forceRefresh=true` : `${this.base}/fetch`;

        this.requestSubscription = this.http
            .get<ServiceResultContainer<StrainHunterResponse>>(url)
            .pipe(timeout(90000))
            .subscribe({
                next: (response) => {
                    const items = response.result.items ?? [];
                    this.rawItems.set(items);
                    this.lastUpdated.set(
                        response.result.lastScrapedAt ? new Date(response.result.lastScrapedAt) : null,
                    );

                    let min = Infinity;
                    let max = -Infinity;
                    for (const item of items) {
                        const price = this.toNumber(this.formatValue(item['price']));
                        if (price !== null) {
                            if (price < min) min = price;
                            if (price > max) max = price;
                        }
                    }
                    const bounds: [number, number] = min === Infinity ? [0, 0] : [Math.floor(min), Math.ceil(max)];
                    this.priceBounds.set(bounds);

                    if (!this.priceRangeHydrated) {
                        this.priceRange.set([bounds[0], bounds[1]]);
                    } else {
                        const [rMin, rMax] = this.priceRange();
                        this.priceRange.set([Math.max(bounds[0], rMin), Math.min(bounds[1], rMax)]);
                    }

                    this.loading.set(false);
                    this.refreshing.set(false);
                },
                error: (error: unknown) => {
                    this.rawItems.set([]);
                    this.error.set(this.getErrorMessage(error));
                    this.loading.set(false);
                    this.refreshing.set(false);
                },
            });
    }

    refresh() {
        this.load(true);
    }

    onPriceRangeChange(event: any) {
        const values = event.values ?? event.value;
        if (Array.isArray(values) && values.length === 2) {
            this.priceRange.set([values[0], values[1]]);
        }
    }

    toggleFilters() {
        this.filtersExpanded.update((v) => !v);
    }

    isPriceFilterActive(): boolean {
        const [priceMin, priceMax] = this.priceRange();
        const [boundsMin, boundsMax] = this.priceBounds();
        return priceMin > boundsMin || priceMax < boundsMax;
    }

    toggleCompare(item: { id: string | number }) {
        this.compareIds.update((ids) =>
            ids.includes(item.id) ? ids.filter((id) => id !== item.id) : [...ids, item.id],
        );
    }

    isInCompare(id: unknown): boolean {
        return this.compareIds().includes(id as string | number);
    }

    clearComparison() {
        this.compareIds.set([]);
        this.comparisonSort.set(null);
        this.compareDialogVisible.set(false);
    }

    openCompareDialog() {
        this.compareDialogVisible.set(true);
    }

    /** Compared rows resolved from rawItems (not the filtered view) so later
     *  filter/search changes never drop selected strains; selection order kept.
     *  ponytail: linear lookup per id — fine at table scale. */
    compareItems = computed(() => {
        const raw = this.rawItems();
        return this.compareIds()
            .map((id) => raw.find((item) => item?.id === id))
            .filter((item) => item !== undefined)
            .map((item) => this.matchingEngine.calculateScore(item));
    });

    /** Dialog columns — exact duplicate of main table columns.
     *  Previously filtered out `name` and appended thc/cbd/deal/rating extras,
     *  which made the comparison row visually different. Now 1:1 with `columns()`. */
    comparisonColumns = computed(() => this.columns());

    /** Comparison-table sort — exact duplicate of `sortTable` contract
     *  (multiSortMeta chaining, 3-click reset), but restores to selection order. */
    sortCompareTable(event: SortEvent): void {
        this.sortTick.update((value) => value + 1);

        if (!event.data) {
            return;
        }

        // Single-column click — cycles asc → desc → reset.
        if (event.multiSortMeta?.length === 1) {
            const meta = event.multiSortMeta[0];
            const field = this.resolveSortField(meta.field);
            const order = meta.order ?? 1;

            if (order === 1 && this.comparisonSort()?.field === field && this.comparisonSort()?.order === -1) {
                this.comparisonSort.set(null);
                this.compareTable()?.reset();
                this.restoreCompareOrder(event.data);
                return;
            }

            this.comparisonSort.set({ field, order: order as 1 | -1 });
            event.data.sort((first, second) => {
                return this.compareSortValues(first?.[field], second?.[field], field) * order;
            });
            return;
        }

        // Multi-column sort (Ctrl/Cmd + click)
        if (event.multiSortMeta && event.multiSortMeta.length > 1) {
            const metas = event.multiSortMeta.map((meta) => ({
                field: this.resolveSortField(meta.field),
                order: meta.order ?? 1,
            }));
            this.comparisonSort.set({ field: metas[0].field, order: metas[0].order as 1 | -1 });
            event.data.sort((first, second) => {
                for (const meta of metas) {
                    const comparison = this.compareSortValues(first?.[meta.field], second?.[meta.field], meta.field);
                    if (comparison !== 0) {
                        return comparison * meta.order;
                    }
                }
                return 0;
            });
            return;
        }

        // Single-sort-mode fallback
        if (event.field && event.order) {
            const field = this.resolveSortField(event.field);
            const order = event.order;

            if (order === 1 && this.comparisonSort()?.field === field && this.comparisonSort()?.order === -1) {
                this.comparisonSort.set(null);
                this.compareTable()?.reset();
                this.restoreCompareOrder(event.data);
                return;
            }

            this.comparisonSort.set({ field, order: order as 1 | -1 });
            event.data.sort((first, second) => {
                return this.compareSortValues(first?.[field], second?.[field], field) * order;
            });
            return;
        }

        // Unsorted — restore selection order.
        this.comparisonSort.set(null);
        this.compareTable()?.reset();
        this.restoreCompareOrder(event.data);
    }

    /** customSort mutates the compareItems array in place, so a reset must
     *  re-sort it back to the compareIds selection order. */
    private restoreCompareOrder(data: any[]): void {
        const index = new Map(this.compareIds().map((id, i) => [id, i]));
        data.sort((first, second) => (index.get(first.id) ?? 0) - (index.get(second.id) ?? 0));
    }

    openMatchDrawer() {
        this.matchDrawerVisible.set(true);
    }

    closeMatchDrawer() {
        this.matchDrawerVisible.set(false);
    }

    ringCircumference = 2 * Math.PI * 18;

    ringDashOffset(score: number): number {
        return (1 - Math.max(0, Math.min(100, score)) / 100) * this.ringCircumference;
    }

    ringColorClass(score: number): string {
        if (score >= 75) return 'ring-success';
        if (score >= 50) return 'ring-primary';
        if (score >= 25) return 'ring-warning';
        return 'ring-danger';
    }

    applyDataFilter(fields: StrainHunterFilterField | StrainHunterFilterField[], value: unknown, label?: string) {
        const filterValue = this.formatValue(value);
        if (!filterValue) {
            return;
        }

        const filterLabel = label ?? filterValue;
        const filterFields = Array.isArray(fields) ? fields : [fields];
        const key = `${filterFields.join('|')}:${filterValue.toLowerCase()}`;

        this.activeFilters.update((prev) => {
            if (
                prev.some((filter) => {
                    return filter.key === key;
                })
            ) {
                return prev.filter((filter) => {
                    return filter.key !== key;
                });
            }

            return [
                ...prev,
                {
                    key,
                    fields: filterFields,
                    label: filterLabel,
                    value: filterValue,
                    name: FILTER_FIELD_NAMES[filterFields[0]] ?? filterFields[0],
                },
            ];
        });
        this.clearTooltip();
    }

    removeFilter(key: string) {
        this.activeFilters.update((prev) => {
            return prev.filter((filter) => {
                return filter.key !== key;
            });
        });
        this.clearTooltip();
    }

    clearAllFilters() {
        this.activeFilters.set([]);
        this.priceRange.set([this.priceBounds()[0], this.priceBounds()[1]]);
        this.activeSortField.set(null);
        this.filtersExpanded.set(false);
        this.clearTooltip();

        try {
            localStorage.removeItem(FILTER_STORAGE_KEY);
        } catch {
            // Storage unavailable
        }
    }

    resetPriceRange() {
        this.priceRange.set([this.priceBounds()[0], this.priceBounds()[1]]);
    }

    private priceRangeHydrated = false;

    private hydrateFilters(): void {
        try {
            const raw = localStorage.getItem(FILTER_STORAGE_KEY);
            if (!raw) return;

            const parsed = JSON.parse(raw) as Partial<PersistedFilterState>;

            if (Array.isArray(parsed.activeFilters)) {
                this.activeFilters.set(parsed.activeFilters);
            }

            if (Array.isArray(parsed.priceRange) && parsed.priceRange.length === 2) {
                this.priceRange.set(parsed.priceRange);
                this.priceRangeHydrated = true;
            }

            if (parsed.activeSortField !== undefined) {
                this.activeSortField.set(parsed.activeSortField);
            }
        } catch {
            // Storage unavailable
        }
    }

    private clearTooltip() {
        const timeout = this.tooltipTimeout();
        if (timeout) {
            clearTimeout(timeout);
            this.tooltipTimeout.set(null);
        }
        this.tooltip.set(null);
    }

    openImageDialog(imageUrl: string) {
        this.selectedImageUrl.set(imageUrl);
        this.imageDialogVisible.set(true);
    }

    closeImageDialog() {
        this.imageDialogVisible.set(false);
        this.selectedImageUrl.set(null);
    }

    onGeneticsEnter(name: string, event: MouseEvent) {
        const el = event.currentTarget as HTMLElement;
        const rect = el.getBoundingClientRect();
        // Same dynamic positioning as the terpene tooltip: open ABOVE when
        // there is room, otherwise BELOW — consistent behavior across both.
        const openUp = rect.top >= this.tooltipHeight + this.tooltipGap;
        const top = openUp ? rect.top - this.tooltipHeight - this.tooltipGap : rect.bottom + TOOLTIP_GAP;
        const chipCenter = rect.left + rect.width / 2;
        const left = Math.max(
            TOOLTIP_GAP,
            Math.min(chipCenter - TOOLTIP_W / 2, window.innerWidth - TOOLTIP_W - TOOLTIP_GAP),
        );

        const timeout = setTimeout(() => {
            this.tooltip.set({ name, category: 'genetics', top, left, ready: false });
            this.tooltipTimeout.set(null);
            this.correctTooltipOverlap(rect, 'tooltip');
        }, TOOLTIP_DELAY_MS);
        this.tooltipTimeout.set(timeout);
    }

    /**
     * The tooltip height is estimated (tooltipHeight) but real content can be
     * taller — an "open above" tooltip would then cover its own source button.
     * After render, measure the actual height and re-position with the real
     * height: ABOVE the button when there is room, otherwise BELOW. Runs one
     * frame after the signal is set (imperceptible — same frame as the open).
     */
    private correctTooltipOverlap(btnRect: DOMRect, which: 'tooltip' | 'terpeneTooltip') {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                // Only one tooltip is rendered at a time — the genetics one (plain
                // app-tooltip inside @if (tooltip())) or the terpene one (class
                // tooltip-fixed at the page root). Measure whichever is visible.
                const candidates = Array.from(document.querySelectorAll<HTMLElement>('app-tooltip'));
                const el =
                    which === 'tooltip'
                        ? candidates.find((e) => !e.classList.contains('tooltip-fixed'))
                        : candidates.find((e) => e.classList.contains('tooltip-fixed'));
                if (!el) return;
                const tipHeight = el.getBoundingClientRect().height;
                const gap = which === 'tooltip' ? TOOLTIP_GAP : this.tooltipGap;
                const top =
                    btnRect.top >= tipHeight + gap
                        ? btnRect.top - tipHeight - gap // real room above — open there
                        : btnRect.bottom + gap; // otherwise below
                if (which === 'tooltip') {
                    const cur = this.tooltip();
                    if (cur) this.tooltip.set({ ...cur, top, ready: true });
                } else {
                    const cur = this.terpeneTooltip();
                    if (cur) this.terpeneTooltip.set({ ...cur, top, ready: true });
                }
            });
        });
    }

    onTooltipLeave() {
        this.clearTooltip();
    }

    onScoreRingEnter(breakdown: ScoreBreakdown, event: MouseEvent) {
        const el = event.currentTarget as HTMLElement;
        const rect = el.getBoundingClientRect();

        const top = rect.bottom + TOOLTIP_GAP;
        const targetWidth = 260; // Approx score tooltip max width from layout
        const chipCenter = rect.left + rect.width / 2;
        const left = Math.max(
            TOOLTIP_GAP,
            Math.min(chipCenter - targetWidth / 2, window.innerWidth - targetWidth - TOOLTIP_GAP),
        );

        const timeout = setTimeout(() => {
            this.activeScoreTooltip.set({ breakdown, top, left });
            this.scoreTooltipTimeout.set(null);
        }, TOOLTIP_DELAY_MS);
        this.scoreTooltipTimeout.set(timeout);
    }

    onScoreRingLeave() {
        const timeout = this.scoreTooltipTimeout();
        if (timeout) {
            clearTimeout(timeout);
            this.scoreTooltipTimeout.set(null);
        }
        this.activeScoreTooltip.set(null);
    }

    applyGlobalFilter(event: Event) {
        this.searchQuery.set((event.target as HTMLInputElement).value);
    }

    sortTable(event: SortEvent): void {
        this.sortTick.update((value) => value + 1);

        if (!event.data) {
            return;
        }

        // Single-column click — cycles asc (1) → desc (-1) → reset. PrimeNG 22
        // has no built-in sort removal in multiple mode, so the reset is manual.
        if (event.multiSortMeta?.length === 1) {
            const meta = event.multiSortMeta[0];
            const field = this.resolveSortField(meta.field);
            const order = meta.order ?? 1;

            if (order === 1 && this.lastSort?.field === field && this.lastSort.order === -1) {
                this.resetSort(event.data);
                return;
            }

            this.lastSort = { field, order };
            this.activeSortField.set(field);

            event.data.sort((first, second) => {
                return this.compareSortValues(first?.[field], second?.[field], field) * order;
            });
            return;
        }

        // Multi-column sort (Ctrl/Cmd + click) — chained comparisons, one per column.
        if (event.multiSortMeta && event.multiSortMeta.length > 1) {
            this.lastSort = null;

            const metas = event.multiSortMeta.map((meta) => ({
                field: this.resolveSortField(meta.field),
                order: meta.order ?? 1,
            }));

            this.activeSortField.set(metas[0]?.field ?? null);

            event.data.sort((first, second) => {
                for (const meta of metas) {
                    const comparison = this.compareSortValues(first?.[meta.field], second?.[meta.field], meta.field);
                    if (comparison !== 0) {
                        return comparison * meta.order;
                    }
                }
                return 0;
            });
            return;
        }

        // Single-sort-mode fallback (plain click).
        if (event.field && event.order) {
            const field = this.resolveSortField(event.field);
            const order = event.order;
            this.lastSort = { field, order };
            this.activeSortField.set(field);

            event.data.sort((first, second) => {
                return this.compareSortValues(first?.[field], second?.[field], field) * order;
            });
            return;
        }

        // Unsorted (sort removed) — restore the original backend order.
        this.resetSort(event.data);
    }

    private resetSort(data: any[]): void {
        this.lastSort = null;
        this.activeSortField.set(null);
        this.table()?.reset();
        const rawIndex = new Map(this.rawItems().map((item, index) => [item.id, index]));
        data.sort((first, second) => (rawIndex.get(first.id) ?? 0) - (rawIndex.get(second.id) ?? 0));
    }

    columnLabel(column: string): string {
        return this.columnLabels[column] ?? column;
    }

    formatValue(value: unknown): string {
        if (value === null || value === undefined || value === '') {
            return '';
        }
        if (typeof value === 'boolean') {
            return value ? 'כן' : 'לא';
        }
        if (value instanceof Date) {
            return value.toLocaleString();
        }
        if (typeof value === 'object') {
            return JSON.stringify(value);
        }
        return String(value);
    }

    relativeTime(date: Date | null): string {
        if (!date) return '';
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMin = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffHours < 1) {
            return `${diffMin} דקות`;
        }
        if (diffHours < 24) {
            return diffHours === 1 ? 'שעה' : `${diffHours} שעות`;
        }
        if (diffDays === 1) {
            return 'אתמול';
        }
        if (diffDays === 2) {
            return 'שלשום';
        }
        if (diffDays <= 5) {
            return `${diffDays} ימים`;
        }
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    }

    hasDisplayValue(value: unknown): boolean {
        return this.formatValue(value) !== '';
    }

    packageTypeIconClass(value: unknown): string {
        const packageType = this.formatValue(value);
        if (packageType.includes('צנצנת')) {
            return 'ph-jar-label';
        }
        if (packageType.includes('שקית')) {
            return 'ph-bag-simple';
        }
        return 'ph-question-mark';
    }

    growTypeIconClass(value: unknown): string {
        const growType = this.formatValue(value).toLowerCase();
        if (growType.includes('אינדור')) {
            return 'ph-house';
        }
        if (growType.includes('חממה')) {
            return 'ph-sun';
        }
        if (growType.includes('משולב')) {
            return 'ph-tree';
        }
        return 'ph-question-mark';
    }

    splitTerpenes(value: unknown): TerpeneFilter[] {
        const terpenes = this.formatValue(value);
        if (!terpenes || terpenes === 'לא ידוע') {
            return [];
        }

        return terpenes
            .split(',')
            .map((terpene) => {
                return this.toTerpeneFilter(terpene);
            })
            .filter((terpene): terpene is TerpeneFilter => {
                return terpene !== null;
            });
    }

    /**
     * Show the terpene-tooltip popover above (or below) a terpene-node button.
     * Lazy-loads the catalog on first hover so the table can be used without ever
     * opening the matching-preferences drawer.
     *
     * @param name Hebrew terpene name (without trailing percentage).
     * @param event MouseEvent whose currentTarget is the hovered button.
     */
    onTerpeneHover(name: string, event: MouseEvent): void {
        if (!name) {
            return;
        }
        this.terpeneStore.reload();

        const el = event.currentTarget as HTMLElement;
        const rect = el.getBoundingClientRect();

        const openUp = rect.top >= this.tooltipHeight + this.tooltipGap;
        const top = openUp ? rect.top - this.tooltipHeight - this.tooltipGap : rect.bottom + this.tooltipGap;

        const chipCenter = rect.left + rect.width / 2;
        const left = Math.max(
            this.tooltipGap,
            Math.min(chipCenter - this.tooltipWidth / 2, window.innerWidth - this.tooltipWidth - this.tooltipGap),
        );

        this.terpeneTooltip.set({ name, top, left, openUp, ready: false });
        this.correctTooltipOverlap(rect, 'terpeneTooltip');
    }

    /** Hide the terpene-tooltip popover. */
    onTerpeneLeave(): void {
        this.terpeneTooltip.set(null);
    }

    countryFlagUrl(value: unknown): string {
        const country = this.formatValue(value);
        const flags: Record<string, string> = {
            ישראל: 'il',
            קנדה: 'ca',
            פורטוגל: 'pt',
            אורוגוואי: 'uy',
            אוגנדה: 'ug',
            ספרד: 'es',
            גרמניה: 'de',
            מרוקו: 'ma',
            דנמרק: 'dk',
            הולנד: 'nl',
        };

        const code = flags[country];
        return code ? `/flags/${code}.svg` : '';
    }

    getSymbols(symbols: unknown): { url: string; alt: string }[] {
        let parsedSymbols = symbols;

        if (typeof symbols === 'string') {
            try {
                parsedSymbols = JSON.parse(symbols);
            } catch {
                return [];
            }
        }

        if (!Array.isArray(parsedSymbols)) {
            return [];
        }

        return parsedSymbols
            .map((sym) => {
                if (!sym || typeof sym !== 'object') {
                    return undefined;
                }

                const rawUrl = typeof sym.url === 'string' ? sym.url : '';
                const alt = typeof sym.alt === 'string' ? sym.alt : '';

                if (!rawUrl) {
                    return undefined;
                }

                const lowerUrl = rawUrl.toLowerCase();
                let finalUrl = rawUrl;

                if (lowerUrl.includes('pest-free')) {
                    finalUrl = 'assets/images/pest-free.png';
                } else if (lowerUrl.includes('beta-radiation')) {
                    finalUrl = 'assets/images/beta-radiation.png';
                }

                return { url: finalUrl, alt };
            })
            .filter((sym): sym is { url: string; alt: string } => {
                return sym !== undefined;
            });
    }

    formatFamilyHebrew(family: string): string {
        const lower = family.toLowerCase();
        if (lower.includes('indica')) {
            return 'אינדיקה';
        }
        if (lower.includes('sativa')) {
            return 'סאטיבה';
        }
        if (lower.includes('hybrid') || lower.includes('היבריד') || lower.includes('הייבריד')) {
            return 'היבריד';
        }
        return family;
    }

    getFamilyClass(family: string): string {
        const lower = family.toLowerCase();
        if (lower.includes('indica')) {
            return 'family-indica';
        }
        if (lower.includes('sativa')) {
            return 'family-sativa';
        }
        if (lower.includes('hybrid')) {
            return 'family-hybrid';
        }
        return '';
    }

    isSortingByScore(): boolean {
        return this.activeSortField() === 'score';
    }

    isGeneticsLiked(name: string): boolean {
        const state = this.matchingEngine.prefState(`genetics:${name.trim()}`);
        return state === 'like' || state === 'love';
    }

    isTerpeneLiked(name: string): boolean {
        const state = this.matchingEngine.prefState(`terpene:${name}`);
        return state === 'like' || state === 'love';
    }

    geneticsClass(name: string): string {
        return this.isSortingByScore() && this.isGeneticsLiked(name) ? 'filter-node liked' : 'filter-node';
    }

    terpeneClass(name: string): string {
        return this.isSortingByScore() && this.isTerpeneLiked(name)
            ? 'terpene-node filter-node liked'
            : 'terpene-node filter-node';
    }

    private toTerpeneFilter(value: string): TerpeneFilter | null {
        const label = value.trim();
        if (!label) {
            return null;
        }

        const name = label
            .replace(/\s*\(?\d+(?:[.,]\d+)?\s*%\)?\s*$/u, '')
            .replace(/\s*\(?%\s*\d+(?:[.,]\d+)?\)?\s*$/u, '')
            .trim();

        return { label, name: name || label };
    }

    private compareSortValues(first: unknown, second: unknown, field: string): number {
        const firstValue = this.sortValue(first, field);
        const secondValue = this.sortValue(second, field);

        if (firstValue === null && secondValue === null) {
            return 0;
        }
        if (firstValue === null) {
            return 1;
        }
        if (secondValue === null) {
            return -1;
        }

        if (typeof firstValue === 'number' && typeof secondValue === 'number') {
            return firstValue - secondValue;
        }

        return this.textCollator.compare(String(firstValue), String(secondValue));
    }

    private sortValue(value: unknown, field: string): number | string | null {
        const formattedValue = this.formatValue(value);
        if (!formattedValue) {
            return null;
        }

        if (field === 'expiry') {
            // MM/YY compares chronologically — "02/27" < "01/28", while the
            // string order ("01/28" < "02/27") is wrong.
            const [mm, yy] = formattedValue.split('/').map(Number);
            if (Number.isFinite(mm) && Number.isFinite(yy)) {
                return (2000 + yy) * 100 + mm;
            }
        }

        if (this.numericSortColumns.has(field)) {
            return this.toNumber(formattedValue);
        }

        return formattedValue;
    }

    private resolveSortField(columnField: string): string {
        return columnField === 'matchScore' ? 'score' : columnField;
    }

    /** Returns the 1-based sort index for a column, or null if not multi-sorted.
        Tracks sortTick so the header re-renders after every sort interaction
        (PrimeNG 22.0.0's own SortIcon skips the badge for the initial column
        because its sortOrder signal doesn't change when a new column is added). */
    getSortOrderIndex(column: string): number | null {
        this.sortTick();
        const metas = this.table()?.multiSortMeta;
        if (!metas || metas.length <= 1) {
            return null;
        }
        const index = metas.findIndex((meta) => meta.field === column);
        return index !== -1 ? index + 1 : null;
    }

    private toNumber(value: string): number | null {
        const normalized = value.replace(/[^\d.,-]/g, '').replace(',', '.');
        const numberValue = Number(normalized);

        return Number.isFinite(numberValue) ? numberValue : null;
    }

    private getErrorMessage(error: unknown): string {
        if (!(error instanceof HttpErrorResponse)) {
            return 'טעינת נתוני הזנים נמשכת יותר מדי זמן. נסה שוב בעוד רגע.';
        }

        const serverMessage =
            typeof error.error?.message === 'string'
                ? error.error.message
                : typeof error.error === 'string'
                  ? error.error
                  : '';

        return serverMessage || 'טעינת נתוני הזנים נכשלה.';
    }
}
