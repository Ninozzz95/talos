import { z } from 'zod';
export declare const ToolIconSchema: z.ZodObject<{
    src: z.ZodString;
    mimeType: z.ZodOptional<z.ZodString>;
    sizes: z.ZodOptional<z.ZodArray<z.ZodString>>;
    theme: z.ZodOptional<z.ZodEnum<{
        light: "light";
        dark: "dark";
    }>>;
}, z.core.$strict>;
export declare const ToolDefinitionSchema: z.ZodObject<{
    name: z.ZodString;
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    inputSchema: z.ZodPipe<z.ZodPreprocess<z.ZodRecord<z.ZodString, z.ZodUnknown>>, z.ZodTransform<Record<string, unknown>, Record<string, unknown>>>;
    outputSchema: z.ZodOptional<z.ZodPipe<z.ZodPreprocess<z.ZodRecord<z.ZodString, z.ZodUnknown>>, z.ZodTransform<Record<string, unknown>, Record<string, unknown>>>>;
    annotations: z.ZodOptional<z.ZodPreprocess<z.ZodObject<{
        title: z.ZodOptional<z.ZodString>;
        readOnlyHint: z.ZodOptional<z.ZodBoolean>;
        destructiveHint: z.ZodOptional<z.ZodBoolean>;
        idempotentHint: z.ZodOptional<z.ZodBoolean>;
        openWorldHint: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strict>>>;
    icons: z.ZodOptional<z.ZodArray<z.ZodObject<{
        src: z.ZodString;
        mimeType: z.ZodOptional<z.ZodString>;
        sizes: z.ZodOptional<z.ZodArray<z.ZodString>>;
        theme: z.ZodOptional<z.ZodEnum<{
            light: "light";
            dark: "dark";
        }>>;
    }, z.core.$strict>>>;
    execution: z.ZodOptional<z.ZodPreprocess<z.ZodObject<{
        taskSupport: z.ZodOptional<z.ZodEnum<{
            optional: "optional";
            forbidden: "forbidden";
            required: "required";
        }>>;
    }, z.core.$strict>>>;
    _meta: z.ZodOptional<z.ZodPreprocess<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
}, z.core.$strict>;
export declare const StrictToolDefinitionSchema: z.ZodObject<{
    name: z.ZodString;
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    inputSchema: z.ZodPipe<z.ZodPreprocess<z.ZodRecord<z.ZodString, z.ZodUnknown>>, z.ZodTransform<Record<string, unknown>, Record<string, unknown>>>;
    outputSchema: z.ZodOptional<z.ZodPipe<z.ZodPreprocess<z.ZodRecord<z.ZodString, z.ZodUnknown>>, z.ZodTransform<Record<string, unknown>, Record<string, unknown>>>>;
    annotations: z.ZodOptional<z.ZodPreprocess<z.ZodObject<{
        title: z.ZodOptional<z.ZodString>;
        readOnlyHint: z.ZodOptional<z.ZodBoolean>;
        destructiveHint: z.ZodOptional<z.ZodBoolean>;
        idempotentHint: z.ZodOptional<z.ZodBoolean>;
        openWorldHint: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strict>>>;
    icons: z.ZodOptional<z.ZodArray<z.ZodObject<{
        src: z.ZodString;
        mimeType: z.ZodOptional<z.ZodString>;
        sizes: z.ZodOptional<z.ZodArray<z.ZodString>>;
        theme: z.ZodOptional<z.ZodEnum<{
            light: "light";
            dark: "dark";
        }>>;
    }, z.core.$strict>>>;
    execution: z.ZodOptional<z.ZodPreprocess<z.ZodObject<{
        taskSupport: z.ZodOptional<z.ZodEnum<{
            optional: "optional";
            forbidden: "forbidden";
            required: "required";
        }>>;
    }, z.core.$strict>>>;
    _meta: z.ZodOptional<z.ZodPreprocess<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
}, z.core.$strict>;
export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;
//# sourceMappingURL=toolDefinitions.d.ts.map