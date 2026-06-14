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

Persistent runtime data is stored under `APP_DATA_DIR`, which defaults to `./data`.
