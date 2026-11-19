# AI QA Bug Generator

A local, single-user workspace for turning an English or Marathi bug description into a human-reviewed QA report. Reports are stored in a local SQLite database. The selected AI provider receives the text or image needed for each request.

## Run on Windows

1. Install Node.js LTS, then check `node -v` and `npm -v` in PowerShell.
2. In the project folder, run `npm.cmd install`.
3. For the browser E2E test, install Chromium once with `npm.cmd exec -- playwright install chromium`.
4. Copy the key template with `Copy-Item .env.example backend/.env`. The default text provider is OpenRouter; create a key at [OpenRouter](https://openrouter.ai/settings/keys) and either paste it into the app's provider-key field or add it to `OPENROUTER_API_KEY` in `backend/.env`. Keep permanent keys server-side; never put them in frontend files.
5. Start the app with `npm.cmd run dev` and open `http://localhost:3000`.
6. Check the server with `Invoke-RestMethod http://localhost:3000/api/health`; it should return `status: ok`.
7. Run automated tests with `npm.cmd test`. Gemini is mocked and the tests do not make live AI calls.

For a normal start without the file watcher, use `npm.cmd start`. Do not host this local-only app publicly without first adding authentication and reviewing its security model.

The default OpenRouter model is a free variant. The app rejects non-free OpenRouter model IDs so it cannot silently route requests to a paid model. Free-model availability and quotas are set by OpenRouter and can change.

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

## AI providers and privacy

Set `AI_PROVIDER=openrouter` (the default in `.env.example`) to use OpenRouter for conversion, report generation, clarification, screenshot analysis, QA suggestions, and voice replies. The default model is `nvidia/nemotron-3.5-super-vl:free`; its model ID ends in `:free`, and this app does not configure paid fallbacks. OpenRouter currently documents 50 free-model requests per day and 20 per minute for accounts that have purchased less than $10 in credits; check its [live limits documentation](https://openrouter.ai/docs/api-reference/limits.md) because availability and quotas can change.

Create a free OpenRouter key at [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys). Enter it in the app header to keep it in server memory for the current process, or set `OPENROUTER_API_KEY` in `backend/.env` to keep it across restarts. The key is never sent to browser code. OpenRouter and its upstream model provider receive the selected description, report data, voice messages, or screenshot needed for each request.

Google-grounded web research still uses Gemini and requires `GEMINI_API_KEY`; that feature may remain unavailable if the Gemini quota is exhausted. Set `AI_PROVIDER=gemini` to route structured text features back to Gemini. In that mode, voice replies use local Ollama (`OLLAMA_BASE_URL` and `OLLAMA_MODEL`), while browser speech input and output remain unchanged.

AI analysis history is not currently recorded. Generated drafts and AI request content are not stored; only confirmed bug reports are saved.

Set `OPENROUTER_MODEL` to another currently available `:free` model if needed. The app rejects OpenRouter model IDs without the `:free` suffix to avoid accidental paid inference.

Normal tests use deterministic mocks. A separate optional live check is available with `npm.cmd run smoke:gemini`. It sends one minimal request using the configured key and model, and it is not part of `npm.cmd test`.

## Voice assistant

Voice input uses the browser's SpeechRecognition API. Availability depends on the browser, and its speech service may require an internet connection; it is not guaranteed to work offline. The recognized transcript is added to the description or clarification answer and remains editable. The language selector chooses Marathi or English recognition.

With `AI_PROVIDER=openrouter`, voice replies use the configured OpenRouter free model and browser speech synthesis. Browser speech recognition may require an internet connection. Marathi speech output depends on the voices installed in the browser or operating system. Google-grounded research continues to use Gemini.

## Upload limits and local data

Screenshot uploads accept PNG, JPEG, WebP, and GIF, up to `MAX_UPLOAD_MB` (5 MB by default; the configuration allows 1–20 MB). The server checks MIME type and file signatures, assigns generated IDs, and stores files under the ignored `uploads/` folder. Remove screenshots from the app when no longer needed.

SQLite data is saved under the ignored `data/` folder. This is a single-user local workspace with no login, cloud sync, retention automation, or public-hosting protections.

## Tests and manual browser checklist

`npm.cmd test` covers schema validation, mocked AI output, repository and API workflows, CSV safety, rate limits, invalid configuration, oversized JSON/image requests, and credential absence from served assets. `test/e2e/user-workflow.test.js` covers the end-to-end HTTP workflow, and `test/e2e/browser-ui.test.js` exercises Marathi-to-English conversion, the review gate, report generation and editing, report downloads, regeneration, and clearing the workflow in Chromium. Both use mocked AI services.

For a visual check in your browser, also try these steps:

- Convert typed Marathi or mixed-language text; review and confirm the English description before generating the report.
- Check that the generated report contains exactly 22 fields and that missing information is marked rather than invented.
- Edit the report, copy it, download TXT, and use the PDF print flow.
- Start browser voice input with the configured provider key; verify the transcript is editable and the reply is spoken. Browser speech recognition may require an internet connection.
- Ask a clarification question, answer it, generate, edit a field, and confirm Save.
- Upload a valid image and an invalid or oversized image; verify the error is visible.
- Search, filter, paginate, open, edit, and delete a saved report.
- Download JSON and CSV with a subset of fields. For PDF, use Print / Save as PDF.
- Generate QA suggestions, edit and copy them, apply them, then save the report changes.

## Troubleshooting

- **OpenRouter unavailable:** create a key at [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys), paste it into the app header, or set `OPENROUTER_API_KEY` in `backend/.env`. Confirm `AI_PROVIDER=openrouter` and that `OPENROUTER_MODEL` ends in `:free`.
- **Port already in use:** set `PORT` to an unused integer in `backend/.env`, then restart.
- **Gemini research unavailable:** Google-grounded research still needs `GEMINI_API_KEY` and is subject to Gemini's quota.
- **Voice unavailable:** allow microphone access on `localhost` and use a browser that supports SpeechRecognition. Speech recognition may need internet access. For AI replies, verify the configured provider key and quota; typing still works without voice.
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
