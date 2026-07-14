import type { FastifySchemaValidationError } from 'fastify';

import {
  DependencyUnavailableError,
  EmailAlreadyExistsError,
  InvalidAccessTokenError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
} from '../application/auth/errors.js';
import type { AppInstance } from '../app.js';
import type { ApiErrorResponse, ErrorDetail } from './schemas/error.js';

export class RateLimitExceededError extends Error {
  override readonly name = 'RateLimitExceededError';

  constructor() {
    super('Rate limit exceeded');
  }
}

export function registerErrorHandler(app: AppInstance): void {
  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send(createErrorResponse(404, 'ROUTE_NOT_FOUND', 'Route not found'));
  });

  app.setErrorHandler((error, request, reply) => {
    const response = mapError(error);

    if (response.statusCode >= 500) {
      request.log.error({ err: error }, 'Request failed unexpectedly');
    }

    reply.code(response.statusCode).send(response);
  });
}

function mapError(error: unknown): ApiErrorResponse {
  if (error instanceof EmailAlreadyExistsError) {
    return createErrorResponse(409, 'AUTH_EMAIL_ALREADY_EXISTS', 'Email is already registered');
  }

  if (error instanceof InvalidCredentialsError) {
    return createErrorResponse(401, 'AUTH_INVALID_CREDENTIALS', 'Invalid email or password');
  }

  if (error instanceof InvalidRefreshTokenError) {
    return createErrorResponse(401, 'AUTH_INVALID_REFRESH_TOKEN', 'Invalid refresh token');
  }

  if (error instanceof InvalidAccessTokenError) {
    return createErrorResponse(401, 'AUTH_INVALID_ACCESS_TOKEN', 'Invalid access token');
  }

  if (error instanceof RateLimitExceededError) {
    return createErrorResponse(429, 'RATE_LIMIT_EXCEEDED', 'Too many requests');
  }

  if (error instanceof DependencyUnavailableError || isDependencyConnectionError(error)) {
    return createErrorResponse(
      503,
      'DEPENDENCY_UNAVAILABLE',
      'Required service is temporarily unavailable',
    );
  }

  if (isValidationError(error)) {
    return {
      ...createErrorResponse(400, 'VALIDATION_ERROR', 'Request validation failed'),
      details: createValidationDetails(error.validation, error.validationContext),
    };
  }

  if (hasStatusCode(error, 400)) {
    return createErrorResponse(400, 'BAD_REQUEST', 'Bad request');
  }

  if (hasStatusCode(error, 413)) {
    return createErrorResponse(413, 'PAYLOAD_TOO_LARGE', 'Request payload is too large');
  }

  if (hasStatusCode(error, 415)) {
    return createErrorResponse(415, 'UNSUPPORTED_MEDIA_TYPE', 'Unsupported media type');
  }

  return createErrorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error');
}

function createErrorResponse(
  statusCode: 400 | 401 | 404 | 409 | 413 | 415 | 429 | 500 | 503,
  code: string,
  message: string,
): ApiErrorResponse {
  return { statusCode, code, message };
}

function createValidationDetails(
  validation: Iterable<FastifySchemaValidationError>,
  context: string | undefined,
): ErrorDetail[] {
  return Array.from(validation)
    .slice(0, 100)
    .map((error) => ({
      field: createValidationField(error, context),
      message: error.message ?? 'Invalid value',
    }));
}

function createValidationField(
  error: FastifySchemaValidationError,
  context: string | undefined,
): string {
  const path = error.instancePath.replaceAll('/', '.').replace(/^\./, '');
  const prefix = context ?? 'request';

  return path === '' ? prefix : `${prefix}.${path}`;
}

function isDependencyConnectionError(error: unknown): boolean {
  if (!isErrorWithMetadata(error)) {
    return false;
  }

  if (typeof error.code === 'string' && DEPENDENCY_CONNECTION_ERROR_CODES.has(error.code)) {
    return true;
  }

  return (
    error.name === 'MaxRetriesPerRequestError' ||
    REDIS_UNAVAILABLE_MESSAGE_PREFIXES.some((prefix) => error.message.startsWith(prefix))
  );
}

const DEPENDENCY_CONNECTION_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ETIMEDOUT',
  'ENOTFOUND',
]);

const REDIS_UNAVAILABLE_MESSAGE_PREFIXES = [
  "Stream isn't writeable",
  'Connection is closed',
  'Command aborted due to connection close',
  'Reached the max retries per request limit',
  'READONLY ',
  'LOADING ',
  'MASTERDOWN ',
  'CLUSTERDOWN ',
] as const;

function isValidationError(error: unknown): error is ErrorWithMetadata & {
  readonly validation: Iterable<FastifySchemaValidationError>;
  readonly validationContext?: string;
} {
  return (
    isErrorWithMetadata(error) &&
    error.validation !== undefined &&
    isIterable<FastifySchemaValidationError>(error.validation)
  );
}

function hasStatusCode(error: unknown, statusCode: number): boolean {
  return isErrorWithMetadata(error) && error.statusCode === statusCode;
}

interface ErrorWithMetadata extends Error {
  readonly code?: unknown;
  readonly statusCode?: unknown;
  readonly validation?: unknown;
  readonly validationContext?: unknown;
}

function isErrorWithMetadata(value: unknown): value is ErrorWithMetadata {
  return value instanceof Error;
}

function isIterable<Value>(value: unknown): value is Iterable<Value> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Symbol.iterator in value &&
    typeof value[Symbol.iterator] === 'function'
  );
}
