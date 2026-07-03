import { buildArrangement } from '../lib/capture/page-metrics';
import { toDevicePixels } from '../lib/capture/region';
import { stitch, type CapturedTile } from '../lib/capture/stitcher';
import { addCapture } from '../lib/storage/history';
import { loadSettings } from '../lib/storage/settings';
import type { CaptureMode, CaptureRecord } from '../lib/types';
import type {
  MeasureResult,
  GotoResult,
  SelectRegionResult,
  ContentRequest,
  StartCaptureResult,
} from '../lib/messaging/contracts';

const CAPTURE_MIN_GAP_MS = 400; // stay under Chrome's ~2 captureVisibleTab/sec quota
let lastCaptureAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Schemes/pages Chrome will not let any extension capture. */
function capturableReason(url: string | undefined): string | null {
  if (!url) return "This page can't be captured.";
  const blocked: RegExp[] = [
    /^chrome:\/\//i,
    /^edge:\/\//i,
    /^brave:\/\//i,
    /^about:/i,
    /^chrome-extension:\/\//i,
    /^moz-extension:\/\//i,
    /^view-source:/i,
    /^devtools:\/\//i,
    /^https?:\/\/chrome\.google\.com\/webstore/i,
    /^https?:\/\/chromewebstore\.google\.com/i,
  ];
  if (blocked.some((re) => re.test(url))) {
    return "This is a protected browser page, so it can't be captured. Try it on a normal website.";
  }
  return null;
}

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function progress(done: number, total: number, phase: 'measure' | 'capture' | 'stitch' | 'save'): void {
  chrome.runtime.sendMessage({ type: 'FS_PROGRESS', done, total, phase }).catch(() => {
    /* popup may be closed */
  });
}

async function injectContent(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
}

function sendToContent<T>(tabId: number, msg: ContentRequest): Promise<T> {
  return chrome.tabs.sendMessage(tabId, msg) as Promise<T>;
}

/** captureVisibleTab with quota-friendly pacing and backoff. */
async function captureVisible(windowId: number | undefined): Promise<string> {
  const since = Date.now() - lastCaptureAt;
  if (since < CAPTURE_MIN_GAP_MS) await sleep(CAPTURE_MIN_GAP_MS - since);
  let lastErr: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const dataUrl =
        windowId === undefined
          ? await chrome.tabs.captureVisibleTab({ format: 'png' })
          : await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
      lastCaptureAt = Date.now();
      return dataUrl;
    } catch (e) {
      lastErr = e;
      await sleep(500 * (attempt + 1));
    }
  }
  throw new Error(`Screen capture failed: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
}

async function toBitmap(dataUrl: string): Promise<ImageBitmap> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return createImageBitmap(blob);
}

interface CaptureOutput {
  blobs: Blob[];
  width: number;
  height: number;
  mode: CaptureMode;
  cancelled?: boolean;
}

async function runFullPage(tab: chrome.tabs.Tab, settleDelayMs: number): Promise<CaptureOutput> {
  const tabId = tab.id!;
  await injectContent(tabId);
  const m = await sendToContent<MeasureResult>(tabId, { type: 'FS_MEASURE' });
  const dpr = m.devicePixelRatio || 1;
  const arrangement = buildArrangement(m.pageWidth, m.pageHeight, m.viewportWidth, m.viewportHeight);
  const total = arrangement.length;
  const captured: CapturedTile[] = [];

  try {
    for (let i = 0; i < arrangement.length; i++) {
      const { x, y } = arrangement[i];
      const at = await sendToContent<GotoResult>(tabId, {
        type: 'FS_GOTO',
        x,
        y,
        hidePinned: y > 0, // show pinned/sticky on the first row, hide below to avoid repeats
        settleDelayMs,
      });
      const dataUrl = await captureVisible(tab.windowId);
      const bitmap = await toBitmap(dataUrl);
      captured.push({ bitmap, dx: Math.round(at.actualX * dpr), dy: Math.round(at.actualY * dpr) });
      progress(i + 1, total, 'capture');
    }
  } finally {
    await sendToContent(tabId, { type: 'FS_RESTORE' }).catch(() => {});
  }

  progress(total, total, 'stitch');
  const width = Math.round(m.pageWidth * dpr);
  const height = Math.round(m.pageHeight * dpr);
  const blobs = await stitch(width, height, captured);
  captured.forEach((t) => t.bitmap.close());
  return { blobs, width, height, mode: 'fullpage' };
}

async function runVisible(tab: chrome.tabs.Tab): Promise<CaptureOutput> {
  const dataUrl = await captureVisible(tab.windowId);
  const bitmap = await toBitmap(dataUrl);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const out = { blobs: [blob], width: bitmap.width, height: bitmap.height, mode: 'visible' as const };
  bitmap.close();
  return out;
}

async function runRegion(tab: chrome.tabs.Tab): Promise<CaptureOutput> {
  const tabId = tab.id!;
  await injectContent(tabId);
  const sel = await sendToContent<SelectRegionResult>(tabId, { type: 'FS_SELECT_REGION' });
  if (sel.cancelled || !sel.rect) {
    return { blobs: [], width: 0, height: 0, mode: 'region', cancelled: true };
  }
  const dpr = sel.devicePixelRatio || 1;
  const dataUrl = await captureVisible(tab.windowId);
  const bitmap = await toBitmap(dataUrl);
  const dev = toDevicePixels(sel.rect, dpr);
  const canvas = new OffscreenCanvas(Math.max(1, dev.width), Math.max(1, dev.height));
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, dev.x, dev.y, dev.width, dev.height, 0, 0, dev.width, dev.height);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  bitmap.close();
  return { blobs: [blob], width: dev.width, height: dev.height, mode: 'region' };
}

async function finish(out: CaptureOutput, tab: chrome.tabs.Tab, autoDownload: boolean): Promise<string> {
  const id = crypto.randomUUID();
  const record: CaptureRecord = {
    id,
    url: tab.url ?? '',
    title: tab.title ?? '',
    createdAt: Date.now(),
    width: out.width,
    height: out.height,
    mode: out.mode,
    tiles: out.blobs.length,
  };
  progress(1, 1, 'save');
  await addCapture(record, out.blobs);
  const auto = autoDownload ? '&auto=1' : '';
  await chrome.tabs.create({ url: chrome.runtime.getURL(`results.html?id=${id}${auto}`) });
  return id;
}

async function capture(mode: CaptureMode): Promise<StartCaptureResult> {
  const tab = await getActiveTab();
  if (!tab?.id) return { ok: false, error: 'No active tab to capture.' };
  const reason = capturableReason(tab.url);
  if (reason) return { ok: false, error: reason };

  const settings = await loadSettings();
  progress(0, 1, 'measure');

  let out: CaptureOutput;
  if (mode === 'fullpage') out = await runFullPage(tab, settings.settleDelayMs);
  else if (mode === 'visible') out = await runVisible(tab);
  else out = await runRegion(tab);

  if (out.cancelled) return { ok: true, cancelled: true };

  const recordId = await finish(out, tab, settings.autoDownload);
  return { ok: true, recordId, tiles: out.blobs.length };
}

// Popup / options -> start a capture.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'FS_START') {
    capture(msg.mode as CaptureMode)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
    return true; // async response
  }
  return undefined;
});

// Keyboard shortcut -> full-page capture.
chrome.commands.onCommand.addListener((command) => {
  if (command === 'capture-full-page') {
    capture('fullpage').catch((e) => console.error('[FullShot] capture failed:', e));
  }
});

// Test-only hook, removed from production builds via the __FS_E2E__ define.
declare const __FS_E2E__: boolean;
if (__FS_E2E__) {
  (globalThis as unknown as { __fsCaptureActive?: (m: CaptureMode) => Promise<StartCaptureResult> }).__fsCaptureActive =
    (mode: CaptureMode) => capture(mode);
}
