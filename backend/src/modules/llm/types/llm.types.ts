import type OpenAI from 'openai';

export type LlmProvider = 'openrouter' | 'nvidia' | 'ollama' | 'ollama-cloud' | 'agnes-ai' | 'huggingface' | 'omniroute';

export type LlmModelCapability = 'text' | 'image' | 'video';

export type LlmImageSizeTier = '1K' | '2K' | '3K' | '4K';

export interface LlmImageRequest {
  prompt: string;
  model?: string;
  size?: string;
  ratio?: string;
  image?: string | string[];
  returnBase64?: boolean;
  providerOverride?: string;
}

export interface LlmImageResult {
  url?: string;
  b64Json?: string;
  mimeType?: string;
  size?: string;
}

export interface LlmVideoRequest {
  prompt: string;
  model?: string;
  image?: string;
  mode?: 'ti2vid' | 'keyframes';
  height?: number;
  width?: number;
  numFrames?: number;
  frameRate?: number;
  numInferenceSteps?: number;
  seed?: number;
  negativePrompt?: string;
}

export interface LlmVideoTask {
  taskId?: string;
  videoId: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed';
  seconds?: number | string;
  size?: string;
}

export interface LlmVideoResult {
  status: 'queued' | 'in_progress' | 'completed' | 'failed';
  url?: string;
  error?: string | Record<string, unknown> | null;
  seconds?: number | string;
}

export type LlmToolSchema = {
  type: 'function';
  function?: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type LlmToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
};

export type LlmResponse = {
  content: string | null;
  toolCalls?: LlmToolCall[];
  finishReason?: string | null;
  rawCompletion?: unknown;
};

export type LlmMessage =
  | { role: 'user'; content: string | OpenAI.Chat.Completions.ChatCompletionContentPart[] }
  | { role: 'assistant'; content: string | null; tool_calls?: LlmToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface LlmRequest {
  prompt: string;
  systemContext?: string;
  tools?: LlmToolSchema[];
  messageHistory?: LlmMessage[];
  providerOverride?: LlmProvider;
  modelOverride?: string;
  /** Optional userId to resolve user-level default model */
  userId?: number;
  /** Optional Base64 data URL image attached to the user turn */
  image?: string;
  /** Override the default max_tokens limit (default: 1024) */
  maxTokens?: number;
  /**
   * Which surface is making the call, recorded in `llm_call_stats` so the statistics view can
   * separate real work from connectivity pings. Defaults to `'app'`; the health-check service
   * passes `'health'`. Kept for provenance — the new `isTest` flag is what the statistics query
   * actually filters on.
   */
  caller?: string;
  /**
   * True when this call is a connectivity ping (manual Test / Test All / nightly cron), recorded
   * as `is_test` on `llm_call_stats` so the statistics view can serve the "Ping" half of the
   * Statistics tab from the same table as real usage. Defaults to `false`.
   */
  isTest?: boolean;
}

export type LlmRuntimeSelection = {
  provider: LlmProvider;
  model: string;
};

export type LlmModelCheckTarget = {
  id?: number;
  provider: LlmProvider;
  name: string;
  active: boolean;
  sizeGb?: number;
  family?: string;
};

export type LlmModelTestResult = {
  name: string;
  provider: LlmProvider;
  available: boolean;
};

export type LlmProviderConfig = {
  id: LlmProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
};
