/**
 * Pure formatting helpers for durations and wall-clock times.
 */

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** ms -> "H:MM:SS" (or "HH:MM:SS"), for the monospace live timer. */
export function formatHMS(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h}:${pad2(m)}:${pad2(s)}`;
}

/** ms -> "Hh Mm" / "Mm" / "Ss", compact for summaries and history. */
export function formatHM(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${pad2(m)}m`;
  if (m > 0) {
    const s = totalSec % 60;
    return s > 0 ? `${m}m ${pad2(s)}s` : `${m}m`;
  }
  return `${totalSec}s`;
}

/** ms -> "MM:SS", for break chips. */
export function formatMS(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${pad2(m)}:${pad2(s)}`;
}

/** epoch ms -> local wall-clock "h:MM AM/PM". */
export function formatClock(epoch: number): string {
  const d = new Date(epoch);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${pad2(m)} ${ampm}`;
}

/** YYYY-MM-DD -> a friendly "Mon, Jun 29" style label. */
export function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const date = new Date(y, m - 1, d);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${d}`;
}
