import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYER, MAX_EXTRA_LAYERS, parseLayerNames, watchedLayers } from '../src/lib/layer-names.js';

describe('parseLayerNames', () => {
  it('splits on commas, whitespace and newlines and trims', () => {
    expect(parseLayerNames(' myDataLayer, digitalData\n  _dl2 ')).toEqual({ names: ['myDataLayer', 'digitalData', '_dl2'], invalid: [] });
  });

  it('accepts $ and _ and rejects anything that is not a plain JS identifier', () => {
    expect(parseLayerNames('$dl, _x, 9lives, my-layer, window.dl, a b')).toEqual({
      names: ['$dl', '_x', 'a', 'b'],
      invalid: ['9lives', 'my-layer', 'window.dl']
    });
  });

  it('drops duplicates and the built-in default', () => {
    expect(parseLayerNames('dl, adobeDataLayer, dl').names).toEqual(['dl']);
  });

  it('rejects names longer than 64 characters', () => {
    const long = 'a'.repeat(65);
    expect(parseLayerNames(long)).toEqual({ names: [], invalid: [long] });
  });

  it(`keeps at most ${MAX_EXTRA_LAYERS} extra names`, () => {
    const many = Array.from({ length: MAX_EXTRA_LAYERS + 3 }, (_, i) => `dl${i}`).join(',');
    expect(parseLayerNames(many).names).toHaveLength(MAX_EXTRA_LAYERS);
  });

  it('treats empty input as no extra names', () => {
    expect(parseLayerNames('')).toEqual({ names: [], invalid: [] });
    expect(parseLayerNames(undefined)).toEqual({ names: [], invalid: [] });
  });
});

describe('watchedLayers', () => {
  it('always watches the default first, then valid stored extras', () => {
    expect(DEFAULT_LAYER).toBe('adobeDataLayer');
    expect(watchedLayers(['myDataLayer'])).toEqual(['adobeDataLayer', 'myDataLayer']);
  });

  it('ignores invalid or non-array stored values', () => {
    expect(watchedLayers(['ok', 'not ok', 42, 'adobeDataLayer'])).toEqual(['adobeDataLayer', 'ok']);
    expect(watchedLayers(undefined)).toEqual(['adobeDataLayer']);
    expect(watchedLayers('myDataLayer')).toEqual(['adobeDataLayer']);
  });
});
