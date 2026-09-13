import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { of, throwError, Subject } from 'rxjs';
import { LlmProviderStore } from './llm-provider.store';
import { LlmProviderService } from '../../core/services/llm-provider.service';

describe('LlmProviderStore', () => {
    let llmProviderService: {
        create: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
        deleteProvider: ReturnType<typeof vi.fn>;
        createModel: ReturnType<typeof vi.fn>;
        updateModel: ReturnType<typeof vi.fn>;
        softDeleteModel: ReturnType<typeof vi.fn>;
        deleteTestResult: ReturnType<typeof vi.fn>;
        deleteAllTestResultsForModel: ReturnType<typeof vi.fn>;
        setUserDefaultModel: ReturnType<typeof vi.fn>;
        getUserDefaultModel: ReturnType<typeof vi.fn>;
        getModelStats: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
        llmProviderService = {
            create: vi.fn(),
            update: vi.fn(),
            deleteProvider: vi.fn(),
            createModel: vi.fn(),
            updateModel: vi.fn(),
            softDeleteModel: vi.fn(),
            deleteTestResult: vi.fn(),
            deleteAllTestResultsForModel: vi.fn(),
            setUserDefaultModel: vi.fn(),
            getUserDefaultModel: vi.fn(),
            getModelStats: vi.fn(),
        };

        TestBed.configureTestingModule({
            providers: [
                provideZonelessChangeDetection(),
                LlmProviderStore,
                { provide: LlmProviderService, useValue: llmProviderService },
            ],
        });
    });

    function create(): LlmProviderStore {
        return TestBed.inject(LlmProviderStore);
    }

    describe('createProvider', () => {
        it('calls service and reloads on success', () => {
            llmProviderService.create.mockReturnValue(of({ result: {} }));
            const store = create();
            store.createProvider({ key: 'anthropic', label: 'Anthropic' });

            expect(llmProviderService.create).toHaveBeenCalledWith({ key: 'anthropic', label: 'Anthropic' });
            expect(store.error()).toBeNull();
        });

        it('sets error on failure', () => {
            llmProviderService.create.mockReturnValue(throwError(() => ({ error: { message: 'Create failed' } })));
            const store = create();
            store.createProvider({ key: 'anthropic', label: 'Anthropic' });

            expect(store.error()).toBe('Create failed');
        });
    });

    describe('updateProvider', () => {
        it('calls service and reloads on success', () => {
            llmProviderService.update.mockReturnValue(of({ result: {} }));
            const store = create();
            store.updateProvider(1, { label: 'Updated' });

            expect(llmProviderService.update).toHaveBeenCalledWith(1, { label: 'Updated' });
            expect(store.error()).toBeNull();
        });

        it('sets error on failure', () => {
            llmProviderService.update.mockReturnValue(throwError(() => ({ error: { message: 'Update failed' } })));
            const store = create();
            store.updateProvider(1, { label: 'Updated' });

            expect(store.error()).toBe('Update failed');
        });
    });

    describe('deleteProvider', () => {
        it('permanently deletes via DELETE and reloads', () => {
            llmProviderService.deleteProvider.mockReturnValue(of({ result: undefined }));
            const store = create();
            store.deleteProvider(1);

            expect(llmProviderService.deleteProvider).toHaveBeenCalledWith(1);
            expect(store.error()).toBeNull();
        });

        it('sets error on failure', () => {
            llmProviderService.deleteProvider.mockReturnValue(
                throwError(() => ({ error: { message: 'Delete failed' } })),
            );
            const store = create();
            store.deleteProvider(1);

            expect(store.error()).toBe('Delete failed');
        });
    });

    describe('setDefaultModel', () => {
        it('updates defaultModelId on success', () => {
            llmProviderService.setUserDefaultModel.mockReturnValue(of({ success: true, message: 'ok' }));
            const store = create();
            store.setDefaultModel(42);

            expect(llmProviderService.setUserDefaultModel).toHaveBeenCalledWith(42);
            expect(store.defaultModelId()).toBe(42);
        });

        it('sets error on failure', () => {
            llmProviderService.setUserDefaultModel.mockReturnValue(
                throwError(() => ({ error: { message: 'Set default failed' } })),
            );
            const store = create();
            store.setDefaultModel(42);

            expect(store.error()).toBe('Set default failed');
        });
    });

    describe('createModel', () => {
        it('calls service and reloads on success', () => {
            llmProviderService.createModel.mockReturnValue(of({ result: {} }));
            const store = create();
            store.createModel(1, {
                key: 'gpt-4',
                label: 'GPT-4',
                active: true,
                sortOrder: 0,
                capability: 'text' as const,
                providerId: 1,
                createdAt: '',
                updatedAt: '',
            });

            expect(llmProviderService.createModel).toHaveBeenCalled();
            expect(store.error()).toBeNull();
        });
    });

    describe('loadModelStats', () => {
        const stats = {
            minimumSample: 3,
            rows: [],
            fastestId: null,
            mostStableId: null,
        };

        it('stores the statistics and clears the loading flag', () => {
            llmProviderService.getModelStats.mockReturnValue(of({ result: stats }));
            const store = create();

            store.loadModelStats();

            expect(store.modelStats()).toEqual(stats);
            expect(store.modelStatsLoading()).toBe(false);
            expect(store.modelStatsError()).toBeNull();
        });

        it('surfaces the failure and stops loading', () => {
            llmProviderService.getModelStats.mockReturnValue(throwError(() => ({ error: { message: 'Stats failed' } })));
            const store = create();

            store.loadModelStats();

            expect(store.modelStatsError()).toBe('Stats failed');
            expect(store.modelStatsLoading()).toBe(false);
            expect(store.modelStats()).toBeNull();
        });

        it('ignores a second call while one is already in flight', () => {
            // A Subject that never emits, so the first request is still open when the second arrives.
            llmProviderService.getModelStats.mockReturnValue(new Subject());
            const store = create();

            store.loadModelStats();
            store.loadModelStats();

            expect(llmProviderService.getModelStats).toHaveBeenCalledTimes(1);
        });
    });
});
