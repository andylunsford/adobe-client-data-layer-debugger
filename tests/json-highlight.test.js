import { describe, expect, it } from 'vitest';
import { highlightJsonTokens } from '../src/lib/json-highlight.js';

describe('highlightJsonTokens', () => {
  it('reassembles to the pretty-printed JSON exactly', () => {
    const value = { a: 'x', n: -1.5e3, ok: true, no: false, nil: null, list: [1, 'two'], nested: { k: 'v' } };
    const text = highlightJsonTokens(value).map(t => t.text).join('');
    expect(text).toBe(JSON.stringify(value, null, 2));
  });

  it('classifies keys, strings, numbers, booleans and null', () => {
    const tokens = highlightJsonTokens({ k: 's', n: 2, b: false, z: null }).filter(t => t.cls);
    expect(tokens).toEqual([
      { text: '"k":', cls: 'jk' }, { text: '"s"', cls: 'js' },
      { text: '"n":', cls: 'jk' }, { text: '2', cls: 'jn' },
      { text: '"b":', cls: 'jk' }, { text: 'false', cls: 'jb' },
      { text: '"z":', cls: 'jk' }, { text: 'null', cls: 'jl' }
    ]);
  });

  it('leaves punctuation and whitespace unclassified', () => {
    const plain = highlightJsonTokens([1]).filter(t => !t.cls).map(t => t.text);
    expect(plain).toEqual(['[\n  ', '\n]']);
  });

  it('keeps markup-like and escaped content as plain text inside a string token', () => {
    const value = { html: '<img src=x onerror="alert(1)"> & "quoted" \\  ' };
    const tokens = highlightJsonTokens(value);
    expect(tokens.find(t => t.cls === 'js').text).toBe(JSON.stringify(value.html));
    expect(tokens.map(t => t.text).join('')).toBe(JSON.stringify(value, null, 2));
  });

  it('does not treat digits or keywords inside strings as separate tokens', () => {
    const tokens = highlightJsonTokens({ s: 'true 42 null' }).filter(t => t.cls);
    expect(tokens).toEqual([{ text: '"s":', cls: 'jk' }, { text: '"true 42 null"', cls: 'js' }]);
  });

  it('handles a bare top-level primitive', () => {
    expect(highlightJsonTokens('hi')).toEqual([{ text: '"hi"', cls: 'js' }]);
    expect(highlightJsonTokens(7)).toEqual([{ text: '7', cls: 'jn' }]);
  });
});
