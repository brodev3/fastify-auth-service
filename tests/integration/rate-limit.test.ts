import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { TestApplication } from '../helpers/test-application.js';
import { createTestApplication } from '../helpers/test-application.js';

let testApplication: TestApplication | undefined;

describe('authentication rate limits', () => {
  beforeAll(async () => {
    testApplication = await createTestApplication();
  });

  beforeEach(async () => {
    await getTestApplication().reset();
  });

  afterAll(async () => {
    await testApplication?.close();
  });

  it('limits POST /register to five requests per IP per hour', async () => {
    const application = getTestApplication();
    const remoteAddress = '198.51.100.10';

    for (let index = 0; index < 5; index += 1) {
      const response = await application.app.inject({
        method: 'POST',
        url: '/register',
        remoteAddress,
        payload: {
          email: `register-rate-${String(index)}@example.com`,
          password: 'password123',
        },
      });

      expect(response.statusCode).toBe(201);
    }

    const limitedResponse = await application.app.inject({
      method: 'POST',
      url: '/register',
      remoteAddress,
      payload: {
        email: 'register-rate-limited@example.com',
        password: 'password123',
      },
    });

    expect(limitedResponse.statusCode).toBe(429);
    expect(Number(limitedResponse.headers['retry-after'])).toBeGreaterThan(0);
    expect(limitedResponse.json()).toEqual({
      statusCode: 429,
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests',
    });

    const otherIpResponse = await application.app.inject({
      method: 'POST',
      url: '/register',
      remoteAddress: '198.51.100.11',
      payload: {
        email: 'register-rate-other-ip@example.com',
        password: 'password123',
      },
    });

    expect(otherIpResponse.statusCode).toBe(201);
  });

  it('limits POST /login to ten requests per IP per fifteen minutes', async () => {
    const application = getTestApplication();
    const loginRemoteAddress = '198.51.100.20';
    const registrationResponse = await application.app.inject({
      method: 'POST',
      url: '/register',
      remoteAddress: '198.51.100.21',
      payload: {
        email: 'login-rate@example.com',
        password: 'password123',
      },
    });

    expect(registrationResponse.statusCode).toBe(201);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await application.app.inject({
        method: 'POST',
        url: '/login',
        remoteAddress: loginRemoteAddress,
        payload: {
          email: 'login-rate@example.com',
          password: 'incorrect-password',
        },
      });

      expect(response.statusCode).toBe(401);
    }

    const limitedResponse = await application.app.inject({
      method: 'POST',
      url: '/login',
      remoteAddress: loginRemoteAddress,
      payload: {
        email: 'login-rate@example.com',
        password: 'incorrect-password',
      },
    });

    expect(limitedResponse.statusCode).toBe(429);
    expect(Number(limitedResponse.headers['retry-after'])).toBeGreaterThan(0);
    expect(limitedResponse.json()).toEqual({
      statusCode: 429,
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests',
    });
  });

  it('returns 503 and closes cleanly when Redis fails inside the rate limiter', async () => {
    const isolatedApplication = await createTestApplication();

    isolatedApplication.redis.disconnect();

    try {
      const response = await isolatedApplication.app.inject({
        method: 'POST',
        url: '/login',
        payload: {
          email: 'redis-unavailable@example.com',
          password: 'password123',
        },
      });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({
        statusCode: 503,
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'Required service is temporarily unavailable',
      });
    } finally {
      await isolatedApplication.close();
    }
  });
});

function getTestApplication(): TestApplication {
  if (testApplication === undefined) {
    throw new Error('Test application is not initialized');
  }

  return testApplication;
}
