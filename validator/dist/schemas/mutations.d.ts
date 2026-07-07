import { z } from 'zod';
export declare const JmpMutationSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    action: z.ZodLiteral<"SPAWN_NODE">;
    node_id: z.ZodString;
    parent_id: z.ZodOptional<z.ZodString>;
    node_type: z.ZodEnum<{
        HTTP_REQUEST: "HTTP_REQUEST";
        QUERY_DATABASE: "QUERY_DATABASE";
    }>;
    dependencies: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"MUTATE_PAYLOAD">;
    node_id: z.ZodString;
    payload: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"YIELD_EXECUTION">;
}, z.core.$strict>], "action">;
//# sourceMappingURL=mutations.d.ts.map