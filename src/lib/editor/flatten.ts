import { drawScene, type Ctx2D } from './render';
import { pixelateRegion } from './pixelate';
import { boundsOf } from './geometry';
import type { Box, Scene } from './types';

export interface ComposeCtx extends Ctx2D {
  drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void;
  getImageData(x: number, y: number, w: number, h: number): ImageData;
  putImageData(data: ImageData, x: number, y: number): void;
  translate(x: number, y: number): void;
}

// Draw the source image, mosaic each blur region, then draw vector annotations.
// Works in natural (uncropped) image coordinates.
export function composeToContext(
  ctx: ComposeCtx,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  scene: Scene,
): void {
  ctx.drawImage(source, 0, 0, sourceWidth, sourceHeight);
  for (const a of scene.annotations) {
    if (a.type !== 'blur') continue;
    const b = boundsOf(a);
    const x = Math.max(0, Math.round(b.x));
    const y = Math.max(0, Math.round(b.y));
    const w = Math.max(1, Math.min(Math.round(b.w), sourceWidth - x));
    const h = Math.max(1, Math.min(Math.round(b.h), sourceHeight - y));
    const region = ctx.getImageData(x, y, w, h);
    pixelateRegion(region.data, region.width, region.height, { x: 0, y: 0, w: region.width, h: region.height }, a.block);
    ctx.putImageData(region, x, y);
  }
  drawScene(ctx, scene);
}

export async function flatten(source: ImageBitmap, scene: Scene, crop?: Box): Promise<Blob> {
  const full = new OffscreenCanvas(source.width, source.height);
  const ctx = full.getContext('2d') as unknown as ComposeCtx;
  composeToContext(ctx, source, source.width, source.height, scene);
  if (!crop) return full.convertToBlob({ type: 'image/png' });

  const w = Math.max(1, Math.round(crop.w));
  const h = Math.max(1, Math.round(crop.h));
  const out = new OffscreenCanvas(w, h);
  const octx = out.getContext('2d')!;
  octx.drawImage(full, crop.x, crop.y, crop.w, crop.h, 0, 0, w, h);
  return out.convertToBlob({ type: 'image/png' });
}
