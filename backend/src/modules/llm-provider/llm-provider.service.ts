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
import { LlmCallStatEntity } from './entities/llm-call-stat.entity';
import { UserLlmDefaultEntity } from './entities/user-llm-default.entity';
import { ModelStats, ModelStatsRow, ModelUsageStats } from './types/model-stats.types';

/** Runs a model needs before it can be ranked — one run is noise, not a measurement. */
const MIN_RANKING_SAMPLE = 3;

/** `caller` value used by the connectivity tests; excluded so those calls are not counted twice. */
const HEALTH_CALLER = 'health';

/** Composite row id — lets the leaderboard point at a row instead of duplicating it. */
function modelStatsId(providerKey: string, modelKey: string): string {
  return `${providerKey}::${modelKey}`;
}

/**
 * Which measurement a row should be ranked on, or `null` when neither source has enough runs.
 *
 * Real calls win once a model has enough of them, because they measure the work the app actually
 * does. Until then the connectivity pings stand in — they are a one-line test, but without this
 * fallback the leaderboard stays empty on a fresh install, which is exactly when it is most useful
 * for picking a model. The chosen source is reported on the row so the badge can say which it was.
 */
function rankBasisFor(row: ModelStatsRow): 'real' | 'ping' | null {
  if (row.real && row.real.runs >= MIN_RANKING_SAMPLE) return 'real';
  if (row.ping && row.ping.runs >= MIN_RANKING_SAMPLE) return 'ping';
  return null;
}

/** Aggregate columns as they arrive from the driver. */
type RawAggregate = {
  runs: string | number;
  successes: string | number | null;
  avgMs: string | number | null;
  minMs: string | number | null;
};

/**
 * MySQL returns `COUNT`/`SUM`/`AVG` as strings, so every figure is coerced here. A missing average
 * means no run succeeded, which is a real state and must not read as "0 ms".
 */
function toUsageStats(raw: RawAggregate): ModelUsageStats {
  const runs = Number(raw.runs) || 0;
  const successes = Number(raw.successes) || 0;

  return {
    runs,
    successRate: runs > 0 ? Math.round((successes / runs) * 100) : 0,
    avgMs: Math.round(Number(raw.avgMs) || 0),
    minMs: Math.round(Number(raw.minMs) || 0),
  };
}

@Injectable()
export class LlmProviderService {
  constructor(
    @InjectRepository(LlmProviderEntity)
    private readonly providerRepo: Repository<LlmProviderEntity>,
    @InjectRepository(LlmModelEntity)
    private readonly modelRepo: Repository<LlmModelEntity>,
    @InjectRepository(LlmModelTestResultEntity)
    private readonly testResultRepo: Repository<LlmModelTestResultEntity>,
    @InjectRepository(LlmCallStatEntity)
    private readonly callStatRepo: Repository<LlmCallStatEntity>,
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

  /**
   * Per-model usage statistics for the statistics view: connectivity pings beside real work.
   *
   * Both sides are aggregated **in SQL**. The neighbouring `findProviders` loads every test result
   * of every model, which is tolerable for a handful of manual pings but would not survive
   * `llm_call_stats` — a table that grows by one row per LLM call.
   *
   * Only successful runs contribute to the latency figures, because a failed call's duration
   * measures the failure (frequently a timeout) rather than the model. Failures are still counted
   * where they belong: in the success rate over all runs.
   */
  async getModelStats(): Promise<ServiceResultContainer<ModelStats>> {
    const [providersResult, pingRows, realRows] = await Promise.all([
      this.findProviders(),
      this.testResultRepo
        .createQueryBuilder('result')
        .select('result.model_id', 'modelId')
        .addSelect('COUNT(*)', 'runs')
        .addSelect(`SUM(CASE WHEN result.status = 'success' THEN 1 ELSE 0 END)`, 'successes')
        .addSelect(`AVG(CASE WHEN result.status = 'success' THEN result.responseTimeMs END)`, 'avgMs')
        .addSelect(`MIN(CASE WHEN result.status = 'success' THEN result.responseTimeMs END)`, 'minMs')
        .groupBy('result.model_id')
        .getRawMany<RawAggregate & { modelId: number }>(),
      this.callStatRepo
        .createQueryBuilder('stat')
        .select('stat.provider_key', 'providerKey')
        .addSelect('stat.model_key', 'modelKey')
        .addSelect('COUNT(*)', 'runs')
        .addSelect(`SUM(CASE WHEN stat.status = 'success' THEN 1 ELSE 0 END)`, 'successes')
        .addSelect(`AVG(CASE WHEN stat.status = 'success' THEN stat.latencyMs END)`, 'avgMs')
        .addSelect(`MIN(CASE WHEN stat.status = 'success' THEN stat.latencyMs END)`, 'minMs')
        .addSelect('MAX(stat.createdAt)', 'lastCallAt')
        .where('stat.caller <> :healthCaller', { healthCaller: HEALTH_CALLER })
        .groupBy('stat.provider_key')
        .addGroupBy('stat.model_key')
        .getRawMany<RawAggregate & { providerKey: string; modelKey: string; lastCallAt: Date | string }>(),
    ]);

    // Rows are keyed by the configured models first, in the provider order the UI already shows.
    const rowsById = new Map<string, ModelStatsRow>();
    const rowIdByModelId = new Map<number, string>();

    for (const provider of providersResult.result ?? []) {
      for (const model of provider.models ?? []) {
        const id = modelStatsId(provider.key, model.key);
        rowsById.set(id, {
          id,
          providerKey: provider.key,
          modelKey: model.key,
          label: model.label ?? null,
          active: Boolean(provider.active && model.active),
          ping: null,
          real: null,
          lastCallAt: null,
          rankingBasis: null,
        });
        rowIdByModelId.set(model.id, id);
      }
    }

    for (const ping of pingRows) {
      const row = rowsById.get(rowIdByModelId.get(Number(ping.modelId)) ?? '');
      if (row) {
        row.ping = toUsageStats(ping);
      }
    }

    for (const real of realRows) {
      const id = modelStatsId(real.providerKey, real.modelKey);
      // A call can outlive the model row it belonged to — a deleted or renamed model keeps its
      // history rather than taking it to the grave, so an unknown key still gets a row.
      let row = rowsById.get(id);
      if (!row) {
        row = {
          id,
          providerKey: real.providerKey,
          modelKey: real.modelKey,
          label: null,
          active: false,
          ping: null,
          real: null,
          lastCallAt: null,
          rankingBasis: null,
        };
        rowsById.set(id, row);
      }
      row.real = toUsageStats(real);
      row.lastCallAt = real.lastCallAt ? new Date(real.lastCallAt) : null;
    }

    const rows = [...rowsById.values()];
    for (const row of rows) {
      row.rankingBasis = rankBasisFor(row);
    }
    const ranked = rows.filter((row) => row.rankingBasis !== null);
    const basisOf = (row: ModelStatsRow): ModelUsageStats => (row.rankingBasis === 'real' ? row.real! : row.ping!);

    // A model whose runs all failed has no latency at all: `AVG` over zero successful rows comes
    // back NULL, which coerces to 0 and would then win "fastest" outright. Only a genuinely
    // measured latency is eligible — reliability is a separate question, answered below.
    const measured = ranked.filter((row) => basisOf(row).avgMs > 0);

    const fastest = measured.reduce<ModelStatsRow | null>(
      (best, row) => (best === null || basisOf(row).avgMs < basisOf(best).avgMs ? row : best),
      null,
    );
    // Tie-break on the number of runs: with equal reliability, the better-measured model wins.
    const mostStable = ranked.reduce<ModelStatsRow | null>(
      (best, row) =>
        best === null ||
        basisOf(row).successRate > basisOf(best).successRate ||
        (basisOf(row).successRate === basisOf(best).successRate && basisOf(row).runs > basisOf(best).runs)
          ? row
          : best,
      null,
    );

    return {
      success: true,
      message: 'Model statistics retrieved',
      result: {
        minimumSample: MIN_RANKING_SAMPLE,
        rows,
        fastestId: fastest?.id ?? null,
        mostStableId: mostStable?.id ?? null,
      },
    };
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

  /**
   * Appends one real-call record. Called fire-and-forget from `LlmClientService`, so it stays
   * cheap: a single insert and no lookups.
   */
  async saveCallStat(stat: {
    providerKey: string;
    modelKey: string;
    latencyMs: number;
    status: 'success' | 'error' | 'timeout';
    caller: string;
    errorMessage: string | null;
  }): Promise<LlmCallStatEntity> {
    return this.callStatRepo.save(this.callStatRepo.create(stat));
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
