const { z } = require('zod');

const ClarificationRequestSchema = z.object({
  description: z.string().trim().min(1).max(5000),
  messages: z.array(z.object({
    role: z.enum(['assistant', 'user']),
    content: z.string().trim().min(1).max(1500),
  }).strict()).max(12).default([]),
}).strict();

const ClarificationResponseSchema = z.object({
  cleanDescription: z.string(),
  readyToGenerate: z.boolean(),
  clarifyingQuestions: z.array(z.string()).max(3),
}).strict();

module.exports = { ClarificationRequestSchema, ClarificationResponseSchema };
