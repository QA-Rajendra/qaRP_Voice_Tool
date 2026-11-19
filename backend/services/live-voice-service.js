const { parseConfig } = require('../config/env');

const LIVE_SYSTEM_INSTRUCTION = [
  'You are a concise, friendly QA bug-report assistant in a live voice conversation.',
  'Understand English, Marathi, or mixed speech. Detect the language automatically and respond in the language the user is speaking.',
  'Help the user explain one software issue. Ask a short follow-up question only when it would clarify the observed behavior.',
  'Do not invent missing details, claim a root cause, or dictate a completed bug report. The user will review the transcript and generate the report separately.',
].join(' ');

function getProviderErrorReason(cause) {
  const providerError = cause?.error;
  if (providerError?.details?.some((detail) => detail?.reason === 'API_KEY_INVALID')) {
    return 'API_KEY_INVALID';
  }

  if (typeof cause?.message !== 'string') return undefined;
  try {
    const parsed = JSON.parse(cause.message);
    return parsed?.error?.details?.find((detail) => typeof detail?.reason === 'string')?.reason;
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

function createLiveVoiceService({
  configProvider = parseConfig,
  now = () => Date.now(),
  clientFactory = async ({ apiKey, apiVersion }) => {
    const { GoogleGenAI } = await import('@google/genai');
    return new GoogleGenAI({ apiKey, httpOptions: { apiVersion } });
  },
} = {}) {
  return {
    async createSession() {
      const config = configProvider();
      const client = await clientFactory({ apiKey: config.geminiApiKey, apiVersion: 'v1beta' });
      const expiresAt = new Date(now() + 15 * 60 * 1000).toISOString();
      const newSessionExpiresAt = new Date(now() + 60 * 1000).toISOString();
      let token;
      try {
        token = await client.authTokens.create({
          config: {
            uses: 1,
            expireTime: expiresAt,
            newSessionExpireTime: newSessionExpiresAt,
            liveConnectConstraints: {
              model: config.geminiLiveModel,
              config: {
                responseModalities: ['AUDIO'],
                inputAudioTranscription: {},
                outputAudioTranscription: {},
                systemInstruction: { parts: [{ text: LIVE_SYSTEM_INSTRUCTION }] },
              },
            },
            lockAdditionalFields: [
              'responseModalities',
              'inputAudioTranscription',
              'outputAudioTranscription',
              'systemInstruction',
            ],
          },
        });
      } catch (cause) {
        const message = getProviderErrorReason(cause) === 'API_KEY_INVALID'
          ? 'The Gemini API key is invalid. Add a valid key and try voice again.'
          : 'Gemini could not create a Live voice session. Check the server key, model access, and network connection.';
        const error = new Error(message);
        error.status = 502;
        error.code = 'LIVE_TOKEN_UNAVAILABLE';
        error.cause = cause;
        throw error;
      }

      if (typeof token?.name !== 'string' || !token.name.startsWith('auth_tokens/')) {
        const error = new Error('Gemini did not return a valid temporary voice token.');
        error.status = 502;
        error.code = 'LIVE_TOKEN_UNAVAILABLE';
        throw error;
      }

      return { token: token.name, model: config.geminiLiveModel, expiresAt };
    },
  };
}

module.exports = { createLiveVoiceService, LIVE_SYSTEM_INSTRUCTION };
