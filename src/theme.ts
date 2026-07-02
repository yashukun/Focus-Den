/**
 * Theme application. The active color theme + light/dark appearance now live in
 * the persisted game state (`settings`), and are applied here via a `data-theme`
 * attribute on <html> that the CSS variable blocks key off of.
 *
 * - theme 'cozy'    → follows `appearance` (system / light / dark)
 * - theme 'midnight'→ fixed dark indigo palette
 * - theme 'sunrise' → fixed warm light palette
 */

import type { Appearance, ThemeId } from './core';

/** The `data-theme` attribute value for a theme + appearance, or null (= system cozy). */
export function dataThemeFor(theme: ThemeId, appearance: Appearance): string | null {
  if (theme === 'midnight') return 'midnight';
  if (theme === 'sunrise') return 'sunrise';
  if (appearance === 'light') return 'light';
  if (appearance === 'dark') return 'dark';
  return null; // cozy + system
}

export function applyTheme(theme: ThemeId, appearance: Appearance): void {
  const root = document.documentElement;
  const value = dataThemeFor(theme, appearance);
  if (value) root.setAttribute('data-theme', value);
  else root.removeAttribute('data-theme');
}

/** Whether the UI is effectively light or dark right now (for icon choice). */
export function resolvedAppearance(theme: ThemeId, appearance: Appearance): 'light' | 'dark' {
  if (theme === 'midnight') return 'dark';
  if (theme === 'sunrise') return 'light';
  if (appearance === 'light' || appearance === 'dark') return appearance;
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}
