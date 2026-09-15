import { Component, OnInit, OnDestroy, ViewChild, ElementRef, signal, computed, ChangeDetectionStrategy, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Select } from 'primeng/select';
import { TieredMenu } from 'primeng/tieredmenu';
import { MenuItem } from 'primeng/api';
import { TooltipDirective } from '../../core/directives/tooltip.directive';
import { LlmProviderStore } from '../../core/store/llm-provider.store';
import { LlmProvider, LlmModel } from '../../core/services/llm-provider.service';
import { MediaService, MediaImageResult, MediaVideoTask, MediaVideoResult } from '../../core/services/media.service';
import { environment } from '../../environments/environment';
import { ServiceResultContainer } from '../../core/models/service-result-container.model';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';



@Component({
    selector: 'app-media-studio',
    standalone: true,
    imports: [CommonModule, FormsModule, Select, TieredMenu, TooltipDirective],
    templateUrl: './media-studio.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './media-studio.css',
})
export class MediaStudio implements OnInit, OnDestroy {
    @ViewChild('fileInput')
    private fileInput?: ElementRef<HTMLInputElement>;
    @ViewChild('promptTextarea', { static: true })
    private promptTextarea?: ElementRef<HTMLTextAreaElement>;

    protected llmProviderStore = inject(LlmProviderStore);
    private mediaService = inject(MediaService);
    private http = inject(HttpClient);

    activeTab = signal<'image' | 'video'>('image');
    isDragging = signal(false);
    private dragCounter = 0;
    selectedImagePreview = signal<string | null>(null);

    imageModels = signal<LlmModel[]>([]);
    videoModels = signal<LlmModel[]>([]);

    // Image form
    imageModelId = signal<number | null>(null);
    imagePrompt = signal('');
    imageSize = signal('1024x1024');
    imageRatio = signal('');
    imageInputUrl = signal('');
    imageReturnBase64 = signal(false);
    imageLoading = signal(false);
    imageResult = signal<MediaImageResult | null>(null);
    imageError = signal<string | null>(null);

    // Video form
    videoModelId = signal<number | null>(null);
    videoPrompt = signal('');
    videoInputUrl = signal('');
    videoMode = signal<'ti2vid' | 'keyframes'>('ti2vid');
    videoNumFrames = signal<number | null>(81);
    videoFrameRate = signal<number | null>(24);
    videoLoading = signal(false);
    videoTask = signal<MediaVideoTask | null>(null);
    videoResult = signal<MediaVideoResult | null>(null);
    videoError = signal<string | null>(null);
    videoPolling = signal(false);

    private videoPollTimer: ReturnType<typeof setInterval> | null = null;

    // Active tab (composer toggle) — drives which prompt/model is shown in the shared composer
    setActiveTab(tab: 'image' | 'video'): void {
        this.activeTab.set(tab);
    }

    incrementNumFrames(): void {
        const current = this.videoNumFrames() ?? 81;
        if (current < 441) this.videoNumFrames.set(current + 1);
    }

    decrementNumFrames(): void {
        const current = this.videoNumFrames() ?? 81;
        if (current > 1) this.videoNumFrames.set(current - 1);
    }

    incrementFrameRate(): void {
        const current = this.videoFrameRate() ?? 24;
        if (current < 60) this.videoFrameRate.set(current + 1);
    }

    decrementFrameRate(): void {
        const current = this.videoFrameRate() ?? 24;
        if (current > 1) this.videoFrameRate.set(current - 1);
    }

    activePrompt = computed(() =>
        this.activeTab() === 'image' ? this.imagePrompt() : this.videoPrompt(),
    );

    setActivePrompt(value: string): void {
        if (this.activeTab() === 'image') {
            this.imagePrompt.set(value);
        } else {
            this.videoPrompt.set(value);
        }
    }

    activeModels = computed(() =>
        this.activeTab() === 'image' ? this.imageModels() : this.videoModels(),
    );

    activeModelId = computed(() =>
        this.activeTab() === 'image' ? this.imageModelId() : this.videoModelId(),
    );

    selectedModelLabel = computed(() => {
        const id = this.activeModelId();
        if (id == null) return null;
        return this.activeModels().find((m) => m.id === id)?.label ?? null;
    });

    activeModelMenuItems = computed<MenuItem[]>(() => {
        const defaultId = this.llmProviderStore.defaultModelId();
        const cap = this.activeTab();
        return this.llmProviderStore.providers()
            .filter((p) => p.active)
            .map((p) => ({
                label: p.label,
                items: (p.models ?? [])
                    .filter((m) => m.active && m.capability === cap)
                    .map((m) => ({
                        label: m.label,
                        icon: defaultId === m.id ? 'ph ph-star ph-fill' : 'ph ph-star',
                        command: () => {
                            this.setActiveModelId(m.id);
                            this.llmProviderStore.setDefaultModel(m.id);
                        },
                    })),
            }))
            .filter((g) => g.items.length > 0);
    });

    setActiveModelId(id: number | null): void {
        if (this.activeTab() === 'image') {
            this.imageModelId.set(id);
        } else {
            this.videoModelId.set(id);
        }
    }

    activePromptPlaceholder = computed(() =>
        this.activeTab() === 'image'
            ? 'תאר את התמונה שברצונך ליצור...'
            : 'תאר את הווידאו שברצונך ליצור...',
    );

    isLoading = computed(() => this.imageLoading() || this.videoPolling());

    showEmptyState = computed(
        () =>
            !this.imageLoading() &&
            !this.imageResult() &&
            !this.imageError() &&
            !this.videoLoading() &&
            !this.videoResult() &&
            !this.videoTask() &&
            !this.videoError(),
    );

    canSubmit = computed(
        () =>
            this.activePrompt().trim().length > 0 &&
            this.activeModelId() != null &&
            !this.isLoading(),
    );

    imageSizeOptions = [
        {
            label: '1024',
            items: [
                { label: '1024x1024 (1:1)', value: '1024x1024' },
                { label: '1024x768', value: '1024x768' },
                { label: '768x1024', value: '768x1024' },
            ],
        },
        {
            label: '2K',
            items: [
                { label: '16:9', value: '2K' },
                { label: '1:1', value: '2K' },
            ],
        },
        {
            label: '1K',
            items: [{ label: '16:9', value: '1K' }],
        },
        {
            label: '4K',
            items: [{ label: '16:9', value: '4K' }],
        },
    ];

    videoModeOptions = [
        { label: 'טקסט/תמונה לווידאו', value: 'ti2vid' as const },
        { label: 'מסגרות מפתח', value: 'keyframes' as const },
    ];

    imageTier = computed(() => ['1K', '2K', '3K', '4K'].includes(this.imageSize()));

    async ngOnInit(): Promise<void> {
        this.promptTextarea?.nativeElement.focus();
        try {
            const res = await firstValueFrom(
                this.http.get<ServiceResultContainer<LlmProvider[]>>(`${environment.apiUrl}/llm-provider`),
            );
            const providers = res?.result ?? [];
            const imgs = providers
                .filter(p => p.active)
                .flatMap(p => p.models ?? [])
                .filter(m => m.active && m.capability === 'image');
            this.imageModels.set(imgs);
            if (imgs.length > 0 && this.imageModelId() == null) {
                this.imageModelId.set(imgs[0].id);
            }
            const vids = providers
                .filter(p => p.active)
                .flatMap(p => p.models ?? [])
                .filter(m => m.active && m.capability === 'video');
            this.videoModels.set(vids);
            if (vids.length > 0 && this.videoModelId() == null) {
                this.videoModelId.set(vids[0].id);
            }
        } catch {
            // fallback: store may have cached data
            const store = this.llmProviderStore;
            this.imageModels.set(store.imageModels());
            this.videoModels.set(store.videoModels());
        }
    }

    ngOnDestroy(): void {
        this.stopVideoPolling();
    }

    generateImage(): void {
        if (this.imageLoading()) return;
        const prompt = this.imagePrompt().trim();
        if (!prompt) {
            this.imageError.set('נדרש פרומפט ליצירת תמונה.');
            return;
        }
        this.imageError.set(null);
        this.imageResult.set(null);
        this.imageLoading.set(true);

        const imageInput = this.imageInputUrl().trim();
        this.mediaService
            .generateImage({
                modelId: this.imageModelId() ?? undefined,
                prompt,
                size: this.imageSize(),
                ratio: this.imageRatio().trim() || undefined,
                image: imageInput ? [imageInput] : undefined,
                returnBase64: this.imageReturnBase64(),
            })
            .subscribe({
                next: (result) => {
                    this.imageResult.set(result);
                    this.imageLoading.set(false);
                },
                error: (err) => {
                    this.imageError.set(err?.error?.message ?? err?.message ?? 'יצירת התמונה נכשלה.');
                    this.imageLoading.set(false);
                },
            });
    }

    createVideo(): void {
        if (this.videoLoading()) return;
        const prompt = this.videoPrompt().trim();
        if (!prompt) {
            this.videoError.set('נדרש פרומפט ליצירת וידאו.');
            return;
        }
        this.videoError.set(null);
        this.videoResult.set(null);
        this.videoTask.set(null);
        this.videoLoading.set(true);

        const input = this.videoInputUrl().trim();
        this.mediaService
            .createVideo({
                modelId: this.videoModelId() ?? undefined,
                prompt,
                image: input || undefined,
                mode: this.videoMode(),
                numFrames: this.videoNumFrames() ?? undefined,
                frameRate: this.videoFrameRate() ?? undefined,
            })
            .subscribe({
                next: (task) => {
                    this.videoTask.set(task);
                    this.videoLoading.set(false);
                    this.startVideoPolling(task.videoId);
                },
                error: (err) => {
                    this.videoError.set(err?.error?.message ?? err?.message ?? 'יצירת הווידאו נכשלה.');
                    this.videoLoading.set(false);
                },
            });
    }

    private startVideoPolling(videoId: string): void {
        this.stopVideoPolling();
        this.videoPolling.set(true);
        this.pollVideo(videoId);
        this.videoPollTimer = setInterval(() => this.pollVideo(videoId), 5000);
    }

    private pollVideo(videoId: string): void {
        this.mediaService.getVideo(videoId, this.videoModelId() ?? undefined).subscribe({
            next: (result) => {
                this.videoResult.set(result);
                if (result.status === 'completed' || result.status === 'failed') {
                    this.stopVideoPolling();
                }
            },
            error: () => {
                this.stopVideoPolling();
                this.videoError.set('שגיאה בשאילתת סטטוס הווידאו.');
            },
        });
    }

    private stopVideoPolling(): void {
        if (this.videoPollTimer) {
            clearInterval(this.videoPollTimer);
            this.videoPollTimer = null;
        }
        this.videoPolling.set(false);
    }

    videoStatusLabel(status: string | undefined): string {
        switch (status) {
            case 'queued': return 'בתור';
            case 'pending': return 'ממתין';
            case 'in_progress': return 'בעיבוד';
            case 'completed': return 'הושלם';
            case 'failed': return 'נכשל';
            default: return status ?? 'לא ידוע';
        }
    }

    openFilePicker(): void {
        this.fileInput?.nativeElement.click();
    }

    onFileSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (file && file.type.startsWith('image/')) {
            this.processFile(file);
        }
        input.value = '';
    }

    onDragOver(event: DragEvent): void {
        event.preventDefault();
        this.dragCounter++;
        this.isDragging.set(true);
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'copy';
        }
    }

    onDragLeave(event: DragEvent): void {
        this.dragCounter--;
        if (this.dragCounter <= 0) {
            this.dragCounter = 0;
            this.isDragging.set(false);
        }
    }

    onDrop(event: DragEvent): void {
        event.preventDefault();
        this.dragCounter = 0;
        this.isDragging.set(false);

        const file = event.dataTransfer?.files[0];
        if (file && file.type.startsWith('image/')) {
            this.processFile(file);
        }
    }

    processFile(file: File): void {
        if (file.size > 8 * 1024 * 1024) {
            const error = 'התמונה גדולה מדי (מקסימום 8MB).';
            if (this.activeTab() === 'image') {
                this.imageError.set(error);
            } else {
                this.videoError.set(error);
            }
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            this.selectedImagePreview.set(result);
            if (this.activeTab() === 'image') {
                this.imageInputUrl.set(result);
            } else {
                this.videoInputUrl.set(result);
            }
        };
        reader.readAsDataURL(file);
    }

    clearSelectedImage(): void {
        this.selectedImagePreview.set(null);
        if (this.activeTab() === 'image') {
            this.imageInputUrl.set('');
        } else {
            this.videoInputUrl.set('');
        }
        if (this.fileInput) {
            this.fileInput.nativeElement.value = '';
        }
    }

    clearImageResult(): void {
        this.imageResult.set(null);
    }

    clearVideoResult(): void {
        this.stopVideoPolling();
        this.videoResult.set(null);
        this.videoTask.set(null);
    }

    onPromptKeydown(event: KeyboardEvent): void {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.onSubmit();
        }
    }

    onSubmit(): void {
        if (this.isLoading()) return;
        if (this.activeTab() === 'image') {
            this.generateImage();
        } else {
            this.createVideo();
        }
    }

    onStop(): void {
        // Image generation has no in-flight cancellation today; only video can be stopped.
        if (this.activeTab() === 'video') {
            this.stopVideoPolling();
        }
    }

    }
