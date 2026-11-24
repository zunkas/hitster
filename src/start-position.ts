export type StartMode = 'start' | 'offset' | 'random';

export interface StartSettings {
  mode: StartMode;
  offsetSec: number;
}

export const DEFAULT_START: StartSettings = { mode: 'start', offsetSec: 30 };

/** Keep at least this much of the song left after the start point. */
const TAIL_MS = 20_000;
/** Used for random mode when the track length couldn't be fetched. */
const FALLBACK_RANDOM_MS = 30_000;

/** Where playback should start, in milliseconds. Never past the end of the track. */
export function startPositionMs(
  settings: StartSettings,
  durationMs: number | null,
  rand: () => number = Math.random,
): number {
  const latest = durationMs == null ? Infinity : Math.max(0, durationMs - TAIL_MS);
  switch (settings.mode) {
    case 'start':
      return 0;
    case 'offset':
      return Math.min(Math.max(0, Math.round(settings.offsetSec * 1000)), latest);
    case 'random':
      if (durationMs == null) return FALLBACK_RANDOM_MS;
      return Math.min(Math.floor(durationMs * (0.15 + 0.45 * rand())), latest);
  }
}

/** How far before the wanted start we still accept as "close enough". */
const SEEK_TOLERANCE_MS = 3_000;

export type SeekCheck = 'wait' | 'ok' | 'seek';

/**
 * Some Spotify Connect devices ignore the start position in the play request.
 * Given the reported playback state, decide whether to keep waiting for the card's
 * track to load, accept the position, or seek explicitly.
 */
export function checkStartPosition(
  state: { progress_ms: number | null; item: { id: string; linked_from?: { id: string } } | null } | null,
  trackId: string,
  wantedMs: number,
): SeekCheck {
  const item = state?.item;
  if (!item || (item.id !== trackId && item.linked_from?.id !== trackId) || state.progress_ms == null) return 'wait';
  return state.progress_ms < wantedMs - SEEK_TOLERANCE_MS ? 'seek' : 'ok';
}

const STORAGE_KEY = 'startSettings';

export function loadStartSettings(): StartSettings {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (s && ['start', 'offset', 'random'].includes(s.mode) && Number.isFinite(s.offsetSec)) return s;
  } catch {
    /* fall through */
  }
  return { ...DEFAULT_START };
}

export function saveStartSettings(s: StartSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}
