/**
 * Pure local-calendar helpers. Everything works off an epoch-ms `now` so the
 * engine never reads the clock itself (keeps it testable and backend-portable).
 *
 * "Day" and "week" are local-calendar concepts here — a shift belongs to the
 * calendar day it was clocked in on, in the user's local timezone.
 */

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Local YYYY-MM-DD for the given instant. */
export function dateString(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 0=Mon .. 5=Sat for a shift day, or -1 on Sunday (the day off). */
export function dayIndexMonSat(now: number): number {
  const day = new Date(now).getDay(); // 0=Sun .. 6=Sat
  return day === 0 ? -1 : day - 1;
}

/** True when the instant falls on a Sunday (no shift, excluded from streak). */
export function isSunday(now: number): boolean {
  return new Date(now).getDay() === 0;
}

/** Local YYYY-MM-DD of the Monday that starts this instant's week. */
export function weekKey(now: number): string {
  const d = new Date(now);
  const day = d.getDay(); // 0=Sun .. 6=Sat
  const sinceMonday = (day + 6) % 7; // Mon->0, Sun->6
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - sinceMonday);
  return dateString(monday.getTime());
}

// ── Date-key helpers (operate on YYYY-MM-DD strings) ─────────────────────────

function partsOf(dateKey: string): [number, number, number] {
  const [y, m, d] = dateKey.split('-').map(Number);
  return [y || 1970, (m || 1) - 1, d || 1];
}

/** Add (or subtract) whole days to a date key. */
export function addDays(dateKey: string, n: number): string {
  const [y, m, d] = partsOf(dateKey);
  return dateString(new Date(y, m, d + n).getTime());
}

/** The seven date keys (Mon..Sun) of the week containing `dateKey`. */
export function weekDates(dateKey: string): string[] {
  const [y, m, d] = partsOf(dateKey);
  const day = new Date(y, m, d).getDay();
  const sinceMonday = (day + 6) % 7;
  return Array.from({ length: 7 }, (_, i) =>
    dateString(new Date(y, m, d - sinceMonday + i).getTime()),
  );
}

/** A 6×7 matrix of date keys covering the given month (Mon-start). */
export function monthMatrix(year: number, month0: number): string[][] {
  const first = new Date(year, month0, 1);
  const sinceMonday = (first.getDay() + 6) % 7;
  const weeks: string[][] = [];
  for (let w = 0; w < 6; w++) {
    const row: string[] = [];
    for (let i = 0; i < 7; i++) {
      row.push(dateString(new Date(year, month0, 1 - sinceMonday + w * 7 + i).getTime()));
    }
    weeks.push(row);
  }
  return weeks;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function monthTitle(year: number, month0: number): string {
  return `${MONTHS[month0]} ${year}`;
}

/** The month index (0-based) a date key belongs to. */
export function monthOf(dateKey: string): number {
  return partsOf(dateKey)[1];
}
