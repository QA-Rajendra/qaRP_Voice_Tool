const { z } = require('zod');

const BUG_TYPES = ['UI', 'Functional', 'Validation', 'API', 'Database', 'Security', 'Performance', 'Compatibility', 'Responsive Design', 'Data', 'Other'];
const STATUSES = ['New', 'Open', 'In Progress', 'Fixed', 'Verified', 'Closed', 'Rejected'];
const SEVERITIES = ['Critical', 'Major', 'Minor', 'Trivial'];
const PRIORITIES = ['High', 'Medium', 'Low'];

const text = z.string();
const textList = z.array(text);
const suggestedChoice = (values) => z.object({
  value: z.enum(values).nullable(),
  suggested: z.boolean(),
  reason: text,
}).strict();

// The field map is the canonical contract used by validation, SQLite and exports.
// Complex values are stored as JSON text in SQLite.
const FIELD_DEFINITIONS = {
  reportId: { schema: text, storage: 'text', searchable: false, editor: 'text', label: 'Bug ID' },
  bugTitle: { schema: text, storage: 'text', searchable: true, editor: 'text', label: 'Bug Title' },
  summary: { schema: text, storage: 'text', searchable: true, editor: 'textarea' },
  bugType: { schema: z.enum(BUG_TYPES), storage: 'text', searchable: true, editor: 'select', options: BUG_TYPES },
  status: { schema: z.enum(STATUSES), storage: 'text', searchable: true, editor: 'select', options: STATUSES },
  productProject: { schema: text, storage: 'text', searchable: true, editor: 'text', label: 'Project Name' },
  moduleComponent: { schema: text, storage: 'text', searchable: true, editor: 'text', label: 'Module' },
  subModule: { schema: text, storage: 'text', searchable: true, editor: 'text', label: 'Sub Module' },
  environment: { schema: text, storage: 'text', searchable: true, editor: 'textarea' },
  applicationBuildVersion: { schema: text, storage: 'text', searchable: true, editor: 'text', label: 'Build Version' },
  operatingSystemPlatform: { schema: text, storage: 'text', searchable: true, editor: 'text' },
  browserDevice: { schema: text, storage: 'text', searchable: true, editor: 'text' },
  preconditions: { schema: textList, storage: 'json', searchable: true, editor: 'list', label: 'Preconditions' },
  testData: { schema: textList, storage: 'json', searchable: true, editor: 'list', label: 'Test Data' },
  reproductionSteps: { schema: textList, storage: 'json', searchable: true, editor: 'list', label: 'Steps to Reproduce' },
  expectedResult: { schema: text, storage: 'text', searchable: true, editor: 'textarea' },
  actualResult: { schema: text, storage: 'text', searchable: true, editor: 'textarea' },
  severity: { schema: suggestedChoice(SEVERITIES), storage: 'json', searchable: false, editor: 'suggested-choice', options: SEVERITIES, label: 'Severity' },
  priority: { schema: suggestedChoice(PRIORITIES), storage: 'json', searchable: false, editor: 'suggested-choice', options: PRIORITIES, label: 'Priority' },
  reproductionFrequency: { schema: text, storage: 'text', searchable: true, editor: 'text' },
  firstObservedDateTime: { schema: text, storage: 'text', searchable: false, editor: 'text', label: 'First Observed Date / Time' },
  reporter: { schema: text, storage: 'text', searchable: true, editor: 'text', label: 'Reported By' },
  assignee: { schema: text, storage: 'text', searchable: true, editor: 'text', label: 'Assigned To' },
  reportedDate: { schema: text, storage: 'text', searchable: false, editor: 'text', label: 'Reported Date' },
  labels: { schema: textList, storage: 'json', searchable: true, editor: 'list' },
  attachmentReferences: {
    schema: z.array(z.object({ id: text, name: text }).strict()),
    storage: 'json', searchable: false, editor: 'attachments', label: 'Attachment: Screenshot / Video / Logs',
  },
  screenshotFindings: { schema: textList, storage: 'json', searchable: true, editor: 'list' },
  logsEvidence: { schema: text, storage: 'text', searchable: true, editor: 'textarea' },
  suspectedCause: { schema: text, storage: 'text', searchable: true, editor: 'textarea' },
  remarks: { schema: text, storage: 'text', searchable: true, editor: 'textarea', label: 'Remarks' },
  confirmedFacts: { schema: textList, storage: 'json', searchable: true, editor: 'list' },
  assumptionsAndMissingInformation: {
    schema: z.object({ assumptions: textList, missingInfo: textList }).strict(),
    storage: 'json', searchable: true, editor: 'assumptions',
  },
  suggestedTestsRegressionCoverage: { schema: textList, storage: 'json', searchable: true, editor: 'list' },
  timestamps: {
    schema: z.object({ createdAt: text, updatedAt: text }).strict(),
    storage: 'json', searchable: false, editor: 'timestamps',
  },
};

const BugReportSchema = z.object(Object.fromEntries(
  Object.entries(FIELD_DEFINITIONS).map(([name, definition]) => [name, definition.schema]),
)).strict();

const BUG_REPORT_JSON_SCHEMA = z.toJSONSchema(BugReportSchema);

function labelForField(field) {
  return FIELD_DEFINITIONS[field]?.label || field.replace(/([A-Z])/g, ' $1').replace(/^./, (first) => first.toUpperCase());
}

function getFormDefinition() {
  return Object.entries(FIELD_DEFINITIONS).map(([name, definition]) => ({
    name,
    label: definition.label || labelForField(name),
    editor: definition.editor,
    options: definition.options || [],
  }));
}

function createEmptyReport() {
  return {
    reportId: '', bugTitle: '', summary: '', bugType: 'Other', status: 'New',
    productProject: '', moduleComponent: '', environment: '', applicationBuildVersion: '',
    subModule: '', testData: [], reportedDate: '', remarks: '',
    operatingSystemPlatform: '', browserDevice: '', preconditions: [], reproductionSteps: [],
    expectedResult: '', actualResult: '',
    severity: { value: null, suggested: true, reason: '' },
    priority: { value: null, suggested: true, reason: '' },
    reproductionFrequency: '', firstObservedDateTime: '', reporter: '', assignee: '', labels: [],
    attachmentReferences: [], screenshotFindings: [], logsEvidence: '', suspectedCause: '',
    confirmedFacts: [], assumptionsAndMissingInformation: { assumptions: [], missingInfo: [] },
    suggestedTestsRegressionCoverage: [], timestamps: { createdAt: '', updatedAt: '' },
  };
}

module.exports = {
  BUG_TYPES, STATUSES, SEVERITIES, PRIORITIES, FIELD_DEFINITIONS,
  BugReportSchema, BUG_REPORT_JSON_SCHEMA, createEmptyReport, getFormDefinition, labelForField,
};
