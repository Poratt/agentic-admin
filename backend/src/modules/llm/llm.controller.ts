import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  Query,
  UseGuards,
  Logger,
  NotFoundException,
  Body,
  BadRequestException,
  UnauthorizedException,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiInternalServerErrorResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RequestWithUser } from '../../core/interfaces/request-with-user.interface';
import { ServiceResultContainer } from '../../core/models/service-result-container.model';
import { LlmHealthService } from './services/llm-health.service';
import { LlmProviderService } from '../llm-provider/llm-provider.service';
import { LlmClientService } from './services/llm-client.service';
import { GenerateImageDto } from './dto/generate-image.dto';
import { CreateVideoTaskDto } from './dto/create-video-task.dto';
import { ExtendVideoDto } from './dto/extend-video.dto';
import { LlmModelEntity } from '../llm-provider/entities/llm-model.entity';
import { LlmModelCapability } from './types/llm.types';
import { CustomApiOperationOptions } from '../../core/types/custom-api-operation-options.type';

@ApiTags('llm')
@ApiBearerAuth()
@Controller('llm')
export class LlmController {
  private readonly logger = new Logger(LlmController.name);

  constructor(
    private readonly healthService: LlmHealthService,
    private readonly dbProviderService: LlmProviderService,
    private readonly client: LlmClientService,
  ) {}

  @Post('providers/:id/test-all')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Test all active text models of a provider in the background',
    summaryHe: 'בודקים ברקע את כל המודלים הפעילים של הספק ושומרים תוצאות',
    toolIcon: 'ph-lightning',
  } as CustomApiOperationOptions)
  @ApiOkResponse({ description: 'Background test run started; results stream into the test history' })
  async testProviderModels(@Param('id') id: string) {
    return this.healthService.testProviderModels(+id);
  }

  @Get('providers/:id/test-all/status')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Whether a background test run is in flight for this provider',
    summaryHe: 'האם ריצת בדיקות רקע פעילה עבור הספק',
    toolIcon: 'ph-lightning',
  } as CustomApiOperationOptions)
  @ApiOkResponse({ description: 'Returns { running: boolean }' })
  async testProviderModelsStatus(@Param('id') id: string) {
    return {
      success: true,
      message: 'Test run status',
      result: { running: this.healthService.isProviderTestRunning(+id) },
    };
  }

  @Post('models/:id/test')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Test a single model connectivity and save the result',
    summaryHe: 'בודקים ומאמתים את מהירות התגובה והחיבור של מודל ה-AI',
    toolIcon: 'ph-lightning',
  } as CustomApiOperationOptions)
  async testModel(@Param('id') id: string) {
    const dbModel = await this.dbProviderService.findModelById(+id);
    if (!dbModel) {
      throw new NotFoundException('Model not found');
    }

    return this.healthService.testLlm(
      dbModel.provider.key as any,
      dbModel.key,
      'Hello! This is an interactive connection test.',
      'You are a helpful assistant.',
      dbModel.id,
    );
  }

  @Delete('test-results/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Delete a test result',
    summaryHe: 'מוחקים היסטוריית בדיקת חיבור בודדת של מודל מהארכיון',
    toolIcon: 'ph-trash',
  } as CustomApiOperationOptions)
  async deleteTestResult(@Param('id') id: string) {
    return this.dbProviderService.deleteTestResult(+id);
  }

  @Post('set-default-model')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: "Set the authenticated user's default LLM model",
    summaryHe: 'קובעים את מודל ה-AI המועדף עליך כברירת המחדל של המערכת',
    toolIcon: 'ph-star',
  } as CustomApiOperationOptions)
  async setDefaultModel(@Body('modelId') modelId: number, @Req() req: RequestWithUser) {
    if (!req.user) {
      throw new UnauthorizedException();
    }
    if (!modelId || typeof modelId !== 'number') {
      throw new BadRequestException('modelId is required and must be a number');
    }
    await this.dbProviderService.setUserDefaultModel(req.user.sub, modelId);
    return { success: true, message: 'Default model set' };
  }

  @Get('default-model')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: "Get the authenticated user's default LLM model",
    summaryHe: 'מציגים את מודל ה-AI המוגדר כברירת המחדל שלך',
    toolIcon: 'ph-star',
  } as CustomApiOperationOptions)
  async getDefaultModel(@Req() req: RequestWithUser) {
    if (!req.user) {
      throw new UnauthorizedException();
    }
    const model = await this.dbProviderService.getUserDefaultModel(req.user.sub);
    return { success: true, message: 'Default model retrieved', result: model ? { id: model.id } : null };
  }

  @Post('image/generate')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Generate an image with an Agnes image model',
    summaryHe: 'יוצרים תמונות מרהיבות על בסיס טקסט עם Agnes Image',
    toolIcon: 'ph-palette',
    description:
      'Sends a text prompt (optionally with input images for image-to-image edits) to an Agnes image-generation model and returns a STILL image (URL or Base64 JSON). USE ONLY when the user wants a static image (poster, artwork, illustration, image-to-image edit). DO NOT use for motion / animation / video — for those use LlmController_createVideo. Resolves the provider/model from modelId when provided, otherwise falls back to the first active image-capability model.',
  } as CustomApiOperationOptions)
  @ApiBody({ type: GenerateImageDto })
  @ApiOkResponse({
    description: 'The generated image.',
    schema: {
      example: { url: 'https://cdn.agnes-ai.com/img_123.png', mimeType: 'image/png', size: '1024x768' },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid request (e.g. model is not an image model).' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT.' })
  @ApiForbiddenResponse({ description: 'Not applicable for this endpoint.' })
  @ApiNotFoundResponse({ description: 'No image-capable model could be resolved.' })
  @ApiInternalServerErrorResponse({ description: 'Upstream Agnes image generation failed.' })
  async generateImage(@Body() dto: GenerateImageDto) {
    const resolved = await this.resolveCapabilityModel(dto.modelId, 'image', dto.providerOverride);
    if (!resolved) {
      throw new NotFoundException('No active image model found');
    }

    this.logger.log(
      `generateImage resolved model=${resolved.model.key} (id=${resolved.model.id}) provider=${resolved.providerKey}${dto.modelId ? '' : ' [fallback]'}`,
    );

    const result = await this.client.generateImage({
      provider: resolved.providerKey,
      model: resolved.model.key,
      prompt: dto.prompt,
      size: dto.size,
      ratio: dto.ratio,
      image: dto.image,
      returnBase64: dto.returnBase64,
    });

    return {
      success: true,
      message: 'התמונה נוצרה בהצלחה',
      result: { ...result, model: resolved.model.key },
    } satisfies ServiceResultContainer<unknown>;
  }

  @Post('video/generate')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Create an asynchronous Agnes video generation task',
    summaryHe: 'מפיקים סרטונים מרהיבים מבוססי טקסט או תמונה עם Agnes Video',
    toolIcon: 'ph-video-camera',
    description:
      'Submits a text prompt (optionally with an attached image as starting frame) to an Agnes video model and returns a video task. USE when the user wants a moving video / clip / animation, especially when an attached image should animate (image-to-video, ti2vid). DO NOT use for still images — use LlmController_generateImage. Poll the status with GET /llm/video/:videoId. The HTTP create response is not blocked on generation.',
  } as CustomApiOperationOptions)
  @ApiBody({ type: CreateVideoTaskDto })
  @ApiCreatedResponse({
    description: 'Video task created.',
    schema: { example: { taskId: 'task_1', videoId: 'vid_1', status: 'queued', seconds: 0, size: '' } },
  })
  @ApiBadRequestResponse({ description: 'Invalid request (e.g. model is not a video model).' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT.' })
  @ApiForbiddenResponse({ description: 'Not applicable for this endpoint.' })
  @ApiNotFoundResponse({ description: 'No video-capable model could be resolved.' })
  @ApiInternalServerErrorResponse({ description: 'Upstream Agnes video creation failed.' })
  async createVideo(@Body() dto: CreateVideoTaskDto) {
    const resolved = await this.resolveCapabilityModel(dto.modelId, 'video');
    if (!resolved) {
      throw new NotFoundException('No active video model found');
    }

    return this.client
      .createVideoTaskAndWait({
        provider: resolved.providerKey,
        model: resolved.model.key,
        prompt: dto.prompt,
        image: dto.image,
        mode: dto.mode,
        height: dto.height,
        width: dto.width,
        numFrames: dto.numFrames,
        frameRate: dto.frameRate,
        seed: dto.seed,
        negativePrompt: dto.negativePrompt,
      })
      .then(
        (result): ServiceResultContainer<unknown> => ({
          success: true,
          message: 'משימת הווידאו הושלמה',
          result: { ...result, model: resolved.model.key },
        }),
      );
  }

  @Get('video/:videoId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Poll an Agnes video generation task',
    summaryHe: 'בודקים את סטטוס הפקת הסרטון ומורידים אותו כשהוא מוכן',
    toolIcon: 'ph-hourglass-high',
    description: 'Returns the current status of a video task. Poll until status is "completed" (returns a .mp4 URL) or "failed".',
  } as CustomApiOperationOptions)
  @ApiParam({ name: 'videoId', description: 'Agnes video id returned by the create endpoint.', example: 'vid_1' })
  @ApiQuery({ name: 'modelId', required: false, description: 'DB model id used to resolve the provider key.', type: Number })
  @ApiOkResponse({
    description: 'Current video task status.',
    schema: { example: { status: 'completed', url: 'https://cdn.agnes-ai.com/vid_1.mp4', seconds: 5 } },
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT.' })
  @ApiForbiddenResponse({ description: 'Not applicable for this endpoint.' })
  @ApiInternalServerErrorResponse({ description: 'Upstream Agnes video poll failed.' })
  async getVideo(@Param('videoId') videoId: string, @Query('modelId') modelId?: string) {
    const resolved = await this.resolveCapabilityModel(modelId ? +modelId : undefined, 'video');
    if (!resolved) {
      throw new NotFoundException('No active video model found');
    }

    const result = await this.client.getVideoResult(videoId, resolved.providerKey);
    return {
      success: true,
      message: `סטטוס משימה: ${result.status}`,
      result: { ...result, model: resolved.model.key },
    } satisfies ServiceResultContainer<unknown>;
  }

  @Post('video/extend')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Continue a generated video from its last frame',
    summaryHe: 'מאריכים וממשיכים סרטון קיים מפריים המפתח האחרון שלו',
    toolIcon: 'ph-fast-forward',
    description:
      'Downloads a source video (by videoId or videoUrl), extracts its final frame, and submits a new image-to-video task using that frame. Returns the completed continuation video.',
  } as CustomApiOperationOptions)
  @ApiBody({ type: ExtendVideoDto })
  @ApiCreatedResponse({
    description: 'Continuation video task completed.',
    schema: { example: { videoId: 'vid_2', status: 'completed', url: 'https://cdn.agnes-ai.com/vid_2.mp4', seconds: 5 } },
  })
  @ApiBadRequestResponse({ description: 'Invalid request (e.g. missing source, unsupported image, or not a video model).' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT.' })
  @ApiNotFoundResponse({ description: 'No video-capable model could be resolved.' })
  @ApiInternalServerErrorResponse({ description: 'Upstream Agnes generation or frame extraction failed.' })
  async extendVideo(@Body() dto: ExtendVideoDto) {
    const resolved = await this.resolveCapabilityModel(dto.modelId, 'video');
    if (!resolved) {
      throw new NotFoundException('No active video model found');
    }

    if (!dto.sourceVideoId && !dto.sourceVideoUrl) {
      throw new BadRequestException('extendVideo requires sourceVideoId or sourceVideoUrl');
    }

    const result = await this.client.extendVideo({
      provider: resolved.providerKey,
      model: resolved.model.key,
      sourceVideoId: dto.sourceVideoId,
      sourceVideoUrl: dto.sourceVideoUrl,
      prompt: dto.prompt,
      mode: dto.mode,
      height: dto.height,
      width: dto.width,
      numFrames: dto.numFrames,
      frameRate: dto.frameRate,
      numInferenceSteps: dto.numInferenceSteps,
      seed: dto.seed,
      negativePrompt: dto.negativePrompt,
    });

    return {
      success: true,
      message: 'המשך הווידאו הושלם',
      result: { ...result, model: resolved.model.key },
    } satisfies ServiceResultContainer<unknown>;
  }

  /**
   * Resolves the DB model for an image/video request.
   * 1. If modelId is given, use it directly.
   * 2. Otherwise use the user's default model if it matches the capability.
   * 3. Otherwise pick the first active model of the requested capability.
   *
   * Returns the model together with its provider key, since the model row may
   * not have its `provider` relation loaded (e.g. when resolved from the
   * grouped providers list).
   */
  private async resolveCapabilityModel(
    modelId: number | undefined,
    capability: LlmModelCapability,
    providerOverride?: string,
  ): Promise<{ model: LlmModelEntity; providerKey: string } | null> {
    if (modelId) {
      const model = await this.dbProviderService.findModelById(modelId);
      if (!model || !model.active) {
        return null;
      }
      if (model.capability !== capability) {
        throw new BadRequestException(`Model ${model.key} is not a ${capability} model`);
      }
      return { model, providerKey: model.provider.key };
    }

    const providersResult = await this.dbProviderService.findProviders();
    if (!providersResult.success || !providersResult.result) {
      return null;
    }

    if (providerOverride) {
      const provider = providersResult.result.find((p) => p.key === providerOverride && p.active);
      const match = this.pickLatestModel(provider?.models ?? [], capability);
      return match ? { model: match, providerKey: provider!.key } : null;
    }

    for (const provider of providersResult.result) {
      if (!provider.active) continue;
      const match = this.pickLatestModel(provider.models ?? [], capability);
      if (match) {
        return { model: match, providerKey: provider.key };
      }
    }

    return null;
  }

  private pickLatestModel(models: LlmModelEntity[], capability: LlmModelCapability): LlmModelEntity | undefined {
    return models.filter((m) => m.active && m.capability === capability).sort((a, b) => this.extractVersion(b.key) - this.extractVersion(a.key))[0];
  }

  private extractVersion(key: string): number {
    const matches = key.match(/(\d+(?:\.\d+)?)/g);
    if (!matches || matches.length === 0) return 0;
    const first = matches.find((m) => !/^\d{4}$/.test(m)) ?? matches[0];
    return Number(first);
  }
}
