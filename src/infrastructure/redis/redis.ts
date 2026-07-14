import { Redis } from 'ioredis';

import type { StartupDependency } from '../../server.js';

export interface RedisInfrastructure {
  readonly client: Redis;
  readonly lifecycle: StartupDependency;
}

export function createRedisInfrastructure(redisUrl: string): RedisInfrastructure {
  const client = new Redis(redisUrl, {
    connectionName: 'fastify-auth-service',
    connectTimeout: 5_000,
    enableOfflineQueue: false,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: (attempt) => Math.min(attempt * 100, 2_000),
  });

  return {
    client,
    lifecycle: {
      name: 'redis',
      connect: async () => {
        await client.connect();
      },
      checkHealth: async () => {
        await client.ping();
      },
      disconnect: async () => {
        if (client.status === 'ready') {
          try {
            await client.quit();
          } catch {
            client.disconnect();
          }
          return;
        }

        client.disconnect();
      },
    },
  };
}
