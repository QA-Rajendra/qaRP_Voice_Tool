const test = require('node:test');
const assert = require('node:assert/strict');
const {
  FIELD_DEFINITIONS, BugReportSchema, BUG_REPORT_JSON_SCHEMA, createEmptyReport,
} = require('../../backend/schemas/bug-report.schema');

test('schema contains the expanded report fields and accepts the empty report template', () => {
  assert.equal(Object.keys(FIELD_DEFINITIONS).length, 34);
  assert.equal(Object.keys(BugReportSchema.parse(createEmptyReport())).length, 34);
  assert.equal(BUG_REPORT_JSON_SCHEMA.type, 'object');
});

test('schema rejects unknown fields and invalid enums', () => {
  assert.equal(BugReportSchema.safeParse({ ...createEmptyReport(), unexpected: 'x' }).success, false);
  assert.equal(BugReportSchema.safeParse({ ...createEmptyReport(), status: 'Pending' }).success, false);
  assert.equal(BugReportSchema.safeParse({ ...createEmptyReport(), bugType: 'Cosmetic' }).success, false);
  for (const bugType of ['API', 'Database', 'Responsive Design']) {
    assert.equal(BugReportSchema.safeParse({ ...createEmptyReport(), bugType }).success, true);
  }
});

test('new template labels include the exact report ID, module, test data, and assignment labels', () => {
  const labels = Object.fromEntries(Object.entries(FIELD_DEFINITIONS).map(([name, definition]) => [name, definition.label]));
  assert.equal(labels.reportId, 'Bug ID');
  assert.equal(labels.moduleComponent, 'Module');
  assert.equal(labels.subModule, 'Sub Module');
  assert.equal(labels.testData, 'Test Data');
  assert.equal(labels.assignee, 'Assigned To');
  assert.equal(labels.reporter, 'Reported By');
});

test('severity and priority remain explicitly suggested until a user changes them', () => {
  const report = BugReportSchema.parse(createEmptyReport());
  assert.equal(report.severity.suggested, true);
  assert.equal(report.priority.suggested, true);
});
