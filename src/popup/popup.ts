import type { CaptureMode } from '../lib/types';
import type { StartCaptureResult, ProgressMsg } from '../lib/messaging/contracts';

const statusEl = document.getElementById('status') as HTMLElement;
const modeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.mode'));
const settingsBtn = document.getElementById('settings') as HTMLButtonElement;

function setStatus(text: string, kind: 'muted' | 'ok' | 'err' = 'muted'): void {
  statusEl.textContent = text;
  statusEl.className = `status ${kind === 'muted' ? '' : kind}`.trim();
}

function setBusy(busy: boolean): void {
  modeButtons.forEach((b) => (b.disabled = busy));
}

chrome.runtime.onMessage.addListener((msg: ProgressMsg) => {
  if (msg?.type !== 'FS_PROGRESS') return;
  if (msg.phase === 'capture') setStatus(`Capturing… ${msg.done}/${msg.total}`);
  else if (msg.phase === 'stitch') setStatus('Stitching…');
  else if (msg.phase === 'save') setStatus('Saving…');
});

async function start(mode: CaptureMode): Promise<void> {
  setBusy(true);

  // Region needs the popup gone so the user can draw on the page.
  if (mode === 'region') {
    chrome.runtime.sendMessage({ type: 'FS_START', mode });
    window.close();
    return;
  }

  setStatus('Starting…');
  try {
    const res = (await chrome.runtime.sendMessage({ type: 'FS_START', mode })) as StartCaptureResult;
    if (res?.ok && !res.cancelled) {
      setStatus('Saved ✓ — opening result', 'ok');
      setTimeout(() => window.close(), 700);
    } else if (res?.ok && res.cancelled) {
      setStatus('Cancelled.');
      setBusy(false);
    } else {
      setStatus(res?.error ?? 'Capture failed.', 'err');
      setBusy(false);
    }
  } catch (e) {
    setStatus(e instanceof Error ? e.message : 'Capture failed.', 'err');
    setBusy(false);
  }
}

modeButtons.forEach((btn) => {
  btn.addEventListener('click', () => start(btn.dataset.mode as CaptureMode));
});

settingsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
