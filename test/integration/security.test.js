const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../../backend/server');
const { createMemoryDatabase } = require('../../backend/db/connection');
const { createRepository } = require('../../backend/db/bug-report-repository');

async function withServer(app, run) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

test('security checks keep credentials server-side, reject oversized JSON, and avoid permissive CORS', async () => {
  const database = await createMemoryDatabase();
  const app = createApp({
    repository: createRepository(database),
    generationService: { generateReport: async () => ({}) },
    clarificationService: { clarify: async () => ({}) },
    researchService: { research: async () => ({}) },
    screenshotAnalysisService: { analyze: async () => ({}) },
    qaSuggestionsService: { generateSuggestions: async () => ({}) },
    voiceChatService: { reply: async () => 'Please describe what you expected to happen.' },
  });

  await withServer(app, async (baseUrl) => {
    for (const pathname of ['/', '/app.js', '/style.css']) {
      const response = await fetch(`${baseUrl}${pathname}`);
      const content = await response.text();
      assert.equal(response.status, 200);
      assert.doesNotMatch(content, /GEMINI_API_KEY/);
      if (process.env.GEMINI_API_KEY) assert.ok(!content.includes(process.env.GEMINI_API_KEY), 'Permanent key appeared in a served asset.');
    }

    const voice = await fetch(`${baseUrl}/api/voice/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'The login button does nothing.' }),
    });
    const voiceBody = await voice.text();
    assert.equal(voice.status, 200);
    assert.equal(voice.headers.get('access-control-allow-origin'), null);
    assert.match(voice.headers.get('content-security-policy'), /connect-src 'self'/);
    assert.doesNotMatch(voice.headers.get('content-security-policy'), /wss:\/\/generativelanguage\.googleapis\.com/);
    assert.doesNotMatch(voiceBody, /apiKey|GEMINI_API_KEY/i);
    if (process.env.GEMINI_API_KEY) assert.ok(!voiceBody.includes(process.env.GEMINI_API_KEY), 'Permanent key appeared in an API response.');
    assert.match(voiceBody, /Please describe what you expected/);

    const clientConfig = await fetch(`${baseUrl}/api/config`);
    const publicConfig = await clientConfig.json();
    assert.deepEqual(Object.keys(publicConfig), ['maxUploadMb', 'geminiModel']);
    assert.equal(typeof publicConfig.maxUploadMb, 'number');
    assert.equal(typeof publicConfig.geminiModel, 'string');
    assert.equal(Object.hasOwn(publicConfig, 'ollamaModel'), false);

    const oversizedPayload = JSON.stringify({ query: 'x'.repeat(1024 * 1024) });
    const oversized = await fetch(`${baseUrl}/api/research`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: oversizedPayload,
    });
    const error = await oversized.json();
    assert.equal(oversized.status, 413);
    assert.equal(typeof error.error.code, 'string');
    assert.equal(typeof error.error.message, 'string');
  });

  database.close();
});
