import type { SpotifyTrackLike } from '../deck/cards';
import { fetchWithAuth } from './auth';

export class SpotifyError extends Error {
  constructor(
    public status: number,
    public reason: string | undefined,
    message: string,
    /** e.g. "PUT /me/player/play", for troubleshooting. */
    public endpoint: string,
  ) {
    super(message);
  }
}

/** Pull a readable message out of whatever Spotify sent back with an error. */
export function spotifyErrorMessage(status: number, bodyText: string): { message: string; reason?: string } {
  let body: unknown = null;
  try {
    body = JSON.parse(bodyText);
  } catch {
    /* not JSON */
  }
  const err = (body as { error?: unknown; error_description?: string } | null)?.error;
  if (err && typeof err === 'object') {
    const { message, reason } = err as { message?: string; reason?: string };
    if (message || reason) return { message: message || '(no message)', reason };
  }
  if (typeof err === 'string') return { message: (body as { error_description?: string }).error_description || err };
  const text = bodyText.trim().slice(0, 200);
  return { message: text || `HTTP ${status} with an empty response` };
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetchWithAuth(path, init);
  if (!res.ok) {
    const { message, reason } = spotifyErrorMessage(res.status, await res.text().catch(() => ''));
    throw new SpotifyError(res.status, reason, message, `${init.method ?? 'GET'} ${path.split('?')[0]}`);
  }
  return parseResponseBody<T>(await res.text(), init.method ?? 'GET');
}

/**
 * Data requests (GET) must return JSON. Commands (PUT/POST: play, pause, seek…) return
 * nothing useful, and Spotify sometimes sends a plain-text ID back, so ignore their body.
 */
export function parseResponseBody<T>(text: string, method: string): T {
  if (method.toUpperCase() !== 'GET') return null as T;
  return (text ? JSON.parse(text) : null) as T;
}

interface Page<T> {
  items: T[];
  next: string | null;
}

/** Older API returns `track`, newer returns `item`. */
interface PlaylistEntry {
  track?: SpotifyTrackLike | null;
  item?: SpotifyTrackLike | null;
}

async function playlistEntries(id: string, endpoint: 'items' | 'tracks'): Promise<PlaylistEntry[]> {
  const entries: PlaylistEntry[] = [];
  let path: string | null = `/playlists/${id}/${endpoint}?limit=50&market=from_token`;
  while (path) {
    const page: Page<PlaylistEntry> = await call(path);
    entries.push(...page.items);
    path = page.next ? page.next.replace('https://api.spotify.com/v1', '') : null;
  }
  return entries;
}

export async function getPlaylist(id: string): Promise<{ name: string; tracks: (SpotifyTrackLike | null)[] }> {
  const meta = await call<{ name: string }>(`/playlists/${id}?fields=name`);
  let entries: PlaylistEntry[];
  try {
    entries = await playlistEntries(id, 'items');
  } catch (e) {
    if (!(e instanceof SpotifyError) || e.status !== 404) throw e;
    entries = await playlistEntries(id, 'tracks');
  }
  return { name: meta.name, tracks: entries.map((e) => e.item ?? e.track ?? null) };
}

export interface Device {
  id: string | null;
  name: string;
  type: string;
  is_active: boolean;
  is_restricted: boolean;
}

export async function getAccountName(): Promise<string> {
  const me = await call<{ display_name: string | null; id: string }>('/me');
  return me.display_name || me.id;
}

/** All devices with an ID, including restricted ones (which reject Web API commands). */
export async function getDevices(): Promise<Device[]> {
  const res = await call<{ devices: Device[] }>('/me/player/devices');
  return res.devices.filter((d) => d.id);
}

export async function getTrackDuration(trackId: string): Promise<number | null> {
  try {
    const t = await call<{ duration_ms: number }>(`/tracks/${trackId}`);
    return t.duration_ms;
  } catch {
    return null;
  }
}

export async function play(trackId: string, deviceId: string, positionMs: number): Promise<void> {
  await call(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uris: [`spotify:track:${trackId}`], position_ms: positionMs }),
  });
}

/** Make a device the active one (wakes up idle phone apps before playing). */
export async function transferPlayback(deviceId: string): Promise<void> {
  await call('/me/player', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_ids: [deviceId], play: false }),
  });
}

export interface PlaybackState {
  progress_ms: number | null;
  item: { id: string; linked_from?: { id: string } } | null;
}

/** Current playback, or null when nothing is playing. Used only internally — never shown. */
export async function getPlaybackState(): Promise<PlaybackState | null> {
  return call<PlaybackState | null>('/me/player?market=from_token');
}

export async function seek(positionMs: number, deviceId: string): Promise<void> {
  await call(`/me/player/seek?position_ms=${Math.round(positionMs)}&device_id=${encodeURIComponent(deviceId)}`, {
    method: 'PUT',
  });
}

export async function pause(deviceId: string): Promise<void> {
  await call(`/me/player/pause?device_id=${encodeURIComponent(deviceId)}`, { method: 'PUT' });
}

export async function resume(deviceId: string): Promise<void> {
  await call(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, { method: 'PUT' });
}
