import { describe, it, expect } from 'vitest';
import { pixelateRegion } from '../../src/lib/editor/pixelate';

// 2x2 RGBA image: two black pixels (top row), two white pixels (bottom row).
function img(): number[] {
  return [
    0, 0, 0, 255,    0, 0, 0, 255,
    255, 255, 255, 255,  255, 255, 255, 255,
  ];
}

describe('pixelateRegion', () => {
  it('averages a block covering the whole image to mid-grey', () => {
    const d = pixelateRegion(img(), 2, 2, { x: 0, y: 0, w: 2, h: 2 }, 2) as number[];
    // average of 0 and 255 over 4 pixels ~ 128
    expect(d[0]).toBeGreaterThan(120);
    expect(d[0]).toBeLessThan(135);
    expect(d[0]).toBe(d[4]); // all four pixels now equal
    expect(d[0]).toBe(d[8]);
  });
  it('leaves pixels outside the box untouched', () => {
    const d = pixelateRegion(img(), 2, 2, { x: 0, y: 0, w: 1, h: 1 }, 1) as number[];
    expect(d.slice(4, 8)).toEqual([0, 0, 0, 255]); // top-right pixel unchanged
  });
});
