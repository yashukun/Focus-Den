import { describe, expect, it } from 'vitest';
import { SqliteStore } from '../src/sqlite-store';
import { MAX_REVISIONS } from '../src/store';

describe('SqliteStore', () => {
  it('user CRUD + state round-trip', () => {
    const s = new SqliteStore(); // :memory:
    expect(s.getUser('sam')).toBeUndefined();

    s.createUser({ id: 'sam', name: 'Sam', salt: 'a1', hash: 'b2', createdAt: 123 });
    expect(s.getUser('sam')).toMatchObject({ id: 'sam', name: 'Sam', salt: 'a1', hash: 'b2', createdAt: 123 });

    expect(s.getState('sam')).toBeUndefined();
    s.putState('sam', '{"points":1}', 1, 1000);
    s.putState('sam', '{"points":2}', 2, 2000);
    expect(s.getState('sam')).toEqual({ doc: '{"points":2}', rev: 2, updatedAt: 2000 });

    s.deleteUser('sam');
    expect(s.getUser('sam')).toBeUndefined();
    expect(s.getState('sam')).toBeUndefined();
    expect(s.listRevisions('sam')).toEqual([]);
  });

  it('keeps revisions newest-first, restorable, pruned to the cap', () => {
    const s = new SqliteStore();
    for (let i = 1; i <= MAX_REVISIONS + 5; i++) {
      s.putState('sam', `{"points":${i}}`, i, i * 1000);
    }
    const revisions = s.listRevisions('sam');
    expect(revisions.length).toBe(MAX_REVISIONS);
    expect(revisions[0].rev).toBe(MAX_REVISIONS + 5); // newest first
    expect(revisions.at(-1)?.rev).toBe(6); // oldest 5 pruned

    expect(s.getRevision('sam', 6)).toEqual({ doc: '{"points":6}', rev: 6, updatedAt: 6000 });
    expect(s.getRevision('sam', 1)).toBeUndefined(); // pruned
  });

  it('isolates revisions per user', () => {
    const s = new SqliteStore();
    s.putState('a', '{"points":1}', 1, 1000);
    s.putState('b', '{"points":9}', 1, 1000);
    expect(s.listRevisions('a').length).toBe(1);
    s.deleteUser('a');
    expect(s.listRevisions('a')).toEqual([]);
    expect(s.listRevisions('b').length).toBe(1);
  });
});
