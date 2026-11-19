const test = require('node:test');
const assert = require('node:assert/strict');
const { createEmptyReport } = require('../../backend/schemas/bug-report.schema');
const { createQaIntelligenceService, makeQaPrompt } = require('../../backend/services/qa-intelligence-service');

const suggestions = {
  reproductionSteps: ['Enter the provided inputs.', 'Submit the form.'],
  positiveScenarios: ['Confirm the form accepts valid inputs.'],
  negativeScenarios: ['Confirm an invalid input shows validation.'],
  boundaryScenarios: ['Check the minimum accepted input.'],
  regressionCases: ['Confirm the related flow still works.'],
};

test('QA intelligence validates and labels all generated output as suggestions', async () => {
  let request;
  const service = createQaIntelligenceService({ generate: async (input) => {
    request = input;
    return JSON.stringify(suggestions);
  } });
  const result = await service.generateSuggestions({ ...createEmptyReport(), bugTitle: 'Login is blocked' });
  assert.deepEqual(result, { suggestions, label: 'AI suggestion' });
  assert.match(request.input, /BUG_REPORT_JSON/);
  assert.match(request.input, /untrusted data/);
});

test('QA intelligence visibly rejects malformed structured output', async () => {
  const service = createQaIntelligenceService({ generate: async () => '{broken' });
  await assert.rejects(
    () => service.generateSuggestions(createEmptyReport()),
    (error) => error.status === 502 && error.code === 'MALFORMED_AI_RESPONSE',
  );
});
