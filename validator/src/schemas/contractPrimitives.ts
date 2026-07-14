import { Buffer } from 'node:buffer';
import { z } from 'zod';

const RawJsonObjectSchema = z.record(z.string(), z.unknown()).superRefine((value, context) => {
  const keys = Object.keys(value);
  if (keys.length > 0 && keys.every((key, index) => key === String(index))) {
    context.addIssue({
      code: 'custom',
      message: 'Sequential numeric-key objects are ambiguous with lists.',
    });
  }
});

export const JsonObjectSchema = z.preprocess(
  (value) => Array.isArray(value) && value.length === 0 ? {} : value,
  RawJsonObjectSchema,
);

export function boundedString(maxBytes: number) {
  return z.string().refine(
    (value) => Buffer.byteLength(value, 'utf8') <= maxBytes,
    `Expected a string of at most ${maxBytes} UTF-8 bytes.`,
  );
}

export function nonEmptyBoundedString(maxBytes: number) {
  return boundedString(maxBytes).refine(
    (value) => value.trim().length > 0,
    'Expected a non-empty string.',
  );
}

export const AbsoluteUriSchema = nonEmptyBoundedString(2048)
  .regex(/^[A-Za-z][A-Za-z0-9+.-]*:[^\s]*$/);

export const ToolNameSchema = nonEmptyBoundedString(128)
  .regex(/^[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,126}[A-Za-z0-9])?$/);
