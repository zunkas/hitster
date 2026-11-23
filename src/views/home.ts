import { GAME_NAME } from '../config';
import { h } from '../dom';
import { isLoggedIn, logout } from '../spotify/auth';
import { loginPrompt } from './login-prompt';

export function homeView(root: HTMLElement): void {
  root.append(
    h('h1', { class: 'logo' }, GAME_NAME),
    h('p', { class: 'tagline' }, 'Scan a card, hear the song, place it on your timeline.'),
  );
  if (!isLoggedIn()) {
    root.append(loginPrompt());
    return;
  }
  root.append(
    h(
      'nav',
      { class: 'menu' },
      h('a', { class: 'big primary', href: '#/play' }, '▶  Play'),
      h('a', { class: 'big', href: '#/deck' }, '🖨  Make a deck'),
    ),
    h(
      'button',
      {
        class: 'link',
        onclick: () => {
          logout();
          location.reload();
        },
      },
      'Log out of Spotify',
    ),
  );
}
