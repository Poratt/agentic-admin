import { ConfigService } from '@nestjs/config';
import { LlmProviderConfigService } from './llm-provider-config.service';

function makeConfigService(overrides: Record<string, string | undefined> = {}): ConfigService {
  return {
    get: jest.fn((key: string) => overrides[key]),
  } as unknown as ConfigService;
}

function makeService(overrides: Record<string, string | undefined> = {}): LlmProviderConfigService {
  const defaults: Record<string, string> = {
    AI_PROVIDER: 'openrouter',
    OPENROUTER_API_KEY: 'test-key',
    OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
    OPENROUTER_MODEL: 'gpt-4o',
  };
  return new LlmProviderConfigService(makeConfigService({ ...defaults, ...overrides }));
}

describe('LlmProviderConfigService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getActiveProvider', () => {
    it('returns provider from env', () => {
      const service = makeService({
        AI_PROVIDER: 'nvidia',
        NVIDIA_API_KEY: 'nv-key',
        NVIDIA_BASE_URL: 'https://integrate.api.nvidia.com/v1',
        NVIDIA_MODEL: 'nv-model',
      });
      expect(service.getActiveProvider()).toBe('nvidia');
    });

    it('returns default openrouter provider', () => {
      const service = makeService();
      expect(service.getActiveProvider()).toBe('openrouter');
    });
  });

  describe('getActiveModel', () => {
    it('returns model from active provider config', () => {
      const service = makeService({
        AI_PROVIDER: 'openrouter',
        OPENROUTER_MODEL: 'claude-3',
      });
      expect(service.getActiveModel()).toBe('claude-3');
    });

    it('returns model from env for ollama provider', () => {
      const service = makeService({
        AI_PROVIDER: 'ollama',
        OLLAMA_API_KEY: 'ollama',
        OLLAMA_BASE_URL: 'http://localhost:11434/v1',
        OLLAMA_MODEL: 'mistral',
      });
      expect(service.getActiveModel()).toBe('mistral');
    });
  });

  describe('getProviderConfig', () => {
    it('returns openrouter config', () => {
      const service = makeService();
      const config = service.getProviderConfig('openrouter');
      expect(config).toEqual({
        id: 'openrouter',
        apiKey: 'test-key',
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'gpt-4o',
      });
    });

    it('returns nvidia config', () => {
      const service = makeService({
        AI_PROVIDER: 'nvidia',
        NVIDIA_API_KEY: 'nv-key',
        NVIDIA_BASE_URL: 'https://integrate.api.nvidia.com/v1',
        NVIDIA_MODEL: 'nv-model',
      });
      const config = service.getProviderConfig('nvidia');
      expect(config.id).toBe('nvidia');
      expect(config.apiKey).toBe('nv-key');
    });

    it('returns agnes-ai config with defaults', () => {
      const service = makeService({
        AI_PROVIDER: 'agnes-ai',
        AGNES_API_KEY: 'agnes-key',
      });
      const config = service.getProviderConfig('agnes-ai');
      expect(config.id).toBe('agnes-ai');
      expect(config.baseUrl).toBe('https://apihub.agnes-ai.com/v1');
      expect(config.model).toBe('agnes-2.0-flash');
    });

    it('returns ollama config with defaults', () => {
      const service = makeService({
        AI_PROVIDER: 'ollama',
        OLLAMA_API_KEY: 'ollama',
      });
      const config = service.getProviderConfig('ollama');
      expect(config.id).toBe('ollama');
      expect(config.apiKey).toBe('ollama');
      expect(config.baseUrl).toBe('http://localhost:11434/v1');
      expect(config.model).toBe('llama3');
    });

    it('returns ollama-cloud config', () => {
      const service = makeService({
        AI_PROVIDER: 'ollama-cloud',
        OLLAMA_CLOUD_API_KEY: 'cloud-key',
        OLLAMA_CLOUD_BASE_URL: 'https://cloud.ollama.com',
        OLLAMA_CLOUD_MODEL: 'cloud-model',
      });
      const config = service.getProviderConfig('ollama-cloud');
      expect(config.id).toBe('ollama-cloud');
      expect(config.apiKey).toBe('cloud-key');
    });

    it('returns huggingface config from env (no ollama fallthrough)', () => {
      const service = makeService({
        AI_PROVIDER: 'huggingface',
        HUGGINGFACE_API_KEY: 'hf-key',
        HUGGINGFACE_BASE_URL: 'https://router.huggingface.co/v1',
        HUGGINGFACE_MODEL: 'deepseek-ai/DeepSeek-V4-Flash',
      });
      const config = service.getProviderConfig('huggingface');
      expect(config).toEqual({
        id: 'huggingface',
        apiKey: 'hf-key',
        baseUrl: 'https://router.huggingface.co/v1',
        model: 'deepseek-ai/DeepSeek-V4-Flash',
      });
    });

    it('returns omniroute config from env (no ollama fallthrough)', () => {
      const service = makeService({
        AI_PROVIDER: 'omniroute',
        OMNIROUTE_API_KEY: 'omni-key',
        OMNIROUTE_BASE_URL: 'http://localhost:20128/v1',
        OMNIROUTE_MODEL: 'auto/best-free',
      });
      const config = service.getProviderConfig('omniroute');
      expect(config).toEqual({
        id: 'omniroute',
        apiKey: 'omni-key',
        baseUrl: 'http://localhost:20128/v1',
        model: 'auto/best-free',
      });
    });

    it('returns unknown provider config (falls through to ollama defaults)', () => {
      const service = makeService({ AI_PROVIDER: 'unknown-provider' });
      const config = service.getProviderConfig('unknown-provider' as any);
      expect(config.id).toBe('unknown-provider');
      expect(config.apiKey).toBe('ollama');
      expect(config.baseUrl).toBe('http://localhost:11434/v1');
    });
  });

  describe('getDefaultHeaders', () => {
    it('returns openrouter headers for openrouter provider', () => {
      const service = makeService();
      const headers = service.getDefaultHeaders('openrouter');
      expect(headers).toEqual({
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'NestJS AI Agent',
      });
    });

    it('returns empty object for nvidia', () => {
      const service = makeService();
      expect(service.getDefaultHeaders('nvidia')).toEqual({});
    });

    it('returns empty object for ollama', () => {
      const service = makeService();
      expect(service.getDefaultHeaders('ollama')).toEqual({});
    });

    it('returns empty object for agnes-ai', () => {
      const service = makeService();
      expect(service.getDefaultHeaders('agnes-ai')).toEqual({});
    });
  });

  describe('isProviderConfigured', () => {
    it('returns true when all fields present', () => {
      const service = makeService();
      expect(service.isProviderConfigured({
        id: 'openrouter',
        apiKey: 'key',
        baseUrl: 'https://api.com',
        model: 'gpt-4o',
      })).toBe(true);
    });

    it('returns false when apiKey is empty', () => {
      const service = makeService();
      expect(service.isProviderConfigured({
        id: 'openrouter',
        apiKey: '',
        baseUrl: 'https://api.com',
        model: 'gpt-4o',
      })).toBe(false);
    });

    it('returns false when baseUrl is empty', () => {
      const service = makeService();
      expect(service.isProviderConfigured({
        id: 'openrouter',
        apiKey: 'key',
        baseUrl: '',
        model: 'gpt-4o',
      })).toBe(false);
    });

    it('returns false when model is empty', () => {
      const service = makeService();
      expect(service.isProviderConfigured({
        id: 'openrouter',
        apiKey: 'key',
        baseUrl: 'https://api.com',
        model: '',
      })).toBe(false);
    });
  });

  describe('getRuntimeSelection', () => {
    it('returns default when no overrides', () => {
      const service = makeService();
      const selection = service.getRuntimeSelection();
      expect(selection).toEqual({ provider: 'openrouter', model: 'gpt-4o' });
    });

    it('applies provider override', () => {
      const service = makeService();
      const selection = service.getRuntimeSelection('nvidia');
      expect(selection.provider).toBe('nvidia');
      expect(selection.model).toBe('gpt-4o');
    });

    it('applies model override', () => {
      const service = makeService();
      const selection = service.getRuntimeSelection(undefined, 'claude-3');
      expect(selection.provider).toBe('openrouter');
      expect(selection.model).toBe('claude-3');
    });

    it('applies both overrides', () => {
      const service = makeService();
      const selection = service.getRuntimeSelection('nvidia', 'nv-model');
      expect(selection).toEqual({ provider: 'nvidia', model: 'nv-model' });
    });
  });

  describe('getProviders', () => {
    it('returns list of all providers', () => {
      const service = makeService();
      const providers = service.getProviders();
      expect(providers).toEqual(['openrouter', 'nvidia', 'ollama', 'ollama-cloud', 'agnes-ai', 'huggingface', 'omniroute']);
    });
  });

  describe('constructor', () => {
    it('throws when AI_PROVIDER is missing', () => {
      expect(() => makeService({ AI_PROVIDER: undefined })).toThrow('Missing AI_PROVIDER');
    });

    it('throws when apiKey is missing', () => {
      expect(() => makeService({
        AI_PROVIDER: 'openrouter',
        OPENROUTER_API_KEY: '',
      })).toThrow('Missing API key');
    });

    it('throws when baseUrl is missing', () => {
      expect(() => makeService({
        AI_PROVIDER: 'openrouter',
        OPENROUTER_API_KEY: 'key',
        OPENROUTER_BASE_URL: '',
      })).toThrow('Missing Base URL');
    });

    it('throws when model is missing', () => {
      expect(() => makeService({
        AI_PROVIDER: 'openrouter',
        OPENROUTER_API_KEY: 'key',
        OPENROUTER_BASE_URL: 'https://api.com',
        OPENROUTER_MODEL: '',
      })).toThrow('Missing Model');
    });
  });
});
