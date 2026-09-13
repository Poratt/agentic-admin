# PrimeNG v22 Migration — Codebase Scan Results

**Scan date:** 2026-08-09
**Current PrimeNG version:** 21.1.8
**Scope:** `frontend/src/` (all `.html`, `.ts`, `.scss`, `.css` files)

---

## Summary

| Category | Count | Status |
|----------|-------|--------|
| CRITICAL — No Angular replacement (Chart, Editor) | 0 | ✅ Clean |
| BREAKING — Removed APIs (will fail build) | 20 | ❌ Must fix before upgrade |
| DEPRECATED — Working in v22, removal in v24 | 0 | ✅ Clean |
| Font-size risk (14px base assumptions) | 0 | ✅ Clean |

---

## 1. Critical Blockers (no Angular PRO replacement)

**0 matches found.** No usage of:
- `p-chart` / `ChartModule`
- `p-editor` / `EditorModule`

---

## 2. Removed-API Violations (must fix before upgrading)

### 2a. `pTemplate` attribute — 16 occurrences (removed in v20)

Replacement: Use `ng-template` with a template reference variable (e.g. `#header`, `#body`, `#footer`).

| File | Line | Snippet |
|------|------|---------|
| `features/users/users-management.html` | 56 | `<ng-template pTemplate="header">` |
| `features/users/users-management.html` | 69 | `<ng-template pTemplate="body" let-user>` |
| `features/users/users-management.html` | 100 | `<ng-template pTemplate="emptymessage">` |
| `features/llm-providers-management/llm-providers-management.html` | 58 | `<ng-template pTemplate="header">` |
| `features/llm-providers-management/llm-providers-management.html` | 68 | `<ng-template pTemplate="body" let-provider>` |
| `features/llm-providers-management/llm-providers-management.html` | 155 | `<ng-template pTemplate="header">` |
| `features/llm-providers-management/llm-providers-management.html` | 170 | `<ng-template pTemplate="body" let-model>` |
| `features/llm-providers-management/llm-providers-management.html` | 375 | `<ng-template pTemplate="empty">` |
| `features/llm-providers-management/llm-providers-management.html` | 467 | `<ng-template pTemplate="footer">` |
| `features/llm-providers-management/llm-providers-management.html` | 521 | `<ng-template pTemplate="footer">` |
| `features/strain-hunter/strain-hunter.html` | 226 | `<ng-template pTemplate="header">` |
| `features/strain-hunter/strain-hunter.html` | 236 | `<ng-template pTemplate="body" let-item>` |
| `features/strain-hunter/strain-hunter.html` | 536 | `<ng-template pTemplate="emptymessage">` |
| `features/strain-hunter/matching-preferences-drawer/matching-preferences-drawer.html` | 11 | `<ng-template pTemplate="header">` |
| `features/chat/blocks/users-table/users-table.component.html` | 14 | `<ng-template pTemplate="header">` |
| `features/chat/blocks/users-table/users-table.component.html` | 23 | `<ng-template pTemplate="body" let-user>` |

### 2b. `styleClass` on host-enabled components — 2 occurrences (removed in v20)

Replacement: Use standard `class` attribute instead.

| File | Line | Snippet |
|------|------|---------|
| `features/strain-hunter/matching-preferences-drawer/matching-preferences-drawer.html` | 9 | `styleClass="matching-drawer"` on `<p-drawer>` |
| `features/chat/blocks/users-table/users-table.component.html` | 13 | `styleClass="users-prime-table"` on `<p-table>` |

### 2c. `responsiveLayout` on `p-table` — 2 occurrences (removed in v20)

Replacement: Always defaults to `scroll`; stack mode needs custom implementation.

| File | Line | Snippet |
|------|------|---------|
| `features/settings/strain-hunter-settings/strain-hunter-settings.html` | 69 | `responsiveLayout="stack"` on `<p-table>` |
| `features/settings/strain-hunter-settings/strain-hunter-settings.html` | 363 | `responsiveLayout="stack"` on `<p-table>` |

---

## 3. Deprecated-but-Working (migration can be incremental after upgrade)

**0 matches found** for all deprecated APIs:

| Deprecated API | Selector/Import | Matches |
|----------------|-----------------|---------|
| MultiSelect → Select with `multiple` | `p-multi-select` / `MultiSelectModule` | 0 |
| PanelMenu → Menu with `toggleable` | `p-panel-menu` / `PanelMenuModule` | 0 |
| Password → `pInputPassword` directive | `p-password` / `PasswordModule` | 0 |
| Galleria → Gallery | `p-galleria` / `GalleriaModule` | 0 |
| ColorPicker → InputColor | `p-color-picker` / `ColorPickerModule` | 0 |
| InputMask → `pInputMask` directive | `p-input-mask` / `InputMaskModule` | 0 |
| Image → Gallery | `p-image` / `ImageModule` | 0 |
| ScrollPanel → ScrollArea | `p-scroll-panel` / `ScrollPanelModule` | 0 |
| ImageCompare → Compare | `p-image-compare` / `ImageCompareModule` | 0 |
| AutoComplete `multiple` → InputTags | `[multiple]` on `p-autoComplete` | 0 |
| Slider `[animate]` | `[animate]` on `p-slider` | 0 |
| Tabs `[scrollable]` | `[scrollable]` on `p-tabs`/`p-tabView` | 0 |
| Carousel data-driven API | `p-carousel` with `[value]` | 0 |
| `primeng/icons` package | import from `primeng/icons` | 0 |

---

## 4. Removed-API Violations — Other checks (all clean)

| Pattern | Matches |
|---------|---------|
| `@primeng/themes` imports | 0 |
| camelCase selectors (`pMultiSelect`, etc.) | 0 |
| `pButtonIcon` / `pButtonLabel` | 0 |
| `badgeClass` on `p-button` | 0 |
| `minLength` on AutoComplete | 0 |
| `preserveSpace` on OrganizationChart | 0 |
| `dropdownAppendTo` on Paginator | 0 |
| `text`/`escape` on `p-message` | 0 |
| `maxLength` on `p-password` | 0 |
| `containerStyle`/`containerStyleClass` on TreeSelect | 0 |
| `pBadge` directive | 0 |
| `clearFilterIcon` template on Table | 0 |
| `closable` on `p-inplace` | 0 |
| `showTransitionOptions`/`hideTransitionOptions` | 0 |
| PT prefix attributes (`ptInputText`, etc.) | 0 |
| `contextMenuSelectionMode="joint"` | 0 |
| `inputStyle` global config | 0 |

---

## 5. Font-Size Risk

**0 critical findings.** The codebase does NOT set a `:root { font-size: 14px }` or equivalent. PrimeNG v22's 16px base assumption aligns with the browser default.

Hardcoded `14px` values found in CSS are all for specific element sizing (icon sizes, spacing tokens), NOT root font-size overrides:

| File | Line | Usage |
|------|------|-------|
| `assets/styles/_variables.css` | 65 | `--space-7: 14px;` (spacing token) |
| `assets/styles/_filters.css` | 313-314 | `height: 14px; width: 14px;` (element sizing) |
| `assets/styles/_utilities.css` | 615 | `font-size: 14px;` (specific utility class) |
| `assets/styles/_buttons.css` | 77-78 | `width: 14px; height: 14px;` (icon sizing) |
| `assets/styles/_reset.css` | 116-118 | Icon `.xs` class sizing |
| `assets/styles/_forms.css` | 139 | `height: 14px;` (element sizing) |
| `features/chat/blocks/currency-card/currency-card.component.css` | 163 | `height: 14px;` (element sizing) |

---

## Action Plan

### Before upgrade (must-fix — 20 items):

1. **`pTemplate` → `#ref` migration** (16 occurrences, 5 files)
   - Replace `pTemplate="header"` with `#header`
   - Replace `pTemplate="body"` with `#body`
   - Replace `pTemplate="emptymessage"` with `#emptymessage`
   - Replace `pTemplate="empty"` with `#empty`
   - Replace `pTemplate="footer"` with `#footer`
   - Files: `users-management.html`, `llm-providers-management.html`, `strain-hunter.html`, `matching-preferences-drawer.html`, `users-table.component.html`

2. **`styleClass` → `class`** (2 occurrences, 2 files)
   - `matching-preferences-drawer.html:9` — change `styleClass=` to `class=`
   - `users-table.component.html:13` — change `styleClass=` to `class=`

3. **`responsiveLayout="stack"` removal** (2 occurrences, 1 file)
   - `strain-hunter-settings.html:69,363` — remove `responsiveLayout="stack"` and implement custom scroll-based responsive behavior if needed

### After upgrade (optional — 0 items):
No deprecated-but-working APIs are in use. The codebase is clean on this front.
