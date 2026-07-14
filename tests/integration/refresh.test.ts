import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { decodeJwt } from 'jose';

import type { TestApplication } from '../helpers/test-application.js';
import { createTestApplication } from '../helpers/test-application.js';
import { parseTokenPair } from '../helpers/http.js';

let testApplication: TestApplication | undefined;

describe('POST /refresh', () => {
  beforeAll(async () => {
    testApplication = await createTestApplication();
  });

  beforeEach(async () => {
    await getTestApplication().reset();
  });

  afterAll(async () => {
    await testApplication?.close();
  });

  it('rotates an active refresh token and invalidates its previous session', async () => {
    const application = getTestApplication();
    const registerResponse = await registerUser(application, 'refresh@example.com');
    const originalTokenPair = parseTokenPair(registerResponse.body);
    const originalJti = getRefreshSessionId(originalTokenPair.refreshToken);
    const refreshResponse = await application.app.inject({
      method: 'POST',
      url: '/refresh',
      payload: { refreshToken: originalTokenPair.refreshToken },
    });

    expect(refreshResponse.statusCode).toBe(200);

    const rotatedTokenPair = parseTokenPair(refreshResponse.body);
    const nextJti = getRefreshSessionId(rotatedTokenPair.refreshToken);
    const user = await application.database.user.findUnique({
      where: { email: 'refresh@example.com' },
    });

    expect(nextJti).not.toBe(originalJti);
    expect(await application.redis.get(`auth:refresh:${originalJti}`)).toBeNull();
    expect(await application.redis.get(`auth:refresh:${nextJti}`)).toBe(user?.id);
  });

  it('rejects a replayed refresh token with the same safe 401 response', async () => {
    const application = getTestApplication();
    const registerResponse = await registerUser(application, 'replay@example.com');
    const refreshToken = parseTokenPair(registerResponse.body).refreshToken;
    const firstResponse = await application.app.inject({
      method: 'POST',
      url: '/refresh',
      payload: { refreshToken },
    });
    const replayResponse = await application.app.inject({
      method: 'POST',
      url: '/refresh',
      payload: { refreshToken },
    });

    const expectedResponse = {
      statusCode: 401,
      code: 'AUTH_INVALID_REFRESH_TOKEN',
      message: 'Invalid refresh token',
    };

    expect(firstResponse.statusCode).toBe(200);
    expect(replayResponse.statusCode).toBe(401);
    expect(replayResponse.json()).toEqual(expectedResponse);
  });

  it('allows exactly one concurrent refresh request for the same token', async () => {
    const application = getTestApplication();
    const registerResponse = await registerUser(application, 'concurrent-refresh@example.com');
    const refreshToken = parseTokenPair(registerResponse.body).refreshToken;
    const responses = await Promise.all([
      application.app.inject({ method: 'POST', url: '/refresh', payload: { refreshToken } }),
      application.app.inject({ method: 'POST', url: '/refresh', payload: { refreshToken } }),
    ]);

    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 401]);
    expect(await application.redis.keys('auth:refresh:*')).toHaveLength(1);
  });

  it('rejects access tokens and malformed input as refresh tokens', async () => {
    const application = getTestApplication();
    const registerResponse = await registerUser(application, 'wrong-token-type@example.com');
    const tokenPair = parseTokenPair(registerResponse.body);
    const accessTokenResponse = await application.app.inject({
      method: 'POST',
      url: '/refresh',
      payload: { refreshToken: tokenPair.accessToken },
    });
    const malformedTokenResponse = await application.app.inject({
      method: 'POST',
      url: '/refresh',
      payload: { refreshToken: 'not-a-jwt' },
    });

    const expectedResponse = {
      statusCode: 401,
      code: 'AUTH_INVALID_REFRESH_TOKEN',
      message: 'Invalid refresh token',
    };

    expect(accessTokenResponse.statusCode).toBe(401);
    expect(malformedTokenResponse.statusCode).toBe(401);
    expect(accessTokenResponse.json()).toEqual(expectedResponse);
    expect(malformedTokenResponse.json()).toEqual(expectedResponse);
  });

  it('rejects an excessively long refresh token before verification', async () => {
    const response = await getTestApplication().app.inject({
      method: 'POST',
      url: '/refresh',
      payload: { refreshToken: 'x'.repeat(4097) },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
    });
  });
});

function getTestApplication(): TestApplication {
  if (testApplication === undefined) {
    throw new Error('Test application is not initialized');
  }

  return testApplication;
}

async function registerUser(application: TestApplication, email: string) {
  const response = await application.app.inject({
    method: 'POST',
    url: '/register',
    payload: { email, password: 'password123' },
  });

  expect(response.statusCode).toBe(201);
  return response;
}

function getRefreshSessionId(refreshToken: string): string {
  const refreshSessionId = decodeJwt(refreshToken).jti;

  if (typeof refreshSessionId !== 'string') {
    throw new Error('Refresh token is missing jti');
  }

  return refreshSessionId;
}
