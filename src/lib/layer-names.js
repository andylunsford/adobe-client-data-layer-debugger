export const DEFAULT_LAYER = 'adobeDataLayer';
export const MAX_EXTRA_LAYERS = 10;
export const LAYER_NAMES_KEY = 'acdl-debugger:layerNames';

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/;

export function parseLayerNames(input) {
  const names = [];
  const invalid = [];
  for (const raw of String(input ?? '').split(/[\s,]+/)) {
    if (!raw) continue;
    if (!IDENTIFIER.test(raw)) invalid.push(raw);
    else if (raw !== DEFAULT_LAYER && !names.includes(raw) && names.length < MAX_EXTRA_LAYERS) names.push(raw);
  }
  return { names, invalid };
}

export function watchedLayers(stored) {
  const extras = Array.isArray(stored) ? parseLayerNames(stored.filter(n => typeof n === 'string' && !/[\s,]/.test(n)).join(',')).names : [];
  return [DEFAULT_LAYER, ...extras];
}
