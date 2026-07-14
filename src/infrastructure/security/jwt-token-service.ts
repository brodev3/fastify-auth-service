import { errors, jwtVerify, SignJWT } from 'jose';

import type { TokenService } from '../../application/auth/ports.js';
import type { AccessTokenClaims, RefreshTokenClaims } from '../../application/auth/types.js';

export interface JwtTokenServiceOptions {
  readonly accessSecret: string;
  readonly refreshSecret: string;
  readonly issuer: string;
  readonly accessAudience: string;
  readonly refreshAudience: string;
  readonly accessTokenTtlSeconds: number;
  readonly refreshTokenTtlSeconds: number;
}

const JWT_ALGORITHM = 'HS256';

export class JwtTokenService implements TokenService {
  private readonly accessSecret: Uint8Array;
  private readonly refreshSecret: Uint8Array;

  constructor(private readonly options: JwtTokenServiceOptions) {
    this.accessSecret = new TextEncoder().encode(options.accessSecret);
    this.refreshSecret = new TextEncoder().encode(options.refreshSecret);
  }

  async signAccessToken(userId: string): Promise<string> {
    return new SignJWT({ type: 'access' })
      .setProtectedHeader({ alg: JWT_ALGORITHM, typ: 'JWT' })
      .setSubject(userId)
      .setIssuer(this.options.issuer)
      .setAudience(this.options.accessAudience)
      .setIssuedAt()
      .setExpirationTime(`${String(this.options.accessTokenTtlSeconds)}s`)
      .sign(this.accessSecret);
  }

  async signRefreshToken(userId: string, jti: string): Promise<string> {
    return new SignJWT({ type: 'refresh' })
      .setProtectedHeader({ alg: JWT_ALGORITHM, typ: 'JWT' })
      .setSubject(userId)
      .setJti(jti)
      .setIssuer(this.options.issuer)
      .setAudience(this.options.refreshAudience)
      .setIssuedAt()
      .setExpirationTime(`${String(this.options.refreshTokenTtlSeconds)}s`)
      .sign(this.refreshSecret);
  }

  async verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
    const payload = await this.verify(token, this.accessSecret, this.options.accessAudience);

    if (payload === null || typeof payload['sub'] !== 'string' || payload['type'] !== 'access') {
      return null;
    }

    return { sub: payload['sub'], type: 'access' };
  }

  async verifyRefreshToken(token: string): Promise<RefreshTokenClaims | null> {
    const payload = await this.verify(token, this.refreshSecret, this.options.refreshAudience);

    if (
      payload === null ||
      typeof payload['sub'] !== 'string' ||
      payload['type'] !== 'refresh' ||
      typeof payload['jti'] !== 'string'
    ) {
      return null;
    }

    return { sub: payload['sub'], type: 'refresh', jti: payload['jti'] };
  }

  private async verify(
    token: string,
    secret: Uint8Array,
    audience: string,
  ): Promise<Record<string, unknown> | null> {
    try {
      const result = await jwtVerify(token, secret, {
        algorithms: [JWT_ALGORITHM],
        issuer: this.options.issuer,
        audience,
      });

      return result.payload;
    } catch (error) {
      if (error instanceof errors.JOSEError) {
        return null;
      }

      throw error;
    }
  }
}
