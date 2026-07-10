import Fastify, { type FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import { BrowserSessionManager } from "./BrowserSessionManager.js";
import { BrowserError, errorPayload } from "./BrowserErrors.js";
import { assertAllowedBrowserUrl } from "./BrowserUrlPolicy.js";
import { captureSnapshot } from "./BrowserSnapshot.js";
import { createSessionSchema, navigateSchema } from "./schemas.js";

export function buildServer(options: { sessions?: BrowserSessionManager; internalToken?: string } = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const internalToken = options.internalToken ?? process.env.TALOS_BROWSER_WORKER_TOKEN;
  if (!internalToken) throw new Error("TALOS_BROWSER_WORKER_TOKEN is required.");
  const sessions = options.sessions ?? new BrowserSessionManager();

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof BrowserError) return reply.code(error.statusCode).send(errorPayload(error));
    if ((error as { code?: string }).code === "FST_ERR_CTP_INVALID_JSON_BODY") {
      return reply.code(400).send({ message: "Malformed JSON request body.", code: "TALOS_BROWSER_INVALID_JSON", details: {} });
    }
    return reply.code(500).send(errorPayload(error));
  });

  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ message: "Browser worker route not found.", code: "TALOS_BROWSER_ROUTE_NOT_FOUND", details: {} }));

  app.addHook("preHandler", async (request) => {
    if (request.url === "/health") return;
    const token = request.headers["x-talos-worker-token"];
    if (typeof token !== "string" || token.length === 0) throw new BrowserError("Worker token is required.", "TALOS_BROWSER_WORKER_TOKEN_REQUIRED", 401);
    if (token !== internalToken) throw new BrowserError("Worker token is invalid.", "TALOS_BROWSER_WORKER_TOKEN_INVALID", 401);
  });

  app.get("/health", async () => ({ data: { status: "ok", service: "talos-browser-worker" } }));

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
    await assertAllowedBrowserUrl(parsed.data.url);
    await ownedSession(sessions, request);
    const session = await sessions.navigate(request.params.id, parsed.data);
    const page = await ownedSession(sessions, request);
    return { data: { ...session, url: page.page.url(), title: await page.page.title(), capturedAt: new Date().toISOString() } };
  });

  app.post<{ Params: { id: string } }>("/sessions/:id/screenshot", async (request) => {
    const session = await ownedSession(sessions, request);
    if (!session.capabilities.screenshots) throw new BrowserError("Screenshots are not enabled for this session.", "TALOS_BROWSER_CAPABILITY_DENIED", 403);
    // Slice 1 returns the configured viewport; PNG metadata parsing is deferred to avoid another dependency.
    const image = await session.page.screenshot({ type: "png" });
    return { data: { sessionId: session.sessionId, mime: "image/png", width: session.viewport.width, height: session.viewport.height, sha256: createHash("sha256").update(image).digest("hex"), base64: image.toString("base64"), capturedAt: new Date().toISOString() } };
  });

  app.post<{ Params: { id: string } }>("/sessions/:id/snapshot", async (request) => {
    const session = await ownedSession(sessions, request);
    if (!session.capabilities.accessibilitySnapshot) throw new BrowserError("Accessibility snapshots are not enabled for this session.", "TALOS_BROWSER_CAPABILITY_DENIED", 403);
    return { data: { sessionId: session.sessionId, url: session.page.url(), title: await session.page.title(), ...(await captureSnapshot(session.page)), capturedAt: new Date().toISOString() } };
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

async function ownedSession(sessions: BrowserSessionManager, request: { headers: Record<string, string | string[] | undefined>; params: { id: string } }) {
  const session = await sessions.get(request.params.id);
  if (session.ownerRef !== ownerFromRequest(request)) throw new BrowserError("Request owner cannot operate this session.", "TALOS_BROWSER_OWNER_MISMATCH", 403);
  return session;
}

function sessionsSummary(session: Awaited<ReturnType<BrowserSessionManager["get"]>>) {
  const { ownerRef: _ownerRef, page: _page, context: _context, ...summary } = session;
  return summary;
}
