import type { SpotifyTrackLike } from '../deck/cards';
import { fetchWithAuth } from './auth';

export class SpotifyError extends Error {
  constructor(
    public status: number,
    public reason: string | undefined,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetchWithAuth(path, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new SpotifyError(res.status, body?.error?.reason, body?.error?.message ?? res.statusText);
  }
  const text = await res.text();
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

export async function getDevices(): Promise<Device[]> {
  const res = await call<{ devices: Device[] }>('/me/player/devices');
  return res.devices.filter((d) => d.id && !d.is_restricted);
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

export async function pause(deviceId: string): Promise<void> {
  await call(`/me/player/pause?device_id=${encodeURIComponent(deviceId)}`, { method: 'PUT' });
}

export async function resume(deviceId: string): Promise<void> {
  await call(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, { method: 'PUT' });
}
