import { describe, expect, it } from 'vitest';
import { spotifyErrorMessage } from '../src/spotify/api';

describe('spotifyErrorMessage', () => {
  it('reads the standard Web API error object', () => {
    expect(spotifyErrorMessage(403, '{"error":{"status":403,"message":"Player command failed: Restriction violated","reason":"UNKNOWN"}}')).toEqual({
      message: 'Player command failed: Restriction violated',
      reason: 'UNKNOWN',
    });
  });
  it('reads OAuth-style string errors', () => {
    expect(spotifyErrorMessage(400, '{"error":"invalid_grant","error_description":"Refresh token revoked"}')).toEqual({
      message: 'Refresh token revoked',
    });
  });
  it('falls back to the raw body, then to a description of the empty response', () => {
    expect(spotifyErrorMessage(403, 'Forbidden by policy')).toEqual({ message: 'Forbidden by policy' });
    expect(spotifyErrorMessage(403, '')).toEqual({ message: 'HTTP 403 with an empty response' });
  });
});
