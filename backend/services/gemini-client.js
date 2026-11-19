const { parseConfig } = require('../config/env');

let clientPromise;

async function getClient() {
  if (!clientPromise) {
    const config = parseConfig();
    if (!config.geminiApiKey) {
      const error = new Error('Google-grounded research requires GEMINI_API_KEY in backend/.env.');
      error.status = 503;
      error.code = 'GEMINI_KEY_MISSING';
      throw error;
    }
    clientPromise = import('@google/genai').then(({ GoogleGenAI }) => new GoogleGenAI({ apiKey: config.geminiApiKey }));
  }
  return clientPromise;
}

async function requestStructuredJson({ input, schema, model }) {
  const config = parseConfig();
  if (config.aiProvider === 'openrouter') {
    const { requestOpenRouterStructuredJson } = require('./openrouter-client');
    return requestOpenRouterStructuredJson({ input, schema, model });
  }
  const client = await getClient();
  const response = await client.interactions.create({
    model: model || config.geminiModel,
    input,
    response_format: { type: 'text', mime_type: 'application/json', schema },
  });
  if (typeof response.output_text !== 'string' || !response.output_text.trim()) {
    const error = new Error('Gemini returned no structured text response.');
    error.code = 'EMPTY_AI_RESPONSE';
    throw error;
  }
  return response.output_text;
}

async function checkGeminiConnection() {
  const config = parseConfig();
  if (!config.geminiApiKey) return { connected: false, configured: false };
  try {
    const client = await getClient();
    await client.models.get({ model: config.geminiModel });
    return { connected: true };
  } catch (_error) {
    // Keep provider errors and credentials out of the public API response.
    return { connected: false };
  }
}

async function verifyAndUseGeminiApiKey(apiKey) {
  const cleanKey = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (!cleanKey || cleanKey.length > 500) return { connected: false };

  try {
    const config = parseConfig();
    const { GoogleGenAI } = await import('@google/genai');
    const client = new GoogleGenAI({ apiKey: cleanKey });
    await client.models.get({ model: config.geminiModel });
    // Keep the verified credential only in server memory for this process.
    process.env.GEMINI_API_KEY = cleanKey;
    clientPromise = Promise.resolve(client);
    return { connected: true };
  } catch (_error) {
    return { connected: false };
  }
}

module.exports = { getClient, requestStructuredJson, checkGeminiConnection, verifyAndUseGeminiApiKey };
