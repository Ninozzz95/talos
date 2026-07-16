import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterAll, describe, expect, it, vi } from "vitest";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { BrowserSessionManager } from "../src/BrowserSessionManager.js";
import { MAX_BROWSER_ACTION_RECORDS } from "../src/BrowserActionLedger.js";
import { MAX_HMI_COMMAND_RECORDS } from "../src/BrowserHmiCommandLedger.js";
import { captureSnapshot } from "../src/BrowserSnapshot.js";
import {
  TALOS_BROWSER_ADAPTER_NAME,
  TALOS_BROWSER_ADAPTER_VERSION,
  BrowserWorkerHandshakeSchema,
  TALOS_BROWSER_HMI_RUNTIME_PROTOCOL,
  TALOS_BROWSER_IDEMPOTENT_SESSION_BOOTSTRAP_PATH,
  TALOS_BROWSER_WORKER_HANDSHAKE_PATH,
  TALOS_BROWSER_WORKER_PROTOCOL,
  TALOS_BROWSER_WORKER_VERSION,
} from "../src/BrowserWorkerProtocol.js";
import type { CreateSessionInput } from "../src/schemas.js";
import { buildServer } from "../src/server.js";
import { startBrowserWorker } from "../src/startBrowserWorker.js";
import type { BrowserAutomationAdapter } from "../src/adapters/BrowserAutomationAdapter.js";

const fixtureUrl = `file://${resolve("tests/fixtures/read-only-page.html").replaceAll("\\", "/")}`;
const execFileAsync = promisify(execFile);
const createPayload = {
  ownerRef: "user:1",
  mode: "read_only",
  viewport: { width: 1440, height: 900 },
  ttlSeconds: 1800,
  capabilities: {
    navigation: true,
    screenshots: true,
    accessibilitySnapshot: true,
    actions: false,
    downloads: false,
    uploads: false,
  },
};

describe("TALOS browser worker", () => {
  const app = buildServer({ internalToken: "test-worker-token" });
  const ownedHeaders = { "x-talos-worker-token": "test-worker-token", "x-talos-owner-ref": "user:1" };
  const ownedInject = (options: { method: string; url: string; payload?: unknown; headers?: Record<string, string> }) => app.inject({ ...options, headers: { ...ownedHeaders, ...(options.headers ?? {}) } } as never);

  afterAll(async () => {
    await app.close();
  });

  it("returns the health response", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        status: "ok",
        service: "talos-browser-worker",
        protocols: {
          worker: TALOS_BROWSER_WORKER_PROTOCOL,
          hmi: TALOS_BROWSER_HMI_RUNTIME_PROTOCOL,
        },
      },
    });
  });

  it("requires authentication and a launchable Chromium runtime for readiness", async () => {
    const unauthenticated = await app.inject({ method: "GET", url: "/ready" });
    const authenticated = await app.inject({
      method: "GET",
      url: "/ready",
      headers: { "x-talos-worker-token": "test-worker-token" },
    });

    expect(unauthenticated.statusCode).toBe(401);
    expect(authenticated.statusCode).toBe(200);
    expect(authenticated.json()).toEqual({
      data: {
        status: "ready",
        service: "talos-browser-worker",
        runtime: "chromium",
        protocols: {
          worker: TALOS_BROWSER_WORKER_PROTOCOL,
          hmi: TALOS_BROWSER_HMI_RUNTIME_PROTOCOL,
        },
      },
    });
  });

  it("advertises a strict authenticated versioned handshake before session bootstrap", async () => {
    const unauthenticated = await app.inject({ method: "GET", url: TALOS_BROWSER_WORKER_HANDSHAKE_PATH });
    const first = await app.inject({
      method: "GET",
      url: TALOS_BROWSER_WORKER_HANDSHAKE_PATH,
      headers: { "x-talos-worker-token": "test-worker-token" },
    });
    const second = await app.inject({
      method: "GET",
      url: TALOS_BROWSER_WORKER_HANDSHAKE_PATH,
      headers: { "x-talos-worker-token": "test-worker-token" },
    });

    expect(unauthenticated.statusCode).toBe(401);
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    const handshake = first.json().data;
    expect(handshake).toEqual({
      schema_version: "talos.browser.worker-handshake.v2",
      protocol_version: TALOS_BROWSER_WORKER_PROTOCOL,
      worker: {
        name: "talos-browser-worker",
        version: TALOS_BROWSER_WORKER_VERSION,
        instance_id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
      },
      adapter: { name: TALOS_BROWSER_ADAPTER_NAME, version: TALOS_BROWSER_ADAPTER_VERSION },
      browser: { engine: "chromium", version: expect.any(String) },
      capability_manifest: {
        schema_version: "talos.browser.capabilities.v1",
        protocol_version: TALOS_BROWSER_WORKER_PROTOCOL,
        adapter_name: TALOS_BROWSER_ADAPTER_NAME,
        adapter_version: TALOS_BROWSER_ADAPTER_VERSION,
        capabilities: ["navigate", "snapshot", "screenshot", "read", "click", "interactive_frame", "semantic_locator", "tabs"],
        limits: {
          max_tabs: 1,
          max_viewport_width: 3840,
          max_viewport_height: 2160,
          max_artifact_bytes: 5_000_000,
        },
        degraded_reason: null,
      },
      authentication: {
        mode: "service_token_and_signed_action_capability",
        owner_binding: true,
        action_capability: {
          schema_version: "talos.browser.action-capability.v1",
          algorithm: "ES256",
          type: "talos-browser-action+jwt",
          issuer: "urn:talos:control-plane",
          audience: "urn:talos:browser-worker",
          key_id: "test-ephemeral-browser-action-key",
          max_ttl_seconds: 30,
        },
      },
      status: "ready",
      degraded_reason: null,
    });
    expect(handshake.browser.version.length).toBeGreaterThan(0);
    expect(second.json().data.worker.instance_id).toBe(handshake.worker.instance_id);
    const nonV4Identity = structuredClone(handshake);
    nonV4Identity.worker.instance_id = "019f64f7-2261-7c31-aba5-d88251b17b6b";
    expect(BrowserWorkerHandshakeSchema.safeParse(nonV4Identity).success).toBe(false);
  });

  it("binds the server-generated worker identity to session bootstrap", async () => {
    const handshake = await app.inject({
      method: "GET",
      url: TALOS_BROWSER_WORKER_HANDSHAKE_PATH,
      headers: { "x-talos-worker-token": "test-worker-token" },
    });
    const created = await ownedInject({
      method: "POST",
      url: `/protocols/${TALOS_BROWSER_HMI_RUNTIME_PROTOCOL}/sessions`,
      payload: createPayload,
    });

    expect(created.statusCode).toBe(201);
    expect(created.json().data.sessionId).toMatch(/^brw_[0-9a-f-]{36}$/);
    expect(created.json().data.workerInstanceId).toBe(handshake.json().data.worker.instance_id);
    expect(created.json().data.protocols.worker).toBe(TALOS_BROWSER_WORKER_PROTOCOL);

    await ownedInject({ method: "DELETE", url: `/sessions/${created.json().data.sessionId}` });
  });

  it("bootstraps operational sessions through the exact HMI runtime protocol", async () => {
    const supported = await ownedInject({
      method: "POST",
      url: `/protocols/${TALOS_BROWSER_HMI_RUNTIME_PROTOCOL}/sessions`,
      payload: createPayload,
    });
    const unsupported = await ownedInject({
      method: "POST",
      url: "/protocols/talos_browser_hmi_runtime_v2.0.0/sessions",
      payload: createPayload,
    });

    expect(supported.statusCode).toBe(201);
    expect(supported.json().data).toMatchObject({
      status: "ready",
      protocols: {
        worker: TALOS_BROWSER_WORKER_PROTOCOL,
        hmi: TALOS_BROWSER_HMI_RUNTIME_PROTOCOL,
      },
    });
    expect(unsupported.statusCode).toBe(404);

    await ownedInject({ method: "DELETE", url: `/sessions/${supported.json().data.sessionId}` });
  });

  it("rejects an invalid session payload", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/sessions",
      headers: { "x-talos-worker-token": "test-worker-token" },
      payload: { ownerRef: "user:1" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("rejects oversized session settings", async () => {
    const oversizedViewport = await app.inject({
      method: "POST",
      url: "/sessions",
      headers: { "x-talos-worker-token": "test-worker-token" },
      payload: { ...createPayload, viewport: { width: 10000, height: 900 } },
    });
    const oversizedTtl = await app.inject({
      method: "POST",
      url: "/sessions",
      headers: { "x-talos-worker-token": "test-worker-token" },
      payload: { ...createPayload, ttlSeconds: 90000 },
    });

    expect(oversizedViewport.statusCode).toBe(400);
    expect(oversizedTtl.statusCode).toBe(400);
  });

  it("creates and retrieves a read-only session", async () => {
    const created = await ownedInject({ method: "POST", url: "/sessions", payload: createPayload });
    const session = created.json().data;

    expect(created.statusCode).toBe(201);
    expect(session.status).toBe("ready");
    expect(session.mode).toBe("read_only");
    expect(session.capabilities).toEqual(createPayload.capabilities);

    const retrieved = await ownedInject({ method: "GET", url: `/sessions/${session.sessionId}` });
    expect(retrieved.statusCode).toBe(200);
    expect(retrieved.json().data.sessionId).toBe(session.sessionId);

    await ownedInject({ method: "DELETE", url: `/sessions/${session.sessionId}` });
  });

  it("navigates to the read-only fixture", async () => {
    const created = await ownedInject({ method: "POST", url: "/sessions", payload: createPayload });
    const sessionId = created.json().data.sessionId;

    const response = await ownedInject({
      method: "POST",
      url: `/sessions/${sessionId}/navigate`,
      payload: { url: fixtureUrl, waitUntil: "domcontentloaded", timeoutMs: 15000 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.title).toBe("TALOS Browse Fixture");
    await ownedInject({ method: "DELETE", url: `/sessions/${sessionId}` });
  });

  it.each(["javascript:document.body.innerHTML='pwned'", "data:text/html,<h1>pwned</h1>", "file:///tmp/not-a-fixture.html"])(
    "rejects unsafe navigation URL %s",
    async (url) => {
      const created = await ownedInject({ method: "POST", url: "/sessions", payload: createPayload });
      const sessionId = created.json().data.sessionId;

      const response = await ownedInject({ method: "POST", url: `/sessions/${sessionId}/navigate`, payload: { url } });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: "TALOS_BROWSER_INVALID_NAVIGATION_URL" });
      await ownedInject({ method: "DELETE", url: `/sessions/${sessionId}` });
    },
  );

  it("rejects navigation URLs that exceed the UTF-8 wire bound", async () => {
    const created = await ownedInject({ method: "POST", url: "/sessions", payload: createPayload });
    const sessionId = created.json().data.sessionId;

    const response = await ownedInject({
      method: "POST",
      url: `/sessions/${sessionId}/navigate`,
      payload: { url: `https://example.com/${"界".repeat(1_000)}` },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "TALOS_BROWSER_INVALID_NAVIGATION_PAYLOAD" });
    await ownedInject({ method: "DELETE", url: `/sessions/${sessionId}` });
  });

  it("captures a PNG screenshot with a digest", async () => {
    const created = await ownedInject({ method: "POST", url: "/sessions", payload: createPayload });
    const sessionId = created.json().data.sessionId;
    await ownedInject({ method: "POST", url: `/sessions/${sessionId}/navigate`, payload: { url: fixtureUrl } });

    const response = await ownedInject({ method: "POST", url: `/sessions/${sessionId}/screenshot` });
    const data = response.json().data;

    expect(response.statusCode).toBe(200);
    expect(data.mime).toBe("image/png");
    expect(data.width).toBe(1440);
    expect(data.height).toBe(900);
    expect(data.base64.length).toBeGreaterThan(0);
    expect(data.sha256).toMatch(/^[a-f0-9]{64}$/);
    await ownedInject({ method: "DELETE", url: `/sessions/${sessionId}` });
  });

  it("returns bounded accessibility refs and text digest", async () => {
    const created = await ownedInject({ method: "POST", url: "/sessions", payload: createPayload });
    const sessionId = created.json().data.sessionId;
    await ownedInject({ method: "POST", url: `/sessions/${sessionId}/navigate`, payload: { url: fixtureUrl } });

    const response = await ownedInject({ method: "POST", url: `/sessions/${sessionId}/snapshot` });
    const data = response.json().data;

    expect(response.statusCode).toBe(200);
    expect(data.format).toBe("accessibility_refs_v1");
    expect(data.nodes.length).toBeGreaterThan(0);
    expect(data.nodes.every((node: { ref: string }) => /^r\d+$/.test(node.ref))).toBe(true);
    expect(data.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "p", name: "This page is available for read-only browser worker tests." }),
      expect.objectContaining({ role: "link", name: "Bounded result link", href: "https://example.com" }),
    ]));
    expect(data.nodes.find((node: { name: string }) => node.name === "JavaScript link")).not.toHaveProperty("href");
    expect(data.nodes.find((node: { name: string }) => node.name === "Data link")).not.toHaveProperty("href");
    expect(data.nodes.find((node: { name: string }) => node.name === "Oversized link")).toHaveProperty("href", "https://example.com");
    expect(data.nodes.filter((node: { name: string }) => node.name === "Open vehicle")).toHaveLength(2);
    expect(data.nodes.find((node: { name: string }) => node.name === "Bounded custom role")?.role.length).toBeLessThanOrEqual(64);
    expect(data.textDigest).toContain("TALOS Browse Fixture");
    expect(data.textDigest).toContain("Dynamically loaded vehicle detail");
    await ownedInject({ method: "DELETE", url: `/sessions/${sessionId}` });
  });

  it("does not expose action endpoints", async () => {
    const response = await ownedInject({ method: "POST", url: "/sessions/brw_missing/action", payload: {} });
    expect(response.statusCode).toBe(404);
  });

  it("returns a controlled error for unknown routes", async () => {
    const response = await app.inject({ method: "GET", url: "/not-a-route", headers: { "x-talos-worker-token": "test-worker-token" } });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "TALOS_BROWSER_ROUTE_NOT_FOUND" });
  });

  it("returns a controlled error for malformed JSON", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/sessions",
      headers: { "content-type": "application/json" },
      payload: "{",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "TALOS_BROWSER_INVALID_JSON" });
  });

  it("expires a session at its TTL and removes it deterministically", async () => {
    const created = await ownedInject({ method: "POST", url: "/sessions", payload: { ...createPayload, ttlSeconds: 1 } });
    const sessionId = created.json().data.sessionId;

    await new Promise((resolve) => setTimeout(resolve, 1100));
    const retrieved = await ownedInject({ method: "GET", url: `/sessions/${sessionId}` });

    expect(retrieved.statusCode).toBe(404);
    expect(retrieved.json()).toMatchObject({ code: "TALOS_BROWSER_SESSION_NOT_FOUND" });
  }, 5000);

  it("closes a deleted session", async () => {
    const created = await ownedInject({ method: "POST", url: "/sessions", payload: createPayload });
    const sessionId = created.json().data.sessionId;
    const deleted = await ownedInject({ method: "DELETE", url: `/sessions/${sessionId}` });

    expect(deleted.statusCode).toBe(204);
    const retrieved = await ownedInject({ method: "GET", url: `/sessions/${sessionId}` });
    expect(retrieved.statusCode).toBe(404);
    expect(retrieved.json()).toMatchObject({ code: "TALOS_BROWSER_SESSION_NOT_FOUND" });
  });

  it("publishes one shared browser initialization while concurrent sessions are created", async () => {
    let releaseStart!: () => void;
    const startGate = new Promise<void>((resolveStart) => { releaseStart = resolveStart; });
    let proxyCreated = 0;
    let proxyStarted = 0;
    let proxyClosed = 0;
    let browserLaunches = 0;
    const page = { on: () => undefined } as unknown as Page;
    const context = {
      route: async () => undefined,
      newPage: async () => page,
      close: async () => undefined,
    } as unknown as BrowserContext;
    const browser = {
      newContext: async () => context,
      close: async () => undefined,
    } as unknown as Browser;
    const manager = new BrowserSessionManager({
      proxyFactory: () => {
        proxyCreated += 1;
        return {
          serverUrl: `http://127.0.0.1:${46000 + proxyCreated}`,
          start: async () => {
            proxyStarted += 1;
            await startGate;
          },
          close: async () => { proxyClosed += 1; },
        };
      },
      browserLauncher: async () => {
        browserLaunches += 1;
        return browser;
      },
      scheduleCleanup: () => ({}),
      cancelCleanup: () => undefined,
    });
    const first = manager.create(createPayload as CreateSessionInput);
    const second = manager.create(createPayload as CreateSessionInput);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
    releaseStart();
    await Promise.all([first, second]);

    expect(proxyCreated).toBe(1);
    expect(proxyStarted).toBe(1);
    expect(browserLaunches).toBe(1);
    await manager.close();
    expect(proxyClosed).toBe(1);
  });

  it("replays one live session for a caller-owned bootstrap idempotency key and rejects changed intent", async () => {
    let contextCreates = 0;
    const page = { on: () => undefined } as unknown as Page;
    const context = {
      route: async () => undefined,
      newPage: async () => page,
      close: async () => undefined,
    } as unknown as BrowserContext;
    const browser = {
      newContext: async () => {
        contextCreates += 1;
        return context;
      },
      close: async () => undefined,
    } as unknown as Browser;
    const manager = new BrowserSessionManager({
      browserFactory: async () => browser,
      scheduleCleanup: () => ({}),
      cancelCleanup: () => undefined,
    });
    const idempotencyKey = "123e4567-e89b-42d3-a456-426614174222";

    const [first, concurrent] = await Promise.all([
      manager.create(createPayload as CreateSessionInput, idempotencyKey),
      manager.create(createPayload as CreateSessionInput, idempotencyKey),
    ]);
    const replay = await manager.create(createPayload as CreateSessionInput, idempotencyKey);

    expect(first.sessionId).toBe(concurrent.sessionId);
    expect(first.sessionId).toBe(replay.sessionId);
    expect(contextCreates).toBe(1);
    await expect(manager.create({
      ...createPayload,
      viewport: { width: 1280, height: 800 },
    } as CreateSessionInput, idempotencyKey)).rejects.toMatchObject({
      code: "TALOS_BROWSER_SESSION_IDEMPOTENCY_CONFLICT",
      statusCode: 422,
    });

    await manager.delete(first.sessionId);
    const replacement = await manager.create(createPayload as CreateSessionInput, idempotencyKey);
    expect(replacement.sessionId).not.toBe(first.sessionId);
    expect(contextCreates).toBe(2);

    await manager.close();
  });

  it("requires the structured Idempotency-Key header on the versioned recovery bootstrap route", async () => {
    const missing = await ownedInject({
      method: "POST",
      url: TALOS_BROWSER_IDEMPOTENT_SESSION_BOOTSTRAP_PATH,
      payload: createPayload,
    });

    expect(missing.statusCode).toBe(400);
    expect(missing.json()).toMatchObject({ code: "TALOS_BROWSER_IDEMPOTENCY_KEY_REQUIRED" });
  });
});

describe("TALOS browser snapshot security", () => {
  it("uses bounded accessible names without exposing populated form secrets", async () => {
    const browser = await chromium.launch({ headless: true });

    try {
      const page = await browser.newPage();
      const oversizedName = "界".repeat(1_000);
      const oversizedHref = `https://example.com/${"界".repeat(1_000)}`;
      await page.setContent(`
        <label id="password-label" for="password">Account password</label>
        <input id="password" type="password" value="password-secret-value">
        <label for="api-key">API key</label>
        <input id="api-key" name="api_key" value="api-key-secret-value">
        <label for="notes">Secret notes</label>
        <textarea id="notes">textarea-secret-value</textarea>
        <label>Embedded secret notes
          <textarea>embedded-textarea-secret-value</textarea>
        </label>
        <input aria-label="${oversizedName}" value="bounded-name-secret-value">
        <a href="${oversizedHref}">Oversized href</a>
      `);
      await page.evaluate(() => {
        const state = globalThis as typeof globalThis & { capturedHrefBytes?: number };
        const NativeUrl = URL;
        Object.defineProperty(globalThis, "URL", {
          configurable: true,
          value: class extends NativeUrl {
            constructor(url: string | URL, base?: string | URL) {
              state.capturedHrefBytes = new TextEncoder().encode(String(url)).byteLength;
              super(url, base);
            }
          },
        });
      });

      const snapshot = await captureSnapshot(page);
      const serialized = JSON.stringify(snapshot);
      const capturedHrefBytes = await page.evaluate(() => (
        globalThis as typeof globalThis & { capturedHrefBytes?: number }
      ).capturedHrefBytes);

      expect(snapshot.nodes).toEqual(expect.arrayContaining([
        expect.objectContaining({ role: "input", name: "Account password" }),
        expect.objectContaining({ role: "input", name: "API key" }),
        expect.objectContaining({ role: "textarea", name: "Secret notes" }),
        expect.objectContaining({ role: "textarea", name: "Embedded secret notes" }),
      ]));
      expect(serialized).not.toContain("password-secret-value");
      expect(serialized).not.toContain("api-key-secret-value");
      expect(serialized).not.toContain("textarea-secret-value");
      expect(serialized).not.toContain("embedded-textarea-secret-value");
      expect(serialized).not.toContain("bounded-name-secret-value");
      expect(snapshot.nodes.every((node) => Buffer.byteLength(node.name, "utf8") <= 200)).toBe(true);
      expect(capturedHrefBytes).toBeLessThanOrEqual(2_048);
    } finally {
      await browser.close();
    }
  });
});

describe("TALOS browser worker process entrypoint", () => {
  it("serializes snapshot capture through the production tsx loader", async () => {
    const snapshotModule = new URL("../src/BrowserSnapshot.ts", import.meta.url).href;
    const script = `
      import { chromium } from "playwright";
      import { captureSnapshot } from ${JSON.stringify(snapshotModule)};
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        await page.goto(${JSON.stringify(fixtureUrl)}, { waitUntil: "domcontentloaded" });
        const snapshot = await captureSnapshot(page);
        process.stdout.write(JSON.stringify({ nodes: snapshot.nodes.length, digest: snapshot.textDigest.length }));
      } finally {
        await browser.close();
      }
    `;

    const result = await execFileAsync(process.execPath, ["--import", "tsx/esm", "--input-type=module", "--eval", script], {
      cwd: process.cwd(),
      timeout: 30_000,
    });

    expect(JSON.parse(result.stdout)).toMatchObject({ nodes: expect.any(Number), digest: expect.any(Number) });
    expect(JSON.parse(result.stdout).nodes).toBeGreaterThan(0);
  }, 35_000);

  it("listens until explicitly closed and exposes health", async () => {
    const app = await startBrowserWorker({
      host: "127.0.0.1",
      port: 0,
      internalToken: "entrypoint-test-token",
    });

    try {
      const address = app.server.address();
      if (!address || typeof address === "string") throw new Error("Expected a TCP listener.");
      const response = await fetch(`http://127.0.0.1:${address.port}/health`);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        data: {
          status: "ok",
          service: "talos-browser-worker",
          protocols: {
            worker: TALOS_BROWSER_WORKER_PROTOCOL,
            hmi: TALOS_BROWSER_HMI_RUNTIME_PROTOCOL,
          },
        },
      });
    } finally {
      await app.close();
    }
  });
});

describe("Playwright MCP worker lifecycle", () => {
  it("closes the session adapter before deletion and drains the adapter before browser shutdown", async () => {
    const events: string[] = [];
    const sessions = {
      get: async () => ({ ownerRef: "user:lifecycle" }),
      delete: async () => { events.push("session:delete"); },
      close: async () => { events.push("sessions:close"); },
    } as unknown as BrowserSessionManager;
    const adapter: BrowserAutomationAdapter = {
      handshake: async () => { throw new Error("Not used by lifecycle test."); },
      callTool: async () => { throw new Error("Not used by lifecycle test."); },
      cancelSession: async () => { events.push("adapter:cancel-session"); },
      closeSession: async () => { events.push("adapter:close-session"); },
      close: async () => { events.push("adapter:close"); },
    };
    const app = buildServer({
      internalToken: "lifecycle-test-token",
      runtimeEnvironment: "test",
      sessions,
      automationAdapter: adapter,
    });

    const deleted = await app.inject({
      method: "DELETE",
      url: "/sessions/brw_lifecycle",
      headers: {
        "x-talos-worker-token": "lifecycle-test-token",
        "x-talos-owner-ref": "user:lifecycle",
      },
    });
    expect(deleted.statusCode).toBe(204);
    expect(events).toEqual(["adapter:close-session", "session:delete"]);

    await app.close();
    expect(events).toEqual([
      "adapter:close-session",
      "session:delete",
      "adapter:close",
      "sessions:close",
    ]);
  });

  it("uses the dedicated cancellation path to abort the adapter before closing the context", async () => {
    const events: string[] = [];
    const sessions = {
      get: async () => ({ ownerRef: "user:lifecycle" }),
      cancel: async (_sessionId: string, reason: string) => { events.push(`session:cancel:${reason}`); },
      close: async () => undefined,
    } as unknown as BrowserSessionManager;
    const adapter: BrowserAutomationAdapter = {
      handshake: async () => { throw new Error("Not used by cancellation test."); },
      callTool: async () => { throw new Error("Not used by cancellation test."); },
      cancelSession: async (_sessionId, reason) => { events.push(`adapter:cancel:${reason}`); },
      closeSession: async () => { events.push("adapter:close-session"); },
      close: async () => undefined,
    };
    const app = buildServer({
      internalToken: "lifecycle-cancel-token",
      runtimeEnvironment: "test",
      sessions,
      automationAdapter: adapter,
    });

    const cancelled = await app.inject({
      method: "POST",
      url: "/sessions/brw_lifecycle/cancel",
      headers: {
        "x-talos-worker-token": "lifecycle-cancel-token",
        "x-talos-owner-ref": "user:lifecycle",
      },
      payload: { reason: "User cancelled the Browser task." },
    });

    expect(cancelled.statusCode).toBe(204);
    expect(events).toEqual([
      "adapter:cancel:User cancelled the Browser task.",
      "session:cancel:User cancelled the Browser task.",
    ]);
    await app.close();
  });
});

describe("BrowserSessionManager resource lifecycle", () => {
  function fakeBrowser() {
    let downloadHandler: ((download: { cancel: () => Promise<void> }) => void) | undefined;
    let contextOptions: { acceptDownloads?: boolean } | undefined;
    let contextClosed = false;
    const page = {
      on(event: string, handler: (download: { cancel: () => Promise<void> }) => void) {
        if (event === "download") downloadHandler = handler;
      },
    } as unknown as Page;
    const context = {
      newPage: async () => page,
      route: async () => undefined,
      close: async () => {
        contextClosed = true;
      },
    } as unknown as BrowserContext;
    const browser = {
      newContext: async (options: { acceptDownloads?: boolean }) => {
        contextOptions = options;
        return context;
      },
      close: async () => undefined,
    } as unknown as Browser;
    return { browser, contextOptions: () => contextOptions, downloadHandler: () => downloadHandler, contextClosed: () => contextClosed };
  }

  it("disables downloads and cancels download events", async () => {
    const fake = fakeBrowser();
    const manager = new BrowserSessionManager({ browserFactory: async () => fake.browser, now: () => 1_000 });
    await manager.create(createPayload as CreateSessionInput);
    let cancelled = false;

    expect(fake.contextOptions()).toMatchObject({ acceptDownloads: false });
    fake.downloadHandler()?.({ cancel: async () => { cancelled = true; } });
    await Promise.resolve();
    expect(cancelled).toBe(true);
    await manager.close();
  });

  it("cancels an in-flight session without waiting for the queued operation", async () => {
    const fake = fakeBrowser();
    const manager = new BrowserSessionManager({ browserFactory: async () => fake.browser, now: () => 1_000 });
    const created = await manager.create(createPayload as CreateSessionInput);
    let release!: () => void;
    const blocker = new Promise<void>((resolve) => { release = resolve; });
    const inFlight = manager.runExclusive(created.sessionId, async () => blocker);
    await Promise.resolve();

    const cancelled = manager.cancel(created.sessionId, "User cancelled the Browser task.");
    await expect(Promise.race([
      cancelled.then(() => "cancelled"),
      new Promise<string>((resolve) => setTimeout(() => resolve("timed-out"), 100)),
    ])).resolves.toBe("cancelled");
    await expect(manager.get(created.sessionId)).rejects.toMatchObject({ code: "TALOS_BROWSER_SESSION_NOT_FOUND" });

    release();
    await expect(inFlight).rejects.toMatchObject({ code: "TALOS_BROWSER_SESSION_NOT_FOUND" });
    await manager.close();
  });

  it("bounds per-session HMI command retention and clears records when the session closes", async () => {
    const fake = fakeBrowser();
    const manager = new BrowserSessionManager({ browserFactory: async () => fake.browser, now: () => 1_000 });
    const created = await manager.create(createPayload as CreateSessionInput);
    const session = await manager.get(created.sessionId);
    for (let index = 0; index < MAX_HMI_COMMAND_RECORDS; index += 1) {
      expect(session.hmiCommands.claim(`hmi_cmd_retained_${index}`, `sha256:${index}`)).toEqual({ kind: "new" });
    }

    expect(() => session.hmiCommands.claim("hmi_cmd_overflow", "sha256:overflow")).toThrowError(expect.objectContaining({
      code: "TALOS_BROWSER_HMI_COMMAND_RETENTION_EXHAUSTED",
    }));
    const ledger = session.hmiCommands;
    await manager.delete(created.sessionId);
    expect(ledger.size).toBe(0);
    await manager.close();
  });

  it("bounds action records without live-session TTL reuse and clears retained evidence on close", async () => {
    const fake = fakeBrowser();
    let now = 1_000;
    const manager = new BrowserSessionManager({ browserFactory: async () => fake.browser, now: () => now });
    const created = await manager.create(createPayload as CreateSessionInput);
    const session = await manager.get(created.sessionId);

    const retained = {
      actionId: "click-retained",
      idempotencyKey: "click-retained",
      operation: "browser_click",
      preconditionStateVersion: 0,
      request: { name: "browser_click", arguments: { target: "r1" } },
      consequential: true,
    } as const;
    expect(session.actionLedger.claim(retained)).toEqual({ kind: "new" });
    session.actionLedger.markDispatched(retained.idempotencyKey);
    session.actionLedger.commit(retained.idempotencyKey, { content: [{ type: "image", data: "retained-screenshot" }] });
    expect(session.actionLedger.size).toBe(1);
    now += 10 * 60 * 1_000;
    await manager.get(created.sessionId);
    expect(session.actionLedger.size).toBe(1);
    expect(() => session.actionLedger.claim({ ...retained, request: { name: "browser_click", arguments: { target: "r2" } } })).toThrowError(expect.objectContaining({
      code: "TALOS_BROWSER_ACTION_CONFLICT",
    }));

    const remainingSlots = MAX_BROWSER_ACTION_RECORDS - session.actionLedger.size;
    for (let index = 0; index < remainingSlots; index += 1) {
      expect(session.actionLedger.claim({
        ...retained,
        actionId: `click-bound-${index}`,
        idempotencyKey: `click-bound-${index}`,
      })).toEqual({ kind: "new" });
    }
    expect(() => session.actionLedger.claim({ ...retained, actionId: "click-overflow", idempotencyKey: "click-overflow" })).toThrowError(expect.objectContaining({
      code: "TALOS_BROWSER_ACTION_RETENTION_EXHAUSTED",
    }));

    const ledger = session.actionLedger;
    await manager.delete(created.sessionId);
    expect(ledger.size).toBe(0);
    await manager.close();
  });

  it("closes expired contexts during deterministic cleanup", async () => {
    const fake = fakeBrowser();
    let now = 1_000;
    const manager = new BrowserSessionManager({ browserFactory: async () => fake.browser, now: () => now });
    const session = await manager.create({ ...createPayload, ttlSeconds: 1 } as CreateSessionInput);
    now = 2_000;

    await expect(manager.get(session.sessionId)).rejects.toMatchObject({ code: "TALOS_BROWSER_SESSION_NOT_FOUND" });
    expect(fake.contextClosed()).toBe(true);
    await manager.close();
  });

  it("runs periodic expiry cleanup through an injected timer", async () => {
    const fake = fakeBrowser();
    let now = 1_000;
    let tick: (() => Promise<void>) | undefined;
    const manager = new BrowserSessionManager({
      browserFactory: async () => fake.browser,
      now: () => now,
      scheduleCleanup: (callback) => {
        tick = callback;
        return {};
      },
      cancelCleanup: () => undefined,
    });
    await manager.create({ ...createPayload, ttlSeconds: 1 } as CreateSessionInput);
    now = 2_000;

    await tick?.();
    expect(fake.contextClosed()).toBe(true);
    await manager.close();
  });

  it("fails readiness when Chromium cannot launch", async () => {
    const manager = new BrowserSessionManager({
      browserFactory: async () => {
        throw new Error("runtime missing");
      },
    });
    const app = buildServer({ sessions: manager, internalToken: "test-worker-token" });

    const response = await app.inject({
      method: "GET",
      url: "/ready",
      headers: { "x-talos-worker-token": "test-worker-token" },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      data: {
        status: "degraded",
        service: "talos-browser-worker",
        runtime: "chromium",
        protocols: {
          worker: TALOS_BROWSER_WORKER_PROTOCOL,
          hmi: TALOS_BROWSER_HMI_RUNTIME_PROTOCOL,
        },
      },
    });
    await app.close();
  });

  it("returns a bounded degraded handshake when Chromium cannot launch", async () => {
    const manager = new BrowserSessionManager({
      browserFactory: async () => {
        throw new Error("private launch path C:/runtime/chromium.exe");
      },
    });
    const degradedApp = buildServer({
      sessions: manager,
      internalToken: "test-worker-token",
      workerInstanceId: "123e4567-e89b-42d3-a456-426614174000",
    });

    const response = await degradedApp.inject({
      method: "GET",
      url: TALOS_BROWSER_WORKER_HANDSHAKE_PATH,
      headers: { "x-talos-worker-token": "test-worker-token" },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json().data).toMatchObject({
      protocol_version: TALOS_BROWSER_WORKER_PROTOCOL,
      worker: { instance_id: "123e4567-e89b-42d3-a456-426614174000" },
      browser: { engine: "chromium", version: null },
      status: "degraded",
      degraded_reason: "browser_runtime_unavailable",
      capability_manifest: { degraded_reason: "browser_runtime_unavailable" },
    });
    expect(JSON.stringify(response.json())).not.toContain("private launch path");
    await degradedApp.close();
  });

  it("returns a correlation-safe typed diagnostic for unexpected HMI protocol failures", async () => {
    const manager = new BrowserSessionManager();
    const reported: Array<{ correlationId: string; method: string; route: string; error: unknown }> = [];
    const isolatedApp = buildServer({
      sessions: manager,
      internalToken: "test-worker-token",
      onUnexpectedError: (event) => reported.push(event),
    });
    const headers = { "x-talos-worker-token": "test-worker-token", "x-talos-owner-ref": "user:1" };
    const created = await isolatedApp.inject({
      method: "POST",
      url: "/sessions",
      headers,
      payload: {
        ...createPayload,
        capabilities: { ...createPayload.capabilities, hmiActions: true },
      },
    });
    const sessionId = created.json().data.sessionId;
    manager.runExclusive = (async () => {
      throw new Error("private CDP protocol detail");
    }) as typeof manager.runExclusive;

    const response = await isolatedApp.inject({
      method: "POST",
      url: `/sessions/${sessionId}/hmi/pointer/preflight`,
      headers,
      payload: {
        schema_version: "talos_browser_hmi_pointer_v2",
        interaction_id: "123e4567-e89b-42d3-a456-426614174000",
        state_version: 0,
        normalized_x: 0.2,
        normalized_y: 0.3,
        button: "left",
        click_count: 1,
        expected_frame_sha256: `sha256:${"a".repeat(64)}`,
      },
    });
    const body = response.json();

    expect(response.statusCode).toBe(502);
    expect(body).toMatchObject({
      message: "Browser HMI protocol operation failed.",
      code: "TALOS_BROWSER_HMI_PROTOCOL_FAILURE",
      details: { correlation_id: expect.any(String) },
    });
    expect(JSON.stringify(body)).not.toContain("private CDP protocol detail");
    expect(reported).toHaveLength(1);
    expect(reported[0]).toMatchObject({
      correlationId: body.details.correlation_id,
      method: "POST",
      route: "/sessions/:id/hmi/pointer/preflight",
      error: expect.any(Error),
    });

    await isolatedApp.close();
  });

  it("never writes action capabilities or private key material to production diagnostics", async () => {
    const actionCapability = `eyJhbGciOiJFUzI1NiIsInR5cCI6InRhbG9zLWJyb3dzZXItYWN0aW9uK2p3dCJ9.eyJzdWIiOiJ0ZXN0In0.${"a".repeat(86)}`;
    const privateKeyMaterial = "synthetic-private-key-material";
    const sessions = {
      get: async () => {
        throw new Error(`Unexpected ${actionCapability} ${privateKeyMaterial}`);
      },
      close: async () => undefined,
    } as unknown as BrowserSessionManager;
    const writes: string[] = [];
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });
    const isolatedApp = buildServer({
      sessions,
      internalToken: "test-worker-token",
      runtimeEnvironment: "test",
    });

    try {
      const response = await isolatedApp.inject({
        method: "GET",
        url: "/sessions/worker-secret-diagnostic",
        headers: {
          "x-talos-worker-token": "test-worker-token",
          "x-talos-owner-ref": "user:1",
        },
      });
      const output = writes.join("");

      expect(response.statusCode).toBe(500);
      expect(output).toContain('"event":"unexpected_worker_error"');
      expect(output).toMatch(/"error_fingerprint":"[a-f0-9]{16}"/u);
      expect(output).not.toContain(actionCapability);
      expect(output).not.toContain(privateKeyMaterial);
    } finally {
      await isolatedApp.close();
      stderr.mockRestore();
    }
  });
});

describe("TALOS browser worker boundary", () => {
  const app = buildServer({ internalToken: "test-worker-token" });
  const ownerOne = { "x-talos-worker-token": "test-worker-token", "x-talos-owner-ref": "user:1" };
  const ownerTwo = { "x-talos-worker-token": "test-worker-token", "x-talos-owner-ref": "user:2" };

  afterAll(async () => {
    await app.close();
  });

  it("requires the owner header to create a session", async () => {
    const response = await app.inject({ method: "POST", url: "/sessions", headers: { "x-talos-worker-token": "test-worker-token" }, payload: createPayload });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "TALOS_BROWSER_OWNER_REQUIRED" });
  });

  it("prevents a different owner from operating a session", async () => {
    const created = await app.inject({ method: "POST", url: "/sessions", headers: ownerOne, payload: createPayload });
    const sessionId = created.json().data.sessionId;
    const response = await app.inject({ method: "GET", url: `/sessions/${sessionId}`, headers: ownerTwo });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "TALOS_BROWSER_OWNER_MISMATCH" });
    await app.inject({ method: "DELETE", url: `/sessions/${sessionId}`, headers: ownerOne });
  });

  it("returns only the public session summary", async () => {
    const created = await app.inject({ method: "POST", url: "/sessions", headers: ownerOne, payload: createPayload });
    const sessionId = created.json().data.sessionId;
    const response = await app.inject({ method: "GET", url: `/sessions/${sessionId}`, headers: ownerOne });
    const data = response.json().data;

    expect(response.statusCode).toBe(200);
    expect(Object.keys(data).sort()).toEqual([
      "capabilities",
      "createdAt",
      "expiresAt",
      "mode",
      "sessionId",
      "stateVersion",
      "status",
      "viewport",
    ]);
    expect(data).not.toHaveProperty("hmiIdentityKey");
    expect(data).not.toHaveProperty("singlePageViolation");
    expect(data).not.toHaveProperty("singlePageGuard");
    expect(data).not.toHaveProperty("latestSnapshot");
    expect(data).not.toHaveProperty("page");
    expect(data).not.toHaveProperty("context");
    expect(data).not.toHaveProperty("ownerRef");
    await app.inject({ method: "DELETE", url: `/sessions/${sessionId}`, headers: ownerOne });
  });

  it("does not emit permissive CORS headers", async () => {
    const response = await app.inject({ method: "GET", url: "/health", headers: { origin: "https://untrusted.example" } });

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("rejects private navigation targets before browser navigation", async () => {
    const created = await app.inject({ method: "POST", url: "/sessions", headers: ownerOne, payload: createPayload });
    const sessionId = created.json().data.sessionId;
    const response = await app.inject({ method: "POST", url: `/sessions/${sessionId}/navigate`, headers: ownerOne, payload: { url: "http://127.0.0.1:8080/private" } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "TALOS_BROWSER_INVALID_NAVIGATION_URL" });
    await app.inject({ method: "DELETE", url: `/sessions/${sessionId}`, headers: ownerOne });
  });

  it.each([
    "http://localhost./private",
    "http://api.localhost./private",
    "http://service.local./private",
    "http://metadata.google.internal./computeMetadata/v1",
  ])("rejects reserved navigation hostname %s", async (url) => {
    const created = await app.inject({ method: "POST", url: "/sessions", headers: ownerOne, payload: createPayload });
    const sessionId = created.json().data.sessionId;
    const response = await app.inject({ method: "POST", url: `/sessions/${sessionId}/navigate`, headers: ownerOne, payload: { url } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "TALOS_BROWSER_INVALID_NAVIGATION_URL" });
    await app.inject({ method: "DELETE", url: `/sessions/${sessionId}`, headers: ownerOne });
  });

  it("converts DNS lookup failures into a controlled navigation error", async () => {
    const created = await app.inject({ method: "POST", url: "/sessions", headers: ownerOne, payload: createPayload });
    const sessionId = created.json().data.sessionId;
    const response = await app.inject({ method: "POST", url: `/sessions/${sessionId}/navigate`, headers: ownerOne, payload: { url: "https://does-not-exist.invalid" } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "TALOS_BROWSER_INVALID_NAVIGATION_URL" });
    await app.inject({ method: "DELETE", url: `/sessions/${sessionId}`, headers: ownerOne });
  });
});
