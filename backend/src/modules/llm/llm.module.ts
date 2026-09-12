import { Module } from '@nestjs/common';
import { LlmService } from './llm.service';
import { LlmController } from './llm.controller';
import { LlmClientService } from './services/llm-client.service';
import { LlmHealthService } from './services/llm-health.service';
import { LlmProviderConfigService } from './services/llm-provider-config.service';
import { LlmTasksService } from './services/llm-tasks.service';
import { LlmProviderModule } from '../llm-provider/llm-provider.module';

@Module({
  imports: [LlmProviderModule],
  controllers: [LlmController],
  providers: [
    LlmService,
    LlmProviderConfigService,
    LlmClientService,
    LlmHealthService,
    LlmTasksService // 🚀 cron service registration lives here
  ],
  exports: [LlmService, LlmClientService, LlmProviderConfigService],
})
export class LlmModule { }