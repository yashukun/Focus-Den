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

import { existsSync } from 'node:fs';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { coerceState, defaultState } from '../../src/core';
import { hashPassword, signToken, verifyPassword, verifyToken } from './auth';
import { shouldAccept } from './reconcile';
import type { StateStore } from './store';

const NAME_MAX = 20;
const PASSWORD_MIN = 8;
/** Printable display names: start with a letter/number, then the same plus space . _ ' - */
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._'-]*$/u;
const idFor = (name: string) => name.trim().toLowerCase();

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

  // Generous global ceiling; the auth routes opt into the strict budget below.
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });

  app.get('/api/health', async () => ({ ok: true, time: Date.now() }));

  app.post(
    '/api/auth/signup',
    { config: { rateLimit: AUTH_RATE } },
    async (req, reply) => {
      const { name, password } = (req.body ?? {}) as { name?: string; password?: string };
      const trimmed = (name ?? '').trim();
      if (!trimmed) return reply.code(400).send({ error: 'Enter a name.' });
      if (trimmed.length > NAME_MAX) {
        return reply.code(400).send({ error: `Name must be ${NAME_MAX} characters or fewer.` });
      }
      if (!NAME_RE.test(trimmed)) {
        return reply.code(400).send({ error: 'Names can use letters, numbers, spaces and . _ \' -' });
      }
      if (!password || password.length < PASSWORD_MIN) {
        return reply.code(400).send({ error: `Password must be at least ${PASSWORD_MIN} characters.` });
      }
      const id = idFor(trimmed);
      if (store.getUser(id)) return reply.code(409).send({ error: 'That name is taken — try signing in.' });

      const { salt, hash } = hashPassword(password);
      store.createUser({ id, name: trimmed, salt, hash, createdAt: Date.now(), tokenVersion: 1 });
      // Seed the default with updatedAt=0 so the first real client edit always wins.
      store.putState(id, JSON.stringify(defaultState()), 0, 0);
      const token = signToken({ sub: id, name: trimmed, tv: 1 }, secret);
      return { token, userId: id, name: trimmed };
    },
  );

  app.post(
    '/api/auth/login',
    { config: { rateLimit: AUTH_RATE } },
    async (req, reply) => {
      const { name, password } = (req.body ?? {}) as { name?: string; password?: string };
      const id = idFor(name ?? '');
      const user = store.getUser(id);
      if (!user || !password || !verifyPassword(password, user.salt, user.hash)) {
        return reply.code(401).send({ error: 'Incorrect name or password.' });
      }
      const token = signToken({ sub: id, name: user.name, tv: user.tokenVersion ?? 1 }, secret);
      return { token, userId: id, name: user.name };
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

  // Deleting an account destroys its state and every backup revision — a
  // stolen bearer token alone must not be enough, so the password is required.
  app.delete('/api/account', { preHandler: requireAuth }, async (req: AuthedRequest, reply) => {
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
