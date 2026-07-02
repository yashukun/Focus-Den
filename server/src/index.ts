import { existsSync } from 'node:fs';
import { buildApp } from './app';
import { env, legacyJsonDbPath } from './env';
import { makeStore } from './store-factory';

const store = makeStore(env.dbPath, legacyJsonDbPath);
const app = await buildApp(store, env.jwtSecret, {
  staticDir: env.staticDir,
  trustProxy: env.trustProxy,
  corsOrigin: env.corsOrigin,
});

app
  .listen({ port: env.port, host: env.host })
  .then(() => console.log(`[focus-den] API listening on http://${env.host}:${env.port}`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

if (existsSync(env.staticDir)) {
  console.log(`[focus-den] serving frontend from ${env.staticDir}`);
}
