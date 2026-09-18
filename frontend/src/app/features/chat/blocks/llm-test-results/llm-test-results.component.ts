import { Component, computed, input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface LlmTestResultsRenderData {
    results?: { model?: string; provider?: string; status?: string; latencyMs?: number; capability?: string }[];
    summary?: { total?: number; active?: number; failed?: number };
}

@Component({
    selector: 'app-llm-test-results',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './llm-test-results.component.html',
    styleUrl: './llm-test-results.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
})
export class LlmTestResultsComponent {
    data = input.required<LlmTestResultsRenderData>();

    hasResults = computed(() => {
        const r = this.data().results;
        return r != null && r.length > 0;
    });

    activeCount = computed(() => this.data().summary?.active ?? 0);
    totalCount = computed(() => this.data().summary?.total ?? 0);
    failedCount = computed(() => this.data().summary?.failed ?? 0);

    isModelActive(status?: string): boolean {
        return status?.toLowerCase() === 'active';
    }

    isModelFailed(status?: string): boolean {
        return status?.toLowerCase() === 'failed';
    }

    isModelSkipped(status?: string): boolean {
        return status?.toLowerCase() === 'skipped';
    }

    capabilityLabel(capability?: string): string {
        return capability ?? '';
    }
}
