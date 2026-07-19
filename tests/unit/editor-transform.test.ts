import { describe, it, expect } from 'vitest';
import { makeView, toImage, toDisplay } from '../../src/lib/editor/transform';

describe('coordinate transform', () => {
  it('scales display px up to image px', () => {
    const v = makeView(2000, 1000); // image is 2x the on-screen size
    expect(v.scale).toBe(2);
    expect(toImage({ x: 100, y: 50 }, v)).toEqual({ x: 200, y: 100 });
  });
  it('round-trips display -> image -> display', () => {
    const v = makeView(1536, 640);
    const p = { x: 123, y: 45 };
    const back = toDisplay(toImage(p, v), v);
    expect(back.x).toBeCloseTo(p.x, 6);
    expect(back.y).toBeCloseTo(p.y, 6);
  });
  it('falls back to scale 1 for a zero display width', () => {
    expect(makeView(800, 0).scale).toBe(1);
  });
});
