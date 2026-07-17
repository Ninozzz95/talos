import { afterAll, describe, expect, it } from "vitest";
import type { Browser, BrowserContext, Page } from "playwright";
import { connect } from "node:net";
import { PassThrough } from "node:stream";
import { BrowserEgressProxy } from "../src/BrowserEgressProxy.js";
import { BrowserSessionManager, type BrowserLaunchOptions } from "../src/BrowserSessionManager.js";
import { assertAllowedBrowserUrl, browserEvidenceUrl, isPrivateOrReservedIp, normalizeHostname } from "../src/BrowserUrlPolicy.js";
import { buildServer } from "../src/server.js";
import { BrowserActionCapabilityVerifier } from "../src/BrowserActionCapability.js";
import { createTestActionCapabilityKeypair } from "./support/browserActionCapability.js";

const actionKeys = createTestActionCapabilityKeypair("security-action-test-key");
const actionVerifier = BrowserActionCapabilityVerifier.forTest(actionKeys.publicKeyPem, actionKeys.keyId);

function fakeBrowser() {
  const page = { on: () => undefined } as unknown as Page;
  let contextOptions: Record<string, unknown> | undefined;
  const context = { route: async () => undefined, newPage: async () => page, close: async () => undefined } as unknown as BrowserContext;
  const browser = { newContext: async (options: Record<string, unknown>) => { contextOptions = options; return context; }, close: async () => undefined } as unknown as Browser;
  return { browser, context, contextOptions: () => contextOptions };
}

describe("browser worker internal token", () => {
  const app = buildServer({ internalToken: "expected-token" });

  afterAll(async () => {
    await app.close();
  });

  it("allows health without the worker token", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
  });

  it("rejects missing and mismatched worker tokens before owner checks", async () => {
    const payload = {
      ownerRef: "user:1",
      mode: "read_only",
      viewport: { width: 1440, height: 900 },
      ttlSeconds: 60,
      capabilities: { navigation: true, screenshots: true, accessibilitySnapshot: true, actions: false, downloads: false, uploads: false },
    };
    const missing = await app.inject({ method: "POST", url: "/sessions", payload });
    const mismatched = await app.inject({ method: "POST", url: "/sessions", headers: { "x-talos-worker-token": "wrong" }, payload });

    expect(missing.statusCode).toBe(401);
    expect(missing.json()).toMatchObject({ code: "TALOS_BROWSER_WORKER_TOKEN_REQUIRED" });
    expect(mismatched.statusCode).toBe(401);
    expect(mismatched.json()).toMatchObject({ code: "TALOS_BROWSER_WORKER_TOKEN_INVALID" });
  });

  it("enforces token length and estimated entropy only in production configuration", async () => {
    expect(() => buildServer({
      internalToken: "short-explicit-token",
      runtimeEnvironment: "production",
    })).toThrow(/production worker token/i);
    expect(() => buildServer({
      internalToken: "a".repeat(64),
      runtimeEnvironment: "production",
    })).toThrow(/production worker token/i);
    expect(() => buildServer({
      internalToken: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      runtimeEnvironment: "production",
    })).toThrowError(expect.objectContaining({
      code: "TALOS_BROWSER_ACTION_CAPABILITY_CONFIGURATION_INVALID",
    }));

    const production = buildServer({
      internalToken: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      runtimeEnvironment: "production",
      actionCapabilityVerifier: actionVerifier,
    });
    const development = buildServer({
      internalToken: "short-explicit-token",
      runtimeEnvironment: "development",
      actionCapabilityVerifier: actionVerifier,
    });
    await Promise.all([production.close(), development.close()]);
  });
});

describe("browser egress policy", () => {
  async function proxyRequest(proxy: BrowserEgressProxy, request: string): Promise<string> {
    const port = Number(new URL(proxy.serverUrl).port);
    return new Promise((resolve) => {
      const socket = connect(port, "127.0.0.1");
      let response = "";
      socket.on("data", (chunk) => { response += chunk.toString(); });
      socket.on("end", () => resolve(response));
      socket.on("connect", () => socket.write(request));
    });
  }

  it.each([
    "CONNECT example.test HTTP/1.1\r\nHost: example.test\r\n\r\n",
    "CONNECT user:pass@example.test:443 HTTP/1.1\r\nHost: example.test\r\n\r\n",
    "CONNECT example.test:0 HTTP/1.1\r\nHost: example.test\r\n\r\n",
    "CONNECT example.test:444 HTTP/1.1\r\nHost: example.test\r\n\r\n",
    "GET http://example.test:81/path HTTP/1.1\r\nHost: example.test\r\n\r\n",
  ])("denies malformed or disallowed proxy target %s", async (request) => {
    const proxy = new BrowserEgressProxy({ resolve: async () => ["93.184.216.34"], connect: async () => { throw new Error("connect must not run"); } });
    await proxy.start();

    const response = await proxyRequest(proxy, request);

    expect(response).toMatch(/^HTTP\/1\.1 4\d\d /);
    await proxy.close();
  });

  it("waits for fragmented CONNECT headers before connecting", async () => {
    let connectCalls = 0;
    const upstream = new PassThrough();
    const proxy = new BrowserEgressProxy({
      resolve: async () => ["93.184.216.34"],
      connect: async () => {
        connectCalls += 1;
        return upstream;
      },
    });
    await proxy.start();

    const socket = connect(Number(new URL(proxy.serverUrl).port), "127.0.0.1");
    socket.on("error", () => undefined);
    let response = "";
    const responseReady = new Promise<void>((resolve) => {
      socket.on("data", (chunk) => {
        response += chunk.toString();
        if (response.includes("\r\n\r\n")) resolve();
      });
    });
    await new Promise<void>((resolve) => socket.once("connect", () => resolve()));
    socket.write("CONNECT example.test:443 HTTP/1.1\r\nHost: example.test\r\n");
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(connectCalls).toBe(0);

    socket.write("\r\n");
    await responseReady;

    expect(response).toMatch(/^HTTP\/1\.1 200 Connection Established\r\n\r\n/);
    expect(connectCalls).toBe(1);
    await proxy.close();
    expect(upstream.destroyed).toBe(true);
  });

  it("rejects an incomplete CONNECT header after the header deadline", async () => {
    const proxy = new BrowserEgressProxy({
      headerTimeoutMs: 20,
      resolve: async () => ["93.184.216.34"],
      connect: async () => { throw new Error("connect must not run"); },
    });
    await proxy.start();

    const response = await new Promise<string>((resolve) => {
      const socket = connect(Number(new URL(proxy.serverUrl).port), "127.0.0.1");
      let body = "";
      socket.on("data", (chunk) => { body += chunk.toString(); });
      socket.on("end", () => resolve(body));
      socket.on("error", () => undefined);
      socket.once("connect", () => socket.write("CONNECT example.test:443 HTTP/1.1\r\n"));
    });

    expect(response).toMatch(/^HTTP\/1\.1 400 Bad Request\r\nConnection: close\r\n\r\n$/);
    await proxy.close();
  });

  it("rejects headers that exceed the bounded proxy header size", async () => {
    const proxy = new BrowserEgressProxy({
      resolve: async () => ["93.184.216.34"],
      connect: async () => { throw new Error("connect must not run"); },
    });
    await proxy.start();

    const response = await proxyRequest(proxy, `CONNECT example.test:443 HTTP/1.1\r\nX-Bounded: ${"a".repeat(20_000)}\r\n\r\n`);

    expect(response).toMatch(/^HTTP\/1\.1 431 Request Header Fields Too Large\r\nConnection: close\r\n\r\n$/);
    await proxy.close();
  });

  it("closes tracked client and upstream sockets during shutdown", async () => {
    const upstream = new PassThrough();
    const proxy = new BrowserEgressProxy({
      resolve: async () => ["93.184.216.34"],
      connect: async () => upstream,
    });
    await proxy.start();

    const socket = connect(Number(new URL(proxy.serverUrl).port), "127.0.0.1");
    socket.on("error", () => undefined);
    let response = "";
    const responseReady = new Promise<void>((resolve) => {
      socket.on("data", (chunk) => {
        response += chunk.toString();
        if (response.includes("\r\n\r\n")) resolve();
      });
    });
    await new Promise<void>((resolve) => socket.once("connect", () => resolve()));
    socket.write("CONNECT example.test:443 HTTP/1.1\r\nHost: example.test\r\n\r\n");
    await responseReady;

    const clientClosed = new Promise<void>((resolve) => socket.once("close", () => resolve()));
    await proxy.close();
    await clientClosed;

    expect(upstream.destroyed).toBe(true);
  });

  it("normalizes IPv4-mapped IPv6 addresses before private-range checks", () => {
    expect(isPrivateOrReservedIp("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("::ffff:10.0.0.8")).toBe(true);
  });

  it.each([
    "::ffff:7f00:1",
    "::ffff:c000:201",
    "not-an-ip",
  ])("fails closed for non-global or unparsable IP %s", (address) => {
    expect(isPrivateOrReservedIp(address)).toBe(true);
  });

  it.each([
    "93.184.216.34",
    "2001:4860:4860::8888",
    "::ffff:5db8:d822",
  ])("preserves public IP %s", (address) => {
    expect(isPrivateOrReservedIp(address)).toBe(false);
  });

  it("rejects an unparsable resolver result", async () => {
    const proxy = new BrowserEgressProxy({ resolve: async () => ["not-an-ip"] });

    await expect(proxy.resolveVettedAddress("example.test")).rejects.toMatchObject({ code: "TALOS_BROWSER_PROXY_PRIVATE_TARGET" });
  });

  it("rejects private resolver results and connects public targets by vetted IP", async () => {
    let connected: { address: string; port: number } | undefined;
    const proxy = new BrowserEgressProxy({
      resolve: async () => ["::ffff:10.0.0.8", "93.184.216.34"],
      connect: async (address, port) => {
        connected = { address, port };
        throw new Error("test connector stop");
      },
    });

    await expect(proxy.resolveVettedAddress("example.test")).rejects.toMatchObject({ code: "TALOS_BROWSER_PROXY_PRIVATE_TARGET" });
    expect(connected).toBeUndefined();
  });

  it("rejects reserved hostnames before trusting resolver output", async () => {
    const proxy = new BrowserEgressProxy({ resolve: async () => ["93.184.216.34"] });

    await expect(proxy.resolveVettedAddress("metadata.google.internal")).rejects.toMatchObject({ code: "TALOS_BROWSER_PROXY_PRIVATE_TARGET" });
  });

  it.each(["LOCALHOST.", "api.LOCALHOST.", "service.LOCAL.", "metadata.google.internal."])('normalizes reserved hostname "%s" before proxy DNS', async (hostname) => {
    let resolved = false;
    const proxy = new BrowserEgressProxy({
      resolve: async () => {
        resolved = true;
        return ["93.184.216.34"];
      },
    });

    await expect(proxy.resolveVettedAddress(hostname)).rejects.toMatchObject({ code: "TALOS_BROWSER_PROXY_PRIVATE_TARGET" });
    expect(resolved).toBe(false);
  });

  it.each([".", "..."])('rejects hostname "%s" when root-dot normalization is empty', async (hostname) => {
    let resolved = false;
    const proxy = new BrowserEgressProxy({
      resolve: async () => {
        resolved = true;
        return ["93.184.216.34"];
      },
    });

    await expect(proxy.resolveVettedAddress(hostname)).rejects.toMatchObject({ code: "TALOS_BROWSER_PROXY_PRIVATE_TARGET" });
    expect(resolved).toBe(false);
  });

  it("rejects an empty route-policy hostname after stripping root dots", async () => {
    expect(normalizeHostname("...")).toBe("");
    await expect(assertAllowedBrowserUrl("http://.../private")).rejects.toMatchObject({ code: "TALOS_BROWSER_INVALID_NAVIGATION_URL" });
  });

  it("canonicalizes public evidence URLs and redacts every local or opaque scheme", () => {
    expect(browserEvidenceUrl("https://user:secret@example.com/catalog/item?token=secret#details"))
      .toBe("https://example.com/catalog/item");
    expect(browserEvidenceUrl("about:blank")).toBe("about:blank");
    expect(browserEvidenceUrl("file:///C:/Users/example/private.txt")).toBe("about:blank");
    expect(browserEvidenceUrl("file:///home/example/private.txt")).toBe("about:blank");
    expect(browserEvidenceUrl("data:text/plain,secret")).toBe("about:blank");
    expect(browserEvidenceUrl("not a URL")).toBe("about:blank");
  });

  it("normalizes public hostname case and root dot before proxy DNS and connection", async () => {
    let resolvedHostname: string | undefined;
    let connected: { address: string; port: number } | undefined;
    const proxy = new BrowserEgressProxy({
      resolve: async (hostname) => {
        resolvedHostname = hostname;
        return ["93.184.216.34"];
      },
      connect: async (address, port) => {
        connected = { address, port };
        throw new Error("test connector stop");
      },
    });

    await expect(proxy.connectVettedAddress("Example.TEST.", 443)).rejects.toThrow("test connector stop");
    expect(resolvedHostname).toBe("example.test");
    expect(connected).toEqual({ address: "93.184.216.34", port: 443 });
  });

  it("connects using the vetted public address", async () => {
    let connected: { address: string; port: number } | undefined;
    const proxy = new BrowserEgressProxy({
      resolve: async () => ["93.184.216.34"],
      connect: async (address, port) => {
        connected = { address, port };
        throw new Error("test connector stop");
      },
    });

    await expect(proxy.connectVettedAddress("example.test", 443)).rejects.toThrow("test connector stop");
    expect(connected).toEqual({ address: "93.184.216.34", port: 443 });
  });

  it("uses a loopback proxy, denies direct DNS, and blocks service workers", async () => {
    const fake = fakeBrowser();
    let launchOptions: BrowserLaunchOptions | undefined;
    const proxy = { serverUrl: "http://127.0.0.1:45678", start: async () => undefined, close: async () => undefined };
    const manager = new BrowserSessionManager({
      proxyFactory: () => proxy,
      browserLauncher: async (options) => {
        launchOptions = options;
        return fake.browser;
      },
      now: () => 1_000,
      scheduleCleanup: () => ({}),
      cancelCleanup: () => undefined,
    });

    await manager.create({ ownerRef: "user:1", mode: "read_only", viewport: { width: 1440, height: 900 }, ttlSeconds: 60, capabilities: { navigation: true, screenshots: true, accessibilitySnapshot: true, actions: false, downloads: false, uploads: false } });

    expect(launchOptions?.proxy).toEqual({ server: "http://127.0.0.1:45678" });
    expect(launchOptions?.args).toContain("--host-resolver-rules=EXCLUDE 127.0.0.1, MAP * ~NOTFOUND");
    expect(launchOptions?.args).toContain("--force-webrtc-ip-handling-policy=disable_non_proxied_udp");
    expect(fake.contextOptions()).toMatchObject({ serviceWorkers: "block" });
    await manager.close();
  });

  it("closes a failed launch proxy and retries with a fresh browser promise", async () => {
    const fake = fakeBrowser();
    let shouldFail = true;
    let proxyCreated = 0;
    let proxyClosed = 0;
    const manager = new BrowserSessionManager({
      proxyFactory: () => {
        proxyCreated += 1;
        return { serverUrl: `http://127.0.0.1:${45000 + proxyCreated}`, start: async () => undefined, close: async () => { proxyClosed += 1; } };
      },
      browserLauncher: async () => {
        if (shouldFail) throw new Error("chromium launch failed");
        return fake.browser;
      },
      scheduleCleanup: () => ({}),
      cancelCleanup: () => undefined,
    });
    const payload = { ownerRef: "user:1", mode: "read_only" as const, viewport: { width: 1440, height: 900 }, ttlSeconds: 60, capabilities: { navigation: true, screenshots: true, accessibilitySnapshot: true, actions: false, downloads: false, uploads: false } as const };

    await expect(manager.create(payload)).rejects.toThrow("chromium launch failed");
    shouldFail = false;
    await manager.create(payload);

    expect(proxyCreated).toBe(2);
    expect(proxyClosed).toBe(1);
    await manager.close();
    expect(proxyClosed).toBe(2);
  });

  it("closes a context and rethrows a request-policy installation failure", async () => {
    const failure = new Error("route policy failed");
    let contextClosed = false;
    const context = {
      route: async () => { throw failure; },
      newPage: async () => ({ on: () => undefined } as unknown as Page),
      close: async () => { contextClosed = true; },
    } as unknown as BrowserContext;
    const browser = {
      newContext: async () => context,
      close: async () => undefined,
    } as unknown as Browser;
    const manager = new BrowserSessionManager({
      browserFactory: async () => browser,
      scheduleCleanup: () => ({}),
      cancelCleanup: () => undefined,
    });

    await expect(manager.create({ ownerRef: "user:1", mode: "read_only", viewport: { width: 1440, height: 900 }, ttlSeconds: 60, capabilities: { navigation: true, screenshots: true, accessibilitySnapshot: true, actions: false, downloads: false, uploads: false } })).rejects.toBe(failure);
    expect(contextClosed).toBe(true);
    await manager.close();
  });

  it("closes a context and rethrows a new-page failure", async () => {
    const failure = new Error("page creation failed");
    let contextClosed = false;
    const context = {
      route: async () => undefined,
      newPage: async () => { throw failure; },
      close: async () => { contextClosed = true; },
    } as unknown as BrowserContext;
    const browser = {
      newContext: async () => context,
      close: async () => undefined,
    } as unknown as Browser;
    const manager = new BrowserSessionManager({
      browserFactory: async () => browser,
      scheduleCleanup: () => ({}),
      cancelCleanup: () => undefined,
    });

    await expect(manager.create({ ownerRef: "user:1", mode: "read_only", viewport: { width: 1440, height: 900 }, ttlSeconds: 60, capabilities: { navigation: true, screenshots: true, accessibilitySnapshot: true, actions: false, downloads: false, uploads: false } })).rejects.toBe(failure);
    expect(contextClosed).toBe(true);
    await manager.close();
  });

  it("attempts every context, browser, and proxy cleanup before throwing the first failure", async () => {
    const firstFailure = new Error("first context close failed");
    const events: string[] = [];
    let contextNumber = 0;
    const contexts = [1, 2].map((number) => ({
      route: async () => undefined,
      newPage: async () => ({ on: () => undefined } as unknown as Page),
      close: async () => {
        events.push(`context-${number}`);
        if (number === 1) throw firstFailure;
      },
    } as unknown as BrowserContext));
    const browser = {
      newContext: async () => contexts[contextNumber++],
      close: async () => { events.push("browser"); },
    } as unknown as Browser;
    const proxy = {
      serverUrl: "http://127.0.0.1:45678",
      start: async () => undefined,
      close: async () => { events.push("proxy"); },
    };
    const manager = new BrowserSessionManager({
      proxyFactory: () => proxy,
      browserLauncher: async () => browser,
      scheduleCleanup: () => ({}),
      cancelCleanup: () => undefined,
    });
    const payload = { ownerRef: "user:1", mode: "read_only" as const, viewport: { width: 1440, height: 900 }, ttlSeconds: 60, capabilities: { navigation: true, screenshots: true, accessibilitySnapshot: true, actions: false, downloads: false, uploads: false } as const };

    await manager.create(payload);
    await manager.create(payload);

    await expect(manager.close()).rejects.toBe(firstFailure);
    expect(events).toEqual(expect.arrayContaining(["context-1", "context-2", "browser", "proxy"]));
    expect(events.indexOf("browser")).toBeGreaterThan(events.indexOf("context-2"));
    expect(events.indexOf("proxy")).toBeGreaterThan(events.indexOf("browser"));
  });
});

describe("browser session manager shutdown", () => {
  const payload = {
    ownerRef: "user:1",
    mode: "read_only" as const,
    viewport: { width: 1440, height: 900 },
    ttlSeconds: 60,
    capabilities: { navigation: true, screenshots: true, accessibilitySnapshot: true, actions: false, downloads: false, uploads: false } as const,
  };

  it("rejects in-flight and later creates without publishing a session after shutdown starts", async () => {
    let signalContextStarted!: () => void;
    let releaseContext!: () => void;
    const contextStarted = new Promise<void>((resolve) => { signalContextStarted = resolve; });
    const contextGate = new Promise<void>((resolve) => { releaseContext = resolve; });
    let browserFactoryCalls = 0;
    let contextCloseCalls = 0;
    let newPageCalls = 0;
    let browserCloseCalls = 0;
    const context = {
      route: async () => undefined,
      newPage: async () => {
        newPageCalls += 1;
        return { on: () => undefined } as unknown as Page;
      },
      close: async () => { contextCloseCalls += 1; },
    } as unknown as BrowserContext;
    const browser = {
      newContext: async () => {
        signalContextStarted();
        await contextGate;
        return context;
      },
      close: async () => { browserCloseCalls += 1; },
    } as unknown as Browser;
    const manager = new BrowserSessionManager({
      browserFactory: async () => {
        browserFactoryCalls += 1;
        return browser;
      },
      scheduleCleanup: () => ({}),
      cancelCleanup: () => undefined,
    });

    const inFlightCreate = manager.create(payload);
    await contextStarted;
    const shutdown = manager.close();
    const laterCreate = manager.create(payload);
    const laterReadiness = manager.assertRuntimeReady();
    releaseContext();

    const [inFlightResult, laterResult, readinessResult, shutdownResult] = await Promise.allSettled([inFlightCreate, laterCreate, laterReadiness, shutdown]);
    const observed = { browserFactoryCalls, contextCloseCalls, newPageCalls, browserCloseCalls };
    await manager.close().catch(() => undefined);

    expect(inFlightResult).toMatchObject({ status: "rejected", reason: { code: "TALOS_BROWSER_WORKER_SHUTTING_DOWN" } });
    expect(laterResult).toMatchObject({ status: "rejected", reason: { code: "TALOS_BROWSER_WORKER_SHUTTING_DOWN" } });
    expect(readinessResult).toMatchObject({ status: "rejected", reason: { code: "TALOS_BROWSER_WORKER_SHUTTING_DOWN" } });
    expect(shutdownResult).toMatchObject({ status: "fulfilled" });
    expect(observed).toEqual({ browserFactoryCalls: 1, contextCloseCalls: 1, newPageCalls: 0, browserCloseCalls: 1 });
  });

  it("shares concurrent close calls and retains resource handles until cleanup is attempted", async () => {
    let signalContextCloseStarted!: () => void;
    let releaseContextClose!: () => void;
    const contextCloseStarted = new Promise<void>((resolve) => { signalContextCloseStarted = resolve; });
    const contextCloseGate = new Promise<void>((resolve) => { releaseContextClose = resolve; });
    let contextCloseCalls = 0;
    let browserCloseCalls = 0;
    let proxyCloseCalls = 0;
    let cancelCleanupCalls = 0;
    let cleanupHandleVisible = false;
    let browserHandleVisible = false;
    let proxyHandleVisible = false;
    const context = {
      route: async () => undefined,
      newPage: async () => ({ on: () => undefined } as unknown as Page),
      close: async () => {
        contextCloseCalls += 1;
        signalContextCloseStarted();
        await contextCloseGate;
      },
    } as unknown as BrowserContext;
    let manager!: BrowserSessionManager;
    const browser = {
      newContext: async () => context,
      close: async () => {
        browserCloseCalls += 1;
        browserHandleVisible = (manager as unknown as { browserPromise?: Promise<Browser> }).browserPromise !== undefined;
      },
    } as unknown as Browser;
    const proxy = {
      serverUrl: "http://127.0.0.1:45678",
      start: async () => undefined,
      close: async () => {
        proxyCloseCalls += 1;
        proxyHandleVisible = (manager as unknown as { egressProxy?: typeof proxy }).egressProxy === proxy;
      },
    };
    manager = new BrowserSessionManager({
      proxyFactory: () => proxy,
      browserLauncher: async () => browser,
      scheduleCleanup: () => ({ timer: "cleanup" }),
      cancelCleanup: (handle) => {
        cancelCleanupCalls += 1;
        cleanupHandleVisible = (manager as unknown as { cleanupHandle?: unknown }).cleanupHandle === handle;
      },
    });
    await manager.create(payload);

    const firstClose = manager.close();
    await contextCloseStarted;
    const secondClose = manager.close();
    const sameClosePromise = firstClose === secondClose;
    releaseContextClose();
    await Promise.all([firstClose, secondClose]);

    expect(sameClosePromise).toBe(true);
    expect({ cancelCleanupCalls, contextCloseCalls, browserCloseCalls, proxyCloseCalls }).toEqual({
      cancelCleanupCalls: 1,
      contextCloseCalls: 1,
      browserCloseCalls: 1,
      proxyCloseCalls: 1,
    });
    expect({ cleanupHandleVisible, browserHandleVisible, proxyHandleVisible }).toEqual({
      cleanupHandleVisible: true,
      browserHandleVisible: true,
      proxyHandleVisible: true,
    });
  });
});
