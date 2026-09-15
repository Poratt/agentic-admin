import { Component, inject, computed, viewChild, ChangeDetectionStrategy, signal, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';

import { InputTextModule } from 'primeng/inputtext';
import { Table, TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { CheckboxModule } from 'primeng/checkbox';
import { Tabs, TabList, Tab } from 'primeng/tabs';
import { Confirmation, ConfirmationService, MessageService } from 'primeng/api';
import { AuthStore } from '../../core/store/auth.store';
import { UserRole } from '../../core/enums/user-role.enum';
import { LlmProviderStore } from '../../core/store/llm-provider.store';
import { PageStates } from '../../core/enums/page-states.enum';
import { BadgeColor } from '../../core/directives/badge-color.directive';
import { TooltipDirective } from '../../core/directives/tooltip.directive';

import {
    LlmProvider,
    LlmProviderService,
    LlmModel,
    ProviderCatalogEntry,
    ModelStatsRow,
    modelStatsId,
} from '../../core/services/llm-provider.service';

// Search normalization: dots/dashes/underscores are noise — "nemo 35" and
// "nemo 3.5" must both find "nemotron-3.5-...".
function normalizeSearchToken(value: string): string {
    return value.toLowerCase().replace(/[.\-_]/g, '');
}

export interface LlmModelView extends LlmModel {
    testResults?: any[];
    hasTests: boolean;
    latencyAverage: number;
    successPercentage: number;
    performanceScore: number;
}

export interface LlmProviderView extends Omit<LlmProvider, 'models'> {
    models: LlmModelView[];
    modelsCount: number;
}

/** How long the copy icon keeps showing the confirmation check after a copy. */
const COPY_FEEDBACK_MS = 5000;

@Component({
    selector: 'app-llm-providers-management',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        InputTextModule,
        TableModule,
        DialogModule,
        ToggleSwitchModule,
        CheckboxModule,
        Tabs,
        TabList,
        Tab,
        TooltipDirective,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './llm-providers-management.html',
    styleUrl: './llm-providers-management.css',
})
export class LlmProvidersManagement implements OnInit {
    private table = viewChild<Table>('table');
    private fb = inject(FormBuilder);

    protected authStore = inject(AuthStore);
    protected llmProviderService = inject(LlmProviderService);
    protected llmProviderStore = inject(LlmProviderStore);
    protected confirmService = inject(ConfirmationService);
    protected messageService = inject(MessageService);
    protected readonly PageStates = PageStates;
    protected readonly globalFilterFields = ['id', 'key', 'label', 'baseUrl', 'createdAt'];
    globalFilter = signal('');
    // Deactivated providers are hidden by default; admins can reveal them to re-activate.
    showInactive = signal(false);

    ngOnInit(): void {
        this.llmProviderStore.loadUserDefaultModel();
        // The statistics feed both the tab and the leaderboard badges on the model rows, so they are
        // fetched up front. One aggregated query — the backend does not ship the call history.
        this.llmProviderStore.loadModelStats();
    }

    // Inner tab selection: the provider table or the model statistics.
    activeTab = signal('providers');

    private router = inject(Router);
    private route = inject(ActivatedRoute);

    /** Reactive read of `?view=` — follows refresh, deep links and browser back/forward. */
    private queryView = toSignal(this.route.queryParamMap.pipe(map((params) => params.get('view'))));

    /** Route → signal, guarded by inequality so it can never loop back into the router. */
    private syncTabFromRoute = effect(() => {
        const view = this.queryView();
        if ((view === 'providers' || view === 'stats') && view !== this.activeTab()) {
            this.activeTab.set(view);
        }
    });

    /** PrimeNG tabs emit string|number|undefined — only real view keys switch the view. */
    setActiveTab(value: string | number | undefined) {
        if (typeof value !== 'string') return;
        if (value !== 'providers' && value !== 'stats') return;
        // Imperative, single-funnel write: the click updates the signal AND the URL together.
        this.activeTab.set(value);
        void this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { view: value },
            queryParamsHandling: 'merge',
            replaceUrl: true,
        });
    }

    testingModelId = signal<number>(0);
    // Provider id with a background test-all run in flight (drives button state + polling).
    testingAllProviderId = signal<number>(0);
    // Model key whose copy icon currently shows the confirmation check instead of the copy
    // glyph. Cleared again after COPY_FEEDBACK_MS so the icon returns to its normal state.
    copiedModelKey = signal<string | null>(null);
    private copiedModelKeyTimer?: ReturnType<typeof setTimeout>;

    // Dialog visibility — bound via [(visible)] so must be signals
    providerDialogVisible = signal(false);
    modelDialogVisible = signal(false);

    // ── Sync models dialog ───────────────────────────────────────────
    syncDialogVisible = signal(false);
    syncProvider = signal<LlmProviderView | null>(null);
    catalogLoading = signal(false);
    catalogError = signal<string | null>(null);
    catalog = signal<ProviderCatalogEntry[]>([]);
    catalogSearch = signal('');
    selectedKeys = signal<Set<string>>(new Set());
    syncing = signal(false);

    // Token search: every whitespace-separated token must appear somewhere in
    // the key/label (case-insensitive, order-free) — "nemo 35" finds
    // "nvidia/nemotron-3.5-lightning".
    // Token search with normalization: every whitespace-separated token must
    // appear in the normalized key/label (order-free) — "nemo 35", "nemo 3.5"
    // and "nemotron 35" all find "nvidia/nemotron-3.5-lightning-30b-a3b".
    filteredCatalog = computed(() => {
        const tokens = this.catalogSearch().toLowerCase().split(/\s+/).filter(Boolean).map(normalizeSearchToken);
        if (tokens.length === 0) return this.catalog();

        return this.catalog().filter((m) => {
            const haystack = normalizeSearchToken(`${m.key} ${m.label ?? ''}`);
            return tokens.every((token) => haystack.includes(token));
        });
    });

    newSelectionCount = computed(
        () => this.catalog().filter((m) => m.status === 'new' && this.selectedKeys().has(m.key)).length,
    );

    existingCount = computed(() => this.catalog().filter((m) => m.status === 'exists').length);

    unavailableCount = computed(() => this.catalog().filter((m) => m.status === 'unavailable').length);

    // Unavailable models are hidden behind a toggle and always render last.
    unavailableList = computed(() =>
        this.showUnavailable() ? this.filteredCatalog().filter((m) => m.status === 'unavailable') : [],
    );

    showUnavailable = signal(false);
    collapsedGroups = signal<Set<string>>(new Set());

    // Grouping name, most specific first:
    // 1. the key's vendor segment — with a leading namespace token (@cf/, @hf/,
    //    ...) skipped, so Cloudflare-style keys group by their real publisher;
    // 2. owned_by — only for prefix-less keys (some catalogs like GMI return a
    //    constant owned_by on every entry, which would group everything as one).
    vendorOf(key: string): string {
        const stripped = this.displayKey(key).replace(/^@[^/]+\//, '');
        const slash = stripped.indexOf('/');
        return slash > 0 ? stripped.slice(0, slash) : '';
    }

    catalogGroups = computed(() => {
        const entries = this.filteredCatalog().filter((m) => m.status !== 'unavailable');
        const grouped = new Map<string, ProviderCatalogEntry[]>();
        for (const m of entries) {
            const name = this.vendorOf(m.key) || m.owned_by || 'Other';
            const list = grouped.get(name) ?? [];
            list.push(m);
            grouped.set(name, list);
        }
        return [...grouped.entries()]
            .map(([name, items]) => ({ name, items: [...items].sort((a, b) => a.key.localeCompare(b.key)) }))
            .sort((a, b) => a.name.localeCompare(b.name));
    });

    isGroupCollapsed(name: string): boolean {
        return this.collapsedGroups().has(name);
    }

    toggleGroup(name: string) {
        this.collapsedGroups.update((set) => {
            const next = new Set(set);
            if (next.has(name)) {
                next.delete(name);
            } else {
                next.add(name);
            }
            return next;
        });
    }

    toggleShowUnavailable() {
        this.showUnavailable.update((v) => !v);
    }

    // Reactive Forms for Provider dialog
    providerForm: FormGroup = this.fb.group({
        key: ['', [Validators.required, Validators.pattern(/^\S+$/)]],
        label: ['', [Validators.required]],
        baseUrl: ['', [Validators.required, Validators.pattern(/^https?:\/\/.*/)]],
        apiKey: [''],
        active: [true],
    });

    // Reactive Forms for Model dialog
    modelForm: FormGroup = this.fb.group({
        key: ['', [Validators.required, Validators.pattern(/^\S+$/)]],
        label: ['', [Validators.required]],
        active: [true],
    });

    editingProviderId = signal<number | null>(null);
    editingModelProviderId = signal<number | null>(null);
    editingModelId = signal<number | null>(null);

    // Keyed by provider.id — drives the outer table row expansion
    expandedProviders = signal<Record<number, boolean>>({});
    // Keyed by model.id — drives the inner table row expansion (shared across all provider sub-tables)
    expandedModels = signal<Record<number, boolean>>({});

    pageState = computed(() => this.llmProviderStore.pageState());
    isAdmin = computed(() => this.authStore.userRole() === UserRole.Admin);

    llmProviders = computed<LlmProviderView[]>(() => {
        const all = this.llmProviderStore.providers();
        const visible = this.showInactive() ? all : all.filter((p) => p.active);
        // Inactive providers sink to the bottom of the default listing.
        const providers = [...visible.filter((p) => p.active), ...visible.filter((p) => !p.active)];

        return providers.map((provider) => {
            const models = (provider.models || []).map((model) => {
                const results = model.testResults || [];
                const totalTests = results.length;

                if (totalTests === 0) {
                    return { ...model, hasTests: false, latencyAverage: 0, successPercentage: 0, performanceScore: -1 };
                }

                const successfulTests = results.filter((r) => r.status === 'success').length;
                const successPercentage = Math.round((successfulTests / totalTests) * 100);

                const successfulResults = results.filter((r) => r.status === 'success');
                let latencyAverage = 0;

                if (successfulResults.length > 0) {
                    const totalLatency = successfulResults.reduce((sum, r) => sum + (r.responseTimeMs || 0), 0);
                    latencyAverage = Math.round(totalLatency / successfulResults.length);
                }

                const performanceScore = successPercentage * 100000 - latencyAverage;

                return {
                    ...model,
                    hasTests: true,
                    latencyAverage,
                    successPercentage,
                    performanceScore,
                };
            });

            // Default sub-table order mirrors the provider listing: best performance first,
            // inactive models sink to the bottom.
            const byScore = [...models].sort((a, b) => b.performanceScore - a.performanceScore);

            return {
                ...provider,
                modelsCount: models.length,
                models: [...byScore.filter((m) => m.active), ...byScore.filter((m) => !m.active)],
            };
        });
    });

    /**
     * Statistics rows, fastest mean real-call latency first. Models with no real calls sink to the
     * bottom rather than sorting as "0 ms" — never used is not the same as instant.
     */
    statsRows = computed<ModelStatsRow[]>(() => {
        const rows = this.llmProviderStore.modelStats()?.rows ?? [];

        return [...rows].sort((a, b) => {
            // Orphaned history (model no longer configured) always sinks to the bottom.
            if (!a.label && b.label) return 1;
            if (a.label && !b.label) return -1;
            if (a.real && !b.real) return -1;
            if (!a.real && b.real) return 1;
            if (a.real && b.real && a.real.avgMs !== b.real.avgMs) return a.real.avgMs - b.real.avgMs;
            return (b.ping?.runs ?? 0) - (a.ping?.runs ?? 0);
        });
    });

    /** True when this model holds the fastest mean real-call latency across the whole system. */
    isFastest(providerKey: string, modelKey: string): boolean {
        return this.llmProviderStore.modelStats()?.fastestId === modelStatsId(providerKey, modelKey);
    }

    /** True when this model holds the best success rate across the whole system. */
    isMostStable(providerKey: string, modelKey: string): boolean {
        return this.llmProviderStore.modelStats()?.mostStableId === modelStatsId(providerKey, modelKey);
    }

    /**
     * Names the measurement a leaderboard badge was earned on. The backend ranks on real calls when
     * a model has enough of them and falls back to connectivity pings otherwise, so the badge has
     * to say which — a ping is a one-line test and measures something different from real work.
     */
    leaderBasisLabel(providerKey: string, modelKey: string): string {
        return this.statsById().get(modelStatsId(providerKey, modelKey))?.rankingBasis === 'real'
            ? 'real calls'
            : 'connectivity tests';
    }

    /** Statistics rows by composite id, so both badge sites can describe themselves in O(1). */
    private statsById = computed(
        () => new Map((this.llmProviderStore.modelStats()?.rows ?? []).map((row) => [row.id, row])),
    );

    /** Leaderboard winners for the providers-view caption tags — null until statistics load. */
    fastestStatsRow = computed(() => this.statsById().get(this.llmProviderStore.modelStats()?.fastestId ?? '') ?? null);
    mostStableStatsRow = computed(
        () => this.statsById().get(this.llmProviderStore.modelStats()?.mostStableId ?? '') ?? null,
    );

    /** Label for a statistics row — the configured name, falling back to the raw model key. */
    statsLabel(row: ModelStatsRow): string {
        return row.label ?? row.modelKey;
    }

    // Label of the provider currently targeted by the model dialog — used in the dialog header
    modelDialogProviderLabel = computed(() => {
        const providerId = this.editingModelProviderId();
        if (providerId === null) return '';
        return this.llmProviders().find((p) => p.id === providerId)?.label ?? '';
    });

    // modelDialogTitle defined later

    // Provider dialog title computed property (replaces hardcoded header="Provider")
    providerDialogTitle = computed(() => {
        const mode = this.editingProviderId() !== null ? 'Edit' : 'New';
        const label =
            this.editingProviderId() !== null
                ? (this.llmProviders().find((p) => p.id === this.editingProviderId())?.label ?? '')
                : '';
        return `${mode} Provider${label ? ' | ' + label : ''}`;
    });

    // Existing modelDialogTitle remains unchanged
    modelDialogTitle = computed(() => {
        const mode = this.editingModelId() !== null ? 'Edit' : 'New';
        return `${mode} Model | ${this.modelDialogProviderLabel()}`;
    });

    applyGlobalFilter(event: Event) {
        const value = (event.target as HTMLInputElement).value;
        this.globalFilter.set(value);
        this.table()?.filterGlobal(value, 'contains');
    }

    clearGlobalFilter() {
        this.globalFilter.set('');
        this.table()?.filterGlobal('', 'contains');
    }

    toggleShowInactive(value: boolean) {
        this.showInactive.set(value);
    }

    setProviderActive(provider: LlmProviderView, active: boolean) {
        if (provider.active === active) return;
        this.llmProviderStore.updateProvider(provider.id, { active });
    }

    setModelActive(providerId: number, model: LlmModelView, active: boolean) {
        if (model.active === active) return;
        this.llmProviderStore.updateModel(providerId, model.id, { active });
    }

    deleteProvider(providerId: number) {
        let confirm: Confirmation = {
            closeOnEscape: true,
            dismissableMask: true,
            message:
                'Permanently delete this provider and all its models, their test history and user defaults? This cannot be undone.',
            header: 'Delete Provider Permanently',
            icon: 'ph ph-warning',
            acceptIcon: 'ph ph-trash',
            rejectIcon: 'ph ph-x',
            rejectButtonProps: {
                label: 'Cancel',
                text: true,
                severity: 'primary',
                size: 'small',
            },
            acceptButtonProps: {
                label: 'Delete Permanently',
                text: true,
                variant: 'danger',
                severity: 'danger',
                size: 'small',
            },
            accept: () => {
                this.llmProviderStore.deleteProvider(providerId);
                this.messageService.add({
                    severity: 'success',
                    summary: 'Deleted',
                    detail: 'Provider has been permanently deleted.',
                });
            },
        };

        this.confirmService.confirm(confirm);
    }

    testModel(modelId: number) {
        this.testingModelId.set(modelId);
        this.llmProviderService.testModel(modelId).subscribe({
            next: (res) => {
                this.testingModelId.set(0);
                this.llmProviderStore.reload();
                if (res?.success === false) {
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Test Failed',
                        detail: res.message || 'Model check failed.',
                    });
                    return;
                }
                this.messageService.add({
                    severity: 'success',
                    summary: 'Test Complete',
                    detail: 'Model test completed successfully.',
                });
            },
            error: (err) => {
                this.testingModelId.set(0);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Test Failed',
                    detail: err?.error?.message || 'Unknown error',
                });
                this.llmProviderStore.reload();
            },
        });
    }

    testAllModels(provider: LlmProviderView) {
        if (this.testingAllProviderId() !== 0) return;

        const activeTextModels = (provider.models ?? []).filter((m) => m.active && m.capability === 'text').length;
        if (activeTextModels === 0) {
            this.messageService.add({
                severity: 'info',
                summary: 'Nothing to test',
                detail: 'No active text models for this provider.',
            });
            return;
        }

        this.testingAllProviderId.set(provider.id);
        this.llmProviderService.testAllModels(provider.id).subscribe({
            next: (res) => {
                this.messageService.add({
                    severity: 'info',
                    summary: 'Test Run Started',
                    detail: `Testing ${res.result?.tested ?? activeTextModels} models in the background — results appear as they finish.`,
                });
                this.pollTestResults(provider.id);
            },
            error: (err) => {
                this.testingAllProviderId.set(0);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Test All Failed',
                    detail: err?.error?.message || 'Unknown error',
                });
            },
        });
    }

    // Reloads periodically while the backend reports the run in flight; stops
    // the moment the run finishes (status endpoint) or errors out.
    private pollTestResults(providerId: number, remainingPolls = 30) {
        if (this.testingAllProviderId() !== providerId) return;
        if (remainingPolls <= 0) {
            this.testingAllProviderId.set(0);
            return;
        }
        setTimeout(() => {
            if (this.testingAllProviderId() !== providerId) return;
            this.llmProviderService.testAllStatus(providerId).subscribe({
                next: (res) => {
                    if (this.testingAllProviderId() !== providerId) return;
                    this.llmProviderStore.reload();
                    if (res.result?.running) {
                        this.pollTestResults(providerId, remainingPolls - 1);
                    } else {
                        this.testingAllProviderId.set(0);
                        this.llmProviderStore.reload();
                    }
                },
                error: () => {
                    if (this.testingAllProviderId() === providerId) this.testingAllProviderId.set(0);
                },
            });
        }, 8_000);
    }

    toggleProvider(providerId: number) {
        this.expandedProviders.update((state) => ({ ...state, [providerId]: !state[providerId] }));
    }

    isProviderExpanded(providerId: number): boolean {
        return !!this.expandedProviders()[providerId];
    }

    toggleModel(modelId: number) {
        this.expandedModels.update((state) => ({ ...state, [modelId]: !state[modelId] }));
    }

    isModelExpanded(modelId: number): boolean {
        return !!this.expandedModels()[modelId];
    }

    formatLatency(ms: number): string {
        // 0 is not a fast run — it means nothing succeeded, so there is no latency to report.
        if (!ms) return '—';
        if (ms < 1000) return `${ms}ms`;
        return `${(ms / 1000).toFixed(1)}s`;
    }

    performanceClass(percentage: number): string {
        if (percentage >= 90) return 'good';
        if (percentage >= 60) return 'mid';
        return 'bad';
    }

    // ── Provider dialog ──────────────────────────────────────────────

    openAddProviderDialog() {
        this.providerForm.reset({ key: '', label: '', baseUrl: '', apiKey: '', active: true });
        this.editingProviderId.set(null);
        this.providerDialogVisible.set(true);
    }

    openEditProviderDialog(provider: LlmProviderView) {
        this.providerForm.patchValue({
            key: provider.key,
            label: provider.label,
            baseUrl: provider.baseUrl,
            apiKey: '',
            active: provider.active,
        });
        this.editingProviderId.set(provider.id);
        this.providerDialogVisible.set(true);
    }

    closeProviderDialog() {
        this.providerDialogVisible.set(false);
        this.providerForm.reset();
        this.editingProviderId.set(null);
    }

    saveProvider() {
        if (this.providerForm.invalid) {
            this.providerForm.markAllAsTouched();
            return;
        }

        const id = this.editingProviderId();
        const formValue = this.providerForm.getRawValue();

        if (id === null) {
            const payload: Partial<LlmProvider> = { ...formValue };
            if (!payload.apiKey) delete payload.apiKey;
            this.llmProviderStore.createProvider(payload);
        } else {
            const original = this.llmProviders().find((p) => p.id === id);
            const payload: Partial<LlmProvider> = {};
            if (original) {
                if (formValue.key !== original.key) payload.key = formValue.key;
                if (formValue.label !== original.label) payload.label = formValue.label;
                if (formValue.baseUrl !== original.baseUrl) payload.baseUrl = formValue.baseUrl;
                if (formValue.active !== original.active) payload.active = formValue.active;
            } else {
                Object.assign(payload, formValue);
            }
            if (formValue.apiKey) payload.apiKey = formValue.apiKey;
            this.llmProviderStore.updateProvider(id, payload);
        }

        this.closeProviderDialog();
    }

    // ── Model dialog ─────────────────────────────────────────────────

    openAddModelDialog(providerId: number) {
        this.modelForm.reset({ key: '', label: '', active: true });
        this.editingModelProviderId.set(providerId);
        this.editingModelId.set(null);
        this.modelDialogVisible.set(true);
    }

    // ── Sync models dialog ───────────────────────────────────────────

    openSyncDialog(provider: LlmProviderView) {
        this.syncProvider.set(provider);
        this.syncDialogVisible.set(true);
        this.loadCatalog(provider.id);
    }

    loadCatalog(providerId: number) {
        this.catalogLoading.set(true);
        this.catalogError.set(null);
        this.catalog.set([]);
        this.catalogSearch.set('');
        this.selectedKeys.set(new Set());
        this.llmProviderService.getCatalog(providerId).subscribe({
            next: (res) => {
                // Nothing preselected — the admin picks (Select All / search) explicitly.
                this.catalog.set(res.result?.models ?? []);
                this.catalogLoading.set(false);
            },
            error: (err) => {
                this.catalogError.set(err?.error?.message || 'Failed to load provider catalog');
                this.catalogLoading.set(false);
            },
        });
    }

    retryCatalog() {
        const provider = this.syncProvider();
        if (provider) this.loadCatalog(provider.id);
    }

    isKeySelected(key: string): boolean {
        return this.selectedKeys().has(key);
    }

    // Some providers (e.g. OpenRouter "latest" variants) prefix model keys with
    // '~'. The prefix is part of the real API key — strip it for display only.
    displayKey(key: string): string {
        return key.replace(/^~/, '');
    }

    // Short display name: the segment after the last '/' — the group header
    // already shows the publisher, so the full key is noise in the row. The
    // full key stays available via the row tooltip.
    shortModelName(key: string): string {
        const clean = this.displayKey(key);
        const slash = clean.lastIndexOf('/');
        return slash >= 0 ? clean.slice(slash + 1) : clean;
    }

    toggleCatalogKey(key: string, checked: boolean) {
        this.selectedKeys.update((set) => {
            const next = new Set(set);
            if (checked) {
                next.add(key);
            } else {
                next.delete(key);
            }
            return next;
        });
    }

    // Both respect the active search/owner filter — only what the user can see.
    selectAllNew() {
        this.selectedKeys.update((set) => {
            const next = new Set(set);
            for (const m of this.filteredCatalog()) {
                if (m.status === 'new') next.add(m.key);
            }
            return next;
        });
    }

    deselectAll() {
        this.selectedKeys.update((set) => {
            const next = new Set(set);
            for (const m of this.filteredCatalog()) {
                if (m.status === 'new') next.delete(m.key);
            }
            return next;
        });
    }

    closeSyncDialog() {
        this.syncDialogVisible.set(false);
        this.syncProvider.set(null);
        this.catalog.set([]);
        this.catalogError.set(null);
        this.catalogSearch.set('');
        this.selectedKeys.set(new Set());
    }

    addSelectedModels() {
        const provider = this.syncProvider();
        const keys = this.catalog()
            .filter((m) => m.status === 'new' && this.selectedKeys().has(m.key))
            .map((m) => m.key);
        if (!provider || keys.length === 0) return;

        this.syncing.set(true);
        this.llmProviderService.syncModels(provider.id, keys).subscribe({
            next: (res) => {
                this.syncing.set(false);
                this.closeSyncDialog();
                this.llmProviderStore.reload();
                const added = res.result?.added ?? 0;
                const skipped = res.result?.skipped ?? 0;
                this.messageService.add({
                    severity: 'success',
                    summary: 'Models Added',
                    detail: `Added ${added} model(s)${skipped > 0 ? `, skipped ${skipped} existing` : ''}.`,
                });
            },
            error: (err) => {
                this.syncing.set(false);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Sync Failed',
                    detail: err?.error?.message || 'Unknown error',
                });
            },
        });
    }

    openEditModelDialog(providerId: number, model: LlmModel) {
        this.modelForm.patchValue({
            key: model.key,
            label: model.label,
            active: model.active,
        });
        this.editingModelProviderId.set(providerId);
        this.editingModelId.set(model.id);
        this.modelDialogVisible.set(true);
    }

    closeModelDialog() {
        this.modelDialogVisible.set(false);
        this.modelForm.reset();
        this.editingModelProviderId.set(null);
        this.editingModelId.set(null);
    }

    saveModel() {
        if (this.modelForm.invalid) {
            this.modelForm.markAllAsTouched();
            return;
        }

        const providerId = this.editingModelProviderId();
        if (providerId === null) return;

        const modelId = this.editingModelId();
        const payload: Partial<LlmModel> = { ...this.modelForm.getRawValue() };

        if (modelId === null) {
            this.llmProviderStore.createModel(providerId, payload);
            this.messageService.add({
                severity: 'success',
                summary: 'Created',
                detail: 'Model has been created successfully.',
            });
        } else {
            this.llmProviderStore.updateModel(providerId, modelId, payload);
            this.messageService.add({
                severity: 'success',
                summary: 'Updated',
                detail: 'Model has been updated successfully.',
            });
        }

        this.closeModelDialog();
    }

    hardDeleteModel(providerId: number, modelId: number) {
        let confirm: Confirmation = {
            closeOnEscape: true,
            dismissableMask: true,
            message: 'Permanently delete this model, its test history and all user defaults? This cannot be undone.',
            header: 'Delete Model Permanently',
            icon: 'ph ph-warning',
            acceptIcon: 'ph ph-trash',
            rejectIcon: 'ph ph-x',
            rejectButtonProps: {
                label: 'Cancel',
                text: true,
                severity: 'primary',
                size: 'small',
            },
            acceptButtonProps: {
                label: 'Delete Permanently',
                text: true,
                variant: 'danger',
                severity: 'danger',
                size: 'small',
            },
            accept: () => {
                this.llmProviderStore.hardDeleteModel(providerId, modelId);
                this.messageService.add({
                    severity: 'success',
                    summary: 'Deleted',
                    detail: 'Model has been permanently deleted.',
                });
            },
        };
        this.confirmService.confirm(confirm);
    }

    deleteTestResult(providerId: number, modelId: number, testResultId: number) {
        let confirm: Confirmation = {
            closeOnEscape: true,
            dismissableMask: true,
            message: 'Are you sure you want to delete this test result?',
            header: 'Delete Test Result',
            icon: 'ph ph-warning',
            acceptIcon: 'ph ph-trash',
            rejectIcon: 'ph ph-x',
            rejectButtonProps: {
                label: 'Cancel',
                text: true,
                severity: 'primary',
                size: 'small',
            },
            acceptButtonProps: {
                label: 'Delete',
                text: true,
                variant: 'danger',
                severity: 'danger',
                size: 'small',
            },
            accept: () => {
                this.llmProviderStore.deleteTestResult(providerId, modelId, testResultId);
                this.messageService.add({
                    severity: 'success',
                    summary: 'Deleted',
                    detail: 'Test result has been deleted successfully.',
                });
            },
        };
        this.confirmService.confirm(confirm);
    }

    deleteAllTestResults(providerId: number, modelId: number, count: number) {
        let confirm: Confirmation = {
            closeOnEscape: true,
            dismissableMask: true,
            message: `Are you sure you want to delete all ${count} test results for this model?`,
            header: 'Delete All Test Results',
            icon: 'ph ph-warning',
            acceptIcon: 'ph ph-trash',
            rejectIcon: 'ph ph-x',
            rejectButtonProps: {
                label: 'Cancel',
                text: true,
                severity: 'primary',
                size: 'small',
            },
            acceptButtonProps: {
                label: 'Delete All',
                text: true,
                variant: 'danger',
                severity: 'danger',
                size: 'small',
            },
            accept: () => {
                this.llmProviderStore.deleteAllTestResults(providerId, modelId);
                this.messageService.add({
                    severity: 'success',
                    summary: 'Deleted',
                    detail: 'All test results have been deleted successfully.',
                });
            },
        };
        this.confirmService.confirm(confirm);
    }

    setDefaultModel(model: LlmModel) {
        if (this.llmProviderStore.defaultModelId() === model.id) return;
        this.llmProviderStore.setDefaultModel(model.id);
        this.messageService.add({
            severity: 'success',
            summary: 'Default Set',
            detail: `"${model.label}" is now the default model.`,
        });
    }

    copyModelKey(event: Event, key: string): void {
        event.stopPropagation();
        navigator.clipboard.writeText(key).then(() => {
            this.messageService.add({
                severity: 'success',
                summary: 'Copied',
                detail: 'Model key copied to clipboard.',
            });
            this.showCopyConfirmation(key);
        });
    }

    /**
     * Swaps the copy glyph for a check mark on the copied model's key, then restores
     * it after COPY_FEEDBACK_MS. Copying again restarts the window rather than
     * stacking timers, so the icon never gets stuck. Mirrors the chat-message idiom.
     */
    private showCopyConfirmation(key: string): void {
        this.clearCopiedModelKeyTimer();
        this.copiedModelKey.set(key);
        this.copiedModelKeyTimer = setTimeout(() => {
            this.copiedModelKey.set(null);
            this.copiedModelKeyTimer = undefined;
        }, COPY_FEEDBACK_MS);
    }

    private clearCopiedModelKeyTimer(): void {
        if (!this.copiedModelKeyTimer) return;
        clearTimeout(this.copiedModelKeyTimer);
        this.copiedModelKeyTimer = undefined;
    }
}

// Laguna M.1 - poolside/laguna-m.1:free
// gpt-oss-120b - openai/gpt-oss-120b:free
// gpt-oss-20b - openai/gpt-oss-20b:free
// Nemotron 3 Nano 30B A3B - nvidia/nemotron-3-nano-30b-a3b:free
// Nemotron 3 Nano Omni - nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free
// Nemotron Nano 9B V2 - nvidia/nemotron-nano-9b-v2:free
// Nemotron Nano 12B 2 VL - nvidia/nemotron-nano-12b-v2:free
// North Mini Code - cohere/north-mini-code:free
// Llama Nemotron Embed VL 1B V2 - nvidia/llama-nemotron-embed-vl-1b-v2:free
// Llama Nemotron Rerank VL 1B V2 - nvidia/llama-nemotron-rerank-vl-1b-v2:free
// LFM2.5-1.2B-Thinking - liquid/lfm-2.5-1.2b-thinking:free
// LFM2.5-1.2B-Instruct - liquid/lfm-2.5-1.2b-instruct:free
// Nemotron 3.5 Content Safety - nvidia/nemotron-3.5-content-safety:free
// Qwen3 Next 80B A3B Instruct - qwen/qwen3-next-80b-a3b-instruct:free
// Llama 3.3 70B Instruct - meta-llama/llama-3.3-70b-instruct:free
// Uncensored - cognitivecomputations/dolphin-mistral-24b-venice-edition:free
// Llama 3.2 3B Instruct - meta-llama/llama-3.2-3b-instruct:free
// Hermes 3 405B Instruct - nousresearch/hermes-3-llama-3.1-405b:free
// Qwen3 Coder 480B A35B - qwen/qwen3-coder:free
