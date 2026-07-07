import { z } from 'zod';
export declare const NodeDefinitionSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    node_type: z.ZodLiteral<"HTTP_REQUEST">;
    payload: z.ZodObject<{
        url: z.ZodString;
        method: z.ZodDefault<z.ZodEnum<{
            GET: "GET";
            POST: "POST";
            PUT: "PUT";
            PATCH: "PATCH";
            DELETE: "DELETE";
        }>>;
        headers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
        body: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
        timeout_ms: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strict>;
}, z.core.$strip>, z.ZodObject<{
    node_type: z.ZodLiteral<"QUERY_DATABASE">;
    payload: z.ZodObject<{
        query: z.ZodString;
        params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean, z.ZodNull]>>>;
    }, z.core.$strict>;
}, z.core.$strip>], "node_type">;
//# sourceMappingURL=nodes.d.ts.map