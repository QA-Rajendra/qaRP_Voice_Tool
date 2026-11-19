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

test('report management API lists, filters, paginates, opens, updates, and deletes reports', async () => {
  const database = await createMemoryDatabase();
  const repository = createRepository(database);
  const matching = repository.create({
    ...createEmptyReport(),
    bugTitle: 'Login button does not respond',
    status: 'Open',
    severity: { value: 'Major', suggested: false, reason: '' },
  });
  repository.create({
    ...createEmptyReport(),
    bugTitle: 'Settings label wraps',
    status: 'New',
    severity: { value: 'Minor', suggested: false, reason: '' },
  });
  repository.create({
    ...createEmptyReport(),
    bugTitle: 'Search results are stale',
    status: 'Open',
    severity: { value: 'Major', suggested: false, reason: '' },
  });
  repository.create({
    ...createEmptyReport(),
    bugTitle: 'Checkout crash resolved',
    status: 'Fixed',
    severity: { value: 'Critical', suggested: false, reason: '' },
  });
  const app = createApp({ repository });

  await withServer(app, async (baseUrl) => {
    const analyticsResponse = await fetch(`${baseUrl}/api/bug-reports/analytics`);
    const analytics = await analyticsResponse.json();
    assert.equal(analyticsResponse.status, 200);
    assert.equal(analytics.totalBugs, 4);
    assert.equal(analytics.openBugs, 3);
    assert.equal(analytics.criticalBugs, 1);
    assert.equal(analytics.resolvedBugs, 1);
    assert.equal(analytics.generatedReports, 4);
    assert.equal(analytics.aiAnalysisHistory, 0);

    const filteredResponse = await fetch(`${baseUrl}/api/bug-reports?search=Login&status=Open&severity=Major&page=1&pageSize=1`);
    const filtered = await filteredResponse.json();
    assert.equal(filteredResponse.status, 200);
    assert.equal(filtered.total, 1);
    assert.equal(filtered.page, 1);
    assert.equal(filtered.reports[0].reportId, matching.reportId);

    const firstPageResponse = await fetch(`${baseUrl}/api/bug-reports?status=Open&severity=Major&page=1&pageSize=1`);
    const firstPage = await firstPageResponse.json();
    const pageResponse = await fetch(`${baseUrl}/api/bug-reports?status=Open&severity=Major&page=2&pageSize=1`);
    const page = await pageResponse.json();
    assert.equal(page.total, 2);
    assert.equal(firstPage.reports.length, 1);
    assert.equal(page.reports.length, 1);
    assert.notEqual(page.reports[0].reportId, firstPage.reports[0].reportId);

    const invalidFilter = await fetch(`${baseUrl}/api/bug-reports?status=Unknown`);
    assert.equal(invalidFilter.status, 400);
    assert.equal((await invalidFilter.json()).error.code, 'VALIDATION_ERROR');

    const detailResponse = await fetch(`${baseUrl}/api/bug-reports/${encodeURIComponent(matching.reportId)}`);
    const detail = await detailResponse.json();
    assert.equal(detailResponse.status, 200);
    assert.equal(detail.report.bugTitle, 'Login button does not respond');

    const changedReport = { ...detail.report, bugTitle: 'Login action remains inactive', status: 'In Progress' };
    const updateResponse = await fetch(`${baseUrl}/api/bug-reports/${encodeURIComponent(matching.reportId)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changedReport),
    });
    const update = await updateResponse.json();
    assert.equal(updateResponse.status, 200);
    assert.equal(update.report.bugTitle, 'Login action remains inactive');
    assert.equal(update.report.status, 'In Progress');
    assert.equal(update.report.timestamps.createdAt, detail.report.timestamps.createdAt);

    const missingUpdate = await fetch(`${baseUrl}/api/bug-reports/missing-id`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changedReport),
    });
    assert.equal(missingUpdate.status, 404);
    assert.equal((await missingUpdate.json()).error.code, 'REPORT_NOT_FOUND');

    const deleteResponse = await fetch(`${baseUrl}/api/bug-reports/${encodeURIComponent(matching.reportId)}`, { method: 'DELETE' });
    assert.equal(deleteResponse.status, 200);
    assert.equal((await deleteResponse.json()).deleted, true);

    const missingDetail = await fetch(`${baseUrl}/api/bug-reports/${encodeURIComponent(matching.reportId)}`);
    assert.equal(missingDetail.status, 404);
    assert.equal((await missingDetail.json()).error.code, 'REPORT_NOT_FOUND');
    const missingDelete = await fetch(`${baseUrl}/api/bug-reports/${encodeURIComponent(matching.reportId)}`, { method: 'DELETE' });
    assert.equal(missingDelete.status, 404);
  });

  database.close();
});
