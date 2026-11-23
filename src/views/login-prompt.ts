import { SPOTIFY_CLIENT_ID } from '../config';
import { h } from '../dom';
import { login } from '../spotify/auth';

/** Shown instead of a view when the host isn't logged in to Spotify. */
export function loginPrompt(message = 'Log in with the Spotify Premium account that will play the songs.'): HTMLElement {
  if (!SPOTIFY_CLIENT_ID) {
    return h(
      'div',
      { class: 'panel error' },
      h('p', {}, 'The Spotify client ID is missing. Set VITE_SPOTIFY_CLIENT_ID (see README) and rebuild.'),
    );
  }
  return h(
    'div',
    { class: 'panel' },
    h('p', {}, message),
    h('button', { class: 'big primary', onclick: () => login() }, 'Log in with Spotify'),
  );
}
