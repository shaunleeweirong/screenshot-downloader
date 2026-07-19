import type { Annotation, Box, Point, Scene } from './types';
import { boundsOf, cornerHandles, handlesOf, type Handle } from './geometry';

/** True when `p` is inside `b` (optionally expanded by `pad` on every side). */
export function pointInBox(p: Point, b: Box, pad = 0): boolean {
  return p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad;
}

export function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function hitAnnotation(scene: Scene, p: Point, tol = 6): Annotation | null {
  for (let i = scene.annotations.length - 1; i >= 0; i--) {
    const a = scene.annotations[i];
    if (a.type === 'arrow' || a.type === 'line') {
      if (distToSegment(p, { x: a.x1, y: a.y1 }, { x: a.x2, y: a.y2 }) <= tol + a.style.strokeWidth) return a;
    } else if (pointInBox(p, boundsOf(a), tol)) {
      return a;
    }
  }
  return null;
}

export function hitHandle(a: Annotation, p: Point, tol = 8): Handle | null {
  for (const h of handlesOf(a)) {
    if (Math.hypot(p.x - h.x, p.y - h.y) <= tol) return h;
  }
  return null;
}

/** Which corner handle of an arbitrary box (e.g. the crop rect) `p` is grabbing, if any. */
export function hitBoxHandle(b: Box, p: Point, tol = 8): Handle | null {
  for (const h of cornerHandles(b)) {
    if (Math.hypot(p.x - h.x, p.y - h.y) <= tol) return h;
  }
  return null;
}
