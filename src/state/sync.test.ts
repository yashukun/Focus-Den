import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultState, type State } from '../core';
import { estimateOffset, pickNewer, sync } from './sync';
import { api } from './api';

vi.mock('./api', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  getToken: () => 'test-token',
  api: {
    serverTime: vi.fn(async () => null),
    getState: vi.fn(),
    putState: vi.fn(),
  },
}));

describe('pickNewer (last-write-wins by edit time)', () => {
  it('adopts server when there is no local timestamp', () => {
    expect(pickNewer(null, 5)).toBe('server');
  });
  it('keeps local when the server has none', () => {
    expect(pickNewer(5, null)).toBe('local');
  });
  it('adopts server when it is newer', () => {
    expect(pickNewer(5, 6)).toBe('server');
  });
  it('keeps local when it is newer', () => {
    expect(pickNewer(6, 5)).toBe('local');
  });
  it('reports equal on a tie', () => {
    expect(pickNewer(5, 5)).toBe('equal');
  });
  it('treats both-missing as local (nothing to adopt)', () => {
    expect(pickNewer(null, null)).toBe('local');
  });
});

describe('estimateOffset (server-clock correction)', () => {
  it('is ~0 when the clocks agree', () => {
    // Request at t0=1000, response at t1=1200; server read its clock mid-flight.
    expect(estimateOffset(1000, 1100, 1200)).toBe(0);
  });
  it('is positive when the local clock runs behind the server', () => {
    expect(estimateOffset(1000, 6100, 1200)).toBe(5000);
  });
  it('is negative when the local clock runs ahead (the skew that broke LWW)', () => {
    expect(estimateOffset(10_000, 5100, 10_200)).toBe(-5000);
  });
  it('rounds to whole milliseconds', () => {
    expect(estimateOffset(1000, 1101, 1201)).toBe(1); // midpoint 1100.5 → 0.5 → 1
  });
});

describe('pull/flush with a server doc from a newer app version', () => {
  const storage = new Map<string, string>();
  let adopted: State[];

  // A doc whose version this client doesn't know (as from a newer app release).
  const futureDoc = { v: 99 } as unknown as State;

  beforeEach(() => {
    storage.clear();
    adopted = [];
    vi.stubGlobal('navigator', { onLine: true }); // Node's navigator has no onLine
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => void storage.set(k, v),
      removeItem: (k: string) => void storage.delete(k),
    });
    sync.bindStore({
      getState: () => defaultState(),
      getUserId: () => 'u1',
      adoptRemote: (s) => void adopted.push(s),
    });
    vi.mocked(api.getState).mockReset();
    vi.mocked(api.putState).mockReset();
  });

  afterEach(() => {
    sync.stop();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const meta = (updatedAt: number) =>
    storage.set('focus-den/sync/u1', JSON.stringify({ updatedAt, rev: 1 }));

  it('adopts a newer, valid server doc (the normal path still works)', async () => {
    meta(100);
    vi.mocked(api.getState).mockResolvedValue({ doc: { ...defaultState(), points: 7 }, rev: 2, updatedAt: 200 });
    await sync.pullAndReconcile();
    expect(adopted).toHaveLength(1);
    expect(adopted[0].points).toBe(7);
    expect(sync.getStatus()).toBe('synced');
  });

  it('never adopts (or resets to default) when the server doc does not coerce', async () => {
    meta(100);
    vi.mocked(api.getState).mockResolvedValue({ doc: futureDoc, rev: 2, updatedAt: 200 });
    await sync.pullAndReconcile();
    expect(adopted).toHaveLength(0); // local copy untouched — no defaultState() wipe
    expect(sync.getStatus()).toBe('incompatible');
  });

  it('does not push local over an unreadable (newer-version) server doc', async () => {
    meta(300); // local newer — would normally push
    vi.mocked(api.getState).mockResolvedValue({ doc: futureDoc, rev: 2, updatedAt: 200 });
    await sync.pullAndReconcile();
    expect(api.putState).not.toHaveBeenCalled();
    expect(sync.getStatus()).toBe('incompatible');
  });

  it('freezes debounced pushes while incompatible', async () => {
    meta(100);
    vi.mocked(api.getState).mockResolvedValue({ doc: futureDoc, rev: 2, updatedAt: 200 });
    await sync.pullAndReconcile();
    vi.useFakeTimers();
    sync.markDirty();
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.putState).not.toHaveBeenCalled();
  });

  it('recovers when the server doc becomes readable again (e.g. backup restore)', async () => {
    meta(100);
    vi.mocked(api.getState).mockResolvedValue({ doc: futureDoc, rev: 2, updatedAt: 200 });
    await sync.pullAndReconcile();
    expect(sync.getStatus()).toBe('incompatible');
    vi.mocked(api.getState).mockResolvedValue({ doc: { ...defaultState(), points: 9 }, rev: 3, updatedAt: 400 });
    await sync.pullAndReconcile();
    expect(adopted).toHaveLength(1);
    expect(adopted[0].points).toBe(9);
    expect(sync.getStatus()).toBe('synced');
  });
});
