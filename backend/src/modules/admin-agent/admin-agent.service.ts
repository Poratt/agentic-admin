import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import { AgentSessionService, trimHistoryForLlm } from './services/agent-session.service';
import { AgentToolExecutorService } from './services/agent-tool-executor.service';
import { ChatSession } from './entities/chat-session.entity';
import { ChatMessage } from './entities/chat-message.entity';
import { SYSTEM_CONTEXT, buildSystemContext } from './constants/system-context.constant';
import { SwaggerToolsParser, type LlmToolSchema } from './services/swagger-tools.parser';
import { RenderSpecService } from './render-spec/render-spec.service';
import { McpBridgeService } from '../mcp-bridge/mcp-bridge.service';
import { GoogleCalendarService } from '../google-calendar/google-calendar.service';
import type { LlmProvider, LlmToolCall } from '../llm/types/llm.types';

const MAX_ITERATIONS = 10;
const MAX_DUPLICATE_TOOL_CALLS = 2;
// Absolute backstop: total tool executions allowed in one turn, regardless of
// shape. The tool+args breaker catches true repeats; this catches unbounded
// fan-out (dozens of distinct-args calls) that would otherwise run to the end.
const MAX_TOTAL_TOOL_CALLS = 20;
const PARALLEL_UNSAFE_TOOL_NAMES = new Set([
  'LlmController_testLlm',
  'LlmController_testAll',
]);
const STEP_ICONS = {
  tool: 'ph-gear',
  error: 'ph-warning-circle',
  success: 'ph-check-circle',
} as const;

/**
 * Maps tool names to human-readable setup instructions shown to the user
 * when the tool fails because the underlying service isn't connected.
 */
const SETUP_INSTRUCTIONS: Record<string, { he: string; authTool?: string }> = {
  GoogleCalendarController_auth: {
    he: 'הנה הקישור לחיבור Google Calendar:',
    authTool: 'GoogleCalendarController_auth',
  },
  GoogleCalendarController_events: {
    he: 'היומן שלך עדיין לא מחובר.',
    authTool: 'GoogleCalendarController_auth',
  },
  GoogleCalendarController_createEvent: {
    he: 'היומן שלך עדיין לא מחובר.',
    authTool: 'GoogleCalendarController_auth',
  },
  GoogleCalendarController_updateEvent: {
    he: 'היומן שלך עדיין לא מחובר.',
    authTool: 'GoogleCalendarController_auth',
  },
  GoogleCalendarController_deleteEvent: {
    he: 'היומן שלך עדיין לא מחובר.',
    authTool: 'GoogleCalendarController_auth',
  },
};

type ToolCallResult = {
  call: LlmToolCall;
  resultData: string;
};

@Injectable()
export class AdminAgentService implements OnModuleInit {
  private readonly logger = new Logger(AdminAgentService.name);
  private readonly toolCallCounter: Map<string, number> = new Map<string, number>();
  private totalToolCalls = 0;
  private readonly contentPolicyRetries: Map<string, number> = new Map<string, number>();

  constructor(
    private readonly llmService: LlmService,
    private readonly swaggerToolsParser: SwaggerToolsParser,
    private readonly agentSessionService: AgentSessionService,
    private readonly agentToolExecutorService: AgentToolExecutorService,
    private readonly renderSpecService: RenderSpecService,
    private readonly mcpBridgeService: McpBridgeService,
    private readonly googleCalendarService: GoogleCalendarService,
  ) { }

  private getTools(): LlmToolSchema[] {
    const swaggerTools = this.swaggerToolsParser.getTools();
    const mcpEnabled = (process.env.MCP_ENABLED ?? 'false') === 'true';
    if (!mcpEnabled) {
      return swaggerTools;
    }
    const mcpTools = this.mcpBridgeService.getTools();
    return mcpTools.length > 0 ? [...swaggerTools, ...mcpTools] : swaggerTools;
  }

  onModuleInit(): void {
    this.logger.log('AdminAgentService initialized. Orchestrator ready.');
    setTimeout(() => {
      this.printParsedSwaggerTools();
    }, 1000);
  }

  private printParsedSwaggerTools(): void {
    try {
      const tools = this.swaggerToolsParser.getTools();
      this.logger.log(`--- START SWAGGER-TOOLS-PARSER OUTPUT: LOADED ${tools.length} TOOLS ---`);

      const fnWidth = Math.max(...tools.map((fn) => {
        return fn.function?.name.length || 0;
      }));

      tools.forEach((tool) => {
        const functionName = tool.function?.name;
        if (functionName) {
          const endpoint = this.swaggerToolsParser.getEndpoint(functionName);
          const methodStr = endpoint?.method.toUpperCase();
          this.logger.log(
            `Tool Name: "${functionName.padEnd(fnWidth)}" |${methodStr?.padEnd('DELETE'.length)}| ${endpoint?.path}`,
          );
        }
      });

      this.logger.log('--- END OF PARSED SWAGGER TOOLS OUTPUT ---');
    } catch (error: any) {
      this.logger.error(`Failed to execute swagger tools parser logging: ${error.message}`);
    }
  }

  async getSessions(userId: number, limit?: number): Promise<ChatSession[]> {
    return this.agentSessionService.getSessions(userId, limit);
  }

  async getSessionMessages(sessionId: number, userId: number) {
    return this.agentSessionService.getSessionMessages(sessionId, userId);
  }

  async getMessageImages(messageIds: number[], userId: number) {
    return this.agentSessionService.getMessageImages(messageIds, userId);
  }

  async createSession(userId: number): Promise<ChatSession> {
    return this.agentSessionService.createSession(userId);
  }

  async deleteSession(sessionId: number, userId: number): Promise<void> {
    return this.agentSessionService.deleteSession(sessionId, userId);
  }

  async deleteSessionMessage(sessionId: number, messageId: number, userId: number): Promise<void> {
    return this.agentSessionService.deleteSessionMessage(sessionId, messageId, userId);
  }

  async queryDatabase(
    prompt: string,
    userId: number,
    requestedSessionId?: number,
    provider?: LlmProvider,
    model?: string,
    image?: string,
  ): Promise<string> {
    this.resetToolCallCounter();
    const session = await this.agentSessionService.getOrCreateSession(userId, requestedSessionId);

    if (prompt && prompt.trim().length > 0) {
      await this.agentSessionService.updateSessionTitleIfDefault(session, prompt);
    }
    await this.agentSessionService.saveMessage(userId, session.id, 'user', prompt, { imageUrl: image });

    const tools = this.getTools();
    const dynamicSystemContext = this.getDynamicSystemContext(userId, provider, model);
    const collectedRenderBlocks: Array<{ component: string; data: Record<string, unknown> }> = [];
    let history = await this.agentSessionService.loadHistory(session.id, userId);

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration = iteration + 1) {
      const llmResponse = await this.llmService.generateResponse({
        prompt: iteration === 0 ? prompt : '',
        systemContext: dynamicSystemContext,
        messageHistory: trimHistoryForLlm(history),
        tools,
        providerOverride: provider,
        modelOverride: model,
        image: iteration === 0 ? image : undefined,
        maxTokens: 4096,
      });

      if (llmResponse.toolCalls && llmResponse.toolCalls.length > 0) {
        const duplicateCall = this.findDuplicateToolCall(llmResponse.toolCalls);

        if (duplicateCall) {
          const args = this.parseToolArguments(duplicateCall);
          this.logger.warn(
            `[AgentLoopBreaker] userId=${userId} sessionId=${session.id} toolName=${duplicateCall.function.name} args=${JSON.stringify(args)} — model called the same tool+args ${MAX_DUPLICATE_TOOL_CALLS + 1}+ times in one turn, breaking the loop.`,
          );

          // Auth/setup tools: rescue the flow — inject the already-obtained URL
          // and let the model present it to the user in one final no-tools turn.
          const rescued = await this.tryAuthUrlRescue({
            toolName: duplicateCall.function.name,
            history,
            userId,
            sessionId: session.id,
            systemContext: dynamicSystemContext,
            provider,
            model,
          });
          if (rescued) {
            await this.agentSessionService.saveMessage(userId, session.id, 'assistant', rescued);
            return rescued;
          }

          // Fallback: generic breaker message
          const breakerMessage = this.breakerErrorMessage(duplicateCall.function.name, args);
          await this.agentSessionService.saveMessage(userId, session.id, 'assistant', breakerMessage);
          return breakerMessage;
        }

        const toolCallsContent = this.truncateForStorage(JSON.stringify(llmResponse.toolCalls));
        await this.agentSessionService.saveMessage(userId, session.id, 'assistant', toolCallsContent, {
          toolCallId: 'YES_TOOL_CALLS',
        });
        history.push({ role: 'assistant', content: null, tool_calls: JSON.parse(toolCallsContent) });

        const groups = this.groupToolCallsForExecution(llmResponse.toolCalls);

          for (const group of groups) {
            if (this.overToolBudget(group.length)) {
              this.logger.warn(
                `[AgentLoopBreaker] userId=${userId} sessionId=${session.id} — turn exceeded ${MAX_TOTAL_TOOL_CALLS} tool calls, breaking.`,
              );
              const budgetMessage = this.budgetExceededMessage();
              await this.agentSessionService.saveMessage(userId, session.id, 'assistant', budgetMessage);
              return budgetMessage;
            }
            for (const call of group) {
              this.recordToolCall(call);
            }

            const results = await this.executeToolCallGroup(group, userId, session.id);

            for (const { call, resultData } of results) {
              let parsedResult: any;
              try {
                parsedResult = JSON.parse(resultData);
              } catch {
                parsedResult = null;
              }

              if (parsedResult?.error === 'CONFIRMATION_REQUIRED') {
              throw new Error('הפעולה דורשת אישור משתמש — יש להשתמש בשיחה הסטרימינגית לאישור פעולות רגישות.');
            }

            const renderSpec = this.renderSpecService.buildRenderSpec(call.function.name, resultData);
            if (renderSpec) {
              collectedRenderBlocks.push({ component: renderSpec.type, data: renderSpec.data });
            }

            let storedResult = resultData;

            // Content policy violation: give the LLM one chance to modify the prompt
            if (parsedResult?.error && this.isContentPolicyViolation(parsedResult)) {
              const toolName = call.function.name;
              const cpCount = (this.contentPolicyRetries.get(toolName) ?? 0) + 1;
              this.contentPolicyRetries.set(toolName, cpCount);

              if (cpCount >= 2) {
                const breakerMessage = `יצירת התמונה נכשלה שוב ושוב בגלל מגבלת תוכן (content_policy_violation). המודל לא מצליח לייצר תמונה תואמת לבקשה. אפשר לנסח את הבקשה מחדש או לנסות מודל אחר.`;
                await this.agentSessionService.saveMessage(userId, session.id, 'assistant', breakerMessage);
                return breakerMessage;
              }

              storedResult = JSON.stringify({
                error: 'content_policy_violation',
                message: 'יצירת התמונה נכשלה בגלל מגבלת תוכן. הprompt הנוכחי מפר את מדיניות התוכן של מודל יצירת התמונות.',
                instruction: 'analiz the prompt that caused the violation, identify the problematic elements, and generate a NEW, modified prompt that complies with content policy. Call the same tool again with the modified prompt. If you cannot identify what to change, explain to the user in Hebrew what went wrong and suggest an alternative.',
              });
            }

            const toolResultContent = this.truncateForStorage(storedResult);
            await this.agentSessionService.saveMessage(userId, session.id, 'tool', toolResultContent, {
              toolCallId: call.id,
              renderSpec: renderSpec ? JSON.stringify(renderSpec) : null,
            });
            history.push({ role: 'tool', tool_call_id: call.id, content: toolResultContent });
          }
        }
      } else {
        const assistantContent = llmResponse.content || '';
        await this.agentSessionService.saveMessage(userId, session.id, 'assistant', assistantContent, {
          renderSpec: collectedRenderBlocks.length > 0 ? JSON.stringify(collectedRenderBlocks) : null,
        });
        history.push({ role: 'assistant', content: assistantContent });
        return assistantContent;
      }
    }

    return 'תקשורת הסוכן הופסקה עקב הגעה למספר האיטרציות המרבי.';
  }

  async *queryDatabaseStream(
    prompt: string,
    userId: number,
    requestedSessionId?: number,
    provider?: LlmProvider,
    model?: string,
    image?: string,
  ): AsyncIterable<string> {
    if (image && image.length > 15 * 1024 * 1024) {
      yield JSON.stringify({ type: 'token', content: 'התמונה גדולה מדי. מקסימום 15MB.' }) + '\n';
      return;
    }

    this.resetToolCallCounter();
    const session = await this.agentSessionService.getOrCreateSession(userId, requestedSessionId);

    if (prompt && prompt.trim().length > 0) {
      await this.agentSessionService.updateSessionTitleIfDefault(session, prompt);
    }
    await this.agentSessionService.saveMessage(userId, session.id, 'user', prompt, { imageUrl: image });

    const tools = this.getTools();
    const dynamicSystemContext = this.getDynamicSystemContext(userId, provider, model);
    const collectedRenderBlocks: Array<{ component: string; data: Record<string, unknown> }> = [];
    let history = await this.agentSessionService.loadHistory(session.id, userId);

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration = iteration + 1) {
      const llmResponse = await this.llmService.generateResponse({
        prompt: iteration === 0 ? prompt : '',
        systemContext: dynamicSystemContext,
        messageHistory: trimHistoryForLlm(history),
        tools,
        providerOverride: provider,
        modelOverride: model,
        userId,
        image: iteration === 0 ? image : undefined,
        maxTokens: 4096,
      });

      if (llmResponse.toolCalls && llmResponse.toolCalls.length > 0) {
        const duplicateCall = this.findDuplicateToolCall(llmResponse.toolCalls);

        if (duplicateCall) {
          const args = this.parseToolArguments(duplicateCall);
          this.logger.warn(
            `[AgentLoopBreaker] userId=${userId} sessionId=${session.id} toolName=${duplicateCall.function.name} args=${JSON.stringify(args)} — model called the same tool+args ${MAX_DUPLICATE_TOOL_CALLS + 1}+ times in one turn, breaking the loop.`,
          );

          // Auth/setup tools: rescue the flow — inject the already-obtained URL
          // and let the model present it to the user in one final no-tools turn.
          const rescued = await this.tryAuthUrlRescue({
            toolName: duplicateCall.function.name,
            history,
            userId,
            sessionId: session.id,
            systemContext: dynamicSystemContext,
            provider,
            model,
          });
          if (rescued) {
            yield JSON.stringify({ type: 'token', content: rescued }) + '\n';
            await this.agentSessionService.saveMessage(userId, session.id, 'assistant', rescued, {
              renderSpec: collectedRenderBlocks.length > 0 ? JSON.stringify(collectedRenderBlocks) : null,
            });
            return;
          }

          // Fallback: generic breaker message
          const breakerMessage = this.breakerErrorMessage(duplicateCall.function.name, args);
          yield JSON.stringify({ type: 'step', icon: STEP_ICONS.error, message: breakerMessage }) + '\n';
          yield JSON.stringify({ type: 'token', content: breakerMessage }) + '\n';
          await this.agentSessionService.saveMessage(userId, session.id, 'assistant', breakerMessage);
          return;
        }

        await this.agentSessionService.saveMessage(
          userId,
          session.id,
          'assistant',
          this.truncateForStorage(JSON.stringify(llmResponse.toolCalls)),
          { toolCallId: 'YES_TOOL_CALLS' },
        );

        const groups = this.groupToolCallsForExecution(llmResponse.toolCalls);

        for (const group of groups) {
          if (this.overToolBudget(group.length)) {
            this.logger.warn(
              `[AgentLoopBreaker] userId=${userId} sessionId=${session.id} — turn exceeded ${MAX_TOTAL_TOOL_CALLS} tool calls, breaking.`,
            );
            const budgetMessage = this.budgetExceededMessage();
            yield JSON.stringify({ type: 'step', icon: STEP_ICONS.error, message: budgetMessage }) + '\n';
            yield JSON.stringify({ type: 'token', content: budgetMessage }) + '\n';
            await this.agentSessionService.saveMessage(userId, session.id, 'assistant', budgetMessage);
            return;
          }
          for (const call of group) {
            const args = this.parseToolArguments(call);
            const description = this.agentToolExecutorService.getSemanticActionDescription(call.function.name, args);
            const endpoint = this.swaggerToolsParser.getEndpoint(call.function.name);
            const toolIcon = endpoint?.toolIcon || STEP_ICONS.tool;

            this.recordToolCall(call);

            yield JSON.stringify({ type: 'step', icon: toolIcon, message: `${description}...` }) + '\n';
          }

          const results = await this.executeToolCallGroup(group, userId, session.id);

          for (const { call, resultData } of results) {
            let parsedResult: any;
            try {
              parsedResult = JSON.parse(resultData);
            } catch {
              parsedResult = null;
            }

            if (parsedResult?.error === 'CONFIRMATION_REQUIRED') {
              yield JSON.stringify({
                type: 'confirmation',
                actionId: parsedResult.actionId,
                action: parsedResult.description,
                target: parsedResult.target,
                metadata: parsedResult.metadata,
                message: parsedResult.message,
              }) + '\n';
              return;
            }

            if (resultData.includes('error')) {
              yield JSON.stringify({
                type: 'step',
                icon: STEP_ICONS.error,
                message: 'ביצוע השלב נכשל עקב מגבלות אבטחה או שגיאת שרת.',
              }) + '\n';
            } else {
              yield JSON.stringify({ type: 'step', icon: STEP_ICONS.success, message: 'השלב בוצע בהצלחה!' }) + '\n';
            }

            const renderSpec = this.renderSpecService.buildRenderSpec(call.function.name, resultData);
            if (renderSpec) {
              yield JSON.stringify({ type: 'render', component: renderSpec.type, data: renderSpec.data }) + '\n';
              collectedRenderBlocks.push({ component: renderSpec.type, data: renderSpec.data });
            }

            // When a tool fails because the underlying service isn't connected,
            // auto-call the auth tool and return the URL directly. This bypasses
            // the model entirely — no need for it to "understand" the instruction.
            let storedResult = resultData;
            const setup = SETUP_INSTRUCTIONS[call.function.name];
            if (setup?.authTool && parsedResult?.error) {
              try {
                const authResult = await this.googleCalendarService.getAuthUrl(userId);
                storedResult = JSON.stringify({
                  success: false,
                  setup_required: true,
                  message: setup.he,
                  auth_url: authResult.url,
                });
                // Build render spec for the auth URL so it shows as a clickable link
                const authRenderSpec = this.renderSpecService.buildRenderSpec(setup.authTool, JSON.stringify(authResult));
                if (authRenderSpec) {
                  yield JSON.stringify({ type: 'render', component: authRenderSpec.type, data: authRenderSpec.data }) + '\n';
                  collectedRenderBlocks.push({ component: authRenderSpec.type, data: authRenderSpec.data });
                }
                this.logger.warn(`[SetupAutoAuth] tool=${call.function.name} → auto-called ${setup.authTool}, url=${authResult.url.substring(0, 80)}...`);
              } catch (authErr: any) {
                this.logger.error(`[SetupAutoAuth] Failed to call auth tool: ${authErr.message}`);
                storedResult = JSON.stringify({
                  ...parsedResult,
                  error: `${setup.he} כדי לחבר, הפעל את הכלי: ${setup.authTool}`,
                  instruction: `${setup.he} כדי לחבר, הפעל את הכלי: ${setup.authTool}`,
                });
              }
            }

            // Content policy violation: give the LLM one chance to modify the prompt
            if (parsedResult?.error && this.isContentPolicyViolation(parsedResult)) {
              const toolName = call.function.name;
              const cpCount = (this.contentPolicyRetries.get(toolName) ?? 0) + 1;
              this.contentPolicyRetries.set(toolName, cpCount);

              if (cpCount >= 2) {
                // Second violation — break the loop
                this.logger.warn(`[AgentLoopBreaker] userId=${userId} sessionId=${session.id} toolName=${toolName} — content policy violation repeated ${cpCount} times, breaking.`);
                const breakerMessage = `יצירת התמונה נכשלה שוב ושוב בגלל מגבלת תוכן (content_policy_violation). המודל לא מצליח לייצר תמונה תואמת לבקשה. אפשר לנסח את הבקשה מחדש או לנסות מודל אחר.`;
                yield JSON.stringify({ type: 'step', icon: STEP_ICONS.error, message: breakerMessage }) + '\n';
                yield JSON.stringify({ type: 'token', content: breakerMessage }) + '\n';
                await this.agentSessionService.saveMessage(userId, session.id, 'assistant', breakerMessage);
                return;
              }

              // First violation — inject guidance so the LLM modifies the prompt
              this.logger.warn(`[ContentPolicyRetry] userId=${userId} sessionId=${session.id} toolName=${toolName} attempt=${cpCount} — injecting guidance for prompt modification.`);
              storedResult = JSON.stringify({
                error: 'content_policy_violation',
                message: 'יצירת התמונה נכשלה בגלל מגבלת תוכן. הprompt הנוכחי מפר את מדיניות התוכן של מודל יצירת התמונות.',
                instruction: 'content policy violation detected. You MUST do BOTH before retrying: (1) Re-read the user\'s original request and identify what might be problematic. (2) Review the EXACT prompt YOU constructed and sent to the image model — your own wording, additions, or stylistic choices may have triggered the violation even if the user\'s request was benign. (3) Generate a NEW, rewritten prompt that removes the problematic elements while preserving the user\'s core intent. (4) Call the same tool again with the modified prompt. If you cannot identify what to change, explain to the user in Hebrew what went wrong and suggest an alternative.',
              });
              yield JSON.stringify({
                type: 'step',
                icon: STEP_ICONS.error,
                message: 'יצירת התמונה נכשלה בגלל מגבלת תוכן. הסוכן מנסה לנסח פרומפט חלופי...',
              }) + '\n';
            }

            await this.agentSessionService.saveMessage(userId, session.id, 'tool', this.truncateForStorage(storedResult), {
              toolCallId: call.id,
              renderSpec: renderSpec ? JSON.stringify(renderSpec) : null,
            });
            history.push({ role: 'tool', tool_call_id: call.id, content: this.truncateForStorage(storedResult) });
          }
        }
      } else {
        if (llmResponse.content && llmResponse.content.length > 0) {
          const runtimeSelection = this.llmService.getRuntimeSelection(provider, model);
          const componentCount = (llmResponse.content.match(/```component[\s\S]*?```/gi) ?? []).length;
          this.logger.log(
            `[AdminAgentStream] userId=${userId} sessionId=${session.id} provider=${runtimeSelection.provider} model=${runtimeSelection.model} tokens=${llmResponse.content.length} components=${componentCount} (from generateResponse)`,
          );
          await this.agentSessionService.saveMessage(userId, session.id, 'assistant', llmResponse.content, {
            renderSpec: collectedRenderBlocks.length > 0 ? JSON.stringify(collectedRenderBlocks) : null,
          });
          yield JSON.stringify({ type: 'token', content: llmResponse.content }) + '\n';
          return;
        }

        let accumulatedResponse = '';
        let firstTokenAt: number | null = null;
        const streamStart = Date.now();

        try {
          const stream = this.llmService.generateStream({
            prompt,
            systemContext: dynamicSystemContext,
            messageHistory: trimHistoryForLlm(history),
            tools,
            providerOverride: provider,
            modelOverride: model,
            userId,
            image,
            maxTokens: 4096,
          });

          for await (const chunk of stream) {
            if (firstTokenAt === null) {
              firstTokenAt = Date.now();
            }
            accumulatedResponse += chunk;
            yield JSON.stringify({ type: 'token', content: chunk }) + '\n';
          }
        } catch (error) {
          this.logger.error('Failed to stream response from LLM Service', error);
          throw error;
        }

        const streamEnd = Date.now();
        const componentCount = (accumulatedResponse.match(/```component[\s\S]*?```/gi) ?? []).length;
        const runtimeSelection = this.llmService.getRuntimeSelection(provider, model);

        this.logger.log(
          `[AdminAgentStream] userId=${userId} sessionId=${session.id} provider=${runtimeSelection.provider} model=${runtimeSelection.model} firstTokenMs=${firstTokenAt !== null ? firstTokenAt - streamStart : 'N/A'} totalMs=${streamEnd - streamStart} tokens=${accumulatedResponse.length} components=${componentCount}`,
        );

        if (accumulatedResponse.length > 0) {
          await this.agentSessionService.saveMessage(userId, session.id, 'assistant', accumulatedResponse, {
            renderSpec: collectedRenderBlocks.length > 0 ? JSON.stringify(collectedRenderBlocks) : null,
          });
        }
        return;
      }
    }

    yield JSON.stringify({
      type: 'token',
      content: 'תקשורת הסוכן הופסקה עקב הגעה למספר האיטרציות המרבי.',
    }) + '\n';
  }

  private getDynamicSystemContext(userId: number, provider?: LlmProvider, model?: string): string {
    const runtimeSelection = this.llmService.getRuntimeSelection(provider, model);

    return buildSystemContext()
      .replace(/{{CURRENT_USER_ID}}/g, String(userId))
      .replace(/{{CURRENT_TIME}}/g, new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' }))
      .replace(/{{CURRENT_LLM_PROVIDER}}/g, runtimeSelection.provider)
      .replace(/{{CURRENT_LLM_MODEL}}/g, runtimeSelection.model);
  }

  private isParallelSafeTool(functionName: string): boolean {
    if (PARALLEL_UNSAFE_TOOL_NAMES.has(functionName)) {
      return false;
    }

    const endpoint = this.swaggerToolsParser.getEndpoint(functionName);

    return endpoint?.method.toUpperCase() === 'GET';
  }

  private groupToolCallsForExecution(toolCalls: LlmToolCall[]): LlmToolCall[][] {
    const groups: LlmToolCall[][] = [];
    let currentSafeGroup: LlmToolCall[] = [];

    for (const call of toolCalls) {
      if (this.isParallelSafeTool(call.function.name)) {
        currentSafeGroup.push(call);
        continue;
      }

      if (currentSafeGroup.length > 0) {
        groups.push(currentSafeGroup);
        currentSafeGroup = [];
      }

      groups.push([call]);
    }

    if (currentSafeGroup.length > 0) {
      groups.push(currentSafeGroup);
    }

    return groups;
  }

  private async executeToolCallGroup(calls: LlmToolCall[], userId: number, sessionId?: number): Promise<ToolCallResult[]> {
    if (calls.length === 1) {
      return [await this.executeToolCallSafely(calls[0], userId, sessionId)];
    }

    this.logger.log(`Executing ${calls.length} read-only tools in parallel.`);

    return Promise.all(calls.map((call) => {
      return this.executeToolCallSafely(call, userId, sessionId);
    }));
  }

  private async executeToolCallSafely(call: LlmToolCall, userId: number, sessionId?: number): Promise<ToolCallResult> {
    try {
      const resultData = await this.agentToolExecutorService.executeToolCall(call, userId, sessionId);

      return { call, resultData };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown tool execution error';

      this.logger.error(`Tool execution failed in ${call.function.name}: ${message}`);

      return {
        call,
        resultData: JSON.stringify({
          error: true,
          message: 'Tool execution failed',
          toolName: call.function.name,
          details: message,
        }),
      };
    }
  }

  private resetToolCallCounter(): void {
    this.toolCallCounter.clear();
    this.totalToolCalls = 0;
    this.contentPolicyRetries.clear();
  }

  private toolCallKey(call: LlmToolCall): string {
    // Normalize arguments so semantically equal JSON (different key order,
    // extra whitespace) collapses to the same key. If the args are malformed
    // JSON we keep the raw string so the breaker still trips on identical
    // garbage repeats rather than treating them as distinct.
    let normalizedArgs = call.function.arguments || '{}';
    try {
      const parsed = JSON.parse(normalizedArgs);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const sortedKeys = Object.keys(parsed).sort();
        const sorted: Record<string, unknown> = {};
        for (const key of sortedKeys) {
          sorted[key] = parsed[key];
        }
        normalizedArgs = JSON.stringify(sorted);
      } else {
        normalizedArgs = JSON.stringify(parsed);
      }
    } catch {
      // keep raw
    }
    return `${call.function.name}::${normalizedArgs}`;
  }

  private recordToolCall(call: LlmToolCall): number {
    const key = this.toolCallKey(call);
    const next = (this.toolCallCounter.get(key) ?? 0) + 1;
    this.toolCallCounter.set(key, next);
    this.totalToolCalls += 1;
    return next;
  }

  /** True when executing one more group would exceed the per-turn tool budget. */
  private overToolBudget(groupSize: number): boolean {
    return this.totalToolCalls + groupSize > MAX_TOTAL_TOOL_CALLS;
  }

  private budgetExceededMessage(): string {
    return `הסוכן הגיע לתקרת ${MAX_TOTAL_TOOL_CALLS} קריאות כלים בתור אחד ונעצר. חלק מהפעולות כבר בוצעו — אפשר לבקש להמשיך מהנקודה שבה נעצר.`;
  }

  private findDuplicateToolCall(calls: LlmToolCall[]): LlmToolCall | null {
    for (const call of calls) {
      const key = this.toolCallKey(call);
      const count = this.toolCallCounter.get(key) ?? 0;
      // MAX_DUPLICATE_TOOL_CALLS=2 means "allow 2 calls, trip on the 3rd".
      // A pending call with count >= 3 would be the 3rd (or later) execution.
      if (count > MAX_DUPLICATE_TOOL_CALLS) {
        return call;
      }
    }
    return null;
  }

  private breakerErrorMessage(toolName: string, args: Record<string, unknown>): string {
    const argsJson = Object.keys(args).length > 0 ? JSON.stringify(args) : '{}';
    return `הסוכן ניסה לקרוא שוב ושוב לכלי "${toolName}" עם אותם ארגומנטים (${argsJson}) ונעצר. כנראה שהמודל לא הצליח להפיק תשובה סופית. אפשר לנסות שוב עם מודל אחר או לנסח את הבקשה מחדש.`;
  }

  private isContentPolicyViolation(parsedResult: any): boolean {
    const details = parsedResult?.details;
    if (details && typeof details === 'object') {
      const code = details.error?.code || details.code;
      const type = details.error?.type || details.type;
      if (code === 'content_policy_violation' || type === 'invalid_request_error') {
        return true;
      }
    }
    const raw = JSON.stringify(parsedResult).toLowerCase();
    return raw.includes('content_policy_violation');
  }

  /**
   * Loop-breaker rescue for connection/setup tools (e.g. Google Calendar auth):
   * when the model keeps calling the same tool in one turn, inject the
   * already-obtained URL with an explicit instruction to present it to the
   * user, and give the model ONE final turn without tools. Returns the final
   * message content, or null when no rescue applies.
   */
  private async tryAuthUrlRescue(options: {
    toolName: string;
    history: any[];
    userId: number;
    sessionId?: number;
    systemContext: string;
    provider?: LlmProvider;
    model?: string;
  }): Promise<string | null> {
    const { toolName, history, userId, sessionId, systemContext, provider, model } = options;

    const setupInstruction = SETUP_INSTRUCTIONS[toolName];
    if (!setupInstruction?.authTool) {
      return null;
    }

    const authUrl = this.findAuthUrlInHistory(history, setupInstruction.authTool);
    if (!authUrl) {
      return null;
    }

    const contextMsg = `${setupInstruction.he}\n${authUrl}\n\nאל תקרא שוב לכלי. הצג את הקישור למשתמש בלבד והמתן עד שיסיים את האישור מול Google.`;
    await this.agentSessionService.saveMessage(userId, sessionId, 'tool', contextMsg);

    const finalResponse = await this.llmService.generateResponse({
      prompt: '',
      systemContext,
      messageHistory: trimHistoryForLlm([
        ...history,
        { role: 'user', content: contextMsg },
      ]),
      tools: [],
      providerOverride: provider,
      modelOverride: model,
      maxTokens: 1024,
    });

    return finalResponse.content ?? null;
  }

  /**
   * Scans conversation history for a successful auth URL from a previous tool call.
   * Used by the loop breaker to inject context before giving up.
   */
  private findAuthUrlInHistory(history: any[], authToolName: string): string | null {
    for (const msg of history) {
      if (msg.role === 'tool' && msg.content) {
        try {
          const parsed = JSON.parse(msg.content);
          if (parsed.url && typeof parsed.url === 'string' && parsed.url.startsWith('http')) {
            return parsed.url;
          }
        } catch {
          // not JSON, skip
        }
      }
    }
    return null;
  }

  private parseToolArguments(call: LlmToolCall): Record<string, unknown> {
    try {
      return JSON.parse(call.function.arguments || '{}') as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  private truncateForStorage(content: string, maxBytes = 50_000): string {
    const fullBuffer = Buffer.from(content, 'utf8');
    if (fullBuffer.byteLength <= maxBytes) {
      return content;
    }

    const originalLength = content.length;
    const marker = JSON.stringify({
      _truncated: true,
      _originalLength: originalLength,
      _note: 'Tool result was truncated before persistence to stay within message-size limits. Re-call the tool with a narrower filter if the full payload is required.',
    });

    const previewBudget = maxBytes - Buffer.byteLength(marker, 'utf8');

    // Backtrack from the cut point to find a valid UTF-8 character boundary.
    // Continuation bytes are 10xxxxxx (0x80–0xBF); we must not end the slice
    // in the middle of a multi-byte sequence.
    let boundary = previewBudget;
    while (boundary > 0 && (fullBuffer[boundary] & 0xC0) === 0x80) {
      boundary--;
    }

    const preview = fullBuffer.subarray(0, boundary).toString('utf8');

    return `${preview}${marker}`;
  }
}
