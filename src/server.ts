import type { FastifyInstance } from 'fastify';

import type { AppConfig } from './config/types.js';

export interface StartupDependency {
  readonly name: string;
  connect(): Promise<void>;
  checkHealth(): Promise<void>;
  disconnect(): Promise<void>;
}

export interface StartServerOptions {
  readonly app: FastifyInstance;
  readonly config: AppConfig;
  readonly dependencies: readonly StartupDependency[];
  readonly registerSignalHandlers?: boolean;
}

export interface RunningServer {
  readonly app: FastifyInstance;
  close(): Promise<void>;
}

export class StartupDependencyError extends Error {
  override readonly name = 'StartupDependencyError';
  readonly dependencyName: string;

  constructor(dependencyName: string, cause: unknown) {
    super(`Required dependency "${dependencyName}" is unavailable`, { cause });
    this.dependencyName = dependencyName;
  }
}

const SHUTDOWN_SIGNALS: readonly NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

export async function startServer(options: StartServerOptions): Promise<RunningServer> {
  const connectedDependencies: StartupDependency[] = [];

  try {
    for (const dependency of options.dependencies) {
      connectedDependencies.push(dependency);

      try {
        await dependency.connect();
        await dependency.checkHealth();
      } catch (cause) {
        throw new StartupDependencyError(dependency.name, cause);
      }
    }

    await options.app.listen({
      host: options.config.server.host,
      port: options.config.server.port,
    });
  } catch (startupError) {
    try {
      await closeResources(options.app, connectedDependencies);
    } catch (cleanupError) {
      throw new AggregateError(
        [startupError, cleanupError],
        'Server startup failed and resource cleanup was incomplete',
        { cause: cleanupError },
      );
    }

    throw startupError;
  }

  const signalHandlers = new Map<NodeJS.Signals, () => void>();
  let closePromise: Promise<void> | undefined;

  const removeSignalHandlers = (): void => {
    for (const [signal, handler] of signalHandlers) {
      process.removeListener(signal, handler);
    }
    signalHandlers.clear();
  };

  const close = (): Promise<void> => {
    closePromise ??= (async () => {
      removeSignalHandlers();
      await closeResources(options.app, connectedDependencies);
    })();

    return closePromise;
  };

  if (options.registerSignalHandlers !== false) {
    for (const signal of SHUTDOWN_SIGNALS) {
      const handler = (): void => {
        options.app.log.info({ signal }, 'Shutdown signal received');

        void close().catch((error: unknown) => {
          options.app.log.error(
            {
              errorName: error instanceof Error ? error.name : 'UnknownError',
              signal,
            },
            'Graceful shutdown failed',
          );
          process.exitCode = 1;
        });
      };

      signalHandlers.set(signal, handler);
      process.once(signal, handler);
    }
  }

  return {
    app: options.app,
    close,
  };
}

async function closeResources(
  app: FastifyInstance,
  dependencies: readonly StartupDependency[],
): Promise<void> {
  const errors: unknown[] = [];

  try {
    await app.close();
  } catch (error) {
    errors.push(error);
  }

  for (const dependency of [...dependencies].reverse()) {
    try {
      await dependency.disconnect();
    } catch (error) {
      errors.push(error);
    }
  }

  if (errors.length > 0) {
    throw new AggregateError(errors, 'One or more resources failed to close');
  }
}
