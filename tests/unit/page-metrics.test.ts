import { describe, it, expect } from 'vitest';
import { computeAxisTargets, buildArrangement } from '../../src/lib/capture/page-metrics';

describe('computeAxisTargets', () => {
  it('returns [0] when content fits the viewport', () => {
    expect(computeAxisTargets(800, 1000)).toEqual([0]);
    expect(computeAxisTargets(1000, 1000)).toEqual([0]);
  });

  it('steps by the full viewport and always includes the max offset', () => {
    // total 2500, viewport 1000 -> 0, 1000, 1500(max)
    expect(computeAxisTargets(2500, 1000)).toEqual([0, 1000, 1500]);
  });

  it('covers the very bottom exactly (last offset = total - viewport)', () => {
    const targets = computeAxisTargets(3000, 1000);
    expect(targets[0]).toBe(0);
    expect(targets[targets.length - 1]).toBe(2000);
  });

  it('dedupes when total is an exact multiple of the viewport', () => {
    // 3000/1000: 0,1000,2000 then push max=2000 -> deduped
    expect(computeAxisTargets(3000, 1000)).toEqual([0, 1000, 2000]);
  });

  it('handles a custom step', () => {
    expect(computeAxisTargets(2000, 1000, 500)).toEqual([0, 500, 1000]);
  });

  it('guards against zero/negative viewport', () => {
    expect(computeAxisTargets(2000, 0)).toEqual([0]);
  });
});

describe('buildArrangement', () => {
  it('produces a single tile for a short, narrow page', () => {
    expect(buildArrangement(800, 600, 1280, 800)).toEqual([{ x: 0, y: 0 }]);
  });

  it('produces a vertical strip for a tall page', () => {
    expect(buildArrangement(1000, 2500, 1000, 1000)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 1000 },
      { x: 0, y: 1500 },
    ]);
  });

  it('produces a grid for a wide AND tall page in reading order', () => {
    const tiles = buildArrangement(2000, 2000, 1000, 1000);
    expect(tiles).toEqual([
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 0, y: 1000 },
      { x: 1000, y: 1000 },
    ]);
  });
});
