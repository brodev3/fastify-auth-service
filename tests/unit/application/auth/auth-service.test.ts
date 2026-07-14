import { describe, expect, it } from 'vitest';

import { AuthService, normalizeEmail } from '../../../../src/application/auth/auth-service.js';
import { RefreshSessionIdentifierCollisionError } from '../../../../src/application/auth/errors.js';
import type { DependencyUnavailableError } from '../../../../src/application/auth/errors.js';
import type {
  PasswordHasher,
  RefreshSessionRepository,
  TokenService,
  UserRepository,
} from '../../../../src/application/auth/ports.js';
import type { RefreshSession } from '../../../../src/application/auth/types.js';

const USER_ID = '7b23842f-3995-4e50-b3cc-53d16a610b5c';
const TOKEN_TTLS = {
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 604_800,
} as const;

describe('normalizeEmail', () => {
  it('trims surrounding whitespace and lowercases the address', () => {
    expect(normalizeEmail('  User.Name@Example.COM  ')).toBe('user.name@example.com');
  });
});

describe('AuthService.createTokenPair', () => {
  it('creates a refresh session and returns the public token contract', async () => {
    const sessions: RefreshSession[] = [];
    const service = createAuthService({
      create: (session) => {
        sessions.push(session);
        return Promise.resolve();
      },
    });

    const tokenPair = await service.createTokenPair(USER_ID);
    const [session] = sessions;

    expect(session).toBeDefined();
    expect(session?.jti).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(session).toEqual({
      jti: session?.jti,
      userId: USER_ID,
      ttlSeconds: TOKEN_TTLS.refreshTokenTtlSeconds,
    });
    expect(tokenPair).toEqual({
      accessToken: `access:${USER_ID}`,
      refreshToken: `refresh:${USER_ID}:${String(session?.jti)}`,
      tokenType: 'Bearer',
      accessTokenExpiresIn: TOKEN_TTLS.accessTokenTtlSeconds,
      refreshTokenExpiresIn: TOKEN_TTLS.refreshTokenTtlSeconds,
    });
  });

  it('classifies refresh storage failures as Redis unavailability', async () => {
    const cause = new Error('connection closed');
    const service = createAuthService({
      create: () => Promise.reject(cause),
    });

    const operation = service.createTokenPair(USER_ID);

    await expect(operation).rejects.toMatchObject({
      name: 'DependencyUnavailableError',
      dependencyName: 'redis',
      cause,
    } satisfies Partial<DependencyUnavailableError>);
  });

  it('preserves refresh-session identifier collisions as internal conflicts', async () => {
    const collision = new RefreshSessionIdentifierCollisionError();
    const service = createAuthService({
      create: () => Promise.reject(collision),
    });

    await expect(service.createTokenPair(USER_ID)).rejects.toBe(collision);
  });
});

function createAuthService(
  refreshSessionOverrides: Partial<RefreshSessionRepository> = {},
): AuthService {
  const tokenService: TokenService = {
    signAccessToken: (userId) => Promise.resolve(`access:${userId}`),
    signRefreshToken: (userId, jti) => Promise.resolve(`refresh:${userId}:${jti}`),
    verifyAccessToken: () => Promise.resolve(null),
    verifyRefreshToken: () => Promise.resolve(null),
  };
  const refreshSessionRepository: RefreshSessionRepository = {
    create: () => Promise.resolve(),
    rotate: () => Promise.resolve(false),
    ...refreshSessionOverrides,
  };
  const passwordHasher: PasswordHasher = {
    hash: () => Promise.resolve('password-hash'),
    verify: () => Promise.resolve(false),
  };
  const userRepository: UserRepository = {
    findByEmail: () => Promise.resolve(null),
    findById: () => Promise.resolve(null),
    create: () => Promise.reject(new Error('User creation is not configured for this test')),
    withTransaction: <Result>(): Promise<Result> =>
      Promise.reject(new Error('Transactions are not configured for this test')),
  };

  return new AuthService(
    { passwordHasher, tokenService, refreshSessionRepository, userRepository },
    TOKEN_TTLS,
  );
}
