import type { Rect } from '../types';

/**
 * Normalize a drag selection (which may have a negative width/height if the
 * user dragged up or left) into a Rect with positive dimensions.
 */
export function normalizeRect(x0: number, y0: number, x1: number, y1: number): Rect {
  const x = Math.min(x0, x1);
  const y = Math.min(y0, y1);
  return {
    x,
    y,
    width: Math.abs(x1 - x0),
    height: Math.abs(y1 - y0),
  };
}

/**
 * Clip a rect to [0,0,bounds.width,bounds.height]. Both edges are clamped, so a
 * selection that starts off-screen keeps its on-screen portion (the far edge is
 * preserved) rather than being shifted inward.
 */
export function clampRect(rect: Rect, bounds: { width: number; height: number }): Rect {
  const left = Math.max(0, rect.x);
  const top = Math.max(0, rect.y);
  const right = Math.min(bounds.width, rect.x + rect.width);
  const bottom = Math.min(bounds.height, rect.y + rect.height);
  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

/** Scale a CSS-pixel rect into device pixels for cropping a captured image. */
export function toDevicePixels(rect: Rect, dpr: number): Rect {
  return {
    x: Math.round(rect.x * dpr),
    y: Math.round(rect.y * dpr),
    width: Math.round(rect.width * dpr),
    height: Math.round(rect.height * dpr),
  };
}
