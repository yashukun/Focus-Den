/**
 * SQLite persistence via Node's built-in `node:sqlite` (Node ≥ 22.5) — still
 * zero external/native dependencies. This is the default store: a real single-
 * file database with transactions plus a bounded per-user revision history
 * (last MAX_REVISIONS accepted writes), so a bad sync can be rolled back.
 */

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DatabaseSync as SqliteDatabase } from 'node:sqlite';
import {
  MAX_REVISIONS,
  type RevisionMeta,
  type StateRow,
  type StateStore,
  type UserRow,
} from './store';

// Loaded via getBuiltinModule (not a static import) so bundlers that predate
// the `node:sqlite` builtin (e.g. vitest's vite) don't try to resolve it.
const { DatabaseSync } = process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite');

export class SqliteStore implements StateStore {
  private db: SqliteDatabase;

  /** Pass ':memory:' (the default) for an ephemeral store (tests). */
  constructor(filePath = ':memory:') {
    if (filePath !== ':memory:') mkdirSync(dirname(filePath), { recursive: true });
    this.db = new DatabaseSync(filePath);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS users (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        salt          TEXT NOT NULL,
        hash          TEXT NOT NULL,
        createdAt     INTEGER NOT NULL,
        tokenVersion  INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS states (
        userId    TEXT PRIMARY KEY,
        doc       TEXT NOT NULL,
        rev       INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS revisions (
        userId    TEXT NOT NULL,
        rev       INTEGER NOT NULL,
        doc       TEXT NOT NULL,
        updatedAt INTEGER NOT NULL,
        storedAt  INTEGER NOT NULL,
        PRIMARY KEY (userId, rev)
      );
    `);
    // Databases created before this column existed migrate in place. (Databases
    // from the removed email flows may also carry email columns and an
    // email_tokens table — both are simply ignored.)
    try {
      this.db.exec('ALTER TABLE users ADD COLUMN tokenVersion INTEGER NOT NULL DEFAULT 1');
    } catch {
      // column already exists
    }
  }

  getUser(id: string): UserRow | undefined {
    return this.db
      .prepare('SELECT id, name, salt, hash, createdAt, tokenVersion FROM users WHERE id = ?')
      .get(id) as UserRow | undefined;
  }

  createUser(user: UserRow): void {
    this.db
      .prepare(
        `INSERT INTO users (id, name, salt, hash, createdAt, tokenVersion)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, salt = excluded.salt,
           hash = excluded.hash, createdAt = excluded.createdAt,
           tokenVersion = excluded.tokenVersion`,
      )
      .run(user.id, user.name, user.salt, user.hash, user.createdAt, user.tokenVersion ?? 1);
  }

  deleteUser(id: string): void {
    this.db.prepare('DELETE FROM users WHERE id = ?').run(id);
    this.db.prepare('DELETE FROM states WHERE userId = ?').run(id);
    this.db.prepare('DELETE FROM revisions WHERE userId = ?').run(id);
  }

  getState(userId: string): StateRow | undefined {
    return this.db
      .prepare('SELECT doc, rev, updatedAt FROM states WHERE userId = ?')
      .get(userId) as StateRow | undefined;
  }

  putState(userId: string, doc: string, rev: number, updatedAt: number): StateRow {
    // One transaction: the state row, its revision, and the prune land (or
    // roll back) together — a crash can't leave a state without its revision.
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db
        .prepare(
          `INSERT INTO states (userId, doc, rev, updatedAt) VALUES (?, ?, ?, ?)
           ON CONFLICT(userId) DO UPDATE SET doc = excluded.doc, rev = excluded.rev, updatedAt = excluded.updatedAt`,
        )
        .run(userId, doc, rev, updatedAt);
      this.db
        .prepare(
          `INSERT INTO revisions (userId, rev, doc, updatedAt, storedAt) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(userId, rev) DO UPDATE SET doc = excluded.doc, updatedAt = excluded.updatedAt, storedAt = excluded.storedAt`,
        )
        .run(userId, rev, doc, updatedAt, Date.now());
      this.db
        .prepare(
          `DELETE FROM revisions WHERE userId = ?
           AND rev NOT IN (SELECT rev FROM revisions WHERE userId = ? ORDER BY rev DESC LIMIT ?)`,
        )
        .run(userId, userId, MAX_REVISIONS);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    return { doc, rev, updatedAt };
  }

  listRevisions(userId: string): RevisionMeta[] {
    return this.db
      .prepare('SELECT rev, updatedAt, storedAt FROM revisions WHERE userId = ? ORDER BY rev DESC')
      .all(userId) as unknown as RevisionMeta[];
  }

  getRevision(userId: string, rev: number): StateRow | undefined {
    return this.db
      .prepare('SELECT doc, rev, updatedAt FROM revisions WHERE userId = ? AND rev = ?')
      .get(userId, rev) as StateRow | undefined;
  }

}

/**
 * One-time import from the legacy JSON-file store (skips users that already
 * exist). Returns the number of profiles imported.
 */
export function importLegacyJson(store: StateStore, jsonPath: string): number {
  if (!existsSync(jsonPath)) return 0;
  let parsed: { users?: Record<string, UserRow>; states?: Record<string, StateRow> };
  try {
    parsed = JSON.parse(readFileSync(jsonPath, 'utf8'));
  } catch (err) {
    console.error('[focus-den] could not read legacy db.json, skipping import:', err);
    return 0;
  }
  const states = parsed.states ?? {};
  let imported = 0;
  for (const user of Object.values(parsed.users ?? {})) {
    if (store.getUser(user.id)) continue;
    store.createUser(user);
    const st = states[user.id];
    if (st) store.putState(user.id, st.doc, st.rev ?? 1, st.updatedAt ?? 0);
    imported += 1;
  }
  return imported;
}
