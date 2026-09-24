const isDomLike = (v) =>
  v && typeof v === 'object' && typeof v.nodeType === 'number' && typeof v.tagName === 'string';

function hasProblematicContent(input) {
  const seen = new WeakSet();
  const walk = (val) => {
    if (val === null || typeof val !== 'object') {
      if (typeof val === 'function') return true;
      return false;
    }
    if (isDomLike(val)) return true;
    if (seen.has(val)) return true;
    seen.add(val);
    if (Array.isArray(val)) {
      return val.some((item) => walk(item));
    }
    for (const key of Object.keys(val)) {
      if (walk(val[key])) return true;
    }
    return false;
  };
  return walk(input);
}

function fallbackClone(input) {
  const seen = new WeakMap();
  const walk = (val, path) => {
    if (val === null || typeof val !== 'object') {
      if (typeof val === 'function') return '[Function]';
      return val;
    }
    if (isDomLike(val)) return `[HTMLElement: ${val.tagName}]`;
    if (seen.has(val)) return `[Circular →${seen.get(val)}]`;
    seen.set(val, path);
    if (Array.isArray(val)) {
      return val.map((item, i) => walk(item, `${path}[${i}]`));
    }
    const out = {};
    for (const key of Object.keys(val)) {
      out[key] = walk(val[key], `${path}.${key}`);
    }
    return out;
  };
  return walk(input, '$');
}

export function safeClone(input) {
  if (hasProblematicContent(input)) {
    return { value: fallbackClone(input), mode: 'fallback' };
  }
  try {
    return { value: structuredClone(input), mode: 'structuredClone' };
  } catch {
    return { value: fallbackClone(input), mode: 'fallback' };
  }
}
