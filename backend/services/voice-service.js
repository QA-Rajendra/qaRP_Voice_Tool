const { parseConfig } = require('../config/env');
const { createOllamaVoiceService } = require('./ollama-voice-service');
const { createOpenRouterVoiceService } = require('./openrouter-client');

function createVoiceService({
  configProvider = parseConfig,
  openRouterService = createOpenRouterVoiceService(),
  ollamaService = createOllamaVoiceService({ configProvider }),
} = {}) {
  return {
    reply(input) {
      return configProvider().aiProvider === 'openrouter'
        ? openRouterService.reply(input)
        : ollamaService.reply(input);
    },
  };
}

module.exports = { createVoiceService };
