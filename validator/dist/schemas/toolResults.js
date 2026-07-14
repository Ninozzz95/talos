import { z } from 'zod';
import { AbsoluteUriSchema, boundedString, JsonObjectSchema, nonEmptyBoundedString } from './contractPrimitives.js';
import { ToolIconSchema } from './toolDefinitions.js';
const MetadataSchema = JsonObjectSchema.optional();
const Base64Schema = z.string().min(1).max(16 * 1024 * 1024).refine((value) => {
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))
        return false;
    try {
        return Buffer.from(value, 'base64').toString('base64') === value;
    }
    catch {
        return false;
    }
}, 'Expected canonical base64 data.');
const TextContentSchema = z.object({
    type: z.literal('text'),
    text: nonEmptyBoundedString(65536),
    annotations: MetadataSchema,
    _meta: MetadataSchema,
}).strict();
const ImageContentSchema = z.object({
    type: z.literal('image'),
    data: Base64Schema,
    mimeType: nonEmptyBoundedString(128).startsWith('image/'),
    annotations: MetadataSchema,
    _meta: MetadataSchema,
}).strict();
const AudioContentSchema = z.object({
    type: z.literal('audio'),
    data: Base64Schema,
    mimeType: nonEmptyBoundedString(128).startsWith('audio/'),
    annotations: MetadataSchema,
    _meta: MetadataSchema,
}).strict();
const ResourceLinkContentSchema = z.object({
    type: z.literal('resource_link'),
    uri: AbsoluteUriSchema,
    name: nonEmptyBoundedString(256),
    title: boundedString(256).optional(),
    description: boundedString(4096).optional(),
    mimeType: nonEmptyBoundedString(128).optional(),
    size: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
    icons: z.array(ToolIconSchema).max(32).optional(),
    annotations: MetadataSchema,
    _meta: MetadataSchema,
}).strict();
const EmbeddedResourceDataSchema = z.object({
    uri: AbsoluteUriSchema,
    mimeType: nonEmptyBoundedString(128).optional(),
    text: nonEmptyBoundedString(65536).optional(),
    blob: Base64Schema.optional(),
    _meta: MetadataSchema,
}).strict().refine((resource) => (resource.text === undefined) !== (resource.blob === undefined), {
    message: 'Embedded resources require exactly one of text or blob.',
});
const EmbeddedResourceContentSchema = z.object({
    type: z.literal('resource'),
    resource: EmbeddedResourceDataSchema,
    annotations: MetadataSchema,
    _meta: MetadataSchema,
}).strict();
export const ToolResultContentSchema = z.discriminatedUnion('type', [
    TextContentSchema,
    ImageContentSchema,
    AudioContentSchema,
    ResourceLinkContentSchema,
    EmbeddedResourceContentSchema,
]);
const EvidenceSchema = z.object({
    artifact_id: nonEmptyBoundedString(256),
    kind: nonEmptyBoundedString(128),
    sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    trusted_boundary: nonEmptyBoundedString(128),
}).strict();
function talosArtifactId(uri) {
    if (!uri.startsWith('talos-artifact://'))
        return null;
    try {
        return new URL(uri).hostname || null;
    }
    catch {
        return null;
    }
}
export const ToolResultSchema = z.object({
    schema_version: z.literal('talos_tool_result_v1'),
    tool_use_id: nonEmptyBoundedString(256),
    isError: z.boolean(),
    content: z.array(ToolResultContentSchema).max(64),
    structuredContent: JsonObjectSchema.nullable(),
    evidence: z.array(EvidenceSchema).max(128),
}).strict().superRefine((result, context) => {
    const evidenceIds = new Set();
    for (const [index, evidence] of result.evidence.entries()) {
        if (evidenceIds.has(evidence.artifact_id)) {
            context.addIssue({ code: 'custom', message: 'Evidence artifact IDs must be unique.', path: ['evidence', index, 'artifact_id'] });
        }
        evidenceIds.add(evidence.artifact_id);
    }
    for (const [index, content] of result.content.entries()) {
        const uri = content.type === 'resource_link'
            ? content.uri
            : content.type === 'resource'
                ? content.resource.uri
                : null;
        const artifactId = uri ? talosArtifactId(uri) : null;
        if (artifactId && !evidenceIds.has(artifactId)) {
            context.addIssue({ code: 'custom', message: 'TALOS artifact links require persisted evidence.', path: ['content', index] });
        }
    }
    const structuredIds = result.structuredContent?.evidence_ids;
    if (structuredIds !== undefined) {
        if (!Array.isArray(structuredIds) || structuredIds.length > 128 || structuredIds.some((id) => !nonEmptyBoundedString(256).safeParse(id).success || !evidenceIds.has(id))) {
            context.addIssue({ code: 'custom', message: 'structuredContent evidence_ids must reference persisted evidence.', path: ['structuredContent', 'evidence_ids'] });
        }
    }
});
export function parseCorrelatedToolResult(input, expectedToolUseId) {
    const result = ToolResultSchema.parse(input);
    if (result.tool_use_id !== expectedToolUseId) {
        throw new z.ZodError([{
                code: 'custom',
                path: ['tool_use_id'],
                message: 'Tool result use ID does not match the provider call ID.',
                input: result.tool_use_id,
            }]);
    }
    return result;
}
//# sourceMappingURL=toolResults.js.map