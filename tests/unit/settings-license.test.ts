import { describe, it, expect } from 'vitest';
import { mergeSettings } from '../../src/lib/storage/settings';
import { DEFAULT_SETTINGS } from '../../src/lib/types';
import { licenseService } from '../../src/lib/licensing/license-service';

describe('mergeSettings', () => {
  it('returns defaults when nothing is stored', () => {
    expect(mergeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
  it('overlays stored values over defaults', () => {
    const merged = mergeSettings({ autoDownload: true, jpegQuality: 0.5 });
    expect(merged.autoDownload).toBe(true);
    expect(merged.jpegQuality).toBe(0.5);
    // untouched fields keep defaults
    expect(merged.filenameTemplate).toBe(DEFAULT_SETTINGS.filenameTemplate);
  });
});

describe('licenseService (MVP stub)', () => {
  it('reports not-pro (everything free in MVP)', async () => {
    expect(await licenseService.isPro()).toBe(false);
  });
});
