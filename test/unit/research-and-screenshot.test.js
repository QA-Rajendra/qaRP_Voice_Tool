const test = require('node:test');
const assert = require('node:assert/strict');
const { createResearchService, extractSources } = require('../../backend/services/research-service');
const { createScreenshotAnalysisService } = require('../../backend/services/screenshot-analysis-service');

test('research service uses Google Search and returns only validated citation URLs', async () => {
  let request;
  const service = createResearchService({ clientFactory: async () => ({
    interactions: { create: async (value) => {
      request = value;
      return {
        output_text: 'The feature is supported in recent browsers.',
        steps: [{ type: 'model_output', content: [{ type: 'text', annotations: [
          { type: 'url_citation', title: 'Example Docs', url: 'https://example.com/docs' },
          { type: 'url_citation', title: 'Unsafe', url: 'javascript:alert(1)' },
        ] }] }],
      };
    } },
  }) });
  const result = await service.research('Does this browser support feature X?');
  assert.deepEqual(request.tools, [{ type: 'google_search' }]);
  assert.equal(result.answer, 'The feature is supported in recent browsers.');
  assert.deepEqual(result.sources, [{ title: 'Example Docs', url: 'https://example.com/docs' }]);
});

test('citation extraction drops invalid protocols and duplicate URLs', () => {
  const sources = extractSources({ steps: [{ type: 'model_output', content: [{ type: 'text', annotations: [
    { type: 'url_citation', title: 'one', url: 'https://example.com/a' },
    { type: 'url_citation', title: 'duplicate', url: 'https://example.com/a' },
    { type: 'url_citation', title: 'unsafe', url: 'file:///secret' },
  ] }] }] });
  assert.equal(sources.length, 1);
  assert.equal(sources[0].title, 'one');
});

test('screenshot analysis sends an image and validates visible-only findings', async () => {
  let request;
  const service = createScreenshotAnalysisService({ generate: async (value) => {
    request = value;
    return JSON.stringify({ findings: [{
      category: 'Truncated text',
      observation: 'The Save label is cut off at the right edge.',
      visibleEvidence: 'Only "Sav" is visible on the button.',
    }] });
  } });
  const result = await service.analyze({ buffer: Buffer.from('fake-image-bytes'), mimeType: 'image/png' });
  assert.equal(request.input[1].type, 'image');
  assert.equal(request.input[1].mime_type, 'image/png');
  assert.equal(result.findings[0].suggested, true);
  assert.equal(result.findings[0].observation.includes('right edge'), true);
});

test('screenshot analysis visibly rejects malformed model output', async () => {
  const service = createScreenshotAnalysisService({ generate: async () => '{bad json' });
  await assert.rejects(service.analyze({ buffer: Buffer.from('x'), mimeType: 'image/png' }), { code: 'MALFORMED_SCREENSHOT_RESPONSE', status: 502 });
});
