import { describe, expect, it } from 'vitest';
import { checkStartPosition, startPositionMs } from '../src/start-position';

describe('startPositionMs', () => {
  it('start mode is always 0', () => {
    expect(startPositionMs({ mode: 'start', offsetSec: 30 }, 200_000)).toBe(0);
  });

  it('offset mode uses the offset, clamped near the end of short songs', () => {
    expect(startPositionMs({ mode: 'offset', offsetSec: 30 }, 200_000)).toBe(30_000);
    expect(startPositionMs({ mode: 'offset', offsetSec: 30 }, null)).toBe(30_000);
    expect(startPositionMs({ mode: 'offset', offsetSec: 300 }, 100_000)).toBe(80_000);
    expect(startPositionMs({ mode: 'offset', offsetSec: 30 }, 10_000)).toBe(0);
  });

  it('random mode lands between 15% and 60% of the song', () => {
    expect(startPositionMs({ mode: 'random', offsetSec: 0 }, 200_000, () => 0)).toBe(30_000);
    expect(startPositionMs({ mode: 'random', offsetSec: 0 }, 200_000, () => 0.999999)).toBe(119_999);
  });

  it('random mode falls back to 30 s without a duration', () => {
    expect(startPositionMs({ mode: 'random', offsetSec: 0 }, null)).toBe(30_000);
  });
});

describe('checkStartPosition', () => {
  const ID = '4uLU6hMCjMI75M1A2tKUQC';
  it('waits until the card’s track is reported', () => {
    expect(checkStartPosition(null, ID, 30_000)).toBe('wait');
    expect(checkStartPosition({ progress_ms: 0, item: null }, ID, 30_000)).toBe('wait');
    expect(checkStartPosition({ progress_ms: 5_000, item: { id: 'previousTrack' } }, ID, 30_000)).toBe('wait');
  });
  it('seeks when the device started near the beginning', () => {
    expect(checkStartPosition({ progress_ms: 800, item: { id: ID } }, ID, 30_000)).toBe('seek');
  });
  it('accepts a position that is close enough', () => {
    expect(checkStartPosition({ progress_ms: 29_000, item: { id: ID } }, ID, 30_000)).toBe('ok');
    expect(checkStartPosition({ progress_ms: 31_000, item: { id: ID } }, ID, 30_000)).toBe('ok');
  });
  it('recognises relinked tracks', () => {
    expect(checkStartPosition({ progress_ms: 0, item: { id: 'other', linked_from: { id: ID } } }, ID, 30_000)).toBe('seek');
  });
});
