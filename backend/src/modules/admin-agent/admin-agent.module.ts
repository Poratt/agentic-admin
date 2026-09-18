import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { AdminAgentController } from './admin-agent.controller';
import { AdminAgentService } from './admin-agent.service';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { LlmModule } from '../llm/llm.module';
import { McpBridgeModule } from '../mcp-bridge/mcp-bridge.module';
import { GoogleCalendarModule } from '../google-calendar/google-calendar.module';
import { ChatMessage } from './entities/chat-message.entity';
import { ChatSession } from './entities/chat-session.entity';
import { AgentActionAuditLog } from './entities/agent-action-audit-log.entity';
import { SwaggerToolsParser } from './services/swagger-tools.parser';
import { ToolTierFilterService } from './services/tool-tier-filter.service';
import { AgentSessionService } from './services/agent-session.service';
import { AgentToolExecutorService } from './services/agent-tool-executor.service';
import { AgentAuditService } from './services/agent-audit.service';
import { RenderSpecService } from './render-spec/render-spec.service';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([User, ChatMessage, ChatSession, AgentActionAuditLog]),
    UsersModule,
    AuthModule,
    LlmModule,
    McpBridgeModule,
    GoogleCalendarModule,
  ],
  controllers: [AdminAgentController],
  providers: [
    AdminAgentService,
    SwaggerToolsParser,
    AgentSessionService,
    AgentToolExecutorService,
    ToolTierFilterService,
    AgentAuditService,
    RenderSpecService,
  ],
  exports: [AdminAgentService],
})
export class AdminAgentModule {}
