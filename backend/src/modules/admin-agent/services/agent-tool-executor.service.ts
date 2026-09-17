import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { User } from '../../users/entities/user.entity';
import { LlmToolCall } from '../../llm/types/llm.types';
import { SwaggerToolsParser } from './swagger-tools.parser';
import { McpBridgeService } from '../../mcp-bridge/mcp-bridge.service';
import { AxiosRequestConfig } from 'axios';

export interface PendingAction {
  id: string;
  sessionId: number;
  userId: number;
  functionName: string;
  args: Record<string, any>;
  description: string;
  target: string;
  metadata?: Record<string, any>;
  createdAt: number;
  expiresAt: number;
  executed: boolean;
}

const PENDING_ACTION_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class AgentToolExecutorService {
  private readonly logger = new Logger(AgentToolExecutorService.name);
  private readonly pendingActions = new Map<string, PendingAction>();
  private readonly internalTokenCache = new Map<number, { token: string; expiresAt: number }>();
  // Must stay below the internal JWT `expiresIn` (5m) — a cached token whose JWT
  // already expired produces 401s on agent tool calls (seen 2026-08-26: 5-10min window).
  private readonly INTERNAL_TOKEN_TTL_MS = 4 * 60 * 1000;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly httpService: HttpService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly swaggerToolsParser: SwaggerToolsParser,
    private readonly mcpBridgeService: McpBridgeService,
  ) { }

  private getPendingKey(sessionId: number, functionName: string, args: Record<string, any>): string {
    return `${sessionId}:${functionName}:${JSON.stringify(args)}`;
  }

  isDangerousOperation(functionName: string): boolean {
    return this.swaggerToolsParser.requiresConfirmation(functionName);
  }

  getPendingAction(sessionId: number): PendingAction | undefined {
    for (const [, action] of this.pendingActions.entries()) {
      if (action.sessionId === sessionId) {
        return action;
      }
    }
    return undefined;
  }

  storePendingAction(sessionId: number, userId: number, functionName: string, args: Record<string, any>, description: string, target: string, metadata?: Record<string, any>): PendingAction {
    const id = `pending_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    const action: PendingAction = {
      id,
      sessionId,
      userId,
      functionName,
      args,
      description,
      target,
      metadata,
      createdAt: now,
      expiresAt: now + PENDING_ACTION_TTL_MS,
      executed: false,
    };
    this.pendingActions.set(id, action);
    this.logger.log(`Stored pending action ${id}: ${functionName} for session ${sessionId}`);
    return action;
  }

  confirmPendingActionById(actionId: string): PendingAction | undefined {
    const action = this.pendingActions.get(actionId);
    if (!action) {
      this.logger.warn(`confirmPendingActionById: action ${actionId} not found`);
      return undefined;
    }

    if (action.executed) {
      this.logger.warn(`confirmPendingActionById: action ${actionId} already executed`);
      this.pendingActions.delete(actionId);
      return undefined;
    }

    if (Date.now() > action.expiresAt) {
      this.logger.warn(`confirmPendingActionById: action ${actionId} expired`);
      this.pendingActions.delete(actionId);
      return undefined;
    }

    action.executed = true;
    this.pendingActions.delete(actionId);
    this.logger.log(`Confirmed pending action ${actionId}: ${action.functionName}`);
    return action;
  }

  cancelPendingActionById(actionId: string): PendingAction | undefined {
    const action = this.pendingActions.get(actionId);
    if (action) {
      this.pendingActions.delete(actionId);
      this.logger.log(`Cancelled pending action ${actionId}: ${action.functionName}`);
      return action;
    }
    return undefined;
  }

  getPendingActionOwner(actionId: string): { userId: number; sessionId: number } | undefined {
    const action = this.pendingActions.get(actionId);
    if (!action) return undefined;
    return { userId: action.userId, sessionId: action.sessionId };
  }

  inspectPendingAction(actionId: string): { status: 'pending' | 'expired' | 'already_processed' | 'not_found'; action?: PendingAction } {
    const action = this.pendingActions.get(actionId);
    if (!action) return { status: 'not_found' };
    if (action.executed) return { status: 'already_processed', action };
    if (Date.now() > action.expiresAt) return { status: 'expired', action };
    return { status: 'pending', action };
  }

  confirmPendingAction(sessionId: number): PendingAction | undefined {
    for (const [key, action] of this.pendingActions.entries()) {
      if (action.sessionId === sessionId) {
        this.pendingActions.delete(key);
        this.logger.log(`Confirmed pending action: ${action.functionName} for session ${sessionId}`);
        return action;
      }
    }
    return undefined;
  }

  cancelPendingAction(sessionId: number): boolean {
    for (const [key, action] of this.pendingActions.entries()) {
      if (action.sessionId === sessionId) {
        this.pendingActions.delete(key);
        this.logger.log(`Cancelled pending action: ${action.functionName} for session ${sessionId}`);
        return true;
      }
    }
    return false;
  }

  hasPendingConfirmation(sessionId: number, functionName: string, args: Record<string, any>): boolean {
    const key = this.getPendingKey(sessionId, functionName, args);
    return this.pendingActions.has(key);
  }

  getSemanticActionDescription(functionName: string, args: any): string {
    const endpointMeta = this.swaggerToolsParser.getEndpoint(functionName);

    let base: string;
    if (endpointMeta && endpointMeta.summary) {
      base = endpointMeta.summary;
    } else {
      const mcpDescriptions: Record<string, string> = {
        'get_current_conditions': 'מקבל מזג אוויר נוכחי',
        'get_forecast': 'מקבל תחזית מזג אוויר',
        'get_weather_summary': 'מקבל סיכום מזג אוויר מלא',
        'check_service_status': 'בודק סטטוס שירות',
      };

      base = mcpDescriptions[functionName] ?? `מפעיל את כלי המערכת: ${functionName}`;
    }

    const detail = this.identifyingArgDetail(args);
    return detail ? `${base} (${detail})` : base;
  }

  /**
   * Picks one short identifying argument (id, name, ...) so repeated steps for
   * different targets don't render as N identical rows in the chat UI.
   */
  private identifyingArgDetail(args: any): string | null {
    if (!args || typeof args !== 'object') return null;
    for (const key of ['id', 'modelId', 'sessionId', 'name', 'label', 'city', 'query']) {
      const value = (args as Record<string, unknown>)[key];
      if (typeof value === 'string' || typeof value === 'number') {
        const text = String(value).trim();
        if (text.length > 0 && text.length <= 60) return `${key} ${text}`;
      }
    }
    return null;
  }

  private checkActionAllowed(
    functionName: string,
    args: any,
    currentUserId: number,
  ): { allowed: boolean; reason?: string } {
    const targetId = args && args.id ? Number(args.id) : null;

    if (targetId === currentUserId) {
      if (functionName === 'UsersController_delete') {
        return {
          allowed: false,
          reason: 'חוק אבטחת מערכת: אינך מורשה למחוק את החשבון המחובר של עצמך מהממשק.',
        };
      }

      if (functionName === 'UsersController_updateRole') {
        const targetRole = Number(args.role);
        if (targetRole === 2) {
          return {
            allowed: false,
            reason: 'חוק אבטחת מערכת: אינך מורשה להוריד את עצמך בדרגה מתפקיד מנהל לתפקיד משתמש רגיל.',
          };
        }
      }
    }

    return { allowed: true };
  }

  private async getInternalToken(userId: number): Promise<string> {
    const cached = this.internalTokenCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.token;
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error(`User ${userId} not found for system authentication`);
    }

    const payload = { sub: user.id, email: user.email, role: user.role };
    const token = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_SECRET'),
      expiresIn: '5m',
    });

    this.internalTokenCache.set(userId, { token, expiresAt: Date.now() + this.INTERNAL_TOKEN_TTL_MS });
    return token;
  }

  private async getSystemHeadersForUser(userId: number): Promise<Record<string, string>> {
    const accessToken = await this.getInternalToken(userId);

    return {
      'Cookie': `access_token=${accessToken}`,
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * H4 SSRF defense-in-depth: verifies the final resolved URL is still safe
   * before the HTTP request is dispatched.
   *
   * Rejects:
   * 1. Any URL that does not start with the base URL (scheme/host escape).
   * 2. Any remainder after the base URL that contains `..` (path traversal)
   *    or raw `?`/`#` (parameter injection).
   *
   * @param targetUrl - the fully resolved URL produced by SwaggerToolsParser.resolveArguments
   * @param baseUrl - the trusted base URL the target must be anchored to
   * @throws Error with a Hebrew security message when the URL is unsafe
   */
  private assertSafeTargetUrl(targetUrl: string, baseUrl: string): void {
    if (!targetUrl.startsWith(baseUrl)) {
      throw new Error(
        `חסימת אבטחה (SSRF): כתובת היעד "${targetUrl}" חייבת להתחיל בכתובת הבסיס "${baseUrl}".`,
      );
    }

    const remainder = targetUrl.slice(baseUrl.length);
    if (
      (remainder !== '' && !remainder.startsWith('/')) || // host-suffix escape, e.g. http://localhost:3000evil.com
      remainder.includes('..') ||
      remainder.includes('?') ||
      remainder.includes('#')
    ) {
      throw new Error(
        `חסימת אבטחה (SSRF): כתובת היעד "${targetUrl}" מכילה תווים או מבנה אסורים (.., ?, #) בנתיב שנפתר.`,
      );
    }
  }

  async executeToolCall(call: LlmToolCall, userId: number, sessionId?: number): Promise<string> {
    if (this.mcpBridgeService.hasTool(call.function.name)) {
      let args: Record<string, any> = {};
      try {
        args = JSON.parse(call.function.arguments || '{}');
      } catch {
        // keep empty
      }
      return this.mcpBridgeService.callTool(call.function.name, args);
    }

    const endpointMeta = this.swaggerToolsParser.getEndpoint(call.function.name);
    if (!endpointMeta) {
      this.logger.error(`Unknown tool call: ${call.function.name}`);
      return JSON.stringify({ error: `Unknown tool call: ${call.function.name}` });
    }

    let args: Record<string, any> = {};
    try {
      args = JSON.parse(call.function.arguments || '{}');
    } catch (e) {
      this.logger.warn(`Failed to parse tool arguments for ${call.function.name}, using empty object.`);
    }

    if (args && typeof args.role === 'string') {
      const lowerRole = args.role.toLowerCase();
      if (lowerRole === 'admin') {
        args.role = 1;
      } else if (lowerRole === 'user') {
        args.role = 2;
      }
    }

    const guardResult = this.checkActionAllowed(call.function.name, args, userId);
    if (!guardResult.allowed) {
      this.logger.warn(`Security Blocked Action: ${guardResult.reason}`);
      return JSON.stringify({ error: guardResult.reason, status: 403 });
    }

    if (sessionId && this.isDangerousOperation(call.function.name) && !this.hasPendingConfirmation(sessionId, call.function.name, args)) {
      const description = this.getSemanticActionDescription(call.function.name, args);
      const target = args.id ? `ID ${args.id}` : JSON.stringify(args);
      const metadata: Record<string, any> = {};

      if (call.function.name === 'LlmProviderController_cleanupTestResults') {
        metadata.retentionDays = args.retentionDays ?? 30;
      }

      const pendingAction = this.storePendingAction(sessionId, userId, call.function.name, args, description, target, metadata);
      return JSON.stringify({
        error: 'CONFIRMATION_REQUIRED',
        actionId: pendingAction.id,
        description,
        target,
        metadata,
        message: `פעולה זו דורשת אישור: ${description}`,
      });
    }

    if (sessionId && this.isDangerousOperation(call.function.name)) {
      this.confirmPendingAction(sessionId);
    }

    const baseUrl = `http://localhost:${this.configService.get('PORT', 3000)}`;
    const resolved = this.swaggerToolsParser.resolveArguments(
      endpointMeta.path,
      endpointMeta.method,
      args,
      baseUrl,
    );

    try {
      this.assertSafeTargetUrl(resolved.targetUrl, baseUrl);
    } catch (err: any) {
      this.logger.error(`Security blocked unsafe target URL for "${call.function.name}": ${err.message}`);
      return JSON.stringify({
        error: err.message,
        status: 403,
      });
    }

    this.logger.log(`Executing tool "${call.function.name}" -> [${endpointMeta.method.toUpperCase()}] ${resolved.targetUrl}`);
    const systemHeaders = await this.getSystemHeadersForUser(userId);

    try {
      const method = endpointMeta.method.toLowerCase();

      const config: AxiosRequestConfig = {
        method: method as any,
        url: resolved.targetUrl,
        headers: systemHeaders,
        params: resolved.queryParams,
        ...(method !== 'get' ? { data: resolved.body } : {}),
      };

      const response$ = this.httpService.request(config);
      const res = await firstValueFrom(response$);

      return JSON.stringify((res as any).data);
    } catch (err: any) {
      this.logger.error(`Tool execution error in ${call.function.name}: ${err.message}`);
      return JSON.stringify({
        error: err.message,
        status: err.response?.status || 500,
        details: err.response?.data
      });
    }
  }
}
