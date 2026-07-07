import { z } from 'zod';

export const HttpRequestPayloadSchema = z.object({
    url: z.string().url(),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('GET'),
    headers: z.record(z.string(), z.string()).optional(),
    body: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
    timeout_ms: z.number().int().min(100).max(60_000).default(5000),
}).strict();

export const QueryDatabasePayloadSchema = z.object({
    query: z.string().min(5),
    params: z.record(
        z.string(),
        z.union([z.string(), z.number(), z.boolean(), z.null()])
    ).optional(),
}).strict().superRefine((value, ctx) => {
    if (/\b(drop|truncate|alter)\b/i.test(value.query)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['query'],
            message: 'Destructive SQL requires an explicit enterprise policy override.',
        });
    }
});
