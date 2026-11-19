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
