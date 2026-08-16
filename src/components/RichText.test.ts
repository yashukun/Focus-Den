/**
 * Node-side coverage for the rich-text helpers. The DOM allowlist scrub only
 * runs in a browser (vitest here is `environment: 'node'`), so these tests pin
 * the pure paths: the SSR fallback, empty detection, and legacy-notes escaping.
 */

import { describe, expect, it } from 'vitest';

import { isEmptyDescHtml, sanitizeDescHtml, textToDescHtml } from './RichText';

describe('richtext helpers', () => {
  it('SSR fallback strips all markup when no DOM is available', () => {
    expect(sanitizeDescHtml('<p>hi <script>alert(1)</script></p>')).not.toContain('<');
  });

  it('detects empty html; an image counts as content', () => {
    expect(isEmptyDescHtml('')).toBe(true);
    expect(isEmptyDescHtml('<p><br></p>')).toBe(true);
    expect(isEmptyDescHtml('<div> &nbsp; </div>')).toBe(true);
    expect(isEmptyDescHtml('<p>hi</p>')).toBe(false);
    expect(isEmptyDescHtml('<p><img src="data:image/png;base64,x"></p>')).toBe(false);
  });

  it('escapes legacy plain notes into safe seed html', () => {
    expect(textToDescHtml('a<b>&c\nd')).toBe('<p>a&lt;b&gt;&amp;c<br>d</p>');
  });
});
