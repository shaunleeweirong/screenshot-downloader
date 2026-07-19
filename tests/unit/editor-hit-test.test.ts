import { describe, it, expect } from 'vitest';
import { distToSegment, hitAnnotation, hitHandle } from '../../src/lib/editor/hit-test';
import type { Annotation, Scene } from '../../src/lib/editor/types';

const S = { stroke: '#f00', strokeWidth: 4, fill: 'none', opacity: 1, fontSize: 24 };
const rectA: Annotation = { id: 'a', type: 'rect', x: 0, y: 0, w: 50, h: 50, style: S };
const rectB: Annotation = { id: 'b', type: 'rect', x: 10, y: 10, w: 50, h: 50, style: S };
const line: Annotation = { id: 'l', type: 'line', x1: 0, y1: 0, x2: 100, y2: 0, style: S };

describe('hit testing', () => {
  it('distToSegment measures perpendicular distance', () => {
    expect(distToSegment({ x: 50, y: 10 }, { x: 0, y: 0 }, { x: 100, y: 0 })).toBeCloseTo(10, 5);
  });
  it('hitAnnotation returns the topmost overlapping annotation', () => {
    const scene: Scene = { annotations: [rectA, rectB], nextStep: 1 };
    expect(hitAnnotation(scene, { x: 30, y: 30 })!.id).toBe('b');
  });
  it('hitAnnotation returns null on empty space', () => {
    const scene: Scene = { annotations: [rectA], nextStep: 1 };
    expect(hitAnnotation(scene, { x: 500, y: 500 })).toBeNull();
  });
  it('hitAnnotation hits a thin line within tolerance', () => {
    const scene: Scene = { annotations: [line], nextStep: 1 };
    expect(hitAnnotation(scene, { x: 50, y: 3 })!.id).toBe('l');
  });
  it('hitHandle finds a corner handle', () => {
    expect(hitHandle(rectA, { x: 50, y: 50 })!.id).toBe('se');
    expect(hitHandle(rectA, { x: 25, y: 25 })).toBeNull();
  });
});
