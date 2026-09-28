import { describe, expect, it } from 'vitest';
import { buildXlsx, crc32 } from './xlsx';

describe('xlsx', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('writes a zip with the workbook parts and escaped cells', () => {
    const bytes = buildXlsx({ name: 'Sales', columns: [{ label: 'Name', kind: 'text' }, { label: 'Net', kind: 'money' }], rows: [['A & <B>', 12.5]], totals: ['', 12.5] });
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('xl/worksheets/sheet1.xml');
    expect(text).toContain('A &amp; &lt;B&gt;');
    expect(text).toContain('<v>12.5</v>');
    expect([...bytes.slice(-22, -18)]).toEqual([0x50, 0x4b, 0x05, 0x06]);
  });
});
