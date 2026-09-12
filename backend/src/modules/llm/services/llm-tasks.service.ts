import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LlmHealthService } from './llm-health.service';
import { LlmProviderService } from '../../llm-provider/llm-provider.service';

@Injectable()
export class LlmTasksService {
    private readonly logger = new Logger(LlmTasksService.name);
    private readonly LLM_HEALTH_CHECK_ENABLED = process.env.LLM_HEALTH_CHECK_ENABLED === 'true';

    constructor(
        private readonly healthService: LlmHealthService,
        private readonly providerService: LlmProviderService,
    ) { }

    // 🚀 Runs every two hours 🚀
    @Cron('0 0 */2 * * *')
    async handleNightlyLlmHealthCheck() {
        if (!this.LLM_HEALTH_CHECK_ENABLED) return;
        this.logger.log('--- Starting Nightly LLM Auto-Health Check Cron Job ---');

        try {
            // Runs the health check for all active models in the DB (which saves automatically to our new table!)
            const result = await this.healthService.testAllModels();

            this.logger.log(
                `Nightly LLM Health Check finished successfully. Tested ${result.result?.length ?? 0} models.`,
            );
        } catch (error) {
            this.logger.error('Error occurred during Nightly LLM Health Check Cron Job', error);
        }
    }

    // 🚀 Daily cleanup of model test results older than 30 days — runs every day at 03:00 🚀
    @Cron('0 0 3 * * *')
    async cleanupOldLlmModelTestResults() {
        this.logger.log('--- Starting LLM Model Test Results Retention Cleanup ---');
        try {
            const retentionDays = 30;
            const deletedCount = await this.providerService.deleteOldTestResults(retentionDays);
            this.logger.log(
                `LLM Model Test Results Retention Cleanup finished. Deleted ${deletedCount} rows older than ${retentionDays} days.`,
            );
        } catch (error) {
            this.logger.error('Error occurred during LLM Model Test Results Retention Cleanup', error);
        }
    }
}
