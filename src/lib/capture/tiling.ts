// Split an oversized output image into canvas-safe tiles so we NEVER produce a
// blank/white result on very tall or high-DPI pages (the #1 competitor failure).
// All values are in output (device) pixels.

export interface OutputTile {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TilingLimits {
  /** Max width/height of a single canvas, in device px. */
  maxDimension: number;
  /** Max total area (w*h) of a single canvas, in device px². */
  maxArea: number;
}

// Conservative limits that hold across Chrome/GPU combos.
export const DEFAULT_LIMITS: TilingLimits = {
  maxDimension: 16384,
  maxArea: 256 * 1024 * 1024, // 268M px²
};

interface Span {
  start: number;
  size: number;
}

function splitAxis(total: number, chunk: number): Span[] {
  const spans: Span[] = [];
  const c = Math.max(1, Math.floor(chunk));
  for (let s = 0; s < total; s += c) {
    spans.push({ start: s, size: Math.min(c, total - s) });
  }
  if (spans.length === 0) spans.push({ start: 0, size: total });
  return spans;
}

/**
 * Returns one tile if the image fits in a single canvas, otherwise a grid of
 * tiles each within `maxDimension` per side and `maxArea` total.
 */
export function computeOutputTiles(
  width: number,
  height: number,
  limits: TilingLimits = DEFAULT_LIMITS,
): OutputTile[] {
  const fitsDim = width <= limits.maxDimension && height <= limits.maxDimension;
  const fitsArea = width * height <= limits.maxArea;
  if (fitsDim && fitsArea) {
    return [{ x: 0, y: 0, width, height }];
  }

  const colWidth = Math.min(width, limits.maxDimension);
  const cols = splitAxis(width, colWidth);
  // Bound each tile's area: rowHeight * colWidth <= maxArea, and rowHeight <= maxDimension.
  const rowHeight = Math.max(1, Math.min(limits.maxDimension, Math.floor(limits.maxArea / colWidth)));
  const rows = splitAxis(height, rowHeight);

  const tiles: OutputTile[] = [];
  for (const row of rows) {
    for (const col of cols) {
      tiles.push({ x: col.start, y: row.start, width: col.size, height: row.size });
    }
  }
  return tiles;
}
