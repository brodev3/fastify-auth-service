import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/env.js';
import type { AppInstance } from '../../src/app.js';

const config = loadConfig({
  DATABASE_URL: 'postgresql://user:password@localhost:5432/fastify_auth?schema=public',
  REDIS_URL: 'redis://localhost:6379/0',
  JWT_ACCESS_SECRET: 'access-secret-that-is-at-least-32-characters',
  JWT_REFRESH_SECRET: 'refresh-secret-that-is-at-least-32-characters',
  JWT_ISSUER: 'fastify-auth-service-test',
  JWT_ACCESS_AUDIENCE: 'fastify-auth-service-test:access',
  JWT_REFRESH_AUDIENCE: 'fastify-auth-service-test:refresh',
  CORS_ORIGINS: 'http://localhost:3000',
});

let app: AppInstance | undefined;

describe('application logger', () => {
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('redacts authorization, password, and refresh token values', async () => {
    const logSink = new LogSink();
    const authorization = 'Bearer access-token-that-must-not-appear';
    const password = 'password-that-must-not-appear';
    const refreshToken = 'refresh-token-that-must-not-appear';
    app = buildApp(config, { loggerStream: logSink });

    await app.ready();
    app.log.info(
      {
        request: {
          headers: { authorization },
          body: { password, refreshToken },
        },
      },
      'Security redaction test',
    );

    const output = logSink.messages.join('');

    expect(output).not.toContain(authorization);
    expect(output).not.toContain(password);
    expect(output).not.toContain(refreshToken);
    expect(output).toContain('[REDACTED]');
  });
});

class LogSink {
  readonly messages: string[] = [];

  write(message: string): void {
    this.messages.push(message);
  }
}
