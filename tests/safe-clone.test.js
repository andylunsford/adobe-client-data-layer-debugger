import { describe, it, expect } from 'vitest';
import { safeClone } from '../src/lib/safe-clone.js';

describe('safeClone', () => {
  it('clones primitives via structuredClone', () => {
    const r = safeClone(42);
    expect(r).toEqual({ value: 42, mode: 'structuredClone' });
  });

  it('deep clones nested objects via structuredClone', () => {
    const input = { a: { b: [1, 2, { c: 'x' }] } };
    const r = safeClone(input);
    expect(r.mode).toBe('structuredClone');
    expect(r.value).toEqual(input);
    expect(r.value).not.toBe(input);
    expect(r.value.a).not.toBe(input.a);
  });

  it('falls back when value contains a function', () => {
    const input = { id: 1, onClick: () => {} };
    const r = safeClone(input);
    expect(r.mode).toBe('fallback');
    expect(r.value).toEqual({ id: 1, onClick: '[Function]' });
  });

  it('falls back on circular references with [Circular →path]', () => {
    const a = { name: 'a' };
    a.self = a;
    const r = safeClone(a);
    expect(r.mode).toBe('fallback');
    expect(r.value.name).toBe('a');
    expect(r.value.self).toBe('[Circular →$]');
  });

  it('falls back for DOM-like nodes with [HTMLElement: <tag>]', () => {
    const fakeNode = { nodeType: 1, tagName: 'DIV' };
    const r = safeClone({ el: fakeNode });
    expect(r.mode).toBe('fallback');
    expect(r.value.el).toBe('[HTMLElement: DIV]');
  });

  it('returns null when input is null', () => {
    expect(safeClone(null)).toEqual({ value: null, mode: 'structuredClone' });
  });
});
