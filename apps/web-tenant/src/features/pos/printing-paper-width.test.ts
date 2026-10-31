import { describe, expect, it } from 'vitest';
import { formatThermalContent, getPaperWidth } from './printing-paper-width';

describe('printing paper width', () => {
  it('preserves the historical 58 mm fallback when a persisted value is absent', () => {
    expect(getPaperWidth(null)).toBe(58);
    expect(getPaperWidth({ paperWidth: undefined })).toBe(58);
  });

  it('uses the persisted width of each printer independently', () => {
    expect(getPaperWidth({ paperWidth: 58 })).toBe(58);
    expect(getPaperWidth({ paperWidth: 80 })).toBe(80);
  });

  it('formats 58 mm and 80 mm tickets with different line widths without dropping content', () => {
    const content = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJK';
    const narrow = formatThermalContent(content, 58);
    const wide = formatThermalContent(content, 80);
    expect(narrow).not.toBe(wide);
    expect(narrow.replace(/\n/g, '')).toBe(content);
    expect(wide.replace(/\n/g, '')).toBe(content);
    expect(narrow.split('\n').every((line) => line.length <= 32)).toBe(true);
    expect(wide.split('\n').every((line) => line.length <= 48)).toBe(true);
  });
});
