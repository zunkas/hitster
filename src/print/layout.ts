export const COLS = 3;
export const ROWS = 4;
export const PER_PAGE = COLS * ROWS;

export interface Sheet<T> {
  side: 'front' | 'back';
  /** Row-major, always PER_PAGE long; null = empty slot. */
  slots: (T | null)[];
}

/**
 * Lay cards out for duplex printing with a long-edge flip on portrait paper:
 * each front sheet is followed by its back sheet, whose columns are mirrored so
 * every back lands behind its own front.
 */
export function duplexSheets<T>(cards: T[]): Sheet<T>[] {
  const sheets: Sheet<T>[] = [];
  for (let i = 0; i < cards.length; i += PER_PAGE) {
    const front: (T | null)[] = cards.slice(i, i + PER_PAGE);
    while (front.length < PER_PAGE) front.push(null);
    sheets.push({ side: 'front', slots: front });
    sheets.push({ side: 'back', slots: mirrorColumns(front) });
  }
  return sheets;
}

export function mirrorColumns<T>(slots: T[]): T[] {
  return slots.map((_, i) => {
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    return slots[row * COLS + (COLS - 1 - col)];
  });
}
