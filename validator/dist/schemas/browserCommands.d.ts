import { z } from 'zod';
export declare const BrowserCommandSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    operation: z.ZodLiteral<"navigate">;
    arguments: z.ZodObject<{
        url: z.ZodString;
    }, z.core.$strict>;
    expected_evidence_hash: z.ZodNull;
    schema_version: z.ZodLiteral<"talos_browser_command_v1">;
    command_id: z.ZodString;
    run_id: z.ZodString;
    node_id: z.ZodString;
    browser_session_id: z.ZodString;
    observation_request: z.ZodArray<z.ZodEnum<{
        snapshot: "snapshot";
        screenshot: "screenshot";
        read: "read";
    }>>;
    risk: z.ZodLiteral<"read">;
    idempotency_key: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    operation: z.ZodLiteral<"snapshot">;
    arguments: z.ZodObject<{}, z.core.$strict>;
    expected_evidence_hash: z.ZodNull;
    schema_version: z.ZodLiteral<"talos_browser_command_v1">;
    command_id: z.ZodString;
    run_id: z.ZodString;
    node_id: z.ZodString;
    browser_session_id: z.ZodString;
    observation_request: z.ZodArray<z.ZodEnum<{
        snapshot: "snapshot";
        screenshot: "screenshot";
        read: "read";
    }>>;
    risk: z.ZodLiteral<"read">;
    idempotency_key: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    operation: z.ZodLiteral<"screenshot">;
    arguments: z.ZodObject<{}, z.core.$strict>;
    expected_evidence_hash: z.ZodNull;
    schema_version: z.ZodLiteral<"talos_browser_command_v1">;
    command_id: z.ZodString;
    run_id: z.ZodString;
    node_id: z.ZodString;
    browser_session_id: z.ZodString;
    observation_request: z.ZodArray<z.ZodEnum<{
        snapshot: "snapshot";
        screenshot: "screenshot";
        read: "read";
    }>>;
    risk: z.ZodLiteral<"read">;
    idempotency_key: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    operation: z.ZodLiteral<"read">;
    arguments: z.ZodObject<{
        ref: z.ZodOptional<z.ZodString>;
        query: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    expected_evidence_hash: z.ZodString;
    schema_version: z.ZodLiteral<"talos_browser_command_v1">;
    command_id: z.ZodString;
    run_id: z.ZodString;
    node_id: z.ZodString;
    browser_session_id: z.ZodString;
    observation_request: z.ZodArray<z.ZodEnum<{
        snapshot: "snapshot";
        screenshot: "screenshot";
        read: "read";
    }>>;
    risk: z.ZodLiteral<"read">;
    idempotency_key: z.ZodString;
}, z.core.$strict>], "operation">;
export type BrowserCommand = z.infer<typeof BrowserCommandSchema>;
//# sourceMappingURL=browserCommands.d.ts.map