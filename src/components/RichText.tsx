/**
 * Rich text for intention descriptions: a contentEditable editor plus a
 * sanitized viewer. HTML passes through DOMPurify with a strict allowlist on
 * every save AND every render — coerce (shared with the server) can only bound
 * the string's size, so the DOM-aware last line of defense lives here and a
 * hostile imported document can never smuggle markup into the page.
 *
 * Pasted images are recompressed to bounded JPEG data URLs so a full-screen
 * screenshot paste cannot blow the localStorage quota. Non-image pastes are
 * inserted as plain text — foreign markup never enters the document.
 */

import DOMPurify from 'dompurify';
import { useEffect, useMemo, useRef } from 'react';

// ── Sanitizer ────────────────────────────────────────────────────────────────

const ALLOWED_TAGS = [
  'p', 'div', 'br', 'b', 'strong', 'i', 'em', 'u', 's',
  'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'span', 'img', 'a',
];
const ALLOWED_ATTR = ['src', 'alt', 'href'];

const IMG_SRC_RE = /^data:image\/(png|jpeg|webp|gif);base64,/i;
const LINK_RE = /^https?:\/\//i;

// House rules DOMPurify can't express declaratively: images must be bounded
// data: URLs (nothing remote), links must be https and open in a new tab.
let hooked = false;
function ensureHook(): void {
  if (hooked) return;
  hooked = true;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    const tag = node.tagName?.toLowerCase();
    if (tag === 'img' && !IMG_SRC_RE.test(node.getAttribute('src') ?? '')) {
      node.remove();
    }
    if (tag === 'a') {
      if (LINK_RE.test(node.getAttribute('href') ?? '')) {
        node.setAttribute('rel', 'noreferrer');
        node.setAttribute('target', '_blank');
      } else {
        node.removeAttribute('href');
      }
    }
  });
}

/** Allowlist-sanitize description HTML. Outside a browser, degrade to text. */
export function sanitizeDescHtml(html: string): string {
  if (typeof document === 'undefined') return html.replace(/<[^>]*>/g, ' ');
  ensureHook();
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR, ALLOW_DATA_ATTR: false });
}

/** True when the HTML holds no visible content (no text, no image). */
export function isEmptyDescHtml(html: string): boolean {
  if (/<img[\s>]/i.test(html)) return false;
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim() === '';
}

/** Plain text → minimal safe HTML (seed the editor from legacy `notes`). */
export function textToDescHtml(text: string): string {
  const esc = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<p>${esc.replace(/\n/g, '<br>')}</p>`;
}

// ── Image paste ──────────────────────────────────────────────────────────────

const MAX_IMG_DIM = 1280;
const MAX_DATA_URL = 700_000; // chars — keeps a paste-heavy den inside the quota

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image failed to load'));
    img.src = url;
  });
}

function drawToJpeg(img: HTMLImageElement, maxDim: number, quality: number): string {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; // JPEG has no alpha — transparent screenshots get paper
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

/** Compress a pasted image file into a bounded data URL (null on failure). */
async function fileToDataUrl(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    let out = drawToJpeg(img, MAX_IMG_DIM, 0.82);
    if (out.length > MAX_DATA_URL) out = drawToJpeg(img, 900, 0.7);
    return out.length > MAX_DATA_URL ? null : out;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ── Viewer ───────────────────────────────────────────────────────────────────

export function RichTextViewer({ html }: { html: string }) {
  const clean = useMemo(() => sanitizeDescHtml(html), [html]);
  return <div className="richtext richtext-view" dangerouslySetInnerHTML={{ __html: clean }} />;
}

// ── Editor ───────────────────────────────────────────────────────────────────

const TOOLBAR: { cmd: string; label: string; title: string }[] = [
  { cmd: 'bold', label: 'B', title: 'Bold (⌘B)' },
  { cmd: 'italic', label: 'I', title: 'Italic (⌘I)' },
  { cmd: 'insertUnorderedList', label: '•', title: 'Bullet list' },
  { cmd: 'insertOrderedList', label: '1.', title: 'Numbered list' },
];

export interface RichTextEditorProps {
  /** Seed HTML; the editor is uncontrolled after mount (remount via `key`). */
  initialHtml: string;
  placeholder: string;
  /** Fires debounced with sanitized HTML; empty string means "cleared". */
  onChange: (html: string) => void;
}

/**
 * Uncontrolled contentEditable editor with debounced auto-save. The parent
 * must remount it (React `key`) when switching to a different ticket —
 * re-rendering with new props on purpose does NOT reset the DOM, so typing
 * never fights the store round-trip.
 */
export function RichTextEditor({ initialHtml, placeholder, onChange }: RichTextEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSent = useRef<string | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const clean = sanitizeDescHtml(initialHtml);
    el.innerHTML = clean;
    lastSent.current = isEmptyDescHtml(clean) ? '' : clean;
    return () => {
      if (timer.current) clearTimeout(timer.current);
      emitFrom(el); // flush pending edits when the panel closes
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once; remounted via key
  }, []);

  function emitFrom(el: HTMLElement) {
    const clean = sanitizeDescHtml(el.innerHTML);
    const next = isEmptyDescHtml(clean) ? '' : clean;
    if (next !== lastSent.current) {
      lastSent.current = next;
      onChangeRef.current(next);
    }
  }

  function scheduleEmit() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (ref.current) emitFrom(ref.current);
    }, 600);
  }

  async function insertImages(files: File[]) {
    const el = ref.current;
    if (!el) return;
    for (const file of files) {
      const url = await fileToDataUrl(file);
      if (!url) continue;
      const img = document.createElement('img');
      img.src = url;
      img.alt = '';
      insertNodeAtCaret(el, img);
    }
    scheduleEmit();
  }

  function onPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const dt = e.clipboardData;
    const files = Array.from(dt?.items ?? [])
      .filter((i) => i.kind === 'file' && i.type.startsWith('image/'))
      .map((i) => i.getAsFile())
      .filter((f): f is File => f !== null);
    if (files.length > 0) {
      e.preventDefault();
      void insertImages(files);
      return;
    }
    const text = dt?.getData('text/plain');
    if (text != null) {
      e.preventDefault();
      document.execCommand('insertText', false, text);
      scheduleEmit();
    }
  }

  return (
    <div className="richtext-editor">
      <div className="richtext-toolbar" role="toolbar" aria-label="Formatting">
        {TOOLBAR.map((b) => (
          <button
            key={b.cmd}
            type="button"
            className={`richtext-tool richtext-tool-${b.cmd}`}
            title={b.title}
            aria-label={b.title}
            data-sound="none"
            onMouseDown={(e) => {
              e.preventDefault(); // keep the selection in the editor
              document.execCommand(b.cmd);
              scheduleEmit();
            }}
          >
            {b.label}
          </button>
        ))}
        <span className="richtext-hint">paste images with ⌘V</span>
      </div>
      <div
        ref={ref}
        className="richtext richtext-input"
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-label="Description"
        data-placeholder={placeholder}
        onInput={scheduleEmit}
        onBlur={() => ref.current && emitFrom(ref.current)}
        onPaste={onPaste}
      />
    </div>
  );
}

function insertNodeAtCaret(editor: HTMLElement, node: Node): void {
  editor.focus();
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !editor.contains(sel.anchorNode)) {
    editor.append(node);
    return;
  }
  const range = sel.getRangeAt(0);
  range.deleteContents();
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}
