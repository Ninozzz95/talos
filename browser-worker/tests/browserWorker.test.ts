import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import type { Browser, BrowserContext, Page } from "playwright";
import { BrowserSessionManager } from "../src/BrowserSessionManager.js";
import type { CreateSessionInput } from "../src/schemas.js";
import { buildServer } from "../src/server.js";
import { startBrowserWorker } from "../src/startBrowserWorker.js";

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
      data: { status: "ok", service: "talos-browser-worker" },
    });
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
    ]));
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
        data: { status: "ok", service: "talos-browser-worker" },
      });
    } finally {
      await app.close();
    }
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

  it("converts DNS lookup failures into a controlled navigation error", async () => {
    const created = await app.inject({ method: "POST", url: "/sessions", headers: ownerOne, payload: createPayload });
    const sessionId = created.json().data.sessionId;
    const response = await app.inject({ method: "POST", url: `/sessions/${sessionId}/navigate`, headers: ownerOne, payload: { url: "https://does-not-exist.invalid" } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "TALOS_BROWSER_INVALID_NAVIGATION_URL" });
    await app.inject({ method: "DELETE", url: `/sessions/${sessionId}`, headers: ownerOne });
  });
});
