const { z } = require('zod');
const { BugReportSchema } = require('./bug-report.schema');

const ClarificationAnswerSchema = z.object({ question: z.string().max(1000), answer: z.string().max(1500) }).strict();

const GenerateRequestSchema = z.object({
  description: z.string().trim().min(1).max(5000),
  language: z.enum(['auto', 'mr', 'en']).default('auto'),
  clarifications: z.array(ClarificationAnswerSchema).max(8).default([]),
  researchContext: z.string().max(5000).default(''),
  attachmentIds: z.array(z.string().min(1).max(100)).max(10).default([]),
  screenshotFindings: z.array(z.string().min(1).max(500)).max(20).default([]),
}).strict();

const GenerationModelResponseSchema = z.object({
  report: BugReportSchema,
  confirmedFacts: z.array(z.string()),
  assumptions: z.array(z.string()),
  missingInfo: z.array(z.string()),
  clarifyingQuestions: z.array(z.string()).max(3),
}).strict();

module.exports = { GenerateRequestSchema, GenerationModelResponseSchema };
