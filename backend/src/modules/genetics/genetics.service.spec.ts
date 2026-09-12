import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Repository } from 'typeorm';
import { of } from 'rxjs';
import { GeneticsService } from './genetics.service';
import { Genetics } from './entities/genetics.entity';
import { LlmClientService } from '../llm/services/llm-client.service';
import { WebSearchService } from '../web-search/web-search.service';
import { CannlyticsService } from '../cannlytics/cannlytics.service';
import { translationTracker } from '../../core/services/translation-tracker';

function makeGenetics(overrides: Partial<Genetics> = {}): Genetics {
  return {
    id: 1,
    name: 'Gorilla Glue',
    description: null,
    parent1: null,
    parent2: null,
    origin: null,
    type: null,
    thcRange: null,
    terpenes: null,
    effects: null,
    color: '#228B22',
    colorDark: '#228B22',
    colorLight: '#1B5E20',
    ...overrides,
  };
}

describe('GeneticsService', () => {
  let service: GeneticsService;
  let repo: jest.Mocked<Repository<Genetics>>;
  let llmClientService: jest.Mocked<LlmClientService>;
  let webSearchService: jest.Mocked<WebSearchService>;
  let cannlyticsService: jest.Mocked<CannlyticsService>;
  let httpService: jest.Mocked<HttpService>;

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

    cannlyticsService = {
      getEnglishName: jest.fn(),
      getStrain: jest.fn(),
      formatForEnrichment: jest.fn(),
    } as any;

    httpService = {
      get: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeneticsService,
        { provide: getRepositoryToken(Genetics), useValue: repo },
        { provide: LlmClientService, useValue: llmClientService },
        { provide: WebSearchService, useValue: webSearchService },
        { provide: CannlyticsService, useValue: cannlyticsService },
        { provide: HttpService, useValue: httpService },
      ],
    }).compile();

    service = module.get(GeneticsService);
  });

  describe('CRUD', () => {
    describe('findAll', () => {
      it('returns all genetics ordered by name', async () => {
        const items = [makeGenetics({ name: 'A' }), makeGenetics({ name: 'B' })];
        repo.find.mockResolvedValue(items);

        const result = await service.findAll();

        expect(repo.find).toHaveBeenCalledWith({ order: { name: 'ASC' } });
        expect(result).toEqual(items);
      });
    });

    describe('findByName', () => {
      it('returns genetics when found', async () => {
        const item = makeGenetics();
        repo.findOne.mockResolvedValue(item);

        const result = await service.findByName('Gorilla Glue');

        expect(repo.findOne).toHaveBeenCalledWith({ where: { name: 'Gorilla Glue' } });
        expect(result).toEqual(item);
      });

      it('returns null when not found', async () => {
        repo.findOne.mockResolvedValue(null);

        const result = await service.findByName('Unknown');

        expect(result).toBeNull();
      });
    });

    describe('create', () => {
      it('creates new genetics successfully', async () => {
        const dto = { name: 'NewStrain', color: '#FF5733', description: 'Test' };
        const created = makeGenetics({ name: 'NewStrain', color: '#FF5733', description: 'Test' });

        repo.findOne.mockResolvedValue(null);
        repo.create.mockReturnValue(created);
        repo.save.mockResolvedValue(created);

        const result = await service.create(dto);

        expect(repo.findOne).toHaveBeenCalledWith({ where: { name: 'NewStrain' } });
        expect(repo.create).toHaveBeenCalled();
        expect(repo.save).toHaveBeenCalledWith(created);
        expect(result).toEqual(created);
      });

      it('throws ConflictException on duplicate name', async () => {
        const existing = makeGenetics();
        repo.findOne.mockResolvedValue(existing);

        await expect(
          service.create({ name: 'Gorilla Glue', color: '#FF5733' }),
        ).rejects.toBeInstanceOf(ConflictException);
      });
    });

    describe('update', () => {
      it('updates existing genetics', async () => {
        const existing = makeGenetics();
        const updated = makeGenetics({ description: 'Updated' });

        repo.findOne.mockResolvedValue(existing);
        repo.save.mockResolvedValue(updated);

        const result = await service.update('Gorilla Glue', { description: 'Updated' });

        expect(repo.findOne).toHaveBeenCalledWith({ where: { name: 'Gorilla Glue' } });
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
      it('deletes genetics successfully', async () => {
        repo.delete.mockResolvedValue({ affected: 1 } as any);

        await service.delete('Gorilla Glue');

        expect(repo.delete).toHaveBeenCalledWith({ name: 'Gorilla Glue' });
      });

      it('throws NotFoundException when not found', async () => {
        repo.delete.mockResolvedValue({ affected: 0 } as any);

        await expect(service.delete('Unknown')).rejects.toBeInstanceOf(NotFoundException);
      });
    });
  });

  describe('enrichment', () => {
    describe('enrichBatch', () => {
      it('creates missing genetics from list', async () => {
        const names = ['StrainA', 'StrainB'];

        // Existing check
        repo.find.mockResolvedValue([]);
        // searchChunk: webSearchService.search
        webSearchService.search.mockResolvedValue({
          success: true,
          result: { results: [], answer: undefined },
        } as any);
        cannlyticsService.getEnglishName.mockReturnValue(null);
        // fetchDemarilyChunk: httpService.get
        httpService.get.mockReturnValue(of({ data: { data: [] } }) as any);
        // LLM response
        llmClientService.generateResponse.mockResolvedValue({
          content: JSON.stringify({
            genetics: [
              { name: 'StrainA', description: 'desc A', type: 'hybrid', color: '#FF0000', parent1: 'P1', parent2: 'P2', origin: 'USA', thcRange: '18-22%', terpenes: 'Myrcene', effects: 'calm' },
              { name: 'StrainB', description: 'desc B', type: 'sativa', color: '#00FF00', parent1: null, parent2: null, origin: null, thcRange: null, terpenes: null, effects: null },
            ],
          }),
        } as any);
        // Duplicate check inside loop
        repo.findOne.mockResolvedValue(null);
        repo.create.mockImplementation((e) => e as any);
        repo.save.mockImplementation(async (e) => e as any);

        await service.enrichBatch(names);

        expect(repo.find).toHaveBeenCalled();
        expect(llmClientService.generateResponse).toHaveBeenCalled();
        expect(repo.save).toHaveBeenCalledTimes(2);
      });

      it('skips already existing names', async () => {
        const names = ['StrainA', 'StrainB'];
        repo.find.mockResolvedValue([
          { name: 'StrainA' },
          { name: 'StrainB' },
        ] as any);

        await service.enrichBatch(names);

        expect(llmClientService.generateResponse).not.toHaveBeenCalled();
      });
    });

    describe('enrichMissing', () => {
      it('enriches genetics with null fields', async () => {
        const existingRows = [
          makeGenetics({ name: 'StrainA', id: 1 }),
        ];
        repo.find.mockResolvedValue(existingRows);

        // Cannlytics
        cannlyticsService.getEnglishName.mockReturnValue('StrainA');
        cannlyticsService.getStrain.mockResolvedValue({ name: 'StrainA', thc: 20 } as any);
        cannlyticsService.formatForEnrichment.mockReturnValue('THC: 20%');

        // Demarily
        httpService.get.mockReturnValue(of({ data: { data: [] } }) as any);

        // Web search
        webSearchService.search.mockResolvedValue({
          success: true,
          result: { results: [], answer: undefined },
        } as any);

        // LLM
        llmClientService.generateResponse.mockResolvedValue({
          content: JSON.stringify({
            genetics: [
              { name: 'StrainA', description: 'desc', type: 'indica', color: '#AA0000', thcRange: '18-22%', terpenes: 'Myrcene', effects: 'relax', parent1: 'P1', parent2: 'P2', origin: 'Israel' },
            ],
          }),
        } as any);

        // findOne inside enrichMissing
        repo.findOne.mockResolvedValue(makeGenetics({ name: 'StrainA', id: 1 }));
        repo.update.mockResolvedValue({ affected: 1 } as any);

        const result = await service.enrichMissing();

        expect(result.total).toBe(1);
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
      it('enriches one genetics via LLM + web + Cannlytics and returns without persisting', async () => {
        const existing = makeGenetics({ name: 'Gorilla Glue' });
        repo.findOne.mockResolvedValue(existing);
        repo.save.mockResolvedValue(existing);

        // Cannlytics
        cannlyticsService.getEnglishName.mockReturnValue('Gorilla Glue');
        cannlyticsService.getStrain.mockResolvedValue({ name: 'Gorilla Glue', thc: 25 } as any);
        cannlyticsService.formatForEnrichment.mockReturnValue('THC: 25%');

        // Demarily
        httpService.get.mockReturnValue(of({ data: { data: [] } }) as any);

        // Web search
        webSearchService.search.mockResolvedValue({
          success: true,
          result: {
            results: [{ title: 'GG info', url: 'http://x', content: 'Gorilla Glue is strong' }],
            answer: 'GG is a hybrid',
          },
        } as any);

        // LLM
        llmClientService.generateResponse.mockResolvedValue({
          content: JSON.stringify({
            genetics: [
              {
                name: 'Gorilla Glue',
                description: 'Zan chazak meyucher',
                parent1: 'Chem Sis',
                parent2: 'Sour Dubb',
                origin: 'USA',
                type: 'hybrid',
                thcRange: '25-30%',
                terpenes: 'Caryophyllene, Limonene',
                effects: 'maragia, mazhir',
                color: '#228B22',
              },
            ],
          }),
        } as any);

        const result = await service.enrichSingle('Gorilla Glue');

        expect(result).not.toBeNull();
        expect(llmClientService.generateResponse).toHaveBeenCalled();
        expect(webSearchService.search).toHaveBeenCalled();
        expect(cannlyticsService.getStrain).toHaveBeenCalled();
        expect(repo.save).not.toHaveBeenCalled();
      });

      it('translates Hebrew names via LLM when missing from the hardcoded map', async () => {
        const existing = makeGenetics({ name: 'אובמה ראנטז' });
        repo.findOne.mockResolvedValue(existing);
        repo.save.mockResolvedValue(existing);

        // Not in the hardcoded map — fallback to LLM translation
        cannlyticsService.getEnglishName.mockReturnValue(null);
        cannlyticsService.getStrain.mockResolvedValue(null);
        httpService.get.mockReturnValue(of({ data: { data: [] } }) as any);
        webSearchService.search.mockResolvedValue({
          success: true,
          result: { results: [], answer: undefined },
        } as any);

        // Call 1: translation → 'Obama Runtz'; call 2: enrichment
        llmClientService.generateResponse
          .mockResolvedValueOnce({ content: 'Obama Runtz' } as any)
          .mockResolvedValueOnce({
            content: JSON.stringify({
              genetics: [
                {
                  name: 'אובמה ראנטז',
                  description: 'desc',
                  parent1: 'x',
                  parent2: 'y',
                  origin: 'USA',
                  type: 'היברידי',
                  color: '#FF0000',
                },
              ],
            }),
          } as any);

        const result = await service.enrichSingle('אובמה ראנטז');

        expect(result).not.toBeNull();
        expect(llmClientService.generateResponse).toHaveBeenCalledTimes(2);
        expect(cannlyticsService.getStrain).toHaveBeenCalledWith('Obama Runtz');
        expect(repo.save).not.toHaveBeenCalled();
      });

      it('returns null for unknown name', async () => {
        // enrichSingle calls cannlytics + demarily + webSearch + LLM before the final findOne check
        cannlyticsService.getEnglishName.mockReturnValue(null);
        cannlyticsService.getStrain.mockResolvedValue(null);
        httpService.get.mockReturnValue(of({ data: { data: [] } }) as any);
        webSearchService.search.mockResolvedValue({
          success: true,
          result: { results: [], answer: undefined },
        } as any);
        llmClientService.generateResponse.mockResolvedValue({
          content: JSON.stringify({
            genetics: [{ name: 'Nonexistent', description: 'desc', color: '#FF0000' }],
          }),
        } as any);
        // Final findOne returns null — record not in DB
        repo.findOne.mockResolvedValue(null);

        const result = await service.enrichSingle('Nonexistent');

        expect(result).toBeNull();
      });
    });

    describe('translation tracker harvest (2026-08-20)', () => {
      it('records a map miss into the tracker when the LLM translates a Hebrew name', async () => {
        const existing = makeGenetics({ name: 'אובמה ראנטז' });
        repo.findOne.mockResolvedValue(existing);
        repo.save.mockResolvedValue(existing);

        cannlyticsService.getEnglishName.mockReturnValue(null); // map miss → LLM translation
        cannlyticsService.getStrain.mockResolvedValue(null);
        httpService.get.mockReturnValue(of({ data: { data: [] } }) as any);
        webSearchService.search.mockResolvedValue({
          success: true,
          result: { results: [], answer: undefined },
        } as any);
        // Call 1: translation → 'Obama Runtz'; call 2: enrichment
        llmClientService.generateResponse
          .mockResolvedValueOnce({ content: 'Obama Runtz' } as any)
          .mockResolvedValueOnce({
            content: JSON.stringify({
              genetics: [
                {
                  name: 'אובמה ראנטז',
                  description: 'desc',
                  parent1: 'x',
                  parent2: 'y',
                  origin: 'USA',
                  type: 'היברידי',
                  color: '#FF0000',
                },
              ],
            }),
          } as any);

        const result = await service.enrichSingle('אובמה ראנטז');

        expect(result).not.toBeNull();
        expect(translationTracker.geneticsMissCount()).toBe(1);
        const record = translationTracker.recentGeneticsMisses(1)[0];
        expect(record.hebrew).toBe('אובמה ראנטז');
        expect(record.english).toBe('Obama Runtz');
      });

      it('does NOT record when the hardcoded map covers the name', async () => {
        const existing = makeGenetics({ name: 'Gorilla Glue' });
        repo.findOne.mockResolvedValue(existing);
        repo.save.mockResolvedValue(existing);

        cannlyticsService.getEnglishName.mockReturnValue('Gorilla Glue'); // map hit — free, no LLM
        cannlyticsService.getStrain.mockResolvedValue(null);
        httpService.get.mockReturnValue(of({ data: { data: [] } }) as any);
        webSearchService.search.mockResolvedValue({
          success: true,
          result: { results: [], answer: undefined },
        } as any);
        llmClientService.generateResponse.mockResolvedValue({
          content: JSON.stringify({
            genetics: [
              {
                name: 'Gorilla Glue',
                description: 'desc',
                type: 'היברידי',
                color: '#FF0000',
              },
            ],
          }),
        } as any);

        await service.enrichSingle('Gorilla Glue');

        expect(translationTracker.geneticsMissCount()).toBe(0);
      });
    });

    describe('batch flow fixes (2026-08-18)', () => {
      it('ranks web results by relevance before passing them to the LLM', async () => {
        const existingRows = [makeGenetics({ name: 'Gorilla Glue', id: 1 })];
        repo.find.mockResolvedValue(existingRows);
        cannlyticsService.getEnglishName.mockReturnValue('Gorilla Glue');
        cannlyticsService.getStrain.mockResolvedValue(null);
        httpService.get.mockReturnValue(of({ data: { data: [] } }) as any);
        webSearchService.search.mockResolvedValue({
          success: true,
          result: {
            results: [
              { title: 'Gmail login page', url: 'http://gmail', content: 'sign in to your inbox' },
              { title: 'Gorilla Glue strain guide', url: 'http://x', content: 'Gorilla Glue genetics parents lineage THC' },
              { title: 'Cannabis strains overview', url: 'http://y', content: 'a cannabis strain guide for growers' },
            ],
            answer: undefined,
          },
        } as any);
        llmClientService.generateResponse.mockResolvedValue({
          content: JSON.stringify({
            genetics: [{ name: 'Gorilla Glue', description: 'desc', type: 'hybrid', color: '#FF0000', parent1: 'P1', parent2: 'P2', origin: 'USA', thcRange: '18-22%', terpenes: 'Myrcene', effects: 'calm' }],
          }),
        } as any);
        repo.findOne.mockResolvedValue(makeGenetics({ name: 'Gorilla Glue', id: 1 }));
        repo.update.mockResolvedValue({ affected: 1 } as any);

        await service.enrichMissing();

        const prompt = llmClientService.generateResponse.mock.calls[0][0].prompt;
        expect(prompt.indexOf('Gorilla Glue strain guide')).toBeGreaterThan(-1);
        expect(prompt.indexOf('Gorilla Glue strain guide')).toBeLessThan(prompt.indexOf('Gmail login page'));
        expect(webSearchService.search).toHaveBeenCalledWith(expect.stringContaining('Gorilla Glue'), true);
      });

      it('translates Hebrew names once via LLM when the map misses', async () => {
        const existingRows = [makeGenetics({ name: 'אובמה ראנטז', id: 1 })];
        repo.find.mockResolvedValue(existingRows);
        cannlyticsService.getEnglishName.mockReturnValue(null); // map miss → LLM translation
        cannlyticsService.getStrain.mockResolvedValue(null);
        httpService.get.mockReturnValue(of({ data: { data: [] } }) as any);
        webSearchService.search.mockResolvedValue({
          success: true,
          result: { results: [], answer: undefined },
        } as any);
        // Translation (exactly once) + enrichment
        llmClientService.generateResponse
          .mockResolvedValueOnce({ content: 'Obama Runtz' } as any)
          .mockResolvedValueOnce({
            content: JSON.stringify({
              genetics: [{ name: 'אובמה ראנטז', description: 'desc', type: 'hybrid', color: '#FF0000' }],
            }),
          } as any);
        repo.findOne.mockResolvedValue(makeGenetics({ name: 'אובמה ראנטז', id: 1 }));
        repo.update.mockResolvedValue({ affected: 1 } as any);

        const result = await service.enrichMissing();

        expect(result.total).toBe(1);
        // Translation + enrichment = 2 — not a separate translation per chunk-method (searchChunk/Cannlytics/Demarily)
        expect(llmClientService.generateResponse).toHaveBeenCalledTimes(2);
        expect(cannlyticsService.getStrain).toHaveBeenCalledWith('Obama Runtz');
        expect(webSearchService.search).toHaveBeenCalledWith(expect.stringContaining('Obama Runtz'), true);
      });
    });
  });
});
