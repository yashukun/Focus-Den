/**
 * Inline two-step confirm: the first activation arms the button, the second
 * fires the action; an armed button stands down on its own after a few
 * seconds. Used instead of window.confirm everywhere — browsers can silently
 * suppress native dialogs, and desktop webviews (Tauri/Electron packaging)
 * don't reliably support them at all.
 */

import { useEffect, useState } from 'react';

export function useArmedConfirm(ms = 4000): [boolean, (action: () => void) => void, () => void] {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), ms);
    return () => clearTimeout(t);
  }, [armed, ms]);

  function fire(action: () => void): void {
    if (!armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    action();
  }

  return [armed, fire, () => setArmed(false)];
}
