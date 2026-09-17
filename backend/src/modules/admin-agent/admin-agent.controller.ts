import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Logger,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Response } from 'express';
import { AdminAgentService } from './admin-agent.service';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RequestWithUser } from '../../core/interfaces/request-with-user.interface';
import { ServiceResultContainer } from '../../core/models/service-result-container.model';
import { AgentRequestDto } from './dto/agent-request.dto';
import { SessionResponseDto } from './dto/session-response.dto';
import { ChatMessageResponseDto } from './dto/chat-message-response.dto';
import { AgentStreamEventDto } from './dto/agent-stream-event.dto';
import { GetSessionsQueryDto } from './dto/get-sessions-query.dto';
import { ConfirmActionDto } from './dto/confirm-action.dto';
import { CustomApiOperationOptions } from '../../core/types/custom-api-operation-options.type';
import { AgentToolExecutorService } from './services/agent-tool-executor.service';
import { AgentAuditService } from './services/agent-audit.service';
import { AuditAction } from './entities/agent-action-audit-log.entity';
import { LlmToolCall } from '../llm/types/llm.types';

@ApiTags('Admin Agent')
@ApiBearerAuth()
@ApiExtraModels(SessionResponseDto, ChatMessageResponseDto, AgentStreamEventDto)
@Controller('admin-agent')
export class AdminAgentController {
  private readonly logger = new Logger(AdminAgentController.name);

  constructor(
    private readonly adminAgentService: AdminAgentService,
    private readonly agentToolExecutorService: AgentToolExecutorService,
    private readonly agentAuditService: AgentAuditService,
  ) { }

  @UseGuards(JwtAuthGuard)
  @Get('sessions')
  @ApiOperation({
    summary: 'Get chat sessions for the authenticated user',
    summaryHe: 'מציג את שיחות הצ\'אט השמורות',
    toolIcon: 'ph-chat-centered-text',
    description:
      'Returns recent chat sessions owned by the authenticated user. Sessions from other users are never returned.',
  } as CustomApiOperationOptions)
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Optional maximum number of recent sessions to return.',
  })
  @ApiResponse({ status: 200, description: 'Sessions retrieved successfully.', type: [SessionResponseDto] })
  async getSessions(
    @Req() req: RequestWithUser,
    @Query() query: GetSessionsQueryDto,
  ) {
    if (!req.user) {
      throw new UnauthorizedException();
    }
    const sessions = await this.adminAgentService.getSessions(req.user.sub, query.limit);
    return {
      success: true,
      message: `נטענו ${sessions.length} שיחות`,
      result: sessions,
    } satisfies ServiceResultContainer<unknown>;
  }

  @UseGuards(JwtAuthGuard)
  @Get('sessions/:id/messages')
  @ApiOperation({
    summary: 'Get session message history',
    summaryHe: 'מציג את היסטוריית ההודעות של שיחה',
    toolIcon: 'ph-chats',
    description:
      'Returns user and assistant messages for a session owned by the authenticated user. ' +
      'Internal tool messages are filtered out for normal history display. ' +
      'Response header X-Has-More-Images indicates whether additional images are available via the batch endpoint.',
  } as CustomApiOperationOptions)
  @ApiParam({ name: 'id', type: Number, description: 'Numeric chat session id.' })
  @ApiResponse({ status: 200, description: 'Historical messages loaded successfully.', type: [ChatMessageResponseDto] })
  async getSessionMessages(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: RequestWithUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!req.user) {
      throw new UnauthorizedException();
    }
    const result = await this.adminAgentService.getSessionMessages(id, req.user.sub);
    res.setHeader('x-has-more-images', String(result.hasMoreImages));
    return {
      success: true,
      message: `נטענו ${result.messages.length} הודעות`,
      result: result.messages,
    } satisfies ServiceResultContainer<unknown>;
  }

  @UseGuards(JwtAuthGuard)
  @Post('messages/images')
  @ApiOperation({
    summary: 'Batch fetch image data for messages',
    summaryHe: 'שולף ומציג את קבצי המדיה של הודעה',
    toolIcon: 'ph-image',
    description:
      'Returns the imageUrl (Base64 data URL) for each requested message ID. ' +
      'The frontend calls this for messages whose images were stripped by the 20-image cap.',
  } as CustomApiOperationOptions)
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        messageIds: {
          type: 'array',
          items: { type: 'number' },
          description: 'Array of message IDs (max 50).',
        },
      },
      required: ['messageIds'],
    },
  })
  @ApiResponse({ status: 200, description: 'Map of message ID to imageUrl.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  @ApiForbiddenResponse({ description: 'One or more messages do not belong to your sessions.' })
  async getMessageImages(
    @Body('messageIds') messageIds: number[],
    @Req() req: RequestWithUser,
  ) {
    if (!req.user) {
      throw new UnauthorizedException();
    }
    if (!Array.isArray(messageIds) || messageIds.length === 0 || messageIds.length > 50) {
      throw new BadRequestException('messageIds must be a non-empty array of at most 50 IDs.');
    }
    const images = await this.adminAgentService.getMessageImages(messageIds, req.user.sub);
    return {
      success: true,
      message: `נטענו ${Object.keys(images).length} תמונות`,
      result: images,
    } satisfies ServiceResultContainer<unknown>;
  }

  @UseGuards(JwtAuthGuard)
  @Post('sessions')
  @ApiOperation({
    summary: 'Create a new chat session',
    summaryHe: 'פותח שיחת צ\'אט חדשה עם סוכן ה-AI',
    toolIcon: 'ph-plus-circle',
    description: 'Creates a new empty chat session owned by the authenticated user.',
  } as CustomApiOperationOptions)
  @ApiResponse({ status: 201, description: 'Chat session created successfully.', type: SessionResponseDto })
  async createSession(@Req() req: RequestWithUser) {
    if (!req.user) {
      throw new UnauthorizedException();
    }
    const session = await this.adminAgentService.createSession(req.user.sub);
    return {
      success: true,
      message: 'השיחה נוצרה בהצלחה',
      result: session,
    } satisfies ServiceResultContainer<unknown>;
  }

  @UseGuards(JwtAuthGuard)
  @Delete('sessions/:id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete chat session',
    summaryHe: 'מוחק לצמיתות שיחת צ\'אט מההיסטוריה השמורה',
    toolIcon: 'ph-trash',
    description:
      'Permanently deletes a session owned by the authenticated user. ' +
      'ChatMessage rows are cascade-deleted through the ChatMessage.session relation.',
  } as CustomApiOperationOptions)
  @ApiParam({ name: 'id', type: Number, description: 'Numeric chat session id to delete.' })
  @ApiResponse({ status: 204, description: 'Chat session deleted successfully.' })
  async deleteSession(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: RequestWithUser,
  ) {
    if (!req.user) {
      throw new UnauthorizedException();
    }
    await this.adminAgentService.deleteSession(id, req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('sessions/:sessionId/messages/:messageId')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete a chat message and later history',
    summaryHe: 'מוחק הודעה ואת ההודעות שאחריה',
    toolIcon: 'ph-trash',
    description:
      'Permanently deletes one message owned by the authenticated user and every later message in the same session. ' +
      'This preserves conversation consistency by preventing later assistant or tool messages from remaining without their original context.',
  } as CustomApiOperationOptions)
  @ApiParam({ name: 'sessionId', type: Number, description: 'Numeric chat session id that owns the message.' })
  @ApiParam({ name: 'messageId', type: Number, description: 'Numeric chat message id to delete from.' })
  @ApiResponse({ status: 204, description: 'Chat message and later session history deleted successfully.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  @ApiForbiddenResponse({ description: 'The session or message does not belong to the authenticated user.' })
  async deleteSessionMessage(
    @Param('sessionId', ParseIntPipe) sessionId: number,
    @Param('messageId', ParseIntPipe) messageId: number,
    @Req() req: RequestWithUser,
  ) {
    if (!req.user) {
      throw new UnauthorizedException();
    }
    await this.adminAgentService.deleteSessionMessage(sessionId, messageId, req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post('query-stream')
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiOperation({
    summary: 'Query Admin Agent as a streamed response',
    summaryHe: 'מתכתב עם סוכן הניהול בסטרמינג',
    toolIcon: 'ph-robot',
    description:
      'Streams newline-delimited JSON objects over a text/event-stream response. ' +
      'Each line is an AgentStreamEventDto. Token events use { "type": "token", "content": "..." }. ' +
      'Step events use { "type": "step", "icon": "...", "message": "..." }. ' +
      'The stream is complete when the HTTP response ends.',
  } as CustomApiOperationOptions)
  @ApiBody({
    type: AgentRequestDto,
    description: 'Agent prompt payload with optional chat session, image, and per-request LLM model override.',
  })
  @ApiResponse({
    status: 200,
    description: 'Stream opened. Response body contains newline-delimited AgentStreamEventDto JSON objects.',
    type: AgentStreamEventDto,
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  async streamChat(
    @Body() dto: AgentRequestDto,
    @Req() req: RequestWithUser,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log('--- Incoming Stream Request ---');

    if (!req.user) {
      throw new UnauthorizedException('User not authenticated');
    }

    const userId = req.user.sub;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      const stream = this.adminAgentService.queryDatabaseStream(
        dto.prompt,
        userId,
        dto.sessionId,
        dto.provider,
        dto.model,
        dto.image,
      );

      for await (const token of stream) {
        res.write(token);
      }
    } catch (error: any) {
      this.logger.error(`Error during stream controller: ${error.message}`, error.stack);

      if (!res.closed) {
        const detail = error?.message ? ` (${error.message})` : '';
        res.write(`\n\n[שגיאת מערכת: תקשורת הסטרים נותקה במפתיע${detail}. נא לנסות שוב.]\n\n`);
      }
    } finally {
      if (!res.closed) {
        res.end();
      }
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('confirm-action')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Confirm or cancel a pending dangerous action',
    summaryHe: 'מאשר או מבטל פעולה שממתינה לאישור',
    toolIcon: 'ph-shield-check',
    description: 'Confirms or cancels a pending dangerous action. When confirmed, the action is executed immediately.',
  } as CustomApiOperationOptions)
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        actionId: { type: 'string', description: 'The pending action ID from the confirmation event' },
        confirmed: { type: 'boolean', description: 'true to confirm, false to cancel' },
      },
      required: ['actionId', 'confirmed'],
    },
  })
  @ApiResponse({ status: 200, description: 'Action confirmed/cancelled and executed if confirmed.' })
  @ApiForbiddenResponse({ description: 'Action belongs to another user.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  async confirmAction(
    @Body() dto: ConfirmActionDto,
    @Req() req: RequestWithUser,
  ) {
    if (!req.user) {
      throw new UnauthorizedException();
    }

    const ownership = this.agentToolExecutorService.getPendingActionOwner(dto.actionId);
    if (!ownership) {
      throw new NotFoundException('Pending action not found or already processed');
    }

    if (ownership.userId !== req.user.sub) {
      await this.agentAuditService.log({
        userId: req.user.sub,
        actionType: AuditAction.ACTION_UNAUTHORIZED_ACCESS_ATTEMPT,
        functionName: 'unknown',
        sessionId: ownership.sessionId,
        actionId: dto.actionId,
        metadata: {
          targetUserId: ownership.userId,
          requestedBy: req.user.sub,
          ip: req.ip,
        },
      });

      this.logger.warn(
        `SECURITY: User ${req.user.sub} attempted to confirm action ${dto.actionId} owned by user ${ownership.userId}`,
      );
      throw new ForbiddenException('This action belongs to another user');
    }

    if (dto.confirmed) {
      const inspection = this.agentToolExecutorService.inspectPendingAction(dto.actionId);
      if (inspection.status === 'expired') {
        await this.agentAuditService.log({
          userId: req.user.sub,
          actionType: AuditAction.ACTION_EXPIRED,
          functionName: inspection.action?.functionName ?? 'unknown',
          sessionId: ownership.sessionId,
          actionId: dto.actionId,
        });
        throw new BadRequestException('Pending action expired or already processed');
      }

      const pendingAction = this.agentToolExecutorService.confirmPendingActionById(dto.actionId);
      if (!pendingAction) {
        throw new BadRequestException('Pending action expired or already processed');
      }

      await this.agentAuditService.log({
        userId: req.user.sub,
        actionType: AuditAction.ACTION_CONFIRMED,
        functionName: pendingAction.functionName,
        sessionId: pendingAction.sessionId,
        actionId: dto.actionId,
        metadata: pendingAction.args,
      });

      const call: LlmToolCall = {
        id: `confirmed_${Date.now()}`,
        type: 'function',
        function: {
          name: pendingAction.functionName,
          arguments: JSON.stringify(pendingAction.args),
        },
      };

      const result = await this.agentToolExecutorService.executeToolCall(call, req.user.sub);
      return { success: true, message: 'הפעולה אושרה ובוצעה.', result };
    } else {
      const cancelledAction = this.agentToolExecutorService.cancelPendingActionById(dto.actionId);

      await this.agentAuditService.log({
        userId: req.user.sub,
        actionType: AuditAction.ACTION_CANCELLED,
        functionName: cancelledAction?.functionName ?? 'unknown',
        sessionId: ownership.sessionId,
        actionId: dto.actionId,
      });

      return {
        success: true,
        message: 'הפעולה בוטלה.',
        result: { cancelled: !!cancelledAction },
      };
    }
  }
}
