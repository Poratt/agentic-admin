import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';

import { ServiceResultContainer } from '../../core/models/service-result-container.model';
import { CreateLlmModelDto } from './dto/create-llm-model.dto';
import { CreateLlmProviderDto } from './dto/create-llm-provider.dto';
import { UpdateLlmModelDto } from './dto/update-llm-model.dto';
import { UpdateLlmProviderDto } from './dto/update-llm-provider.dto';
import { LlmModelEntity } from './entities/llm-model.entity';
import { LlmProviderEntity } from './entities/llm-provider.entity';
import { LlmModelTestResultEntity } from './entities/llm-model-test-results.entity';
import { UserLlmDefaultEntity } from './entities/user-llm-default.entity';

@Injectable()
export class LlmProviderService {
  constructor(
    @InjectRepository(LlmProviderEntity)
    private readonly providerRepo: Repository<LlmProviderEntity>,
    @InjectRepository(LlmModelEntity)
    private readonly modelRepo: Repository<LlmModelEntity>,
    @InjectRepository(LlmModelTestResultEntity)
    private readonly testResultRepo: Repository<LlmModelTestResultEntity>,
    @InjectRepository(UserLlmDefaultEntity)
    private readonly userDefaultRepo: Repository<UserLlmDefaultEntity>,
  ) {}

  /**
   * Resolves the effective provider and model for a request, applying user-level defaults.
   *
   * Resolution order:
   *   1. Explicit providerOverride + modelOverride from the request
   *   2. User's persisted default model (if a userId is supplied)
   *   3. Legacy environment-backed active provider / model
   *
   * @param providerOverride Optional per-request provider override.
   * @param modelOverride Optional per-request model override.
   * @param userId Optional user id to look up user-level defaults.
   * @param legacyProvider Fallback provider from the AI_PROVIDER env var.
   * @param legacyModel Fallback model from the AI_PROVIDER env var.
   * @returns Resolved provider and model.
   */
  async resolveEffectiveModel(
    providerOverride: string | undefined,
    modelOverride: string | undefined,
    userId: number | undefined,
    legacyProvider: string,
    legacyModel: string,
  ): Promise<{ provider: string; model: string }> {
    // 1. Explicit overrides win
    if (providerOverride && modelOverride) {
      return { provider: providerOverride, model: modelOverride };
    }

    // 2. User-level default model
    if (userId) {
      const userDefault = await this.getUserDefaultModel(userId);
      if (userDefault && userDefault.active !== false) {
        return {
          provider: userDefault.provider.key,
          model: userDefault.key,
        };
      }
    }

    // 3. Partial override (only provider or only model)
    if (providerOverride) {
      return { provider: providerOverride, model: legacyModel };
    }
    if (modelOverride) {
      return { provider: legacyProvider, model: modelOverride };
    }

    // 4. Legacy fallback
    return { provider: legacyProvider, model: legacyModel };
  }

  /**
   * Sets the user's default model.
   */
  async setUserDefaultModel(userId: number, modelId: number): Promise<void> {
    const model = await this.modelRepo.findOne({ where: { id: modelId }, relations: ['provider'] });
    if (!model || !model.active) {
      throw new NotFoundException('Model not found or inactive');
    }
    if (model.capability !== 'text') {
      throw new BadRequestException('מודל זה אינו תומך שיחה (טקסט)');
    }

    const existing = await this.userDefaultRepo.findOne({ where: { userId } });
    const row = existing ?? this.userDefaultRepo.create({ userId, modelId });
    row.modelId = modelId;
    await this.userDefaultRepo.save(row);
  }

  /**
   * Gets the user's default model entity (with provider relation).
   */
  async getUserDefaultModel(userId: number): Promise<LlmModelEntity | null> {
    const row = await this.userDefaultRepo.findOne({ where: { userId } });
    if (!row) return null;

    return this.modelRepo.findOne({
      where: { id: row.modelId },
      relations: ['provider'],
    });
  }

  /**
   * Returns the first active text-capable model (with its provider) ordered by
   * sortOrder then id. Used by background jobs (e.g. the nightly ideas cron)
   * that run without a request/user context and need a concrete model to call.
   * Returns null when no active text model exists.
   */
  async findFirstActiveTextModel(): Promise<{ provider: string; model: string } | null> {
    const model = await this.modelRepo.findOne({
      where: { active: true, capability: 'text' },
      relations: ['provider'],
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
    if (!model || !model.provider) return null;
    return { provider: model.provider.key, model: model.key };
  }

  async createProvider(dto: CreateLlmProviderDto): Promise<ServiceResultContainer<LlmProviderEntity>> {
    const provider = this.providerRepo.create(dto);
    const saved = await this.providerRepo.save(provider);
    return { success: true, message: 'Provider created', result: saved };
  }

  async updateProvider(id: number, dto: UpdateLlmProviderDto): Promise<ServiceResultContainer<LlmProviderEntity>> {
    // Use repository.update() — only the fields present in dto are written.
    // This avoids the select:false trap: findOneBy won't load apiKey, and
    // a subsequent save() could accidentally NULL it out.
    await this.providerRepo.update({ id }, dto);

    const updated = await this.providerRepo.findOneBy({ id });
    if (!updated) throw new NotFoundException('Provider not found');
    return { success: true, message: 'Provider updated', result: updated };
  }

  async deleteProvider(id: number): Promise<ServiceResultContainer<void>> {
    const provider = await this.providerRepo.findOneBy({ id });
    if (!provider) throw new NotFoundException(`Provider with ID ${id} not found`);

    // DB-level FK cascades remove the provider's models, their test results
    // and any user_llm_defaults rows pointing at those models.
    await this.providerRepo.delete({ id });
    return { success: true, message: 'Provider deleted', result: undefined };
  }

  async findProviders(): Promise<ServiceResultContainer<LlmProviderEntity[]>> {
    // 🚀 We instruct TypeORM to eagerly load the model test results as well, and order them newest to oldest 🚀
    const providers = await this.providerRepo.find({
      relations: ['models', 'models.testResults'],
      order: {
        models: {
          sortOrder: 'ASC',
          testResults: {
            createdAt: 'DESC', // newest test result shows first in the UI!
          },
        },
      },
    });

    return { success: true, message: 'Providers retrieved', result: providers };
  }

  async findProviderByKey(key: string): Promise<LlmProviderEntity | null> {
    return this.providerRepo
      .createQueryBuilder('provider')
      .addSelect('provider.apiKey')
      .leftJoinAndSelect('provider.models', 'models')
      .where('provider.key = :key', { key })
      .getOne();
  }

  /**
   * Fetches the provider's live model catalog from its OpenAI-compatible
   * `GET {baseUrl}/models` endpoint and merges it with the local model list:
   * - 'new'         — upstream entry we don't have yet
   * - 'exists'      — upstream entry already in the DB
   * - 'unavailable' — local model the provider no longer lists (retired)
   * Read-only — nothing is written until syncProviderModels runs.
   */
  async getProviderCatalog(providerId: number): Promise<
    ServiceResultContainer<{
      models: Array<{ key: string; label?: string; owned_by?: string; status: 'new' | 'exists' | 'unavailable' }>;
    }>
  > {
    const provider = await this.providerRepo
      .createQueryBuilder('provider')
      .addSelect('provider.apiKey')
      .where('provider.id = :id', { id: providerId })
      .getOne();
    if (!provider) throw new NotFoundException(`Provider with ID ${providerId} not found`);

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (provider.apiKey) headers.Authorization = `Bearer ${provider.apiKey}`;

    let response: Response;
    try {
      response = await fetch(`${provider.baseUrl.replace(/\/$/, '')}/models`, {
        headers,
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      throw new BadRequestException(`Provider catalog request failed: ${reason}`);
    }
    if (!response.ok) {
      // Cloudflare's OpenAI-compat layer doesn't implement GET /models (405) —
      // fall back to its native ai/models/search API and map names to keys.
      if (response.status === 405 && this.isCloudflareBaseUrl(provider.baseUrl)) {
        const upstream = await this.fetchCloudflareCatalog(provider);
        return { success: true, message: 'Provider catalog retrieved', result: { models: await this.mergeCatalog(providerId, upstream) } };
      }
      throw new BadRequestException(`Provider catalog request failed (HTTP ${response.status})`);
    }

    let body: { data?: Array<{ id?: string; owned_by?: string }> };
    try {
      body = (await response.json()) as { data?: Array<{ id?: string; owned_by?: string }> };
    } catch {
      throw new BadRequestException('Provider catalog returned invalid JSON');
    }

    const upstream = (body.data ?? [])
      .filter((m): m is { id: string; owned_by?: string } => typeof m.id === 'string' && m.id.length > 0)
      .map((m) => ({ key: m.id, owned_by: m.owned_by }));

    return { success: true, message: 'Provider catalog retrieved', result: { models: await this.mergeCatalog(providerId, upstream) } };
  }

  private isCloudflareBaseUrl(baseUrl: string): boolean {
    return /api\.cloudflare\.com\/client\/v4\/accounts\/[^/]+\/ai\/v1\/?$/.test(baseUrl.trim().replace(/\/$/, ''));
  }

  /**
   * Cloudflare native catalog (GET ai/models/search). The compat /models is
   * 405 there. Paginates (per_page=100) and maps model `name` to key.
   */
  private async fetchCloudflareCatalog(provider: LlmProviderEntity): Promise<Array<{ key: string; owned_by?: string }>> {
    const accountId = provider.baseUrl.match(/\/accounts\/([^/]+)/)?.[1];
    if (!accountId) throw new BadRequestException('Cannot derive Cloudflare account id from provider baseUrl');

    const upstream: Array<{ key: string; owned_by?: string }> = [];
    for (let page = 1; page <= 3; page += 1) {
      const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/models/search?per_page=100&page=${page}`, {
        headers: {
          Accept: 'application/json',
          ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}),
        },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new BadRequestException(`Provider catalog request failed (HTTP ${res.status})`);

      const body = (await res.json()) as { result?: Array<{ name?: string }> };
      const rows = body.result ?? [];
      for (const row of rows) {
        if (typeof row.name === 'string' && row.name.length > 0) upstream.push({ key: row.name });
      }
      if (rows.length < 100) break;
    }
    return upstream;
  }

  /**
   * Merges upstream catalog entries with the local model list:
   * 'new' (not in DB) / 'exists' / 'unavailable' (local model no longer listed).
   */
  private async mergeCatalog(
    providerId: number,
    upstream: Array<{ key: string; owned_by?: string }>,
  ): Promise<Array<{ key: string; label?: string; owned_by?: string; status: 'new' | 'exists' | 'unavailable' }>> {
    const local = await this.modelRepo.find({ where: { providerId }, select: ['key', 'label'] });
    const localByKey = new Map(local.map((m) => [m.key, m.label]));
    const upstreamKeys = new Set<string>();

    const models: Array<{ key: string; label?: string; owned_by?: string; status: 'new' | 'exists' | 'unavailable' }> = [];
    for (const entry of upstream) {
      upstreamKeys.add(entry.key);
      models.push({
        key: entry.key,
        owned_by: entry.owned_by,
        status: localByKey.has(entry.key) ? 'exists' : 'new',
      });
    }
    for (const [key, label] of localByKey) {
      if (!upstreamKeys.has(key)) {
        models.push({ key, label, status: 'unavailable' });
      }
    }
    models.sort((a, b) => a.key.localeCompare(b.key));
    return models;
  }

  /**
   * Marks a model inactive after the provider itself reported it missing
   * (model_not_found / 404 / invalid_model). Reversible from the management UI.
   */
  async markModelUnavailable(providerId: number, key: string): Promise<void> {
    const model = await this.modelRepo.findOne({ where: { providerId, key } });
    if (!model || !model.active) return;

    model.active = false;
    await this.modelRepo.save(model);
  }

  /**
   * Adds the given model keys (from the catalog dialog) under the provider with
   * active=false and capability=text. Keys that already exist are skipped — the
   * unique (provider_id, key) index is the backstop against concurrent adds.
   */
  async syncProviderModels(providerId: number, keys: string[]): Promise<ServiceResultContainer<{ added: number; skipped: number }>> {
    const provider = await this.providerRepo.findOneBy({ id: providerId });
    if (!provider) throw new NotFoundException(`Provider with ID ${providerId} not found`);

    const uniqueKeys = [...new Set(keys)];
    const existing = new Set((await this.modelRepo.find({ where: { providerId }, select: ['key'] })).map((m) => m.key));

    const toAdd = uniqueKeys
      .filter((key) => !existing.has(key))
      // label drops cosmetic variant prefixes (e.g. OpenRouter '~') — the key keeps them for the API.
      .map((key) => this.modelRepo.create({ key, label: key.replace(/^~/, ''), capability: 'text', sortOrder: 0, active: false, providerId }));

    if (toAdd.length > 0) {
      await this.modelRepo.save(toAdd);
    }

    const added = toAdd.length;
    return {
      success: true,
      message: `Added ${added} models (${uniqueKeys.length - added} skipped)`,
      result: { added, skipped: uniqueKeys.length - added },
    };
  }

  async createModel(providerId: number, dto: CreateLlmModelDto): Promise<ServiceResultContainer<LlmModelEntity>> {
    const provider = await this.providerRepo.findOneBy({ id: providerId });
    if (!provider) throw new NotFoundException(`Provider with ID ${providerId} not found`);

    const model = this.modelRepo.create({ ...dto, providerId });
    const saved = await this.modelRepo.save(model);
    return { success: true, message: 'Model created', result: saved };
  }

  async updateModel(id: number, dto: UpdateLlmModelDto): Promise<ServiceResultContainer<LlmModelEntity>> {
    const model = await this.modelRepo.findOneBy({ id });
    if (!model) throw new NotFoundException('Model not found');

    Object.assign(model, dto);
    const saved = await this.modelRepo.save(model);
    return { success: true, message: 'Model updated', result: saved };
  }

  async deleteModel(id: number): Promise<ServiceResultContainer<void>> {
    const model = await this.modelRepo.findOneBy({ id });
    if (!model) throw new NotFoundException('Model not found');

    await this.modelRepo.remove(model);
    return { success: true, message: 'Model deleted', result: undefined };
  }

  async findModelsByProvider(providerId: number): Promise<ServiceResultContainer<LlmModelEntity[]>> {
    const models = await this.modelRepo.find({ where: { providerId }, order: { sortOrder: 'ASC' } });
    return { success: true, message: 'Models retrieved', result: models };
  }

  // 🚀 Fetches a specific model by key (Key) 🚀
  async findModelByKey(key: string): Promise<LlmModelEntity | null> {
    return this.modelRepo.findOne({ where: { key } });
  }

  // 🚀 Fetches a specific model by ID including its provider details 🚀
  async findModelById(id: number): Promise<LlmModelEntity | null> {
    return this.modelRepo.findOne({
      where: { id },
      relations: ['provider'],
    });
  }
  // 🚀 Saves the test result to the database 🚀
  async saveTestResult(
    modelId: number,
    responseTimeMs: number,
    status: 'success' | 'error' | 'timeout',
    errorMessage: string | null,
  ): Promise<LlmModelTestResultEntity> {
    const testResult = this.testResultRepo.create({
      modelId,
      responseTimeMs,
      status,
      errorMessage,
    });
    return this.testResultRepo.save(testResult);
  }

  async deleteTestResult(testResultId: number): Promise<ServiceResultContainer<void>> {
    const testResult = await this.testResultRepo.findOneBy({ id: testResultId });
    if (!testResult) throw new NotFoundException('Test result not found');

    await this.testResultRepo.remove(testResult);
    return { success: true, message: 'Test result deleted', result: undefined };
  }

  async deleteTestResultsForModel(modelId: number): Promise<ServiceResultContainer<number>> {
    const result = await this.testResultRepo.delete({ modelId });
    const deleted = result.affected ?? 0;
    return { success: true, message: `Deleted ${deleted} test results`, result: deleted };
  }

  async deleteOldTestResults(retentionDays = 30): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    const result = await this.testResultRepo.delete({ createdAt: LessThan(cutoff) });
    return result.affected ?? 0;
  }

  async findTestResults(limit = 50, offset = 0): Promise<ServiceResultContainer<{ results: LlmModelTestResultEntity[]; total: number }>> {
    const [results, total] = await this.testResultRepo.findAndCount({
      relations: ['model', 'model.provider'],
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
    return { success: true, message: 'Test results retrieved', result: { results, total } };
  }
}
