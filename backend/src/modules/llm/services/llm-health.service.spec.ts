import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LlmHealthService } from './llm-health.service';
import { LlmClientService } from './llm-client.service';
import { LlmProviderConfigService } from './llm-provider-config.service';
import { LlmProviderService } from '../../llm-provider/llm-provider.service';

function makeClientService(): LlmClientService {
  return {
    generateResponse: jest.fn(),
    generateImage: jest.fn(),
    recordCallStat: jest.fn(),
  } as unknown as LlmClientService;
}

function makeProviderConfigService(overrides: { activeProvider?: string; activeModel?: string } = {}): LlmProviderConfigService {
  return {
    getActiveProvider: jest.fn().mockReturnValue(overrides.activeProvider ?? 'openrouter'),
    getActiveModel: jest.fn().mockReturnValue(overrides.activeModel ?? 'gpt-4o'),
    getRuntimeSelection: jest.fn().mockImplementation((p?: string, m?: string) => ({
      provider: p ?? overrides.activeProvider ?? 'openrouter',
      model: m ?? overrides.activeModel ?? 'gpt-4o',
    })),
  } as unknown as LlmProviderConfigService;
}

function makeDbProviderService(): LlmProviderService {
  return {
    findProviders: jest.fn(),
    findModelByKey: jest.fn(),
    findModelById: jest.fn(),
    saveTestResult: jest.fn(),
  } as unknown as LlmProviderService;
}

function makeHealthService(overrides?: {
  client?: LlmClientService;
  providerConfig?: LlmProviderConfigService;
  dbProviderService?: LlmProviderService;
}): LlmHealthService {
  return new LlmHealthService(
    overrides?.client ?? makeClientService(),
    overrides?.providerConfig ?? makeProviderConfigService(),
    overrides?.dbProviderService ?? makeDbProviderService(),
  );
}

describe('LlmHealthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('testLlm', () => {
    it('returns success when generateResponse returns content', async () => {
      const client = makeClientService();
      const dbProviderService = makeDbProviderService();
      (client.generateResponse as jest.Mock).mockResolvedValue({ content: 'OK' });
      (dbProviderService.findModelByKey as jest.Mock).mockResolvedValue(null);

      const service = makeHealthService({ client, dbProviderService });
      const result = await service.testLlm('openrouter', 'gpt-4o', 'Hello', 'You are helpful');

      expect(client.generateResponse).toHaveBeenCalledWith({
        prompt: 'Hello',
        systemContext: 'You are helpful',
        providerOverride: 'openrouter',
        modelOverride: 'gpt-4o',
        caller: 'health',
        isTest: true,
      });
      expect(result.success).toBe(true);
      expect(result.result.available).toBe(true);
    });

    it('returns success when generateResponse returns toolCalls', async () => {
      const client = makeClientService();
      const dbProviderService = makeDbProviderService();
      (client.generateResponse as jest.Mock).mockResolvedValue({
        content: null,
        toolCalls: [{ id: '1', type: 'function', function: { name: 'test', arguments: '{}' } }],
      });
      (dbProviderService.findModelByKey as jest.Mock).mockResolvedValue(null);

      const service = makeHealthService({ client, dbProviderService });
      const result = await service.testLlm('openrouter', 'gpt-4o', 'Hello', 'ctx');

      expect(result.success).toBe(true);
      expect(result.result.available).toBe(true);
    });

    it('returns error when generateResponse throws', async () => {
      const client = makeClientService();
      const dbProviderService = makeDbProviderService();
      (client.generateResponse as jest.Mock).mockRejectedValue(new Error('Connection refused'));
      (dbProviderService.findModelByKey as jest.Mock).mockResolvedValue(null);

      const service = makeHealthService({ client, dbProviderService });
      const result = await service.testLlm('openrouter', 'gpt-4o', 'Hello', 'ctx');

      expect(result.success).toBe(false);
      expect(result.result.available).toBe(false);
      expect(result.message).toContain('Connection refused');
    });

    it('detects timeout errors', async () => {
      const client = makeClientService();
      const dbProviderService = makeDbProviderService();
      (client.generateResponse as jest.Mock).mockRejectedValue(new Error('Request aborted due to timeout'));
      (dbProviderService.findModelByKey as jest.Mock).mockResolvedValue(null);

      const service = makeHealthService({ client, dbProviderService });
      const result = await service.testLlm('openrouter', 'gpt-4o', 'Hello', 'ctx');

      expect(result.success).toBe(false);
    });

    it('tests an image model through generateImage and records the stat as a test ping', async () => {
      const client = makeClientService();
      const dbProviderService = makeDbProviderService();
      (client.generateImage as jest.Mock).mockResolvedValue({ url: 'https://example.com/pixel.png', size: '1024x1024' });
      (dbProviderService.findModelByKey as jest.Mock).mockResolvedValue({ id: 1, capability: 'image' });
      (dbProviderService.saveTestResult as jest.Mock).mockResolvedValue({});

      const service = makeHealthService({ client, dbProviderService });
      const result = await service.testLlm('agnes-ai', 'agnes-image-2.1-flash', 'Hello', 'ctx');

      expect(client.generateImage).toHaveBeenCalledWith({
        provider: 'agnes-ai',
        model: 'agnes-image-2.1-flash',
        prompt: 'Single red pixel.',
        size: '1024x1024',
      });
      expect(client.recordCallStat).toHaveBeenCalledWith(
        'agnes-ai',
        'agnes-image-2.1-flash',
        expect.any(Number),
        'success',
        'health',
        null,
        null,
        true,
      );
      expect(dbProviderService.saveTestResult).toHaveBeenCalledWith(1, expect.any(Number), 'success', null, 'image');
      expect(result.success).toBe(true);
      expect(result.result.available).toBe(true);
    });

    it('records an image model test failure', async () => {
      const client = makeClientService();
      const dbProviderService = makeDbProviderService();
      (client.generateImage as jest.Mock).mockRejectedValue(new Error('image API down'));
      (dbProviderService.findModelByKey as jest.Mock).mockResolvedValue({ id: 1, capability: 'image' });
      (dbProviderService.saveTestResult as jest.Mock).mockResolvedValue({});

      const service = makeHealthService({ client, dbProviderService });
      const result = await service.testLlm('agnes-ai', 'agnes-image-2.1-flash', 'Hello', 'ctx');

      expect(client.recordCallStat).toHaveBeenCalledWith(
        'agnes-ai',
        'agnes-image-2.1-flash',
        expect.any(Number),
        'error',
        'health',
        expect.any(Error),
        null,
        true,
      );
      expect(dbProviderService.saveTestResult).toHaveBeenCalledWith(1, expect.any(Number), 'error', 'image API down', 'image');
      expect(result.success).toBe(false);
      expect(result.result.available).toBe(false);
    });

    it('skips video models without hitting the provider — no safe cheap ping yet', async () => {
      const client = makeClientService();
      const dbProviderService = makeDbProviderService();
      (dbProviderService.findModelByKey as jest.Mock).mockResolvedValue({ id: 3, capability: 'video' });
      (dbProviderService.saveTestResult as jest.Mock).mockResolvedValue({});

      const service = makeHealthService({ client, dbProviderService });
      const result = await service.testLlm('agnes-ai', 'agnes-video-v2.0', 'Hello', 'ctx');

      expect(client.generateResponse).not.toHaveBeenCalled();
      expect(client.generateImage).not.toHaveBeenCalled();
      expect(dbProviderService.saveTestResult).toHaveBeenCalledWith(3, expect.any(Number), 'skipped', expect.stringContaining('No safe video'), 'video');
      expect(result.success).toBe(true);
      expect(result.result.available).toBe(false);
    });

    it('rejects an unimplemented capability with a 400 and still records the error', async () => {
      const dbProviderService = makeDbProviderService();
      (dbProviderService.findModelByKey as jest.Mock).mockResolvedValue({ id: 9, capability: 'embedding' });
      (dbProviderService.saveTestResult as jest.Mock).mockResolvedValue({});

      const service = makeHealthService({ dbProviderService });
      await expect(service.testLlm('openrouter', 'some-embedding-model', 'Hello', 'ctx')).rejects.toThrow(
        'No test implemented for capability: embedding',
      );

      expect(dbProviderService.saveTestResult).toHaveBeenCalledWith(
        9,
        expect.any(Number),
        'error',
        'No test implemented for capability: embedding',
        'embedding',
      );
    });

    it('saves test result to DB', async () => {
      const client = makeClientService();
      const dbProviderService = makeDbProviderService();
      (client.generateResponse as jest.Mock).mockResolvedValue({ content: 'OK' });
      (dbProviderService.findModelByKey as jest.Mock).mockResolvedValue({ id: 42, capability: 'text' });
      (dbProviderService.saveTestResult as jest.Mock).mockResolvedValue({});

      const service = makeHealthService({ client, dbProviderService });
      await service.testLlm('openrouter', 'gpt-4o', 'Hello', 'ctx');

      expect(dbProviderService.saveTestResult).toHaveBeenCalledWith(42, expect.any(Number), 'success', null, 'text');
    });

    it('saves by model id when provided — duplicate keys across providers must not misroute the result', async () => {
      const client = makeClientService();
      const dbProviderService = makeDbProviderService();
      (client.generateResponse as jest.Mock).mockResolvedValue({ content: 'OK' });
      // key-only lookup hits the wrong provider's row (id 7); the id lookup is the tested model (id 42)
      (dbProviderService.findModelByKey as jest.Mock).mockResolvedValue({ id: 7, capability: 'text' });
      (dbProviderService.findModelById as jest.Mock).mockResolvedValue({ id: 42, capability: 'text' });
      (dbProviderService.saveTestResult as jest.Mock).mockResolvedValue({});

      const service = makeHealthService({ client, dbProviderService });
      await service.testLlm('openrouter', 'openai/gpt-oss-20b', 'Hello', 'ctx', 42);

      expect(dbProviderService.findModelById).toHaveBeenCalledWith(42);
      expect(dbProviderService.saveTestResult).toHaveBeenCalledWith(42, expect.any(Number), 'success', null, 'text');
    });

    it('saves the error result and throws BadRequest on daily-quota exhaustion', async () => {
      const client = makeClientService();
      const dbProviderService = makeDbProviderService();
      (client.generateResponse as jest.Mock).mockRejectedValue(new Error('429 Rate limit exceeded: free-models-per-day. Add 10 credits'));
      (dbProviderService.findModelById as jest.Mock).mockResolvedValue({ id: 42, capability: 'text' });
      (dbProviderService.saveTestResult as jest.Mock).mockResolvedValue({});

      const service = makeHealthService({ client, dbProviderService });

      await expect(service.testLlm('openrouter', 'gpt-4o', 'Hello', 'ctx', 42)).rejects.toThrow(BadRequestException);
      // the failed attempt is still recorded before the throw
      expect(dbProviderService.saveTestResult).toHaveBeenCalledWith(42, expect.any(Number), 'error', expect.stringContaining('free-models-per-day'), 'text');
    });
  });

  describe('testAllModels', () => {
    it('iterates models and returns results array', async () => {
      const client = makeClientService();
      const providerConfig = makeProviderConfigService();
      const dbProviderService = makeDbProviderService();

      (dbProviderService.findProviders as jest.Mock).mockResolvedValue({
        success: true,
        result: [
          {
            key: 'openrouter',
            active: true,
            models: [
              { key: 'gpt-4o', active: true, capability: 'text' },
              { key: 'gpt-4o-mini', active: true, capability: 'text' },
            ],
          },
        ],
      });

      (dbProviderService.findModelByKey as jest.Mock).mockResolvedValue(null);
      (client.generateResponse as jest.Mock).mockResolvedValue({ content: 'OK' });

      const service = makeHealthService({ client, providerConfig, dbProviderService });
      const result = await service.testAllModels();

      expect(result.success).toBe(true);
      expect(result.result).toHaveLength(2);
      expect(result.result![0].available).toBe(true);
      expect(result.result![1].available).toBe(true);
    });

    it('skips inactive providers', async () => {
      const providerConfig = makeProviderConfigService();
      const dbProviderService = makeDbProviderService();

      (dbProviderService.findProviders as jest.Mock).mockResolvedValue({
        success: true,
        result: [
          {
            key: 'openrouter',
            active: false,
            models: [{ key: 'gpt-4o', active: true, capability: 'text' }],
          },
        ],
      });

      const service = makeHealthService({ providerConfig, dbProviderService });
      const result = await service.testAllModels();

      expect(result.result).toHaveLength(0);
    });

    it('tests image models and safely skips video models inside a test-all run', async () => {
      const client = makeClientService();
      const providerConfig = makeProviderConfigService();
      const dbProviderService = makeDbProviderService();

      (dbProviderService.findProviders as jest.Mock).mockResolvedValue({
        success: true,
        result: [
          {
            key: 'openrouter',
            active: true,
            models: [
              { id: 1, key: 'gpt-4o', active: true, capability: 'text' },
              { id: 2, key: 'dall-e', active: true, capability: 'image' },
              { id: 3, key: 'video-model', active: true, capability: 'video' },
            ],
          },
        ],
      });

      (dbProviderService.findModelById as jest.Mock).mockImplementation((id: number) =>
        Promise.resolve({ id, capability: id === 1 ? 'text' : id === 2 ? 'image' : 'video' }),
      );
      (dbProviderService.findModelByKey as jest.Mock).mockResolvedValue(null);
      (client.generateResponse as jest.Mock).mockResolvedValue({ content: 'OK' });
      (client.generateImage as jest.Mock).mockResolvedValue({ url: 'https://example.com/pixel.png' });
      (dbProviderService.saveTestResult as jest.Mock).mockResolvedValue({});

      const service = makeHealthService({ client, providerConfig, dbProviderService });
      const result = await service.testAllModels();

      expect(client.generateImage).toHaveBeenCalled();
      expect(result.result).toHaveLength(3);
      expect(result.result![0].available).toBe(true);
      expect(result.result![1].available).toBe(true);
      expect(result.result![2].available).toBe(false);
      expect(dbProviderService.saveTestResult).toHaveBeenCalledWith(3, expect.any(Number), 'skipped', expect.any(String), 'video');
    });

    it('handles empty provider list', async () => {
      const providerConfig = makeProviderConfigService();
      const dbProviderService = makeDbProviderService();

      (dbProviderService.findProviders as jest.Mock).mockResolvedValue({
        success: true,
        result: [],
      });

      const service = makeHealthService({ providerConfig, dbProviderService });
      const result = await service.testAllModels();

      expect(result.success).toBe(true);
      expect(result.result).toEqual([]);
    });

    it('marks unavailable models when generateResponse throws', async () => {
      const client = makeClientService();
      const providerConfig = makeProviderConfigService();
      const dbProviderService = makeDbProviderService();

      (dbProviderService.findProviders as jest.Mock).mockResolvedValue({
        success: true,
        result: [
          {
            key: 'openrouter',
            active: true,
            models: [{ key: 'gpt-4o', active: true, capability: 'text' }],
          },
        ],
      });

      (dbProviderService.findModelByKey as jest.Mock).mockResolvedValue(null);
      (client.generateResponse as jest.Mock).mockRejectedValue(new Error('fail'));

      const service = makeHealthService({ client, providerConfig, dbProviderService });
      const result = await service.testAllModels();

      expect(result.result![0].available).toBe(false);
    });
  });

  describe('testProviderModels', () => {
    it('rejects a second concurrent run for the same provider', async () => {
      const client = makeClientService();
      const providerConfig = makeProviderConfigService();
      const dbProviderService = makeDbProviderService();
      (dbProviderService.findProviders as jest.Mock).mockResolvedValue({
        success: true,
        result: [
          {
            id: 12,
            key: 'nvidia',
            active: true,
            models: [{ id: 1, key: 'moonshotai/kimi-k2.6', active: true, capability: 'text' }],
          },
        ],
      });
      (client.generateResponse as jest.Mock).mockResolvedValue({ content: 'OK' });

      const service = makeHealthService({ client, providerConfig, dbProviderService });
      const first = await service.testProviderModels(12);
      expect(first.result!.tested).toBe(1);

      await expect(service.testProviderModels(12)).rejects.toThrow(BadRequestException);
    });

    it('returns tested 0 with no background run when the provider has no active text models', async () => {
      const dbProviderService = makeDbProviderService();
      (dbProviderService.findProviders as jest.Mock).mockResolvedValue({
        success: true,
        result: [{ id: 12, key: 'nvidia', active: true, models: [] }],
      });

      const service = makeHealthService({ dbProviderService });
      const result = await service.testProviderModels(12);

      expect(result.result!.tested).toBe(0);
    });

    it('throws NotFound for an unknown provider', async () => {
      const dbProviderService = makeDbProviderService();
      (dbProviderService.findProviders as jest.Mock).mockResolvedValue({ success: true, result: [] });

      const service = makeHealthService({ dbProviderService });
      await expect(service.testProviderModels(99)).rejects.toThrow(NotFoundException);
    });
  });
});
