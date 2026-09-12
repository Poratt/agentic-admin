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
        softDeleteModel: vi.fn(),
        hardDeleteModel: vi.fn(),
        deleteTestResult: vi.fn(),
        deleteAllTestResults: vi.fn(),
        setDefaultModel: vi.fn(),
        reload: vi.fn(),
    };

    const mockProviderService = {
        testModel: vi.fn(() => ({ subscribe: vi.fn() })),
    };

    const mockConfirmService = {
        confirm: vi.fn(),
    };

    const mockMessageService = {
        add: vi.fn(),
    };

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [LlmProvidersManagement, ReactiveFormsModule],
            providers: [
                provideZonelessChangeDetection(),
                { provide: AuthStore, useValue: mockAuthStore },
                { provide: LlmProviderStore, useValue: mockProviderStore },
                { provide: LlmProviderService, useValue: mockProviderService },
                { provide: ConfirmationService, useValue: mockConfirmService },
                { provide: MessageService, useValue: mockMessageService },
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
        it('should return 0ms for falsy value', () => {
            expect(component.formatLatency(0)).toBe('0ms');
            expect(component.formatLatency(undefined as any)).toBe('0ms');
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

    describe('showInactive filter', () => {
        it('should hide inactive providers by default and show them when toggled', () => {
            mockProviderStore.providers.mockReturnValue([
                { id: 1, active: true, models: [] },
                { id: 2, active: false, models: [] },
            ]);
            expect(component.llmProviders().map((p) => p.id)).toEqual([1]);
            component.toggleShowInactive(true);
            expect(component.llmProviders().map((p) => p.id)).toEqual([1, 2]);
        });

        it('should sort inactive providers to the bottom when shown', () => {
            mockProviderStore.providers.mockReturnValue([
                { id: 2, active: false, models: [] },
                { id: 1, active: true, models: [] },
                { id: 3, active: false, models: [] },
            ]);
            component.toggleShowInactive(true);
            expect(component.llmProviders().map((p) => p.id)).toEqual([1, 2, 3]);
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
});
