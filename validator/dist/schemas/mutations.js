import { z } from 'zod';
export const JmpMutationSchema = z.discriminatedUnion('action', [
    z.object({
        action: z.literal('SPAWN_NODE'),
        node_id: z.string().min(1),
        parent_id: z.string().min(1).optional(),
        node_type: z.enum(['HTTP_REQUEST', 'QUERY_DATABASE']),
        dependencies: z.array(z.string().min(1)).optional(),
    }),
    z.object({
        action: z.literal('MUTATE_PAYLOAD'),
        node_id: z.string().min(1),
        payload: z.record(z.string(), z.any()),
    }),
    z.object({
        action: z.literal('YIELD_EXECUTION'),
    }).strict(),
]);
//# sourceMappingURL=mutations.js.map