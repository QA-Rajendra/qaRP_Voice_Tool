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
    bugType: 'Functional',
    reproductionSteps: ['Enter valid credentials.', 'Click Login.'],
    expectedResult: 'The user reaches the dashboard.',
    actualResult: 'Nothing happens after Login is clicked.',
    severity: { value: 'Major', suggested: true, reason: 'A core user flow is blocked.' },
    priority: { value: 'High', suggested: true, reason: 'The user cannot sign in.' },
  };
  return { report };
}

test('browser UI requires reviewed English before generating and supports report actions', { timeout: 90_000 }, async () => {
  const database = await createMemoryDatabase();
  let generationCount = 0;
  const generationInputs = [];
  const app = createApp({
    repository: createRepository(database),
    generationService: {
      convertToProfessionalEnglish: async () => ({
        englishDescription: 'The Login button does not respond after valid credentials are entered.',
      }),
      generateReport: async (input) => {
        generationCount += 1;
        generationInputs.push(input);
        return generatedResult();
      },
    },
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
    await page.locator('#description').fill('लॉगिन बटन वैध माहिती दिल्यानंतर काम करत नाही.');
    await page.locator('#language').selectOption('mr');
    await page.locator('#convert-button').click();
    await page.locator('#english-review').waitFor({ state: 'visible' });
    assert.match(await page.locator('#original-description-output').textContent(), /लॉगिन बटन/);
    assert.equal(await page.locator('#generate-button').isDisabled(), true);
    assert.equal(await page.locator('#english-description').inputValue(), 'The Login button does not respond after valid credentials are entered.');

    await page.locator('#edit-english-description').click();
    await page.locator('#english-description').fill('After valid credentials are entered, the Login button does not respond.');
    await page.locator('#confirm-english-description').click();
    assert.equal(await page.locator('#generate-button').isDisabled(), false);
    await page.locator('#generate-button').click();
    await page.locator('#report-editor').waitFor({ state: 'visible' });
    assert.equal(Object.keys(generationInputs[0]).length, 3);
    assert.equal(generationInputs[0].englishDescription, 'After valid credentials are entered, the Login button does not respond.');
    assert.equal(generationInputs[0].englishDescriptionReviewed, true);
    assert.equal(await page.locator('#report-field-grid .report-field').count(), 22);

    await page.locator('#edit-report-button').click();
    await page.locator('[data-report-field="bugTitle"]').fill('Login button remains inactive.');
    await page.locator('#edit-report-button').click();
    await page.locator('#copy-report-button').click();
    await page.waitForFunction(() => document.querySelector('#report-status')?.textContent.includes('copied to the clipboard'));

    const txtDownload = page.waitForEvent('download');
    await page.locator('#download-txt-button').click();
    assert.match((await txtDownload).suggestedFilename(), /\.txt$/);

    await page.locator('#download-pdf-button').click();
    assert.match(await page.locator('#report-status').textContent(), /Save as PDF/);

    await page.locator('#regenerate-report-button').click();
    await page.waitForFunction(() => document.querySelector('#report-status')?.textContent.includes('Review the 22 fields'));
    assert.equal(generationCount, 2);

    await page.locator('#reset-report-button').click();
    assert.equal(await page.locator('#description').inputValue(), '');
    assert.equal(await page.locator('#report-editor').isVisible(), false);
    await context.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    database.close();
  }
});

test('browser UI sends recognized speech to local voice chat and speaks the reply', { timeout: 30_000 }, async () => {
  const database = await createMemoryDatabase();
  const app = createApp({
    repository: createRepository(database),
    voiceChatService: { reply: async ({ message }) => 'I heard: ' + message },
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = 'http://127.0.0.1:' + server.address().port;
  let browser;

  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.addInitScript(() => {
      class MockSpeechRecognition {
        start() {
          window.__lastRecognition = this;
          this.onstart?.();
          window.setTimeout(() => {
            const result = { 0: { transcript: 'Login button does not respond.' }, isFinal: true };
            this.onresult?.({ resultIndex: 0, results: [result] });
            this.onend?.();
          }, 0);
        }
        stop() { this.onend?.(); }
      }
      class MockSpeechSynthesisUtterance {
        constructor(text) { this.text = text; }
      }
      window.SpeechRecognition = MockSpeechRecognition;
      window.SpeechSynthesisUtterance = MockSpeechSynthesisUtterance;
      Object.defineProperty(window, 'speechSynthesis', {
        configurable: true,
        value: {
          cancel() {},
          speak(utterance) {
            window.__spokenReply = utterance.text;
            window.setTimeout(() => utterance.onend?.(), 0);
          },
        },
      });
    });

    await page.goto(baseUrl);
    assert.equal(await page.locator('#browser-voice-button').count(), 0);
    assert.equal(await page.getByRole('link', { name: 'Dashboard' }).count(), 0);
    await page.locator('#language').selectOption('mr');
    await page.locator('#mic-button').click();
    await page.waitForFunction(() => document.querySelector('#voice-response')?.textContent.includes('I heard: Login button'));
    await page.waitForFunction(() => Boolean(window.__spokenReply));
    assert.equal(await page.locator('#description').inputValue(), 'Login button does not respond.');
    assert.match(await page.locator('#voice-response').textContent(), /I heard: Login button does not respond/);
    assert.equal(await page.evaluate(() => window.__spokenReply), 'I heard: Login button does not respond.');
    assert.equal(await page.evaluate(() => window.__lastRecognition.lang), 'mr-IN');
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    database.close();
  }
});
