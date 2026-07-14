export type NodeEnvironment = 'development' | 'test' | 'production';

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

export interface AppConfig {
  readonly nodeEnv: NodeEnvironment;
  readonly server: {
    readonly host: string;
    readonly port: number;
    readonly trustProxy: boolean | readonly string[];
  };
  readonly logger: {
    readonly level: LogLevel;
  };
  readonly database: {
    readonly url: string;
  };
  readonly redis: {
    readonly url: string;
  };
  readonly jwt: {
    readonly accessSecret: string;
    readonly refreshSecret: string;
    readonly issuer: string;
    readonly accessAudience: string;
    readonly refreshAudience: string;
    readonly accessTokenTtlSeconds: 900;
    readonly refreshTokenTtlSeconds: 604800;
  };
  readonly cors: {
    readonly origins: readonly string[];
  };
}
