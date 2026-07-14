import { z } from 'zod';
import { boundedString, JsonObjectSchema, nonEmptyBoundedString, ToolNameSchema, } from './contractPrimitives.js';
const ToolJsonSchema = JsonObjectSchema.superRefine((schema, context) => {
    if (schema.type !== 'object') {
        context.addIssue({ code: 'custom', message: 'Tool JSON Schema type must be object.', path: ['type'] });
    }
    if (schema.properties !== undefined) {
        const parsed = JsonObjectSchema.safeParse(schema.properties);
        if (!parsed.success) {
            context.addIssue({ code: 'custom', message: 'Tool JSON Schema properties must be an object.', path: ['properties'] });
        }
    }
    if (schema.required !== undefined) {
        if (!Array.isArray(schema.required) || schema.required.length > 256 || schema.required.some((field) => !nonEmptyBoundedString(256).safeParse(field).success)) {
            context.addIssue({ code: 'custom', message: 'Tool JSON Schema required must be a string list.', path: ['required'] });
        }
        else if (new Set(schema.required).size !== schema.required.length) {
            context.addIssue({ code: 'custom', message: 'Tool JSON Schema required fields must be unique.', path: ['required'] });
        }
    }
}).transform((schema) => {
    if (!Object.prototype.hasOwnProperty.call(schema, 'properties'))
        return schema;
    return {
        ...schema,
        properties: JsonObjectSchema.parse(schema.properties),
    };
});
const ToolAnnotationsSchema = z.preprocess((value) => Array.isArray(value) && value.length === 0 ? {} : value, z.object({
    title: boundedString(256).optional(),
    readOnlyHint: z.boolean().optional(),
    destructiveHint: z.boolean().optional(),
    idempotentHint: z.boolean().optional(),
    openWorldHint: z.boolean().optional(),
}).strict());
export const ToolIconSchema = z.object({
    src: nonEmptyBoundedString(2048).regex(/^(?:https?:\/\/|data:)[^\s]+$/i),
    mimeType: nonEmptyBoundedString(128).optional(),
    sizes: z.array(nonEmptyBoundedString(32).regex(/^(?:any|\d+x\d+)$/)).max(16).optional(),
    theme: z.enum(['light', 'dark']).optional(),
}).strict();
const ToolExecutionSchema = z.preprocess((value) => Array.isArray(value) && value.length === 0 ? {} : value, z.object({
    taskSupport: z.enum(['forbidden', 'optional', 'required']).optional(),
}).strict());
export const ToolDefinitionSchema = z.object({
    name: ToolNameSchema,
    title: boundedString(256).optional(),
    description: boundedString(4096).optional(),
    inputSchema: ToolJsonSchema,
    outputSchema: ToolJsonSchema.optional(),
    annotations: ToolAnnotationsSchema.optional(),
    icons: z.array(ToolIconSchema).max(16).optional(),
    execution: ToolExecutionSchema.optional(),
    _meta: JsonObjectSchema.optional(),
}).strict();
function enforceProceduralSchema(schema, context, path) {
    if (schema.additionalProperties !== false) {
        context.addIssue({ code: 'custom', message: `${path} must set additionalProperties to false.`, path: [path, 'additionalProperties'] });
    }
    const properties = !Array.isArray(schema.properties) && schema.properties && typeof schema.properties === 'object'
        ? schema.properties
        : {};
    if (Array.isArray(schema.required)) {
        for (const field of schema.required) {
            if (typeof field !== 'string' || !Object.prototype.hasOwnProperty.call(properties, field)) {
                context.addIssue({ code: 'custom', message: `${path} must declare every required field in properties.`, path: [path, 'required'] });
            }
        }
    }
}
export const StrictToolDefinitionSchema = ToolDefinitionSchema.superRefine((definition, context) => {
    enforceProceduralSchema(definition.inputSchema, context, 'inputSchema');
    if (definition.outputSchema) {
        enforceProceduralSchema(definition.outputSchema, context, 'outputSchema');
    }
});
//# sourceMappingURL=toolDefinitions.js.map