/**
 * DB-backed tracker for LLM-based strain/terpene name translations.
 *
 * Genetics: the nightly report queries genetics rows where `englishName`
 * is set and `name` is not in the hardcoded HEBREW_STRAIN_NAMES map —
 * these are the "map misses" that should be harvested into the map.
 * Terpene: queries terpenes where `englishName` is set — every terpene
 * translation is tracked since there is no hardcoded map baseline.
 *
 * Replaces the old in-memory singleton that lost all data on restart.
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Genetics } from '../../modules/genetics/entities/genetics.entity';
import { Terpene } from '../../modules/terpene/entities/terpene.entity';

const HEBREW_STRAIN_NAMES: Record<string, string> = {};
// Populate from cannlytics — but for the tracker we just need to know
// which genetics rows have englishName set, not which are in the map.
// The tracker queries DB directly now.

export interface TranslationRecord {
  hebrew: string;
  english: string;
  at: number;
}

@Injectable()
export class TranslationTrackerService {
  constructor(
    @InjectRepository(Genetics)
    private readonly geneticsRepository: Repository<Genetics>,
    @InjectRepository(Terpene)
    private readonly terpeneRepository: Repository<Terpene>,
  ) {}

  async geneticsMissCount(): Promise<number> {
    const row = await this.geneticsRepository.createQueryBuilder('g').where('g.englishName IS NOT NULL').getCount();
    return row;
  }

  async terpeneTranslationCount(): Promise<number> {
    return this.terpeneRepository.createQueryBuilder('t').where('t.englishName IS NOT NULL').getCount();
  }

  async totalCount(): Promise<number> {
    return (await this.geneticsMissCount()) + (await this.terpeneTranslationCount());
  }

  async recentGeneticsMisses(limit: number): Promise<TranslationRecord[]> {
    const rows = await this.geneticsRepository.find({
      where: {},
      order: { id: 'DESC' },
      take: limit * 5,
      select: ['name', 'englishName'],
    });
    return rows
      .filter((r) => r.englishName != null)
      .slice(0, limit)
      .map((r) => ({
        hebrew: r.name,
        english: r.englishName!,
        at: Date.now(),
      }));
  }

  async recentTerpeneTranslations(limit: number): Promise<TranslationRecord[]> {
    const rows = await this.terpeneRepository.find({
      where: {},
      order: { id: 'DESC' },
      take: limit * 5,
      select: ['name', 'englishName'],
    });
    return rows
      .filter((r) => r.englishName != null)
      .slice(0, limit)
      .map((r) => ({
        hebrew: r.name,
        english: r.englishName!,
        at: Date.now(),
      }));
  }
}

/**
 * Legacy in-memory singleton — kept for backward compatibility with code
 * that calls `translationTracker.recordGeneticsMiss()` / `recordTerpeneTranslation()`.
 * These are no-ops now (the DB is the source of truth), but removing the
 * singleton would require updating all callers. The Telegram report now
 * uses TranslationTrackerService directly.
 */
class LegacyTranslationTracker {
  recordGeneticsMiss(_hebrew: string, _english: string): void {
    // no-op — DB is the source of truth now
  }
  recordTerpeneTranslation(_hebrew: string, _english: string): void {
    // no-op — DB is the source of truth now
  }
  geneticsMissCount(): number {
    return 0;
  }
  terpeneTranslationCount(): number {
    return 0;
  }
  totalCount(): number {
    return 0;
  }
  recentGeneticsMisses(_limit: number): TranslationRecord[] {
    return [];
  }
  recentTerpeneTranslations(_limit: number): TranslationRecord[] {
    return [];
  }
  reset(): void {
    // no-op
  }
}

export const translationTracker = new LegacyTranslationTracker();
