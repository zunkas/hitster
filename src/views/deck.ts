import { buildCards, type Card, playlistIdFromInput } from '../deck/cards';
import { h } from '../dom';
import { renderAlignmentTest, renderDeck } from '../print/render';
import { getPlaylist } from '../spotify/api';
import { isLoggedIn } from '../spotify/auth';
import { loginPrompt } from './login-prompt';

const LAST_PLAYLIST = 'lastPlaylist';

export function deckView(root: HTMLElement): void {
  const sheets = h('div', { class: 'sheets' });
  const controls = h('div', { class: 'no-print' });
  root.append(controls, sheets);

  controls.append(h('a', { class: 'back', href: '#/' }, '← Home'), h('h2', {}, 'Make a deck'));
  if (!isLoggedIn()) {
    controls.append(loginPrompt('Log in to read your Spotify playlists.'));
    return;
  }

  const input = h('input', {
    type: 'text',
    placeholder: 'Spotify playlist link',
    value: localStorage.getItem(LAST_PLAYLIST) ?? '',
    autocomplete: 'off',
  });
  const status = h('div', { class: 'status' });
  const result = h('div');
  const loadBtn = h('button', { class: 'primary', type: 'submit' }, 'Load playlist');

  const form = h(
    'form',
    {
      class: 'row',
      onsubmit: async (e: Event) => {
        e.preventDefault();
        const id = playlistIdFromInput(input.value);
        if (!id) {
          status.textContent = 'That doesn’t look like a Spotify playlist link.';
          return;
        }
        localStorage.setItem(LAST_PLAYLIST, input.value.trim());
        loadBtn.disabled = true;
        status.textContent = 'Loading playlist…';
        result.replaceChildren();
        sheets.replaceChildren();
        try {
          const playlist = await getPlaylist(id);
          const cards = buildCards(playlist.tracks);
          status.textContent = '';
          showResult(result, sheets, playlist.name, cards, playlist.tracks.length);
        } catch (err) {
          status.textContent = `Couldn’t load the playlist: ${(err as Error).message}. Only playlists you own or collaborate on may be readable.`;
        } finally {
          loadBtn.disabled = false;
        }
      },
    },
    input,
    loadBtn,
  );

  const testBtn = h(
    'button',
    {
      onclick: () => {
        result.replaceChildren(
          h('p', {}, 'Print this one sheet double-sided (flip on long edge, 100% scale). Hold it to the light: each crosshair should line up with the one on the back.'),
          h('button', { class: 'primary', onclick: () => window.print() }, 'Print alignment test'),
        );
        sheets.replaceChildren(...renderAlignmentTest());
      },
    },
    'Alignment test page',
  );

  controls.append(form, status, h('div', { class: 'row' }, testBtn), result);
}

async function showResult(result: HTMLElement, sheets: HTMLElement, name: string, cards: Card[], total: number) {
  const skipped = total - cards.length;
  const flagged = cards.filter((c) => c.suspicious || c.year == null);
  const pages = Math.ceil(cards.length / 12) * 2;

  result.append(
    h('h3', {}, name),
    h(
      'p',
      {},
      `${cards.length} cards on ${pages} pages`,
      skipped ? ` (${skipped} local, unavailable or duplicate tracks skipped)` : '',
      '. Print double-sided, flip on long edge, 100% scale.',
    ),
  );

  if (flagged.length) {
    result.append(
      h('h4', {}, `⚠ ${flagged.length} cards may have the wrong year`),
      h('p', { class: 'hint' }, 'Spotify gives the year of this release. Consider swapping these for the original release in the playlist, then reload.'),
      h(
        'table',
        { class: 'warnings' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Year'), h('th', {}, 'Song'), h('th', {}, 'Why'))),
        h(
          'tbody',
          {},
          ...flagged.map((c) =>
            h(
              'tr',
              {},
              h('td', {}, c.year ?? '—'),
              h('td', {}, `${c.artists} – ${c.title}`),
              h('td', {}, c.year == null ? 'No release year' : c.suspicious),
            ),
          ),
        ),
      ),
    );
  }

  const printBtn = h('button', { class: 'primary', disabled: true, onclick: () => window.print() }, 'Rendering cards…');
  result.append(h('div', { class: 'row' }, printBtn));
  sheets.replaceChildren(...(await renderDeck(cards, name)));
  printBtn.disabled = false;
  printBtn.textContent = `Print ${pages} pages`;
}
