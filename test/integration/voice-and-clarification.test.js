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

test('voice chat validates requests and returns an injected local assistant reply', async () => {
  let voiceRequest;
  const app = createApp({
    voiceChatService: {
      reply: async (request) => {
        voiceRequest = request;
        return 'Please include the browser and device.';
      },
    },
  });
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/voice/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'The login button does nothing.',
        context: 'Login fails after valid credentials.',
        history: [{ role: 'assistant', content: 'What happened?' }],
      }),
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.reply, 'Please include the browser and device.');
    assert.deepEqual(voiceRequest, {
      message: 'The login button does nothing.',
      context: 'Login fails after valid credentials.',
      history: [{ role: 'assistant', content: 'What happened?' }],
    });

    const invalid = await fetch(`${baseUrl}/api/voice/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '   ', unexpected: true }),
    });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error.code, 'VALIDATION_ERROR');

    const removedLiveEndpoint = await fetch(`${baseUrl}/api/voice/session`, { method: 'POST' });
    assert.equal(removedLiveEndpoint.status, 404);
  });
});
