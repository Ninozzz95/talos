import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { BrowserToolDefinitions, BrowserToolResultSchema } from "./BrowserToolContracts.js";
import { BrowserToolDispatcher } from "./BrowserToolDispatcher.js";

export const TALOS_MCP_RESULT_META_KEY = "com.github.ninozzz95.talos/tool-result";
export const TALOS_MCP_IDEMPOTENCY_META_KEY = "com.github.ninozzz95.talos/idempotency-key";

export function createBrowserMcpServer(sessionId: string, dispatcher: BrowserToolDispatcher): Server {
  const server = new Server(
    { name: "talos-browser-worker", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: BrowserToolDefinitions,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolUseId = `mcp_${randomUUID()}`;
    const idempotencyKey = mcpIdempotencyKey(request.params._meta);
    if (request.params.name === "browser_click" && !idempotencyKey) {
      return mcpResult(BrowserToolResultSchema.parse({
        schema_version: "talos_tool_result_v1",
        tool_use_id: toolUseId,
        isError: true,
        content: [{ type: "text", text: "MCP browser_click requires a stable idempotency key in request metadata." }],
        structuredContent: {
          code: "TALOS_BROWSER_IDEMPOTENCY_KEY_REQUIRED",
          message: "MCP browser_click requires a stable idempotency key in request metadata.",
        },
        evidence: [],
      }));
    }
    const result = BrowserToolResultSchema.parse(await dispatcher.call(sessionId, {
      tool_use_id: toolUseId,
      name: request.params.name,
      arguments: request.params.arguments ?? {},
    }, { idempotencyKey }));

    return mcpResult(result);
  });

  return server;
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

function mcpResult(result: ReturnType<typeof BrowserToolResultSchema.parse>) {
  return {
    content: result.content,
    isError: result.isError,
    ...(result.structuredContent === null ? {} : { structuredContent: result.structuredContent }),
    _meta: {
      [TALOS_MCP_RESULT_META_KEY]: {
        schema_version: result.schema_version,
        tool_use_id: result.tool_use_id,
        evidence: result.evidence,
      },
    },
  };
}
