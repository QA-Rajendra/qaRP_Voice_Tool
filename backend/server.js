const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const { parseConfig } = require('./config/env');
const { getDatabase } = require('./db/connection');
const { migrate } = require('./db/migrations');
const { createRateLimiter } = require('./middleware/rate-limit');
const { errorHandler } = require('./middleware/error-handler');
const { createBugReportsRouter } = require('./routes/bug-reports');
const { createAttachmentsRouter } = require('./routes/attachments');
const { createClarificationRouter } = require('./routes/clarification');
const { createResearchRouter } = require('./routes/research');
const { createVoiceRouter } = require('./routes/voice');
const { checkGeminiConnection, verifyAndUseGeminiApiKey } = require('./services/gemini-client');
const { createAiProviderService } = require('./services/ai-provider-service');

function createApp({ clarificationService, generationService, repository, researchService, screenshotAnalysisService, qaSuggestionsService, voiceChatService, aiProviderService } = {}) {
  const { maxUploadMb, aiProvider, geminiModel, openRouterModel } = parseConfig();
  const providerService = aiProviderService || createAiProviderService();
  const app = express();
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        connectSrc: ["'self'"],
      },
    },
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', createRateLimiter({ max: 120 }));
  app.use(express.static(path.join(__dirname, '..', 'frontend')));
  app.get('/api/health', (_request, response) => response.json({ status: 'ok' }));
  app.get('/api/config', (_request, response) => response.json({
    maxUploadMb,
    aiProvider,
    aiModel: aiProvider === 'openrouter' ? openRouterModel : geminiModel,
    geminiModel,
  }));
  app.post('/api/ai/status',
    createRateLimiter({ max: 6, message: 'Please wait before checking the AI provider again.' }),
    async (_request, response, next) => {
      try {
        response.json(await providerService.checkConnection());
      } catch (error) {
        next(error);
      }
    },
  );
  app.post('/api/ai/key',
    createRateLimiter({ max: 6, message: 'Please wait before checking another AI provider key.' }),
    async (request, response) => {
      const apiKey = request.body?.apiKey;
      if (typeof apiKey !== 'string' || !apiKey.trim() || apiKey.length > 500) {
        response.status(400).json({ connected: false, message: 'Enter a valid API key for the configured AI provider.' });
        return;
      }
      const result = await providerService.verifyAndUseApiKey(apiKey);
      const providerName = aiProvider === 'openrouter' ? 'OpenRouter' : 'Gemini';
      response.json({
        ...result,
        message: result.connected ? `${providerName} key verified for this session.` : `${providerName} key could not connect. Check the key and network.`,
      });
    },
  );
  app.post('/api/gemini/status', createRateLimiter({ max: 6, message: 'Please wait before checking Gemini again.' }), async (_request, response, next) => {
    try {
      response.json(await checkGeminiConnection());
    } catch (error) {
      if (error.code === 'INVALID_CONFIGURATION') {
        response.json({ connected: false, configured: false });
        return;
      }
      next(error);
    }
  });
  app.post('/api/gemini/key', createRateLimiter({ max: 6, message: 'Please wait before checking another API key.' }), async (request, response) => {
    const apiKey = request.body?.apiKey;
    if (typeof apiKey !== 'string' || !apiKey.trim() || apiKey.length > 500) {
      response.status(400).json({ connected: false, message: 'Enter a valid Gemini API key.' });
      return;
    }
    const result = await verifyAndUseGeminiApiKey(apiKey);
    response.json({ ...result, message: result.connected ? 'Key verified and active for this session.' : 'Key could not connect. Check the key, model access, and network.' });
  });
  app.use('/api/bug-reports', createBugReportsRouter({ generationService, repository, qaSuggestionsService }));
  app.use('/api/bug-reports', createClarificationRouter(clarificationService));
  app.use('/api/voice', createVoiceRouter({ voiceChatService }));
  app.use('/api/research', createResearchRouter(researchService));
  app.use('/api/attachments', createAttachmentsRouter({ analysisService: screenshotAnalysisService }));
  app.use('/api', (_request, _response, next) => {
    const error = new Error('API endpoint not found.');
    error.status = 404;
    error.code = 'NOT_FOUND';
    next(error);
  });
  app.use(errorHandler);
  return app;
}

async function startServer() {
  let config;
  try {
    config = parseConfig();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return null;
  }

  migrate(await getDatabase());
  const app = createApp();
  return app.listen(config.port, () => {
    console.log(`QARP Voice Tool is available at http://localhost:${config.port}`);
  });
}

if (require.main === module) startServer();

module.exports = { createApp, startServer };
