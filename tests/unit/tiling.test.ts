import { describe, it, expect } from 'vitest';
import { computeOutputTiles, type TilingLimits } from '../../src/lib/capture/tiling';

const LIMITS: TilingLimits = { maxDimension: 1000, maxArea: 1_000_000 };

function coversFully(tiles: { x: number; y: number; width: number; height: number }[], w: number, h: number) {
  const area = tiles.reduce((sum, t) => sum + t.width * t.height, 0);
  return area === w * h;
}

describe('computeOutputTiles', () => {
  it('returns a single tile when within limits', () => {
    expect(computeOutputTiles(800, 600, LIMITS)).toEqual([{ x: 0, y: 0, width: 800, height: 600 }]);
  });

  it('tiles vertically when height exceeds maxDimension', () => {
    // width 500 (ok), height 2500 (> 1000). rowHeight = min(1000, floor(1e6/500)=2000) = 1000
    const tiles = computeOutputTiles(500, 2500, LIMITS);
    expect(tiles.map((t) => t.y)).toEqual([0, 1000, 2000]);
    expect(tiles.every((t) => t.width === 500)).toBe(true);
    expect(tiles[tiles.length - 1].height).toBe(500); // 2500 - 2000
    expect(coversFully(tiles, 500, 2500)).toBe(true);
  });

  it('respects maxArea even when both dims are under maxDimension', () => {
    // 900x900 = 810k < 1M ok single. 900 x 2000 area huge -> tile.
    const tiles = computeOutputTiles(900, 2000, LIMITS);
    // rowHeight = min(1000, floor(1e6/900)=1111) = 1000
    expect(tiles.length).toBe(2);
    expect(tiles.every((t) => t.width * t.height <= LIMITS.maxArea)).toBe(true);
    expect(coversFully(tiles, 900, 2000)).toBe(true);
  });

  it('produces a grid when width AND height exceed limits', () => {
    // width 2500 -> cols at 1000: 0,1000,2000 (sizes 1000,1000,500)
    // colWidth=1000 -> rowHeight=min(1000, floor(1e6/1000)=1000)=1000; height 2500 -> rows 0,1000,2000
    const tiles = computeOutputTiles(2500, 2500, LIMITS);
    expect(tiles.length).toBe(9); // 3 cols x 3 rows
    expect(tiles.every((t) => t.width <= LIMITS.maxDimension && t.height <= LIMITS.maxDimension)).toBe(true);
    expect(tiles.every((t) => t.width * t.height <= LIMITS.maxArea)).toBe(true);
    expect(coversFully(tiles, 2500, 2500)).toBe(true);
  });
});
