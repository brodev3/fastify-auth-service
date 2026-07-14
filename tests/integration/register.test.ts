import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { decodeJwt } from 'jose';

import { buildApp } from '../../src/app.js';
import { AuthService } from '../../src/application/auth/auth-service.js';
import { Argon2PasswordHasher } from '../../src/infrastructure/security/argon2-password-hasher.js';
import { PrismaUserRepository } from '../../src/infrastructure/database/prisma-user-repository.js';
import { JwtTokenService } from '../../src/infrastructure/security/jwt-token-service.js';
import type { RefreshSessionRepository } from '../../src/application/auth/ports.js';
import type { TestApplication } from '../helpers/test-application.js';
import { createTestApplication } from '../helpers/test-application.js';
import { parseTokenPair } from '../helpers/http.js';

let testApplication: TestApplication | undefined;

describe('POST /register', () => {
  beforeAll(async () => {
    testApplication = await createTestApplication();
  });

  beforeEach(async () => {
    await getTestApplication().reset();
  });

  afterAll(async () => {
    await testApplication?.close();
  });

  it('normalizes email, persists an Argon2id hash, and creates a Redis refresh session', async () => {
    const application = getTestApplication();
    const response = await application.app.inject({
      method: 'POST',
      url: '/register',
      payload: {
        email: '  User.Name@Example.COM  ',
        password: 'password123',
      },
    });

    expect(response.statusCode).toBe(201);

    const tokenPair = parseTokenPair(response.body);
    const user = await application.database.user.findUnique({
      where: { email: 'user.name@example.com' },
    });
    const refreshClaims = decodeJwt(tokenPair.refreshToken);
    const refreshSessionId = refreshClaims.jti;

    expect(tokenPair).toMatchObject({
      tokenType: 'Bearer',
      accessTokenExpiresIn: 900,
      refreshTokenExpiresIn: 604_800,
    });
    expect(tokenPair.accessToken).not.toBe('');
    expect(tokenPair.refreshToken).not.toBe('');
    expect(user?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(typeof refreshSessionId).toBe('string');
    expect(await application.redis.get(`auth:refresh:${String(refreshSessionId)}`)).toBe(user?.id);
  });

  it('returns 400 when the normalized request body is invalid', async () => {
    const response = await getTestApplication().app.inject({
      method: 'POST',
      url: '/register',
      payload: {
        email: '  not-an-email  ',
        password: 'password123',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 409 for an existing normalized email', async () => {
    const application = getTestApplication();
    const firstResponse = await application.app.inject({
      method: 'POST',
      url: '/register',
      payload: { email: 'duplicate@example.com', password: 'password123' },
    });
    const secondResponse = await application.app.inject({
      method: 'POST',
      url: '/register',
      payload: { email: ' DUPLICATE@example.com ', password: 'password123' },
    });

    expect(firstResponse.statusCode).toBe(201);
    expect(secondResponse.statusCode).toBe(409);
    expect(secondResponse.json()).toEqual({
      statusCode: 409,
      code: 'AUTH_EMAIL_ALREADY_EXISTS',
      message: 'Email is already registered',
    });
  });

  it('handles a concurrent duplicate as one registration and one conflict', async () => {
    const application = getTestApplication();
    const payload = { email: 'race@example.com', password: 'password123' };
    const responses = await Promise.all([
      application.app.inject({ method: 'POST', url: '/register', payload }),
      application.app.inject({ method: 'POST', url: '/register', payload }),
    ]);

    expect(responses.map((response) => response.statusCode).sort()).toEqual([201, 409]);
    expect(await application.database.user.count({ where: { email: payload.email } })).toBe(1);
    expect(await application.redis.keys('auth:refresh:*')).toHaveLength(1);
  });

  it('rolls back the database transaction when refresh-session storage fails', async () => {
    const application = getTestApplication();
    const failingRefreshSessionRepository: RefreshSessionRepository = {
      create: () => Promise.reject(new Error('Redis is unavailable')),
      rotate: () => Promise.resolve(false),
    };
    const authService = new AuthService(
      {
        passwordHasher: new Argon2PasswordHasher(),
        tokenService: new JwtTokenService({
          accessSecret: application.config.jwt.accessSecret,
          refreshSecret: application.config.jwt.refreshSecret,
          issuer: application.config.jwt.issuer,
          accessAudience: application.config.jwt.accessAudience,
          refreshAudience: application.config.jwt.refreshAudience,
          accessTokenTtlSeconds: application.config.jwt.accessTokenTtlSeconds,
          refreshTokenTtlSeconds: application.config.jwt.refreshTokenTtlSeconds,
        }),
        refreshSessionRepository: failingRefreshSessionRepository,
        userRepository: new PrismaUserRepository(application.database),
      },
      application.config.jwt,
    );
    const app = buildApp(application.config, {
      authService,
      disableLogger: true,
      rateLimitRedis: application.redis,
    });

    await app.ready();

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/register',
        payload: { email: 'rollback@example.com', password: 'password123' },
      });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({
        statusCode: 503,
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'Required service is temporarily unavailable',
      });
      expect(
        await application.database.user.findUnique({ where: { email: 'rollback@example.com' } }),
      ).toBeNull();
    } finally {
      await app.close();
    }
  });
});

function getTestApplication(): TestApplication {
  if (testApplication === undefined) {
    throw new Error('Test application is not initialized');
  }

  return testApplication;
}
