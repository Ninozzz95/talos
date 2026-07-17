import { createHash } from "node:crypto";
import { z } from "zod";
import { browserEvidenceUrl } from "./BrowserUrlPolicy.js";

const MAX_TOOL_USE_ID_LENGTH = 256;
const MAX_TOOL_TEXT_LENGTH = 65_536;
const MAX_TOOL_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_BROWSER_URL_LENGTH = 2_048;
const MAX_BROWSER_TITLE_LENGTH = 512;
const SAFE_INTEGER = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const JsonObjectSchema = z.record(z.string(), z.unknown());
const BoundedBrowserUrlSchema = z.string().max(MAX_BROWSER_URL_LENGTH).refine((value) => Buffer.byteLength(value, "utf8") <= MAX_BROWSER_URL_LENGTH, "Browser URL exceeds the UTF-8 byte limit.");
const CanonicalBrowserEvidenceUrlSchema = BoundedBrowserUrlSchema.refine(
  (value) => browserEvidenceUrl(value) === value,
  "Browser evidence URL must be canonical HTTP(S) without credentials, query, or fragment, or about:blank.",
);
const NavigableBrowserUrlSchema = z.string().max(MAX_BROWSER_URL_LENGTH).url().refine((value) => Buffer.byteLength(value, "utf8") <= MAX_BROWSER_URL_LENGTH, "Browser URL exceeds the UTF-8 byte limit.");
const BoundedBrowserTitleSchema = z.string().max(MAX_BROWSER_TITLE_LENGTH).refine((value) => Buffer.byteLength(value, "utf8") <= MAX_BROWSER_TITLE_LENGTH, "Browser title exceeds the UTF-8 byte limit.");

const commonOutputProperties = {
  url: { type: "string", maxLength: MAX_BROWSER_URL_LENGTH },
  title: { type: "string", maxLength: MAX_BROWSER_TITLE_LENGTH },
  state_version: { type: "integer", minimum: 0 },
  evidence_ids: { type: "array", items: { type: "string" } },
};

const stateAwareInputSchema = {
  type: "object",
  properties: { state_version: { type: "integer", minimum: 0 } },
  additionalProperties: false,
};
const commonOutputSchema = {
  type: "object",
  properties: commonOutputProperties,
  required: ["url", "title", "state_version"],
  additionalProperties: false,
};

const rawToolDefinitions = [
  {
    name: "browser_navigate",
    title: "Navigate",
    description: "Navigate the isolated Browser page.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", format: "uri", maxLength: MAX_BROWSER_URL_LENGTH },
        waitUntil: { type: "string", enum: ["load", "domcontentloaded", "networkidle", "commit"] },
        timeoutMs: { type: "integer", minimum: 1, maximum: 120000 },
        state_version: { type: "integer", minimum: 0 },
      },
      required: ["url"],
      additionalProperties: false,
    },
    outputSchema: commonOutputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  {
    name: "browser_snapshot",
    title: "Page snapshot",
    description: "Capture a bounded accessibility snapshot of the current Browser page.",
    inputSchema: stateAwareInputSchema,
    outputSchema: {
      type: "object",
      properties: {
        ...commonOutputProperties,
        snapshot_id: { type: "string" },
        format: { type: "string", const: "accessibility_refs_v1" },
        text_digest: { type: "string" },
        nodes: { type: "array", maxItems: 200 },
      },
      required: ["url", "title", "state_version", "snapshot_id", "format", "text_digest", "nodes"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "browser_read",
    title: "Read page refs",
    description: "Read bounded text and accessibility references from the current Browser snapshot.",
    inputSchema: {
      type: "object",
      properties: {
        ref: { type: "string", pattern: "^r[0-9]+$" },
        query: { type: "string", maxLength: 512 },
        snapshot_id: { type: "string", pattern: "^snap_[A-Za-z0-9-]+$" },
        state_version: { type: "integer", minimum: 0 },
      },
      required: ["state_version"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        ...commonOutputProperties,
        snapshot_id: { type: "string" },
        matches: { type: "array", maxItems: 20 },
      },
      required: ["url", "title", "state_version", "snapshot_id", "matches"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "browser_take_screenshot",
    title: "Take a screenshot",
    description: "Capture a bounded PNG screenshot of the current Browser page.",
    inputSchema: {
      type: "object",
      properties: { state_version: { type: "integer", minimum: 0 } },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        ...commonOutputProperties,
        mime_type: { type: "string", const: "image/png" },
        width: { type: "integer", minimum: 1 },
        height: { type: "integer", minimum: 1 },
        sha256: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
      },
      required: ["url", "title", "state_version", "mime_type", "width", "height", "sha256"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "browser_wait_for",
    title: "Wait for",
    description: "Wait for a bounded time or for text to appear or disappear.",
    inputSchema: {
      type: "object",
      properties: {
        time: { type: "number", minimum: 0, maximum: 10 },
        text: { type: "string", maxLength: 512 },
        textGone: { type: "string", maxLength: 512 },
        state_version: { type: "integer", minimum: 0 },
      },
      oneOf: [{ required: ["time"] }, { required: ["text"] }, { required: ["textGone"] }],
      additionalProperties: false,
    },
    outputSchema: commonOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "browser_click",
    title: "Click element",
    description: "Click exactly one element identified by a ref from the current accessibility snapshot.",
    inputSchema: {
      type: "object",
      properties: {
        target: { type: "string", pattern: "^r[0-9]+$" },
        element: { type: "string", maxLength: 512 },
        snapshot_id: { type: "string", pattern: "^snap_[A-Za-z0-9-]+$" },
        state_version: { type: "integer", minimum: 0 },
      },
      required: ["target", "snapshot_id", "state_version"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        ...commonOutputProperties,
        target: {
          type: "object",
          properties: {
            ref: { type: "string", pattern: "^r[0-9]+$" },
            role: { type: "string" },
            name: { type: "string" },
          },
          required: ["ref", "role", "name"],
          additionalProperties: false,
        },
        screenshot: {
          type: "object",
          properties: {
            mime_type: { type: "string", const: "image/png" },
            width: { type: "integer", minimum: 1 },
            height: { type: "integer", minimum: 1 },
            sha256: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
          },
          required: ["mime_type", "width", "height", "sha256"],
          additionalProperties: false,
        },
        snapshot: {
          type: "object",
          properties: {
            snapshot_id: { type: "string" },
            format: { type: "string", const: "accessibility_refs_v1" },
            text_digest: { type: "string" },
            sha256: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
            nodes: { type: "array", maxItems: 200 },
          },
          required: ["snapshot_id", "format", "text_digest", "sha256", "nodes"],
          additionalProperties: false,
        },
      },
      required: ["url", "title", "state_version", "target", "screenshot", "snapshot"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "browser_file_upload",
    title: "Upload staged files",
    description: "Upload explicitly approved, opaque staged files to one file input from the current accessibility snapshot.",
    inputSchema: {
      type: "object",
      properties: {
        target: { type: "string", pattern: "^r[0-9]+$" },
        element: { type: "string", maxLength: 512 },
        staged_file_ids: {
          type: "array",
          minItems: 1,
          maxItems: 4,
          uniqueItems: true,
          items: { type: "string", pattern: "^stg_[0-9a-f-]{36}$" },
        },
        snapshot_id: { type: "string", pattern: "^snap_[A-Za-z0-9-]+$" },
        state_version: { type: "integer", minimum: 0 },
      },
      required: ["target", "staged_file_ids", "snapshot_id", "state_version"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        ...commonOutputProperties,
        target: {
          type: "object",
          properties: {
            ref: { type: "string", pattern: "^r[0-9]+$" },
            role: { type: "string" },
            name: { type: "string" },
          },
          required: ["ref", "role", "name"],
          additionalProperties: false,
        },
        files: { type: "array", minItems: 1, maxItems: 4 },
        screenshot: {
          type: "object",
          properties: {
            mime_type: { type: "string", const: "image/png" },
            width: { type: "integer", minimum: 1 },
            height: { type: "integer", minimum: 1 },
            sha256: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
          },
          required: ["mime_type", "width", "height", "sha256"],
          additionalProperties: false,
        },
        snapshot: {
          type: "object",
          properties: {
            snapshot_id: { type: "string" },
            format: { type: "string", const: "accessibility_refs_v1" },
            text_digest: { type: "string" },
            sha256: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
            nodes: { type: "array", maxItems: 200 },
          },
          required: ["snapshot_id", "format", "text_digest", "sha256", "nodes"],
          additionalProperties: false,
        },
      },
      required: ["url", "title", "state_version", "target", "files", "screenshot", "snapshot"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
] as const;

const JsonSchema = JsonObjectSchema.superRefine((value, context) => {
  if (value.type !== "object") context.addIssue({ code: "custom", message: "JSON Schema type must be object.", path: ["type"] });
  if (value.additionalProperties !== false) context.addIssue({ code: "custom", message: "JSON Schema must be closed.", path: ["additionalProperties"] });
});

export const ToolDefinitionSchema = z.object({
  name: z.string().min(1).max(128).regex(/^[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,126}[A-Za-z0-9])?$/),
  title: z.string().max(256).optional(),
  description: z.string().max(4096).optional(),
  inputSchema: JsonSchema,
  outputSchema: JsonSchema.optional(),
  annotations: z.object({
    title: z.string().max(256).optional(),
    readOnlyHint: z.boolean().optional(),
    destructiveHint: z.boolean().optional(),
    idempotentHint: z.boolean().optional(),
    openWorldHint: z.boolean().optional(),
  }).strict().optional(),
}).strict();

export const BrowserToolDefinitions = rawToolDefinitions.map((definition) => ToolDefinitionSchema.parse(definition));
export const BrowserToolNames = BrowserToolDefinitions.map((definition) => definition.name) as [string, ...string[]];

export const BrowserToolCallSchema = z.object({
  tool_use_id: z.string().min(1).max(MAX_TOOL_USE_ID_LENGTH),
  name: z.string().min(1).max(128),
  arguments: JsonObjectSchema,
}).strict();

export const NavigateToolArgumentsSchema = z.object({
  url: NavigableBrowserUrlSchema,
  waitUntil: z.enum(["load", "domcontentloaded", "networkidle", "commit"]).optional(),
  timeoutMs: z.number().int().positive().max(120_000).optional(),
  state_version: SAFE_INTEGER.optional(),
}).strict();

export const SnapshotToolArgumentsSchema = z.object({
  state_version: SAFE_INTEGER.optional(),
}).strict();

export const ReadToolArgumentsSchema = z.object({
  ref: z.string().regex(/^r\d+$/).optional(),
  query: z.string().max(512).optional(),
  snapshot_id: z.string().regex(/^snap_[A-Za-z0-9-]+$/).optional(),
  state_version: SAFE_INTEGER,
}).strict().superRefine((value, context) => {
  if (value.ref === undefined && value.query === undefined) context.addIssue({ code: "custom", message: "A ref or query is required." });
});

export const ScreenshotToolArgumentsSchema = z.object({
  state_version: SAFE_INTEGER.optional(),
}).strict();

export const WaitToolArgumentsSchema = z.object({
  time: z.number().finite().nonnegative().max(10).optional(),
  text: z.string().min(1).max(512).optional(),
  textGone: z.string().min(1).max(512).optional(),
  state_version: SAFE_INTEGER.optional(),
}).strict().superRefine((value, context) => {
  const conditionCount = [value.time, value.text, value.textGone].filter((condition) => condition !== undefined).length;
  if (conditionCount !== 1) {
    context.addIssue({ code: "custom", message: "Exactly one wait condition is required." });
  }
});

export const ClickToolArgumentsSchema = z.object({
  target: z.string().regex(/^r\d+$/),
  element: z.string().max(512).optional(),
  snapshot_id: z.string().regex(/^snap_[A-Za-z0-9-]+$/),
  state_version: SAFE_INTEGER,
}).strict();

export const BrowserFileUploadToolArgumentsSchema = z.object({
  target: z.string().regex(/^r\d+$/),
  element: z.string().max(512).optional(),
  staged_file_ids: z.array(z.string().regex(/^stg_[0-9a-f-]{36}$/u)).min(1).max(4).refine(
    (values) => new Set(values).size === values.length,
    "Staged file IDs must be unique.",
  ),
  snapshot_id: z.string().regex(/^snap_[A-Za-z0-9-]+$/),
  state_version: SAFE_INTEGER,
}).strict();

const Base64Schema = z.string().min(1).max(16 * 1024 * 1024).refine((value) => {
  try { return Buffer.from(value, "base64").toString("base64") === value; } catch { return false; }
}, "Expected canonical base64 data.");

const MetadataSchema = JsonObjectSchema.optional();
const ContentMetadataFields = { annotations: MetadataSchema, _meta: MetadataSchema };
const AbsoluteUriSchema = z.string().min(1).max(2_048).regex(/^[A-Za-z][A-Za-z0-9+.-]*:[^\s]*$/);
const ToolIconSchema = z.object({
  src: z.string().min(1).max(2_048).regex(/^(?:https?:\/\/|data:)[^\s]+$/i),
  mimeType: z.string().min(1).max(128).optional(),
  sizes: z.array(z.string().min(1).max(32).regex(/^(?:any|\d+x\d+)$/)).max(16).optional(),
  theme: z.enum(["light", "dark"]).optional(),
}).strict();
const EmbeddedResourceSchema = z.object({
  uri: AbsoluteUriSchema,
  mimeType: z.string().min(1).max(128).optional(),
  text: z.string().min(1).max(MAX_TOOL_TEXT_LENGTH).optional(),
  blob: Base64Schema.optional(),
  _meta: MetadataSchema,
}).strict().refine((resource) => (resource.text === undefined) !== (resource.blob === undefined), "Embedded resources require exactly one of text or blob.");

const ToolContentSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string().min(1).max(MAX_TOOL_TEXT_LENGTH), ...ContentMetadataFields }).strict(),
  z.object({ type: z.literal("image"), data: Base64Schema, mimeType: z.string().startsWith("image/").max(128), ...ContentMetadataFields }).strict(),
  z.object({ type: z.literal("audio"), data: Base64Schema, mimeType: z.string().startsWith("audio/").max(128), ...ContentMetadataFields }).strict(),
  z.object({
    type: z.literal("resource_link"),
    uri: AbsoluteUriSchema,
    name: z.string().min(1).max(256),
    title: z.string().max(256).optional(),
    description: z.string().max(4_096).optional(),
    mimeType: z.string().min(1).max(128).optional(),
    size: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
    icons: z.array(ToolIconSchema).max(32).optional(),
    ...ContentMetadataFields,
  }).strict(),
  z.object({ type: z.literal("resource"), resource: EmbeddedResourceSchema, ...ContentMetadataFields }).strict(),
]);

const EvidenceSchema = z.object({
  artifact_id: z.string().min(1).max(256),
  kind: z.string().min(1).max(128),
  sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  trusted_boundary: z.string().min(1).max(128),
}).strict();

export const BrowserToolResultSchema = z.object({
  schema_version: z.literal("talos_tool_result_v1"),
  tool_use_id: z.string().min(1).max(MAX_TOOL_USE_ID_LENGTH),
  isError: z.boolean(),
  content: z.array(ToolContentSchema).max(64),
  structuredContent: JsonObjectSchema.nullable(),
  evidence: z.array(EvidenceSchema).max(128),
}).strict().superRefine((result, context) => {
  const evidenceIds = new Set(result.evidence.map((item) => item.artifact_id));
  if (evidenceIds.size !== result.evidence.length) context.addIssue({ code: "custom", message: "Evidence IDs must be unique.", path: ["evidence"] });
  const structuredEvidenceIds = result.structuredContent?.evidence_ids;
  if (structuredEvidenceIds !== undefined && (!Array.isArray(structuredEvidenceIds) || structuredEvidenceIds.some((id) => typeof id !== "string" || !evidenceIds.has(id)))) {
    context.addIssue({ code: "custom", message: "structuredContent evidence_ids must reference evidence.", path: ["structuredContent", "evidence_ids"] });
  }
  for (const [index, content] of result.content.entries()) {
    const uri = content.type === "resource_link" ? content.uri : content.type === "resource" ? content.resource.uri : null;
    if (!uri?.startsWith("talos-artifact://")) continue;
    let artifactId: string | null = null;
    try { artifactId = new URL(uri).hostname || null; } catch { artifactId = null; }
    if (artifactId !== null && !evidenceIds.has(artifactId)) {
      context.addIssue({ code: "custom", message: "TALOS artifact links require persisted evidence.", path: ["content", index] });
    }
  }
});

const commonStructuredSchema = z.object({
  url: CanonicalBrowserEvidenceUrlSchema,
  title: BoundedBrowserTitleSchema,
  state_version: SAFE_INTEGER,
  evidence_ids: z.array(z.string()).optional(),
}).strict();

const StructuredOutputSchemas = {
  browser_navigate: commonStructuredSchema,
  browser_snapshot: commonStructuredSchema.extend({
    snapshot_id: z.string().min(1),
    format: z.literal("accessibility_refs_v1"),
    text_digest: z.string().max(4_000),
    nodes: z.array(JsonObjectSchema).max(200),
  }),
  browser_read: commonStructuredSchema.extend({
    snapshot_id: z.string().min(1),
    matches: z.array(JsonObjectSchema).max(20),
  }),
  browser_take_screenshot: commonStructuredSchema.extend({
    mime_type: z.literal("image/png"),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  }),
  browser_wait_for: commonStructuredSchema,
  browser_click: commonStructuredSchema.extend({
    target: z.object({
      ref: z.string().regex(/^r\d+$/),
      role: z.string().min(1),
      name: z.string(),
    }).strict(),
    screenshot: z.object({
      mime_type: z.literal("image/png"),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    }).strict(),
    snapshot: z.object({
      snapshot_id: z.string().min(1),
      format: z.literal("accessibility_refs_v1"),
      text_digest: z.string().max(4_000),
      sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
      nodes: z.array(JsonObjectSchema).max(200),
    }).strict(),
  }),
  browser_file_upload: commonStructuredSchema.extend({
    target: z.object({
      ref: z.string().regex(/^r\d+$/),
      role: z.string().min(1),
      name: z.string(),
    }).strict(),
    files: z.array(z.object({
      file_id: z.uuid(),
      name: z.string().min(1).max(255),
      mime_type: z.string().min(1).max(128),
      size_bytes: z.number().int().positive().max(10 * 1024 * 1024),
      sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    }).strict()).min(1).max(4),
    screenshot: z.object({
      mime_type: z.literal("image/png"),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    }).strict(),
    snapshot: z.object({
      snapshot_id: z.string().min(1),
      format: z.literal("accessibility_refs_v1"),
      text_digest: z.string().max(4_000),
      sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
      nodes: z.array(JsonObjectSchema).max(200),
    }).strict(),
  }),
} as const;

export function validateToolStructuredOutput(name: string, value: Record<string, unknown>): Record<string, unknown> {
  const schema = StructuredOutputSchemas[name as keyof typeof StructuredOutputSchemas];
  if (!schema) return value;
  return schema.parse(value);
}

export function sha256(value: Uint8Array | string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function toolResult(input: unknown): z.infer<typeof BrowserToolResultSchema> {
  return BrowserToolResultSchema.parse(input);
}

export const TOOL_MAX_SCREENSHOT_BYTES = MAX_TOOL_IMAGE_BYTES;
export const TOOL_MAX_WAIT_SECONDS = 10;
