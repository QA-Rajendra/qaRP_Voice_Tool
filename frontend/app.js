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
const bugReportTableBody = document.querySelector('#bug-report-table-body');
const bugListStatus = document.querySelector('#bug-list-status');
const reportSearch = document.querySelector('#report-search');
const statusFilter = document.querySelector('#status-filter');
const severityFilter = document.querySelector('#severity-filter');
const previousPageButton = document.querySelector('#previous-page-button');
const nextPageButton = document.querySelector('#next-page-button');
const pageIndicator = document.querySelector('#page-indicator');
const deleteConfirmation = document.querySelector('#delete-confirmation');
const confirmDeleteButton = document.querySelector('#confirm-delete-button');
const qaExportPanel = document.querySelector('#qa-export-panel');
const exportFieldOptions = document.querySelector('#export-field-options');
const exportSelectedCount = document.querySelector('#export-selected-count');
const exportStatus = document.querySelector('#export-status');
const qaStatus = document.querySelector('#qa-status');
const qaSuggestionsEditor = document.querySelector('#qa-suggestions-editor');
const generateQaButton = document.querySelector('#generate-qa-button');
const copyQaButton = document.querySelector('#copy-qa-button');
const applyQaButton = document.querySelector('#apply-qa-button');
const copyReportButton = document.querySelector('#copy-report-button');
const reportCopyPreview = document.querySelector('#report-copy-preview');
const analysisFacts = document.querySelector('#analysis-facts');
const analysisOpenItems = document.querySelector('#analysis-open-items');
const exportCenterReport = document.querySelector('#export-center-report');
const openExportCenterButton = document.querySelector('#open-export-center-button');
const exportCenterStatus = document.querySelector('#export-center-status');
const settingsModel = document.querySelector('#settings-model');
const apiStatus = document.querySelector('#api-status');
const apiStatusLabel = document.querySelector('#api-status-label');
const apiStatusRefresh = document.querySelector('#api-status-refresh');
const apiKeyForm = document.querySelector('#api-key-form');
const apiKeyInput = document.querySelector('#api-key-input');
const apiKeyCheck = document.querySelector('#api-key-check');
const settingsLiveModel = document.querySelector('#settings-live-model');
const settingsUploadLimit = document.querySelector('#settings-upload-limit');
const researchQuery = document.querySelector('#research-query');
const researchButton = document.querySelector('#research-button');
const researchStatus = document.querySelector('#research-status');
const researchAnswer = document.querySelector('#research-answer');
const researchSources = document.querySelector('#research-sources');
const screenshotInput = document.querySelector('#screenshot-file');
const imageDropZone = document.querySelector('#image-drop-zone');
const imagePreview = document.querySelector('#image-preview');
const screenshotPreview = document.querySelector('#screenshot-preview');
const screenshotFilename = document.querySelector('#screenshot-filename');
const screenshotSizeLimit = document.querySelector('#screenshot-size-limit');
const uploadProgress = document.querySelector('#upload-progress');
const screenshotStatus = document.querySelector('#screenshot-status');
const analyzeScreenshotButton = document.querySelector('#analyze-screenshot-button');
const screenshotFindingsList = document.querySelector('#screenshot-findings');
const removeScreenshotButton = document.querySelector('#remove-screenshot-button');

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
let selectedAttachment = null;
let screenshotObjectUrl = null;
let acceptedScreenshotFindings = [];
let activeUploadRequest = null;
let currentListPage = 1;
let totalListPages = 1;
let pendingDeleteId = '';
let currentQaSuggestions = null;
let maxUploadMb = null;

const QA_CATEGORIES = [
  ['reproductionSteps', 'Suggested reproduction steps'],
  ['positiveScenarios', 'Positive scenarios'],
  ['negativeScenarios', 'Negative scenarios'],
  ['boundaryScenarios', 'Boundary scenarios'],
  ['regressionCases', 'Regression cases'],
];

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
  if (message.error) throw new Error('Gemini Live reported a session error.');
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
      socket.onerror = () => rejectConnection(new Error('Gemini Live could not connect. Check the network and API access.'));
      socket.onclose = () => {
        if (!settled) rejectConnection(new Error('Gemini Live closed before the session was ready.'));
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

function renderResearchSources(sources) {
  researchSources.replaceChildren();
  for (const source of sources) {
    let url;
    try {
      url = new URL(source.url);
    } catch (_error) {
      continue;
    }
    if (!['http:', 'https:'].includes(url.protocol)) continue;
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = url.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = source.title || url.hostname;
    item.append(link);
    researchSources.append(item);
  }
}

async function researchTechnicalQuestion() {
  const query = researchQuery.value.trim();
  if (!query) {
    researchQuery.focus();
    researchStatus.textContent = 'Enter a technical question to research.';
    return;
  }
  researchButton.disabled = true;
  researchButton.textContent = 'Searching...';
  researchStatus.textContent = 'Searching the web for sourced context...';
  researchAnswer.textContent = '';
  researchSources.replaceChildren();
  try {
    const result = await postJson('/api/research', { query });
    researchAnswer.textContent = result.answer;
    renderResearchSources(result.sources);
    researchStatus.textContent = result.sources.length ? `${result.sources.length} source(s) found. Research is shown separately from your facts.` : 'No source citations were returned.';
  } catch (error) {
    researchStatus.textContent = error.message;
  } finally {
    researchButton.disabled = false;
    researchButton.textContent = 'Research';
  }
}

function updateReportFieldValue(field) {
  const control = reportFieldGrid.querySelector(`[data-report-field="${field}"]`);
  if (control) {
    if (field === 'attachmentReferences') {
      control.value = currentReport.attachmentReferences.map((item) => `${item.id} | ${item.name}`).join('\n');
    } else if (field === 'screenshotFindings') {
      control.value = currentReport.screenshotFindings.join('\n');
    }
  }
  if (currentReport) updateBadge(field, isBlankValue(field, currentReport[field]) ? 'missing' : 'suggested');
  if (currentReport) updateFormattedReportPreview();
}

function syncScreenshotContextToReport() {
  if (!currentReport) return;
  currentReport.screenshotFindings = [...acceptedScreenshotFindings];
  if (selectedAttachment && !currentReport.attachmentReferences.some((item) => item.id === selectedAttachment.id)) {
    currentReport.attachmentReferences.push({ id: selectedAttachment.id, name: selectedAttachment.id });
  }
  updateReportFieldValue('screenshotFindings');
  updateReportFieldValue('attachmentReferences');
}

function setUploadStatus(message) {
  screenshotStatus.textContent = message;
}

async function loadPublicConfig() {
  try {
    const response = await fetch('/api/config');
    if (!response.ok) throw new Error('Could not load the upload size limit.');
    const config = await response.json();
    if (!Number.isInteger(config.maxUploadMb) || config.maxUploadMb < 1 || config.maxUploadMb > 20) throw new Error('Invalid public configuration.');
    maxUploadMb = config.maxUploadMb;
    screenshotSizeLimit.textContent = `PNG, JPEG, WebP, or GIF · up to ${maxUploadMb} MB`;
    settingsModel.textContent = config.geminiModel;
    settingsLiveModel.textContent = config.geminiLiveModel;
    settingsUploadLimit.textContent = `${maxUploadMb} MB`;
  } catch (_error) {
    screenshotSizeLimit.textContent = `PNG, JPEG, WebP, or GIF · server limit applies`;
    settingsModel.textContent = 'Unavailable';
    settingsLiveModel.textContent = 'Unavailable';
    settingsUploadLimit.textContent = 'Server configured';
  }
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

function startImageUpload(file) {
  const body = new FormData();
  body.append('image', file);
  const request = new XMLHttpRequest();
  activeUploadRequest = request;
  uploadProgress.hidden = false;
  uploadProgress.value = 0;
  analyzeScreenshotButton.hidden = true;
  setUploadStatus('Uploading image...');
  request.open('POST', '/api/attachments');
  request.upload.addEventListener('progress', (event) => {
    if (event.lengthComputable) uploadProgress.value = Math.round((event.loaded / event.total) * 100);
  });
  request.addEventListener('load', () => {
    activeUploadRequest = null;
    let result = {};
    try { result = JSON.parse(request.responseText); } catch (_error) { /* Show a safe generic error below. */ }
    if (request.status < 200 || request.status >= 300) {
      setUploadStatus(result.error?.message || 'The image upload failed.');
      return;
    }
    selectedAttachment = result;
    screenshotFilename.textContent = result.name;
    analyzeScreenshotButton.hidden = false;
    uploadProgress.value = 100;
    setUploadStatus('Image uploaded. Analyze it to review visible findings.');
    syncScreenshotContextToReport();
  });
  request.addEventListener('error', () => {
    activeUploadRequest = null;
    setUploadStatus('The image upload failed. Check the local server and try again.');
  });
  request.addEventListener('abort', () => { activeUploadRequest = null; });
  request.send(body);
}

async function chooseScreenshot(file) {
  if (!file) return;
  const acceptedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  if (!acceptedTypes.includes(file.type)) {
    setUploadStatus('Choose a PNG, JPEG, WebP, or GIF image.');
    return;
  }
  if (maxUploadMb && file.size > maxUploadMb * 1024 * 1024) {
    setUploadStatus(`This image is larger than ${maxUploadMb} MB. Choose a smaller file.`);
    return;
  }
  if (selectedAttachment || screenshotObjectUrl) await removeScreenshot();
  screenshotObjectUrl = URL.createObjectURL(file);
  screenshotPreview.src = screenshotObjectUrl;
  screenshotFilename.textContent = file.name;
  imagePreview.hidden = false;
  screenshotFindingsList.replaceChildren();
  acceptedScreenshotFindings = [];
  startImageUpload(file);
}

async function removeScreenshot() {
  if (activeUploadRequest) activeUploadRequest.abort();
  const attachmentToDelete = selectedAttachment;
  selectedAttachment = null;
  if (screenshotObjectUrl) URL.revokeObjectURL(screenshotObjectUrl);
  screenshotObjectUrl = null;
  screenshotPreview.removeAttribute('src');
  imagePreview.hidden = true;
  uploadProgress.hidden = true;
  analyzeScreenshotButton.hidden = true;
  screenshotFindingsList.replaceChildren();
  acceptedScreenshotFindings = [];
  if (currentReport) {
    currentReport.attachmentReferences = currentReport.attachmentReferences.filter((item) => item.id !== attachmentToDelete?.id);
    currentReport.screenshotFindings = [];
    updateReportFieldValue('attachmentReferences');
    updateReportFieldValue('screenshotFindings');
  }
  if (attachmentToDelete) {
    try {
      const response = await fetch(`/api/attachments/${encodeURIComponent(attachmentToDelete.id)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Delete failed');
      setUploadStatus('Image removed.');
    } catch (_error) {
      setUploadStatus('The local preview was removed, but the uploaded file could not be deleted.');
    }
  } else {
    setUploadStatus('Image removed.');
  }
}

function renderScreenshotFinding(finding, index) {
  const item = document.createElement('li');
  item.className = 'screenshot-finding';
  const title = document.createElement('strong');
  title.textContent = `${finding.category}: ${finding.observation}`;
  const evidence = document.createElement('p');
  evidence.textContent = `Visible evidence: ${finding.visibleEvidence}`;
  const actions = document.createElement('div');
  actions.className = 'finding-actions';
  const accept = document.createElement('button');
  accept.type = 'button';
  accept.className = 'button accept-finding';
  accept.textContent = 'Accept suggestion';
  const reject = document.createElement('button');
  reject.type = 'button';
  reject.className = 'button reject-finding';
  reject.textContent = 'Reject';
  const findingText = `${finding.category}: ${finding.observation} Visible evidence: ${finding.visibleEvidence}`;
  accept.addEventListener('click', () => {
    if (!acceptedScreenshotFindings.includes(findingText)) acceptedScreenshotFindings.push(findingText);
    syncScreenshotContextToReport();
    actions.replaceChildren(document.createTextNode('Accepted as an AI suggestion'));
  });
  reject.addEventListener('click', () => {
    acceptedScreenshotFindings = acceptedScreenshotFindings.filter((text) => text !== findingText);
    syncScreenshotContextToReport();
    actions.replaceChildren(document.createTextNode('Rejected'));
  });
  actions.append(accept, reject);
  item.append(title, evidence, actions);
  item.dataset.findingIndex = String(index);
  return item;
}

async function analyzeScreenshot() {
  if (!selectedAttachment) return;
  analyzeScreenshotButton.disabled = true;
  analyzeScreenshotButton.textContent = 'Analyzing...';
  setUploadStatus('Checking only what is visible in the image...');
  screenshotFindingsList.replaceChildren();
  acceptedScreenshotFindings = [];
  try {
    const result = await postJson(`/api/attachments/${encodeURIComponent(selectedAttachment.id)}/analyze`, {});
    if (!result.findings.length) {
      setUploadStatus('No clear visual findings were identified.');
      return;
    }
    for (const [index, finding] of result.findings.entries()) {
      screenshotFindingsList.append(renderScreenshotFinding(finding, index));
    }
    setUploadStatus('Review each finding. Accepted findings stay marked as AI suggestions.');
  } catch (error) {
    setUploadStatus(error.message);
  } finally {
    analyzeScreenshotButton.disabled = false;
    analyzeScreenshotButton.textContent = 'Analyze screenshot';
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
  currentQaSuggestions = null;
  qaSuggestionsEditor.replaceChildren();
  qaStatus.textContent = '';
  copyQaButton.disabled = true;
  applyQaButton.disabled = true;
  qaExportPanel.hidden = !currentReport.reportId;
  copyReportButton.disabled = !currentReport.reportId;
  exportStatus.textContent = '';
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
  const attachments = [
    ...(report.attachmentReferences || []).map((item) => item.name || item.id),
    ...(report.screenshotFindings || []).map((item) => `Screenshot finding: ${item}`),
    ...(report.logsEvidence ? [`Logs: ${report.logsEvidence}`] : []),
  ];
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
    'Preconditions:',
    formatReportValue('preconditions', report.preconditions),
    'Test Data:',
    formatReportValue('testData', report.testData),
    'Steps to Reproduce:',
    formatReportValue('reproductionSteps', report.reproductionSteps),
    `Expected Result: ${formatReportValue('expectedResult', report.expectedResult)}`,
    `Actual Result: ${formatReportValue('actualResult', report.actualResult)}`,
    `Status: ${formatReportValue('status', report.status)}`,
    `Assigned To: ${formatReportValue('assignee', report.assignee)}`,
    `Reported By: ${formatReportValue('reporter', report.reporter)}`,
    `Reported Date: ${formatReportValue('reportedDate', report.reportedDate)}`,
    'Attachment: Screenshot / Video / Logs',
    attachments.length ? attachments.map((item, index) => `${index + 1}. ${item}`).join('\n') : 'Not provided',
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

function buildExportFieldOptions() {
  exportFieldOptions.replaceChildren();
  for (const field of formDefinition) {
    const label = document.createElement('label');
    label.className = 'export-field-option';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = field.name;
    checkbox.checked = true;
    checkbox.addEventListener('change', updateExportSelectedCount);
    const text = document.createElement('span');
    text.textContent = field.label;
    label.append(checkbox, text);
    exportFieldOptions.append(label);
  }
  updateExportSelectedCount();
}

function getSelectedExportFields() {
  const fields = [...exportFieldOptions.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value);
  if (!fields.length) exportStatus.textContent = 'Choose at least one field to export.';
  return fields;
}

function updateExportSelectedCount() {
  const selected = exportFieldOptions.querySelectorAll('input[type="checkbox"]:checked').length;
  exportSelectedCount.textContent = `(${selected} selected)`;
}

async function downloadReportExport(format) {
  if (!currentReport?.reportId) return;
  const fields = getSelectedExportFields();
  if (!fields.length) return;
  exportStatus.textContent = `Preparing ${format.toUpperCase()} export...`;
  try {
    const query = new URLSearchParams({ format, fields: fields.join(',') });
    const response = await fetch(`/api/bug-reports/${encodeURIComponent(currentReport.reportId)}/export?${query}`);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Could not export this report.');
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentReport.reportId}.${format}`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    exportStatus.textContent = `${format.toUpperCase()} export downloaded.`;
  } catch (error) {
    exportStatus.textContent = error.message;
  }
}

function formatExportValue(field, value) {
  if (value === null || value === undefined || value === '') return 'Not provided';
  if (field === 'severity' || field === 'priority') {
    const suggestion = value.suggested ? ' (AI suggested)' : '';
    const reason = value.reason ? ` — ${value.reason}` : '';
    return `${value.value || 'Not provided'}${suggestion}${reason}`;
  }
  if (Array.isArray(value)) return value.map((item) => (item && typeof item === 'object' ? Object.values(item).join(' | ') : item)).join('\n');
  if (field === 'assumptionsAndMissingInformation') {
    return [
      ...(value.assumptions || []).map((item) => `Assumption: ${item}`),
      ...(value.missingInfo || []).map((item) => `Missing information: ${item}`),
    ].join('\n') || 'Not provided';
  }
  if (typeof value === 'object') return Object.entries(value).map(([key, item]) => `${key}: ${item}`).join('\n');
  return String(value);
}

async function printSavedReport() {
  if (!currentReport?.reportId) return;
  const fields = getSelectedExportFields();
  if (!fields.length) return;
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    exportStatus.textContent = 'Allow pop-ups to open the print view, then choose Save as PDF in your browser.';
    return;
  }
  exportStatus.textContent = 'Loading the last saved report for printing...';
  try {
    const response = await fetch(`/api/bug-reports/${encodeURIComponent(currentReport.reportId)}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || 'Could not open the saved report.');
    const report = result.report;
    const printDocument = printWindow.document;
    printDocument.title = `Bug Report ${report.reportId}`;
    const style = printDocument.createElement('style');
    style.textContent = 'body{font:12pt/1.5 Arial,sans-serif;color:#111;background:#fff}.print-report{max-width:800px;margin:0 auto;padding:28px}.print-report h1{font-size:20pt}.print-report dl{display:grid;grid-template-columns:180px 1fr;gap:10px 16px}.print-report dt{font-weight:700;break-after:avoid}.print-report dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}';
    const main = printDocument.createElement('main');
    main.className = 'print-report';
    const heading = printDocument.createElement('h1');
    heading.textContent = `Bug Report ${report.reportId}`;
    const fieldsList = printDocument.createElement('dl');
    for (const field of formDefinition.filter((item) => fields.includes(item.name))) {
      const label = printDocument.createElement('dt');
      label.textContent = field.label;
      const value = printDocument.createElement('dd');
      value.textContent = formatExportValue(field.name, report[field.name]);
      fieldsList.append(label, value);
    }
    main.append(heading, fieldsList);
    printDocument.head.replaceChildren(style);
    printDocument.body.replaceChildren(main);
    exportStatus.textContent = 'Choose Print, then select Save as PDF in your browser.';
    setTimeout(() => { printWindow.focus(); printWindow.print(); }, 250);
  } catch (error) {
    printWindow.close();
    exportStatus.textContent = error.message;
  }
}

function renderQaSuggestions(suggestions) {
  currentQaSuggestions = Object.fromEntries(QA_CATEGORIES.map(([key]) => [key, [...suggestions[key]]]));
  qaSuggestionsEditor.replaceChildren();
  for (const [key, labelText] of QA_CATEGORIES) {
    const label = document.createElement('label');
    label.className = 'qa-suggestion-field';
    const title = document.createElement('span');
    title.textContent = labelText;
    const badge = document.createElement('span');
    badge.className = 'qa-suggestion-label';
    badge.textContent = 'AI suggestion';
    const textarea = document.createElement('textarea');
    textarea.rows = Math.min(7, Math.max(3, currentQaSuggestions[key].length + 1));
    textarea.value = currentQaSuggestions[key].join('\n');
    textarea.setAttribute('aria-label', `${labelText}, AI suggestions`);
    textarea.addEventListener('input', () => {
      currentQaSuggestions[key] = textarea.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
      copyQaButton.disabled = false;
      applyQaButton.disabled = false;
    });
    label.append(title, badge, textarea);
    qaSuggestionsEditor.append(label);
  }
  copyQaButton.disabled = false;
  applyQaButton.disabled = false;
}

async function generateQaSuggestions() {
  if (!currentReport?.reportId) return;
  generateQaButton.disabled = true;
  qaStatus.textContent = 'Generating suggestions for the last saved report...';
  try {
    const response = await fetch(`/api/bug-reports/${encodeURIComponent(currentReport.reportId)}/qa-suggestions`, { method: 'POST' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || 'Could not generate QA suggestions.');
    renderQaSuggestions(result.suggestions);
    qaStatus.textContent = 'Suggestions are editable and have not been saved to the report.';
  } catch (error) {
    qaStatus.textContent = error.message;
  } finally {
    generateQaButton.disabled = false;
  }
}

async function copyQaSuggestions() {
  if (!currentQaSuggestions) return;
  const copyText = QA_CATEGORIES.map(([key, label]) => `${label} (AI suggestion):\n${currentQaSuggestions[key].join('\n')}`).join('\n\n');
  try {
    await navigator.clipboard.writeText(copyText);
    qaStatus.textContent = 'Suggestions copied to the clipboard.';
  } catch (_error) {
    qaStatus.textContent = 'Clipboard access is unavailable in this browser. Select and copy the editable suggestions.';
  }
}

function applyQaSuggestions() {
  if (!currentReport || !currentQaSuggestions) return;
  const items = QA_CATEGORIES.flatMap(([key, label]) => currentQaSuggestions[key].map((item) => `${label}: ${item}`));
  currentReport.suggestedTestsRegressionCoverage = [...new Set([...(currentReport.suggestedTestsRegressionCoverage || []), ...items])];
  const control = reportFieldGrid.querySelector('[data-report-field="suggestedTestsRegressionCoverage"]');
  if (control) control.value = currentReport.suggestedTestsRegressionCoverage.join('\n');
  onFieldEdited('suggestedTestsRegressionCoverage');
  qaStatus.textContent = 'Added as AI suggestions. Choose Save changes to store them.';
}

function appendCell(row, value) {
  const cell = document.createElement('td');
  cell.textContent = value || '—';
  row.append(cell);
  return cell;
}

async function openSavedReport(id) {
  bugListStatus.textContent = `Opening ${id}...`;
  try {
    const response = await fetch(`/api/bug-reports/${encodeURIComponent(id)}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || 'Could not open this report.');
    const sourceText = (result.report.confirmedFacts || []).join(' ');
    if (!formDefinition.length) await loadFormDefinition();
    renderReportForm({ report: result.report, clarifyingQuestions: [] }, sourceText);
    reportStatus.textContent = 'Saved report loaded. Edit a field and choose Save changes when ready.';
    bugListStatus.textContent = `Opened ${id}.`;
  } catch (error) {
    bugListStatus.textContent = error.message;
  }
}

function requestDeleteReport(report) {
  pendingDeleteId = report.reportId;
  document.querySelector('#delete-dialog-title').textContent = `Delete ${report.reportId}?`;
  document.querySelector('#delete-confirmation-message').textContent = `Delete “${report.bugTitle || 'Untitled report'}” from the local database? This cannot be undone.`;
  if (typeof deleteConfirmation.showModal === 'function') deleteConfirmation.showModal();
  else if (window.confirm(`Delete ${report.reportId} from the local database?`)) deleteSavedReport();
}

async function deleteSavedReport() {
  if (!pendingDeleteId) return;
  const id = pendingDeleteId;
  pendingDeleteId = '';
  confirmDeleteButton.disabled = true;
  try {
    const response = await fetch(`/api/bug-reports/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || 'Could not delete this report.');
    if (currentReport?.reportId === id) {
      currentReport = null;
      reportEditor.hidden = true;
    }
    bugListStatus.textContent = `Deleted ${id}.`;
    await loadReports();
  } catch (error) {
    bugListStatus.textContent = error.message;
  } finally {
    confirmDeleteButton.disabled = false;
  }
}

function renderReportRows(reports) {
  bugReportTableBody.replaceChildren();
  const previousExportId = exportCenterReport.value;
  exportCenterReport.replaceChildren();
  const chooseOption = document.createElement('option');
  chooseOption.value = '';
  chooseOption.textContent = reports.length ? 'Choose a report from these results' : 'No saved reports in these results';
  exportCenterReport.append(chooseOption);
  for (const report of reports) {
    const option = document.createElement('option');
    option.value = report.reportId;
    option.textContent = `${report.reportId} — ${report.bugTitle || 'Untitled report'}`;
    exportCenterReport.append(option);
  }
  if (reports.some((report) => report.reportId === previousExportId)) exportCenterReport.value = previousExportId;
  else if (reports.length === 1) exportCenterReport.value = reports[0].reportId;
  openExportCenterButton.disabled = !exportCenterReport.value;
  if (!reports.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 6;
    cell.className = 'empty-table-cell';
    cell.textContent = 'No reports match these filters.';
    row.append(cell);
    bugReportTableBody.append(row);
    return;
  }
  for (const report of reports) {
    const row = document.createElement('tr');
    appendCell(row, report.reportId);
    appendCell(row, report.bugTitle);
    appendCell(row, report.status);
    appendCell(row, report.severity?.value);
    appendCell(row, displayDate(report.timestamps?.updatedAt));
    const actions = document.createElement('td');
    actions.className = 'report-row-actions';
    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.className = 'table-action';
    openButton.textContent = 'Open / edit';
    openButton.setAttribute('aria-label', `Open and edit ${report.reportId}`);
    openButton.addEventListener('click', () => openSavedReport(report.reportId));
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'table-action danger-link';
    deleteButton.textContent = 'Delete';
    deleteButton.setAttribute('aria-label', `Delete ${report.reportId}`);
    deleteButton.addEventListener('click', () => requestDeleteReport(report));
    actions.append(openButton, deleteButton);
    row.append(actions);
    bugReportTableBody.append(row);
  }
}

async function loadReports({ resetPage = false } = {}) {
  if (resetPage) currentListPage = 1;
  bugListStatus.textContent = 'Loading saved reports...';
  const query = new URLSearchParams({
    search: reportSearch.value.trim(),
    status: statusFilter.value,
    severity: severityFilter.value,
    page: String(currentListPage),
    pageSize: '20',
  });
  try {
    const response = await fetch(`/api/bug-reports?${query}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || 'Could not load saved reports.');
    totalListPages = Math.max(1, Math.ceil(result.total / result.pageSize));
    if (result.page > totalListPages) {
      currentListPage = totalListPages;
      return loadReports();
    }
    currentListPage = result.page;
    renderReportRows(result.reports);
    pageIndicator.textContent = `Page ${currentListPage} of ${totalListPages}`;
    previousPageButton.disabled = currentListPage <= 1;
    nextPageButton.disabled = currentListPage >= totalListPages;
    bugListStatus.textContent = `${result.total} saved report${result.total === 1 ? '' : 's'}.`;
    loadAnalytics();
  } catch (error) {
    bugReportTableBody.replaceChildren();
    bugListStatus.textContent = error.message;
  }
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

async function loadFormDefinition() {
  const response = await fetch('/api/bug-reports/schema');
  if (!response.ok) throw new Error('Could not load the report form schema.');
  const result = await response.json();
  formDefinition = result.fields;
  buildExportFieldOptions();
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
      attachmentIds: selectedAttachment ? [selectedAttachment.id] : [],
      screenshotFindings: acceptedScreenshotFindings,
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
    qaExportPanel.hidden = false;
    copyReportButton.disabled = false;
    updateFormattedReportPreview();
    reportStatus.textContent = `${isEdit ? 'Updated' : 'Saved'} ${result.report.reportId}.`;
    statusTitle.textContent = isEdit ? 'Report updated' : 'Report saved';
    statusMessage.textContent = 'Your confirmed report is stored locally.';
    saveButton.textContent = 'Saved';
    saveButton.disabled = true;
    reportFieldGrid.replaceChildren(...formDefinition.map(createFieldCard));
    await loadReports();
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
  if (selectedAttachment || screenshotObjectUrl || activeUploadRequest) await removeScreenshot();
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
document.querySelector('#export-json-button').addEventListener('click', () => downloadReportExport('json'));
document.querySelector('#export-csv-button').addEventListener('click', () => downloadReportExport('csv'));
document.querySelector('#print-report-button').addEventListener('click', printSavedReport);
generateQaButton.addEventListener('click', generateQaSuggestions);
copyQaButton.addEventListener('click', copyQaSuggestions);
applyQaButton.addEventListener('click', applyQaSuggestions);

document.querySelector('#search-reports-button').addEventListener('click', () => loadReports({ resetPage: true }));
document.querySelector('#refresh-reports-button').addEventListener('click', () => loadReports());
exportCenterReport.addEventListener('change', () => { openExportCenterButton.disabled = !exportCenterReport.value; });
openExportCenterButton.addEventListener('click', () => {
  if (!exportCenterReport.value) {
    exportCenterStatus.textContent = 'Choose a saved report from the current results.';
    return;
  }
  openSavedReport(exportCenterReport.value);
});
reportSearch.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    loadReports({ resetPage: true });
  }
});
statusFilter.addEventListener('change', () => loadReports({ resetPage: true }));
severityFilter.addEventListener('change', () => loadReports({ resetPage: true }));
previousPageButton.addEventListener('click', () => {
  if (currentListPage > 1) {
    currentListPage -= 1;
    loadReports();
  }
});
nextPageButton.addEventListener('click', () => {
  if (currentListPage < totalListPages) {
    currentListPage += 1;
    loadReports();
  }
});
confirmDeleteButton.addEventListener('click', (event) => {
  event.preventDefault();
  deleteConfirmation.close();
  deleteSavedReport();
});

researchButton.addEventListener('click', researchTechnicalQuestion);
screenshotInput.addEventListener('change', () => {
  const [file] = screenshotInput.files || [];
  if (file) chooseScreenshot(file);
  screenshotInput.value = '';
});
imageDropZone.addEventListener('dragover', (event) => {
  event.preventDefault();
  imageDropZone.classList.add('dragging');
});
imageDropZone.addEventListener('dragleave', () => imageDropZone.classList.remove('dragging'));
imageDropZone.addEventListener('drop', (event) => {
  event.preventDefault();
  imageDropZone.classList.remove('dragging');
  const [file] = event.dataTransfer.files || [];
  if (file) chooseScreenshot(file);
});
removeScreenshotButton.addEventListener('click', removeScreenshot);
analyzeScreenshotButton.addEventListener('click', analyzeScreenshot);

loadReports();
loadPublicConfig();
apiStatusRefresh.addEventListener('click', checkGeminiStatus);
checkGeminiStatus();
