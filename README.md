# AI QA Bug Generator

A local, single-user workspace for turning an English or Marathi bug description into a human-reviewed QA report. Reports are stored in a local SQLite database. AI features send the selected text or image to Google Gemini.

## Run on Windows

1. Install Node.js LTS, then check `node -v` and `npm -v` in PowerShell.
2. In the project folder, run `npm.cmd install`.
3. For the browser E2E test, install Chromium once with `npm.cmd exec -- playwright install chromium`.
4. Copy the key template with `Copy-Item .env.example backend/.env`, then open `backend/.env` in VS Code and add your Gemini API key. Keep the permanent key there; never put it in frontend files.
5. Start the app with `npm.cmd run dev` and open `http://localhost:3000`.
6. Check the server with `Invoke-RestMethod http://localhost:3000/api/health`; it should return `status: ok`.
7. Run automated tests with `npm.cmd test`. Gemini is mocked and the tests do not make live AI calls.

For a normal start without the file watcher, use `npm.cmd start`. Do not host this local-only app publicly without first adding authentication and reviewing its security model.

## Try the workflow

1. Type or dictate a description in Marathi or English. Typed input always works. If the browser does not support speech recognition, the microphone control explains that and the text field stays available.
2. Use **Ask follow-up questions** if you want help filling in missing details, then choose **Generate report**.
3. Review the 34 fields, edit suggestions, and choose **Save report**. A draft is not stored until you confirm.
4. Find saved reports in **Bug report library**. Search, filter by status/severity, open and edit, or choose Delete and confirm.
5. For a saved report, choose which fields to export, then download JSON or CSV. **Print / Save as PDF** opens a print-ready copy of the last saved report; choose **Save as PDF** in the browser's print dialog.
6. In **QA suggestions**, choose **Generate QA suggestions**. Edit or copy the suggestions, and use **Add test cases to report** to stage them in the report. Choose **Save changes** to store the edits.

The report form and export picker use the same field definitions in `backend/schemas/bug-report.schema.js`. CSV export prefixes formula-like values and quotes commas, quotes, and line breaks.

## Export and PDF status

`GET /api/bug-reports/:id/export?format=json|csv&fields=bugTitle,status` downloads selected saved fields. Unknown field names are rejected. CSV values beginning with `=`, `+`, `-`, or `@` receive a leading apostrophe to prevent spreadsheet formula execution.

The server does not generate PDF bytes in this version. `format=pdf` returns `501 PDF_EXPORT_UNAVAILABLE`; use the print-ready browser view and **Save as PDF** instead. This keeps Marathi and other Unicode text in the browser's available fonts without bundling a server PDF engine or font files.

## QA suggestions

`POST /api/bug-reports/:id/qa-suggestions` creates reproduction steps, positive, negative, and boundary scenarios, and regression cases. Every category is labelled **AI suggestion**, validated against a strict schema, and rate-limited. Suggestions are not stored automatically; applying them edits the report draft and requires the usual explicit save confirmation.

## Gemini and privacy

Generation, clarification, research, screenshot analysis, and QA suggestions send the selected text or image to Google Gemini. Research runs only when requested. Screenshot analysis is limited to visible details. The permanent API key remains in `backend/.env`; `.gitignore` excludes that file, uploads, and local database data.

The dashboard's AI Analysis History metric is stored in SQLite as timestamps only; report descriptions and AI request content are not copied into that history table.

The report model is `GEMINI_MODEL` in `backend/.env`; the Live voice model is `GEMINI_LIVE_MODEL`. The latter defaults to `gemini-3.8-live`. Model names and service availability can change; edit the environment settings when needed.

Normal tests use deterministic mocks. A separate optional live check is available with `npm.cmd run smoke:gemini`. It sends one minimal request using the configured key and model, and it is not part of `npm.cmd test`.

## Voice decision

The main voice assistant uses Gemini Live for streaming speech, transcription, and spoken responses. It auto-detects spoken language, including Marathi and mixed Marathi-English. The language indicator is a best-effort script hint, not a guarantee. The transcript is added to the description or clarification answer and remains editable before report generation. Browser Web Speech recognition is available as a fallback, and typed input always works.

The server provisions a one-use Live token that expires after 15 minutes and must start a session within 60 seconds. The permanent Gemini key stays in `backend/.env`. Live audio is sent directly from the browser to Google; run the app on `localhost` for microphone access. Google currently marks the Live API and ephemeral tokens as preview features. See Google's [ephemeral token guide](https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens) and [Live WebSocket guide](https://ai.google.dev/gemini-api/docs/live-api/get-started-websocket).

## Upload limits and local data

Screenshot uploads accept PNG, JPEG, WebP, and GIF, up to `MAX_UPLOAD_MB` (5 MB by default; the configuration allows 1–20 MB). The server checks MIME type and file signatures, assigns generated IDs, and stores files under the ignored `uploads/` folder. Remove screenshots from the app when no longer needed.

SQLite data is saved under the ignored `data/` folder. This is a single-user local workspace with no login, cloud sync, retention automation, or public-hosting protections.

## Tests and manual browser checklist

`npm.cmd test` covers schema validation, mocked AI output, repository and API workflows, CSV safety, rate limits, invalid configuration, oversized JSON/image requests, and credential absence from served assets. `test/e2e/user-workflow.test.js` covers the end-to-end HTTP workflow, and `test/e2e/browser-ui.test.js` exercises typing Marathi, clarifying, generating, editing/saving, searching, downloading exports, printing, QA suggestions, and rejecting a bad screenshot in Chromium. Both use mocked AI services.

For a visual check in your browser, also try these steps:

- Generate from typed text; confirm the report editor and field badges appear.
- Start Gemini Live voice; verify Marathi and English transcripts appear in the editor and can be corrected before generating. Check browser speech input and typed input as fallbacks.
- Ask a clarification question, answer it, generate, edit a field, and confirm Save.
- Upload a valid image and an invalid or oversized image; verify the error is visible.
- Search, filter, paginate, open, edit, and delete a saved report.
- Download JSON and CSV with a subset of fields. For PDF, use Print / Save as PDF.
- Generate QA suggestions, edit and copy them, apply them, then save the report changes.

## Troubleshooting

- **Missing configuration:** add `GEMINI_API_KEY` and `GEMINI_MODEL` to `backend/.env`; `GEMINI_LIVE_MODEL` is optional and defaults to `gemini-3.8-live`. Restart the server after edits.
- **Port already in use:** set `PORT` to an unused integer in `backend/.env`, then restart.
- **Voice unavailable:** check the Gemini API key, Live model access, network connection, and `localhost` microphone permission. Use browser speech input or type the description if Live voice cannot connect.
- **Image rejected:** use PNG, JPEG, WebP, or GIF and stay within `MAX_UPLOAD_MB`.
- **AI request failed:** check network access, model availability, API quota, and the key. Run `npm.cmd run smoke:gemini` only when you intend to make a live request.
- **PDF endpoint returns 501:** use the report's Print / Save as PDF button and choose Save as PDF in the browser dialog.

## Phase status

- Phase 1: setup and dashboard shell
- Phase 2: report schema, configuration, Gemini client, SQLite repository and middleware
- Phase 3: browser speech input and clarification turns
- Phase 4: structured report generation, editable review form and explicit save
- Phase 5: grounded research and validated screenshot analysis
- Phase 6: searchable, filterable report library with edit and confirmed delete
- Phase 7: JSON/CSV exports and editable QA suggestions; server-side PDF generation recorded as a blocker with a browser print-to-PDF path
- Phase 8: mocked HTTP and Chromium browser end-to-end workflows, security checks, Windows setup and troubleshooting documentation
#   q a R P _ V o i c e _ T o o l  
 