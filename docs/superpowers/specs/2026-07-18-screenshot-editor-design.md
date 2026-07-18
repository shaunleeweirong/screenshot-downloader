# FullShot Screenshot Editor — Design Spec

**Date:** 2026-07-18
**Status:** Approved (design), pending implementation plan
**Author:** Claude + Shaun

## 1. Goal

After capturing a screenshot, let the user annotate it — Snagit-style — before exporting.
The editor lives on the existing results page (`results.html`); the user captures, clicks
**Edit**, marks up the image, and the existing PNG/JPG/PDF/Copy buttons export the annotated
result. This brings the "editor" (previously listed as a future Pro feature in the README)
into the **free** tier.

## 2. Scope

### In scope (v1 tools)
Arrow, Rectangle, Ellipse, Line, Text label, Highlighter, Blur/redact, Crop, Numbered steps —
all riding on a **Select/Move** tool plus **Undo/Redo**.

### Out of scope (v1)
- Multi-tile captures: editor is enabled only for single-image captures (`blobs.length === 1`).
  Very large multi-part captures keep today's download-only behavior with a small note.
- Persistence: edits are ephemeral (live in the results-page session; flattened on export).
  Not saved to IndexedDB — there is no history-browsing UI to reopen old captures, so
  persistence is YAGNI for now.
- Snagit's CV-heavy tier: Smart Move, Simplify, Magic Wand, flood-fill, Cut Out, Templates.
- Gaussian blur (we use pixelate/mosaic instead — see §6).

## 3. Architecture decision

**Object-based vector model** (mirrors Snagit and FullShot's existing "pure geometry lib +
thin DOM layer" split). Annotations are plain JS objects in an array. A render loop redraws
the background image + all objects onto a canvas on every scene change. Objects stay
selectable/movable/deletable; pixels are flattened only on export. Undo/redo is a stack of
scene snapshots.

Rejected alternatives:
- **Destructive bitmap painting** — cannot move/restyle after placing; undo needs full-bitmap
  snapshots (memory-heavy); hard to unit-test. Fights the codebase's testability culture.
- **SVG overlay** — SVG→raster export (fonts, blur) is fiddly in an extension and diverges
  from the canvas the export path already uses.

## 4. Module structure

Pure, unit-testable logic lives in `src/lib/editor/*` (mirroring `src/lib/capture/*`); the
DOM/event controller is thin and lives under `src/results/`.

```
src/lib/editor/
  types.ts        Annotation discriminated union + Tool type + style types
  scene.ts        document model: Annotation[] + pure ops (add/update/remove/reorder)
  history.ts      undo/redo stack over scene snapshots
  geometry.ts     arrowhead points, bounding boxes, resize-handle positions
  hit-test.ts     point→annotation and point→handle hit testing
  transform.ts    display↔image coordinate mapping (scaled canvas ↔ full-res pixels)
  crop.ts         crop-rect math + reprojection of existing annotations after a crop
  pixelate.ts     mosaic/redact a region of ImageData (pure: pixels + rect + block → pixels)
  render.ts       draw one annotation to a 2D context (thin; geometry lives in geometry.ts)
  flatten.ts      compose background + annotations → Blob at full resolution
src/results/
  editor-controller.ts   pointer events → scene ops, tool state, selection, redraw loop
  results.ts             (existing) bootstraps page; mounts controller in Edit mode
  index.html             (existing) + toolbar markup
  results.css            (existing) + toolbar/canvas styles
```

Keeping the editor logic out of `results.ts` keeps that file a thin page-bootstrap and keeps
each unit focused and testable.

## 5. Data model

A discriminated union, one variant per tool. All shapes carry `id`, geometry, and `style`.

```ts
type Tool =
  | 'select' | 'arrow' | 'rect' | 'ellipse' | 'line'
  | 'text' | 'highlight' | 'blur' | 'step' | 'crop';

interface Style {
  stroke: string;        // color
  strokeWidth: number;
  fill?: string;         // for rect/ellipse fills + highlight
  opacity?: number;      // highlight / fill translucency
  fontSize?: number;     // text
}

type Annotation =
  | { id: string; type: 'arrow';     x1;y1;x2;y2: number; style: Style }
  | { id: string; type: 'line';      x1;y1;x2;y2: number; style: Style }
  | { id: string; type: 'rect';      x;y;w;h: number;     style: Style }
  | { id: string; type: 'ellipse';   x;y;w;h: number;     style: Style }
  | { id: string; type: 'highlight'; x;y;w;h: number;     style: Style }
  | { id: string; type: 'blur';      x;y;w;h: number;     block: number } // mosaic block px
  | { id: string; type: 'text';      x;y: number; text: string;  style: Style }
  | { id: string; type: 'step';      x;y: number; n: number;     style: Style };
```

Coordinates are stored in **full image-pixel space** (resolution-independent) and rendered
scaled to the on-screen size — the same device-pixel discipline the capture pipeline uses, so
exports are crisp at native resolution.

`Scene = { annotations: Annotation[]; nextStep: number }`. Scene ops are pure and return a new
Scene. History keeps a bounded stack (e.g. 50) of Scenes for undo/redo.

## 6. Blur / redact

Implemented as **pixelation (mosaic)**: a pure `pixelate(imageData, rect, block) → ImageData`
that replaces each `block×block` cell with its average color. Dependency-free, fast, and
unit-testable on plain arrays. Rendered on-screen for preview and re-applied at full resolution
during flatten. Chosen over gaussian blur (which would need a stack-blur dependency); mosaic is
the standard, effective redaction for screenshots and reinforces FullShot's privacy angle.

## 7. Rendering & interaction

- An overlay `<canvas>` sits over the captured image, sized to the displayed (scaled) image.
- Redraw on every scene change: background bitmap → each annotation (painter's order) →
  selection handles for the selected object.
- The controller converts pointer coords (display space) → image space via `transform.ts`
  before creating/updating annotations, so the stored geometry is always full-res.
- **Select/Move**: hit-test objects (topmost wins) and resize handles; drag to move/resize;
  Delete/Backspace removes the selected object; click empty space deselects.
- **Draw tools** (arrow/rect/ellipse/line/highlight/blur): press-drag-release creates the object.
- **Text**: an overlaid HTML `<input>`/contentEditable captures typing; committing creates a
  `text` object (avoids painful raw-canvas text editing).
- **Step**: click drops an auto-incrementing numbered badge; `Scene.nextStep` tracks the counter.
- **Crop**: drag a rect; applying it sets the export viewport and reprojects existing annotation
  coordinates via `crop.ts` (subtract crop origin), and updates displayed dimensions.

## 8. Export / flatten

`flatten.ts` composes the background bitmap + all annotations onto an `OffscreenCanvas` at full
image resolution and returns a Blob (honoring any crop for output dimensions). The existing
PNG/JPG/PDF/Copy buttons consume the flattened blob whenever annotations exist; with **zero**
annotations the output is byte-identical to today's behavior. Everything downstream of flatten
(`filename.ts`, JPEG re-encode, jsPDF, clipboard) is reused unchanged.

## 9. Testing

Matches the existing Vitest (unit) + Playwright (E2E) setup.

**Unit (Vitest):**
- `geometry`: arrowhead points, bounding boxes, resize-handle positions.
- `hit-test`: point→annotation (topmost), point→handle.
- `scene`: add/update/remove/reorder immutability.
- `history`: undo/redo, bounded stack, redo cleared on new edit.
- `transform`: display↔image round-trips at various DPRs/scales.
- `crop`: annotation reprojection and output-dimension math.
- `pixelate`: block-average correctness on known ImageData arrays.
- `step`: auto-increment and renumber behavior.

**E2E (Playwright, extends `tests/e2e/run.mjs`):**
- Capture the fixture page → enter Edit → add an arrow → export PNG → assert exported pixels
  changed in the arrow's region and output dimensions match the source.
- Add a blur region → export → assert that region's pixels are mosaicked (changed vs source).

## 10. Build / integration notes

- New editor entry code bundles into the existing `results` esbuild entry (no new manifest
  entry, no new permissions — `activeTab`/`scripting`/`storage`/`downloads` unchanged). Privacy
  posture is preserved: everything stays local.
- Toolbar is hidden until the user clicks **Edit**; non-edit results-page behavior is unchanged.
- `LicenseService` seam is untouched — the v1 editor is free; the seam remains for future
  advanced tools.

## 11. Risks / open questions

- **jsdom canvas limits:** rendering itself isn't well covered by jsdom unit tests, so `render`
  and `flatten` are intentionally thin and validated via Playwright E2E instead.
- **Text measurement:** font metrics differ slightly between edit-preview (DOM input) and canvas
  render; acceptable for v1, revisit if labels drift noticeably.
- **Large single-tile captures:** flatten allocates a full-res canvas; already bounded by the
  capture pipeline's tiling limits, so single-tile inputs are within canvas limits by construction.
