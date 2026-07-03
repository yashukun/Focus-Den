/**
 * Persistence behind a small interface so the storage engine can be swapped
 * (JSON file for local dev → Postgres/SQLite for deploy) without touching the
 * routes. The default `Store` is a JSON-file document store: dead simple, no
 * native deps, perfect for local-first single-user use.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface UserRow {
  id: string; // normalized (lowercased) name
  name: string; // display name
  salt: string;
  hash: string;
  createdAt: number;
  /** bumped on password reset to revoke all previously issued tokens */
  tokenVersion?: number;
  /** normalized (lowercased) email — required for new signups; legacy rows may lack it */
  email?: string;
  /** set once the user clicks the verification link (unlocks password recovery) */
  emailVerified?: boolean;
}

/** Single-use email tokens (password reset / email verification). Hashed at rest. */
export interface EmailTokenRow {
  tokenHash: string;
  userId: string;
  kind: 'reset' | 'verify';
  expiresAt: number;
}

export interface StateRow {
  doc: string; // JSON.stringify(State)
  rev: number;
  updatedAt: number;
}

export interface RevisionMeta {
  rev: number;
  updatedAt: number;
  /** server receipt time when this revision was written */
  storedAt: number;
}

/** How many past revisions to keep per user (disaster-recovery window). */
export const MAX_REVISIONS = 30;

export interface StateStore {
  getUser(id: string): UserRow | undefined;
  getUserByEmail(email: string): UserRow | undefined;
  /** Create-or-replace by id (routes guard uniqueness; admin scripts overwrite). */
  createUser(user: UserRow): void;
  deleteUser(id: string): void; // also drops the user's state + revisions + tokens
  getState(userId: string): StateRow | undefined;
  putState(userId: string, doc: string, rev: number, updatedAt: number): StateRow;
  /** Revision metadata, newest first. */
  listRevisions(userId: string): RevisionMeta[];
  getRevision(userId: string, rev: number): StateRow | undefined;
  /** Replaces any existing token of the same kind for the user (single active token). */
  putEmailToken(token: EmailTokenRow): void;
  /** Returns a live (unexpired) token row, or undefined. */
  getEmailToken(tokenHash: string): EmailTokenRow | undefined;
  deleteEmailToken(tokenHash: string): void;
}

type RevisionRow = StateRow & { storedAt: number };

interface Db {
  users: Record<string, UserRow>;
  states: Record<string, StateRow>;
  revisions: Record<string, RevisionRow[]>; // ascending by rev
  emailTokens: Record<string, EmailTokenRow>; // keyed by tokenHash
}

export class Store implements StateStore {
  private db: Db = { users: {}, states: {}, revisions: {}, emailTokens: {} };

  /** Pass a filePath to persist to disk; omit for an in-memory store (tests). */
  constructor(private filePath?: string) {
    if (filePath) this.load();
  }

  private load(): void {
    try {
      if (this.filePath && existsSync(this.filePath)) {
        const parsed = JSON.parse(readFileSync(this.filePath, 'utf8'));
        this.db = {
          users: parsed.users ?? {},
          states: parsed.states ?? {},
          revisions: parsed.revisions ?? {},
          emailTokens: parsed.emailTokens ?? {},
        };
      }
    } catch (err) {
      console.error('[focus-den] failed to load db, starting empty:', err);
    }
  }

  private persist(): void {
    if (!this.filePath) return;
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(this.filePath, JSON.stringify(this.db));
    } catch (err) {
      console.error('[focus-den] failed to persist db:', err);
    }
  }

  getUser(id: string): UserRow | undefined {
    return this.db.users[id];
  }

  getUserByEmail(email: string): UserRow | undefined {
    return Object.values(this.db.users).find((u) => u.email === email);
  }

  createUser(user: UserRow): void {
    this.db.users[user.id] = user;
    this.persist();
  }

  deleteUser(id: string): void {
    delete this.db.users[id];
    delete this.db.states[id];
    delete this.db.revisions[id];
    for (const [hash, t] of Object.entries(this.db.emailTokens)) {
      if (t.userId === id) delete this.db.emailTokens[hash];
    }
    this.persist();
  }

  getState(userId: string): StateRow | undefined {
    return this.db.states[userId];
  }

  putState(userId: string, doc: string, rev: number, updatedAt: number): StateRow {
    const row: StateRow = { doc, rev, updatedAt };
    this.db.states[userId] = row;
    const kept = (this.db.revisions[userId] ?? []).filter((r) => r.rev !== rev);
    kept.push({ ...row, storedAt: Date.now() });
    this.db.revisions[userId] = kept.slice(-MAX_REVISIONS);
    this.persist();
    return row;
  }

  listRevisions(userId: string): RevisionMeta[] {
    return (this.db.revisions[userId] ?? [])
      .map(({ rev, updatedAt, storedAt }) => ({ rev, updatedAt, storedAt }))
      .reverse();
  }

  getRevision(userId: string, rev: number): StateRow | undefined {
    const found = (this.db.revisions[userId] ?? []).find((r) => r.rev === rev);
    return found ? { doc: found.doc, rev: found.rev, updatedAt: found.updatedAt } : undefined;
  }

  putEmailToken(token: EmailTokenRow): void {
    // One active token per user+kind — a new request invalidates the old link.
    for (const [hash, t] of Object.entries(this.db.emailTokens)) {
      if (t.userId === token.userId && t.kind === token.kind) delete this.db.emailTokens[hash];
      else if (t.expiresAt < Date.now()) delete this.db.emailTokens[hash]; // lazy cleanup
    }
    this.db.emailTokens[token.tokenHash] = token;
    this.persist();
  }

  getEmailToken(tokenHash: string): EmailTokenRow | undefined {
    const t = this.db.emailTokens[tokenHash];
    return t && t.expiresAt >= Date.now() ? t : undefined;
  }

  deleteEmailToken(tokenHash: string): void {
    delete this.db.emailTokens[tokenHash];
    this.persist();
  }
}
