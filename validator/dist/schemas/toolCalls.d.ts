import { z } from 'zod';
export declare const ProviderToolCallSchema: z.ZodObject<{
    schema_version: z.ZodLiteral<"talos_provider_tool_call_v1">;
    provider_call_id: z.ZodString;
    name: z.ZodString;
    arguments: z.ZodPreprocess<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    assistant_preamble: z.ZodNullable<z.ZodString>;
    provider_metadata: z.ZodPreprocess<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strict>;
export declare const ToolExecutionContextSchema: z.ZodObject<{
    schema_version: z.ZodLiteral<"talos_tool_execution_context_v1">;
    user_id: z.ZodString;
    chat_session_id: z.ZodString;
    run_id: z.ZodString;
    turn_id: z.ZodString;
    browser_session_id: z.ZodNullable<z.ZodString>;
    node_id: z.ZodString;
    capability: z.ZodString;
    risk: z.ZodString;
    state_version: z.ZodNumber;
    deadline_at: z.ZodString;
    idempotency_key: z.ZodString;
}, z.core.$strict>;
export type ProviderToolCall = z.infer<typeof ProviderToolCallSchema>;
export type ToolExecutionContext = z.infer<typeof ToolExecutionContextSchema>;
//# sourceMappingURL=toolCalls.d.ts.map