import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Terpene } from './entities/terpene.entity';
import { TerpeneCreateDto } from './dto/terpene-create.dto';
import { TerpeneUpdateDto } from './dto/terpene-update.dto';
import { LlmClientService } from '../llm/services/llm-client.service';
import type { LlmProvider } from '../llm/types/llm.types';
import { parseLlmJson } from '../llm/utils/llm-json-parser';
import {
    TERPENE_ENRICH_SYSTEM_PROMPT,
    buildTerpeneEnrichUserPrompt,
} from './constants/terpene-enrich-prompts.constant';
import { deriveThemeColors } from '../../core/utils/color-contrast.util';
import { WebSearchService } from '../web-search/web-search.service';
import { translationTracker } from '../../core/services/translation-tracker';

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;
const DEFAULT_COLOR = '#808080';
const UNKNOWN_LABEL = 'לא ידוע';
const MIN_NAME_LENGTH = 2;
const CHUNK_SIZE = 15;
const HEBREW_REGEX = /[א-ת]/;

@Injectable()
export class TerpeneService {
    private readonly logger = new Logger(TerpeneService.name);

    constructor(
        @InjectRepository(Terpene)
        private readonly terpeneRepository: Repository<Terpene>,
        private readonly llmClientService: LlmClientService,
        private readonly webSearchService: WebSearchService,
        private readonly configService: ConfigService,
    ) { }

    async findAll(): Promise<Terpene[]> {
        return this.terpeneRepository.find({ order: { name: 'ASC' } });
    }

    async findByName(name: string): Promise<Terpene | null> {
        return this.terpeneRepository.findOne({ where: { name } });
    }

    async delete(name: string): Promise<void> {
        const result = await this.terpeneRepository.delete({ name });
        if (result.affected === 0) {
            throw new NotFoundException(`Terpene "${name}" not found`);
        }
    }

    async create(dto: TerpeneCreateDto): Promise<Terpene> {
        const existing = await this.terpeneRepository.findOne({ where: { name: dto.name } });
        if (existing) {
            throw new ConflictException(`Terpene with name "${dto.name}" already exists`);
        }

        const terpene = this.terpeneRepository.create({
            ...dto,
            effects: dto.effects ?? null,
        });

        return this.terpeneRepository.save(terpene);
    }

    async update(name: string, dto: TerpeneUpdateDto): Promise<Terpene> {
        const terpene = await this.terpeneRepository.findOne({ where: { name } });
        if (!terpene) {
            throw new NotFoundException(`Terpene with name "${name}" not found`);
        }

        Object.assign(terpene, {
            ...dto,
            description: dto.description ?? terpene.description,
            scent: dto.scent ?? terpene.scent,
            effects: dto.effects !== undefined ? dto.effects : terpene.effects,
            color: dto.color ?? terpene.color,
        });

        return this.terpeneRepository.save(terpene);
    }

    /**
     * Model selection for enrichment calls. A human trigger passes userId and resolves to
     * that user's default model; background batches have no user, so they use the dedicated
     * ENRICHMENT_PROVIDER / ENRICHMENT_MODEL env pair (never the shared AI_PROVIDER legacy).
     */
    private enrichModel(userId?: number): { userId?: number; providerOverride?: LlmProvider; modelOverride?: string } {
        if (userId) return { userId };
        return {
            providerOverride: (this.configService.get<string>('ENRICHMENT_PROVIDER') ?? 'openrouter') as LlmProvider,
            modelOverride: this.configService.get<string>('ENRICHMENT_MODEL') ?? 'google/gemma-4-26b-a4b-it:free',
        };
    }

    async enrichBatch(names: string[], userId?: number): Promise<void> {
        const filtered = this.filterNames(names);
        if (!filtered.length) {
            return;
        }

        const existing = await this.terpeneRepository.find({
            where: { name: In(filtered) },
            select: ['name'],
        });
        const existingNames = new Set(existing.map((row) => {
            return row.name;
        }));
        const missing = filtered.filter((name) => {
            return !existingNames.has(name);
        });

        if (!missing.length) {
            this.logger.debug(`All ${filtered.length} terpenes already exist in DB - skipping enrich.`);
            return;
        }

        this.logger.log(`Enriching ${missing.length} missing terpenes via LLM in chunks of ${CHUNK_SIZE}...`);

        for (let i = 0; i < missing.length; i += CHUNK_SIZE) {
            const chunk = missing.slice(i, i + CHUNK_SIZE);
            const chunkNumber = Math.floor(i / CHUNK_SIZE) + 1;
            const totalChunks = Math.ceil(missing.length / CHUNK_SIZE);

            this.logger.log(`Searching web for terpenes chunk ${chunkNumber}/${totalChunks} (${chunk.length} items)...`);

            const englishNames = await this.resolveEnglishNames(chunk, userId);
            const searchResults = await this.searchChunk(chunk, englishNames, userId);

            this.logger.log(`Sending terpenes chunk ${chunkNumber}/${totalChunks} to LLM...`);

            try {
                const response = await this.llmClientService.generateResponse({
                    prompt: buildTerpeneEnrichUserPrompt(chunk, searchResults),
                    systemContext: TERPENE_ENRICH_SYSTEM_PROMPT,
                    ...this.enrichModel(userId),
                    maxTokens: 4096,
                });

                const parsed = parseLlmJson<{ terpenes?: unknown[] }>(response.content, 'terpene-enrich');
                if (!parsed || !Array.isArray(parsed.terpenes)) {
                    this.logger.warn(`Failed to parse response for chunk ${chunkNumber}`);
                    continue;
                }

                const entities = parsed.terpenes
                    .map((item) => {
                        return this.mapTerpeneRecord(item);
                    })
                    .filter((record): record is Partial<Terpene> => {
                        return record !== null;
                    });

                if (!entities.length) {
                    continue;
                }

                for (const entity of entities) {
                    const isDuplicate = await this.terpeneRepository.findOne({
                        where: { name: entity.name },
                    });
                    if (isDuplicate) {
                        continue;
                    }
                    await this.terpeneRepository.save(this.terpeneRepository.create(entity));
                }

                this.logger.log(`Chunk ${chunkNumber}/${totalChunks} saved successfully with ${entities.length} items.`);
            } catch (error: unknown) {
                const msg = error instanceof Error ? error.message : 'Unknown error';
                this.logger.error(`Error processing terpenes chunk ${chunkNumber}: ${msg}`);
            }
        }
    }

    async enrichMissing(userId?: number): Promise<{ total: number; enriched: number; errors: number }> {
        const rows = await this.terpeneRepository.find({
            where: [
                { description: IsNull() },
                { scent: IsNull() },
                { effects: IsNull() },
            ],
            order: { name: 'ASC' },
        });

        if (!rows.length) {
            this.logger.log('[enrichMissing] All terpenes have complete data — nothing to do.');
            return { total: 0, enriched: 0, errors: 0 };
        }

        this.logger.log(`[enrichMissing] Found ${rows.length} terpenes with missing data. Enriching in chunks of ${CHUNK_SIZE}...`);

        let enriched = 0;
        let errors = 0;

        for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
            const chunk = rows.slice(i, i + CHUNK_SIZE);
            const names = chunk.map((r) => r.name);
            const chunkNumber = Math.floor(i / CHUNK_SIZE) + 1;
            const totalChunks = Math.ceil(rows.length / CHUNK_SIZE);

            // Translate all names to English upfront
            const englishNames = new Map<string, string>();
            for (const name of names) {
                const en = await this.translateToEnglish(name, userId);
                englishNames.set(name, en);
            }

            this.logger.log(`[enrichMissing] Searching web for chunk ${chunkNumber}/${totalChunks} (${chunk.length} items)...`);
            const searchResults = await this.searchChunk(names, englishNames, userId);

            this.logger.log(`[enrichMissing] Sending chunk ${chunkNumber}/${totalChunks} to LLM...`);
            try {
                const response = await this.llmClientService.generateResponse({
                    prompt: buildTerpeneEnrichUserPrompt(names, searchResults),
                    systemContext: TERPENE_ENRICH_SYSTEM_PROMPT,
                    ...this.enrichModel(userId),
                    maxTokens: 4096,
                });

                const parsed = parseLlmJson<{ terpenes?: unknown[] }>(response.content, 'terpene-enrich-missing');
                if (!parsed || !Array.isArray(parsed.terpenes)) {
                    this.logger.warn(`[enrichMissing] Failed to parse chunk ${chunkNumber}`);
                    errors += chunk.length;
                    continue;
                }

                for (const item of parsed.terpenes) {
                    const record = this.mapTerpeneRecord(item);
                    if (!record?.name) {
                        errors++;
                        continue;
                    }
                    const existing = await this.terpeneRepository.findOne({ where: { name: record.name } });
                    if (!existing) {
                        errors++;
                        continue;
                    }
                    const enName = englishNames.get(record.name) ?? null;
                    await this.terpeneRepository.update(existing.id, {
                        ...(enName && { englishName: enName }),
                        ...(record.description && { description: record.description }),
                        ...(record.scent && { scent: record.scent }),
                        ...(record.effects && { effects: record.effects }),
                        ...(record.color && { color: record.color }),
                        ...(record.colorDark && { colorDark: record.colorDark }),
                        ...(record.colorLight && { colorLight: record.colorLight }),
                    });
                    enriched++;
                }

                this.logger.log(`[enrichMissing] Chunk ${chunkNumber}/${totalChunks} done — ${enriched} enriched so far.`);
            } catch (error: unknown) {
                const msg = error instanceof Error ? error.message : 'Unknown error';
                this.logger.error(`[enrichMissing] Error processing chunk ${chunkNumber}: ${msg}`);
                errors += chunk.length;
            }
        }

        this.logger.log(`[enrichMissing] Finished: ${enriched} enriched, ${errors} errors out of ${rows.length} total.`);
        return { total: rows.length, enriched, errors };
    }

    private filterNames(names: string[]): string[] {
        const seen = new Set<string>();
        const result: string[] = [];

        for (const raw of names) {
            const name = raw?.trim();
            if (!name) {
                continue;
            }
            if (name === UNKNOWN_LABEL) {
                continue;
            }
            if (name.length < MIN_NAME_LENGTH) {
                continue;
            }
            if (!/[א-ת\w]/.test(name)) {
                continue;
            }
            if (seen.has(name)) {
                continue;
            }
            seen.add(name);
            result.push(name);
        }

        return result;
    }

    private async translateToEnglish(name: string, userId?: number): Promise<string> {
        if (!HEBREW_REGEX.test(name)) {
            return name;
        }
        try {
            const response = await this.llmClientService.generateResponse({
                prompt: `Return ONLY the English name for this Hebrew terpene name: "${name}". No explanation, just the English name.`,
                systemContext: 'You translate Hebrew terpene names to English. Return only the English name.',
                ...this.enrichModel(userId),
                maxTokens: 50,
            });
            const translated = response.content?.trim();
            if (translated && !HEBREW_REGEX.test(translated)) {
                // Terpenes have no hardcoded map — every LLM translation is recorded in the tracker so
                // that the nightly Telegram summary gradually builds the basis for a future
                // terpene map (which names even pass through the LLM).
                translationTracker.recordTerpeneTranslation(name, translated);
                this.logger.debug(`[translate] terpene "${name}" → LLM: "${translated}"`);
                return translated;
            }
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            this.logger.warn(`Translation failed for "${name}": ${msg}`);
        }
        return name;
    }

    /**
     * Translates a list of names to English once per chunk — so searchChunk does not
     * call the LLM again on names already translated in enrichMissing/enrichBatch.
     */
    private async resolveEnglishNames(names: string[], userId?: number): Promise<Map<string, string>> {
        const map = new Map<string, string>();
        for (const name of names) {
            map.set(name, await this.translateToEnglish(name, userId));
        }
        return map;
    }

    /**
     * Ranks search results by relevance: the terpene name (English/Hebrew) first, then
     * cannabis keywords — so noise does not dilute the context passed to the LLM.
     */
    private rankSearchResults(
        enName: string,
        name: string,
        results: { title: string; content: string }[],
    ): { title: string; content: string }[] {
        const nameTokens = [enName, name].filter(Boolean).map(t => t.toLowerCase());
        const cannabisKeywords = ['cannabis', 'terpene', 'scent', 'aroma', 'strain', 'weed', 'kush', 'flavor'];
        const relevance = (r: { title: string; content: string }): number => {
            const text = `${r.title} ${r.content}`.toLowerCase();
            if (nameTokens.some(tok => text.includes(tok))) return 2;
            if (cannabisKeywords.some(kw => text.includes(kw))) return 1;
            return 0;
        };
        return [...results].sort((a, b) => relevance(b) - relevance(a)).slice(0, 8);
    }

    private async searchChunk(names: string[], englishNames?: Map<string, string>, userId?: number): Promise<Map<string, string>> {
        const results = new Map<string, string>();
        for (const name of names) {
            try {
                const englishName = englishNames?.get(name) ?? await this.translateToEnglish(name, userId);
                const searchQuery = englishName !== name
                    ? `${englishName} (${name}) cannabis terpene scent effects`
                    : `${name} cannabis terpene scent effects`;
                const searchResult = await this.webSearchService.searchCannabis(searchQuery);
                if (searchResult.success && searchResult.result) {
                    const parts: string[] = [];
                    if (searchResult.result.answer) {
                        parts.push(`Answer: ${searchResult.result.answer}`);
                    }
                    for (const r of this.rankSearchResults(englishName, name, searchResult.result.results)) {
                        parts.push(`${r.title}: ${r.content}`);
                    }
                    if (parts.length > 0) {
                        results.set(name, parts.join('\n'));
                    }
                }
            } catch (error: unknown) {
                const msg = error instanceof Error ? error.message : 'Unknown error';
                this.logger.warn(`Web search failed for "${name}": ${msg}`);
            }
        }
        return results;
    }

    private mapTerpeneRecord(raw: unknown, englishName?: string | null): Partial<Terpene> | null {
        if (!raw || typeof raw !== 'object') {
            return null;
        }

        const item = raw as Record<string, unknown>;
        const name = typeof item.name === 'string' ? item.name.trim() : '';
        if (!name) {
            return null;
        }

        const color = typeof item.color === 'string' && HEX_COLOR_REGEX.test(item.color.trim())
            ? item.color.trim()
            : DEFAULT_COLOR;

        const { colorDark, colorLight } = deriveThemeColors(color);

        return {
            name,
            englishName: englishName ?? null,
            description: this.toNullableString(item.description),
            scent: this.toNullableString(item.scent),
            effects: this.parseEffects(item.effects),
            color,
            colorDark,
            colorLight,
        };
    }

    private parseEffects(value: unknown): string[] | null {
        if (typeof value !== 'string') {
            return null;
        }
        const effects = value
            .split(',')
            .map((entry) => {
                return entry.trim();
            })
            .filter((entry) => {
                return entry.length > 0;
            });
        return effects.length > 0 ? effects : null;
    }

    private toNullableString(value: unknown): string | null {
        if (typeof value !== 'string') {
            return null;
        }
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
    }

    async enrichSingle(name: string, userId?: number): Promise<{
        name: string;
        description: string | null;
        scent: string | null;
        effects: string[] | null;
        color: string;
        colorDark: string;
        colorLight: string;
    } | null> {
        const englishName = await this.translateToEnglish(name, userId);
        const searchQuery = englishName !== name
            ? `${englishName} (${name}) cannabis terpene scent effects description`
            : `${name} cannabis terpene scent effects description`;
        const searchResult = await this.webSearchService.searchCannabis(searchQuery);

        let searchContext = '';
        if (searchResult.success && searchResult.result) {
            const parts: string[] = [];
            if (searchResult.result.answer) {
                parts.push(`Answer: ${searchResult.result.answer}`);
            }
            for (const r of this.rankSearchResults(englishName, name, searchResult.result.results)) {
                parts.push(`${r.title}: ${r.content}`);
            }
            searchContext = parts.join('\n');
        }

        this.logger.debug(`[enrichSingle] Search context for "${name}":\n${searchContext || '(empty)'}`);

        const prompt = `Enrich cannabis terpene "${name}"${englishName !== name ? ` (English: ${englishName})` : ''}.
Web search results: ${searchContext || 'none'}

Use web search results as primary source. If insufficient, use your general knowledge about this terpene.
Return JSON only:
{"terpenes":[{"name":"${name}","description":"1-2 sentences in Hebrew","scent":"aroma in Hebrew","effects":"effect1,effect2","color":"#hex"}]}`;

        const response = await this.llmClientService.generateResponse({
            prompt,
            systemContext: TERPENE_ENRICH_SYSTEM_PROMPT,
            ...this.enrichModel(userId),
            maxTokens: 4096,
        });

        this.logger.debug(`[enrichSingle] Raw LLM response (${response.content?.length} chars): ${response.content?.slice(0, 200)}`);

        const parsed = parseLlmJson<{ terpenes?: Record<string, unknown>[] }>(response.content, 'terpene-enrich-single');
        if (!parsed?.terpenes?.[0]) return null;

        const item = parsed.terpenes[0];
        const color = typeof item.color === 'string' && HEX_COLOR_REGEX.test(item.color.trim())
            ? item.color.trim()
            : DEFAULT_COLOR;
        const { colorDark, colorLight } = deriveThemeColors(color);

        const existing = await this.terpeneRepository.findOne({ where: { name } });
        if (!existing) {
            this.logger.warn(`[enrichSingle] Record not found in DB: "${name}"`);
            return null;
        }

        Object.assign(existing, {
            englishName: englishName !== name ? englishName : existing.englishName,
            description: this.toNullableString(item.description) ?? existing.description,
            scent: this.toNullableString(item.scent) ?? existing.scent,
            effects: this.parseEffects(item.effects) ?? existing.effects,
            color,
            colorDark,
            colorLight,
        });

        // Preview only — no automatic save (the client decides to save via Update),
        // per the endpoint docs: "Does not persist — caller decides whether to save."
        return existing;
    }
}