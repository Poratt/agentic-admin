import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { MediaStudio } from './media-studio';
import { LlmProviderStore } from '../../core/store/llm-provider.store';
import { MediaService } from '../../core/services/media.service';

describe('MediaStudio', () => {
  let component: MediaStudio;
  let fixture: ComponentFixture<MediaStudio>;

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

    const llmStoreMock = {
      imageModels: vi.fn().mockReturnValue([]),
      videoModels: vi.fn().mockReturnValue([]),
      defaultModelId: vi.fn().mockReturnValue(null),
      providers: vi.fn().mockReturnValue([]),
      setDefaultModel: vi.fn(),
    };

    const mediaServiceMock = {
      generateImage: vi.fn(),
      createVideo: vi.fn(),
      getVideo: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [MediaStudio, HttpClientTestingModule],
      providers: [
        provideZonelessChangeDetection(),
        { provide: LlmProviderStore, useValue: llmStoreMock },
        { provide: MediaService, useValue: mediaServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MediaStudio);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('canSubmit should return false when prompt is empty', () => {
    component.imagePrompt.set('');
    expect(component.canSubmit()).toBe(false);
  });

  it('canSubmit should return false when no model is selected', () => {
    component.imagePrompt.set('test');
    component.imageModelId.set(null);
    expect(component.canSubmit()).toBe(false);
  });

  it('canSubmit should return true when prompt and model are set', () => {
    component.imagePrompt.set('test');
    component.imageModelId.set(1);
    expect(component.canSubmit()).toBe(true);
  });

  it('activeModels should return image models on image tab', () => {
    component.activeTab.set('image');
    const imageModel = [{ id: 1, capability: 'image' }] as any;
    component.imageModels.set(imageModel);
    expect(component.activeModels()).toEqual(imageModel);
  });

  it('activeModels should return video models on video tab', () => {
    component.activeTab.set('video');
    const videoModel = [{ id: 2, capability: 'video' }] as any;
    component.videoModels.set(videoModel);
    expect(component.activeModels()).toEqual(videoModel);
  });

  it('activePromptPlaceholder should return image placeholder for image tab', () => {
    component.activeTab.set('image');
    expect(component.activePromptPlaceholder()).toContain('תמונה');
  });

  it('activePromptPlaceholder should return video placeholder for video tab', () => {
    component.activeTab.set('video');
    expect(component.activePromptPlaceholder()).toContain('ווידאו');
  });

  it('imageTier should compute correctly for tiered sizes', () => {
    component.imageSize.set('2K');
    expect(component.imageTier()).toBe(true);
  });

  it('imageTier should return false for non-tiered sizes', () => {
    component.imageSize.set('1024x1024');
    expect(component.imageTier()).toBe(false);
  });
});
