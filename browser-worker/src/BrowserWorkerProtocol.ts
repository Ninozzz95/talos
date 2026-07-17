import { createRequire } from "node:module";
import { z } from "zod";
import {
  PLAYWRIGHT_MCP_ADAPTER_NAME,
  PLAYWRIGHT_MCP_ADAPTER_VERSION,
} from "./adapters/BrowserAutomationAdapter.js";
import {
  MAX_BROWSER_ACTION_CAPABILITY_TTL_SECONDS,
  TALOS_BROWSER_ACTION_CAPABILITY_AUDIENCE,
  TALOS_BROWSER_ACTION_CAPABILITY_ISSUER,
  TALOS_BROWSER_ACTION_CAPABILITY_SCHEMA,
  TALOS_BROWSER_ACTION_CAPABILITY_TYPE,
  type BrowserActionCapabilityDescriptor,
} from "./BrowserActionCapability.js";

const require = createRequire(import.meta.url);
const PackageMetadataSchema = z.object({
  name: z.string().min(1).max(128),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/),
});
const workerPackage = PackageMetadataSchema.parse(require("../package.json"));

export const TALOS_BROWSER_WORKER_PROTOCOL = "talos.browser.worker.v2";
export const TALOS_BROWSER_WORKER_HANDSHAKE_SCHEMA = "talos.browser.worker-handshake.v2";
export const TALOS_BROWSER_WORKER_HANDSHAKE_PATH = `/protocols/${TALOS_BROWSER_WORKER_PROTOCOL}/handshake`;
export const TALOS_BROWSER_HMI_RUNTIME_PROTOCOL = "talos_browser_hmi_runtime_v2.1.0";
export const TALOS_BROWSER_SESSION_BOOTSTRAP_PATH = `/protocols/${TALOS_BROWSER_HMI_RUNTIME_PROTOCOL}/sessions`;
export const TALOS_BROWSER_IDEMPOTENT_SESSION_BOOTSTRAP_PATH = `${TALOS_BROWSER_SESSION_BOOTSTRAP_PATH}/idempotent`;
export const TALOS_BROWSER_SESSION_CANCEL_SUFFIX = "/cancel";
export const TALOS_BROWSER_WORKER_NAME = "talos-browser-worker";
export const TALOS_BROWSER_WORKER_VERSION = workerPackage.version;
export const TALOS_BROWSER_ADAPTER_NAME = PLAYWRIGHT_MCP_ADAPTER_NAME;
export const TALOS_BROWSER_ADAPTER_VERSION = PLAYWRIGHT_MCP_ADAPTER_VERSION;

const BrowserCapabilitySchema = z.enum([
  "navigate",
  "snapshot",
  "screenshot",
  "read",
  "click",
  "interactive_frame",
  "semantic_locator",
  "tabs",
  "upload",
]);
const BrowserCapabilities = BrowserCapabilitySchema.options;
const DegradedReasonSchema = z.string().min(1).max(128).regex(/^[a-z][a-z0-9_]*$/);

export const BrowserRuntimeDescriptorSchema = z.strictObject({
  engine: z.literal("chromium"),
  version: z.string().trim().min(1).max(128),
});

export const BrowserSessionCancellationSchema = z.strictObject({
  reason: z.string().trim().min(1).max(512).refine(
    (value) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value),
  ),
});

export type BrowserRuntimeDescriptor = z.infer<typeof BrowserRuntimeDescriptorSchema>;

export const BrowserWorkerHandshakeSchema = z.strictObject({
  schema_version: z.literal(TALOS_BROWSER_WORKER_HANDSHAKE_SCHEMA),
  protocol_version: z.literal(TALOS_BROWSER_WORKER_PROTOCOL),
  worker: z.strictObject({
    name: z.literal(TALOS_BROWSER_WORKER_NAME),
    version: z.literal(TALOS_BROWSER_WORKER_VERSION),
    instance_id: z.uuidv4(),
  }),
  adapter: z.strictObject({
    name: z.literal(TALOS_BROWSER_ADAPTER_NAME),
    version: z.literal(TALOS_BROWSER_ADAPTER_VERSION),
  }),
  browser: z.strictObject({
    engine: z.literal("chromium"),
    version: z.string().trim().min(1).max(128).nullable(),
  }),
  capability_manifest: z.strictObject({
    schema_version: z.literal("talos.browser.capabilities.v1"),
    protocol_version: z.literal(TALOS_BROWSER_WORKER_PROTOCOL),
    adapter_name: z.literal(TALOS_BROWSER_ADAPTER_NAME),
    adapter_version: z.literal(TALOS_BROWSER_ADAPTER_VERSION),
    capabilities: z.tuple(BrowserCapabilities.map((capability) => z.literal(capability)) as [
      z.ZodLiteral<"navigate">,
      z.ZodLiteral<"snapshot">,
      z.ZodLiteral<"screenshot">,
      z.ZodLiteral<"read">,
      z.ZodLiteral<"click">,
      z.ZodLiteral<"interactive_frame">,
      z.ZodLiteral<"semantic_locator">,
      z.ZodLiteral<"tabs">,
      z.ZodLiteral<"upload">,
    ]),
    limits: z.strictObject({
      max_tabs: z.literal(1),
      max_viewport_width: z.literal(3840),
      max_viewport_height: z.literal(2160),
      max_artifact_bytes: z.literal(5_000_000),
    }),
    degraded_reason: DegradedReasonSchema.nullable(),
  }),
  authentication: z.strictObject({
    mode: z.literal("service_token_and_signed_action_capability"),
    owner_binding: z.literal(true),
    action_capability: z.strictObject({
      schema_version: z.literal(TALOS_BROWSER_ACTION_CAPABILITY_SCHEMA),
      algorithm: z.literal("ES256"),
      type: z.literal(TALOS_BROWSER_ACTION_CAPABILITY_TYPE),
      issuer: z.literal(TALOS_BROWSER_ACTION_CAPABILITY_ISSUER),
      audience: z.literal(TALOS_BROWSER_ACTION_CAPABILITY_AUDIENCE),
      key_id: z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u),
      max_ttl_seconds: z.literal(MAX_BROWSER_ACTION_CAPABILITY_TTL_SECONDS),
    }),
  }),
  status: z.enum(["ready", "degraded"]),
  degraded_reason: DegradedReasonSchema.nullable(),
}).superRefine((value, context) => {
  const ready = value.status === "ready";
  const validReadyState = value.browser.version !== null
    && value.degraded_reason === null
    && value.capability_manifest.degraded_reason === null;
  const validDegradedState = value.browser.version === null
    && value.degraded_reason !== null
    && value.capability_manifest.degraded_reason === value.degraded_reason;
  if ((ready && !validReadyState) || (!ready && !validDegradedState)) {
    context.addIssue({ code: "custom", message: "Worker runtime status is inconsistent." });
  }
});

export type BrowserWorkerHandshake = z.infer<typeof BrowserWorkerHandshakeSchema>;

export function createBrowserWorkerHandshake(
  workerInstanceId: string,
  runtime: BrowserRuntimeDescriptor | null,
  degradedReason: string | null,
  actionCapability: BrowserActionCapabilityDescriptor,
): BrowserWorkerHandshake {
  return BrowserWorkerHandshakeSchema.parse({
    schema_version: TALOS_BROWSER_WORKER_HANDSHAKE_SCHEMA,
    protocol_version: TALOS_BROWSER_WORKER_PROTOCOL,
    worker: {
      name: TALOS_BROWSER_WORKER_NAME,
      version: TALOS_BROWSER_WORKER_VERSION,
      instance_id: workerInstanceId,
    },
    adapter: { name: TALOS_BROWSER_ADAPTER_NAME, version: TALOS_BROWSER_ADAPTER_VERSION },
    browser: { engine: "chromium", version: runtime?.version ?? null },
    capability_manifest: {
      schema_version: "talos.browser.capabilities.v1",
      protocol_version: TALOS_BROWSER_WORKER_PROTOCOL,
      adapter_name: TALOS_BROWSER_ADAPTER_NAME,
      adapter_version: TALOS_BROWSER_ADAPTER_VERSION,
      capabilities: BrowserCapabilities,
      limits: {
        max_tabs: 1,
        max_viewport_width: 3840,
        max_viewport_height: 2160,
        max_artifact_bytes: 5_000_000,
      },
      degraded_reason: degradedReason,
    },
    authentication: {
      mode: "service_token_and_signed_action_capability",
      owner_binding: true,
      action_capability: actionCapability,
    },
    status: runtime === null ? "degraded" : "ready",
    degraded_reason: degradedReason,
  });
}

export function browserWorkerProtocols() {
  return {
    worker: TALOS_BROWSER_WORKER_PROTOCOL,
    hmi: TALOS_BROWSER_HMI_RUNTIME_PROTOCOL,
  } as const;
}
