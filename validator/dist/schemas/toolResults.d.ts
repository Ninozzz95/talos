import { z } from 'zod';
export declare const ToolResultContentSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    type: z.ZodLiteral<"text">;
    text: z.ZodString;
    annotations: z.ZodOptional<z.ZodPreprocess<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    _meta: z.ZodOptional<z.ZodPreprocess<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"image">;
    data: z.ZodString;
    mimeType: z.ZodString;
    annotations: z.ZodOptional<z.ZodPreprocess<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    _meta: z.ZodOptional<z.ZodPreprocess<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"audio">;
    data: z.ZodString;
    mimeType: z.ZodString;
    annotations: z.ZodOptional<z.ZodPreprocess<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    _meta: z.ZodOptional<z.ZodPreprocess<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"resource_link">;
    uri: z.ZodString;
    name: z.ZodString;
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    mimeType: z.ZodOptional<z.ZodString>;
    size: z.ZodOptional<z.ZodNumber>;
    icons: z.ZodOptional<z.ZodArray<z.ZodObject<{
        src: z.ZodString;
        mimeType: z.ZodOptional<z.ZodString>;
        sizes: z.ZodOptional<z.ZodArray<z.ZodString>>;
        theme: z.ZodOptional<z.ZodEnum<{
            light: "light";
            dark: "dark";
        }>>;
    }, z.core.$strict>>>;
    annotations: z.ZodOptional<z.ZodPreprocess<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    _meta: z.ZodOptional<z.ZodPreprocess<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"resource">;
    resource: z.ZodObject<{
        uri: z.ZodString;
        mimeType: z.ZodOptional<z.ZodString>;
        text: z.ZodOptional<z.ZodString>;
        blob: z.ZodOptional<z.ZodString>;
        _meta: z.ZodOptional<z.ZodPreprocess<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    }, z.core.$strict>;
    annotations: z.ZodOptional<z.ZodPreprocess<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    _meta: z.ZodOptional<z.ZodPreprocess<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
}, z.core.$strict>], "type">;
export declare const ToolResultSchema: z.ZodObject<{
    schema_version: z.ZodLiteral<"talos_tool_result_v1">;
    tool_use_id: z.ZodString;
    isError: z.ZodBoolean;
    content: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<"text">;
        text: z.ZodString;
        annotations: z.ZodOptional<z.ZodPreprocess<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
        _meta: z.ZodOptional<z.ZodPreprocess<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"image">;
        data: z.ZodString;
        mimeType: z.ZodString;
        annotations: z.ZodOptional<z.ZodPreprocess<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
        _meta: z.ZodOptional<z.ZodPreprocess<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"audio">;
        data: z.ZodString;
        mimeType: z.ZodString;
        annotations: z.ZodOptional<z.ZodPreprocess<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
        _meta: z.ZodOptional<z.ZodPreprocess<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"resource_link">;
        uri: z.ZodString;
        name: z.ZodString;
        title: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        mimeType: z.ZodOptional<z.ZodString>;
        size: z.ZodOptional<z.ZodNumber>;
        icons: z.ZodOptional<z.ZodArray<z.ZodObject<{
            src: z.ZodString;
            mimeType: z.ZodOptional<z.ZodString>;
            sizes: z.ZodOptional<z.ZodArray<z.ZodString>>;
            theme: z.ZodOptional<z.ZodEnum<{
                light: "light";
                dark: "dark";
            }>>;
        }, z.core.$strict>>>;
        annotations: z.ZodOptional<z.ZodPreprocess<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
        _meta: z.ZodOptional<z.ZodPreprocess<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"resource">;
        resource: z.ZodObject<{
            uri: z.ZodString;
            mimeType: z.ZodOptional<z.ZodString>;
            text: z.ZodOptional<z.ZodString>;
            blob: z.ZodOptional<z.ZodString>;
            _meta: z.ZodOptional<z.ZodPreprocess<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
        }, z.core.$strict>;
        annotations: z.ZodOptional<z.ZodPreprocess<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
        _meta: z.ZodOptional<z.ZodPreprocess<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    }, z.core.$strict>], "type">>;
    structuredContent: z.ZodNullable<z.ZodPreprocess<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    evidence: z.ZodArray<z.ZodObject<{
        artifact_id: z.ZodString;
        kind: z.ZodString;
        sha256: z.ZodString;
        trusted_boundary: z.ZodString;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare function parseCorrelatedToolResult(input: unknown, expectedToolUseId: string): {
    schema_version: "talos_tool_result_v1";
    tool_use_id: string;
    isError: boolean;
    content: ({
        type: "text";
        text: string;
        annotations?: Record<string, unknown> | undefined;
        _meta?: Record<string, unknown> | undefined;
    } | {
        type: "image";
        data: string;
        mimeType: string;
        annotations?: Record<string, unknown> | undefined;
        _meta?: Record<string, unknown> | undefined;
    } | {
        type: "audio";
        data: string;
        mimeType: string;
        annotations?: Record<string, unknown> | undefined;
        _meta?: Record<string, unknown> | undefined;
    } | {
        type: "resource_link";
        uri: string;
        name: string;
        title?: string | undefined;
        description?: string | undefined;
        mimeType?: string | undefined;
        size?: number | undefined;
        icons?: {
            src: string;
            mimeType?: string | undefined;
            sizes?: string[] | undefined;
            theme?: "light" | "dark" | undefined;
        }[] | undefined;
        annotations?: Record<string, unknown> | undefined;
        _meta?: Record<string, unknown> | undefined;
    } | {
        type: "resource";
        resource: {
            uri: string;
            mimeType?: string | undefined;
            text?: string | undefined;
            blob?: string | undefined;
            _meta?: Record<string, unknown> | undefined;
        };
        annotations?: Record<string, unknown> | undefined;
        _meta?: Record<string, unknown> | undefined;
    })[];
    structuredContent: Record<string, unknown> | null;
    evidence: {
        artifact_id: string;
        kind: string;
        sha256: string;
        trusted_boundary: string;
    }[];
};
export type ToolResult = z.infer<typeof ToolResultSchema>;
//# sourceMappingURL=toolResults.d.ts.map