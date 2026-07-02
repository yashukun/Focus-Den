/**
 * Password hashing (scrypt + per-user salt, constant-time compare) and a small
 * hand-rolled HS256 JWT (no extra dependency). Node's built-in crypto only.
 */

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function hashPassword(password: string): { salt: string; hash: string } {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password: string, salt: string, hash: string): boolean {
  let derived: Buffer;
  try {
    derived = scryptSync(password, salt, 64);
  } catch {
    return false;
  }
  const stored = Buffer.from(hash, 'hex');
  return derived.length === stored.length && timingSafeEqual(derived, stored);
}

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

export interface TokenPayload {
  sub: string;
  name?: string;
  iat?: number;
  exp?: number;
}

export function signToken(
  payload: { sub: string; name?: string },
  secret: string,
  ttlSec = 60 * 60 * 24 * 30,
): string {
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + ttlSec };
  const header = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const claims = b64url(Buffer.from(JSON.stringify(body)));
  const data = `${header}.${claims}`;
  const sig = b64url(createHmac('sha256', secret).update(data).digest());
  return `${data}.${sig}`;
}

export function verifyToken(token: string, secret: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, claims, sig] = parts;
  const expected = b64url(createHmac('sha256', secret).update(`${header}.${claims}`).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const body = JSON.parse(Buffer.from(claims, 'base64url').toString()) as TokenPayload;
    if (typeof body.exp === 'number' && body.exp < Math.floor(Date.now() / 1000)) return null;
    return body;
  } catch {
    return null;
  }
}
