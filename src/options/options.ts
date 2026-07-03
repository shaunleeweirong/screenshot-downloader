import { loadSettings, saveSettings } from '../lib/storage/settings';
import type { ExportFormat, Settings } from '../lib/types';

const el = {
  defaultFormat: document.getElementById('defaultFormat') as HTMLSelectElement,
  jpegQuality: document.getElementById('jpegQuality') as HTMLInputElement,
  jpegVal: document.getElementById('jpegVal') as HTMLElement,
  autoDownload: document.getElementById('autoDownload') as HTMLInputElement,
  filenameTemplate: document.getElementById('filenameTemplate') as HTMLInputElement,
  settleDelayMs: document.getElementById('settleDelayMs') as HTMLInputElement,
  saved: document.getElementById('saved') as HTMLElement,
};

let savedTimer: ReturnType<typeof setTimeout> | undefined;
function flashSaved(): void {
  el.saved.hidden = false;
  if (savedTimer) clearTimeout(savedTimer);
  savedTimer = setTimeout(() => (el.saved.hidden = true), 1200);
}

function readForm(): Settings {
  return {
    defaultFormat: el.defaultFormat.value as ExportFormat,
    jpegQuality: parseFloat(el.jpegQuality.value),
    autoDownload: el.autoDownload.checked,
    filenameTemplate: el.filenameTemplate.value || 'screencapture-{host}-{timestamp}',
    settleDelayMs: Math.max(0, Math.min(2000, parseInt(el.settleDelayMs.value, 10) || 0)),
  };
}

async function persist(): Promise<void> {
  const settings = readForm();
  el.jpegVal.textContent = settings.jpegQuality.toFixed(2);
  await saveSettings(settings);
  flashSaved();
}

async function init(): Promise<void> {
  const s = await loadSettings();
  el.defaultFormat.value = s.defaultFormat;
  el.jpegQuality.value = String(s.jpegQuality);
  el.jpegVal.textContent = s.jpegQuality.toFixed(2);
  el.autoDownload.checked = s.autoDownload;
  el.filenameTemplate.value = s.filenameTemplate;
  el.settleDelayMs.value = String(s.settleDelayMs);

  for (const node of [el.defaultFormat, el.jpegQuality, el.autoDownload, el.filenameTemplate, el.settleDelayMs]) {
    node.addEventListener('change', () => void persist());
  }
  el.jpegQuality.addEventListener('input', () => (el.jpegVal.textContent = parseFloat(el.jpegQuality.value).toFixed(2)));
}

void init();
