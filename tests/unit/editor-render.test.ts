import { describe, it, expect, vi } from 'vitest';
import { drawScene } from '../../src/lib/editor/render';
import type { Annotation, Ctx2D } from '../../src/lib/editor/render';
import type { Scene } from '../../src/lib/editor/types';

function spyCtx() {
  return {
    save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
    closePath: vi.fn(), stroke: vi.fn(), fill: vi.fn(), rect: vi.fn(), ellipse: vi.fn(),
    fillText: vi.fn(), arc: vi.fn(),
    strokeStyle: '', fillStyle: '', lineWidth: 0, globalAlpha: 1, font: '', textBaseline: '', lineJoin: '', lineCap: '',
  } as unknown as Ctx2D & Record<string, ReturnType<typeof vi.fn>>;
}

const S = { stroke: '#f00', strokeWidth: 4, fill: 'none', opacity: 1, fontSize: 24 };

describe('render', () => {
  it('draws an arrow shaft + head (two strokes) and skips blur', () => {
    const ctx = spyCtx();
    const scene: Scene = {
      annotations: [
        { id: 'a', type: 'arrow', x1: 0, y1: 0, x2: 50, y2: 0, style: S } as Annotation,
        { id: 'b', type: 'blur', x: 0, y: 0, w: 10, h: 10, block: 8 } as Annotation,
      ],
      nextStep: 1,
    };
    drawScene(ctx, scene);
    expect(ctx.stroke).toHaveBeenCalledTimes(2); // shaft + head; blur drew nothing
  });
  it('draws step badge with a circle and its number', () => {
    const ctx = spyCtx();
    const scene: Scene = { annotations: [{ id: 's', type: 'step', x: 5, y: 5, n: 3, style: S } as Annotation], nextStep: 4 };
    drawScene(ctx, scene);
    expect(ctx.arc).toHaveBeenCalledTimes(1);
    expect(ctx.fillText).toHaveBeenCalledWith('3', expect.any(Number), expect.any(Number));
  });
});
