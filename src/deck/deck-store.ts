import type { YearOverrides } from './cards';

const OVERRIDES_KEY = 'yearOverrides';

export function loadYearOverrides(): YearOverrides {
  try {
    const parsed = JSON.parse(localStorage.getItem(OVERRIDES_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Save a corrected year for a track (shared by all decks), or remove it with null. */
export function setYearOverride(trackId: string, year: number | null): YearOverrides {
  const overrides = loadYearOverrides();
  if (year == null) delete overrides[trackId];
  else overrides[trackId] = year;
  localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
  return overrides;
}

export interface DeckColor {
  name: string;
  /** Used on printed cards (validated against white paper). */
  print: string;
  /** Same hue stepped for the app's dark screen. */
  screen: string;
}

/**
 * Deck colors, checked with the dataviz palette validator: on white, every pair stays
 * distinct for normal and color-blind vision (worst normal ΔE 19.6, CVD ΔE 13).
 * A fifth color always created a hard-to-tell pair, so the set stops at four.
 */
export const DECK_PALETTE: readonly DeckColor[] = [
  { name: 'Blue', print: '#2a78d6', screen: '#3987e5' },
  { name: 'Yellow', print: '#eda100', screen: '#c98500' },
  { name: 'Magenta', print: '#e87ba4', screen: '#d55181' },
  { name: 'Green', print: '#008300', screen: '#0ca30c' },
];

export function defaultDeckColor(playlistId: string): DeckColor {
  let hash = 0;
  for (const ch of playlistId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return DECK_PALETTE[hash % DECK_PALETTE.length];
}

const colorKey = (playlistId: string) => `deckColor:${playlistId}`;

export function loadDeckColor(playlistId: string): DeckColor {
  const saved = localStorage.getItem(colorKey(playlistId));
  return DECK_PALETTE.find((c) => c.name === saved) ?? defaultDeckColor(playlistId);
}

export function saveDeckColor(playlistId: string, color: DeckColor): void {
  localStorage.setItem(colorKey(playlistId), color.name);
}
