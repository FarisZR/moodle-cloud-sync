# Quick Start

1. Copy `.env.example` to `.env` if you want to override defaults.
2. Install dependencies with `pnpm install`.
3. Start the app with `pnpm dev`.
4. Open `http://127.0.0.1:3000`.
5. Save Moodle credentials on the Setup page.
6. Save your Google device-flow client.
7. Start the Google device flow and approve it.
8. Refresh Moodle metadata.
9. Enable courses and sections.
10. Run sync.

## Real Moodle Verification

Use this command to verify the real DHBW course flow for `KA-Alle aktuellen Kurse der Informatik`.

```bash
pnpm verify:course-sync
```

It will:

1. read `secrets/moodle.txt`
2. perform the real DHBW Student login flow
3. refresh Moodle metadata
4. enable `KA-Alle aktuellen Kurse der Informatik` (course id `44` when present)
5. select only `Diverse Unterlagen`
6. run a course-scoped sync and print the summary

Persistent runtime data is stored under `APP_DATA_DIR`, which defaults to `./data`.
