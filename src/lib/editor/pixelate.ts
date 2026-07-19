import type { Box } from './types';

export function pixelateRegion<T extends Uint8ClampedArray | number[]>(
  data: T,
  width: number,
  height: number,
  box: Box,
  block: number,
): T {
  const bx = Math.max(0, Math.floor(box.x));
  const by = Math.max(0, Math.floor(box.y));
  const bw = Math.min(width - bx, Math.floor(box.w));
  const bh = Math.min(height - by, Math.floor(box.h));
  const b = Math.max(1, Math.floor(block));
  for (let y = by; y < by + bh; y += b) {
    for (let x = bx; x < bx + bw; x += b) {
      const xe = Math.min(x + b, bx + bw);
      const ye = Math.min(y + b, by + bh);
      let r = 0, g = 0, bl = 0, al = 0, n = 0;
      for (let yy = y; yy < ye; yy++) {
        for (let xx = x; xx < xe; xx++) {
          const i = (yy * width + xx) * 4;
          r += data[i]; g += data[i + 1]; bl += data[i + 2]; al += data[i + 3]; n++;
        }
      }
      if (!n) continue;
      r = Math.round(r / n); g = Math.round(g / n); bl = Math.round(bl / n); al = Math.round(al / n);
      for (let yy = y; yy < ye; yy++) {
        for (let xx = x; xx < xe; xx++) {
          const i = (yy * width + xx) * 4;
          data[i] = r; data[i + 1] = g; data[i + 2] = bl; data[i + 3] = al;
        }
      }
    }
  }
  return data;
}
