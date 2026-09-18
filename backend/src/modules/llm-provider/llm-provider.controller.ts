import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { LlmProviderService } from './llm-provider.service';
import { CreateLlmProviderDto } from './dto/create-llm-provider.dto';
import { UpdateLlmProviderDto } from './dto/update-llm-provider.dto';
import { CreateLlmModelDto } from './dto/create-llm-model.dto';
import { UpdateLlmModelDto } from './dto/update-llm-model.dto';
import { SyncModelsDto } from './dto/sync-models.dto';
import { DetectModelMetadataDto } from './dto/detect-model-metadata.dto';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { AdminGuard } from '../../core/guards/admin.guard';
import { ServiceResultContainer } from '../../core/models/service-result-container.model';
import { LlmProviderEntity } from './entities/llm-provider.entity';
import { LlmModelEntity } from './entities/llm-model.entity';
import { ModelStats } from './types/model-stats.types';
import { ModelMetadata } from './services/model-metadata-catalog.service';
import { RequiresConfirmation } from '../../core/decorators/requires-confirmation.decorator';
import { CustomApiOperationOptions } from '../../core/types/custom-api-operation-options.type';

/**
 * LlmProviderController manages the configuration of LLM providers and their associated models.
 * Base path: /llm-provider
 */
@ApiTags('LLM Provider')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('llm-provider')
export class LlmProviderController {
  constructor(private readonly service: LlmProviderService) {}

  @Post()
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Create new provider',
    summaryHe: 'מוסיף ספק מודלים חדש',
    toolIcon: 'ph-database',
    description: 'Adds a new LLM provider to the system configuration.',
  } as CustomApiOperationOptions)
  @ApiCreatedResponse({ description: 'Provider created successfully' })
  @ApiUnauthorizedResponse({ description: 'JWT token missing or invalid' })
  async create(@Body() dto: CreateLlmProviderDto): Promise<ServiceResultContainer<LlmProviderEntity>> {
    return this.service.createProvider(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get all providers',
    summaryHe: 'מציג את ספקי ה-AI והמודלים',
    toolIcon: 'ph-list-bullets',
    description: 'Retrieves a list of all configured LLM providers.',
  } as CustomApiOperationOptions)
  @ApiOkResponse({ description: 'List of providers retrieved' })
  @ApiUnauthorizedResponse({ description: 'JWT token missing or invalid' })
  async findAll(): Promise<ServiceResultContainer<LlmProviderEntity[]>> {
    return this.service.findProviders();
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Update provider',
    summaryHe: 'מעדכן את הגדרות הספק',
    toolIcon: 'ph-pencil-simple',
    description: 'Updates an existing LLM provider configuration.',
  } as CustomApiOperationOptions)
  @ApiOkResponse({ description: 'Provider updated successfully' })
  @ApiBadRequestResponse({ description: 'Invalid provider ID' })
  @ApiUnauthorizedResponse({ description: 'JWT token missing or invalid' })
  async update(@Param('id') id: string, @Body() dto: UpdateLlmProviderDto): Promise<ServiceResultContainer<LlmProviderEntity>> {
    return this.service.updateProvider(+id, dto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Delete provider',
    summaryHe: 'מוחק ספק ואת המודלים שלו',
    toolIcon: 'ph-trash',
    description:
      'Permanently deletes an LLM provider. DB-level cascades remove its models, their test results and user default-model rows. Note: built-in seeded providers are only re-created when the providers table is completely empty.',
  } as CustomApiOperationOptions)
  @ApiOkResponse({ description: 'Provider deleted successfully' })
  @ApiUnauthorizedResponse({ description: 'JWT token missing or invalid' })
  async deleteProvider(@Param('id') id: string): Promise<ServiceResultContainer<void>> {
    return this.service.deleteProvider(+id);
  }

  @Post(':id/models')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Add model to provider',
    summaryHe: 'מוסיף מודל לספק ה-LLM',
    toolIcon: 'ph-plus-circle',
    description: 'Creates a new model associated with the specified provider.',
  } as CustomApiOperationOptions)
  @ApiCreatedResponse({ description: 'Model created successfully' })
  @ApiUnauthorizedResponse({ description: 'JWT token missing or invalid' })
  async createModel(@Param('id') id: string, @Body() dto: CreateLlmModelDto): Promise<ServiceResultContainer<LlmModelEntity>> {
    return this.service.createModel(+id, dto);
  }

  @Get(':id/catalog')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Get provider model catalog',
    summaryHe: 'מסנכרן את קטלוג המודלים עם הספק',
    toolIcon: 'ph-cloud-arrow-down',
    description:
      "Fetches the provider's live OpenAI-compatible GET /models catalog and merges it with the local list: new (not in DB), exists, unavailable (local model the provider no longer lists). Read-only.",
  } as CustomApiOperationOptions)
  @ApiOkResponse({ description: 'Merged catalog entries with status new|exists|unavailable' })
  @ApiUnauthorizedResponse({ description: 'JWT token missing or invalid' })
  async getCatalog(@Param('id') id: string): Promise<
    ServiceResultContainer<{
      models: Array<{ key: string; label?: string; owned_by?: string; status: 'new' | 'exists' | 'unavailable' }>;
    }>
  > {
    return this.service.getProviderCatalog(+id);
  }

  @Post(':id/sync-models')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Add selected models from catalog',
    summaryHe: 'מוסיף מודלים נבחרים מהקטלוג',
    toolIcon: 'ph-download-simple',
    description: 'Bulk-adds model keys selected in the sync dialog with active=false, capability=text. Existing keys are skipped.',
  } as CustomApiOperationOptions)
  @ApiOkResponse({ description: 'Number of models added/skipped' })
  @ApiUnauthorizedResponse({ description: 'JWT token missing or invalid' })
  async syncModels(@Param('id') id: string, @Body() dto: SyncModelsDto): Promise<ServiceResultContainer<{ added: number; skipped: number }>> {
    return this.service.syncProviderModels(+id, dto.keys);
  }

  @Post('models/detect-metadata')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Detect model metadata from OpenRouter',
    summaryHe: 'מגלה נתוני מודל (קונטקסט/מחיר) מ-OpenRouter',
    toolIcon: 'ph-sparkle',
    description:
      "Looks up context window, max output and $/1M-token pricing for a model key in the public OpenRouter catalog. Read-only, best-effort: an unmatched key returns result:null. The dialog fills the form and the admin persists via update — a manual admin action, not an LLM tool.",
  } as CustomApiOperationOptions)
  @ApiOkResponse({ description: 'Detected metadata (or result:null when unmatched)' })
  @ApiUnauthorizedResponse({ description: 'JWT token missing or invalid' })
  async detectModelMetadata(@Body() dto: DetectModelMetadataDto): Promise<ServiceResultContainer<ModelMetadata | null>> {
    return this.service.detectModelMetadata(dto.key, dto.providerKey);
  }

  @Get('models/free-variants')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'List model bare names with a :free variant upstream',
    summaryHe: 'רשימת שמות מודלים שיש להם וריאנט חינמי ב-OpenRouter',
    toolIcon: 'ph-info',
    description:
      "Bare names of OpenRouter catalog entries that ship a ':free' variant. Lets the management table hint 'free variant exists' on models configured with the bare paid key. Read-only; served from the 24h catalog cache.",
  } as CustomApiOperationOptions)
  @ApiOkResponse({ description: 'Bare names with an upstream :free variant' })
  @ApiUnauthorizedResponse({ description: 'JWT token missing or invalid' })
  async getFreeVariantKeys(): Promise<ServiceResultContainer<{ bareNames: string[] }>> {
    return this.service.getFreeVariantKeys();
  }

  @Patch('models/:id')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Update model',
    summaryHe: 'מעדכן הגדרות ומצב של מודל',
    toolIcon: 'ph-sliders',
    description: 'Updates an existing LLM model configuration.',
  } as CustomApiOperationOptions)
  @ApiOkResponse({ description: 'Model updated successfully' })
  @ApiUnauthorizedResponse({ description: 'JWT token missing or invalid' })
  async updateModel(@Param('id') id: string, @Body() dto: UpdateLlmModelDto): Promise<ServiceResultContainer<LlmModelEntity>> {
    return this.service.updateModel(+id, dto);
  }

  @Delete('models/:id')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Delete model',
    summaryHe: 'מכבה או מוחק מודל מהספק',
    toolIcon: 'ph-trash',
    description: 'Deletes an LLM model by ID.',
  } as CustomApiOperationOptions)
  @ApiOkResponse({ description: 'Model deleted successfully' })
  @ApiUnauthorizedResponse({ description: 'JWT token missing or invalid' })
  async deleteModel(@Param('id') id: string): Promise<ServiceResultContainer<void>> {
    return this.service.deleteModel(+id);
  }

  @Delete('models/:modelId/test-results')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Delete all test results for model',
    summaryHe: 'מנקה את היסטוריית בדיקות החיבור',
    toolIcon: 'ph-eraser',
    description: 'Deletes all test results associated with the specified model.',
  } as CustomApiOperationOptions)
  @ApiOkResponse({ description: 'Number of deleted rows' })
  @ApiUnauthorizedResponse({ description: 'JWT token missing or invalid' })
  async deleteTestResultsForModel(@Param('modelId') modelId: string): Promise<ServiceResultContainer<number>> {
    return this.service.deleteTestResultsForModel(+modelId);
  }

  @Get(':id/models')
  @ApiOperation({
    summary: 'Get models for provider',
    summaryHe: 'מציג את המודלים של הספק',
    toolIcon: 'ph-cube',
    description: 'Retrieves all models associated with the given provider.',
  } as CustomApiOperationOptions)
  @ApiOkResponse({ description: 'List of models retrieved' })
  @ApiUnauthorizedResponse({ description: 'JWT token missing or invalid' })
  async findModels(@Param('id') id: string): Promise<ServiceResultContainer<LlmModelEntity[]>> {
    return this.service.findModelsByProvider(+id);
  }

  @Post('cleanup-test-results')
  @UseGuards(AdminGuard)
  @RequiresConfirmation()
  @ApiOperation({
    summary: 'Delete old test results',
    summaryHe: 'מנקה בדיקות חיבור ישנות',
    toolIcon: 'ph-broom',
    description: 'Manually triggers cleanup of LLM test results older than retention period.',
  } as CustomApiOperationOptions)
  @ApiQuery({ name: 'retentionDays', required: false, type: Number, description: 'Delete results older than N days (default: 30)' })
  @ApiOkResponse({ description: 'Number of deleted rows' })
  @ApiUnauthorizedResponse({ description: 'JWT token missing or invalid' })
  async cleanupTestResults(
    @Query('retentionDays') queryRetentionDays?: number,
    @Body('retentionDays') bodyRetentionDays?: number,
  ): Promise<ServiceResultContainer<number>> {
    const retentionDays = queryRetentionDays ?? bodyRetentionDays ?? 30;
    const deleted = await this.service.deleteOldTestResults(retentionDays);
    return { success: true, message: `Deleted ${deleted} rows`, result: deleted };
  }

  @Get('test-results')
  @ApiOperation({
    summary: 'Get test results',
    summaryHe: 'מציג את היסטוריית בדיקות החיבור',
    toolIcon: 'ph-activity',
    description: 'Retrieves paginated list of LLM model test results with total count.',
  } as CustomApiOperationOptions)
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Max results to return (default: 50)' })
  @ApiQuery({ name: 'offset', required: false, type: Number, description: 'Offset for pagination (default: 0)' })
  @ApiOkResponse({ description: 'Test results list with total count' })
  @ApiUnauthorizedResponse({ description: 'JWT token missing or invalid' })
  async findTestResults(
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ): Promise<ServiceResultContainer<{ results: import('./entities/llm-model-test-results.entity').LlmModelTestResultEntity[]; total: number }>> {
    return this.service.findTestResults(limit ?? 50, offset ?? 0);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Get model statistics',
    summaryHe: 'מציג דירוג וביצועים של המודלים',
    toolIcon: 'ph-chart-bar',
    description:
      'Per-model usage statistics. Connectivity pings (is_test = true) and real calls (is_test = false) are reported separately, both aggregated from llm_call_stats in SQL so the response size does not grow with call volume.',
  } as CustomApiOperationOptions)
  @ApiOkResponse({ description: 'Model statistics retrieved' })
  @ApiUnauthorizedResponse({ description: 'JWT token missing or invalid' })
  async findModelStats(): Promise<ServiceResultContainer<ModelStats>> {
    return this.service.getModelStats();
  }
}
