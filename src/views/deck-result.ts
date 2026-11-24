import {
  applyYearOverrides,
  type Card,
  decadeCounts,
  decadeOf,
  needsAttention,
  sortByYear,
  type YearOverrides,
} from '../deck/cards';
import { DECK_PALETTE, type DeckColor, loadDeckColor, loadYearOverrides, saveDeckColor, setYearOverride } from '../deck/deck-store';
import { h } from '../dom';
import { renderDeck } from '../print/render';

const MIN_YEAR = 1900;
const RERENDER_DELAY_MS = 400;

/** undefined = no filter, null = the "Unknown" bucket, number = a decade like 1970. */
type DecadeFilter = number | null | undefined;

/**
 * The loaded-playlist part of the deck page: summary and deck color, year spread chart,
 * editable year table, and the printable sheets.
 */
export function showResult(
  result: HTMLElement,
  sheets: HTMLElement,
  playlistId: string,
  name: string,
  baseCards: Card[],
  totalTracks: number,
): void {
  let overrides: YearOverrides = loadYearOverrides();
  let color: DeckColor = loadDeckColor(playlistId);
  let showAll = false;
  let decadeFilter: DecadeFilter;

  const cards = () => applyYearOverrides(baseCards, overrides);
  const pages = Math.ceil(baseCards.length / 12) * 2;
  const skipped = totalTracks - baseCards.length;

  // ---- Summary and deck color ----
  const swatches = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Deck color' });
  function renderSwatches(): void {
    swatches.replaceChildren(
      ...DECK_PALETTE.map((c) =>
        h(
          'button',
          {
            class: `swatch${c.name === color.name ? ' selected' : ''}`,
            role: 'radio',
            'aria-checked': String(c.name === color.name),
            onclick: () => {
              color = c;
              saveDeckColor(playlistId, c);
              renderSwatches();
              renderChart();
              scheduleSheets(0);
            },
          },
          h('span', { class: 'chip', style: { background: c.screen } }),
          c.name,
        ),
      ),
    );
  }

  // ---- Year spread chart ----
  const chart = h('div', { class: 'decades' });
  function renderChart(): void {
    const counts = decadeCounts(cards());
    const max = Math.max(1, ...counts.map((c) => c.count));
    chart.replaceChildren(
      ...counts.map((bucket) => {
        const active = decadeFilter !== undefined && decadeFilter === bucket.decade;
        const dimmed = decadeFilter !== undefined && !active;
        return h(
          'button',
          {
            class: `decade${active ? ' active' : ''}${dimmed ? ' dimmed' : ''}`,
            title: `${bucket.label}: ${bucket.count} ${bucket.count === 1 ? 'card' : 'cards'}. Click to list them.`,
            'aria-pressed': String(active),
            onclick: () => {
              decadeFilter = active ? undefined : bucket.decade;
              renderChart();
              renderTable();
            },
          },
          h('span', { class: 'decade-label' }, bucket.label),
          h(
            'span',
            { class: 'decade-track' },
            bucket.count
              ? h('span', {
                  class: 'decade-bar',
                  style: {
                    width: `${(bucket.count / max) * 100}%`,
                    background: bucket.decade == null ? 'var(--muted)' : color.screen,
                  },
                })
              : null,
          ),
          h('span', { class: 'decade-count' }, bucket.count),
        );
      }),
    );
  }

  // ---- Year table ----
  const heading = h('h4');
  const showAllBox = h('input', { type: 'checkbox' });
  showAllBox.addEventListener('change', () => {
    showAll = showAllBox.checked;
    renderTable();
  });
  const filterNote = h('p', { class: 'filter-note' });
  const tbody = h('tbody');

  function renderHeading(): void {
    const attention = cards().filter(needsAttention).length;
    heading.textContent = attention ? `⚠ ${attention} cards may have the wrong year` : '✓ No years need checking';
  }

  function reason(card: Card): string {
    if (card.yearEdited) return `Edited (Spotify says ${card.spotifyYear ?? 'nothing'})`;
    if (card.year == null) return 'No release year';
    return card.suspicious ?? '';
  }

  function visibleCards(): Card[] {
    const all = cards();
    if (decadeFilter === null) return all.filter((c) => c.year == null);
    if (decadeFilter !== undefined) return all.filter((c) => c.year != null && decadeOf(c.year) === decadeFilter);
    return showAll ? all : all.filter((c) => needsAttention(c) || c.yearEdited);
  }

  function renderTable(): void {
    renderHeading();
    showAllBox.disabled = decadeFilter !== undefined;
    filterNote.replaceChildren(
      ...(decadeFilter === undefined
        ? []
        : [
            `Showing every song from ${decadeFilter === null ? 'unknown years' : `the ${decadeFilter}s`}. `,
            h(
              'button',
              {
                class: 'link inline',
                onclick: () => {
                  decadeFilter = undefined;
                  renderChart();
                  renderTable();
                },
              },
              'Clear filter',
            ),
          ]),
    );
    const rows = sortByYear(visibleCards()).map(renderRow);
    tbody.replaceChildren(
      ...(rows.length ? rows : [h('tr', {}, h('td', { colSpan: 4, class: 'hint' }, 'Nothing to check here. Tick “Show all songs” to edit any year.'))]),
    );
  }

  function renderRow(card: Card): HTMLTableRowElement {
    const why = h('td', {}, reason(card));
    const resetCell = h('td');
    const row = h('tr', { class: card.yearEdited ? 'edited' : '' });
    const input = h('input', {
      type: 'number',
      class: 'year-input',
      min: String(MIN_YEAR),
      max: String(new Date().getFullYear()),
      value: card.year == null ? '' : String(card.year),
      placeholder: '????',
      'aria-label': `Year for ${card.artists} – ${card.title}`,
    });

    const showReset = (edited: boolean) =>
      resetCell.replaceChildren(
        ...(edited
          ? [
              h(
                'button',
                {
                  class: 'icon small',
                  title: 'Use Spotify’s year again',
                  onclick: () => {
                    overrides = setYearOverride(card.trackId, null);
                    afterEdit();
                    renderTable();
                  },
                },
                '↺',
              ),
            ]
          : []),
      );
    showReset(Boolean(card.yearEdited));

    input.addEventListener('input', () => {
      const value = input.value.trim();
      if (!/^\d{4}$/.test(value)) return; // ignore partial input like "19"
      const year = Number(value);
      const valid = year >= MIN_YEAR && year <= new Date().getFullYear();
      input.classList.toggle('invalid', !valid);
      if (!valid) return;
      const spotifyYear = card.yearEdited ? card.spotifyYear : card.year;
      // Typing Spotify's own year back in is the same as resetting.
      overrides = setYearOverride(card.trackId, year === spotifyYear ? null : year);
      const updated = cards().find((c) => c.trackId === card.trackId)!;
      row.classList.toggle('edited', Boolean(updated.yearEdited));
      why.textContent = reason(updated);
      showReset(Boolean(updated.yearEdited));
      afterEdit();
    });

    row.append(h('td', {}, input), h('td', {}, `${card.artists} – ${card.title}`), why, resetCell);
    return row;
  }

  /** Re-render what depends on years, without rebuilding the table (keeps focus while typing). */
  function afterEdit(): void {
    renderHeading();
    renderChart();
    scheduleSheets(RERENDER_DELAY_MS);
  }

  // ---- Printable sheets ----
  const printBtn = h('button', { class: 'primary', onclick: () => window.print() });
  let timer: ReturnType<typeof setTimeout> | undefined;
  let renderSeq = 0;
  function scheduleSheets(delay: number): void {
    printBtn.disabled = true;
    printBtn.textContent = 'Updating cards…';
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const seq = ++renderSeq;
      const rendered = await renderDeck(cards(), name, color.print);
      if (seq !== renderSeq) return; // a newer render started meanwhile
      sheets.replaceChildren(...rendered);
      printBtn.disabled = false;
      printBtn.textContent = `Print ${pages} pages`;
    }, delay);
  }

  result.replaceChildren(
    h('h3', {}, name),
    h(
      'p',
      {},
      `${baseCards.length} cards on ${pages} pages`,
      skipped ? ` (${skipped} local, unavailable or duplicate tracks skipped)` : '',
      '. Print double-sided, flip on long edge, 100% scale.',
    ),
    h('div', { class: 'color-row' }, h('span', { class: 'hint' }, 'Deck color:'), swatches),
    h('h4', {}, 'Year spread'),
    h('p', { class: 'hint' }, 'Cards per decade. Click a decade to list its songs.'),
    chart,
    heading,
    h('p', { class: 'hint' }, 'Spotify gives the year of this release, so remasters and compilations are often wrong. Type the original year; fixes are remembered for this song in every deck.'),
    h('label', { class: 'radio' }, showAllBox, 'Show all songs'),
    filterNote,
    h(
      'table',
      { class: 'warnings' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Year'), h('th', {}, 'Song'), h('th', {}, 'Why'), h('th', {}))),
      tbody,
    ),
    h('div', { class: 'row' }, printBtn),
  );
  renderSwatches();
  renderChart();
  renderTable();
  scheduleSheets(0);
}
