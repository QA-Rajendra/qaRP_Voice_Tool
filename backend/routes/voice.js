const express = require('express');
const { z } = require('zod');
const { createRateLimiter } = require('../middleware/rate-limit');
const { validate } = require('../middleware/validate');
const { createVoiceService } = require('../services/voice-service');

const VoiceChatRequestSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  context: z.string().trim().max(8000).default(''),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().trim().min(1).max(2000),
  }).strict()).max(12).default([]),
}).strict();

function createVoiceRouter({ voiceChatService = createVoiceService() } = {}) {
  const router = express.Router();
  router.post(
    '/chat',
    createRateLimiter({ windowMs: 60_000, max: 30, message: 'Too many voice messages. Wait a minute and try again.' }),
    validate(VoiceChatRequestSchema),
    async (request, response) => {
      const reply = await voiceChatService.reply(request.body);
      response.json({ reply });
    },
  );
  return router;
}

module.exports = { createVoiceRouter, VoiceChatRequestSchema };
