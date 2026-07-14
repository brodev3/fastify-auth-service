import type { FastifyRequest } from 'fastify';

import { normalizeEmail } from '../../application/auth/auth-service.js';
import type { AuthService } from '../../application/auth/auth-service.js';
import type { AppInstance } from '../../app.js';
import { RegisterRouteSchema } from '../schemas/auth.js';

export function registerRegisterRoute(app: AppInstance, authService: AuthService): void {
  app.post(
    '/register',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 hour',
        },
      },
      schema: RegisterRouteSchema,
      preValidation: normalizeRegisterEmail,
    },
    async (request, reply) => {
      const tokenPair = await authService.register(request.body);
      reply.code(201).send(tokenPair);
    },
  );
}

function normalizeRegisterEmail(request: FastifyRequest): Promise<void> {
  const body = request.body;

  if (isRecord(body) && typeof body['email'] === 'string') {
    body['email'] = normalizeEmail(body['email']);
  }

  return Promise.resolve();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
