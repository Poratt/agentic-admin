import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { ServiceResultContainer } from '../../../core/models/service-result-container.model';
import { LlmModelCheckTarget, LlmModelTestResult, LlmProvider } from '../types/llm.types';
import { LlmClientService } from './llm-client.service';
import { LlmProviderConfigService } from './llm-provider-config.service';
import { LlmProviderService } from '../../llm-provider/llm-provider.service';

@Injectable()
export class LlmHealthService {
  private readonly logger = new Logger(LlmHealthService.name);

  /** Provider ids with a background test run currently in flight. */
  private readonly providerTestRuns = new Set<number>();

  isProviderTestRunning(providerId: number): boolean {
    return this.providerTestRuns.has(providerId);
  }

  constructor(
    private readonly client: LlmClientService,
    private readonly providerConfig: LlmProviderConfigService,
    private readonly dbProviderService: LlmProviderService,
  ) {}

  /**
   * Tests every active model of ONE provider sequentially (per capability — text, image, or a
   * safe 'skipped' for video) and saves each result (testLlm persists per model). Paced for
   * OpenRouter free-tier limits (~3.5s between free-model calls). The controller kicks this off
   * WITHOUT awaiting — results stream into llm_model_test_results as models complete, and the
   * guard rejects a second concurrent run for the same provider.
   */
  async testProviderModels(providerId: number): Promise<ServiceResultContainer<{ tested: number }>> {
    if (this.providerTestRuns.has(providerId)) {
      throw new BadRequestException('A test run for this provider is already in progress');
    }

    const providersResult = await this.dbProviderService.findProviders();
    const provider = (providersResult.result ?? []).find((p) => p.id === providerId);
    if (!provider) throw new NotFoundException(`Provider with ID ${providerId} not found`);

    const models = (provider.models ?? []).filter((m) => m.active);
    if (models.length === 0) {
      return { success: true, message: 'No active models to test', result: { tested: 0 } };
    }

    this.providerTestRuns.add(providerId);
    void (async () => {
      try {
        for (const model of models) {
          try {
            await this.testLlm(
              provider.key as any,
              model.key,
              'Hello! This is an interactive connection test.',
              'You are a helpful assistant.',
              model.id,
            );
          } catch (error: unknown) {
            // Daily quota exhausted — every remaining call would 429 too. Abort the run.
            if (error instanceof BadRequestException && error.message.includes('quota exhausted')) {
              this.logger.warn(`Provider ${providerId}: daily free-model quota exhausted — aborting test run`);
              return;
            }
            // Capability gate or provider error for this model — continue with the rest.
          }
          const paced = model.key.toLowerCase().includes(':free') || provider.key === 'openrouter';
          await new Promise((resolve) => setTimeout(resolve, paced ? 3_500 : 1_000));
        }
      } finally {
        this.providerTestRuns.delete(providerId);
      }
    })();

    return {
      success: true,
      message: `Testing ${models.length} models in the background`,
      result: { tested: models.length },
    };
  }

  async testLlm(
    provider: LlmProvider,
    model: string,
    prompt: string,
    systemContext: string,
    modelId?: number,
  ): Promise<ServiceResultContainer<{ provider: LlmProvider; model: string; available: boolean }>> {
    const runtimeSelection = this.providerConfig.getRuntimeSelection(provider, model);

    // Resolve the DB row once for both the capability dispatch and result persistence.
    // When the caller knows the model id (UI "test now"), resolve by it — model
    // keys are only unique per provider, so a key-only lookup can hit the wrong
    // provider's row and save the result to a different model.
    const dbModel = modelId ? await this.dbProviderService.findModelById(modelId) : await this.dbProviderService.findModelByKey(model);
    const capability = dbModel?.capability ?? 'text';

    const startTime = performance.now();

    let status: 'success' | 'error' | 'timeout' | 'skipped' = 'success';
    let errorMessage: string | null = null;
    let available = false;
    let rejection: BadRequestException | null = null;

    try {
      switch (capability) {
        case 'text':
          available = await this.testTextModel(provider, model, prompt, systemContext);
          break;
        case 'image':
          ({ available, status, errorMessage } = await this.testImageModel(provider, model));
          break;
        case 'video':
          // A video render starts billing on the first 200 OK, and no safe cancel / dry-run path is
          // verified for the catalog's only video provider (Agnes) yet — a video test is
          // deliberately recorded as 'skipped' rather than run, so one "Test" click can never
          // rack up a render charge.
          status = 'skipped';
          errorMessage = 'No safe video ping for provider';
          break;
        default:
          throw new BadRequestException(`No test implemented for capability: ${capability}`);
      }

      if (available === false && status === 'success') {
        status = 'error';
        errorMessage = 'Model returned empty response';
      }
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        // A capability with no implemented test (or a rejected call) is a config fault — the
        // failure is persisted below and re-thrown so the controller answers 400.
        rejection = error;
        status = 'error';
        errorMessage = error.message;
      } else {
        available = false;
        errorMessage = error instanceof Error ? error.message : 'Unknown connection error';

        // Detect Timeout errors by the error content
        if (errorMessage.toLowerCase().includes('timeout') || errorMessage.toLowerCase().includes('aborted')) {
          status = 'timeout';
        } else {
          status = 'error';
        }
      }
    }

    const endTime = performance.now();
    const responseTimeMs = Math.round(endTime - startTime);

    // 🚀 Save the result to the DB 🚀
    try {
      if (dbModel) {
        await this.dbProviderService.saveTestResult(dbModel.id, responseTimeMs, status, errorMessage, capability);
      }
    } catch (dbError) {
      console.error('Failed to save LLM test result to database:', dbError);
    }

    // Daily-quota exhaustion is deterministic — surface it loudly so batch runs
    // (test-all) can abort immediately instead of grinding through the rest.
    if (errorMessage?.includes('free-models-per-day')) {
      throw new BadRequestException('OpenRouter daily free-model quota exhausted — add credits or wait for the daily reset');
    }

    // Rethrow after the persisted 'error' row above: a 400 tells the UI the model cannot be
    // tested at all, which is different from the model being broken.
    if (rejection) {
      throw rejection;
    }

    const isSkipped = status === 'skipped';
    return {
      success: status === 'success' || isSkipped,
      message: isSkipped
        ? errorMessage ?? 'Test skipped'
        : status === 'success'
          ? 'LLM check completed successfully.'
          : `LLM check failed: ${errorMessage}`,
      result: {
        provider: runtimeSelection.provider,
        model: runtimeSelection.model,
        available,
      },
    };
  }

  /** Text ping — the original connectivity check. `generateResponse` records its own stats row. */
  private async testTextModel(provider: LlmProvider, model: string, prompt: string, systemContext: string): Promise<boolean> {
    const response = await this.client.generateResponse({
      prompt: prompt || 'Hello',
      systemContext: systemContext || 'You are a helpful assistant.',
      providerOverride: provider,
      modelOverride: model,
      // Marks this as a connectivity ping — generateResponse records it to llm_call_stats with
      // isTest=true (excluded from the real-usage statistics), keeping the Ping half of the
      // Statistics tab on the same data plane as real usage.
      caller: 'health',
      isTest: true,
    });

    return Boolean(response.content || response.toolCalls?.length);
  }

  /**
   * Image ping — a single minimal generation through the client's own image path, asserted on a
   * non-empty url/base64 result. Unlike generateResponse, the image path records no stats of its
   * own, so the ping mirrors the plumbing here (isTest=true).
   */
  private async testImageModel(
    provider: LlmProvider,
    model: string,
  ): Promise<{ available: boolean; status: 'success' | 'error' | 'timeout'; errorMessage: string | null }> {
    const startTime = performance.now();
    let status: 'success' | 'error' | 'timeout' = 'success';
    let errorMessage: string | null = null;
    let available = false;

    try {
      const image = await this.client.generateImage({ provider, model, prompt: 'Single red pixel.', size: '1024x1024' });
      available = Boolean(image.url || image.b64Json);
      if (!available) {
        throw new Error('Image generation returned no data');
      }
    } catch (error: unknown) {
      available = false;
      errorMessage = error instanceof Error ? error.message : 'Unknown connection error';

      if (errorMessage.toLowerCase().includes('timeout') || errorMessage.toLowerCase().includes('aborted')) {
        status = 'timeout';
      } else {
        status = 'error';
      }
    }

    this.client.recordCallStat(
      provider,
      model,
      Math.round(performance.now() - startTime),
      status,
      'health',
      errorMessage ? new Error(errorMessage) : null,
      null, // image pings never request tools — reliability has nothing to measure
      true, // isTest — connectivity ping, excluded from the real-usage statistics
    );

    return { available, status, errorMessage };
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
        // Daily quota exhausted — remaining models would 429 too. Stop the batch run.
        if (e instanceof BadRequestException && e.message.includes('quota exhausted')) {
          break;
        }
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
