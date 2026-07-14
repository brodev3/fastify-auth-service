import { describe, expect, it } from 'vitest';

import { createTestApplication } from '../helpers/test-application.js';

const baseEnvironment = {
  TEST_DATABASE_URL: 'postgresql://user:password@localhost:5432/fastify_auth_test?schema=public',
  TEST_REDIS_URL: 'redis://localhost:6379/1',
} as const;

describe('integration test infrastructure guard', () => {
  it('rejects a database URL outside fastify_auth_test before connecting', async () => {
    await expect(
      createTestApplication({
        ...baseEnvironment,
        TEST_DATABASE_URL: 'postgresql://user:password@localhost:5432/fastify_auth?schema=public',
      }),
    ).rejects.toThrow('TEST_DATABASE_URL must target the fastify_auth_test database');
  });

  it('rejects a Redis URL outside database 1 before connecting', async () => {
    await expect(
      createTestApplication({
        ...baseEnvironment,
        TEST_REDIS_URL: 'redis://localhost:6379/0',
      }),
    ).rejects.toThrow('TEST_REDIS_URL must target Redis database 1');
  });
});
