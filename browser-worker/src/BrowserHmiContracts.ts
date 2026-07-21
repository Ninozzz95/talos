import { z } from "zod";
import { browserEvidenceUrl } from "./BrowserUrlPolicy.js";

const safeStateVersionSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const normalizedCoordinateSchema = z.number().finite().min(0).max(1);
const sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const commandIdSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
const interactionIdSchema = z.string().uuid();
const boundedUtf8Schema = (maxBytes: number) => z.string().max(maxBytes).refine((value) => Buffer.byteLength(value, "utf8") <= maxBytes, `String exceeds the ${maxBytes}-byte UTF-8 limit.`);
const canonicalEvidenceUrlSchema = boundedUtf8Schema(2_048).refine(
  (value) => browserEvidenceUrl(value) === value,
  "Browser evidence URL must be canonical HTTP(S) without credentials, query, or fragment, or about:blank.",
);
const httpHrefSchema = boundedUtf8Schema(2_048).refine((value) => {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:")
      && url.username === ""
      && url.password === ""
      && url.search === ""
      && url.hash === ""
      && value === canonicalHttpHref(url);
  } catch {
    return false;
  }
}, "Href must be a canonical HTTP(S) URL without credentials, query, or fragment.");

const pointerRequestBase = z.object({
  schema_version: z.literal("talos_browser_hmi_pointer_v2"),
  interaction_id: interactionIdSchema,
  state_version: safeStateVersionSchema,
  expected_frame_sha256: sha256Schema,
  normalized_x: normalizedCoordinateSchema,
  normalized_y: normalizedCoordinateSchema,
  button: z.literal("left"),
  click_count: z.number().int().min(1).max(2),
}).strict();

export const BrowserHmiPreflightRequestSchema = pointerRequestBase;

export const BrowserHmiExecuteRequestSchema = pointerRequestBase.extend({
  command_id: commandIdSchema,
  expected_fingerprint: sha256Schema,
  effect_classification: z.enum(["ordinary", "sensitive"]),
  sensitive_effect_authorized: z.boolean(),
}).strict();

export const BrowserHmiTargetDescriptorSchema = z.object({
  tag: boundedUtf8Schema(64).min(1),
  role: boundedUtf8Schema(64).min(1).nullable(),
  name: boundedUtf8Schema(256),
  input_type: boundedUtf8Schema(64).nullable(),
  href: httpHrefSchema.nullable(),
  form_method: boundedUtf8Schema(16).nullable(),
  is_editable: z.boolean(),
  is_submit: z.boolean(),
  is_download: z.boolean(),
  opens_new_context: z.boolean(),
  effect_attestation: z.enum(["browser_default", "unattestable"]),
  required_effect_classification: z.enum(["ordinary", "sensitive"]),
  visible: z.boolean(),
  disabled: z.boolean(),
  fingerprint: sha256Schema,
}).strict().superRefine((target, context) => {
  const expectedClassification = target.effect_attestation === "browser_default"
    ? "ordinary"
    : "sensitive";
  if (target.required_effect_classification !== expectedClassification) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["required_effect_classification"],
      message: "Required effect classification does not match the target attestation.",
    });
  }
});

const pointSchema = z.object({
  normalized_x: normalizedCoordinateSchema,
  normalized_y: normalizedCoordinateSchema,
  x: z.number().finite().nonnegative(),
  y: z.number().finite().nonnegative(),
}).strict();

export const BrowserHmiPreflightResponseSchema = z.object({
  schema_version: z.literal("talos_browser_hmi_preflight_v2"),
  interaction_id: interactionIdSchema,
  session_id: boundedUtf8Schema(128).min(1),
  state_version: safeStateVersionSchema,
  frame_sha256: sha256Schema,
  origin: boundedUtf8Schema(2_048),
  point: pointSchema,
  target: BrowserHmiTargetDescriptorSchema,
}).strict();

const snapshotNodeSchema = z.object({
  ref: boundedUtf8Schema(128).min(1),
  role: boundedUtf8Schema(64),
  name: boundedUtf8Schema(512),
  href: httpHrefSchema.optional(),
  level: z.number().int().min(1).max(6).optional(),
  visible: z.boolean(),
}).strict();

export const BrowserHmiResultResponseSchema = z.object({
  schema_version: z.literal("talos_browser_hmi_result_v2"),
  capture_id: z.string().regex(/^cap_[a-f0-9-]+$/),
  interaction_id: interactionIdSchema,
  command_id: commandIdSchema,
  session_id: boundedUtf8Schema(128).min(1),
  source_state_version: safeStateVersionSchema,
  state_version: safeStateVersionSchema,
  frame_sha256: sha256Schema,
  url: canonicalEvidenceUrlSchema,
  title: boundedUtf8Schema(512),
  effect_classification: z.enum(["ordinary", "sensitive"]),
  sensitive_effect_authorized: z.boolean(),
  target: BrowserHmiTargetDescriptorSchema,
  screenshot: z.object({
    mime_type: z.literal("image/png"),
    width: z.number().int().positive().max(3_840),
    height: z.number().int().positive().max(2_160),
    sha256: sha256Schema,
    base64: z.string().min(1),
  }).strict(),
  snapshot: z.object({
    snapshot_id: z.string().regex(/^snap_[A-Za-z0-9-]+$/),
    format: z.literal("accessibility_refs_v1"),
    text_digest: boundedUtf8Schema(4_000),
    sha256: sha256Schema,
    nodes: z.array(snapshotNodeSchema).max(500),
  }).strict(),
  captured_at: z.string().datetime(),
}).strict().superRefine((result, context) => {
  if (result.target.required_effect_classification === "sensitive"
    && result.effect_classification !== "sensitive") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["effect_classification"],
      message: "The executed effect classification is weaker than the target requires.",
    });
  }
  if (result.effect_classification === "sensitive"
    && result.sensitive_effect_authorized !== true) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["sensitive_effect_authorized"],
      message: "Sensitive effects must bind explicit authorization.",
    });
  }
});

export const BrowserHmiScrollRequestSchema = z.object({
  schema_version: z.literal("talos_browser_hmi_scroll_v2"),
  interaction_id: interactionIdSchema,
  state_version: safeStateVersionSchema,
  expected_frame_sha256: sha256Schema,
  delta_y: z.number().finite().min(-10_000).max(10_000),
}).strict();

export const BrowserHmiScrollResponseSchema = z.object({
  schema_version: z.literal("talos_browser_hmi_scroll_v2"),
  interaction_id: interactionIdSchema,
  session_id: boundedUtf8Schema(128).min(1),
  source_state_version: safeStateVersionSchema,
  state_version: safeStateVersionSchema,
  frame_sha256: sha256Schema,
  url: canonicalEvidenceUrlSchema,
  title: boundedUtf8Schema(512),
  screenshot: z.object({
    mime_type: z.literal("image/png"),
    width: z.number().int().positive().max(3_840),
    height: z.number().int().positive().max(2_160),
    sha256: sha256Schema,
    base64: z.string().min(1),
  }).strict(),
  snapshot: z.object({
    snapshot_id: z.string().regex(/^snap_[A-Za-z0-9-]+$/),
    format: z.literal("accessibility_refs_v1"),
    text_digest: boundedUtf8Schema(4_000),
    sha256: sha256Schema,
    nodes: z.array(snapshotNodeSchema).max(500),
  }).strict(),
  captured_at: z.string().datetime(),
}).strict();

export type BrowserHmiScrollRequest = z.infer<typeof BrowserHmiScrollRequestSchema>;
export type BrowserHmiScrollResponse = z.infer<typeof BrowserHmiScrollResponseSchema>;

function canonicalHttpHref(url: URL): string {
  return url.pathname === "/" ? url.origin : `${url.origin}${url.pathname}`;
}

export type BrowserHmiPreflightRequest = z.infer<typeof BrowserHmiPreflightRequestSchema>;
export type BrowserHmiExecuteRequest = z.infer<typeof BrowserHmiExecuteRequestSchema>;
export type BrowserHmiTargetDescriptor = z.infer<typeof BrowserHmiTargetDescriptorSchema>;
export type BrowserHmiPreflightResponse = z.infer<typeof BrowserHmiPreflightResponseSchema>;
export type BrowserHmiResultResponse = z.infer<typeof BrowserHmiResultResponseSchema>;
