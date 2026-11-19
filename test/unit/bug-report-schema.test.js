const test = require('node:test');
const assert = require('node:assert/strict');
const {
  FIELD_DEFINITIONS, BugReportSchema, BUG_REPORT_JSON_SCHEMA, createEmptyReport,
} = require('../../backend/schemas/bug-report.schema');

test('schema contains exactly the approved 22 fields and accepts the empty report template', () => {
  const expectedFields = [
    'productProject', 'reportId', 'moduleComponent', 'subModule', 'bugTitle', 'bugType',
    'environment', 'applicationBuildVersion', 'browserDevice', 'severity', 'priority',
    'preconditions', 'testData', 'reproductionSteps', 'expectedResult', 'actualResult',
    'status', 'assignee', 'reporter', 'reportedDate', 'attachmentReferences', 'remarks',
  ];
  assert.deepEqual(Object.keys(FIELD_DEFINITIONS), expectedFields);
  assert.equal(Object.keys(BugReportSchema.parse(createEmptyReport())).length, 22);
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

test('template labels match the approved report field names', () => {
  const labels = Object.entries(FIELD_DEFINITIONS).map(([name, definition]) => (
    definition.label || name.replace(/([A-Z])/g, ' $1').replace(/^./, (first) => first.toUpperCase())
  ));
  assert.deepEqual(labels, [
    'Project Name', 'Bug ID', 'Module', 'Sub Module', 'Bug Title', 'Bug Type',
    'Environment', 'Build Version', 'Browser / Device', 'Severity', 'Priority',
    'Preconditions', 'Test Data', 'Steps to Reproduce', 'Expected Result', 'Actual Result',
    'Status', 'Assigned To', 'Reported By', 'Reported Date',
    'Attachment: Screenshot / Video / Logs', 'Remarks',
  ]);
});

test('severity and priority remain explicitly suggested until a user changes them', () => {
  const report = BugReportSchema.parse(createEmptyReport());
  assert.equal(report.severity.suggested, true);
  assert.equal(report.priority.suggested, true);
});
