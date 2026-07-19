import { describe, it, expect } from 'vitest';
import { clampCrop } from '../../src/lib/editor/crop';

describe('crop', () => {
  it('clampCrop keeps the rect inside the image (top-left overflow)', () => {
    expect(clampCrop({ x: -10, y: -10, w: 50, h: 50 }, { w: 100, h: 100 })).toEqual({ x: 0, y: 0, w: 50, h: 50 });
  });
  it('clampCrop shrinks a rect overflowing the bottom-right', () => {
    expect(clampCrop({ x: 80, y: 80, w: 50, h: 50 }, { w: 100, h: 100 })).toEqual({ x: 80, y: 80, w: 20, h: 20 });
  });
  it('clampCrop enforces a minimum 1x1', () => {
    expect(clampCrop({ x: 100, y: 100, w: 0, h: 0 }, { w: 100, h: 100 })).toEqual({ x: 100, y: 100, w: 1, h: 1 });
  });
});
