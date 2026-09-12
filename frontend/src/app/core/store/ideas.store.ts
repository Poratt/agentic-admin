import { Injectable, inject, signal, computed } from '@angular/core';
import { Subscription, firstValueFrom } from 'rxjs';
import { IdeasService } from '../services/ideas.service';
import { PageStates } from '../enums/page-states.enum';
import { BusinessIdea, GenerateIdeasResponse, IdeasProgressEvent } from '../models/idea.interface';
import { SavedIdeaSession } from '../models/saved-idea-session.model';
import { SavedIdea } from '../models/saved-idea.model';

export interface IdeasModelSelection {
  provider: string;
  model: string;
}

@Injectable({ providedIn: 'root' })
export class IdeasStore {
  private ideasService = inject(IdeasService);
  private sub: Subscription | null = null;

  domain = signal('');
  count = signal(5);
  modelSelection = signal<IdeasModelSelection | undefined>(undefined);
  ideas = signal<SavedIdea[]>([]);
  phase = signal<number | 'done' | 'error'>(0);
  statusText = signal('');
  loading = signal(false);
  error = signal<string | null>(null);
  partial = signal(false);
  failedCount = signal<number | null>(null);
  message = signal('');

  sessions = signal<SavedIdeaSession[]>([]);
  currentSessionId = signal<number | null>(null);
  nightlyUnread = signal<number>(0);
  historyLoading = signal(false);
  historyError = signal<string | null>(null);
  loadingSessionIds = signal<Set<number>>(new Set());
  triggeringNightly = signal(false);

  isSessionLoading(id: number): boolean {
    return this.loadingSessionIds().has(id);
  }

  recentSessions = computed(() => this.sessions().slice(0, 5));

  historyPageState = computed<PageStates>(() => {
    if (this.historyError()) return PageStates.Error;
    if (this.historyLoading()) return PageStates.Loading;
    if (this.sessions().length > 0) return PageStates.Ready;
    return PageStates.Empty;
  });

  pageState = computed<PageStates>(() => {
    if (this.error()) return PageStates.Error;
    if (this.loading()) return PageStates.Loading;
    if (this.ideas().length > 0) return PageStates.Ready;
    return PageStates.Empty;
  });

  totalRequested = computed(() => this.ideas().length + (this.failedCount() ?? 0));

  setDomain(value: string): void {
    this.domain.set(value);
  }

  setCount(value: number): void {
    this.count.set(value);
  }

  setModel(value: IdeasModelSelection | undefined): void {
    this.modelSelection.set(value);
  }

  generate(): void {
    const domain = this.domain().trim();
    if (!domain) {
      this.error.set('נא להזין תחום עסקי');
      return;
    }

    this.sub?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    this.ideas.set([]);
    this.partial.set(false);
    this.failedCount.set(null);
    this.message.set('');
    this.phase.set(0);
    this.statusText.set('מתחיל...');

    const selection = this.modelSelection();
    this.sub = this.ideasService
      .generateStream(domain, this.count(), selection?.provider, selection?.model)
      .subscribe({
        next: (event: IdeasProgressEvent) => this.handleEvent(event),
        error: (err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') {
            return;
          }
          const msg = err instanceof Error ? err.message : 'אירעה שגיאה ביצירת הרעיונות';
          this.error.set(msg);
          this.loading.set(false);
        },
        // The stream closed without a done event (server restart mid-way, network drop) —
        // without this handling loading stays true forever and the button stays stuck active.
        complete: () => {
          if (!this.loading()) {
            return;
          }
          this.loading.set(false);
          this.sub = null;
          if (this.ideas().length > 0) {
            this.partial.set(true);
            this.phase.set('done');
            this.message.set('החיבור לשרת הופסק לפני סיום — הוצגו התוצאות שהתקבלו');
          } else {
            this.error.set('החיבור לשרת הופסק לפני סיום היצירה');
          }
        },
      });
  }

  stopGenerating(): void {
    if (!this.sub) {
      return;
    }

    this.sub.unsubscribe();
    this.sub = null;
    this.loading.set(false);
    this.phase.set('done');
    this.statusText.set('היצירה הופסקה');

    if (this.ideas().length === 0) {
      return;
    }

    this.partial.set(true);
    this.message.set('היצירה הופסקה על ידי המשתמש');
  }

  private handleEvent(event: IdeasProgressEvent): void {
    if (event.phase === 'error') {
      this.error.set(event.message);
      this.loading.set(false);
      return;
    }

    if (event.phase === 'done') {
      this.applyResult(event.result);
      this.loading.set(false);
      this.loadSessions();
      return;
    }

    this.phase.set(event.phase);
    this.statusText.set(event.status);
  }

  private applyResult(result: GenerateIdeasResponse): void {
    // The backend auto-saves every generated idea, but the SSE event carries a
    // BusinessIdea (no DB id yet). Normalize it to SavedIdea so IdeaCard has a
    // single shape to render, and coerce nullable arrays to [] at this boundary.
    this.ideas.set((result.result ?? []).map((idea: BusinessIdea) => this.toSavedIdea(idea)));
    this.partial.set(result.partial);
    this.failedCount.set(result.failedCount ?? null);
    this.message.set(result.message ?? '');
    if (!result.success) {
      this.error.set(result.message || 'יצירת הרעיונות נכשלה');
    }
  }

  /**
   * Maps a freshly-streamed BusinessIdea to the SavedIdea shape used everywhere
   * in the UI. Live (unsaved) ideas have no id/userId/sessionId yet, so those are
   * left undefined. Nullable arrays are normalized to [] so templates never guard.
   */
  private toSavedIdea(idea: BusinessIdea): SavedIdea {
    const saved = new SavedIdea();
    saved.title = idea.title;
    saved.description = idea.description;
    saved.targetMarket = idea.targetMarket;
    saved.validationScore = idea.validationScore;
    saved.validationReason = idea.validationReason ?? '';
    saved.risks = idea.risks ?? [];
    saved.competitors = idea.competitors ?? [];
    saved.nextSteps = idea.nextSteps ?? [];
    saved.signalsReferenced = idea.signalsReferenced ?? [];
    saved.groundedInSignals = idea.groundedInSignals;
    saved.techStackSuggestion = idea.techStackSuggestion;
    saved.firstDistributionStep = idea.firstDistributionStep;
    saved.estimatedMvpDays = idea.estimatedMvpDays;
    saved.isFavorite = false;
    return saved;
  }

  /**
   * Normalizes a persisted SavedIdea (which may carry null arrays from the API)
   * into the clean non-null shape the UI expects, so IdeaCard never guards null.
   */
  private normalizeSaved(raw: SavedIdea): SavedIdea {
    return {
      ...raw,
      validationReason: raw.validationReason ?? '',
      risks: raw.risks ?? [],
      competitors: raw.competitors ?? [],
      nextSteps: raw.nextSteps ?? [],
      signalsReferenced: raw.signalsReferenced ?? [],
    };
  }

  clearError(): void {
    this.error.set(null);
  }

  async loadSessions(params?: { nightly?: boolean; favorites?: boolean }): Promise<void> {
    this.historyLoading.set(true);
    this.historyError.set(null);
    try {
      const sessions = await firstValueFrom(this.ideasService.listSessions(params));
      this.sessions.set(sessions.map((session) => ({
        ...session,
        unread: this.resolveUnread(session.nightly, session.unread),
        ideas: session.ideas?.map((idea) => this.normalizeSaved(idea)),
      })));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load sessions';
      this.historyError.set(msg);
    } finally {
      this.historyLoading.set(false);
    }
  }

  // Once nightly has been marked read locally, keep it read even if the server
  // still returns unread (avoids the dot reappearing after a refetch).
  private resolveUnread(isNightly: boolean, serverUnread: boolean): boolean {
    if (isNightly && this.nightlyUnread() === 0) return false;
    return serverUnread;
  }

  async loadSession(id: number): Promise<void> {
    this.currentSessionId.set(id);
    this.loadingSessionIds.update((ids) => new Set(ids).add(id));
    this.historyError.set(null);
    try {
      const session = await firstValueFrom(this.ideasService.getSession(id));
      const normalized = {
        ...session,
        unread: this.resolveUnread(session.nightly, session.unread),
        ideas: session.ideas?.map((idea) => this.normalizeSaved(idea)),
      };
      this.sessions.update((sessions) => {
        const idx = sessions.findIndex((s) => s.id === id);
        if (idx >= 0) {
          return sessions.map((s) => (s.id === id ? normalized : s));
        }
        return [...sessions, normalized];
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load session';
      this.historyError.set(msg);
    } finally {
      this.loadingSessionIds.update((ids) => {
        const next = new Set(ids);
        next.delete(id);
        return next;
      });
    }
  }

  async deleteSession(id: number): Promise<void> {
    try {
      await firstValueFrom(this.ideasService.deleteSession(id));
      this.sessions.update((sessions) => sessions.filter((s) => s.id !== id));
      if (this.currentSessionId() === id) {
        this.currentSessionId.set(null);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete session';
      this.historyError.set(msg);
    }
  }

  async toggleFavorite(ideaId: number, isFavorite: boolean): Promise<void> {
    this.sessions.update((sessions) =>
      sessions.map((session) => ({
        ...session,
        ideas: session.ideas?.map((idea: SavedIdea) =>
          idea.id === ideaId ? { ...idea, isFavorite } : idea,
        ),
      })),
    );
    try {
      await firstValueFrom(this.ideasService.setFavorite(ideaId, isFavorite));
    } catch {
      this.sessions.update((sessions) =>
        sessions.map((session) => ({
          ...session,
          ideas: session.ideas?.map((idea: SavedIdea) =>
            idea.id === ideaId ? { ...idea, isFavorite: !isFavorite } : idea,
          ),
        })),
      );
    }
  }

  async loadNightlyUnread(): Promise<void> {
    try {
      const count = await firstValueFrom(this.ideasService.nightlyUnreadCount());
      this.nightlyUnread.set(count);
    } catch {
      this.nightlyUnread.set(0);
    }
  }

  async markNightlyRead(): Promise<void> {
    try {
      await firstValueFrom(this.ideasService.markNightlyRead());
      this.nightlyUnread.set(0);
      this.sessions.update((sessions) =>
        sessions.map((s) => (s.nightly ? { ...s, unread: false } : s)),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to mark as read';
      this.historyError.set(msg);
    }
  }

  async triggerNightly(): Promise<string | null> {
    this.triggeringNightly.set(true);
    try {
      const result = await firstValueFrom(this.ideasService.triggerNightly());
      this.triggeringNightly.set(false);
      return result.message;
    } catch (err) {
      this.triggeringNightly.set(false);
      const msg = err instanceof Error ? err.message : 'Failed to trigger nightly generation';
      throw new Error(msg);
    }
  }
}
