/**
 * Auth: the server is the source of truth (see api.ts). signup/login call the
 * backend and store the returned JWT. We also keep a small **local account
 * cache** (with a locally-computed salted SHA-256 hash) so a returning user can
 * still sign in **offline** on a device they've used before.
 */

import { api, ApiError, setToken } from './api';

export interface Account {
  id: string; // normalized name (lowercased)
  name: string; // display name as entered
  salt: string;
  hash: string;
  createdAt: number;
}

export interface AuthResult {
  ok: boolean;
  userId?: string;
  error?: string;
}

const ACCOUNTS_KEY = 'focus-den/accounts';
const SESSION_KEY = 'focus-den/session';

const NAME_MAX = 20;
const PASSWORD_MIN = 8;
/** Mirrors the server rule: letters/numbers first, then also space . _ ' - */
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._'-]*$/u;

// ── local cache helpers ──────────────────────────────────────────────────────

function readAccounts(): Record<string, Account> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === 'object' ? (obj as Record<string, Account>) : {};
  } catch {
    return {};
  }
}

function writeAccounts(accounts: Record<string, Account>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch {
    // ignore
  }
}

function setSession(id: string | null): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (id) localStorage.setItem(SESSION_KEY, id);
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

// ── local hashing (offline-login cache only) ─────────────────────────────────

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

function randomSalt(): string {
  const a = new Uint8Array(8);
  const c = globalThis.crypto;
  if (c?.getRandomValues) c.getRandomValues(a);
  else for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
  return toHex(a);
}

function djb2(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return `w${h.toString(16)}`;
}

/**
 * PBKDF2-SHA256 (150k iterations) — slow enough that a stolen laptop's cached
 * hash can't be brute-forced quickly. `v2:`-prefixed to distinguish from the
 * legacy single-round SHA-256 caches, which remain verifiable until the next
 * online sign-in refreshes them.
 */
async function hashPassword(password: string, salt: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const enc = new TextEncoder();
    const key = await subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 150_000 },
      key,
      256,
    );
    return `v2:${toHex(new Uint8Array(bits))}`;
  }
  return djb2(`${salt}:${password}`);
}

/** Legacy cache format: single-round SHA-256 (or djb2 without WebCrypto). */
async function legacyHash(password: string, salt: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  const input = `${salt}:${password}`;
  if (subtle) {
    const buf = await subtle.digest('SHA-256', new TextEncoder().encode(input));
    return toHex(new Uint8Array(buf));
  }
  return djb2(input);
}

/** Verify against either hash generation (old caches upgrade on next online login). */
async function verifyLocal(password: string, salt: string, storedHash: string): Promise<boolean> {
  if (storedHash.startsWith('v2:')) return (await hashPassword(password, salt)) === storedHash;
  return (await legacyHash(password, salt)) === storedHash;
}

/** Store/refresh a local account record so offline login works next time. */
async function cacheAccount(id: string, name: string, password: string): Promise<void> {
  const salt = randomSalt();
  const hash = await hashPassword(password, salt);
  const accounts = readAccounts();
  accounts[id] = { id, name, salt, hash, createdAt: accounts[id]?.createdAt ?? Date.now() };
  writeAccounts(accounts);
}

// ── public API ───────────────────────────────────────────────────────────────

export function idFor(name: string): string {
  return name.trim().toLowerCase();
}

export function listAccounts(): Account[] {
  return Object.values(readAccounts());
}

export function getAccount(id: string): Account | undefined {
  return readAccounts()[id];
}

export function currentUserId(): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(SESSION_KEY) || null;
  } catch {
    return null;
  }
}

export function logout(): void {
  setSession(null);
}

export async function signup(name: string, password: string): Promise<AuthResult> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: 'Enter a name.' };
  if (trimmed.length > NAME_MAX) return { ok: false, error: `Name must be ${NAME_MAX} characters or fewer.` };
  if (!NAME_RE.test(trimmed)) {
    return { ok: false, error: "Names can use letters, numbers, spaces and . _ ' -" };
  }
  if (password.length < PASSWORD_MIN) {
    return { ok: false, error: `Password must be at least ${PASSWORD_MIN} characters.` };
  }
  try {
    const res = await api.signup(trimmed, password);
    setToken(res.token);
    await cacheAccount(res.userId, res.name, password);
    setSession(res.userId);
    return { ok: true, userId: res.userId };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    return { ok: false, error: 'Can’t reach the server. Connect to the internet to create an account.' };
  }
}

export async function login(name: string, password: string): Promise<AuthResult> {
  const id = idFor(name);
  try {
    const res = await api.login(name, password);
    setToken(res.token);
    await cacheAccount(res.userId, res.name, password);
    setSession(res.userId);
    return { ok: true, userId: res.userId };
  } catch (err) {
    if (err instanceof ApiError) {
      // Real auth failure (wrong password, etc.) — don't fall back.
      return { ok: false, error: err.message };
    }
    // Network error → offline fallback if we've signed in on this device before.
    const cached = readAccounts()[id];
    if (cached) {
      if (await verifyLocal(password, cached.salt, cached.hash)) {
        setSession(id);
        return { ok: true, userId: id };
      }
      return { ok: false, error: 'Incorrect password.' };
    }
    return { ok: false, error: 'Can’t reach the server. Connect to the internet to sign in the first time.' };
  }
}

/** Remove the local account cache + end the session (server delete is handled by the store). */
export function deleteAccount(id: string): void {
  const accounts = readAccounts();
  delete accounts[id];
  writeAccounts(accounts);
  if (currentUserId() === id) logout();
}
