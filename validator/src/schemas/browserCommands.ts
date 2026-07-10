import { z } from 'zod';

const CommandIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const UuidSchema = z.string().uuid();
const Sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const IdempotencyKeySchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const CommonFields = {
  schema_version: z.literal('talos_browser_command_v1'),
  command_id: CommandIdSchema,
  run_id: UuidSchema,
  node_id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  browser_session_id: UuidSchema,
  observation_request: z.array(z.enum(['snapshot', 'screenshot', 'read'])).max(3),
  risk: z.literal('read'),
  idempotency_key: IdempotencyKeySchema,
};

const HttpUrlSchema = z.string().url().refine((value) => {
  try {
    const scheme = new URL(value).protocol;
    return scheme === 'http:' || scheme === 'https:';
  } catch {
    return false;
  }
}, 'Only HTTP and HTTPS navigation is supported.');

const UnicodeRefSchema = z.string().refine((value) => {
  const length = Array.from(value).length;
  return length >= 1 && length <= 128;
}, 'Read ref must contain between 1 and 128 Unicode characters.');
const UnicodeQuerySchema = z.string().refine((value) => {
  const length = Array.from(value).length;
  return length >= 1 && length <= 512;
}, 'Read query must contain between 1 and 512 Unicode characters.');

export const BrowserCommandSchema = z.discriminatedUnion('operation', [
  z.object({ ...CommonFields, operation: z.literal('navigate'), arguments: z.object({ url: HttpUrlSchema }).strict(), expected_evidence_hash: z.null() }).strict(),
  z.object({ ...CommonFields, operation: z.literal('snapshot'), arguments: z.object({}).strict(), expected_evidence_hash: z.null() }).strict(),
  z.object({ ...CommonFields, operation: z.literal('screenshot'), arguments: z.object({}).strict(), expected_evidence_hash: z.null() }).strict(),
  z.object({
    ...CommonFields,
    operation: z.literal('read'),
    arguments: z.object({ ref: UnicodeRefSchema.optional(), query: UnicodeQuerySchema.optional() })
      .strict()
      .refine((value) => value.ref !== undefined || value.query !== undefined, 'Read requires a ref or query.'),
    expected_evidence_hash: Sha256Schema,
  }).strict(),
]);

export type BrowserCommand = z.infer<typeof BrowserCommandSchema>;
