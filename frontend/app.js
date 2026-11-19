const description = document.querySelector('#description');
const charCount = document.querySelector('#char-count');
const languageSelect = document.querySelector('#language');
const clarifyButton = document.querySelector('#clarify-button');
const generateButton = document.querySelector('#generate-button');
const statusTitle = document.querySelector('#status-title');
const statusMessage = document.querySelector('#status-message');
const micButton = document.querySelector('#mic-button');
const browserVoiceButton = document.querySelector('#browser-voice-button');
const voiceStatus = document.querySelector('#voice-status');
const voiceLanguageIndicator = document.querySelector('#voice-language-indicator');
const liveTranscript = document.querySelector('#live-transcript');
const liveResponse = document.querySelector('#live-response');
const clarificationPanel = document.querySelector('#clarification-panel');
const chatThread = document.querySelector('#chat-thread');
const answerForm = document.querySelector('#answer-form');
const answerInput = document.querySelector('#follow-up-answer');
const sendAnswerButton = document.querySelector('#send-answer-button');
const reportEditor = document.querySelector('#report-editor');
const reportFieldGrid = document.querySelector('#report-field-grid');
const reportStatus = document.querySelector('#report-status');
const saveConfirmation = document.querySelector('#save-confirmation');
const confirmSaveButton = document.querySelector('#confirm-save-button');
const deleteConfirmation = document.querySelector('#delete-confirmation');
const confirmDeleteButton = document.querySelector('#confirm-delete-button');
const copyReportButton = document.querySelector('#copy-report-button');
const reportCopyPreview = document.querySelector('#report-copy-preview');
const analysisFacts = document.querySelector('#analysis-facts');
const analysisOpenItems = document.querySelector('#analysis-open-items');
const apiStatus = document.querySelector('#api-status');
const apiStatusLabel = document.querySelector('#api-status-label');
const apiStatusRefresh = document.querySelector('#api-status-refresh');
const apiKeyForm = document.querySelector('#api-key-form');
const apiKeyInput = document.querySelector('#api-key-input');
const apiKeyCheck = document.querySelector('#api-key-check');

let recognition;
let isRecognizing = false;
let recognitionFailed = false;
let browserVoiceAvailable = false;
let liveStarting = false;
let liveSessionCounter = 0;
let liveSocket = null;
let liveMicrophoneStream = null;
let liveAudioContext = null;
let liveAudioSource = null;
let liveAudioProcessor = null;
let liveAssistantAudioSources = new Set();
let livePlaybackEndTime = 0;
let liveDraftTranscript = '';
let liveAssistantTranscript = '';
let conversationMessages = [];
let initialMessageShown = false;
let clarificationReady = false;
let formDefinition = [];
let currentReport = null;
let sourceTextForBadges = '';

function updateCharacterCount() {
  const count = description.value.length;
  charCount.textContent = `${count} ${count === 1 ? 'character' : 'characters'}`;
}

function setVoiceState(state, message) {
  voiceStatus.dataset.state = state;
  voiceStatus.textContent = `${state[0].toUpperCase()}${state.slice(1)}: ${message}`;
  micButton.setAttribute('aria-pressed', String(state === 'recording' || state === 'connecting' || state === 'requesting permission'));
  micButton.textContent = ['recording', 'connecting', 'requesting permission', 'processing'].includes(state)
    ? 'Stop voice assistant'
    : 'Start voice assistant';
  micButton.disabled = state === 'unsupported';
}

function setBrowserVoiceStatus(state, message) {
  voiceStatus.dataset.state = state;
  voiceStatus.textContent = `Browser speech input: ${message}`;
  browserVoiceButton.textContent = state === 'recording' ? 'Stop browser speech input' : 'Use browser speech input';
}

function chooseVoiceLanguage() {
  if (languageSelect.value === 'mr') return 'mr-IN';
  return 'en-IN';
}

function getTranscriptTarget() {
  return answerForm.hidden ? description : answerInput;
}

function appendTranscript(target, transcript) {
  const separator = target.value.trim() ? ' ' : '';
  target.value = `${target.value}${separator}${transcript}`.trim();
  if (target === description) updateCharacterCount();
}

function configureSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    browserVoiceAvailable = false;
    browserVoiceButton.hidden = true;
    return;
  }

  browserVoiceAvailable = true;
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.onstart = () => {
    isRecognizing = true;
    recognitionFailed = false;
    setBrowserVoiceStatus('recording', 'Listening. Speak clearly, then pause.');
  };
  recognition.onresult = (event) => {
    let finalText = '';
    let interimText = '';
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const text = event.results[index][0].transcript;
      if (event.results[index].isFinal) finalText += text;
      else interimText += text;
    }
    if (finalText.trim()) appendTranscript(getTranscriptTarget(), finalText.trim());
    if (interimText.trim()) {
      liveTranscript.textContent = `Recognizing: ${interimText.trim()}`;
      updateDetectedLanguage(interimText.trim());
      setBrowserVoiceStatus('processing', 'Recognizing your speech.');
    }
  };
  recognition.onerror = (event) => {
    isRecognizing = false;
    recognitionFailed = true;
    const message = event.error === 'not-allowed'
      ? 'Microphone permission was denied. Allow microphone access or type instead.'
      : `Voice input had a problem (${event.error}). You can type instead.`;
    setBrowserVoiceStatus('error', message);
  };
  recognition.onend = () => {
    isRecognizing = false;
    browserVoiceButton.textContent = 'Use browser speech input';
    if (!recognitionFailed) setBrowserVoiceStatus('idle', 'Transcript is editable. Review it before continuing.');
  };
}

function mergeTranscript(current, incoming) {
  const next = String(incoming || '').trim();
  if (!next) return current;
  const previous = current.trim();
  if (!previous || next.startsWith(previous)) return next;
  if (previous.endsWith(next)) return previous;
  return `${previous}${/\s$/.test(current) ? '' : ' '}${next}`;
}

function updateDetectedLanguage(transcript) {
  const hasDevanagari = /[\u0900-\u097f]/u.test(transcript);
  const hasLatin = /[A-Za-z]/u.test(transcript);
  if (hasDevanagari && hasLatin) voiceLanguageIndicator.textContent = 'Likely language: Marathi and English mix';
  else if (hasDevanagari) voiceLanguageIndicator.textContent = 'Likely language: Marathi (Devanagari script detected)';
  else if (hasLatin) voiceLanguageIndicator.textContent = 'Likely language: English or Latin script (not confirmed)';
  else voiceLanguageIndicator.textContent = 'Language: detecting from speech';
}

function transcriptTarget() {
  return answerForm.hidden ? description : answerInput;
}

function commitLiveTranscript() {
  const transcript = liveDraftTranscript.trim();
  if (!transcript) return;
  appendTranscript(transcriptTarget(), transcript);
  liveTranscript.textContent = `Added to the editable description: ${transcript}`;
  liveDraftTranscript = '';
}

function stopLivePlayback() {
  for (const source of liveAssistantAudioSources) {
    try { source.stop(); } catch (_error) { /* Already stopped. */ }
  }
  liveAssistantAudioSources.clear();
  livePlaybackEndTime = liveAudioContext?.currentTime || 0;
}

function releaseLiveResources() {
  stopLivePlayback();
  try { liveAudioProcessor?.disconnect(); } catch (_error) { /* Node may already be disconnected. */ }
  try { liveAudioSource?.disconnect(); } catch (_error) { /* Node may already be disconnected. */ }
  liveAudioProcessor = null;
  liveAudioSource = null;
  for (const track of liveMicrophoneStream?.getTracks?.() || []) track.stop();
  liveMicrophoneStream = null;
  const context = liveAudioContext;
  liveAudioContext = null;
  if (context && context.state !== 'closed') context.close().catch(() => {});
}

function stopLiveVoice(message = 'Voice session ended. Your transcript remains editable.') {
  liveSessionCounter += 1;
  liveStarting = false;
  commitLiveTranscript();
  const socket = liveSocket;
  liveSocket = null;
  if (socket) {
    try {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
        socket.close(1000, 'Voice session ended by user');
      } else if (socket.readyState === WebSocket.CONNECTING) socket.close();
    } catch (_error) { /* The connection may have closed already. */ }
  }
  releaseLiveResources();
  setVoiceState('idle', message);
}

function encodeBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function sendLiveAudioChunk(buffer) {
  if (!liveSocket || liveSocket.readyState !== WebSocket.OPEN) return;
  liveSocket.send(JSON.stringify({
    realtimeInput: {
      audio: { data: encodeBase64(buffer), mimeType: 'audio/pcm;rate=16000' },
    },
  }));
}

async function startMicrophoneCapture(sessionId) {
  liveAudioContext = new AudioContext({ sampleRate: 16000 });
  if (liveAudioContext.sampleRate !== 16000) throw new Error('This browser could not open a 16 kHz audio stream.');
  await liveAudioContext.audioWorklet.addModule('/live-audio-worklet.js');
  if (sessionId !== liveSessionCounter) throw new Error('Voice session was cancelled.');
  liveAudioSource = liveAudioContext.createMediaStreamSource(liveMicrophoneStream);
  liveAudioProcessor = new AudioWorkletNode(liveAudioContext, 'qa-pcm-capture', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    channelCount: 1,
    channelCountMode: 'explicit',
    channelInterpretation: 'speakers',
  });
  liveAudioProcessor.port.onmessage = (event) => sendLiveAudioChunk(event.data);
  const mutedMonitor = liveAudioContext.createGain();
  mutedMonitor.gain.value = 0;
  liveAudioSource.connect(liveAudioProcessor);
  liveAudioProcessor.connect(mutedMonitor);
  mutedMonitor.connect(liveAudioContext.destination);
  await liveAudioContext.resume();
}

function playLiveAudio(base64Audio) {
  if (!liveAudioContext || !base64Audio) return;
  const binary = atob(base64Audio);
  const sampleCount = Math.floor(binary.length / 2);
  if (!sampleCount) return;
  const audioBuffer = liveAudioContext.createBuffer(1, sampleCount, 24000);
  const samples = audioBuffer.getChannelData(0);
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = (binary.charCodeAt(index * 2) | (binary.charCodeAt(index * 2 + 1) << 8));
    samples[index] = (sample & 0x8000 ? sample - 0x10000 : sample) / 32768;
  }
  const source = liveAudioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(liveAudioContext.destination);
  const startAt = Math.max(liveAudioContext.currentTime, livePlaybackEndTime);
  source.start(startAt);
  livePlaybackEndTime = startAt + audioBuffer.duration;
  liveAssistantAudioSources.add(source);
  source.onended = () => liveAssistantAudioSources.delete(source);
}

function handleLiveMessage(message) {
  if (message.setupComplete || message.setup_complete) return { setupComplete: true };
  if (message.error) {
    const detail = typeof message.error.message === 'string' ? message.error.message.slice(0, 240) : '';
    throw new Error(detail ? `Gemini Live: ${detail}` : 'Gemini Live reported a session error.');
  }
  const serverContent = message.serverContent || message.server_content;
  if (!serverContent) return { setupComplete: false };

  const inputTranscription = serverContent.inputTranscription || serverContent.input_transcription;
  if (inputTranscription?.text) {
    liveDraftTranscript = mergeTranscript(liveDraftTranscript, inputTranscription.text);
    liveTranscript.textContent = `Listening: ${liveDraftTranscript}`;
    updateDetectedLanguage(liveDraftTranscript);
  }

  const outputTranscription = serverContent.outputTranscription || serverContent.output_transcription;
  if (outputTranscription?.text) {
    liveAssistantTranscript = mergeTranscript(liveAssistantTranscript, outputTranscription.text);
    liveResponse.hidden = false;
    liveResponse.textContent = `Gemini: ${liveAssistantTranscript}`;
  }

  const modelTurn = serverContent.modelTurn || serverContent.model_turn;
  for (const part of modelTurn?.parts || []) {
    const inlineData = part.inlineData || part.inline_data;
    if (inlineData?.data) playLiveAudio(inlineData.data);
  }

  if (serverContent.interrupted) stopLivePlayback();
  if (serverContent.turnComplete || serverContent.turn_complete) {
    commitLiveTranscript();
    liveAssistantTranscript = '';
  }
  return { setupComplete: false };
}

async function startLiveVoice() {
  const sessionId = ++liveSessionCounter;
  liveStarting = true;
  liveDraftTranscript = '';
  liveAssistantTranscript = '';
  liveResponse.hidden = true;
  liveResponse.textContent = '';
  setVoiceState('requesting permission', 'Allow microphone access to start Gemini Live. Audio is sent to Google for live transcription and replies.');

  try {
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode) {
      throw new Error('Live microphone streaming is unavailable in this browser.');
    }
    liveMicrophoneStream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    if (sessionId !== liveSessionCounter) {
      for (const track of liveMicrophoneStream.getTracks()) track.stop();
      liveMicrophoneStream = null;
      return;
    }

    setVoiceState('connecting', 'Requesting a short-lived voice token and connecting to Gemini Live.');
    const tokenResponse = await fetch('/api/voice/session', { method: 'POST' });
    const credentials = await tokenResponse.json();
    if (!tokenResponse.ok || !credentials.token || !credentials.model) {
      throw new Error(credentials.error?.message || 'A secure Gemini Live session could not be created.');
    }
    if (sessionId !== liveSessionCounter) return;

    const endpoint = new URL('wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained');
    endpoint.searchParams.set('access_token', credentials.token);
    const socket = new WebSocket(endpoint);
    liveSocket = socket;
    await new Promise((resolve, reject) => {
      let settled = false;
      const timer = window.setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('Gemini Live did not finish connecting in time.'));
        }
      }, 20000);
      const rejectConnection = (error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        reject(error);
      };
      socket.onopen = () => {
        socket.send(JSON.stringify({
          setup: {
            model: `models/${credentials.model}`,
            responseModalities: ['AUDIO'],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
          },
        }));
      };
      socket.onmessage = async (event) => {
        try {
          const message = handleLiveMessage(JSON.parse(event.data));
          if (!message.setupComplete || settled) return;
          await startMicrophoneCapture(sessionId);
          if (sessionId !== liveSessionCounter) return;
          settled = true;
          window.clearTimeout(timer);
          liveStarting = false;
          setVoiceState('recording', 'Listening live. Pause naturally to let Gemini respond. The transcript is added to the editable description.');
          resolve();
        } catch (error) {
          rejectConnection(error);
        }
      };
      socket.onerror = () => {};
      socket.onclose = (event) => {
        const details = [event.code ? `code ${event.code}` : '', event.reason || ''].filter(Boolean).join(': ');
        if (!settled) rejectConnection(new Error(details
          ? `Gemini Live closed before setup completed (${details}). Check Live model access and API key restrictions.`
          : 'Gemini Live closed before setup completed. Check Live model access and API key restrictions.'));
        if (sessionId === liveSessionCounter && liveSocket === socket) {
          liveSocket = null;
          liveStarting = false;
          commitLiveTranscript();
          releaseLiveResources();
          setVoiceState('error', 'Gemini Live disconnected. Your transcript is editable; you can retry or type instead.');
        }
      };
    });
  } catch (error) {
    if (sessionId !== liveSessionCounter) return;
    liveStarting = false;
    commitLiveTranscript();
    if (liveSocket) {
      liveSocket.onclose = null;
      try { liveSocket.close(); } catch (_closeError) { /* Connection may not have opened. */ }
      liveSocket = null;
    }
    releaseLiveResources();
    setVoiceState('error', `${error.message} You can retry or type instead.`);
  }
}

function appendChatMessage(role, content) {
  const item = document.createElement('article');
  item.className = `chat-message ${role}`;
  const label = document.createElement('strong');
  label.textContent = role === 'assistant' ? 'QA assistant' : 'You';
  const text = document.createElement('p');
  text.textContent = content;
  item.append(label, text);
  chatThread.append(item);
  chatThread.scrollTop = chatThread.scrollHeight;
}

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

async function requestClarification() {
  return postJson('/api/bug-reports/clarify', {
    description: description.value.trim(),
    messages: conversationMessages,
  });
}

function labelForBadge(value) {
  return { confirmed: 'Confirmed', suggested: 'AI suggested', missing: 'Missing' }[value];
}

function isBlankValue(field, value) {
  if (field === 'severity' || field === 'priority') return !value?.value;
  if (Array.isArray(value)) return value.length === 0;
  if (field === 'assumptionsAndMissingInformation') return !value.assumptions.length && !value.missingInfo.length;
  if (field === 'timestamps') return !value.createdAt && !value.updatedAt;
  if (value && typeof value === 'object') return false;
  return typeof value !== 'string' || !value.trim();
}

function classifyField(field, value) {
  if (field === 'severity' || field === 'priority') return 'suggested';
  if (isBlankValue(field, value)) return 'missing';
  if (field === 'confirmedFacts') return 'confirmed';
  const values = Array.isArray(value) ? value : [value];
  const normalizedSource = sourceTextForBadges.toLocaleLowerCase();
  const isDirectlySupported = values.some((item) => {
    const text = String(item).trim().toLocaleLowerCase();
    return text.length > 0 && normalizedSource.includes(text);
  });
  return isDirectlySupported ? 'confirmed' : 'suggested';
}

function updateBadge(field, status) {
  const badge = reportFieldGrid.querySelector(`[data-badge-for="${field}"]`);
  if (!badge) return;
  badge.className = `badge ${status}`;
  badge.textContent = labelForBadge(status);
}

function onFieldEdited(field) {
  updateBadge(field, isBlankValue(field, currentReport[field]) ? 'missing' : 'confirmed');
  const saveButton = document.querySelector('#save-report-button');
  saveButton.disabled = false;
  saveButton.textContent = currentReport.reportId ? 'Save changes' : 'Save report';
  if (currentReport.reportId) reportStatus.textContent = 'Unsaved changes. Choose Save changes when ready.';
  updateFormattedReportPreview();
}

function addControl(container, field, initialValue, onChange, { textarea = false, rows = 3, options = null } = {}) {
  let control;
  if (options) {
    control = document.createElement('select');
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = 'Not provided';
    control.append(emptyOption);
    for (const option of options) {
      const item = document.createElement('option');
      item.value = option;
      item.textContent = option;
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

function createFieldCard(fieldInfo) {
  const { name, label, editor, options } = fieldInfo;
  const card = document.createElement('div');
  card.className = `report-field ${['textarea', 'list', 'assumptions', 'timestamps', 'attachments'].includes(editor) ? 'wide' : ''}`;
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

  if (editor === 'select') {
    addControl(card, name, currentReport[name], (event) => {
      currentReport[name] = event.currentTarget.value;
      onFieldEdited(name);
    }, { options });
  } else if (editor === 'list') {
    addControl(card, name, currentReport[name].join('\n'), (event) => {
      currentReport[name] = event.currentTarget.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
      onFieldEdited(name);
    }, { textarea: true, rows: Math.min(6, Math.max(3, currentReport[name].length + 1)) });
  } else if (editor === 'suggested-choice') {
    const choice = currentReport[name];
    addControl(card, name, choice.value, (event) => {
      currentReport[name] = { ...currentReport[name], value: event.currentTarget.value || null, suggested: false };
      onFieldEdited(name);
    }, { options });
    addNestedTextarea(card, name, 'Suggestion reason', choice.reason, (event) => {
      currentReport[name] = { ...currentReport[name], reason: event.currentTarget.value, suggested: false };
      onFieldEdited(name);
    }, 2);
  } else if (editor === 'assumptions') {
    addNestedTextarea(card, name, 'AI assumptions', currentReport[name].assumptions.join('\n'), (event) => {
      currentReport[name].assumptions = event.currentTarget.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
      onFieldEdited(name);
    });
    addNestedTextarea(card, name, 'Missing information', currentReport[name].missingInfo.join('\n'), (event) => {
      currentReport[name].missingInfo = event.currentTarget.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
      onFieldEdited(name);
    });
  } else if (editor === 'timestamps') {
    for (const property of ['createdAt', 'updatedAt']) {
      addNestedTextarea(card, name, property === 'createdAt' ? 'Created at' : 'Updated at', currentReport[name][property], (event) => {
        currentReport[name][property] = event.currentTarget.value;
        onFieldEdited(name);
      }, 1);
    }
  } else if (editor === 'attachments') {
    const value = currentReport[name].map((item) => `${item.id} | ${item.name}`).join('\n');
    addControl(card, name, value, (event) => {
      currentReport[name] = event.currentTarget.value.split(/\r?\n/).map((line) => {
        const [id = '', ...nameParts] = line.split('|');
        return { id: id.trim(), name: nameParts.join('|').trim() };
      }).filter((item) => item.id);
      onFieldEdited(name);
    }, { textarea: true });
  } else {
    const isTextarea = editor === 'textarea';
    const control = addControl(card, name, currentReport[name], (event) => {
      currentReport[name] = event.currentTarget.value;
      onFieldEdited(name);
    }, { textarea: isTextarea, rows: 4 });
    if (name === 'reportId') {
      control.readOnly = true;
      control.setAttribute('aria-readonly', 'true');
    }
  }
  return card;
}

function renderReportForm(result, sourceText) {
  currentReport = result.report;
  sourceTextForBadges = sourceText;
  renderAnalysis(result);
  updateFormattedReportPreview();
  reportFieldGrid.replaceChildren();
  for (const fieldInfo of formDefinition) reportFieldGrid.append(createFieldCard(fieldInfo));
  reportStatus.textContent = result.clarifyingQuestions.length
    ? `Clarifying questions to consider: ${result.clarifyingQuestions.join(' ')} `
    : 'Review the badges and edit any suggested values before saving.';
  const saveButton = document.querySelector('#save-report-button');
  saveButton.disabled = Boolean(currentReport.reportId);
  saveButton.textContent = currentReport.reportId ? 'Save changes' : 'Save report';
  document.querySelector('#report-editor-title').textContent = currentReport.reportId
    ? `Edit report ${currentReport.reportId}`
    : 'Bug report draft';
  reportEditor.hidden = false;
  reportEditor.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function displayDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatReportValue(field, value) {
  if (value === null || value === undefined || value === '') return 'Not provided';
  if (field === 'severity' || field === 'priority') {
    const suggestion = value.suggested ? ' (suggested)' : '';
    const reason = value.reason ? ` — ${value.reason}` : '';
    return `${value.value || 'Not provided'}${suggestion}${reason}`;
  }
  if (Array.isArray(value)) {
    if (!value.length) return 'Not provided';
    return value.map((item, index) => `${index + 1}. ${item && typeof item === 'object' ? (item.name || item.id || Object.values(item).join(' | ')) : item}`).join('\n');
  }
  if (field === 'assumptionsAndMissingInformation') {
    const lines = [
      ...(value.assumptions || []).map((item, index) => `Assumption ${index + 1}: ${item}`),
      ...(value.missingInfo || []).map((item, index) => `Missing information ${index + 1}: ${item}`),
    ];
    return lines.length ? lines.join('\n') : 'Not provided';
  }
  if (field === 'timestamps') return `Created: ${value.createdAt || 'Not provided'}\nUpdated: ${value.updatedAt || 'Not provided'}`;
  if (typeof value === 'object') return Object.entries(value).map(([key, item]) => `${key}: ${item || 'Not provided'}`).join('\n');
  return String(value);
}

function formattedBugReport(report) {
  const environment = [report.environment, report.operatingSystemPlatform].filter(Boolean).join(' | ') || 'Not provided';
  const lines = [
    '# BUG REPORT',
    '',
    `Project Name: ${formatReportValue('productProject', report.productProject)}`,
    `Bug ID: ${formatReportValue('reportId', report.reportId)}`,
    `Module: ${formatReportValue('moduleComponent', report.moduleComponent)}`,
    `Sub Module: ${formatReportValue('subModule', report.subModule)}`,
    `Bug Title: ${formatReportValue('bugTitle', report.bugTitle)}`,
    `Bug Type: ${formatReportValue('bugType', report.bugType)}`,
    `Environment: ${environment}`,
    `Build Version: ${formatReportValue('applicationBuildVersion', report.applicationBuildVersion)}`,
    `Browser / Device: ${formatReportValue('browserDevice', report.browserDevice)}`,
    `Severity: ${formatReportValue('severity', report.severity)}`,
    `Priority: ${formatReportValue('priority', report.priority)}`,
    'Steps to Reproduce:',
    formatReportValue('reproductionSteps', report.reproductionSteps),
    `Expected Result: ${formatReportValue('expectedResult', report.expectedResult)}`,
    `Actual Result: ${formatReportValue('actualResult', report.actualResult)}`,
    `Status: ${formatReportValue('status', report.status)}`,
    `Reported By: ${formatReportValue('reporter', report.reporter)}`,
    `Remarks: ${formatReportValue('remarks', report.remarks)}`,
  ];
  return lines.join('\n');
}

function updateFormattedReportPreview() {
  if (currentReport) reportCopyPreview.textContent = formattedBugReport(currentReport);
}

function renderAnalysis(result) {
  const assumptionsAndMissing = currentReport.assumptionsAndMissingInformation || { assumptions: [], missingInfo: [] };
  const facts = Array.isArray(result.confirmedFacts) ? result.confirmedFacts : currentReport.confirmedFacts;
  const assumptions = Array.isArray(result.assumptions) ? result.assumptions : assumptionsAndMissing.assumptions;
  const missing = Array.isArray(result.missingInfo) ? result.missingInfo : assumptionsAndMissing.missingInfo;
  const fillList = (container, entries, emptyText) => {
    container.replaceChildren();
    const content = entries.length ? entries : [emptyText];
    for (const entry of content) {
      const item = document.createElement('li');
      item.textContent = entry;
      container.append(item);
    }
  };
  fillList(analysisFacts, facts, 'No confirmed facts recorded.');
  fillList(analysisOpenItems, [
    ...assumptions.map((item) => `Assumption: ${item}`),
    ...missing.map((item) => `Missing information: ${item}`),
  ], 'No assumptions or missing details recorded.');
}

async function loadFormDefinition() {
  const response = await fetch('/api/bug-reports/schema');
  if (!response.ok) throw new Error('Could not load the report form schema.');
  const result = await response.json();
  formDefinition = result.fields;
}

async function loadAnalytics() {
  try {
    const response = await fetch('/api/bug-reports/analytics');
    if (!response.ok) throw new Error('Could not load report metrics.');
    const metrics = await response.json();
    document.querySelector('#metric-total-bugs').textContent = metrics.totalBugs;
    document.querySelector('#metric-open-bugs').textContent = metrics.openBugs;
    document.querySelector('#metric-critical-bugs').textContent = metrics.criticalBugs;
    document.querySelector('#metric-resolved-bugs').textContent = metrics.resolvedBugs;
    document.querySelector('#metric-generated-reports').textContent = metrics.generatedReports;
    document.querySelector('#metric-ai-history').textContent = metrics.aiAnalysisHistory;
  } catch (_error) {
    for (const metric of document.querySelectorAll('.metric-card strong')) metric.textContent = '—';
  }
}

async function handleClarification({ initial = false } = {}) {
  if (!description.value.trim()) {
    statusTitle.textContent = 'Add a bug description';
    statusMessage.textContent = 'Describe what happened before asking follow-up questions.';
    description.focus();
    return;
  }

  clarifyButton.disabled = true;
  sendAnswerButton.disabled = true;
  clarifyButton.textContent = 'Thinking...';
  statusTitle.textContent = 'Reviewing missing details';
  statusMessage.textContent = 'Your description is being checked for important missing information.';
  clarificationPanel.hidden = false;
  if (initial && !initialMessageShown) {
    appendChatMessage('user', description.value.trim());
    initialMessageShown = true;
  }

  try {
    const result = await requestClarification();
    if (result.cleanDescription) {
      description.value = result.cleanDescription;
      updateCharacterCount();
    }
    if (result.readyToGenerate) {
      clarificationReady = true;
      answerForm.hidden = true;
      appendChatMessage('assistant', 'The description is ready for report generation. You can still edit it above.');
      statusTitle.textContent = 'Ready for the next step';
      statusMessage.textContent = 'Review the clean description. You can generate a report now.';
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
  } catch (error) {
    statusTitle.textContent = 'Clarification failed';
    statusMessage.textContent = error.message;
    clarifyButton.textContent = 'Try clarification again';
  } finally {
    clarifyButton.disabled = clarificationReady;
    sendAnswerButton.disabled = false;
  }
}

function answeredClarifications() {
  const pairs = [];
  for (let index = 0; index < conversationMessages.length - 1; index += 1) {
    const question = conversationMessages[index];
    const answer = conversationMessages[index + 1];
    if (question.role === 'assistant' && answer.role === 'user') {
      pairs.push({ question: question.content, answer: answer.content });
      index += 1;
    }
  }
  return pairs;
}

async function generateReport() {
  if (!description.value.trim()) {
    statusTitle.textContent = 'Add a bug description';
    statusMessage.textContent = 'Describe what happened before generating a report.';
    description.focus();
    return;
  }
  generateButton.disabled = true;
  generateButton.textContent = 'Generating...';
  statusTitle.textContent = 'Building your draft';
  statusMessage.textContent = 'The AI is separating stated facts from suggestions.';
  reportStatus.textContent = '';

  try {
    if (!formDefinition.length) await loadFormDefinition();
    const request = {
      description: description.value.trim(),
      language: languageSelect.value,
      clarifications: answeredClarifications(),
      researchContext: '',
      attachmentIds: [],
      screenshotFindings: [],
    };
    const result = await postJson('/api/bug-reports/generate', request);
    const sourceText = [request.description, ...request.clarifications.map((item) => `${item.question} ${item.answer}`)].join(' ');
    renderReportForm(result, sourceText);
    statusTitle.textContent = 'Draft ready for review';
    statusMessage.textContent = 'Nothing has been saved. Review and edit the report before confirming Save.';
    generateButton.textContent = 'Generate again';
  } catch (error) {
    statusTitle.textContent = 'Report generation failed';
    statusMessage.textContent = error.message;
    generateButton.textContent = 'Try generation again';
  } finally {
    generateButton.disabled = false;
  }
}

async function saveReport() {
  if (!currentReport) return;
  const saveButton = document.querySelector('#save-report-button');
  let saved = false;
  saveButton.disabled = true;
  reportStatus.textContent = 'Saving confirmed report...';
  try {
    const isEdit = Boolean(currentReport.reportId);
    const response = await fetch(isEdit ? `/api/bug-reports/${encodeURIComponent(currentReport.reportId)}` : '/api/bug-reports', {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(isEdit ? currentReport : { confirmed: true, report: currentReport }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || 'Could not save this report.');
    currentReport = result.report;
    saved = true;
    copyReportButton.disabled = false;
    updateFormattedReportPreview();
    reportStatus.textContent = `${isEdit ? 'Updated' : 'Saved'} ${result.report.reportId}.`;
    statusTitle.textContent = isEdit ? 'Report updated' : 'Report saved';
    statusMessage.textContent = 'Your confirmed report is stored locally.';
    saveButton.textContent = 'Saved';
    saveButton.disabled = true;
    reportFieldGrid.replaceChildren(...formDefinition.map(createFieldCard));
    loadAnalytics();
  } catch (error) {
    reportStatus.textContent = error.message;
    saveButton.disabled = false;
  } finally {
    saveButton.disabled = saved;
  }
}

async function copyConfirmedReport() {
  if (!currentReport?.reportId) return;
  reportStatus.textContent = 'Loading the last saved report to copy...';
  try {
    const response = await fetch(`/api/bug-reports/${encodeURIComponent(currentReport.reportId)}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || 'Could not load the saved report.');
    await navigator.clipboard.writeText(formattedBugReport(result.report));
    reportStatus.textContent = 'Saved report copied to the clipboard.';
  } catch (_error) {
    reportStatus.textContent = 'Clipboard access is unavailable. Select the formatted report preview and copy it manually.';
  }
}

async function resetWorkspace() {
  description.value = '';
  answerInput.value = '';
  conversationMessages = [];
  initialMessageShown = false;
  clarificationReady = false;
  currentReport = null;
  const saveButton = document.querySelector('#save-report-button');
  saveButton.disabled = false;
  saveButton.textContent = 'Save report';
  copyReportButton.disabled = true;
  document.querySelector('#report-editor-title').textContent = 'Bug report draft';
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

async function checkGeminiStatus() {
  apiStatus.dataset.state = 'checking';
  apiStatusLabel.textContent = 'Checking Gemini…';
  apiStatusRefresh.disabled = true;
  try {
    const response = await fetch('/api/gemini/status', { method: 'POST' });
    if (!response.ok) throw new Error('Gemini connection check failed.');
    const result = await response.json();
    if (result.connected) {
      apiStatus.dataset.state = 'connected';
      apiStatusLabel.textContent = 'Gemini connected';
    } else {
      apiStatus.dataset.state = 'disconnected';
      apiStatusLabel.textContent = result.configured === false ? 'API key not configured' : 'Gemini not connected';
    }
  } catch (_error) {
    apiStatus.dataset.state = 'disconnected';
    apiStatusLabel.textContent = 'Gemini not connected';
  } finally {
    apiStatusRefresh.disabled = false;
  }
}

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
    const response = await fetch('/api/gemini/key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey }),
    });
    const result = await response.json();
    apiStatus.dataset.state = result.connected ? 'connected' : 'disconnected';
    apiStatusLabel.textContent = result.connected ? 'Gemini connected' : 'Key not connected';
    apiKeyInput.value = '';
  } catch (_error) {
    apiStatus.dataset.state = 'disconnected';
    apiStatusLabel.textContent = 'Connection check failed';
    apiKeyInput.value = '';
  } finally {
    apiKeyCheck.disabled = false;
    apiStatusRefresh.disabled = false;
  }
});

description.addEventListener('input', () => {
  updateCharacterCount();
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
    statusMessage.textContent = 'You can ask for clarification again or generate a report directly.';
  }
});

clarifyButton.addEventListener('click', () => handleClarification({ initial: conversationMessages.length === 0 }));
generateButton.addEventListener('click', generateReport);

answerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const content = answerInput.value.trim();
  if (!content) {
    answerInput.focus();
    return;
  }
  conversationMessages.push({ role: 'user', content });
  appendChatMessage('user', content);
  answerInput.value = '';
  await handleClarification();
});

micButton.addEventListener('click', () => {
  if (liveStarting || liveSocket) {
    stopLiveVoice();
    return;
  }
  startLiveVoice();
});

browserVoiceButton.addEventListener('click', () => {
  if (!recognition) return;
  if (isRecognizing) {
    recognition.stop();
    setBrowserVoiceStatus('processing', 'Finishing your transcript.');
    return;
  }
  recognitionFailed = false;
  recognition.lang = chooseVoiceLanguage();
  setBrowserVoiceStatus('requesting permission', 'Allow microphone access in your browser.');
  try {
    recognition.start();
  } catch (_error) {
    setBrowserVoiceStatus('error', 'Voice input could not start. Type your description instead.');
  }
});

document.querySelector('#save-report-button').addEventListener('click', () => {
  const isEdit = Boolean(currentReport?.reportId);
  saveConfirmation.querySelector('h2').textContent = isEdit ? 'Save changes to this report?' : 'Save this bug report?';
  saveConfirmation.querySelector('p').textContent = isEdit
    ? 'Your edits will update this report in the local database.'
    : 'Saving stores this report in your local SQLite database.';
  confirmSaveButton.textContent = isEdit ? 'Save changes' : 'Save report';
  if (typeof saveConfirmation.showModal === 'function') saveConfirmation.showModal();
  else if (window.confirm('Save this bug report to your local database?')) saveReport();
});

confirmSaveButton.addEventListener('click', (event) => {
  event.preventDefault();
  saveConfirmation.close();
  saveReport();
});

document.querySelector('#reset-report-button').addEventListener('click', resetWorkspace);
copyReportButton.addEventListener('click', copyConfirmedReport);

configureSpeechRecognition();
loadAnalytics();
checkGeminiStatus();
apiStatusRefresh.addEventListener('click', checkGeminiStatus);
