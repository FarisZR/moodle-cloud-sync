# DHBW Moodle to Google Drive Study Sync App — Simplified Implementation Plan

## Goal

Build a small self-hosted web app that syncs selected DHBW Moodle course materials to Google Drive.

The app is for one student running their own instance. It should be simple, reliable, and useful in the background.

The core workflow is:

1. User enters DHBW Moodle credentials.
2. App logs into DHBW Moodle like the Android Moodle app.
3. App obtains a Moodle mobile web-service token.
4. App fetches enrolled courses and course contents.
5. User selects courses and sections.
6. User optionally adjusts allowed file extensions per course.
7. App creates Google Drive folders for selected courses.
8. App downloads matching Moodle files.
9. App uploads new files or updates changed files in Google Drive.
10. User uses the generated Drive folders in ChatGPT Projects, NotebookLM, or similar tools.

The app should feel like a personal sync utility, not a full SaaS product.

---

## Tech

Use a single TypeScript app.

Implement with:

* Next.js App Router
* TypeScript
* Tailwind CSS
* shadcn/ui or simple equivalent components
* Prisma
* SQLite
* Node `fetch` / `undici`
* Cookie-aware HTTP client support
* Google Drive API
* Google OAuth Device Authorization Flow
* Docker
* One persistent Docker volume
* Biome linter
* detailed documentation under docs/ with short overview in the read me and a quick start guide.
* Test driven development with full integration tests.
* 100% test coverage

Use one repository and one container image.

The app image should contain:

* web UI
* API routes
* Moodle client
* Google Drive client
* sync runner
* daily scheduler
* SQLite database access

Persistent data lives in:

```text
/app/data
  app.db
  secret.key
  temp/
  logs/
```

---

## Deployment Shape

The user should run one container image with a mounted volume.

The app should expose one HTTP port for the web UI.

The app should work behind Caddy, Tailscale, localhost, or LAN-only access.

The app should use SQLite inside `/app/data/app.db`.

The app should generate `/app/data/secret.key` on first launch when no `APP_SECRET_KEY` is provided.

The app should encrypt stored secrets using that app secret.

---

## Stored Secrets

Store these values encrypted:

* DHBW Moodle username
* DHBW Moodle password
* DHBW organization value
* Moodle `wstoken`
* Moodle `privatetoken`, if returned
* Google refresh token
* Google OAuth client secret, if entered through the UI

The UI should allow the user to:

* save Moodle credentials
* replace Moodle credentials
* clear Moodle credentials
* configure Google OAuth client credentials
* reconnect Google Drive

After saving a password, show only that credentials exist.

---

## Moodle Authentication

Implement DHBW Moodle authentication as the primary Moodle auth path.

Default Moodle base URL:

```text
https://moodle.dhbw.de/
```

Default organization value:

```text
dh-karlsruhe.de
```

The app should use a MoodleMobile-like Android user agent.

Example user agent:

```text
Mozilla/5.0 (Linux; Android 14; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36 MoodleMobile
```

### DHBW Login Flow

Implement this flow:

1. Create a cookie-preserving HTTP session.
2. POST credentials to:

```text
https://moodle.dhbw.de/simplesaml/module.php/core/loginuserpassorg
```

Form payload:

```text
username=<username>
password=<password>
organization=<organization>
```

3. Preserve returned cookies.
4. Generate a random `passport`.
5. Call:

```text
https://moodle.dhbw.de/admin/tool/mobile/launch.php?service=moodle_mobile_app&passport=<passport>&urlscheme=moodlemobile
```

6. Capture the final `Location` header.
7. Read the `moodlemobile://token=<base64>` value.
8. Base64-decode the token payload.
9. Parse one of these payload shapes:

```text
md5(wwwroot + passport):::wstoken
```

```text
md5(wwwroot + passport):::wstoken:::privatetoken
```

10. Verify the decoded site ID matches `md5(wwwroot + passport)`.
11. Store the `wstoken` encrypted.
12. Store `privatetoken` encrypted when present.
13. Run a connection test.
14. Refresh Moodle metadata.

### Moodle Token Refresh

When a Moodle API call fails because the token is invalid, expired, or rejected:

1. Run the DHBW login flow again using the encrypted stored credentials.
2. Store the fresh token.
3. Retry the failed operation once.
4. Record the token refresh in the sync log.

The user should only need to update credentials when the actual username, password, or organization value stops working.

---

## Moodle API Calls

After obtaining a Moodle token, use the REST endpoint:

```text
https://moodle.dhbw.de/webservice/rest/server.php
```

Send requests as form data:

```text
wstoken=<wstoken>
moodlewsrestformat=json
wsfunction=<function>
```

Implement these core calls:

```text
core_webservice_get_site_info
core_enrol_get_users_courses
core_course_get_contents
```

Use `core_webservice_get_site_info` to get:

* user ID
* site URL
* available functions
* file download capability

Use `core_enrol_get_users_courses` to get the user’s Moodle courses.

Use `core_course_get_contents` to get:

* sections
* modules
* files
* file URLs
* file sizes
* modification timestamps
* MIME types

Store the Moodle metadata in SQLite.

---

## Moodle File Discovery

Represent Moodle content as:

```text
Course
  Section
    Module
      File
```

For each course, store:

* Moodle course ID
* full name
* short name
* visible flag if available
* last metadata refresh time

For each section, store:

* Moodle section ID or index
* course ID
* section name
* visible/user-visible state if available

For each module, store:

* Moodle module ID
* course ID
* section ID/index
* module name
* module type
* user-visible state if available

For each file, store:

* stable Moodle file key
* course ID
* section ID/index
* module ID
* original filename
* file path
* file URL
* file size
* time modified
* MIME type
* last seen time

Use a stable file key based on:

```text
course_id + section_id + module_id + fileurl_or_path + filename
```

Hash that composite value and use it as the internal Moodle file identity.

---

## Moodle File Downloads

Download Moodle files using their returned `fileurl`.

Append the token:

```text
<fileurl>?token=<wstoken>
```

or:

```text
<fileurl>&token=<wstoken>
```

Download each file into `/app/data/temp`.

After download:

1. Compute SHA-256.
2. Upload or update the file in Google Drive.
3. Store sync metadata.
4. Remove the temp file.

Keep downloaded files only while they are actively being processed.

---

## Google Drive Authentication

Implement Google Drive authentication with OAuth 2.0 Device Authorization Flow.

The app should let the user configure:

* Google client ID
* Google client secret

Support both:

```text
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
```

and UI-entered credentials.

When the user clicks “Connect Google Drive”:

1. Request a device code from Google.
2. Show the verification URL.
3. Show the user code.
4. Poll Google until authorization succeeds or expires.
5. Store the refresh token encrypted.
6. Verify Drive access.
7. Create or find the app root folder.

Use this scope:

```text
https://www.googleapis.com/auth/drive.file
```

---

## Google Drive Folder Model

Create one app-managed root folder:

```text
Moodle Study Sync
```

Create one folder per enabled Moodle course:

```text
Moodle Study Sync/{course name}
```

For each course, store:

* Moodle course ID
* Google Drive folder ID
* Google Drive folder URL
* folder creation time
* last verified time

The UI should show a button to open or copy each course folder URL.

The user will use those folder URLs in ChatGPT Projects, NotebookLM, or similar tools.

---

## Google Drive File Behavior

The app should upload and update files.

For each Moodle file that matches the user’s sync configuration:

1. Check if the file already has a stored Google Drive file ID.
2. Compare stored Moodle metadata and stored SHA-256.
3. Skip unchanged files.
4. Upload new files.
5. Update existing Drive files when content changed.
6. Store the Drive file ID after upload.
7. Store the latest SHA-256 and sync timestamp.

Use flat filenames inside each course folder.

Recommended Drive filename:

```text
{section_name} - {module_name} - {original_filename}
```

When needed, append a short hash to avoid name collisions.

Example:

```text
Skript - Einführung - datenbanken.pdf
Skript - Einführung - datenbanken-a1b2c3.pdf
```

When a course, section, or extension filter changes, future syncs should follow the new configuration.

Already uploaded Drive files should remain in Drive.

---

## File Type Filtering

Use a global default extension allowlist:

```text
pdf
```

Allow each course to override the global default.

For each course, the UI should support:

* use global file types
* custom allowed extensions

Example course settings:

```text
Datenbanken:
  pdf

Programmieren:
  pdf, java, py, ipynb, zip

Software Engineering:
  pdf, pptx, docx
```

Use filename extensions for filtering.

Normalize extensions to lowercase.

Ignore leading dots in user input.

Show a small preview count per course or section, such as:

```text
18 matching files
PDF, PPTX
```

---

## Course and Section Selection

Implement course-level and section-level sync selection.

The user should be able to:

* see discovered Moodle courses
* enable or disable each course
* see sections inside each course
* enable or disable each section
* configure course-specific allowed extensions
* create/open the course Drive folder
* run sync for all enabled courses
* run sync for one course

When a course is enabled, ensure its Drive folder exists.

When a section is selected, include matching files from that section in future syncs.

When a section is not selected, skip files from that section in future syncs.

---

## Sync Runner

Implement one sync runner.

Only one sync should run at a time.

The sync runner should support:

* manual sync all
* manual sync one course
* daily scheduled sync
* metadata refresh
* cancellation between files

When a sync is running, the UI should show:

* current status
* current course if available
* files processed count
* cancel button

Cancellation should be cooperative:

* check before each course
* check before each file
* finish any active file upload/download safely
* then stop

---

## Sync Algorithm

For a full sync:

1. Ensure Moodle credentials exist.
2. Ensure Google Drive is connected.
3. Ensure no other sync is running.
4. Ensure Moodle token is valid or refresh it.
5. Fetch enrolled Moodle courses.
6. Update course metadata.
7. For each enabled course:

   * ensure Drive folder exists
   * fetch course contents
   * update sections/modules/files metadata
   * read selected sections
   * read allowed extensions
   * build list of matching files
   * process each matching file
8. Save a run summary.
9. Save a plain-text run log.
10. Update dashboard status.

For each matching file:

1. Compute stable Moodle file key.
2. Check existing sync record.
3. Compare file size and Moodle modified time.
4. If definitely unchanged, skip.
5. If new or possibly changed, download to temp.
6. Compute SHA-256.
7. If hash matches previous hash, skip upload.
8. If no Drive file exists, upload.
9. If Drive file exists and hash changed, update Drive file content.
10. Save sync record.
11. Delete temp file.

---

## Daily Schedule

Implement one simple schedule:

```text
Daily sync enabled: yes/no
Run at: HH:mm
Timezone: Europe/Berlin
```

The scheduled sync should run all enabled courses.

The dashboard should show:

* schedule enabled/disabled
* next planned run
* last run result

---

## Logs and Run History

Store simple sync history.

Each run should store:

* run ID
* trigger: manual, scheduled, metadata refresh
* status: running, success, partial, failed, cancelled
* started time
* finished time
* files discovered
* files uploaded
* files updated
* files skipped
* error message if failed
* plain-text log

The UI should show:

* last sync result
* recent runs
* expandable run log

The plain-text log should include useful lines like:

```text
Starting sync
Refreshing Moodle token
Fetching enrolled courses
Syncing course: Datenbanken
Found 18 matching files
Uploaded: Skript - Einführung.pdf
Updated: Folien - Normalformen.pdf
Skipped unchanged: 16 files
Sync complete
```

---

## UI

refernce ui design is at ~/ui-design.png

Keep the UI minimal.

Use four main pages:

```text
Dashboard
Setup
Courses
Logs
```

### Dashboard

Show:

* Moodle connection status
* Google Drive connection status
* background sync status
* last sync result
* next scheduled sync
* button: Run sync now
* button: Refresh Moodle metadata

### Setup

Show two setup cards.

Moodle card:

* Moodle base URL
* organization value
* username
* password input for setting/replacing password
* button: Save credentials
* button: Test Moodle login
* connection result
* last token refresh

Google Drive card:

* Google client ID
* Google client secret
* button: Save Google client
* button: Connect Google Drive
* device code flow display
* connected account
* app root folder status

### Courses

Show all discovered courses.

Each course row/card should show:

* course name
* short name
* enable toggle
* selected section count
* allowed extensions summary
* Drive folder link
* last sync status

Expanding a course should show:

* section checklist
* allowed extensions setting
* matching file count
* button: Sync this course
* button: Open Drive folder

### Logs

Show:

* recent sync runs
* status
* timestamp
* summary counts
* expandable raw log

---

## Database Concepts

Use Prisma with SQLite.

Model these core concepts:

```text
AppSetting
Secret
MoodleConnection
GoogleConnection
MoodleCourse
MoodleSection
MoodleModule
MoodleFile
CourseSyncConfig
SectionSyncConfig
DriveFolder
SyncedFile
SyncRun
```

Suggested responsibilities:

* `AppSetting`: schedule, global extensions, general config
* `Secret`: encrypted secret values
* `MoodleConnection`: base URL, organization, token status, last refresh
* `GoogleConnection`: account email, Drive root folder ID, auth status
* `MoodleCourse`: discovered course metadata
* `MoodleSection`: discovered section metadata
* `MoodleModule`: discovered module metadata
* `MoodleFile`: discovered file metadata
* `CourseSyncConfig`: course enabled flag and allowed extension override
* `SectionSyncConfig`: section selected flag
* `DriveFolder`: course-to-Drive-folder mapping
* `SyncedFile`: Moodle file key to Google Drive file ID and hash
* `SyncRun`: run status, counts, and log text

Keep the schema small and understandable.

---

## Error Handling

Show clear errors for:

* Moodle credential login failed
* Moodle token refresh failed
* Moodle API call failed
* Moodle file download failed
* Google Drive not connected
* Google Drive token refresh failed
* Google Drive folder creation failed
* Google Drive upload failed
* SQLite write failed
* sync cancelled

A sync run can finish as `partial` when some files fail but the app successfully processed other files.

The UI should always show the most recent useful error message and point the user to the Logs page for details.

---

## Expected Result

The finished app should let the user:

1. Start the Docker container.
2. Open the web UI.
3. Enter DHBW Moodle credentials.
4. Connect Google Drive using device flow.
5. Refresh Moodle courses.
6. Enable courses.
7. Select sections.
8. Optionally add non-PDF extensions for specific courses.
9. Run sync manually or enable daily sync.
10. Open the generated Google Drive folders.
11. Use those folders as sources in ChatGPT Projects or NotebookLM.

The app should stay simple:

```text
DHBW Moodle credentials
→ Android-style Moodle token
→ selected courses and sections
→ allowed file extensions
→ Google Drive folders
→ upload/update files
→ simple logs
```

