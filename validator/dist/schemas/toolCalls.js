import { z } from 'zod';
import { boundedString, JsonObjectSchema, nonEmptyBoundedString } from './contractPrimitives.js';
export const ProviderToolCallSchema = z.object({
    schema_version: z.literal('talos_provider_tool_call_v1'),
    provider_call_id: nonEmptyBoundedString(256),
    name: nonEmptyBoundedString(128),
    arguments: JsonObjectSchema,
    assistant_preamble: boundedString(8192).nullable(),
    provider_metadata: JsonObjectSchema,
}).strict();
export const ToolExecutionContextSchema = z.object({
    schema_version: z.literal('talos_tool_execution_context_v1'),
    user_id: nonEmptyBoundedString(256),
    chat_session_id: nonEmptyBoundedString(256),
    run_id: nonEmptyBoundedString(256),
    turn_id: nonEmptyBoundedString(256),
    browser_session_id: nonEmptyBoundedString(256).nullable(),
    node_id: nonEmptyBoundedString(256),
    capability: nonEmptyBoundedString(128),
    risk: nonEmptyBoundedString(64),
    state_version: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    deadline_at: z.string().datetime({ offset: true }),
    idempotency_key: z.string().regex(/^sha256:[a-f0-9]{64}$/),
}).strict();
//# sourceMappingURL=toolCalls.js.map