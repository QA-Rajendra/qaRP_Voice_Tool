const test = require('node:test');
const assert = require('node:assert/strict');
const { createEmptyReport } = require('../../backend/schemas/bug-report.schema');
const { reportToCsv, selectReportFields } = require('../../backend/services/export-service');

test('CSV export prefixes formula-like values and quotes multiline cells', () => {
  const report = {
    ...createEmptyReport(),
    bugTitle: '=HYPERLINK("https://example.invalid")',
    remarks: 'first line, with comma\nsecond "line"',
    testData: ['+cmd', '-1+1', '@SUM(A1:A2)'],
  };
  const csv = reportToCsv(report, ['bugTitle', 'remarks', 'testData']);
  assert.match(csv, /"'=HYPERLINK\(""https:\/\/example\.invalid""\)"/);
  assert.match(csv, /"first line, with comma\r?\nsecond ""line"""/);
  assert.match(csv, /"'\+cmd; -1\+1; @SUM\(A1:A2\)"/);
});

test('JSON field selection returns only the requested canonical fields', () => {
  const report = { ...createEmptyReport(), bugTitle: 'Example', status: 'Open' };
  assert.deepEqual(selectReportFields(report, ['bugTitle', 'status']), { bugTitle: 'Example', status: 'Open' });
});
