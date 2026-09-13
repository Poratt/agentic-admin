import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmProvider, LlmProviderConfig, LlmRuntimeSelection } from '../types/llm.types';

const LLM_PROVIDERS: LlmProvider[] = ['openrouter', 'nvidia', 'ollama', 'ollama-cloud', 'agnes-ai', 'huggingface', 'omniroute'];

/**
 * Centralizes LLM provider environment configuration and runtime model selection.
 */
@Injectable()
export class LlmProviderConfigService {
  private readonly activeProvider: LlmProvider;
  private readonly activeModel: string;

  constructor(private readonly configService: ConfigService) {
    const provider = this.configService.get<LlmProvider>('AI_PROVIDER');
    if (!provider) {
      throw new Error('Missing AI_PROVIDER environment variable');
    }
    this.activeProvider = provider;

    const providerConfig = this.getProviderConfig(this.activeProvider);

    if (!providerConfig.apiKey) {
      throw new Error(`Missing API key for provider: ${this.activeProvider}`);
    }

    if (!providerConfig.baseUrl) {
      throw new Error(`Missing Base URL for provider: ${this.activeProvider}`);
    }

    if (!providerConfig.model) {
      throw new Error(`Missing Model for provider: ${this.activeProvider}`);
    }

    this.activeModel = providerConfig.model;
  }

  /**
   * Returns the provider selected by the required AI_PROVIDER environment variable.
   *
   * @returns Active provider id used when a request does not supply an override.
   */
  getActiveProvider(): LlmProvider {
    return this.activeProvider;
  }

  /**
   * Returns the active provider's configured model.
   *
   * @returns Model name from the active provider configuration.
   */
  getActiveModel(): string {
    return this.activeModel;
  }

  /**
   * Reads API key, base URL, and model configuration for a provider.
   *
   * @param provider Provider id whose environment-backed config should be returned.
   * @returns Provider configuration with the same defaults used by the legacy LlmService.
   */
  getProviderConfig(provider: LlmProvider): LlmProviderConfig {
    if (provider === 'openrouter') {
      return {
        id: provider,
        apiKey: this.configService.get<string>('OPENROUTER_API_KEY') ?? '',
        baseUrl: this.configService.get<string>('OPENROUTER_BASE_URL') ?? '',
        model: this.configService.get<string>('OPENROUTER_MODEL') ?? '',
      };
    }

    if (provider === 'nvidia') {
      return {
        id: provider,
        apiKey: this.configService.get<string>('NVIDIA_API_KEY') ?? '',
        baseUrl: this.configService.get<string>('NVIDIA_BASE_URL') ?? '',
        model: this.configService.get<string>('NVIDIA_MODEL') ?? '',
      };
    }

    if (provider === 'agnes-ai') {
      return {
        id: provider,
        apiKey: this.configService.get<string>('AGNES_API_KEY') ?? '',
        baseUrl: this.configService.get<string>('AGNES_BASE_URL') ?? 'https://apihub.agnes-ai.com/v1',
        model: this.configService.get<string>('AGNES_MODEL') ?? 'agnes-2.0-flash',
      };
    }

    if (provider === 'ollama-cloud') {
      return {
        id: provider,
        apiKey: this.configService.get<string>('OLLAMA_CLOUD_API_KEY') ?? '',
        baseUrl: this.configService.get<string>('OLLAMA_CLOUD_BASE_URL') ?? '',
        model: this.configService.get<string>('OLLAMA_CLOUD_MODEL') ?? '',
      };
    }

    if (provider === 'huggingface') {
      return {
        id: provider,
        apiKey: this.configService.get<string>('HUGGINGFACE_API_KEY') ?? '',
        baseUrl: this.configService.get<string>('HUGGINGFACE_BASE_URL') ?? 'https://router.huggingface.co/v1',
        model: this.configService.get<string>('HUGGINGFACE_MODEL') ?? '',
      };
    }

    if (provider === 'omniroute') {
      return {
        id: provider,
        apiKey: this.configService.get<string>('OMNIROUTE_API_KEY') ?? '',
        baseUrl: this.configService.get<string>('OMNIROUTE_BASE_URL') ?? '',
        model: this.configService.get<string>('OMNIROUTE_MODEL') ?? '',
      };
    }

    return {
      id: provider,
      apiKey: this.configService.get<string>('OLLAMA_API_KEY') ?? 'ollama',
      baseUrl: this.configService.get<string>('OLLAMA_BASE_URL') ?? 'http://localhost:11434/v1',
      model: this.configService.get<string>('OLLAMA_MODEL') ?? 'llama3',
    };
  }

  /**
   * Returns provider-specific default request headers.
   *
   * @param provider Provider id used to determine whether OpenRouter headers are required.
   * @returns OpenRouter referer/title headers, or an empty object for all other providers.
   */
  getDefaultHeaders(provider: LlmProvider): Record<string, string> {
    if (provider !== 'openrouter') {
      return {};
    }

    return { 'HTTP-Referer': 'http://localhost:3000', 'X-Title': 'NestJS AI Agent' };
  }

  /**
   * Checks whether a provider has all required connection values.
   *
   * @param config Provider configuration to validate.
   * @returns True when API key, base URL, and model are all non-empty.
   */
  isProviderConfigured(config: LlmProviderConfig): boolean {
    return Boolean(config.apiKey && config.baseUrl && config.model);
  }

  /**
   * Resolves the provider and model for one runtime request.
   *
   * @param providerOverride Optional request-level provider override.
   * @param modelOverride Optional request-level model override.
   * @returns Provider/model pair used for the request.
   */
  getRuntimeSelection(providerOverride?: LlmProvider, modelOverride?: string): LlmRuntimeSelection {
    return {
      provider: providerOverride ?? this.activeProvider,
      model: modelOverride ?? this.activeModel,
    };
  }

  /**
   * Returns the configured provider ids exposed by the legacy LLM provider list.
   *
   * @returns Supported provider ids in display/check order.
   */
  getProviders(): LlmProvider[] {
    return LLM_PROVIDERS;
  }
}
