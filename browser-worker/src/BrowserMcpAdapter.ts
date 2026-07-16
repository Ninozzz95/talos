import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  CallToolResultSchema,
  ListToolsRequestSchema,
  type CallToolRequest,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import {
  BrowserAdapterCancellationError,
  type BrowserAutomationAdapter,
} from "./adapters/BrowserAutomationAdapter.js";
import { BrowserError } from "./BrowserErrors.js";
import type { BrowserSession, BrowserSessionManager } from "./BrowserSessionManager.js";
import { assertAllowedBrowserUrl } from "./BrowserUrlPolicy.js";
import type {
  BrowserActionCapabilityExpectation,
  VerifiedBrowserActionCapability,
} from "./BrowserActionCapability.js";

export const TALOS_MCP_RESULT_META_KEY = "com.github.ninozzz95.talos/tool-result";
export const TALOS_MCP_IDEMPOTENCY_META_KEY = "com.github.ninozzz95.talos/idempotency-key";

export interface BrowserMcpServerOptions {
  verifiedAction?: VerifiedBrowserActionCapability;
}

export function mcpActionCapabilityExpectation(
  rawRequest: unknown,
  ownerRef: string,
  sessionId: string,
  stateVersion: number,
): BrowserActionCapabilityExpectation | undefined {
  const parsed = CallToolRequestSchema.safeParse(rawRequest);
  if (!parsed.success || parsed.data.params.name !== "browser_click") return undefined;
  const idempotencyKey = mcpIdempotencyKey(parsed.data.params._meta);
  if (!idempotencyKey) return undefined;

  return {
    ownerRef,
    workerSessionId: sessionId,
    actionId: idempotencyKey,
    operation: "browser_click",
    preconditionStateVersion: stateVersion,
    request: {
      name: parsed.data.params.name,
      arguments: parsed.data.params.arguments ?? {},
      idempotency_key: idempotencyKey,
    },
  };
}

export function createBrowserMcpServer(
  sessionId: string,
  adapter: BrowserAutomationAdapter,
  sessions: BrowserSessionManager,
  options: BrowserMcpServerOptions = {},
): Server {
  const server = new Server(
    { name: "talos-browser-worker", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async (_request, context) => {
    const handshake = await adapter.handshake(sessionId, context.signal);
    return { tools: gatewayTools(handshake.tools) };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request, context) => {
    try {
      const session = await sessions.get(sessionId);
      await assertGatewayPolicy(session, request.params);
      if (request.params.name === "browser_click" || mcpIdempotencyKey(request.params._meta)) {
        return await callIdempotentTool(sessionId, request.params, adapter, sessions, context.signal, options.verifiedAction);
      }
      return await callUpstream(sessionId, request.params, adapter, context.signal);
    } catch (error) {
      return controlledError(error);
    }
  });

  return server;
}

async function assertGatewayPolicy(session: BrowserSession, request: CallToolRequest["params"]): Promise<void> {
  if (["browser_snapshot", "browser_take_screenshot"].includes(request.name)
      && Object.hasOwn(request.arguments ?? {}, "filename")) {
    throw new BrowserError(
      "TALOS does not allow MCP tools to write browser output files directly.",
      "TALOS_BROWSER_FILE_OUTPUT_DENIED",
      403,
    );
  }
  switch (request.name) {
    case "browser_navigate": {
      if (!session.capabilities.navigation) throw capabilityDenied("Navigation");
      const url = request.arguments?.url;
      if (typeof url !== "string") {
        throw new BrowserError("Browser navigation requires a URL.", "TALOS_BROWSER_INVALID_NAVIGATION_URL", 400);
      }
      await assertAllowedBrowserUrl(url);
      return;
    }
    case "browser_snapshot":
    case "browser_wait_for":
    case "browser_tabs":
      if (!session.capabilities.accessibilitySnapshot) throw capabilityDenied("Browser inspection");
      return;
    case "browser_take_screenshot":
      if (!session.capabilities.screenshots) throw capabilityDenied("Screenshots");
      return;
    case "browser_click":
      if (session.capabilities.hmiActions !== true) throw capabilityDenied("Semantic browser clicks");
      if (!session.capabilities.accessibilitySnapshot) throw capabilityDenied("Semantic browser click evidence");
      return;
    default:
      throw new BrowserError(
        `Browser MCP tool is not allowlisted: ${request.name}`,
        "TALOS_BROWSER_MCP_TOOL_NOT_ALLOWED",
        403,
      );
  }
}

function gatewayTools(tools: Tool[]): Tool[] {
  return tools.map((tool) => {
    const clone = structuredClone(tool);
    if (!["browser_snapshot", "browser_take_screenshot"].includes(clone.name)) return clone;
    const properties = clone.inputSchema.properties as Record<string, unknown> | undefined;
    if (properties) delete properties.filename;
    if (Array.isArray(clone.inputSchema.required)) {
      clone.inputSchema.required = clone.inputSchema.required.filter((name) => name !== "filename");
    }
    return clone;
  });
}

async function callIdempotentTool(
  sessionId: string,
  request: CallToolRequest["params"],
  adapter: BrowserAutomationAdapter,
  sessions: BrowserSessionManager,
  signal: AbortSignal,
  verifiedAction: VerifiedBrowserActionCapability | undefined,
): Promise<CallToolResult> {
  const idempotencyKey = mcpIdempotencyKey(request._meta);
  if (!idempotencyKey) {
    return controlledError(new BrowserError(
      "MCP browser_click requires a stable idempotency key in request metadata.",
      "TALOS_BROWSER_IDEMPOTENCY_KEY_REQUIRED",
      400,
    ));
  }
  const consequential = request.name === "browser_click";
  if (consequential && !verifiedAction) {
    return controlledError(new BrowserError(
      "A signed browser action capability is required.",
      "TALOS_BROWSER_ACTION_CAPABILITY_REQUIRED",
      401,
    ));
  }
  if (consequential && (verifiedAction?.actionId !== idempotencyKey
    || verifiedAction.operation !== "browser_click"
    || verifiedAction.workerSessionId !== sessionId)) {
    return controlledError(new BrowserError(
      "The browser action capability does not match the MCP click.",
      "TALOS_BROWSER_ACTION_CAPABILITY_MISMATCH",
      403,
    ));
  }

  const session = await sessions.get(sessionId);
  let claim;
  try {
    claim = session.actionLedger.claim<CallToolResult>({
      actionId: idempotencyKey,
      idempotencyKey,
      operation: request.name,
      preconditionStateVersion: verifiedAction?.preconditionStateVersion ?? session.stateVersion,
      request: { name: request.name, arguments: request.arguments ?? {} },
      consequential,
    });
  } catch (error) {
    if (error instanceof BrowserError && consequential && error.code === "TALOS_BROWSER_ACTION_CONFLICT") {
      return controlledError(new BrowserError(
        "The browser click id is already bound to a different request.",
        "TALOS_BROWSER_CLICK_COMMAND_CONFLICT",
        409,
      ));
    }
    return controlledError(error);
  }
  if (claim.kind === "result") return CallToolResultSchema.parse(claim.result);
  if (claim.kind === "error") return controlledError(claim.error);

  try {
    session.actionLedger.markDispatched(idempotencyKey);
    const result = await callUpstream(sessionId, request, adapter, signal);
    session.actionLedger.commit(idempotencyKey, result);
    return result;
  } catch (error) {
    let current = await sessions.get(sessionId).catch(() => undefined);
    if (current && consequential) {
      if (!current.recovery) {
        current = sessions.markRecoveryRequired(sessionId, "mcp_click_upstream_uncertain");
      }
      const recovery = new BrowserError(
        "The browser click may have taken effect but the upstream result could not be committed.",
        "TALOS_BROWSER_CLICK_RECOVERY_REQUIRED",
        409,
        {
          state_version: current.stateVersion,
          reason_code: current.recovery?.reasonCode ?? "mcp_click_upstream_uncertain",
          idempotency_status: "ambiguous",
        },
      );
      current.actionLedger.markAmbiguous(idempotencyKey, recovery);
      return controlledError(recovery);
    }
    const controlled = normalizeGatewayError(error);
    const result = controlledError(error);
    if (current) current.actionLedger.commit(idempotencyKey, result);
    else session.actionLedger.markAmbiguous(idempotencyKey, new BrowserError(controlled.message, controlled.code, 502, controlled.details));
    return result;
  }
}

async function callUpstream(
  sessionId: string,
  request: CallToolRequest["params"],
  adapter: BrowserAutomationAdapter,
  signal: AbortSignal,
): Promise<CallToolResult> {
  try {
    return CallToolResultSchema.parse(await adapter.callTool(sessionId, request, signal));
  } catch (error) {
    await adapter.closeSession(sessionId).catch(() => undefined);
    throw error;
  }
}

function capabilityDenied(capability: string): BrowserError {
  return new BrowserError(
    `${capability} are not enabled for this session.`,
    "TALOS_BROWSER_CAPABILITY_DENIED",
    403,
  );
}

function controlledError(error: unknown): CallToolResult {
  const normalized = normalizeGatewayError(error);
  return CallToolResultSchema.parse({
    content: [{ type: "text", text: normalized.message }],
    isError: true,
    structuredContent: {
      code: normalized.code,
      message: normalized.message,
      ...normalized.details,
    },
  });
}

function normalizeGatewayError(error: unknown): { code: string; message: string; details: Record<string, unknown> } {
  if (error instanceof BrowserAdapterCancellationError) {
    return {
      code: "TALOS_BROWSER_REQUEST_CANCELLED",
      message: "The Browser operation was cancelled.",
      details: {},
    };
  }
  if (error instanceof BrowserError) {
    return { code: error.code, message: error.message, details: error.details };
  }
  const message = error instanceof Error ? error.message : "Playwright MCP browser operation failed.";
  if (message.includes("one-tab policy denies")) {
    return { code: "TALOS_BROWSER_TAB_POLICY_DENIED", message, details: {} };
  }
  if (message.includes("not allowlisted")) {
    return { code: "TALOS_BROWSER_MCP_TOOL_NOT_ALLOWED", message, details: {} };
  }
  if (message.includes("timed out")) {
    return { code: "TALOS_BROWSER_MCP_UPSTREAM_TIMEOUT", message, details: {} };
  }
  return {
    code: "TALOS_BROWSER_MCP_UPSTREAM_FAILED",
    message: "Playwright MCP browser operation failed.",
    details: { reason: message },
  };
}

function mcpIdempotencyKey(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const values = metadata as Record<string, unknown>;
  const explicit = values[TALOS_MCP_IDEMPOTENCY_META_KEY];
  if (typeof explicit === "string" && explicit.length > 0 && Buffer.byteLength(explicit, "utf8") <= 256) return explicit;
  const relatedTask = values["io.modelcontextprotocol/related-task"];
  if (relatedTask && typeof relatedTask === "object") {
    const taskId = (relatedTask as Record<string, unknown>).taskId;
    if (typeof taskId === "string" && taskId.length > 0 && Buffer.byteLength(taskId, "utf8") <= 256) return `task:${taskId}`;
  }
  return undefined;
}
