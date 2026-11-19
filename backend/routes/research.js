const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { createRateLimiter } = require('../middleware/rate-limit');
const { createResearchService } = require('../services/research-service');

const ResearchRequestSchema = z.object({ query: z.string().trim().min(1).max(1200) }).strict();

function createResearchRouter(service = createResearchService()) {
  const router = express.Router();
  router.post('/',
    createRateLimiter({ windowMs: 5 * 60_000, max: 5, message: 'Too many research requests. Please wait a few minutes.' }),
    validate(ResearchRequestSchema),
    async (request, response) => response.json(await service.research(request.body.query)),
  );
  return router;
}

module.exports = { createResearchRouter, ResearchRequestSchema };
