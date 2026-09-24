export const THEMES = ['system', 'light', 'dark'];
const STORAGE_KEY = 'acdl-debugger:theme';

export function normalizeTheme(value) {
  return THEMES.includes(value) ? value : 'system';
}

export function nextTheme(current) {
  return THEMES[(THEMES.indexOf(normalizeTheme(current)) + 1) % THEMES.length];
}

export function loadTheme(storage) {
  try {
    return normalizeTheme(storage.getItem(STORAGE_KEY));
  } catch {
    return 'system';
  }
}

export function saveTheme(storage, theme) {
  try {
    storage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage unavailable: the choice lasts until the panel closes.
  }
}

export function applyTheme(root, theme) {
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
}
