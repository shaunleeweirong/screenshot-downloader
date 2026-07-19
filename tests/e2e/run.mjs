// End-to-end feature verification in a real (bundled Chromium) browser.
// Loads the E2E build of the extension, serves a fixture page, and exercises
// every capture feature through the real service worker + content script.
//
// Prereq: build with `FULLSHOT_E2E=1 node scripts/build.mjs` first.
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXT = join(__dirname, '..', '..', 'dist');
const FIXTURE = readFileSync(join(__dirname, 'fixtures', 'long-page.html'), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function extIdFromPath(p) {
  const h = createHash('sha256').update(p).digest();
  let id = '';
  for (let i = 0; i < 16; i++) {
    id += String.fromCharCode(97 + (h[i] >> 4));
    id += String.fromCharCode(97 + (h[i] & 15));
  }
  return id;
}

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? '  — ' + detail : ''}`);
}

// Analyze the rendered capture on a results page: dimensions, blank-ness,
// color variety, and where red (the sticky header) appears vertically.
async function analyze(page) {
  return page.evaluate(async () => {
    const img = document.querySelector('.stage img');
    if (!img) return { error: 'no image rendered' };
    if (!img.complete) await new Promise((r) => (img.onload = r));
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, w, h).data;
    const cx = Math.floor(w / 2);
    let white = 0;
    const colors = new Set();
    const redYs = [];
    for (let y = 0; y < h; y++) {
      const i = (y * w + cx) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (r > 245 && g > 245 && b > 245) white++;
      if (r > 180 && g < 90 && b < 90) redYs.push(y);
      colors.add(`${r >> 5},${g >> 5},${b >> 5}`);
    }
    return {
      w,
      h,
      whiteRatio: white / h,
      distinctColors: colors.size,
      redCount: redYs.length,
      redMax: redYs.length ? redYs[redYs.length - 1] : -1,
      dpr: window.devicePixelRatio || 1,
    };
  });
}

let server, ctx;
try {
  // --- fixture server ---
  server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(FIXTURE);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const fixtureUrl = `http://127.0.0.1:${port}/`;

  // --- launch extension ---
  const userDataDir = mkdtempSync(join(tmpdir(), 'fs-e2e-'));
  ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: null,
    args: [
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1280,900',
    ],
  });
  const id = extIdFromPath(EXT);

  // Wake the service worker by opening a page, then grab it.
  const fixture = await ctx.newPage();
  await fixture.goto(fixtureUrl, { waitUntil: 'load' });
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  check('extension loads + service worker registers', !!sw);

  const analysisPage = await ctx.newPage();
  const openResult = async (recordId) => {
    await analysisPage.goto(`chrome-extension://${id}/results.html?id=${recordId}`, { waitUntil: 'load' });
    await analysisPage.waitForSelector('.stage img', { timeout: 8000 });
    return analyze(analysisPage);
  };

  // ---------- 1. Popup renders ----------
  {
    const p = await ctx.newPage();
    await p.goto(`chrome-extension://${id}/popup.html`, { waitUntil: 'load' });
    const modes = await p.locator('.mode').count();
    check('popup renders 3 capture modes', modes === 3, `found ${modes}`);
    await p.close();
  }

  // ---------- 2. Options persist ----------
  {
    const p = await ctx.newPage();
    await p.goto(`chrome-extension://${id}/options.html`, { waitUntil: 'load' });
    await p.locator('#autoDownload').check();
    await p.locator('#settleDelayMs').fill('222');
    await p.locator('#settleDelayMs').dispatchEvent('change');
    await sleep(300);
    await p.reload({ waitUntil: 'load' });
    const auto = await p.locator('#autoDownload').isChecked();
    const delay = await p.locator('#settleDelayMs').inputValue();
    check('options save + persist across reload', auto === true && delay === '222', `auto=${auto} delay=${delay}`);
    // reset autoDownload so later captures open the results tab normally
    await p.locator('#autoDownload').uncheck();
    await sleep(200);
    await p.close();
  }

  // ---------- 3. Full-page capture (the flagship) ----------
  {
    await fixture.bringToFront();
    await fixture.evaluate(() => window.scrollTo(0, 0));
    const res = await sw.evaluate(() => globalThis.__fsCaptureActive('fullpage'));
    const ok = res && res.ok && res.recordId;
    check('full-page capture completes', !!ok, JSON.stringify(res));
    if (ok) {
      const a = await openResult(res.recordId);
      const tallEnough = a.h > 2000; // fixture is header(80)+3*900 ≈ 2780 css px, x dpr
      check('full-page image spans the whole page (tall)', tallEnough, `${a.w}x${a.h} dpr=${a.dpr}`);
      check('full-page image is not blank', a.whiteRatio < 0.9 && a.distinctColors >= 3, `white=${a.whiteRatio.toFixed(2)} colors=${a.distinctColors}`);
      // Sticky header (red) must appear only near the top — the reliability wedge.
      const stickyOk = a.redCount > 0 && a.redMax < a.h * 0.25;
      check('sticky header NOT duplicated down the page', stickyOk, `redMax=${a.redMax} of ${a.h}`);
    }
  }

  // ---------- 4. Visible-area capture ----------
  {
    await fixture.bringToFront();
    await fixture.evaluate(() => window.scrollTo(0, 0));
    const res = await sw.evaluate(() => globalThis.__fsCaptureActive('visible'));
    const ok = res && res.ok && res.recordId;
    check('visible-area capture completes', !!ok, JSON.stringify(res));
    if (ok) {
      const a = await openResult(res.recordId);
      check('visible image is ~one viewport + non-blank', a.h > 300 && a.h < 2600 && a.whiteRatio < 0.95, `${a.w}x${a.h}`);
    }
  }

  // ---------- 5. Region capture (drag select) ----------
  {
    await fixture.bringToFront();
    await fixture.evaluate(() => window.scrollTo(0, 0));
    const p = sw.evaluate(() => globalThis.__fsCaptureActive('region'));
    // Wait for the overlay, then drag a 300x300 CSS-px box.
    await fixture.getByText('Drag to select').waitFor({ timeout: 8000 });
    await fixture.mouse.move(150, 200);
    await fixture.mouse.down();
    await fixture.mouse.move(300, 350, { steps: 5 });
    await fixture.mouse.move(450, 500, { steps: 5 });
    await fixture.mouse.up();
    const res = await p;
    const ok = res && res.ok && res.recordId;
    check('region capture completes', !!ok, JSON.stringify(res));
    if (ok) {
      const a = await openResult(res.recordId);
      // selection was 300x300 css px -> ~300*dpr each side (allow tolerance)
      const expected = 300 * a.dpr;
      const wOk = Math.abs(a.w - expected) < expected * 0.25;
      const hOk = Math.abs(a.h - expected) < expected * 0.25;
      check('region image matches the selected area', wOk && hOk, `${a.w}x${a.h} expected≈${Math.round(expected)}`);
    }
  }
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

  // Open a fresh capture in the editor and return the canvas box + an image->client
  // coordinate mapper, for tests that drive the editor with REAL pointer events.
  const openEditor = async () => {
    await fixture.bringToFront();
    await fixture.evaluate(() => window.scrollTo(0, 0));
    const res = await sw.evaluate(() => globalThis.__fsCaptureActive('visible'));
    if (!res || !res.ok || !res.recordId) return null;
    await analysisPage.goto(`chrome-extension://${id}/results.html?id=${res.recordId}`, { waitUntil: 'load' });
    await analysisPage.waitForSelector('.stage img', { timeout: 8000 });
    await analysisPage.bringToFront();
    await analysisPage.click('#edit-toggle');
    await analysisPage.waitForSelector('.editor-canvas', { timeout: 8000 });
    const box = await analysisPage.locator('.editor-canvas').boundingBox();
    const scale = await analysisPage.evaluate(() => {
      const cv = document.querySelector('.editor-canvas');
      return cv.width / cv.getBoundingClientRect().width;
    });
    const toClient = (ix, iy) => ({ x: box.x + ix / scale, y: box.y + iy / scale });
    return { box, scale, toClient };
  };
  const dragClient = async (a, b) => {
    await analysisPage.mouse.move(a.x, a.y);
    await analysisPage.mouse.down();
    await analysisPage.mouse.move(b.x, b.y, { steps: 6 });
    await analysisPage.mouse.up();
  };

  // ---------- 8. Editor: Text tool creates a text annotation (real click + typing) ----------
  {
    const ed = await openEditor();
    if (ed) {
      await analysisPage.click('#editor-toolbar [data-tool="text"]');
      await analysisPage.mouse.click(ed.box.x + 80, ed.box.y + 80); // spawns the floating input
      // The input focuses on the next frame; wait for that, then type.
      await analysisPage.waitForFunction(
        () => document.activeElement && document.activeElement.classList.contains('editor-text-input'),
        null,
        { timeout: 4000 },
      );
      await analysisPage.keyboard.type('HELLO');
      await analysisPage.keyboard.press('Enter');
      const hasText = await analysisPage.evaluate(() =>
        window.__fsEditor.getScene().annotations.some((a) => a.type === 'text' && a.text === 'HELLO'));
      check('editor: text tool creates a text annotation', hasText);
    } else {
      check('editor: capture for text', false);
    }
  }

  // ---------- 9. Editor: select -> resize -> restyle -> delete ----------
  {
    const ed = await openEditor();
    if (ed) {
      // Draw a rectangle; it should auto-select and switch to the select tool.
      await analysisPage.click('#editor-toolbar [data-tool="rect"]');
      await dragClient(ed.toClient(100, 100), ed.toClient(300, 260));
      const afterDraw = await analysisPage.evaluate(() => ({
        tool: window.__fsEditor.getTool(),
        selected: window.__fsEditor.getSelected(),
        rect: window.__fsEditor.getScene().annotations.find((x) => x.type === 'rect'),
      }));
      check('editor: drawing a shape auto-selects it (tool -> select)',
        afterDraw.tool === 'select' && !!afterDraw.selected && !!afterDraw.rect,
        `tool=${afterDraw.tool} sel=${afterDraw.selected}`);

      // Resize via the SE corner handle.
      const r0 = afterDraw.rect;
      await dragClient(ed.toClient(r0.x + r0.w, r0.y + r0.h), ed.toClient(r0.x + r0.w + 80, r0.y + r0.h + 60));
      const r1 = await analysisPage.evaluate(() => window.__fsEditor.getScene().annotations.find((x) => x.type === 'rect'));
      check('editor: dragging a corner handle resizes the selection',
        r1 && r1.w > r0.w + 40 && r1.h > r0.h + 30, `${r0.w}x${r0.h} -> ${r1 && r1.w}x${r1 && r1.h}`);

      // Change thickness via the width slider; color must be preserved.
      const strokeBefore = r1.style.stroke;
      await analysisPage.evaluate(() => {
        const w = document.getElementById('tool-width');
        w.value = '16';
        w.dispatchEvent(new Event('input', { bubbles: true }));
      });
      const r2 = await analysisPage.evaluate(() => window.__fsEditor.getScene().annotations.find((x) => x.type === 'rect'));
      check('editor: width slider changes thickness of the selection (color preserved)',
        !!r2 && r2.style.strokeWidth === 16 && r2.style.stroke === strokeBefore,
        `w=${r2 && r2.style.strokeWidth} stroke=${r2 && r2.style.stroke}`);

      // Delete via the trash button.
      await analysisPage.click('#tool-delete');
      const gone = await analysisPage.evaluate(() => !window.__fsEditor.getScene().annotations.some((x) => x.type === 'rect'));
      check('editor: delete removes the selected element', gone);
    } else {
      check('editor: capture for select/resize', false);
    }
  }

  // ---------- 10. Editor: crop box is resizable by its handle ----------
  {
    const ed = await openEditor();
    if (ed) {
      await analysisPage.click('#editor-toolbar [data-tool="crop"]');
      await dragClient(ed.toClient(60, 60), ed.toClient(300, 300));
      const c1 = await analysisPage.evaluate(() => window.__fsEditor.getCropRect());
      check('editor: crop drag creates a crop region', !!c1 && c1.w > 0 && c1.h > 0, JSON.stringify(c1));
      if (c1) {
        await dragClient(ed.toClient(c1.x + c1.w, c1.y + c1.h), ed.toClient(c1.x + c1.w - 100, c1.y + c1.h - 80));
        const c2 = await analysisPage.evaluate(() => window.__fsEditor.getCropRect());
        check('editor: dragging a crop handle resizes the crop box',
          !!c2 && Math.abs(c2.w - c1.w) > 40, `${c1.w} -> ${c2 && c2.w}`);
      }
    } else {
      check('editor: capture for crop-resize', false);
    }
  }
} catch (e) {
  console.log('FATAL ' + (e && e.stack ? e.stack : String(e)));
  results.push({ name: 'fatal error', ok: false });
} finally {
  if (ctx) await ctx.close();
  if (server) server.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
