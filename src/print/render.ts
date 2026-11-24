import QRCode from 'qrcode';
import { appBaseUrl } from '../config';
import { type Card } from '../deck/cards';
import { h } from '../dom';
import { cardUrl } from '../payload';
import { COLS, duplexSheets, PER_PAGE, ROWS, type Sheet } from './layout';

// Physical layout in millimetres (A4 portrait, 6.5 cm cards).
const PAGE_W = 210;
const PAGE_H = 297;
const CARD = 65;
const LEFT = (PAGE_W - COLS * CARD) / 2;
const TOP = (PAGE_H - ROWS * CARD) / 2;
const MARK_LEN = 5;
const MARK_GAP = 1.5;

function cropMarks(): HTMLElement[] {
  const marks: HTMLElement[] = [];
  const line = (x: number, y: number, w: number, hgt: number) =>
    h('div', { class: 'crop', style: { left: `${x}mm`, top: `${y}mm`, width: `${w}mm`, height: `${hgt}mm` } });
  for (let c = 0; c <= COLS; c++) {
    const x = LEFT + c * CARD;
    marks.push(line(x, TOP - MARK_GAP - MARK_LEN, 0, MARK_LEN));
    marks.push(line(x, TOP + ROWS * CARD + MARK_GAP, 0, MARK_LEN));
  }
  for (let r = 0; r <= ROWS; r++) {
    const y = TOP + r * CARD;
    marks.push(line(LEFT - MARK_GAP - MARK_LEN, y, MARK_LEN, 0));
    marks.push(line(LEFT + COLS * CARD + MARK_GAP, y, MARK_LEN, 0));
  }
  return marks;
}

function sheetElement<T>(sheet: Sheet<T>, renderSlot: (item: T, side: Sheet<T>['side']) => HTMLElement): HTMLElement {
  const grid = h('div', {
    class: 'grid',
    style: {
      left: `${LEFT}mm`,
      top: `${TOP}mm`,
      gridTemplateColumns: `repeat(${COLS}, ${CARD}mm)`,
      gridTemplateRows: `repeat(${ROWS}, ${CARD}mm)`,
    },
  });
  for (const item of sheet.slots) {
    grid.append(item == null ? h('div', { class: 'card empty' }) : renderSlot(item, sheet.side));
  }
  return h('section', { class: `sheet ${sheet.side}` }, ...cropMarks(), grid);
}

/** `color` is the deck's print color, drawn as a stripe along the top of every card. */
export async function renderDeck(cards: Card[], deckName: string, color: string): Promise<HTMLElement[]> {
  const base = appBaseUrl();
  const qr = new Map<string, string>();
  await Promise.all(
    cards.map(async (c) => {
      qr.set(c.trackId, await QRCode.toString(cardUrl(c.trackId, base), { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }));
    }),
  );
  const sheets = duplexSheets(cards).map((sheet) =>
    sheetElement(sheet, (card, side) => {
      if (side === 'front') {
        const code = h('div', { class: 'qr' });
        code.innerHTML = qr.get(card.trackId)!; // SVG generated locally by the qrcode library
        return h('div', { class: 'card filled' }, code, h('div', { class: 'deck-name' }, deckName));
      }
      return h(
        'div',
        { class: 'card filled' },
        h('div', { class: 'artist' }, card.artists),
        h('div', { class: 'year' }, card.year ?? '????'),
        h('div', { class: 'title' }, card.title),
      );
    }),
  );
  for (const s of sheets) s.style.setProperty('--deck-color', color);
  return sheets;
}

/** One duplex sheet with numbered crosshairs; hold it to the light to check front/back alignment. */
export function renderAlignmentTest(): HTMLElement[] {
  const numbers = Array.from({ length: PER_PAGE }, (_, i) => i + 1);
  return duplexSheets(numbers).map((sheet) =>
    sheetElement(sheet, (n, side) =>
      h(
        'div',
        { class: 'card filled test' },
        h('div', { class: 'crosshair' }),
        h('div', { class: 'test-label' }, `${side === 'front' ? 'Front' : 'Back'} ${n}`),
      ),
    ),
  );
}
