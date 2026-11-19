const { FIELD_DEFINITIONS, labelForField } = require('../schemas/bug-report.schema');

const EXPORT_FIELDS = Object.keys(FIELD_DEFINITIONS);

function selectReportFields(report, fields = EXPORT_FIELDS) {
  return Object.fromEntries(fields.map((field) => [field, report[field]]));
}

function valueForCsv(field, value) {
  if (value === null || value === undefined) return '';
  if (field === 'severity' || field === 'priority') {
    const suggested = value.suggested ? ' (AI suggested)' : '';
    const reason = value.reason ? `: ${value.reason}` : '';
    return `${value.value || 'Not provided'}${suggested}${reason}`;
  }
  if (Array.isArray(value)) {
    return value.map((item) => (item && typeof item === 'object' ? Object.values(item).join(' — ') : String(item))).join('; ');
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function csvCell(field, value) {
  let text = valueForCsv(field, value);
  if (/^[\u0000-\u0020]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function reportToCsv(report, fields = EXPORT_FIELDS) {
  const header = fields.map((field) => csvCell(field, labelForField(field))).join(',');
  const row = fields.map((field) => csvCell(field, report[field])).join(',');
  return `\uFEFF${header}\r\n${row}\r\n`;
}

module.exports = { EXPORT_FIELDS, selectReportFields, valueForCsv, csvCell, reportToCsv };
