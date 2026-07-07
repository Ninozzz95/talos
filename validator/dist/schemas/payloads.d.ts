import { z } from 'zod';
export declare const HttpRequestPayloadSchema: z.ZodObject<{
    url: z.ZodString;
    method: z.ZodDefault<z.ZodEnum<{
        GET: "GET";
        POST: "POST";
        PUT: "PUT";
        PATCH: "PATCH";
        DELETE: "DELETE";
    }>>;
    headers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    body: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodRecord<z.ZodString, z.ZodAny>]>>;
    timeout_ms: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export declare const QueryDatabasePayloadSchema: z.ZodObject<{
    query: z.ZodString;
    params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean, z.ZodNull]>>>;
}, z.core.$strip>;
//# sourceMappingURL=payloads.d.ts.map