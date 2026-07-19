import { describe, it, expect, vi } from 'vitest';
import { composeToContext } from '../../src/lib/editor/flatten';
import type { ComposeCtx } from '../../src/lib/editor/flatten';
import type { Annotation, Scene } from '../../src/lib/editor/types';

function spyCtx() {
  return {
    save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
    closePath: vi.fn(), stroke: vi.fn(), fill: vi.fn(), rect: vi.fn(), ellipse: vi.fn(),
    fillText: vi.fn(), arc: vi.fn(), drawImage: vi.fn(), getImageData: vi.fn(), putImageData: vi.fn(), translate: vi.fn(),
    strokeStyle: '', fillStyle: '', lineWidth: 0, globalAlpha: 1, font: '', textBaseline: '', lineJoin: '', lineCap: '',
  } as unknown as ComposeCtx & Record<string, ReturnType<typeof vi.fn>>;
}

const S = { stroke: '#f00', strokeWidth: 4, fill: 'none', opacity: 1, fontSize: 24 };

describe('composeToContext', () => {
  it('draws the source image then the annotations', () => {
    const ctx = spyCtx();
    const scene: Scene = { annotations: [{ id: 'a', type: 'rect', x: 0, y: 0, w: 10, h: 10, style: S } as Annotation], nextStep: 1 };
    composeToContext(ctx, {} as CanvasImageSource, 100, 80, scene);
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    expect(ctx.rect).toHaveBeenCalled(); // the rect annotation was drawn on top
  });
});
