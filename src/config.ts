/** Placeholder game name — change it here and in index.html <title>. */
export const GAME_NAME = 'Song Timeline';

/**
 * Key used to scramble track IDs inside the card QR codes so nobody can read the
 * song off a card by accident. Not real security. Changing it invalidates printed cards.
 */
export const CARD_KEY = 'song-timeline-v1';

export const SPOTIFY_CLIENT_ID: string = import.meta.env.VITE_SPOTIFY_CLIENT_ID ?? '';

/** Absolute URL of the app root, e.g. https://user.github.io/hitster/ */
export function appBaseUrl(): string {
  return new URL(import.meta.env.BASE_URL, location.origin).href;
}
