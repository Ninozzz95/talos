import { z } from 'zod';
import { HttpRequestPayloadSchema, QueryDatabasePayloadSchema } from './payloads.js';
import { BrowserCommandSchema } from './browserCommands.js';

export const NodeDefinitionSchema = z.discriminatedUnion('node_type', [
    z.object({
        node_type: z.literal('HTTP_REQUEST'),
        payload: HttpRequestPayloadSchema,
    }),
    z.object({
        node_type: z.literal('QUERY_DATABASE'),
        payload: QueryDatabasePayloadSchema,
    }),
    z.object({
        node_type: z.literal('BROWSER_COMMAND'),
        payload: BrowserCommandSchema,
    }),
]);
