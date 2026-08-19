/**
 * Escape-to-close, the app-wide way to back out of any panel or mode without
 * hunting for the ✕. Pass `active` for conditional layers (edit modes,
 * pickers) so the listener only exists while there is something to close.
 */

import { useEffect, useRef } from 'react';

export function useEscape(onEscape: () => void, active = true): void {
  const handler = useRef(onEscape);
  handler.current = onEscape;

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handler.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);
}
