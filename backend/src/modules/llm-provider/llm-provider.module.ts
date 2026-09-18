import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LlmProviderController } from './llm-provider.controller';
import { LlmProviderService } from './llm-provider.service';
import { LlmProviderEntity } from './entities/llm-provider.entity';
import { LlmModelEntity } from './entities/llm-model.entity';
import { LlmModelTestResultEntity } from './entities/llm-model-test-results.entity';
import { LlmCallStatEntity } from './entities/llm-call-stat.entity';
import { UserLlmDefaultEntity } from './entities/user-llm-default.entity';
import { ModelMetadataCatalogService } from './services/model-metadata-catalog.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([LlmProviderEntity, LlmModelEntity, LlmModelTestResultEntity, LlmCallStatEntity, UserLlmDefaultEntity]),
  ],
  controllers: [LlmProviderController],
  providers: [LlmProviderService, ModelMetadataCatalogService],
  exports: [LlmProviderService],
})
export class LlmProviderModule { }