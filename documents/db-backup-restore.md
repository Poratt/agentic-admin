# DB Backup & Restore Runbook (MySQL `my_app` on `localhost:3306`)

Every agent working in this repo must follow this file for any backup or restore
of the shared live DB. The user runs the backend themselves in watch mode —
the agent never starts/stops it; the user does that on request.

## Trigger phrases (user, Hebrew)

- "גיבוי" / backup request → take a dump per §Backup, then verify per §Verify.
- "שחזר מהגיבוי" → explicit approval for a **destructive** restore.
  Do it per §Restore, in table order, then verify. Nothing indirect counts
  as approval — only this phrase (or a narrower explicit variant naming
  the files).

## Where backups live

`C:\tmp\db-baselines\` — outside the repo, never committed.
Naming: `my_app-<scope>-<YYYY-MM-DD-HHmm>.sql`.

| File | Scope | Rows at backup time |
| ---- | ----- | ------------------- |
| `my_app-2026-09-12-post-recovery.sql` | full (17 tables, 2.9MB) | post-recovery baseline |
| `my_app-providers-models-2026-09-17-2311.sql` | `llm_providers` + `llm_models` | 13 providers, 79 models |
| `my_app-testresults-defaults-2026-09-17-2320.sql` | `llm_model_test_results` + `user_llm_defaults` | 361 results, 2 defaults |

## Backup

Run from the repo root (`C:\Porat\Practice\ai\agentic-admin`). The password
is read from `backend/.env` (`DB_PASSWORD`) and never printed.

```powershell
$pw = (Select-String -Path backend\.env -Pattern '^DB_PASSWORD\s*=\s*(.*)$').Matches[0].Groups[1].Value
$env:MYSQL_PWD = $pw
$stamp = Get-Date -Format 'yyyy-MM-dd-HHmm'
mysqldump -h localhost -P 3306 -u root --result-file="C:\tmp\db-baselines\my_app-<scope>-$stamp.sql" my_app <tables...>
$code = $LASTEXITCODE
Remove-Item Env:\MYSQL_PWD
```

### Verify (mandatory, file-local — no writes to the server)

1. Parse the dump: both `CREATE TABLE` blocks present, row count per
   `INSERT` matches the live count (read-only `SELECT COUNT(*)`).
2. Spot-check one row per table (real keys/labels, encrypted `apiKey`
   present for providers).

### Gotchas (learned 2026-09-17, do not re-learn)

- **Never use PowerShell `>` redirect for a dump** — it re-encodes the
  stream as UTF-16 and MySQL cannot import it. Always `--result-file`.
- **PowerShell has no `<` redirect** — restore via `mysql ... -e "source <path>"`
  (forward slashes), never `mysql db < file`.
- **No scratch databases on the shared server** without explicit user
  approval (the 2026-09-12 corruption incident). Verify from the dump
  file itself; `SELECT COUNT(*)` (read-only) is always allowed.

## Restore

Preconditions: user stopped the backend AND said the trigger phrase.

```powershell
$env:MYSQL_PWD = ((Select-String -Path backend\.env -Pattern '^DB_PASSWORD\s*=\s*(.*)$').Matches[0].Groups[1].Value)
mysql -h localhost -P 3306 -u root my_app -e "source C:/tmp/db-baselines/<file1>.sql"
mysql -h localhost -P 3306 -u root my_app -e "source C:/tmp/db-baselines/<file2>.sql"
Remove-Item Env:\MYSQL_PWD
```

**Order matters** — parents before children (FKs):
1. `...-providers-models-....sql` (`llm_providers` + `llm_models`)
2. `...-testresults-defaults-....sql` (`llm_model_test_results` + `user_llm_defaults`)

Then verify with read-only counts (expect the numbers from the table
above), and ask the user to restart the backend and check the providers page.

### Warnings to give the user before restoring

1. Restore is `DROP TABLE` + rebuild — anything added after the backup is lost.
2. Only the dumped tables roll back; anything newer in other tables stays
   and may reference restored ids differently (test results ↔ models).
