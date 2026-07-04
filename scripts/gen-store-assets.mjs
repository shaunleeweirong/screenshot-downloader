// Generate all Chrome Web Store visual assets with the already-installed
// Playwright Chromium (no extra deps):
//   - polished extension icons        -> src/assets/icon-{16,48,128}.png
//   - 1280x800 store screenshots       -> store-assets/screenshot-*.png
//   - promo tiles (440x280, 1400x560)  -> store-assets/promo-*.png
//
// Screenshots drive the REAL extension UI, so run against an E2E build first:
//   FULLSHOT_E2E=1 node scripts/build.mjs && node scripts/gen-store-assets.mjs
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXT = join(root, 'dist');
const ASSETS = join(root, 'src', 'assets');
const STORE = join(root, 'store-assets');
const FIXTURE = readFileSync(join(root, 'tests', 'e2e', 'fixtures', 'long-page.html'), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(ASSETS, { recursive: true });
rmSync(STORE, { recursive: true, force: true });
mkdirSync(STORE, { recursive: true });

function extIdFromPath(p) {
  const h = createHash('sha256').update(p).digest();
  let id = '';
  for (let i = 0; i < 16; i++) id += String.fromCharCode(97 + (h[i] >> 4)) + String.fromCharCode(97 + (h[i] & 15));
  return id;
}

// ---------- icon ----------
function iconHtml(size, pad) {
  const r = ((100 - 2 * pad) * 0.22).toFixed(1);
  return `<!doctype html><meta charset="utf-8"><style>html,body{margin:0}</style>
  <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
    <rect x="${pad}" y="${pad}" width="${100 - 2 * pad}" height="${100 - 2 * pad}" rx="${r}" fill="#2563eb"/>
    <rect x="30" y="27" width="40" height="46" rx="4" fill="#ffffff"/>
    <rect x="37" y="36" width="26" height="4" rx="2" fill="#93c5fd"/>
    <rect x="37" y="45" width="26" height="4" rx="2" fill="#93c5fd"/>
    <rect x="37" y="54" width="17" height="4" rx="2" fill="#93c5fd"/>
    <g stroke="#ffffff" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="M26 33 V26 H33"/><path d="M74 33 V26 H67"/>
      <path d="M26 67 V74 H33"/><path d="M74 67 V74 H67"/>
    </g>
  </svg>`;
}

// ---------- promo tiles ----------
function promoHtml(width, height, big) {
  const logo = iconHtml(big ? 200 : 96, 6).replace(/^[\s\S]*?<svg/, '<svg');
  const bullets = big
    ? `<ul style="margin:22px 0 0;padding:0;list-style:none;font-size:24px;line-height:1.9;color:#e5edff">
         <li>✓ Full page, visible area &amp; region</li>
         <li>✓ Export PNG · JPG · PDF</li>
         <li>✓ 100% local — nothing leaves your browser</li>
       </ul>`
    : '';
  return `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0}
    .wrap{width:${width}px;height:${height}px;display:flex;align-items:center;gap:${big ? 56 : 22}px;
      padding:0 ${big ? 90 : 34}px;box-sizing:border-box;
      background:linear-gradient(135deg,#1e3a8a 0%,#2563eb 55%,#3b82f6 100%);
      font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#fff}
    .logo{filter:drop-shadow(0 8px 20px rgba(0,0,0,.35));flex:none}
    h1{margin:0;font-size:${big ? 72 : 40}px;font-weight:800;letter-spacing:-1px}
    p{margin:${big ? 10 : 6}px 0 0;font-size:${big ? 30 : 18}px;color:#dbeafe}
  </style>
  <div class="wrap">
    <div class="logo">${logo}</div>
    <div><h1>FullShot</h1><p>Full-page &amp; region screenshots</p>${bullets}</div>
  </div>`;
}

// ---------- 1280x800 marketing frame around a real UI screenshot ----------
function frameHtml(caption, sub, dataUrl, opts = {}) {
  const maxW = opts.maxW ?? 980;
  return `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0}
    .bg{width:1280px;height:800px;box-sizing:border-box;padding:64px 64px 0;
      background:linear-gradient(135deg,#eef2ff 0%,#e0e7ff 45%,#dbeafe 100%);
      font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
      display:flex;flex-direction:column;align-items:center}
    h1{margin:0;font-size:40px;font-weight:800;color:#1e3a8a;text-align:center}
    p{margin:10px 0 26px;font-size:20px;color:#3730a3;text-align:center}
    .card{background:#fff;border-radius:14px 14px 0 0;box-shadow:0 24px 60px rgba(30,58,138,.28);
      overflow:hidden;max-width:${maxW}px;width:auto}
    .bar{height:36px;background:#f1f5f9;display:flex;align-items:center;gap:8px;padding:0 14px;border-bottom:1px solid #e2e8f0}
    .dot{width:11px;height:11px;border-radius:50%}
    img{display:block;max-width:${maxW}px;height:auto}
  </style>
  <div class="bg">
    <h1>${caption}</h1><p>${sub}</p>
    <div class="card">
      <div class="bar"><span class="dot" style="background:#f87171"></span>
        <span class="dot" style="background:#fbbf24"></span>
        <span class="dot" style="background:#34d399"></span></div>
      <img class="shot" src="${dataUrl}"/>
    </div>
  </div>`;
}

async function renderExact(browser, html, width, height, outPath) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(async () => {
    const img = document.querySelector('img.shot');
    if (img && !img.complete) await new Promise((r) => (img.onload = r));
  });
  const buf = await page.screenshot({ clip: { x: 0, y: 0, width, height } });
  writeFileSync(outPath, buf);
  await page.close();
}

let server, ctx, browser;
try {
  // ===== Phase A: icons + promo tiles (plain browser, transparent icons) =====
  browser = await chromium.launch();
  for (const [size, pad] of [
    [16, 6],
    [48, 6],
    [128, 12.5],
  ]) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(iconHtml(size, pad), { waitUntil: 'load' });
    const buf = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    writeFileSync(join(ASSETS, `icon-${size}.png`), buf);
    await page.close();
  }
  console.log('icons -> src/assets/');

  await renderExact(browser, promoHtml(440, 280, false), 440, 280, join(STORE, 'promo-small-440x280.png'));
  await renderExact(browser, promoHtml(1400, 560, true), 1400, 560, join(STORE, 'promo-marquee-1400x560.png'));
  console.log('promo tiles -> store-assets/');
  await browser.close();
  browser = null;

  // ===== Phase B: real UI screenshots via the loaded extension =====
  server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(FIXTURE);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const fixtureUrl = `http://127.0.0.1:${server.address().port}/`;

  const userDataDir = join(tmpdir(), `fs-assets-${Date.now()}`);
  ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-first-run', '--window-size=1400,1000'],
  });
  const id = extIdFromPath(EXT);
  const fixture = await ctx.newPage();
  await fixture.goto(fixtureUrl, { waitUntil: 'load' });
  let sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent('serviceworker', { timeout: 15000 }));

  const dataUrl = (buf) => 'data:image/png;base64,' + buf.toString('base64');
  const shots = [];

  // popup
  {
    const p = await ctx.newPage();
    await p.setViewportSize({ width: 340, height: 380 });
    await p.goto(`chrome-extension://${id}/popup.html`, { waitUntil: 'load' });
    shots.push(['screenshot-1-popup.png', 'One click, three ways to capture', 'Full page, visible area, or a region you drag', await p.screenshot(), { maxW: 360 }]);
    await p.close();
  }
  // full-page result
  {
    await fixture.bringToFront();
    await fixture.evaluate(() => window.scrollTo(0, 0));
    const res = await sw.evaluate(() => globalThis.__fsCaptureActive('fullpage'));
    const rp = await ctx.newPage();
    await rp.setViewportSize({ width: 1120, height: 720 });
    await rp.goto(`chrome-extension://${id}/results.html?id=${res.recordId}`, { waitUntil: 'load' });
    await rp.waitForSelector('.stage img');
    await sleep(300);
    shots.push(['screenshot-2-result.png', 'Download as PNG, JPG or PDF', 'Or copy to clipboard — everything stays on your device', await rp.screenshot(), { maxW: 1000 }]);
    await rp.close();
  }
  // options
  {
    const o = await ctx.newPage();
    await o.setViewportSize({ width: 760, height: 620 });
    await o.goto(`chrome-extension://${id}/options.html`, { waitUntil: 'load' });
    shots.push(['screenshot-3-settings.png', 'Simple, private settings', 'Choose format, filename and quality — no account needed', await o.screenshot(), { maxW: 720 }]);
    await o.close();
  }
  // region overlay (mid-drag)
  try {
    await fixture.bringToFront();
    await fixture.evaluate(() => window.scrollTo(0, 0));
    const p = sw.evaluate(() => globalThis.__fsCaptureActive('region'));
    await fixture.getByText('Drag to select').waitFor({ timeout: 8000 });
    await fixture.mouse.move(240, 170);
    await fixture.mouse.down();
    await fixture.mouse.move(620, 470, { steps: 10 });
    await sleep(200);
    shots.push(['screenshot-4-region.png', 'Grab just the part you need', 'Drag to select any area of the page', await fixture.screenshot(), { maxW: 1000 }]);
    await fixture.keyboard.press('Escape');
    await p.catch(() => {});
  } catch (e) {
    console.log('region screenshot skipped: ' + e.message);
  }

  // compose frames
  for (const [name, caption, sub, buf, opts] of shots) {
    const fp = await ctx.newPage();
    await fp.setViewportSize({ width: 1280, height: 800 });
    await fp.setContent(frameHtml(caption, sub, dataUrl(buf), opts), { waitUntil: 'load' });
    await fp.evaluate(async () => {
      const img = document.querySelector('img.shot');
      if (img && !img.complete) await new Promise((r) => (img.onload = r));
    });
    await sleep(120);
    const out = await fp.screenshot({ clip: { x: 0, y: 0, width: 1280, height: 800 } });
    writeFileSync(join(STORE, name), out);
    await fp.close();
    console.log(`${name} -> store-assets/`);
  }
} finally {
  if (ctx) await ctx.close();
  if (browser) await browser.close();
  if (server) server.close();
}
console.log('Done. Assets in src/assets/ (icons) and store-assets/ (screenshots + promo).');
