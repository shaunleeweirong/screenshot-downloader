# Screenshot Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Snagit-style annotation editor to the FullShot results page so users can mark up a capture (arrow, rect, ellipse, line, text, highlighter, blur/redact, crop, numbered steps) before exporting.

**Architecture:** Object-based vector model. Annotations are plain objects in a `Scene`; a render loop composes background bitmap + annotations onto a canvas; pixels are flattened only on export. Pure geometry/model logic lives in `src/lib/editor/*` (unit-tested like `src/lib/capture/*`); a thin DOM controller lives in `src/results/`. Blur is a pixelate pass over the composited bitmap, not a vector object.

**Tech Stack:** TypeScript, esbuild, Vitest (jsdom) for unit tests, Playwright for E2E. No new runtime dependencies; no new manifest permissions.

## Global Constraints

- Manifest V3; permissions stay exactly `activeTab`, `scripting`, `storage`, `unlimitedStorage`, `downloads`. No new permissions, no host permissions.
- Everything stays local — no network calls, no new dependencies in `package.json` `dependencies`.
- Coordinates are stored in **full image-pixel space** (resolution-independent); display is CSS-scaled.
- Editor is enabled only for single-image captures (`blobs.length === 1`). Multi-tile captures keep current download-only behavior.
- Edits are ephemeral (not persisted to IndexedDB).
- Blur = pixelate/mosaic (no gaussian, no new lib).
- Test-only hooks are gated behind the existing `__FS_E2E__` define and stripped from production builds (esbuild `minifySyntax` drops the dead branch).
- Unit test style: Vitest `describe/it/expect`, files in `tests/unit/*.test.ts`, import from `../../src/lib/editor/...`.
- Run unit tests: `npm test`. Typecheck: `npm run typecheck`. Build: `npm run build`. E2E: `npm run test:e2e`.
- All exported symbols named exactly as specified in each task's **Interfaces** block.

---

## File Structure

```
src/lib/editor/
  types.ts        Tool, Point, Box, Style, Annotation union, Scene, emptyScene, DEFAULT_STYLE
  scene.ts        addAnnotation, updateAnnotation, removeAnnotation, reorder
  history.ts      History<T> ring buffer: push/undo/redo/current/canUndo/canRedo
  geometry.ts     arrowheadPoints, boundsOf, handlesOf, translateAnnot, resizeAnnot, Handle
  hit-test.ts     distToSegment, hitAnnotation, hitHandle
  transform.ts    View, makeView, toImage, toDisplay
  crop.ts         clampCrop (crop is an export-time region; no reprojection)
  pixelate.ts     pixelateRegion
  render.ts       Ctx2D, drawAnnotation, drawScene
  flatten.ts      ComposeCtx, composeToContext, flatten
src/results/
  editor-controller.ts   EditorController class (DOM glue + __FS_E2E__ hooks)
  results.ts             MODIFY: Edit toggle, mount controller, route exports through flatten
  index.html             MODIFY: toolbar markup + editor canvas host
  results.css            MODIFY: toolbar + canvas styles
tests/unit/
  editor-scene.test.ts, editor-history.test.ts, editor-geometry.test.ts,
  editor-hit-test.test.ts, editor-transform.test.ts, editor-crop.test.ts,
  editor-pixelate.test.ts, editor-render.test.ts, editor-flatten.test.ts
tests/e2e/run.mjs        MODIFY: add editor arrow + blur checks
```

---

### Task 1: Editor types + scene model

**Files:**
- Create: `src/lib/editor/types.ts`
- Create: `src/lib/editor/scene.ts`
- Test: `tests/unit/editor-scene.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  - `type Tool = 'select'|'arrow'|'rect'|'ellipse'|'line'|'text'|'highlight'|'blur'|'step'|'crop'`
  - `interface Point { x: number; y: number }`
  - `interface Box { x: number; y: number; w: number; h: number }`
  - `interface Style { stroke: string; strokeWidth: number; fill: string; opacity: number; fontSize: number }`
  - `type Annotation` (discriminated union, `type` tag; arrow/line use `x1,y1,x2,y2,style`; rect/ellipse/highlight use `x,y,w,h,style`; blur uses `x,y,w,h,block`; text uses `x,y,text,style`; step uses `x,y,n,style`; all have `id: string`)
  - `interface Scene { annotations: Annotation[]; nextStep: number }`
  - `emptyScene(): Scene`, `DEFAULT_STYLE: Style`
- Produces (`scene.ts`): `addAnnotation(scene, a): Scene`, `updateAnnotation(scene, id, patch): Scene`, `removeAnnotation(scene, id): Scene`, `reorder(scene, id, dir: 'front'|'back'): Scene`

- [ ] **Step 1: Write `src/lib/editor/types.ts`**

```ts
export type Tool =
  | 'select' | 'arrow' | 'rect' | 'ellipse' | 'line'
  | 'text' | 'highlight' | 'blur' | 'step' | 'crop';

export interface Point { x: number; y: number; }
export interface Box { x: number; y: number; w: number; h: number; }

export interface Style {
  stroke: string;      // stroke / text / step-badge color
  strokeWidth: number;
  fill: string;        // 'none' or a color
  opacity: number;     // 0..1, used by highlight + fills
  fontSize: number;    // text size / step badge radius
}

interface Id { id: string; }
export interface ArrowAnnot     extends Id { type: 'arrow';     x1: number; y1: number; x2: number; y2: number; style: Style; }
export interface LineAnnot      extends Id { type: 'line';      x1: number; y1: number; x2: number; y2: number; style: Style; }
export interface RectAnnot      extends Id { type: 'rect';      x: number; y: number; w: number; h: number; style: Style; }
export interface EllipseAnnot   extends Id { type: 'ellipse';   x: number; y: number; w: number; h: number; style: Style; }
export interface HighlightAnnot extends Id { type: 'highlight'; x: number; y: number; w: number; h: number; style: Style; }
export interface BlurAnnot      extends Id { type: 'blur';      x: number; y: number; w: number; h: number; block: number; }
export interface TextAnnot      extends Id { type: 'text';      x: number; y: number; text: string; style: Style; }
export interface StepAnnot      extends Id { type: 'step';      x: number; y: number; n: number; style: Style; }

export type Annotation =
  | ArrowAnnot | LineAnnot | RectAnnot | EllipseAnnot
  | HighlightAnnot | BlurAnnot | TextAnnot | StepAnnot;

export interface Scene { annotations: Annotation[]; nextStep: number; }

export const emptyScene = (): Scene => ({ annotations: [], nextStep: 1 });

export const DEFAULT_STYLE: Style = {
  stroke: '#ef4444', strokeWidth: 4, fill: 'none', opacity: 0.35, fontSize: 24,
};
```

- [ ] **Step 2: Write the failing test `tests/unit/editor-scene.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { addAnnotation, updateAnnotation, removeAnnotation, reorder } from '../../src/lib/editor/scene';
import { emptyScene } from '../../src/lib/editor/types';
import type { Annotation } from '../../src/lib/editor/types';

const rect = (id: string): Annotation => ({ id, type: 'rect', x: 0, y: 0, w: 10, h: 10, style: { stroke: '#f00', strokeWidth: 2, fill: 'none', opacity: 1, fontSize: 12 } });

describe('scene ops', () => {
  it('addAnnotation appends immutably', () => {
    const s0 = emptyScene();
    const s1 = addAnnotation(s0, rect('a'));
    expect(s0.annotations).toHaveLength(0);
    expect(s1.annotations.map((a) => a.id)).toEqual(['a']);
  });
  it('addAnnotation bumps nextStep past a step annotation', () => {
    const s = addAnnotation(emptyScene(), { id: 's', type: 'step', x: 5, y: 5, n: 1, style: { stroke: '#f00', strokeWidth: 2, fill: 'none', opacity: 1, fontSize: 24 } });
    expect(s.nextStep).toBe(2);
  });
  it('updateAnnotation patches only the matching id', () => {
    const s = addAnnotation(addAnnotation(emptyScene(), rect('a')), rect('b'));
    const u = updateAnnotation(s, 'b', { x: 99 } as Partial<Annotation>);
    expect(u.annotations.find((a) => a.id === 'b')).toMatchObject({ x: 99 });
    expect(u.annotations.find((a) => a.id === 'a')).toMatchObject({ x: 0 });
  });
  it('removeAnnotation drops by id', () => {
    const s = removeAnnotation(addAnnotation(emptyScene(), rect('a')), 'a');
    expect(s.annotations).toHaveLength(0);
  });
  it('reorder front moves to end, back moves to start', () => {
    const s = addAnnotation(addAnnotation(emptyScene(), rect('a')), rect('b'));
    expect(reorder(s, 'a', 'front').annotations.map((a) => a.id)).toEqual(['b', 'a']);
    expect(reorder(s, 'b', 'back').annotations.map((a) => a.id)).toEqual(['b', 'a']);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- editor-scene`
Expected: FAIL — cannot find module `../../src/lib/editor/scene`.

- [ ] **Step 4: Write `src/lib/editor/scene.ts`**

```ts
import type { Annotation, Scene } from './types';

export function addAnnotation(scene: Scene, a: Annotation): Scene {
  const nextStep = a.type === 'step' ? Math.max(scene.nextStep, a.n + 1) : scene.nextStep;
  return { annotations: [...scene.annotations, a], nextStep };
}

export function updateAnnotation(scene: Scene, id: string, patch: Partial<Annotation>): Scene {
  return {
    ...scene,
    annotations: scene.annotations.map((a) => (a.id === id ? ({ ...a, ...patch } as Annotation) : a)),
  };
}

export function removeAnnotation(scene: Scene, id: string): Scene {
  return { ...scene, annotations: scene.annotations.filter((a) => a.id !== id) };
}

export function reorder(scene: Scene, id: string, dir: 'front' | 'back'): Scene {
  const idx = scene.annotations.findIndex((a) => a.id === id);
  if (idx < 0) return scene;
  const arr = scene.annotations.slice();
  const [item] = arr.splice(idx, 1);
  if (dir === 'front') arr.push(item);
  else arr.unshift(item);
  return { ...scene, annotations: arr };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- editor-scene` → Expected: PASS. Then `npm run typecheck` → Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/editor/types.ts src/lib/editor/scene.ts tests/unit/editor-scene.test.ts
git commit -m "feat(editor): scene model + annotation types"
```

---

### Task 2: Undo/redo history

**Files:**
- Create: `src/lib/editor/history.ts`
- Test: `tests/unit/editor-history.test.ts`

**Interfaces:**
- Consumes: nothing (generic).
- Produces: `class History<T>` with `constructor(initial: T, limit = 50)`, `current(): T`, `push(state: T): void`, `undo(): T`, `redo(): T`, `canUndo(): boolean`, `canRedo(): boolean`. `push` truncates any redo tail; `undo`/`redo` clamp at the ends and return `current()`.

- [ ] **Step 1: Write the failing test `tests/unit/editor-history.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { History } from '../../src/lib/editor/history';

describe('History', () => {
  it('starts with the initial state and no undo/redo', () => {
    const h = new History(0);
    expect(h.current()).toBe(0);
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(false);
  });
  it('push then undo/redo walks the timeline', () => {
    const h = new History(0);
    h.push(1); h.push(2);
    expect(h.current()).toBe(2);
    expect(h.undo()).toBe(1);
    expect(h.undo()).toBe(0);
    expect(h.canUndo()).toBe(false);
    expect(h.redo()).toBe(1);
  });
  it('push after undo clears the redo tail', () => {
    const h = new History(0);
    h.push(1); h.push(2); h.undo();
    h.push(9);
    expect(h.current()).toBe(9);
    expect(h.canRedo()).toBe(false);
  });
  it('respects the limit (drops oldest)', () => {
    const h = new History(0, 3);
    h.push(1); h.push(2); h.push(3); // states: [1,2,3] after dropping 0
    expect(h.canUndo()).toBe(true);
    h.undo(); h.undo();
    expect(h.canUndo()).toBe(false); // only 3 states retained
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- editor-history` → Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/lib/editor/history.ts`**

```ts
export class History<T> {
  private states: T[];
  private index: number;
  private limit: number;

  constructor(initial: T, limit = 50) {
    this.states = [initial];
    this.index = 0;
    this.limit = Math.max(1, limit);
  }

  current(): T {
    return this.states[this.index];
  }

  push(state: T): void {
    this.states = this.states.slice(0, this.index + 1);
    this.states.push(state);
    if (this.states.length > this.limit) this.states.shift();
    this.index = this.states.length - 1;
  }

  undo(): T {
    if (this.canUndo()) this.index--;
    return this.current();
  }

  redo(): T {
    if (this.canRedo()) this.index++;
    return this.current();
  }

  canUndo(): boolean {
    return this.index > 0;
  }

  canRedo(): boolean {
    return this.index < this.states.length - 1;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- editor-history` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/editor/history.ts tests/unit/editor-history.test.ts
git commit -m "feat(editor): undo/redo history stack"
```

---

### Task 3: Geometry (arrowheads, bounds, handles, translate, resize)

**Files:**
- Create: `src/lib/editor/geometry.ts`
- Test: `tests/unit/editor-geometry.test.ts`

**Interfaces:**
- Consumes: `Annotation, Box, Point` from `./types`.
- Produces:
  - `interface Handle { id: string; x: number; y: number }`
  - `arrowheadPoints(x1,y1,x2,y2,size): [Point, Point]`
  - `boundsOf(a: Annotation): Box` (normalized, positive w/h)
  - `handlesOf(a: Annotation): Handle[]` (arrow/line → endpoints `p1`,`p2`; rect-like → corners `nw`,`ne`,`se`,`sw`; text/step → `[]`)
  - `translateAnnot<T extends Annotation>(a: T, dx, dy): T`
  - `resizeAnnot<T extends Annotation>(a: T, handleId: string, to: Point): T`

- [ ] **Step 1: Write the failing test `tests/unit/editor-geometry.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { arrowheadPoints, boundsOf, handlesOf, translateAnnot, resizeAnnot } from '../../src/lib/editor/geometry';
import type { Annotation } from '../../src/lib/editor/types';

const S = { stroke: '#f00', strokeWidth: 4, fill: 'none', opacity: 1, fontSize: 24 };
const arrow: Annotation = { id: 'a', type: 'arrow', x1: 0, y1: 0, x2: 100, y2: 0, style: S };
const rect: Annotation = { id: 'r', type: 'rect', x: 10, y: 20, w: 40, h: 30, style: S };

describe('geometry', () => {
  it('arrowheadPoints sit behind the tip', () => {
    const [h1, h2] = arrowheadPoints(0, 0, 100, 0, 20);
    expect(h1.x).toBeLessThan(100);
    expect(h2.x).toBeLessThan(100);
    expect(h1.y).toBeCloseTo(-h2.y, 5); // symmetric about the horizontal shaft
  });
  it('boundsOf normalizes negative rect dimensions', () => {
    const b = boundsOf({ id: 'n', type: 'rect', x: 50, y: 50, w: -30, h: -20, style: S });
    expect(b).toEqual({ x: 20, y: 30, w: 30, h: 20 });
  });
  it('boundsOf of a line uses endpoint extents', () => {
    expect(boundsOf(arrow)).toEqual({ x: 0, y: 0, w: 100, h: 0 });
  });
  it('handlesOf gives endpoints for arrows, corners for rects, none for text', () => {
    expect(handlesOf(arrow).map((h) => h.id)).toEqual(['p1', 'p2']);
    expect(handlesOf(rect).map((h) => h.id)).toEqual(['nw', 'ne', 'se', 'sw']);
    expect(handlesOf({ id: 't', type: 'text', x: 0, y: 0, text: 'hi', style: S })).toEqual([]);
  });
  it('translateAnnot shifts both shapes and endpoints', () => {
    expect(translateAnnot(rect, 5, 7)).toMatchObject({ x: 15, y: 27 });
    expect(translateAnnot(arrow, 5, 7)).toMatchObject({ x1: 5, y1: 7, x2: 105, y2: 7 });
  });
  it('resizeAnnot drags a rect corner keeping the opposite corner fixed', () => {
    const r = resizeAnnot(rect, 'se', { x: 60, y: 70 });
    expect(r).toMatchObject({ x: 10, y: 20, w: 50, h: 50 });
  });
  it('resizeAnnot moves an arrow endpoint', () => {
    expect(resizeAnnot(arrow, 'p2', { x: 5, y: 9 })).toMatchObject({ x2: 5, y2: 9 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- editor-geometry` → Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/lib/editor/geometry.ts`**

```ts
import type { Annotation, Box, Point } from './types';

export interface Handle { id: string; x: number; y: number; }

// Two barb endpoints for an arrowhead at (x2,y2), pointing away from (x1,y1).
export function arrowheadPoints(x1: number, y1: number, x2: number, y2: number, size: number): [Point, Point] {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const spread = Math.PI / 7;
  return [
    { x: x2 - size * Math.cos(angle - spread), y: y2 - size * Math.sin(angle - spread) },
    { x: x2 - size * Math.cos(angle + spread), y: y2 - size * Math.sin(angle + spread) },
  ];
}

export function boundsOf(a: Annotation): Box {
  if (a.type === 'arrow' || a.type === 'line') {
    return { x: Math.min(a.x1, a.x2), y: Math.min(a.y1, a.y2), w: Math.abs(a.x2 - a.x1), h: Math.abs(a.y2 - a.y1) };
  }
  if (a.type === 'text') {
    const w = Math.max(1, a.text.length) * a.style.fontSize * 0.6;
    return { x: a.x, y: a.y, w, h: a.style.fontSize * 1.2 };
  }
  if (a.type === 'step') {
    const r = a.style.fontSize;
    return { x: a.x - r, y: a.y - r, w: 2 * r, h: 2 * r };
  }
  // rect | ellipse | highlight | blur
  return { x: Math.min(a.x, a.x + a.w), y: Math.min(a.y, a.y + a.h), w: Math.abs(a.w), h: Math.abs(a.h) };
}

export function handlesOf(a: Annotation): Handle[] {
  if (a.type === 'arrow' || a.type === 'line') {
    return [{ id: 'p1', x: a.x1, y: a.y1 }, { id: 'p2', x: a.x2, y: a.y2 }];
  }
  if (a.type === 'text' || a.type === 'step') return [];
  const b = boundsOf(a);
  return [
    { id: 'nw', x: b.x, y: b.y },
    { id: 'ne', x: b.x + b.w, y: b.y },
    { id: 'se', x: b.x + b.w, y: b.y + b.h },
    { id: 'sw', x: b.x, y: b.y + b.h },
  ];
}

export function translateAnnot<T extends Annotation>(a: T, dx: number, dy: number): T {
  if (a.type === 'arrow' || a.type === 'line') {
    return { ...a, x1: a.x1 + dx, y1: a.y1 + dy, x2: a.x2 + dx, y2: a.y2 + dy };
  }
  return { ...a, x: a.x + dx, y: a.y + dy } as T;
}

export function resizeAnnot<T extends Annotation>(a: T, handleId: string, to: Point): T {
  if (a.type === 'arrow' || a.type === 'line') {
    return handleId === 'p1' ? { ...a, x1: to.x, y1: to.y } : { ...a, x2: to.x, y2: to.y };
  }
  if (a.type === 'text' || a.type === 'step') return a;
  const b = boundsOf(a);
  const opposite: Record<string, Point> = {
    nw: { x: b.x + b.w, y: b.y + b.h },
    ne: { x: b.x, y: b.y + b.h },
    se: { x: b.x, y: b.y },
    sw: { x: b.x + b.w, y: b.y },
  };
  const fixed = opposite[handleId] ?? { x: b.x, y: b.y };
  return {
    ...a,
    x: Math.min(fixed.x, to.x),
    y: Math.min(fixed.y, to.y),
    w: Math.abs(to.x - fixed.x),
    h: Math.abs(to.y - fixed.y),
  } as T;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- editor-geometry` → Expected: PASS. Then `npm run typecheck` → no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/editor/geometry.ts tests/unit/editor-geometry.test.ts
git commit -m "feat(editor): shape geometry, handles, translate/resize"
```

---

### Task 4: Hit testing

**Files:**
- Create: `src/lib/editor/hit-test.ts`
- Test: `tests/unit/editor-hit-test.test.ts`

**Interfaces:**
- Consumes: `Annotation, Point, Scene` from `./types`; `boundsOf, handlesOf, Handle` from `./geometry`.
- Produces:
  - `distToSegment(p: Point, a: Point, b: Point): number`
  - `hitAnnotation(scene: Scene, p: Point, tol = 6): Annotation | null` (topmost first)
  - `hitHandle(a: Annotation, p: Point, tol = 8): Handle | null`

- [ ] **Step 1: Write the failing test `tests/unit/editor-hit-test.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { distToSegment, hitAnnotation, hitHandle } from '../../src/lib/editor/hit-test';
import type { Annotation, Scene } from '../../src/lib/editor/types';

const S = { stroke: '#f00', strokeWidth: 4, fill: 'none', opacity: 1, fontSize: 24 };
const rectA: Annotation = { id: 'a', type: 'rect', x: 0, y: 0, w: 50, h: 50, style: S };
const rectB: Annotation = { id: 'b', type: 'rect', x: 10, y: 10, w: 50, h: 50, style: S };
const line: Annotation = { id: 'l', type: 'line', x1: 0, y1: 0, x2: 100, y2: 0, style: S };

describe('hit testing', () => {
  it('distToSegment measures perpendicular distance', () => {
    expect(distToSegment({ x: 50, y: 10 }, { x: 0, y: 0 }, { x: 100, y: 0 })).toBeCloseTo(10, 5);
  });
  it('hitAnnotation returns the topmost overlapping annotation', () => {
    const scene: Scene = { annotations: [rectA, rectB], nextStep: 1 };
    expect(hitAnnotation(scene, { x: 30, y: 30 })!.id).toBe('b');
  });
  it('hitAnnotation returns null on empty space', () => {
    const scene: Scene = { annotations: [rectA], nextStep: 1 };
    expect(hitAnnotation(scene, { x: 500, y: 500 })).toBeNull();
  });
  it('hitAnnotation hits a thin line within tolerance', () => {
    const scene: Scene = { annotations: [line], nextStep: 1 };
    expect(hitAnnotation(scene, { x: 50, y: 3 })!.id).toBe('l');
  });
  it('hitHandle finds a corner handle', () => {
    expect(hitHandle(rectA, { x: 50, y: 50 })!.id).toBe('se');
    expect(hitHandle(rectA, { x: 25, y: 25 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- editor-hit-test` → Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/lib/editor/hit-test.ts`**

```ts
import type { Annotation, Point, Scene } from './types';
import { boundsOf, handlesOf, type Handle } from './geometry';

function inBox(p: Point, b: { x: number; y: number; w: number; h: number }, pad: number): boolean {
  return p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad;
}

export function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function hitAnnotation(scene: Scene, p: Point, tol = 6): Annotation | null {
  for (let i = scene.annotations.length - 1; i >= 0; i--) {
    const a = scene.annotations[i];
    if (a.type === 'arrow' || a.type === 'line') {
      if (distToSegment(p, { x: a.x1, y: a.y1 }, { x: a.x2, y: a.y2 }) <= tol + a.style.strokeWidth) return a;
    } else if (inBox(p, boundsOf(a), tol)) {
      return a;
    }
  }
  return null;
}

export function hitHandle(a: Annotation, p: Point, tol = 8): Handle | null {
  for (const h of handlesOf(a)) {
    if (Math.hypot(p.x - h.x, p.y - h.y) <= tol) return h;
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- editor-hit-test` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/editor/hit-test.ts tests/unit/editor-hit-test.test.ts
git commit -m "feat(editor): hit testing for annotations and handles"
```

---

### Task 5: Display↔image coordinate transform

**Files:**
- Create: `src/lib/editor/transform.ts`
- Test: `tests/unit/editor-transform.test.ts`

**Interfaces:**
- Consumes: `Point` from `./types`.
- Produces: `interface View { scale: number }`, `makeView(imageWidth, displayWidth): View`, `toImage(p: Point, v: View): Point`, `toDisplay(p: Point, v: View): Point`. `scale = imageWidth / displayWidth`; a zero/negative displayWidth yields `scale = 1`.

- [ ] **Step 1: Write the failing test `tests/unit/editor-transform.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { makeView, toImage, toDisplay } from '../../src/lib/editor/transform';

describe('coordinate transform', () => {
  it('scales display px up to image px', () => {
    const v = makeView(2000, 1000); // image is 2x the on-screen size
    expect(v.scale).toBe(2);
    expect(toImage({ x: 100, y: 50 }, v)).toEqual({ x: 200, y: 100 });
  });
  it('round-trips display -> image -> display', () => {
    const v = makeView(1536, 640);
    const p = { x: 123, y: 45 };
    const back = toDisplay(toImage(p, v), v);
    expect(back.x).toBeCloseTo(p.x, 6);
    expect(back.y).toBeCloseTo(p.y, 6);
  });
  it('falls back to scale 1 for a zero display width', () => {
    expect(makeView(800, 0).scale).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- editor-transform` → Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/lib/editor/transform.ts`**

```ts
import type { Point } from './types';

export interface View { scale: number; }

export function makeView(imageWidth: number, displayWidth: number): View {
  return { scale: displayWidth > 0 ? imageWidth / displayWidth : 1 };
}

export function toImage(p: Point, v: View): Point {
  return { x: p.x * v.scale, y: p.y * v.scale };
}

export function toDisplay(p: Point, v: View): Point {
  return { x: p.x / v.scale, y: p.y / v.scale };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- editor-transform` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/editor/transform.ts tests/unit/editor-transform.test.ts
git commit -m "feat(editor): display<->image coordinate transform"
```

---

### Task 6: Crop clamping

**Files:**
- Create: `src/lib/editor/crop.ts`
- Test: `tests/unit/editor-crop.test.ts`

**Interfaces:**
- Consumes: `Box` from `./types`.
- Produces: `clampCrop(crop: Box, image: { w: number; h: number }): Box` (result stays inside the image, min 1×1).
- Note: crop is an **export-time region only** — `flatten` composes annotations at full-image coordinates and then copies the crop region, so the crop offset is applied automatically. There is deliberately **no** `cropScene`/reprojection (it would double-subtract the origin).

- [ ] **Step 1: Write the failing test `tests/unit/editor-crop.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { clampCrop } from '../../src/lib/editor/crop';

describe('crop', () => {
  it('clampCrop keeps the rect inside the image (top-left overflow)', () => {
    expect(clampCrop({ x: -10, y: -10, w: 50, h: 50 }, { w: 100, h: 100 })).toEqual({ x: 0, y: 0, w: 50, h: 50 });
  });
  it('clampCrop shrinks a rect overflowing the bottom-right', () => {
    expect(clampCrop({ x: 80, y: 80, w: 50, h: 50 }, { w: 100, h: 100 })).toEqual({ x: 80, y: 80, w: 20, h: 20 });
  });
  it('clampCrop enforces a minimum 1x1', () => {
    expect(clampCrop({ x: 100, y: 100, w: 0, h: 0 }, { w: 100, h: 100 })).toEqual({ x: 100, y: 100, w: 1, h: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- editor-crop` → Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/lib/editor/crop.ts`**

```ts
import type { Box } from './types';

export function clampCrop(crop: Box, image: { w: number; h: number }): Box {
  const x = Math.max(0, Math.min(crop.x, image.w));
  const y = Math.max(0, Math.min(crop.y, image.h));
  const w = Math.max(1, Math.min(crop.w, image.w - x));
  const h = Math.max(1, Math.min(crop.h, image.h - y));
  return { x, y, w, h };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- editor-crop` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/editor/crop.ts tests/unit/editor-crop.test.ts
git commit -m "feat(editor): crop clamping for export-time region"
```

---

### Task 7: Pixelate (mosaic/redact)

**Files:**
- Create: `src/lib/editor/pixelate.ts`
- Test: `tests/unit/editor-pixelate.test.ts`

**Interfaces:**
- Consumes: `Box` from `./types`.
- Produces: `pixelateRegion(data, width, height, box: Box, block: number): typeof data` where `data` is `Uint8ClampedArray | number[]` in RGBA order (`width*height*4`). Averages each `block×block` cell within `box` (clamped to the buffer) and writes the average back. Mutates and returns `data`.

- [ ] **Step 1: Write the failing test `tests/unit/editor-pixelate.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { pixelateRegion } from '../../src/lib/editor/pixelate';

// 2x2 RGBA image: two black pixels (top row), two white pixels (bottom row).
function img(): number[] {
  return [
    0, 0, 0, 255,    0, 0, 0, 255,
    255, 255, 255, 255,  255, 255, 255, 255,
  ];
}

describe('pixelateRegion', () => {
  it('averages a block covering the whole image to mid-grey', () => {
    const d = pixelateRegion(img(), 2, 2, { x: 0, y: 0, w: 2, h: 2 }, 2) as number[];
    // average of 0 and 255 over 4 pixels ~ 128
    expect(d[0]).toBeGreaterThan(120);
    expect(d[0]).toBeLessThan(135);
    expect(d[0]).toBe(d[4]); // all four pixels now equal
    expect(d[0]).toBe(d[8]);
  });
  it('leaves pixels outside the box untouched', () => {
    const d = pixelateRegion(img(), 2, 2, { x: 0, y: 0, w: 1, h: 1 }, 1) as number[];
    expect(d.slice(4, 8)).toEqual([0, 0, 0, 255]); // top-right pixel unchanged
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- editor-pixelate` → Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/lib/editor/pixelate.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- editor-pixelate` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/editor/pixelate.ts tests/unit/editor-pixelate.test.ts
git commit -m "feat(editor): pixelate/mosaic redaction on ImageData buffers"
```

---

### Task 8: Vector renderer

**Files:**
- Create: `src/lib/editor/render.ts`
- Test: `tests/unit/editor-render.test.ts`

**Interfaces:**
- Consumes: `arrowheadPoints, boundsOf` from `./geometry`; `Annotation, Scene` from `./types`.
- Produces:
  - `interface Ctx2D` — the subset of `CanvasRenderingContext2D` the renderer touches (methods `save,restore,beginPath,moveTo,lineTo,closePath,stroke,fill,rect,ellipse,fillText,arc`; writable props `strokeStyle,fillStyle,lineWidth,globalAlpha,font,textBaseline,lineJoin,lineCap`).
  - `drawAnnotation(ctx: Ctx2D, a: Annotation): void` (skips `blur` — handled by the pixelate pass)
  - `drawScene(ctx: Ctx2D, scene: Scene): void`

- [ ] **Step 1: Write the failing test `tests/unit/editor-render.test.ts`**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- editor-render` → Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/lib/editor/render.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- editor-render` → Expected: PASS. Then `npm run typecheck` → no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/editor/render.ts tests/unit/editor-render.test.ts
git commit -m "feat(editor): vector renderer for annotations"
```

---

### Task 9: Compose + flatten to blob

**Files:**
- Create: `src/lib/editor/flatten.ts`
- Test: `tests/unit/editor-flatten.test.ts`

**Interfaces:**
- Consumes: `drawScene, Ctx2D` from `./render`; `pixelateRegion` from `./pixelate`; `boundsOf` from `./geometry`; `Box, Scene` from `./types`.
- Produces:
  - `interface ComposeCtx extends Ctx2D` — adds `drawImage`, `getImageData`, `putImageData`, and `translate`.
  - `composeToContext(ctx: ComposeCtx, source, sourceWidth, sourceHeight, scene): void` — draws the source image, applies each blur region as a pixelate pass, then draws vector annotations. Natural (uncropped) coordinates.
  - `flatten(source: ImageBitmap, scene: Scene, crop?: Box): Promise<Blob>` — composes onto a full-size `OffscreenCanvas`, then (if `crop`) copies the crop region onto a second canvas; returns a PNG blob. **Verified by E2E (Task 13), not jsdom** — jsdom has no real canvas.

- [ ] **Step 1: Write the failing test `tests/unit/editor-flatten.test.ts`**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- editor-flatten` → Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/lib/editor/flatten.ts`**

```ts
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
    const w = Math.max(1, Math.round(b.w));
    const h = Math.max(1, Math.round(b.h));
    const x = Math.max(0, Math.round(b.x));
    const y = Math.max(0, Math.round(b.y));
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- editor-flatten` → Expected: PASS. Then `npm run typecheck` → no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/editor/flatten.ts tests/unit/editor-flatten.test.ts
git commit -m "feat(editor): compose + flatten scene to PNG blob"
```

---

### Task 10: Editor controller (DOM glue + E2E hooks)

**Files:**
- Create: `src/results/editor-controller.ts`
- Test: (no unit test — DOM/pointer glue; covered by build + Task 13 E2E)

**Interfaces:**
- Consumes: everything from `src/lib/editor/*` (scene ops, geometry, hit-test, transform, crop, render, flatten, types).
- Produces: `class EditorController` with constructor `(host: HTMLElement, source: ImageBitmap, onChange?: () => void)` and methods:
  - `mount(): void` — builds the `<canvas>` inside `host`, wires pointer + keyboard, initial redraw.
  - `setTool(tool: Tool): void`, `setColor(c: string): void`, `setStrokeWidth(n: number): void`
  - `undo(): void`, `redo(): void`, `deleteSelected(): void`, `resetCrop(): void`
  - `hasEdits(): boolean` — true if any annotation exists or a crop is active
  - `export(): Promise<Blob>` — `flatten(source, scene, cropRect)`
  - `destroy(): void`
- Behavior notes: canvas backing store = `source.width × source.height`; CSS width set to fit `host` (maintains aspect); `View` derives from those. Pointer coords → image space via `toImage`. A live `working` scene is edited during a drag; **exactly one** `history.push` happens on pointer-release (or per discrete action), so undo never steps through intermediate drag frames. Draw tools press-drag-release create an annotation; `select` moves/resizes/deletes; `text` spawns a positioned `<input>` committed on Enter/blur; `step` click drops an auto-incrementing badge. `crop` drags a rect that sets `cropRect` (editor state, not part of the scene) and dims the area outside; the crop is applied only at export by `flatten`, and `resetCrop()` clears it — there is no coordinate reprojection. Redraw composes image → blur pixelate → vector annotations → selection handles → crop dim overlay.
- Under `__FS_E2E__`, `mount()` also assigns `window.__fsEditor` with `{ addArrow(imgPts), addBlur(imgBox), addStep(imgPt), flattenDataUrl(): Promise<string> }` so E2E can drive the editor without synthetic pointer math.

- [ ] **Step 1: Write `src/results/editor-controller.ts`**

```ts
import {
  emptyScene, DEFAULT_STYLE, type Annotation, type Box, type Point, type Scene, type Style, type Tool,
} from '../lib/editor/types';
import { addAnnotation, removeAnnotation, updateAnnotation } from '../lib/editor/scene';
import { History } from '../lib/editor/history';
import { boundsOf, handlesOf, translateAnnot, resizeAnnot, type Handle } from '../lib/editor/geometry';
import { hitAnnotation, hitHandle } from '../lib/editor/hit-test';
import { makeView, toImage, type View } from '../lib/editor/transform';
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
  private view: View = { scale: 1 };

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
    this.view = makeView(this.source.width, displayWidth);
    this.ctx = this.canvas.getContext('2d') as unknown as ComposeCtx;
    this.host.appendChild(this.canvas);

    this.canvas.addEventListener('pointerdown', this.onDown);
    this.canvas.addEventListener('pointermove', this.onMove);
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
      };
    }
  }

  setTool(tool: Tool): void {
    this.tool = tool;
    if (tool !== 'select') this.selectedId = null;
    this.redraw();
  }
  setColor(c: string): void {
    this.style = { ...this.style, stroke: c };
    if (this.selectedId) this.commit(updateAnnotation(this.scene, this.selectedId, { style: { ...this.style } } as Partial<Annotation>));
  }
  setStrokeWidth(n: number): void {
    this.style = { ...this.style, strokeWidth: n };
    if (this.selectedId) this.commit(updateAnnotation(this.scene, this.selectedId, { style: { ...this.style } } as Partial<Annotation>));
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

  export(): Promise<Blob> {
    return flatten(this.source, this.scene, this.cropRect);
  }

  destroy(): void {
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('keydown', this.onKey);
    this.canvas.remove();
  }

  private ptFromEvent(e: PointerEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    return toImage({ x: e.clientX - rect.left, y: e.clientY - rect.top }, this.view);
  }

  private onDown = (e: PointerEvent): void => {
    const p = this.ptFromEvent(e);
    this.dragStart = p;
    this.dragMoved = false;
    if (this.tool === 'select') {
      if (this.selectedId) {
        const sel = this.scene.annotations.find((a) => a.id === this.selectedId);
        const handle = sel ? hitHandle(sel, p) : null;
        if (handle) { this.moveHandle = handle; return; }
      }
      const hit = hitAnnotation(this.scene, p);
      this.selectedId = hit ? hit.id : null;
      this.movingFrom = hit ? p : null;
      this.redraw();
      return;
    }
    if (this.tool === 'text') {
      this.spawnTextInput(p);
      this.dragStart = null;
      return;
    }
    if (this.tool === 'step') {
      this.commit(addAnnotation(this.scene, { id: nextId(), type: 'step', x: p.x, y: p.y, n: this.scene.nextStep, style: { ...this.style } }));
      this.dragStart = null;
      return;
    }
    // draw + crop tools: begin a draft; nothing is committed to history until release
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
      this.cropRect = clampCrop(
        { x: Math.min(this.dragStart.x, p.x), y: Math.min(this.dragStart.y, p.y), w: Math.abs(p.x - this.dragStart.x), h: Math.abs(p.y - this.dragStart.y) },
        { w: this.source.width, h: this.source.height },
      );
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
    if (this.draftId && this.tool !== 'crop' && !this.dragMoved) {
      // a click with no drag on a draw tool: discard the zero-size draft
      this.setWorking(removeAnnotation(this.working, this.draftId));
    } else if (this.dragMoved) {
      this.history.push(this.working);
      this.onChange?.();
    }
    this.dragStart = null;
    this.draftId = null;
    this.moveHandle = null;
    this.movingFrom = null;
    this.dragMoved = false;
  };

  private onKey = (e: KeyboardEvent): void => {
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
    input.style.left = `${rect.left + p.x / this.view.scale}px`;
    input.style.top = `${rect.top + p.y / this.view.scale}px`;
    input.style.font = `${this.style.fontSize / this.view.scale}px system-ui, sans-serif`;
    input.style.color = this.style.stroke;
    document.body.appendChild(input);
    input.focus();
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
    input.addEventListener('blur', commit);
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
    c.lineWidth = Math.max(1, this.view.scale);
    c.setLineDash?.([6 * this.view.scale, 4 * this.view.scale]);
    c.strokeRect(b.x, b.y, b.w, b.h);
    c.setLineDash?.([]);
    const hs = 5 * this.view.scale;
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
    c.lineWidth = Math.max(2, this.view.scale * 2);
    c.strokeRect(x, y, w, h);
    c.restore();
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors. (Note: `setLineDash`/`strokeRect`/`setLineDash` come from the real 2D context; the `ComposeCtx` cast to `CanvasRenderingContext2D` in `drawSelection`/`drawCropOverlay` is intentional for the DOM-only decoration pass.)

- [ ] **Step 3: Commit**

```bash
git add src/results/editor-controller.ts
git commit -m "feat(editor): interactive editor controller with E2E hooks"
```

---

### Task 11: Toolbar markup + styles

**Files:**
- Modify: `src/results/index.html`
- Modify: `src/results/results.css`

**Interfaces:**
- Produces DOM ids/classes consumed by Task 12: button `#edit-toggle`; container `#editor-toolbar` (hidden by default) holding tool buttons with `data-tool` = each `Tool` value (`select,arrow,rect,ellipse,line,text,highlight,blur,step,crop`), plus `#tool-color` (`<input type="color">`), `#tool-width` (`<input type="range">`), `#tool-undo`, `#tool-redo`, `#tool-delete`, `#tool-crop-reset`. Editor host stays `#stage`.

- [ ] **Step 1: Edit `src/results/index.html` — add the Edit button to `.actions` and a toolbar row**

Replace the `.actions` block and add a toolbar directly under the header. The `.actions` div gains an Edit button as its first child:

```html
      <div class="actions">
        <button id="edit-toggle" class="btn">Edit</button>
        <input id="filename" class="filename" type="text" spellcheck="false" aria-label="File name" />
        <button id="dl-png" class="btn primary">Download PNG</button>
        <button id="dl-jpg" class="btn">JPG</button>
        <button id="dl-pdf" class="btn">PDF</button>
        <button id="copy" class="btn">Copy</button>
      </div>
    </header>
    <div id="editor-toolbar" class="editor-toolbar" hidden>
      <button class="tool" data-tool="select" title="Select / move">⭯</button>
      <button class="tool" data-tool="arrow" title="Arrow">↗</button>
      <button class="tool" data-tool="rect" title="Rectangle">▭</button>
      <button class="tool" data-tool="ellipse" title="Ellipse">◯</button>
      <button class="tool" data-tool="line" title="Line">╱</button>
      <button class="tool" data-tool="text" title="Text">T</button>
      <button class="tool" data-tool="highlight" title="Highlighter">▨</button>
      <button class="tool" data-tool="blur" title="Blur / redact">▩</button>
      <button class="tool" data-tool="step" title="Numbered step">①</button>
      <button class="tool" data-tool="crop" title="Crop">⛶</button>
      <span class="tool-sep"></span>
      <input id="tool-color" type="color" value="#ef4444" title="Color" />
      <input id="tool-width" type="range" min="1" max="20" value="4" title="Stroke width" />
      <span class="tool-sep"></span>
      <button id="tool-crop-reset" class="btn" hidden>Reset crop</button>
      <button id="tool-undo" class="btn" title="Undo">↶</button>
      <button id="tool-redo" class="btn" title="Redo">↷</button>
      <button id="tool-delete" class="btn" title="Delete selected">🗑</button>
    </div>
```

(Keep the existing `<main id="stage" class="stage">` and everything below unchanged.)

- [ ] **Step 2: Edit `src/results/results.css` — append editor styles**

```css
.editor-toolbar {
  position: sticky; top: 53px; z-index: 4;
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  padding: 8px 16px; background: var(--panel); border-bottom: 1px solid var(--border);
}
.tool {
  min-width: 34px; height: 34px; padding: 0 8px;
  border: 1px solid var(--border); border-radius: 8px; background: #fff;
  cursor: pointer; font: inherit; font-size: 16px; line-height: 1;
}
.tool:hover { border-color: var(--accent); color: var(--accent); }
.tool.active { background: var(--accent); color: #fff; border-color: var(--accent); }
.tool-sep { width: 1px; height: 22px; background: var(--border); margin: 0 4px; }
#tool-color { width: 34px; height: 34px; padding: 0; border: 1px solid var(--border); border-radius: 8px; background: #fff; cursor: pointer; }
#tool-width { width: 90px; }
.editor-canvas { max-width: 100%; height: auto; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.15), 0 8px 24px rgba(0,0,0,.08); border-radius: 4px; cursor: crosshair; touch-action: none; }
.editor-text-input { z-index: 2147483647; border: 1px dashed var(--accent); background: rgba(255,255,255,.9); padding: 0 2px; outline: none; }
.stage.editing img { display: none; }
```

- [ ] **Step 3: Build to verify static assets copy and HTML is valid**

Run: `npm run build`
Expected: `Build complete -> dist/`, and `dist/results.html` contains `id="editor-toolbar"`.

- [ ] **Step 4: Commit**

```bash
git add src/results/index.html src/results/results.css
git commit -m "feat(editor): toolbar markup and styles on the results page"
```

---

### Task 12: Wire the editor into the results page

**Files:**
- Modify: `src/results/results.ts`

**Interfaces:**
- Consumes: `EditorController` from `./editor-controller`; existing `blobs`, `settings`, download helpers.
- Produces: Edit toggle behavior + export routing. New module-level helpers: `enterEditMode()`, `exitEditMode()`, `currentExportBlobs(): Promise<Blob[]>` returning the flattened single blob when editing with edits, else the original `blobs`.

- [ ] **Step 1: Edit `src/results/results.ts` — import the controller and add editor state**

At the top, after the existing imports, add:

```ts
import { EditorController } from './editor-controller';
```

After the existing `let settings: Settings;` line, add:

```ts
let editor: EditorController | null = null;
let editing = false;
const editToggle = document.getElementById('edit-toggle') as HTMLButtonElement;
const toolbar = document.getElementById('editor-toolbar') as HTMLElement;
```

- [ ] **Step 2: Add edit-mode mount/unmount + export routing (append these functions before `main`)**

```ts
async function bitmapFromBlob(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob);
}

async function enterEditMode(): Promise<void> {
  if (editing || blobs.length !== 1) return;
  editing = true;
  editToggle.textContent = 'Done';
  editToggle.classList.add('primary');
  toolbar.hidden = false;
  stage.classList.add('editing');
  const source = await bitmapFromBlob(blobs[0]);
  editor = new EditorController(stage, source);
  editor.mount();
  editor.setTool('select');

  toolbar.querySelectorAll<HTMLButtonElement>('.tool').forEach((b) => {
    b.addEventListener('click', () => {
      toolbar.querySelectorAll('.tool').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      const tool = b.dataset.tool as Parameters<EditorController['setTool']>[0];
      editor!.setTool(tool);
      (document.getElementById('tool-crop-reset') as HTMLElement).hidden = tool !== 'crop';
    });
  });
  (document.getElementById('tool-color') as HTMLInputElement).addEventListener('input', (e) => editor!.setColor((e.target as HTMLInputElement).value));
  (document.getElementById('tool-width') as HTMLInputElement).addEventListener('input', (e) => editor!.setStrokeWidth(parseInt((e.target as HTMLInputElement).value, 10)));
  document.getElementById('tool-undo')!.addEventListener('click', () => editor!.undo());
  document.getElementById('tool-redo')!.addEventListener('click', () => editor!.redo());
  document.getElementById('tool-delete')!.addEventListener('click', () => editor!.deleteSelected());
  document.getElementById('tool-crop-reset')!.addEventListener('click', () => editor!.resetCrop());
}

function exitEditMode(): void {
  if (!editing) return;
  editing = false;
  editToggle.textContent = 'Edit';
  editToggle.classList.remove('primary');
  toolbar.hidden = true;
  stage.classList.remove('editing');
  editor?.destroy();
  editor = null;
}

async function currentExportBlobs(): Promise<Blob[]> {
  if (editor && editor.hasEdits()) return [await editor.export()];
  return blobs;
}
```

- [ ] **Step 3: Route the existing download/copy handlers through `currentExportBlobs()`**

Change the four export functions to source their blobs from `currentExportBlobs()`. Replace the bodies of `downloadPng`, `downloadJpg`, `downloadPdf`, and `copyToClipboard` so they use a local `bl`:

```ts
async function downloadPng(): Promise<void> {
  const bl = await currentExportBlobs();
  if (bl.length === 1) downloadBlob(bl[0], nameFor('png'));
  else bl.forEach((b, i) => downloadBlob(b, nameFor('png', i)));
  toast('Downloaded PNG');
}

async function downloadJpg(): Promise<void> {
  const bl = await currentExportBlobs();
  for (let i = 0; i < bl.length; i++) {
    const jpg = await toJpeg(bl[i], settings.jpegQuality);
    downloadBlob(jpg, nameFor('jpg', bl.length > 1 ? i : undefined));
  }
  toast('Downloaded JPG');
}

async function downloadPdf(): Promise<void> {
  const bl = await currentExportBlobs();
  const pdf = await buildPdf(bl);
  downloadBlob(pdf, nameFor('pdf'));
  toast('Downloaded PDF');
}

async function copyToClipboard(): Promise<void> {
  try {
    const bl = await currentExportBlobs();
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': bl[0] })]);
    toast('Copied to clipboard');
  } catch {
    toast('Copy failed — try downloading instead');
  }
}
```

And change `buildPdf` to take blobs as a parameter (it currently closes over the module `blobs`):

```ts
async function buildPdf(source: Blob[]): Promise<Blob> {
  let doc: jsPDF | undefined;
  for (let i = 0; i < source.length; i++) {
    const bmp = await createImageBitmap(source[i]);
    const w = bmp.width;
    const h = bmp.height;
    const orientation = w > h ? 'l' : 'p';
    if (!doc) doc = new jsPDF({ orientation, unit: 'px', format: [w, h] });
    else doc.addPage([w, h], orientation);
    const dataUrl = await blobToDataUrl(source[i]);
    doc.addImage(dataUrl, 'PNG', 0, 0, w, h);
    bmp.close();
  }
  return doc!.output('blob');
}
```

- [ ] **Step 4: Wire the Edit toggle in `main()` and gate on single-tile**

Inside `main()`, after `render();` and before the button listeners, add:

```ts
  if (blobs.length === 1) {
    editToggle.addEventListener('click', () => (editing ? exitEditMode() : void enterEditMode()));
  } else {
    editToggle.disabled = true;
    editToggle.title = 'Editing is unavailable for very large multi-part captures';
  }
```

(The `autoDownload` path at the end of `main()` still calls `downloadPng/Jpg/Pdf`, which now route through `currentExportBlobs()` — with no editor mounted they return the original `blobs`, so auto-download is unchanged.)

- [ ] **Step 5: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: no type errors; `Build complete -> dist/`.

- [ ] **Step 6: Commit**

```bash
git add src/results/results.ts
git commit -m "feat(editor): mount editor on results page and flatten on export"
```

---

### Task 13: End-to-end editor verification

**Files:**
- Modify: `tests/e2e/run.mjs`

**Interfaces:**
- Consumes: existing E2E harness (`openResult`, `sw.evaluate(__fsCaptureActive)`, `analysisPage`) and the `window.__fsEditor` hook from Task 10.

- [ ] **Step 1: Add an editor helper + checks after the region-capture block (before the `} catch` at the end)**

```js
  // ---------- 6. Editor: arrow annotation bakes into the export ----------
  {
    await fixture.bringToFront();
    await fixture.evaluate(() => window.scrollTo(0, 0));
    const res = await sw.evaluate(() => globalThis.__fsCaptureActive('visible'));
    if (res && res.ok && res.recordId) {
      await analysisPage.goto(`chrome-extension://${id}/results.html?id=${res.recordId}`, { waitUntil: 'load' });
      await analysisPage.waitForSelector('.stage img', { timeout: 8000 });
      await analysisPage.click('#edit-toggle');
      await analysisPage.waitForSelector('.editor-canvas', { timeout: 8000 });

      const out = await analysisPage.evaluate(async () => {
        const ed = window.__fsEditor;
        // draw a red arrow across the middle band of the image
        const cv = document.querySelector('.editor-canvas');
        ed.addArrow({ x1: Math.round(cv.width * 0.2), y1: Math.round(cv.height * 0.5), x2: Math.round(cv.width * 0.8), y2: Math.round(cv.height * 0.5) });
        const url = await ed.flattenDataUrl();
        const img = new Image();
        await new Promise((r) => { img.onload = r; img.src = url; });
        const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
        const cx = c.getContext('2d'); cx.drawImage(img, 0, 0);
        const midY = Math.floor(img.naturalHeight * 0.5);
        const row = cx.getImageData(0, midY, img.naturalWidth, 1).data;
        let red = 0;
        for (let x = 0; x < img.naturalWidth; x++) {
          const i = x * 4;
          if (row[i] > 180 && row[i + 1] < 90 && row[i + 2] < 90) red++;
        }
        return { w: img.naturalWidth, h: img.naturalHeight, red };
      });
      check('editor: exported PNG matches source dimensions', out.w > 0 && out.h > 0, `${out.w}x${out.h}`);
      check('editor: arrow annotation is baked into the export', out.red > 20, `red px on mid row = ${out.red}`);
    } else {
      check('editor: capture for edit', false, JSON.stringify(res));
    }
  }

  // ---------- 7. Editor: blur redacts a region ----------
  {
    await fixture.bringToFront();
    await fixture.evaluate(() => window.scrollTo(0, 0));
    const res = await sw.evaluate(() => globalThis.__fsCaptureActive('visible'));
    if (res && res.ok && res.recordId) {
      await analysisPage.goto(`chrome-extension://${id}/results.html?id=${res.recordId}`, { waitUntil: 'load' });
      await analysisPage.waitForSelector('.stage img', { timeout: 8000 });
      await analysisPage.click('#edit-toggle');
      await analysisPage.waitForSelector('.editor-canvas', { timeout: 8000 });

      const changed = await analysisPage.evaluate(async () => {
        const ed = window.__fsEditor;
        const cv = document.querySelector('.editor-canvas');
        // Straddle the red-header / blue-section edge (~80 css px down) so the
        // mosaic is guaranteed to change pixels regardless of exact layout.
        const dpr = window.devicePixelRatio || 1;
        const y0 = Math.max(0, Math.round(80 * dpr) - 30);
        const box = { x: 0, y: y0, w: cv.width, h: Math.min(60, cv.height - y0) };
        // sample the original pixels of that box first
        const src = cv.getContext('2d').getImageData(box.x, box.y, box.w, box.h).data.slice();
        ed.addBlur(box);
        const url = await ed.flattenDataUrl();
        const img = new Image();
        await new Promise((r) => { img.onload = r; img.src = url; });
        const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
        const cx = c.getContext('2d'); cx.drawImage(img, 0, 0);
        const after = cx.getImageData(box.x, box.y, box.w, box.h).data;
        let diff = 0;
        for (let i = 0; i < after.length; i += 4) if (Math.abs(after[i] - src[i]) > 3) diff++;
        return diff;
      });
      check('editor: blur changes pixels in the redacted region', changed > 10, `changed px = ${changed}`);
    } else {
      check('editor: capture for blur', false, JSON.stringify(res));
    }
  }
```

- [ ] **Step 2: Build the E2E variant and run the suite**

Run: `npm run test:e2e`
Expected: all existing checks still pass AND the three new editor checks pass (`exported PNG matches source dimensions`, `arrow annotation is baked into the export`, `blur changes pixels in the redacted region`).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/run.mjs
git commit -m "test(editor): e2e arrow + blur bake-in verification"
```

---

## Final integration check

- [ ] Run `npm run typecheck` → no errors.
- [ ] Run `npm test` → all unit suites pass (scene, history, geometry, hit-test, transform, crop, pixelate, render, flatten).
- [ ] Run `npm run build` → `Build complete -> dist/`.
- [ ] Run `npm run test:e2e` → all capture checks + editor checks pass.
- [ ] Manual smoke: load `dist/` unpacked, capture a page, click **Edit**, add an arrow + blur + step, Download PNG, confirm the annotations are baked in and the un-annotated Copy path still works with zero edits.
