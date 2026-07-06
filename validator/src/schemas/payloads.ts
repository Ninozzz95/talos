import { z } from 'zod';

export const HttpRequestPayloadSchema = z.object({
    url: z.string().url(),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('GET'),
    headers: z.record(z.string(), z.string()).optional(),
    body: z.union([z.string(), z.record(z.string(), z.any())]).optional(),
    timeout_ms: z.number().int().positive().default(5000),
});

export const QueryDatabasePayloadSchema = z.object({
    query: z.string().min(5),
    params: z.record(
        z.string(),
        z.union([z.string(), z.number(), z.boolean(), z.null()])
    ).optional(),
});
