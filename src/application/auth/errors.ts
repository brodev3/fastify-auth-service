export type AuthDependencyName = 'postgresql' | 'redis';

export class DependencyUnavailableError extends Error {
  override readonly name = 'DependencyUnavailableError';
  readonly dependencyName: AuthDependencyName;

  constructor(dependencyName: AuthDependencyName, cause: unknown) {
    super(`Required dependency "${dependencyName}" is unavailable`, { cause });
    this.dependencyName = dependencyName;
  }
}

export class EmailAlreadyExistsError extends Error {
  override readonly name = 'EmailAlreadyExistsError';

  constructor() {
    super('Email is already registered');
  }
}

export class InvalidCredentialsError extends Error {
  override readonly name = 'InvalidCredentialsError';

  constructor() {
    super('Invalid email or password');
  }
}

export class RefreshSessionNotFoundError extends Error {
  override readonly name = 'RefreshSessionNotFoundError';

  constructor() {
    super('Refresh session is not active');
  }
}

export class InvalidRefreshTokenError extends Error {
  override readonly name = 'InvalidRefreshTokenError';

  constructor() {
    super('Invalid refresh token');
  }
}

export class InvalidAccessTokenError extends Error {
  override readonly name = 'InvalidAccessTokenError';

  constructor() {
    super('Invalid access token');
  }
}

export class RefreshSessionIdentifierCollisionError extends Error {
  override readonly name = 'RefreshSessionIdentifierCollisionError';

  constructor() {
    super('Refresh session identifier already exists');
  }
}
