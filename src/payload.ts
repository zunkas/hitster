import { CARD_KEY } from './config';

const TRACK_ID = /^[A-Za-z0-9]{22}$/;

function xor(bytes: Uint8Array, key: string): Uint8Array {
  const k = new TextEncoder().encode(key);
  return bytes.map((b, i) => b ^ k[i % k.length]);
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** Scramble a Spotify track ID into the opaque code printed on a card. */
export function encodeCard(trackId: string, key = CARD_KEY): string {
  if (!TRACK_ID.test(trackId)) throw new Error(`Not a Spotify track ID: ${trackId}`);
  return toBase64Url(xor(new TextEncoder().encode(trackId), key));
}

/** Reverse of encodeCard. Returns null for anything that isn't a valid card code. */
export function decodeCard(code: string, key = CARD_KEY): string | null {
  const bytes = fromBase64Url(code);
  if (!bytes) return null;
  const id = new TextDecoder().decode(xor(bytes, key));
  return TRACK_ID.test(id) ? id : null;
}

/** URL encoded in the QR code. `appBase` must end with a slash. */
export function cardUrl(trackId: string, appBase: string, key = CARD_KEY): string {
  return `${appBase}#/play?c=${encodeCard(trackId, key)}`;
}

/**
 * Extract a track ID from whatever a QR code contained: one of our card URLs,
 * an open.spotify.com track link, or a spotify:track: URI.
 */
export function trackIdFromScan(text: string, key = CARD_KEY): string | null {
  const t = text.trim();
  const uri = /^spotify:track:([A-Za-z0-9]{22})$/.exec(t);
  if (uri) return uri[1];
  let url: URL;
  try {
    url = new URL(t);
  } catch {
    return null;
  }
  if (url.hostname === 'open.spotify.com') {
    const m = /\/track\/([A-Za-z0-9]{22})/.exec(url.pathname);
    return m ? m[1] : null;
  }
  const hashQuery = url.hash.split('?')[1];
  const code = hashQuery ? new URLSearchParams(hashQuery).get('c') : null;
  return code ? decodeCard(code, key) : null;
}
