const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../../backend/server');
const { createMemoryDatabase } = require('../../backend/db/connection');
const { createRepository } = require('../../backend/db/bug-report-repository');
const { createEmptyReport } = require('../../backend/schemas/bug-report.schema');

async function withServer(app, run) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

function sampleSuggestions() {
  return {
    label: 'AI suggestion',
    suggestions: {
      reproductionSteps: ['Enter the supplied values.', 'Submit the form.'],
      positiveScenarios: ['Valid input is accepted.'],
      negativeScenarios: ['Invalid input shows a message.'],
      boundaryScenarios: ['Check the minimum supported value.'],
      regressionCases: ['Confirm the adjacent flow remains available.'],
    },
  };
}

test('export API returns selected JSON/CSV fields and reports the direct PDF blocker', async () => {
  const database = await createMemoryDatabase();
  const repository = createRepository(database);
  const report = repository.create({
    ...createEmptyReport(),
    bugTitle: '=HYPERLINK("https://example.invalid")',
    status: 'Open',
    logsEvidence: 'line one\nline two',
  });
  const app = createApp({ repository });

  await withServer(app, async (baseUrl) => {
    const jsonResponse = await fetch(`${baseUrl}/api/bug-reports/${report.reportId}/export?format=json&fields=bugTitle,status`);
    const json = await jsonResponse.json();
    assert.equal(jsonResponse.status, 200);
    assert.equal(jsonResponse.headers.get('cache-control'), 'no-store');
    assert.deepEqual(Object.keys(json), ['bugTitle', 'status']);
    assert.equal(json.bugTitle, report.bugTitle);

    const csvResponse = await fetch(`${baseUrl}/api/bug-reports/${report.reportId}/export?format=csv&fields=bugTitle,logsEvidence`);
    const csv = await csvResponse.text();
    assert.equal(csvResponse.status, 200);
    assert.match(csvResponse.headers.get('content-type'), /text\/csv/);
    assert.match(csv, /'=HYPERLINK/);
    assert.match(csv, /line one\r?\nline two/);

    const invalidFields = await fetch(`${baseUrl}/api/bug-reports/${report.reportId}/export?format=json&fields=bugTitle,secret`);
    assert.equal(invalidFields.status, 400);

    const pdf = await fetch(`${baseUrl}/api/bug-reports/${report.reportId}/export?format=pdf`);
    const pdfError = await pdf.json();
    assert.equal(pdf.status, 501);
    assert.equal(pdfError.error.code, 'PDF_EXPORT_UNAVAILABLE');

    const missing = await fetch(`${baseUrl}/api/bug-reports/missing/export?format=json`);
    assert.equal(missing.status, 404);
  });

  database.close();
});

test('QA suggestions endpoint uses the saved report and enforces its AI rate limit', async () => {
  const database = await createMemoryDatabase();
  const repository = createRepository(database);
  const report = repository.create({ ...createEmptyReport(), bugTitle: 'Search results do not update' });
  let serviceCalls = 0;
  const app = createApp({ repository, qaSuggestionsService: {
    generateSuggestions: async (savedReport) => {
      serviceCalls += 1;
      assert.equal(savedReport.reportId, report.reportId);
      assert.equal(savedReport.bugTitle, report.bugTitle);
      return sampleSuggestions();
    },
  } });

  await withServer(app, async (baseUrl) => {
    const missing = await fetch(`${baseUrl}/api/bug-reports/missing/qa-suggestions`, { method: 'POST' });
    assert.equal(missing.status, 404);
    let firstResult;
    for (let index = 0; index < 7; index += 1) {
      const response = await fetch(`${baseUrl}/api/bug-reports/${report.reportId}/qa-suggestions`, { method: 'POST' });
      if (index === 0) {
        firstResult = await response.json();
        assert.equal(response.status, 200);
      } else if (index === 6) {
        const error = await response.json();
        assert.equal(response.status, 429);
        assert.equal(error.error.code, 'RATE_LIMITED');
      } else {
        assert.equal(response.status, 200);
        await response.arrayBuffer();
      }
    }
    assert.equal(firstResult.label, 'AI suggestion');
    assert.deepEqual(firstResult.suggestions, sampleSuggestions().suggestions);
    assert.equal(serviceCalls, 6);
  });

  database.close();
});
