import {
  emptyScene, DEFAULT_STYLE, type Annotation, type Box, type Point, type Scene, type Style, type Tool,
} from '../lib/editor/types';
import { addAnnotation, removeAnnotation, updateAnnotation } from '../lib/editor/scene';
import { History } from '../lib/editor/history';
import { boundsOf, cornerHandles, handlesOf, resizeBox, translateAnnot, resizeAnnot, type Handle } from '../lib/editor/geometry';
import { hitAnnotation, hitHandle, hitBoxHandle, pointInBox } from '../lib/editor/hit-test';
import { makeView, toImage } from '../lib/editor/transform';
import { clampCrop } from '../lib/editor/crop';
import { composeToContext, flatten, type ComposeCtx } from '../lib/editor/flatten';

declare const __FS_E2E__: boolean;

let idSeq = 0;
const nextId = (): string => `an-${idSeq++}`;

const BLUR_BLOCK = 12;

export class EditorController {
  private host: HTMLElement;
  private source: ImageBitmap;
  private onChange?: () => void;

  private canvas!: HTMLCanvasElement;
  private ctx!: ComposeCtx;

  private history: History<Scene> = new History(emptyScene());
  private working: Scene = emptyScene();
  private tool: Tool = 'select';
  private style: Style = { ...DEFAULT_STYLE };
  private selectedId: string | null = null;
  private cropRect: Box | undefined;

  // drag state (image coords)
  private dragStart: Point | null = null;
  private draftId: string | null = null;
  private moveHandle: Handle | null = null;
  private movingFrom: Point | null = null;
  private dragMoved = false;
  // crop drag state
  private cropHandle: Handle | null = null;
  private cropMoveFrom: Point | null = null;
  private interactive = true;

  constructor(host: HTMLElement, source: ImageBitmap, onChange?: () => void) {
    this.host = host;
    this.source = source;
    this.onChange = onChange;
  }

  private get scene(): Scene {
    return this.working;
  }

  /** Update the live scene without recording history (used during a drag). */
  private setWorking(scene: Scene): void {
    this.working = scene;
    this.redraw();
  }

  /** Discrete change: update the live scene AND record one history entry. */
  private commit(scene: Scene): void {
    this.working = scene;
    this.history.push(scene);
    this.redraw();
    this.onChange?.();
  }

  mount(): void {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.source.width;
    this.canvas.height = this.source.height;
    this.canvas.className = 'editor-canvas';
    const displayWidth = Math.min(this.source.width, this.host.clientWidth || this.source.width);
    this.canvas.style.width = `${displayWidth}px`;
    this.ctx = this.canvas.getContext('2d') as unknown as ComposeCtx;
    this.host.appendChild(this.canvas);

    this.canvas.addEventListener('pointerdown', this.onDown);
    // pointermove/up live on window so a drag (draw, move, resize, crop) keeps
    // working even when the pointer leaves the canvas — e.g. resizing a shape
    // that fills the image by dragging a handle past the edge.
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('keydown', this.onKey);
    this.redraw();

    if (__FS_E2E__) {
      (window as unknown as { __fsEditor?: unknown }).__fsEditor = {
        addArrow: (p: { x1: number; y1: number; x2: number; y2: number }) =>
          this.commit(addAnnotation(this.scene, { id: nextId(), type: 'arrow', ...p, style: { ...this.style } })),
        addBlur: (b: Box) =>
          this.commit(addAnnotation(this.scene, { id: nextId(), type: 'blur', ...b, block: BLUR_BLOCK })),
        addStep: (pt: Point) =>
          this.commit(addAnnotation(this.scene, { id: nextId(), type: 'step', x: pt.x, y: pt.y, n: this.scene.nextStep, style: { ...this.style } })),
        flattenDataUrl: async () => {
          const blob = await this.export();
          return await new Promise<string>((res) => {
            const r = new FileReader();
            r.onload = () => res(r.result as string);
            r.readAsDataURL(blob);
          });
        },
        // Introspection for E2E assertions.
        getScene: () => this.scene,
        getSelected: () => this.selectedId,
        getCropRect: () => this.cropRect ?? null,
        getTool: () => this.tool,
        selectAt: (pt: Point) => {
          const hit = hitAnnotation(this.scene, pt, 6 * this.scale());
          this.selectedId = hit ? hit.id : null;
          this.tool = 'select';
          this.redraw();
          this.syncUi();
          return this.selectedId;
        },
      };
    }
  }

  setTool(tool: Tool): void {
    this.tool = tool;
    if (tool !== 'select') this.selectedId = null;
    this.redraw();
    this.syncUi();
  }
  setColor(c: string): void {
    this.style = { ...this.style, stroke: c };
    const sel = this.selectedAnnot();
    if (sel && sel.type !== 'blur') {
      this.commit(updateAnnotation(this.scene, sel.id, { style: { ...sel.style, stroke: c } } as Partial<Annotation>));
    }
  }
  setStrokeWidth(n: number): void {
    this.style = { ...this.style, strokeWidth: n };
    const sel = this.selectedAnnot();
    if (sel && sel.type !== 'blur') {
      this.commit(updateAnnotation(this.scene, sel.id, { style: { ...sel.style, strokeWidth: n } } as Partial<Annotation>));
    }
  }

  private selectedAnnot(): Annotation | undefined {
    return this.selectedId ? this.scene.annotations.find((a) => a.id === this.selectedId) : undefined;
  }

  /** Snapshot for the toolbar: current tool + the style the controls should reflect. */
  getUiState(): { tool: Tool; style: Style } {
    const sel = this.selectedAnnot();
    const style = sel && sel.type !== 'blur' ? sel.style : this.style;
    return { tool: this.tool, style };
  }

  private syncUi(): void {
    this.onChange?.();
  }

  undo(): void { this.working = this.history.undo(); this.selectedId = null; this.redraw(); this.onChange?.(); }
  redo(): void { this.working = this.history.redo(); this.selectedId = null; this.redraw(); this.onChange?.(); }
  deleteSelected(): void {
    if (!this.selectedId) return;
    this.commit(removeAnnotation(this.scene, this.selectedId));
    this.selectedId = null;
  }

  resetCrop(): void {
    this.cropRect = undefined;
    this.redraw();
    this.onChange?.();
  }

  hasEdits(): boolean {
    return this.scene.annotations.length > 0 || !!this.cropRect;
  }

  /** Turn editing on/off WITHOUT unmounting: the annotated canvas stays on screen
   *  after "Done" (edits persist + stay exportable) and resumes on re-edit. */
  setInteractive(on: boolean): void {
    this.interactive = on;
    if (!on) this.selectedId = null;
    this.redraw();
  }

  export(): Promise<Blob> {
    return flatten(this.source, this.scene, this.cropRect);
  }

  destroy(): void {
    this.canvas.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('keydown', this.onKey);
    this.canvas.remove();
  }

  /** Image/display scale from the canvas's ACTUAL rendered width, so pointer↔image
   *  mapping stays exact regardless of responsive max-width or window resizing. */
  private scale(): number {
    return makeView(this.source.width, this.canvas.getBoundingClientRect().width).scale;
  }

  private ptFromEvent(e: PointerEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    return toImage({ x: e.clientX - rect.left, y: e.clientY - rect.top }, makeView(this.source.width, rect.width));
  }

  private onDown = (e: PointerEvent): void => {
    if (!this.interactive) return;
    const p = this.ptFromEvent(e);
    this.dragStart = p;
    this.dragMoved = false;
    // Hit tolerances are in image px; scale them so grabbing stays easy when the
    // canvas is displayed smaller than its native resolution.
    const handleTol = 8 * this.scale();

    if (this.tool === 'select') {
      if (this.selectedId) {
        const sel = this.scene.annotations.find((a) => a.id === this.selectedId);
        const handle = sel ? hitHandle(sel, p, handleTol) : null;
        if (handle) { this.moveHandle = handle; return; }
      }
      const hit = hitAnnotation(this.scene, p, 6 * this.scale());
      this.selectedId = hit ? hit.id : null;
      this.movingFrom = hit ? p : null;
      this.redraw();
      this.syncUi();
      return;
    }
    if (this.tool === 'text') {
      e.preventDefault(); // keep the default pointerdown focus change from stealing focus
      this.spawnTextInput(p);
      this.dragStart = null;
      return;
    }
    if (this.tool === 'step') {
      this.commit(addAnnotation(this.scene, { id: nextId(), type: 'step', x: p.x, y: p.y, n: this.scene.nextStep, style: { ...this.style } }));
      this.dragStart = null;
      return;
    }
    if (this.tool === 'crop') {
      this.draftId = nextId(); // marks an active crop drag
      if (this.cropRect) {
        const h = hitBoxHandle(this.cropRect, p, handleTol);
        if (h) { this.cropHandle = h; return; }          // resize an existing crop
        if (pointInBox(p, this.cropRect)) { this.cropMoveFrom = p; return; } // move it
      }
      return; // otherwise a fresh crop rect is drawn on move
    }
    // draw tools: begin a draft; nothing is committed to history until release
    const id = nextId();
    this.draftId = id;
    const a = this.makeDraft(this.tool, id, p);
    if (a) this.setWorking(addAnnotation(this.scene, a));
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.dragStart) return;
    const p = this.ptFromEvent(e);

    // Crop only adjusts editor state (cropRect) — never the scene/history.
    if (this.tool === 'crop' && this.draftId) {
      const bounds = { w: this.source.width, h: this.source.height };
      if (this.cropHandle && this.cropRect) {
        this.cropRect = clampCrop(resizeBox(this.cropRect, this.cropHandle.id, p), bounds);
      } else if (this.cropMoveFrom && this.cropRect) {
        const dx = p.x - this.cropMoveFrom.x, dy = p.y - this.cropMoveFrom.y;
        this.cropMoveFrom = p;
        this.cropRect = {
          ...this.cropRect,
          x: Math.max(0, Math.min(this.cropRect.x + dx, bounds.w - this.cropRect.w)),
          y: Math.max(0, Math.min(this.cropRect.y + dy, bounds.h - this.cropRect.h)),
        };
      } else {
        this.cropRect = clampCrop(
          { x: Math.min(this.dragStart.x, p.x), y: Math.min(this.dragStart.y, p.y), w: Math.abs(p.x - this.dragStart.x), h: Math.abs(p.y - this.dragStart.y) },
          bounds,
        );
      }
      this.redraw();
      return;
    }

    if (this.tool === 'select' && this.selectedId) {
      const sel = this.scene.annotations.find((a) => a.id === this.selectedId);
      if (!sel) return;
      if (this.moveHandle) {
        this.dragMoved = true;
        this.setWorking(updateAnnotation(this.scene, sel.id, resizeAnnot(sel, this.moveHandle.id, p) as Partial<Annotation>));
      } else if (this.movingFrom) {
        const dx = p.x - this.movingFrom.x, dy = p.y - this.movingFrom.y;
        this.movingFrom = p;
        this.dragMoved = true;
        this.setWorking(updateAnnotation(this.scene, sel.id, translateAnnot(sel, dx, dy) as Partial<Annotation>));
      }
      return;
    }

    if (this.draftId) {
      this.dragMoved = true;
      this.setWorking(this.resizeDraft(this.draftId, this.dragStart, p));
    }
  };

  private onUp = (): void => {
    const wasDraw = !!this.draftId && this.tool !== 'crop';
    if (wasDraw && !this.dragMoved) {
      // a click with no drag on a draw tool: discard the zero-size draft
      this.setWorking(removeAnnotation(this.working, this.draftId!));
    } else if (this.dragMoved) {
      this.history.push(this.working);
      if (wasDraw) {
        // Auto-select the shape just drawn so it can be restyled/resized/deleted at once.
        this.selectedId = this.draftId;
        this.tool = 'select';
        this.redraw();
      }
      this.onChange?.();
    }
    this.dragStart = null;
    this.draftId = null;
    this.moveHandle = null;
    this.movingFrom = null;
    this.cropHandle = null;
    this.cropMoveFrom = null;
    this.dragMoved = false;
  };

  private onKey = (e: KeyboardEvent): void => {
    if (!this.interactive) return;
    if (document.activeElement instanceof HTMLInputElement) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedId) { e.preventDefault(); this.deleteSelected(); }
    else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); this.undo(); }
    else if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); this.redo(); }
  };

  private makeDraft(tool: Tool, id: string, p: Point): Annotation | null {
    const style = { ...this.style };
    switch (tool) {
      case 'arrow': return { id, type: 'arrow', x1: p.x, y1: p.y, x2: p.x, y2: p.y, style };
      case 'line': return { id, type: 'line', x1: p.x, y1: p.y, x2: p.x, y2: p.y, style };
      case 'rect': return { id, type: 'rect', x: p.x, y: p.y, w: 0, h: 0, style };
      case 'ellipse': return { id, type: 'ellipse', x: p.x, y: p.y, w: 0, h: 0, style };
      case 'highlight': return { id, type: 'highlight', x: p.x, y: p.y, w: 0, h: 0, style: { ...style, stroke: '#fde047' } };
      case 'blur': return { id, type: 'blur', x: p.x, y: p.y, w: 0, h: 0, block: BLUR_BLOCK };
      default: return null; // crop has no scene annotation
    }
  }

  private resizeDraft(id: string, from: Point, to: Point): Scene {
    const a = this.scene.annotations.find((x) => x.id === id);
    if (!a) return this.scene;
    if (a.type === 'arrow' || a.type === 'line') {
      return updateAnnotation(this.scene, id, { x2: to.x, y2: to.y } as Partial<Annotation>);
    }
    return updateAnnotation(this.scene, id, { x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), w: Math.abs(to.x - from.x), h: Math.abs(to.y - from.y) } as Partial<Annotation>);
  }

  private spawnTextInput(p: Point): void {
    const input = document.createElement('input');
    input.className = 'editor-text-input';
    const rect = this.canvas.getBoundingClientRect();
    input.style.position = 'fixed';
    input.style.left = `${rect.left + p.x / this.scale()}px`;
    input.style.top = `${rect.top + p.y / this.scale()}px`;
    input.style.font = `${this.style.fontSize / this.scale()}px system-ui, sans-serif`;
    input.style.color = this.style.stroke;
    document.body.appendChild(input);
    let done = false;
    const commit = () => {
      if (done) return;
      done = true;
      const text = input.value.trim();
      input.remove();
      if (text) this.commit(addAnnotation(this.scene, { id: nextId(), type: 'text', x: p.x, y: p.y, text, style: { ...this.style } }));
    };
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
      if (ev.key === 'Escape') { done = true; input.remove(); }
    });
    // Focus on the next frame (after the pointerdown default settles) and only then
    // wire blur→commit, so the initial focus churn can't commit-and-remove an empty box.
    requestAnimationFrame(() => {
      input.focus();
      input.addEventListener('blur', commit);
    });
  }

  private redraw(): void {
    composeToContext(this.ctx, this.source, this.source.width, this.source.height, this.scene);
    this.drawSelection();
    this.drawCropOverlay();
  }

  private drawSelection(): void {
    if (!this.selectedId) return;
    const sel = this.scene.annotations.find((a) => a.id === this.selectedId);
    if (!sel) return;
    const c = this.ctx as unknown as CanvasRenderingContext2D;
    const b = boundsOf(sel);
    c.save();
    c.strokeStyle = '#2563eb';
    c.lineWidth = Math.max(1, this.scale());
    c.setLineDash?.([6 * this.scale(), 4 * this.scale()]);
    c.strokeRect(b.x, b.y, b.w, b.h);
    c.setLineDash?.([]);
    const hs = 5 * this.scale();
    c.fillStyle = '#2563eb';
    for (const h of handlesOf(sel)) c.fillRect(h.x - hs, h.y - hs, hs * 2, hs * 2);
    c.restore();
  }

  // Dim everything outside the crop region so the user sees what will export.
  private drawCropOverlay(): void {
    if (!this.cropRect) return;
    const c = this.ctx as unknown as CanvasRenderingContext2D;
    const W = this.source.width, H = this.source.height;
    const { x, y, w, h } = this.cropRect;
    c.save();
    c.fillStyle = 'rgba(0,0,0,0.45)';
    c.fillRect(0, 0, W, y);                 // top band
    c.fillRect(0, y + h, W, H - (y + h));   // bottom band
    c.fillRect(0, y, x, h);                 // left band
    c.fillRect(x + w, y, W - (x + w), h);   // right band
    c.strokeStyle = '#22c55e';
    c.lineWidth = Math.max(2, this.scale() * 2);
    c.strokeRect(x, y, w, h);
    const hs = 5 * this.scale();
    c.fillStyle = '#22c55e';
    for (const hnd of cornerHandles(this.cropRect)) c.fillRect(hnd.x - hs, hnd.y - hs, hs * 2, hs * 2);
    c.restore();
  }
}
