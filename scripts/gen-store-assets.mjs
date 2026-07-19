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
mkdirSync(STORE, { recursive: true }); // overwrite generated files in place; keep any hand-made extras

// A realistic billing dashboard used only for the annotation-editor screenshot,
// so blur/arrow/steps land on believable content (sensitive card + email to redact).
const EDITOR_MOCK = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;box-sizing:border-box;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
  body{background:#f6f7f9;color:#0f172a}
  .top{height:56px;background:#fff;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;gap:26px;padding:0 30px}
  .brand{font-weight:800;font-size:17px;display:flex;align-items:center;gap:9px}
  .brand .b{width:20px;height:20px;border-radius:6px;background:#2563eb}
  .nav{display:flex;gap:22px;color:#64748b;font-size:14px}
  .nav b{color:#0f172a}
  .wrap{max-width:1000px;margin:26px auto;padding:0 24px}
  h1{font-size:22px;margin-bottom:4px}
  .sub{color:#64748b;font-size:14px;margin-bottom:20px}
  .cards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:22px}
  .card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:18px}
  .k{color:#64748b;font-size:13px}
  .v{font-size:28px;font-weight:800;margin-top:6px}
  .up{color:#16a34a;font-size:13px;font-weight:600;margin-top:6px}
  .panel{background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden}
  .panel h2{font-size:15px;padding:16px 18px;border-bottom:1px solid #eef2f7}
  .row{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #f1f5f9;font-size:14px}
  .row:last-child{border-bottom:0}
  .who{display:flex;align-items:center;gap:12px}
  .av{width:30px;height:30px;border-radius:50%;background:#dbeafe;flex:none}
  .muted{color:#64748b;font-size:13px;margin-top:2px}
  .amt{font-weight:700}
</style></head><body>
  <div class="top">
    <div class="brand"><span class="b"></span> Acme Analytics</div>
    <div class="nav"><b>Billing</b><span>Projects</span><span>Team</span><span>Settings</span></div>
  </div>
  <div class="wrap">
    <h1>Billing &amp; usage</h1>
    <div class="sub">Last 30 days · workspace acme-prod</div>
    <div class="cards">
      <div class="card"><div class="k">Current spend</div><div class="v">$1,284.50</div><div class="up">&#9650; 12% vs last month</div></div>
      <div class="card"><div class="k">API calls</div><div class="v">2.4M</div><div class="up">&#9650; 8%</div></div>
      <div class="card"><div class="k">Seats used</div><div class="v">32 / 40</div><div class="muted">8 available</div></div>
    </div>
    <div class="panel">
      <h2>Recent invoices</h2>
      <div class="row"><div class="who"><span class="av"></span><div><div>Invoice #INV-20482</div><div class="muted">card &bull;&bull;&bull;&bull; 4242 · alex@acme.co</div></div></div><div class="amt">$1,284.50</div></div>
      <div class="row"><div class="who"><span class="av"></span><div><div>Invoice #INV-20391</div><div class="muted">card &bull;&bull;&bull;&bull; 4242 · alex@acme.co</div></div></div><div class="amt">$1,146.00</div></div>
      <div class="row"><div class="who"><span class="av"></span><div><div>Invoice #INV-20305</div><div class="muted">card &bull;&bull;&bull;&bull; 4242 · alex@acme.co</div></div></div><div class="amt">$1,092.75</div></div>
    </div>
  </div>
</body></html>`;

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
  server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(req.url && req.url.startsWith('/editor') ? EDITOR_MOCK : FIXTURE);
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

  // editor — annotate a realistic billing page (arrow + redaction blur + numbered steps)
  try {
    const em = await ctx.newPage();
    await em.setViewportSize({ width: 1280, height: 800 });
    await em.goto(fixtureUrl + 'editor', { waitUntil: 'load' });
    await em.bringToFront();
    await sleep(250);
    const res = await sw.evaluate(() => globalThis.__fsCaptureActive('visible'));
    const rp = await ctx.newPage();
    await rp.setViewportSize({ width: 1180, height: 780 });
    await rp.goto(`chrome-extension://${id}/results.html?id=${res.recordId}`, { waitUntil: 'load' });
    await rp.waitForSelector('.stage img');
    await rp.click('#edit-toggle');
    await rp.waitForSelector('.editor-canvas');
    await rp.evaluate(() => {
      const ed = window.__fsEditor;
      const cv = document.querySelector('.editor-canvas');
      const W = cv.width, H = cv.height;
      const wI = document.getElementById('tool-width'); wI.value = '11'; wI.dispatchEvent(new Event('input', { bubbles: true })); // bolder pen
      ed.addBlur({ x: Math.round(W * 0.08), y: Math.round(H * 0.415), w: Math.round(W * 0.38), h: Math.round(H * 0.225) }); // redact card + email on all invoice rows
      ed.addArrow({ x1: Math.round(W * 0.38), y1: Math.round(H * 0.13), x2: Math.round(W * 0.235), y2: Math.round(H * 0.255) }); // point at Current spend
    });
    await sleep(350);
    shots.push(['screenshot-5-editor.png', 'Annotate &amp; redact before you export', 'Arrows, highlights, blur, text, numbered steps &amp; crop — then save', await rp.screenshot(), { maxW: 1000 }]);
    await rp.close();
    await em.close();
  } catch (e) {
    console.log('editor screenshot skipped: ' + e.message);
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
