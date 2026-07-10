import { z } from 'zod';

const NodeIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

export const JmpMutationSchema = z.discriminatedUnion('action', [
    z.object({
        action: z.literal('SPAWN_NODE'),
        node_id: NodeIdSchema,
        parent_id: NodeIdSchema.optional(),
        node_type: z.enum(['HTTP_REQUEST', 'QUERY_DATABASE', 'BROWSER_COMMAND']),
        dependencies: z.array(NodeIdSchema).default([]),
    }).strict(),
    z.object({
        action: z.literal('MUTATE_PAYLOAD'),
        node_id: NodeIdSchema,
        payload: z.record(z.string(), z.unknown()),
    }).strict(),
    z.object({
        action: z.literal('YIELD_EXECUTION'),
    }).strict(),
]);
