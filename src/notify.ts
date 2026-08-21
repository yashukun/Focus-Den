/**
 * OS notifications, one call for every platform. The desktop shell goes
 * through the Tauri notification plugin (the webview has no working web
 * Notification API); the web build uses the browser's Notification API,
 * feature-checked. Everything degrades to a silent no-op — a missing or
 * denied notification must never break the app.
 *
 * Clicking a notification can't carry a payload on every platform, so the
 * hand-off happens through `src/state/attention.ts`: the sender records what
 * the notification was about, and the app consumes it when it regains focus.
 */

import { isTauri } from './state/desktop';

/** Ask for permission (returns whether we may notify). Safe to call anytime. */
export async function ensureNotifyPermission(): Promise<boolean> {
  try {
    if (isTauri()) {
      const plugin = await import('@tauri-apps/plugin-notification');
      if (await plugin.isPermissionGranted()) return true;
      return (await plugin.requestPermission()) === 'granted';
    }
    if (typeof Notification === 'undefined') return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

/**
 * Fire-and-forget notification. `onClick` runs when the user clicks it —
 * only the web API supports that directly; on desktop the click focuses the
 * app window, which the attention hand-off turns into the same outcome.
 */
export async function sendNotification(
  title: string,
  body: string,
  onClick?: () => void,
): Promise<void> {
  try {
    if (!(await ensureNotifyPermission())) return;
    if (isTauri()) {
      const plugin = await import('@tauri-apps/plugin-notification');
      plugin.sendNotification({ title, body });
      return;
    }
    const n = new Notification(title, { body });
    if (onClick) {
      n.onclick = () => {
        try {
          window.focus();
        } catch {
          // best effort
        }
        onClick();
      };
    }
  } catch {
    // notifications unavailable — the app carries on
  }
}
