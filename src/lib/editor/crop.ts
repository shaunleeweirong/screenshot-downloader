import type { Box } from './types';

export function clampCrop(crop: Box, image: { w: number; h: number }): Box {
  const x = Math.max(0, Math.min(crop.x, image.w));
  const y = Math.max(0, Math.min(crop.y, image.h));
  const w = Math.max(1, Math.min(crop.w, image.w - x));
  const h = Math.max(1, Math.min(crop.h, image.h - y));
  return { x, y, w, h };
}
