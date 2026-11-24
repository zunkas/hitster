import { appBaseUrl, SPOTIFY_CLIENT_ID } from '../config';
import { codeChallenge, randomString } from './pkce';

const SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-read-playback-state',
  'user-modify-playback-state',
  // Needed by the Web Playback SDK (playing in a desktop browser tab).
  'streaming',
  'user-read-email',
  'user-read-private',
].join(' ');

const TOKEN_KEY = 'spotifyToken';
const VERIFIER_KEY = 'pkceVerifier';
const STATE_KEY = 'pkceState';
const RETURN_KEY = 'returnTo';

interface StoredToken {
  access_token: string;
  refresh_token: string;
  /** Granted scopes; missing on tokens saved by older versions of the app. */
  scope?: string;
  expires_at: number;
}

function readToken(): StoredToken | null {
  try {
    return JSON.parse(localStorage.getItem(TOKEN_KEY) ?? 'null');
  } catch {
    return null;
  }
}

function saveToken(res: { access_token: string; refresh_token?: string; expires_in: number; scope?: string }): void {
  const prev = readToken();
  const token: StoredToken = {
    access_token: res.access_token,
    refresh_token: res.refresh_token ?? prev?.refresh_token ?? '',
    expires_at: Date.now() + res.expires_in * 1000,
    scope: res.scope ?? prev?.scope,
  };
  localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
}

export function isLoggedIn(): boolean {
  return readToken() != null;
}

export function logout(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/** Redirect to Spotify's login page. `returnTo` is the hash route to come back to. */
export async function login(returnTo = location.hash): Promise<void> {
  if (!SPOTIFY_CLIENT_ID) throw new Error('VITE_SPOTIFY_CLIENT_ID is not set');
  const verifier = randomString(64);
  const state = randomString(16);
  localStorage.setItem(VERIFIER_KEY, verifier);
  localStorage.setItem(STATE_KEY, state);
  localStorage.setItem(RETURN_KEY, returnTo);
  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: appBaseUrl(),
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: await codeChallenge(verifier),
    state,
  });
  location.assign(`https://accounts.spotify.com/authorize?${params}`);
}

async function tokenRequest(body: Record<string, string>): Promise<void> {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: SPOTIFY_CLIENT_ID, ...body }),
  });
  if (!res.ok) throw new Error(`Spotify login failed (${res.status})`);
  saveToken(await res.json());
}

/**
 * If the page was opened as the OAuth redirect (?code=…), finish the login and
 * restore the URL. Returns an error message if login failed.
 */
export async function handleRedirect(): Promise<string | null> {
  const params = new URLSearchParams(location.search);
  if (!params.has('code') && !params.has('error')) return null;
  const returnTo = localStorage.getItem(RETURN_KEY) || '#/';
  const cleanUrl = appBaseUrl() + returnTo;
  try {
    if (params.get('error')) return `Spotify login was cancelled (${params.get('error')})`;
    if (params.get('state') !== localStorage.getItem(STATE_KEY)) return 'Login state mismatch, try again';
    await tokenRequest({
      grant_type: 'authorization_code',
      code: params.get('code')!,
      redirect_uri: appBaseUrl(),
      code_verifier: localStorage.getItem(VERIFIER_KEY) ?? '',
    });
    return null;
  } catch (e) {
    return (e as Error).message;
  } finally {
    [VERIFIER_KEY, STATE_KEY, RETURN_KEY].forEach((k) => localStorage.removeItem(k));
    history.replaceState(null, '', cleanUrl);
  }
}

let refreshing: Promise<void> | null = null;

async function refresh(): Promise<void> {
  const token = readToken();
  if (!token?.refresh_token) throw new NotLoggedInError();
  refreshing ??= tokenRequest({ grant_type: 'refresh_token', refresh_token: token.refresh_token })
    .catch((e) => {
      logout();
      throw e;
    })
    .finally(() => (refreshing = null));
  return refreshing;
}

export class NotLoggedInError extends Error {
  constructor() {
    super('Not logged in to Spotify');
  }
}

/** True if the current login granted all of these scopes (otherwise log in again). */
export function hasScopes(...scopes: string[]): boolean {
  const granted = new Set((readToken()?.scope ?? '').split(' '));
  return scopes.every((s) => granted.has(s));
}

export async function accessToken(): Promise<string> {
  let token = readToken();
  if (!token) throw new NotLoggedInError();
  if (token.expires_at - Date.now() < 60_000) {
    await refresh();
    token = readToken()!;
  }
  return token.access_token;
}

/** fetch() against the Spotify Web API with auth; refreshes and retries once on 401. */
export async function fetchWithAuth(path: string, init: RequestInit = {}): Promise<Response> {
  const go = async () =>
    fetch(`https://api.spotify.com/v1${path}`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${await accessToken()}` },
    });
  let res = await go();
  if (res.status === 401) {
    await refresh();
    res = await go();
  }
  return res;
}
