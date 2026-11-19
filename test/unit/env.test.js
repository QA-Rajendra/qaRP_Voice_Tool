const test = require('node:test');
const assert = require('node:assert/strict');
const { parseConfig } = require('../../backend/config/env');

test('environment config accepts valid local settings without exposing key in result errors', () => {
  const config = parseConfig({
    GEMINI_API_KEY: 'test-secret', GEMINI_MODEL: 'test-model', PORT: '4567', MAX_UPLOAD_MB: '5',
  });
  assert.equal(config.port, 4567);
  assert.equal(config.maxUploadMb, 5);
  assert.equal(config.aiProvider, 'gemini');
  assert.equal(config.geminiApiKey, 'test-secret');
  assert.equal(config.openRouterModel, 'nvidia/nemotron-3.5-super-vl:free');
  assert.equal(config.ollamaBaseUrl, 'http://127.0.0.1:11434');
  assert.equal(config.ollamaModel, 'qwen2.5:3b');
});

test('environment config supports OpenRouter without requiring a Gemini key', () => {
  const config = parseConfig({
    AI_PROVIDER: 'openrouter',
    OPENROUTER_API_KEY: 'test-openrouter-key',
  });
  assert.equal(config.aiProvider, 'openrouter');
  assert.equal(config.openRouterApiKey, 'test-openrouter-key');
  assert.equal(config.openRouterModel, 'nvidia/nemotron-3.5-super-vl:free');
  assert.equal(config.geminiApiKey, undefined);
});

test('environment config blocks paid OpenRouter models and unknown providers', () => {
  assert.throws(
    () => parseConfig({ AI_PROVIDER: 'openrouter', OPENROUTER_MODEL: 'openai/gpt-oss-20b' }),
    (error) => error.code === 'INVALID_CONFIGURATION'
      && error.message.includes('OPENROUTER_MODEL must use a :free model variant'),
  );
  assert.throws(
    () => parseConfig({ AI_PROVIDER: 'other' }),
    (error) => error.code === 'INVALID_CONFIGURATION'
      && error.message.includes('AI_PROVIDER must be either gemini or openrouter'),
  );
});

test('environment config accepts a custom Ollama endpoint and model', () => {
  const config = parseConfig({
    GEMINI_API_KEY: 'test-secret',
    GEMINI_MODEL: 'test-model',
    OLLAMA_BASE_URL: 'http://localhost:11435/',
    OLLAMA_MODEL: 'small-qa-model',
  });
  assert.equal(config.ollamaBaseUrl, 'http://localhost:11435');
  assert.equal(config.ollamaModel, 'small-qa-model');
});

test('environment config rejects malformed Ollama endpoints', () => {
  assert.throws(
    () => parseConfig({
      GEMINI_API_KEY: 'test-secret',
      GEMINI_MODEL: 'test-model',
      OLLAMA_BASE_URL: 'file:///tmp/ollama',
    }),
    (error) => error.code === 'INVALID_CONFIGURATION'
      && error.message.includes('OLLAMA_BASE_URL must use HTTP or HTTPS'),
  );
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
