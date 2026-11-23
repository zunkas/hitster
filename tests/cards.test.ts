import { describe, expect, it } from 'vitest';
import { buildCards, playlistIdFromInput, type SpotifyTrackLike, suspiciousReason, yearFromReleaseDate } from '../src/deck/cards';

const track = (over: Partial<SpotifyTrackLike> = {}): SpotifyTrackLike => ({
  id: '4uLU6hMCjMI75M1A2tKUQC',
  name: 'Never Gonna Give You Up',
  type: 'track',
  artists: [{ name: 'Rick Astley' }],
  album: { release_date: '1987-11-12', album_type: 'album' },
  ...over,
});

describe('yearFromReleaseDate', () => {
  it('handles all Spotify precisions', () => {
    expect(yearFromReleaseDate('1975')).toBe(1975);
    expect(yearFromReleaseDate('1975-10')).toBe(1975);
    expect(yearFromReleaseDate('1975-10-31')).toBe(1975);
  });
  it('returns null for missing or zero dates', () => {
    expect(yearFromReleaseDate(undefined)).toBeNull();
    expect(yearFromReleaseDate('0000')).toBeNull();
    expect(yearFromReleaseDate('')).toBeNull();
  });
});

describe('suspiciousReason', () => {
  it('flags version markers after a dash or in brackets', () => {
    expect(suspiciousReason(track({ name: 'Bohemian Rhapsody - Remastered 2011' }))).toMatch(/Remastered/);
    expect(suspiciousReason(track({ name: 'Song (Live at Wembley)' }))).toMatch(/Live/);
    expect(suspiciousReason(track({ name: 'Song - Radio Edit' }))).toMatch(/Edit/);
    expect(suspiciousReason(track({ name: 'Song [2009 Version]' }))).toMatch(/Version/);
    expect(suspiciousReason(track({ name: "Love Story (Taylor's Version)" }))).toMatch(/Version/);
  });
  it('does not flag words that are just part of the title', () => {
    expect(suspiciousReason(track({ name: 'Live Forever' }))).toBeNull();
    expect(suspiciousReason(track({ name: 'Live and Let Die' }))).toBeNull();
  });
  it('flags compilations', () => {
    expect(suspiciousReason(track({ album: { release_date: '2005', album_type: 'compilation' } }))).toMatch(/compilation/);
  });
});

describe('buildCards', () => {
  it('maps tracks and skips local, unplayable, episodes, nulls and duplicates', () => {
    const cards = buildCards([
      track(),
      track(),
      null,
      track({ id: null, is_local: true }),
      track({ id: '0000000000000000000002', is_playable: false }),
      track({ id: '0000000000000000000003', type: 'episode' }),
      track({ id: '0000000000000000000004', artists: [{ name: 'A' }, { name: 'B' }] }),
    ]);
    expect(cards).toEqual([
      { trackId: '4uLU6hMCjMI75M1A2tKUQC', title: 'Never Gonna Give You Up', artists: 'Rick Astley', year: 1987, suspicious: null },
      { trackId: '0000000000000000000004', title: 'Never Gonna Give You Up', artists: 'A, B', year: 1987, suspicious: null },
    ]);
  });
});

describe('playlistIdFromInput', () => {
  it('accepts links, URIs and bare IDs', () => {
    const id = '37i9dQZF1DXcBWIGoYBM5M';
    expect(playlistIdFromInput(`https://open.spotify.com/playlist/${id}?si=xyz`)).toBe(id);
    expect(playlistIdFromInput(`https://open.spotify.com/intl-sv/playlist/${id}`)).toBe(id);
    expect(playlistIdFromInput(`spotify:playlist:${id}`)).toBe(id);
    expect(playlistIdFromInput(` ${id} `)).toBe(id);
    expect(playlistIdFromInput('https://open.spotify.com/track/abc')).toBeNull();
  });
});
