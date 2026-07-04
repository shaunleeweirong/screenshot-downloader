// Deterministic extension build with esbuild.
// - Page scripts + service worker  -> ESM, stable [name].js
// - Content script                 -> IIFE, self-contained classic script
//   (injected on demand via chrome.scripting.executeScript under activeTab, so
//    it must have no runtime imports)
// - Static HTML/CSS/icons + generated manifest.json copied into dist/
import * as esbuild from 'esbuild';
import { rmSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const watch = process.argv.includes('--watch');
// E2E builds add a host permission + a SW capture hook so the pipeline can run
// under automation without a toolbar-click gesture. The shipping build never does.
const E2E = process.env.FULLSHOT_E2E === '1';

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'icons'), { recursive: true });

const common = {
  bundle: true,
  sourcemap: true,
  target: 'es2022',
  minify: false, // keep bundles readable...
  minifySyntax: true, // ...but still drop dead branches (e.g. the E2E-gated hook)
  logLevel: 'info',
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"', __FS_E2E__: E2E ? 'true' : 'false' },
};

const esmBuild = {
  ...common,
  entryPoints: {
    'service-worker': join(root, 'src/background/service-worker.ts'),
    popup: join(root, 'src/popup/popup.ts'),
    results: join(root, 'src/results/results.ts'),
    options: join(root, 'src/options/options.ts'),
  },
  outdir: dist,
  format: 'esm',
  splitting: false, // each entry self-contained -> trivial manifest paths
};

const iifeBuild = {
  ...common,
  entryPoints: { content: join(root, 'src/content/content.ts') },
  outdir: dist,
  format: 'iife',
};

const manifest = {
  manifest_version: 3,
  name: 'FullShot — Full Page & Region Screenshots',
  version: '1.0.0',
  description:
    'Capture full-page, visible-area or region screenshots as PNG, JPG or PDF. 100% local, no account, minimal permissions.',
  homepage_url: 'https://github.com/shaunleeweirong/screenshot-downloader',
  minimum_chrome_version: '116',
  action: { default_popup: 'popup.html', default_title: 'FullShot — capture this page', default_icon: {
    16: 'icons/icon-16.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' } },
  background: { service_worker: 'service-worker.js', type: 'module' },
  options_page: 'options.html',
  // Privacy-first: NO <all_urls> host permission. activeTab + scripting let us
  // inject and capture ONLY the tab the user explicitly acts on.
  permissions: ['activeTab', 'scripting', 'storage', 'unlimitedStorage', 'downloads'],
  commands: {
    'capture-full-page': {
      suggested_key: { default: 'Alt+Shift+P' },
      description: 'Capture the full page',
    },
  },
  icons: { 16: 'icons/icon-16.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' },
};

if (E2E) {
  // Test-only: lets captureVisibleTab / executeScript run without a user gesture.
  manifest.host_permissions = ['<all_urls>'];
}

function copyStatic() {
  copyFileSync(join(root, 'src/popup/index.html'), join(dist, 'popup.html'));
  copyFileSync(join(root, 'src/popup/popup.css'), join(dist, 'popup.css'));
  copyFileSync(join(root, 'src/results/index.html'), join(dist, 'results.html'));
  copyFileSync(join(root, 'src/results/results.css'), join(dist, 'results.css'));
  copyFileSync(join(root, 'src/options/index.html'), join(dist, 'options.html'));
  copyFileSync(join(root, 'src/options/options.css'), join(dist, 'options.css'));
  for (const s of [16, 48, 128]) {
    copyFileSync(join(root, `src/assets/icon-${s}.png`), join(dist, `icons/icon-${s}.png`));
  }
  writeFileSync(join(dist, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

if (watch) {
  const c1 = await esbuild.context(esmBuild);
  const c2 = await esbuild.context(iifeBuild);
  await c1.watch();
  await c2.watch();
  copyStatic();
  console.log('Watching… (static files copied once; re-run for HTML/CSS changes)');
} else {
  await esbuild.build(esmBuild);
  await esbuild.build(iifeBuild);
  copyStatic();
  console.log('Build complete -> dist/');
}
