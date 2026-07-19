import { jsPDF } from 'jspdf';
import { getRecord, getBlobs } from '../lib/storage/history';
import { loadSettings } from '../lib/storage/settings';
import { buildFilename } from '../lib/export/filename';
import type { CaptureRecord, ExportFormat, Settings } from '../lib/types';
import { EditorController } from './editor-controller';

const params = new URLSearchParams(location.search);
const id = params.get('id') ?? '';
const auto = params.get('auto') === '1';

const stage = document.getElementById('stage') as HTMLElement;
const loading = document.getElementById('loading') as HTMLElement;
const metaEl = document.getElementById('meta') as HTMLElement;
const filenameInput = document.getElementById('filename') as HTMLInputElement;
const toastEl = document.getElementById('toast') as HTMLElement;

const buttons = {
  png: document.getElementById('dl-png') as HTMLButtonElement,
  jpg: document.getElementById('dl-jpg') as HTMLButtonElement,
  pdf: document.getElementById('dl-pdf') as HTMLButtonElement,
  copy: document.getElementById('copy') as HTMLButtonElement,
};

let record: CaptureRecord | undefined;
let blobs: Blob[] = [];
let settings: Settings;

let editor: EditorController | null = null;
let editing = false;
let toolbarAbort: AbortController | null = null;
const editToggle = document.getElementById('edit-toggle') as HTMLButtonElement;
const toolbar = document.getElementById('editor-toolbar') as HTMLElement;

function toast(text: string): void {
  toastEl.textContent = text;
  toastEl.hidden = false;
  setTimeout(() => (toastEl.hidden = true), 1800);
}

function showError(text: string): void {
  loading.className = 'error';
  loading.textContent = text;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function nameFor(format: ExportFormat, tileIndex?: number): string {
  const base = filenameInput.value.trim() || 'screencapture';
  const withExt = `${base}.${format === 'png' ? 'png' : format === 'jpg' ? 'jpg' : 'pdf'}`;
  if (tileIndex === undefined || blobs.length <= 1) return withExt;
  return withExt.replace(/(\.\w+)$/, `-${tileIndex + 1}$1`);
}

async function toJpeg(blob: Blob, quality: number): Promise<Blob> {
  const bmp = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  return new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg', quality));
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function bitmapFromBlob(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob);
}

// Keep the toolbar in sync with the editor: highlight the active tool and make the
// color/width controls reflect whatever is currently selected (so you edit it in place).
function syncToolbar(): void {
  if (!editor) return;
  const st = editor.getUiState();
  toolbar.querySelectorAll<HTMLButtonElement>('.tool').forEach((x) => x.classList.toggle('active', x.dataset.tool === st.tool));
  (document.getElementById('tool-color') as HTMLInputElement).value = st.style.stroke;
  (document.getElementById('tool-width') as HTMLInputElement).value = String(st.style.strokeWidth);
  (document.getElementById('tool-crop-reset') as HTMLElement).hidden = st.tool !== 'crop';
}

async function enterEditMode(): Promise<void> {
  if (editing || blobs.length !== 1) return;
  editing = true;
  editToggle.textContent = 'Done';
  editToggle.classList.add('primary');
  toolbar.hidden = false;
  stage.classList.add('editing');

  if (editor) {
    editor.setInteractive(true); // resume the existing session — edits are preserved
  } else {
    const source = await bitmapFromBlob(blobs[0]);
    editor = new EditorController(stage, source, syncToolbar);
    editor.mount();
    editor.setTool('select');
  }

  toolbarAbort = new AbortController();
  const { signal } = toolbarAbort;
  toolbar.querySelectorAll<HTMLButtonElement>('.tool').forEach((b) => {
    b.addEventListener('click', () => editor!.setTool(b.dataset.tool as Parameters<EditorController['setTool']>[0]), { signal });
  });
  (document.getElementById('tool-color') as HTMLInputElement).addEventListener('input', (e) => editor!.setColor((e.target as HTMLInputElement).value), { signal });
  (document.getElementById('tool-width') as HTMLInputElement).addEventListener('input', (e) => editor!.setStrokeWidth(parseInt((e.target as HTMLInputElement).value, 10)), { signal });
  document.getElementById('tool-undo')!.addEventListener('click', () => editor!.undo(), { signal });
  document.getElementById('tool-redo')!.addEventListener('click', () => editor!.redo(), { signal });
  document.getElementById('tool-delete')!.addEventListener('click', () => editor!.deleteSelected(), { signal });
  document.getElementById('tool-crop-reset')!.addEventListener('click', () => editor!.resetCrop(), { signal });
  syncToolbar();
}

function exitEditMode(): void {
  if (!editing) return;
  toolbarAbort?.abort();
  toolbarAbort = null;
  editing = false;
  editToggle.textContent = 'Edit';
  editToggle.classList.remove('primary');
  toolbar.hidden = true;
  if (editor && editor.hasEdits()) {
    // Keep the annotated canvas on screen and exportable; resume on re-edit.
    editor.setInteractive(false);
  } else {
    // No edits — revert cleanly to the original capture display.
    stage.classList.remove('editing');
    editor?.destroy();
    editor = null;
  }
}

async function currentExportBlobs(): Promise<Blob[]> {
  if (editor && editor.hasEdits()) return [await editor.export()];
  return blobs;
}

async function buildPdf(source: Blob[]): Promise<Blob> {
  let doc: jsPDF | undefined;
  for (let i = 0; i < source.length; i++) {
    const bmp = await createImageBitmap(source[i]);
    const w = bmp.width;
    const h = bmp.height;
    const orientation = w > h ? 'l' : 'p';
    if (!doc) doc = new jsPDF({ orientation, unit: 'px', format: [w, h] });
    else doc.addPage([w, h], orientation);
    const dataUrl = await blobToDataUrl(source[i]);
    doc.addImage(dataUrl, 'PNG', 0, 0, w, h);
    bmp.close();
  }
  return doc!.output('blob');
}

async function downloadPng(): Promise<void> {
  const bl = await currentExportBlobs();
  if (bl.length === 1) downloadBlob(bl[0], nameFor('png'));
  else bl.forEach((b, i) => downloadBlob(b, nameFor('png', i)));
  toast('Downloaded PNG');
}

async function downloadJpg(): Promise<void> {
  const bl = await currentExportBlobs();
  for (let i = 0; i < bl.length; i++) {
    const jpg = await toJpeg(bl[i], settings.jpegQuality);
    downloadBlob(jpg, nameFor('jpg', bl.length > 1 ? i : undefined));
  }
  toast('Downloaded JPG');
}

async function downloadPdf(): Promise<void> {
  const bl = await currentExportBlobs();
  const pdf = await buildPdf(bl);
  downloadBlob(pdf, nameFor('pdf'));
  toast('Downloaded PDF');
}

async function copyToClipboard(): Promise<void> {
  try {
    const bl = await currentExportBlobs();
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': bl[0] })]);
    toast('Copied to clipboard');
  } catch {
    toast('Copy failed — try downloading instead');
  }
}

function render(): void {
  loading.remove();
  for (let i = 0; i < blobs.length; i++) {
    if (blobs.length > 1) {
      const note = document.createElement('div');
      note.className = 'tile-note';
      note.textContent = `Part ${i + 1} of ${blobs.length}`;
      stage.appendChild(note);
    }
    const img = document.createElement('img');
    img.src = URL.createObjectURL(blobs[i]);
    stage.appendChild(img);
  }
}

async function autoDownload(): Promise<void> {
  if (settings.defaultFormat === 'jpg') await downloadJpg();
  else if (settings.defaultFormat === 'pdf') await downloadPdf();
  else await downloadPng();
}

async function main(): Promise<void> {
  settings = await loadSettings();
  if (!id) return showError('Missing capture id.');
  record = await getRecord(id);
  if (!record) return showError('Capture not found (it may have been cleared).');
  blobs = await getBlobs(record);
  if (blobs.length === 0) return showError('Capture image data not found.');

  filenameInput.value = buildFilename(settings.filenameTemplate, {
    url: record.url,
    title: record.title,
    date: new Date(record.createdAt),
    format: 'png',
  }).replace(/\.png$/, '');

  const cssW = Math.round(record.width / (window.devicePixelRatio || 1));
  const cssH = Math.round(record.height / (window.devicePixelRatio || 1));
  metaEl.textContent = `${record.title || record.url} · ${cssW}×${cssH}px${blobs.length > 1 ? ` · ${blobs.length} parts` : ''}`;
  document.title = `FullShot — ${record.title || 'Result'}`;

  render();

  if (blobs.length === 1) {
    editToggle.addEventListener('click', () => (editing ? exitEditMode() : void enterEditMode()));
  } else {
    editToggle.disabled = true;
    editToggle.title = 'Editing is unavailable for very large multi-part captures';
  }

  buttons.png.addEventListener('click', () => void downloadPng());
  buttons.jpg.addEventListener('click', () => void downloadJpg());
  buttons.pdf.addEventListener('click', () => void downloadPdf());
  buttons.copy.addEventListener('click', () => void copyToClipboard());

  if (auto) await autoDownload();
}

void main();
