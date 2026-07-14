import type { TokenPair } from '../../src/application/auth/types.js';

export function parseTokenPair(body: string): TokenPair {
  const value: unknown = JSON.parse(body) as unknown;

  if (
    !isRecord(value) ||
    typeof value['accessToken'] !== 'string' ||
    typeof value['refreshToken'] !== 'string' ||
    value['tokenType'] !== 'Bearer' ||
    value['accessTokenExpiresIn'] !== 900 ||
    value['refreshTokenExpiresIn'] !== 604_800
  ) {
    throw new Error('Expected a token pair response');
  }

  return {
    accessToken: value['accessToken'],
    refreshToken: value['refreshToken'],
    tokenType: 'Bearer',
    accessTokenExpiresIn: 900,
    refreshTokenExpiresIn: 604_800,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
