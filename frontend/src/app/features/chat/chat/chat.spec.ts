import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';
import { Chat } from './chat';
import { ChatService } from '../../../core/services/chat.service';
import { ChatStore } from '../../../core/store/chat.store';
import { UsersStore } from '../../../core/store/users.store';
import { AuthStore } from '../../../core/store/auth.store';
import { LlmProviderStore } from '../../../core/store/llm-provider.store';
import { LlmProviderService } from '../../../core/services/llm-provider.service';

describe('Chat', () => {
    let component: Chat;
    let fixture: ComponentFixture<Chat>;

    const mockChatService = {
        sendMessageStream: vi.fn(() => ({ subscribe: vi.fn() })),
        getSessionMessages: vi.fn(() => ({ subscribe: vi.fn() })),
        getMessageImages: vi.fn(() => ({ subscribe: vi.fn() })),
        deleteMessage: vi.fn(() => ({ subscribe: vi.fn() })),
        confirmAction: vi.fn(() => ({ subscribe: vi.fn() })),
    };

    const mockChatStore = {
        currentSessionId: vi.fn(() => null),
        sessions: vi.fn(() => []),
        clearCurrentSession: vi.fn(),
        createSessionForMessage: vi.fn(() => ({ subscribe: vi.fn() })),
        reload: vi.fn(),
    };

    const mockUsersStore = {
        currentUserProfile: vi.fn(() => null),
    };

    const mockAuthStore = {
        user: vi.fn(() => null),
        userRole: vi.fn(() => null),
    };

    const mockLlmProviderStore = {
        providers: vi.fn(() => []),
        defaultModelId: vi.fn(() => null),
        loadUserDefaultModel: vi.fn(),
        reload: vi.fn(),
        setDefaultModel: vi.fn(),
        chatModels: vi.fn(() => []),
    };

    const mockLlmProviderService = {};

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
            imports: [Chat, ReactiveFormsModule],
            providers: [
                provideZonelessChangeDetection(),
                provideRouter([]),
                { provide: ChatService, useValue: mockChatService },
                { provide: ChatStore, useValue: mockChatStore },
                { provide: UsersStore, useValue: mockUsersStore },
                { provide: AuthStore, useValue: mockAuthStore },
                { provide: LlmProviderStore, useValue: mockLlmProviderStore },
                { provide: LlmProviderService, useValue: mockLlmProviderService },
            ],
        }).compileComponents();

        fixture = TestBed.createComponent(Chat);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    describe('model picker', () => {
        beforeEach(() => {
            mockLlmProviderStore.chatModels.mockReturnValue([
                { label: 'P1', items: [{ id: 7, label: 'M7', capability: 'text' }] },
            ] as any);
        });

        it('resolves the selected model from the form value', () => {
            component.chatForm.patchValue({ model: 7 });

            expect(component.chatForm.get('model')?.value).toBe(7);
            expect(component.models().length).toBe(1);
            expect(component.selectedModel()?.label).toBe('M7');
        });

        it('tiered-menu command updates the displayed model', () => {
            const cmd = component.modelMenuItems()[0].items![0].command;
            cmd!({} as any);

            expect(component.selectedModel()?.label).toBe('M7');
        });
    });

    describe('canSend', () => {
        it('should return false when prompt is empty', () => {
            component.promptText.set('');
            expect(component.canSend()).toBe(false);
        });

        it('should return true when prompt has content', () => {
            component.promptText.set('hello');
            expect(component.canSend()).toBe(true);
        });

        it('should return false when loading', () => {
            component.promptText.set('hello');
            component.loading.set(true);
            expect(component.canSend()).toBe(false);
        });

        it('should return false when historyLoading', () => {
            component.promptText.set('hello');
            component.historyLoading.set(true);
            expect(component.canSend()).toBe(false);
        });

        it('should return true when has image even without text', () => {
            component.promptText.set('');
            component.selectedImageBase64.set('data:image/png;base64,abc');
            expect(component.canSend()).toBe(true);
        });

        it('should return false when prompt is whitespace only', () => {
            component.promptText.set('   ');
            expect(component.canSend()).toBe(false);
        });
    });

    describe('processFile', () => {
        it('should reject files over 8MB', () => {
            const largeFile = new File(['x'.repeat(9 * 1024 * 1024)], 'large.png', { type: 'image/png' });
            vi.spyOn(largeFile, 'size', 'get').mockReturnValue(9 * 1024 * 1024);
            component.processFile(largeFile);
            expect(component.actionError()).toContain('8MB');
            expect(component.selectedImageBase64()).toBeNull();
        });

        it('should read file and set image preview', () => {
            const smallFile = new File(['data'], 'small.png', { type: 'image/png' });
            const mockResult = 'data:image/png;base64,bW9jaw==';

            const OriginalFileReader = globalThis.FileReader;
            class MockFileReader {
                result: string | null = null;
                onload: ((e: any) => void) | null = null;
                readAsDataURL(_file: File) {
                    this.result = mockResult;
                    if (this.onload) {
                        this.onload({ target: { result: this.result } });
                    }
                }
            }
            vi.stubGlobal('FileReader', MockFileReader);

            component.processFile(smallFile);

            expect(component.selectedImageBase64()).toBe(mockResult);
            expect(component.selectedImagePreview()).toBe(mockResult);

            vi.stubGlobal('FileReader', OriginalFileReader);
        });
    });

    describe('clearSelectedImage', () => {
        it('should reset image state', () => {
            component.selectedImageBase64.set('data:image/png;base64,abc');
            component.selectedImagePreview.set('data:image/png;base64,abc');
            component.clearSelectedImage();
            expect(component.selectedImageBase64()).toBeNull();
            expect(component.selectedImagePreview()).toBeNull();
        });
    });

    describe('onPromptKeydown', () => {
        it('should send message on Enter without shift', () => {
            component.promptText.set('hello');
            const event = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: false });
            vi.spyOn(event, 'preventDefault');
            vi.spyOn(component, 'sendMessage');
            component.onPromptKeydown(event);
            expect(event.preventDefault).toHaveBeenCalled();
            expect(component.sendMessage).toHaveBeenCalled();
        });

        it('should not send message on Shift+Enter', () => {
            const event = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true });
            vi.spyOn(event, 'preventDefault');
            vi.spyOn(component, 'sendMessage');
            component.onPromptKeydown(event);
            expect(event.preventDefault).not.toHaveBeenCalled();
            expect(component.sendMessage).not.toHaveBeenCalled();
        });

        it('should not send message on other keys', () => {
            const event = new KeyboardEvent('keydown', { key: 'a', shiftKey: false });
            vi.spyOn(component, 'sendMessage');
            component.onPromptKeydown(event);
            expect(component.sendMessage).not.toHaveBeenCalled();
        });
    });

    describe('getStreamState', () => {
        it('should return idle for non-assistant messages', () => {
            component.activeAssistantIndex.set(0);
            component.activeStreamState.set('streaming');
            const state = component.getStreamState(0, { role: 'user', content: 'hi' });
            expect(state).toBe('idle');
        });

        it('should return idle when index does not match active', () => {
            component.activeAssistantIndex.set(0);
            component.activeStreamState.set('streaming');
            const state = component.getStreamState(1, { role: 'assistant', content: '' });
            expect(state).toBe('idle');
        });

        it('should return active stream state when index matches', () => {
            component.activeAssistantIndex.set(2);
            component.activeStreamState.set('streaming');
            const state = component.getStreamState(2, { role: 'assistant', content: '' });
            expect(state).toBe('streaming');
        });

        it('should return idle when no active assistant', () => {
            component.activeAssistantIndex.set(null);
            const state = component.getStreamState(0, { role: 'assistant', content: '' });
            expect(state).toBe('idle');
        });
    });

    describe('stopStreaming', () => {
        it('should set loading to false and state to completed', () => {
            component.loading.set(true);
            component.activeStreamState.set('streaming');
            (component as any).activeStreamSub = { unsubscribe: vi.fn() };
            component.stopStreaming();
            expect(component.loading()).toBe(false);
            expect(component.activeStreamState()).toBe('completed');
        });

        it('should set "התגובה בוטלה" when assistant content is empty', () => {
            component.loading.set(true);
            component.activeStreamState.set('streaming');
            component.activeAssistantIndex.set(0);
            component.messages.set([{ role: 'assistant', content: '' }]);
            (component as any).activeStreamSub = { unsubscribe: vi.fn() };
            component.stopStreaming();
            expect(component.messages()[0].content).toBe('התגובה בוטלה.');
        });

        it('should not overwrite non-empty assistant content', () => {
            component.loading.set(true);
            component.activeStreamState.set('streaming');
            component.activeAssistantIndex.set(0);
            component.messages.set([{ role: 'assistant', content: 'existing text' }]);
            (component as any).activeStreamSub = { unsubscribe: vi.fn() };
            component.stopStreaming();
            expect(component.messages()[0].content).toBe('existing text');
        });
    });

    describe('onDragOver / onDragLeave / onDrop', () => {
        it('should set isDragging on drag over', () => {
            const event = { preventDefault: vi.fn() } as any;
            component.onDragOver(event);
            expect(event.preventDefault).toHaveBeenCalled();
            expect(component.isDragging()).toBe(true);
        });

        it('should clear isDragging when drag counter reaches 0', () => {
            const overEvent = { preventDefault: vi.fn() } as any;
            component.onDragOver(overEvent);
            const leaveEvent = { preventDefault: vi.fn() } as any;
            component.onDragLeave(leaveEvent);
            expect(component.isDragging()).toBe(false);
        });
    });

    describe('onPaste', () => {
        it('should process image from clipboard', () => {
            const file = new File(['x'], 'paste.png', { type: 'image/png' });
            const items = [{ type: 'image/png', getAsFile: () => file }];
            const event = {
                clipboardData: { items },
                preventDefault: vi.fn(),
            } as any;

            const mockResult = 'data:image/png;base64,cGFzdGU=';
            const OriginalFileReader = globalThis.FileReader;
            class MockFileReader {
                result: string | null = null;
                onload: ((e: any) => void) | null = null;
                readAsDataURL(_file: File) {
                    this.result = mockResult;
                    if (this.onload) {
                        this.onload({ target: { result: this.result } });
                    }
                }
            }
            vi.stubGlobal('FileReader', MockFileReader);

            component.onPaste(event);
            expect(event.preventDefault).toHaveBeenCalled();
            expect(component.selectedImageBase64()).toBe(mockResult);

            vi.stubGlobal('FileReader', OriginalFileReader);
        });
    });
});
