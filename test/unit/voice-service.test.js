const test = require('node:test');
const assert = require('node:assert/strict');
const { createVoiceService } = require('../../backend/services/voice-service');

test('voice service routes replies through the configured OpenRouter provider', async () => {
  const calls = [];
  const service = createVoiceService({
    configProvider: () => ({ aiProvider: 'openrouter' }),
    openRouterService: { reply: async (input) => { calls.push(input); return 'Describe what you expected.'; } },
    ollamaService: { reply: async () => { throw new Error('Ollama should not be called.'); } },
  });

  const reply = await service.reply({ message: 'The button does nothing.' });
  assert.equal(reply, 'Describe what you expected.');
  assert.deepEqual(calls, [{ message: 'The button does nothing.' }]);
});

test('voice service retains local Ollama when the OpenRouter provider is not selected', async () => {
  let called = false;
  const service = createVoiceService({
    configProvider: () => ({ aiProvider: 'gemini' }),
    openRouterService: { reply: async () => { throw new Error('OpenRouter should not be called.'); } },
    ollamaService: { reply: async () => { called = true; return 'Local reply.'; } },
  });

  assert.equal(await service.reply({ message: 'Hello.' }), 'Local reply.');
  assert.equal(called, true);
});
