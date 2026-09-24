import { describe, it, expect } from 'vitest';
import { makePageLoadId } from '../src/lib/ids.js';

describe('makePageLoadId', () => {
  it('returns a string with the pl_ prefix', () => {
    const id = makePageLoadId();
    expect(id.startsWith('pl_')).toBe(true);
  });

  it('produces 10 hex chars after the prefix', () => {
    const id = makePageLoadId();
    expect(id).toMatch(/^pl_[0-9a-f]{10}$/);
  });

  it('produces distinct ids on consecutive calls', () => {
    const ids = new Set();
    for (let i = 0; i < 1000; i++) ids.add(makePageLoadId());
    expect(ids.size).toBe(1000);
  });
});
