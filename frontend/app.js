/**
 * QARP Voice Tool – frontend application
 *
 * Sections:
 *   1. STATE          – mutable runtime state
 *   2. DOM REFS       – cached element queries
 *   3. HELPERS        – formatting, language detection and UI utilities
 *   4. VOICE ENGINE   – browser speech recognition
 *   5. VOICE CHAT     – selected AI provider and browser speech output
 *   6. REPORT ENGINE  – generation, form rendering, save/copy
 *   7. API KEY        – configured provider status + key submission
 *   8. EVENT LISTENERS
 *   9. INIT
 */

'use strict';

/* ============================================================
   1. STATE
   ============================================================ */

/** Browser SpeechRecognition instance. */
let recognition = null;
let isRecognizing = false;
let recognitionFailed = false;
let recognizedVoiceText = '';
let voiceConversation = [];
let voiceReplyPending = false;
let isSpeakingVoiceReply = false;
let englishDescriptionReviewed = false;
let isReportEditing = false;
let aiProvider = 'gemini';
let aiProviderName = 'Gemini';

/** QA-assistant conversation history [{role, content}]. */
let conversationMessages = [];
/** True once the initial user message has been posted to the chat. */
let initialMessageShown = false;
/** True once the clarification round has concluded (ready to generate). */
let clarificationReady = false;

/** Form field definitions from /api/bug-reports/schema. */
let formDefinition = [];
/** The report object currently shown in the editor. */
let currentReport = null;
/** Source text used to decide badge status (confirmed vs. suggested). */
let sourceTextForBadges = '';

/* ============================================================
   2. DOM REFS
   All element references cached at parse time (script is deferred).
   ============================================================ */

const description          = document.querySelector('#description');
const charCount            = document.querySelector('#char-count');
const languageSelect       = document.querySelector('#language');
const clarifyButton        = document.querySelector('#clarify-button');
const convertButton        = document.querySelector('#convert-button');
const generateButton       = document.querySelector('#generate-button');
const englishReview        = document.querySelector('#english-review');
const originalDescriptionOutput = document.querySelector('#original-description-output');
const englishDescriptionInput = document.querySelector('#english-description');
const copyEnglishDescriptionButton = document.querySelector('#copy-english-description');
const editEnglishDescriptionButton = document.querySelector('#edit-english-description');
const confirmEnglishDescriptionButton = document.querySelector('#confirm-english-description');
const statusTitle          = document.querySelector('#status-title');
const statusMessage        = document.querySelector('#status-message');
const micButton            = document.querySelector('#mic-button');
const voiceStatus          = document.querySelector('#voice-status');
const voiceLanguageIndicator = document.querySelector('#voice-language-indicator');
const voiceTranscript      = document.querySelector('#voice-transcript');
const voiceResponse        = document.querySelector('#voice-response');
const clarificationPanel   = document.querySelector('#clarification-panel');
const chatThread           = document.querySelector('#chat-thread');
const answerForm           = document.querySelector('#answer-form');
const answerInput          = document.querySelector('#follow-up-answer');
const sendAnswerButton     = document.querySelector('#send-answer-button');
const reportEditor         = document.querySelector('#report-editor');
const reportEditorTitle    = document.querySelector('#report-editor-title');
const reportFields         = document.querySelector('#report-fields');
const reportFieldGrid      = document.querySelector('#report-field-grid');
const reportStatus         = document.querySelector('#report-status');
const saveConfirmation     = document.querySelector('#save-confirmation');
const confirmSaveButton    = document.querySelector('#confirm-save-button');
const deleteConfirmation   = document.querySelector('#delete-confirmation');
const confirmDeleteButton  = document.querySelector('#confirm-delete-button'); // eslint-disable-line no-unused-vars
const saveReportButton     = document.querySelector('#save-report-button');
const copyReportButton     = document.querySelector('#copy-report-button');
const resetReportButton    = document.querySelector('#reset-report-button');
const editReportButton     = document.querySelector('#edit-report-button');
const downloadTxtButton    = document.querySelector('#download-txt-button');
const downloadPdfButton    = document.querySelector('#download-pdf-button');
const regenerateReportButton = document.querySelector('#regenerate-report-button');
const reportCopyPreview    = document.querySelector('#report-copy-preview');
const apiStatus            = document.querySelector('#api-status');
const apiStatusLabel       = document.querySelector('#api-status-label');
const apiStatusRefresh     = document.querySelector('#api-status-refresh');
const apiKeyForm           = document.querySelector('#api-key-form');
const apiKeyInput          = document.querySelector('#api-key-input');
const apiKeyLabel          = document.querySelector('#api-key-label');
const apiKeyCheck          = document.querySelector('#api-key-check');
const apiKeyHelp           = document.querySelector('#api-key-help');

/* ============================================================
   3. HELPERS
   ============================================================ */

/**
 * Returns a debounced version of `fn` that fires after `delay` ms of silence.
 * @param {Function} fn
 * @param {number} delay
 * @returns {Function}
 */
function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Updates the character count display below the description textarea.
 */
function updateCharacterCount() {
  const n = description.value.length;
  charCount.textContent = `${n} ${n === 1 ? 'character' : 'characters'}`;
}

function invalidateEnglishReview() {
  englishDescriptionReviewed = false;
  englishReview.hidden = true;
  originalDescriptionOutput.textContent = '';
  englishDescriptionInput.value = '';
  englishDescriptionInput.readOnly = true;
  generateButton.disabled = true;
  reportEditor.hidden = true;
  reportFields.disabled = true;
  currentReport = null;
  isReportEditing = false;
  editReportButton.textContent = 'Edit Report';
  copyReportButton.disabled = true;
  downloadTxtButton.disabled = true;
  downloadPdfButton.disabled = true;
  regenerateReportButton.disabled = true;
}

/**
 * Returns the textarea that should receive voice transcript:
 * the follow-up answer field when it is visible, otherwise the main description.
 * @returns {HTMLTextAreaElement}
 */
function transcriptTarget() {
  return answerForm.hidden ? description : answerInput;
}

/**
 * Appends `transcript` text to `target` textarea with a space separator.
 * @param {HTMLTextAreaElement} target
 * @param {string} transcript
 */
function appendTranscript(target, transcript) {
  const sep = target.value.trim() ? ' ' : '';
  target.value = `${target.value}${sep}${transcript}`.trim();
  if (target === description) updateCharacterCount();
}

/**
 * Merges an incoming partial transcript into the current accumulation,
 * preferring the longer / more-complete version and avoiding duplicates.
 * @param {string} current
 * @param {string} incoming
 * @returns {string}
 */
function mergeTranscript(current, incoming) {
  const next = String(incoming || '').trim();
  if (!next) return current;
  const prev = current.trim();
  if (!prev || next.startsWith(prev)) return next;
  if (prev.endsWith(next)) return prev;
  return `${prev}${/\s$/.test(current) ? '' : ' '}${next}`;
}

/**
 * Detects the script of `text` (Devanagari / Latin / mixed) and updates the
 * language indicator element accordingly.
 * @param {string} text
 */
function updateDetectedLanguage(text) {
  const hasDevanagari = /[\u0900-\u097f]/u.test(text);
  const hasLatin = /[A-Za-z]/u.test(text);
  if (hasDevanagari && hasLatin) {
    voiceLanguageIndicator.textContent = 'Likely language: Marathi and English mix';
  } else if (hasDevanagari) {
    voiceLanguageIndicator.textContent = 'Likely language: Marathi (Devanagari script detected)';
  } else if (hasLatin) {
    voiceLanguageIndicator.textContent = 'Likely language: English or Latin script (not confirmed)';
  } else {
    voiceLanguageIndicator.textContent = 'Language: detecting from speech';
  }
}

/**
 * Returns the BCP-47 language tag for browser SpeechRecognition
 * based on the user's selection.
 * @returns {string}
 */
function chooseVoiceLanguage() {
  if (languageSelect.value === 'mr') return 'mr-IN';
  if (languageSelect.value === 'en') return 'en-IN';
  return navigator.language || 'en-IN';
}

/**
 * Sends a JSON POST and returns the parsed response body.
 * Throws on non-2xx status codes.
 * @param {string} url
 * @param {object} body
 * @returns {Promise<object>}
 */
async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || 'The request could not be completed.');
  return result;
}

/* ============================================================
   4. VOICE ENGINE - browser speech recognition
   ============================================================ */

function setVoiceStatus(state, message) {
  voiceStatus.dataset.state = state;
  voiceStatus.textContent = 'Voice assistant: ' + message;
  const active = ['recording', 'requesting permission'].includes(state);
  micButton.setAttribute('aria-pressed', String(active));
  micButton.setAttribute('aria-label', active ? 'Stop voice assistant' : 'Start voice assistant');
  micButton.disabled = state === 'unsupported' || voiceReplyPending || isSpeakingVoiceReply;
  micButton.innerHTML = active
    ? 'Stop voice assistant'
    : '<span aria-hidden="true">●</span> Start voice assistant';
}

function configureSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    setVoiceStatus('unsupported', 'Speech recognition is not available in this browser. You can type instead.');
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    isRecognizing = true;
    recognitionFailed = false;
    recognizedVoiceText = '';
    setVoiceStatus('recording', 'Listening. Speak, then pause to send your message.');
  };

  recognition.onresult = (event) => {
    let finalText = '';
    let interimText = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const text = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalText += text;
      else interimText += text;
    }
    if (finalText.trim()) {
      recognizedVoiceText = mergeTranscript(recognizedVoiceText, finalText);
      voiceTranscript.textContent = 'You said: ' + recognizedVoiceText;
      updateDetectedLanguage(recognizedVoiceText);
    }
    if (interimText.trim()) {
      voiceTranscript.textContent = 'Recognizing: ' + interimText.trim();
      updateDetectedLanguage(interimText.trim());
    }
  };

  recognition.onerror = (event) => {
    isRecognizing = false;
    recognitionFailed = true;
    let message;
    if (event.error === 'not-allowed') {
      message = 'Microphone permission was denied. Allow access or type instead.';
    } else if (event.error === 'network') {
      message = 'Browser speech recognition needs an internet connection.';
    } else {
      message = 'Speech recognition failed (' + event.error + '). You can type instead.';
    }
    setVoiceStatus('error', message);
  };

  recognition.onend = () => {
    isRecognizing = false;
    if (recognitionFailed) {
      recognitionFailed = false;
      return;
    }

    const message = recognizedVoiceText.trim();
    recognizedVoiceText = '';
    if (!message) {
      setVoiceStatus('idle', 'No speech detected. You can try again or type instead.');
      return;
    }

    const target = transcriptTarget();
    const context = target.value.trim();
    appendTranscript(target, message);
    voiceTranscript.textContent = 'Added to description: ' + message;
    sendVoiceMessage(message, context);
  };
}

/* ============================================================
   5. LOCAL VOICE CHAT AND SPEECH OUTPUT
   ============================================================ */

function speakVoiceReply(text) {
  if (!('speechSynthesis' in window) || typeof window.SpeechSynthesisUtterance !== 'function') {
    setVoiceStatus('idle', 'Reply is ready to read; speech output is unavailable in this browser.');
    return false;
  }

  window.speechSynthesis.cancel();
  const utterance = new window.SpeechSynthesisUtterance(text);
  utterance.lang = /[\u0900-\u097f]/u.test(text) ? 'mr-IN' : 'en-IN';
  isSpeakingVoiceReply = true;
  setVoiceStatus('speaking', 'Speaking the local assistant reply.');
  utterance.onend = () => {
    isSpeakingVoiceReply = false;
    setVoiceStatus('idle', 'Local assistant replied. Start voice input again to continue.');
  };
  utterance.onerror = (event) => {
    isSpeakingVoiceReply = false;
    setVoiceStatus('error', 'Speech output failed (' + event.error + '). The reply remains visible.');
  };
  window.speechSynthesis.speak(utterance);
  return true;
}

async function sendVoiceMessage(message, context) {
  voiceReplyPending = true;
  const voiceProviderName = aiProvider === 'openrouter' ? 'OpenRouter' : 'local Ollama';
  setVoiceStatus('processing', 'Waiting for the ' + voiceProviderName + ' assistant.');
  try {
    const response = await fetch('/api/voice/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, context, history: voiceConversation.slice(-8) }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || 'The local assistant could not respond.');
    if (typeof result.reply !== 'string' || !result.reply.trim()) {
      throw new Error('The local assistant returned an empty reply.');
    }

    const reply = result.reply.trim();
    voiceConversation.push({ role: 'user', content: message }, { role: 'assistant', content: reply });
    voiceConversation = voiceConversation.slice(-12);
    voiceResponse.hidden = false;
    voiceResponse.textContent = 'Assistant: ' + reply;
    if (!speakVoiceReply(reply)) setVoiceStatus('idle', 'Local assistant replied. The response is shown above.');
  } catch (error) {
    setVoiceStatus('error', error.message || 'The local assistant could not respond.');
  } finally {
    voiceReplyPending = false;
    micButton.disabled = voiceStatus.dataset.state === 'unsupported' || isSpeakingVoiceReply;
  }
}

/* ============================================================
   6. REPORT ENGINE
   ============================================================ */

// ---- Badge helpers ----

/**
 * Returns the display label for a badge status value.
 * @param {'confirmed'|'suggested'|'missing'} value
 * @returns {string}
 */
function labelForBadge(value) {
  return { confirmed: 'Confirmed', suggested: 'AI suggested', missing: 'Missing' }[value] || '';
}

/**
 * Returns true when the report field value is considered blank / absent.
 * @param {string} field
 * @param {*} value
 * @returns {boolean}
 */
function isBlankValue(field, value) {
  if (field === 'severity' || field === 'priority') return !value?.value;
  if (Array.isArray(value)) return value.length === 0;
  if (value && typeof value === 'object') return false;
  return typeof value !== 'string' || !value.trim() || ['not provided', 'to be confirmed'].includes(value.trim().toLocaleLowerCase());
}

/**
 * Determines the badge status of a field value relative to the original
 * description/clarification text.
 * @param {string} field
 * @param {*} value
 * @returns {'confirmed'|'suggested'|'missing'}
 */
function classifyField(field, value) {
  if (field === 'severity' || field === 'priority') return 'suggested';
  if (isBlankValue(field, value)) return 'missing';
  const values = Array.isArray(value) ? value : [value];
  const normalizedSource = sourceTextForBadges.toLocaleLowerCase();
  const isSupported = values.some((item) => {
    const text = String(item).trim().toLocaleLowerCase();
    return text.length > 0 && normalizedSource.includes(text);
  });
  return isSupported ? 'confirmed' : 'suggested';
}

/**
 * Updates the badge element for a given field in the report form.
 * @param {string} field
 * @param {'confirmed'|'suggested'|'missing'} status
 */
function updateBadge(field, status) {
  const badge = reportFieldGrid.querySelector(`[data-badge-for="${field}"]`);
  if (!badge) return;
  badge.className = `badge ${status}`;
  badge.textContent = labelForBadge(status);
}

// ---- Form control helpers ----

/**
 * Marks the report as having unsaved changes and refreshes the preview.
 * @param {string} field  The field that was edited.
 */
function onFieldEdited(field) {
  updateBadge(field, isBlankValue(field, currentReport[field]) ? 'missing' : 'confirmed');
  saveReportButton.disabled = false;
  saveReportButton.textContent = currentReport.reportId ? 'Save changes' : 'Save report';
  if (currentReport.reportId) reportStatus.textContent = 'Unsaved changes. Choose Save changes when ready.';
  updateFormattedReportPreview();
}

/**
 * Creates and appends a form control (input / textarea / select) to `container`.
 * @param {HTMLElement} container
 * @param {string} field
 * @param {string} initialValue
 * @param {Function} onChange
 * @param {{ textarea?: boolean, rows?: number, options?: string[] }} opts
 * @returns {HTMLElement}
 */
function addControl(container, field, initialValue, onChange, { textarea = false, rows = 3, options = null } = {}) {
  let control;
  if (options) {
    control = document.createElement('select');
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = 'Not provided';
    control.append(empty);
    for (const opt of options) {
      const item = document.createElement('option');
      item.value = opt;
      item.textContent = opt;
      control.append(item);
    }
    control.value = initialValue || '';
  } else if (textarea) {
    control = document.createElement('textarea');
    control.rows = rows;
    control.value = initialValue;
  } else {
    control = document.createElement('input');
    control.type = 'text';
    control.value = initialValue;
  }
  control.dataset.reportField = field;
  control.setAttribute('aria-label', field);
  control.addEventListener('input', onChange);
  control.addEventListener('change', onChange);
  container.append(control);
  return control;
}

/**
 * Creates a labelled nested textarea inside `container`.
 * @param {HTMLElement} container
 * @param {string} field
 * @param {string} labelText
 * @param {string} value
 * @param {Function} onChange
 * @param {number} [rows=3]
 * @returns {HTMLTextAreaElement}
 */
function addNestedTextarea(container, field, labelText, value, onChange, rows = 3) {
  const wrapper = document.createElement('div');
  wrapper.className = 'nested-field';
  const label = document.createElement('label');
  label.className = 'nested-label';
  label.textContent = labelText;
  const input = document.createElement('textarea');
  input.rows = rows;
  input.value = value;
  label.append(input);
  input.addEventListener('input', onChange);
  input.addEventListener('change', onChange);
  wrapper.append(label);
  container.append(wrapper);
  return input;
}

/**
 * Builds a single field card for the report form grid.
 * @param {{ name: string, label: string, editor: string, options?: string[] }} fieldInfo
 * @returns {HTMLElement}
 */
function createFieldCard(fieldInfo) {
  const { name, label, editor, options } = fieldInfo;
  const wideEditors = ['textarea', 'list', 'attachments'];

  const card = document.createElement('div');
  card.className = `report-field${wideEditors.includes(editor) ? ' wide' : ''}`;

  // Heading row: label + badge
  const heading = document.createElement('div');
  heading.className = 'report-field-label';
  const fieldLabel = document.createElement('span');
  fieldLabel.textContent = label;
  const badge = document.createElement('span');
  badge.dataset.badgeFor = name;
  const status = classifyField(name, currentReport[name]);
  badge.className = `badge ${status}`;
  badge.textContent = labelForBadge(status);
  heading.append(fieldLabel, badge);
  card.append(heading);

  // Control(s)
  if (editor === 'select') {
    addControl(card, name, currentReport[name], (e) => {
      currentReport[name] = e.currentTarget.value;
      onFieldEdited(name);
    }, { options });
  } else if (editor === 'list') {
    addControl(card, name, currentReport[name].join('\n'), (e) => {
      currentReport[name] = e.currentTarget.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      onFieldEdited(name);
    }, { textarea: true, rows: Math.min(6, Math.max(3, currentReport[name].length + 1)) });
  } else if (editor === 'suggested-choice') {
    const choice = currentReport[name];
    addControl(card, name, choice.value, (e) => {
      currentReport[name] = { ...currentReport[name], value: e.currentTarget.value || null, suggested: false };
      onFieldEdited(name);
    }, { options });
    addNestedTextarea(card, name, 'Suggestion reason', choice.reason, (e) => {
      currentReport[name] = { ...currentReport[name], reason: e.currentTarget.value, suggested: false };
      onFieldEdited(name);
    }, 2);
  } else if (editor === 'attachments') {
    const val = currentReport[name].map((a) => `${a.id} | ${a.name}`).join('\n');
    addControl(card, name, val, (e) => {
      currentReport[name] = e.currentTarget.value.split(/\r?\n/).map((line) => {
        const [id = '', ...rest] = line.split('|');
        return { id: id.trim(), name: rest.join('|').trim() };
      }).filter((a) => a.id);
      onFieldEdited(name);
    }, { textarea: true });
  } else {
    const isTextarea = editor === 'textarea';
    const control = addControl(card, name, currentReport[name], (e) => {
      currentReport[name] = e.currentTarget.value;
      onFieldEdited(name);
    }, { textarea: isTextarea, rows: 4 });
    if (name === 'reportId') {
      control.readOnly = true;
      control.setAttribute('aria-readonly', 'true');
    }
  }

  return card;
}

// ---- Report formatting ----

/**
 * Returns a formatted human-readable string for a single report field value.
 * @param {string} field
 * @param {*} value
 * @returns {string}
 */
function formatReportValue(field, value) {
  if (value === null || value === undefined || value === '') return 'Not provided';
  if (field === 'severity' || field === 'priority') {
    const suggestion = value.suggested ? ' (suggested)' : '';
    const reason = value.reason ? ` — ${value.reason}` : '';
    return `${value.value || 'Not provided'}${suggestion}${reason}`;
  }
  if (Array.isArray(value)) {
    if (!value.length) return 'Not provided';
    return value.map((item, i) =>
      `${i + 1}. ${item && typeof item === 'object' ? (item.name || item.id || Object.values(item).join(' | ')) : item}`,
    ).join('\n');
  }
  if (typeof value === 'object') {
    return Object.entries(value).map(([k, v]) => `${k}: ${v || 'Not provided'}`).join('\n');
  }
  return String(value);
}

/**
 * Formats the full bug report as a plain-text block suitable for copying.
 * @param {object} report
 * @returns {string}
 */
function formattedBugReport(report) {
  return [
    'COMPLETE BUG REPORT',
    '',
    `1. Project Name: ${formatReportValue('productProject', report.productProject)}`,
    `2. Bug ID: ${formatReportValue('reportId', report.reportId)}`,
    `3. Module: ${formatReportValue('moduleComponent', report.moduleComponent)}`,
    `4. Sub Module: ${formatReportValue('subModule', report.subModule)}`,
    `5. Bug Title: ${formatReportValue('bugTitle', report.bugTitle)}`,
    `6. Bug Type: ${formatReportValue('bugType', report.bugType)}`,
    `7. Environment: ${formatReportValue('environment', report.environment)}`,
    `8. Build Version: ${formatReportValue('applicationBuildVersion', report.applicationBuildVersion)}`,
    `9. Browser / Device: ${formatReportValue('browserDevice', report.browserDevice)}`,
    `10. Severity: ${formatReportValue('severity', report.severity)}`,
    `11. Priority: ${formatReportValue('priority', report.priority)}`,
    `12. Preconditions:\n${formatReportValue('preconditions', report.preconditions)}`,
    `13. Test Data:\n${formatReportValue('testData', report.testData)}`,
    `14. Steps to Reproduce:\n${formatReportValue('reproductionSteps', report.reproductionSteps)}`,
    `15. Expected Result: ${formatReportValue('expectedResult', report.expectedResult)}`,
    `16. Actual Result: ${formatReportValue('actualResult', report.actualResult)}`,
    `17. Status: ${formatReportValue('status', report.status)}`,
    `18. Assigned To: ${formatReportValue('assignee', report.assignee)}`,
    `19. Reported By: ${formatReportValue('reporter', report.reporter)}`,
    `20. Reported Date: ${formatReportValue('reportedDate', report.reportedDate)}`,
    `21. Attachment: Screenshot / Video / Logs\n${formatReportValue('attachmentReferences', report.attachmentReferences)}`,
    `22. Remarks: ${formatReportValue('remarks', report.remarks)}`,
  ].join('\n');
}

/**
 * Refreshes the collapsible formatted report preview pre element.
 */
function updateFormattedReportPreview() {
  if (currentReport) reportCopyPreview.textContent = formattedBugReport(currentReport);
}

// ---- Form schema ----

/**
 * Loads the report field definitions from the backend schema endpoint.
 * Cached in `formDefinition` after the first call.
 */
async function loadFormDefinition() {
  const response = await fetch('/api/bug-reports/schema');
  if (!response.ok) throw new Error('Could not load the report form schema.');
  const result = await response.json();
  formDefinition = result.fields;
}

// ---- Render report form ----

/**
 * Populates the report editor section with the canonical 22 report fields.
 * @param {object} result    Response from /api/bug-reports/generate
 * @param {string} sourceText  Original description + clarifications (for badge scoring)
 */
function renderReportForm(result, sourceText) {
  currentReport = result.report;
  sourceTextForBadges = sourceText;
  updateFormattedReportPreview();
  reportFieldGrid.replaceChildren(...formDefinition.map(createFieldCard));

  reportStatus.textContent = 'Review the 22 fields. Unknown information is marked Not provided or To be confirmed.';

  isReportEditing = false;
  reportFields.disabled = true;
  editReportButton.textContent = 'Edit Report';
  saveReportButton.disabled = false;
  saveReportButton.textContent = 'Save report';
  copyReportButton.disabled = false;
  downloadTxtButton.disabled = false;
  downloadPdfButton.disabled = false;
  regenerateReportButton.disabled = false;
  reportEditorTitle.textContent = currentReport.reportId
    ? `Complete Bug Report ${currentReport.reportId}`
    : 'Complete Bug Report';

  reportEditor.hidden = false;
  reportEditor.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---- Clarification chat ----

/**
 * Appends a message bubble to the chat thread.
 * @param {'assistant'|'user'} role
 * @param {string} content
 */
function appendChatMessage(role, content) {
  const article = document.createElement('article');
  article.className = `chat-message ${role}`;
  const strong = document.createElement('strong');
  strong.textContent = role === 'assistant' ? 'QA assistant' : 'You';
  const p = document.createElement('p');
  p.textContent = content;
  article.append(strong, p);
  chatThread.append(article);
  chatThread.scrollTop = chatThread.scrollHeight;
}

/**
 * Returns answered Q&A pairs extracted from the conversation history.
 * @returns {{ question: string, answer: string }[]}
 */
function answeredClarifications() {
  const pairs = [];
  for (let i = 0; i < conversationMessages.length - 1; i++) {
    const q = conversationMessages[i];
    const a = conversationMessages[i + 1];
    if (q.role === 'assistant' && a.role === 'user') {
      pairs.push({ question: q.content, answer: a.content });
      i++; // skip the answer entry
    }
  }
  return pairs;
}

/**
 * Requests clarifying questions from the backend and updates the chat UI.
 * @param {{ initial?: boolean }} [opts]
 */
async function handleClarification({ initial = false } = {}) {
  if (!description.value.trim()) {
    statusTitle.textContent = 'Add a bug description';
    statusMessage.textContent = 'Describe what happened before asking follow-up questions.';
    description.focus();
    return;
  }

  invalidateEnglishReview();
  clarifyButton.disabled = true;
  sendAnswerButton.disabled = true;
  clarifyButton.textContent = 'Thinking…';
  statusTitle.textContent = 'Reviewing missing details';
  statusMessage.textContent = 'Your description is being checked for important missing information.';
  clarificationPanel.hidden = false;

  if (initial && !initialMessageShown) {
    appendChatMessage('user', description.value.trim());
    initialMessageShown = true;
  }

  try {
    const result = await postJson('/api/bug-reports/clarify', {
      description: description.value.trim(),
      messages: conversationMessages,
    });

    if (result.readyToGenerate) {
      clarificationReady = true;
      answerForm.hidden = true;
      appendChatMessage('assistant', 'The description is ready for English conversion. Review it above before generating a report.');
      statusTitle.textContent = 'Ready for the next step';
      statusMessage.textContent = 'Convert the original description to English, review it, then generate the report.';
      clarifyButton.textContent = 'Description reviewed';
      return;
    }

    for (const question of result.clarifyingQuestions) {
      conversationMessages.push({ role: 'assistant', content: question });
      appendChatMessage('assistant', question);
    }
    answerForm.hidden = false;
    answerInput.focus();
    statusTitle.textContent = 'A few details would help';
    statusMessage.textContent = 'Answer what you know. Leave anything unknown blank.';
    clarifyButton.textContent = 'Ask follow-up questions';
  } catch (err) {
    statusTitle.textContent = 'Clarification failed';
    statusMessage.textContent = err.message;
    clarifyButton.textContent = 'Try clarification again';
  } finally {
    clarifyButton.disabled = clarificationReady;
    sendAnswerButton.disabled = false;
  }
}

// ---- Generate report ----

async function convertToProfessionalEnglish() {
  const original = description.value.trim();
  if (!original) {
    statusTitle.textContent = 'Add a bug description';
    statusMessage.textContent = 'Enter a Marathi, English, or mixed-language description before converting.';
    description.focus();
    return;
  }

  invalidateEnglishReview();
  const request = {
    description: original,
    language: languageSelect.value,
    clarifications: answeredClarifications(),
  };
  convertButton.disabled = true;
  convertButton.textContent = 'Converting…';
  statusTitle.textContent = 'Converting to professional English';
  statusMessage.textContent = aiProviderName + ' is preserving the reported behavior without adding missing details.';

  try {
    const result = await postJson('/api/bug-reports/english-description', request);
    if (
      description.value.trim() !== original
      || languageSelect.value !== request.language
      || JSON.stringify(answeredClarifications()) !== JSON.stringify(request.clarifications)
    ) return;

    originalDescriptionOutput.textContent = original;
    englishDescriptionInput.value = result.englishDescription;
    englishDescriptionInput.readOnly = true;
    englishDescriptionReviewed = false;
    editEnglishDescriptionButton.hidden = false;
    confirmEnglishDescriptionButton.hidden = false;
    englishReview.hidden = false;
    generateButton.disabled = true;
    statusTitle.textContent = 'English description ready for review';
    statusMessage.textContent = 'Review the translation. Confirm it before generating the 22-field report.';
    englishReview.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (error) {
    statusTitle.textContent = 'English conversion failed';
    statusMessage.textContent = error.message;
  } finally {
    convertButton.disabled = false;
    convertButton.textContent = 'Convert to Professional English';
  }
}

function editEnglishDescription() {
  if (englishReview.hidden) return;
  englishDescriptionReviewed = false;
  englishDescriptionInput.readOnly = false;
  editEnglishDescriptionButton.hidden = true;
  confirmEnglishDescriptionButton.hidden = false;
  generateButton.disabled = true;
  englishDescriptionInput.focus();
}

function confirmEnglishDescription() {
  const reviewedDescription = englishDescriptionInput.value.trim();
  if (!reviewedDescription) {
    statusTitle.textContent = 'English description is required';
    statusMessage.textContent = 'Enter or restore the professional English description before confirming.';
    englishDescriptionInput.focus();
    return;
  }
  englishDescriptionInput.value = reviewedDescription;
  englishDescriptionInput.readOnly = true;
  englishDescriptionReviewed = true;
  editEnglishDescriptionButton.hidden = false;
  confirmEnglishDescriptionButton.hidden = true;
  generateButton.disabled = false;
  statusTitle.textContent = 'English description confirmed';
  statusMessage.textContent = 'You can now generate the report. Nothing is saved until you confirm Save.';
}

async function copyEnglishDescription() {
  if (!englishDescriptionInput.value.trim()) return;
  try {
    await navigator.clipboard.writeText(englishDescriptionInput.value.trim());
    statusMessage.textContent = 'Professional English description copied.';
  } catch (error) {
    statusMessage.textContent = 'Could not copy the English description: ' + error.message;
  }
}

/**
 * Sends only the explicitly reviewed English description to report generation.
 */
async function generateReport() {
  if (!englishDescriptionReviewed || !englishDescriptionInput.value.trim()) {
    statusTitle.textContent = 'Review the English description first';
    statusMessage.textContent = 'Convert the original description and confirm the English version before generating a report.';
    convertButton.focus();
    return;
  }

  const reviewedDescription = englishDescriptionInput.value.trim();
  generateButton.disabled = true;
  generateButton.textContent = 'Generating…';
  statusTitle.textContent = 'Building your draft';
  statusMessage.textContent = aiProviderName + ' is generating the exact 22-field report from your reviewed English description.';
  reportStatus.textContent = '';

  try {
    if (!formDefinition.length) await loadFormDefinition();
    const request = {
      englishDescription: reviewedDescription,
      englishDescriptionReviewed: true,
      attachmentIds: [],
    };
    const result = await postJson('/api/bug-reports/generate', request);
    if (!englishDescriptionReviewed || englishDescriptionInput.value.trim() !== reviewedDescription) return;
    renderReportForm(result, reviewedDescription);
    statusTitle.textContent = 'Draft ready for review';
    statusMessage.textContent = 'Nothing has been saved. Review and edit the report before confirming Save.';
  } catch (err) {
    statusTitle.textContent = 'Report generation failed';
    statusMessage.textContent = err.message;
  } finally {
    generateButton.disabled = !englishDescriptionReviewed;
    generateButton.textContent = 'Generate Professional Bug Report';
  }
}

// ---- Save report ----

/**
 * Persists the current report (new POST or existing PUT) and refreshes the UI.
 */
async function saveReport() {
  if (!currentReport) return;
  let saved = false;
  saveReportButton.disabled = true;
  reportStatus.textContent = 'Saving confirmed report…';

  try {
    const isEdit = Boolean(currentReport.reportId);
    const response = await fetch(
      isEdit ? `/api/bug-reports/${encodeURIComponent(currentReport.reportId)}` : '/api/bug-reports',
      {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isEdit ? currentReport : { confirmed: true, report: currentReport }),
      },
    );
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || 'Could not save this report.');

    currentReport = result.report;
    saved = true;
    copyReportButton.disabled = false;
    downloadTxtButton.disabled = false;
    downloadPdfButton.disabled = false;
    reportFields.disabled = true;
    isReportEditing = false;
    editReportButton.textContent = 'Edit Report';
    updateFormattedReportPreview();
    reportStatus.textContent = `${isEdit ? 'Updated' : 'Saved'} ${result.report.reportId}.`;
    statusTitle.textContent = isEdit ? 'Report updated' : 'Report saved';
    statusMessage.textContent = 'Your confirmed report is stored locally.';
    saveReportButton.textContent = 'Saved';
    saveReportButton.disabled = true;
    reportFieldGrid.replaceChildren(...formDefinition.map(createFieldCard));
  } catch (err) {
    reportStatus.textContent = err.message;
    saveReportButton.disabled = false;
  } finally {
    if (!saved) saveReportButton.disabled = false;
  }
}

// ---- Copy report ----

/**
 * Copies the current report draft or saved report to the clipboard.
 */
async function copyConfirmedReport() {
  if (!currentReport) return;
  try {
    await navigator.clipboard.writeText(formattedBugReport(currentReport));
    reportStatus.textContent = 'Complete bug report copied to the clipboard.';
  } catch (error) {
    reportStatus.textContent = 'Could not copy the report: ' + error.message;
  }
}

function toggleReportEditing() {
  if (!currentReport) return;
  isReportEditing = !isReportEditing;
  reportFields.disabled = !isReportEditing;
  editReportButton.textContent = isReportEditing ? 'Finish Editing' : 'Edit Report';
}

function downloadReportAsTxt() {
  if (!currentReport) return;
  const filenameId = (currentReport.reportId || 'bug-report').replace(/[^a-zA-Z0-9_-]/g, '_');
  const url = URL.createObjectURL(new Blob([formattedBugReport(currentReport)], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filenameId}.txt`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  reportStatus.textContent = 'Bug report downloaded as TXT.';
}

function downloadReportAsPdf() {
  if (!currentReport) return;
  document.body.classList.add('printing-report');
  const cleanPrintMode = () => {
    document.body.classList.remove('printing-report');
    window.removeEventListener('afterprint', cleanPrintMode);
  };
  window.addEventListener('afterprint', cleanPrintMode);
  window.print();
  reportStatus.textContent = 'Choose Save as PDF in the browser print dialog.';
}

// ---- Reset workspace ----

/**
 * Clears all state and returns the UI to its initial empty state.
 */
function resetWorkspace() {
  description.value = '';
  answerInput.value = '';
  invalidateEnglishReview();
  voiceConversation = [];
  voiceTranscript.textContent = 'Your editable voice transcript will appear here.';
  voiceResponse.hidden = true;
  conversationMessages = [];
  initialMessageShown = false;
  clarificationReady = false;
  currentReport = null;
  sourceTextForBadges = '';

  saveReportButton.disabled = false;
  saveReportButton.textContent = 'Save report';
  copyReportButton.disabled = true;
  downloadTxtButton.disabled = true;
  downloadPdfButton.disabled = true;
  regenerateReportButton.disabled = true;
  reportEditorTitle.textContent = 'Bug report draft';

  chatThread.replaceChildren();
  clarificationPanel.hidden = true;
  answerForm.hidden = true;
  reportEditor.hidden = true;

  clarifyButton.disabled = false;
  clarifyButton.textContent = 'Ask follow-up questions';

  updateCharacterCount();
  statusTitle.textContent = 'Ready when you are';
  statusMessage.textContent = 'Type a description or use voice input. Nothing is saved yet.';
  description.focus();
}

/* ============================================================
   7. API KEY  –  active provider status and key submission
   ============================================================ */

function setProviderDetails(provider) {
  aiProvider = provider === 'openrouter' ? 'openrouter' : 'gemini';
  aiProviderName = aiProvider === 'openrouter' ? 'OpenRouter' : 'Gemini';
  apiKeyLabel.textContent = aiProviderName + ' API key';
  apiKeyInput.placeholder = 'Paste ' + aiProviderName + ' API key';
  apiKeyHelp.href = aiProvider === 'openrouter'
    ? 'https://openrouter.ai/settings/keys'
    : 'https://aistudio.google.com/apikey';
  apiKeyHelp.textContent = aiProvider === 'openrouter' ? 'Get free key' : 'Get key';
}

async function checkAiProviderStatus() {
  apiStatus.dataset.state = 'checking';
  apiStatusLabel.textContent = 'Checking ' + aiProviderName + '…';
  apiStatusRefresh.disabled = true;
  try {
    const response = await fetch('/api/ai/status', { method: 'POST' });
    if (!response.ok) throw new Error(aiProviderName + ' connection check failed.');
    const result = await response.json();
    if (result.connected) {
      apiStatus.dataset.state = 'connected';
      apiStatusLabel.textContent = aiProviderName + ' connected';
    } else {
      apiStatus.dataset.state = 'disconnected';
      apiStatusLabel.textContent = result.configured === false
        ? aiProviderName + ' API key not configured'
        : aiProviderName + ' not connected';
    }
  } catch (_) {
    apiStatus.dataset.state = 'disconnected';
    apiStatusLabel.textContent = aiProviderName + ' not connected';
  } finally {
    apiStatusRefresh.disabled = false;
  }
}

async function initializeAiProvider() {
  try {
    const response = await fetch('/api/config');
    if (!response.ok) throw new Error('Could not load AI provider configuration.');
    const config = await response.json();
    setProviderDetails(config.aiProvider);
    if (recognition) {
      if (aiProvider === 'openrouter') {
        setVoiceStatus('idle', 'Speech input is ready. Add an OpenRouter key above to enable AI replies.');
      } else {
        setVoiceStatus('idle', 'Speech input is ready. Start Ollama to enable local assistant replies.');
      }
    }
  } catch (_) {
    setProviderDetails('gemini');
  }
  await checkAiProviderStatus();
}

/* ============================================================
   8. EVENT LISTENERS
   ============================================================ */

// --- Description textarea ---
description.addEventListener('input', invalidateEnglishReview);
answerInput.addEventListener('input', invalidateEnglishReview);
languageSelect.addEventListener('change', invalidateEnglishReview);
description.addEventListener('input', debounce(() => {
  updateCharacterCount();
  voiceConversation = [];
  voiceResponse.hidden = true;
  if (initialMessageShown) {
    conversationMessages = [];
    initialMessageShown = false;
    clarificationPanel.hidden = true;
    chatThread.replaceChildren();
    answerForm.hidden = true;
  }
  if (clarificationReady) {
    clarificationReady = false;
    clarifyButton.disabled = false;
    clarifyButton.textContent = 'Ask follow-up questions';
    statusTitle.textContent = 'Description changed';
    statusMessage.textContent = 'You can ask for clarification again or convert the updated description to English.';
  }
}, 150));

// --- Clarify button ---
clarifyButton.addEventListener('click', () =>
  handleClarification({ initial: conversationMessages.length === 0 }),
);

// --- English conversion and review ---
convertButton.addEventListener('click', convertToProfessionalEnglish);
copyEnglishDescriptionButton.addEventListener('click', copyEnglishDescription);
editEnglishDescriptionButton.addEventListener('click', editEnglishDescription);
confirmEnglishDescriptionButton.addEventListener('click', confirmEnglishDescription);

// --- Generate and review report ---
generateButton.addEventListener('click', generateReport);
regenerateReportButton.addEventListener('click', generateReport);
editReportButton.addEventListener('click', toggleReportEditing);
downloadTxtButton.addEventListener('click', downloadReportAsTxt);
downloadPdfButton.addEventListener('click', downloadReportAsPdf);

// --- Clarification answer form ---
answerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const content = answerInput.value.trim();
  if (!content) { answerInput.focus(); return; }
  conversationMessages.push({ role: 'user', content });
  appendChatMessage('user', content);
  answerInput.value = '';
  await handleClarification();
});

// --- Browser voice input ---
micButton.addEventListener('click', () => {
  if (!recognition || voiceReplyPending || isSpeakingVoiceReply) return;
  if (isRecognizing) {
    recognition.stop();
    setVoiceStatus('recording', 'Finishing speech recognition.');
    return;
  }
  recognitionFailed = false;
  recognition.lang = chooseVoiceLanguage();
  isRecognizing = true;
  setVoiceStatus('requesting permission', 'Allow microphone access in your browser.');
  try {
    recognition.start();
  } catch (error) {
    isRecognizing = false;
    setVoiceStatus('error', 'Voice input could not start: ' + error.message);
  }
});

// --- Save report button (shows confirmation dialog) ---
saveReportButton.addEventListener('click', () => {
  const isEdit = Boolean(currentReport?.reportId);
  saveConfirmation.querySelector('h2').textContent =
    isEdit ? 'Save changes to this report?' : 'Save this bug report?';
  saveConfirmation.querySelector('p').textContent = isEdit
    ? 'Your edits will update this report in the local database.'
    : 'Saving stores this report in your local SQLite database.';
  confirmSaveButton.textContent = isEdit ? 'Save changes' : 'Save report';
  if (typeof saveConfirmation.showModal === 'function') {
    saveConfirmation.showModal();
  } else if (window.confirm('Save this bug report to your local database?')) {
    saveReport();
  }
});

// --- Confirm save button (inside dialog) ---
confirmSaveButton.addEventListener('click', (event) => {
  event.preventDefault();
  saveConfirmation.close();
  saveReport();
});

// --- Copy report button ---
copyReportButton.addEventListener('click', copyConfirmedReport);

// --- Reset button ---
resetReportButton.addEventListener('click', resetWorkspace);

// --- API key form ---
apiKeyForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    apiStatus.dataset.state = 'disconnected';
    apiStatusLabel.textContent = 'Enter an API key';
    apiKeyInput.focus();
    return;
  }
  apiStatus.dataset.state = 'checking';
  apiStatusLabel.textContent = 'Checking API key…';
  apiKeyCheck.disabled = true;
  apiStatusRefresh.disabled = true;
  try {
    const response = await fetch('/api/ai/key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey }),
    });
    const result = await response.json();
    apiStatus.dataset.state = result.connected ? 'connected' : 'disconnected';
    apiStatusLabel.textContent = result.connected
      ? aiProviderName + ' connected'
      : (result.message || 'Key not connected');
  } catch (_) {
    apiStatus.dataset.state = 'disconnected';
    apiStatusLabel.textContent = 'Connection check failed';
  } finally {
    apiKeyInput.value = '';
    apiKeyCheck.disabled = false;
    apiStatusRefresh.disabled = false;
  }
});

// --- Refresh status button ---
apiStatusRefresh.addEventListener('click', checkAiProviderStatus);

/* ============================================================
   9. INIT
   ============================================================ */

configureSpeechRecognition();
initializeAiProvider();
