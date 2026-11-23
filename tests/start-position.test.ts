import { describe, expect, it } from 'vitest';
import { startPositionMs } from '../src/start-position';

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
