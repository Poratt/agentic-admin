import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import ffmpegStatic from 'ffmpeg-static';
import OpenAI from 'openai';
import { LlmRequest, LlmResponse, LlmToolCall, LlmToolSchema } from '../types/llm.types';
import { LlmProviderConfigService } from './llm-provider-config.service';
import { LlmProviderService } from '../../llm-provider/llm-provider.service';
import { computeToolCallReliability } from '../utils/llm-tool-reliability';
import { assertSafeUrl, SsrfError } from '../../../core/utils/ssrf-guard.util';
import { LlmProviderEntity } from '../../llm-provider/entities/llm-provider.entity';

const execFileAsync = promisify(execFile);

const MAX_RETRIES = 4;
const BASE_DELAY_MS = 1500;

/** Longest error message stored per call — provider errors can carry a whole response body. */
const MAX_STORED_ERROR_LENGTH = 500;

/** Maps a thrown error to a call status, using the same detection as the health-check service. */
function callStatusFromError(error: unknown): 'error' | 'timeout' {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return message.includes('timeout') || message.includes('aborted') ? 'timeout' : 'error';
}

@Injectable()
export class LlmClientService {
  private readonly logger = new Logger(LlmClientService.name);

  constructor(
    private readonly providerConfig: LlmProviderConfigService,
    private readonly dbProviderService: LlmProviderService,
  ) {}

  async generateResponse(llmRequest: LlmRequest): Promise<LlmResponse> {
    const { prompt, systemContext, messageHistory, providerOverride, modelOverride, tools, image, maxTokens, userId, caller, isTest } =
      llmRequest;

    // Resolve effective provider/model: explicit override → user default → legacy env
    const legacyProvider = this.providerConfig.getActiveProvider();
    const legacyModel = this.providerConfig.getActiveModel();
    const resolved = await this.dbProviderService.resolveEffectiveModel(providerOverride, modelOverride, userId, legacyProvider, legacyModel);

    const { client, dbProvider } = await this.getClient(resolved.provider);
    const activeProvider = resolved.provider;
    const activeModel = resolved.model;

    if (!activeModel) {
      throw new Error('Missing active model configuration');
    }

    await this.assertCapability(activeProvider, activeModel, 'text');

    this.logger.log(`Generating response via ${activeProvider} (model: ${activeModel})`);

    // Streaming is required even though callers consume a single full response:
    // reasoning models (e.g. omniroute `auto/best-free` → hy3-free) emit large
    // reasoning token streams. With a non-streaming request the OpenAI SDK waits
    // for the entire body before resolving, which routinely exceeds the 60s
    // client timeout. Streaming surfaces the final content incrementally and
    // resolves promptly (the same mechanism used by generateStream).
    const start = Date.now();
    let completion: LlmResponse;
    try {
      completion = await this.withRetry(async () => {
        const stream = await client.chat.completions.create({
          model: activeModel,
          stream: true,
          messages: [
            { role: 'system', content: systemContext || 'You are a helpful assistant.' },
            ...(messageHistory?.length ? messageHistory : []),
            ...(prompt ? [{ role: 'user' as const, content: this.buildUserMessage(prompt, image) }] : []),
          ],
          tools: tools && tools.length > 0 ? (tools as OpenAI.Chat.Completions.ChatCompletionTool[]) : undefined,
          temperature: 0.2,
          max_tokens: maxTokens ?? 1024,
          ...(activeProvider === 'openrouter' && { reasoning: { enabled: false } }),
        } as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming);

        let content: string | null = null;
        const toolCalls: LlmToolCall[] = [];
        let finishReason: string | null = null;

        for await (const chunk of stream) {
          const choice = chunk.choices?.[0];
          if (!choice) {
            continue;
          }
          const delta = choice.delta;
          if (delta?.content) {
            content = (content ?? '') + delta.content;
          }
          if (delta?.tool_calls?.length) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              toolCalls[idx] = toolCalls[idx] ?? { id: '', type: 'function', function: { name: '', arguments: '' } };
              if (tc.id) toolCalls[idx].id = tc.id;
              if (tc.function?.name) toolCalls[idx].function.name += tc.function.name;
              if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
            }
          }
          if (choice.finish_reason) {
            finishReason = choice.finish_reason;
          }
        }

        if (content === null && toolCalls.length === 0) {
          throw new Error('Returned no content or tool calls from AI model');
        }

        return { content, toolCalls, finishReason };
      }, 'generateResponse');
    } catch (error) {
      this.autoMarkIfModelMissing(dbProvider.id, activeModel, error);
      this.recordCallStat(dbProvider.key, activeModel, Date.now() - start, callStatusFromError(error), caller, error, null, Boolean(isTest));
      throw error;
    }
    this.logger.log(`LLM response took ${((Date.now() - start) / 1000).toFixed(1)}s`);

    this.recordCallStat(
      dbProvider.key,
      activeModel,
      Date.now() - start,
      'success',
      caller,
      null,
      computeToolCallReliability(tools, completion.toolCalls),
      Boolean(isTest),
    );

    const { content, toolCalls, finishReason } = completion;

    this.logger.log(`Response OK: content=${content?.length ?? 0} chars: ${content?.slice(0, 200)}... toolCalls=${toolCalls.length}`);
    this.logger.log(
      `[RESPONSE] provider=${dbProvider.key} (${dbProvider.label}) model=${activeModel} tokens=${content?.length ?? 0} finish_reason=${finishReason}`,
    );
    return {
      content,
      toolCalls,
      finishReason,
      // Non-streaming callers used rawCompletion for debug logging only; the
      // streaming path exposes content/finishReason directly, so we surface a
      // minimal object that keeps the existing debug logs safe.
      rawCompletion: { choices: [{ finish_reason: finishReason, message: { content, tool_calls: toolCalls } }] },
    };
  }

  async *generateStream(llmRequest: LlmRequest): AsyncIterable<string> {
    const { prompt, systemContext, messageHistory, providerOverride, modelOverride, tools, image, maxTokens, userId } = llmRequest;

    // Resolve effective provider/model: explicit override → user default → legacy env
    const legacyProvider = this.providerConfig.getActiveProvider();
    const legacyModel = this.providerConfig.getActiveModel();
    const resolved = await this.dbProviderService.resolveEffectiveModel(providerOverride, modelOverride, userId, legacyProvider, legacyModel);

    const { client, dbProvider } = await this.getClient(resolved.provider);
    const activeProvider = resolved.provider;
    const activeModel = resolved.model;

    if (!activeModel) {
      throw new Error('Missing active model configuration');
    }

    await this.assertCapability(activeProvider, activeModel, 'text');

    this.logger.log(`Streaming response via ${activeProvider} (model: ${activeModel})`);

    const start = Date.now();
    try {
      const stream = await this.withRetry(() => {
        return client.chat.completions.create({
          model: activeModel,
          stream: true,
          messages: [
            { role: 'system', content: systemContext || 'You are a helpful assistant.' },
            ...(messageHistory?.length ? messageHistory : []),
            { role: 'user', content: this.buildUserMessage(prompt, image) },
          ],
          tools: tools && tools.length > 0 ? (tools as OpenAI.Chat.Completions.ChatCompletionTool[]) : undefined,
          temperature: 0.7,
          max_tokens: maxTokens ?? 1024,
          ...(activeProvider === 'openrouter' && { reasoning: { enabled: false } }),
        } as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming);
      }, 'generateStream');

      for await (const chunk of stream) {
        const token = chunk.choices[0]?.delta?.content;
        if (token) {
          yield token;
        }
      }
      this.logger.log(`LLM stream completed in ${((Date.now() - start) / 1000).toFixed(1)}s`);
    } catch (error: unknown) {
      this.logger.error(`Stream Error (after retries): ${this.getErrorMessage(error)}`);
      throw error;
    }

    this.logger.log(`[STREAM RESPONSE] provider=${dbProvider.key} (${dbProvider.label}) model=${activeModel}`);
  }

  private async assertCapability(provider: string, model: string, expected: 'text' | 'image' | 'video'): Promise<void> {
    const dbModel = await this.dbProviderService.findModelByKey(model);
    if (!dbModel) {
      return;
    }

    if (dbModel.capability !== expected) {
      const label = expected === 'text' ? 'text chat' : expected === 'image' ? 'image generation' : 'video generation';
      throw new BadRequestException(`Model ${model} (${dbModel.capability}) does not support ${label}`);
    }
  }

  /**
   * Records a real call in `llm_call_stats` so the statistics view can rank models by actual work
   * instead of by a one-line connectivity ping.
   *
   * Fire-and-forget on purpose: a statistics row must never slow an LLM call down or fail it, so
   * the insert is not awaited and a write error is only logged. Health-check pings are skipped —
   * they are already stored in `llm_model_test_results`, and recording them here too would double
   * their weight in the ranking.
   *
   * `latencyMs` spans the whole call including the internal retries, which is the number a user
   * actually waits for.
   */
  /**
   * Appends one call-stat row, fire-and-forget (single insert, no lookups). Connectivity pings
   * used to be dropped here (`caller === 'health'`), hiding test traffic from the statistics
   * view; they are now recorded with `isTest: true` so the Statistics tab serves both halves
   * ("Ping" and "Real") from this one table via the `is_test` flag.
   */
  recordCallStat(
    providerKey: string,
    modelKey: string,
    latencyMs: number,
    status: 'success' | 'error' | 'timeout',
    caller: string | undefined,
    error: unknown,
    toolCallReliability: number | null,
    isTest: boolean,
  ): void {
    const resolvedCaller = caller ?? 'app';

    const errorMessage = error instanceof Error ? error.message.slice(0, MAX_STORED_ERROR_LENGTH) : null;

    void this.dbProviderService
      .saveCallStat({ providerKey, modelKey, latencyMs, status, caller: resolvedCaller, errorMessage, toolCallReliability, isTest })
      .catch((writeError: unknown) => {
        this.logger.debug(`Failed to record LLM call stat: ${writeError instanceof Error ? writeError.message : 'unknown'}`);
      });
  }

  private buildUserMessage(prompt: string, image?: string): OpenAI.Chat.Completions.ChatCompletionContentPart[] | string {
    if (!image) {
      return prompt;
    }

    return [
      { type: 'text', text: prompt || '' },
      {
        type: 'image_url',
        image_url: {
          url: image,
        },
      },
    ];
  }

  private async getClient(providerOverride?: string): Promise<{ client: OpenAI; dbProvider: LlmProviderEntity }> {
    const providerKey = providerOverride || this.providerConfig.getActiveProvider();

    const dbProvider = await this.dbProviderService.findProviderByKey(providerKey);

    if (!dbProvider) {
      throw new Error(`LLM Provider with key '${providerKey}' was not found in the database.`);
    }

    // TOCTOU defense: validate baseUrl at call time (DNS may have changed since record creation)
    try {
      await assertSafeUrl(dbProvider.baseUrl, { allowDevLocalhost: true });
    } catch (e) {
      if (e instanceof SsrfError) {
        this.logger.warn(`SSRF blocked for provider ${dbProvider.key}: ${e.message}`);
        throw new BadRequestException(`Provider URL blocked: ${e.message}`);
      }
      throw e;
    }

    this.logger.log(`Initializing OpenAI client for ${dbProvider.label} (${dbProvider.key}) using DB credentials.`);

    const apiKey = dbProvider.apiKey?.trim();
    const isLocalBaseUrl = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|$)/i.test(dbProvider.baseUrl);
    if (!apiKey && !isLocalBaseUrl) {
      throw new Error(`LLM Provider '${dbProvider.key}' has no API key configured and is not a local provider.`);
    }

    return {
      client: new OpenAI({
        baseURL: dbProvider.baseUrl,
        apiKey: apiKey || 'local-no-key',
        timeout: 180_000,
        defaultHeaders: this.providerConfig.getDefaultHeaders(dbProvider.key as any),
      }),
      dbProvider,
    };
  }

  private async withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt = attempt + 1) {
      try {
        return await fn();
      } catch (error: unknown) {
        lastError = error;
        const errorLike = error as { status?: number; message?: string };
        // Daily-quota 429s are deterministic — retrying just burns time.
        const isDailyQuota = errorLike.message?.includes('free-models-per-day') ?? false;
        const isRetryable =
          !isDailyQuota &&
          (errorLike.status === 503 ||
            errorLike.status === 502 ||
            errorLike.status === 500 ||
            errorLike.status === 429 ||
            errorLike.message?.includes('no choices') ||
            errorLike.message?.includes('overloaded'));

        if (!isRetryable || attempt === MAX_RETRIES) {
          break;
        }

        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        this.logger.warn(`[${label}] attempt ${attempt}/${MAX_RETRIES} failed - retrying in ${delay}ms. Error: ${this.getErrorMessage(error)}`);
        await new Promise((resolve) => {
          setTimeout(resolve, delay);
        });
      }
    }

    throw lastError;
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return 'Unknown error';
  }

  /**
   * Resolves the DB provider connection (base URL + API key) for a provider key.
   * Used by the image/video raw-fetch paths that the OpenAI SDK does not cover.
   */
  private async getProviderConnection(providerOverride?: string): Promise<{ baseUrl: string; apiKey: string; dbProvider: LlmProviderEntity }> {
    const providerKey = providerOverride || this.providerConfig.getActiveProvider();
    const dbProvider = await this.dbProviderService.findProviderByKey(providerKey);

    if (!dbProvider) {
      throw new Error(`LLM Provider with key '${providerKey}' was not found in the database.`);
    }

    // TOCTOU defense: validate baseUrl at call time
    try {
      await assertSafeUrl(dbProvider.baseUrl, { allowDevLocalhost: true });
    } catch (e) {
      if (e instanceof SsrfError) {
        this.logger.warn(`SSRF blocked for provider ${dbProvider.key}: ${e.message}`);
        throw new BadRequestException(`Provider URL blocked: ${e.message}`);
      }
      throw e;
    }

    return {
      baseUrl: dbProvider.baseUrl.replace(/\/$/, ''),
      apiKey: dbProvider.apiKey ? dbProvider.apiKey.trim() : '',
      dbProvider,
    };
  }

  /**
   * Generates an image via the Agnes `/v1/images/generations` endpoint.
   *
   * The OpenAI SDK shape is compatible in theory, but Agnes requires
   * `response_format` and image-input (`extra_body.image`) to live inside
   * `extra_body` — a non-standard quirk that makes `client.images.generate`
   * unreliable. We use a raw fetch against the provider base URL instead.
   */
  async generateImage(request: {
    provider: string;
    model: string;
    prompt: string;
    size?: string;
    ratio?: string;
    image?: string | string[];
    returnBase64?: boolean;
  }): Promise<{ url?: string; b64Json?: string; mimeType?: string; size?: string }> {
    const { provider, model, prompt, size, ratio, image, returnBase64 } = request;

    await this.assertCapability(provider, model, 'image');

    const { baseUrl, apiKey } = await this.getProviderConnection(provider);

    const images = Array.isArray(image) ? image : image ? [image] : [];

    // `size` is required by the Agnes image API. Default to a safe 1:1 size.
    const resolvedSize = size || '1024x1024';

    const extraBody: Record<string, unknown> = {};
    // Response format (url | b64_json) lives inside extra_body per Agnes docs.
    extraBody.response_format = returnBase64 ? 'b64_json' : 'url';
    if (images.length > 0) {
      extraBody.image = images;
    }
    if (ratio) {
      extraBody.ratio = ratio;
    }

    // `return_base64` is a top-level flag for text-to-image per the 2.1 docs.
    const body: Record<string, unknown> = {
      model,
      prompt,
      size: resolvedSize,
      n: 1,
      ...(returnBase64 ? { return_base64: true } : {}),
      extra_body: extraBody,
    };

    const result = await this.withRetry(async () => {
      const res = await fetch(`${baseUrl}/images/generations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(360_000),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Agnes image generation failed (${res.status}): ${text.slice(0, 500)}`);
      }

      return (await res.json()) as {
        data?: Array<{ url?: string; b64_json?: string }>;
        mime_type?: string;
        size?: string;
      };
    }, 'generateImage');

    const first = result.data?.[0];
    if (!first) {
      throw new Error('Agnes image generation returned no data');
    }

    return {
      url: first.url ?? undefined,
      b64Json: first.b64_json ?? undefined,
      mimeType: result.mime_type,
      size: result.size ?? resolvedSize,
    };
  }

  /**
   * Creates an asynchronous video generation task via `POST /v1/videos`.
   * Returns the video id immediately; the caller polls `getVideoResult`.
   */
  async createVideoTask(request: {
    provider: string;
    model: string;
    prompt: string;
    image?: string;
    mode?: 'ti2vid' | 'keyframes';
    height?: number;
    width?: number;
    numFrames?: number;
    frameRate?: number;
    numInferenceSteps?: number;
    seed?: number;
    negativePrompt?: string;
  }): Promise<{
    taskId?: string;
    videoId: string;
    status: 'queued' | 'in_progress' | 'completed' | 'failed';
    seconds?: number | string;
    size?: string;
  }> {
    const { provider, model, prompt, image, mode, height, width, numFrames, frameRate, numInferenceSteps, seed, negativePrompt } = request;

    await this.assertCapability(provider, model, 'video');

    const { baseUrl, apiKey } = await this.getProviderConnection(provider);

    const extraBody: Record<string, unknown> = {};
    if (mode) {
      extraBody.mode = mode;
    }

    const body: Record<string, unknown> = {
      model,
      prompt,
      ...(image ? { image } : {}),
      ...(height ? { height } : {}),
      ...(width ? { width } : {}),
      ...(numFrames ? { num_frames: numFrames } : {}),
      ...(frameRate ? { frame_rate: frameRate } : {}),
      ...(typeof numInferenceSteps === 'number' ? { num_inference_steps: numInferenceSteps } : {}),
      ...(typeof seed === 'number' ? { seed } : {}),
      ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
      ...(Object.keys(extraBody).length > 0 ? { extra_body: extraBody } : {}),
    };

    // Transient retry — Agnes occasionally returns HTTP 503 with body
    // `{"code":"video_queue_full",...}` when its queue is busy, generic
    // network/timeout failures, and HTTP 429 rate limits. Bounded:
    // 5xx / queue_full use fixed 1s + 2s backoff (max ~3s); 429 honors the
    // `Retry-After` response header once, capped at 30s — never stalls the
    // studio UI longer than 30s. Other 4xx are terminal (client problem a
    // retry cannot fix).
    const MAX_ATTEMPTS = 3;
    const BACKOFFS_MS = [1000, 2000];
    const MAX_RATE_LIMIT_WAIT_MS = 30_000;
    let rateLimitBudget = 1;
    const isTransportError = (err: unknown): boolean => err instanceof TypeError || (err instanceof Error && err.name === 'AbortError');

    let res!: Response;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        res = await fetch(`${baseUrl}/videos`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(120_000),
        });
      } catch (err) {
        if (!isTransportError(err) || attempt === MAX_ATTEMPTS) {
          throw err;
        }
        const delay = BACKOFFS_MS[attempt - 1] ?? 1000;
        this.logger.warn(
          `[createVideoTask] attempt ${attempt}/${MAX_ATTEMPTS} failed (transport: ${(err as Error).message ?? 'unknown'}) — retrying in ${delay}ms`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      if (res.ok) {
        break;
      }

      const text = await res.text();
      const status = res.status;

      // 429 rate limit — single retry honoring Retry-After (capped at 30s;
      // no Retry-After / oversized wait / exhausted budget = terminal).
      if (status === 429) {
        const retryAfterHeader = res.headers?.get?.('retry-after');
        const retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : Number.NaN;
        const validWaitMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0 ? retryAfterSec * 1000 : 0;

        if (validWaitMs > 0 && validWaitMs <= MAX_RATE_LIMIT_WAIT_MS && rateLimitBudget > 0 && attempt < MAX_ATTEMPTS) {
          rateLimitBudget -= 1;
          this.logger.warn(
            `[createVideoTask] attempt ${attempt}/${MAX_ATTEMPTS} failed (HTTP 429 rate limit) — retrying after ${validWaitMs}ms (Retry-After: ${retryAfterSec}s)`,
          );
          await new Promise((resolve) => setTimeout(resolve, validWaitMs));
          continue;
        }
        throw new Error(`Agnes video creation failed (${status}): ${text.slice(0, 500)}`);
      }

      // 5xx / queue_full — bounded retry with fixed 1s + 2s backoff.
      const isTransient = status >= 500 || text.includes('video_queue_full');

      if (!isTransient || attempt === MAX_ATTEMPTS) {
        throw new Error(`Agnes video creation failed (${status}): ${text.slice(0, 500)}`);
      }

      const delay = BACKOFFS_MS[attempt - 1] ?? 1000;
      this.logger.warn(`[createVideoTask] attempt ${attempt}/${MAX_ATTEMPTS} failed (HTTP ${status}) — retrying in ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    const json = (await res.json()) as {
      task_id?: string;
      video_id?: string;
      id?: string;
      status?: string;
      seconds?: number;
      size?: string;
    };

    const videoId = json.video_id ?? json.id ?? json.task_id ?? '';
    if (!videoId) {
      throw new Error('Agnes video creation returned no video id');
    }

    return {
      taskId: json.task_id,
      videoId,
      status: (json.status as any) ?? 'queued',
      seconds: json.seconds,
      size: json.size,
    };
  }

  /**
   * Creates a video task and polls until it completes (or fails), so callers
   * receive a ready-to-use `.mp4` URL instead of an async job id. This avoids
   * the agent hallucinating a link when it skips the manual poll step.
   */
  async createVideoTaskAndWait(
    request: Parameters<LlmClientService['createVideoTask']>[0],
    options: { timeoutMs?: number; pollIntervalMs?: number } = {},
  ): Promise<{
    taskId?: string;
    videoId: string;
    status: 'queued' | 'in_progress' | 'completed' | 'failed';
    url?: string;
    seconds?: number | string;
    size?: string;
  }> {
    const { timeoutMs = 150_000, pollIntervalMs = 5_000 } = options;
    const created = await this.createVideoTask(request);

    const deadline = Date.now() + timeoutMs;
    let latest = created;

    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      const status = await this.getVideoResult(created.videoId, request.provider);
      latest = { ...created, ...status };
      if (status.status === 'completed' || status.status === 'failed') {
        break;
      }
    }

    return latest;
  }

  /**
   * Continues a generated video from its last frame:
   * resolves the source video URL (from videoId or a direct URL), downloads it,
   * extracts the final frame as a PNG, and submits a new image-to-video task
   * using that frame. Returns the completed continuation video.
   */
  async extendVideo(params: {
    provider: string;
    model: string;
    sourceVideoId?: string;
    sourceVideoUrl?: string;
    prompt: string;
    mode?: 'ti2vid' | 'keyframes';
    height?: number;
    width?: number;
    numFrames?: number;
    frameRate?: number;
    numInferenceSteps?: number;
    seed?: number;
    negativePrompt?: string;
    timeoutMs?: number;
  }): Promise<{
    taskId?: string;
    videoId: string;
    status: 'queued' | 'in_progress' | 'completed' | 'failed';
    url?: string;
    seconds?: number | string;
    size?: string;
    sourceFrame?: string;
  }> {
    const { provider, sourceVideoId, sourceVideoUrl, timeoutMs } = params;

    let sourceUrl = sourceVideoUrl;
    if (!sourceUrl && sourceVideoId) {
      const status = await this.getVideoResult(sourceVideoId, provider);
      sourceUrl = status.url;
    }
    if (!sourceUrl) {
      throw new BadRequestException('extendVideo requires a source videoId or videoUrl');
    }

    const videoBuf = await this.downloadBuffer(sourceUrl);
    const videoPath = join(tmpdir(), `agnes-src-${Date.now()}.mp4`);
    const framePath = join(tmpdir(), `agnes-frame-${Date.now()}.png`);
    try {
      await fs.writeFile(videoPath, videoBuf);
      await execFileAsync(ffmpegStatic as string, ['-y', '-sseof', '-1', '-i', videoPath, '-vsync', 'vfr', '-frames:v', '1', framePath]);
      const frameBuf = await fs.readFile(framePath);
      const frameDataUri = `data:image/png;base64,${frameBuf.toString('base64')}`;

      const result = await this.createVideoTaskAndWait(
        {
          provider,
          model: params.model,
          prompt: params.prompt,
          image: frameDataUri,
          mode: params.mode,
          height: params.height,
          width: params.width,
          numFrames: params.numFrames,
          frameRate: params.frameRate,
          numInferenceSteps: params.numInferenceSteps,
          seed: params.seed,
          negativePrompt: params.negativePrompt,
        },
        { timeoutMs },
      );

      return { ...result, sourceFrame: frameDataUri };
    } finally {
      await fs.rm(videoPath, { force: true }).catch(() => undefined);
      await fs.rm(framePath, { force: true }).catch(() => undefined);
    }
  }

  /**
   * Downloads a source video into memory with SSRF + size protection:
   * - `assertSafeUrl` before every hop (covers the initial URL and each redirect)
   * - `redirect: 'manual'` — no silent follow to a blocked internal host
   * - hard cap on total bytes (streamed, not buffered blindly) to prevent OOM
   */
  private async downloadBuffer(url: string): Promise<Buffer> {
    const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024; // 100MB
    const MAX_REDIRECTS = 5;
    const timeoutMs = 120_000;

    let currentUrl = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await this.assertSafeDownloadUrl(currentUrl);

      const res = await fetch(currentUrl, {
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });

      // Redirect — re-validate the next hop before following
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        res.body?.cancel().catch(() => undefined);
        if (!location) {
          throw new BadRequestException(`Redirect without Location header (${res.status})`);
        }
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      if (!res.ok) {
        throw new BadRequestException(`Failed to download source video (${res.status})`);
      }

      const contentLength = Number(res.headers.get('content-length') || 0);
      if (contentLength > MAX_DOWNLOAD_BYTES) {
        throw new BadRequestException(`Source video exceeds the ${MAX_DOWNLOAD_BYTES / (1024 * 1024)}MB limit`);
      }
      if (!res.body) {
        throw new BadRequestException('Failed to download source video: empty response body');
      }

      const reader = res.body.getReader();
      const chunks: Buffer[] = [];
      let total = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.length;
          if (total > MAX_DOWNLOAD_BYTES) {
            await reader.cancel().catch(() => undefined);
            throw new BadRequestException(`Source video exceeds the ${MAX_DOWNLOAD_BYTES / (1024 * 1024)}MB limit`);
          }
          chunks.push(Buffer.from(value));
        }
      } finally {
        reader.releaseLock();
      }
      return Buffer.concat(chunks);
    }

    throw new BadRequestException('Too many redirects while downloading source video');
  }

  private async assertSafeDownloadUrl(url: string): Promise<void> {
    try {
      await assertSafeUrl(url);
    } catch (e) {
      if (e instanceof SsrfError) {
        throw new BadRequestException(e.message);
      }
      throw e;
    }
  }

  /**
   * Polls the video generation status via `GET /agnesapi?video_id=<id>`.
   */
  async getVideoResult(
    videoId: string,
    provider: string,
  ): Promise<{
    status: 'queued' | 'in_progress' | 'completed' | 'failed';
    url?: string;
    error?: string | Record<string, unknown> | null;
    seconds?: number | string;
  }> {
    const { baseUrl, apiKey } = await this.getProviderConnection(provider);

    const result = await this.withRetry(async () => {
      const res = await fetch(`${baseUrl}/agnesapi?video_id=${encodeURIComponent(videoId)}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(60_000),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Agnes video poll failed (${res.status}): ${text.slice(0, 500)}`);
      }

      const json = (await res.json()) as {
        status?: string;
        video_url?: string;
        url?: string;
        error?: string;
        seconds?: number;
      };

      const status = (json.status ?? 'in_progress') as 'queued' | 'in_progress' | 'completed' | 'failed';

      if (status === 'failed') {
        throw new Error(json.error ?? 'Agnes video generation failed');
      }

      return {
        status,
        url: json.video_url ?? json.url,
        seconds: json.seconds,
      };
    }, 'getVideoResult');

    return result;
  }

  /**
   * After a failed completion, auto-deactivate the model when the provider
   * itself reported it missing (404 + model_not_found/invalid_model, or the
   * model key echoed in the message). A generic 404 (wrong baseUrl) does NOT
   * reference the model and must not trigger this. Fire-and-forget: the
   * original completion error is rethrown by the caller regardless.
   */
  private autoMarkIfModelMissing(providerId: number, modelKey: string, error: unknown): void {
    const errorLike = error as { status?: number; message?: string };
    const message = errorLike?.message ?? '';
    const status = errorLike?.status;
    const missingSignal = /model_not_found|invalid_model|model.*not[ _]found|does not exist/i.test(message) || message.includes(modelKey);
    if (status !== 404 || !missingSignal) return;

    this.logger.warn(`Model '${modelKey}' reported missing by provider ${providerId} — marking unavailable`);
    this.dbProviderService.markModelUnavailable(providerId, modelKey).catch((err: unknown) => {
      this.logger.warn(`Failed to mark model '${modelKey}' unavailable: ${this.getErrorMessage(err)}`);
    });
  }
}
