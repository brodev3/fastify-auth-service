import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { decodeJwt } from 'jose';

import { RefreshSessionNotFoundError } from '../../src/application/auth/errors.js';
import type { TestApplication } from '../helpers/test-application.js';
import { createTestApplication } from '../helpers/test-application.js';

let testApplication: TestApplication | undefined;

describe('refresh session rotation', () => {
  beforeAll(async () => {
    testApplication = await createTestApplication();
  });

  beforeEach(async () => {
    await getTestApplication().reset();
  });

  afterAll(async () => {
    await testApplication?.close();
  });

  it('allows exactly one concurrent replacement of an active refresh session', async () => {
    const application = getTestApplication();
    const userId = randomUUID();
    const initialTokenPair = await application.authService.createTokenPair(userId);
    const currentJti = getRefreshSessionId(initialTokenPair.refreshToken);

    const results = await Promise.allSettled([
      application.authService.rotateTokenPair({ currentJti, userId }),
      application.authService.rotateTokenPair({ currentJti, userId }),
    ]);
    const fulfilledResult = results.find((result) => result.status === 'fulfilled');
    const rejectedResult = results.find((result) => result.status === 'rejected');

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(rejectedResult?.status).toBe('rejected');
    if (rejectedResult?.status !== 'rejected') {
      throw new Error('Expected one rejected rotation');
    }
    expect(rejectedResult.reason).toBeInstanceOf(RefreshSessionNotFoundError);
    expect(await application.redis.get(`auth:refresh:${currentJti}`)).toBeNull();

    expect(fulfilledResult?.status).toBe('fulfilled');
    if (fulfilledResult?.status !== 'fulfilled') {
      throw new Error('Expected one fulfilled rotation');
    }

    const nextJti = getRefreshSessionId(fulfilledResult.value.refreshToken);
    expect(nextJti).not.toBe(currentJti);
    expect(await application.redis.get(`auth:refresh:${nextJti}`)).toBe(userId);
    expect(await application.redis.ttl(`auth:refresh:${nextJti}`)).toBeGreaterThan(0);
    await expect(
      application.authService.rotateTokenPair({ currentJti, userId }),
    ).rejects.toBeInstanceOf(RefreshSessionNotFoundError);
  });

  it('requires the session user ID to match the refresh-token subject', async () => {
    const application = getTestApplication();
    const userId = randomUUID();
    const initialTokenPair = await application.authService.createTokenPair(userId);
    const currentJti = getRefreshSessionId(initialTokenPair.refreshToken);

    await expect(
      application.authService.rotateTokenPair({ currentJti, userId: randomUUID() }),
    ).rejects.toBeInstanceOf(RefreshSessionNotFoundError);
    expect(await application.redis.get(`auth:refresh:${currentJti}`)).toBe(userId);
  });
});

function getTestApplication(): TestApplication {
  if (testApplication === undefined) {
    throw new Error('Test application is not initialized');
  }

  return testApplication;
}

function getRefreshSessionId(refreshToken: string): string {
  const refreshSessionId = decodeJwt(refreshToken).jti;

  if (typeof refreshSessionId !== 'string') {
    throw new Error('Refresh token is missing jti');
  }

  return refreshSessionId;
}
