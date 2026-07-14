import { Type } from 'typebox';
import type { Static } from 'typebox';

const STRICT_OBJECT = { additionalProperties: false } as const;

export const ErrorDetailSchema = Type.Object(
  {
    field: Type.String({ minLength: 1 }),
    message: Type.String({ minLength: 1 }),
  },
  STRICT_OBJECT,
);

export const ApiErrorResponseSchema = Type.Object(
  {
    statusCode: Type.Integer({ minimum: 400, maximum: 599 }),
    code: Type.String({ minLength: 1, maxLength: 100, pattern: '^[A-Z][A-Z0-9_]*$' }),
    message: Type.String({ minLength: 1, maxLength: 500 }),
    details: Type.Optional(Type.Array(ErrorDetailSchema, { maxItems: 100 })),
  },
  STRICT_OBJECT,
);

export type ErrorDetail = Static<typeof ErrorDetailSchema>;
export type ApiErrorResponse = Static<typeof ApiErrorResponseSchema>;
