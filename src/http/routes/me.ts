import { InvalidAccessTokenError } from '../../application/auth/errors.js';
import type { AuthService } from '../../application/auth/auth-service.js';
import type { AppInstance } from '../../app.js';
import { MeRouteSchema } from '../schemas/auth.js';
import type { UserResponse } from '../schemas/auth.js';

const BEARER_TOKEN_PATTERN = /^Bearer\s+([^\s]+)$/i;

export function registerMeRoute(app: AppInstance, authService: AuthService): void {
  app.get('/me', { schema: MeRouteSchema }, async (request, reply) => {
    const accessToken = getBearerToken(request.headers.authorization);

    if (accessToken === null) {
      throw new InvalidAccessTokenError();
    }

    const user = await authService.getCurrentUser({ accessToken });
    reply.code(200).send({
      id: user.id,
      email: user.email,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    } satisfies UserResponse);
  });
}

function getBearerToken(authorization: string | undefined): string | null {
  if (authorization === undefined) {
    return null;
  }

  const match = BEARER_TOKEN_PATTERN.exec(authorization);
  return match?.[1] ?? null;
}
