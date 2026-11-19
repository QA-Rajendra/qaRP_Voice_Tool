const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

function parseConfig(env = process.env) {
  const issues = [];
  const port = Number(env.PORT || 3000);
  const maxUploadMb = Number(env.MAX_UPLOAD_MB || 5);
  const geminiLiveModel = env.GEMINI_LIVE_MODEL?.trim() || 'gemini-3.8-live';

  if (!env.GEMINI_API_KEY?.trim()) issues.push('GEMINI_API_KEY is missing. Add it to backend/.env.');
  if (!env.GEMINI_MODEL?.trim()) issues.push('GEMINI_MODEL is missing. Set it in backend/.env.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) issues.push('PORT must be an integer from 1 to 65535.');
  if (!Number.isInteger(maxUploadMb) || maxUploadMb < 1 || maxUploadMb > 20) {
    issues.push('MAX_UPLOAD_MB must be an integer from 1 to 20.');
  }

  if (issues.length) {
    const error = new Error(`Invalid application configuration:\n- ${issues.join('\n- ')}`);
    error.code = 'INVALID_CONFIGURATION';
    throw error;
  }
  return { geminiApiKey: env.GEMINI_API_KEY, geminiModel: env.GEMINI_MODEL, geminiLiveModel, port, maxUploadMb };
}

module.exports = { parseConfig };
