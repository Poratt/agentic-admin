import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DrawerModule } from 'primeng/drawer';
import { MatchingEngineStore, ScoredStrain } from '../../../core/store/matching-engine.store';
import { TerpeneStore } from '../../../core/store/terpene.store';
import { GeneticsStore } from '../../../core/store/genetics.store';
import { Tooltip, TooltipCategory } from '../../../components/shared/tooltip/tooltip';
import { TooltipDirective } from '../../../core/directives/tooltip.directive';
import { filterBySearch } from '../../../core/utils/text-search';

type PreviewItem = {
    name: string;
    score: number;
    penalty: boolean;
    penaltyIngredient: string | null;
};

type CategoryGroup = {
    category: 'terpene' | 'genetics';
    title: string;
    items: string[];
};

type TooltipPos = {
    name: string;
    category: TooltipCategory;
    top: number;
    left: number;
};

const TOOLTIP_W = 240;
const GAP = 8;

@Component({
    selector: 'app-matching-preferences-drawer',
    standalone: true,
    imports: [CommonModule, FormsModule, DrawerModule, Tooltip, TooltipDirective],
    templateUrl: './matching-preferences-drawer.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrls: ['./matching-preferences-drawer.css'],
})
export class MatchingPreferencesDrawer {
    private readonly engine = inject(MatchingEngineStore);
    private readonly terpeneStore = inject(TerpeneStore);
    private readonly geneticsStore = inject(GeneticsStore);

    readonly visible = model<boolean>(false);
    readonly items = input<Record<string, unknown>[]>([]);
    readonly geneticsFilter = signal('');

    /** Fixed-position tooltip state — null = hidden */
    readonly tooltip = signal<TooltipPos | null>(null);

    readonly categories = computed<CategoryGroup[]>(() => {
        const items = this.items();
        const geneticsItems = this.collectGenetics(items);
        const filteredGenetics = filterBySearch(geneticsItems, this.geneticsFilter(), (name) => name);

        return [
            { category: 'terpene', title: 'טרפנים', items: this.collectTerpenes(items) },
            { category: 'genetics', title: 'גנטיקה', items: filteredGenetics },
        ];
    });

    readonly hasGenetics = computed(() => this.collectGenetics(this.items()).length > 0);

    readonly preview = computed<PreviewItem[]>(() => {
        const top = this.engine.topScored(this.items(), 5);
        return top.map((item) => this.toPreview(item));
    });

    readonly hasPreview = computed(() => this.preview().length > 0);
    readonly hasPreferences = this.engine.hasAnyPreference;
    readonly weights = this.engine.weights;
    readonly crossfaderValue = computed(() => 100 - this.weights().terpene);

    /**
     * Thumb color: fuchsia (terpene / left) → cyan (genetics / right).
     *
     * Pre-interpolated in sRGB rather than via `color-mix()` so the value
     * reaches `::-webkit-slider-thumb` as a plain color — nested `var()` inside
     * `color-mix()` does not reliably resolve through the UA shadow tree and
     * left the thumb stuck on the fallback. Brand colors are read from the live
     * computed style so theme switches still apply.
     */
    readonly thumbColor = computed(() => {
        const t = this.crossfaderValue();
        const root = getComputedStyle(document.documentElement);
        const secondary = root.getPropertyValue('--color-secondary').trim();
        const primary = root.getPropertyValue('--color-primary').trim();
        return this.mixHex(secondary, primary, t / 100);
    });

    private mixHex(fromHex: string, toHex: string, t: number): string {
        const [r1, g1, b1] = this.parseHex(fromHex);
        const [r2, g2, b2] = this.parseHex(toHex);
        return `rgb(${Math.round(r1 + (r2 - r1) * t)}, ${Math.round(g1 + (g2 - g1) * t)}, ${Math.round(b1 + (b2 - b1) * t)})`;
    }

    private parseHex(hex: string): [number, number, number] {
        const h = hex.replace('#', '');
        return [
            parseInt(h.slice(0, 2), 16),
            parseInt(h.slice(2, 4), 16),
            parseInt(h.slice(4, 6), 16),
        ];
    }

    readonly PrefState = { Neutral: 'neutral', Like: 'like', Love: 'love', Avoid: 'avoid' } as const;

    constructor() {
        effect(() => {
            if (this.visible()) {

            }
        });
    }

    chipClass(category: 'terpene' | 'genetics', name: string): string {
        const state = this.engine.prefState(`${category}:${name}`);
        return `chip chip-${state}`;
    }

    groupIcon(category: 'terpene' | 'genetics'): string {
        return category === 'genetics' ? 'ph-dna' : 'ph-leaf';
    }

    chipLabel(category: 'terpene' | 'genetics', name: string): string {
        const state = this.engine.prefState(`${category}:${name}`);
        switch (state) {
            case 'love': return 'ph-heart ph-fill';
            case 'like': return 'ph-bookmark-simple ph-fill';
            case 'avoid': return 'ph-prohibit';
            default: return '';
        }
    }

    cycle(category: 'terpene' | 'genetics', name: string): void {
        this.engine.cyclePref(`${category}:${name}`);
    }

    onChipEnter(category: 'terpene' | 'genetics', name: string, event: MouseEvent): void {
        const el = event.currentTarget as HTMLElement;
        const rect = el.getBoundingClientRect();

        // Try below first; if not enough space, flip above
        let top = rect.bottom + GAP;
        const TOOLTIP_H = 200; // approximate height
        if (top + TOOLTIP_H > window.innerHeight) {
            top = rect.top - TOOLTIP_H - GAP;
        }
        top = Math.max(GAP, top);

        // Horizontal: center on chip, clamp inside viewport
        const chipCenter = rect.left + rect.width / 2;
        const left = Math.max(GAP, Math.min(chipCenter - TOOLTIP_W / 2, window.innerWidth - TOOLTIP_W - GAP));

        this.tooltip.set({ name, category, top, left });
    }

    onChipLeave(): void {
        this.tooltip.set(null);
    }

    onWeightChange(category: 'terpene' | 'genetics', event: Event): void {
        const raw = Number((event.target as HTMLInputElement).value);
        this.engine.setWeight(category, 100 - raw);
    }

    onGeneticsSearch(event: Event): void {
        this.geneticsFilter.set((event.target as HTMLInputElement).value);
    }

    clearGeneticsSearch(): void {
        this.geneticsFilter.set('');
    }

    categoryPreferenceCount(category: 'terpene' | 'genetics'): number {
        const prefix = `${category}:`;
        const prefs = this.engine.prefs();
        let count = 0;
        for (const key of Object.keys(prefs)) {
            if (key.startsWith(prefix)) count += 1;
        }
        return count;
    }

    hasCategoryPreferences(category: 'terpene' | 'genetics'): boolean {
        return this.categoryPreferenceCount(category) > 0;
    }

    resetCategory(category: 'terpene' | 'genetics'): void {
        const prefix = `${category}:`;
        for (const [key, state] of Object.entries(this.engine.prefs())) {
            if (key.startsWith(prefix) && state !== 'neutral') {
                this.engine.setPref(key, 'neutral');
            }
        }
    }

    reset(): void {
        this.engine.reset();
        this.geneticsFilter.set('');
    }

    private collectTerpenes(items: Record<string, unknown>[]): string[] {
        const set = new Set<string>();
        for (const item of items) {
            const raw = item['terpenes'];
            if (typeof raw !== 'string' || !raw || raw === 'לא ידוע') continue;
            for (const part of raw.split(',')) {
                const trimmed = part
                    .replace(/\s*\(?\d+(?:[.,]\d+)?\s*%\)?\s*$/u, '')
                    .replace(/\s*\(?%\s*\d+(?:[.,]\d+)?\)?\s*$/u, '')
                    .trim();
                if (trimmed) set.add(trimmed);
            }
        }
        return [...set].sort((a, b) => a.localeCompare(b, 'he'));
    }

    private collectGenetics(items: Record<string, unknown>[]): string[] {
        const set = new Set<string>();
        for (const item of items) {
            for (const key of ['originStrain', 'parent1', 'parent2']) {
                const value = item[key];
                if (typeof value !== 'string') continue;
                const trimmed = value.trim();
                if (!trimmed) continue;
                set.add(trimmed);
            }
        }
        return [...set].sort((a, b) => a.localeCompare(b, 'he'));
    }

    private toPreview(item: ScoredStrain): PreviewItem {
        return {
            name: this.formatName(item['name']),
            score: item.score,
            penalty: item.penalty,
            penaltyIngredient: item.penaltyIngredient,
        };
    }

    private formatName(value: unknown): string {
        return typeof value === 'string' && value.trim().length > 0 ? value.trim() : 'ללא שם';
    }
}