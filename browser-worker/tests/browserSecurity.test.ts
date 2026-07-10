import { afterAll, describe, expect, it } from "vitest";
import type { Browser, BrowserContext, Page } from "playwright";
import { connect } from "node:net";
import { BrowserEgressProxy } from "../src/BrowserEgressProxy.js";
import { BrowserSessionManager, type BrowserLaunchOptions } from "../src/BrowserSessionManager.js";
import { isPrivateOrReservedIp } from "../src/BrowserUrlPolicy.js";
import { buildServer } from "../src/server.js";

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

  it("normalizes IPv4-mapped IPv6 addresses before private-range checks", () => {
    expect(isPrivateOrReservedIp("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("::ffff:10.0.0.8")).toBe(true);
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
});
