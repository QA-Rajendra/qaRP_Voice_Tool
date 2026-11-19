const createBugReports = require('./001-create-bug-reports');
const addMasterPromptFields = require('./002-add-master-prompt-fields');
const createAiAnalysisHistory = require('./003-create-ai-analysis-history');

function migrate(database) {
  database.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);
  const applied = new Set(database.prepare('SELECT name FROM schema_migrations').all().map((row) => row.name));
  const migrations = [
    ['001-create-bug-reports', createBugReports.up],
    ['002-add-master-prompt-fields', addMasterPromptFields.up],
    ['003-create-ai-analysis-history', createAiAnalysisHistory.up],
  ];
  const record = database.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)');
  for (const [name, run] of migrations) {
    if (applied.has(name)) continue;
    database.transaction(() => {
      run(database);
      record.run(name, new Date().toISOString());
    })();
  }
}

module.exports = { migrate };
