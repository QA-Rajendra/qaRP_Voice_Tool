const { parseConfig } = require('../config/env');
const { checkGeminiConnection, verifyAndUseGeminiApiKey } = require('./gemini-client');
const { checkOpenRouterConnection, verifyAndUseOpenRouterApiKey } = require('./openrouter-client');

function createAiProviderService({ configProvider = parseConfig } = {}) {
  return {
    async checkConnection() {
      const { aiProvider, geminiModel, openRouterModel } = configProvider();
      const connection = aiProvider === 'openrouter'
        ? await checkOpenRouterConnection()
        : await checkGeminiConnection();
      return {
        provider: aiProvider,
        model: aiProvider === 'openrouter' ? openRouterModel : geminiModel,
        ...connection,
      };
    },

    verifyAndUseApiKey(apiKey) {
      return configProvider().aiProvider === 'openrouter'
        ? verifyAndUseOpenRouterApiKey(apiKey)
        : verifyAndUseGeminiApiKey(apiKey);
    },
  };
}

module.exports = { createAiProviderService };
