const fs = require('node:fs');
const path = require('node:path');
const initSqlJs = require('sql.js');

let databasePromise;

function createSqliteAdapter(native, databasePath = null) {
  let transactionDepth = 0;

  function persist() {
    if (!databasePath || transactionDepth > 0) return;
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    fs.writeFileSync(databasePath, Buffer.from(native.export()));
  }

  function statement(sql) {
    return {
      run(...parameters) {
        native.run(sql, parameters);
        const changes = native.getRowsModified();
        persist();
        return { changes };
      },
      get(...parameters) {
        const query = native.prepare(sql);
        try {
          query.bind(parameters);
          return query.step() ? query.getAsObject() : undefined;
        } finally {
          query.free();
        }
      },
      all(...parameters) {
        const query = native.prepare(sql);
        const rows = [];
        try {
          query.bind(parameters);
          while (query.step()) rows.push(query.getAsObject());
          return rows;
        } finally {
          query.free();
        }
      },
    };
  }

  return {
    prepare: statement,
    exec(sql) {
      native.exec(sql);
      persist();
    },
    transaction(callback) {
      return (...args) => {
        native.run('BEGIN');
        transactionDepth += 1;
        try {
          const result = callback(...args);
          native.run('COMMIT');
          transactionDepth -= 1;
          persist();
          return result;
        } catch (error) {
          native.run('ROLLBACK');
          transactionDepth -= 1;
          throw error;
        }
      };
    },
    close() {
      persist();
      native.close();
    },
  };
}

async function createMemoryDatabase() {
  const SQL = await initSqlJs();
  return createSqliteAdapter(new SQL.Database());
}

async function getDatabase(databasePath = path.join(__dirname, '..', '..', 'data', 'bug-reports.sqlite')) {
  if (!databasePromise) {
    databasePromise = (async () => {
      const SQL = await initSqlJs();
      const native = fs.existsSync(databasePath)
        ? new SQL.Database(fs.readFileSync(databasePath))
        : new SQL.Database();
      return createSqliteAdapter(native, databasePath);
    })();
  }
  return databasePromise;
}

async function closeDatabase() {
  if (databasePromise) (await databasePromise).close();
  databasePromise = undefined;
}

module.exports = { getDatabase, closeDatabase, createMemoryDatabase, createSqliteAdapter };
