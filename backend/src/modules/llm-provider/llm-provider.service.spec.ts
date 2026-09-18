import { LessThan, FindOperator } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LlmProviderService } from './llm-provider.service';

function makeService(mockDelete: jest.Mock): LlmProviderService {
  const svc = new LlmProviderService({} as any, {} as any, { delete: mockDelete } as any, {} as any, {} as any);
  return svc;
}

describe('LlmProviderService.deleteOldTestResults', () => {
  it('calls repository delete with a LessThan operator on createdAt', async () => {
    const mockDelete = jest.fn().mockResolvedValue({ affected: 5 });
    const svc = makeService(mockDelete);

    const deleted = await svc.deleteOldTestResults(30);

    expect(deleted).toBe(5);
    const callArg = mockDelete.mock.calls[0][0];
    expect(callArg.createdAt).toBeDefined();
    expect(callArg.createdAt).toBeInstanceOf(FindOperator);
    const lessThan = callArg.createdAt as FindOperator<Date>;
    expect(lessThan.value).toBeInstanceOf(Date);
  });

  it('sets cutoff to now minus retentionDays', async () => {
    const mockDelete = jest.fn().mockResolvedValue({ affected: 0 });
    const svc = makeService(mockDelete);

    await svc.deleteOldTestResults(30);

    const callArg = mockDelete.mock.calls[0][0];
    const lessThan = callArg.createdAt as FindOperator<Date>;
    const cutoff = lessThan.value as Date;
    const now = new Date();
    const diffMs = now.getTime() - cutoff.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThanOrEqual(29.9);
    expect(diffDays).toBeLessThanOrEqual(30.1);
  });

  it('returns the affected row count from delete', async () => {
    const mockDelete = jest.fn().mockResolvedValue({ affected: 7 });
    const svc = makeService(mockDelete);

    const deleted = await svc.deleteOldTestResults(30);

    expect(deleted).toBe(7);
  });

  it('returns 0 when DeleteResult has no affected count', async () => {
    const mockDelete = jest.fn().mockResolvedValue({ affected: undefined });
    const svc = makeService(mockDelete);

    const deleted = await svc.deleteOldTestResults(30);

    expect(deleted).toBe(0);
  });

  it('uses custom retention value when provided', async () => {
    const mockDelete = jest.fn().mockResolvedValue({ affected: 2 });
    const svc = makeService(mockDelete);

    await svc.deleteOldTestResults(7);

    const callArg = mockDelete.mock.calls[0][0];
    const lessThan = callArg.createdAt as FindOperator<Date>;
    const cutoff = lessThan.value as Date;
    const now = new Date();
    const diffDays = (now.getTime() - cutoff.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThanOrEqual(6.9);
    expect(diffDays).toBeLessThanOrEqual(7.1);
  });
});

describe('LlmProviderService.deleteProvider', () => {
  function makeDeleteService(providerRepo: { findOneBy: jest.Mock; delete: jest.Mock }): LlmProviderService {
    return new LlmProviderService(providerRepo as any, {} as any, {} as any, {} as any, {} as any);
  }

  it('deletes the provider row and returns success', async () => {
    const providerRepo = {
      findOneBy: jest.fn().mockResolvedValue({ id: 3, key: 'openrouter' }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const svc = makeDeleteService(providerRepo);

    const res = await svc.deleteProvider(3);

    expect(providerRepo.findOneBy).toHaveBeenCalledWith({ id: 3 });
    expect(providerRepo.delete).toHaveBeenCalledWith({ id: 3 });
    expect(res.success).toBe(true);
    expect(res.message).toBe('Provider deleted');
  });

  it('throws NotFoundException for an unknown provider', async () => {
    const providerRepo = {
      findOneBy: jest.fn().mockResolvedValue(null),
      delete: jest.fn(),
    };
    const svc = makeDeleteService(providerRepo);

    await expect(svc.deleteProvider(99)).rejects.toThrow(NotFoundException);
    expect(providerRepo.delete).not.toHaveBeenCalled();
  });
});

describe('LlmProviderService.getProviderCatalog', () => {
  function makeCatalogService(providerRepo: { createQueryBuilder: jest.Mock }, modelRepo: { find: jest.Mock }): LlmProviderService {
    return new LlmProviderService(providerRepo as any, modelRepo as any, {} as any, {} as any, {} as any);
  }

  function providerRepoFor(provider: any): { createQueryBuilder: jest.Mock } {
    const qb = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(provider),
    };
    return { createQueryBuilder: jest.fn().mockReturnValue(qb) };
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('merges the upstream catalog with statuses: new / exists / unavailable', async () => {
    const providerRepo = providerRepoFor({ id: 12, key: 'nvidia', baseUrl: 'https://x/v1', apiKey: 'k' });
    const modelRepo = {
      find: jest.fn().mockResolvedValue([
        { key: 'openai/gpt-oss-20b', label: 'GPT OSS 20B' },
        { key: 'deepseek-ai/deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
      ]),
    };
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          data: [
            { id: 'openai/gpt-oss-20b', owned_by: 'openai' },
            { id: 'moonshotai/kimi-k2.6', owned_by: 'moonshotai' },
          ],
        }),
    });
    jest.spyOn(global, 'fetch').mockImplementation(fetchMock as any);
    const svc = makeCatalogService(providerRepo, modelRepo);

    const res = await svc.getProviderCatalog(12);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://x/v1/models',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer k' }) }),
    );
    expect(res.result!.models).toEqual([
      { key: 'deepseek-ai/deepseek-v4-pro', label: 'DeepSeek V4 Pro', status: 'unavailable' },
      { key: 'moonshotai/kimi-k2.6', owned_by: 'moonshotai', status: 'new' },
      { key: 'openai/gpt-oss-20b', owned_by: 'openai', status: 'exists' },
    ]);
  });

  it('throws BadRequest when the upstream catalog fails', async () => {
    const providerRepo = providerRepoFor({ id: 12, key: 'nvidia', baseUrl: 'https://x/v1', apiKey: null });
    const modelRepo = { find: jest.fn() };
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 410 } as any);
    const svc = makeCatalogService(providerRepo, modelRepo);

    await expect(svc.getProviderCatalog(12)).rejects.toThrow(BadRequestException);
  });

  it('reports the content-type and body snippet when the catalog body is not JSON', async () => {
    const providerRepo = providerRepoFor({ id: 12, key: 'nara', baseUrl: 'https://router.bynara.id', apiKey: 'k' });
    const modelRepo = { find: jest.fn() };
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      headers: { get: () => 'text/html; charset=utf-8' },
      text: async () => '<!DOCTYPE html><html lang="en"><head><title>Login</title></head></html>',
    } as any);
    const svc = makeCatalogService(providerRepo, modelRepo);

    await expect(svc.getProviderCatalog(12)).rejects.toThrow(
      /invalid JSON \(content-type: text\/html; charset=utf-8; body starts with: <!DOCTYPE html>/,
    );
  });

  it('flags an empty catalog body instead of reporting a blank snippet', async () => {
    const providerRepo = providerRepoFor({ id: 12, key: 'nara', baseUrl: 'https://router.bynara.id', apiKey: 'k' });
    const modelRepo = { find: jest.fn() };
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      text: async () => '',
    } as any);
    const svc = makeCatalogService(providerRepo, modelRepo);

    await expect(svc.getProviderCatalog(12)).rejects.toThrow(/content-type: unknown; body starts with: <empty body>/);
  });

  it('falls back to the Cloudflare native catalog on 405 and maps names to keys', async () => {
    const providerRepo = providerRepoFor({
      id: 30,
      key: 'cloudflare',
      baseUrl: 'https://api.cloudflare.com/client/v4/accounts/acc123/ai/v1',
      apiKey: 'cf-key',
    });
    const modelRepo = { find: jest.fn().mockResolvedValue([{ key: '@cf/meta/llama-2', label: 'Llama 2' }]) };
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 405 } as any)
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            result: [
              { name: '@cf/openai/gpt-oss-120b', task: { name: 'Text Generation' } },
              { name: '@cf/meta/llama-2', task: { name: 'Text Generation' } },
            ],
          }),
      } as any);
    jest.spyOn(global, 'fetch').mockImplementation(fetchMock as any);
    const svc = makeCatalogService(providerRepo, modelRepo);

    const res = await svc.getProviderCatalog(30);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain('/ai/models/search?per_page=100&page=1');
    expect(res.result!.models).toEqual([
      { key: '@cf/meta/llama-2', owned_by: undefined, status: 'exists' },
      { key: '@cf/openai/gpt-oss-120b', status: 'new' },
    ]);
  });

  it('reports the Cloudflare catalog body when it is not JSON either', async () => {
    const providerRepo = providerRepoFor({
      id: 30,
      key: 'cloudflare',
      baseUrl: 'https://api.cloudflare.com/client/v4/accounts/acc123/ai/v1',
      apiKey: 'cf-key',
    });
    const modelRepo = { find: jest.fn() };
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 405 } as any)
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'text/html; charset=utf-8' },
        text: async () => '<html><body>Cloudflare error</body></html>',
      } as any);
    jest.spyOn(global, 'fetch').mockImplementation(fetchMock as any);
    const svc = makeCatalogService(providerRepo, modelRepo);

    await expect(svc.getProviderCatalog(30)).rejects.toThrow(
      /invalid JSON \(content-type: text\/html; charset=utf-8; body starts with: <html>/,
    );
  });
});

describe('LlmProviderService.markModelUnavailable', () => {
  function makeMarkService(modelRepo: { findOne: jest.Mock; save: jest.Mock }): LlmProviderService {
    return new LlmProviderService({} as any, modelRepo as any, {} as any, {} as any, {} as any);
  }

  it('deactivates an active model', async () => {
    const model = { id: 5, active: true };
    const modelRepo = { findOne: jest.fn().mockResolvedValue(model), save: jest.fn().mockResolvedValue(model) };
    const svc = makeMarkService(modelRepo);

    await svc.markModelUnavailable(12, 'z-ai/glm-5.2');

    expect(modelRepo.findOne).toHaveBeenCalledWith({ where: { providerId: 12, key: 'z-ai/glm-5.2' } });
    expect(model.active).toBe(false);
    expect(modelRepo.save).toHaveBeenCalledWith(model);
  });

  it('does nothing when the model is missing or already inactive', async () => {
    const modelRepo = { findOne: jest.fn().mockResolvedValue(null), save: jest.fn() };
    const svc = makeMarkService(modelRepo);

    await svc.markModelUnavailable(12, 'gone');

    expect(modelRepo.save).not.toHaveBeenCalled();
  });
});

describe('LlmProviderService.syncProviderModels', () => {
  function makeSyncService(
    providerRepo: { findOneBy: jest.Mock },
    modelRepo: { find: jest.Mock; create: jest.Mock; save: jest.Mock },
  ): LlmProviderService {
    return new LlmProviderService(providerRepo as any, modelRepo as any, {} as any, {} as any, {} as any);
  }

  it('adds only missing keys (deduped, active=false, capability=text) and counts skips', async () => {
    const created: any[] = [];
    const modelRepo = {
      find: jest.fn().mockResolvedValue([{ key: 'openai/gpt-oss-20b' }]),
      create: jest.fn().mockImplementation((data) => {
        created.push(data);
        return data;
      }),
      save: jest.fn().mockResolvedValue([]),
    };
    const providerRepo = { findOneBy: jest.fn().mockResolvedValue({ id: 12, key: 'nvidia' }) };
    const svc = makeSyncService(providerRepo, modelRepo);

    const res = await svc.syncProviderModels(12, ['a', 'a', 'openai/gpt-oss-20b', 'b']);

    expect(modelRepo.save).toHaveBeenCalledWith([created[0], created[1]]);
    expect(created).toEqual([
      expect.objectContaining({ key: 'a', active: false, capability: 'text', providerId: 12 }),
      expect.objectContaining({ key: 'b', active: false, capability: 'text', providerId: 12 }),
    ]);
    expect(res.result).toEqual({ added: 2, skipped: 1 });
  });
});

describe('LlmProviderService.getModelStats', () => {
  /** Fluent stand-in for a TypeORM query builder: every chain method returns itself. */
  function makeStatsBuilder(rows: { ping: unknown[]; real: unknown[] }) {
    const builder: Record<string, jest.Mock> = {};
    for (const method of ['select', 'addSelect', 'groupBy', 'addGroupBy']) {
      builder[method] = jest.fn(() => builder);
    }

    // The WHERE clause decides which half of the data the builder hands back — the production
    // code reads BOTH ping and real from llm_call_stats, filtered on is_test.
    let isTest: unknown;
    builder.where = jest.fn((_column: string, params: { isTest?: unknown }) => {
      isTest = params.isTest;
      return builder;
    });
    builder.getRawMany = jest.fn(async () => (isTest ? rows.ping : rows.real));
    return builder;
  }

  const providers = [
    {
      key: 'openrouter',
      active: true,
      models: [
        { id: 1, key: 'fast-model', label: 'Fast', active: true },
        { id: 2, key: 'slow-model', label: 'Slow', active: true },
        { id: 3, key: 'steady-model', label: 'Steady', active: true },
        { id: 4, key: 'unused-model', label: 'Unused', active: true },
      ],
    },
  ];

  const pingRows = [
    { providerKey: 'openrouter', modelKey: 'fast-model', runs: '5', successes: '5', avgMs: '300', minMs: '200', lastCallAt: '2026-09-13T08:00:00.000Z' },
    { providerKey: 'openrouter', modelKey: 'slow-model', runs: '5', successes: '2', avgMs: '4000', minMs: '3000', lastCallAt: '2026-09-13T09:00:00.000Z' },
  ];

  const realRows = [
    { providerKey: 'openrouter', modelKey: 'fast-model', runs: '10', successes: '10', avgMs: '1200.5', minMs: '900', toolCallReliability: '88.6', lastCallAt: '2026-09-13T10:00:00.000Z' },
    { providerKey: 'openrouter', modelKey: 'slow-model', runs: '10', successes: '8', avgMs: '9000', minMs: '7000', toolCallReliability: '50', lastCallAt: '2026-09-13T11:00:00.000Z' },
    { providerKey: 'openrouter', modelKey: 'steady-model', runs: '20', successes: '20', avgMs: '5000', minMs: '4000', lastCallAt: '2026-09-13T12:00:00.000Z' },
  ];

  function makeStatsService(ping: unknown[] = pingRows, real: unknown[] = realRows, providerRows: unknown[] = providers): LlmProviderService {
    const providerRepo = { find: jest.fn().mockResolvedValue(providerRows) };
    // Both halves now come out of llm_call_stats — the test-result repo is no longer a stats source.
    const callStatRepo = { createQueryBuilder: jest.fn(() => makeStatsBuilder({ ping, real })) };
    return new LlmProviderService(
      providerRepo as any,
      {} as any,
      {} as any,
      callStatRepo as any,
      {} as any,
    );
  }

  it('reads both halves from llm_call_stats, split solely on is_test', async () => {
    const callStatRepo = { createQueryBuilder: jest.fn(() => makeStatsBuilder({ ping: pingRows, real: realRows })) };
    const testResultRepo = { createQueryBuilder: jest.fn(() => ({ getRawMany: jest.fn() })) };
    const service = new LlmProviderService({ find: jest.fn().mockResolvedValue(providers) } as any, {} as any, testResultRepo as any, callStatRepo as any, {} as any);

    const res = await service.getModelStats();

    expect(res.result!.rows.length).toBe(4);
    // Both aggregates come from the SAME table — llm_model_test_results plays no part any more.
    expect(callStatRepo.createQueryBuilder).toHaveBeenCalledTimes(2);
    expect(testResultRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('merges ping and real figures onto the configured models and normalises driver strings', async () => {
    const res = await makeStatsService().getModelStats();
    const rows = res.result!.rows;
    const fast = rows.find((r) => r.id === 'openrouter::fast-model')!;
    const unused = rows.find((r) => r.id === 'openrouter::unused-model')!;

    // MySQL hands back aggregates as strings; they must arrive as numbers, rounded.
    expect(fast.ping).toEqual({ runs: 5, successRate: 100, avgMs: 300, minMs: 200, toolCallReliability: null });
    expect(fast.real).toEqual({ runs: 10, successRate: 100, avgMs: 1201, minMs: 900, toolCallReliability: 89 });
    expect(fast.lastCallAt).toEqual(new Date('2026-09-13T10:00:00.000Z'));

    // A model with no measurements reports null, not zero — "never used" is not "instant".
    expect(unused.ping).toBeNull();
    expect(unused.real).toBeNull();
    expect(unused.label).toBe('Unused');
  });

  it('ranks the fastest by mean latency and breaks a reliability tie on run count', async () => {
    const res = await makeStatsService().getModelStats();

    // fast-model has the lowest mean (1201ms); steady-model is equally reliable but measured more.
    expect(res.result!.fastestId).toBe('openrouter::fast-model');
    expect(res.result!.mostStableId).toBe('openrouter::steady-model');
  });

  it('never ranks a model that has fewer runs than the minimum sample', async () => {
    const thinRows = [
      ...realRows,
      { providerKey: 'openrouter', modelKey: 'unused-model', runs: '2', successes: '2', avgMs: '50', minMs: '40', lastCallAt: '2026-09-13T13:00:00.000Z' },
    ];
    const res = await makeStatsService(pingRows, thinRows).getModelStats();

    // 50ms would win outright, but two runs are noise — the guard is the whole point of the field.
    expect(res.result!.minimumSample).toBe(3);
    expect(res.result!.fastestId).toBe('openrouter::fast-model');
    expect(res.result!.rows.find((r) => r.id === 'openrouter::unused-model')!.real!.runs).toBe(2);
  });

  it('keeps a row for a model that no longer exists in the configuration', async () => {
    const orphanRows = [
      ...realRows,
      { providerKey: 'gone-provider', modelKey: 'gone-model', runs: '4', successes: '4', avgMs: '800', minMs: '700', lastCallAt: '2026-09-13T09:00:00.000Z' },
    ];
    const res = await makeStatsService(pingRows, orphanRows).getModelStats();
    const orphan = res.result!.rows.find((r) => r.id === 'gone-provider::gone-model')!;

    expect(orphan).toBeDefined();
    expect(orphan.label).toBeNull();
    expect(orphan.active).toBe(false);
    expect(orphan.real!.runs).toBe(4);
  });

  it('carries per-model tool-call reliability as the rounded mean of the real calls', async () => {
    const res = await makeStatsService().getModelStats();
    const rows = res.result!.rows;

    // fast-model emitted 88.6% sound tool output on average; slow-model exactly 50%.
    expect(rows.find((r) => r.id === 'openrouter::fast-model')!.real!.toolCallReliability).toBe(89);
    expect(rows.find((r) => r.id === 'openrouter::slow-model')!.real!.toolCallReliability).toBe(50);

    // steady-model recorded no tool-call sample — null, not a perfect 0.
    expect(rows.find((r) => r.id === 'openrouter::steady-model')!.real!.toolCallReliability).toBeNull();
    expect(rows.find((r) => r.id === 'openrouter::unused-model')!.real).toBeNull();
  });
});
