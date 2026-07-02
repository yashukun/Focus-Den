/**
 * Backend API client. Holds the JWT (in localStorage) and makes typed calls to
 * the server. Same-origin `/api` (Vite proxies it to the local server in dev).
 */

import type { State } from '../core';

const BASE = '/api';
const TOKEN_KEY = 'focus-den/token';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

async function req<T>(
  path: string,
  opts: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.auth) {
    const t = getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  const res = await fetch(BASE + path, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    let msg = res.statusText || `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {
      // non-JSON error body
    }
    throw new ApiError(msg, res.status);
  }
  if (res.status === 204) return null as T;
  return (await res.json()) as T;
}

export interface AuthResponse {
  token: string;
  userId: string;
  name: string;
  /** whether this account is the server's designated admin */
  isAdmin?: boolean;
}

export interface StateResponse {
  doc: State;
  rev: number;
  updatedAt: number;
}

export interface PutResponse {
  accepted: boolean;
  rev: number;
  updatedAt: number;
  serverDoc?: State;
}

/** A server-side snapshot of the state document (kept for restore). */
export interface RevisionMeta {
  rev: number;
  updatedAt: number;
  storedAt: number;
}

export const api = {
  signup: (name: string, password: string) =>
    req<AuthResponse>('/auth/signup', { method: 'POST', body: { name, password } }),
  login: (name: string, password: string) =>
    req<AuthResponse>('/auth/login', { method: 'POST', body: { name, password } }),
  getState: () => req<StateResponse>('/state', { auth: true }),
  putState: (doc: State, updatedAt: number) =>
    req<PutResponse>('/state', { method: 'PUT', auth: true, body: { doc, updatedAt } }),
  listRevisions: () => req<{ revisions: RevisionMeta[] }>('/state/revisions', { auth: true }),
  restoreRevision: (rev: number) =>
    req<StateResponse>(`/state/revisions/${rev}/restore`, { method: 'POST', auth: true }),
  deleteAccount: (password: string) =>
    req<{ ok: boolean }>('/account', { method: 'DELETE', auth: true, body: { password } }),
  health: () =>
    fetch(BASE + '/health')
      .then((r) => r.ok)
      .catch(() => false),
  /** The server's clock (epoch ms), or null when unreachable. */
  serverTime: async (): Promise<number | null> => {
    try {
      const res = await fetch(BASE + '/health');
      if (!res.ok) return null;
      const j = (await res.json()) as { time?: unknown };
      return typeof j.time === 'number' ? j.time : null;
    } catch {
      return null;
    }
  },
};
