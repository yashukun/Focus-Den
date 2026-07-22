import { buildApp } from './app';
import { env, legacyJsonDbPath } from './env';
import { makeStore } from './store-factory';

const store = makeStore(env.dbPath, legacyJsonDbPath);
const app = await buildApp(store, env.jwtSecret, {
  staticDir: env.staticDir ?? undefined,
  trustProxy: env.trustProxy,
  corsOrigin: env.corsOrigin,
  adminUser: env.adminUser,
});

// Exit promptly and cleanly on Ctrl+C / tsx-watch restarts / docker stop —
// otherwise open keep-alive connections hold the process until it gets
// force-killed.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().finally(() => process.exit(0));
  });
}

app
  .listen({ port: env.port, host: env.host })
  .then(() => {
    console.log(`[focus-den] API listening on http://${env.host}:${env.port}`);
    if (env.staticDir) console.log(`[focus-den] serving frontend from ${env.staticDir}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
