# FullShot — Full Page Screen Capture

A privacy-first Chrome extension (Manifest V3) that captures **full-page**, **visible-area**, and **selected-region** screenshots and exports them as **PNG / JPG / PDF**. Everything happens locally in your browser — nothing is uploaded, and it requests only `activeTab` (no "read all your data on all websites").

This is a clone of GoFullPage's **free** feature set, plus a reliability edge on the hard pages every competitor struggles with (sticky headers duplicated down the image, blank gaps, oversized pages).

## Features (MVP)

- **Full-page capture** — scroll-and-stitch the entire page into one image.
- **Visible area** — one-click capture of the current viewport.
- **Selected region** — drag to choose an area.
- **Export** — PNG, JPG, and PDF; plus copy-to-clipboard and drag-to-save from the result page.
- **Reliability wedge**
  - Sticky/fixed elements are shown once at the top and neutralized below, so headers aren't tiled down the image.
  - A configurable settle delay per scroll step lets lazy-loaded content render.
  - Oversized/high-DPI pages are auto-tiled into multiple images instead of coming out blank.
- **Local history** (IndexedDB), settings (default format, JPEG quality, auto-download, filename template, settle delay), and a keyboard shortcut (`Alt+Shift+P`).
- **Privacy**: `activeTab` + `scripting` + `storage` + `downloads` only. No host permissions, no accounts, no network calls.

## Load it in Chrome

```bash
npm install
npm run build      # outputs the extension to dist/
```

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select the `dist/` folder
4. Pin **FullShot** and click it (or press `Alt+Shift+P`) on any normal web page

> Protected pages (`chrome://…`, the Chrome Web Store, PDF viewer) can't be captured by any extension — FullShot shows a friendly message instead of failing.

## Develop

```bash
npm run watch      # rebuild on change (reload the extension in chrome://extensions after changes)
npm run typecheck  # tsc --noEmit
```

## Test

```bash
npm test           # unit tests (Vitest) — capture math, tiling, filenames, region, sticky, settings
npm run test:e2e   # real-browser end-to-end (Playwright + bundled Chromium)
```

The E2E suite loads the extension into a real browser and verifies every capture mode end-to-end against a fixture page (full-page tallness + non-blank + sticky-header de-duplication, visible area, and pixel-exact region crop). It builds a **test-only** variant with a temporary host permission so the pipeline can run without a toolbar-click gesture; the shipping build in `dist/` is always `activeTab`-only.

## Architecture

- `src/background/service-worker.ts` — orchestrates capture: injects the content script (on demand via `activeTab`), paces `captureVisibleTab` under Chrome's quota, stitches tiles with `OffscreenCanvas`, saves to history, opens the result tab.
- `src/content/content.ts` — measures the page, hides scrollbars (without disabling scroll), neutralizes sticky/fixed elements, drives the scroll loop, and renders the region-select overlay. Injected as a self-contained IIFE.
- `src/lib/capture/*` — pure, unit-tested geometry: scroll arrangement (`page-metrics`), oversized-page tiling (`tiling`), sticky detection (`sticky`), region math (`region`), and `OffscreenCanvas` stitching (`stitcher`).
- `src/lib/storage/*` — settings (`chrome.storage`) and capture history (IndexedDB).
- `src/lib/licensing/license-service.ts` — a stub `isPro() => false`; the seam where a future paid "Pro" tier (editor, watermarks, smart PDF page-breaks) plugs in without touching call sites.
- `src/popup`, `src/results`, `src/options` — the UI pages (vanilla TS + CSS).

Build is a small deterministic esbuild script (`scripts/build.mjs`): page scripts + service worker as ESM, the content script as a self-contained IIFE (so it can be injected via `chrome.scripting.executeScript`), and static HTML/CSS/generated icons + `manifest.json` copied into `dist/`.

## Privacy

FullShot collects, transmits, and stores **nothing** off your device — no accounts, analytics, or servers. Full policy: **https://shaunleeweirong.github.io/screenshot-downloader/** (source in `docs/index.html`).

## Chrome Web Store submission

Everything needed to publish is prepared in-repo:
- `npm run package:store` → `fullshot-store-v1.0.0.zip` (manifest.json at the ZIP root, as the store requires).
- `npm run gen:store-assets` → icons + `store-assets/` (1280×800 screenshots + promo tiles), regenerated with Playwright.
- `STORE_LISTING.md` → copy-paste text for every dashboard field (title, description, single-purpose, per-permission justifications, data-disclosure answers) plus the step-by-step submission guide.

The submitter creates the Chrome Web Store developer account, pays the one-time $5 fee, uploads the ZIP, pastes the listing, and submits for review.

## Roadmap (post-MVP / future "Pro")

Editor (crop/annotate/blur/arrows), datestamp/URL watermark, smart PDF page-breaks, cross-origin iframe traversal (needs broader permissions), and cloud/sharing — all gated behind the `LicenseService` seam. Monetization path: ExtensionPay or Stripe Checkout + a lightweight license validator.
