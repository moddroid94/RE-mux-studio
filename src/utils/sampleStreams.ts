import { ManifestAnalysis } from '../types/stream';

// Local storage key for saving user URL history
const HISTORY_KEY = 'remux_url_history';

export function getUrlHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveUrlToHistory(url: string) {
  if (!url || !url.trim().startsWith('http')) return;
  try {
    const current = getUrlHistory();
    const updated = [url, ...current.filter((u) => u !== url)].slice(0, 10);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  } catch {
    // Ignore local storage write errors
  }
}

export function clearUrlHistory() {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {}
}

export const SAMPLE_STREAMS = [];
