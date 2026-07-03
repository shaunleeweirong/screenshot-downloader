// Shared types across the extension (worker, content script, and UI pages).

export type CaptureMode = 'fullpage' | 'visible' | 'region';

export type ExportFormat = 'png' | 'jpg' | 'pdf';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageMetrics {
  pageWidth: number;
  pageHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
}

export interface Settings {
  defaultFormat: ExportFormat;
  /** JPEG quality, 0..1 */
  jpegQuality: number;
  /** Save straight to disk instead of opening the results tab. */
  autoDownload: boolean;
  /** Filename template. Tokens: {host} {title} {timestamp} {date} {time} */
  filenameTemplate: string;
  /** Milliseconds to wait after each scroll step so lazy content can render. */
  settleDelayMs: number;
}

export const DEFAULT_SETTINGS: Settings = {
  defaultFormat: 'png',
  jpegQuality: 0.92,
  autoDownload: false,
  filenameTemplate: 'screencapture-{host}-{timestamp}',
  settleDelayMs: 150,
};

/** Metadata for a capture stored in local history (blobs live in IndexedDB). */
export interface CaptureRecord {
  id: string;
  url: string;
  title: string;
  createdAt: number;
  width: number;
  height: number;
  mode: CaptureMode;
  /** Number of image tiles (>1 when the page exceeded canvas limits). */
  tiles: number;
}
