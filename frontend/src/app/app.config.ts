import { APP_INITIALIZER, ApplicationConfig, LOCALE_ID, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

import { routes } from './app.routes';
import { registerLocaleData } from '@angular/common';
import { AuthService } from './core/services/auth.service';
import { AuthStore } from './core/store/auth.store';
import localeHe from '@angular/common/locales/he';
import { provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { withCredentialsInterceptor } from './core/interceptors/with-credentials.interceptor';
import { PRIME_NG_PROVIDERS } from './core/config/primeng-define-preset';
import { FilterService } from 'primeng/api';
import { registerTokenSearchMatchMode } from './core/config/token-search-filter';
import { ThemeService } from './core/services/theme.service';

registerLocaleData(localeHe);

export function initializeApp(
    authService: AuthService,
    authStore: AuthStore,
    themeService: ThemeService,
    filterService: FilterService,
) {
    return async () => {
        registerTokenSearchMatchMode(filterService);
        themeService.init();
        const user = await authService.checkSession();
        authStore.user.set(user);
    };
}

export const appConfig: ApplicationConfig = {
    providers: [
        provideBrowserGlobalErrorListeners(),
        provideRouter(routes),
        provideAnimationsAsync(),
        provideHttpClient(withXhr(), withInterceptors([withCredentialsInterceptor, authInterceptor])),
        {
            provide: APP_INITIALIZER,
            useFactory: initializeApp,
            deps: [AuthService, AuthStore, ThemeService, FilterService],
            multi: true,
        },
        { provide: LOCALE_ID, useValue: 'he-IL' },
        ...PRIME_NG_PROVIDERS,
    ],
};
