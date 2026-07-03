import { describe, it, expect } from 'vitest';
import { normalizeRect, clampRect, toDevicePixels } from '../../src/lib/capture/region';

describe('normalizeRect', () => {
  it('handles a normal top-left to bottom-right drag', () => {
    expect(normalizeRect(10, 20, 110, 220)).toEqual({ x: 10, y: 20, width: 100, height: 200 });
  });
  it('handles a reversed (bottom-right to top-left) drag', () => {
    expect(normalizeRect(110, 220, 10, 20)).toEqual({ x: 10, y: 20, width: 100, height: 200 });
  });
});

describe('clampRect', () => {
  it('keeps a rect inside bounds', () => {
    expect(clampRect({ x: -5, y: -5, width: 50, height: 50 }, { width: 100, height: 100 })).toEqual({
      x: 0,
      y: 0,
      width: 45,
      height: 45,
    });
  });
  it('shrinks a rect that overflows the right/bottom edge', () => {
    expect(clampRect({ x: 80, y: 80, width: 50, height: 50 }, { width: 100, height: 100 })).toEqual({
      x: 80,
      y: 80,
      width: 20,
      height: 20,
    });
  });
});

describe('toDevicePixels', () => {
  it('scales by devicePixelRatio and rounds', () => {
    expect(toDevicePixels({ x: 10, y: 20, width: 100, height: 200 }, 2)).toEqual({
      x: 20,
      y: 40,
      width: 200,
      height: 400,
    });
  });
  it('rounds fractional dpr', () => {
    expect(toDevicePixels({ x: 10, y: 10, width: 10, height: 10 }, 1.5)).toEqual({
      x: 15,
      y: 15,
      width: 15,
      height: 15,
    });
  });
});
