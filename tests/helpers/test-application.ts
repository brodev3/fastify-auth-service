import 'dotenv/config';

import type { Redis } from 'ioredis';

import { buildApp } from '../../src/app.js';
import { AuthService } from '../../src/application/auth/auth-service.js';
import { Argon2PasswordHasher } from '../../src/infrastructure/security/argon2-password-hasher.js';
import { PrismaUserRepository } from '../../src/infrastructure/database/prisma-user-repository.js';
import { createPrismaInfrastructure } from '../../src/infrastructure/database/prisma.js';
import { RedisRefreshSessionRepository } from '../../src/infrastructure/redis/redis-refresh-session-repository.js';
import { createRedisInfrastructure } from '../../src/infrastructure/redis/redis.js';
import { JwtTokenService } from '../../src/infrastructure/security/jwt-token-service.js';
import { loadConfig } from '../../src/config/env.js';
import type { Environment } from '../../src/config/env.js';
import type { AppInstance } from '../../src/app.js';
import type { AppConfig } from '../../src/config/types.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';

const TEST_ACCESS_SECRET = 'test-access-secret-that-is-at-least-32-characters';
const TEST_REFRESH_SECRET = 'test-refresh-secret-that-is-at-least-32-characters';

export interface TestApplication {
  readonly app: AppInstance;
  readonly authService: AuthService;
  readonly config: AppConfig;
  readonly database: PrismaClient;
  readonly redis: Redis;
  reset(): Promise<void>;
  close(): Promise<void>;
}

export async function createTestApplication(
  environment: Environment = process.env,
): Promise<TestApplication> {
  const databaseUrl = readTestDatabaseUrl(environment);
  const redisUrl = readTestRedisUrl(environment);
  const config = loadConfig({
    ...environment,
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    REDIS_URL: redisUrl,
    JWT_ACCESS_SECRET: TEST_ACCESS_SECRET,
    JWT_REFRESH_SECRET: TEST_REFRESH_SECRET,
    JWT_ISSUER: 'fastify-auth-service-test',
    JWT_ACCESS_AUDIENCE: 'fastify-auth-service-test:access',
    JWT_REFRESH_AUDIENCE: 'fastify-auth-service-test:refresh',
    CORS_ORIGINS: 'http://localhost:3000',
  });
  const prismaInfrastructure = createPrismaInfrastructure(config.database.url);
  const redisInfrastructure = createRedisInfrastructure(config.redis.url);

  try {
    await prismaInfrastructure.lifecycle.connect();
    await prismaInfrastructure.lifecycle.checkHealth();
    await redisInfrastructure.lifecycle.connect();
    await redisInfrastructure.lifecycle.checkHealth();
  } catch (cause) {
    await redisInfrastructure.lifecycle.disconnect();
    await prismaInfrastructure.lifecycle.disconnect();
    throw cause;
  }

  const authService = new AuthService(
    {
      passwordHasher: new Argon2PasswordHasher(),
      tokenService: new JwtTokenService({
        accessSecret: config.jwt.accessSecret,
        refreshSecret: config.jwt.refreshSecret,
        issuer: config.jwt.issuer,
        accessAudience: config.jwt.accessAudience,
        refreshAudience: config.jwt.refreshAudience,
        accessTokenTtlSeconds: config.jwt.accessTokenTtlSeconds,
        refreshTokenTtlSeconds: config.jwt.refreshTokenTtlSeconds,
      }),
      refreshSessionRepository: new RedisRefreshSessionRepository(redisInfrastructure.client),
      userRepository: new PrismaUserRepository(prismaInfrastructure.client),
    },
    config.jwt,
  );
  const app = buildApp(config, {
    authService,
    disableLogger: true,
    rateLimitRedis: redisInfrastructure.client,
  });

  try {
    await app.ready();
  } catch (cause) {
    await app.close();
    await redisInfrastructure.lifecycle.disconnect();
    await prismaInfrastructure.lifecycle.disconnect();
    throw cause;
  }

  return {
    app,
    authService,
    config,
    database: prismaInfrastructure.client,
    redis: redisInfrastructure.client,
    reset: async () => {
      await prismaInfrastructure.client.user.deleteMany();
      await redisInfrastructure.client.flushdb();
    },
    close: async () => {
      await app.close();
      await redisInfrastructure.lifecycle.disconnect();
      await prismaInfrastructure.lifecycle.disconnect();
    },
  };
}

function readTestDatabaseUrl(environment: Environment): string {
  const value = environment['TEST_DATABASE_URL'];

  if (value === undefined || value.trim() === '') {
    throw new Error('TEST_DATABASE_URL is required for integration tests');
  }

  try {
    const url = new URL(value);
    const databaseName = url.pathname.slice(1);

    if (databaseName !== 'fastify_auth_test') {
      throw new Error('unexpected database name');
    }
  } catch {
    throw new Error('TEST_DATABASE_URL must target the fastify_auth_test database');
  }

  return value;
}

function readTestRedisUrl(environment: Environment): string {
  const value = environment['TEST_REDIS_URL'];

  if (value === undefined || value.trim() === '') {
    throw new Error('TEST_REDIS_URL is required for integration tests');
  }

  try {
    const url = new URL(value);

    if (url.pathname !== '/1') {
      throw new Error('unexpected Redis database');
    }
  } catch {
    throw new Error('TEST_REDIS_URL must target Redis database 1');
  }

  return value;
}
