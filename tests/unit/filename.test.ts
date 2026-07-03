import { describe, it, expect } from 'vitest';
import {
  sanitizeSegment,
  hostFromUrl,
  formatDate,
  formatTime,
  buildFilename,
} from '../../src/lib/export/filename';

describe('sanitizeSegment', () => {
  it('replaces illegal filename characters', () => {
    expect(sanitizeSegment('a/b:c*d?e"f<g>h|i')).toBe('a-b-c-d-e-f-g-h-i');
  });
  it('collapses whitespace and trims dashes', () => {
    expect(sanitizeSegment('  hello   world  ')).toBe('hello-world');
  });
  it('falls back to "page" when empty', () => {
    expect(sanitizeSegment('***')).toBe('page');
  });
  it('truncates to maxLen', () => {
    expect(sanitizeSegment('x'.repeat(100), 10)).toHaveLength(10);
  });
});

describe('hostFromUrl', () => {
  it('extracts hostname and strips www', () => {
    expect(hostFromUrl('https://www.example.com/some/path?q=1')).toBe('example.com');
  });
  it('returns "page" for invalid urls', () => {
    expect(hostFromUrl('not a url')).toBe('page');
  });
});

describe('date/time formatting', () => {
  const d = new Date(2026, 6, 3, 9, 5, 7); // 2026-07-03 09:05:07 local
  it('formats date as YYYYMMDD', () => {
    expect(formatDate(d)).toBe('20260703');
  });
  it('formats time as HHMMSS with padding', () => {
    expect(formatTime(d)).toBe('090507');
  });
});

describe('buildFilename', () => {
  const d = new Date(2026, 6, 3, 9, 5, 7);
  it('expands the default template with extension', () => {
    const name = buildFilename('screencapture-{host}-{timestamp}', {
      url: 'https://www.example.com/x',
      title: 'Example',
      date: d,
      format: 'png',
    });
    expect(name).toBe('screencapture-example.com-20260703-090507.png');
  });
  it('supports {title} and {date}/{time} tokens and jpg ext', () => {
    const name = buildFilename('{title}-{date}-{time}', {
      url: 'https://example.com',
      title: 'My Page!',
      date: d,
      format: 'jpg',
    });
    // '!' is a legal filename char, so it is kept; only whitespace/illegal chars change.
    expect(name).toBe('My-Page!-20260703-090507.jpg');
  });
  it('produces a valid pdf filename', () => {
    const name = buildFilename('{host}', {
      url: 'https://example.com',
      title: '',
      date: d,
      format: 'pdf',
    });
    expect(name).toBe('example.com.pdf');
  });
});
