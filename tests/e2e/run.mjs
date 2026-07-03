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
