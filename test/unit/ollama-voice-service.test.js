const test = require('node:test');
const assert = require('node:assert/strict');
const { createOllamaVoiceService } = require('../../backend/services/ollama-voice-service');

const config = {
  ollamaBaseUrl: 'http://127.0.0.1:11434',
  ollamaModel: 'test-model',
};

test('Ollama voice service sends bounded chat context and returns the reply', async () => {
  let requestUrl;
  let requestBody;
  const service = createOllamaVoiceService({
    configProvider: () => config,
    fetchImpl: async (url, options) => {
      requestUrl = url;
      requestBody = JSON.parse(options.body);
      return { ok: true, json: async () => ({ message: { content: '  What browser are you using?  ' } }) };
    },
  });

  const reply = await service.reply({
    message: 'The login button does not respond.',
    context: 'Login fails after valid credentials.',
    history: [{ role: 'assistant', content: 'What happened?' }],
  });

  assert.equal(requestUrl.href, 'http://127.0.0.1:11434/api/chat');
  assert.equal(requestBody.model, 'test-model');
  assert.equal(requestBody.stream, false);
  assert.equal(requestBody.messages.at(-1).content, 'The login button does not respond.');
  assert.deepEqual(requestBody.messages.at(-2), { role: 'assistant', content: 'What happened?' });
  assert.equal(requestBody.messages[1].content, 'Current bug description: Login fails after valid credentials.');
  assert.equal(reply, 'What browser are you using?');
});

test('Ollama voice service reports an uninstalled local model clearly', async () => {
  const service = createOllamaVoiceService({
    configProvider: () => config,
    fetchImpl: async () => ({
      ok: false,
      status: 404,
      json: async () => ({ error: 'model "test-model" not found' }),
    }),
  });

  await assert.rejects(
    service.reply({ message: 'Help me describe this bug.' }),
    (error) => error.status === 503
      && error.code === 'OLLAMA_MODEL_MISSING'
      && error.message.includes('ollama pull test-model'),
  );
});

test('Ollama voice service reports when the local server is unavailable', async () => {
  const service = createOllamaVoiceService({
    configProvider: () => config,
    fetchImpl: async () => { throw new TypeError('fetch failed'); },
  });

  await assert.rejects(
    service.reply({ message: 'Help me describe this bug.' }),
    (error) => error.status === 503
      && error.code === 'OLLAMA_UNAVAILABLE'
      && error.message.includes('Start Ollama'),
  );
});
