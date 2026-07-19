import { arrowheadPoints, boundsOf } from './geometry';
import type { Annotation, Scene } from './types';

export type { Annotation } from './types';

export interface Ctx2D {
  save(): void; restore(): void;
  beginPath(): void; moveTo(x: number, y: number): void; lineTo(x: number, y: number): void;
  closePath(): void; stroke(): void; fill(): void;
  rect(x: number, y: number, w: number, h: number): void;
  ellipse(x: number, y: number, rx: number, ry: number, rotation: number, start: number, end: number): void;
  fillText(text: string, x: number, y: number): void;
  arc(x: number, y: number, r: number, start: number, end: number): void;
  strokeStyle: string; fillStyle: string; lineWidth: number;
  globalAlpha: number; font: string; textBaseline: string; lineJoin: string; lineCap: string;
}

export function drawAnnotation(ctx: Ctx2D, a: Annotation): void {
  ctx.save();
  switch (a.type) {
    case 'line':
    case 'arrow': {
      ctx.strokeStyle = a.style.stroke;
      ctx.lineWidth = a.style.strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(a.x1, a.y1);
      ctx.lineTo(a.x2, a.y2);
      ctx.stroke();
      if (a.type === 'arrow') {
        const [h1, h2] = arrowheadPoints(a.x1, a.y1, a.x2, a.y2, Math.max(12, a.style.strokeWidth * 3));
        ctx.beginPath();
        ctx.moveTo(h1.x, h1.y);
        ctx.lineTo(a.x2, a.y2);
        ctx.lineTo(h2.x, h2.y);
        ctx.stroke();
      }
      break;
    }
    case 'highlight': {
      const b = boundsOf(a);
      ctx.globalAlpha = a.style.opacity;
      ctx.fillStyle = a.style.stroke;
      ctx.beginPath();
      ctx.rect(b.x, b.y, b.w, b.h);
      ctx.fill();
      break;
    }
    case 'rect': {
      const b = boundsOf(a);
      if (a.style.fill !== 'none') {
        ctx.globalAlpha = a.style.opacity;
        ctx.fillStyle = a.style.fill;
        ctx.beginPath();
        ctx.rect(b.x, b.y, b.w, b.h);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = a.style.stroke;
      ctx.lineWidth = a.style.strokeWidth;
      ctx.beginPath();
      ctx.rect(b.x, b.y, b.w, b.h);
      ctx.stroke();
      break;
    }
    case 'ellipse': {
      const b = boundsOf(a);
      ctx.strokeStyle = a.style.stroke;
      ctx.lineWidth = a.style.strokeWidth;
      ctx.beginPath();
      ctx.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'text': {
      ctx.fillStyle = a.style.stroke;
      ctx.font = `${a.style.fontSize}px system-ui, sans-serif`;
      ctx.textBaseline = 'top';
      ctx.fillText(a.text, a.x, a.y);
      break;
    }
    case 'step': {
      const r = a.style.fontSize;
      ctx.fillStyle = a.style.stroke;
      ctx.beginPath();
      ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${r}px system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillText(String(a.n), a.x - r / 3, a.y);
      break;
    }
    case 'blur':
      break; // applied by the pixelate pass in flatten/preview, not drawn here
  }
  ctx.restore();
}

export function drawScene(ctx: Ctx2D, scene: Scene): void {
  for (const a of scene.annotations) drawAnnotation(ctx, a);
}
