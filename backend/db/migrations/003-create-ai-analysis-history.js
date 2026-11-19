function up(database) {
  database.exec(`CREATE TABLE IF NOT EXISTS ai_analysis_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL
  )`);
}

module.exports = { up };
