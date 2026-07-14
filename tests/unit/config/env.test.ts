import { describe, expect, it } from 'vitest';

import { ConfigurationError, loadConfig } from '../../../src/config/env.js';

const baseEnvironment = {
  DATABASE_URL: 'postgresql://user:password@localhost:5432/fastify_auth?schema=public',
  REDIS_URL: 'redis://localhost:6379/0',
  JWT_ACCESS_SECRET: 'access-secret-that-is-at-least-32-characters',
  JWT_REFRESH_SECRET: 'refresh-secret-that-is-at-least-32-characters',
  JWT_ISSUER: 'fastify-auth-service-test',
  JWT_ACCESS_AUDIENCE: 'fastify-auth-service-test:access',
  JWT_REFRESH_AUDIENCE: 'fastify-auth-service-test:refresh',
  CORS_ORIGINS: 'http://localhost:3000',
} as const;

describe('loadConfig', () => {
  it('normalizes CORS origins and parses an explicit proxy allowlist', () => {
    const config = loadConfig({
      ...baseEnvironment,
      CORS_ORIGINS: 'http://localhost:3000, https://app.example.com, http://localhost:3000',
      TRUST_PROXY: '127.0.0.1, 10.0.0.0/8',
    });

    expect(config.cors.origins).toEqual(['http://localhost:3000', 'https://app.example.com']);
    expect(config.server.trustProxy).toEqual(['127.0.0.1', '10.0.0.0/8']);
  });

  it('rejects wildcard CORS origins', () => {
    expect(() => loadConfig({ ...baseEnvironment, CORS_ORIGINS: '*' })).toThrow(
      new ConfigurationError('CORS_ORIGINS', 'must be a comma-separated allowlist'),
    );
  });
});
