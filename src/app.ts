import type { AuthService } from './application/auth/auth-service.js';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { TypeBoxValidatorCompiler, type TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import Fastify from 'fastify';
import type { Redis } from 'ioredis';

import { registerRegisterRoute } from './http/routes/register.js';
import { registerLoginRoute } from './http/routes/login.js';
import { registerMeRoute } from './http/routes/me.js';
import { registerRefreshRoute } from './http/routes/refresh.js';
import { RateLimitExceededError, registerErrorHandler } from './http/error-handler.js';
import type { AppConfig } from './config/types.js';

export interface BuildAppOptions {
  readonly authService?: AuthService;
  readonly disableLogger?: boolean;
  readonly loggerStream?: LoggerStream;
  readonly rateLimitRedis?: Redis;
}

export interface LoggerStream {
  write(message: string): void;
}

const REDACTED_LOG_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body.password',
  'req.body.refreshToken',
  'request.headers.authorization',
  'request.headers.cookie',
  'request.body.password',
  'request.body.refreshToken',
  '*.accessToken',
  '*.password',
  '*.refreshToken',
] as const;

export function buildApp(config: AppConfig, options: BuildAppOptions = {}) {
  if (options.authService !== undefined && options.rateLimitRedis === undefined) {
    throw new Error('rateLimitRedis is required when authService is configured');
  }

  const trustProxy =
    typeof config.server.trustProxy === 'boolean'
      ? config.server.trustProxy
      : [...config.server.trustProxy];

  const app = Fastify({
    logger:
      options.disableLogger === true ? false : createLoggerOptions(config, options.loggerStream),
    trustProxy,
  })
    .setValidatorCompiler(TypeBoxValidatorCompiler)
    .withTypeProvider<TypeBoxTypeProvider>();

  registerErrorHandler(app);

  app.register(cors, {
    origin: [...config.cors.origins],
    methods: ['GET', 'POST'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    credentials: false,
    strictPreflight: true,
  });

  if (options.authService !== undefined) {
    const authService = options.authService;
    const rateLimitRedis = options.rateLimitRedis;

    app.register(rateLimit, {
      global: false,
      redis: rateLimitRedis,
      nameSpace: 'auth:rate-limit:',
      skipOnError: false,
      keyGenerator: (request) => request.ip,
      errorResponseBuilder: () => new RateLimitExceededError(),
    });

    // Route-level limit hooks are attached by the plugin's onRoute hook.
    app.after((error) => {
      if (error !== null) {
        throw error;
      }

      registerRegisterRoute(app, authService);
      registerLoginRoute(app, authService);
      registerRefreshRoute(app, authService);
      registerMeRoute(app, authService);
    });
  }

  return app;
}

export type AppInstance = ReturnType<typeof buildApp>;

function createLoggerOptions(config: AppConfig, loggerStream: LoggerStream | undefined) {
  const loggerOptions = {
    level: config.logger.level,
    redact: {
      censor: '[REDACTED]',
      paths: [...REDACTED_LOG_PATHS],
    },
  };

  return loggerStream === undefined ? loggerOptions : { ...loggerOptions, stream: loggerStream };
}
