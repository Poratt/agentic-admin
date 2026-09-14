import { setupTestBed } from '@analogjs/vitest-angular/setup-testbed';

setupTestBed({ zoneless: true });

// PrimeNG tablist (and other overlay/scroll components) observe element sizes —
// jsdom has no ResizeObserver, so provide a silent stub globally.
if (typeof (globalThis as any).ResizeObserver === 'undefined') {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
