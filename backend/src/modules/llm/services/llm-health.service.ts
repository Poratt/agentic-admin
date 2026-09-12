import { Injectable, BadRequestException } from '@nestjs/common';
import { ServiceResultContainer } from '../../../core/models/service-result-container.model';
import { LlmModelCheckTarget, LlmModelTestResult, LlmProvider } from '../types/llm.types';
import { LlmClientService } from './llm-client.service';
import { LlmProviderConfigService } from './llm-provider-config.service';
import { LlmProviderService } from '../../llm-provider/llm-provider.service';

@Injectable()
export class LlmHealthService {
  constructor(
    private readonly client: LlmClientService,
    private readonly providerConfig: LlmProviderConfigService,
    private readonly dbProviderService: LlmProviderService,
  ) {}

  async testLlm(
    provider: LlmProvider,
    model: string,
    prompt: string,
    systemContext: string,
    modelId?: number,
  ): Promise<ServiceResultContainer<{ provider: LlmProvider; model: string; available: boolean }>> {
    const runtimeSelection = this.providerConfig.getRuntimeSelection(provider, model);

    // Resolve the DB row once for both the capability gate and result persistence.
    // When the caller knows the model id (UI "test now"), resolve by it — model
    // keys are only unique per provider, so a key-only lookup can hit the wrong
    // provider's row and save the result to a different model.
    const dbModel = modelId ? await this.dbProviderService.findModelById(modelId) : await this.dbProviderService.findModelByKey(model);
    if (dbModel && dbModel.capability && dbModel.capability !== 'text') {
      throw new BadRequestException(`Model ${model} (${dbModel.capability}) does not support text chat testing`);
    }

    const startTime = performance.now();

    let status: 'success' | 'error' | 'timeout' = 'success';
    let errorMessage: string | null = null;
    let available = false;

    try {
      const response = await this.client.generateResponse({
        prompt: prompt || 'Hello',
        systemContext: systemContext || 'You are a helpful assistant.',
        providerOverride: provider,
        modelOverride: model,
      });

      available = Boolean(response.content || response.toolCalls?.length);

      if (!available) {
        status = 'error';
        errorMessage = 'Model returned empty response';
      }
    } catch (error: unknown) {
      available = false;
      errorMessage = error instanceof Error ? error.message : 'Unknown connection error';

      // Detect Timeout errors by the error content
      if (errorMessage.toLowerCase().includes('timeout') || errorMessage.toLowerCase().includes('aborted')) {
        status = 'timeout';
      } else {
        status = 'error';
      }
    }

    const endTime = performance.now();
    const responseTimeMs = Math.round(endTime - startTime);

    // 🚀 Save the result to the DB 🚀
    try {
      if (dbModel) {
        await this.dbProviderService.saveTestResult(dbModel.id, responseTimeMs, status, errorMessage);
      }
    } catch (dbError) {
      console.error('Failed to save LLM test result to database:', dbError);
    }

    return {
      success: status === 'success',
      message: status === 'success' ? 'LLM check completed successfully.' : `LLM check failed: ${errorMessage}`,
      result: {
        provider: runtimeSelection.provider,
        model: runtimeSelection.model,
        available,
      },
    };
  }

  /**
   * Rate-limit aware model testing with batching.
   *
   * OpenRouter free-models-per-min limit ≈ 10 req/min.
   * Strategy: batch models into small groups, wait ~8s between batches
   * (leaving headroom), and add 3s intra-batch delay for free models.
   * Paid models (no "free" in key) only need 1s intra-batch delay.
   */
  async testAllModels(): Promise<ServiceResultContainer<LlmModelTestResult[]>> {
    const models = await this.getModelCheckTargets();
    const results: LlmModelTestResult[] = [];

    // Batch size tuned to stay well under the ~10 req/min OpenRouter free limit.
    // 3 free models per batch → 3 batches × ~8s pause = ~24s total, comfortably
    // within a 1-minute window. Leave 1 slot of headroom.
    const BATCH_SIZE = 3;
    const BATCH_PAUSE_MS = 8_000; // pause between batches
    const FREE_MODEL_DELAY_MS = 3_000;
    const PAID_MODEL_DELAY_MS = 1_000;

    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      const isFreeModel = model.name.toLowerCase().includes('free');
      const intraDelay = isFreeModel ? FREE_MODEL_DELAY_MS : PAID_MODEL_DELAY_MS;

      try {
        const check = await this.testLlm(
          model.provider,
          model.name,
          'Hello! This is a connectivity test. Please respond with "OK"',
          'You are a helpful assistant.',
          model.id,
        );

        results.push({
          name: model.name,
          provider: model.provider,
          available: check.result.available,
        });
      } catch (e) {
        results.push({
          name: model.name,
          provider: model.provider,
          available: false,
        });
      }

      // Delay after each model within a batch
      await new Promise((resolve) => setTimeout(resolve, intraDelay));

      // Pause between batches (but not after the very last model)
      const isEndOfBatch = (i + 1) % BATCH_SIZE === 0;
      const isLastModel = i === models.length - 1;
      if (isEndOfBatch && !isLastModel) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_PAUSE_MS));
      }
    }

    return {
      success: true,
      message: 'All LLM models tested successfully.',
      result: results,
    };
  }

  private async getModelCheckTargets(): Promise<LlmModelCheckTarget[]> {
    const models: LlmModelCheckTarget[] = [];
    const activeProvider = this.providerConfig.getActiveProvider();
    const activeModel = this.providerConfig.getActiveModel();

    const dbProvidersResult = await this.dbProviderService.findProviders();

    if (dbProvidersResult.success && dbProvidersResult.result) {
      for (const provider of dbProvidersResult.result) {
        if (!provider.active) continue;

        for (const model of provider.models || []) {
          if (!model.active) continue;

          // Only text models participate in the chat-style connectivity health check.
          if (model.capability && model.capability !== 'text') continue;

          models.push({
            id: model.id,
            provider: provider.key as any,
            name: model.key,
            active: provider.key === activeProvider && model.key === activeModel,
          });
        }
      }
    }

    return models;
  }
}
