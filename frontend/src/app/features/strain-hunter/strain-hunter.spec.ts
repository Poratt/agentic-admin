import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { By } from '@angular/platform-browser';
import { Table } from 'primeng/table';
import { StrainHunter } from './strain-hunter';
import { MatchingEngineStore } from '../../core/store/matching-engine.store';
import { TerpeneStore } from '../../core/store/terpene.store';
import { GeneticsStore } from '../../core/store/genetics.store';
import { AuthStore } from '../../core/store/auth.store';
import { UserRole } from '../../core/enums/user-role.enum';

describe('StrainHunter', () => {
    let component: StrainHunter;
    let fixture: ComponentFixture<StrainHunter>;

    const mockAuthStore = {
        user: vi.fn(() => null),
        userRole: vi.fn(() => UserRole.User),
    };

    const mockMatchingEngine = {
        calculateScore: vi.fn((item: any) => ({
            ...item,
            score: 50,
            penalty: false,
            penaltyIngredient: null,
            breakdown: {},
        })),
        hasAnyPreference: vi.fn(() => false),
        prefState: vi.fn(() => 'neutral' as const),
        weights: vi.fn(() => ({ terpene: 60, genetics: 40 })),
        prefs: vi.fn(() => ({})),
        topScored: vi.fn((items: any[], limit = 5) =>
            items
                .slice(0, limit)
                .map((item) => ({ ...item, score: 50, penalty: false, penaltyIngredient: null, breakdown: {} })),
        ),
        cyclePref: vi.fn(),
        setWeight: vi.fn(),
        setPref: vi.fn(),
        reset: vi.fn(),
    };

    const mockTerpeneStore = {
        terpenes: vi.fn(() => []),
    };

    const mockGeneticsStore = {
        genetics: vi.fn(() => []),
    };

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [StrainHunter],
            providers: [
                provideZonelessChangeDetection(),
                provideHttpClient(),
                { provide: AuthStore, useValue: mockAuthStore },
                { provide: MatchingEngineStore, useValue: mockMatchingEngine },
                { provide: TerpeneStore, useValue: mockTerpeneStore },
                { provide: GeneticsStore, useValue: mockGeneticsStore },
            ],
        }).compileComponents();

        fixture = TestBed.createComponent(StrainHunter);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    describe('scroll-to-top', () => {
        it('button is hidden until the page scrolls down', () => {
            component.showScrollTop.set(false);
            fixture.detectChanges();
            expect(fixture.nativeElement.querySelector('.scroll-top-btn')).toBeNull();

            component.showScrollTop.set(true);
            fixture.detectChanges();
            const btn = fixture.nativeElement.querySelector('.scroll-top-btn');
            expect(btn).not.toBeNull();
            expect(btn.getAttribute('aria-label')).toBe('חזרה לראש העמוד');
        });
    });

    describe('comparison', () => {
        it('adds and removes strains by id', () => {
            const first = { id: 1, name: 'אחד' };
            const second = { id: 2, name: 'שתיים' };

            component.toggleCompare(first);
            component.toggleCompare(second);
            expect(component.compareIds()).toEqual([1, 2]);
            expect(component.isInCompare(1)).toBe(true);

            component.toggleCompare(first);
            expect(component.compareIds()).toEqual([2]);
            expect(component.isInCompare(1)).toBe(false);
        });

        it('resolves selected strains from rawItems in selection order', () => {
            component.rawItems.set([
                { id: 1, name: 'אחד' },
                { id: 2, name: 'שתיים' },
            ] as any);
            component.toggleCompare({ id: 2 });
            component.toggleCompare({ id: 1 });

            expect(component.compareItems().map((item) => item['id'])).toEqual([2, 1]);
        });

        it('keeps compared strains when active filters change', () => {
            component.rawItems.set([{ id: 1, name: 'אחד', price: 100 }] as any);
            component.toggleCompare({ id: 1 });
            component.activeFilters.set([{ key: 'brand', fields: ['brand'], label: 'X', value: 'X', name: 'מותג' }]);

            expect(component.items()).toEqual([]);
            expect(component.compareItems().map((item) => item['id'])).toEqual([1]);
        });

        it('mirrors main columns (1:1 with columns(), embedded fields excluded)', () => {
            component.rawItems.set([{ id: 1, name: 'אחד', price: 100, enName: 'One', thc: '20%' }] as any);
            component.toggleCompare({ id: 1 });

            // enName/thc are embedded (rendered inside the name cell) and not
            // promoted to standalone columns. matchScore is always in
            // preferredColumns so the literal `key === 'matchScore'` check in
            // columns() retains it regardless of hasAnyPreference().
            expect(component.comparisonColumns()).toEqual(['name', 'matchScore', 'price']);
        });

        it('sorts comparison rows ascending, descending, then restores selection order', () => {
            component.rawItems.set([
                { id: 1, name: 'אחד', price: 100 },
                { id: 2, name: 'שתיים', price: 50 },
            ] as any);
            component.toggleCompare({ id: 1 });
            component.toggleCompare({ id: 2 });

            // Selection order before any sort.
            const base = component.compareItems();
            expect(base.map((item) => item['id'])).toEqual([1, 2]);

            const asc: any = { field: 'price', order: 1, data: [...base] };
            component.sortCompareTable(asc);
            expect(asc.data.map((item: any) => item.id)).toEqual([2, 1]);

            const desc: any = { field: 'price', order: -1, data: [...asc.data] };
            component.sortCompareTable(desc);
            expect(desc.data.map((item: any) => item.id)).toEqual([1, 2]);

            // Third click — reset restores selection order.
            const reset: any = { field: 'price', order: 1, data: [...desc.data] };
            component.sortCompareTable(reset);
            expect(reset.data.map((item: any) => item.id)).toEqual([1, 2]);
        });

        it('opens and clears comparison dialog', () => {
            component.toggleCompare({ id: 1 });
            component.openCompareDialog();
            expect(component.compareDialogVisible()).toBe(true);

            component.clearComparison();
            expect(component.compareIds()).toEqual([]);
            expect(component.compareDialogVisible()).toBe(false);
        });
    });

    it('sorts expiry MM/YY chronologically, not as strings', () => {
        const event: any = {
            field: 'expiry',
            order: 1,
            data: [
                { id: 1, expiry: '01/28' },
                { id: 2, expiry: '02/27' },
                { id: 3, expiry: '01/27' },
            ],
        };
        component.sortTable(event);
        expect(event.data.map((row: any) => row.expiry)).toEqual(['01/27', '02/27', '01/28']);
    });

    it('sorts using multiSortMeta across multiple fields by priority', () => {
        const event: any = {
            multiSortMeta: [
                { field: 'price', order: 1 },
                { field: 'expiry', order: 1 },
            ],
            data: [
                { id: 1, price: 100, expiry: '02/27' },
                { id: 2, price: 100, expiry: '01/27' },
                { id: 3, price: 50, expiry: '01/28' },
            ],
        };
        component.sortTable(event);
        expect(event.data.map((row: any) => row.id)).toEqual([3, 2, 1]);
    });

    it('restores original order when sorting is removed', () => {
        component.rawItems.set([{ id: 1 }, { id: 2 }, { id: 3 }] as any);

        const event: any = {
            multiSortMeta: [],
            data: [{ id: 3 }, { id: 1 }, { id: 2 }],
        };

        component.sortTable(event);
        expect(event.data.map((row: any) => row.id)).toEqual([1, 2, 3]);
        expect(component.activeSortField()).toBeNull();
    });

    it('cycles single-column sort asc → desc → reset on the third click', () => {
        component.rawItems.set([
            { id: 1, price: 100 },
            { id: 2, price: 50 },
            { id: 3, price: 75 },
        ] as any);

        const data = [
            { id: 1, price: 100 },
            { id: 2, price: 50 },
            { id: 3, price: 75 },
        ];
        const asc: any = { multiSortMeta: [{ field: 'price', order: 1 }], data: [...data] };
        component.sortTable(asc);
        expect(asc.data.map((row: any) => row.id)).toEqual([2, 3, 1]);

        const desc: any = { multiSortMeta: [{ field: 'price', order: -1 }], data: [...asc.data] };
        component.sortTable(desc);
        expect(desc.data.map((row: any) => row.id)).toEqual([1, 3, 2]);

        const reset: any = { multiSortMeta: [{ field: 'price', order: 1 }], data: [...desc.data] };
        component.sortTable(reset);
        expect(reset.data.map((row: any) => row.id)).toEqual([1, 2, 3]);
        expect(component.activeSortField()).toBeNull();
    });

    it('getSortOrderIndex returns ordinals including the first column', () => {
        component.rawItems.set([{ id: 1, name: 'x' }] as any);
        (component as any).loading.set(false);
        (component as any).error.set(null);
        fixture.detectChanges();

        const table = fixture.debugElement.query(By.directive(Table))?.componentInstance as any;
        expect(table).toBeTruthy();
        table.multiSortMeta = [
            { field: 'price', order: 1 },
            { field: 'expiry', order: -1 },
        ];
        expect(component.getSortOrderIndex('price')).toBe(1);
        expect(component.getSortOrderIndex('expiry')).toBe(2);
        expect(component.getSortOrderIndex('name')).toBeNull();
    });

    describe('ringDashOffset', () => {
        it('should return full circumference when score is 0', () => {
            const offset = component.ringDashOffset(0);
            expect(offset).toBeCloseTo(component.ringCircumference, 5);
        });

        it('should return 0 when score is 100', () => {
            expect(component.ringDashOffset(100)).toBe(0);
        });

        it('should return half circumference when score is 50', () => {
            const offset = component.ringDashOffset(50);
            expect(offset).toBeCloseTo(component.ringCircumference / 2, 5);
        });

        it('should clamp score below 0 to 0', () => {
            expect(component.ringDashOffset(-10)).toBeCloseTo(component.ringCircumference, 5);
        });

        it('should clamp score above 100 to 100', () => {
            expect(component.ringDashOffset(150)).toBe(0);
        });
    });

    describe('ringColorClass', () => {
        it('should return ring-success for score >= 75', () => {
            expect(component.ringColorClass(75)).toBe('ring-success');
            expect(component.ringColorClass(100)).toBe('ring-success');
        });

        it('should return ring-primary for score >= 50', () => {
            expect(component.ringColorClass(50)).toBe('ring-primary');
            expect(component.ringColorClass(74)).toBe('ring-primary');
        });

        it('should return ring-warning for score >= 25', () => {
            expect(component.ringColorClass(25)).toBe('ring-warning');
            expect(component.ringColorClass(49)).toBe('ring-warning');
        });

        it('should return ring-danger for score < 25', () => {
            expect(component.ringColorClass(0)).toBe('ring-danger');
            expect(component.ringColorClass(24)).toBe('ring-danger');
        });
    });

    describe('formatValue', () => {
        it('should return empty string for null/undefined/empty', () => {
            expect(component.formatValue(null)).toBe('');
            expect(component.formatValue(undefined)).toBe('');
            expect(component.formatValue('')).toBe('');
        });

        it('should format boolean true as Hebrew', () => {
            expect(component.formatValue(true)).toBe('כן');
        });

        it('should format boolean false as Hebrew', () => {
            expect(component.formatValue(false)).toBe('לא');
        });

        it('should format Date to locale string', () => {
            const date = new Date('2026-01-15T10:00:00Z');
            const result = component.formatValue(date);
            expect(result).toContain('2026');
        });

        it('should JSON.stringify objects', () => {
            const obj = { a: 1 };
            expect(component.formatValue(obj)).toBe('{"a":1}');
        });

        it('should convert numbers to string', () => {
            expect(component.formatValue(42)).toBe('42');
        });

        it('should convert strings to string', () => {
            expect(component.formatValue('hello')).toBe('hello');
        });
    });

    describe('relativeTime', () => {
        it('should return empty string for null', () => {
            expect(component.relativeTime(null)).toBe('');
        });

        it('should return minutes for recent dates', () => {
            const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
            expect(component.relativeTime(fiveMinAgo)).toContain('5 דקות');
        });

        it('should return hours for dates within 24h', () => {
            const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
            expect(component.relativeTime(threeHoursAgo)).toBe('3 שעות');
        });

        it('should return singular hour', () => {
            const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);
            expect(component.relativeTime(oneHourAgo)).toBe('שעה');
        });

        it('should return "אתמול" for 1 day ago', () => {
            const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
            expect(component.relativeTime(oneDayAgo)).toBe('אתמול');
        });

        it('should return "שלשום" for 2 days ago', () => {
            const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
            expect(component.relativeTime(twoDaysAgo)).toBe('שלשום');
        });

        it('should return days for 3-5 days', () => {
            const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
            expect(component.relativeTime(fourDaysAgo)).toBe('4 ימים');
        });

        it('should return formatted date for 6+ days', () => {
            const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
            const result = component.relativeTime(tenDaysAgo);
            expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/);
        });
    });

    describe('hasDisplayValue', () => {
        it('should return false for empty/null/undefined', () => {
            expect(component.hasDisplayValue(null)).toBe(false);
            expect(component.hasDisplayValue(undefined)).toBe(false);
            expect(component.hasDisplayValue('')).toBe(false);
        });

        it('should return true for non-empty values', () => {
            expect(component.hasDisplayValue('hello')).toBe(true);
            expect(component.hasDisplayValue(42)).toBe(true);
            expect(component.hasDisplayValue(true)).toBe(true);
        });
    });

    describe('packageTypeIconClass', () => {
        it('should return jar icon for jar types', () => {
            expect(component.packageTypeIconClass('צנצנת')).toBe('ph-jar-label');
        });

        it('should return bag icon for bag types', () => {
            expect(component.packageTypeIconClass('שקית')).toBe('ph-bag-simple');
        });

        it('should return question mark for unknown types', () => {
            expect(component.packageTypeIconClass('box')).toBe('ph-question-mark');
        });
    });

    describe('growTypeIconClass', () => {
        it('should return house icon for indoor', () => {
            expect(component.growTypeIconClass('אינדור')).toBe('ph-house');
        });

        it('should return sun icon for greenhouse', () => {
            expect(component.growTypeIconClass('חממה')).toBe('ph-sun');
        });

        it('should return tree icon for combined', () => {
            expect(component.growTypeIconClass('משולב')).toBe('ph-tree');
        });

        it('should return question mark for unknown', () => {
            expect(component.growTypeIconClass('outdoor')).toBe('ph-question-mark');
        });
    });

    describe('splitTerpenes', () => {
        it('should return empty for empty/unknown', () => {
            expect(component.splitTerpenes('')).toEqual([]);
            expect(component.splitTerpenes('לא ידוע')).toEqual([]);
        });

        it('should split comma-separated terpenes', () => {
            const result = component.splitTerpenes('Myrcene, Limonene, Pinene');
            expect(result.length).toBe(3);
            expect(result[0].name).toBe('Myrcene');
            expect(result[1].name).toBe('Limonene');
            expect(result[2].name).toBe('Pinene');
        });

        it('should strip percentages from terpene names', () => {
            const result = component.splitTerpenes('Myrcene (25%), Limonene');
            expect(result[0].name).toBe('Myrcene');
            expect(result[0].label).toBe('Myrcene (25%)');
        });
    });

    describe('countryFlagUrl', () => {
        it('should return flag URL for known country', () => {
            expect(component.countryFlagUrl('ישראל')).toBe('/flags/il.svg');
            expect(component.countryFlagUrl('קנדה')).toBe('/flags/ca.svg');
        });

        it('should return empty for unknown country', () => {
            expect(component.countryFlagUrl('unknown')).toBe('');
        });
    });

    describe('toggleFilters', () => {
        it('should toggle filtersExpanded', () => {
            expect(component.filtersExpanded()).toBe(false);
            component.toggleFilters();
            expect(component.filtersExpanded()).toBe(true);
            component.toggleFilters();
            expect(component.filtersExpanded()).toBe(false);
        });
    });

    describe('clearAllFilters', () => {
        it('should reset activeFilters to empty', () => {
            component.activeFilters.set([{ key: 'test', fields: ['brand'], label: 'T', value: 'V', name: 'מותג' }]);
            component.clearAllFilters();
            expect(component.activeFilters()).toEqual([]);
        });

        it('should reset priceRange to bounds', () => {
            component.priceBounds.set([10, 100]);
            component.priceRange.set([20, 80]);
            component.clearAllFilters();
            expect(component.priceRange()).toEqual([10, 100]);
        });

        it('should reset activeSortField', () => {
            component.activeSortField.set('price');
            component.clearAllFilters();
            expect(component.activeSortField()).toBeNull();
        });
    });

    describe('applyDataFilter', () => {
        it('should add filter when not existing', () => {
            component.applyDataFilter('brand', 'CannabisCo');
            const filters = component.activeFilters();
            expect(filters.length).toBe(1);
            expect(filters[0].value).toBe('CannabisCo');
        });

        it('should remove filter when toggling same key', () => {
            component.applyDataFilter('brand', 'CannabisCo');
            component.applyDataFilter('brand', 'CannabisCo');
            expect(component.activeFilters().length).toBe(0);
        });

        it('should not add filter for empty value', () => {
            component.applyDataFilter('brand', '');
            expect(component.activeFilters().length).toBe(0);
        });
    });

    describe('removeFilter', () => {
        it('should remove filter by key', () => {
            component.applyDataFilter('brand', 'CannabisCo');
            const key = component.activeFilters()[0].key;
            component.removeFilter(key);
            expect(component.activeFilters().length).toBe(0);
        });
    });

    describe('columnLabel', () => {
        it('should return Hebrew label for known column', () => {
            expect(component.columnLabel('name')).toBe('שם');
            expect(component.columnLabel('price')).toBe('מחיר');
            expect(component.columnLabel('matchScore')).toBe('התאמה');
            expect(component.columnLabel('rating')).toBe('רייטינג');
        });

        it('should return raw key for unknown column', () => {
            expect(component.columnLabel('unknownCol')).toBe('unknownCol');
        });
    });

    describe('isAdmin', () => {
        it('should return false for regular user', () => {
            mockAuthStore.userRole.mockReturnValue(UserRole.User);
            fixture = TestBed.createComponent(StrainHunter);
            component = fixture.componentInstance;
            expect((component as any).isAdmin()).toBe(false);
        });

        it('should return true for admin', () => {
            mockAuthStore.userRole.mockReturnValue(UserRole.Admin);
            fixture = TestBed.createComponent(StrainHunter);
            component = fixture.componentInstance;
            expect((component as any).isAdmin()).toBe(true);
        });
    });
});
