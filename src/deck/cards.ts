export interface Card {
  trackId: string;
  title: string;
  artists: string;
  year: number | null;
  /** Why the year might be wrong, or null if the track looks fine. */
  suspicious: string | null;
}

/** The subset of a Spotify track object we use. */
export interface SpotifyTrackLike {
  id: string | null;
  name: string;
  type?: string;
  is_local?: boolean;
  is_playable?: boolean;
  artists: { name: string }[];
  album: { name?: string; release_date?: string; album_type?: string };
}

export function yearFromReleaseDate(date: string | undefined): number | null {
  const m = /^(\d{4})/.exec(date ?? '');
  const y = m ? Number(m[1]) : NaN;
  return y > 0 ? y : null;
}

// Spotify marks versions after a dash or inside brackets: "Song - Remastered 2011", "Song (Live)".
const VERSION_MARK = /(?:\s-\s|[([])[^)\]]*?\b(remaster(?:ed)?|live|version|edit|re-?recorded)\b/i;

export function suspiciousReason(track: SpotifyTrackLike): string | null {
  const m = VERSION_MARK.exec(track.name);
  if (m) return `Title says "${m[1]}" — year may be of that version`;
  if (track.album.album_type === 'compilation') return 'From a compilation — year may be of the compilation';
  return null;
}

/** Turn playlist tracks into cards, skipping local, unplayable, non-track and duplicate items. */
export function buildCards(tracks: (SpotifyTrackLike | null | undefined)[]): Card[] {
  const seen = new Set<string>();
  const cards: Card[] = [];
  for (const t of tracks) {
    if (!t || !t.id || t.is_local || t.is_playable === false) continue;
    if (t.type && t.type !== 'track') continue;
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    cards.push({
      trackId: t.id,
      title: t.name,
      artists: t.artists.map((a) => a.name).join(', '),
      year: yearFromReleaseDate(t.album.release_date),
      suspicious: suspiciousReason(t),
    });
  }
  return cards;
}

/** Accepts a playlist URL, spotify:playlist: URI or bare ID. */
export function playlistIdFromInput(input: string): string | null {
  const s = input.trim();
  const m =
    /open\.spotify\.com\/(?:[a-z-]+\/)?playlist\/([A-Za-z0-9]+)/.exec(s) ??
    /^spotify:playlist:([A-Za-z0-9]+)$/.exec(s) ??
    /^([A-Za-z0-9]{22})$/.exec(s);
  return m ? m[1] : null;
}
