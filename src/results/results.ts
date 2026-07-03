import { jsPDF } from 'jspdf';
import { getRecord, getBlobs } from '../lib/storage/history';
import { loadSettings } from '../lib/storage/settings';
import { buildFilename } from '../lib/export/filename';
import type { CaptureRecord, ExportFormat, Settings } from '../lib/types';

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

async function buildPdf(): Promise<Blob> {
  let doc: jsPDF | undefined;
  for (let i = 0; i < blobs.length; i++) {
    const bmp = await createImageBitmap(blobs[i]);
    const w = bmp.width;
    const h = bmp.height;
    const orientation = w > h ? 'l' : 'p';
    if (!doc) doc = new jsPDF({ orientation, unit: 'px', format: [w, h] });
    else doc.addPage([w, h], orientation);
    const dataUrl = await blobToDataUrl(blobs[i]);
    doc.addImage(dataUrl, 'PNG', 0, 0, w, h);
    bmp.close();
  }
  return doc!.output('blob');
}

async function downloadPng(): Promise<void> {
  if (blobs.length === 1) downloadBlob(blobs[0], nameFor('png'));
  else blobs.forEach((b, i) => downloadBlob(b, nameFor('png', i)));
  toast('Downloaded PNG');
}

async function downloadJpg(): Promise<void> {
  for (let i = 0; i < blobs.length; i++) {
    const jpg = await toJpeg(blobs[i], settings.jpegQuality);
    downloadBlob(jpg, nameFor('jpg', i));
  }
  toast('Downloaded JPG');
}

async function downloadPdf(): Promise<void> {
  const pdf = await buildPdf();
  downloadBlob(pdf, nameFor('pdf'));
  toast('Downloaded PDF');
}

async function copyToClipboard(): Promise<void> {
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobs[0] })]);
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

  buttons.png.addEventListener('click', () => void downloadPng());
  buttons.jpg.addEventListener('click', () => void downloadJpg());
  buttons.pdf.addEventListener('click', () => void downloadPdf());
  buttons.copy.addEventListener('click', () => void copyToClipboard());

  if (auto) await autoDownload();
}

void main();
