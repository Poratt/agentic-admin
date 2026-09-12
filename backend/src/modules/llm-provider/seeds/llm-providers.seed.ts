import { DataSource } from 'typeorm';
import { LlmModelEntity } from '../entities/llm-model.entity';
import { LlmProviderEntity } from '../entities/llm-provider.entity';

const OMNIRoute_MODELS = [{ value: 'auto/best-free', label: 'Default', capability: 'text' as const }];

const OPENROUTER_MODELS = [
  { value: 'nvidia/nemotron-3-ultra-550b-a55b:free', label: 'Nemotron 3 Ultra 550b A55B(NVIDIA)', capability: 'text' as const },
  { value: 'openai/gpt-oss-120b:free', label: 'GPT OSS 120B (OpenAI)', capability: 'text' as const },
  { value: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', label: 'Nemotron 3 Nano Omni (NVIDIA)', capability: 'text' as const },
  { value: 'liquid/lfm-2.5-1.2b-instruct:free', label: 'LFM 2.5 1.2B Instruct (Liquid)', capability: 'text' as const },
  { value: 'google/gemma-4-31b-it:free', label: 'Gemma 4 31b IT', capability: 'text' as const },
  { value: 'poolside/laguna-xs.2:free', label: 'Lagauna XS.2(Poolside)', capability: 'text' as const },
  { value: 'poolside/laguna-m.1:free', label: 'Laguna M.1', capability: 'text' as const },
  { value: 'nvidia/nemotron-nano-9b-v2:free', label: 'NVIDIA Nano 9B V2', capability: 'text' as const },
  { value: 'google/gemma-4-26b-a4b-it:free', label: 'Gemma 4 26b A4B IT', capability: 'text' as const },
  { value: 'cohere/north-mini-code:free', label: 'North Mini Code (Cohere)', capability: 'text' as const },
  { value: 'nvidia/nemotron-nano-12b-v2-vl:free', label: 'Nemotron Nano 12B 2 VL (NVIDIA)', capability: 'text' as const },
  { value: 'nvidia/nemotron-3-nano-30b-a3b:free', label: 'NVIDIA 3 Nano 30B A3B ', capability: 'text' as const },
  { value: 'openai/gpt-oss-20b:free', label: 'GPT OSS 20B (OpenAI)', capability: 'text' as const },
  { value: 'nvidia/nemotron-3.5-content-safety:free', label: 'NVIDIA 3.5 Content Safety ', capability: 'text' as const },
  { value: 'nvidia/nemotron-3-super-120b-a12b:free', label: 'NVIDIA 3 Super 120b A12B', capability: 'text' as const },
  { value: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B Instruct (Meta)', capability: 'text' as const },
  { value: 'liquid/lfm-2.5-1.2b-thinking:free', label: 'LFM 2.5 1.2B Thinking (Liquid)', capability: 'text' as const },
  {
    value: 'cognitivecomputations/dolphin-mistral-24b-venice-edition:free',
    label: 'Uncensored Dolphin Mistral (Cognitive)',
    capability: 'text' as const,
  },
  { value: 'tencent/hy3:free', label: 'Tencent Hy3 (Free)', capability: 'text' as const },
  { value: 'nvidia/llama-nemotron-rerank-vl-1b-v2:free', label: 'Llama Nemotron Rerank VL 1B V2 (NVIDIA)', capability: 'text' as const },
  { value: 'nvidia/llama-nemotron-embed-vl-1b-v2:free', label: 'Llama Nemotron Embed VL 1B V2 (NVIDIA)', capability: 'text' as const },
  { value: 'qwen/qwen3-next-80b-a3b-instruct:free', label: 'Qwen3 Next 80B A3B Instruct (Qwen)', capability: 'text' as const },
  { value: 'qwen/qwen3-coder:free', label: 'Qwen3 Coder 480B A35B (Qwen)', capability: 'text' as const },
  { value: 'nousresearch/hermes-3-llama-3.1-405b:free', label: 'Hermes 3 405B Instruct (Nous)', capability: 'text' as const },
  { value: 'meta-llama/llama-3.2-3b-instruct:free', label: 'Llama 3.2 3B Instruct (Meta)', capability: 'text' as const },
  { value: 'nex-agi/nex-n2-pro:free', label: 'Nex AGI - nex n2 pro', capability: 'text' as const },
  { value: 'z-ai/glm-4.5-air:free', label: 'GLM 4.5 Air(Z.AI)', capability: 'text' as const },
];

const AGNES_AI_MODELS = [
  { value: 'agnes-2.0-flash', label: 'Agnes 2.0 Flash', capability: 'text' as const },
  { value: 'agnes-2.5-flash', label: 'Agnes 2.5 Flash', capability: 'text' as const },
  { value: 'agnes-video-v2.0', label: 'Agnes Video V2.0', capability: 'video' as const },
  { value: 'agnes-image-2.1-flash', label: 'Agnes Image 2.1 Flash', capability: 'image' as const },
  { value: 'agnes-image-2.0-flash', label: 'Agnes Image 2.0 Flash', capability: 'image' as const },
];

const REQUESTY_MODELS = [{ value: 'novita/tencent/hy3', label: 'Novita Tencent Hy3', capability: 'text' as const }];

const NVIDIA_MODELS = [
  { value: 'qwen/qwen3-next-80b-a3b-instruct', label: 'Qwen3 Next 80b A3B Instruct', capability: 'text' as const },
  { value: 'mistralai/mistral-medium-3.5-128b', label: 'Mistral Medium 3.5 128B', capability: 'text' as const },
  { value: 'stepfun-ai/step-3.7-flash', label: 'Step 3.7 Flash', capability: 'text' as const },
  { value: 'moonshotai/kimi-k2.6', label: 'Kimi K2.6', capability: 'text' as const },
  { value: 'deepseek-ai/deepseek-v4-flash', label: 'DeepSeek V4 Flash', capability: 'text' as const },
  { value: 'openai/gpt-oss-20b', label: 'GPT OSS 20B', capability: 'text' as const },
  { value: 'nvidia/nemotron-3-ultra-550b-a55b', label: 'NVIDIA 3 Ultra 550b A55B', capability: 'text' as const },
  { value: 'meta/llama-4-maverick-17b-128e-instruct', label: 'META Llama 4 Maverick 17B 128E Instruct', capability: 'text' as const },
  { value: 'deepseek-ai/deepseek-v4-pro', label: 'DeepSeek V4 Pro', capability: 'text' as const },
  { value: 'poolside/laguna-xs-2.1', label: 'Laguna XS 2.1 (Poolside)', capability: 'text' as const },
  { value: 'minimaxai/minimax-m3', label: 'MiniMax M3', capability: 'text' as const },
  { value: 'z-ai/glm-5.2', label: 'GLM 5.2 (Z.AI)', capability: 'text' as const },
];

export async function seedLlmProviders(dataSource: DataSource): Promise<void> {
  const providerRepo = dataSource.getRepository(LlmProviderEntity);
  const modelRepo = dataSource.getRepository(LlmModelEntity);

  try {
    // Bootstrap-only seeding: seed the built-in providers only when the table is
    // empty. Per-provider existence checks would resurrect providers the admin
    // permanently deleted via DELETE /llm-provider/:id on every backend restart.
    const existingCount = await providerRepo.count();
    if (existingCount > 0) {
      console.log(`[Seed] LLM providers table not empty (${existingCount} providers) — skipping bootstrap.`);
      return;
    }

    // OmniRoute
    let omniroute = await providerRepo.findOne({
      where: { key: 'OmniRoute' },
      relations: ['models'],
    });

    if (!omniroute) {
      omniroute = new LlmProviderEntity();
      omniroute.key = 'OmniRoute';
      omniroute.label = 'OmniRoute';
      omniroute.baseUrl = process.env.OMNIRoute_BASE_URL || 'http://localhost:20128/v1';
      omniroute.apiKey = process.env.OPENROUTER_API_KEY || '';
      omniroute.active = true;

      omniroute = await providerRepo.save(omniroute);

      for (const modelData of OMNIRoute_MODELS) {
        const model = new LlmModelEntity();
        model.key = modelData.value;
        model.label = modelData.label;
        model.capability = modelData.capability;
        model.sortOrder = 0;
        model.active = true;
        model.providerId = omniroute.id;
        await modelRepo.save(model);
      }

      console.log('[Seed] OmniRoute provider and models created.');
    } else {
      console.log('[Seed] OmniRoute provider already exists.');
    }

    // OpenRouter
    let openrouter = await providerRepo.findOne({
      where: { key: 'openrouter' },
      relations: ['models'],
    });

    if (!openrouter) {
      openrouter = new LlmProviderEntity();
      openrouter.key = 'openrouter';
      openrouter.label = 'OpenRouter';
      openrouter.baseUrl = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
      openrouter.apiKey = process.env.OPENROUTER_API_KEY || '';
      openrouter.active = true;

      openrouter = await providerRepo.save(openrouter);

      for (const modelData of OPENROUTER_MODELS) {
        const model = new LlmModelEntity();
        model.key = modelData.value;
        model.label = modelData.label;
        model.capability = modelData.capability;
        model.sortOrder = 0;
        model.active = true;
        model.providerId = openrouter.id;
        await modelRepo.save(model);
      }

      console.log('[Seed] OpenRouter provider and models created.');
    } else {
      console.log('[Seed] OpenRouter provider already exists.');
    }

    // Agnes AI
    let agnes = await providerRepo.findOne({
      where: { key: 'agnes-ai' },
      relations: ['models'],
    });

    if (!agnes) {
      agnes = new LlmProviderEntity();
      agnes.key = 'agnes-ai';
      agnes.label = 'Agnes AI';
      agnes.baseUrl = process.env.AGNES_BASE_URL || 'https://apihub.agnes-ai.com/v1';
      agnes.apiKey = process.env.AGNES_API_KEY || '';
      agnes.active = true;

      agnes = await providerRepo.save(agnes);

      for (const modelData of AGNES_AI_MODELS) {
        const model = new LlmModelEntity();
        model.key = modelData.value;
        model.label = modelData.label;
        model.capability = modelData.capability;
        model.sortOrder = 0;
        model.active = true;
        model.providerId = agnes.id;
        await modelRepo.save(model);
      }

      console.log('[Seed] Agnes AI provider and models created.');
    } else {
      console.log('[Seed] Agnes AI provider already exists.');
    }

    // Requesty AI
    let requesty = await providerRepo.findOne({
      where: { key: 'requesty' },
      relations: ['models'],
    });

    if (!requesty) {
      requesty = new LlmProviderEntity();
      requesty.key = 'requesty';
      requesty.label = 'Requesty AI';
      requesty.baseUrl = process.env.REQUESTY_BASE_URL || 'https://router.requesty.ai/v1';
      requesty.apiKey = process.env.REQUESTY_API_KEY || '';
      requesty.active = true;

      requesty = await providerRepo.save(requesty);

      for (const modelData of REQUESTY_MODELS) {
        const model = new LlmModelEntity();
        model.key = modelData.value;
        model.label = modelData.label;
        model.capability = modelData.capability;
        model.sortOrder = 0;
        model.active = true;
        model.providerId = requesty.id;
        await modelRepo.save(model);
      }

      console.log('[Seed] Requesty AI provider and models created.');
    } else {
      console.log('[Seed] Requesty AI provider already exists.');
    }

    // NVIDIA NIM
    let nvidia = await providerRepo.findOne({
      where: { key: 'nvidia' },
      relations: ['models'],
    });

    if (!nvidia) {
      nvidia = new LlmProviderEntity();
      nvidia.key = 'nvidia';
      nvidia.label = 'NVIDIA NIM';
      nvidia.baseUrl = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';
      nvidia.apiKey = process.env.NVIDIA_API_KEY || '';
      nvidia.active = true;

      nvidia = await providerRepo.save(nvidia);

      for (const modelData of NVIDIA_MODELS) {
        const model = new LlmModelEntity();
        model.key = modelData.value;
        model.label = modelData.label;
        model.capability = modelData.capability;
        model.sortOrder = 0;
        model.active = true;
        model.providerId = nvidia.id;
        await modelRepo.save(model);
      }

      console.log('[Seed] NVIDIA NIM provider and models created.');
    } else {
      console.log('[Seed] NVIDIA NIM provider already exists.');
    }
  } catch (error) {
    console.error('[Seed] Error seeding LLM providers:', error);
  }
}
