import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BrowserSessionManager } from "../src/BrowserSessionManager.js";
import {
  PLAYWRIGHT_MCP_ADAPTER_NAME,
  PLAYWRIGHT_MCP_ADAPTER_VERSION,
  PLAYWRIGHT_MCP_SAFE_TOOL_NAMES,
} from "../src/adapters/BrowserAutomationAdapter.js";
import { PlaywrightMcpAdapter } from "../src/adapters/PlaywrightMcpAdapter.js";

const require = createRequire(import.meta.url);

describe("Microsoft Playwright MCP direct integration", () => {
  it("loads the exact sharp target-frame adapter and Apache provenance", () => {
    const packagePath = join(dirname(dirname(require.resolve("sharp"))), "package.json");
    const metadata = require(packagePath) as { name: string; version: string; license: string };
    const license = readFileSync(join(dirname(packagePath), "LICENSE"), "utf8");

    expect(metadata).toMatchObject({ name: "sharp", version: "0.35.3", license: "Apache-2.0" });
    expect(license).toContain("Apache License");
  });

  it("loads the exact supported Microsoft package and provenance", () => {
    const packagePath = require.resolve("@playwright/mcp/package.json");
    const metadata = require(packagePath) as {
      name: string;
      version: string;
      license: string;
      dependencies: Record<string, string>;
    };
    const entry = require("@playwright/mcp") as { createConnection?: unknown };
    const license = readFileSync(join(dirname(packagePath), "LICENSE"), "utf8");

    expect(metadata).toMatchObject({
      name: "@playwright/mcp",
      version: "0.0.78",
      license: "Apache-2.0",
      dependencies: {
        playwright: "1.62.0-alpha-1783623505000",
        "playwright-core": "1.62.0-alpha-1783623505000",
      },
    });
    expect(entry.createConnection).toBeTypeOf("function");
    expect(license).toContain("Apache License");
    expect(license).toContain("Copyright (c) Microsoft Corporation.");
  });

  it("bounds initialization and closes a timed-out pending connection", async () => {
    const never = new Promise<never>(() => undefined);
    const stalledSessions = {
      get: async () => never,
    } as unknown as BrowserSessionManager;
    const stalledAdapter = new PlaywrightMcpAdapter(stalledSessions, { startupTimeoutMs: 20 });

    await expect(stalledAdapter.handshake("brw_stalled", new AbortController().signal))
      .rejects.toThrow("Playwright MCP operation timed out.");

    const closed = await Promise.race([
      stalledAdapter.close().then(() => true),
      new Promise<boolean>((resolveClosed) => setTimeout(() => resolveClosed(false), 200)),
    ]);
    expect(closed).toBe(true);
  });

  it("closes transports, removes output and refuses reuse after adapter shutdown", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "talos-mcp-lifecycle-"));
    const sessions = new BrowserSessionManager({ cleanupIntervalMs: 60_000 });
    const adapter = new PlaywrightMcpAdapter(sessions, { outputRoot });
    try {
      const session = await sessions.create({
        ownerRef: "user:playwright-mcp-lifecycle",
        mode: "read_only",
        viewport: { width: 1280, height: 800 },
        ttlSeconds: 1_800,
        capabilities: {
          navigation: true,
          screenshots: true,
          accessibilitySnapshot: true,
          actions: false,
          hmiActions: false,
          downloads: false,
          uploads: false,
        },
      });

      await adapter.handshake(session.sessionId, new AbortController().signal);
      expect(await readdir(outputRoot)).toHaveLength(1);
      await adapter.closeSession(session.sessionId);
      expect(await readdir(outputRoot)).toHaveLength(0);

      await adapter.handshake(session.sessionId, new AbortController().signal);
      expect(await readdir(outputRoot)).toHaveLength(1);
      await adapter.close();
      expect(await readdir(outputRoot)).toHaveLength(0);
      await expect(adapter.handshake(session.sessionId, new AbortController().signal))
        .rejects.toThrow("Playwright MCP adapter is shutting down.");
    } finally {
      await adapter.close();
      await sessions.close();
      await rm(outputRoot, { recursive: true, force: true });
    }
  }, 20_000);

  it("blocks file URL navigation unless the test fixture escape hatch is explicit", async () => {
    const sessions = new BrowserSessionManager({ cleanupIntervalMs: 60_000 });
    const adapter = new PlaywrightMcpAdapter(sessions);
    try {
      const session = await sessions.create({
        ownerRef: "user:playwright-mcp-file-policy",
        mode: "read_only",
        viewport: { width: 1280, height: 800 },
        ttlSeconds: 1_800,
        capabilities: {
          navigation: true,
          screenshots: true,
          accessibilitySnapshot: true,
          actions: false,
          hmiActions: false,
          downloads: false,
          uploads: false,
        },
      });
      const fixtureUrl = pathToFileURL(resolve("tests/fixtures/read-only-page.html")).href;
      const result = await adapter.callTool(session.sessionId, {
        name: "browser_navigate",
        arguments: { url: fixtureUrl },
      }, new AbortController().signal);

      expect("isError" in result ? result.isError : false).toBe(true);
      expect((await sessions.get(session.sessionId)).page.url()).toBe("about:blank");
    } finally {
      await adapter.close();
      await sessions.close();
    }
  }, 20_000);

  describe("same-context adapter", () => {
    const sessions = new BrowserSessionManager({ cleanupIntervalMs: 60_000 });
    const adapter = new PlaywrightMcpAdapter(sessions, {
      startupTimeoutMs: 5_000,
      callTimeoutMs: 10_000,
      allowTestFixtureFileAccess: true,
    });
    let sessionId = "";

    beforeAll(async () => {
      const session = await sessions.create({
        ownerRef: "user:playwright-mcp-conformance",
        mode: "read_only",
        viewport: { width: 1280, height: 800 },
        ttlSeconds: 1_800,
        capabilities: {
          navigation: true,
          screenshots: true,
          accessibilitySnapshot: true,
          actions: false,
          hmiActions: true,
          downloads: false,
          uploads: false,
        },
      });
      sessionId = session.sessionId;
    }, 20_000);

    afterAll(async () => {
      await adapter.close();
      await sessions.close();
    });

    it("discovers only the pinned safe schema surface through the real upstream server", async () => {
      const handshake = await adapter.handshake(sessionId, new AbortController().signal);

      expect(handshake).toMatchObject({
        adapterName: PLAYWRIGHT_MCP_ADAPTER_NAME,
        adapterVersion: PLAYWRIGHT_MCP_ADAPTER_VERSION,
        transport: "in-memory",
      });
      expect(handshake.tools.map((tool) => tool.name)).toEqual(PLAYWRIGHT_MCP_SAFE_TOOL_NAMES);
      expect(handshake.tools.every((tool) => tool.inputSchema.additionalProperties === false)).toBe(true);
      expect(handshake.tools.some((tool) => tool.name === "browser_run_code_unsafe")).toBe(false);
    });

    it("matches the committed upstream safe-tool schema snapshot", async () => {
      const handshake = await adapter.handshake(sessionId, new AbortController().signal);
      const fixturePath = resolve("tests/fixtures/playwright-mcp-0.0.78-safe-tools.json");

      expect(`${JSON.stringify(handshake.tools, null, 2)}\n`).toBe(readFileSync(fixturePath, "utf8"));
    });

    it("navigates, snapshots and screenshots through the existing TALOS context", async () => {
      const fixtureUrl = pathToFileURL(resolve("tests/fixtures/read-only-page.html")).href;
      const signal = new AbortController().signal;

      const navigation = await adapter.callTool(sessionId, {
        name: "browser_navigate",
        arguments: { url: fixtureUrl },
      }, signal);
      expect(toolText(navigation)).toContain("TALOS Browse Fixture");
      expect((await sessions.get(sessionId)).page.url()).toBe(fixtureUrl);

      const snapshot = await adapter.callTool(sessionId, {
        name: "browser_snapshot",
        arguments: {},
      }, signal);
      expect(toolText(snapshot)).toContain("### Snapshot");
      expect(toolText(snapshot)).toContain("TALOS Browse Fixture");

      const screenshot = await adapter.callTool(sessionId, {
        name: "browser_take_screenshot",
        arguments: { type: "png" },
      }, signal);
      const image = toolContent(screenshot).find((part) => part.type === "image");
      expect(image).toMatchObject({ type: "image", mimeType: "image/png" });
      if (!image || image.type !== "image") throw new Error("Expected Playwright MCP image content.");
      expect(Buffer.from(image.data, "base64").subarray(0, 8)).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
      const bytes = Buffer.from(image.data, "base64");
      const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
      const current = await sessions.get(sessionId);
      await expect(sessions.compareFrameTargetRegion(
        sessionId,
        digest,
        current.stateVersion,
        bytes,
        { left: 0, top: 0, width: 32, height: 32 },
      )).resolves.toMatchObject({ matches: true, reason: "matched" });
    }, 20_000);

    it("executes a semantic click through upstream and records each physical mutation once", async () => {
      const fixtureUrl = pathToFileURL(resolve("tests/fixtures/hmi-page.html")).href;
      const signal = new AbortController().signal;
      const initialState = (await sessions.get(sessionId)).stateVersion;

      await adapter.callTool(sessionId, {
        name: "browser_navigate",
        arguments: { url: fixtureUrl },
      }, signal);
      const navigatedState = (await sessions.get(sessionId)).stateVersion;
      expect(navigatedState).toBe(initialState + 1);

      const snapshot = await adapter.callTool(sessionId, {
        name: "browser_snapshot",
        arguments: {},
      }, signal);
      expect((await sessions.get(sessionId)).stateVersion).toBe(navigatedState);
      const target = /button "Reject optional cookies" \[ref=(e\d+)\]/u.exec(toolText(snapshot))?.[1];
      expect(target).toMatch(/^e\d+$/u);

      const clicked = await adapter.callTool(sessionId, {
        name: "browser_click",
        arguments: { element: "Reject optional cookies", target },
      }, signal);
      expect("isError" in clicked ? clicked.isError : false).toBe(false);
      expect(await (await sessions.get(sessionId)).page.locator("#cookie-banner").count()).toBe(0);
      expect((await sessions.get(sessionId)).stateVersion).toBe(navigatedState + 1);
    }, 20_000);

    it("allows tab inspection but denies expansion beyond the negotiated one-tab budget", async () => {
      const signal = new AbortController().signal;
      const before = await sessions.get(sessionId);
      const stateVersion = before.stateVersion;

      const listed = await adapter.callTool(sessionId, {
        name: "browser_tabs",
        arguments: { action: "list" },
      }, signal);
      expect(toolText(listed)).toContain("0:");

      await expect(adapter.callTool(sessionId, {
        name: "browser_tabs",
        arguments: { action: "new", url: "https://example.com" },
      }, signal)).rejects.toThrow("one-tab policy denies browser_tabs action: new");

      const after = await sessions.get(sessionId);
      expect(after.stateVersion).toBe(stateVersion);
      expect(after.recovery).toBeUndefined();
      expect(after.context.pages()).toHaveLength(1);
    });
  });
});

function toolContent(result: Awaited<ReturnType<PlaywrightMcpAdapter["callTool"]>>) {
  if (!("content" in result) || !Array.isArray(result.content)) {
    throw new Error("Expected an immediate MCP tool result.");
  }
  return result.content;
}

function toolText(result: Awaited<ReturnType<PlaywrightMcpAdapter["callTool"]>>): string {
  return toolContent(result)
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}
