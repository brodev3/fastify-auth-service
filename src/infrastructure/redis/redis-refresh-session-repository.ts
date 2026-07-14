import type { Redis } from 'ioredis';

import { RefreshSessionIdentifierCollisionError } from '../../application/auth/errors.js';
import type { RefreshSessionRepository } from '../../application/auth/ports.js';
import type { RefreshSession } from '../../application/auth/types.js';

export { RefreshSessionIdentifierCollisionError } from '../../application/auth/errors.js';

const REFRESH_SESSION_KEY_PREFIX = 'auth:refresh:';

const ROTATE_REFRESH_SESSION_SCRIPT = `
local currentUserId = redis.call('GET', KEYS[1])
if currentUserId == false or currentUserId ~= ARGV[1] then
  return 0
end

if redis.call('EXISTS', KEYS[2]) == 1 then
  return 2
end

redis.call('DEL', KEYS[1])
redis.call('SET', KEYS[2], ARGV[1], 'EX', ARGV[2])
return 1
`;

export class RedisRefreshSessionRepository implements RefreshSessionRepository {
  constructor(private readonly redis: Redis) {}

  async create(session: RefreshSession): Promise<void> {
    assertValidTtl(session.ttlSeconds);

    const result = await this.redis.set(
      createRefreshSessionKey(session.jti),
      session.userId,
      'EX',
      session.ttlSeconds,
      'NX',
    );

    if (result !== 'OK') {
      throw new RefreshSessionIdentifierCollisionError();
    }
  }

  async rotate(currentJti: string, nextSession: RefreshSession): Promise<boolean> {
    assertValidTtl(nextSession.ttlSeconds);

    const result = await this.redis.eval(
      ROTATE_REFRESH_SESSION_SCRIPT,
      2,
      createRefreshSessionKey(currentJti),
      createRefreshSessionKey(nextSession.jti),
      nextSession.userId,
      nextSession.ttlSeconds.toString(),
    );

    if (result === 1) return true;
    if (result === 0) return false;
    if (result === 2) throw new RefreshSessionIdentifierCollisionError();

    throw new Error('Refresh session rotation returned an unexpected result');
  }
}

function createRefreshSessionKey(jti: string): string {
  return `${REFRESH_SESSION_KEY_PREFIX}${jti}`;
}

function assertValidTtl(ttlSeconds: number): void {
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new RangeError('Refresh session TTL must be a positive integer');
  }
}
