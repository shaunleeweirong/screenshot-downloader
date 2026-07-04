# Chrome Web Store — Listing & Submission Guide

Everything below is ready to paste into the **Chrome Web Store Developer Dashboard**. Fields are ordered roughly as the dashboard presents them. Character limits are noted where they matter.

---

## 📦 Package to upload
`fullshot-store-v1.0.0.zip` (built by `npm run package:store` — manifest.json is at the ZIP root, as the store requires).

## 🔗 Privacy policy URL
```
https://shaunleeweirong.github.io/screenshot-downloader/
```

## 🖼️ Assets (in `store-assets/`)
| Dashboard slot | File |
|---|---|
| Store icon (128×128) | `dist/icons/icon-128.png` (or `src/assets/icon-128.png`) |
| Screenshot 1 (1280×800) | `store-assets/screenshot-1-popup.png` |
| Screenshot 2 (1280×800) | `store-assets/screenshot-2-result.png` |
| Screenshot 3 (1280×800) | `store-assets/screenshot-3-settings.png` |
| Screenshot 4 (1280×800) | `store-assets/screenshot-4-region.png` |
| Small promo tile (440×280) | `store-assets/promo-small-440x280.png` |
| Marquee promo tile (1400×560) | `store-assets/promo-marquee-1400x560.png` |

---

## Store listing tab

### Title (≤75 chars)
```
FullShot — Full Page & Region Screenshots
```

### Summary / short description (≤132 chars)
```
Capture full-page, visible-area or region screenshots as PNG, JPG or PDF. 100% local, no account, minimal permissions.
```

### Category
**Productivity** (subcategory: Tools) — this is a focused utility, not a developer tool.

### Language
English (United States)

### Detailed description (≤16,000 chars)
```
FullShot captures beautiful screenshots of any web page — the entire scrolling page, just the visible area, or a region you drag — and saves them as PNG, JPG, or PDF. It runs entirely on your device: no account, no sign-up, and nothing is ever uploaded.

━━━ WHAT YOU CAN DO ━━━

• Full page — automatically scrolls and stitches the whole page into one tall image, even content below the fold.
• Visible area — one click to grab exactly what's on screen.
• Selected region — drag to capture just the part you need.
• Export as PNG, JPG, or PDF.
• Copy to clipboard or drag the image straight out to save it.
• Local history — re-download your recent captures any time.

━━━ BUILT FOR RELIABILITY ━━━

Most full-page tools stumble on modern pages. FullShot handles the hard parts:
• Sticky/fixed headers are shown once at the top and hidden afterward, so they don't repeat down the image.
• A short settle delay per step lets lazy-loaded content appear before it's captured.
• Very tall or high-resolution pages are split cleanly into multiple images instead of coming out blank.

━━━ PRIVATE BY DESIGN ━━━

• 100% local — every screenshot is created and stored on your own computer.
• No account, no analytics, no trackers, no servers.
• Minimal permissions: FullShot uses "activeTab", so it can only act on a page when YOU click the icon — it has no access to your browsing and no "read all your data on all websites" permission.

━━━ HOW TO USE ━━━

1. Click the FullShot icon on any normal web page (or press Alt+Shift+P for a full-page capture).
2. Pick a mode: Full page, Visible area, or Selected region.
3. On the result tab, download as PNG / JPG / PDF, or copy to clipboard.
Open Settings (the gear in the popup) to set your default format, image quality, and filename.

━━━ GOOD TO KNOW ━━━

• Protected browser pages (chrome:// settings, the Chrome Web Store, the built-in PDF viewer) can't be captured by any extension.
• Infinite-scroll feeds (for example the LinkedIn or X home feed) can't be fully captured by any screenshot tool, because those pages continuously load and unload content — the whole feed never exists at once. Use Visible area or Selected region there, or capture a normal page (article, profile, docs) with Full page.

FullShot is open source: https://github.com/shaunleeweirong/screenshot-downloader
```

---

## Privacy tab

### Single purpose (paste)
```
FullShot has a single purpose: to capture screenshots of the web page the user is viewing (full page, visible area, or a selected region) and let the user save or copy the resulting image. All capture and processing happens locally in the browser.
```

### Permission justifications (paste one per field)

**activeTab**
```
Used to capture the content of the current tab only when the user explicitly invokes FullShot (by clicking the toolbar icon or pressing the keyboard shortcut). This lets the extension capture the page the user is looking at without requesting broad host access to all sites.
```

**scripting**
```
Used to inject the capture-and-stitch content script into the active tab at the moment the user triggers a capture — to measure the page, scroll through it, and neutralize sticky headers. It runs only on the tab the user chose to capture.
```

**storage**
```
Used to save the user's preferences locally (default export format, JPEG quality, filename template, auto-download and settle-delay settings). No preference data leaves the device.
```

**unlimitedStorage**
```
Full-page screenshots of long pages can be large. This permission lets FullShot keep recent captures in the browser's local IndexedDB history (so the user can re-download them) without hitting the default storage quota. All data stays on the user's device.
```

**downloads**
```
Used to save the captured screenshot file (PNG/JPG/PDF) to the user's computer when they choose to download it. This is the core output action of the extension.
```

### Remote code
Select: **"No, I am not using remote code."** (All logic ships inside the package; there are no external scripts, no eval of fetched code.)

### Data usage / disclosures
- **Does this item collect user data?** You must complete this section even though the answer is effectively "no data leaves the device."
- Do **NOT** check any data-collection category (no personally identifiable info, no health, no financial, no authentication info, no personal communications, no location, no web history, no user activity). FullShot collects/transmits none of these.
- Check the certification boxes:
  - ☑ I do not sell or transfer user data to third parties, outside of the approved use cases.
  - ☑ I do not use or transfer user data for purposes unrelated to my item's single purpose.
  - ☑ I do not use or transfer user data to determine creditworthiness or for lending purposes.
- Enter the **Privacy policy URL** above.

---

## Distribution tab
- Visibility: **Public** (or Unlisted while you test).
- Regions: All.
- Pricing: Free.

---

## ✅ Submission steps (the parts only you can do)

1. Go to the **Chrome Web Store Developer Dashboard**: https://chrome.google.com/webstore/devconsole
2. Sign in with the Google account you want to publish under, and **enable 2-Step Verification** on it (required to publish).
3. Pay the **one-time US$5** developer registration fee (first time only).
4. Click **"Add new item"** and upload **`fullshot-store-v1.0.0.zip`**.
5. Fill the **Store listing** tab (title, summary, description, category, language) and upload the **icon, screenshots, and promo tiles** from the table above.
6. Fill the **Privacy** tab: single purpose, the five permission justifications, remote code = No, the data-disclosure certifications, and the privacy policy URL.
7. Click **Submit for review**. Review usually takes a few days (sometimes longer for a brand-new developer account). You'll get an email when it's published.

> Tip: choosing **Unlisted** visibility first lets you install and sanity-check the published build via its store link before flipping it to Public.
