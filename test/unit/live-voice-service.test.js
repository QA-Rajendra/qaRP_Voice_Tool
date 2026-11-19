const test = require('node:test');
const assert = require('node:assert/strict');
const { createLiveVoiceService, LIVE_SYSTEM_INSTRUCTION } = require('../../backend/services/live-voice-service');

test('live voice provisions one short-lived token constrained to the configured QA assistant', async () => {
  let sdkOptions;
  let tokenParams;
  const service = createLiveVoiceService({
    configProvider: () => ({ geminiApiKey: 'server-only-test-key', geminiLiveModel: 'test-live-model' }),
    now: () => Date.parse('2030-01-01T00:00:00.000Z'),
    clientFactory: async (options) => {
      sdkOptions = options;
      return { authTokens: { create: async (params) => {
        tokenParams = params;
        return { name: 'auth_tokens/short-lived-test-token' };
      } } };
    },
  });

  const result = await service.createSession();
  assert.deepEqual(sdkOptions, { apiKey: 'server-only-test-key', apiVersion: 'v1beta' });
  assert.equal(tokenParams.config.uses, 1);
  assert.equal(tokenParams.config.expireTime, '2030-01-01T00:15:00.000Z');
  assert.equal(tokenParams.config.newSessionExpireTime, '2030-01-01T00:01:00.000Z');
  assert.equal(tokenParams.config.liveConnectConstraints.model, 'test-live-model');
  assert.deepEqual(tokenParams.config.liveConnectConstraints.config.responseModalities, ['AUDIO']);
  assert.deepEqual(tokenParams.config.liveConnectConstraints.config.inputAudioTranscription, {});
  assert.deepEqual(tokenParams.config.liveConnectConstraints.config.outputAudioTranscription, {});
  assert.match(tokenParams.config.liveConnectConstraints.config.systemInstruction.parts[0].text, /Marathi/);
  assert.ok(tokenParams.config.lockAdditionalFields.includes('systemInstruction'));
  assert.deepEqual(result, {
    token: 'auth_tokens/short-lived-test-token',
    model: 'test-live-model',
    expiresAt: '2030-01-01T00:15:00.000Z',
  });
  assert.equal(JSON.stringify(result).includes('server-only-test-key'), false);
  assert.equal(LIVE_SYSTEM_INSTRUCTION.includes('Do not invent'), true);
});

test('live voice maps provider token failures to a safe response', async () => {
  const service = createLiveVoiceService({
    configProvider: () => ({ geminiApiKey: 'server-only-test-key', geminiLiveModel: 'test-live-model' }),
    clientFactory: async () => ({ authTokens: { create: async () => { throw new Error('provider detail'); } } }),
  });
  await assert.rejects(service.createSession(), (error) => error.code === 'LIVE_TOKEN_UNAVAILABLE'
    && error.status === 502
    && !error.message.includes('provider detail'));
});
