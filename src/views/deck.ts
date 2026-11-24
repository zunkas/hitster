import { buildCards, playlistIdFromInput } from '../deck/cards';
import { h } from '../dom';
import { renderAlignmentTest } from '../print/render';
import { getPlaylist } from '../spotify/api';
import { isLoggedIn } from '../spotify/auth';
import { showResult } from './deck-result';
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
          showResult(result, sheets, id, playlist.name, cards, playlist.tracks.length);
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
