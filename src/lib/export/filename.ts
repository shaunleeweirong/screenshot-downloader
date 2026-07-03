import type { ExportFormat } from '../types';

const EXT: Record<ExportFormat, string> = { png: 'png', jpg: 'jpg', pdf: 'pdf' };

/** Strip characters that are illegal or awkward in filenames on any OS. */
export function sanitizeSegment(input: string, maxLen = 60): string {
  const cleaned = input
    .normalize('NFKD')
    .replace(/[\\/:*?"<>|]+/g, '-') // illegal on Windows
    .replace(/[\x00-\x1f\x7f]+/g, '') // control chars
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned.slice(0, maxLen) || 'page';
}

/** Best-effort hostname from a URL string, without throwing. */
export function hostFromUrl(url: string): string {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    return sanitizeSegment(h, 60);
  } catch {
    return 'page';
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatDate(date: Date): string {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

export function formatTime(date: Date): string {
  return `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export interface FilenameContext {
  url: string;
  title: string;
  date: Date;
  format: ExportFormat;
}

/**
 * Expand a template into a safe filename with extension.
 * Tokens: {host} {title} {timestamp} {date} {time}
 */
export function buildFilename(template: string, ctx: FilenameContext): string {
  const date = formatDate(ctx.date);
  const time = formatTime(ctx.date);
  const tokens: Record<string, string> = {
    host: hostFromUrl(ctx.url),
    title: sanitizeSegment(ctx.title || '', 60),
    timestamp: `${date}-${time}`,
    date,
    time,
  };
  const body = template.replace(/\{(host|title|timestamp|date|time)\}/g, (_m, key: string) => tokens[key] ?? '');
  const safeBody = sanitizeSegment(body, 120) || `screencapture-${tokens.timestamp}`;
  return `${safeBody}.${EXT[ctx.format]}`;
}
