import { describe, it, expect } from 'vitest';
import { arrowheadPoints, boundsOf, handlesOf, cornerHandles, resizeBox, translateAnnot, resizeAnnot } from '../../src/lib/editor/geometry';
import type { Annotation } from '../../src/lib/editor/types';

const S = { stroke: '#f00', strokeWidth: 4, fill: 'none', opacity: 1, fontSize: 24 };
const arrow: Annotation = { id: 'a', type: 'arrow', x1: 0, y1: 0, x2: 100, y2: 0, style: S };
const rect: Annotation = { id: 'r', type: 'rect', x: 10, y: 20, w: 40, h: 30, style: S };

describe('geometry', () => {
  it('arrowheadPoints sit behind the tip', () => {
    const [h1, h2] = arrowheadPoints(0, 0, 100, 0, 20);
    expect(h1.x).toBeLessThan(100);
    expect(h2.x).toBeLessThan(100);
    expect(h1.y).toBeCloseTo(-h2.y, 5); // symmetric about the horizontal shaft
  });
  it('boundsOf normalizes negative rect dimensions', () => {
    const b = boundsOf({ id: 'n', type: 'rect', x: 50, y: 50, w: -30, h: -20, style: S });
    expect(b).toEqual({ x: 20, y: 30, w: 30, h: 20 });
  });
  it('boundsOf of a line uses endpoint extents', () => {
    expect(boundsOf(arrow)).toEqual({ x: 0, y: 0, w: 100, h: 0 });
  });
  it('handlesOf gives endpoints for arrows and 4 corners for boxes/text/step', () => {
    expect(handlesOf(arrow).map((h) => h.id)).toEqual(['p1', 'p2']);
    expect(handlesOf(rect).map((h) => h.id)).toEqual(['nw', 'ne', 'se', 'sw']);
    expect(handlesOf({ id: 't', type: 'text', x: 0, y: 0, text: 'hi', style: S }).map((h) => h.id)).toEqual(['nw', 'ne', 'se', 'sw']);
    expect(handlesOf({ id: 's', type: 'step', x: 50, y: 50, n: 1, style: S }).map((h) => h.id)).toEqual(['nw', 'ne', 'se', 'sw']);
  });
  it('cornerHandles returns nw,ne,se,sw of a box', () => {
    expect(cornerHandles({ x: 10, y: 20, w: 40, h: 30 })).toEqual([
      { id: 'nw', x: 10, y: 20 },
      { id: 'ne', x: 50, y: 20 },
      { id: 'se', x: 50, y: 50 },
      { id: 'sw', x: 10, y: 50 },
    ]);
  });
  it('translateAnnot shifts both shapes and endpoints', () => {
    expect(translateAnnot(rect, 5, 7)).toMatchObject({ x: 15, y: 27 });
    expect(translateAnnot(arrow, 5, 7)).toMatchObject({ x1: 5, y1: 7, x2: 105, y2: 7 });
  });
  it('resizeAnnot drags a rect corner keeping the opposite corner fixed', () => {
    const r = resizeAnnot(rect, 'se', { x: 60, y: 70 });
    expect(r).toMatchObject({ x: 10, y: 20, w: 50, h: 50 });
  });
  it('resizeAnnot moves an arrow endpoint', () => {
    expect(resizeAnnot(arrow, 'p2', { x: 5, y: 9 })).toMatchObject({ x2: 5, y2: 9 });
  });
  it('resizeAnnot scales a step badge fontSize, keeping the opposite corner fixed', () => {
    const step: Annotation = { id: 's', type: 'step', x: 100, y: 100, n: 1, style: { ...S, fontSize: 20 } };
    const r = resizeAnnot(step, 'se', { x: 160, y: 160 }); // doubles the diagonal from the nw corner
    expect(r).toMatchObject({ x: 120, y: 120 });
    expect((r as { style: { fontSize: number } }).style.fontSize).toBe(40);
  });
  it('resizeAnnot scales a text label fontSize, keeping the anchor (nw) fixed', () => {
    const text: Annotation = { id: 't', type: 'text', x: 10, y: 20, text: 'ABCD', style: { ...S, fontSize: 20 } };
    const r = resizeAnnot(text, 'se', { x: 106, y: 68 }); // doubles the diagonal from nw
    expect(r).toMatchObject({ x: 10, y: 20 });
    expect((r as { style: { fontSize: number } }).style.fontSize).toBe(40);
  });
  it('resizeBox drags a corner keeping the opposite fixed', () => {
    expect(resizeBox({ x: 0, y: 0, w: 100, h: 100 }, 'se', { x: 60, y: 60 })).toEqual({ x: 0, y: 0, w: 60, h: 60 });
    expect(resizeBox({ x: 0, y: 0, w: 100, h: 100 }, 'nw', { x: 40, y: 40 })).toEqual({ x: 40, y: 40, w: 60, h: 60 });
  });
  it('resizeAnnot clamps text/step fontSize to a minimum', () => {
    const step: Annotation = { id: 's', type: 'step', x: 100, y: 100, n: 1, style: { ...S, fontSize: 20 } };
    const r = resizeAnnot(step, 'se', { x: 82, y: 82 }); // near the opposite corner -> tiny
    expect((r as { style: { fontSize: number } }).style.fontSize).toBeGreaterThanOrEqual(8);
  });
});
