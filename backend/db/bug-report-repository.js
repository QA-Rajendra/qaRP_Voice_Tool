const { randomUUID } = require('node:crypto');
const { FIELD_DEFINITIONS, BugReportSchema, createEmptyReport } = require('../schemas/bug-report.schema');
const { getDatabase } = require('./connection');
const { migrate } = require('./migrations');

const toColumn = (field) => field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
const jsonFields = new Set(Object.entries(FIELD_DEFINITIONS).filter(([, item]) => item.storage === 'json').map(([field]) => field));
const searchableFields = Object.entries(FIELD_DEFINITIONS).filter(([, item]) => item.searchable).map(([field]) => field);
const encode = (field, value) => (jsonFields.has(field) ? JSON.stringify(value) : value);

function decodeRow(row) {
  if (!row) return null;
  const report = {};
  for (const field of Object.keys(FIELD_DEFINITIONS)) {
    const value = row[toColumn(field)];
    report[field] = jsonFields.has(field) ? JSON.parse(value) : value;
  }
  return BugReportSchema.parse(report);
}

function createRepository(database = getDatabase()) {
  migrate(database);
  const fields = Object.keys(FIELD_DEFINITIONS);
  const columns = fields.map((field) => `"${toColumn(field)}"`).join(', ');
  const placeholders = fields.map(() => '?').join(', ');
  const insert = database.prepare(`INSERT INTO bug_reports (${columns}) VALUES (${placeholders})`);
  const selectOne = database.prepare('SELECT * FROM bug_reports WHERE report_id = ?');

  return {
    create(input) {
      const now = new Date().toISOString();
      const report = BugReportSchema.parse({
        ...createEmptyReport(), ...input,
        reportId: `BUG-${randomUUID()}`, timestamps: { createdAt: now, updatedAt: now },
        reportedDate: input.reportedDate || now.slice(0, 10),
      });
      insert.run(...fields.map((field) => encode(field, report[field])));
      return report;
    },

    getById(id) {
      return decodeRow(selectOne.get(id));
    },

    update(id, changes) {
      const current = decodeRow(selectOne.get(id));
      if (!current) return null;
      const report = BugReportSchema.parse({
        ...current, ...changes, reportId: id,
        timestamps: { createdAt: current.timestamps.createdAt, updatedAt: new Date().toISOString() },
      });
      const mutableFields = fields.filter((field) => field !== 'reportId');
      const assignments = mutableFields.map((field) => `"${toColumn(field)}" = ?`).join(', ');
      database.prepare(`UPDATE bug_reports SET ${assignments} WHERE report_id = ?`)
        .run(...mutableFields.map((field) => encode(field, report[field])), id);
      return report;
    },

    delete(id) {
      return database.prepare('DELETE FROM bug_reports WHERE report_id = ?').run(id).changes > 0;
    },

    recordAiAnalysis() {
      database.prepare('INSERT INTO ai_analysis_events (created_at) VALUES (?)').run(new Date().toISOString());
    },

    list({ search = '', status = '', severity = '', page = 1, pageSize = 20 } = {}) {
      const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
      const safePageSize = Math.min(100, Math.max(1, Number.parseInt(pageSize, 10) || 20));
      const clauses = [];
      const values = [];

      if (status && ['New', 'Open', 'In Progress', 'Fixed', 'Verified', 'Closed', 'Rejected'].includes(status)) {
        clauses.push('status = ?');
        values.push(status);
      }
      if (severity && ['Critical', 'Major', 'Minor', 'Trivial'].includes(severity)) {
        clauses.push("json_extract(severity, '$.value') = ?");
        values.push(severity);
      }
      if (search.trim()) {
        const escaped = search.trim().replace(/[!%_]/g, (character) => `!${character}`);
        clauses.push(`(${searchableFields.map((field) => `"${toColumn(field)}" LIKE ? ESCAPE '!'`).join(' OR ')})`);
        values.push(...searchableFields.map(() => `%${escaped}%`));
      }

      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const total = database.prepare(`SELECT COUNT(*) AS count FROM bug_reports ${where}`).get(...values).count;
      const rows = database.prepare(`SELECT * FROM bug_reports ${where} ORDER BY json_extract(timestamps, '$.updatedAt') DESC, report_id DESC LIMIT ? OFFSET ?`)
        .all(...values, safePageSize, (safePage - 1) * safePageSize);
      return { reports: rows.map(decodeRow), page: safePage, pageSize: safePageSize, total };
    },

    analytics() {
      const totalBugs = database.prepare('SELECT COUNT(*) AS count FROM bug_reports').get().count;
      const openBugs = database.prepare('SELECT COUNT(*) AS count FROM bug_reports WHERE status IN (?, ?, ?)')
        .get('New', 'Open', 'In Progress').count;
      const resolvedBugs = database.prepare('SELECT COUNT(*) AS count FROM bug_reports WHERE status IN (?, ?, ?)')
        .get('Fixed', 'Verified', 'Closed').count;
      const criticalBugs = database.prepare("SELECT COUNT(*) AS count FROM bug_reports WHERE json_extract(severity, '$.value') = ?")
        .get('Critical').count;
      const aiAnalysisHistory = database.prepare('SELECT COUNT(*) AS count FROM ai_analysis_events').get().count;
      return { totalBugs, openBugs, criticalBugs, resolvedBugs, generatedReports: totalBugs, aiAnalysisHistory };
    },
  };
}

module.exports = { createRepository };
