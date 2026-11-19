const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

function parseConfig(env = process.env) {
  const issues = [];
  const port = Number(env.PORT || 3000);
  const maxUploadMb = Number(env.MAX_UPLOAD_MB || 5);
  const ollamaBaseUrl = (env.OLLAMA_BASE_URL?.trim() || 'http://127.0.0.1:11434').replace(/\/+$/, '');
  const ollamaModel = env.OLLAMA_MODEL?.trim() || 'qwen2.5:3b';

  if (!env.GEMINI_API_KEY?.trim()) issues.push('GEMINI_API_KEY is missing. Add it to backend/.env.');
  if (!env.GEMINI_MODEL?.trim()) issues.push('GEMINI_MODEL is missing. Set it in backend/.env.');
  try {
    if (!['http:', 'https:'].includes(new URL(ollamaBaseUrl).protocol)) {
      issues.push('OLLAMA_BASE_URL must use HTTP or HTTPS.');
    }
  } catch {
    issues.push('OLLAMA_BASE_URL must be a valid HTTP or HTTPS URL.');
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) issues.push('PORT must be an integer from 1 to 65535.');
  if (!Number.isInteger(maxUploadMb) || maxUploadMb < 1 || maxUploadMb > 20) {
    issues.push('MAX_UPLOAD_MB must be an integer from 1 to 20.');
  }

  if (issues.length) {
    const error = new Error(`Invalid application configuration:\n- ${issues.join('\n- ')}`);
    error.code = 'INVALID_CONFIGURATION';
    throw error;
  }
  return {
    geminiApiKey: env.GEMINI_API_KEY,
    geminiModel: env.GEMINI_MODEL,
    ollamaBaseUrl,
    ollamaModel,
    port,
    maxUploadMb,
  };
}

module.exports = { parseConfig };
