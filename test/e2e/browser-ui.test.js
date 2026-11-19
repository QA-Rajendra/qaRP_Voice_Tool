const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createApp } = require('../../backend/server');
const { createMemoryDatabase } = require('../../backend/db/connection');
const { createRepository } = require('../../backend/db/bug-report-repository');
const { createEmptyReport } = require('../../backend/schemas/bug-report.schema');

function generatedResult() {
  const report = {
    ...createEmptyReport(),
    bugTitle: 'Login button does not respond after valid credentials.',
    summary: 'The Login button does not respond after valid credentials are entered.',
    bugType: 'Functional',
    reproductionSteps: ['Enter valid credentials.', 'Click Login.'],
    expectedResult: 'The user reaches the dashboard.',
    actualResult: 'Nothing happens after Login is clicked.',
    severity: { value: 'Major', suggested: true, reason: 'A core user flow is blocked.' },
    priority: { value: 'High', suggested: true, reason: 'The user cannot sign in.' },
    confirmedFacts: ['The Login button does nothing after credentials are entered.'],
    assumptionsAndMissingInformation: { assumptions: [], missingInfo: ['Browser and device were not provided.'] },
  };
  return { report, confirmedFacts: report.confirmedFacts, assumptions: [], missingInfo: report.assumptionsAndMissingInformation.missingInfo, clarifyingQuestions: [] };
}

function qaResult() {
  return {
    label: 'AI suggestion',
    suggestions: {
      reproductionSteps: ['Enter the supplied credentials.', 'Click Login.'],
      positiveScenarios: ['Valid credentials reach the dashboard.'],
      negativeScenarios: ['Invalid credentials display a clear error.'],
      boundaryScenarios: ['Submit with one credential field empty.'],
      regressionCases: ['Confirm sign out and sign in still work.'],
    },
  };
}

test('browser UI completes typed Marathi intake, edit/save, search, exports, QA, and bad screenshot handling', { timeout: 90_000 }, async () => {
  const database = await createMemoryDatabase();
  const repository = createRepository(database);
  const app = createApp({
    repository,
    clarificationService: {
      clarify: async ({ description, messages }) => messages.some((message) => message.role === 'user')
        ? { cleanDescription: `${description} Chrome on Android.`, readyToGenerate: true, clarifyingQuestions: [] }
        : { cleanDescription: description, readyToGenerate: false, clarifyingQuestions: ['Which browser and device did you use?'] },
    },
    generationService: { generateReport: async () => generatedResult() },
    qaSuggestionsService: { generateSuggestions: async () => qaResult() },
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  let browser;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ acceptDownloads: true });
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseUrl });
    const page = await context.newPage();
    await page.goto(baseUrl);
    await page.waitForFunction(() => document.querySelector('#bug-list-status')?.textContent.includes('saved report'));

    await page.locator('#description').fill('लॉगिन बटन वैध माहिती दिल्यानंतर काम करत नाही.');
    await page.locator('#language').selectOption('mr');
    await page.locator('#clarify-button').click();
    await page.locator('#answer-form').waitFor({ state: 'visible' });
    assert.match(await page.locator('#chat-thread').textContent(), /Which browser and device/);
    await page.locator('#follow-up-answer').fill('Chrome on Android.');
    await page.locator('#send-answer-button').click();
    await page.waitForFunction(() => document.querySelector('#status-title')?.textContent.includes('Ready for the next step'));

    await page.locator('#generate-button').click();
    await page.locator('#report-editor').waitFor({ state: 'visible' });
    await page.locator('[data-report-field="bugTitle"]').fill('Login button remains inactive on Android.');
    await page.locator('#save-report-button').click();
    await page.locator('#save-confirmation').waitFor({ state: 'visible' });
    await page.locator('#confirm-save-button').click();
    await page.waitForFunction(() => document.querySelector('#bug-list-status')?.textContent.includes('1 saved report'));
    assert.match(await page.locator('#bug-report-table-body').textContent(), /Login button remains inactive on Android/);

    await page.locator('#bug-report-table-body .table-action').filter({ hasText: 'Open / edit' }).click();
    await page.locator('#report-editor').waitFor({ state: 'visible' });
    await page.locator('[data-report-field="bugTitle"]').fill('Android login cannot continue.');
    await page.locator('#save-report-button').click();
    await page.locator('#confirm-save-button').click();
    await page.waitForFunction(() => document.querySelector('#report-status')?.textContent.includes('Updated BUG-'));

    await page.locator('#report-search').fill('Android login cannot continue');
    await page.locator('#search-reports-button').click();
    await page.waitForFunction(() => document.querySelector('#bug-report-table-body')?.textContent.includes('Android login cannot continue'));

    const jsonDownloadPromise = page.waitForEvent('download');
    await page.locator('#export-json-button').click();
    assert.match((await jsonDownloadPromise).suggestedFilename(), /\.json$/);
    const csvDownloadPromise = page.waitForEvent('download');
    await page.locator('#export-csv-button').click();
    assert.match((await csvDownloadPromise).suggestedFilename(), /\.csv$/);

    const printPagePromise = page.waitForEvent('popup');
    await page.locator('#print-report-button').click();
    const printPage = await printPagePromise;
    await printPage.locator('main.print-report h1').waitFor();
    assert.match(await printPage.locator('main.print-report').textContent(), /Android login cannot continue/);

    await page.locator('#generate-qa-button').click();
    await page.locator('#qa-suggestions-editor textarea').nth(0).waitFor();
    await page.locator('#qa-suggestions-editor textarea').nth(0).fill('Edited, user-reviewed reproduction suggestion.');
    await page.locator('#copy-qa-button').click();
    await page.waitForFunction(() => document.querySelector('#qa-status')?.textContent.includes('copied to the clipboard'));
    await page.locator('#apply-qa-button').click();
    assert.match(await page.locator('[data-report-field="suggestedTestsRegressionCoverage"]').inputValue(), /Edited, user-reviewed reproduction suggestion/);
    await page.locator('#save-report-button').click();
    await page.locator('#confirm-save-button').click();
    await page.waitForFunction(() => document.querySelector('#report-status')?.textContent.includes('Updated BUG-'));

    await page.locator('#screenshot-file').setInputFiles({
      name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('not a PNG image'),
    });
    await page.waitForFunction(() => document.querySelector('#screenshot-status')?.textContent.includes('does not match an allowed image type'));

    await page.locator('#bug-report-table-body .table-action').filter({ hasText: 'Delete' }).click();
    await page.locator('#delete-confirmation').waitFor({ state: 'visible' });
    await page.locator('#confirm-delete-button').click();
    await page.waitForFunction(() => document.querySelector('#bug-list-status')?.textContent.includes('0 saved reports'));
    await context.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    database.close();
  }
});

test('browser UI streams mocked Gemini Live audio and keeps the transcript editable', { timeout: 30_000 }, async () => {
  const database = await createMemoryDatabase();
  const app = createApp({
    repository: createRepository(database),
    liveVoiceService: {
      createSession: async () => ({ token: 'auth_tokens/browser-test-token', model: 'test-live-model', expiresAt: '2030-01-01T00:15:00.000Z' }),
    },
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  let browser;

  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) },
      });

      class MockAudioContext {
        constructor(options) {
          this.sampleRate = options.sampleRate;
          this.currentTime = 0;
          this.state = 'running';
          this.destination = {};
          this.audioWorklet = { addModule: async () => {} };
        }
        createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
        createGain() { return { gain: { value: 1 }, connect() {} }; }
        createBuffer(_channels, length, sampleRate) {
          const samples = new Float32Array(length);
          return { duration: length / sampleRate, getChannelData: () => samples };
        }
        createBufferSource() { return { connect() {}, start() {}, stop() {} }; }
        async resume() {}
        async close() { this.state = 'closed'; }
      }

      class MockAudioWorkletNode {
        constructor() { this.port = { onmessage: null }; }
        connect() {
          window.setTimeout(() => {
            this.port.onmessage?.({ data: new Int16Array(1600).buffer });
          }, 0);
        }
        disconnect() {}
      }

      class MockWebSocket {
        static CONNECTING = 0;
        static OPEN = 1;
        static CLOSING = 2;
        static CLOSED = 3;
        constructor(url) {
          this.url = String(url);
          this.readyState = MockWebSocket.CONNECTING;
          window.__lastLiveSocket = this;
          window.setTimeout(() => {
            this.readyState = MockWebSocket.OPEN;
            this.onopen?.();
          }, 0);
        }
        send(serialized) {
          const message = JSON.parse(serialized);
          if (message.setup) {
            window.__liveSetup = message.setup;
            window.setTimeout(() => this.onmessage?.({
              data: new Blob([JSON.stringify({ setupComplete: {} })], { type: 'application/json' }),
            }), 0);
          } else if (message.realtimeInput?.audio) {
            window.setTimeout(() => this.onmessage?.({ data: new Blob([JSON.stringify({ serverContent: {
              inputTranscription: { text: 'Login button does not respond.' },
              outputTranscription: { text: 'I heard that the Login button does not respond.' },
              modelTurn: { parts: [{ inlineData: { data: 'AAAAAA==', mimeType: 'audio/pcm;rate=24000' } }] },
            } })], { type: 'application/json' }) }), 0);
            window.setTimeout(() => this.onmessage?.({
              data: new Blob([JSON.stringify({ serverContent: { turnComplete: true } })], { type: 'application/json' }),
            }), 5);
          }
        }
        close() {
          this.readyState = MockWebSocket.CLOSED;
          window.setTimeout(() => this.onclose?.(), 0);
        }
      }

      window.AudioContext = MockAudioContext;
      window.AudioWorkletNode = MockAudioWorkletNode;
      window.WebSocket = MockWebSocket;
    });

    await page.goto(baseUrl);
    assert.equal(await page.getByRole('link', { name: 'Dashboard' }).count(), 0);
    assert.equal(await page.locator('.metrics-grid').count(), 0);
    await page.locator('#mic-button').click();
    await page.waitForFunction(() => document.querySelector('#voice-status')?.textContent.includes('Listening live'));
    assert.deepEqual(await page.evaluate(() => window.__liveSetup.responseModalities), ['AUDIO']);
    assert.equal(await page.evaluate(() => window.__liveSetup.generationConfig), undefined);
    await page.waitForFunction(() => document.querySelector('#description')?.value.includes('Login button does not respond.'));
    assert.match(await page.locator('#live-response').textContent(), /I heard that the Login button/);
    assert.match(await page.locator('#description').inputValue(), /Login button does not respond/);
    assert.match(await page.evaluate(() => window.__lastLiveSocket.url), /access_token=auth_tokens%2Fbrowser-test-token/);
    assert.equal(await page.locator('#browser-voice-button').isVisible(), false);
    assert.match(await page.request.get(`${baseUrl}/live-audio-worklet.js`).then((response) => response.text()), /registerProcessor\('qa-pcm-capture'/);

    await page.locator('#mic-button').click();
    await page.waitForFunction(() => document.querySelector('#voice-status')?.textContent.includes('Voice session ended'));
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    database.close();
  }
});
