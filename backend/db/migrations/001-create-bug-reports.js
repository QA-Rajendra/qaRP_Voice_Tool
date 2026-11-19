const { FIELD_DEFINITIONS } = require('../../schemas/bug-report.schema');
const toColumn = (field) => field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

function up(database) {
  const columns = Object.keys(FIELD_DEFINITIONS).map((field) => {
    const column = toColumn(field);
    return field === 'reportId' ? `"${column}" TEXT PRIMARY KEY` : `"${column}" TEXT NOT NULL`;
  });
  database.exec(`CREATE TABLE IF NOT EXISTS bug_reports (${columns.join(', ')})`);
  database.exec('CREATE INDEX IF NOT EXISTS idx_bug_reports_status ON bug_reports(status)');
  database.exec("CREATE INDEX IF NOT EXISTS idx_bug_reports_created_at ON bug_reports(json_extract(timestamps, '$.createdAt') DESC)");
}

module.exports = { up };
