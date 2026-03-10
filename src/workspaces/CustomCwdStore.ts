import fs from 'fs/promises';
import path from 'path';
import { createRequire } from 'module';
import initSqlJs from 'sql.js';
import type { Database } from 'sql.js';

const require = createRequire(import.meta.url);
const SQL_WASM_PATH = require.resolve('sql.js/dist/sql-wasm.wasm');

export class CustomCwdStore {
  private readonly databasePromise: Promise<Database>;

  constructor(private readonly databasePath: string) {
    this.databasePromise = this.initialize();
  }

  async list(): Promise<string[]> {
    const database = await this.databasePromise;
    const statement = database.prepare(
      'SELECT path FROM custom_cwds ORDER BY created_at ASC, path ASC',
    );

    try {
      const paths: string[] = [];
      while (statement.step()) {
        const row = statement.getAsObject() as { path?: string };
        if (typeof row.path === 'string') {
          paths.push(row.path);
        }
      }

      return paths;
    } finally {
      statement.free();
    }
  }

  async add(cwd: string): Promise<void> {
    const database = await this.databasePromise;
    database.run('INSERT OR IGNORE INTO custom_cwds(path) VALUES (?)', [cwd]);

    if (database.getRowsModified() > 0) {
      await this.persist(database);
    }
  }

  async close(): Promise<void> {
    const database = await this.databasePromise;
    database.close();
  }

  private async initialize(): Promise<Database> {
    await fs.mkdir(path.dirname(this.databasePath), { recursive: true });

    const SQL = await initSqlJs({
      locateFile: () => SQL_WASM_PATH,
    });

    let database: Database;

    try {
      const fileContents = await fs.readFile(this.databasePath);
      database = new SQL.Database(fileContents);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        throw error;
      }

      database = new SQL.Database();
    }

    database.run(`
      CREATE TABLE IF NOT EXISTS custom_cwds (
        path TEXT PRIMARY KEY NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.persist(database);
    return database;
  }

  private async persist(database: Database): Promise<void> {
    const bytes = database.export();
    await fs.writeFile(this.databasePath, Buffer.from(bytes));
  }
}