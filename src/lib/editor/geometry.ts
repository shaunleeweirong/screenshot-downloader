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

export function handlesOf(a: Annotation): Handle[] {
  if (a.type === 'arrow' || a.type === 'line') {
    return [{ id: 'p1', x: a.x1, y: a.y1 }, { id: 'p2', x: a.x2, y: a.y2 }];
  }
  if (a.type === 'text' || a.type === 'step') return [];
  const b = boundsOf(a);
  return [
    { id: 'nw', x: b.x, y: b.y },
    { id: 'ne', x: b.x + b.w, y: b.y },
    { id: 'se', x: b.x + b.w, y: b.y + b.h },
    { id: 'sw', x: b.x, y: b.y + b.h },
  ];
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
  if (a.type === 'text' || a.type === 'step') return a;
  const b = boundsOf(a);
  const opposite: Record<string, Point> = {
    nw: { x: b.x + b.w, y: b.y + b.h },
    ne: { x: b.x, y: b.y + b.h },
    se: { x: b.x, y: b.y },
    sw: { x: b.x + b.w, y: b.y },
  };
  const fixed = opposite[handleId] ?? { x: b.x, y: b.y };
  return {
    ...a,
    x: Math.min(fixed.x, to.x),
    y: Math.min(fixed.y, to.y),
    w: Math.abs(to.x - fixed.x),
    h: Math.abs(to.y - fixed.y),
  } as T;
}
