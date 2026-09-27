import { describe, expect, it } from 'vitest';
import { code128Modules, code128Patterns, code128Values } from './code128';

describe('Code 128', () => {
  it('has 107 patterns of 11 modules (stop has 13)', () => {
    expect(code128Patterns).toHaveLength(107);
    code128Patterns.forEach((p, i) => {
      const sum = [...p].reduce((a, d) => a + Number(d), 0);
      expect(sum).toBe(i === 106 ? 13 : 11);
    });
  });
  it('has no duplicate patterns', () => {
    expect(new Set(code128Patterns).size).toBe(107);
  });
  it('computes the checksum for set B', () => {
    // "PJJ123C": 104 + 48×1 + 42×2 + 42×3 + 17×4 + 18×5 + 19×6 + 35×7 = 879; 879 mod 103 = 55.
    const v = code128Values('PJJ123C');
    expect(v.at(0)).toBe(104);
    expect(v.at(-2)).toBe(55);
    expect(v.at(-1)).toBe(106);
  });
  it('encodes an order number with a hyphen', () => {
    const m = code128Modules('AF-2026-01482');
    // start + 13 characters + checksum = 15 symbols of 11 modules, plus 13 for stop
    expect(m.reduce((a, b) => a + b, 0)).toBe(15 * 11 + 13);
  });
});
