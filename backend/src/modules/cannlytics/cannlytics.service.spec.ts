import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import { CannlyticsService, CannlyticsStrainData } from './cannlytics.service';

function strain(id: string, overrides: Partial<CannlyticsStrainData> = {}): CannlyticsStrainData {
    return { id, ...overrides };
}

describe('CannlyticsService', () => {
    let service: CannlyticsService;
    let httpService: jest.Mocked<HttpService>;

    /** First = cache load (limit=1000), all the rest = fetchByName → fails */
    function mockCache(ids: string[]) {
        httpService.get
            .mockReturnValueOnce(
                of({ data: { success: true, data: ids.map(id => strain(id, { total_thc: 20 })) } }) as any,
            )
            .mockReturnValue(of({ data: { success: false, data: {} } }) as any);
    }

    beforeEach(async () => {
        jest.clearAllMocks();

        httpService = { get: jest.fn() } as any;

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                CannlyticsService,
                { provide: HttpService, useValue: httpService },
            ],
        }).compile();

        service = module.get(CannlyticsService);
    });

    describe('findInCache (loose partial-match fix)', () => {
        it('returns an exact cache match for an English name', async () => {
            mockCache(['blue dream', 'gorilla glue']);

            const result = await service.getStrain('Blue Dream');

            expect(result?.id).toBe('blue dream');
        });

        it('does NOT return the strain literally named "33" for "33 splitter"', async () => {
            // The classic bug: normalizedName.includes(key) → "33 splitter".includes("33")
            // → the same lab data for two different strains
            mockCache(['33', '33 splitter', 'blue dream']);

            const result = await service.getStrain('33 splitter');

            expect(result?.id).toBe('33 splitter');
        });

        it('returns null for a 2-char query that would only match a longer name', async () => {
            // There is no strain named "33" — such a short query must not return "33 splitter"
            mockCache(['33 splitter', 'blue dream']);

            const result = await service.getStrain('33');

            expect(result).toBeNull();
        });

        it('rejects a multi-token query when one token has no match', async () => {
            mockCache(['33', 'blue dream']);

            const result = await service.getStrain('33 dream');

            expect(result).toBeNull();
        });

        it('maps a Hebrew name through getNameVariations to a cache hit', async () => {
            mockCache(['gorilla glue']);

            const result = await service.getStrain('גורילה גלו');

            expect(result?.id).toBe('gorilla glue');
        });
    });

    describe('getEnglishName map', () => {
        it('covers the new 2026-08-18 entries and fixes the Korean-garbage value', () => {
            expect(service.getEnglishName('אוראוז')).toBe('Oreoz');
            expect(service.getEnglishName('אוז קוש')).toBe('Oz Kush');
            expect(service.getEnglishName('אובמה ראנטז')).toBe('Obama Runtz');
            expect(service.getEnglishName('33 ספליטר')).toBe('33 Splitter');
            expect(service.getEnglishName('אזול ראנטז')).toBe('Azul Runtz');
            expect(service.getEnglishName('אטום ספליטר')).toBe('Atom Splitter');
            expect(service.getEnglishName('אורנג\' ולווט')).toBe('Orange Velvet');
            expect(service.getEnglishName('בלוברי')).toBe('Blueberry');
            expect(service.getEnglishName('מקפלרי')).toBe('Mac Flurry');
            expect(service.getEnglishName('אנאלאי')).toBe('Amnesia Haze');
        });

        it('returns Cannlytics data for אוראוז via the Oreoz variation', async () => {
            mockCache(['oreoz']);

            const result = await service.getStrain('אוראוז');

            expect(result?.id).toBe('oreoz');
        });
    });
});
