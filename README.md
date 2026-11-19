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

For local voice replies, install [Ollama](https://ollama.com/download) and run `ollama pull qwen2.5:3b`. The default local endpoint and model are configurable with `OLLAMA_BASE_URL` and `OLLAMA_MODEL` in `backend/.env`.

## Try the workflow

1. Type or dictate a description in Marathi, English, or a mix of both. Typed input always works. If the browser does not support speech recognition, the microphone control explains that and the text field stays available.
2. Optionally use **Ask follow-up questions** to clarify missing details, then choose **Convert to Professional English**.
3. Review the original and English descriptions. You can edit or copy the English version, but you must explicitly confirm it before report generation is enabled.
4. Choose **Generate Professional Bug Report**. Review and edit the exact 22-field report; unknown details are marked **Not provided** or **To be confirmed** instead of being invented.
5. Copy the full report, download it as TXT, or use **Download as PDF** to open the browser print dialog and choose **Save as PDF**. Choose **Save report** and confirm to store the report in local SQLite. **Clear All** resets the current workflow; **Regenerate Report** runs generation again from the reviewed English description.

The report form and export API use the same field definitions in `backend/schemas/bug-report.schema.js`. CSV export prefixes formula-like values and quotes commas, quotes, and line breaks.

## Export and PDF status

`GET /api/bug-reports/:id/export?format=json|csv&fields=bugTitle,status` downloads selected saved fields. Unknown field names are rejected. CSV values beginning with `=`, `+`, `-`, or `@` receive a leading apostrophe to prevent spreadsheet formula execution.

The server does not generate PDF bytes in this version. `format=pdf` returns `501 PDF_EXPORT_UNAVAILABLE`; use the print-ready browser view and **Save as PDF** instead. This keeps Marathi and other Unicode text in the browser's available fonts without bundling a server PDF engine or font files.

## QA suggestions

`POST /api/bug-reports/:id/qa-suggestions` creates reproduction steps, positive, negative, and boundary scenarios, and regression cases. Every category is labelled **AI suggestion**, validated against a strict schema, and rate-limited. Suggestions are not stored automatically; applying them edits the report draft and requires the usual explicit save confirmation.

## Gemini and privacy

Generation, clarification, research, screenshot analysis, and QA suggestions send the selected text or image to Google Gemini. Research runs only when requested. Screenshot analysis is limited to visible details. The permanent API key remains in `backend/.env`; `.gitignore` excludes that file, uploads, and local database data.

AI analysis history is not currently recorded. Generated drafts and AI request content are not stored; only confirmed bug reports are saved.

The report model is `GEMINI_MODEL` in `backend/.env`. Ollama voice replies use `OLLAMA_MODEL`; it defaults to `qwen2.5:3b`.

Normal tests use deterministic mocks. A separate optional live check is available with `npm.cmd run smoke:gemini`. It sends one minimal request using the configured key and model, and it is not part of `npm.cmd test`.

## Voice assistant

Voice input uses the browser's SpeechRecognition API. Availability depends on the browser, and its speech service may require an internet connection; it is not guaranteed to work offline. The recognized transcript is added to the description or clarification answer and remains editable. The language selector chooses Marathi or English recognition.

Voice replies use the locally configured Ollama chat service and browser speech synthesis. Install Ollama, then run `ollama pull qwen2.5:3b`; the default server is `http://127.0.0.1:11434`. Set `OLLAMA_BASE_URL` or `OLLAMA_MODEL` in `backend/.env` to use another endpoint/model. Marathi speech output depends on the voices installed in the browser or operating system. Gemini remains in use for report generation, clarification, research, screenshot analysis, and QA suggestions.

## Upload limits and local data

Screenshot uploads accept PNG, JPEG, WebP, and GIF, up to `MAX_UPLOAD_MB` (5 MB by default; the configuration allows 1–20 MB). The server checks MIME type and file signatures, assigns generated IDs, and stores files under the ignored `uploads/` folder. Remove screenshots from the app when no longer needed.

SQLite data is saved under the ignored `data/` folder. This is a single-user local workspace with no login, cloud sync, retention automation, or public-hosting protections.

## Tests and manual browser checklist

`npm.cmd test` covers schema validation, mocked AI output, repository and API workflows, CSV safety, rate limits, invalid configuration, oversized JSON/image requests, and credential absence from served assets. `test/e2e/user-workflow.test.js` covers the end-to-end HTTP workflow, and `test/e2e/browser-ui.test.js` exercises Marathi-to-English conversion, the review gate, report generation and editing, report downloads, regeneration, and clearing the workflow in Chromium. Both use mocked AI services.

For a visual check in your browser, also try these steps:

- Convert typed Marathi or mixed-language text; review and confirm the English description before generating the report.
- Check that the generated report contains exactly 22 fields and that missing information is marked rather than invented.
- Edit the report, copy it, download TXT, and use the PDF print flow.
- Start browser voice input with Ollama running; verify the transcript is editable and the local reply is spoken. Browser speech recognition may require an internet connection.
- Ask a clarification question, answer it, generate, edit a field, and confirm Save.
- Upload a valid image and an invalid or oversized image; verify the error is visible.
- Search, filter, paginate, open, edit, and delete a saved report.
- Download JSON and CSV with a subset of fields. For PDF, use Print / Save as PDF.
- Generate QA suggestions, edit and copy them, apply them, then save the report changes.

## Troubleshooting

- **Missing configuration:** add `GEMINI_API_KEY` and `GEMINI_MODEL` to `backend/.env`. `OLLAMA_BASE_URL` and `OLLAMA_MODEL` are optional; restart the server after edits.
- **Port already in use:** set `PORT` to an unused integer in `backend/.env`, then restart.
- **Voice unavailable:** allow microphone access on `localhost` and use a browser that supports SpeechRecognition. Speech recognition may need internet access. For assistant replies, start Ollama and install the configured model (for example, `ollama pull qwen2.5:3b`); typing still works without voice.
- **Image rejected:** use PNG, JPEG, WebP, or GIF and stay within `MAX_UPLOAD_MB`.
- **AI request failed:** check network access, model availability, API quota, and the key. Run `npm.cmd run smoke:gemini` only when you intend to make a live request.
- **PDF endpoint returns 501:** use the report's Print / Save as PDF button and choose Save as PDF in the browser dialog.

## Phase status

- Phase 1: setup and application shell
- Phase 2: report schema, configuration, Gemini client, SQLite repository and middleware
- Phase 3: browser speech input and clarification turns
- Phase 4: structured report generation, editable review form and explicit save
- Phase 5: grounded research and validated screenshot analysis
- Phase 6: searchable, filterable report library with edit and confirmed delete
- Phase 7: JSON/CSV exports and editable QA suggestions; server-side PDF generation recorded as a blocker with a browser print-to-PDF path
- Phase 8: mocked HTTP and Chromium browser end-to-end workflows, security checks, Windows setup and troubleshooting documentation
