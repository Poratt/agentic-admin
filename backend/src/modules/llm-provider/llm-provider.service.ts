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
