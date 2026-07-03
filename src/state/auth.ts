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
  /** admin status as reported by the server at the last online sign-in */
  isAdmin?: boolean;
  /** account email (normalized) as of the last online sign-in */
  email?: string | null;
  emailVerified?: boolean;
}

/** Server-reported facts cached alongside the offline-login hash. */
interface AccountFacts {
  isAdmin: boolean;
  email: string | null;
  emailVerified: boolean;
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
/** Mirrors the server's pragmatic email shape check. */
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@.]{2,24}$/;

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
async function cacheAccount(id: string, name: string, password: string, facts: AccountFacts): Promise<void> {
  const salt = randomSalt();
  const hash = await hashPassword(password, salt);
  const accounts = readAccounts();
  accounts[id] = {
    id,
    name,
    salt,
    hash,
    createdAt: accounts[id]?.createdAt ?? Date.now(),
    ...facts,
  };
  writeAccounts(accounts);
}

function factsOf(res: { isAdmin?: boolean; email?: string | null; emailVerified?: boolean }): AccountFacts {
  return {
    isAdmin: res.isAdmin === true,
    email: res.email ?? null,
    emailVerified: res.emailVerified === true,
  };
}

/** Update the cached server facts (email/verified/admin) without touching the hash. */
export function updateAccountFacts(id: string, facts: Partial<AccountFacts>): void {
  const accounts = readAccounts();
  if (!accounts[id]) return;
  accounts[id] = { ...accounts[id], ...facts };
  writeAccounts(accounts);
}

/** Re-hash the offline-login cache after an in-app password change. */
export async function updateCachedPassword(id: string, password: string): Promise<void> {
  const account = readAccounts()[id];
  if (!account) return;
  const salt = randomSalt();
  const hash = await hashPassword(password, salt);
  const accounts = readAccounts();
  accounts[id] = { ...account, salt, hash };
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

export async function signup(name: string, email: string, password: string): Promise<AuthResult> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: 'Enter a name.' };
  if (trimmed.length > NAME_MAX) return { ok: false, error: `Name must be ${NAME_MAX} characters or fewer.` };
  if (!NAME_RE.test(trimmed)) {
    return { ok: false, error: "Names can use letters, numbers, spaces and . _ ' -" };
  }
  if (!EMAIL_RE.test(email.trim().toLowerCase())) {
    return { ok: false, error: 'Enter a valid email address.' };
  }
  if (password.length < PASSWORD_MIN) {
    return { ok: false, error: `Password must be at least ${PASSWORD_MIN} characters.` };
  }
  try {
    const res = await api.signup(trimmed, email.trim(), password);
    setToken(res.token);
    await cacheAccount(res.userId, res.name, password, factsOf(res));
    setSession(res.userId);
    return { ok: true, userId: res.userId };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    return { ok: false, error: 'Can’t reach the server. Connect to the internet to create an account.' };
  }
}

/** Sign in with a username OR an email address. */
export async function login(identifier: string, password: string): Promise<AuthResult> {
  const who = identifier.trim();
  try {
    const res = await api.login(who, password);
    setToken(res.token);
    await cacheAccount(res.userId, res.name, password, factsOf(res));
    setSession(res.userId);
    return { ok: true, userId: res.userId };
  } catch (err) {
    if (err instanceof ApiError) {
      // Real auth failure (wrong password, etc.) — don't fall back.
      return { ok: false, error: err.message };
    }
    // Network error → offline fallback if we've signed in on this device before.
    const cached = who.includes('@')
      ? Object.values(readAccounts()).find((a) => a.email === who.toLowerCase())
      : readAccounts()[idFor(who)];
    if (cached) {
      if (await verifyLocal(password, cached.salt, cached.hash)) {
        setSession(cached.id);
        return { ok: true, userId: cached.id };
      }
      return { ok: false, error: 'Incorrect password.' };
    }
    return { ok: false, error: 'Can’t reach the server. Connect to the internet to sign in the first time.' };
  }
}

/** Ask the server to email a reset link. Response is always generic. */
export async function requestPasswordReset(email: string): Promise<AuthResult> {
  if (!EMAIL_RE.test(email.trim().toLowerCase())) {
    return { ok: false, error: 'Enter a valid email address.' };
  }
  try {
    await api.forgotPassword(email.trim());
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    return { ok: false, error: 'Can’t reach the server — try again when online.' };
  }
}

/** Confirm an email address from a verification link. */
export async function confirmEmail(token: string): Promise<AuthResult> {
  try {
    await api.verifyEmail(token);
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    return { ok: false, error: 'Can’t reach the server — try again when online.' };
  }
}

/** Finish a password reset from an emailed link: signs this device in. */
export async function completeReset(token: string, password: string): Promise<AuthResult> {
  if (password.length < PASSWORD_MIN) {
    return { ok: false, error: `Password must be at least ${PASSWORD_MIN} characters.` };
  }
  try {
    const res = await api.resetPassword(token, password);
    setToken(res.token);
    await cacheAccount(res.userId, res.name, password, factsOf(res));
    setSession(res.userId);
    return { ok: true, userId: res.userId };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    return { ok: false, error: 'Can’t reach the server — try again when online.' };
  }
}

/** Remove the local account cache + end the session (server delete is handled by the store). */
export function deleteAccount(id: string): void {
  const accounts = readAccounts();
  delete accounts[id];
  writeAccounts(accounts);
  if (currentUserId() === id) logout();
}
