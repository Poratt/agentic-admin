import { Component, ChangeDetectionStrategy, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { Tabs, TabList, Tab, TabPanels, TabPanel } from 'primeng/tabs';
import { LlmProvidersManagement } from "../llm-providers-management/llm-providers-management";
import { StrainHunterSettings } from "./strain-hunter-settings/strain-hunter-settings";
import { DatabaseMonitorSettings } from "./database-monitor-settings/database-monitor-settings";
import { DesignSystem } from "../design-system/design-system";

@Component({
    selector: 'app-settings',
    standalone: true,
    imports: [CommonModule, Tabs, TabList, Tab, TabPanels, TabPanel, LlmProvidersManagement, StrainHunterSettings, DatabaseMonitorSettings, DesignSystem],
    templateUrl: './settings.html',
    changeDetection: ChangeDetectionStrategy.Eager,
})
export class Settings {
    private router = inject(Router);
    private route = inject(ActivatedRoute);

    /** URL slugs for the four tabs, in tab order. */
    private static readonly TAB_SLUGS = ['llm', 'hunters', 'db', 'design'] as const;

    /** Active tab index — the single funnel for clicks; the URL is written alongside. */
    activeTab = signal('0');

    private queryTab = toSignal(this.route.queryParamMap.pipe(map((params) => params.get('tab'))));

    private syncTabFromRoute = effect(() => {
        const index = Settings.TAB_SLUGS.indexOf(this.queryTab() as (typeof Settings.TAB_SLUGS)[number]);
        const value = index === -1 ? '0' : String(index);
        if (value !== this.activeTab()) this.activeTab.set(value);
    });

    setActiveTab(value: string | number | undefined) {
        const normalized = typeof value === 'number' ? String(value) : value;
        if (typeof normalized !== 'string') return;
        const index = Number(normalized);
        if (!Number.isInteger(index) || index < 0 || index >= Settings.TAB_SLUGS.length) return;
        this.activeTab.set(normalized);
        void this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { tab: Settings.TAB_SLUGS[index] },
            queryParamsHandling: 'merge',
            replaceUrl: true,
        });
    }
}


