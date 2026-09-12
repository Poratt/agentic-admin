import { Injectable } from '@nestjs/common';
import { ServiceResultContainer } from '../../core/models/service-result-container.model';
import { LlmClientService } from './services/llm-client.service';
import { LlmHealthService } from './services/llm-health.service';
import { LlmProviderConfigService } from './services/llm-provider-config.service';
import { LlmProvider, LlmRequest, LlmResponse, LlmRuntimeSelection } from './types/llm.types';

@Injectable()
export class LlmService {
  constructor(
    private readonly providerConfig: LlmProviderConfigService,
    private readonly client: LlmClientService,
    private readonly health: LlmHealthService,
  ) {}

  getRuntimeSelection(providerOverride?: LlmProvider, modelOverride?: string): LlmRuntimeSelection {
    return this.providerConfig.getRuntimeSelection(providerOverride, modelOverride);
  }

  generateResponse(llmRequest: LlmRequest): Promise<LlmResponse> {
    return this.client.generateResponse(llmRequest);
  }

  generateStream(llmRequest: LlmRequest): AsyncIterable<string> {
    return this.client.generateStream(llmRequest);
  }

  testLlm(
    provider: LlmProvider,
    model: string,
    prompt: string,
    systemContext: string,
    modelId?: number,
  ): Promise<ServiceResultContainer<{ provider: LlmProvider; model: string; available: boolean }>> {
    return this.health.testLlm(provider, model, prompt, systemContext, modelId);
  }
}
