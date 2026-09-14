import { Component, ChangeDetectionStrategy, Injector, inject, OnInit, OnDestroy, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { TableModule } from 'primeng/table';
import { Tabs, TabList, Tab, TabPanels, TabPanel } from 'primeng/tabs';
import { ToastModule } from 'primeng/toast';
import { ConfirmationService, MessageService } from 'primeng/api';
import { firstValueFrom } from 'rxjs';
import { GeneticsStore } from '../../../core/store/genetics.store';
import { TerpeneStore } from '../../../core/store/terpene.store';
import { GeneticsService } from '../../../core/services/genetics.service';
import { TerpeneService } from '../../../core/services/terpene.service';
import { IGenetics } from '../../../core/models/genetics.interface';
import { ITerpene } from '../../../core/models/terpene.interface';
import { confirmationDialogSettings } from '../../../core/config/confirmation-dialog-settings';
import { TooltipDirective } from '../../../core/directives/tooltip.directive';
import { AuthStore } from '../../../core/store/auth.store';
import { UserRole } from '../../../core/enums/user-role.enum';

@Component({
    selector: 'app-strain-hunter-settings',
    standalone: true,
    imports: [CommonModule, FormsModule, InputTextModule, TableModule, Tabs, TabList, Tab, TabPanels, TabPanel, ToastModule, TooltipDirective],
    templateUrl: './strain-hunter-settings.html',
    styleUrls: ['./strain-hunter-settings.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
})
export class StrainHunterSettings implements OnInit, OnDestroy {
    private readonly geneticsStore = inject(GeneticsStore);
    private readonly injector = inject(Injector);
    private readonly geneticsService = inject(GeneticsService);
    private readonly terpeneService = inject(TerpeneService);
    private readonly confirmService = inject(ConfirmationService);
    private readonly messageService = inject(MessageService);
    private readonly authStore = inject(AuthStore);
    private readonly router = inject(Router);
    private readonly route = inject(ActivatedRoute);
    protected isAdmin = computed(() => this.authStore.userRole() === UserRole.Admin);
    private readonly mql = window.matchMedia('(max-width: 1599px)');
    private readonly mqlHandler = () => this.isCompact.set(this.mql.matches);

    /** TerpeneStore is resolved lazily: httpResource fires the GET as soon as the store is created,
     *  so a normal injection would load /terpenes already when the genetics tab opens.
     *  The store is created only on first access — that is, when the terpenes tab opens for the first time. */
    private terpeneStoreInstance: TerpeneStore | null = null;
    private getTerpeneStore(): TerpeneStore {
        return (this.terpeneStoreInstance ??= this.injector.get(TerpeneStore));
    }

    geneticsFilter = signal('');
    terpeneFilter = signal('');

    /** URL slugs for the genetics/terpenes tabs, in tab order. */
    private static readonly SECTION_SLUGS = ['genetics', 'terpenes'] as const;

    /** Active section — the single funnel for clicks; the URL is written alongside. */
    activeSection = signal('0');

    private querySection = toSignal(this.route.queryParamMap.pipe(map((params) => params.get('section'))));

    private syncSectionFromRoute = effect(() => {
        const index = StrainHunterSettings.SECTION_SLUGS.indexOf(
            this.querySection() as (typeof StrainHunterSettings.SECTION_SLUGS)[number],
        );
        const value = index === -1 ? '0' : String(index);
        if (value !== this.activeSection()) this.activeSection.set(value);
    });

    setActiveSection(value: string | number | undefined) {
        const normalized = typeof value === 'number' ? String(value) : value;
        if (typeof normalized !== 'string') return;
        const index = Number(normalized);
        if (!Number.isInteger(index) || index < 0 || index >= StrainHunterSettings.SECTION_SLUGS.length) return;
        this.activeSection.set(normalized);
        void this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { section: StrainHunterSettings.SECTION_SLUGS[index] },
            queryParamsHandling: 'merge',
            replaceUrl: true,
        });
    }
    expandedGenetics = signal<Set<number>>(new Set());
    expandedTerpenes = signal<Set<number>>(new Set());
    enrichedGenetics = signal<Map<number, IGenetics>>(new Map());
    enrichedTerpenes = signal<Map<number, ITerpene>>(new Map());
    enrichingIds = signal<Set<string>>(new Set());
    bulkEnriching = signal<'genetics' | 'terpenes' | null>(null);
    bulkResult = signal<{ total: number; enriched: number; errors: number } | null>(null);
    isCompact = signal(false);
    /** Placeholder rows (page size = 20) — keep the table height during the first load to prevent CLS.
     *  never[] is assignable to any row type (genetics/terpene) — the content is not read while the table is loading. */
    tableSkeletonRows: never[] = Array.from({ length: 20 }, () => null as never);
    geneticsLoading = computed(() => this.geneticsStore.loading());
    terpeneLoading = computed(() => this.getTerpeneStore().loading());

    filteredGenetics = computed<IGenetics[]>(() => {
        const q = this.geneticsFilter().toLowerCase();
        const items = this.geneticsStore.genetics();
        if (!q) return items;
        return items.filter(g =>
            g.name.toLowerCase().includes(q) ||
            g.origin?.toLowerCase().includes(q) ||
            g.type?.toLowerCase().includes(q) ||
            g.parent1?.toLowerCase().includes(q) ||
            g.parent2?.toLowerCase().includes(q)
        );
    });

    filteredTerpenes = computed<ITerpene[]>(() => {
        const q = this.terpeneFilter().toLowerCase();
        const items = this.getTerpeneStore().terpenes();
        if (!q) return items;
        return items.filter(t =>
            t.name.toLowerCase().includes(q) ||
            t.scent?.toLowerCase().includes(q) ||
            t.effects?.some(e => e.toLowerCase().includes(q))
        );
    });

    ngOnInit(): void {
        this.isCompact.set(this.mql.matches);
        this.mql.addEventListener('change', this.mqlHandler);
    }

    ngOnDestroy(): void {
        this.mql.removeEventListener('change', this.mqlHandler);
    }

    isGeneticsExpanded(id: number): boolean {
        return this.isCompact() || this.expandedGenetics().has(id);
    }

    isTerpeneExpanded(id: number): boolean {
        return this.isCompact() || this.expandedTerpenes().has(id);
    }

    toggleGenetics(id: number): void {
        this.expandedGenetics.update(set => {
            const next = new Set(set);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }

    toggleTerpene(id: number): void {
        this.expandedTerpenes.update(set => {
            const next = new Set(set);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }

    isEnriching(key: string): boolean {
        return this.enrichingIds().has(key);
    }

    getEnrichedGenetics(id: number): IGenetics | undefined {
        return this.enrichedGenetics().get(id);
    }

    hasEnrichedGenetics(id: number): boolean {
        return this.enrichedGenetics().has(id);
    }

    getEnrichedTerpene(id: number): ITerpene | undefined {
        return this.enrichedTerpenes().get(id);
    }

    hasEnrichedTerpene(id: number): boolean {
        return this.enrichedTerpenes().has(id);
    }

    onGeneticsFilter(value: string): void {
        this.geneticsFilter.set(value);
    }

    onTerpeneFilter(value: string): void {
        this.terpeneFilter.set(value);
    }

    clearGeneticsFilter(): void {
        this.geneticsFilter.set('');
    }

    clearTerpeneFilter(): void {
        this.terpeneFilter.set('');
    }

    getThemeColor(item: { colorDark: string; colorLight: string }): string {
        return item.colorDark;
    }

    saveEnrichedGenetics(g: IGenetics): void {
        const enriched = this.getEnrichedGenetics(g.id);
        if (!enriched) return;
        this.geneticsStore.update(g.name, {
            description: enriched.description,
            parent1: enriched.parent1,
            parent2: enriched.parent2,
            origin: enriched.origin,
            type: enriched.type,
            thcRange: enriched.thcRange,
            terpenes: enriched.terpenes,
            effects: enriched.effects,
            color: enriched.color,
            colorDark: enriched.colorDark,
            colorLight: enriched.colorLight,
        });
        this.enrichedGenetics.update(map => {
            const next = new Map(map);
            next.delete(g.id);
            return next;
        });
    }

    saveEnrichedTerpene(t: ITerpene): void {
        const enriched = this.getEnrichedTerpene(t.id);
        if (!enriched) return;
        this.getTerpeneStore().update(t.name, {
            description: enriched.description,
            scent: enriched.scent,
            effects: enriched.effects,
            color: enriched.color,
            colorDark: enriched.colorDark,
            colorLight: enriched.colorLight,
        });
        this.enrichedTerpenes.update(map => {
            const next = new Map(map);
            next.delete(t.id);
            return next;
        });
    }

    discardEnrichedGenetics(id: number): void {
        this.enrichedGenetics.update(map => {
            const next = new Map(map);
            next.delete(id);
            return next;
        });
    }

    discardEnrichedTerpene(id: number): void {
        this.enrichedTerpenes.update(map => {
            const next = new Map(map);
            next.delete(id);
            return next;
        });
    }

    async regenerateGenetics(g: IGenetics): Promise<void> {
        const key = `g-${g.id}`;
        if (this.isEnriching(key)) return;

        this.enrichingIds.update(set => new Set(set).add(key));
        try {
            const result = await this.geneticsStore.enrich(g.name);
            if (result) {
                this.enrichedGenetics.update(map => {
                    const next = new Map(map);
                    next.set(g.id, result);
                    return next;
                });
            }
        } catch {
            // Error handled by store
        } finally {
            this.enrichingIds.update(set => {
                const next = new Set(set);
                next.delete(key);
                return next;
            });
        }
    }

    async regenerateTerpene(t: ITerpene): Promise<void> {
        const key = `t-${t.id}`;
        if (this.isEnriching(key)) return;

        this.enrichingIds.update(set => new Set(set).add(key));
        try {
            const result = await this.getTerpeneStore().enrich(t.name);
            if (result) {
                this.enrichedTerpenes.update(map => {
                    const next = new Map(map);
                    next.set(t.id, result);
                    return next;
                });
            }
        } catch {
            // Error handled by store
        } finally {
            this.enrichingIds.update(set => {
                const next = new Set(set);
                next.delete(key);
                return next;
            });
        }
    }

    onRowRegenerate(t: ITerpene): void {
        if (!this.isTerpeneExpanded(t.id)) {
            this.toggleTerpene(t.id);
        }
        this.regenerateTerpene(t);
    }

    onRowRegenerateGenetics(g: IGenetics): void {
        if (!this.isGeneticsExpanded(g.id)) {
            this.toggleGenetics(g.id);
        }
        this.regenerateGenetics(g);
    }

    async bulkEnrichGenetics(): Promise<void> {
        if (this.bulkEnriching()) return;
        this.bulkEnriching.set('genetics');
        this.bulkResult.set(null);
        try {
            const result = await firstValueFrom(this.geneticsService.enrichMissing());
            if (result.success && result.result) {
                this.bulkResult.set(result.result);
                this.geneticsStore.reload();
            }
        } catch {
            // Error handled by store
        } finally {
            this.bulkEnriching.set(null);
        }
    }

    async bulkEnrichTerpenes(): Promise<void> {
        if (this.bulkEnriching()) return;
        this.bulkEnriching.set('terpenes');
        this.bulkResult.set(null);
        try {
            const result = await firstValueFrom(this.terpeneService.enrichMissing());
            if (result.success && result.result) {
                this.bulkResult.set(result.result);
                this.getTerpeneStore().reload();
            }
        } catch {
            // Error handled by store
        } finally {
            this.bulkEnriching.set(null);
        }
    }

    async deleteGenetics(g: IGenetics): Promise<void> {
        this.confirmService.confirm({
            ...confirmationDialogSettings(),
            message: `למחוק את "${g.name}"?`,
            header: 'מחיקת זן',
            accept: async () => {
                try {
                    await this.geneticsStore.delete(g.name);
                    this.expandedGenetics.update(set => {
                        const next = new Set(set);
                        next.delete(g.id);
                        return next;
                    });
                    this.messageService.add({
                        severity: 'success',
                        summary: 'נמחק',
                        detail: `"${g.name}" נמחק בהצלחה.`
                    });
                } catch {
                    // Error handled by store
                }
            }
        });
    }

    async deleteTerpene(t: ITerpene): Promise<void> {
        this.confirmService.confirm({
            ...confirmationDialogSettings(),
            message: `למחוק את "${t.name}"?`,
            header: 'מחיקת טרפן',
            accept: async () => {
                try {
                    await this.getTerpeneStore().delete(t.name);
                    this.expandedTerpenes.update(set => {
                        const next = new Set(set);
                        next.delete(t.id);
                        return next;
                    });
                    this.messageService.add({
                        severity: 'success',
                        summary: 'נמחק',
                        detail: `"${t.name}" נמחק בהצלחה.`
                    });
                } catch {
                    // Error handled by store
                }
            }
        });
    }
}
