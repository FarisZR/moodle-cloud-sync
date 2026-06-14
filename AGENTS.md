# Repository Guidelines
a simple web app that syncs selected DHBW Moodle course files to Google Drive.

## Project Structure & Module Organization

This is a Next.js App Router TypeScript app for syncing selected Moodle course files to Google Drive. App routes, pages, and server actions live in `src/app/`. UI primitives are in `src/components/ui/`, utilities in `src/lib/`, and hooks in `src/hooks/`. Backend code is under `src/server/`, split by concern such as `moodle/`, `google/`, `sync/`, storage, crypto, scheduler, and app state. Prisma schema and config live in `prisma/`. Tests are colocated as `*.test.ts` or `*.test.tsx`, with shared helpers in `tests/support/`. Static assets are in `public/`, scripts in `scripts/`, and docs in `docs/`.

## Build, Test, and Development Commands

Use `pnpm` (`packageManager` is `pnpm@10.30.1`).

- `pnpm dev`: start the local Next.js development server.
- `pnpm build`: generate the Prisma client and build the production app.
- `pnpm test`: run Vitest with coverage.
- `pnpm test:watch`: run Vitest interactively.
- `pnpm typecheck`: run `tsc --noEmit`.
- `pnpm check`: run Biome formatting and lint checks.
- `pnpm verify`: run `check`, `typecheck`, and `test`.
- `pnpm db:generate`, `pnpm db:migrate:dev`, `pnpm db:push`: Prisma workflows.
- `pnpm e2e`: run Playwright tests.

## Coding Style & Naming Conventions

Biome is the formatter and linter. Keep imports organized and let `pnpm check:write` apply safe fixes. Follow the existing TypeScript style: tabs, ESM imports, camelCase functions and variables, PascalCase React components, and kebab-case route directories. Prefer small server modules grouped by domain (`src/server/moodle/client.ts`, `src/server/sync/service.ts`). Use `cn`/Tailwind class sorting when composing class names.

## Testing Guidelines

Vitest is the primary test runner. Server coverage is enforced at 100% for `src/server/**/*.ts`, so new backend behavior needs focused tests. Name tests next to the code they cover: `*.test.ts` for server modules and `*.test.tsx` for React UI. Use `tests/support/` for shared fixtures. Run `pnpm test` before backend changes and `pnpm verify` for a full gate.

## Commit & Pull Request Guidelines

Recent commits use short, imperative summaries such as `Add client-side course search filtering`. Keep commits focused and describe the behavioral change. Pull requests should include a summary, tests run, linked issues when applicable, screenshots for UI changes, and any database, environment, or deployment impact.

## Security & Configuration Tips

Start from `.env.example` and keep real credentials out of git. Runtime data, logs, and SQLite files belong under `data/`; secrets belong under `secrets/`. Docker runs the app on port `3000` and mounts `data` into `/app/data`; the entrypoint runs `prisma db push` before starting Next.js.
