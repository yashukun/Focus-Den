import { describe, expect, it } from 'vitest';
import { defaultState } from '../../src/core';
import { buildApp } from '../src/app';
import { SqliteStore } from '../src/sqlite-store';
import { Store, type StateStore } from '../src/store';

// Every test runs against both engines — proves the store swap is behavior-safe.
const ENGINES: [string, () => StateStore][] = [
  ['json', () => new Store()],
  ['sqlite', () => new SqliteStore()],
];

describe.each(ENGINES)('backend API (%s store)', (_engine, makeStore) => {
  const makeApp = () => buildApp(makeStore(), 'test-secret'); // in-memory store
  it('signup → login → put/get round-trip, LWW, validation, auth', async () => {
    const app = await makeApp();

    // signup
    const su = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { name: 'Sam', password: 'pass1234' } });
    expect(su.statusCode).toBe(200);
    const token: string = su.json().token;
    expect(token).toBeTruthy();
    const auth = { authorization: `Bearer ${token}` };

    // duplicate name (case-insensitive) → 409
    const dup = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { name: 'sam', password: 'pass1234' } });
    expect(dup.statusCode).toBe(409);

    // short password → 400
    const short = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { name: 'Ann', password: 'no' } });
    expect(short.statusCode).toBe(400);

    // wrong password → 401
    const bad = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { name: 'Sam', password: 'nope' } });
    expect(bad.statusCode).toBe(401);

    // login ok — by `name` and by the client's `identifier` field
    const ok = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { name: 'Sam', password: 'pass1234' } });
    expect(ok.statusCode).toBe(200);
    const okId = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { identifier: 'sam', password: 'pass1234' } });
    expect(okId.statusCode).toBe(200);

    // default state
    const g0 = await app.inject({ method: 'GET', url: '/api/state', headers: auth });
    expect(g0.statusCode).toBe(200);
    expect(g0.json().doc.v).toBe(2);

    // PUT newer accepted, GET reflects it
    const doc = { ...defaultState(), points: 42 };
    const p1 = await app.inject({ method: 'PUT', url: '/api/state', headers: auth, payload: { doc, updatedAt: 1000 } });
    expect(p1.json().accepted).toBe(true);
    const g1 = await app.inject({ method: 'GET', url: '/api/state', headers: auth });
    expect(g1.json().doc.points).toBe(42);

    // PUT older rejected, returns serverDoc unchanged
    const p2 = await app.inject({ method: 'PUT', url: '/api/state', headers: auth, payload: { doc: { ...defaultState(), points: 7 }, updatedAt: 500 } });
    expect(p2.json().accepted).toBe(false);
    expect(p2.json().serverDoc.points).toBe(42);

    // invalid blob → 422
    const p3 = await app.inject({ method: 'PUT', url: '/api/state', headers: auth, payload: { doc: { v: 99 }, updatedAt: 2000 } });
    expect(p3.statusCode).toBe(422);

    // no token → 401
    const noAuth = await app.inject({ method: 'GET', url: '/api/state' });
    expect(noAuth.statusCode).toBe(401);

    // deletion requires the password — a stolen bearer token alone won't do.
    const delNoPw = await app.inject({ method: 'DELETE', url: '/api/account', headers: auth });
    expect(delNoPw.statusCode).toBe(401);
    const delBadPw = await app.inject({ method: 'DELETE', url: '/api/account', headers: auth, payload: { password: 'wrong-guess' } });
    expect(delBadPw.statusCode).toBe(401);

    // delete account → the user row is gone AND the old token is dead (no
    // route can lazily resurrect a "ghost" state for a deleted account).
    const del = await app.inject({ method: 'DELETE', url: '/api/account', headers: auth, payload: { password: 'pass1234' } });
    expect(del.statusCode).toBe(200);
    const relogin = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { name: 'Sam', password: 'pass1234' } });
    expect(relogin.statusCode).toBe(401); // user removed
    const ghost = await app.inject({ method: 'GET', url: '/api/state', headers: auth });
    expect(ghost.statusCode).toBe(401); // stale token rejected
  });

  it('health check', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    expect(typeof res.json().time).toBe('number');
  });

  it('clamps future client timestamps to the server clock', async () => {
    const app = await makeApp();
    const su = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { name: 'Kim', password: 'pass1234' } });
    const auth = { authorization: `Bearer ${su.json().token}` };

    // A device claiming an edit 10 minutes in the future gets clamped to now.
    const farFuture = Date.now() + 10 * 60_000;
    const p1 = await app.inject({ method: 'PUT', url: '/api/state', headers: auth, payload: { doc: { ...defaultState(), points: 1 }, updatedAt: farFuture } });
    expect(p1.json().accepted).toBe(true);
    expect(p1.json().updatedAt).toBeLessThanOrEqual(Date.now());

    // So an honest later write from another device still wins.
    const p2 = await app.inject({ method: 'PUT', url: '/api/state', headers: auth, payload: { doc: { ...defaultState(), points: 2 }, updatedAt: Date.now() } });
    expect(p2.json().accepted).toBe(true);
  });

  it('rejects names with control or symbol characters', async () => {
    const app = await makeApp();
    for (const name of ['a\tb', '<script>', '../etc', 'x'.repeat(2)+'\u202e']) {
      const res = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { name, password: 'pass1234' } });
      expect(res.statusCode).toBe(400);
    }
    const ok = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { name: "Sam O'Neil-2", password: 'pass1234' } });
    expect(ok.statusCode).toBe(200);
  });

  it('revokes old tokens when the password is reset (tokenVersion bump)', async () => {
    const store = makeStore();
    const app = await buildApp(store, 'test-secret');
    const su = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { name: 'Rey', password: 'pass1234' } });
    const oldAuth = { authorization: `Bearer ${su.json().token}` };

    // old token works…
    expect((await app.inject({ method: 'GET', url: '/api/state', headers: oldAuth })).statusCode).toBe(200);

    // …admin resets the password (as scripts/reset-password.ts does)…
    const user = store.getUser('rey')!;
    store.createUser({ ...user, tokenVersion: (user.tokenVersion ?? 1) + 1 });

    // …old token is now dead; a fresh login works and gets a valid token.
    expect((await app.inject({ method: 'GET', url: '/api/state', headers: oldAuth })).statusCode).toBe(401);
    const relogin = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { name: 'Rey', password: 'pass1234' } });
    expect(relogin.statusCode).toBe(200);
    const fresh = { authorization: `Bearer ${relogin.json().token}` };
    expect((await app.inject({ method: 'GET', url: '/api/state', headers: fresh })).statusCode).toBe(200);
  });

  it('flags only the designated admin account', async () => {
    const app = await buildApp(makeStore(), 'test-secret', { adminUser: 'boss' });
    const boss = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { name: 'Boss', password: 'pass1234' } });
    expect(boss.json().isAdmin).toBe(true);
    const pal = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { name: 'Pal', password: 'pass1234' } });
    expect(pal.json().isAdmin).toBe(false);
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { name: 'boss', password: 'pass1234' } });
    expect(login.json().isAdmin).toBe(true);

    // No adminUser configured (production default) → nobody is admin.
    const strict = await buildApp(makeStore(), 'test-secret');
    const su = await strict.inject({ method: 'POST', url: '/api/auth/signup', payload: { name: 'Solo', password: 'pass1234' } });
    expect(su.json().isAdmin).toBe(false);

    // '*' (dev fallback) → everyone is admin.
    const dev = await buildApp(makeStore(), 'test-secret', { adminUser: '*' });
    const anyone = await dev.inject({ method: 'POST', url: '/api/auth/signup', payload: { name: 'Anyone', password: 'pass1234' } });
    expect(anyone.json().isAdmin).toBe(true);
  });

  it('rate-limits repeated auth attempts', async () => {
    const app = await makeApp();
    let limited = 0;
    for (let i = 0; i < 12; i++) {
      const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { name: 'Sam', password: `wrong-${i}` } });
      if (res.statusCode === 429) limited++;
      else expect(res.statusCode).toBe(401);
    }
    expect(limited).toBeGreaterThan(0); // budget is 10/min → attempts 11+ get 429
  });

  it('keeps revision history and restores a chosen revision', async () => {
    const app = await makeApp();
    const su = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { name: 'Rev', password: 'pass1234' } });
    const auth = { authorization: `Bearer ${su.json().token}` };

    await app.inject({ method: 'PUT', url: '/api/state', headers: auth, payload: { doc: { ...defaultState(), points: 10 }, updatedAt: 1000 } });
    await app.inject({ method: 'PUT', url: '/api/state', headers: auth, payload: { doc: { ...defaultState(), points: 20 }, updatedAt: 2000 } });

    // Newest first: rev 2 (points 20), rev 1 (points 10), rev 0 (signup seed).
    const list = await app.inject({ method: 'GET', url: '/api/state/revisions', headers: auth });
    expect(list.statusCode).toBe(200);
    const revisions = list.json().revisions;
    expect(revisions.map((r: { rev: number }) => r.rev)).toEqual([2, 1, 0]);

    // Restore rev 1 → becomes the newest copy (rev 3, server-stamped).
    const res = await app.inject({ method: 'POST', url: '/api/state/revisions/1/restore', headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json().doc.points).toBe(10);
    expect(res.json().rev).toBe(3);
    expect(res.json().updatedAt).toBeLessThanOrEqual(Date.now());

    const g = await app.inject({ method: 'GET', url: '/api/state', headers: auth });
    expect(g.json().doc.points).toBe(10);

    // Unknown revision → 404; garbage → 400.
    const missing = await app.inject({ method: 'POST', url: '/api/state/revisions/99/restore', headers: auth });
    expect(missing.statusCode).toBe(404);
    const bad = await app.inject({ method: 'POST', url: '/api/state/revisions/nope/restore', headers: auth });
    expect(bad.statusCode).toBe(400);
  });

  it('account management: change password, logout-all', async () => {
    const app = await makeApp();
    const su = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { name: 'Mgr', password: 'pass1234' } });
    let auth = { authorization: `Bearer ${su.json().token}` };

    // account view (never exposes hash/salt)
    const info = await app.inject({ method: 'GET', url: '/api/account', headers: auth });
    expect(info.json()).toMatchObject({ userId: 'mgr', name: 'Mgr' });
    expect(info.json().hash).toBeUndefined();

    // change password: wrong current → 401; success → this device re-keyed, others dead
    expect((await app.inject({ method: 'POST', url: '/api/account/password', headers: auth, payload: { currentPassword: 'nope', newPassword: 'newpass9999' } })).statusCode).toBe(401);
    const chg = await app.inject({ method: 'POST', url: '/api/account/password', headers: auth, payload: { currentPassword: 'pass1234', newPassword: 'newpass9999' } });
    expect(chg.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/account', headers: auth })).statusCode).toBe(401);
    auth = { authorization: `Bearer ${chg.json().token}` };
    expect((await app.inject({ method: 'GET', url: '/api/account', headers: auth })).statusCode).toBe(200);

    // sign out everywhere: same re-key pattern
    const la = await app.inject({ method: 'POST', url: '/api/account/logout-all', headers: auth });
    expect(la.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/account', headers: auth })).statusCode).toBe(401);
    auth = { authorization: `Bearer ${la.json().token}` };
    expect((await app.inject({ method: 'GET', url: '/api/account', headers: auth })).statusCode).toBe(200);

    // old password is dead, the new one signs in
    expect((await app.inject({ method: 'POST', url: '/api/auth/login', payload: { name: 'Mgr', password: 'pass1234' } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/auth/login', payload: { name: 'Mgr', password: 'newpass9999' } })).statusCode).toBe(200);
  });

  it('rate-limits account deletion — no faster password-guessing oracle than login', async () => {
    const app = await makeApp();
    const su = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { name: 'Del', password: 'pass1234' } });
    const auth = { authorization: `Bearer ${su.json().token}` };

    let limited = 0;
    for (let i = 0; i < 12; i++) {
      const res = await app.inject({ method: 'DELETE', url: '/api/account', headers: auth, payload: { password: `wrong-${i}` } });
      if (res.statusCode === 429) limited++;
      else expect(res.statusCode).toBe(401);
    }
    expect(limited).toBeGreaterThan(0); // budget is 10/min → attempts 11+ get 429
  });
});
