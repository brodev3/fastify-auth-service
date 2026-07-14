import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { decodeJwt } from 'jose';

import type { TestApplication } from '../helpers/test-application.js';
import { createTestApplication } from '../helpers/test-application.js';
import { parseTokenPair } from '../helpers/http.js';

let testApplication: TestApplication | undefined;

describe('POST /login', () => {
  beforeAll(async () => {
    testApplication = await createTestApplication();
  });

  beforeEach(async () => {
    await getTestApplication().reset();
  });

  afterAll(async () => {
    await testApplication?.close();
  });

  it('normalizes email and creates an independent refresh session', async () => {
    const application = getTestApplication();
    const registerResponse = await application.app.inject({
      method: 'POST',
      url: '/register',
      payload: { email: 'login@example.com', password: 'password123' },
    });
    const loginResponse = await application.app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: ' LOGIN@EXAMPLE.COM ', password: 'password123' },
    });

    expect(registerResponse.statusCode).toBe(201);
    expect(loginResponse.statusCode).toBe(200);

    const registrationTokenPair = parseTokenPair(registerResponse.body);
    const loginTokenPair = parseTokenPair(loginResponse.body);
    const registrationSessionId = decodeJwt(registrationTokenPair.refreshToken).jti;
    const loginSessionId = decodeJwt(loginTokenPair.refreshToken).jti;
    const user = await application.database.user.findUnique({
      where: { email: 'login@example.com' },
    });

    expect(typeof registrationSessionId).toBe('string');
    expect(typeof loginSessionId).toBe('string');
    expect(loginSessionId).not.toBe(registrationSessionId);
    expect(await application.redis.keys('auth:refresh:*')).toHaveLength(2);
    expect(
      await application.redis.mget(
        `auth:refresh:${String(registrationSessionId)}`,
        `auth:refresh:${String(loginSessionId)}`,
      ),
    ).toEqual([user?.id, user?.id]);
  });

  it('returns the same 401 response for unknown email and wrong password', async () => {
    const application = getTestApplication();
    const registerResponse = await application.app.inject({
      method: 'POST',
      url: '/register',
      payload: { email: 'credentials@example.com', password: 'password123' },
    });
    const unknownEmailResponse = await application.app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'unknown@example.com', password: 'password123' },
    });
    const wrongPasswordResponse = await application.app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'credentials@example.com', password: 'another-password' },
    });

    const expectedResponse = {
      statusCode: 401,
      code: 'AUTH_INVALID_CREDENTIALS',
      message: 'Invalid email or password',
    };

    expect(registerResponse.statusCode).toBe(201);
    expect(unknownEmailResponse.statusCode).toBe(401);
    expect(wrongPasswordResponse.statusCode).toBe(401);
    expect(unknownEmailResponse.json()).toEqual(expectedResponse);
    expect(wrongPasswordResponse.json()).toEqual(expectedResponse);
    expect(await application.redis.keys('auth:refresh:*')).toHaveLength(1);
  });
});

function getTestApplication(): TestApplication {
  if (testApplication === undefined) {
    throw new Error('Test application is not initialized');
  }

  return testApplication;
}
