// Detect and temporarily neutralize position:fixed / position:sticky elements.
// Strategy: leave them visible for the FIRST tile (so the header appears once at
// the top of the stitched image) and hide them for every subsequent tile so they
// don't repeat down the page — the core reliability win over naive scroll+stitch.

const HIDDEN_ATTR = 'data-fullshot-hidden';

export function isPinned(style: CSSStyleDeclaration): boolean {
  const p = style.position;
  return p === 'fixed' || p === 'sticky';
}

/** Find all currently pinned (fixed/sticky) elements in a document. */
export function findPinnedElements(doc: Document = document, win: Window = window): HTMLElement[] {
  const result: HTMLElement[] = [];
  const all = doc.querySelectorAll<HTMLElement>('*');
  all.forEach((el) => {
    const style = win.getComputedStyle(el);
    if (isPinned(style)) result.push(el);
  });
  return result;
}

/** Hide the given elements (idempotent; remembers which ones we touched). */
export function hidePinned(elements: HTMLElement[]): void {
  for (const el of elements) {
    if (el.hasAttribute(HIDDEN_ATTR)) continue;
    el.setAttribute(HIDDEN_ATTR, el.style.visibility || '');
    el.style.visibility = 'hidden';
  }
}

/** Restore visibility for any elements we hid. */
export function restorePinned(elements: HTMLElement[]): void {
  for (const el of elements) {
    if (!el.hasAttribute(HIDDEN_ATTR)) continue;
    const prev = el.getAttribute(HIDDEN_ATTR) ?? '';
    el.style.visibility = prev;
    el.removeAttribute(HIDDEN_ATTR);
  }
}
