import { randomUUID } from 'node:crypto';

import {
  DependencyUnavailableError,
  EmailAlreadyExistsError,
  InvalidAccessTokenError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  RefreshSessionIdentifierCollisionError,
  RefreshSessionNotFoundError,
} from './errors.js';
import type {
  PasswordHasher,
  RefreshSessionRepository,
  TokenService,
  UserRepository,
} from './ports.js';
import type {
  LoginInput,
  AccessTokenInput,
  PublicUser,
  RefreshInput,
  RefreshRotationInput,
  RefreshSession,
  RegisterInput,
  TokenPair,
} from './types.js';

export interface AuthServiceDependencies {
  readonly passwordHasher: PasswordHasher;
  readonly tokenService: TokenService;
  readonly refreshSessionRepository: RefreshSessionRepository;
  readonly userRepository: UserRepository;
}

export interface AuthServiceOptions {
  readonly accessTokenTtlSeconds: 900;
  readonly refreshTokenTtlSeconds: 604800;
}

export class AuthService {
  constructor(
    private readonly dependencies: AuthServiceDependencies,
    private readonly options: AuthServiceOptions,
  ) {
    assertPositiveInteger('accessTokenTtlSeconds', options.accessTokenTtlSeconds);
    assertPositiveInteger('refreshTokenTtlSeconds', options.refreshTokenTtlSeconds);
  }

  async createTokenPair(userId: string): Promise<TokenPair> {
    const { refreshSession, tokenPair } = await this.createTokenPairWithRefreshSession(userId);

    try {
      await this.dependencies.refreshSessionRepository.create(refreshSession);
    } catch (cause) {
      if (cause instanceof RefreshSessionIdentifierCollisionError) {
        throw cause;
      }

      throw new DependencyUnavailableError('redis', cause);
    }

    return tokenPair;
  }

  async register(input: RegisterInput): Promise<TokenPair> {
    const email = normalizeEmail(input.email);
    const existingUser = await this.usePostgresql(() =>
      this.dependencies.userRepository.findByEmail(email),
    );

    if (existingUser !== null) {
      throw new EmailAlreadyExistsError();
    }

    const passwordHash = await this.dependencies.passwordHasher.hash(input.password);

    try {
      return await this.dependencies.userRepository.withTransaction(async (userRepository) => {
        const user = await userRepository.create({ email, passwordHash });
        return this.createTokenPair(user.id);
      });
    } catch (cause) {
      if (
        cause instanceof DependencyUnavailableError ||
        cause instanceof EmailAlreadyExistsError ||
        cause instanceof RefreshSessionIdentifierCollisionError
      ) {
        throw cause;
      }

      throw new DependencyUnavailableError('postgresql', cause);
    }
  }

  async login(input: LoginInput): Promise<TokenPair> {
    const email = normalizeEmail(input.email);
    const user = await this.usePostgresql(() =>
      this.dependencies.userRepository.findByEmail(email),
    );

    if (user === null) {
      await this.dependencies.passwordHasher.hash(input.password);
      throw new InvalidCredentialsError();
    }

    const passwordMatches = await this.dependencies.passwordHasher.verify(
      input.password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      throw new InvalidCredentialsError();
    }

    return this.createTokenPair(user.id);
  }

  async rotateTokenPair(input: RefreshRotationInput): Promise<TokenPair> {
    const { refreshSession, tokenPair } = await this.createTokenPairWithRefreshSession(
      input.userId,
    );

    let rotated: boolean;

    try {
      rotated = await this.dependencies.refreshSessionRepository.rotate(
        input.currentJti,
        refreshSession,
      );
    } catch (cause) {
      if (cause instanceof RefreshSessionIdentifierCollisionError) {
        throw cause;
      }

      throw new DependencyUnavailableError('redis', cause);
    }

    if (!rotated) {
      throw new RefreshSessionNotFoundError();
    }

    return tokenPair;
  }

  async refresh(input: RefreshInput): Promise<TokenPair> {
    const claims = await this.dependencies.tokenService.verifyRefreshToken(input.refreshToken);

    if (claims === null) {
      throw new InvalidRefreshTokenError();
    }

    try {
      return await this.rotateTokenPair({ currentJti: claims.jti, userId: claims.sub });
    } catch (cause) {
      if (cause instanceof RefreshSessionNotFoundError) {
        throw new InvalidRefreshTokenError();
      }

      throw cause;
    }
  }

  async getCurrentUser(input: AccessTokenInput): Promise<PublicUser> {
    const claims = await this.dependencies.tokenService.verifyAccessToken(input.accessToken);

    if (claims === null) {
      throw new InvalidAccessTokenError();
    }

    const user = await this.usePostgresql(() =>
      this.dependencies.userRepository.findById(claims.sub),
    );

    if (user === null) {
      throw new InvalidAccessTokenError();
    }

    return {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private async createTokenPairWithRefreshSession(
    userId: string,
  ): Promise<{ readonly refreshSession: RefreshSession; readonly tokenPair: TokenPair }> {
    const refreshSessionId = randomUUID();
    const [accessToken, refreshToken] = await Promise.all([
      this.dependencies.tokenService.signAccessToken(userId),
      this.dependencies.tokenService.signRefreshToken(userId, refreshSessionId),
    ]);

    return {
      refreshSession: {
        jti: refreshSessionId,
        userId,
        ttlSeconds: this.options.refreshTokenTtlSeconds,
      },
      tokenPair: {
        accessToken,
        refreshToken,
        tokenType: 'Bearer',
        accessTokenExpiresIn: this.options.accessTokenTtlSeconds,
        refreshTokenExpiresIn: this.options.refreshTokenTtlSeconds,
      },
    };
  }

  private async usePostgresql<Result>(operation: () => Promise<Result>): Promise<Result> {
    try {
      return await operation();
    } catch (cause) {
      throw new DependencyUnavailableError('postgresql', cause);
    }
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer`);
  }
}
