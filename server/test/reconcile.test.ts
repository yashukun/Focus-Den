import { describe, expect, it } from 'vitest';
import { shouldAccept } from '../src/reconcile';

describe('shouldAccept (last-write-wins)', () => {
  it('accepts when there is no current row', () => {
    expect(shouldAccept(undefined, 5)).toBe(true);
  });
  it('accepts when the incoming edit is newer', () => {
    expect(shouldAccept({ updatedAt: 5 }, 6)).toBe(true);
  });
  it('accepts on a tie (writer wins)', () => {
    expect(shouldAccept({ updatedAt: 5 }, 5)).toBe(true);
  });
  it('rejects when the incoming edit is older', () => {
    expect(shouldAccept({ updatedAt: 5 }, 4)).toBe(false);
  });
});
