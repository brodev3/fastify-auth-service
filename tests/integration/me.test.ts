import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { TestApplication } from '../helpers/test-application.js';
import { createTestApplication } from '../helpers/test-application.js';
import { parseTokenPair } from '../helpers/http.js';

let testApplication: TestApplication | undefined;

describe('GET /me', () => {
  beforeAll(async () => {
    testApplication = await createTestApplication();
  });

  beforeEach(async () => {
    await getTestApplication().reset();
  });

  afterAll(async () => {
    await testApplication?.close();
  });

  it('returns the current public user for a valid Bearer access token', async () => {
    const application = getTestApplication();
    const registerResponse = await registerUser(application, 'me@example.com');
    const accessToken = parseTokenPair(registerResponse.body).accessToken;
    const user = await application.database.user.findUnique({
      where: { email: 'me@example.com' },
    });

    if (user === null) {
      throw new Error('Expected registered user');
    }

    const response = await application.app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: user.id,
      email: 'me@example.com',
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    });
  });

  it('rejects missing, malformed, and refresh-token authorization', async () => {
    const application = getTestApplication();
    const registerResponse = await registerUser(application, 'invalid-access@example.com');
    const refreshToken = parseTokenPair(registerResponse.body).refreshToken;
    const requests = await Promise.all([
      application.app.inject({ method: 'GET', url: '/me' }),
      application.app.inject({
        method: 'GET',
        url: '/me',
        headers: { authorization: 'Basic credentials' },
      }),
      application.app.inject({
        method: 'GET',
        url: '/me',
        headers: { authorization: `Bearer ${refreshToken}` },
      }),
    ]);

    const expectedResponse = {
      statusCode: 401,
      code: 'AUTH_INVALID_ACCESS_TOKEN',
      message: 'Invalid access token',
    };

    expect(requests.map((response) => response.statusCode)).toEqual([401, 401, 401]);
    for (const response of requests) {
      expect(response.json()).toEqual(expectedResponse);
    }
  });

  it('rejects an access token after its user has been deleted', async () => {
    const application = getTestApplication();
    const registerResponse = await registerUser(application, 'deleted-user@example.com');
    const accessToken = parseTokenPair(registerResponse.body).accessToken;
    const user = await application.database.user.findUnique({
      where: { email: 'deleted-user@example.com' },
    });

    if (user === null) {
      throw new Error('Expected registered user');
    }

    await application.database.user.delete({ where: { id: user.id } });

    const response = await application.app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      statusCode: 401,
      code: 'AUTH_INVALID_ACCESS_TOKEN',
      message: 'Invalid access token',
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
