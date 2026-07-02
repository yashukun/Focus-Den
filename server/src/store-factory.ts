/**
 * Store construction, shared by the server entrypoint and admin scripts:
 * SQLite by default, the legacy JSON-file store for `.json` paths, and a
 * one-time import of an old db.json into a fresh SQLite database.
 */

import { existsSync } from 'node:fs';
import { importLegacyJson, SqliteStore } from './sqlite-store';
import { Store, type StateStore } from './store';

export function makeStore(dbPath: string, legacyJsonPath?: string): StateStore {
  if (dbPath.endsWith('.json')) return new Store(dbPath);
  const fresh = !existsSync(dbPath);
  const store = new SqliteStore(dbPath);
  if (fresh && legacyJsonPath) {
    const imported = importLegacyJson(store, legacyJsonPath);
    if (imported) console.log(`[focus-den] imported ${imported} profile(s) from legacy db.json`);
  }
  return store;
}
