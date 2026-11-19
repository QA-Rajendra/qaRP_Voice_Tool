const NEW_COLUMNS = [
  ['sub_module', "TEXT NOT NULL DEFAULT ''"],
  ['test_data', "TEXT NOT NULL DEFAULT '[]'"],
  ['reported_date', "TEXT NOT NULL DEFAULT ''"],
  ['remarks', "TEXT NOT NULL DEFAULT ''"],
];

function up(database) {
  const existing = new Set(database.prepare('PRAGMA table_info(bug_reports)').all().map((column) => column.name));
  for (const [name, definition] of NEW_COLUMNS) {
    if (!existing.has(name)) database.exec(`ALTER TABLE bug_reports ADD COLUMN "${name}" ${definition}`);
  }
}

module.exports = { up };
