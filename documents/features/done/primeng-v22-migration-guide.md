# PrimeNG v22 Migration Guide

Source: https://primeng.dev/migration/v22

## Overview

- PrimeNG v22 is the first release under the PrimeUI umbrella.
- Licensing moves to a dual Community/Commercial model.
- PrimeUI PRO is the new enterprise tier. At launch, PRO components are available for Vue only. Angular, React, Lit, Blazor versions will follow.

### PRO Suite (Vue at launch)
- Scheduler
- Charts
- Text Editor
- Task Board
- Diagram, on the roadmap
- DataGrid, on the roadmap
- Gantt Chart, on the roadmap
- PDF Viewer, on the roadmap

### New Components in v22
- CommandMenu
- Compare
- Gallery
- InputTags
- InputPassword
- InputColor
- Sidebar
- ScrollArea

### Enhancements
- Modernized codebase with new Angular APIs
- Updated test suite with increased coverage
- Carousel rebuilt around a compound API
- Menu now supports multi-level navigation
- Toast ships with new entry and exit animations
- InputMask is now a directive rather than a component
- Wide-ranging defect fixes
- New documentation and demos

### 16px Base
- Components sized in rem relative to document root font size, now assumed to be 16px (browser default).
- Earlier versions assumed 14px; presets ship a compat variant for 14px root.
- See Base Font Size for technical details.

## Deprecations (v22 → removal in v24)

| API | Deprecated Since | Replacement | Status |
| --- | --- | --- | --- |
| MultiSelect | v22 | Select with *multiple* property | deprecated |
| PanelMenu | v22 | Menu with *toggleable* option | deprecated |
| pButtonIcon / pButtonLabel directives | v21 | Place icon/label inside *[pButton]* host. Use *iconOnly* prop for icon-only buttons. | deprecated |
| Password component | v22 | *pInputPassword* directive | deprecated |
| Galleria | v22 | Gallery component | deprecated |
| ColorPicker | v22 | InputColor component | deprecated |
| InputMask component | v22 | *pInputMask* directive | deprecated |
| Chart | v22 | PrimeUI PRO Charts | deprecated |
| Image | v22 | Gallery component | deprecated |
| Editor | v22 | PrimeUI PRO Editor | deprecated |
| AutoComplete *multiple* property | v22 | InputTags component | deprecated |
| primeng/icons package | v22 | SVG icons via PrimeIcons | deprecated |
| ScrollPanel | v22 | ScrollArea component | deprecated |
| ImageCompare | v22 | Compare component | deprecated |
| Slider *animate* property | v22 | No longer functional | deprecated |
| Tabs *scrollable* property | v22 | Scrolling is now default | deprecated |
| Carousel data-driven (model) usage | v22 | Compound API with *p-carousel-content*, *p-carousel-item*, *p-carousel-indicators* | deprecated |

## Removals (deprecated in v20/v21, removed in v22)

| API | Deprecated Since | Replacement | Status |
| --- | --- | --- | --- |
| @primeng/themes | v20 | @primeuix/themes | removed |
| pTemplate | v20 | ng-template with a template reference variable | removed |
| styleClass (host enabled components) | v20 | class | removed |
| Global inputStyle config | v20 | inputVariant | removed |
| CamelCase Selectors | v20 | Kebab case | removed |
| pButton iconPos, loadingIcon, icon, label properties | v20 | *pButtonIcon* and *pButtonLabel* directives | removed |
| pButton buttonProps property | v20 | Use button properties directly on the element | removed |
| p-button badgeClass property | v20 | *badgeSeverity* property | removed |
| AutoComplete minLength property | v20 | minQueryLength | removed |
| OrganizationChart preserveSpace property | v20 | Obsolete, had no use | removed |
| Paginator dropdownAppendTo property | v20 | appendTo | removed |
| Message text and escape properties | v20 | Content projection | removed |
| Password maxLength property | v20 | *maxlength* property | removed |
| TreeSelect containerStyle / containerStyleClass | v20 | style and class | removed |
| Table responsiveLayout property | v20 | Always defaults to scroll; stack mode needs custom implementation | removed |
| TreeSelect default template | v20 | *value* template | removed |
| pBadge directive | v20 | *OverlayBadge* component | removed |
| clearFilterIcon template of Table | v20 | Obsolete, not utilized | removed |
| Inplace closable property | v20 | Use templating with *closeCallback* | removed |
| showTransitionOptions | v21 | Native CSS animations | removed |
| hideTransitionOptions | v21 | Native CSS animations | removed |
| Directive PT attribute names (e.g. ptInputText) | v21 | PT suffix at end (e.g. pInputTextPT) | removed |
| contextMenuSelectionMode | v21 | "joint" mode removed in favor of "separate". Applies to Tree, TreeTable, and Table. | removed |