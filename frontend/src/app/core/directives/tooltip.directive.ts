import { Directive, ElementRef, HostListener, inject, input, Renderer2, OnDestroy } from '@angular/core';

@Directive({
    selector: '[appTooltip]',
    standalone: true,
    host: {
        '(mouseenter)': 'onMouseEnter()',
        '(mouseleave)': 'onMouseLeave()',
    }
})
export class TooltipDirective implements OnDestroy {

    text = input<string>('');
    imageUrl = input<string>('');
    position = input<'above' | 'below'>('above');

    private el = inject(ElementRef<HTMLElement>);
    private renderer = inject(Renderer2);
    private tooltipEl: HTMLElement | null = null;

    // Shared across all instances of the directive
    private static activeTooltipEl: HTMLElement | null = null;

    onMouseEnter() {
        if (!this.text() && !this.imageUrl()) return;

        TooltipDirective.removeActiveTooltip();

        this.tooltipEl = this.renderer.createElement('div');
        this.renderer.addClass(this.tooltipEl, 'app-tooltip');

        let imgEl: HTMLImageElement | null = null;

        if (this.imageUrl()) {
            imgEl = this.renderer.createElement('img');
            this.renderer.setAttribute(imgEl, 'src', this.imageUrl());
            this.renderer.addClass(imgEl, 'app-tooltip-image');
            this.renderer.appendChild(this.tooltipEl, imgEl);
        }

        if (this.text()) {
            const textEl = this.renderer.createElement('div');
            this.renderer.addClass(textEl, 'app-tooltip-text');
            const textNode = this.renderer.createText(this.text());
            this.renderer.appendChild(textEl, textNode);
            this.renderer.appendChild(this.tooltipEl, textEl);
        }

        this.renderer.appendChild(document.body, this.tooltipEl);
        TooltipDirective.activeTooltipEl = this.tooltipEl;

        this.positionTooltip();

        if (imgEl) {
            imgEl.addEventListener('load', () => this.positionTooltip(), { once: true });
            imgEl.addEventListener('error', () => this.positionTooltip(), { once: true });
        }
    }

    onMouseLeave() {
        this.removeTooltip();
    }

    private positionTooltip() {
        if (!this.tooltipEl) return;

        const GAP = 8;
        const hostRect = this.el.nativeElement.getBoundingClientRect();
        const tooltipRect = this.tooltipEl.getBoundingClientRect();
        const viewportW = window.innerWidth;
        const viewportH = window.innerHeight;

        // Position based on input
        let flipped = false;
        let top: number;
        if (this.position() === 'below') {
            top = hostRect.bottom + GAP;
        } else {
            top = hostRect.top - tooltipRect.height - GAP;
            if (top < 0) {
                top = hostRect.bottom + GAP;
                flipped = true;
            }
        }

        // Clamp vertically if it still overflows
        if (top + tooltipRect.height > viewportH) {
            top = Math.max(0, viewportH - tooltipRect.height - GAP);
        }

        // Center horizontally, then clamp to viewport edges
        let left = hostRect.left + (hostRect.width / 2) - (tooltipRect.width / 2);
        left = Math.max(GAP, Math.min(left, viewportW - tooltipRect.width - GAP));

        this.renderer.setStyle(this.tooltipEl, 'top', `${top}px`);
        this.renderer.setStyle(this.tooltipEl, 'left', `${left}px`);

        // Flip arrow to point opposite direction
        if (flipped) {
            this.renderer.addClass(this.tooltipEl, 'app-tooltip--bottom');
        }
    }

    private removeTooltip() {
        if (this.tooltipEl) {
            if (this.tooltipEl.isConnected) {
                this.renderer.removeChild(document.body, this.tooltipEl);
            }
            if (TooltipDirective.activeTooltipEl === this.tooltipEl) {
                TooltipDirective.activeTooltipEl = null;
            }
            this.tooltipEl = null;
        }
    }

    private static removeActiveTooltip() {
        if (TooltipDirective.activeTooltipEl) {
            TooltipDirective.activeTooltipEl.remove();
            TooltipDirective.activeTooltipEl = null;
        }
    }

    ngOnDestroy() {
        this.removeTooltip();
    }
}