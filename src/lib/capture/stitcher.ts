import { computeOutputTiles, type TilingLimits } from './tiling';

// A viewport snapshot plus where it belongs in the full image, in DEVICE pixels.
export interface CapturedTile {
  bitmap: ImageBitmap;
  dx: number;
  dy: number;
}

/**
 * Stitch captured viewport snapshots into one or more PNG blobs. Splits into
 * multiple canvases when the page exceeds canvas limits (never blank output).
 * All coordinates/sizes are device pixels. A white background is painted so
 * gaps and transparency never show through.
 */
export async function stitch(
  fullWidthDev: number,
  fullHeightDev: number,
  tiles: CapturedTile[],
  limits?: TilingLimits,
): Promise<Blob[]> {
  const outputTiles = computeOutputTiles(fullWidthDev, fullHeightDev, limits);
  const blobs: Blob[] = [];
  for (const ot of outputTiles) {
    const canvas = new OffscreenCanvas(ot.width, ot.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D context for stitching');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, ot.width, ot.height);
    for (const t of tiles) {
      // Draw each snapshot relative to this output tile's origin. Snapshots
      // outside the tile are clipped automatically by the canvas.
      ctx.drawImage(t.bitmap, t.dx - ot.x, t.dy - ot.y);
    }
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    blobs.push(blob);
  }
  return blobs;
}
