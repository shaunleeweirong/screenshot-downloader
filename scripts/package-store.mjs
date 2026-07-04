// Package the production build for Chrome Web Store upload.
// The CWS requires manifest.json at the ROOT of the ZIP (no subfolder) — this
// differs from the load-unpacked release ZIP, which uses a `fullshot/` folder.
// Source maps are stripped. Guards against accidentally shipping an E2E build.
import { execFileSync } from 'node:child_process';
import { rmSync, mkdirSync, cpSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const manifestPath = join(dist, 'manifest.json');

if (!existsSync(manifestPath)) {
  throw new Error('dist/ not found — run `npm run build` first.');
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

// Safety: never package a test/E2E build.
if (manifest.host_permissions) {
  throw new Error('Refusing to package: manifest has host_permissions (this looks like an E2E build). Run `npm run build`.');
}

const version = manifest.version;
const out = join(root, `fullshot-store-v${version}.zip`);
rmSync(out, { force: true });

// Stage a clean copy WITHOUT source maps, manifest at root.
const stage = join(root, '.store-stage');
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
cpSync(dist, stage, {
  recursive: true,
  filter: (src) => !src.endsWith('.map'),
});

// zip -r <out> .   (from inside stage so manifest.json is at the archive root)
execFileSync('zip', ['-rq', out, '.'], { cwd: stage });
rmSync(stage, { recursive: true, force: true });

console.log(`Store package -> ${out}`);
execFileSync('unzip', ['-l', out], { stdio: 'inherit' });
