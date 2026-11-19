const test = require('node:test');
const assert = require('node:assert/strict');
const { createRepository } = require('../../backend/db/bug-report-repository');
const { createMemoryDatabase } = require('../../backend/db/connection');
const { createEmptyReport } = require('../../backend/schemas/bug-report.schema');

async function setup() {
  const database = await createMemoryDatabase();
  return { database, repository: createRepository(database) };
}

test('repository creates, reads, updates and deletes a complete report', async () => {
  const { database, repository } = await setup();
  const created = repository.create({
    ...createEmptyReport(),
    bugTitle: 'Login button does not respond',
    bugType: 'Functional',
    severity: { value: 'Major', suggested: true, reason: 'Blocks a core user flow.' },
  });
  assert.match(created.reportId, /^BUG-/);
  assert.equal(repository.getById(created.reportId).bugTitle, 'Login button does not respond');

  const updated = repository.update(created.reportId, {
    bugTitle: 'Login button remains inactive',
    severity: { value: 'Major', suggested: false, reason: '' },
  });
  assert.equal(updated.bugTitle, 'Login button remains inactive');
  assert.equal(updated.severity.suggested, false);
  assert.equal(repository.delete(created.reportId), true);
  assert.equal(repository.getById(created.reportId), null);
  database.close();
});

test('repository supports parameterized search, status/severity filters and pagination', async () => {
  const { database, repository } = await setup();
  repository.create({
    ...createEmptyReport(), bugTitle: 'Login cannot submit', status: 'Open',
    severity: { value: 'Major', suggested: true, reason: 'Core flow impacted.' },
  });
  repository.create({
    ...createEmptyReport(), bugTitle: 'Settings label wraps', status: 'New',
    severity: { value: 'Minor', suggested: true, reason: 'Small visual issue.' },
  });

  const result = repository.list({ search: 'Login', status: 'Open', severity: 'Major', page: 1, pageSize: 1 });
  assert.equal(result.total, 1);
  assert.equal(result.reports[0].bugTitle, 'Login cannot submit');
  const wildcardText = repository.list({ search: "%' OR 1=1 --" });
  assert.equal(wildcardText.total, 0);
  database.close();
});
