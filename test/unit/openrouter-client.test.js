const test = require('node:test');
const assert = require('node:assert/strict');
const { createOpenRouterClient, toOpenRouterMessages } = require('../../backend/services/openrouter-client');

const config = {
  openRouterApiKey: 'test-openrouter-key',
  openRouterModel: 'nvidia/nemotron-3.5-super-vl:free',
};

function response({ status = 200, body, headers = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[name.toLowerCase()] || null },
    json: async () => body,
  };
}

test('OpenRouter sends structured requests to an explicitly free model', async () => {
  let requestUrl;
  let requestOptions;
  const client = createOpenRouterClient({
    configProvider: () => config,
    fetchImpl: async (url, options) => {
      requestUrl = url;
      requestOptions = options;
      return response({ body: { choices: [{ message: { content: '{"ok":true}' } }] } });
    },
  });
  const schema = {
    type: 'object',
    properties: { ok: { type: 'boolean' } },
    required: ['ok'],
    additionalProperties: false,
  };

  const result = await client.requestStructuredJson({ input: 'Return a result.', schema });
  const request = JSON.parse(requestOptions.body);
  assert.equal(result, '{"ok":true}');
  assert.equal(requestUrl, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(requestOptions.headers.Authorization, 'Bearer test-openrouter-key');
  assert.equal(request.model, config.openRouterModel);
  assert.equal(request.response_format.json_schema.strict, true);
  assert.deepEqual(request.response_format.json_schema.schema, schema);
});

test('OpenRouter converts visible screenshot input to the OpenAI-compatible image format', () => {
  assert.deepEqual(toOpenRouterMessages([
    { type: 'text', text: 'Describe visible evidence.' },
    { type: 'image', mime_type: 'image/png', data: 'cGl4ZWxz' },
  ]), [{
    role: 'user',
    content: [
      { type: 'text', text: 'Describe visible evidence.' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,cGl4ZWxz' } },
    ],
  }]);
});

test('OpenRouter reports rate limits without retrying or falling back to a paid model', async () => {
  let calls = 0;
  const client = createOpenRouterClient({
    configProvider: () => config,
    fetchImpl: async () => {
      calls += 1;
      return response({
        status: 429,
        headers: { 'retry-after': '30' },
        body: { error: { message: 'Rate limit exceeded.' } },
      });
    },
  });

  await assert.rejects(client.reply({ message: 'Help me describe a bug.' }), {
    code: 'OPENROUTER_RATE_LIMITED',
    status: 429,
    message: 'OpenRouter free-model limit reached. Try again in 30 seconds.',
  });
  assert.equal(calls, 1);
});

test('OpenRouter refuses requests without a configured key', async () => {
  const client = createOpenRouterClient({
    configProvider: () => ({ ...config, openRouterApiKey: '' }),
    fetchImpl: async () => { throw new Error('Fetch should not run.'); },
  });

  await assert.rejects(client.reply({ message: 'Hello.' }), {
    code: 'OPENROUTER_KEY_MISSING',
    status: 503,
  });
});
