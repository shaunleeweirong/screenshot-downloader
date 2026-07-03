import { DEFAULT_SETTINGS, type Settings } from '../types';

const KEY = 'settings';

/** Merge stored partial settings over defaults so new fields always have a value. */
export function mergeSettings(stored: Partial<Settings> | undefined | null): Settings {
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
}

export async function loadSettings(): Promise<Settings> {
  const data = await chrome.storage.local.get(KEY);
  return mergeSettings(data[KEY] as Partial<Settings> | undefined);
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [KEY]: settings });
}
