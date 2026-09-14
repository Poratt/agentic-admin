import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { Settings } from './settings';
import { ConfirmationService, MessageService } from 'primeng/api';

describe('Settings', () => {
  // PrimeNG tablist observes element sizes; the unit-test DOM has no ResizeObserver.
  beforeEach(() => {
    if (typeof (globalThis as any).ResizeObserver === 'undefined') {
      (globalThis as any).ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    }
  });

  const mockRouter = {
    navigate: vi.fn(),
  };

  const queryParamMap$ = new BehaviorSubject<Map<string, string>>(new Map());

  beforeEach(async () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    await TestBed.configureTestingModule({
      imports: [Settings],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MessageService, useValue: { add: vi.fn(), messages: signal([]) } },
        { provide: ConfirmationService, useValue: { confirm: vi.fn() } },
        { provide: Router, useValue: mockRouter },
        { provide: ActivatedRoute, useValue: { queryParamMap: queryParamMap$.pipe() } },
      ],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(Settings);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('writes ?tab= slug to the URL when the tab changes', () => {
    const fixture = TestBed.createComponent(Settings);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.setActiveTab('2');

    expect(component.activeTab()).toBe('2');
    expect(mockRouter.navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: { tab: 'db' } }),
    );
  });

  it('restores the tab from ?tab= on init and ignores unknown slugs', () => {
    queryParamMap$.next(new Map([['tab', 'design']]));
    const fixture = TestBed.createComponent(Settings);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.activeTab()).toBe('3');

    queryParamMap$.next(new Map([['tab', 'nope']]));
    fixture.detectChanges();

    expect(component.activeTab()).toBe('0');
  });
});
