const { parseConfig } = require('../config/env');

const VOICE_SYSTEM_PROMPT = [
  'You are a concise, friendly QA assistant for a bug-reporting app.',
  'Understand and reply in Marathi, English, or the language the user speaks.',
  'Help the user describe one software issue. Ask at most one useful follow-up question.',
  'Do not invent observed behavior, claim a root cause, or write a complete report.',
].join(' ');

function serviceError(message, status, code, cause) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function createOllamaVoiceService({
  configProvider = parseConfig,
  fetchImpl = globalThis.fetch,
} = {}) {
  return {
    async reply({ message, context = '', history = [] }) {
      const { ollamaBaseUrl, ollamaModel } = configProvider();
      const messages = [{ role: 'system', content: VOICE_SYSTEM_PROMPT }];
      if (context) {
        messages.push({ role: 'system', content: `Current bug description: ${context}` });
      }
      messages.push(...history, { role: 'user', content: message });

      let response;
      try {
        response = await fetchImpl(new URL('/api/chat', `${ollamaBaseUrl}/`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: ollamaModel,
            messages,
            stream: false,
            options: { temperature: 0.3, num_predict: 256 },
          }),
          signal: AbortSignal.timeout(120000),
        });
      } catch (cause) {
        if (cause.name === 'TimeoutError' || cause.name === 'AbortError') {
          throw serviceError('Ollama took too long to respond. Try again after the model has loaded.', 504, 'OLLAMA_TIMEOUT', cause);
        }
        if (cause instanceof TypeError) {
          throw serviceError('Ollama is unavailable. Start Ollama and try again.', 503, 'OLLAMA_UNAVAILABLE', cause);
        }
        throw cause;
      }

      let result;
      try {
        result = await response.json();
      } catch (cause) {
        if (!(cause instanceof SyntaxError)) throw cause;
        throw serviceError('Ollama returned an invalid response.', 502, 'OLLAMA_INVALID_RESPONSE', cause);
      }

      if (!response.ok) {
        const providerMessage = typeof result?.error === 'string' ? result.error : '';
        if (response.status === 404 && /model.*not found/i.test(providerMessage)) {
          throw serviceError(`Ollama model "${ollamaModel}" is not installed. Run: ollama pull ${ollamaModel}`, 503, 'OLLAMA_MODEL_MISSING');
        }
        throw serviceError(`Ollama request failed (HTTP ${response.status}).`, 502, 'OLLAMA_REQUEST_FAILED');
      }

      const reply = result?.message?.content;
      if (typeof reply !== 'string' || !reply.trim()) {
        throw serviceError('Ollama returned an empty reply.', 502, 'OLLAMA_EMPTY_RESPONSE');
      }
      return reply.trim();
    },
  };
}

module.exports = { createOllamaVoiceService, VOICE_SYSTEM_PROMPT };
