import { createRequire } from "node:module";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { CallToolRequest, Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const require = createRequire(import.meta.url);
const PackageMetadataSchema = z.object({
  name: z.literal("@playwright/mcp"),
  version: z.literal("0.0.78"),
});
const packageMetadata = PackageMetadataSchema.parse(require("@playwright/mcp/package.json"));

export const PLAYWRIGHT_MCP_ADAPTER_NAME = "playwright-mcp";
export const PLAYWRIGHT_MCP_ADAPTER_VERSION = packageMetadata.version;
export const PLAYWRIGHT_MCP_SAFE_TOOL_NAMES = [
  "browser_navigate",
  "browser_snapshot",
  "browser_take_screenshot",
  "browser_click",
  "browser_wait_for",
  "browser_tabs",
] as const;

export type PlaywrightMcpSafeToolName = typeof PLAYWRIGHT_MCP_SAFE_TOOL_NAMES[number];
export type BrowserAdapterToolResult = Awaited<ReturnType<Client["callTool"]>>;

export interface BrowserAdapterHandshake {
  adapterName: typeof PLAYWRIGHT_MCP_ADAPTER_NAME;
  adapterVersion: typeof PLAYWRIGHT_MCP_ADAPTER_VERSION;
  transport: "in-memory";
  tools: Tool[];
}

export interface BrowserAutomationAdapter {
  handshake(sessionId: string, signal: AbortSignal): Promise<BrowserAdapterHandshake>;
  callTool(sessionId: string, request: CallToolRequest["params"], signal: AbortSignal): Promise<BrowserAdapterToolResult>;
  cancelSession(sessionId: string, reason: string): Promise<void>;
  closeSession(sessionId: string): Promise<void>;
  close(): Promise<void>;
}

export class BrowserAdapterCancellationError extends Error {
  override readonly name = "BrowserAdapterCancellationError";
}
