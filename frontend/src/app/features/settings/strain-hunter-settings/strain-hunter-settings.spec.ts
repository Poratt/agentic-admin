import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { StrainHunterSettings } from './strain-hunter-settings';
import { GeneticsStore } from '../../../core/store/genetics.store';
import { TerpeneStore } from '../../../core/store/terpene.store';
import { GeneticsService } from '../../../core/services/genetics.service';
import { TerpeneService } from '../../../core/services/terpene.service';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AuthStore } from '../../../core/store/auth.store';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { IGenetics } from '../../../core/models/genetics.interface';
import { ITerpene } from '../../../core/models/terpene.interface';

function makeGenetics(overrides: Partial<IGenetics> = {}): IGenetics {
  return { id: 1, name: 'OG Kush', color: '#fff', colorDark: '#000', colorLight: '#ccc', ...overrides };
}

function makeTerpene(overrides: Partial<ITerpene> = {}): ITerpene {
  return { id: 1, name: 'Myrcene', color: '#fff', colorDark: '#000', colorLight: '#ccc', ...overrides };
}

describe('StrainHunterSettings', () => {
  let component: StrainHunterSettings;
  let fixture: ComponentFixture<StrainHunterSettings>;
  let geneticsStoreMock: {
    genetics: ReturnType<typeof vi.fn>;
    loading: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    enrich: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    reload: ReturnType<typeof vi.fn>;
  };
  let terpeneStoreMock: {
    terpenes: ReturnType<typeof vi.fn>;
    loading: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    enrich: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    reload: ReturnType<typeof vi.fn>;
  };
  let geneticsLoadingSignal: ReturnType<typeof signal<boolean>>;
  let terpeneLoadingSignal: ReturnType<typeof signal<boolean>>;

  const mockRouter = {
    navigate: vi.fn(),
  };

  const queryParamMap$ = new BehaviorSubject<Map<string, string>>(new Map());

  beforeEach(async () => {
    (globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });

    geneticsLoadingSignal = signal(false);
    terpeneLoadingSignal = signal(false);

    geneticsStoreMock = {
      genetics: vi.fn().mockReturnValue([
        makeGenetics({ id: 1, name: 'OG Kush' }),
        makeGenetics({ id: 2, name: 'Blue Dream' }),
      ]),
      loading: vi.fn().mockImplementation(() => geneticsLoadingSignal()),
      update: vi.fn(),
      enrich: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn(),
    };

    terpeneStoreMock = {
      terpenes: vi.fn().mockReturnValue([
        makeTerpene({ id: 1, name: 'Myrcene' }),
        makeTerpene({ id: 2, name: 'Limonene' }),
      ]),
      loading: vi.fn().mockImplementation(() => terpeneLoadingSignal()),
      update: vi.fn(),
      enrich: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn(),
    };

    const geneticsServiceMock = { enrichMissing: vi.fn(), list: vi.fn(), update: vi.fn(), enrich: vi.fn(), delete: vi.fn() };
    const terpeneServiceMock = { enrichMissing: vi.fn(), list: vi.fn(), update: vi.fn(), enrich: vi.fn(), delete: vi.fn() };
    const confirmServiceMock = { confirm: vi.fn() };
    const authStoreMock = {
      userRole: vi.fn().mockReturnValue(1),
      user: vi.fn().mockReturnValue({ id: 1, role: 1 }),
    };

    await TestBed.configureTestingModule({
      imports: [StrainHunterSettings],
      providers: [
        provideZonelessChangeDetection(),
        { provide: GeneticsStore, useValue: geneticsStoreMock },
        { provide: TerpeneStore, useValue: terpeneStoreMock },
        { provide: GeneticsService, useValue: geneticsServiceMock },
        { provide: TerpeneService, useValue: terpeneServiceMock },
        { provide: ConfirmationService, useValue: confirmServiceMock },
        MessageService,
        { provide: AuthStore, useValue: authStoreMock },
        { provide: Router, useValue: mockRouter },
        { provide: ActivatedRoute, useValue: { queryParamMap: queryParamMap$.pipe() } },
      ],
    }).compileComponents();

    queryParamMap$.next(new Map());
    fixture = TestBed.createComponent(StrainHunterSettings);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('filteredGenetics should return all when filter is empty', () => {
    component.geneticsFilter.set('');
    expect(component.filteredGenetics().length).toBe(2);
  });

  it('filteredGenetics should filter by search term', () => {
    component.geneticsFilter.set('kush');
    expect(component.filteredGenetics().length).toBe(1);
    expect(component.filteredGenetics()[0].name).toBe('OG Kush');
  });

  it('filteredTerpenes should return all when filter is empty', () => {
    component.terpeneFilter.set('');
    expect(component.filteredTerpenes().length).toBe(2);
  });

  it('filteredTerpenes should filter by search term', () => {
    component.terpeneFilter.set('myrcene');
    expect(component.filteredTerpenes().length).toBe(1);
    expect(component.filteredTerpenes()[0].name).toBe('Myrcene');
  });

  it('deleteGenetics should call confirmService.confirm', () => {
    const confirmSpy = (TestBed.inject(ConfirmationService) as any).confirm;
    const g = makeGenetics({ id: 1, name: 'OG Kush' });
    component.deleteGenetics(g);
    expect(confirmSpy).toHaveBeenCalled();
  });

  it('deleteTerpene should call confirmService.confirm', () => {
    const confirmSpy = (TestBed.inject(ConfirmationService) as any).confirm;
    const t = makeTerpene({ id: 1, name: 'Myrcene' });
    component.deleteTerpene(t);
    expect(confirmSpy).toHaveBeenCalled();
  });

  it('tableSkeletonRows has exactly page-size (20) placeholder rows', () => {
    expect(component.tableSkeletonRows.length).toBe(20);
  });

  it('geneticsLoading reflects the store loading signal', () => {
    expect(component.geneticsLoading()).toBe(false);
    geneticsLoadingSignal.set(true);
    expect(component.geneticsLoading()).toBe(true);
    geneticsLoadingSignal.set(false);
    expect(component.geneticsLoading()).toBe(false);
  });

  it('terpeneLoading reflects the store loading signal', () => {
    expect(component.terpeneLoading()).toBe(false);
    terpeneLoadingSignal.set(true);
    expect(component.terpeneLoading()).toBe(true);
    terpeneLoadingSignal.set(false);
    expect(component.terpeneLoading()).toBe(false);
  });

  it('writes ?section= slug to the URL when the section changes', () => {
    component.setActiveSection('1');

    expect(component.activeSection()).toBe('1');
    expect(mockRouter.navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: { section: 'terpenes' } }),
    );
  });

  it('restores the section from ?section= on init', () => {
    queryParamMap$.next(new Map([['section', 'terpenes']]));
    fixture.destroy();
    fixture = TestBed.createComponent(StrainHunterSettings);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.activeSection()).toBe('1');
  });
});
