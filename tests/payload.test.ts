import { describe, expect, it } from 'vitest';
import { cardUrl, decodeCard, encodeCard, trackIdFromScan } from '../src/payload';

const ID = '4uLU6hMCjMI75M1A2tKUQC';
const BASE = 'https://someone.github.io/hitster/';

describe('card payload', () => {
  it('round-trips a track ID', () => {
    expect(decodeCard(encodeCard(ID))).toBe(ID);
  });

  it('does not contain the track ID in readable form', () => {
    expect(encodeCard(ID)).not.toContain(ID);
    expect(cardUrl(ID, BASE)).not.toContain(ID);
  });

  it('rejects garbage and codes made with another key', () => {
    expect(decodeCard('not-a-code')).toBeNull();
    expect(decodeCard('!!!')).toBeNull();
    expect(decodeCard(encodeCard(ID, 'other-key'))).toBeNull();
  });

  it('rejects things that are not track IDs', () => {
    expect(() => encodeCard('short')).toThrow();
  });

  it('reads all supported QR contents', () => {
    expect(trackIdFromScan(cardUrl(ID, BASE))).toBe(ID);
    expect(trackIdFromScan(`https://open.spotify.com/track/${ID}?si=abc`)).toBe(ID);
    expect(trackIdFromScan(`https://open.spotify.com/intl-sv/track/${ID}`)).toBe(ID);
    expect(trackIdFromScan(`spotify:track:${ID}`)).toBe(ID);
    expect(trackIdFromScan('https://example.com/')).toBeNull();
    expect(trackIdFromScan('hello')).toBeNull();
  });
});
