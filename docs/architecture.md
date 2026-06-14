# Architecture

## Runtime

- Next.js App Router serves the UI and internal route handlers.
- Prisma uses SQLite at `APP_DATA_DIR/app.db`.
- Secrets are encrypted with AES-256-GCM.
- Moodle and Google clients live in `src/server/`.
- A single sync runner coordinates metadata refresh and file sync.
- An internal scheduler tick can be called by cron or the in-process timer.

## Data

- `AppSetting` stores schedule and active run state.
- `MoodleConnection` and `GoogleConnection` store connection metadata.
- `Secret` stores encrypted credentials and tokens.
- Moodle content is cached in course, section, module, and file tables.
- `SyncedFile` tracks Drive IDs and hashes.
- `SyncRun` keeps summaries and raw logs.

## Operations

- `POST /api/internal/scheduler/tick` runs one scheduler evaluation.
- `src/instrumentation-node.ts` optionally starts an in-process timer.
- Manual sync and metadata refresh are launched through server actions.
