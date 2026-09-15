import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal, WritableSignal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { IdeasForm } from './ideas-form';
import { IdeasStore } from '../../../core/store/ideas.store';
import { LlmProviderStore } from '../../../core/store/llm-provider.store';

describe('IdeasForm', () => {
  let component: IdeasForm;
  let fixture: ComponentFixture<IdeasForm>;
  let storeMock: {
    // Must be a real signal — IdeasForm.canGenerate is a computed() and would
    // cache its first result forever against a plain vi.fn() mock.
    domain: WritableSignal<string>;
    count: ReturnType<typeof vi.fn>;
    loading: ReturnType<typeof vi.fn>;
    setDomain: ReturnType<typeof vi.fn>;
    setCount: ReturnType<typeof vi.fn>;
    setModel: ReturnType<typeof vi.fn>;
    generate: ReturnType<typeof vi.fn>;
    stopGenerating: ReturnType<typeof vi.fn>;
  };

  // Real signals, so a test can control the order in which the model list and the
  // saved default model arrive from their two independent requests.
  let chatModelsSignal: WritableSignal<{ label: string; count: number; items: { id: number }[] }[]>;
  let defaultModelIdSignal: WritableSignal<number | null>;
  let defaultModelResolvedSignal: WritableSignal<boolean>;
  let llmStoreMock: {
    chatModels: WritableSignal<{ label: string; count: number; items: { id: number }[] }[]>;
    defaultModelId: WritableSignal<number | null>;
    defaultModelResolved: WritableSignal<boolean>;
    loadUserDefaultModel: ReturnType<typeof vi.fn>;
    providers: ReturnType<typeof vi.fn>;
    setDefaultModel: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    // PrimeNG TieredMenu calls window.matchMedia in ngOnInit; JSDOM doesn't ship it.
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

    storeMock = {
      domain: signal(''),
      count: vi.fn().mockReturnValue(5),
      loading: vi.fn().mockReturnValue(false),
      setDomain: vi.fn(),
      setCount: vi.fn(),
      setModel: vi.fn(),
      generate: vi.fn(),
      stopGenerating: vi.fn(),
    };

    chatModelsSignal = signal([]);
    defaultModelIdSignal = signal<number | null>(null);
    defaultModelResolvedSignal = signal(false);

    llmStoreMock = {
      chatModels: chatModelsSignal,
      defaultModelId: defaultModelIdSignal,
      defaultModelResolved: defaultModelResolvedSignal,
      loadUserDefaultModel: vi.fn(),
      providers: vi.fn().mockReturnValue([]),
      setDefaultModel: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [IdeasForm, ReactiveFormsModule],
      providers: [
        provideZonelessChangeDetection(),
        { provide: IdeasStore, useValue: storeMock },
        { provide: LlmProviderStore, useValue: llmStoreMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(IdeasForm);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('incrementCount should call store.setCount with incremented value', () => {
    storeMock.count.mockReturnValue(5);
    component.incrementCount();
    expect(storeMock.setCount).toHaveBeenCalledWith(6);
  });

  it('incrementCount should not exceed 10', () => {
    storeMock.count.mockReturnValue(10);
    component.incrementCount();
    expect(storeMock.setCount).not.toHaveBeenCalled();
  });

  it('decrementCount should call store.setCount with decremented value', () => {
    storeMock.count.mockReturnValue(5);
    component.decrementCount();
    expect(storeMock.setCount).toHaveBeenCalledWith(4);
  });

  it('decrementCount should not go below 1', () => {
    storeMock.count.mockReturnValue(1);
    component.decrementCount();
    expect(storeMock.setCount).not.toHaveBeenCalled();
  });

  it('canGenerate should return true when domain is non-empty', () => {
    storeMock.domain.set('tech');
    expect(component.canGenerate()).toBe(true);
  });

  it('canGenerate should return false when domain is empty', () => {
    storeMock.domain.set('');
    expect(component.canGenerate()).toBe(false);
  });

  it('onGenerate should call store.generate when not loading', () => {
    storeMock.loading.mockReturnValue(false);
    storeMock.domain.set('tech');
    component.onGenerate();
    expect(storeMock.generate).toHaveBeenCalled();
  });

  it('onGenerate should not call store.generate when loading', () => {
    storeMock.loading.mockReturnValue(true);
    component.onGenerate();
    expect(storeMock.generate).not.toHaveBeenCalled();
  });

  it('onStopGenerate should call store.stopGenerating', () => {
    component.onStopGenerate();
    expect(storeMock.stopGenerating).toHaveBeenCalled();
  });

  it('loads the saved default model on init', () => {
    expect(llmStoreMock.loadUserDefaultModel).toHaveBeenCalled();
  });

  it('selects the saved default model even when the model list arrives first', async () => {
    // Regression: the model list and the default-model request resolve independently.
    // When the list won the race the form selected its first entry, and the
    // `!currentSelection` guard then blocked the user's real default forever — which
    // is why a default picked in this dropdown looked like it was never saved.
    chatModelsSignal.set([{ label: 'OpenAI', count: 2, items: [{ id: 7 }, { id: 9 }] }]);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.ideasForm.value.model).toBeFalsy();

    defaultModelIdSignal.set(9);
    defaultModelResolvedSignal.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.ideasForm.value.model).toBe(9);
  });

  it('falls back to the first model when the user has no saved default', async () => {
    chatModelsSignal.set([{ label: 'OpenAI', count: 2, items: [{ id: 7 }, { id: 9 }] }]);
    defaultModelResolvedSignal.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.ideasForm.value.model).toBe(7);
  });
});
