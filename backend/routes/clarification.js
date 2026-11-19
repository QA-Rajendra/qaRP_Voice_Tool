const express = require('express');
const { validate } = require('../middleware/validate');
const { createRateLimiter } = require('../middleware/rate-limit');
const { ClarificationRequestSchema } = require('../schemas/clarification.schema');
const { createClarificationService } = require('../services/clarification-service');

function createClarificationRouter(service = createClarificationService()) {
  const router = express.Router();
  router.post('/clarify',
    createRateLimiter({ windowMs: 5 * 60_000, max: 10, message: 'Too many clarification requests. Please wait a few minutes.' }),
    validate(ClarificationRequestSchema),
    async (request, response) => response.json(await service.clarify(request.body)),
  );
  return router;
}

module.exports = { createClarificationRouter };
