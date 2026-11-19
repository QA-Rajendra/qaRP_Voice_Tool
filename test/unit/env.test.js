const test = require('node:test');
const assert = require('node:assert/strict');
const { parseConfig } = require('../../backend/config/env');

test('environment config accepts valid local settings without exposing key in result errors', () => {
  const config = parseConfig({
    GEMINI_API_KEY: 'test-secret', GEMINI_MODEL: 'test-model', PORT: '4567', MAX_UPLOAD_MB: '5',
  });
  assert.equal(config.port, 4567);
  assert.equal(config.maxUploadMb, 5);
  assert.equal(config.geminiApiKey, 'test-secret');
  assert.equal(config.geminiLiveModel, 'gemini-3.8-live');
});

test('environment config fails clearly when required settings are missing or invalid', () => {
  assert.throws(
    () => parseConfig({ GEMINI_API_KEY: '', GEMINI_MODEL: '', PORT: 'bad', MAX_UPLOAD_MB: '30' }),
    (error) => error.code === 'INVALID_CONFIGURATION'
      && error.message.includes('GEMINI_API_KEY')
      && error.message.includes('MAX_UPLOAD_MB')
      && !error.message.includes('test-secret'),
  );
});
