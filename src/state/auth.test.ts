import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getAccount, idFor, listAccounts, login, logout, signup } from './auth';

// In-memory localStorage so auth's local cache + token work in node.
function installStorage() {
  const map = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

// A tiny in-memory backend behind a stubbed fetch.
const users = new Map<string, { name: string; password: string }>();

function jsonRes(status: number, obj: unknown): Response {
  return {
    ok: status < 400,
    status,
    statusText: '',
    json: async () => obj,
  } as unknown as Response;
}

function installFetch(offline = false) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (offline) throw new TypeError('network down');
      const path = String(url);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (path.endsWith('/api/auth/signup')) {
        const id = String(body.name).trim().toLowerCase();
        if (users.has(id)) return jsonRes(409, { error: 'That name is taken — try signing in.' });
        users.set(id, { name: String(body.name).trim(), password: body.password });
        return jsonRes(200, { token: `t.${id}`, userId: id, name: String(body.name).trim() });
      }
      if (path.endsWith('/api/auth/login')) {
        const id = String(body.name).trim().toLowerCase();
        const u = users.get(id);
        if (!u || u.password !== body.password) return jsonRes(401, { error: 'Incorrect name or password.' });
        return jsonRes(200, { token: `t.${id}`, userId: id, name: u.name });
      }
      return jsonRes(404, { error: 'not found' });
    }),
  );
}

beforeEach(() => {
  installStorage();
  users.clear();
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('auth (API-backed with offline fallback)', () => {
  it('normalizes names to a case-insensitive id', () => {
    expect(idFor('  Sam ')).toBe('sam');
    expect(idFor('SAM')).toBe('sam');
  });

  it('signs up via the server and caches the account locally', async () => {
    const res = await signup('Sam', 'hunter22');
    expect(res.ok).toBe(true);
    expect(res.userId).toBe('sam');
    expect(listAccounts()).toHaveLength(1);
    expect(getAccount('sam')?.name).toBe('Sam');
  });

  it('never caches the password in plaintext', async () => {
    await signup('Sam', 'hunter22');
    const acc = getAccount('sam')!;
    expect(acc.hash).not.toContain('hunter22');
    expect(acc.salt.length).toBeGreaterThan(0);
  });

  it('rejects short passwords before hitting the server', async () => {
    const res = await signup('Sam', 'no');
    expect(res.ok).toBe(false);
    expect(users.size).toBe(0);
  });

  it('rejects a duplicate name (server 409)', async () => {
    await signup('Sam', 'hunter22');
    const dup = await signup('SAM', 'whatever');
    expect(dup.ok).toBe(false);
    expect(dup.error).toMatch(/taken/i);
  });

  it('logs in with the correct password and rejects a wrong one', async () => {
    await signup('Sam', 'hunter22');
    logout();
    expect((await login('Sam', 'wrong')).ok).toBe(false);
    const good = await login('sam', 'hunter22');
    expect(good.ok).toBe(true);
    expect(good.userId).toBe('sam');
  });

  it('falls back to the local cache when offline', async () => {
    await signup('Sam', 'hunter22'); // online: caches account locally
    logout();
    installFetch(true); // now offline
    const offline = await login('Sam', 'hunter22');
    expect(offline.ok).toBe(true);
    expect(offline.userId).toBe('sam');
    expect((await login('Sam', 'wrongpass')).ok).toBe(false);
  });
});
