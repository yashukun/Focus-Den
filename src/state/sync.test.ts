import { describe, expect, it } from 'vitest';
import { estimateOffset, pickNewer } from './sync';

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
