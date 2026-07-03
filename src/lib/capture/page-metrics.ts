// Pure geometry for the scroll-and-stitch capture engine.
// Sticky/fixed elements are neutralized separately (see sticky.ts), so the
// vertical/horizontal step is a full viewport with no overlap padding needed.

export interface ScrollTile {
  x: number;
  y: number;
}

/**
 * Scroll offsets needed to cover one axis with a given viewport size.
 * Always includes 0 and the max reachable offset (total - viewport), stepping
 * by `step` (defaults to the full viewport). Deduped and ascending.
 */
export function computeAxisTargets(total: number, viewport: number, step?: number): number[] {
  if (viewport <= 0) return [0];
  const maxOffset = Math.max(0, Math.ceil(total - viewport));
  if (maxOffset === 0) return [0];
  const s = step && step > 0 ? step : viewport;
  const targets: number[] = [];
  for (let o = 0; o < maxOffset; o += s) targets.push(Math.round(o));
  targets.push(maxOffset);
  return Array.from(new Set(targets)).sort((a, b) => a - b);
}

/**
 * Full grid of scroll positions to capture, in reading order (rows top→bottom,
 * within a row left→right).
 */
export function buildArrangement(
  pageWidth: number,
  pageHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): ScrollTile[] {
  const xs = computeAxisTargets(pageWidth, viewportWidth);
  const ys = computeAxisTargets(pageHeight, viewportHeight);
  const tiles: ScrollTile[] = [];
  for (const y of ys) {
    for (const x of xs) {
      tiles.push({ x, y });
    }
  }
  return tiles;
}

/**
 * Read the true full-page size from a document. Uses the max across body and
 * documentElement because sites disagree on which one holds the scroll size.
 */
export function measurePage(doc: Document = document, win: Window = window): {
  pageWidth: number;
  pageHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
} {
  const body = doc.body;
  const html = doc.documentElement;
  const pageWidth = Math.max(
    body?.scrollWidth ?? 0,
    body?.offsetWidth ?? 0,
    html?.clientWidth ?? 0,
    html?.scrollWidth ?? 0,
    html?.offsetWidth ?? 0,
  );
  const pageHeight = Math.max(
    body?.scrollHeight ?? 0,
    body?.offsetHeight ?? 0,
    html?.clientHeight ?? 0,
    html?.scrollHeight ?? 0,
    html?.offsetHeight ?? 0,
  );
  return {
    pageWidth,
    pageHeight,
    viewportWidth: win.innerWidth,
    viewportHeight: win.innerHeight,
    devicePixelRatio: win.devicePixelRatio || 1,
  };
}
