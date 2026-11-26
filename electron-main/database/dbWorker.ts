import { parentPort } from 'worker_threads';
import path from 'path';
import fs from 'fs';
import { DatabaseSync } from 'node:sqlite';
import { migrations } from './migrations';

if (!parentPort) {
  throw new Error('dbWorker must be run as a worker thread');
}

let db: DatabaseSync | null = null;
let userDataPath: string = process.cwd();

function ensureDb(): DatabaseSync {
  if (!db) {
    const dbDir = path.join(userDataPath, 'data');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    const dbPath = path.join(dbDir, 'main.sqlite');
    const database = new DatabaseSync(dbPath);

    database.exec('PRAGMA journal_mode = WAL;');
    database.exec('PRAGMA synchronous = NORMAL;');
    database.exec('PRAGMA foreign_keys = ON;');
    database.exec('PRAGMA temp_store = MEMORY;');
    database.exec('PRAGMA cache_size = -64000;');

    initMigrations(database);
    db = database;
  }
  return db;
}

function initMigrations(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS _schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);

  database.exec('DROP TRIGGER IF EXISTS cards_ai; DROP TRIGGER IF EXISTS cards_ad; DROP TRIGGER IF EXISTS cards_au;');

  const appliedRows = database
    .prepare('SELECT version FROM _schema_migrations ORDER BY version ASC')
    .all() as Array<{ version: number }>;
  const appliedVersions = new Set(appliedRows.map((r) => r.version));

  for (const migration of migrations) {
    if (!appliedVersions.has(migration.version)) {
      database.exec('BEGIN TRANSACTION;');
      try {
        for (const statement of migration.up) {
          try {
            database.exec(statement);
          } catch (stmtErr: unknown) {
            if (String(stmtErr).includes('fts5')) {
              console.warn('[dbWorker] FTS5 module not compiled in SQLite engine, falling back to standard index.');
              database.exec('CREATE INDEX IF NOT EXISTS idx_cards_title ON cards(title);');
            } else {
              throw stmtErr;
            }
          }
        }
        database
          .prepare('INSERT INTO _schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
          .run(migration.version, migration.name, Date.now());
        database.exec('COMMIT;');
      } catch (err) {
        database.exec('ROLLBACK;');
        throw err;
      }
    }
  }
}

interface WorkerMessage {
  id: string;
  name: string;
  param?: {
    sql?: string;
    params?: unknown[];
    statements?: Array<{ sql: string; params?: unknown[] }>;
  } & unknown;
}

parentPort.on('message', (msg: WorkerMessage) => {
  const { id, name, param } = msg;

  try {
    switch (name) {
      case 'setUserPath': {
        userDataPath = String(param);
        parentPort?.postMessage({ id, result: true });
        break;
      }

      case 'open': {
        ensureDb();
        parentPort?.postMessage({ id, result: true });
        break;
      }

      case 'close': {
        if (db) {
          db.close();
          db = null;
        }
        parentPort?.postMessage({ id, result: true });
        break;
      }

      case 'query': {
        const database = ensureDb();
        const queryParam = param as { sql: string; params?: unknown[] };
        const stmt = database.prepare(queryParam.sql);
        const rows =
          queryParam.params && queryParam.params.length > 0
            ? stmt.all(...queryParam.params)
            : stmt.all();
        parentPort?.postMessage({ id, result: rows });
        break;
      }

      case 'run': {
        const database = ensureDb();
        const runParam = param as { sql: string; params?: unknown[] };
        const stmt = database.prepare(runParam.sql);
        const runResult =
          runParam.params && runParam.params.length > 0
            ? stmt.run(...runParam.params)
            : stmt.run();
        parentPort?.postMessage({
          id,
          result: {
            changes: runResult.changes,
            lastInsertRowid: runResult.lastInsertRowid,
          },
        });
        break;
      }

      case 'execute': {
        const database = ensureDb();
        const execParam = param as { statements: Array<{ sql: string; params?: unknown[] }> };
        database.exec('BEGIN TRANSACTION;');
        try {
          for (const item of execParam.statements) {
            const stmt = database.prepare(item.sql);
            if (item.params && item.params.length > 0) {
              stmt.run(...item.params);
            } else {
              stmt.run();
            }
          }
          database.exec('COMMIT;');
          parentPort?.postMessage({ id, result: true });
        } catch (error) {
          database.exec('ROLLBACK;');
          throw error;
        }
        break;
      }

      case 'cleanup': {
        if (db) {
          db.close();
          db = null;
        }
        process.exit(0);
        break;
      }

      default:
        throw new Error(`Unknown job name: ${name}`);
    }
  } catch (error: unknown) {
    const errObj = error instanceof Error ? error : new Error(String(error));
    parentPort?.postMessage({
      id,
      error: {
        message: errObj.message,
        stack: errObj.stack,
      },
    });
  }
});
