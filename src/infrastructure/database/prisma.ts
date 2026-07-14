import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../../generated/prisma/client.js';
import type { StartupDependency } from '../../server.js';

export interface PrismaInfrastructure {
  readonly client: PrismaClient;
  readonly lifecycle: StartupDependency;
}

export function createPrismaInfrastructure(databaseUrl: string): PrismaInfrastructure {
  const adapter = new PrismaPg({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5_000,
  });
  const client = new PrismaClient({ adapter });

  return {
    client,
    lifecycle: {
      name: 'postgresql',
      connect: async () => {
        await client.$connect();
      },
      checkHealth: async () => {
        await client.$queryRaw`SELECT 1`;
      },
      disconnect: async () => {
        await client.$disconnect();
      },
    },
  };
}
