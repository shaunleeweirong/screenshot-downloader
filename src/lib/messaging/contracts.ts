import type { CaptureMode, Rect } from '../types';

// ---- Popup/command -> service worker ----
export interface StartCaptureMsg {
  type: 'FS_START';
  mode: CaptureMode;
}

export interface StartCaptureResult {
  ok: boolean;
  recordId?: string;
  tiles?: number;
  cancelled?: boolean;
  error?: string;
}

// ---- Service worker -> popup (broadcast progress) ----
export interface ProgressMsg {
  type: 'FS_PROGRESS';
  done: number;
  total: number;
  phase: 'measure' | 'capture' | 'stitch' | 'save';
}

// ---- Service worker -> content script (request/response via tabs.sendMessage) ----
export interface MeasureMsg {
  type: 'FS_MEASURE';
}
export interface MeasureResult {
  pageWidth: number;
  pageHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
}

export interface GotoMsg {
  type: 'FS_GOTO';
  x: number;
  y: number;
  hidePinned: boolean;
  settleDelayMs: number;
}
export interface GotoResult {
  actualX: number;
  actualY: number;
}

export interface RestoreMsg {
  type: 'FS_RESTORE';
}

export interface SelectRegionMsg {
  type: 'FS_SELECT_REGION';
}
export interface SelectRegionResult {
  cancelled: boolean;
  rect?: Rect;
  devicePixelRatio?: number;
}

export type ContentRequest = MeasureMsg | GotoMsg | RestoreMsg | SelectRegionMsg;
