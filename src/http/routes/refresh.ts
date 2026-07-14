import type { AuthService } from '../../application/auth/auth-service.js';
import type { AppInstance } from '../../app.js';
import { RefreshRouteSchema } from '../schemas/auth.js';

export function registerRefreshRoute(app: AppInstance, authService: AuthService): void {
  app.post('/refresh', { schema: RefreshRouteSchema }, async (request, reply) => {
    const tokenPair = await authService.refresh(request.body);
    reply.code(200).send(tokenPair);
  });
}
