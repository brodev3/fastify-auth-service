import { Type } from 'typebox';
import type { Static } from 'typebox';

import { ApiErrorResponseSchema } from './error.js';

const STRICT_OBJECT = { additionalProperties: false } as const;
const MAX_JWT_LENGTH = 4096;

export const EmailSchema = Type.String({
  format: 'email',
  minLength: 3,
  maxLength: 320,
});

export const PasswordSchema = Type.String({ minLength: 8, maxLength: 128 });

export const RegisterBodySchema = Type.Object(
  {
    email: EmailSchema,
    password: PasswordSchema,
  },
  STRICT_OBJECT,
);

export const LoginBodySchema = Type.Object(
  {
    email: EmailSchema,
    password: PasswordSchema,
  },
  STRICT_OBJECT,
);

export const RefreshBodySchema = Type.Object(
  {
    refreshToken: Type.String({ minLength: 1, maxLength: MAX_JWT_LENGTH }),
  },
  STRICT_OBJECT,
);

export const TokenPairResponseSchema = Type.Object(
  {
    accessToken: Type.String({ minLength: 1 }),
    refreshToken: Type.String({ minLength: 1 }),
    tokenType: Type.Literal('Bearer'),
    accessTokenExpiresIn: Type.Literal(900),
    refreshTokenExpiresIn: Type.Literal(604800),
  },
  STRICT_OBJECT,
);

export const UserResponseSchema = Type.Object(
  {
    id: Type.String({ format: 'uuid' }),
    email: EmailSchema,
    createdAt: Type.String({ format: 'date-time' }),
    updatedAt: Type.String({ format: 'date-time' }),
  },
  STRICT_OBJECT,
);

export const RegisterRouteSchema = {
  body: RegisterBodySchema,
  response: {
    201: TokenPairResponseSchema,
    400: ApiErrorResponseSchema,
    409: ApiErrorResponseSchema,
    413: ApiErrorResponseSchema,
    415: ApiErrorResponseSchema,
    429: ApiErrorResponseSchema,
    500: ApiErrorResponseSchema,
    503: ApiErrorResponseSchema,
  },
} as const;

export const LoginRouteSchema = {
  body: LoginBodySchema,
  response: {
    200: TokenPairResponseSchema,
    400: ApiErrorResponseSchema,
    401: ApiErrorResponseSchema,
    413: ApiErrorResponseSchema,
    415: ApiErrorResponseSchema,
    429: ApiErrorResponseSchema,
    500: ApiErrorResponseSchema,
    503: ApiErrorResponseSchema,
  },
} as const;

export const RefreshRouteSchema = {
  body: RefreshBodySchema,
  response: {
    200: TokenPairResponseSchema,
    400: ApiErrorResponseSchema,
    401: ApiErrorResponseSchema,
    413: ApiErrorResponseSchema,
    415: ApiErrorResponseSchema,
    500: ApiErrorResponseSchema,
    503: ApiErrorResponseSchema,
  },
} as const;

export const MeRouteSchema = {
  response: {
    200: UserResponseSchema,
    401: ApiErrorResponseSchema,
    500: ApiErrorResponseSchema,
    503: ApiErrorResponseSchema,
  },
} as const;

export type RegisterBody = Static<typeof RegisterBodySchema>;
export type LoginBody = Static<typeof LoginBodySchema>;
export type RefreshBody = Static<typeof RefreshBodySchema>;
export type TokenPairResponse = Static<typeof TokenPairResponseSchema>;
export type UserResponse = Static<typeof UserResponseSchema>;
