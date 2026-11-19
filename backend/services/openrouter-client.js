const { parseConfig } = require('../config/env');

const API_BASE_URL = 'https://openrouter.ai/api/v1';
const VOICE_SYSTEM_PROMPT = [
  'You are a concise, friendly QA assistant for a bug-reporting app.',
  'Understand and reply in Marathi, English, or the language the user speaks.',
  'Help the user describe one software issue. Ask at most one useful follow-up question.',
  'Do not invent observed behavior, claim a root cause, or write a complete report.',
].join(' ');

function providerError(message, status, code, cause) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function toOpenRouterMessages(input) {
  if (typeof input === 'string') return [{ role: 'user', content: input }];
  if (!Array.isArray(input)) {
    throw providerError('The AI request input is invalid.', 400, 'INVALID_AI_INPUT');
  }

  const content = input.map((item) => {
    if (item.type === 'text' && typeof item.text === 'string') {
      return { type: 'text', text: item.text };
    }
    if (item.type === 'image' && typeof item.data === 'string' && typeof item.mime_type === 'string') {
      return {
        type: 'image_url',
        image_url: { url: `data:${item.mime_type};base64,${item.data}` },
      };
    }
    throw providerError('The AI request contains an unsupported content item.', 400, 'INVALID_AI_INPUT');
  });
  return [{ role: 'user', content }];
}

function createOpenRouterClient({
  configProvider = parseConfig,
  fetchImpl = globalThis.fetch,
} = {}) {
  async function complete({ messages, model, schema }) {
    const config = configProvider();
    const apiKey = config.openRouterApiKey;
    const selectedModel = model || config.openRouterModel;
    if (!apiKey) {
      throw providerError('Add an OpenRouter API key to use the free AI provider.', 503, 'OPENROUTER_KEY_MISSING');
    }
    if (!selectedModel.endsWith(':free')) {
      throw providerError('Only OpenRouter :free models are allowed by this app configuration.', 400, 'PAID_MODEL_BLOCKED');
    }

    const body = {
      model: selectedModel,
      messages,
      temperature: 0.2,
      max_tokens: 4096,
    };
    if (schema) {
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: 'qa_assistant_response',
          strict: true,
          schema,
        },
      };
    }

    let response;
    try {
      response = await fetchImpl(`${API_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost',
          'X-Title': 'QARP Voice Tool',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120000),
      });
    } catch (cause) {
      if (cause.name === 'TimeoutError' || cause.name === 'AbortError') {
        throw providerError('The free AI provider took too long to respond. Please try again later.', 504, 'OPENROUTER_TIMEOUT', cause);
      }
      if (cause instanceof TypeError) {
        throw providerError('OpenRouter is unavailable. Check your internet connection and try again.', 503, 'OPENROUTER_UNAVAILABLE', cause);
      }
      throw cause;
    }

    let result;
    try {
      result = await response.json();
    } catch (cause) {
      if (!(cause instanceof SyntaxError)) throw cause;
      throw providerError('OpenRouter returned an invalid response.', 502, 'OPENROUTER_INVALID_RESPONSE', cause);
    }

    if (!response.ok) {
      const providerMessage = typeof result?.error?.message === 'string' ? result.error.message : '';
      if (response.status === 401) {
        throw providerError('The OpenRouter API key is invalid. Check it and try again.', 401, 'OPENROUTER_INVALID_KEY');
      }
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        const message = retryAfter
          ? `OpenRouter free-model limit reached. Try again in ${retryAfter} seconds.`
          : 'OpenRouter free-model limit reached. Wait for the daily reset or check your OpenRouter limits.';
        throw providerError(message, 429, 'OPENROUTER_RATE_LIMITED');
      }
      if (response.status === 402) {
        throw providerError('OpenRouter rejected the request for account credits. Confirm the selected model ends in :free and check your account balance.', 402, 'OPENROUTER_CREDITS_REQUIRED');
      }
      if (response.status === 404) {
        throw providerError('The configured OpenRouter free model is unavailable. Choose another current :free model.', 503, 'OPENROUTER_MODEL_UNAVAILABLE');
      }
      throw providerError(
        providerMessage ? `OpenRouter request failed: ${providerMessage}` : `OpenRouter request failed (HTTP ${response.status}).`,
        502,
        'OPENROUTER_REQUEST_FAILED',
      );
    }

    const content = result?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw providerError('OpenRouter returned an empty response.', 502, 'OPENROUTER_EMPTY_RESPONSE');
    }
    return content.trim();
  }

  return {
    requestStructuredJson({ input, schema, model }) {
      return complete({ messages: toOpenRouterMessages(input), schema, model });
    },

    async reply({ message, context = '', history = [] }) {
      const messages = [{ role: 'system', content: VOICE_SYSTEM_PROMPT }];
      if (context) messages.push({ role: 'system', content: `Current bug description: ${context}` });
      messages.push(...history, { role: 'user', content: message });
      return complete({ messages });
    },

    async checkConnection(apiKey = configProvider().openRouterApiKey) {
      if (!apiKey) return { connected: false, configured: false };
      try {
        const response = await fetchImpl(`${API_BASE_URL}/key`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(10000),
        });
        return { connected: response.ok, configured: true };
      } catch (_error) {
        return { connected: false, configured: true };
      }
    },

    async verifyApiKey(apiKey) {
      const cleanKey = typeof apiKey === 'string' ? apiKey.trim() : '';
      if (!cleanKey || cleanKey.length > 500) return { connected: false };
      const result = await this.checkConnection(cleanKey);
      if (result.connected) process.env.OPENROUTER_API_KEY = cleanKey;
      return { connected: result.connected };
    },
  };
}

const defaultClient = createOpenRouterClient();

module.exports = {
  API_BASE_URL,
  VOICE_SYSTEM_PROMPT,
  createOpenRouterClient,
  toOpenRouterMessages,
  requestOpenRouterStructuredJson: (request) => defaultClient.requestStructuredJson(request),
  createOpenRouterVoiceService: () => ({ reply: (input) => defaultClient.reply(input) }),
  checkOpenRouterConnection: () => defaultClient.checkConnection(),
  verifyAndUseOpenRouterApiKey: (apiKey) => defaultClient.verifyApiKey(apiKey),
};
