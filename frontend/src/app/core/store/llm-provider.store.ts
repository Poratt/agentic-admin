import { HttpErrorResponse, httpResource } from '@angular/common/http';
import { Injectable, inject, signal, computed } from '@angular/core';
import { forkJoin } from 'rxjs';
import { LlmProviderService, LlmProvider, LlmModel, ModelStats } from '../../core/services/llm-provider.service';
import { PageStates } from '../../core/enums/page-states.enum';
import { ServiceResultContainer } from '../../core/models/service-result-container.model';
import { environment } from '../../environments/environment';

export interface GroupedLlmProviderModel extends LlmModel {
    performanceScore: number;
    performancePercentage: number;
    latencyAverageMs: number;
}

export interface GroupedLlmProvider {
    label: string;
    count: number;
    items: GroupedLlmProviderModel[];
}

@Injectable({
    providedIn: 'root',
})
export class LlmProviderStore {
    private llmProviderService = inject(LlmProviderService);

    providersResource = httpResource<ServiceResultContainer<LlmProvider[]>>(() => `${environment.apiUrl}/llm-provider`);

    providers = computed(() =>
        this.providersResource.hasValue() ? (this.providersResource.value()?.result ?? []) : [],
    );
    loading = computed(() => this.providersResource.isLoading());
    error = signal<string | null>(null);

    defaultModelId = signal<number | null>(null);

    // True once the saved default has been fetched, successfully or not. Consumers
    // that auto-select a model must wait for this, otherwise they fall back to the
    // first model in the list before the user's default is even known.
    defaultModelResolved = signal(false);

    loadUserDefaultModel(): void {
        this.llmProviderService.getUserDefaultModel().subscribe({
            next: (res) => {
                this.defaultModelId.set(res.result?.id ?? null);
                this.defaultModelResolved.set(true);
            },
            error: () => {
                this.defaultModelId.set(null);
                this.defaultModelResolved.set(true);
            },
        });
    }

    setDefaultModel(modelId: number): void {
        this.llmProviderService.setUserDefaultModel(modelId).subscribe({
            next: () => {
                this.defaultModelId.set(modelId);
            },
            error: (err) => {
                this.error.set(err?.error?.message ?? 'Failed to set default model');
            },
        });
    }

    groupedProviders = computed<GroupedLlmProvider[]>(() => {
        return this.providers()
            .filter((provider) => provider.active)
            .map((provider) => {
                const activeModels = (provider.models ?? []).filter((model) => model.active);
                return {
                    label: provider.label,
                    count: activeModels.length,
                    items: activeModels
                        .map((model) => {
                            const results = model.testResults || [];
                            const totalTests = results.length;
                            if (totalTests === 0) {
                                return {
                                    ...model,
                                    performanceScore: -1,
                                    performancePercentage: 0,
                                    latencyAverageMs: 0,
                                };
                            }
                            const successfulTests = results.filter((r) => r.status === 'success').length;
                            const successPercentage = Math.round((successfulTests / totalTests) * 100);
                            const successfulResults = results.filter((r) => r.status === 'success');
                            let latencyAverage = 0;
                            if (successfulResults.length > 0) {
                                const totalLatency = successfulResults.reduce(
                                    (sum, r) => sum + (r.responseTimeMs || 0),
                                    0,
                                );
                                latencyAverage = Math.round(totalLatency / successfulResults.length);
                            }
                            return {
                                ...model,
                                performanceScore: successPercentage * 100000 - latencyAverage,
                                performancePercentage: successPercentage,
                                latencyAverageMs: latencyAverage,
                            };
                        })
                        .sort((a, b) => b.performanceScore - a.performanceScore),
                };
            })
            .filter((provider) => (provider.items?.length ?? 0) > 0);
    });

    // Chat only targets text-capability models; image/video models are surfaced
    // elsewhere (media studio, out of scope for this change).
    chatModels = computed<GroupedLlmProvider[]>(() => {
        return this.groupedProviders()
            .map((provider) => {
                const textItems = (provider.items ?? []).filter((item) => item.capability === 'text');
                return {
                    label: provider.label,
                    count: textItems.length,
                    items: textItems,
                };
            })
            .filter((provider) => (provider.items?.length ?? 0) > 0);
    });

    // Flat lists of image/video-capable models for the media studio.
    imageModels = computed<LlmModel[]>(() => {
        return this.providers()
            .filter((p) => p.active)
            .flatMap((p) => p.models ?? [])
            .filter((m) => m.active && m.capability === 'image');
    });

    videoModels = computed<LlmModel[]>(() => {
        return this.providers()
            .filter((p) => p.active)
            .flatMap((p) => p.models ?? [])
            .filter((m) => m.active && m.capability === 'video');
    });

    pageState = computed<PageStates>(() => {
        if (this.loading() && this.providers().length === 0) {
            return PageStates.Loading;
        }

        if (this.error() || this.providersResource.error()) {
            return PageStates.Error;
        }

        if (this.providers().length === 0) {
            return PageStates.Empty;
        }

        return PageStates.Ready;
    });

    reload(): void {
        this.providersResource.reload();
    }

    /**
     * Model usage statistics for the statistics tab and the leaderboard badges.
     *
     * Loaded on demand rather than through `httpResource`: a resource issues its GET the moment the
     * store is constructed, and this one is a separate endpoint the page may never need.
     */
    modelStats = signal<ModelStats | null>(null);
    modelStatsLoading = signal(false);
    modelStatsError = signal<string | null>(null);

    loadModelStats(): void {
        if (this.modelStatsLoading()) {
            return;
        }

        this.modelStatsLoading.set(true);
        this.modelStatsError.set(null);
        this.llmProviderService.getModelStats().subscribe({
            next: (res) => {
                this.modelStats.set(res.result ?? null);
                this.modelStatsLoading.set(false);
            },
            error: (err: HttpErrorResponse) => {
                this.modelStatsError.set(err?.error?.message ?? 'Failed to load model statistics');
                this.modelStatsLoading.set(false);
            },
        });
    }

    clearError() {
        this.error.set(null);
    }

    createProvider(providerData: Partial<LlmProvider>) {
        this.llmProviderService.create(providerData).subscribe({
            next: () => {
                this.providersResource.reload();
            },
            error: (err: HttpErrorResponse) => {
                this.error.set(err?.error?.message ?? 'Failed to create provider');
                this.providersResource.reload();
            },
        });
    }

    updateProvider(providerId: number, providerData: Partial<LlmProvider>) {
        this.llmProviderService.update(providerId, providerData).subscribe({
            next: () => {
                this.providersResource.reload();
            },
            error: (err: HttpErrorResponse) => {
                this.error.set(err?.error?.message ?? 'Failed to update provider');
                this.providersResource.reload();
            },
        });
    }

    deleteProvider(providerId: number) {
        this.llmProviderService.deleteProvider(providerId).subscribe({
            next: () => {
                this.providersResource.reload();
            },
            error: (err: HttpErrorResponse) => {
                this.error.set(err?.error?.message ?? 'Failed to delete provider');
                this.providersResource.reload();
            },
        });
    }

    createModel(providerId: number, modelData: Partial<LlmModel>) {
        this.llmProviderService.createModel(providerId, modelData).subscribe({
            next: () => {
                this.providersResource.reload();
            },
            error: (err: HttpErrorResponse) => {
                this.error.set(err?.error?.message ?? 'Failed to create model');
                this.providersResource.reload();
            },
        });
    }

    softDeleteModel(providerId: number, modelId: number) {
        this.llmProviderService.softDeleteModel(modelId).subscribe({
            next: () => {
                this.providersResource.reload();
            },
            error: (err: HttpErrorResponse) => {
                this.error.set(err?.error?.message ?? 'Failed to delete model');
                this.providersResource.reload();
            },
        });
    }

    hardDeleteModel(providerId: number, modelId: number) {
        this.llmProviderService.deleteModel(modelId).subscribe({
            next: () => {
                this.providersResource.reload();
            },
            error: (err: HttpErrorResponse) => {
                this.error.set(err?.error?.message ?? 'Failed to delete model');
                this.providersResource.reload();
            },
        });
    }

    deleteTestResult(providerId: number, modelId: number, testResultId: number) {
        this.llmProviderService.deleteTestResult(testResultId).subscribe({
            next: () => {
                this.providersResource.reload();
            },
            error: (err: HttpErrorResponse) => {
                this.error.set(err?.error?.message ?? 'Failed to delete test result');
                this.providersResource.reload();
            },
        });
    }

    deleteAllTestResults(providerId: number, modelId: number) {
        this.llmProviderService.deleteAllTestResultsForModel(modelId).subscribe({
            next: () => {
                this.providersResource.reload();
            },
            error: (err: HttpErrorResponse) => {
                this.error.set(err?.error?.message ?? 'Failed to delete test results');
                this.providersResource.reload();
            },
        });
    }

    updateModel(providerId: number, modelId: number, modelData: Partial<LlmModel>) {
        this.llmProviderService.updateModel(modelId, modelData).subscribe({
            next: () => {
                this.providersResource.reload();
            },
            error: (err: HttpErrorResponse) => {
                this.error.set(err?.error?.message ?? 'Failed to update model');
                this.providersResource.reload();
            },
        });
    }

    /** Bulk active toggle with a single reload — the master switch in the models table. */
    setModelsActive(modelIds: number[], active: boolean) {
        if (modelIds.length === 0) return;
        forkJoin(modelIds.map((modelId) => this.llmProviderService.updateModel(modelId, { active }))).subscribe({
            next: () => {
                this.providersResource.reload();
            },
            error: (err: HttpErrorResponse) => {
                this.error.set(err?.error?.message ?? 'Failed to update models');
                this.providersResource.reload();
            },
        });
    }
}
