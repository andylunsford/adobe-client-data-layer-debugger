import { describe, it, expect } from 'vitest';
import { normalizeTheme, nextTheme, loadTheme, saveTheme, applyTheme } from '../src/lib/theme.js';

const memoryStorage = () => {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v))
  };
};

describe('theme', () => {
  it('normalizeTheme keeps known themes', () => {
    expect(['system', 'light', 'dark'].map(normalizeTheme)).toEqual(['system', 'light', 'dark']);
  });

  it('normalizeTheme falls back to system', () => {
    expect([null, undefined, '', 'blue'].map(normalizeTheme)).toEqual(['system', 'system', 'system', 'system']);
  });

  it('nextTheme cycles system → light → dark → system', () => {
    expect(nextTheme('system')).toBe('light');
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('system');
    expect(nextTheme('bogus')).toBe('light');
  });

  it('saveTheme and loadTheme round-trip through storage', () => {
    const storage = memoryStorage();
    expect(loadTheme(storage)).toBe('system');
    saveTheme(storage, 'dark');
    expect(loadTheme(storage)).toBe('dark');
  });

  it('loadTheme and saveTheme tolerate throwing storage', () => {
    const broken = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); }
    };
    expect(loadTheme(broken)).toBe('system');
    expect(() => saveTheme(broken, 'light')).not.toThrow();
  });

  it('applyTheme sets data-theme for light/dark and removes it for system', () => {
    const root = { dataset: {} };
    applyTheme(root, 'dark');
    expect(root.dataset.theme).toBe('dark');
    applyTheme(root, 'system');
    expect(root.dataset).not.toHaveProperty('theme');
  });
});
