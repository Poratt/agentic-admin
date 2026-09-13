/**
 * Tests for TranslationTrackerService — the DB-backed replacement for the
 * old in-memory singleton. The legacy `translationTracker` singleton is now
 * a no-op stub (the service reads directly from genetics/terpene repos).
 *
 * These tests use real NestJS testing with mocked repos so they verify
 * the query logic without a database.
 */
import { TranslationTrackerService } from './translation-tracker';

function makeGeneticsRepo(rows: { name: string; englishName: string | null }[]) {
  return {
    find: jest.fn().mockResolvedValue(rows),
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(rows.filter((r) => r.englishName != null).length),
    }),
  };
}

function makeTerpeneRepo(rows: { name: string; englishName: string | null }[]) {
  return {
    find: jest.fn().mockResolvedValue(rows),
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(rows.filter((r) => r.englishName != null).length),
    }),
  };
}

describe('TranslationTrackerService', () => {
  it('geneticsMissCount returns count of rows with englishName', async () => {
    const geneticsRepo = makeGeneticsRepo([
      { name: 'אוראוז', englishName: 'Oreoz' },
      { name: 'אוז קוש', englishName: null },
    ]);
    const terpeneRepo = makeTerpeneRepo([]);
    const svc = new TranslationTrackerService(geneticsRepo as any, terpeneRepo as any);
    expect(await svc.geneticsMissCount()).toBe(1);
  });

  it('recentGeneticsMisses returns rows with englishName set, newest first', async () => {
    const geneticsRepo = makeGeneticsRepo([
      { name: 'ג', englishName: 'C' },
      { name: 'ב', englishName: 'B' },
      { name: 'א', englishName: null },
    ]);
    const terpeneRepo = makeTerpeneRepo([]);
    const svc = new TranslationTrackerService(geneticsRepo as any, terpeneRepo as any);
    const recent = await svc.recentGeneticsMisses(2);
    expect(recent).toHaveLength(2);
    expect(recent[0].hebrew).toBe('ג');
    expect(recent[0].english).toBe('C');
    expect(recent[1].hebrew).toBe('ב');
    expect(recent[1].english).toBe('B');
  });

  it('totalCount sums genetics and terpene counts', async () => {
    const geneticsRepo = makeGeneticsRepo([{ name: 'אוראוז', englishName: 'Oreoz' }]);
    const terpeneRepo = makeTerpeneRepo([{ name: 'דג סלמון', englishName: 'Salmon River' }]);
    const svc = new TranslationTrackerService(geneticsRepo as any, terpeneRepo as any);
    expect(await svc.totalCount()).toBe(2);
  });

  it('recentTerpeneTranslations returns rows with englishName set', async () => {
    const geneticsRepo = makeGeneticsRepo([]);
    const terpeneRepo = makeTerpeneRepo([
      { name: 'דג סלמון', englishName: 'Salmon River' },
      { name: 'לינלול', englishName: null },
    ]);
    const svc = new TranslationTrackerService(geneticsRepo as any, terpeneRepo as any);
    const recent = await svc.recentTerpeneTranslations(5);
    expect(recent).toHaveLength(1);
    expect(recent[0].hebrew).toBe('דג סלמון');
    expect(recent[0].english).toBe('Salmon River');
  });
});
