# summaryHe Master Table — All API Operations

Auto-generated audit of every `summaryHe` in the backend controllers.

- **Total `summaryHe` occurrences:** 81
- **Modules:** 15
- **Source of truth:** `backend/src/modules/**/*.controller.ts`
- **Note:** `admin-agent/sessions/_id_` has 2 `summaryHe`-bearing decorators (DELETE session, DELETE message).

Legend for **Agent**: `✔` = exposed as an LLM tool, `✖` = listed in `HIDDEN_FROM_LLM` (`swagger-tools.parser.ts:55`).

---

## auth

`backend/src/modules/auth/auth.controller.ts` — 5 endpoints

| Method | Endpoint         | summaryHe                                                 | toolIcon              | Agent |
| ------ | ---------------- | --------------------------------------------------------- | --------------------- | :---: |
| POST   | `/auth/register` | יוצרים חשבון חדש ומצטרפים למשפחת המערכת                   | `ph-user-plus`        |   ✔   |
| POST   | `/auth/login`    | נכנסים לחשבון האישי בבטחה                                 | `ph-sign-in`          |   ✔   |
| POST   | `/auth/refresh`  | מחדשים את טוקן הגישה ברקע כדי להישאר מחוברים              | `ph-arrows-clockwise` |   ✔   |
| POST   | `/auth/logout`   | מתנתקים מהמערכת ומסיימים את סשן העבודה בבטחה — [see note] | `ph-sign-out`         |   ✔   |
| GET    | `/auth/me`       | מציגים את פרטי הפרופיל המהירים של המשתמש הנוכחי           | `ph-user-circle`      |   ✔   |

**❗ `auth.controller.ts:133` is corrupted.** The value on disk does **not** match the text shown in
the table above. Two characters that are neither Hebrew nor Latin sit inside the word `מהמערכת`,
at positions 12–13. They are codepoints **U+7CFB** and **U+7D71**, from a script that must not
appear in this codebase. The corrupted value is intentionally not transcribed here, in any form —
not as glyphs and not as placeholders, because both pollute a Hebrew line.

To see the damage, inspect the file directly:

```
sed -n '133p' backend/src/modules/auth/auth.controller.ts
```

`מהמערכת` ("from the system") lost its tail — the `מערכת` portion was replaced by the two foreign
characters. The line should read exactly:

```
summaryHe: 'מתנתקים מהמערכת ומסיימים את סשן העבודה בבטחה',
```

---

## users

`backend/src/modules/users/users.controller.ts` — 6 endpoints

| Method | Endpoint           | summaryHe                                       | toolIcon           | Agent |
| ------ | ------------------ | ----------------------------------------------- | ------------------ | :---: |
| GET    | `/users`           | מציגים את רשימת המשתמשים הפעילים במערכת         | `ph-users`         |   ✔   |
| GET    | `/users/me`        | מציגים את פרטי הפרופיל המהירים של המשתמש הנוכחי | `ph-user-circle`   |   ✔   |
| GET    | `/users/{id}`      | מציגים פרטים מלאים על משתמש לפי מזהה ייחודי     | `ph-user`          |   ✔   |
| PATCH  | `/users/{id}`      | מעדכנים את פרטי הפרופיל האישיים של המשתמש       | `ph-pencil-simple` |   ✔   |
| DELETE | `/users/{id}`      | מוחקים משתמש לצמיתות מהמערכת                    | `ph-trash`         |   ✔   |
| PATCH  | `/users/{id}/role` | מעדכנים את תפקיד והרשאות המשתמש במערכת          | `ph-shield`        |   ✔   |

---

## Admin Agent

`backend/src/modules/admin-agent/admin-agent.controller.ts` — 8 endpoints

| Method | Endpoint                                                 | summaryHe                                              | toolIcon                | Agent |
| ------ | -------------------------------------------------------- | ------------------------------------------------------ | ----------------------- | :---: |
| GET    | `/admin-agent/sessions`                                  | מציגים את כל שיחות הצ'אט השמורות שלך עם ה-AI           | `ph-chat-centered-text` |   ✔   |
| GET    | `/admin-agent/sessions/{id}/messages`                    | מציגים את היסטוריית ההודעות המלאה של שיחת הצ'אט        | `ph-chats`              |   ✔   |
| POST   | `/admin-agent/messages/images`                           | שולפים ומציגים את קבצי המדיה והתמונות של ההודעה        | `ph-image`              |   ✔   |
| POST   | `/admin-agent/sessions`                                  | פותחים שיחת צ'אט חדשה ורעננה עם סוכן ה-AI              | `ph-plus-circle`        |   ✔   |
| DELETE | `/admin-agent/sessions/{id}`                             | מוחקים לצמיתות שיחת צ'אט מההיסטוריה השמורה             | `ph-trash`              |   ✔   |
| DELETE | `/admin-agent/sessions/{sessionId}/messages/{messageId}` | מוחקים הודעת צאט ואת כל היסטוריית השיחה שנכתבה אחריה   | `ph-trash`              |   ✔   |
| POST   | `/admin-agent/query-stream`                              | מתכתבים עם סוכן הניהול ומקבלים תגובות חיות בסטרמינג    | `ph-robot`              |   ✖   |
| POST   | `/admin-agent/confirm-action`                            | מאשרים או מבטלים פעולה רגישה הממתינה לאישור הניהול שלך | `ph-shield-check`       |   ✖   |

---

## llm

`backend/src/modules/llm/llm.controller.ts` — 10 endpoints

| Method | Endpoint                              | summaryHe                                                  | toolIcon            | Agent |
| ------ | ------------------------------------- | ---------------------------------------------------------- | ------------------- | :---: |
| POST   | `/llm/providers/{id}/test-all`        | בודקים ברקע את כל המודלים הפעילים של הספק ושומרים תוצאות   | `ph-lightning`      |   ✖   |
| GET    | `/llm/providers/{id}/test-all/status` | האם ריצת בדיקות רקע פעילה עבור הספק                        | `ph-lightning`      |   ✔   |
| POST   | `/llm/models/{id}/test`               | בודקים ומאמתים את מהירות התגובה והחיבור של מודל ה-AI       | `ph-lightning`      |   ✔   |
| DELETE | `/llm/test-results/{id}`              | מוחקים היסטוריית בדיקת חיבור בודדת של מודל מהארכיון        | `ph-trash`          |   ✔   |
| POST   | `/llm/set-default-model`              | קובעים את מודל ה-AI המועדף עליך כברירת המחדל של המערכת     | `ph-star`           |   ✔   |
| GET    | `/llm/default-model`                  | מציגים את מודל ה-AI המוגדר כברירת המחדל שלך                | `ph-star`           |   ✔   |
| POST   | `/llm/image/generate`                 | יוצרים תמונות מרהיבות על בסיס טקסט עם Agnes Image          | `ph-palette`        |   ✔   |
| POST   | `/llm/video/generate`                 | מפיקים סרטונים מרהיבים מבוססי טקסט או תמונה עם Agnes Video | `ph-video-camera`   |   ✔   |
| GET    | `/llm/video/{videoId}`                | בודקים את סטטוס הפקת הסרטון ומורידים אותו כשהוא מוכן       | `ph-hourglass-high` |   ✔   |
| POST   | `/llm/video/extend`                   | מאריכים וממשיכים סרטון קיים מפריים המפתח האחרון שלו        | `ph-fast-forward`   |   ✔   |

---

## LLM Provider

`backend/src/modules/llm-provider/llm-provider.controller.ts` — 14 endpoints

| Method | Endpoint                                      | summaryHe                                                                       | toolIcon              | Agent |
| ------ | --------------------------------------------- | ------------------------------------------------------------------------------- | --------------------- | :---: |
| POST   | `/llm-provider`                               | רושמים ספק מודלים (Provider) חדש במערכת                                         | `ph-database`         |   ✔   |
| GET    | `/llm-provider`                               | מציגים את כל ספקי ה-AI והמודלים המוגדרים במערכת                                 | `ph-list-bullets`     |   ✔   |
| PATCH  | `/llm-provider/{id}`                          | מעדכנים את הגדרות החיבור, הכתובת והמפתח של הספק                                 | `ph-pencil-simple`    |   ✔   |
| DELETE | `/llm-provider/{id}`                          | מוחקים ספק לצמיתות יחד עם כל המודלים שלו                                        | `ph-trash`            |   ✖   |
| POST   | `/llm-provider/{id}/models`                   | מוסיפים מודל חדש תחת ספק ה-LLM שנבחר                                            | `ph-plus-circle`      |   ✔   |
| GET    | `/llm-provider/{id}/catalog`                  | שולפים את קטלוג המודלים החי מהספק וממזגים אותו עם המקומי (חדש / קיים / לא זמין) | `ph-cloud-arrow-down` |   ✔   |
| POST   | `/llm-provider/{id}/sync-models`              | מוסיפים מודלים שנבחרו מהקטלוג כשהם כבויים, עם דילוג של קיימים                   | `ph-download-simple`  |   ✖   |
| PATCH  | `/llm-provider/models/{id}`                   | מעדכנים את ההגדרות, התפקיד והסטטוס הפעיל של מודל קיים                           | `ph-sliders`          |   ✔   |
| DELETE | `/llm-provider/models/{id}`                   | מכבים או מוחקים מודל לצמיתות מהספק שלו                                          | `ph-trash`            |   ✔   |
| DELETE | `/llm-provider/models/{modelId}/test-results` | מנקים את כל היסטוריית בדיקות החיבור של המודל                                    | `ph-eraser`           |   ✔   |
| GET    | `/llm-provider/{id}/models`                   | מציגים את כל המודלים המשויכים לספק שנבחר                                        | `ph-cube`             |   ✔   |
| POST   | `/llm-provider/cleanup-test-results`          | מנקים בדיקות חיבור ישנות מהארכיון על בסיס תקופת שימור                           | `ph-broom`            |   ✔   |
| GET    | `/llm-provider/test-results`                  | מציגים את ההיסטוריה המלאה של בדיקות החיבור במערכת                               | `ph-activity`         |   ✔   |
| GET    | `/llm-provider/stats`                         | מציגים דירוג מודלים: המהיר ביותר, היציב ביותר, וזמני תגובה בפועל                | `ph-chart-bar`        |   ✔   |

---

## genetics

`backend/src/modules/genetics/genetics.controller.ts` — 7 endpoints

| Method | Endpoint                   | summaryHe                                                      | toolIcon            | Agent |
| ------ | -------------------------- | -------------------------------------------------------------- | ------------------- | :---: |
| GET    | `/genetics`                | מציגים את קטלוג הגנטיקה והזנים המלא במערכת                     | `ph-tree-evergreen` |   ✔   |
| GET    | `/genetics/{name}`         | מציגים פרטים מלאים על זן גנטיקה ספציפי לפי שמו                 | `ph-tree-evergreen` |   ✔   |
| POST   | `/genetics`                | יוצרים גנטיקה חדשה בקטלוג המערכת                               | `ph-tree-evergreen` |   ✔   |
| PATCH  | `/genetics/{name}`         | מעדכנים את מאפייני הגנטיקה של זן קיים לפי שמו                  | `ph-tree-evergreen` |   ✔   |
| POST   | `/genetics/{name}/enrich`  | מעשירים זן גנטיקה בודד בפרטים ונתוני מעבדה מבוססי AI           | `ph-tree-evergreen` |   ✔   |
| POST   | `/genetics/enrich-missing` | מפעילים סריקה והעשרה אוטומטית לכל הזנים שחסר להם מידע מבוסס AI | `ph-magic-wand`     |   ✔   |
| DELETE | `/genetics/{name}`         | מחוקים זן גנטיקה לצמיות מקטלוג                                 | `ph-trash`          |   ✔   |

---

## terpenes

`backend/src/modules/terpene/terpene.controller.ts` — 7 endpoints

| Method | Endpoint                   | summaryHe                                                        | toolIcon          | Agent |
| ------ | -------------------------- | ---------------------------------------------------------------- | ----------------- | :---: |
| GET    | `/terpenes`                | מציגים את קטלוג הטרפנים המלא המוגדר במערכת                       | `ph-flower-lotus` |   ✔   |
| GET    | `/terpenes/{name}`         | מציגים פרטים מלאים על טרפן ספציפי לפי שמו                        | `ph-flower-lotus` |   ✔   |
| POST   | `/terpenes`                | יוצרים טרפן חדש בקטלוג המערכת                                    | `ph-flower-lotus` |   ✔   |
| PATCH  | `/terpenes/{name}`         | מעדכנים את המאפיינים, הריח וההשפעות של טרפן קיים                 | `ph-flower-lotus` |   ✔   |
| POST   | `/terpenes/{name}/enrich`  | מעשירים טרפן בודד בפרטי ארומה והשפעות מבוססי AI                  | `ph-flower-lotus` |   ✔   |
| POST   | `/terpenes/enrich-missing` | מפעילים סריקה והעשרה אוטומטית לכל הטרפנים שחסר להם מידע מבוסס AI | `ph-magic-wand`   |   ✔   |
| DELETE | `/terpenes/{name}`         | מחוקים טרפן לצמיות מקטלוג המערכת                                 | `ph-trash`        |   ✔   |

---

## ideas

`backend/src/modules/ideas/ideas.controller.ts` — 9 endpoints

| Method | Endpoint                      | summaryHe                                                  | toolIcon          | Agent |
| ------ | ----------------------------- | ---------------------------------------------------------- | ----------------- | :---: |
| POST   | `/ideas/generate`             | מגבשים ומחוללים רעיונות סטארטאפ חדשניים ופורצי דרך         | `ph-lightbulb`    |   ✔   |
| GET    | `/ideas/generate/stream`      | מחוללים רעיונות עסקיים מעולים עם חיווי התקדמות חי בסטרמינג | `ph-lightbulb`    |   ✔   |
| GET    | `/ideas/sessions`             | מציג את רשימת שמירות הרעיונות שלך, מסודרת מהחדשה לישנה     | `ph-lightbulb`    |   ✔   |
| GET    | `/ideas/sessions/{id}`        | מציג שמירת רעיונות אחת עם כל הרעיונות שנוצרו בה            | `ph-lightbulb`    |   ✔   |
| DELETE | `/ideas/sessions/{id}`        | מוחק שמירת רעיונות אחת לצמיתות                             | `ph-trash`        |   ✔   |
| PATCH  | `/ideas/ideas/{id}`           | מסמן או מסיר רעיון שמור כמועדף                             | `ph-star`         |   ✔   |
| GET    | `/ideas/nightly/unread-count` | מחזיר כמה שמירות ליליות טרם נקראו                          | `ph-moon`         |   ✔   |
| POST   | `/ideas/nightly/mark-read`    | מסמן את כל שמירות הלילה כנקראו                             | `ph-check-circle` |   ✔   |
| POST   | `/ideas/nightly/trigger`      | מריץ את מחולל הרעיונות הלילי ידנית                         | `ph-lightning`    |   ✔   |

---

## Google Calendar

`backend/src/modules/google-calendar/google-calendar.controller.ts` — 6 endpoints

| Method | Endpoint             | summaryHe                                          | toolIcon | Agent |
| ------ | -------------------- | -------------------------------------------------- | -------- | :---: |
| GET    | `/calendar/auth`     | מקבלים את קישור האישור של Google כדי לחבר את היומן | —        |   ✔   |
| GET    | `/calendar/callback` | מטפלים בהפנייה חזרה מ-Google אחרי אישור הגישה      | —        |   ✖   |
| GET    | `/calendar/events`   | מציגים את האירועים העתידיים ביומן Google           | —        |   ✔   |
| POST   | `/calendar/events`   | יוצרים אירוע חדש ביומן Google                      | —        |   ✔   |
| DELETE | `/calendar/events`   | מוחקים אירוע מהיומן Google                         | —        |   ✔   |
| PATCH  | `/calendar/events`   | מעדכנים או מזיזים אירוע ביומן Google               | —        |   ✔   |

**Note:** no `toolIcon` declared in this controller — the only module missing it entirely.

---

## strain-hunter

`backend/src/modules/strain-hunter/strain-hunter.controller.ts` — 3 endpoints

| Method | Endpoint                     | summaryHe                                     | toolIcon         | Agent |
| ------ | ---------------------------- | --------------------------------------------- | ---------------- | :---: |
| GET    | `/strain-hunter/fetch`       | סורקים, מעדכנים ומציגים את מלאי הזנים הנוכחי  | `ph-compass`     |   ✔   |
| GET    | `/strain-hunter/preferences` | שולפים את הגדרות ההתאמה האישית השמורות שלך    | `ph-sliders`     |   ✔   |
| PUT    | `/strain-hunter/preferences` | שומרים או מעדכנים את הגדרות ההתאמה האישית שלך | `ph-floppy-disk` |   ✔   |

---

## Remaining modules (1 endpoint each)

| Module           | Method | Endpoint                    | summaryHe                                             | toolIcon                    | Agent |
| ---------------- | ------ | --------------------------- | ----------------------------------------------------- | --------------------------- | :---: |
| analytics        | POST   | `/analytics/query`          | מריצים שאילתת אנליטיקה ומקבלים נתוני גרף מעובדים      | `ph-chart-line`             |   ✔   |
| currency         | GET    | `/currency/current`         | מציגים שערי חליפין מעודכנים על בסיס מטבע נבחר         | `ph-currency-circle-dollar` |   ✔   |
| currency         | GET    | `/currency/convert`         | ממירים סכומי כסף בין שני מטבעות לפי השער היציג העדכני | `ph-currency-circle-dollar` |   ✔   |
| system           | GET    | `/system/status`            | מציגים את מצב המערכת הכללי, העומסים ומדדי הפעילות     | `ph-gauge`                  |   ✔   |
| web-search       | GET    | `/web-search/search`        | מחפשים מידע עדכני באינטרנט לאימות עובדות ומחקר מהיר   | `ph-magnifying-glass`       |   ✔   |
| database-monitor | GET    | `/database-monitor/storage` | מציגים את השימוש באחסון ומספר השורות של כל טבלה ב-DB  | `ph-database`               |   ✔   |

---

## Findings

### 1. Corrupted Hebrew string

`backend/src/modules/auth/auth.controller.ts:133`

The `summaryHe` value does not contain clean Hebrew. Two characters of a foreign script sit at
positions 12–13, inside the word `מהמערכת`. They are codepoints **U+7CFB** and **U+7D71**.

This document deliberately does not transcribe the corrupted value — not the glyphs, and not
placeholders either, since both break the flow of a Hebrew line. Inspect the file instead:

```
sed -n '133p' backend/src/modules/auth/auth.controller.ts
```

`מהמערכת` ("from the system") lost its tail: `מערכת` was overwritten by the two foreign characters.
The line should read exactly:

```
summaryHe: 'מתנתקים מהמערכת ומסיימים את סשן העבודה בבטחה',
```

This is the only corrupted `summaryHe` found — a scan of all 81 values for non-Hebrew, non-ASCII
characters returns nothing else. Note that the classic mojibake check is **not** sufficient on its
own, because it only matches Windows-1252 damage; the U+7CFB style passes it clean. Use a codepoint
range check instead (this is the one that found the defect above):

```
grep -rnP "[\x{3040}-\x{30FF}\x{3400}-\x{4DBF}\x{4E00}-\x{9FFF}\x{0900}-\x{097F}]" backend/src/
```

### 2. `toolIcon` missing in google-calendar

All 6 calendar endpoints carry `summaryHe` but no `toolIcon`. Every other module has one.

### 3. Enumeration of agent-hidden tools

7 endpoints are declared as tools but filtered out by `HIDDEN_FROM_LLM`:

| Tool name                              | Reason (from parser comment)   |
| -------------------------------------- | ------------------------------ |
| `AdminAgentController_confirmAction`   | self-recursion risk            |
| `AdminAgentController_streamChat`      | self-recursion risk            |
| `GoogleCalendarController_callback`    | external OAuth redirect target |
| `LlmProviderController_deleteProvider` | irreversible bulk delete       |
| `LlmProviderController_syncModels`     | bulk add, admin-dialog only    |
| `LlmController_testProviderModels`     | minutes-long background run    |

### 4. Consistency drift

- `ideas` module uses third-person singular (`מציג`, `מוחק`, `מסמן`, `מריץ`) while every other module uses plural (`מציגים`, `מוחקים`). 7 of 9 ideas endpoints are singular.
- Genetics/terpene DELETE strings read `מחוקים ... לצמיות` — likely `לצמיתות` typo (appears 3×, in both modules).

### 5. Not `summaryHe`, but related

`POST /admin-agent/messages/images` reads `שולפים ומציגים את קבצי המדיה והתמונות של ההודעה` — a `POST` worded as a lookup. Matches the endpoint semantics (query-in-body), but worth a glance.

---

## Cross-reference

- Old audit: `documents/audit/api-operations-table.md` — outdated (57 endpoints, 19 missing `summaryHe`/`toolIcon`). The gaps it lists are all closed now.
- Old audit covered `genetics`, `terpenes`, `ideas` only partially; `google-calendar` was absent entirely.

# summaryHe → Singular Form Conversion

Converts all plural-form `summaryHe` verbs (מציגים, מוחקים, ...) to singular
(מציג, מוחק, ...), matching the convention already used in `ideas.controller.ts`.

74 of 81 strings change. Unchanged: the 7 already-singular `ideas` entries, and
`LlmController` test-all/status (no leading verb — not applicable).

Bonus fixes folded in because the line is touched anyway:

- `auth.controller.ts:133` — corrupted value replaced with clean text
- `genetics`/`terpenes` DELETE — `לצמיות` → `לצמיתות` typo (3 occurrences)

Format: `OLD` → `NEW`, grouped by file. Straight find-and-replace per line.

---

## backend/src/modules/auth/auth.controller.ts

- `'יוצרים חשבון חדש ומצטרפים למשפחת המערכת'` → `'יוצר חשבון חדש ומצטרף למשפחת המערכת'`
- `'נכנסים לחשבון האישי בבטחה'` → `'נכנס לחשבון האישי בבטחה'`
- `'מחדשים את טוקן הגישה ברקע כדי להישאר מחוברים'` → `'מחדש את טוקן הגישה ברקע כדי להישאר מחובר'`
- line 133 (corrupted) → `'מתנתק מהמערכת ומסיים את סשן העבודה בבטחה'`
- `'מציגים את פרטי הפרופיל המהירים של המשתמש הנוכחי'` → `'מציג את פרטי הפרופיל המהירים של המשתמש הנוכחי'`

## backend/src/modules/users/users.controller.ts

- `'מציגים את רשימת המשתמשים הפעילים במערכת'` → `'מציג את רשימת המשתמשים הפעילים במערכת'`
- `'מציגים את פרטי הפרופיל המהירים של המשתמש הנוכחי'` → `'מציג את פרטי הפרופיל המהירים של המשתמש הנוכחי'`
- `'מציגים פרטים מלאים על משתמש לפי מזהה ייחודי'` → `'מציג פרטים מלאים על משתמש לפי מזהה ייחודי'`
- `'מעדכנים את פרטי הפרופיל האישיים של המשתמש'` → `'מעדכן את פרטי הפרופיל האישיים של המשתמש'`
- `'מוחקים משתמש לצמיתות מהמערכת'` → `'מוחק משתמש לצמיתות מהמערכת'`
- `'מעדכנים את תפקיד והרשאות המשתמש במערכת'` → `'מעדכן את תפקיד והרשאות המשתמש במערכת'`

## backend/src/modules/admin-agent/admin-agent.controller.ts

- `'מציגים את כל שיחות הצ'אט השמורות שלך עם ה-AI'` → `'מציג את כל שיחות הצ'אט השמורות שלך עם ה-AI'`
- `'מציגים את היסטוריית ההודעות המלאה של שיחת הצ'אט'` → `'מציג את היסטוריית ההודעות המלאה של שיחת הצ'אט'`
- `'שולפים ומציגים את קבצי המדיה והתמונות של ההודעה'` → `'שולף ומציג את קבצי המדיה והתמונות של ההודעה'`
- `'פותחים שיחת צ'אט חדשה ורעננה עם סוכן ה-AI'` → `'פותח שיחת צ'אט חדשה ורעננה עם סוכן ה-AI'`
- `'מוחקים לצמיתות שיחת צ'אט מההיסטוריה השמורה'` → `'מוחק לצמיתות שיחת צ'אט מההיסטוריה השמורה'`
- `'מוחקים הודעת צאט ואת כל היסטוריית השיחה שנכתבה אחריה'` → `'מוחק הודעת צ'אט ואת כל היסטוריית השיחה שנכתבה אחריה'`
- `'מתכתבים עם סוכן הניהול ומקבלים תגובות חיות בסטרמינג'` → `'מתכתב עם סוכן הניהול ומקבל תגובות חיות בסטרמינג'`
- `'מאשרים או מבטלים פעולה רגישה הממתינה לאישור הניהול שלך'` → `'מאשר או מבטל פעולה רגישה הממתינה לאישור הניהול שלך'`

## backend/src/modules/llm/llm.controller.ts

- `'בודקים ברקע את כל המודלים הפעילים של הספק ושומרים תוצאות'` → `'בודק ברקע את כל המודלים הפעילים של הספק ושומר תוצאות'`
- `'האם ריצת בדיקות רקע פעילה עבור הספק'` → unchanged (no leading verb)
- `'בודקים ומאמתים את מהירות התגובה והחיבור של מודל ה-AI'` → `'בודק ומאמת את מהירות התגובה והחיבור של מודל ה-AI'`
- `'מוחקים היסטוריית בדיקת חיבור בודדת של מודל מהארכיון'` → `'מוחק היסטוריית בדיקת חיבור בודדת של מודל מהארכיון'`
- `'קובעים את מודל ה-AI המועדף עליך כברירת המחדל של המערכת'` → `'קובע את מודל ה-AI המועדף עליך כברירת המחדל של המערכת'`
- `'מציגים את מודל ה-AI המוגדר כברירת המחדל שלך'` → `'מציג את מודל ה-AI המוגדר כברירת המחדל שלך'`
- `'יוצרים תמונות מרהיבות על בסיס טקסט עם Agnes Image'` → `'יוצר תמונות מרהיבות על בסיס טקסט עם Agnes Image'`
- `'מפיקים סרטונים מרהיבים מבוססי טקסט או תמונה עם Agnes Video'` → `'מפיק סרטונים מרהיבים מבוססי טקסט או תמונה עם Agnes Video'`
- `'בודקים את סטטוס הפקת הסרטון ומורידים אותו כשהוא מוכן'` → `'בודק את סטטוס הפקת הסרטון ומוריד אותו כשהוא מוכן'`
- `'מאריכים וממשיכים סרטון קיים מפריים המפתח האחרון שלו'` → `'מאריך וממשיך סרטון קיים מפריים המפתח האחרון שלו'`

## backend/src/modules/llm-provider/llm-provider.controller.ts

- `'רושמים ספק מודלים (Provider) חדש במערכת'` → `'רושם ספק מודלים (Provider) חדש במערכת'`
- `'מציגים את כל ספקי ה-AI והמודלים המוגדרים במערכת'` → `'מציג את כל ספקי ה-AI והמודלים המוגדרים במערכת'`
- `'מעדכנים את הגדרות החיבור, הכתובת והמפתח של הספק'` → `'מעדכן את הגדרות החיבור, הכתובת והמפתח של הספק'`
- `'מוחקים ספק לצמיתות יחד עם כל המודלים שלו'` → `'מוחק ספק לצמיתות יחד עם כל המודלים שלו'`
- `'מוסיפים מודל חדש תחת ספק ה-LLM שנבחר'` → `'מוסיף מודל חדש תחת ספק ה-LLM שנבחר'`
- `'שולפים את קטלוג המודלים החי מהספק וממזגים אותו עם המקומי (חדש / קיים / לא זמין)'` → `'שולף את קטלוג המודלים החי מהספק וממזג אותו עם המקומי (חדש / קיים / לא זמין)'`
- `'מוסיפים מודלים שנבחרו מהקטלוג כשהם כבויים, עם דילוג של קיימים'` → `'מוסיף מודלים שנבחרו מהקטלוג כשהם כבויים, עם דילוג של קיימים'`
- `'מעדכנים את ההגדרות, התפקיד והסטטוס הפעיל של מודל קיים'` → `'מעדכן את ההגדרות, התפקיד והסטטוס הפעיל של מודל קיים'`
- `'מכבים או מוחקים מודל לצמיתות מהספק שלו'` → `'מכבה או מוחק מודל לצמיתות מהספק שלו'`
- `'מנקים את כל היסטוריית בדיקות החיבור של המודל'` → `'מנקה את כל היסטוריית בדיקות החיבור של המודל'`
- `'מציגים את כל המודלים המשויכים לספק שנבחר'` → `'מציג את כל המודלים המשויכים לספק שנבחר'`
- `'מנקים בדיקות חיבור ישנות מהארכיון על בסיס תקופת שימור'` → `'מנקה בדיקות חיבור ישנות מהארכיון על בסיס תקופת שימור'`
- `'מציגים את ההיסטוריה המלאה של בדיקות החיבור במערכת'` → `'מציג את ההיסטוריה המלאה של בדיקות החיבור במערכת'`
- `'מציגים דירוג מודלים: המהיר ביותר, היציב ביותר, וזמני תגובה בפועל'` → `'מציג דירוג מודלים: המהיר ביותר, היציב ביותר, וזמני תגובה בפועל'`

## backend/src/modules/genetics/genetics.controller.ts

- `'מציגים את קטלוג הגנטיקה והזנים המלא במערכת'` → `'מציג את קטלוג הגנטיקה והזנים המלא במערכת'`
- `'מציגים פרטים מלאים על זן גנטיקה ספציפי לפי שמו'` → `'מציג פרטים מלאים על זן גנטיקה ספציפי לפי שמו'`
- `'יוצרים גנטיקה חדשה בקטלוג המערכת'` → `'יוצר גנטיקה חדשה בקטלוג המערכת'`
- `'מעדכנים את מאפייני הגנטיקה של זן קיים לפי שמו'` → `'מעדכן את מאפייני הגנטיקה של זן קיים לפי שמו'`
- `'מעשירים זן גנטיקה בודד בפרטים ונתוני מעבדה מבוססי AI'` → `'מעשיר זן גנטיקה בודד בפרטים ונתוני מעבדה מבוססי AI'`
- `'מפעילים סריקה והעשרה אוטומטית לכל הזנים שחסר להם מידע מבוסס AI'` → `'מפעיל סריקה והעשרה אוטומטית לכל הזנים שחסר להם מידע מבוסס AI'`
- `'מחוקים זן גנטיקה לצמיות מקטלוג'` → `'מוחק זן גנטיקה לצמיתות מקטלוג'`

## backend/src/modules/terpene/terpene.controller.ts

- `'מציגים את קטלוג הטרפנים המלא המוגדר במערכת'` → `'מציג את קטלוג הטרפנים המלא המוגדר במערכת'`
- `'מציגים פרטים מלאים על טרפן ספציפי לפי שמו'` → `'מציג פרטים מלאים על טרפן ספציפי לפי שמו'`
- `'יוצרים טרפן חדש בקטלוג המערכת'` → `'יוצר טרפן חדש בקטלוג המערכת'`
- `'מעדכנים את המאפיינים, הריח וההשפעות של טרפן קיים'` → `'מעדכן את המאפיינים, הריח וההשפעות של טרפן קיים'`
- `'מעשירים טרפן בודד בפרטי ארומה והשפעות מבוססי AI'` → `'מעשיר טרפן בודד בפרטי ארומה והשפעות מבוססי AI'`
- `'מפעילים סריקה והעשרה אוטומטית לכל הטרפנים שחסר להם מידע מבוסס AI'` → `'מפעיל סריקה והעשרה אוטומטית לכל הטרפנים שחסר להם מידע מבוסס AI'`
- `'מחוקים טרפן לצמיות מקטלוג המערכת'` → `'מוחק טרפן לצמיתות מקטלוג המערכת'`

## backend/src/modules/ideas/ideas.controller.ts

Only these two are actually plural — everything else in this file is already correct:

- `'מגבשים ומחוללים רעיונות סטארטאפ חדשניים ופורצי דרך'` → `'מגבש ומחולל רעיונות סטארטאפ חדשניים ופורצי דרך'`
- `'מחוללים רעיונות עסקיים מעולים עם חיווי התקדמות חי בסטרמינג'` → `'מחולל רעיונות עסקיים מעולים עם חיווי התקדמות חי בסטרמינג'`

## backend/src/modules/google-calendar/google-calendar.controller.ts

- `'מקבלים את קישור האישור של Google כדי לחבר את היומן'` → `'מקבל את קישור האישור של Google כדי לחבר את היומן'`
- `'מטפלים בהפנייה חזרה מ-Google אחרי אישור הגישה'` → `'מטפל בהפנייה חזרה מ-Google אחרי אישור הגישה'`
- `'מציגים את האירועים העתידיים ביומן Google'` → `'מציג את האירועים העתידיים ביומן Google'`
- `'יוצרים אירוע חדש ביומן Google'` → `'יוצר אירוע חדש ביומן Google'`
- `'מוחקים אירוע מהיומן Google'` → `'מוחק אירוע מהיומן Google'`
- `'מעדכנים או מזיזים אירוע ביומן Google'` → `'מעדכן או מזיז אירוע ביומן Google'`

## backend/src/modules/strain-hunter/strain-hunter.controller.ts

- `'סורקים, מעדכנים ומציגים את מלאי הזנים הנוכחי'` → `'סורק, מעדכן ומציג את מלאי הזנים הנוכחי'`
- `'שולפים את הגדרות ההתאמה האישית השמורות שלך'` → `'שולף את הגדרות ההתאמה האישית השמורות שלך'`
- `'שומרים או מעדכנים את הגדרות ההתאמה האישית שלך'` → `'שומר או מעדכן את הגדרות ההתאמה האישית שלך'`

## Remaining single-endpoint modules

- `analytics.controller.ts`: `'מריצים שאילתת אנליטיקה ומקבלים נתוני גרף מעובדים'` → `'מריץ שאילתת אנליטיקה ומקבל נתוני גרף מעובדים'`
- `currency.controller.ts`: `'מציגים שערי חליפין מעודכנים על בסיס מטבע נבחר'` → `'מציג שערי חליפין מעודכנים על בסיס מטבע נבחר'`
- `currency.controller.ts`: `'ממירים סכומי כסף בין שני מטבעות לפי השער היציג העדכני'` → `'ממיר סכומי כסף בין שני מטבעות לפי השער היציג העדכני'`
- `system.controller.ts`: `'מציגים את מצב המערכת הכללי, העומסים ומדדי הפעילות'` → `'מציג את מצב המערכת הכללי, העומסים ומדדי הפעילות'`
- `web-search.controller.ts`: `'מחפשים מידע עדכני באינטרנט לאימות עובדות ומחקר מהיר'` → `'מחפש מידע עדכני באינטרנט לאימות עובדות ומחקר מהיר'`
- `database-monitor.controller.ts`: `'מציגים את השימוש באחסון ומספר השורות של כל טבלה ב-DB'` → `'מציג את השימוש באחסון ומספר השורות של כל טבלה ב-DB'`

כן. אני חושב שהבעיה היא לא רק **יחיד/רבים** — הניסוחים עצמם נשמעים קצת כמו Swagger שנכתב על ידי רובוט 😄

אם המטרה היא `summaryHe` שמרגיש **טבעי, קצר וזורם**, הייתי הולך על כלל פשוט:

> **פועל קצר + מה הפעולה עושה.**
> בלי מילים מיותרות כמו "במערכת", "המלא", "הנבחר", "לצמיתות" כשזה כבר ברור מה־endpoint.

לדוגמה:

- `מציג את כל ספקי ה-AI והמודלים המוגדרים במערכת`
  → **`מציג את ספקי ה-AI והמודלים`**

- `מעדכן את ההגדרות, התפקיד והסטטוס הפעיל של מודל קיים`
  → **`מעדכן הגדרות ומצב של מודל`**

- `מוחק ספק לצמיתות יחד עם כל המודלים שלו`
  → **`מוחק ספק ואת המודלים שלו`**

- `מציגים דירוג מודלים: המהיר ביותר, היציב ביותר, וזמני תגובה בפועל`
  → **`מציג דירוג וביצועים של המודלים`**

### הייתי אפילו מגדיר Style Guide קטן

**CRUD:**

- `מציג את...`
- `מציג פרטים על...`
- `יוצר...`
- `מעדכן...`
- `מוחק...`

**פעולות מיוחדות:**

- `בודק...`
- `מפעיל...`
- `מנקה...`
- `שולף...`
- `מייבא...`
- `מייצא...`

**להימנע מ:**

- "במערכת" — אם ברור שמדובר במערכת
- "המלא" — אלא אם באמת חשוב להבדיל
- "הנבחר" — בדרך כלל מיותר
- "לצמיתות" — מיותר אם DELETE כבר ברור
- "חדש" — אם מדובר ב־create
- "קיים" — אם מדובר ב־update
- "מהארכיון" — רק אם זה משמעותי למשתמש
- משפטים ארוכים עם 3–4 פעולות

### למשל, הייתי משייף את הרשימה שלך כך

| היום                                                         | קליל יותר                          |
| ------------------------------------------------------------ | ---------------------------------- |
| מציג את קטלוג הגנטיקה והזנים המלא במערכת                     | **מציג את קטלוג הגנטיקה והזנים**   |
| מציג פרטים מלאים על זן גנטיקה ספציפי לפי שמו                 | **מציג פרטים על זן לפי שם**        |
| יוצר גנטיקה חדשה בקטלוג המערכת                               | **מוסיף זן גנטיקה לקטלוג**         |
| מעדכן את מאפייני הגנטיקה של זן קיים לפי שמו                  | **מעדכן את פרטי הזן**              |
| מעשיר זן גנטיקה בודד בפרטים ונתוני מעבדה מבוססי AI           | **מעשיר זן בנתוני AI ומעבדה**      |
| מפעיל סריקה והעשרה אוטומטית לכל הזנים שחסר להם מידע מבוסס AI | **סורק ומעשיר זנים שחסר להם מידע** |
| מוחק זן גנטיקה לצמיתות מקטלוג                                | **מוחק זן מהקטלוג**                |

ובעיניי יש כאן עוד שיפור חשוב:

**לא חייבים להתחיל כל summary בפועל "תיאורי" אם אפשר לנסח אותו כמו פעולה אנושית.**

למשל:

`שולף את קטלוג המודלים החי מהספק וממזג אותו עם המקומי (חדש / קיים / לא זמין)`

יכול להפוך ל:

**`מסנכרן את קטלוג המודלים עם הספק`**

הרבה יותר נקי.

או:

`בודק ברקע את כל המודלים הפעילים של הספק ושומר תוצאות`

→ **`בודק את המודלים הפעילים ושומר את התוצאות`**

`מתכתב עם סוכן הניהול ומקבל תגובות חיות בסטרמינג`

→ **`מתכתב עם סוכן הניהול בסטרימינג`**

`מאשר או מבטל פעולה רגישה הממתינה לאישור הניהול שלך`

→ **`מאשר או מבטל פעולה שממתינה לאישור`**

---

### ואם אתה רוצה שזה ירגיש ממש כמו מוצר Premium

הייתי מכוון ל־**5–8 מילים**, ולא מנסה להסביר את כל ה־endpoint ב־summary.

לדוגמה:

```text
מציג את המשתמשים הפעילים
מציג פרופיל משתמש
מעדכן פרטי משתמש
מוחק משתמש
מציג את ספקי ה-AI
מוסיף מודל לספק
מעדכן הגדרות מודל
מוחק מודל
בודק חיבור למודל
מציג היסטוריית בדיקות
מנקה בדיקות ישנות
מציג קטלוג זנים
מציג פרטי זן
מוסיף זן לקטלוג
מעדכן פרטי זן
מעשיר זן באמצעות AI
סורק זנים חסרים
מציג קטלוג טרפנים
מציג פרטי טרפן
מוסיף טרפן לקטלוג
מעדכן פרטי טרפן
מעשיר טרפן באמצעות AI
מציג אירועי Google Calendar
יוצר אירוע ביומן
מעדכן אירוע ביומן
מוחק אירוע מהיומן
```

זה כבר מרגיש פחות כמו **תיעוד טכני של API** ויותר כמו **תיאור פעולה של מוצר**.

אם תרצה, אני יכול לקחת **את כל ה־74 שורות שלך** ולעשות להן polish כזה — לא רק singular/plural, אלא ממש **אחידות ניסוח + עברית טבעית + קצרה**, תוך שמירה על המשמעות המדויקת של כל endpoint.

בטח. הייתי עושה לזה **polish מלא**, אבל בלי לשנות משמעות פונקציונלית של ה־endpoint. המטרה: קצר, טבעי, עקבי, ובלי תחושה של Swagger גנרי.

### `auth.controller.ts`

```text
יוצר חשבון חדש ומצטרף למשפחת המערכת
נכנס לחשבון האישי בבטחה
מחדש את טוקן הגישה כדי להישאר מחובר
מתנתק מהמערכת ומסיים את הסשן
מציג את פרטי הפרופיל של המשתמש הנוכחי
```

### `users.controller.ts`

```text
מציג את המשתמשים הפעילים
מציג את פרטי המשתמש הנוכחי
מציג פרטי משתמש לפי מזהה
מעדכן את פרטי המשתמש
מוחק משתמש מהמערכת
מעדכן את תפקיד והרשאות המשתמש
```

### `admin-agent.controller.ts`

```text
מציג את שיחות הצ'אט השמורות
מציג את היסטוריית ההודעות של שיחה
שולף ומציג את קבצי המדיה של הודעה
פותח שיחת צ'אט חדשה עם סוכן ה-AI
מוחק שיחת צ'אט מההיסטוריה
מוחק הודעה ואת ההודעות שאחריה
מתכתב עם סוכן הניהול בסטרימינג
מאשר או מבטל פעולה שממתינה לאישור
```

### `llm.controller.ts`

```text
בודק את המודלים הפעילים ושומר את התוצאות
האם ריצת בדיקות רקע פעילה עבור הספק
בודק את החיבור והמהירות של מודל ה-AI
מוחק בדיקת חיבור מההיסטוריה
מגדיר את מודל ה-AI כברירת המחדל
מציג את מודל ה-AI כברירת המחדל
יוצר תמונה מטקסט עם Agnes Image
יוצר סרטון מטקסט או תמונה עם Agnes Video
בודק את סטטוס הסרטון ומוריד אותו כשהוא מוכן
מאריך סרטון קיים מהפריים האחרון
```

### `llm-provider.controller.ts`

```text
מוסיף ספק מודלים חדש
מציג את ספקי ה-AI והמודלים
מעדכן את הגדרות הספק
מוחק ספק ואת המודלים שלו
מוסיף מודל לספק ה-LLM
מסנכרן את קטלוג המודלים עם הספק
מוסיף מודלים נבחרים מהקטלוג
מעדכן הגדרות ומצב של מודל
מכבה או מוחק מודל מהספק
מנקה את היסטוריית בדיקות החיבור
מציג את המודלים של הספק
מנקה בדיקות חיבור ישנות
מציג את היסטוריית בדיקות החיבור
מציג דירוג וביצועים של המודלים
```

### `genetics.controller.ts`

```text
מציג את קטלוג הגנטיקה והזנים
מציג פרטים על זן לפי שם
מוסיף זן גנטיקה לקטלוג
מעדכן את פרטי הזן
מעשיר זן בנתוני AI ומעבדה
סורק ומעשיר זנים שחסר להם מידע
מוחק זן מהקטלוג
```

### `terpene.controller.ts`

```text
מציג את קטלוג הטרפנים
מציג פרטים על טרפן לפי שם
מוסיף טרפן לקטלוג
מעדכן את פרטי הטרפן
מעשיר טרפן בנתוני ארומה והשפעות
סורק ומעשיר טרפנים שחסר להם מידע
מוחק טרפן מהקטלוג
```

### `ideas.controller.ts`

```text
מגבש ומחולל רעיונות סטארטאפ חדשניים
מחולל רעיונות עסקיים עם חיווי התקדמות חי
```

### `google-calendar.controller.ts`

```text
מקבל קישור לאישור חיבור ל-Google
מטפל בחזרה מ-Google לאחר אישור הגישה
מציג את האירועים העתידיים ביומן
יוצר אירוע ביומן Google
מוחק אירוע מהיומן
מעדכן או מזיז אירוע ביומן
```

### `strain-hunter.controller.ts`

```text
סורק ומעדכן את מלאי הזנים
שולף את הגדרות ההתאמה האישית
שומר או מעדכן את הגדרות ההתאמה האישית
```

### שאר ה־controllers

**`analytics.controller.ts`**

```text
מריץ שאילתת אנליטיקה ומחזיר נתוני גרף
```

**`currency.controller.ts`**

```text
מציג שערי חליפין לפי מטבע
ממיר סכום בין שני מטבעות לפי השער העדכני
```

**`system.controller.ts`**

```text
מציג את מצב המערכת ומדדי הפעילות
```

**`web-search.controller.ts`**

```text
מחפש מידע עדכני באינטרנט לאימות ומחקר
```

**`database-monitor.controller.ts`**

```text
מציג את השימוש באחסון ומספר השורות בטבלאות
```

### הכלל שהייתי מאמץ בפרויקט

```text
GET     → מציג / שולף
POST    → יוצר / מוסיף / מפעיל
PATCH   → מעדכן
DELETE  → מוחק / מנקה
ACTION  → בודק / מסנכרן / מעשיר / מריץ
```

ובעיקר: **לא לנסות לדחוס לתוך `summaryHe` את כל מה שה־endpoint עושה.**
ה־summary צריך לענות מהר על השאלה:

> **"מה הפעולה הזאת עושה?"**

ולא:

> "איך אני מתעד את כל הפרטים הטכניים שלה?"

זה גם ייתן ל־`agentic-admin` שלך tool descriptions הרבה יותר נקיים למודל.
