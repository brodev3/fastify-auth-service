import { buildApp } from './app.js';
import { AuthService } from './application/auth/auth-service.js';
import { loadConfig } from './config/env.js';
import { PrismaUserRepository } from './infrastructure/database/prisma-user-repository.js';
import { createPrismaInfrastructure } from './infrastructure/database/prisma.js';
import { RedisRefreshSessionRepository } from './infrastructure/redis/redis-refresh-session-repository.js';
import { createRedisInfrastructure } from './infrastructure/redis/redis.js';
import { Argon2PasswordHasher } from './infrastructure/security/argon2-password-hasher.js';
import { JwtTokenService } from './infrastructure/security/jwt-token-service.js';
import { startServer } from './server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const prismaInfrastructure = createPrismaInfrastructure(config.database.url);
  const redisInfrastructure = createRedisInfrastructure(config.redis.url);
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
    rateLimitRedis: redisInfrastructure.client,
  });

  await startServer({
    app,
    config,
    dependencies: [prismaInfrastructure.lifecycle, redisInfrastructure.lifecycle],
  });
}

void main().catch((error: unknown) => {
  const errorName = error instanceof Error ? error.name : 'UnknownError';
  process.stderr.write(`Server startup failed (${errorName})\n`);
  process.exitCode = 1;
});
