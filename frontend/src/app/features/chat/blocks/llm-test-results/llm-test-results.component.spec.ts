import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LlmTestResultsComponent, LlmTestResultsRenderData } from './llm-test-results.component';

describe('LlmTestResultsComponent', () => {
    let component: LlmTestResultsComponent;
    let fixture: ComponentFixture<LlmTestResultsComponent>;

    const sampleData: LlmTestResultsRenderData = {
        results: [
            { model: 'gpt-4o', provider: 'OpenAI', status: 'active', latencyMs: 230 },
            { model: 'claude-3', provider: 'Anthropic', status: 'active', latencyMs: 310 },
            { model: 'gemini-pro', provider: 'Google', status: 'failed', latencyMs: 5200 },
        ],
        summary: { total: 3, active: 2, failed: 1 },
    };

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [LlmTestResultsComponent],
        }).compileComponents();

        fixture = TestBed.createComponent(LlmTestResultsComponent);
        component = fixture.componentInstance;
        fixture.componentRef.setInput('data', sampleData);
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should display summary', () => {
        const el = fixture.nativeElement as HTMLElement;
        expect(el.textContent).toContain('2 of 3 active');
    });

    it('should display model names', () => {
        const el = fixture.nativeElement as HTMLElement;
        expect(el.textContent).toContain('gpt-4o');
        expect(el.textContent).toContain('claude-3');
        expect(el.textContent).toContain('gemini-pro');
    });

    it('should display provider badges', () => {
        const el = fixture.nativeElement as HTMLElement;
        expect(el.textContent).toContain('OpenAI');
        expect(el.textContent).toContain('Anthropic');
        expect(el.textContent).toContain('Google');
    });

    it('should show green status for active models', () => {
        const el = fixture.nativeElement as HTMLElement;
        const activeIcons = el.querySelectorAll('.status-icon.active');
        expect(activeIcons.length).toBe(2);
    });

    it('should show red status for failed models', () => {
        const el = fixture.nativeElement as HTMLElement;
        const failedIcons = el.querySelectorAll('.status-icon.failed');
        expect(failedIcons.length).toBe(1);
    });

    it('should display latency values', () => {
        const el = fixture.nativeElement as HTMLElement;
        expect(el.textContent).toContain('230');
        expect(el.textContent).toContain('310');
        expect(el.textContent).toContain('5200');
    });

    it('should show empty state when no results', () => {
        fixture.componentRef.setInput('data', {});
        fixture.detectChanges();
        const el = fixture.nativeElement as HTMLElement;
        expect(el.querySelector('.empty-state')).toBeTruthy();
    });

    it('renders a skipped result with its capability chip', () => {
        fixture.componentRef.setInput('data', {
            results: [
                { model: 'agnes-video-v2.0', provider: 'Agnes', status: 'skipped', latencyMs: 42, capability: 'video' },
            ],
        });
        fixture.detectChanges();
        const el = fixture.nativeElement as HTMLElement;

        expect(el.querySelector('.status-icon.skipped')).toBeTruthy();
        expect(el.textContent).toContain('Skipped');
        expect(el.querySelector('.capability-chip')?.textContent).toContain('video');
    });
});
