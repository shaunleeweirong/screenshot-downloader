// Content script — injected on demand via chrome.scripting.executeScript (activeTab).
// Responds to the service worker's capture protocol. Self-contained IIFE bundle.
import { measurePage } from '../lib/capture/page-metrics';
import { findPinnedElements, hidePinned, restorePinned } from '../lib/capture/sticky';
import { normalizeRect, clampRect } from '../lib/capture/region';
import type {
  ContentRequest,
  MeasureResult,
  GotoResult,
  SelectRegionResult,
} from '../lib/messaging/contracts';

// Guard against duplicate listeners when the script is injected more than once.
declare global {
  interface Window {
    __fullshotContentLoaded?: boolean;
  }
}

if (!window.__fullshotContentLoaded) {
  window.__fullshotContentLoaded = true;

  const STYLE_ID = 'fullshot-capture-style';
  let originalScrollX = 0;
  let originalScrollY = 0;
  let pinned: HTMLElement[] = [];

  function beginCaptureMode(): void {
    originalScrollX = window.scrollX;
    originalScrollY = window.scrollY;
    // Hide scrollbars WITHOUT disabling scrolling, and force instant jumps.
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
        html { scroll-behavior: auto !important; }
        html::-webkit-scrollbar, body::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none !important; }
        html { scrollbar-width: none !important; }
      `;
      document.documentElement.appendChild(style);
    }
    pinned = findPinnedElements(document, window);
  }

  function endCaptureMode(): void {
    document.getElementById(STYLE_ID)?.remove();
    restorePinned(pinned);
    pinned = [];
    window.scrollTo(originalScrollX, originalScrollY);
  }

  function wait(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  function nextFrame(): Promise<void> {
    return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  }

  async function selectRegion(): Promise<SelectRegionResult> {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.cssText = `position:fixed;inset:0;z-index:2147483647;cursor:crosshair;background:rgba(0,0,0,0.28);`;
      const sel = document.createElement('div');
      sel.style.cssText = `position:fixed;border:2px solid #2563eb;background:rgba(37,99,235,0.12);box-shadow:0 0 0 100000px rgba(0,0,0,0.28);pointer-events:none;display:none;`;
      const hint = document.createElement('div');
      hint.textContent = 'Drag to select an area · Esc to cancel';
      hint.style.cssText = `position:fixed;top:12px;left:50%;transform:translateX(-50%);background:#111827;color:#fff;font:13px/1.4 system-ui,sans-serif;padding:6px 12px;border-radius:6px;pointer-events:none;`;
      overlay.appendChild(sel);
      overlay.appendChild(hint);
      document.documentElement.appendChild(overlay);

      let startX = 0;
      let startY = 0;
      let dragging = false;

      const cleanup = () => {
        window.removeEventListener('keydown', onKey, true);
        overlay.remove();
      };

      const finish = async (result: SelectRegionResult) => {
        cleanup();
        await nextFrame(); // let the overlay removal paint before the worker captures
        resolve(result);
      };

      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          void finish({ cancelled: true });
        }
      };

      overlay.addEventListener('mousedown', (e) => {
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        sel.style.display = 'block';
        sel.style.left = `${startX}px`;
        sel.style.top = `${startY}px`;
        sel.style.width = '0px';
        sel.style.height = '0px';
      });
      overlay.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const r = normalizeRect(startX, startY, e.clientX, e.clientY);
        sel.style.left = `${r.x}px`;
        sel.style.top = `${r.y}px`;
        sel.style.width = `${r.width}px`;
        sel.style.height = `${r.height}px`;
      });
      overlay.addEventListener('mouseup', (e) => {
        if (!dragging) return;
        dragging = false;
        const raw = normalizeRect(startX, startY, e.clientX, e.clientY);
        const rect = clampRect(raw, { width: window.innerWidth, height: window.innerHeight });
        if (rect.width < 4 || rect.height < 4) {
          void finish({ cancelled: true });
          return;
        }
        void finish({ cancelled: false, rect, devicePixelRatio: window.devicePixelRatio || 1 });
      });
      window.addEventListener('keydown', onKey, true);
    });
  }

  chrome.runtime.onMessage.addListener((msg: ContentRequest, _sender, sendResponse) => {
    switch (msg.type) {
      case 'FS_MEASURE': {
        beginCaptureMode();
        const m = measurePage(document, window);
        const result: MeasureResult = {
          pageWidth: m.pageWidth,
          pageHeight: m.pageHeight,
          viewportWidth: m.viewportWidth,
          viewportHeight: m.viewportHeight,
          devicePixelRatio: m.devicePixelRatio,
        };
        sendResponse(result);
        return; // synchronous
      }
      case 'FS_GOTO': {
        if (msg.hidePinned) hidePinned(pinned);
        else restorePinned(pinned);
        window.scrollTo(msg.x, msg.y);
        wait(msg.settleDelayMs).then(() => {
          const result: GotoResult = { actualX: window.scrollX, actualY: window.scrollY };
          sendResponse(result);
        });
        return true; // async
      }
      case 'FS_RESTORE': {
        endCaptureMode();
        sendResponse({ ok: true });
        return; // synchronous
      }
      case 'FS_SELECT_REGION': {
        selectRegion().then(sendResponse);
        return true; // async
      }
      default:
        return;
    }
  });
}
