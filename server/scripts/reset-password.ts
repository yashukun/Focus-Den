/**
 * Admin password reset (the Level-1 "recovery story" for a trusted circle):
 *
 *   npm run reset-password -- <name> <new-password>
 *
 * Run it on the machine that hosts the database while the server is stopped
 * (or accept that the running server keeps its own SQLite connection — both
 * are fine, SQLite serializes writers).
 */

import { hashPassword } from '../src/auth';
import { env, legacyJsonDbPath } from '../src/env';
import { makeStore } from '../src/store-factory';

const [name, newPassword] = process.argv.slice(2);

if (!name || !newPassword) {
  console.error('Usage: npm run reset-password -- <name> <new-password>');
  process.exit(1);
}
if (newPassword.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

const store = makeStore(env.dbPath, legacyJsonDbPath);
const id = name.trim().toLowerCase();
const user = store.getUser(id);

if (!user) {
  console.error(`No profile named "${id}" in ${env.dbPath}`);
  process.exit(1);
}

const { salt, hash } = hashPassword(newPassword);
// Bumping tokenVersion revokes every previously issued login token.
store.createUser({ ...user, salt, hash, tokenVersion: (user.tokenVersion ?? 1) + 1 });
console.log(
  `Password reset for "${user.name}". All existing sessions are signed out; ` +
    `they can sign in with the new password now.`,
);
