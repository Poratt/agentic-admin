import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { LlmProvidersManagement } from './llm-providers-management';
import { AuthStore } from '../../core/store/auth.store';
import { LlmProviderStore } from '../../core/store/llm-provider.store';
import { LlmProviderService } from '../../core/services/llm-provider.service';
import { ConfirmationService, MessageService } from 'primeng/api';
import { UserRole } from '../../core/enums/user-role.enum';
import { PageStates } from '../../core/enums/page-states.enum';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

// PrimeNG tablist observes element sizes; the unit-test DOM has no ResizeObserver.
if (typeof (globalThis as any).ResizeObserver === 'undefined') {
    (globalThis as any).ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
}

describe('LlmProvidersManagement', () => {
    let component: LlmProvidersManagement;
    let fixture: ComponentFixture<LlmProvidersManagement>;

    const mockAuthStore = {
        user: vi.fn(() => null),
        userRole: vi.fn(() => UserRole.User),
    };

    const mockProviderStore = {
        providers: vi.fn((): any[] => []),
        pageState: vi.fn(() => PageStates.Empty),
        loadUserDefaultModel: vi.fn(),
        defaultModelId: vi.fn(() => null),
        createProvider: vi.fn(),
        updateProvider: vi.fn(),
        deleteProvider: vi.fn(),
        createModel: vi.fn(),
        updateModel: vi.fn(),
        setModelsActive: vi.fn(),
        softDeleteModel: vi.fn(),
        hardDeleteModel: vi.fn(),
        deleteTestResult: vi.fn(),
        deleteAllTestResults: vi.fn(),
        setDefaultModel: vi.fn(),
        reload: vi.fn(),
        loadModelStats: vi.fn(),
        modelStats: vi.fn((): any => null),
        modelStatsLoading: vi.fn(() => false),
        modelStatsError: vi.fn(() => null),
    };

    const mockProviderService = {
        testModel: vi.fn(() => ({ subscribe: vi.fn() })),
        testAllModels: vi.fn(),
        testAllStatus: vi.fn(),
        getCatalog: vi.fn(),
        syncModels: vi.fn(),
    };

    const mockConfirmService = {
        confirm: vi.fn(),
    };

    const mockMessageService = {
        add: vi.fn(),
    };

    const mockRouter = {
        navigate: vi.fn(),
    };

    const queryParamMap$ = new BehaviorSubject<Map<string, string>>(new Map());

    beforeEach(async () => {
        queryParamMap$.next(new Map());
        await TestBed.configureTestingModule({
            imports: [LlmProvidersManagement, ReactiveFormsModule],
            providers: [
                provideZonelessChangeDetection(),
                { provide: AuthStore, useValue: mockAuthStore },
                { provide: LlmProviderStore, useValue: mockProviderStore },
                { provide: LlmProviderService, useValue: mockProviderService },
                { provide: ConfirmationService, useValue: mockConfirmService },
                { provide: MessageService, useValue: mockMessageService },
                { provide: Router, useValue: mockRouter },
                {
                    provide: ActivatedRoute,
                    useValue: {
                        queryParamMap: queryParamMap$.pipe(),
                    },
                },
            ],
        }).compileComponents();

        fixture = TestBed.createComponent(LlmProvidersManagement);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    describe('openAddProviderDialog / closeProviderDialog', () => {
        it('should open dialog and set visible to true', () => {
            component.openAddProviderDialog();
            expect(component.providerDialogVisible()).toBe(true);
            expect(component.editingProviderId()).toBeNull();
        });

        it('should reset form with defaults', () => {
            component.openAddProviderDialog();
            expect(component.providerForm.get('key')?.value).toBe('');
            expect(component.providerForm.get('active')?.value).toBe(true);
        });

        it('should close dialog and reset', () => {
            component.openAddProviderDialog();
            component.closeProviderDialog();
            expect(component.providerDialogVisible()).toBe(false);
            expect(component.editingProviderId()).toBeNull();
        });
    });

    describe('openAddModelDialog / closeModelDialog', () => {
        it('should open model dialog with provider id', () => {
            component.openAddModelDialog(42);
            expect(component.modelDialogVisible()).toBe(true);
            expect(component.editingModelProviderId()).toBe(42);
            expect(component.editingModelId()).toBeNull();
        });

        it('should close model dialog and reset', () => {
            component.openAddModelDialog(42);
            component.closeModelDialog();
            expect(component.modelDialogVisible()).toBe(false);
            expect(component.editingModelProviderId()).toBeNull();
            expect(component.editingModelId()).toBeNull();
        });
    });

    describe('formatLatency', () => {
        it('shows a dash for an unmeasured latency rather than claiming 0ms', () => {
            // A model whose runs all failed has no latency at all — "0ms" would read as instant.
            expect(component.formatLatency(0)).toBe('—');
            expect(component.formatLatency(undefined as any)).toBe('—');
        });

        it('should format milliseconds when < 1000', () => {
            expect(component.formatLatency(500)).toBe('500ms');
        });

        it('should format seconds when >= 1000', () => {
            expect(component.formatLatency(2500)).toBe('2.5s');
        });

        it('should format exactly 1000ms', () => {
            expect(component.formatLatency(1000)).toBe('1.0s');
        });
    });

    describe('performanceClass', () => {
        it('should return good for >= 90', () => {
            expect(component.performanceClass(90)).toBe('good');
            expect(component.performanceClass(100)).toBe('good');
        });

        it('should return mid for >= 60', () => {
            expect(component.performanceClass(60)).toBe('mid');
            expect(component.performanceClass(89)).toBe('mid');
        });

        it('should return bad for < 60', () => {
            expect(component.performanceClass(0)).toBe('bad');
            expect(component.performanceClass(59)).toBe('bad');
        });
    });

    describe('getToolReliabilityClass', () => {
        it('should return good for >= 90', () => {
            expect(component.getToolReliabilityClass(90)).toBe('good');
            expect(component.getToolReliabilityClass(100)).toBe('good');
        });

        it('should return mid for >= 70', () => {
            expect(component.getToolReliabilityClass(70)).toBe('mid');
            expect(component.getToolReliabilityClass(89)).toBe('mid');
        });

        it('should return bad for < 70', () => {
            expect(component.getToolReliabilityClass(0)).toBe('bad');
            expect(component.getToolReliabilityClass(69)).toBe('bad');
        });
    });

    describe('isAdmin', () => {
        it('should return false for regular user', () => {
            mockAuthStore.userRole.mockReturnValue(UserRole.User);
            fixture = TestBed.createComponent(LlmProvidersManagement);
            component = fixture.componentInstance;
            expect(component.isAdmin()).toBe(false);
        });

        it('should return true for admin', () => {
            mockAuthStore.userRole.mockReturnValue(UserRole.Admin);
            fixture = TestBed.createComponent(LlmProvidersManagement);
            component = fixture.componentInstance;
            expect(component.isAdmin()).toBe(true);
        });
    });

    describe('provider form validation', () => {
        it('should be invalid when empty', () => {
            component.providerForm.reset({ key: '', label: '', baseUrl: '', apiKey: '', active: true });
            expect(component.providerForm.invalid).toBe(true);
        });

        it('should require key without spaces', () => {
            component.providerForm.patchValue({ key: 'with space', label: 'Test', baseUrl: 'https://api.test.com' });
            expect(component.providerForm.get('key')?.valid).toBe(false);
        });

        it('should require label', () => {
            component.providerForm.patchValue({ key: 'test', label: '', baseUrl: 'https://api.test.com' });
            expect(component.providerForm.get('label')?.valid).toBe(false);
        });

        it('should require baseUrl with http(s)', () => {
            component.providerForm.patchValue({ key: 'test', label: 'Test', baseUrl: 'not-a-url' });
            expect(component.providerForm.get('baseUrl')?.valid).toBe(false);
        });

        it('should be valid with all required fields', () => {
            component.providerForm.patchValue({ key: 'test', label: 'Test', baseUrl: 'https://api.test.com' });
            expect(component.providerForm.valid).toBe(true);
        });
    });

    describe('model form validation', () => {
        it('should be invalid when empty', () => {
            component.modelForm.reset({ key: '', label: '', active: true });
            expect(component.modelForm.invalid).toBe(true);
        });

        it('should require key without spaces', () => {
            component.modelForm.patchValue({ key: 'with space', label: 'Test' });
            expect(component.modelForm.get('key')?.valid).toBe(false);
        });

        it('should require label', () => {
            component.modelForm.patchValue({ key: 'test', label: '' });
            expect(component.modelForm.get('label')?.valid).toBe(false);
        });

        it('should be valid with required fields', () => {
            component.modelForm.patchValue({ key: 'test', label: 'Test' });
            expect(component.modelForm.valid).toBe(true);
        });
    });

    describe('toggleProvider', () => {
        it('should toggle provider expanded state', () => {
            expect(component.isProviderExpanded(1)).toBe(false);
            component.toggleProvider(1);
            expect(component.isProviderExpanded(1)).toBe(true);
            component.toggleProvider(1);
            expect(component.isProviderExpanded(1)).toBe(false);
        });
    });

    describe('toggleModel', () => {
        it('should toggle model expanded state', () => {
            expect(component.isModelExpanded(1)).toBe(false);
            component.toggleModel(1);
            expect(component.isModelExpanded(1)).toBe(true);
            component.toggleModel(1);
            expect(component.isModelExpanded(1)).toBe(false);
        });
    });

    describe('providerDialogTitle', () => {
        it('should show "New Provider" when creating', () => {
            component.openAddProviderDialog();
            expect(component.providerDialogTitle()).toContain('New Provider');
        });

        it('should show "Edit Provider" when editing', () => {
            mockProviderStore.providers.mockReturnValue([
                { id: 1, key: 'test', label: 'Test Provider', baseUrl: 'https://test.com', active: true, models: [] },
            ]);
            component.openEditProviderDialog({
                id: 1,
                key: 'test',
                label: 'Test Provider',
                baseUrl: 'https://test.com',
                active: true,
                models: [],
                modelsCount: 0,
                createdAt: '',
                updatedAt: '',
            });
            expect(component.providerDialogTitle()).toContain('Edit Provider');
            expect(component.providerDialogTitle()).toContain('Test Provider');
        });
    });

    describe('saveProvider', () => {
        it('should not save when form invalid', () => {
            component.providerForm.reset({ key: '', label: '', baseUrl: '', apiKey: '', active: true });
            component.saveProvider();
            expect(mockProviderStore.createProvider).not.toHaveBeenCalled();
        });
    });

    describe('saveModel', () => {
        it('should not save when form invalid', () => {
            component.modelForm.reset({ key: '', label: '', active: true });
            component.saveModel();
            expect(mockProviderStore.createModel).not.toHaveBeenCalled();
        });
    });

    describe('deleteProvider', () => {
        it('should open a permanent-delete confirm dialog', () => {
            component.deleteProvider(1);
            const conf = mockConfirmService.confirm.mock.calls.at(-1)![0];
            expect(conf.header).toBe('Delete Provider Permanently');
            expect(conf.message).toContain('cannot be undone');
        });

        it('should call store.deleteProvider and toast on accept', () => {
            component.deleteProvider(1);
            const conf = mockConfirmService.confirm.mock.calls.at(-1)![0];
            conf.accept();
            expect(mockProviderStore.deleteProvider).toHaveBeenCalledWith(1);
            expect(mockMessageService.add).toHaveBeenCalledWith(
                expect.objectContaining({
                    summary: 'Deleted',
                    detail: 'Provider has been permanently deleted.',
                }),
            );
        });
    });

    describe('setProviderActive / setModelActive', () => {
        it('should update provider active state via the store', () => {
            component.setProviderActive({ id: 1, active: true } as any, false);
            expect(mockProviderStore.updateProvider).toHaveBeenCalledWith(1, { active: false });
        });

        it('should skip the store when the state is unchanged', () => {
            mockProviderStore.updateProvider.mockClear();
            component.setProviderActive({ id: 1, active: true } as any, true);
            expect(mockProviderStore.updateProvider).not.toHaveBeenCalled();
        });

        it('should update model active state via the store', () => {
            component.setModelActive(7, { id: 2, active: false } as any, true);
            expect(mockProviderStore.updateModel).toHaveBeenCalledWith(7, 2, { active: true });
        });
    });

    describe('allModelsActive / setAllModelsActive', () => {
        const provider = {
            id: 1,
            models: [
                { id: 2, active: true },
                { id: 3, active: false },
            ],
        } as any;

        it('is true only when every model is active', () => {
            expect(component.allModelsActive({ id: 1, models: [{ active: true }] } as any)).toBe(true);
            expect(component.allModelsActive(provider)).toBe(false);
            expect(component.allModelsActive({ id: 1, models: [] } as any)).toBe(false);
        });

        it('sends only the models that differ', () => {
            component.setAllModelsActive(provider, true);
            expect(mockProviderStore.setModelsActive).toHaveBeenCalledWith([3], true);
        });

        it('skips the store when nothing differs', () => {
            mockProviderStore.setModelsActive.mockClear();
            component.setAllModelsActive(provider, false);
            expect(mockProviderStore.setModelsActive).toHaveBeenCalledWith([2], false);

            mockProviderStore.setModelsActive.mockClear();
            component.setAllModelsActive({ id: 1, models: [{ id: 2, active: false }] } as any, false);
            expect(mockProviderStore.setModelsActive).not.toHaveBeenCalled();
        });
    });

    describe('showInactive filter', () => {
        it('should show all providers by default and hide inactive when toggled off', () => {
            mockProviderStore.providers.mockReturnValue([
                { id: 1, active: true, models: [] },
                { id: 2, active: false, models: [] },
            ]);
            expect(component.llmProviders().map((p) => p.id)).toEqual([1, 2]);
            component.toggleShowInactive(false);
            expect(component.llmProviders().map((p) => p.id)).toEqual([1]);
        });

        it('should sort inactive providers to the bottom when shown', () => {
            mockProviderStore.providers.mockReturnValue([
                { id: 2, active: false, models: [] },
                { id: 1, active: true, models: [] },
                { id: 3, active: false, models: [] },
            ]);
            expect(component.llmProviders().map((p) => p.id)).toEqual([1, 2, 3]);
        });
    });

    describe('sortProviders', () => {
        const rows = () => [
            { id: 1, key: 'b', active: true, modelsCount: 2 },
            { id: 2, key: 'a', active: false, modelsCount: 9 },
            { id: 3, key: 'c', active: true, modelsCount: 1 },
        ];

        it('sorts by column but keeps inactive at the bottom', () => {
            const data = rows() as any;
            component.sortProviders({ data, field: 'key', order: 1 } as any);

            expect(data.map((p: any) => p.id)).toEqual([1, 3, 2]);
        });

        it('keeps inactive at the bottom in descending order too', () => {
            const data = rows() as any;
            component.sortProviders({ data, field: 'key', order: -1 } as any);

            expect(data.map((p: any) => p.id)).toEqual([3, 1, 2]);
        });

        it('restores active-first order when sorting is cleared', () => {
            const data = rows() as any;
            component.sortProviders({ data } as any);

            expect(data.map((p: any) => p.id)).toEqual([1, 3, 2]);
        });
    });

    describe('hardDeleteModel', () => {
        it('should call confirmService.confirm with a permanent-delete warning', () => {
            component.hardDeleteModel(1, 2);
            const conf = mockConfirmService.confirm.mock.calls.at(-1)![0];
            expect(conf.header).toBe('Delete Model Permanently');
            expect(conf.message).toContain('cannot be undone');
        });

        it('should call store.hardDeleteModel and toast on accept', () => {
            component.hardDeleteModel(1, 2);
            const conf = mockConfirmService.confirm.mock.calls.at(-1)![0];
            conf.accept();
            expect(mockProviderStore.hardDeleteModel).toHaveBeenCalledWith(1, 2);
            expect(mockMessageService.add).toHaveBeenCalledWith(
                expect.objectContaining({ summary: 'Deleted', detail: 'Model has been permanently deleted.' }),
            );
        });
    });

    describe('sync models dialog', () => {
        it('loads the catalog with nothing preselected', () => {
            let handler: { next: (res: any) => void; error: (err: any) => void };
            mockProviderService.getCatalog.mockReturnValue({ subscribe: (h: any) => (handler = h) });

            component.openSyncDialog({ id: 12, label: 'NVIDIA NIM' } as any);
            handler!.next({
                success: true,
                result: {
                    models: [
                        { key: 'nvidia/embed-x', status: 'new' },
                        { key: 'z-ai/glm-5.2', status: 'new' },
                        { key: 'openai/gpt-oss-20b', status: 'exists' },
                        { key: 'old/model', label: 'Old', status: 'unavailable' },
                    ],
                },
            });

            expect(mockProviderService.getCatalog).toHaveBeenCalledWith(12);
            expect(component.catalog().length).toBe(4);
            // no defaults — the admin selects explicitly
            expect(component.newSelectionCount()).toBe(0);
            expect(component.isKeySelected('nvidia/embed-x')).toBe(false);
            expect(component.isKeySelected('z-ai/glm-5.2')).toBe(false);
            expect(component.isKeySelected('openai/gpt-oss-20b')).toBe(false);
        });

        it('adds only selected new models and toasts the result', () => {
            component.syncProvider.set({ id: 12, label: 'NVIDIA NIM' } as any);
            component.catalog.set([
                { key: 'a', status: 'new' },
                { key: 'b', status: 'new' },
                { key: 'c', status: 'exists' },
            ]);
            component.selectedKeys.set(new Set(['a', 'c']));
            mockProviderService.syncModels.mockReturnValue({
                subscribe: (h: any) => h.next({ result: { added: 1, skipped: 0 } }),
            });

            component.addSelectedModels();

            expect(mockProviderService.syncModels).toHaveBeenCalledWith(12, ['a']);
            expect(mockMessageService.add).toHaveBeenCalledWith(expect.objectContaining({ summary: 'Models Added' }));
        });

        it('search is token-based: "nemo 35" finds nemotron-3.5 models (order-free, partial)', () => {
            component.catalog.set([
                { key: 'nvidia/nemotron-3.5-lightning-30b-a3b', status: 'new' },
                { key: 'nvidia/nemotron-3.5-content-safety', status: 'new' },
                { key: 'openai/gpt-oss-20b', status: 'new' },
                { key: 'nvidia/nemotron-nano-9b-v2', status: 'new' },
            ]);

            component.catalogSearch.set('nemo 35');
            expect(
                component
                    .filteredCatalog()
                    .map((m) => m.key)
                    .sort(),
            ).toEqual(['nvidia/nemotron-3.5-content-safety', 'nvidia/nemotron-3.5-lightning-30b-a3b']);

            component.catalogSearch.set('nemo 3.5');
            expect(component.filteredCatalog().length).toBe(2);

            component.catalogSearch.set('nemotron 35');
            expect(component.filteredCatalog().length).toBe(2);

            component.catalogSearch.set('lightning 30b');
            expect(component.filteredCatalog().map((m) => m.key)).toEqual(['nvidia/nemotron-3.5-lightning-30b-a3b']);

            component.catalogSearch.set('content safety');
            expect(component.filteredCatalog().map((m) => m.key)).toEqual(['nvidia/nemotron-3.5-content-safety']);
        });

        it('filters the catalog by search text (key or label)', () => {
            component.catalog.set([
                { key: 'nvidia/embed-x', status: 'new' },
                { key: 'z-ai/glm-5.2', status: 'new' },
                { key: 'openai/gpt-oss-20b', status: 'exists' },
                { key: 'old/model', label: 'GPT Legacy', status: 'unavailable' },
            ]);

            expect(component.filteredCatalog().length).toBe(4);

            component.catalogSearch.set('gpt');
            expect(
                component
                    .filteredCatalog()
                    .map((m) => m.key)
                    .sort(),
            ).toEqual(['old/model', 'openai/gpt-oss-20b']);

            component.catalogSearch.set('');
            component.catalogSearch.set('embed');
            expect(component.filteredCatalog().map((m) => m.key)).toEqual(['nvidia/embed-x']);
        });

        it('groups selectable models by owned_by (fallback: key prefix) and supports collapse', () => {
            component.catalog.set([
                { key: 'nvidia/a', owned_by: 'nvidia', status: 'new' },
                { key: 'nvidia/b', owned_by: 'nvidia', status: 'exists' },
                { key: 'poolside/x:free', status: 'new' },
                { key: 'old/model', label: 'Old', status: 'unavailable' },
            ]);

            const groups = component.catalogGroups();
            expect(groups.map((g) => g.name)).toEqual(['nvidia', 'poolside']);
            expect(groups[0].items.length).toBe(2);
            expect(groups[0].items.every((m) => m.status !== 'unavailable')).toBe(true);

            component.toggleGroup('nvidia');
            expect(component.isGroupCollapsed('nvidia')).toBe(true);
            component.toggleGroup('nvidia');
            expect(component.isGroupCollapsed('nvidia')).toBe(false);
        });

        it('strips the cosmetic ~ variant prefix for display only', () => {
            component.catalog.set([{ key: '~z-ai/glm-latest', status: 'new' }]);

            expect(component.displayKey('~z-ai/glm-latest')).toBe('z-ai/glm-latest');
            expect(component.catalogGroups()[0].name).toBe('z-ai');
            // the raw key is untouched for selection/API use
            expect(component.catalog()[0].key).toBe('~z-ai/glm-latest');
        });

        it('shows the short model name in rows (group header carries the publisher)', () => {
            expect(component.shortModelName('@cf/black-forest-labs/flux-1-schnell')).toBe('flux-1-schnell');
            expect(component.shortModelName('nvidia/nemotron-3.5-lightning-30b-a3b')).toBe(
                'nemotron-3.5-lightning-30b-a3b',
            );
            expect(component.shortModelName('agnes-2.0-flash')).toBe('agnes-2.0-flash'); // no prefix
        });

        it('groups @cf/-prefixed keys by their real publisher, not by the namespace', () => {
            component.catalog.set([
                { key: '@cf/meta/llama-2', status: 'new' },
                { key: '@cf/openai/gpt-oss-120b', status: 'new' },
                { key: '@cf/black-forest-labs/flux-1-schnell', status: 'new' },
            ]);

            expect(component.catalogGroups().map((g) => g.name)).toEqual(['black-forest-labs', 'meta', 'openai']);
        });

        it('prefers the key vendor over a constant owned_by (GMI-style catalogs)', () => {
            component.catalog.set([
                { key: 'anthropic/claude-fable-5', owned_by: 'GMI Cloud', status: 'new' },
                { key: 'deepseek-ai/deepseek-chat', owned_by: 'GMI Cloud', status: 'new' },
                { key: 'some-flat-model', owned_by: 'GMI Cloud', status: 'new' },
            ]);

            expect(component.catalogGroups().map((g) => g.name)).toEqual([
                'anthropic',
                'deepseek-ai',
                'GMI Cloud', // prefix-less key falls back to owned_by
            ]);
        });

        it('select/deselect all only touch the filtered (visible) new models', () => {
            component.catalog.set([
                { key: 'z-ai/glm-5.2', status: 'new' },
                { key: 'z-ai/glm-latest', status: 'new' },
                { key: 'openai/gpt-oss-20b', status: 'new' },
            ]);

            component.catalogSearch.set('glm');
            component.selectAllNew();
            expect(component.isKeySelected('z-ai/glm-5.2')).toBe(true);
            expect(component.isKeySelected('z-ai/glm-latest')).toBe(true);
            expect(component.isKeySelected('openai/gpt-oss-20b')).toBe(false);

            component.deselectAll();
            expect(component.isKeySelected('z-ai/glm-5.2')).toBe(false);
            expect(component.isKeySelected('z-ai/glm-latest')).toBe(false);
        });

        it('testAllModels starts a run and toasts; no-op with zero active text models', () => {
            const provider = {
                id: 12,
                label: 'NVIDIA NIM',
                models: [
                    { active: true, capability: 'text' },
                    { active: false, capability: 'text' },
                ],
            } as any;
            mockProviderService.testAllModels.mockReturnValue({
                subscribe: (h: any) => h.next({ result: { tested: 1 } }),
            });

            component.testAllModels(provider);
            expect(mockProviderService.testAllModels).toHaveBeenCalledWith(12);
            expect(component.testingAllProviderIds().has(12)).toBe(true);
            expect(mockMessageService.add).toHaveBeenCalledWith(
                expect.objectContaining({ summary: 'Test Run Started' }),
            );
            component.testingAllProviderIds.set(new Set()); // stop the background poll chain
            mockProviderService.testAllStatus.mockReturnValue({
                subscribe: { next: vi.fn(), error: vi.fn() } as any,
            });

            mockMessageService.add.mockClear();
            const emptyProvider = { id: 13, label: 'Empty', models: [] } as any;
            component.testAllModels(emptyProvider);
            expect(mockProviderService.testAllModels).toHaveBeenCalledTimes(1);
            expect(mockMessageService.add).toHaveBeenCalledWith(
                expect.objectContaining({ summary: 'Nothing to test' }),
            );
        });

        it('testAllModels runs for a provider whose active models are image/video (capability-aware)', () => {
            mockProviderService.testAllModels.mockClear();
            mockProviderService.testAllModels.mockReturnValue({ subscribe: (h: any) => h.next({ result: { tested: 2 } }) });

            const provider = { id: 14, models: [{ active: true, capability: 'image' }, { active: true, capability: 'video' }] } as any;
            component.testAllModels(provider);

            expect(mockProviderService.testAllModels).toHaveBeenCalledWith(14);
            expect(mockMessageService.add).toHaveBeenCalledWith(
                expect.objectContaining({ summary: 'Test Run Started', detail: 'Testing 2 models in the background — results appear as they finish.' }),
            );
            component.testingAllProviderIds.set(new Set()); // stop the background poll chain
        });

        it('iconForCapability returns the row-level test icon that matches the model capability', () => {
            expect(component.iconForCapability('text')).toBe('ph ph-lightning');
            expect(component.iconForCapability('image')).toBe('ph ph-image');
            expect(component.iconForCapability('video')).toBe('ph ph-play');
            expect(component.iconForCapability('embedding')).toBe('ph ph-lightning');
            expect(component.iconForCapability(undefined)).toBe('ph ph-lightning');
        });

        it('capabilityLabel is display-safe for old / missing capability rows', () => {
            expect(component.capabilityLabel('image')).toBe('image');
            expect(component.capabilityLabel(null)).toBe('');
            expect(component.capabilityLabel(undefined)).toBe('');
        });

        it('runs model tests in parallel: a second test must not clear the first', () => {
            const handlers: any[] = [];
            mockProviderService.testModel.mockClear();
            mockProviderService.testModel.mockImplementation(
                () =>
                    ({
                        subscribe: (h: any) => {
                            handlers.push(h);
                        },
                    }) as any,
            );

            component.testModel(1);
            component.testModel(2);

            expect(mockProviderService.testModel).toHaveBeenCalledTimes(2);
            expect(component.testingModelIds().has(1)).toBe(true);
            expect(component.testingModelIds().has(2)).toBe(true);

            // The first model finishes — only its own spinner may stop.
            handlers[0].next({ success: true });
            expect(component.testingModelIds().has(1)).toBe(false);
            expect(component.testingModelIds().has(2)).toBe(true);

            // Clicking a model that is already testing must not fire a second call.
            component.testModel(2);
            expect(mockProviderService.testModel).toHaveBeenCalledTimes(2);

            // Restore the shared default — this spec has no global mock reset.
            mockProviderService.testModel.mockImplementation(() => ({ subscribe: vi.fn() }));
        });

        it('runs test-all runs in parallel: a second provider must not clear the first', () => {
            mockProviderService.testAllModels.mockClear();
            mockProviderService.testAllModels.mockReturnValue({ subscribe: (h: any) => h.next({ result: { tested: 1 } }) });

            const a = { id: 12, models: [{ active: true, capability: 'text' }] } as any;
            const b = { id: 13, models: [{ active: true, capability: 'text' }] } as any;

            component.testAllModels(a);
            component.testAllModels(b);

            expect(mockProviderService.testAllModels).toHaveBeenCalledTimes(2);
            expect(component.testingAllProviderIds().has(12)).toBe(true);
            expect(component.testingAllProviderIds().has(13)).toBe(true);

            // Clicking a provider that is already running must not fire a second run.
            component.testAllModels(a);
            expect(mockProviderService.testAllModels).toHaveBeenCalledTimes(2);

            component.ngOnDestroy(); // clears the poll chain this test started
        });

        it('stops polling after destroy instead of reloading the store from a dead component', async () => {
            vi.useFakeTimers();
            mockProviderService.testAllModels.mockClear();
            mockProviderService.testAllModels.mockReturnValue({ subscribe: (h: any) => h.next({ result: { tested: 1 } }) });
            mockProviderService.testAllStatus.mockClear();
            mockProviderService.testAllStatus.mockReturnValue({
                subscribe: (h: any) => h.next({ result: { running: true } }),
            });

            component.testAllModels({ id: 12, models: [{ active: true, capability: 'text' }] } as any);
            expect(component.testingAllProviderIds().has(12)).toBe(true);

            mockProviderStore.reload.mockClear();
            component.ngOnDestroy();
            await vi.advanceTimersByTimeAsync(60_000);

            // Four more poll rounds would have fired in that window; none may run.
            expect(mockProviderService.testAllStatus).not.toHaveBeenCalled();
            expect(mockProviderStore.reload).not.toHaveBeenCalled();

            vi.useRealTimers();
            mockProviderService.testAllStatus.mockReturnValue({ subscribe: vi.fn() });
        });

        it('excludes unavailable models from groups', () => {
            component.catalog.set([
                { key: 'a', status: 'new' },
                { key: 'dead/1', label: 'Dead 1', status: 'unavailable' },
                { key: 'dead/2', status: 'unavailable' },
            ]);

            const keys = component
                .catalogGroups()
                .map((g) => g.items.map((m) => m.key))
                .flat();
            expect(keys).toEqual(['a']);
        });

        it('deselect only affects new models (existing stay checked/disabled)', () => {
            component.catalog.set([
                { key: 'a', status: 'new' },
                { key: 'c', status: 'exists' },
            ]);
            component.selectedKeys.set(new Set(['a', 'c']));

            component.deselectAll();

            expect(component.isKeySelected('a')).toBe(false);
            expect(component.isKeySelected('c')).toBe(true);
        });
    });

    describe('copyModelKey', () => {
        const clipboardWrite = vi.fn(() => Promise.resolve());

        beforeEach(() => {
            vi.useFakeTimers();
            Object.defineProperty(navigator, 'clipboard', {
                value: { writeText: clipboardWrite },
                configurable: true,
            });
        });

        afterEach(() => {
            vi.useRealTimers();
            clipboardWrite.mockClear();
            mockMessageService.add.mockClear();
        });

        it('copies the key and stops the click from reaching the expandable row', async () => {
            const event = { stopPropagation: vi.fn() } as unknown as Event;

            component.copyModelKey(event, 'openai/gpt-5');
            await vi.advanceTimersByTimeAsync(0);

            expect(event.stopPropagation).toHaveBeenCalled();
            expect(clipboardWrite).toHaveBeenCalledWith('openai/gpt-5');
            expect(component.copiedModelKey()).toBe('openai/gpt-5');
        });

        it('swaps the icon back after the 5s confirmation window', async () => {
            component.copyModelKey({ stopPropagation: vi.fn() } as unknown as Event, 'openai/gpt-5');
            await vi.advanceTimersByTimeAsync(0);

            expect(component.copiedModelKey()).toBe('openai/gpt-5');

            await vi.advanceTimersByTimeAsync(5000);

            expect(component.copiedModelKey()).toBeNull();
        });
    });

    describe('model statistics', () => {
        // Deliberately out of order: fast-model has the lowest mean real latency, unused-model has
        // no real calls at all, and slow-model wins on reliability despite being slowest.
        const statsData = {
            minimumSample: 3,
            fastestId: 'openrouter::fast-model',
            mostStableId: 'openrouter::slow-model',
            rows: [
                {
                    id: 'openrouter::slow-model',
                    providerKey: 'openrouter',
                    modelKey: 'slow-model',
                    label: 'Slow',
                    active: true,
                    ping: null,
                    real: { runs: 10, successRate: 100, avgMs: 9000, minMs: 7000, toolCallReliability: 88 },
                    lastCallAt: '2026-09-13T11:00:00.000Z',
                    rankingBasis: 'real',
                },
                {
                    id: 'openrouter::fast-model',
                    providerKey: 'openrouter',
                    modelKey: 'fast-model',
                    label: 'Fast',
                    active: true,
                    ping: { runs: 5, successRate: 100, avgMs: 300, minMs: 200, toolCallReliability: null },
                    real: { runs: 10, successRate: 100, avgMs: 1200, minMs: 900, toolCallReliability: null },
                    lastCallAt: '2026-09-13T10:00:00.000Z',
                    rankingBasis: 'real',
                },
                {
                    id: 'openrouter::unused-model',
                    providerKey: 'openrouter',
                    modelKey: 'unused-model',
                    label: 'Unused',
                    active: true,
                    ping: null,
                    real: null,
                    lastCallAt: null,
                    rankingBasis: null,
                },
            ],
        };

        it('loads the statistics on init, so the row badges have data', () => {
            expect(mockProviderStore.loadModelStats).toHaveBeenCalled();
        });

        it('starts on the providers view', () => {
            expect(component.activeTab()).toBe('providers');
        });

        it('ranks by mean real latency and sinks unmeasured models to the bottom', () => {
            mockProviderStore.modelStats.mockReturnValue(statsData);

            expect(component.statsRows().map((row) => row.id)).toEqual([
                'openrouter::fast-model',
                'openrouter::slow-model',
                'openrouter::unused-model',
            ]);
        });

        it('sinks rows with no label (no longer configured) below everything else', () => {
            mockProviderStore.modelStats.mockReturnValue({
                ...statsData,
                rows: [
                    { ...statsData.rows[0], label: null },
                    ...statsData.rows.slice(1),
                ],
            });

            const ids = component.statsRows().map((row) => row.id);
            expect(ids[ids.length - 1]).toBe('openrouter::slow-model');
        });

        it('flags the fastest and most stable models from the backend leaderboard', () => {
            mockProviderStore.modelStats.mockReturnValue(statsData);

            expect(component.isFastest('openrouter', 'fast-model')).toBe(true);
            expect(component.isFastest('openrouter', 'slow-model')).toBe(false);
            expect(component.isMostStable('openrouter', 'slow-model')).toBe(true);
            expect(component.isMostStable('openrouter', 'fast-model')).toBe(false);
        });

        it('renders the statistics panel once that view is selected', () => {
            mockProviderStore.modelStats.mockReturnValue(statsData);

            component.activeTab.set('stats');
            fixture.detectChanges();

            const text = fixture.nativeElement.textContent as string;
            expect(text).toContain('Fast');
            expect(text).toContain('Fastest');
            expect(text).toContain('Most stable');
            // The ping column is labelled separately from the real-call column — the whole point.
            expect(text).toContain('Ping');
            expect(text).toContain('Real');
        });

        it('makes every statistics column sortable', () => {
            mockProviderStore.modelStats.mockReturnValue(statsData);

            component.activeTab.set('stats');
            fixture.detectChanges();

            // PrimeNG only adds this class to a header when the sort directive is attached, so a
            // column that loses its pSortableColumn fails here rather than silently not sorting.
            const headers = Array.from(fixture.nativeElement.querySelectorAll('.stats-table th')) as HTMLElement[];

            expect(headers.length).toBe(10);
            expect(headers.filter((th) => th.classList.contains('p-datatable-sortable-column')).length).toBe(10);
        });

        it('renders tool-call reliability under the real-call columns, and a dash when there is no sample', () => {
            mockProviderStore.modelStats.mockReturnValue(statsData);

            component.activeTab.set('stats');
            fixture.detectChanges();

            const text = fixture.nativeElement.textContent as string;
            // Header announces the metric so the column is discoverable before any data loads.
            expect(text).toContain('Real · tools');
            // slow-model carries a measured 88%; fast-model never requested tools — a dash, not 0%.
            expect(text).toContain('88%');
            expect(text.match(/88%/g)).toHaveLength(1);
        });

        it('switches views from the toolbar buttons, and hides the list-only controls on statistics', () => {
            // The list-only toolbar row is gated on pageState Ready, so the default Empty mock
            // never renders it — recreate the fixture with a Ready store to exercise the real row.
            mockProviderStore.pageState.mockReturnValue(PageStates.Ready);
            mockProviderStore.providers.mockReturnValue([
                { id: 1, key: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', active: true, models: [] },
            ]);
            fixture.destroy();
            fixture = TestBed.createComponent(LlmProvidersManagement);
            component = fixture.componentInstance;
            fixture.detectChanges();

            // Selects the real tabs inside the PrimeNG view switch, so a renamed wrapper
            // or a dropped tab fails here rather than silently passing.
            const toggleButtons = Array.from(
                fixture.nativeElement.querySelectorAll('p-tabs p-tab'),
            ) as HTMLButtonElement[];
            expect(toggleButtons.length).toBe(2);

            // Providers view: search, the state filter and the summary row all share the page.
            expect(fixture.nativeElement.querySelector('.toolbar-row .form-field-has-icon')).not.toBeNull();
            expect(fixture.nativeElement.querySelector('.caption-row .mode-toggle')).not.toBeNull();
            expect(fixture.nativeElement.querySelector('.summary-row')).not.toBeNull();

            // Empty filtered table renders the in-table empty state (same pattern as strain-hunter).
            // Filtering is a computed over the search signal rather than PrimeNG's internal
            // filter pass, so it runs synchronously in TestBed: a hopeless query empties the
            // table and the empty state appears, and clearing restores the rows.
            const searchInput = fixture.nativeElement.querySelector('.toolbar-row .form-field-has-icon input') as HTMLInputElement;
            searchInput.value = 'zzz-no-such-provider';
            searchInput.dispatchEvent(new Event('input'));
            fixture.detectChanges();

            expect(component.globalFilter()).toBe('zzz-no-such-provider');
            expect(fixture.nativeElement.querySelector('.table-empty-state')).not.toBeNull();

            component.clearGlobalFilter();
            expect(component.globalFilter()).toBe('');
            fixture.detectChanges();
            expect(fixture.nativeElement.querySelector('.table-empty-state')).toBeNull();

            // Caption tags: the leaderboard winners render beside the count once stats load.
            mockProviderStore.modelStats.mockReturnValue(statsData);
            fixture.detectChanges();

            const captionRow = fixture.nativeElement.querySelector('.caption-row') as HTMLElement;
            expect(captionRow).not.toBeNull();
            expect(captionRow.querySelector('.mode-toggle')).not.toBeNull();
            expect(captionRow.querySelector('.caption-tags')).not.toBeNull();
            expect(captionRow.querySelector('.badge-warning')?.textContent).toContain('Fast');
            expect(captionRow.querySelector('.badge-success')?.textContent).toContain('Slow');
            // Two-line tags: provider above, model below.
            expect(captionRow.querySelector('.badge-warning .badge-subtitle')?.textContent).toContain(
                'openrouter',
            );
            expect(captionRow.querySelector('.badge-warning .badge-title')?.textContent).toContain('Fast');

            toggleButtons[1].click();
            fixture.detectChanges();

            expect(component.activeTab()).toBe('stats');
            expect(fixture.nativeElement.querySelector('.caption-row .mode-toggle')).toBeNull();
            expect(fixture.nativeElement.querySelector('.stats-panel')).not.toBeNull();
            // The statistics view has its own search box bound to the same global filter.
            expect(fixture.nativeElement.querySelector('.stats-panel .form-field-has-icon input')).not.toBeNull();

            toggleButtons[0].click();
            fixture.detectChanges();

            expect(component.activeTab()).toBe('providers');
            expect(fixture.nativeElement.querySelector('.toolbar-row .form-field-has-icon')).not.toBeNull();
            expect(fixture.nativeElement.querySelector('.caption-row .mode-toggle')).not.toBeNull();
            expect(fixture.nativeElement.querySelector('.stats-panel')).toBeNull();
        });

        it('switches the inactive filter from the mode toggle', () => {
            mockProviderStore.pageState.mockReturnValue(PageStates.Ready);
            fixture.destroy();
            fixture = TestBed.createComponent(LlmProvidersManagement);
            component = fixture.componentInstance;
            fixture.detectChanges();

            const buttons = Array.from(
                fixture.nativeElement.querySelectorAll('.caption-row .mode-toggle button'),
            ) as HTMLButtonElement[];
            expect(buttons.length).toBe(2);

            buttons[1].click();
            fixture.detectChanges();

            expect(component.showInactive()).toBe(true);
            expect(
                fixture.nativeElement.querySelector('.caption-row .mode-toggle'),
            ).not.toBeNull();
        });

        it('shows the provider count in the summary row', () => {
            mockProviderStore.pageState.mockReturnValue(PageStates.Ready);
            fixture.destroy();
            fixture = TestBed.createComponent(LlmProvidersManagement);
            component = fixture.componentInstance;
            fixture.detectChanges();

            const count = component.llmProviders().length;
            const value = fixture.nativeElement.querySelector('.summary-row .summary-value') as HTMLElement;
            const label = fixture.nativeElement.querySelector('.summary-row .summary-label') as HTMLElement;

            expect((value?.textContent ?? '').trim()).toBe(`${count}`);
            expect((label?.textContent ?? '').trim()).toBe('ספקים');
        });

        it('falls back to the raw key when a model is no longer configured', () => {
            mockProviderStore.modelStats.mockReturnValue({
                ...statsData,
                rows: [{ ...statsData.rows[2], label: null }],
            });

            expect(component.statsLabel(component.statsRows().find((row) => row.id === 'openrouter::unused-model')!)).toBe(
                'unused-model',
            );
        });

        it('writes ?view= to the URL when the view changes', () => {
            component.setActiveTab('stats');

            expect(component.activeTab()).toBe('stats');
            expect(mockRouter.navigate).toHaveBeenCalledWith(
                [],
                expect.objectContaining({ queryParams: { view: 'stats' } }),
            );
        });

        it('ignores invalid tab values without touching the URL', () => {
            mockRouter.navigate.mockClear();

            component.setActiveTab('nope');

            expect(component.activeTab()).toBe('providers');
            expect(mockRouter.navigate).not.toHaveBeenCalled();
        });

        it('restores the view from ?view= on init', () => {
            queryParamMap$.next(new Map([['view', 'stats']]));
            fixture.destroy();
            fixture = TestBed.createComponent(LlmProvidersManagement);
            component = fixture.componentInstance;
            fixture.detectChanges();

            expect(component.activeTab()).toBe('stats');
        });
    });

    describe('global search across all tables', () => {
        const searchableProviders = [
            {
                id: 1,
                key: 'openai',
                label: 'OpenAI',
                baseUrl: 'https://api.openai.com',
                active: true,
                createdAt: '2026-01-01',
                updatedAt: '2026-01-01',
                models: [
                    {
                        id: 11,
                        key: 'openai/gpt-4o',
                        label: 'GPT-4o',
                        active: true,
                        sortOrder: 0,
                        capability: 'text',
                        providerId: 1,
                        createdAt: '',
                        updatedAt: '',
                        testResults: [
                            { id: 101, createdAt: '2026-09-01', responseTimeMs: 800, status: 'success', errorMessage: null },
                            { id: 102, createdAt: '2026-09-02', responseTimeMs: 0, status: 'error', errorMessage: 'rate limited, retry later' },
                        ],
                    },
                    {
                        id: 12,
                        key: 'openai/dall-e-3',
                        label: 'DALL-E 3',
                        active: true,
                        sortOrder: 1,
                        capability: 'image',
                        providerId: 1,
                        createdAt: '',
                        updatedAt: '',
                        testResults: [],
                    },
                ],
            },
            {
                id: 2,
                key: 'anthropic',
                label: 'Anthropic',
                baseUrl: 'https://api.anthropic.com',
                active: true,
                createdAt: '2026-01-01',
                updatedAt: '2026-01-01',
                models: [
                    {
                        id: 21,
                        key: 'anthropic/claude-opus',
                        label: 'Claude Opus',
                        active: true,
                        sortOrder: 0,
                        capability: 'text',
                        providerId: 2,
                        createdAt: '',
                        updatedAt: '',
                        testResults: [],
                    },
                ],
            },
        ];

        const searchableStats = {
            minimumSample: 3,
            fastestId: 'openai::gpt-4o',
            mostStableId: 'openai::gpt-4o',
            rows: [
                {
                    id: 'openai::gpt-4o',
                    providerKey: 'openai',
                    modelKey: 'openai/gpt-4o',
                    label: 'GPT-4o',
                    active: true,
                    ping: { runs: 4, successRate: 100, avgMs: 250, minMs: 200, toolCallReliability: null },
                    real: { runs: 8, successRate: 50, avgMs: 800, minMs: 700, toolCallReliability: 75 },
                    lastCallAt: '2026-09-13T11:00:00.000Z',
                    rankingBasis: 'real',
                },
                {
                    id: 'anthropic::opus',
                    providerKey: 'anthropic',
                    modelKey: 'anthropic/claude-opus',
                    label: 'Claude Opus',
                    active: true,
                    ping: null,
                    real: null,
                    lastCallAt: null,
                    rankingBasis: null,
                },
            ],
        };

        beforeEach(() => {
            // Mocks first, fixture second: llmProviders() is a computed over a plain mock
            // function (zero signal deps), so a detectChanges before the mocks are set would
            // evaluate and cache stale rows for the whole test. Same pattern as the view
            // tests above — set the store, then recreate the component on top of it.
            mockProviderStore.providers.mockReturnValue(searchableProviders);
            mockProviderStore.modelStats.mockReturnValue(searchableStats);
            fixture.destroy();
            fixture = TestBed.createComponent(LlmProvidersManagement);
            component = fixture.componentInstance;
            fixture.detectChanges();
        });

        afterEach(() => {
            component.globalFilter.set('');
            mockProviderStore.providers.mockReturnValue([]);
            mockProviderStore.modelStats.mockReturnValue(null);
        });

        it('returns everything when the query is empty', () => {
            expect(component.filteredProviders().length).toBe(2);
            expect(component.filteredProviders()[0].models.length).toBe(2);
            expect(component.filteredStatsRows().length).toBe(2);
        });

        it('matches a provider by its own columns and keeps the whole roster', () => {
            component.globalFilter.set('api.openai');

            const visible = component.filteredProviders();
            expect(visible.map((p) => p.key)).toEqual(['openai']);
            expect(visible[0].models.length).toBe(2);
            expect(visible[0].modelsCount).toBe(2);
        });

        it('narrows to the matching models when only a model hits', () => {
            component.globalFilter.set('dall');

            const visible = component.filteredProviders();
            expect(visible.map((p) => p.key)).toEqual(['openai']);
            expect(visible[0].models.map((m) => m.key)).toEqual(['openai/dall-e-3']);
            expect(visible[0].modelsCount).toBe(1);
        });

        it('matches model capability and performance columns', () => {
            component.globalFilter.set('image');

            const visible = component.filteredProviders();
            expect(visible.map((p) => p.key)).toEqual(['openai']);
            expect(visible[0].models.map((m) => m.key)).toEqual(['openai/dall-e-3']);
        });

        it('finds providers through test-result log output and narrows to the matching results', () => {
            component.globalFilter.set('rate limited');

            const visible = component.filteredProviders();
            expect(visible.map((p) => p.key)).toEqual(['openai']);
            expect(visible[0].models.map((m) => m.key)).toEqual(['openai/gpt-4o']);
            expect(visible[0].models[0].testResults!.map((r) => r.id)).toEqual([102]);
        });

        it('searches token-wise, order-free and punctuation-insensitive', () => {
            component.globalFilter.set('gpt 4o');

            const visible = component.filteredProviders();
            expect(visible.map((p) => p.key)).toEqual(['openai']);
            expect(visible[0].models.map((m) => m.key)).toEqual(['openai/gpt-4o']);
        });

        it('returns no providers when nothing matches', () => {
            component.globalFilter.set('zzz-no-such-thing');

            expect(component.filteredProviders()).toEqual([]);
        });

        it('searches every statistics column, both measurement sources', () => {
            component.globalFilter.set('9000');
            expect(component.filteredStatsRows()).toEqual([]);

            component.globalFilter.set('800');
            expect(component.filteredStatsRows().map((row) => row.id)).toEqual(['openai::gpt-4o']);

            component.globalFilter.set('250');
            expect(component.filteredStatsRows().map((row) => row.id)).toEqual(['openai::gpt-4o']);

            component.globalFilter.set('11:00');
            expect(component.filteredStatsRows().map((row) => row.id)).toEqual(['openai::gpt-4o']);
        });

        it('matches statistics rows by model label', () => {
            component.globalFilter.set('opus');

            expect(component.filteredStatsRows().map((row) => row.id)).toEqual(['anthropic::opus']);
        });

        it('returns no statistics rows when nothing matches', () => {
            component.globalFilter.set('zzz-no-such-thing');

            expect(component.filteredStatsRows()).toEqual([]);
        });
    });
});
