import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { TestApplication } from '../helpers/test-application.js';
import { createTestApplication } from '../helpers/test-application.js';

let testApplication: TestApplication | undefined;

describe('CORS policy', () => {
  beforeAll(async () => {
    testApplication = await createTestApplication();
  });

  beforeEach(async () => {
    await getTestApplication().reset();
  });

  afterAll(async () => {
    await testApplication?.close();
  });

  it('adds CORS headers for an allowed origin', async () => {
    const response = await getTestApplication().app.inject({
      method: 'GET',
      url: '/me',
      headers: {
        origin: 'http://localhost:3000',
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('does not add CORS headers for an origin outside the allowlist', async () => {
    const response = await getTestApplication().app.inject({
      method: 'GET',
      url: '/me',
      headers: {
        origin: 'https://untrusted.example',
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('handles an allowed preflight request', async () => {
    const response = await getTestApplication().app.inject({
      method: 'OPTIONS',
      url: '/login',
      headers: {
        origin: 'http://localhost:3000',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization, content-type',
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(response.headers['access-control-allow-methods']).toContain('POST');
    expect(response.headers['access-control-allow-headers']).toContain('Authorization');
    expect(response.headers['access-control-allow-headers']).toContain('Content-Type');
  });
});

function getTestApplication(): TestApplication {
  if (testApplication === undefined) {
    throw new Error('Test application is not initialized');
  }

  return testApplication;
}
