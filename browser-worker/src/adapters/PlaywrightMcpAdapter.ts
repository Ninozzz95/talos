import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { CallToolRequest, Tool } from "@modelcontextprotocol/sdk/types.js";
import { createConnection } from "@playwright/mcp";
import type { BrowserContext } from "playwright";
import { z } from "zod";
import type { BrowserSessionManager } from "../BrowserSessionManager.js";
import {
  BrowserAdapterCancellationError,
  PLAYWRIGHT_MCP_ADAPTER_NAME,
  PLAYWRIGHT_MCP_ADAPTER_VERSION,
  PLAYWRIGHT_MCP_SAFE_TOOL_NAMES,
  type BrowserAdapterHandshake,
  type BrowserAdapterToolResult,
  type BrowserAutomationAdapter,
  type PlaywrightMcpSafeToolName,
} from "./BrowserAutomationAdapter.js";

const DEFAULT_STARTUP_TIMEOUT_MS = 5_000;
const DEFAULT_CALL_TIMEOUT_MS = 15_000;
const MAX_UPSTREAM_OUTPUT_BYTES = 8 * 1024 * 1024;
const MUTATING_TOOLS = new Set(["browser_navigate", "browser_click", "browser_wait_for"]);
const TabsArgumentsSchema = z.strictObject({
  action: z.enum(["list", "new", "close", "select"]),
  index: z.number().int().nonnegative().optional(),
  url: z.string().optional(),
});

export interface PlaywrightMcpAdapterOptions {
  startupTimeoutMs?: number;
  callTimeoutMs?: number;
  outputRoot?: string;
  allowTestFixtureFileAccess?: boolean;
}

interface PlaywrightMcpSessionConnection {
  client: Client;
  server: Server;
  clientTransport: InMemoryTransport;
  serverTransport: InMemoryTransport;
  outputDirectory: string;
  handshake: BrowserAdapterHandshake;
}

interface PlaywrightMcpConnectionSlot {
  controller: AbortController;
  promise: Promise<PlaywrightMcpSessionConnection>;
}

type UpstreamConnectionFactory = (
  config: NonNullable<Parameters<typeof createConnection>[0]>,
  contextGetter: () => Promise<BrowserContext>,
) => Promise<Server>;

const createUpstreamConnection = createConnection as unknown as UpstreamConnectionFactory;

export class PlaywrightMcpAdapter implements BrowserAutomationAdapter {
  private readonly connections = new Map<string, PlaywrightMcpConnectionSlot>();
  private readonly activeCalls = new Map<string, Set<AbortController>>();
  private readonly startupTimeoutMs: number;
  private readonly callTimeoutMs: number;
  private readonly outputRoot: string;
  private readonly allowTestFixtureFileAccess: boolean;
  private accepting = true;

  constructor(
    private readonly sessions: BrowserSessionManager,
    options: PlaywrightMcpAdapterOptions = {},
  ) {
    this.startupTimeoutMs = boundedTimeout(options.startupTimeoutMs, DEFAULT_STARTUP_TIMEOUT_MS);
    this.callTimeoutMs = boundedTimeout(options.callTimeoutMs, DEFAULT_CALL_TIMEOUT_MS);
    this.outputRoot = resolve(options.outputRoot ?? tmpdir());
    this.allowTestFixtureFileAccess = options.allowTestFixtureFileAccess === true;
  }

  async handshake(sessionId: string, signal: AbortSignal): Promise<BrowserAdapterHandshake> {
    const connection = await this.connection(sessionId, signal);
    return {
      ...connection.handshake,
      tools: connection.handshake.tools.map((tool) => structuredClone(tool)),
    };
  }

  async callTool(
    sessionId: string,
    request: CallToolRequest["params"],
    signal: AbortSignal,
  ): Promise<BrowserAdapterToolResult> {
    if (!isSafeToolName(request.name)) {
      throw new Error(`Playwright MCP tool is not allowlisted: ${request.name}`);
    }
    assertOneTabPolicy(request);
    const callController = new AbortController();
    const callerAbort = () => callController.abort(signal.reason);
    if (signal.aborted) callerAbort();
    else signal.addEventListener("abort", callerAbort, { once: true });
    const active = this.activeCalls.get(sessionId) ?? new Set<AbortController>();
    active.add(callController);
    this.activeCalls.set(sessionId, active);

    try {
      const connection = await this.connection(sessionId, callController.signal);
      return await this.sessions.runExclusive(sessionId, async () => {
        const result = await connection.client.callTool(request, undefined, {
          signal: callController.signal,
          timeout: this.callTimeoutMs,
          maxTotalTimeout: this.callTimeoutMs,
        });
        if (MUTATING_TOOLS.has(request.name) && isSuccessfulImmediateResult(result)) {
          this.sessions.recordAutomationMutation(sessionId);
        }
        return result;
      });
    } finally {
      signal.removeEventListener("abort", callerAbort);
      active.delete(callController);
      if (active.size === 0) this.activeCalls.delete(sessionId);
    }
  }

  async cancelSession(sessionId: string, reason: string): Promise<void> {
    const cancellation = new BrowserAdapterCancellationError(reason);
    for (const controller of this.activeCalls.get(sessionId) ?? []) {
      if (!controller.signal.aborted) controller.abort(cancellation);
    }
    this.activeCalls.delete(sessionId);
    const slot = this.connections.get(sessionId);
    this.connections.delete(sessionId);
    if (!slot) return;
    if (!slot.controller.signal.aborted) {
      slot.controller.abort(cancellation);
    }
    let connection: PlaywrightMcpSessionConnection;
    try {
      connection = await slot.promise;
    } catch {
      return;
    }
    await closeConnection(connection);
  }

  async closeSession(sessionId: string): Promise<void> {
    await this.cancelSession(sessionId, "Playwright MCP connection was closed.");
  }

  async close(): Promise<void> {
    if (!this.accepting && this.connections.size === 0) return;
    this.accepting = false;
    const sessionIds = [...this.connections.keys()];
    await Promise.all(sessionIds.map((sessionId) => this.closeSession(sessionId)));
  }

  private async connection(sessionId: string, signal: AbortSignal): Promise<PlaywrightMcpSessionConnection> {
    if (!this.accepting) throw new Error("Playwright MCP adapter is shutting down.");
    if (signal.aborted) throw abortError(signal);
    const existing = this.connections.get(sessionId);
    if (existing) return raceAbort(existing.promise, signal, this.startupTimeoutMs);

    const controller = new AbortController();
    const operation = this.createSessionConnection(sessionId, controller.signal);
    const promise = raceAbort(operation, controller.signal, this.startupTimeoutMs).catch((error) => {
      if (!controller.signal.aborted) controller.abort(error);
      throw error;
    });
    const slot: PlaywrightMcpConnectionSlot = { controller, promise };
    this.connections.set(sessionId, slot);
    slot.promise.catch(() => {
      if (this.connections.get(sessionId) === slot) this.connections.delete(sessionId);
    });
    return raceAbort(slot.promise, signal, this.startupTimeoutMs);
  }

  private async createSessionConnection(
    sessionId: string,
    signal: AbortSignal,
  ): Promise<PlaywrightMcpSessionConnection> {
    await raceAbort(this.sessions.get(sessionId), signal, this.startupTimeoutMs);
    throwIfAborted(signal);
    await mkdir(this.outputRoot, { recursive: true });
    throwIfAborted(signal);
    const outputDirectory = await mkdtemp(join(this.outputRoot, "talos-playwright-mcp-"));
    let client: Client | undefined;
    let server: Server | undefined;
    let clientTransport: InMemoryTransport | undefined;
    let serverTransport: InMemoryTransport | undefined;

    try {
      const config: NonNullable<Parameters<typeof createConnection>[0]> = {
        allowUnrestrictedFileAccess: this.allowTestFixtureFileAccess,
        codegen: "none",
        imageResponses: "allow",
        outputDir: outputDirectory,
        outputMaxSize: MAX_UPSTREAM_OUTPUT_BYTES,
        snapshot: { mode: "full" },
        timeouts: {
          action: Math.min(this.callTimeoutMs, 5_000),
          navigation: this.callTimeoutMs,
          expect: Math.min(this.callTimeoutMs, 5_000),
        },
      };
      server = await raceAbort(
        createUpstreamConnection(config, async () => (await this.sessions.get(sessionId)).context),
        signal,
        this.startupTimeoutMs,
      );
      throwIfAborted(signal);
      [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      client = new Client({ name: "talos-browser-worker", version: "0.1.0" });
      await raceAbort(server.connect(serverTransport), signal, this.startupTimeoutMs);
      throwIfAborted(signal);
      await raceAbort(client.connect(clientTransport), signal, this.startupTimeoutMs);
      throwIfAborted(signal);
      const discovered = await client.listTools(undefined, {
        signal,
        timeout: this.startupTimeoutMs,
        maxTotalTimeout: this.startupTimeoutMs,
      });
      throwIfAborted(signal);
      const tools = safeTools(discovered.tools);
      throwIfAborted(signal);
      return {
        client,
        server,
        clientTransport,
        serverTransport,
        outputDirectory,
        handshake: {
          adapterName: PLAYWRIGHT_MCP_ADAPTER_NAME,
          adapterVersion: PLAYWRIGHT_MCP_ADAPTER_VERSION,
          transport: "in-memory",
          tools,
        },
      };
    } catch (error) {
      await closePartialConnection(client, server, clientTransport, serverTransport, outputDirectory);
      throw error;
    }
  }
}

function safeTools(discovered: Tool[]): Tool[] {
  const byName = new Map(discovered.map((tool) => [tool.name, tool]));
  return PLAYWRIGHT_MCP_SAFE_TOOL_NAMES.map((name) => {
    const tool = byName.get(name);
    if (!tool || tool.inputSchema.type !== "object" || tool.inputSchema.additionalProperties !== false) {
      throw new Error(`Playwright MCP safe tool contract is missing or open: ${name}`);
    }
    return structuredClone(tool);
  });
}

function isSafeToolName(name: string): name is PlaywrightMcpSafeToolName {
  return (PLAYWRIGHT_MCP_SAFE_TOOL_NAMES as readonly string[]).includes(name);
}

function assertOneTabPolicy(request: CallToolRequest["params"]): void {
  if (request.name !== "browser_tabs") return;
  const parsed = TabsArgumentsSchema.safeParse(request.arguments ?? {});
  if (!parsed.success) throw new Error("Playwright MCP browser_tabs arguments are invalid.");
  if (parsed.data.action === "list") return;
  if (parsed.data.action === "select" && parsed.data.index === 0) return;
  throw new Error(`TALOS one-tab policy denies browser_tabs action: ${parsed.data.action}`);
}

function isSuccessfulImmediateResult(result: BrowserAdapterToolResult): boolean {
  return "content" in result && result.isError !== true;
}

function boundedTimeout(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > 120_000) {
    throw new Error("Playwright MCP timeout must be an integer between 1 and 120000 milliseconds.");
  }
  return value;
}

async function raceAbort<T>(operation: Promise<T>, signal: AbortSignal, timeoutMs: number): Promise<T> {
  if (signal.aborted) throw abortError(signal);
  let timeout: NodeJS.Timeout | undefined;
  let removeAbortListener = (): void => undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    const abort = () => reject(abortError(signal));
    signal.addEventListener("abort", abort, { once: true });
    removeAbortListener = () => signal.removeEventListener("abort", abort);
    timeout = setTimeout(() => reject(new Error("Playwright MCP operation timed out.")), timeoutMs);
  });
  try {
    return await Promise.race([operation, deadline]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    removeAbortListener();
  }
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error("Playwright MCP operation was cancelled.");
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError(signal);
}

async function closeConnection(connection: PlaywrightMcpSessionConnection): Promise<void> {
  await closePartialConnection(
    connection.client,
    connection.server,
    connection.clientTransport,
    connection.serverTransport,
    connection.outputDirectory,
  );
}

async function closePartialConnection(
  client: Client | undefined,
  server: Server | undefined,
  clientTransport: InMemoryTransport | undefined,
  serverTransport: InMemoryTransport | undefined,
  outputDirectory: string,
): Promise<void> {
  await client?.close().catch(() => undefined);
  await server?.close().catch(() => undefined);
  await clientTransport?.close().catch(() => undefined);
  await serverTransport?.close().catch(() => undefined);
  await rm(outputDirectory, { recursive: true, force: true }).catch(() => undefined);
}
