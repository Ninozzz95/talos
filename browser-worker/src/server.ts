import Fastify, { type FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import { BrowserSessionManager } from "./BrowserSessionManager.js";
import { BrowserError, errorPayload } from "./BrowserErrors.js";
import { assertAllowedBrowserUrl } from "./BrowserUrlPolicy.js";
import { captureSnapshot } from "./BrowserSnapshot.js";
import { captureCanonicalBrowserFrame } from "./BrowserFrameCapture.js";
import { createSessionSchema, navigateSchema } from "./schemas.js";
import { BrowserToolDefinitions, BrowserToolCallSchema, BrowserToolResultSchema } from "./BrowserToolContracts.js";
import { BrowserToolDispatcher } from "./BrowserToolDispatcher.js";
import {
  BrowserHmiExecuteRequestSchema,
  BrowserHmiPreflightRequestSchema,
} from "./BrowserHmiContracts.js";
import { BrowserHmiService } from "./BrowserHmiService.js";
import { assertWorkerTokenConfiguration, workerTokensEqual } from "./BrowserWorkerAuth.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createBrowserMcpServer } from "./BrowserMcpAdapter.js";

export interface BrowserWorkerUnexpectedErrorEvent {
  correlationId: string;
  method: string;
  route: string;
  error: unknown;
}

interface BrowserWorkerServerOptions {
  sessions?: BrowserSessionManager;
  internalToken?: string;
  runtimeEnvironment?: string;
  mcpAllowedHosts?: string[];
  onUnexpectedError?: (event: BrowserWorkerUnexpectedErrorEvent) => void;
}

export function buildServer(options: BrowserWorkerServerOptions = {}): FastifyInstance {
  const internalToken = options.internalToken ?? process.env.TALOS_BROWSER_WORKER_TOKEN;
  assertWorkerTokenConfiguration(internalToken, options.runtimeEnvironment ?? process.env.NODE_ENV);
  const app = Fastify({ logger: false });
  const sessions = options.sessions ?? new BrowserSessionManager();
  const browserTools = new BrowserToolDispatcher(sessions);
  const browserHmi = new BrowserHmiService(sessions);
  const mcpAllowedHosts = allowedMcpHosts(options.mcpAllowedHosts, process.env.TALOS_BROWSER_MCP_ALLOWED_HOSTS);

  const reportUnexpectedError = options.onUnexpectedError ?? reportUnexpectedWorkerError;

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof BrowserError) return reply.code(error.statusCode).send(errorPayload(error));
    if ((error as { code?: string }).code === "FST_ERR_CTP_INVALID_JSON_BODY") {
      return reply.code(400).send({ message: "Malformed JSON request body.", code: "TALOS_BROWSER_INVALID_JSON", details: {} });
    }
    const route = request.routeOptions.url ?? request.url.split("?", 1)[0] ?? request.url;
    const correlationId = request.id;
    try {
      reportUnexpectedError({ correlationId, method: request.method, route, error });
    } catch {
      // Diagnostics must never replace the original controlled failure response.
    }
    if (isHmiRoute(route)) {
      return reply.code(502).send({
        message: "Browser HMI protocol operation failed.",
        code: "TALOS_BROWSER_HMI_PROTOCOL_FAILURE",
        details: { correlation_id: correlationId },
      });
    }
    return reply.code(500).send(errorPayload(error));
  });

  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ message: "Browser worker route not found.", code: "TALOS_BROWSER_ROUTE_NOT_FOUND", details: {} }));

  app.addHook("preHandler", async (request) => {
    if (request.url === "/health") return;
    const token = request.headers["x-talos-worker-token"];
    if (typeof token !== "string" || token.length === 0) throw new BrowserError("Worker token is required.", "TALOS_BROWSER_WORKER_TOKEN_REQUIRED", 401);
    if (!workerTokensEqual(token, internalToken)) throw new BrowserError("Worker token is invalid.", "TALOS_BROWSER_WORKER_TOKEN_INVALID", 401);
  });

  app.get("/health", async () => ({ data: { status: "ok", service: "talos-browser-worker" } }));

  app.get("/ready", async (_request, reply) => {
    try {
      await sessions.assertRuntimeReady();
    } catch {
      return reply.code(503).send({
        data: { status: "degraded", service: "talos-browser-worker", runtime: "chromium" },
      });
    }

    return {
      data: { status: "ready", service: "talos-browser-worker", runtime: "chromium" },
    };
  });

  app.get("/tools", async () => ({ data: { tools: BrowserToolDefinitions } }));

  app.post("/sessions", async (request, reply) => {
    const parsed = createSessionSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "Invalid browser session payload.", code: "TALOS_BROWSER_INVALID_SESSION_PAYLOAD", details: parsed.error.flatten() });
    const ownerRef = ownerFromRequest(request);
    if (ownerRef !== parsed.data.ownerRef) throw new BrowserError("Session owner does not match request owner.", "TALOS_BROWSER_OWNER_MISMATCH", 403);
    return reply.code(201).send({ data: await sessions.create(parsed.data) });
  });

  app.get<{ Params: { id: string } }>("/sessions/:id", async (request) => ({ data: sessionsSummary(await ownedSession(sessions, request)) }));

  app.post<{ Params: { id: string } }>("/sessions/:id/navigate", async (request, reply) => {
    const parsed = navigateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "Invalid navigation payload.", code: "TALOS_BROWSER_INVALID_NAVIGATION_PAYLOAD", details: parsed.error.flatten() });
    await ownedSession(sessions, request);
    await assertAllowedBrowserUrl(parsed.data.url);
    const data = await sessions.runExclusive(request.params.id, async () => {
      const session = await sessions.navigate(request.params.id, parsed.data);
      const page = await sessions.get(request.params.id);
      return { ...session, url: page.page.url(), title: await page.page.title(), capturedAt: new Date().toISOString() };
    });
    return { data };
  });

  app.post<{ Params: { id: string } }>("/sessions/:id/tools/call", async (request, reply) => {
    const parsed = BrowserToolCallSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "Invalid browser tool call payload.", code: "TALOS_BROWSER_INVALID_TOOL_CALL", details: parsed.error.flatten() });
    await ownedSession(sessions, request);
    const result = BrowserToolResultSchema.parse(await browserTools.call(request.params.id, parsed.data));
    return reply.code(200).send(result);
  });

  app.post<{ Params: { id: string } }>("/sessions/:id/mcp", async (request, reply) => {
    assertMcpTransportRequest(request.headers, mcpAllowedHosts);
    await ownedSession(sessions, request);

    const server = createBrowserMcpServer(request.params.id, browserTools);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    let closed = false;
    const close = (): void => {
      if (closed) return;
      closed = true;
      void transport.close();
      void server.close();
    };

    reply.raw.once("close", close);
    reply.hijack();
    try {
      await server.connect(transport);
      await transport.handleRequest(request.raw, reply.raw, request.body);
    } catch {
      if (!reply.raw.headersSent) {
        reply.raw.writeHead(500, { "content-type": "application/json" });
        reply.raw.end(JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error." },
          id: null,
        }));
      } else if (!reply.raw.writableEnded) {
        reply.raw.end();
      }
      close();
    }

    return reply;
  });

  for (const method of ["GET", "DELETE"] as const) {
    app.route<{ Params: { id: string } }>({
      method,
      url: "/sessions/:id/mcp",
      handler: async (request, reply) => {
        assertMcpTransportRequest(request.headers, mcpAllowedHosts);
        await ownedSession(sessions, request);
        return reply.code(405).send({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Method not allowed." },
          id: null,
        });
      },
    });
  }

  app.post<{ Params: { id: string } }>("/sessions/:id/hmi/pointer/preflight", async (request, reply) => {
    const parsed = BrowserHmiPreflightRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Invalid browser HMI pointer payload.",
        code: "TALOS_BROWSER_HMI_INVALID_POINTER",
        details: parsed.error.flatten(),
      });
    }
    await ownedSession(sessions, request);
    return reply.code(200).send({ data: await browserHmi.preflight(request.params.id, parsed.data) });
  });

  app.post<{ Params: { id: string } }>("/sessions/:id/hmi/pointer/execute", async (request, reply) => {
    const parsed = BrowserHmiExecuteRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Invalid browser HMI pointer payload.",
        code: "TALOS_BROWSER_HMI_INVALID_POINTER",
        details: parsed.error.flatten(),
      });
    }
    await ownedSession(sessions, request);
    return reply.code(200).send({ data: await browserHmi.execute(request.params.id, parsed.data) });
  });

  app.post<{ Params: { id: string } }>("/sessions/:id/screenshot", async (request) => {
    await ownedSession(sessions, request);
    return sessions.runExclusive(request.params.id, async (session) => {
      if (!session.capabilities.screenshots) throw new BrowserError("Screenshots are not enabled for this session.", "TALOS_BROWSER_CAPABILITY_DENIED", 403);
      const image = await captureCanonicalBrowserFrame(session.page);
      return { data: { sessionId: session.sessionId, stateVersion: session.stateVersion, mime: "image/png", width: session.viewport.width, height: session.viewport.height, sha256: createHash("sha256").update(image).digest("hex"), base64: image.toString("base64"), capturedAt: new Date().toISOString() } };
    });
  });

  app.post<{ Params: { id: string } }>("/sessions/:id/snapshot", async (request) => {
    await ownedSession(sessions, request);
    return sessions.runExclusive(request.params.id, async (session) => {
      if (!session.capabilities.accessibilitySnapshot) throw new BrowserError("Accessibility snapshots are not enabled for this session.", "TALOS_BROWSER_CAPABILITY_DENIED", 403);
      const snapshot = await captureSnapshot(session.page);
      sessions.recordSnapshot(session.sessionId, snapshot);
      return { data: { sessionId: session.sessionId, stateVersion: session.stateVersion, url: session.page.url(), title: await session.page.title(), ...snapshot, capturedAt: new Date().toISOString() } };
    });
  });

  app.delete<{ Params: { id: string } }>("/sessions/:id", async (request, reply) => {
    await ownedSession(sessions, request);
    await sessions.delete(request.params.id);
    return reply.code(204).send();
  });

  app.addHook("onClose", async () => sessions.close());
  return app;
}

function ownerFromRequest(request: { headers: Record<string, string | string[] | undefined> }): string {
  // The worker token authenticates the internal service caller first. Laravel must derive and overwrite this owner header; it is not an independent trust boundary and does not protect against a compromised control-plane token.
  const ownerRef = request.headers["x-talos-owner-ref"];
  if (typeof ownerRef !== "string" || ownerRef.length === 0) throw new BrowserError("Request owner header is required.", "TALOS_BROWSER_OWNER_REQUIRED", 401);
  return ownerRef;
}

function allowedMcpHosts(configured: string[] | undefined, environmentValue: string | undefined): Set<string> {
  const values = configured ?? environmentValue?.split(",") ?? ["browser-worker", "localhost", "127.0.0.1", "::1"];
  const normalized = values.map((value) => value.trim().toLowerCase()).filter((value) => value.length > 0);
  if (normalized.length === 0) throw new Error("TALOS browser MCP host allowlist must not be empty.");
  return new Set(normalized);
}

function assertMcpTransportRequest(
  headers: Record<string, string | string[] | undefined>,
  allowedHosts: Set<string>,
): void {
  if (headers.origin !== undefined) {
    throw new BrowserError("Browser origins are not permitted on the internal MCP transport.", "TALOS_BROWSER_MCP_ORIGIN_DENIED", 403);
  }
  const rawHost = headers.host;
  if (typeof rawHost !== "string" || rawHost.length === 0) {
    throw new BrowserError("MCP transport host header is required.", "TALOS_BROWSER_MCP_HOST_REQUIRED", 400);
  }
  let hostname: string;
  try {
    hostname = new URL(`http://${rawHost}`).hostname.replace(/^\[|\]$/g, "").toLowerCase();
  } catch {
    throw new BrowserError("MCP transport host header is invalid.", "TALOS_BROWSER_MCP_HOST_DENIED", 403);
  }
  if (!allowedHosts.has(hostname)) {
    throw new BrowserError("MCP transport host is not allowed.", "TALOS_BROWSER_MCP_HOST_DENIED", 403);
  }
}

async function ownedSession(sessions: BrowserSessionManager, request: { headers: Record<string, string | string[] | undefined>; params: { id: string } }) {
  const session = await sessions.get(request.params.id);
  if (session.ownerRef !== ownerFromRequest(request)) throw new BrowserError("Request owner cannot operate this session.", "TALOS_BROWSER_OWNER_MISMATCH", 403);
  return session;
}

function sessionsSummary(session: Awaited<ReturnType<BrowserSessionManager["get"]>>) {
  return {
    sessionId: session.sessionId,
    status: session.status,
    mode: session.mode,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    viewport: session.viewport,
    capabilities: session.capabilities,
    stateVersion: session.stateVersion,
    ...(session.recovery ? { recovery: session.recovery } : {}),
  };
}

function isHmiRoute(route: string): boolean {
  return route.startsWith("/sessions/:id/hmi/") || /^\/sessions\/[^/]+\/hmi\//.test(route);
}

function reportUnexpectedWorkerError(event: BrowserWorkerUnexpectedErrorEvent): void {
  const diagnostic = event.error instanceof Error
    ? `${event.error.name}:${event.error.message}`
    : String(event.error);
  const fingerprint = createHash("sha256").update(diagnostic).digest("hex").slice(0, 16);
  process.stderr.write(`${JSON.stringify({
    level: "error",
    service: "talos-browser-worker",
    event: "unexpected_worker_error",
    correlation_id: event.correlationId,
    method: event.method,
    route: event.route,
    error_fingerprint: fingerprint,
  })}\n`);
}
