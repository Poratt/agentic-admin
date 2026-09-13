import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { TerpeneService } from './terpene.service';
import { Terpene } from './entities/terpene.entity';
import { LlmClientService } from '../llm/services/llm-client.service';
import { WebSearchService } from '../web-search/web-search.service';
import { ConfigService } from '@nestjs/config';
import { translationTracker } from '../../core/services/translation-tracker';

function makeTerpene(overrides: Partial<Terpene> = {}): Terpene {
  return {
    id: 1,
    name: 'Myrcene',
    englishName: null,
    description: null,
    scent: null,
    effects: null,
    color: '#66BB6A',
    colorDark: '#66BB6A',
    colorLight: '#2E7D32',
    ...overrides,
  };
}

describe('TerpeneService', () => {
  let service: TerpeneService;
  let repo: jest.Mocked<Repository<Terpene>>;
  let llmClientService: jest.Mocked<LlmClientService>;
  let webSearchService: jest.Mocked<WebSearchService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    translationTracker.reset();

    repo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    } as any;

    llmClientService = {
      generateResponse: jest.fn(),
    } as any;

    webSearchService = {
      search: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TerpeneService,
        { provide: getRepositoryToken(Terpene), useValue: repo },
        { provide: LlmClientService, useValue: llmClientService },
        { provide: WebSearchService, useValue: webSearchService },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get(TerpeneService);
  });

  describe('CRUD', () => {
    describe('findAll', () => {
      it('returns all terpenes ordered by name', async () => {
        const terpenes = [makeTerpene({ name: 'A' }), makeTerpene({ name: 'B' })];
        repo.find.mockResolvedValue(terpenes);

        const result = await service.findAll();

        expect(repo.find).toHaveBeenCalledWith({ order: { name: 'ASC' } });
        expect(result).toEqual(terpenes);
      });
    });

    describe('findByName', () => {
      it('returns terpene when found', async () => {
        const terpene = makeTerpene();
        repo.findOne.mockResolvedValue(terpene);

        const result = await service.findByName('Myrcene');

        expect(repo.findOne).toHaveBeenCalledWith({ where: { name: 'Myrcene' } });
        expect(result).toEqual(terpene);
      });

      it('returns null when not found', async () => {
        repo.findOne.mockResolvedValue(null);

        const result = await service.findByName('Unknown');

        expect(result).toBeNull();
      });
    });

    describe('create', () => {
      it('creates new terpene successfully', async () => {
        const dto = { name: 'NewTerpene', color: '#FF5733', description: 'Test desc' };
        const created = makeTerpene({ name: 'NewTerpene', color: '#FF5733', description: 'Test desc' });

        repo.findOne.mockResolvedValue(null);
        repo.create.mockReturnValue(created);
        repo.save.mockResolvedValue(created);

        const result = await service.create(dto);

        expect(repo.findOne).toHaveBeenCalledWith({ where: { name: 'NewTerpene' } });
        expect(repo.create).toHaveBeenCalled();
        expect(repo.save).toHaveBeenCalledWith(created);
        expect(result).toEqual(created);
      });

      it('throws ConflictException on duplicate name', async () => {
        const existing = makeTerpene();
        repo.findOne.mockResolvedValue(existing);

        await expect(
          service.create({ name: 'Myrcene', color: '#FF5733' }),
        ).rejects.toBeInstanceOf(ConflictException);
      });
    });

    describe('update', () => {
      it('updates existing terpene', async () => {
        const existing = makeTerpene();
        const updated = makeTerpene({ description: 'Updated' });

        repo.findOne.mockResolvedValue(existing);
        repo.save.mockResolvedValue(updated);

        const result = await service.update('Myrcene', { description: 'Updated' });

        expect(repo.findOne).toHaveBeenCalledWith({ where: { name: 'Myrcene' } });
        expect(repo.save).toHaveBeenCalled();
        expect(result).toEqual(updated);
      });

      it('throws NotFoundException when not found', async () => {
        repo.findOne.mockResolvedValue(null);

        await expect(
          service.update('Unknown', { description: 'test' }),
        ).rejects.toBeInstanceOf(NotFoundException);
      });
    });

    describe('delete', () => {
      it('deletes terpene successfully', async () => {
        repo.delete.mockResolvedValue({ affected: 1 } as any);

        await service.delete('Myrcene');

        expect(repo.delete).toHaveBeenCalledWith({ name: 'Myrcene' });
      });

      it('throws NotFoundException when not found', async () => {
        repo.delete.mockResolvedValue({ affected: 0 } as any);

        await expect(service.delete('Unknown')).rejects.toBeInstanceOf(NotFoundException);
      });
    });
  });

  describe('enrichment', () => {
    describe('enrichBatch', () => {
      it('creates missing terpenes from list', async () => {
        // filterNames keeps names with length >= 2 that match /[\u05d0-\u05ea\w]/
        const names = ['TerpeneA', 'TerpeneB'];

        // find for existing check — none exist
        repo.find.mockResolvedValue([]);
        // translateToEnglish returns name as-is (no Hebrew)
        llmClientService.generateResponse.mockResolvedValue({
          content: JSON.stringify({
            terpenes: [
              { name: 'TerpeneA', description: 'desc A', scent: 'citrus', effects: 'calm', color: '#FF0000' },
              { name: 'TerpeneB', description: 'desc B', scent: 'pine', effects: 'focus', color: '#00FF00' },
            ],
          }),
        } as any);
        webSearchService.search.mockResolvedValue({
          success: true,
          result: { results: [], answer: undefined },
        } as any);
        // findOne for duplicate check inside the loop
        repo.findOne.mockResolvedValue(null);
        repo.create.mockImplementation((e) => e as any);
        repo.save.mockImplementation(async (e) => e as any);

        await service.enrichBatch(names);

        expect(repo.find).toHaveBeenCalled();
        expect(llmClientService.generateResponse).toHaveBeenCalled();
        expect(repo.save).toHaveBeenCalledTimes(2);
      });

      it('skips already existing names', async () => {
        const names = ['Myrcene', 'Limonene'];
        repo.find.mockResolvedValue([
          { name: 'Myrcene' },
          { name: 'Limonene' },
        ] as any);

        await service.enrichBatch(names);

        expect(llmClientService.generateResponse).not.toHaveBeenCalled();
      });
    });

    describe('enrichMissing', () => {
      it('enriches terpenes with null fields', async () => {
        const existingRows = [
          makeTerpene({ name: 'Myrcene', id: 1 }),
          makeTerpene({ name: 'Limonene', id: 2 }),
        ];
        repo.find.mockResolvedValue(existingRows);
        llmClientService.generateResponse.mockResolvedValue({
          content: JSON.stringify({
            terpenes: [
              { name: 'Myrcene', description: 'desc', scent: 'earthy', effects: 'relax', color: '#AA0000' },
            ],
          }),
        } as any);
        webSearchService.search.mockResolvedValue({
          success: true,
          result: { results: [], answer: undefined },
        } as any);
        // findOne inside enrichMissing for each item
        repo.findOne.mockResolvedValue(makeTerpene({ name: 'Myrcene', id: 1 }));
        repo.update.mockResolvedValue({ affected: 1 } as any);

        const result = await service.enrichMissing();

        expect(result.total).toBe(2);
        expect(repo.update).toHaveBeenCalled();
      });

      it('returns zero totals when no rows have missing data', async () => {
        repo.find.mockResolvedValue([]);

        const result = await service.enrichMissing();

        expect(result).toEqual({ total: 0, enriched: 0, errors: 0 });
        expect(llmClientService.generateResponse).not.toHaveBeenCalled();
      });
    });

    describe('enrichSingle', () => {
      it('enriches one terpene via LLM + web search and returns without persisting', async () => {
        const existing = makeTerpene({ name: 'Myrcene' });
        repo.findOne.mockResolvedValue(existing);
        repo.save.mockResolvedValue(existing);
        webSearchService.search.mockResolvedValue({
          success: true,
          result: {
            results: [{ title: 'Myrcene info', url: 'http://x', content: 'Myrcene is common' }],
            answer: 'Myrcene is the most common terpene',
          },
        } as any);
        llmClientService.generateResponse.mockResolvedValue({
          content: JSON.stringify({
            terpenes: [
              {
                name: 'Myrcene',
                description: 'Terpen nafutz bikanabis',
                scent: 'Adama, perot',
                effects: 'maragia, mazhir',
                color: '#66BB6A',
              },
            ],
          }),
        } as any);

        const result = await service.enrichSingle('Myrcene');

        expect(result).not.toBeNull();
        expect(llmClientService.generateResponse).toHaveBeenCalled();
        expect(webSearchService.search).toHaveBeenCalled();
        expect(repo.save).not.toHaveBeenCalled();
      });

      it('returns null for unknown name', async () => {
        // enrichSingle calls webSearch + LLM before the final findOne check
        webSearchService.search.mockResolvedValue({
          success: true,
          result: { results: [], answer: undefined },
        } as any);
        llmClientService.generateResponse.mockResolvedValue({
          content: JSON.stringify({
            terpenes: [{ name: 'Nonexistent', description: 'desc', scent: 'scent', effects: 'calm', color: '#FF0000' }],
          }),
        } as any);
        // Final findOne returns null — record not in DB
        repo.findOne.mockResolvedValue(null);

        const result = await service.enrichSingle('Nonexistent');

        expect(result).toBeNull();
      });
    });

    describe('translation tracker harvest (2026-08-20)', () => {
      it('records every LLM translation into the tracker (no map baseline exists for terpenes)', async () => {
        const existing = makeTerpene({ name: 'אובמה ראנטז' });
        repo.findOne.mockResolvedValue(existing);
        repo.save.mockResolvedValue(existing);
        webSearchService.search.mockResolvedValue({
          success: true,
          result: { results: [], answer: undefined },
        } as any);
        // Call 1: translation → 'Obama Runtz'; call 2: enrichment
        llmClientService.generateResponse
          .mockResolvedValueOnce({ content: 'Obama Runtz' } as any)
          .mockResolvedValueOnce({
            content: JSON.stringify({
              terpenes: [
                {
                  name: 'אובמה ראנטז',
                  description: 'desc',
                  scent: 'scent',
                  effects: 'calm',
                  color: '#FF0000',
                },
              ],
            }),
          } as any);

        const result = await service.enrichSingle('אובמה ראנטז');

        expect(result).not.toBeNull();
        expect(translationTracker.terpeneTranslationCount()).toBe(1);
        const record = translationTracker.recentTerpeneTranslations(1)[0];
        expect(record.hebrew).toBe('אובמה ראנטז');
        expect(record.english).toBe('Obama Runtz');
      });
    });

    describe('batch flow fixes (2026-08-18)', () => {
      it('ranks web results by relevance and reuses the pre-translated names', async () => {
        const existingRows = [makeTerpene({ name: 'אובמה ראנטז', id: 1 })];
        repo.find.mockResolvedValue(existingRows);
        webSearchService.search.mockResolvedValue({
          success: true,
          result: {
            results: [
              { title: 'Gmail login page', url: 'http://gmail', content: 'sign in to your inbox' },
              { title: 'Obama Runtz terpene profile', url: 'http://x', content: 'Obama Runtz terpene scent effects strain' },
              { title: 'Cannabis aroma guide', url: 'http://y', content: 'cannabis terpene scent aroma overview' },
            ],
            answer: undefined,
          },
        } as any);
        // Translation (once only) + enrichment
        llmClientService.generateResponse
          .mockResolvedValueOnce({ content: 'Obama Runtz' } as any)
          .mockResolvedValueOnce({
            content: JSON.stringify({
              terpenes: [{ name: 'אובמה ראנטז', description: 'desc', scent: 'scent', effects: 'calm', color: '#FF0000' }],
            }),
          } as any);
        repo.findOne.mockResolvedValue(makeTerpene({ name: 'אובמה ראנטז', id: 1 }));
        repo.update.mockResolvedValue({ affected: 1 } as any);

        const result = await service.enrichMissing();

        expect(result.total).toBe(1);
        // Before: upfront translation + again inside searchChunk + enrichment = 3. Now: 2.
        expect(llmClientService.generateResponse).toHaveBeenCalledTimes(2);
        const prompt = llmClientService.generateResponse.mock.calls[1][0].prompt;
        expect(prompt.indexOf('Obama Runtz terpene profile')).toBeGreaterThan(-1);
        expect(prompt.indexOf('Obama Runtz terpene profile')).toBeLessThan(prompt.indexOf('Gmail login page'));
        expect(webSearchService.search).toHaveBeenCalledWith(expect.stringContaining('Obama Runtz'), true);
      });
    });
  });
});
