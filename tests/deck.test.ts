import { describe, expect, it } from 'vitest';
import { applyYearOverrides, type Card, decadeCounts, needsAttention, sortByYear } from '../src/deck/cards';
import { DECK_PALETTE, defaultDeckColor } from '../src/deck/deck-store';

const card = (trackId: string, year: number | null, suspicious: string | null = null): Card => ({
  trackId,
  title: trackId,
  artists: 'A',
  year,
  suspicious,
});

describe('applyYearOverrides', () => {
  it('sets the corrected year and remembers Spotify’s', () => {
    const [fixed, other] = applyYearOverrides([card('a', 2011, 'Remastered'), card('b', 1980)], { a: 1975 });
    expect(fixed).toMatchObject({ year: 1975, yearEdited: true, spotifyYear: 2011, suspicious: 'Remastered' });
    expect(other).toEqual(card('b', 1980));
  });
  it('changes nothing without overrides', () => {
    const cards = [card('a', 2011)];
    expect(applyYearOverrides(cards, {})).toEqual(cards);
  });
  it('edited cards no longer need attention', () => {
    const [fixed] = applyYearOverrides([card('a', 2011, 'Remastered')], { a: 1975 });
    expect(needsAttention(card('a', 2011, 'Remastered'))).toBe(true);
    expect(needsAttention(card('b', null))).toBe(true);
    expect(needsAttention(card('c', 1990))).toBe(false);
    expect(needsAttention(fixed)).toBe(false);
  });
});

describe('decadeCounts', () => {
  it('buckets by decade, fills gaps and counts unknown years last', () => {
    const cards = [card('a', 1975), card('b', 1979), card('c', 2001), card('d', null)];
    expect(decadeCounts(cards)).toEqual([
      { decade: 1970, label: '1970s', count: 2 },
      { decade: 1980, label: '1980s', count: 0 },
      { decade: 1990, label: '1990s', count: 0 },
      { decade: 2000, label: '2000s', count: 1 },
      { decade: null, label: 'Unknown', count: 1 },
    ]);
  });
  it('handles empty decks and decks without years', () => {
    expect(decadeCounts([])).toEqual([]);
    expect(decadeCounts([card('a', null)])).toEqual([{ decade: null, label: 'Unknown', count: 1 }]);
  });
});

describe('sortByYear', () => {
  it('sorts oldest first with missing years last, without mutating', () => {
    const cards = [card('a', 2000), card('b', null), card('c', 1960), card('d', 2000)];
    expect(sortByYear(cards).map((c) => c.trackId)).toEqual(['c', 'a', 'd', 'b']);
    expect(cards.map((c) => c.trackId)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('defaultDeckColor', () => {
  it('is deterministic and always a palette color', () => {
    for (const id of ['37i9dQZF1DXcBWIGoYBM5M', '0CA6PjGJPN4rSJFStAZRGx', 'x']) {
      expect(defaultDeckColor(id)).toBe(defaultDeckColor(id));
      expect(DECK_PALETTE).toContain(defaultDeckColor(id));
    }
  });
});
