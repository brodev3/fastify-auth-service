import type { AppConfig } from './types.js';

export type { AppConfig, LogLevel, NodeEnvironment } from './types.js';

export type Environment = Readonly<Record<string, string | undefined>>;

export class ConfigurationError extends Error {
  override readonly name = 'ConfigurationError';
  readonly key: string;

  constructor(key: string, message: string) {
    super(`Invalid environment variable ${key}: ${message}`);
    this.key = key;
  }
}

const NODE_ENVIRONMENTS = ['development', 'test', 'production'] as const;
const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

export function loadConfig(environment: Environment = process.env): AppConfig {
  const nodeEnv = readEnum(environment, 'NODE_ENV', NODE_ENVIRONMENTS, 'development');
  const accessSecret = readRequired(environment, 'JWT_ACCESS_SECRET');
  const refreshSecret = readRequired(environment, 'JWT_REFRESH_SECRET');
  const accessAudience = readRequired(environment, 'JWT_ACCESS_AUDIENCE');
  const refreshAudience = readRequired(environment, 'JWT_REFRESH_AUDIENCE');

  validateSecret('JWT_ACCESS_SECRET', accessSecret);
  validateSecret('JWT_REFRESH_SECRET', refreshSecret);

  if (accessSecret === refreshSecret) {
    throw new ConfigurationError('JWT_REFRESH_SECRET', 'must be different from JWT_ACCESS_SECRET');
  }

  if (accessAudience === refreshAudience) {
    throw new ConfigurationError(
      'JWT_REFRESH_AUDIENCE',
      'must be different from JWT_ACCESS_AUDIENCE',
    );
  }

  return {
    nodeEnv,
    server: {
      host: readOptional(environment, 'HOST') ?? '0.0.0.0',
      port: readPort(environment),
      trustProxy: readTrustProxy(environment),
    },
    logger: {
      level: readEnum(environment, 'LOG_LEVEL', LOG_LEVELS, 'info'),
    },
    database: {
      url: readUrl(environment, 'DATABASE_URL', ['postgres:', 'postgresql:']),
    },
    redis: {
      url: readUrl(environment, 'REDIS_URL', ['redis:', 'rediss:']),
    },
    jwt: {
      accessSecret,
      refreshSecret,
      issuer: readRequired(environment, 'JWT_ISSUER'),
      accessAudience,
      refreshAudience,
      accessTokenTtlSeconds: 900,
      refreshTokenTtlSeconds: 604800,
    },
    cors: {
      origins: readCorsOrigins(environment),
    },
  };
}

function readOptional(environment: Environment, key: string): string | undefined {
  const value = environment[key]?.trim();
  return value === undefined || value === '' ? undefined : value;
}

function readRequired(environment: Environment, key: string): string {
  const value = readOptional(environment, key);

  if (value === undefined) {
    throw new ConfigurationError(key, 'is required');
  }

  return value;
}

function readEnum<const Values extends readonly string[]>(
  environment: Environment,
  key: string,
  allowedValues: Values,
  defaultValue: Values[number],
): Values[number] {
  const value = readOptional(environment, key) ?? defaultValue;

  if (!(allowedValues as readonly string[]).includes(value)) {
    throw new ConfigurationError(key, `must be one of: ${allowedValues.join(', ')}`);
  }

  return value;
}

function readPort(environment: Environment): number {
  const rawPort = readOptional(environment, 'PORT');

  if (rawPort === undefined) {
    return 3000;
  }

  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigurationError('PORT', 'must be an integer between 1 and 65535');
  }

  return port;
}

function readUrl(
  environment: Environment,
  key: string,
  allowedProtocols: readonly string[],
): string {
  const value = readRequired(environment, key);

  try {
    const url = new URL(value);
    if (!allowedProtocols.includes(url.protocol)) {
      throw new Error('invalid protocol');
    }
  } catch {
    throw new ConfigurationError(key, `must be a valid ${allowedProtocols.join(' or ')} URL`);
  }

  return value;
}

function readCorsOrigins(environment: Environment): readonly string[] {
  const origins = readRequired(environment, 'CORS_ORIGINS')
    .split(',')
    .map((value) => value.trim());

  if (origins.some((origin) => origin === '' || origin === '*')) {
    throw new ConfigurationError('CORS_ORIGINS', 'must be a comma-separated allowlist');
  }

  return [...new Set(origins.map(parseCorsOrigin))];
}

function parseCorsOrigin(origin: string): string {
  try {
    const url = new URL(origin);
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.username !== '' ||
      url.password !== '' ||
      url.pathname !== '/' ||
      url.search !== '' ||
      url.hash !== ''
    ) {
      throw new Error('invalid origin');
    }

    return url.origin;
  } catch {
    throw new ConfigurationError('CORS_ORIGINS', 'must contain only valid HTTP(S) origins');
  }
}

function readTrustProxy(environment: Environment): boolean | readonly string[] {
  const value = readOptional(environment, 'TRUST_PROXY') ?? 'false';

  if (value.toLowerCase() === 'false') return false;
  if (value.toLowerCase() === 'true') return true;

  const trustedProxies = value.split(',').map((entry) => entry.trim());
  if (trustedProxies.some((entry) => entry === '')) {
    throw new ConfigurationError(
      'TRUST_PROXY',
      'must be true, false, or a comma-separated proxy allowlist',
    );
  }

  return [...new Set(trustedProxies)];
}

function validateSecret(key: string, value: string): void {
  if (value.length < 32) {
    throw new ConfigurationError(key, 'must contain at least 32 characters');
  }
}
