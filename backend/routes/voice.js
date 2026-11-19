const express = require('express');
const { createLiveVoiceService } = require('../services/live-voice-service');
const { createRateLimiter } = require('../middleware/rate-limit');

function createVoiceRouter({ liveVoiceService = createLiveVoiceService() } = {}) {
  const router = express.Router();
  router.post('/session', createRateLimiter({ max: 6, message: 'Too many voice sessions requested. Wait a minute and try again.' }));
  router.post('/session', async (_request, response) => response.json(await liveVoiceService.createSession()));
  return router;
}

module.exports = { createVoiceRouter };
