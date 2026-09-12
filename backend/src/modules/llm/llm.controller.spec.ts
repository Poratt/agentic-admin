import { NotFoundException, BadRequestException } from '@nestjs/common';
import { LlmController } from './llm.controller';
import { LlmService } from './llm.service';
import { LlmClientService } from './services/llm-client.service';
import { LlmHealthService } from './services/llm-health.service';
import { LlmProviderService } from '../llm-provider/llm-provider.service';

function makeLlmService(): LlmService {
  return {
    generateResponse: jest.fn(),
    generateStream: jest.fn(),
    testLlm: jest.fn(),
    getRuntimeSelection: jest.fn(),
  } as unknown as LlmService;
}

function makeClientService(): LlmClientService {
  return {
    generateImage: jest.fn(),
    createVideoTask: jest.fn(),
    createVideoTaskAndWait: jest.fn(),
    extendVideo: jest.fn(),
    getVideoResult: jest.fn(),
    generateResponse: jest.fn(),
    generateStream: jest.fn(),
  } as unknown as LlmClientService;
}

function makeHealthService(): LlmHealthService {
  return {
    testLlm: jest.fn(),
    testAllModels: jest.fn(),
  } as unknown as LlmHealthService;
}

function makeDbProviderService(): LlmProviderService {
  return {
    findProviders: jest.fn(),
    findModelById: jest.fn(),
    findModelByKey: jest.fn(),
    saveTestResult: jest.fn(),
    deleteTestResult: jest.fn(),
    deleteOldTestResults: jest.fn(),
    setUserDefaultModel: jest.fn(),
    getUserDefaultModel: jest.fn(),
  } as unknown as LlmProviderService;
}

function makeController(overrides?: {
  healthService?: LlmHealthService;
  dbProviderService?: LlmProviderService;
  client?: LlmClientService;
}): LlmController {
  return new LlmController(
    overrides?.healthService ?? makeHealthService(),
    overrides?.dbProviderService ?? makeDbProviderService(),
    overrides?.client ?? makeClientService(),
  );
}

const IMAGE_MODEL = {
  id: 10,
  key: 'agnes-image',
  active: true,
  capability: 'image',
  provider: { key: 'agnes-ai' },
};

const VIDEO_MODEL = {
  id: 14,
  key: 'agnes-video',
  active: true,
  capability: 'video',
  provider: { key: 'agnes-ai' },
};

const TEXT_MODEL = {
  id: 1,
  key: 'gpt-4o',
  active: true,
  capability: 'text',
  provider: { key: 'openrouter' },
};

describe('LlmController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /llm/image/generate', () => {
    it('calls client.generateImage and returns result', async () => {
      const client = makeClientService();
      const dbProviderService = makeDbProviderService();
      (client.generateImage as jest.Mock).mockResolvedValue({ url: 'https://img.test/img.png' });
      (dbProviderService.findModelById as jest.Mock).mockResolvedValue(IMAGE_MODEL);

      const controller = makeController({ client, dbProviderService });
      const result = await controller.generateImage({
        prompt: 'a cat',
        modelId: 10,
      });

      expect(client.generateImage).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'a cat',
          model: 'agnes-image',
        }),
      );
      expect(result.success).toBe(true);
      expect(result.result).toHaveProperty('url', 'https://img.test/img.png');
      expect(result.result).toHaveProperty('model', 'agnes-image');
    });
  });

  describe('POST /llm/video/generate', () => {
    it('calls client.createVideoTaskAndWait and returns result', async () => {
      const client = makeClientService();
      const dbProviderService = makeDbProviderService();
      (client.createVideoTaskAndWait as jest.Mock).mockResolvedValue({
        videoId: 'vid_1',
        status: 'completed',
        url: 'https://cdn.test/vid.mp4',
      });
      (dbProviderService.findModelById as jest.Mock).mockResolvedValue(VIDEO_MODEL);

      const controller = makeController({ client, dbProviderService });
      const result = await controller.createVideo({
        prompt: 'ocean waves',
        modelId: 14,
      });

      expect(client.createVideoTaskAndWait).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'ocean waves',
          model: 'agnes-video',
        }),
      );
      expect(result.success).toBe(true);
      expect(result.result).toHaveProperty('videoId', 'vid_1');
    });
  });

  describe('GET /llm/video/:videoId', () => {
    it('calls client.getVideoResult and returns result', async () => {
      const client = makeClientService();
      const dbProviderService = makeDbProviderService();
      (client.getVideoResult as jest.Mock).mockResolvedValue({
        status: 'completed',
        url: 'https://cdn.test/vid.mp4',
      });
      (dbProviderService.findModelById as jest.Mock).mockResolvedValue(VIDEO_MODEL);

      const controller = makeController({ client, dbProviderService });
      const result = await controller.getVideo('vid_1', '14');

      expect(client.getVideoResult).toHaveBeenCalledWith('vid_1', 'agnes-ai');
      expect(result.success).toBe(true);
      expect(result.result).toHaveProperty('status', 'completed');
    });
  });

  describe('POST /llm/video/extend', () => {
    it('calls client.extendVideo with sourceVideoId', async () => {
      const client = makeClientService();
      const dbProviderService = makeDbProviderService();
      (client.extendVideo as jest.Mock).mockResolvedValue({
        videoId: 'vid_2',
        status: 'completed',
      });
      (dbProviderService.findModelById as jest.Mock).mockResolvedValue(VIDEO_MODEL);

      const controller = makeController({ client, dbProviderService });
      const result = await controller.extendVideo({
        prompt: 'continue the scene',
        sourceVideoId: 'vid_1',
        modelId: 14,
      });

      expect(client.extendVideo).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceVideoId: 'vid_1',
          prompt: 'continue the scene',
        }),
      );
      expect(result.success).toBe(true);
      expect(result.result).toHaveProperty('videoId', 'vid_2');
    });

    it('throws BadRequestException when no source provided', async () => {
      const dbProviderService = makeDbProviderService();
      (dbProviderService.findModelById as jest.Mock).mockResolvedValue(VIDEO_MODEL);

      const controller = makeController({ dbProviderService });
      await expect(controller.extendVideo({ prompt: 'continue', modelId: 14 })).rejects.toThrow(
        'extendVideo requires sourceVideoId or sourceVideoUrl',
      );
    });
  });

  describe('POST /llm/models/:id/test', () => {
    it('calls healthService.testLlm when model found', async () => {
      const healthService = makeHealthService();
      const dbProviderService = makeDbProviderService();
      (dbProviderService.findModelById as jest.Mock).mockResolvedValue(TEXT_MODEL);
      (healthService.testLlm as jest.Mock).mockResolvedValue({
        success: true,
        result: { provider: 'openrouter', model: 'gpt-4o', available: true },
      });

      const controller = makeController({ healthService, dbProviderService });
      const result = await controller.testModel('1');

      expect(healthService.testLlm).toHaveBeenCalledWith('openrouter', 'gpt-4o', expect.any(String), expect.any(String), TEXT_MODEL.id);
      expect(result.success).toBe(true);
    });

    it('throws NotFoundException when model not found', async () => {
      const dbProviderService = makeDbProviderService();
      (dbProviderService.findModelById as jest.Mock).mockResolvedValue(null);

      const controller = makeController({ dbProviderService });
      await expect(controller.testModel('999')).rejects.toThrow('Model not found');
    });
  });

  describe('POST /llm/set-default-model', () => {
    it('calls dbProviderService.setUserDefaultModel', async () => {
      const dbProviderService = makeDbProviderService();
      (dbProviderService.setUserDefaultModel as jest.Mock).mockResolvedValue(undefined);

      const controller = makeController({ dbProviderService });
      const result = await controller.setDefaultModel(42, { user: { sub: 1 } } as any);

      expect(dbProviderService.setUserDefaultModel).toHaveBeenCalledWith(1, 42);
      expect(result).toEqual({ success: true, message: 'Default model set' });
    });

    it('throws BadRequestException when modelId is missing', async () => {
      const controller = makeController();
      await expect(controller.setDefaultModel(undefined as any, { user: { sub: 1 } } as any)).rejects.toThrow('modelId is required');
    });

    it('throws UnauthorizedException when user is missing', async () => {
      const controller = makeController();
      await expect(controller.setDefaultModel(1, { user: undefined } as any)).rejects.toThrow();
    });
  });

  describe('GET /llm/default-model', () => {
    it('calls dbProviderService.getUserDefaultModel', async () => {
      const dbProviderService = makeDbProviderService();
      (dbProviderService.getUserDefaultModel as jest.Mock).mockResolvedValue({ id: 42 });

      const controller = makeController({ dbProviderService });
      const result = await controller.getDefaultModel({ user: { sub: 1 } } as any);

      expect(dbProviderService.getUserDefaultModel).toHaveBeenCalledWith(1);
      expect(result).toEqual({ success: true, message: 'Default model retrieved', result: { id: 42 } });
    });

    it('returns null result when no default model', async () => {
      const dbProviderService = makeDbProviderService();
      (dbProviderService.getUserDefaultModel as jest.Mock).mockResolvedValue(null);

      const controller = makeController({ dbProviderService });
      const result = await controller.getDefaultModel({ user: { sub: 1 } } as any);

      expect(result).toEqual({ success: true, message: 'Default model retrieved', result: null });
    });
  });

  describe('DELETE /llm/test-results/:id', () => {
    it('calls dbProviderService.deleteTestResult', async () => {
      const dbProviderService = makeDbProviderService();
      (dbProviderService.deleteTestResult as jest.Mock).mockResolvedValue({ success: true });

      const controller = makeController({ dbProviderService });
      await controller.deleteTestResult('5');

      expect(dbProviderService.deleteTestResult).toHaveBeenCalledWith(5);
    });
  });
});
