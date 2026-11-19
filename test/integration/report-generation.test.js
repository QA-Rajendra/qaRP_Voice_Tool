const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../../backend/server');
const { createEmptyReport } = require('../../backend/schemas/bug-report.schema');
const { createMemoryDatabase } = require('../../backend/db/connection');
const { createRepository } = require('../../backend/db/bug-report-repository');

async function withServer(app, run) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

function generatedResult() {
  const report = {
    ...createEmptyReport(),
    bugTitle: 'Save button remains disabled after valid input.',
    summary: 'The Save button does not become active after required information is entered.',
    bugType: 'Functional',
    confirmedFacts: ['The Save button stays disabled after valid input.'],
    assumptionsAndMissingInformation: { assumptions: ['Required fields are complete.'], missingInfo: ['Browser was not provided.'] },
  };
  return {
    report,
    confirmedFacts: report.confirmedFacts,
    assumptions: report.assumptionsAndMissingInformation.assumptions,
    missingInfo: report.assumptionsAndMissingInformation.missingInfo,
    clarifyingQuestions: ['Which browser did you use?'],
  };
}

test('generate endpoint returns mocked report data and never persists the draft', async () => {
  const database = await createMemoryDatabase();
  const repository = createRepository(database);
  const app = createApp({ repository, generationService: { generateReport: async () => generatedResult() } });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/bug-reports/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'The Save button stays disabled after valid input.' }),
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.report.bugTitle, 'Save button remains disabled after valid input.');
    assert.equal(repository.list({}).total, 0);
    const analytics = await (await fetch(`${baseUrl}/api/bug-reports/analytics`)).json();
    assert.equal(analytics.aiAnalysisHistory, 1);
    assert.equal(analytics.totalBugs, 0);

    const restartedApp = createApp({ repository, generationService: { generateReport: async () => generatedResult() } });
    await withServer(restartedApp, async (restartedBaseUrl) => {
      const persistedAnalytics = await (await fetch(`${restartedBaseUrl}/api/bug-reports/analytics`)).json();
      assert.equal(persistedAnalytics.aiAnalysisHistory, 1);
    });
  });
  database.close();
});

test('save endpoint requires explicit confirmation before inserting the report', async () => {
  const database = await createMemoryDatabase();
  const repository = createRepository(database);
  const app = createApp({ repository });

  await withServer(app, async (baseUrl) => {
    const report = generatedResult().report;
    const declined = await fetch(`${baseUrl}/api/bug-reports`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmed: false, report }),
    });
    assert.equal(declined.status, 400);
    assert.equal(repository.list({}).total, 0);

    const accepted = await fetch(`${baseUrl}/api/bug-reports`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmed: true, report }),
    });
    const result = await accepted.json();
    assert.equal(accepted.status, 201);
    assert.match(result.report.reportId, /^BUG-/);
    assert.equal(repository.list({}).total, 1);
  });
  database.close();
});
