import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TARGETS, manifestForTarget } from '../src/lib/target-manifest.js';

const base = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));

describe('manifestForTarget', () => {
  it('lists chrome, firefox and safari', () => {
    expect(TARGETS).toEqual(['chrome', 'firefox', 'safari']);
  });

  it('returns the base manifest unchanged for chrome', () => {
    expect(manifestForTarget(base, 'chrome')).toEqual(base);
  });

  it('does not mutate the base manifest', () => {
    const before = structuredClone(base);
    manifestForTarget(base, 'firefox');
    manifestForTarget(base, 'safari');
    expect(base).toEqual(before);
  });

  it('throws on an unknown target', () => {
    expect(() => manifestForTarget(base, 'edge')).toThrow(/unknown target/i);
  });

  describe('firefox', () => {
    const m = manifestForTarget(base, 'firefox');

    it('uses an event-page background script instead of a service worker', () => {
      expect(m.background).toEqual({ scripts: ['background.js'] });
    });

    it('replaces the side panel with a sidebar_action', () => {
      expect(m.side_panel).toBeUndefined();
      expect(m.permissions).not.toContain('sidePanel');
      expect(m.sidebar_action).toEqual({
        default_panel: 'sidepanel/index.html',
        default_title: base.action.default_title,
        default_icon: base.action.default_icon,
        open_at_install: false
      });
    });

    it('keeps downloads and the rest of the permissions', () => {
      expect(m.permissions).toEqual(base.permissions.filter(p => p !== 'sidePanel'));
    });

    it('declares a gecko id, minimum version and no data collection', () => {
      expect(m.browser_specific_settings.gecko).toEqual({
        id: 'developer@acdl-debugger.com',
        strict_min_version: '142.0',
        data_collection_permissions: { required: ['none'] }
      });
    });
  });

  describe('safari', () => {
    const m = manifestForTarget(base, 'safari');

    it('opens the panel UI as the action popup', () => {
      expect(m.side_panel).toBeUndefined();
      expect(m.action.default_popup).toBe('sidepanel/popup.html');
      expect(m.action.default_icon).toEqual(base.action.default_icon);
    });

    it('drops permissions Safari does not support', () => {
      expect(m.permissions).not.toContain('sidePanel');
      expect(m.permissions).not.toContain('downloads');
    });

    it('keeps the service worker background', () => {
      expect(m.background).toEqual(base.background);
    });

    it('declares a minimum Safari version', () => {
      expect(m.browser_specific_settings.safari).toEqual({ strict_min_version: '17.5' });
    });
  });
});
