const test = require('node:test');
const assert = require('node:assert/strict');
const { FIELD_DEFINITIONS, createEmptyReport } = require('../../backend/schemas/bug-report.schema');
const { createMemoryDatabase } = require('../../backend/db/connection');
const { migrate } = require('../../backend/db/migrations');
const { createRepository } = require('../../backend/db/bug-report-repository');

const NEW_FIELDS = new Set(['subModule', 'testData', 'reportedDate', 'remarks']);
const toColumn = (field) => field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

test('schema migration adds new report fields while preserving existing SQLite reports', async () => {
  const database = await createMemoryDatabase();
  const oldFields = Object.keys(FIELD_DEFINITIONS).filter((field) => !NEW_FIELDS.has(field));
  const oldReport = { ...createEmptyReport(), reportId: 'BUG-legacy', bugTitle: 'Older saved report' };
  database.exec('CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  database.exec(`CREATE TABLE bug_reports (${oldFields.map((field) => {
    const primary = field === 'reportId' ? ' PRIMARY KEY' : '';
    return `"${toColumn(field)}" TEXT NOT NULL${primary}`;
  }).join(', ')})`);
  database.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)')
    .run('001-create-bug-reports', new Date().toISOString());
  const oldColumns = oldFields.map((field) => `"${toColumn(field)}"`).join(', ');
  const placeholders = oldFields.map(() => '?').join(', ');
  const jsonFields = new Set(Object.entries(FIELD_DEFINITIONS)
    .filter(([field, definition]) => !NEW_FIELDS.has(field) && definition.storage === 'json')
    .map(([field]) => field));
  database.prepare(`INSERT INTO bug_reports (${oldColumns}) VALUES (${placeholders})`)
    .run(...oldFields.map((field) => jsonFields.has(field) ? JSON.stringify(oldReport[field]) : oldReport[field]));

  migrate(database);
  const repository = createRepository(database);
  const preserved = repository.getById('BUG-legacy');
  assert.equal(preserved.bugTitle, 'Older saved report');
  assert.equal(preserved.subModule, '');
  assert.deepEqual(preserved.testData, []);
  assert.equal(preserved.reportedDate, '');
  assert.equal(preserved.remarks, '');
  database.close();
});
