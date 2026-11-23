import { describe, expect, it } from 'vitest';
import { codeChallenge, randomString } from '../src/spotify/pkce';

describe('PKCE', () => {
  it('matches the RFC 7636 appendix B test vector', async () => {
    expect(await codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('generates verifiers with only unreserved characters', () => {
    const v = randomString(64);
    expect(v).toHaveLength(64);
    expect(v).toMatch(/^[A-Za-z0-9\-._~]+$/);
  });
});
