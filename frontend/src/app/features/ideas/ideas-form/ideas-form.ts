import { Component, inject, ChangeDetectionStrategy, effect, computed, ViewChild, ElementRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Select } from 'primeng/select';
import { IdeasStore } from '../../../core/store/ideas.store';
import { LlmProviderStore } from '../../../core/store/llm-provider.store';

@Component({
  selector: 'app-ideas-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, Select],
  templateUrl: './ideas-form.html',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class IdeasForm implements OnInit {
  @ViewChild('domainInput', { static: true })
  private domainInput?: ElementRef<HTMLInputElement>;

  protected store = inject(IdeasStore);
  protected llmProviderStore = inject(LlmProviderStore);
  private fb = inject(FormBuilder);

  models = this.llmProviderStore.chatModels;

  ideasForm: FormGroup = this.fb.group({
    domain: ['', []],
    count: [5, []],
    model: ['', []],
  });

  canGenerate = computed(() => this.store.domain().trim().length > 0);

  ngOnInit(): void {
    this.llmProviderStore.loadUserDefaultModel();
    this.domainInput?.nativeElement.focus();
  }

  constructor() {
    // Disable the domain control through the FormControl API instead of the [disabled] template
    // binding (Angular ignores template [disabled] on reactive controls and logs a dev warning).
    effect(() => {
      const loading = this.store.loading();
      const domainControl = this.ideasForm.get('domain');
      if (loading) {
        domainControl?.disable();
      } else {
        domainControl?.enable();
      }
    });

    effect(() => {
      const groups = this.models();
      const currentSelection = this.ideasForm.get('model')?.value;
      const userDefaultId = this.llmProviderStore.defaultModelId();

      // The model list and the saved default are two independent requests. Selecting
      // the first model before the default arrives would make it win permanently,
      // because the `!currentSelection` guard then blocks the real default — so wait
      // until the default is known (or known to be absent) before auto-selecting.
      if (!this.llmProviderStore.defaultModelResolved()) {
        return;
      }

      if (groups.length > 0 && !currentSelection) {
        let modelToSelect = null;

        if (userDefaultId != null) {
          for (const group of groups) {
            const match = group.items?.find((m: any) => m.id === userDefaultId);
            if (match) {
              modelToSelect = match;
              break;
            }
          }
        }

        if (!modelToSelect) {
          modelToSelect = groups[0]?.items?.[0];
        }

        if (modelToSelect) {
          this.ideasForm.patchValue({ model: modelToSelect.id });
        }
      }
    });
  }

  onDomainInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.store.setDomain(value);
    this.ideasForm.patchValue({ domain: value });
  }

  onCountInput(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.store.setCount(value);
    this.ideasForm.patchValue({ count: value });
  }

  incrementCount(): void {
    const current = this.store.count();
    if (current < 10) {
      this.store.setCount(current + 1);
      this.ideasForm.patchValue({ count: current + 1 });
    }
  }

  decrementCount(): void {
    const current = this.store.count();
    if (current > 1) {
      this.store.setCount(current - 1);
      this.ideasForm.patchValue({ count: current - 1 });
    }
  }

  setDefaultModel(event: Event, model: any): void {
    if (this.llmProviderStore.defaultModelId() === model.id) return;

    this.llmProviderStore.setDefaultModel(model.id);
    this.ideasForm.patchValue({ model: model.id });

    setTimeout(() => {
      const target = event.target as HTMLElement;
      const selectHost = target?.closest('p-select');
      const trigger = selectHost?.querySelector('.p-select-trigger') as HTMLElement | null;
      trigger?.blur();
    });
  }

  onGenerate(): void {
    if (this.store.loading()) {
      return;
    }
    const selectedModelId = Number(this.ideasForm.value.model);
    const modelSelection = this.getModelSelection(selectedModelId);
    this.store.setModel(modelSelection);
    this.store.generate();
  }

  onStopGenerate(): void {
    this.store.stopGenerating();
  }

  private getModelSelection(selectedModelId?: number): { provider: string; model: string } | undefined {
    if (!selectedModelId) return undefined;

    for (const provider of this.llmProviderStore.providers()) {
      const model = provider.models?.find((m: any) => m.id === selectedModelId);
      if (model) {
        return {
          provider: provider.key,
          model: model.key,
        };
      }
    }

    return undefined;
  }
}
