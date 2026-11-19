const { z } = require('zod');

const ScreenshotFindingSchema = z.object({
  category: z.enum(['Visible error', 'Misalignment', 'Truncated text', 'Broken layout', 'Visible console message', 'Other']),
  observation: z.string().min(1).max(500),
  visibleEvidence: z.string().min(1).max(300),
}).strict();

const ScreenshotAnalysisSchema = z.object({
  findings: z.array(ScreenshotFindingSchema).max(20),
}).strict();

module.exports = { ScreenshotFindingSchema, ScreenshotAnalysisSchema };
