import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import type { TestApplication } from '../helpers/test-application.js';
import { createTestApplication } from '../helpers/test-application.js';

let testApplication: TestApplication | undefined;

describe('HTTP error handling', () => {
  beforeAll(async () => {
    testApplication = await createTestApplication();
  });

  beforeEach(async () => {
    await getTestApplication().reset();
  });

  afterAll(async () => {
    await testApplication?.close();
  });

  it('returns safe validation details in the unified error format', async () => {
    const response = await getTestApplication().app.inject({
      method: 'POST',
      url: '/register',
      payload: {
        email: 'not-an-email',
        password: 'password123',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: [
        {
          field: 'body.email',
        },
      ],
    });
  });

  it('does not expose unexpected error details', async () => {
    const application = getTestApplication();
    const app = buildApp(application.config, {
      authService: application.authService,
      disableLogger: true,
      rateLimitRedis: application.redis,
    });
    app.get('/test-unexpected-error', () => {
      throw new Error('database password must not reach the client');
    });

    await app.ready();

    try {
      const response = await app.inject({ method: 'GET', url: '/test-unexpected-error' });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({
        statusCode: 500,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      });
      expect(response.body).not.toContain('database password');
    } finally {
      await app.close();
    }
  });

  it('maps infrastructure connection errors to the safe 503 response', async () => {
    const application = getTestApplication();
    const app = buildApp(application.config, {
      authService: application.authService,
      disableLogger: true,
      rateLimitRedis: application.redis,
    });
    app.get('/test-dependency-error', () => {
      const error = new Error('Connection refused');
      Object.assign(error, { code: 'ECONNREFUSED' });
      throw error;
    });

    await app.ready();

    try {
      const response = await app.inject({ method: 'GET', url: '/test-dependency-error' });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({
        statusCode: 503,
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'Required service is temporarily unavailable',
      });
    } finally {
      await app.close();
    }
  });

  it('returns the unified 404 response for an unknown route', async () => {
    const response = await getTestApplication().app.inject({
      method: 'GET',
      url: '/unknown-route',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      statusCode: 404,
      code: 'ROUTE_NOT_FOUND',
      message: 'Route not found',
    });
  });

  it('preserves safe client status codes for oversized and unsupported payloads', async () => {
    const application = getTestApplication();
    const oversizedResponse = await application.app.inject({
      method: 'POST',
      url: '/login',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({
        email: 'oversized@example.com',
        password: 'x'.repeat(1_100_000),
      }),
    });
    const unsupportedMediaTypeResponse = await application.app.inject({
      method: 'POST',
      url: '/login',
      headers: { 'content-type': 'application/xml' },
      payload: '<login />',
    });

    expect(oversizedResponse.statusCode).toBe(413);
    expect(oversizedResponse.json()).toEqual({
      statusCode: 413,
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Request payload is too large',
    });
    expect(unsupportedMediaTypeResponse.statusCode).toBe(415);
    expect(unsupportedMediaTypeResponse.json()).toEqual({
      statusCode: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message: 'Unsupported media type',
    });
  });
});

function getTestApplication(): TestApplication {
  if (testApplication === undefined) {
    throw new Error('Test application is not initialized');
  }

  return testApplication;
}
