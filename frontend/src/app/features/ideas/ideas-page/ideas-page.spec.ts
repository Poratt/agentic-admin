import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { IdeasPage } from './ideas-page';
import { IdeasStore } from '../../../core/store/ideas.store';
import { PageStates } from '../../../core/enums/page-states.enum';
import { SavedIdea } from '../../../core/models/saved-idea.model';

/**
 * Builds the exact shape IdeasStore.toSavedIdea() produces for a freshly streamed
 * idea: every field is populated except id/userId/sessionId, which only exist once
 * the backend has persisted the idea.
 */
function liveIdea(title: string): SavedIdea {
  const idea = new SavedIdea();
  idea.title = title;
  idea.description = `${title} description`;
  idea.targetMarket = 'developers';
  idea.validationScore = 7;
  idea.validationReason = '';
  idea.risks = [];
  idea.competitors = [];
  idea.nextSteps = [];
  idea.signalsReferenced = [];
  idea.groundedInSignals = true;
  idea.isFavorite = false;
  return idea;
}

describe('IdeasPage', () => {
  let component: IdeasPage;
  let fixture: ComponentFixture<IdeasPage>;
  let ideasStoreMock: {
    loadNightlyUnread: ReturnType<typeof vi.fn>;
    markNightlyRead: ReturnType<typeof vi.fn>;
    loadSessions: ReturnType<typeof vi.fn>;
    pageState: ReturnType<typeof vi.fn>;
    nightlyUnread: ReturnType<typeof vi.fn>;
    ideas: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    loading: ReturnType<typeof vi.fn>;
    phase: ReturnType<typeof vi.fn>;
    statusText: ReturnType<typeof vi.fn>;
    partial: ReturnType<typeof vi.fn>;
    totalRequested: ReturnType<typeof vi.fn>;
    generate: ReturnType<typeof vi.fn>;
    domain: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    setCount: ReturnType<typeof vi.fn>;
    stopGenerating: ReturnType<typeof vi.fn>;
    modelSelection: ReturnType<typeof vi.fn>;
    sessions: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    ideasStoreMock = {
      loadNightlyUnread: vi.fn(),
      markNightlyRead: vi.fn(),
      loadSessions: vi.fn(),
      pageState: vi.fn().mockReturnValue(3),
      nightlyUnread: vi.fn().mockReturnValue(0),
      ideas: vi.fn().mockReturnValue([]),
      error: vi.fn().mockReturnValue(null),
      loading: vi.fn().mockReturnValue(false),
      phase: vi.fn().mockReturnValue(0),
      statusText: vi.fn().mockReturnValue(''),
      partial: vi.fn().mockReturnValue(false),
      totalRequested: vi.fn().mockReturnValue(0),
      generate: vi.fn(),
      domain: vi.fn().mockReturnValue(''),
      count: vi.fn().mockReturnValue(5),
      setCount: vi.fn(),
      stopGenerating: vi.fn(),
      modelSelection: vi.fn().mockReturnValue(undefined),
      sessions: vi.fn().mockReturnValue([]),
    };

    await TestBed.configureTestingModule({
      imports: [IdeasPage],
      providers: [
        provideZonelessChangeDetection(),
        { provide: IdeasStore, useValue: ideasStoreMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(IdeasPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should call loadNightlyUnread on init', () => {
    expect(ideasStoreMock.loadNightlyUnread).toHaveBeenCalled();
  });

  it('renders every freshly streamed idea even though none of them has an id yet', () => {
    // Regression for NG0955: `track idea.id` resolved to undefined for all five ideas
    // (toSavedIdea deliberately leaves id unset), so the repeater saw five identical
    // empty keys. Angular reports that as a logged NG0955 rather than a thrown error,
    // so the assertion has to look at the console output, not just the rendered DOM.
    ideasStoreMock.pageState.mockReturnValue(PageStates.Ready);
    ideasStoreMock.ideas.mockReturnValue(['A', 'B', 'C', 'D', 'E'].map(liveIdea));

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // A fresh fixture is required: the one from beforeEach is still attached to the
    // ApplicationRef and would be re-checked against the newly mocked store state.
    fixture.destroy();
    const listFixture = TestBed.createComponent(IdeasPage);
    listFixture.detectChanges();

    const reported = [...consoleError.mock.calls, ...consoleWarn.mock.calls]
      .map((call) => call.map((part) => String(part)).join(' '))
      .filter((message) => message.includes('NG0955'));

    expect(reported).toEqual([]);
    expect(listFixture.nativeElement.querySelectorAll('app-idea-card').length).toBe(5);

    consoleError.mockRestore();
    consoleWarn.mockRestore();
  });
});
