import { fileURLToPath } from 'node:url';

// SQLite is the default engine. Point DB_PATH at a `.json` file to use the
// legacy JSON-file store instead.
const defaultDbPath = fileURLToPath(new URL('../data/focus-den.db', import.meta.url));

/** Where the pre-SQLite JSON store lived; imported once into a fresh SQLite db. */
export const legacyJsonDbPath = fileURLToPath(new URL('../data/db.json', import.meta.url));

const isProduction = process.env.NODE_ENV === 'production';

export const env = {
  port: Number(process.env.PORT ?? 8787),
  /** Bind localhost-only by default; deploys set HOST=0.0.0.0. */
  host: process.env.HOST ?? '127.0.0.1',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-insecure-secret-change-me',
  dbPath: process.env.DB_PATH ?? defaultDbPath,
  /**
   * Built frontend to serve (single-box deploy). Production-only by default —
   * in dev, Vite serves the live frontend and a stale dist/ would only mislead.
   */
  staticDir:
    process.env.STATIC_DIR ??
    (isProduction ? fileURLToPath(new URL('../../dist', import.meta.url)) : null),
  /** Behind a PaaS / reverse proxy, client IPs arrive in X-Forwarded-For. */
  trustProxy: (process.env.TRUST_PROXY ?? (isProduction ? 'true' : 'false')) === 'true',
  /** Pin CORS to the real origin in production (e.g. https://focus.example.com). */
  corsOrigin: process.env.CORS_ORIGIN || true,
  /**
   * The single admin account (normalized name). Admins see the testing tools
   * and reset. Unset: the account named "admin" in dev, nobody in production
   * (set ADMIN_USER explicitly when deploying).
   */
  adminUser: (process.env.ADMIN_USER ?? '').trim().toLowerCase() || (isProduction ? null : 'admin'),
};

if (env.jwtSecret.startsWith('dev-only')) {
  if (isProduction) {
    // Never accept real traffic with a public, guessable signing key — anyone
    // could forge tokens for any account.
    console.error('[focus-den] FATAL: JWT_SECRET is unset in production. Refusing to start.');
    process.exit(1);
  }
  console.warn('[focus-den] Dev JWT secret in use — fine locally; set JWT_SECRET when deploying.');
}
