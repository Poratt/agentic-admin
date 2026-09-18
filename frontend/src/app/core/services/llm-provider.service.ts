import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { ServiceResultContainer } from '../models/service-result-container.model';
import { Observable } from 'rxjs';

export interface LlmModel {
    id: number;
    key: string;
    label: string;
    active: boolean;
    sortOrder: number;
    capability: 'text' | 'image' | 'video';
    providerId: number;
    createdAt: string;
    updatedAt: string;
    testResults?: any[];
    /** Context window in tokens (enriched via OpenRouter or manual). Null when unknown. */
    contextLength?: number | null;
    /** Max output tokens. Null when unknown. */
    maxOutputTokens?: number | null;
    /** Prompt price per 1M tokens (USD). Null when unknown. */
    promptPricePerM?: number | null;
    /** Completion price per 1M tokens (USD). Null when unknown. */
    completionPricePerM?: number | null;
    /** Free tier flag — when true, prices are treated as zero. */
    freeTier?: boolean;
    /** Enrichment provenance, e.g. openrouter:t1 (T1 Exact) / openrouter:t2 (T2 Bare). */
    metadataSource?: string | null;
}

/** Best-effort metadata for one model key, from the public OpenRouter catalog. */
export interface ModelMetadata {
    key: string;
    contextLength: number | null;
    maxOutputTokens: number | null;
    promptPricePerM: number | null;
    completionPricePerM: number | null;
    freeTier: boolean;
    tier: 't1' | 't2' | null;
    metadataSource: string | null;
}

export interface LlmProvider {
    id: number;
    key: string;
    label: string;
    baseUrl: string;
    apiKey?: string;
    active: boolean;
    models?: LlmModel[];
    createdAt: string;
    updatedAt: string;
}

export interface ProviderCatalogEntry {
    key: string;
    label?: string;
    owned_by?: string;
    status: 'new' | 'exists' | 'unavailable';
}

/** Latency and reliability figures for one model, from one source of measurements. */
export interface ModelUsageStats {
    runs: number;
    successRate: number;
    avgMs: number;
    minMs: number;
    /** Mean tool-call reliability over the real calls that requested tools, 0-100; `null` when
     *  the source has no tool-call sample (pings never request tools). */
    toolCallReliability: number | null;
}

/** One row of the statistics tab: a model's connectivity pings beside the work it actually did. */
export interface ModelStatsRow {
    id: string;
    providerKey: string;
    modelKey: string;
    label: string | null;
    active: boolean;
    ping: ModelUsageStats | null;
    real: ModelUsageStats | null;
    lastCallAt: string | null;
    /** Which source the leaderboard ranked this row on — real calls when there are enough of them,
     *  otherwise connectivity pings. `null` when neither source has enough runs to rank it. */
    rankingBasis: 'real' | 'ping' | null;
}

export interface ModelStats {
    minimumSample: number;
    rows: ModelStatsRow[];
    fastestId: string | null;
    mostStableId: string | null;
}

/** Composite id shared with the backend — `${providerKey}::${modelKey}`. */
export function modelStatsId(providerKey: string, modelKey: string): string {
    return `${providerKey}::${modelKey}`;
}

@Injectable({
    providedIn: 'root',
})
export class LlmProviderService {
    private http = inject(HttpClient);
    private base = `${environment.apiUrl}/llm-provider`;

    create(provider: Partial<LlmProvider>): Observable<ServiceResultContainer<LlmProvider>> {
        return this.http.post<ServiceResultContainer<LlmProvider>>(`${this.base}`, provider);
    }

    findAll(): Observable<ServiceResultContainer<LlmProvider[]>> {
        return this.http.get<ServiceResultContainer<LlmProvider[]>>(`${this.base}`);
    }

    /**
     * Per-model usage statistics. Aggregated in SQL on the backend, so the payload stays the same
     * size no matter how many calls have been recorded.
     */
    getModelStats(): Observable<ServiceResultContainer<ModelStats>> {
        return this.http.get<ServiceResultContainer<ModelStats>>(`${this.base}/stats`);
    }

    update(id: number, provider: Partial<LlmProvider>): Observable<ServiceResultContainer<LlmProvider>> {
        return this.http.patch<ServiceResultContainer<LlmProvider>>(`${this.base}/${id}`, provider);
    }

    // Permanent delete via the backend DELETE route — DB cascades remove models, test results and user defaults.
    deleteProvider(id: number): Observable<ServiceResultContainer<void>> {
        return this.http.delete<ServiceResultContainer<void>>(`${this.base}/${id}`);
    }

    createModel(providerId: number, model: Partial<LlmModel>): Observable<ServiceResultContainer<LlmModel>> {
        return this.http.post<ServiceResultContainer<LlmModel>>(`${this.base}/${providerId}/models`, model);
    }

    // Live catalog from the provider's OpenAI-compatible GET /models, merged with
    // the local list: new / exists / unavailable (local model no longer listed).
    getCatalog(providerId: number): Observable<ServiceResultContainer<{ models: ProviderCatalogEntry[] }>> {
        return this.http.get<ServiceResultContainer<{ models: ProviderCatalogEntry[] }>>(
            `${this.base}/${providerId}/catalog`,
        );
    }

    // Adds the selected catalog keys with active=false; existing keys are skipped server-side.
    syncModels(
        providerId: number,
        keys: string[],
    ): Observable<ServiceResultContainer<{ added: number; skipped: number }>> {
        return this.http.post<ServiceResultContainer<{ added: number; skipped: number }>>(
            `${this.base}/${providerId}/sync-models`,
            { keys },
        );
    }

    updateModel(modelId: number, model: Partial<LlmModel>): Observable<ServiceResultContainer<LlmModel>> {
        return this.http.patch<ServiceResultContainer<LlmModel>>(`${this.base}/models/${modelId}`, model);
    }

    // Best-effort OpenRouter catalog lookup for one key (Edit Model "✨ Auto-Detect").
    // Unmatched keys return result:null — the dialog then stays manual.
    detectModelMetadata(
        key: string,
        providerKey?: string,
    ): Observable<ServiceResultContainer<ModelMetadata | null>> {
        return this.http.post<ServiceResultContainer<ModelMetadata | null>>(
            `${this.base}/models/detect-metadata`,
            { key, providerKey },
        );
    }

    // Bare names of catalog entries with an upstream :free variant — feeds the
    // "free variant exists" hint on locally-configured bare (paid) model keys.
    getFreeVariantKeys(): Observable<ServiceResultContainer<{ bareNames: string[] }>> {
        return this.http.get<ServiceResultContainer<{ bareNames: string[] }>>(
            `${this.base}/models/free-variants`,
        );
    }

    // Soft-disable via PATCH {active:false} — reversible, keeps the row and its test history.
    softDeleteModel(modelId: number): Observable<ServiceResultContainer<void>> {
        return this.http.patch<ServiceResultContainer<void>>(`${this.base}/models/${modelId}`, {
            active: false,
        } as Partial<LlmModel>);
    }

    // Permanent delete via the backend DELETE route — cascades test results (relation cascade) and user_llm_defaults (FK CASCADE).
    deleteModel(modelId: number): Observable<ServiceResultContainer<void>> {
        return this.http.delete<ServiceResultContainer<void>>(`${this.base}/models/${modelId}`);
    }

    findModels(providerId: number): Observable<ServiceResultContainer<LlmModel[]>> {
        return this.http.get<ServiceResultContainer<LlmModel[]>>(`${this.base}/${providerId}/models`);
    }

    testModel(modelId: number): Observable<ServiceResultContainer<any>> {
        return this.http.post<ServiceResultContainer<any>>(`${environment.apiUrl}/llm/models/${modelId}/test`, {});
    }

    // Starts a background test run for every active text model of the provider;
    // results stream into the test history as each model completes.
    testAllModels(providerId: number): Observable<ServiceResultContainer<{ tested: number }>> {
        return this.http.post<ServiceResultContainer<{ tested: number }>>(
            `${environment.apiUrl}/llm/providers/${providerId}/test-all`,
            {},
        );
    }

    // Whether the provider's background test run is still in flight.
    testAllStatus(providerId: number): Observable<ServiceResultContainer<{ running: boolean }>> {
        return this.http.get<ServiceResultContainer<{ running: boolean }>>(
            `${environment.apiUrl}/llm/providers/${providerId}/test-all/status`,
        );
    }

    deleteTestResult(testResultId: number): Observable<ServiceResultContainer<void>> {
        return this.http.delete<ServiceResultContainer<void>>(`${environment.apiUrl}/llm/test-results/${testResultId}`);
    }

    deleteAllTestResultsForModel(modelId: number): Observable<ServiceResultContainer<number>> {
        return this.http.delete<ServiceResultContainer<number>>(`${this.base}/models/${modelId}/test-results`);
    }

    setUserDefaultModel(modelId: number): Observable<{ success: boolean; message: string }> {
        return this.http.post<{ success: boolean; message: string }>(`${environment.apiUrl}/llm/set-default-model`, {
            modelId,
        });
    }

    getUserDefaultModel(): Observable<{ success: boolean; message: string; result: { id: number } | null }> {
        return this.http.get<{ success: boolean; message: string; result: { id: number } | null }>(
            `${environment.apiUrl}/llm/default-model`,
        );
    }
}
