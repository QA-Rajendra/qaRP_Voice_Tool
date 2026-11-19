const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../../backend/server');
const { removeImage } = require('../../backend/services/attachment-service');

async function withServer(app, run) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

test('research endpoint returns answer and sources from a mocked service', async () => {
  const app = createApp({ researchService: {
    research: async () => ({ answer: 'A sourced answer.', sources: [{ title: 'Docs', url: 'https://example.com/docs' }] }),
  } });
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/research`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'A technical question?' }),
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.answer, 'A sourced answer.');
    assert.equal(body.sources[0].url, 'https://example.com/docs');
  });
});

test('image uploads enforce image MIME, verify magic bytes, generate IDs and allow analysis/removal', async (t) => {
  let analyzedMime = '';
  let uploadedId = '';
  t.after(async () => { if (uploadedId) await removeImage(uploadedId); });
  const app = createApp({ screenshotAnalysisService: {
    analyze: async ({ buffer, mimeType }) => {
      analyzedMime = mimeType;
      assert.equal(buffer.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      return { findings: [{ category: 'Visible error', observation: 'A banner is visible.', visibleEvidence: 'Red banner at top.', suggested: true }] };
    },
  } });

  await withServer(app, async (baseUrl) => {
    const validImage = new FormData();
    validImage.append('image', new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: 'image/png' }), 'screen.png');
    const uploaded = await fetch(`${baseUrl}/api/attachments`, { method: 'POST', body: validImage });
    const attachment = await uploaded.json();
    uploadedId = attachment.id;
    assert.equal(uploaded.status, 201);
    assert.match(attachment.id, /^[0-9a-f-]{36}$/i);
    assert.equal(attachment.name, 'screen.png');

    const analysis = await fetch(`${baseUrl}/api/attachments/${attachment.id}/analyze`, { method: 'POST' });
    const result = await analysis.json();
    assert.equal(analysis.status, 200);
    assert.equal(analyzedMime, 'image/png');
    assert.equal(result.findings[0].suggested, true);

    const deleted = await fetch(`${baseUrl}/api/attachments/${attachment.id}`, { method: 'DELETE' });
    assert.equal(deleted.status, 200);
    uploadedId = '';

    const mismatchImage = new FormData();
    mismatchImage.append('image', new Blob(['not an image'], { type: 'image/png' }), 'bad.png');
    const mismatch = await fetch(`${baseUrl}/api/attachments`, { method: 'POST', body: mismatchImage });
    const error = await mismatch.json();
    assert.equal(mismatch.status, 415);
    assert.equal(error.error.code, 'INVALID_IMAGE_CONTENT');

    const textFile = new FormData();
    textFile.append('image', new Blob(['no'], { type: 'text/plain' }), 'bad.txt');
    const rejectedType = await fetch(`${baseUrl}/api/attachments`, { method: 'POST', body: textFile });
    assert.equal(rejectedType.status, 415);

    const oversizedImage = new FormData();
    oversizedImage.append('image', new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'image/png' }), 'large.png');
    const oversized = await fetch(`${baseUrl}/api/attachments`, { method: 'POST', body: oversizedImage });
    const sizeError = await oversized.json();
    assert.equal(oversized.status, 413);
    assert.equal(sizeError.error.code, 'FILE_TOO_LARGE');
  });
});
