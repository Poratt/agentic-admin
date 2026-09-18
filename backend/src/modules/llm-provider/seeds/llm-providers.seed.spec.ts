import { DataSource } from 'typeorm';
import { seedLlmProviders } from './llm-providers.seed';

function makeDataSource(providerRepo: any, modelRepo: any): DataSource {
  return {
    getRepository: jest.fn((entity: any) => (entity.name === 'LlmProviderEntity' ? providerRepo : modelRepo)),
  } as unknown as DataSource;
}

describe('seedLlmProviders', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('skips seeding when the providers table is not empty (deleted providers stay deleted)', async () => {
    const providerRepo = { count: jest.fn().mockResolvedValue(4), save: jest.fn() };
    const modelRepo = { save: jest.fn() };

    await seedLlmProviders(makeDataSource(providerRepo, modelRepo));

    expect(providerRepo.count).toHaveBeenCalled();
    expect(providerRepo.save).not.toHaveBeenCalled();
    expect(modelRepo.save).not.toHaveBeenCalled();
  });

  it('seeds the built-in providers when the table is empty', async () => {
    // The bootstrap now also runs best-effort metadata enrichment — a failed/absent catalog
    // must never block seeding. Mock it empty so no enrichment rows are written.
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ data: [] }) } as any);
    const providerRepo = {
      count: jest.fn().mockResolvedValue(0),
      findOne: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockImplementation(async (p: any) => ({ ...p, id: 1 })),
      find: jest.fn().mockResolvedValue([]),
    };
    const modelRepo = { save: jest.fn().mockResolvedValue({}) };

    await seedLlmProviders(makeDataSource(providerRepo, modelRepo));

    expect(providerRepo.save).toHaveBeenCalledTimes(5);
    expect(modelRepo.save).toHaveBeenCalled();
  });
});
