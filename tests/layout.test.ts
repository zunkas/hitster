import { describe, expect, it } from 'vitest';
import { duplexSheets, mirrorColumns } from '../src/print/layout';

describe('duplexSheets', () => {
  it('alternates fronts and mirrored backs, padding the last sheet', () => {
    const cards = Array.from({ length: 14 }, (_, i) => i + 1);
    const sheets = duplexSheets(cards);
    expect(sheets.map((s) => s.side)).toEqual(['front', 'back', 'front', 'back']);
    expect(sheets[0].slots).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(sheets[1].slots).toEqual([3, 2, 1, 6, 5, 4, 9, 8, 7, 12, 11, 10]);
    expect(sheets[2].slots).toEqual([13, 14, null, null, null, null, null, null, null, null, null, null]);
    expect(sheets[3].slots).toEqual([null, 14, 13, null, null, null, null, null, null, null, null, null]);
  });

  it('mirroring twice is the identity', () => {
    const slots = Array.from({ length: 12 }, (_, i) => i);
    expect(mirrorColumns(mirrorColumns(slots))).toEqual(slots);
  });

  it('returns no sheets for an empty deck', () => {
    expect(duplexSheets([])).toEqual([]);
  });
});
