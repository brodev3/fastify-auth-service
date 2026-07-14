import type {
  AccessTokenClaims,
  CreateUserInput,
  RefreshSession,
  RefreshTokenClaims,
  UserRecord,
} from './types.js';

export interface UserPersistence {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  create(input: CreateUserInput): Promise<UserRecord>;
}

export interface UserRepository extends UserPersistence {
  withTransaction<Result>(
    operation: (repository: UserPersistence) => Promise<Result>,
  ): Promise<Result>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, passwordHash: string): Promise<boolean>;
}

export interface TokenService {
  signAccessToken(userId: string): Promise<string>;
  signRefreshToken(userId: string, jti: string): Promise<string>;
  verifyAccessToken(token: string): Promise<AccessTokenClaims | null>;
  verifyRefreshToken(token: string): Promise<RefreshTokenClaims | null>;
}

export interface RefreshSessionRepository {
  create(session: RefreshSession): Promise<void>;
  rotate(currentJti: string, nextSession: RefreshSession): Promise<boolean>;
}
