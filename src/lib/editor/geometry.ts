import type { Annotation, Box, Point } from './types';

export interface Handle { id: string; x: number; y: number; }

// Two barb endpoints for an arrowhead at (x2,y2), pointing away from (x1,y1).
export function arrowheadPoints(x1: number, y1: number, x2: number, y2: number, size: number): [Point, Point] {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const spread = Math.PI / 7;
  return [
    { x: x2 - size * Math.cos(angle - spread), y: y2 - size * Math.sin(angle - spread) },
    { x: x2 - size * Math.cos(angle + spread), y: y2 - size * Math.sin(angle + spread) },
  ];
}

export function boundsOf(a: Annotation): Box {
  if (a.type === 'arrow' || a.type === 'line') {
    return { x: Math.min(a.x1, a.x2), y: Math.min(a.y1, a.y2), w: Math.abs(a.x2 - a.x1), h: Math.abs(a.y2 - a.y1) };
  }
  if (a.type === 'text') {
    const w = Math.max(1, a.text.length) * a.style.fontSize * 0.6;
    return { x: a.x, y: a.y, w, h: a.style.fontSize * 1.2 };
  }
  if (a.type === 'step') {
    const r = a.style.fontSize;
    return { x: a.x - r, y: a.y - r, w: 2 * r, h: 2 * r };
  }
  // rect | ellipse | highlight | blur
  return { x: Math.min(a.x, a.x + a.w), y: Math.min(a.y, a.y + a.h), w: Math.abs(a.w), h: Math.abs(a.h) };
}

const MIN_FONT = 8;

/** The four corner handles (nw,ne,se,sw) of an axis-aligned box. */
export function cornerHandles(b: Box): Handle[] {
  return [
    { id: 'nw', x: b.x, y: b.y },
    { id: 'ne', x: b.x + b.w, y: b.y },
    { id: 'se', x: b.x + b.w, y: b.y + b.h },
    { id: 'sw', x: b.x, y: b.y + b.h },
  ];
}

/** Resize an axis-aligned box by dragging one corner, keeping the opposite corner fixed. */
export function resizeBox(b: Box, handleId: string, to: Point): Box {
  const fixed = oppositeCorner(b, handleId);
  return {
    x: Math.min(fixed.x, to.x),
    y: Math.min(fixed.y, to.y),
    w: Math.abs(to.x - fixed.x),
    h: Math.abs(to.y - fixed.y),
  };
}

/** The corner of a box diagonally opposite the given handle (stays fixed while resizing). */
function oppositeCorner(b: Box, handleId: string): Point {
  const map: Record<string, Point> = {
    nw: { x: b.x + b.w, y: b.y + b.h },
    ne: { x: b.x, y: b.y + b.h },
    se: { x: b.x, y: b.y },
    sw: { x: b.x + b.w, y: b.y },
  };
  return map[handleId] ?? { x: b.x, y: b.y };
}

/** Top-left of a resized box, given the fixed (opposite-of-dragged) corner and the new size. */
function topLeftFromFixed(handleId: string, fixed: Point, w: number, h: number): Point {
  switch (handleId) {
    case 'nw': return { x: fixed.x - w, y: fixed.y - h }; // fixed = se
    case 'ne': return { x: fixed.x, y: fixed.y - h };     // fixed = sw
    case 'sw': return { x: fixed.x - w, y: fixed.y };     // fixed = ne
    default: return { x: fixed.x, y: fixed.y };           // 'se' -> fixed = nw
  }
}

export function handlesOf(a: Annotation): Handle[] {
  if (a.type === 'arrow' || a.type === 'line') {
    return [{ id: 'p1', x: a.x1, y: a.y1 }, { id: 'p2', x: a.x2, y: a.y2 }];
  }
  // rect | ellipse | highlight | blur | text | step all resize from 4 corner handles.
  return cornerHandles(boundsOf(a));
}

export function translateAnnot<T extends Annotation>(a: T, dx: number, dy: number): T {
  if (a.type === 'arrow' || a.type === 'line') {
    return { ...a, x1: a.x1 + dx, y1: a.y1 + dy, x2: a.x2 + dx, y2: a.y2 + dy } as T;
  }
  return { ...a, x: a.x + dx, y: a.y + dy } as T;
}

export function resizeAnnot<T extends Annotation>(a: T, handleId: string, to: Point): T {
  if (a.type === 'arrow' || a.type === 'line') {
    return handleId === 'p1' ? { ...a, x1: to.x, y1: to.y } as T : { ...a, x2: to.x, y2: to.y } as T;
  }
  const b = boundsOf(a);
  const fixed = oppositeCorner(b, handleId);

  // Text and step scale their fontSize by the drag, keeping the opposite corner fixed.
  if (a.type === 'text' || a.type === 'step') {
    const dragged = cornerHandles(b).find((h) => h.id === handleId) ?? { x: b.x, y: b.y };
    const oldDist = Math.hypot(dragged.x - fixed.x, dragged.y - fixed.y);
    if (oldDist === 0) return a;
    const ratio = Math.hypot(to.x - fixed.x, to.y - fixed.y) / oldDist;
    const fontSize = Math.max(MIN_FONT, Math.round(a.style.fontSize * ratio));
    const style = { ...a.style, fontSize };
    if (a.type === 'step') {
      const nw = topLeftFromFixed(handleId, fixed, 2 * fontSize, 2 * fontSize);
      return { ...a, x: nw.x + fontSize, y: nw.y + fontSize, style } as T; // step anchor is its center
    }
    const w = Math.max(1, a.text.length) * fontSize * 0.6;
    const h = fontSize * 1.2;
    const nw = topLeftFromFixed(handleId, fixed, w, h);
    return { ...a, x: nw.x, y: nw.y, style } as T;
  }

  return {
    ...a,
    x: Math.min(fixed.x, to.x),
    y: Math.min(fixed.y, to.y),
    w: Math.abs(to.x - fixed.x),
    h: Math.abs(to.y - fixed.y),
  } as T;
}
