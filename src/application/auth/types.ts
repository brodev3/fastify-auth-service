export interface UserRecord {
  readonly id: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface PublicUser {
  readonly id: string;
  readonly email: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateUserInput {
  readonly email: string;
  readonly passwordHash: string;
}

export interface RegisterInput {
  readonly email: string;
  readonly password: string;
}

export interface LoginInput {
  readonly email: string;
  readonly password: string;
}

export interface RefreshRotationInput {
  readonly currentJti: string;
  readonly userId: string;
}

export interface RefreshInput {
  readonly refreshToken: string;
}

export interface AccessTokenInput {
  readonly accessToken: string;
}

export interface TokenPair {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly tokenType: 'Bearer';
  readonly accessTokenExpiresIn: 900;
  readonly refreshTokenExpiresIn: 604800;
}

export interface AccessTokenClaims {
  readonly sub: string;
  readonly type: 'access';
}

export interface RefreshTokenClaims {
  readonly sub: string;
  readonly type: 'refresh';
  readonly jti: string;
}

export interface RefreshSession {
  readonly jti: string;
  readonly userId: string;
  readonly ttlSeconds: number;
}
