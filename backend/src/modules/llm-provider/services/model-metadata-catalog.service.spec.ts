import {
  matchCatalogEntry,
  metadataFromEntry,
  normalizeKey,
  freeVariantBareNames,
  ModelMetadataCatalogService,
  OpenRouterModelEntry,
} from './model-metadata-catalog.service';

/** Trimmed, realistic slice of the live OpenRouter catalog (structures verified 2026-09-18). */
const FIXTURE: OpenRouterModelEntry[] = [
  { id: 'deepseek/deepseek-v4-flash', context_length: 1048576, top_provider: { max_completion_tokens: 384000 }, pricing: { prompt: '0.00000004984', completion: '0.00000004984' } },
  { id: 'deepseek/deepseek-v4-flash:free', context_length: 1048576, top_provider: { max_completion_tokens: 384000 }, pricing: { prompt: '0', completion: '0' } },
  { id: 'deepseek/deepseek-v4-flash-0731', context_length: 1310720, top_provider: { max_completion_tokens: 943718 }, pricing: { prompt: '0.00000006', completion: '0.00000024' } },
  // "auto-latest" redirect row — its alias_target must NEVER surface as a match candidate.
  { id: '~deepseek/deepseek-flash-latest', alias_target: { slug: 'deepseek/deepseek-v4-flash-0731' }, context_length: 1048576, top_provider: { max_completion_tokens: 131072 }, pricing: { prompt: '0.00000015', completion: '0.0000006' } },
  { id: 'nvidia/nemotron-3.5-lightning:free', context_length: 1000000, top_provider: { max_completion_tokens: 65536 }, pricing: { prompt: '0', completion: '0' } },
  { id: 'inclusionai/ling-3.0-flash-fin:free', context_length: 262144, top_provider: { max_completion_tokens: 32768 }, pricing: { prompt: '0', completion: '0' } },
  // The llama class — two vendors share one bare name; a hint must pick, never guess.
  { id: 'meta-llama/llama-3.1-8b-instruct', context_length: 131072, top_provider: { max_completion_tokens: 8192 }, pricing: { prompt: '0.0000002', completion: '0.0000002' } },
  { id: 'meta/llama-3.1-8b-instruct', context_length: 8192, top_provider: { max_completion_tokens: 4096 }, pricing: { prompt: '0.0000003', completion: '0.0000003' } },
  // Same bare name under two vendors — bare alone is ambiguous; the segment hint must decide.
  { id: 'deepseek/deepseek-v4-flash-special', context_length: 262144, top_provider: { max_completion_tokens: 16384 }, pricing: { prompt: '0.00000012', completion: '0.0000005' } },
  { id: 'deepseek-ai/deepseek-v4-flash-special', context_length: 131072, top_provider: { max_completion_tokens: 8192 }, pricing: { prompt: '0.0000002', completion: '0.00000081' } },
];

describe('normalizeKey', () => {
  it('lowercases, trims, and strips a leading ~ prefix', () => {
    expect(normalizeKey('  ~OpenAI/GPT-Flash  ')).toBe('openai/gpt-flash');
  });

  it('strips both :free and -free suffixes with one expression', () => {
    expect(normalizeKey('cohere/north-mini-code:free')).toBe('cohere/north-mini-code');
    expect(normalizeKey('ling-3.0-flash-fin-free')).toBe('ling-3.0-flash-fin');
  });
});

describe('freeVariantBareNames', () => {
  it('returns bare names of :free entries only, deduped and normalized', () => {
    expect(freeVariantBareNames(FIXTURE)).toEqual(['deepseek-v4-flash', 'nemotron-3.5-lightning', 'ling-3.0-flash-fin']);
  });

  it('ignores paid-only entries', () => {
    expect(freeVariantBareNames([{ id: 'openai/gpt-x' }])).toEqual([]);
  });
});

describe('matchCatalogEntry', () => {
  it('tier-1 exact match', () => {
    expect(matchCatalogEntry(FIXTURE, 'deepseek/deepseek-v4-flash-0731')).toEqual({
      entry: FIXTURE[2],
      tier: 't1',
    });
  });

  it('steers to the :free variant when the local key is free', () => {
    expect(matchCatalogEntry(FIXTURE, 'deepseek/deepseek-v4-flash:free')).toEqual({ entry: FIXTURE[1], tier: 't1' });
  });

  it('steers to the paid variant when the local key is not free', () => {
    expect(matchCatalogEntry(FIXTURE, 'deepseek/deepseek-v4-flash')).toEqual({ entry: FIXTURE[0], tier: 't1' });
  });

  it('tier-2 single bare-name match (dated model, alias row excluded)', () => {
    // 'deepseek-v4-flash-0731' exists once (the alias row points AT it but is not indexed).
    expect(matchCatalogEntry(FIXTURE, 'deepseek-v4-flash-0731')).toEqual({ entry: FIXTURE[2], tier: 't2' });
  });

  it('resolves -free-suffixed keys onto the catalog :free entry', () => {
    expect(matchCatalogEntry(FIXTURE, 'ling-3.0-flash-fin-free')).toEqual({ entry: FIXTURE[5], tier: 't2' });
  });

  it('resolves a bare key with the provider-key hint when two vendors share the bare name', () => {
    expect(matchCatalogEntry(FIXTURE, 'deepseek-v4-flash-special', 'deepseek-ai')).toEqual({ entry: FIXTURE[9], tier: 't2' });
    // No hint → ambiguous → null (never guess).
    expect(matchCatalogEntry(FIXTURE, 'deepseek-v4-flash-special')).toBeNull();
  });

  it('an explicit vendor/id key that exists in the catalog matches tier-1 regardless of the bare ambiguity', () => {
    expect(matchCatalogEntry(FIXTURE, 'deepseek-ai/deepseek-v4-flash-special')).toEqual({ entry: FIXTURE[9], tier: 't1' });
    expect(matchCatalogEntry(FIXTURE, 'deepseek/deepseek-v4-flash-special')).toEqual({ entry: FIXTURE[8], tier: 't1' });
  });

  it('returns null for an ambiguous bare name with no hint — never guesses a price', () => {
    expect(matchCatalogEntry(FIXTURE, 'llama-3.1-8b-instruct')).toBeNull();
  });

  it('returns null when the key matches nothing', () => {
    expect(matchCatalogEntry(FIXTURE, 'agnes-2.0-flash')).toBeNull();
  });
});

describe('metadataFromEntry', () => {
  it('maps top-level context_length and top_provider.max_completion_tokens', () => {
    const meta = metadataFromEntry('deepseek/deepseek-v4-flash', FIXTURE[0], 't1');
    expect(meta.contextLength).toBe(1048576);
    expect(meta.maxOutputTokens).toBe(384000);
  });

  it('converts per-token strings to $ per 1M tokens', () => {
    const meta = metadataFromEntry('deepseek/deepseek-v4-flash', FIXTURE[0], 't1');
    expect(meta.promptPricePerM).toBeCloseTo(0.04984, 6);
    expect(meta.completionPricePerM).toBeCloseTo(0.04984, 6);
  });

  it('flags free tier from :free id, local -free key, or zero prices', () => {
    expect(metadataFromEntry('deepseek/deepseek-v4-flash:free', FIXTURE[1], 't1').freeTier).toBe(true);
    expect(metadataFromEntry('ling-3.0-flash-fin-free', FIXTURE[5], 't2').freeTier).toBe(true);
    expect(metadataFromEntry('deepseek/deepseek-v4-flash', FIXTURE[0], 't1').freeTier).toBe(false);
  });

  it('stays null (unknown, not zero) when pricing is absent', () => {
    const meta = metadataFromEntry('something/none', { id: 'something/none' }, 't1');
    expect(meta.promptPricePerM).toBeNull();
    expect(meta.completionPricePerM).toBeNull();
    expect(meta.contextLength).toBeNull();
    expect(meta.maxOutputTokens).toBeNull();
    expect(meta.freeTier).toBe(false);
  });

  it('records the provenance tier', () => {
    expect(metadataFromEntry('a', FIXTURE[0], 't1').metadataSource).toBe('openrouter:t1');
    expect(metadataFromEntry('a', FIXTURE[0], 't2').metadataSource).toBe('openrouter:t2');
  });
});

describe('ModelMetadataCatalogService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function mockCatalog(entries: OpenRouterModelEntry[] = FIXTURE): jest.SpyInstance {
    return jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ data: entries }),
    } as any);
  }

  it('detects a single key', async () => {
    mockCatalog();
    const svc = new ModelMetadataCatalogService();
    const meta = await svc.detect('deepseek/deepseek-v4-flash');
    expect(meta?.contextLength).toBe(1048576);
    expect(meta?.metadataSource).toBe('openrouter:t1');
  });

  it('returns null for a completely unknown key', async () => {
    mockCatalog();
    const svc = new ModelMetadataCatalogService();
    expect(await svc.detect('agnes-2.0-flash')).toBeNull();
  });

  it('fetches the catalog once and serves many keys from the cache', async () => {
    const fetchMock = mockCatalog();
    const svc = new ModelMetadataCatalogService();

    const a = await svc.detectMany(['deepseek/deepseek-v4-flash', 'nvidia/nemotron-3.5-lightning:free', 'agnes-2.0-flash']);
    expect(a.get('deepseek/deepseek-v4-flash')?.promptPricePerM).toBeCloseTo(0.04984, 6);
    expect(a.get('nvidia/nemotron-3.5-lightning:free')?.freeTier).toBe(true);
    expect(a.get('agnes-2.0-flash')).toBeNull();

    await svc.detectMany(['meta/llama-3.1-8b-instruct']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://openrouter.ai/api/v1/models');
  });

  it('never throws on a catalog failure, and backs off instead of re-fetching on every call', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));
    const t0 = Date.now();
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(t0);
    const svc = new ModelMetadataCatalogService();

    expect(await svc.detect('deepseek/deepseek-v4-flash')).toBeNull();
    expect(await svc.detect('deepseek/deepseek-v4-flash')).toBeNull();
    expect(await svc.detect('nvidia/nemotron-3.5-lightning:free')).toBeNull();
    // Three calls inside the backoff window → one request.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(nowSpy).toHaveBeenCalled();
  });

  it('retries after the backoff window — a transient failure must not kill enrichment for 24h', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: FIXTURE }) } as any);
    const t0 = Date.now();
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(t0);
    const svc = new ModelMetadataCatalogService();

    expect(await svc.detect('deepseek/deepseek-v4-flash')).toBeNull();

    nowSpy.mockReturnValue(t0 + 59_000);
    expect(await svc.detect('deepseek/deepseek-v4-flash')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    nowSpy.mockReturnValue(t0 + 61_000);
    expect((await svc.detect('deepseek/deepseek-v4-flash'))?.contextLength).toBe(1048576);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('widens the backoff on consecutive failures (60s, then 120s)', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));
    const t0 = Date.now();
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(t0);
    const svc = new ModelMetadataCatalogService();

    await svc.detect('deepseek/deepseek-v4-flash');
    nowSpy.mockReturnValue(t0 + 61_000);
    await svc.detect('deepseek/deepseek-v4-flash');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    nowSpy.mockReturnValue(t0 + 61_000 + 119_000);
    await svc.detect('deepseek/deepseek-v4-flash');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    nowSpy.mockReturnValue(t0 + 61_000 + 121_000);
    await svc.detect('deepseek/deepseek-v4-flash');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('serves the last good catalog when a refresh fails after the TTL expires', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: FIXTURE }) } as any)
      .mockRejectedValue(new Error('network down'));
    const t0 = Date.now();
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(t0);
    const svc = new ModelMetadataCatalogService();

    expect((await svc.detect('deepseek/deepseek-v4-flash'))?.contextLength).toBe(1048576);

    // 25h later the cache is expired and the refresh fails — stale beats blank, and the
    // failed refresh is not retried on the very next call.
    nowSpy.mockReturnValue(t0 + 25 * 60 * 60 * 1000);
    expect((await svc.detect('deepseek/deepseek-v4-flash'))?.contextLength).toBe(1048576);
    expect((await svc.detect('deepseek/deepseek-v4-flash-0731'))?.contextLength).toBe(1310720);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('coalesces concurrent refreshes into a single fetch', async () => {
    const fetchMock = mockCatalog();
    const svc = new ModelMetadataCatalogService();

    const [a, b, c] = await Promise.all([
      svc.detect('deepseek/deepseek-v4-flash'),
      svc.detect('deepseek/deepseek-v4-flash-0731'),
      svc.detect('nvidia/nemotron-3.5-lightning:free'),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a?.contextLength).toBe(1048576);
    expect(b?.contextLength).toBe(1310720);
    expect(c?.freeTier).toBe(true);
  });

  it('treats an empty catalog body as a failure rather than caching it for 24h', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) } as any)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: FIXTURE }) } as any);
    const t0 = Date.now();
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(t0);
    const svc = new ModelMetadataCatalogService();

    expect(await svc.detect('deepseek/deepseek-v4-flash')).toBeNull();

    nowSpy.mockReturnValue(t0 + 61_000);
    expect((await svc.detect('deepseek/deepseek-v4-flash'))?.contextLength).toBe(1048576);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});