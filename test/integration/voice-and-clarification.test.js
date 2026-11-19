const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../../backend/server');

async function withServer(app, run) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const { port } = server.address();
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

test('clarification endpoint validates input and returns mocked chat response', async () => {
  const app = createApp({ clarificationService: {
    clarify: async () => ({ cleanDescription: 'Login button does not respond.', readyToGenerate: false, clarifyingQuestions: ['Which browser did you use?'] }),
  } });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/bug-reports/clarify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'Login does nothing.' }),
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.clarifyingQuestions[0], 'Which browser did you use?');

    const invalid = await fetch(`${baseUrl}/api/bug-reports/clarify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: '' }),
    });
    const error = await invalid.json();
    assert.equal(invalid.status, 400);
    assert.equal(error.error.code, 'VALIDATION_ERROR');
  });
});

test('Live session endpoint returns a one-use temporary token without exposing the permanent API key', async () => {
  let tokenRequest;
  const liveVoiceService = {
    createSession: async () => {
      tokenRequest = { provisioned: true };
      return { token: 'auth_tokens/temporary-test-token', model: 'test-live-model', expiresAt: '2030-01-01T00:15:00.000Z' };
    },
  };
  const app = createApp({ liveVoiceService });
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/voice/session`, { method: 'POST' });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.token, 'auth_tokens/temporary-test-token');
    assert.equal(body.model, 'test-live-model');
    assert.equal(tokenRequest.provisioned, true);
    assert.equal(Object.hasOwn(body, 'apiKey'), false);
    assert.equal(Object.hasOwn(body, 'geminiApiKey'), false);
  });
});
