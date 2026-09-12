import { translationTracker } from './translation-tracker';

describe('translationTracker — LLM-translation harvest queue', () => {
  beforeEach(() => {
    translationTracker.reset();
  });

  it('counts distinct genetics map misses (dedup by Hebrew name)', () => {
    translationTracker.recordGeneticsMiss('אוראוז', 'Oreoz');
    // The same strain translated again (repeated chunk / additional enrichment run) — still counted once
    translationTracker.recordGeneticsMiss('אוראוז', 'Oreoz');
    translationTracker.recordGeneticsMiss('אוז קוש', 'Oz Kush');

    expect(translationTracker.geneticsMissCount()).toBe(2);
  });

  it('tracks terpene translations separately from genetics misses', () => {
    translationTracker.recordGeneticsMiss('אוראוז', 'Oreoz');
    translationTracker.recordTerpeneTranslation('דג סלמון', 'Salmon River');

    expect(translationTracker.geneticsMissCount()).toBe(1);
    expect(translationTracker.terpeneTranslationCount()).toBe(1);
    expect(translationTracker.totalCount()).toBe(2);
  });

  it('returns recent records newest first, capped by the requested limit', () => {
    translationTracker.recordGeneticsMiss('א', 'A');
    translationTracker.recordGeneticsMiss('ב', 'B');
    translationTracker.recordGeneticsMiss('ג', 'C');

    const recent = translationTracker.recentGeneticsMisses(2);
    expect(recent).toHaveLength(2);
    expect(recent[0].hebrew).toBe('ג');
    expect(recent[1].hebrew).toBe('ב');
  });

  it('reset clears both collections', () => {
    translationTracker.recordGeneticsMiss('א', 'A');
    translationTracker.recordTerpeneTranslation('ב', 'B');
    translationTracker.reset();

    expect(translationTracker.totalCount()).toBe(0);
    expect(translationTracker.recentGeneticsMisses(5)).toEqual([]);
    expect(translationTracker.recentTerpeneTranslations(5)).toEqual([]);
  });
});
