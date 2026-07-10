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
}, z.core.$strip>, z.ZodObject<{
    node_type: z.ZodLiteral<"BROWSER_COMMAND">;
    payload: z.ZodDiscriminatedUnion<[z.ZodObject<{
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
}, z.core.$strip>], "node_type">;
//# sourceMappingURL=nodes.d.ts.map