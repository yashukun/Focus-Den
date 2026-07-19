/**
 * The HTTP API. A validated per-user document store — it does NOT re-run game
 * rules (those stay client-side in src/core); this is cross-device sync for a
 * small circle of trusted users. Every incoming blob is validated with the SAME
 * `coerceState` the client uses (imported from src/core — the "reuse core" win
 * of staying in TypeScript).
 *
 * Level-1 hardening (trusted-circle deploys): strict rate limits on the auth
 * routes (anti-brute-force), a body-size cap on state documents, tokens die
 * with their account, and (when built) the frontend is served from this same
 * process so one small box runs the whole app.
 */

import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { coerceState, defaultState } from '../../src/core';
import { hashPassword, signToken, verifyPassword, verifyToken } from './auth';
import { ConsoleMailer, type Mailer } from './email';
import { shouldAccept } from './reconcile';
import type { StateStore, UserRow } from './store';

const NAME_MAX = 20;
const PASSWORD_MIN = 8;
/** Printable display names: start with a letter/number, then the same plus space . _ ' - */
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._'-]*$/u;
/** Pragmatic email shape check (real validation is the verification link). */
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@.]{2,24}$/;
const idFor = (name: string) => name.trim().toLowerCase();
const emailFor = (email: string) => email.trim().toLowerCase();

const RESET_TTL_MS = 30 * 60 * 1000; // password-reset links live 30 minutes
const VERIFY_TTL_MS = 7 * 24 * 60 * 60 * 1000; // verification links live 7 days

/** Random single-use token: raw goes in the email, only the hash is stored. */
function makeEmailToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('base64url');
  return { raw, hash: createHash('sha256').update(raw).digest('hex') };
}

const hashOf = (raw: string) => createHash('sha256').update(raw).digest('hex');

/** Max state-document upload. Years of history fit in well under this. */
const BODY_LIMIT = 512 * 1024;

/** Strict per-IP budget for signup/login attempts (anti-brute-force). */
const AUTH_RATE = { max: 10, timeWindow: '1 minute' } as const;

interface AuthedRequest extends FastifyRequest {
  userId?: string;
}

export interface AppOptions {
  /** Directory of the built frontend to serve (skipped if absent). */
  staticDir?: string;
  /** Trust X-Forwarded-* headers (set when behind a reverse proxy / PaaS). */
  trustProxy?: boolean;
  /** Allowed CORS origin(s); defaults to reflecting any (fine for dev). */
  corsOrigin?: string | boolean;
  /** Normalized name of the single admin account; '*' = everyone (dev), null/undefined = nobody. */
  adminUser?: string | null;
  /** Outbound email (verification / password reset). Defaults to the console mailer. */
  mailer?: Mailer;
  /** Public base URL used in email links (e.g. https://focus.example.com). */
  appUrl?: string;
}

export async function buildApp(store: StateStore, secret: string, opts: AppOptions = {}) {
  const app = Fastify({
    logger: false,
    bodyLimit: BODY_LIMIT,
    trustProxy: opts.trustProxy ?? false,
  });

  // Security headers (CSP, nosniff, frame-ancestors, …). Helmet's defaults
  // suit the SPA: all assets are same-origin and scripts are external.
  await app.register(helmet);
  await app.register(cors, { origin: opts.corsOrigin ?? true });

  // Admin gating is a UI concern (game rules are client-side by design) — the
  // server just tells the client at sign-in whether this account is the admin.
  const isAdminId = (id: string) => opts.adminUser === '*' || (!!opts.adminUser && id === opts.adminUser);

  const mailer = opts.mailer ?? new ConsoleMailer();
  const appUrl = (opts.appUrl ?? 'http://localhost:5173').replace(/\/$/, '');

  /** What the client needs to render an account (never the hash/salt). */
  const accountView = (user: UserRow) => ({
    userId: user.id,
    name: user.name,
    email: user.email ?? null,
    emailVerified: user.emailVerified === true,
    isAdmin: isAdminId(user.id),
  });

  const sendVerification = async (user: UserRow): Promise<void> => {
    if (!user.email) return;
    const { raw, hash } = makeEmailToken();
    store.putEmailToken({ tokenHash: hash, userId: user.id, kind: 'verify', expiresAt: Date.now() + VERIFY_TTL_MS });
    await mailer.send(
      user.email,
      'Verify your Focus Den email',
      `Hi ${user.name},\n\nConfirm this email address for your Focus Den account (this unlocks password recovery):\n\n${appUrl}/?verify=${raw}\n\nThe link is valid for 7 days. If you didn't create this account, ignore this email.`,
    );
  };

  // Generous global ceiling; the auth routes opt into the strict budget below.
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });

  app.get('/api/health', async () => ({ ok: true, time: Date.now() }));

  app.post(
    '/api/auth/signup',
    { config: { rateLimit: AUTH_RATE } },
    async (req, reply) => {
      const { name, email, password } = (req.body ?? {}) as {
        name?: string;
        email?: string;
        password?: string;
      };
      const trimmed = (name ?? '').trim();
      if (!trimmed) return reply.code(400).send({ error: 'Enter a name.' });
      if (trimmed.length > NAME_MAX) {
        return reply.code(400).send({ error: `Name must be ${NAME_MAX} characters or fewer.` });
      }
      if (!NAME_RE.test(trimmed)) {
        return reply.code(400).send({ error: 'Names can use letters, numbers, spaces and . _ \' -' });
      }
      const mail = emailFor(email ?? '');
      if (!EMAIL_RE.test(mail)) return reply.code(400).send({ error: 'Enter a valid email address.' });
      if (!password || password.length < PASSWORD_MIN) {
        return reply.code(400).send({ error: `Password must be at least ${PASSWORD_MIN} characters.` });
      }
      const id = idFor(trimmed);
      if (store.getUser(id)) return reply.code(409).send({ error: 'That name is taken — try signing in.' });
      if (store.getUserByEmail(mail)) {
        return reply.code(409).send({ error: 'That email is already registered — try signing in.' });
      }

      const { salt, hash } = hashPassword(password);
      const user: UserRow = {
        id,
        name: trimmed,
        salt,
        hash,
        createdAt: Date.now(),
        tokenVersion: 1,
        email: mail,
        emailVerified: false,
      };
      store.createUser(user);
      // Seed the default with updatedAt=0 so the first real client edit always wins.
      store.putState(id, JSON.stringify(defaultState()), 0, 0);
      // Verification is best-effort: a mail outage must not block signup.
      sendVerification(user).catch((err) => console.error('[focus-den] verification mail failed:', err));
      const token = signToken({ sub: id, name: trimmed, tv: 1 }, secret);
      return { token, ...accountView(user) };
    },
  );

  app.post(
    '/api/auth/login',
    { config: { rateLimit: AUTH_RATE } },
    async (req, reply) => {
      // `identifier` is a username or an email; `name` accepted for back-compat.
      const body = (req.body ?? {}) as { identifier?: string; name?: string; password?: string };
      const who = (body.identifier ?? body.name ?? '').trim();
      const user = who.includes('@') ? store.getUserByEmail(emailFor(who)) : store.getUser(idFor(who));
      if (!user || !body.password || !verifyPassword(body.password, user.salt, user.hash)) {
        return reply.code(401).send({ error: 'Incorrect name/email or password.' });
      }
      const token = signToken({ sub: user.id, name: user.name, tv: user.tokenVersion ?? 1 }, secret);
      return { token, ...accountView(user) };
    },
  );

  // "Forgot password" — always answers ok (no account/email enumeration). Only
  // verified emails receive a link; the token is single-use and short-lived.
  app.post(
    '/api/auth/forgot',
    { config: { rateLimit: AUTH_RATE } },
    async (req) => {
      const { email } = (req.body ?? {}) as { email?: string };
      const user = EMAIL_RE.test(emailFor(email ?? '')) ? store.getUserByEmail(emailFor(email!)) : undefined;
      if (user?.email && user.emailVerified) {
        const { raw, hash } = makeEmailToken();
        store.putEmailToken({ tokenHash: hash, userId: user.id, kind: 'reset', expiresAt: Date.now() + RESET_TTL_MS });
        mailer
          .send(
            user.email,
            'Reset your Focus Den password',
            `Hi ${user.name},\n\nReset your password here (valid for 30 minutes):\n\n${appUrl}/?reset=${raw}\n\nIf you didn't ask for this, ignore this email — your password is unchanged.`,
          )
          .catch((err) => console.error('[focus-den] reset mail failed:', err));
      }
      return { ok: true };
    },
  );

  // Complete a reset: new password in, every old session out, signed in fresh.
  app.post(
    '/api/auth/reset',
    { config: { rateLimit: AUTH_RATE } },
    async (req, reply) => {
      const { token: raw, password } = (req.body ?? {}) as { token?: string; password?: string };
      if (!password || password.length < PASSWORD_MIN) {
        return reply.code(400).send({ error: `Password must be at least ${PASSWORD_MIN} characters.` });
      }
      const row = raw ? store.getEmailToken(hashOf(raw)) : undefined;
      if (!row || row.kind !== 'reset') {
        return reply.code(400).send({ error: 'This reset link is invalid or has expired — request a new one.' });
      }
      const user = store.getUser(row.userId);
      if (!user) return reply.code(400).send({ error: 'This reset link is invalid or has expired — request a new one.' });

      const { salt, hash } = hashPassword(password);
      const tv = (user.tokenVersion ?? 1) + 1; // revoke every existing session
      // Completing a reset also proves control of the email.
      store.createUser({ ...user, salt, hash, tokenVersion: tv, emailVerified: true });
      store.deleteEmailToken(row.tokenHash);
      const token = signToken({ sub: user.id, name: user.name, tv }, secret);
      return { token, ...accountView({ ...user, tokenVersion: tv, emailVerified: true }) };
    },
  );

  // Confirm an email address (from the link in the verification mail).
  app.post(
    '/api/auth/verify',
    { config: { rateLimit: AUTH_RATE } },
    async (req, reply) => {
      const { token: raw } = (req.body ?? {}) as { token?: string };
      const row = raw ? store.getEmailToken(hashOf(raw)) : undefined;
      if (!row || row.kind !== 'verify') {
        return reply.code(400).send({ error: 'This verification link is invalid or has expired.' });
      }
      const user = store.getUser(row.userId);
      if (!user) return reply.code(400).send({ error: 'This verification link is invalid or has expired.' });
      store.createUser({ ...user, emailVerified: true });
      store.deleteEmailToken(row.tokenHash);
      return { ok: true, name: user.name };
    },
  );

  const requireAuth = async (req: AuthedRequest, reply: FastifyReply) => {
    const header = req.headers['authorization'];
    const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : null;
    const payload = token ? verifyToken(token, secret) : null;
    // The account must still exist — a deleted account's token is dead, so no
    // route can lazily resurrect a "ghost" state for it. The token's version
    // must also match the account's (a password reset bumps it, revoking all
    // previously issued tokens).
    const user = payload ? store.getUser(payload.sub) : undefined;
    if (!payload || !user || (payload.tv ?? 1) !== (user.tokenVersion ?? 1)) {
      return reply.code(401).send({ error: 'Unauthorized.' });
    }
    req.userId = payload.sub;
  };

  app.get('/api/state', { preHandler: requireAuth }, async (req: AuthedRequest) => {
    const userId = req.userId!;
    let row = store.getState(userId);
    if (!row) row = store.putState(userId, JSON.stringify(defaultState()), 0, 0);
    return { doc: JSON.parse(row.doc), rev: row.rev, updatedAt: row.updatedAt };
  });

  app.put('/api/state', { preHandler: requireAuth }, async (req: AuthedRequest, reply) => {
    const userId = req.userId!;
    const body = (req.body ?? {}) as { doc?: unknown; updatedAt?: number };
    const coerced = coerceState(body.doc);
    if (!coerced) return reply.code(422).send({ error: 'Invalid state document.' });

    // Client edit times drive LWW, but an edit can't have happened in the
    // server's future — clamping stops a fast-clocked device from winning
    // every conflict until real time catches up.
    const claimed = typeof body.updatedAt === 'number' ? body.updatedAt : Date.now();
    const incomingUpdatedAt = Math.min(claimed, Date.now());
    const cur = store.getState(userId);
    if (shouldAccept(cur, incomingUpdatedAt)) {
      const rev = (cur?.rev ?? 0) + 1;
      const row = store.putState(userId, JSON.stringify(coerced), rev, incomingUpdatedAt);
      return { accepted: true, rev: row.rev, updatedAt: row.updatedAt };
    }
    // Server copy is newer — hand it back so the client can adopt it.
    return { accepted: false, rev: cur!.rev, updatedAt: cur!.updatedAt, serverDoc: JSON.parse(cur!.doc) };
  });

  app.get('/api/state/revisions', { preHandler: requireAuth }, async (req: AuthedRequest) => {
    return { revisions: store.listRevisions(req.userId!) };
  });

  app.post(
    '/api/state/revisions/:rev/restore',
    { preHandler: requireAuth },
    async (req: AuthedRequest, reply) => {
      const userId = req.userId!;
      const rev = Number((req.params as { rev?: string }).rev);
      if (!Number.isInteger(rev) || rev < 0) return reply.code(400).send({ error: 'Invalid revision.' });
      const snapshot = store.getRevision(userId, rev);
      if (!snapshot) return reply.code(404).send({ error: 'No such revision.' });
      // A restore is a brand-new write stamped with the server's own clock, so
      // every device adopts it on its next pull.
      const cur = store.getState(userId);
      const row = store.putState(userId, snapshot.doc, (cur?.rev ?? 0) + 1, Date.now());
      return { doc: JSON.parse(row.doc), rev: row.rev, updatedAt: row.updatedAt };
    },
  );

  app.get('/api/account', { preHandler: requireAuth }, async (req: AuthedRequest) => {
    return accountView(store.getUser(req.userId!)!);
  });

  // Change password: verify the current one, revoke every other session, and
  // hand this device a fresh token so it stays signed in.
  app.post(
    '/api/account/password',
    { preHandler: requireAuth, config: { rateLimit: AUTH_RATE } },
    async (req: AuthedRequest, reply) => {
      const { currentPassword, newPassword } = (req.body ?? {}) as {
        currentPassword?: string;
        newPassword?: string;
      };
      const user = store.getUser(req.userId!)!;
      if (!currentPassword || !verifyPassword(currentPassword, user.salt, user.hash)) {
        return reply.code(401).send({ error: 'Current password is incorrect.' });
      }
      if (!newPassword || newPassword.length < PASSWORD_MIN) {
        return reply.code(400).send({ error: `Password must be at least ${PASSWORD_MIN} characters.` });
      }
      const { salt, hash } = hashPassword(newPassword);
      const tv = (user.tokenVersion ?? 1) + 1;
      store.createUser({ ...user, salt, hash, tokenVersion: tv });
      const token = signToken({ sub: user.id, name: user.name, tv }, secret);
      return { ok: true, token };
    },
  );

  // Sign out everywhere: revoke all sessions, re-issue only this device's.
  app.post('/api/account/logout-all', { preHandler: requireAuth, config: { rateLimit: AUTH_RATE } }, async (req: AuthedRequest) => {
    const user = store.getUser(req.userId!)!;
    const tv = (user.tokenVersion ?? 1) + 1;
    store.createUser({ ...user, tokenVersion: tv });
    const token = signToken({ sub: user.id, name: user.name, tv }, secret);
    return { ok: true, token };
  });

  // Set or change the account email (password-confirmed); re-verification required.
  app.post(
    '/api/account/email',
    { preHandler: requireAuth, config: { rateLimit: AUTH_RATE } },
    async (req: AuthedRequest, reply) => {
      const { password, email } = (req.body ?? {}) as { password?: string; email?: string };
      const user = store.getUser(req.userId!)!;
      if (!password || !verifyPassword(password, user.salt, user.hash)) {
        return reply.code(401).send({ error: 'Incorrect password.' });
      }
      const mail = emailFor(email ?? '');
      if (!EMAIL_RE.test(mail)) return reply.code(400).send({ error: 'Enter a valid email address.' });
      const existing = store.getUserByEmail(mail);
      if (existing && existing.id !== user.id) {
        return reply.code(409).send({ error: 'That email is already registered to another account.' });
      }
      const next: UserRow = { ...user, email: mail, emailVerified: false };
      store.createUser(next);
      sendVerification(next).catch((err) => console.error('[focus-den] verification mail failed:', err));
      return accountView(next);
    },
  );

  // Re-send the verification link for the current email.
  app.post(
    '/api/account/resend-verification',
    { preHandler: requireAuth, config: { rateLimit: AUTH_RATE } },
    async (req: AuthedRequest, reply) => {
      const user = store.getUser(req.userId!)!;
      if (!user.email) return reply.code(400).send({ error: 'No email on this account yet.' });
      if (user.emailVerified) return { ok: true }; // nothing to do
      try {
        await sendVerification(user);
      } catch (err) {
        console.error('[focus-den] verification mail failed:', err);
        return reply.code(502).send({ error: 'Could not send the email — try again shortly.' });
      }
      return { ok: true };
    },
  );

  // Deleting an account destroys its state and every backup revision — a
  // stolen bearer token alone must not be enough, so the password is required.
  // Strict rate limit: this route verifies passwords, so it must not be a
  // faster guessing oracle than login.
  app.delete('/api/account', { preHandler: requireAuth, config: { rateLimit: AUTH_RATE } }, async (req: AuthedRequest, reply) => {
    const { password } = (req.body ?? {}) as { password?: string };
    const user = store.getUser(req.userId!)!;
    if (!password || !verifyPassword(password, user.salt, user.hash)) {
      return reply.code(401).send({ error: 'Incorrect password.' });
    }
    store.deleteUser(req.userId!);
    return { ok: true };
  });

  // Single-box deploys: serve the built frontend from this process. Unknown
  // non-API paths fall back to index.html (SPA); API 404s stay JSON.
  if (opts.staticDir && existsSync(opts.staticDir)) {
    await app.register(fastifyStatic, { root: opts.staticDir });
    app.setNotFoundHandler((req, reply) => {
      if (req.raw.url?.startsWith('/api/')) {
        return reply.code(404).send({ error: 'Not found.' });
      }
      return reply.sendFile('index.html');
    });
  }

  return app;
}
