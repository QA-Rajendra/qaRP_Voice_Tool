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

// The field map is the canonical 22-field contract used by validation, SQLite and exports.
// Complex values are stored as JSON text in SQLite.
const FIELD_DEFINITIONS = {
  productProject: { schema: text, storage: 'text', searchable: true, editor: 'text', label: 'Project Name' },
  reportId: { schema: text, storage: 'text', searchable: false, editor: 'text', label: 'Bug ID' },
  moduleComponent: { schema: text, storage: 'text', searchable: true, editor: 'text', label: 'Module' },
  subModule: { schema: text, storage: 'text', searchable: true, editor: 'text', label: 'Sub Module' },
  bugTitle: { schema: text, storage: 'text', searchable: true, editor: 'text', label: 'Bug Title' },
  bugType: { schema: z.enum(BUG_TYPES), storage: 'text', searchable: true, editor: 'select', options: BUG_TYPES },
  environment: { schema: text, storage: 'text', searchable: true, editor: 'textarea' },
  applicationBuildVersion: { schema: text, storage: 'text', searchable: true, editor: 'text', label: 'Build Version' },
  browserDevice: { schema: text, storage: 'text', searchable: true, editor: 'text', label: 'Browser / Device' },
  severity: { schema: suggestedChoice(SEVERITIES), storage: 'json', searchable: false, editor: 'suggested-choice', options: SEVERITIES },
  priority: { schema: suggestedChoice(PRIORITIES), storage: 'json', searchable: false, editor: 'suggested-choice', options: PRIORITIES },
  preconditions: { schema: textList, storage: 'json', searchable: true, editor: 'list', label: 'Preconditions' },
  testData: { schema: textList, storage: 'json', searchable: true, editor: 'list', label: 'Test Data' },
  reproductionSteps: { schema: textList, storage: 'json', searchable: true, editor: 'list', label: 'Steps to Reproduce' },
  expectedResult: { schema: text, storage: 'text', searchable: true, editor: 'textarea' },
  actualResult: { schema: text, storage: 'text', searchable: true, editor: 'textarea' },
  status: { schema: z.enum(STATUSES), storage: 'text', searchable: true, editor: 'select', options: STATUSES },
  assignee: { schema: text, storage: 'text', searchable: true, editor: 'text', label: 'Assigned To' },
  reporter: { schema: text, storage: 'text', searchable: true, editor: 'text', label: 'Reported By' },
  reportedDate: { schema: text, storage: 'text', searchable: false, editor: 'text', label: 'Reported Date' },
  attachmentReferences: {
    schema: z.array(z.object({ id: text, name: text }).strict()),
    storage: 'json', searchable: false, editor: 'attachments', label: 'Attachment: Screenshot / Video / Logs',
  },
  remarks: { schema: text, storage: 'text', searchable: true, editor: 'textarea', label: 'Remarks' },
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
    productProject: '', reportId: '', moduleComponent: '', subModule: '', bugTitle: '',
    bugType: 'Other', environment: '', applicationBuildVersion: '', browserDevice: '',
    severity: { value: null, suggested: true, reason: '' },
    priority: { value: null, suggested: true, reason: '' },
    preconditions: [], testData: [], reproductionSteps: [], expectedResult: '', actualResult: '',
    status: 'New', assignee: '', reporter: '', reportedDate: '', attachmentReferences: [], remarks: '',
  };
}

module.exports = {
  BUG_TYPES, STATUSES, SEVERITIES, PRIORITIES, FIELD_DEFINITIONS,
  BugReportSchema, BUG_REPORT_JSON_SCHEMA, createEmptyReport, getFormDefinition, labelForField,
};
