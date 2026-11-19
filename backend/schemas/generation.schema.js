const { z } = require('zod');
const { BugReportSchema } = require('./bug-report.schema');

const ClarificationAnswerSchema = z.object({ question: z.string().max(1000), answer: z.string().max(1500) }).strict();

const EnglishDescriptionRequestSchema = z.object({
  description: z.string().trim().min(1).max(5000),
  language: z.enum(['auto', 'mr', 'en']).default('auto'),
  clarifications: z.array(ClarificationAnswerSchema).max(8).default([]),
}).strict();

const EnglishDescriptionResponseSchema = z.object({
  englishDescription: z.string().trim().min(1).max(8000),
}).strict();

const GenerateRequestSchema = z.object({
  englishDescription: z.string().trim().min(1).max(8000),
  englishDescriptionReviewed: z.literal(true),
  attachmentIds: z.array(z.string().min(1).max(100)).max(10).default([]),
}).strict();

const GenerationModelResponseSchema = z.object({
  report: BugReportSchema,
}).strict();

module.exports = {
  EnglishDescriptionRequestSchema,
  EnglishDescriptionResponseSchema,
  GenerateRequestSchema,
  GenerationModelResponseSchema,
};
