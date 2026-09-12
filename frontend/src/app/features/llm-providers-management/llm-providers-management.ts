import { Component, inject, computed, viewChild, ChangeDetectionStrategy, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';

import { InputTextModule } from 'primeng/inputtext';
import { Table, TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { Confirmation, ConfirmationService, MessageService } from 'primeng/api';
import { AuthStore } from '../../core/store/auth.store';
import { UserRole } from '../../core/enums/user-role.enum';
import { LlmProviderStore } from '../../core/store/llm-provider.store';
import { PageStates } from '../../core/enums/page-states.enum';
import { BadgeColor } from '../../core/directives/badge-color.directive';
import { TooltipDirective } from '../../core/directives/tooltip.directive';

import { LlmProvider, LlmProviderService, LlmModel } from '../../core/services/llm-provider.service';

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
    }

    testingModelId = signal<number>(0);

    // Dialog visibility — bound via [(visible)] so must be signals
    providerDialogVisible = signal(false);
    modelDialogVisible = signal(false);

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

        return providers.map((provider) => ({
            ...provider,
            modelsCount: (provider.models || []).length,
            models: (provider.models || []).map((model) => {
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
            }),
        }));
    });

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
            next: () => {
                this.testingModelId.set(0);
                this.llmProviderStore.reload();
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
        if (!ms) return '0ms';
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
        });
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
