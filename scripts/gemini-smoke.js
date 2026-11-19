const { z } = require('zod');
const { requestStructuredJson } = require('../backend/services/gemini-client');

const SmokeResponseSchema = z.object({ reply: z.string().min(1) }).strict();

async function main() {
  const schema = z.toJSONSchema(SmokeResponseSchema);
  const raw = await requestStructuredJson({
    input: 'Return the JSON object {"reply":"OK"}.',
    schema,
  });
  SmokeResponseSchema.parse(JSON.parse(raw));
  console.log('Live Gemini API smoke test passed.');
}

main().catch((error) => {
  const status = error.status || error.statusCode || error.response?.status;
  const code = typeof error.code === 'string' && /^[A-Za-z0-9_.-]{1,40}$/.test(error.code) ? error.code : '';
  const reason = status === 401 || status === 403
    ? 'Check the key and Google project permissions.'
    : (status === 404 ? 'Check whether the configured model is available.'
      : (status === 429 ? 'Check the project quota and billing limits.'
        : 'Check the configured key, model, network, and response format.'));
  const diagnostics = [status ? `HTTP ${status}` : '', code].filter(Boolean).join(', ');
  console.error(`Live Gemini API smoke test failed${diagnostics ? ` (${diagnostics})` : ''}. ${reason}`);
  process.exitCode = 1;
});
