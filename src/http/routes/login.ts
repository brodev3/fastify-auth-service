import type { FastifyRequest } from 'fastify';

import { normalizeEmail } from '../../application/auth/auth-service.js';
import type { AuthService } from '../../application/auth/auth-service.js';
import type { AppInstance } from '../../app.js';
import { LoginRouteSchema } from '../schemas/auth.js';

export function registerLoginRoute(app: AppInstance, authService: AuthService): void {
  app.post(
    '/login',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '15 minutes',
        },
      },
      schema: LoginRouteSchema,
      preValidation: normalizeLoginEmail,
    },
    async (request, reply) => {
      const tokenPair = await authService.login(request.body);
      reply.code(200).send(tokenPair);
    },
  );
}

function normalizeLoginEmail(request: FastifyRequest): Promise<void> {
  const body = request.body;

  if (isRecord(body) && typeof body['email'] === 'string') {
    body['email'] = normalizeEmail(body['email']);
  }

  return Promise.resolve();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
