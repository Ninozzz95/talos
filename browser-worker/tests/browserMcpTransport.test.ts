import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { BrowserAutomationAdapter } from "../src/adapters/BrowserAutomationAdapter.js";
import { createBrowserMcpServer } from "../src/BrowserMcpAdapter.js";
import { BrowserSessionManager } from "../src/BrowserSessionManager.js";
import { BrowserActionLedger } from "../src/BrowserActionLedger.js";
import { buildServer } from "../src/server.js";
import { BrowserActionCapabilityVerifier, type VerifiedBrowserActionCapability } from "../src/BrowserActionCapability.js";
import { createTestActionCapabilityKeypair, signTestActionCapability } from "./support/browserActionCapability.js";

const token = "mcp-transport-test-token-0123456789abcdef";
const ownerRef = "user:mcp-owner";
const ownerHeaders = {
  "x-talos-worker-token": token,
  "x-talos-owner-ref": ownerRef,
};
const fixtureUrl = new URL(`file://${resolve("tests/fixtures/read-only-page.html").replaceAll("\\", "/")}`).href;
const hmiFixtureUrl = new URL(`file://${resolve("tests/fixtures/hmi-page.html").replaceAll("\\", "/")}`).href;
const liveWorkerUrl = process.env.TALOS_LIVE_BROWSER_WORKER_URL?.replace(/\/$/, "") ?? "";
const liveWorkerToken = process.env.TALOS_LIVE_BROWSER_WORKER_TOKEN ?? token;
const liveMcpTarget = process.env.TALOS_LIVE_BROWSER_MCP_TARGET ?? "https://example.com/";
const navigationTarget = liveWorkerUrl === "" ? fixtureUrl : liveMcpTarget;
const expectedEvidenceUrl = liveWorkerUrl === "" ? "about:blank" : liveMcpTarget;
const expectedPageText = liveWorkerUrl === "" ? "TALOS Browse Fixture" : "Example Domain";
const expectedPageTitle = liveWorkerUrl === "" ? "TALOS Browse Fixture" : "Example Domain";
const actionKeys = createTestActionCapabilityKeypair("mcp-action-test-key");
const actionNowSeconds = 1_750_000_010;
const actionVerifier = BrowserActionCapabilityVerifier.forTest(actionKeys.publicKeyPem, actionKeys.keyId, () => actionNowSeconds);
const app = liveWorkerUrl === "" ? buildServer({
  internalToken: token,
  runtimeEnvironment: "test",
  actionCapabilityVerifier: actionVerifier,
}) : null;

let baseUrl = "";
let sessionId = "";

beforeAll(async () => {
  if (app) {
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  } else {
    baseUrl = liveWorkerUrl;
  }
  const created = await requestJson("/sessions", {
    method: "POST",
    headers: liveWorkerUrl === "" ? ownerHeaders : { "x-talos-worker-token": liveWorkerToken, "x-talos-owner-ref": ownerRef },
    body: JSON.stringify({
      ownerRef,
      mode: "read_only",
      viewport: { width: 1280, height: 800 },
      ttlSeconds: 1800,
      capabilities: {
        navigation: true,
        screenshots: true,
        accessibilitySnapshot: true,
        actions: false,
        hmiActions: false,
        downloads: false,
        uploads: false,
      },
    }),
  });
  expect(created.statusCode).toBe(201);
  sessionId = created.body.data.sessionId as string;
});

afterAll(async () => {
  if (sessionId !== "") {
    await requestJson(`/sessions/${sessionId}`, {
      method: "DELETE",
      headers: liveWorkerUrl === "" ? ownerHeaders : { "x-talos-worker-token": liveWorkerToken, "x-talos-owner-ref": ownerRef },
    });
  }
  if (app) await app.close();
});

describe("official MCP Streamable HTTP browser transport", () => {
  it("round-trips the allowlisted real Playwright MCP tools through official Streamable HTTP", async () => {
    const transport = new StreamableHTTPClientTransport(
      new URL(`${baseUrl}/sessions/${sessionId}/mcp`),
      { requestInit: { headers: liveWorkerUrl === "" ? ownerHeaders : { "x-talos-worker-token": liveWorkerToken, "x-talos-owner-ref": ownerRef } } },
    );
    const client = new Client({ name: "talos-mcp-contract-test", version: "1.0.0" });

    try {
      await client.connect(transport);
      const discovery = await client.listTools();
      expect(discovery.tools.map((tool) => tool.name)).toEqual([
        "browser_navigate",
        "browser_snapshot",
        "browser_take_screenshot",
        "browser_click",
        "browser_wait_for",
        "browser_tabs",
      ]);
      expect(discovery.tools.every((tool) => tool.inputSchema.additionalProperties === false)).toBe(true);
      expect(discovery.tools.some((tool) => tool.name === "browser_run_code_unsafe")).toBe(false);

      const navigation = await client.callTool({
        name: "browser_navigate",
        arguments: { url: navigationTarget },
      });
      expect(navigation.isError, resultText(navigation)).not.toBe(true);
      expect(resultText(navigation)).toContain(expectedPageText);

      const snapshot = await client.callTool({ name: "browser_snapshot", arguments: {} });
      expect(snapshot.isError).not.toBe(true);
      expect(resultText(snapshot)).toContain("### Snapshot");
      expect(resultText(snapshot)).toContain(expectedPageText);

      const screenshot = await client.callTool({
        name: "browser_take_screenshot",
        arguments: { type: "png" },
      });
      const image = resultContent(screenshot).find((part) => part.type === "image");
      expect(image).toMatchObject({ type: "image", mimeType: "image/png" });
      if (!image || image.type !== "image") throw new Error("Expected Playwright MCP image content.");
      expect(Buffer.from(image.data, "base64").subarray(0, 8)).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );

      const restSnapshot = await requestJson(`/sessions/${sessionId}/snapshot`, {
        method: "POST",
        headers: liveWorkerUrl === "" ? ownerHeaders : { "x-talos-worker-token": liveWorkerToken, "x-talos-owner-ref": ownerRef },
      });
      expect(restSnapshot.statusCode).toBe(200);
      expect(restSnapshot.body.data).toMatchObject({
        url: expectedEvidenceUrl,
        title: expectedPageTitle,
        stateVersion: 1,
      });
    } finally {
      await client.close();
    }
  }, 20_000);

  it("uses a caller-provided MCP idempotency key for click retries and rejects a conflicting payload", async () => {
    const created = await requestJson("/sessions", {
      method: "POST",
      headers: liveWorkerUrl === "" ? ownerHeaders : { "x-talos-worker-token": liveWorkerToken, "x-talos-owner-ref": ownerRef },
      body: JSON.stringify({
        ownerRef,
        mode: "read_only",
        viewport: { width: 1280, height: 800 },
        ttlSeconds: 1800,
        capabilities: {
          navigation: true,
          screenshots: true,
          accessibilitySnapshot: true,
          actions: false,
          hmiActions: true,
          downloads: false,
          uploads: false,
        },
      }),
    });
    const clickSessionId = created.body.data.sessionId as string;
    const actionHeaders = new Headers(liveWorkerUrl === ""
      ? ownerHeaders
      : { "x-talos-worker-token": liveWorkerToken, "x-talos-owner-ref": ownerRef });
    const transport = new StreamableHTTPClientTransport(
      new URL(`${baseUrl}/sessions/${clickSessionId}/mcp`),
      { requestInit: { headers: actionHeaders } },
    );
    const client = new Client({ name: "talos-mcp-idempotency-test", version: "1.0.0" });

    try {
      await client.connect(transport);
      await client.callTool({ name: "browser_navigate", arguments: { url: hmiFixtureUrl } });
      const snapshot = await client.callTool({ name: "browser_snapshot", arguments: {} });
      const target = /button "Reject optional cookies" \[ref=(e\d+)\]/u.exec(resultText(snapshot))?.[1];
      expect(target).toMatch(/^e\d+$/u);
      const arguments_ = { element: "Reject optional cookies", target };
      const request = {
        name: "browser_click",
        arguments: arguments_,
        _meta: { "com.github.ninozzz95.talos/idempotency-key": "mcp-click-retry-001" },
      };

      const missingKey = await client.callTool({ name: "browser_click", arguments: arguments_ });
      const unauthorized = await requestJson(`/sessions/${clickSessionId}/mcp`, {
        method: "POST",
        headers: liveWorkerUrl === "" ? ownerHeaders : { "x-talos-worker-token": liveWorkerToken, "x-talos-owner-ref": ownerRef },
        body: JSON.stringify({ jsonrpc: "2.0", id: 99, method: "tools/call", params: request }),
      });
      expect(unauthorized).toMatchObject({
        statusCode: 401,
        body: { code: "TALOS_BROWSER_ACTION_CAPABILITY_REQUIRED" },
      });

      actionHeaders.set("authorization", await mcpClickBearer(clickSessionId, request, 1));
      const first = await client.callTool(request);
      actionHeaders.set("authorization", await mcpClickBearer(clickSessionId, request, 1));
      const retry = await client.callTool(request);
      const conflictRequest = { ...request, arguments: { ...arguments_, element: "Different description" } };
      actionHeaders.set("authorization", await mcpClickBearer(clickSessionId, conflictRequest, 1));
      const conflict = await client.callTool(conflictRequest);

      expect(missingKey).toMatchObject({
        isError: true,
        structuredContent: { code: "TALOS_BROWSER_IDEMPOTENCY_KEY_REQUIRED" },
      });
      expect(first.isError).not.toBe(true);
      expect(retry).toEqual(first);
      expect(conflict).toMatchObject({ isError: true, structuredContent: { code: "TALOS_BROWSER_CLICK_COMMAND_CONFLICT" } });

      const state = await requestJson(`/sessions/${clickSessionId}`, {
        method: "GET",
        headers: liveWorkerUrl === "" ? ownerHeaders : { "x-talos-worker-token": liveWorkerToken, "x-talos-owner-ref": ownerRef },
      });
      expect(state.body.data.stateVersion).toBe(2);
    } finally {
      await client.close();
      await requestJson(`/sessions/${clickSessionId}`, {
        method: "DELETE",
        headers: liveWorkerUrl === "" ? ownerHeaders : { "x-talos-worker-token": liveWorkerToken, "x-talos-owner-ref": ownerRef },
      });
    }
  }, 30_000);

  it("rejects unsafe tools and tab expansion without mutating the session", async () => {
    const transport = new StreamableHTTPClientTransport(
      new URL(`${baseUrl}/sessions/${sessionId}/mcp`),
      { requestInit: { headers: liveWorkerUrl === "" ? ownerHeaders : { "x-talos-worker-token": liveWorkerToken, "x-talos-owner-ref": ownerRef } } },
    );
    const client = new Client({ name: "talos-mcp-policy-test", version: "1.0.0" });
    const before = await requestJson(`/sessions/${sessionId}`, {
      method: "GET",
      headers: liveWorkerUrl === "" ? ownerHeaders : { "x-talos-worker-token": liveWorkerToken, "x-talos-owner-ref": ownerRef },
    });

    try {
      await client.connect(transport);
      const unsafe = await client.callTool({
        name: "browser_run_code_unsafe",
        arguments: { code: "process.exit(1)" },
      });
      const newTab = await client.callTool({
        name: "browser_tabs",
        arguments: { action: "new", url: "https://example.com" },
      });

      expect(unsafe).toMatchObject({
        isError: true,
        structuredContent: { code: "TALOS_BROWSER_MCP_TOOL_NOT_ALLOWED" },
      });
      expect(newTab).toMatchObject({
        isError: true,
        structuredContent: { code: "TALOS_BROWSER_TAB_POLICY_DENIED" },
      });
    } finally {
      await client.close();
    }

    const after = await requestJson(`/sessions/${sessionId}`, {
      method: "GET",
      headers: liveWorkerUrl === "" ? ownerHeaders : { "x-talos-worker-token": liveWorkerToken, "x-talos-owner-ref": ownerRef },
    });
    expect(after.body.data.stateVersion).toBe(before.body.data.stateVersion);
    expect(after.body.data.recovery).toBeUndefined();
  }, 20_000);

  it("does not advertise or dispatch upstream file-output arguments", async () => {
    const transport = new StreamableHTTPClientTransport(
      new URL(`${baseUrl}/sessions/${sessionId}/mcp`),
      { requestInit: { headers: liveWorkerUrl === "" ? ownerHeaders : { "x-talos-worker-token": liveWorkerToken, "x-talos-owner-ref": ownerRef } } },
    );
    const client = new Client({ name: "talos-mcp-file-policy-test", version: "1.0.0" });
    const forbiddenPath = join(tmpdir(), `talos-mcp-forbidden-${randomUUID()}.png`);

    try {
      await client.connect(transport);
      const discovery = await client.listTools();
      for (const name of ["browser_snapshot", "browser_take_screenshot"]) {
        const tool = discovery.tools.find((candidate) => candidate.name === name);
        expect(tool).toBeDefined();
        expect(tool?.inputSchema.properties).not.toHaveProperty("filename");
      }

      const denied = await client.callTool({
        name: "browser_take_screenshot",
        arguments: { type: "png", filename: forbiddenPath },
      });
      expect(denied).toMatchObject({
        isError: true,
        structuredContent: { code: "TALOS_BROWSER_FILE_OUTPUT_DENIED" },
      });
      expect(existsSync(forbiddenPath)).toBe(false);
    } finally {
      await client.close();
      await rm(forbiddenPath, { force: true });
    }
  }, 20_000);

  it("replays an uncertain upstream click failure without dispatching a second click", async () => {
    const sessions = new BrowserSessionManager({ cleanupIntervalMs: 60_000 });
    let physicalDispatches = 0;
    const failingAdapter: BrowserAutomationAdapter = {
      handshake: async () => { throw new Error("Handshake is not used by this scenario."); },
      callTool: async () => {
        physicalDispatches += 1;
        throw new Error("connection lost after click dispatch");
      },
      cancelSession: async () => undefined,
      closeSession: async () => undefined,
      close: async () => undefined,
    };
    const uncertainApp = buildServer({
      internalToken: token,
      runtimeEnvironment: "test",
      sessions,
      automationAdapter: failingAdapter,
      actionCapabilityVerifier: actionVerifier,
    });
    await uncertainApp.listen({ host: "127.0.0.1", port: 0 });
    const address = uncertainApp.server.address() as AddressInfo;
    const uncertainBaseUrl = `http://127.0.0.1:${address.port}`;
    let client: Client | undefined;

    try {
      const created = await fetch(`${uncertainBaseUrl}/sessions`, {
        method: "POST",
        headers: { ...ownerHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          ownerRef,
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
        }),
      });
      const uncertainSessionId = (await created.json() as { data: { sessionId: string } }).data.sessionId;
      const uncertainHeaders = new Headers(ownerHeaders);
      const transport = new StreamableHTTPClientTransport(
        new URL(`${uncertainBaseUrl}/sessions/${uncertainSessionId}/mcp`),
        { requestInit: { headers: uncertainHeaders } },
      );
      client = new Client({ name: "talos-mcp-uncertain-click-test", version: "1.0.0" });
      await client.connect(transport);
      const request = {
        name: "browser_click",
        arguments: { element: "Submit order", target: "e7" },
        _meta: { "com.github.ninozzz95.talos/idempotency-key": "mcp-uncertain-click-001" },
      };

      uncertainHeaders.set("authorization", await mcpClickBearer(uncertainSessionId, request, 0));
      const first = await client.callTool(request);
      uncertainHeaders.set("authorization", await mcpClickBearer(uncertainSessionId, request, 0));
      const retry = await client.callTool(request);

      expect(first).toMatchObject({
        isError: true,
        structuredContent: {
          code: "TALOS_BROWSER_CLICK_RECOVERY_REQUIRED",
          idempotency_status: "ambiguous",
        },
      });
      expect(retry).toEqual(first);
      expect(physicalDispatches).toBe(1);

      const current = await fetch(`${uncertainBaseUrl}/sessions/${uncertainSessionId}`, { headers: ownerHeaders });
      expect((await current.json() as { data: { status: string } }).data.status).toBe("recovery_required");
    } finally {
      await client?.close();
      await uncertainApp.close();
    }
  }, 20_000);

  it("replays an upstream click error result without dispatching a second click", async () => {
    let physicalDispatches = 0;
    const session = {
      capabilities: { hmiActions: true, accessibilitySnapshot: true },
      stateVersion: 0,
      actionLedger: new BrowserActionLedger(),
    };
    const sessions = {
      get: async () => session,
    } as unknown as BrowserSessionManager;
    const adapter: BrowserAutomationAdapter = {
      handshake: async () => { throw new Error("Handshake is not used by this scenario."); },
      callTool: async () => {
        physicalDispatches += 1;
        return {
          content: [{ type: "text", text: "Target was detached before click completed." }],
          isError: true,
          structuredContent: { code: "UPSTREAM_CLICK_FAILED" },
        };
      },
      cancelSession: async () => undefined,
      closeSession: async () => undefined,
      close: async () => undefined,
    };
    const verifiedAction: VerifiedBrowserActionCapability = {
      ownerRef,
      workerSessionId: "brw_error_replay",
      actionId: "mcp-click-error-001",
      operation: "browser_click",
      preconditionStateVersion: 0,
      request: {
        name: "browser_click",
        arguments: { element: "Detached target", target: "e9" },
        idempotency_key: "mcp-click-error-001",
      },
      authorization: { kind: "policy", policy: "talos_browser_semantic_click" },
      jti: "123e4567-e89b-42d3-a456-426614174000",
      issuedAt: actionNowSeconds - 10,
      expiresAt: actionNowSeconds + 20,
    };
    const server = createBrowserMcpServer("brw_error_replay", adapter, sessions, { verifiedAction });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "talos-mcp-error-replay-test", version: "1.0.0" });

    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const request = {
        name: "browser_click",
        arguments: { element: "Detached target", target: "e9" },
        _meta: { "com.github.ninozzz95.talos/idempotency-key": "mcp-click-error-001" },
      };
      const first = await client.callTool(request);
      const retry = await client.callTool(request);

      expect(first).toMatchObject({ isError: true, structuredContent: { code: "UPSTREAM_CLICK_FAILED" } });
      expect(retry).toEqual(first);
      expect(physicalDispatches).toBe(1);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("rejects untrusted transport headers before MCP dispatch without mutating browser state", async () => {
    if (!app) return;
    const initial = await app.inject({ method: "GET", url: `/sessions/${sessionId}`, headers: ownerHeaders });
    const stateVersion = initial.json().data.stateVersion;
    const initialize = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "hostile-client", version: "1.0.0" },
      },
    };

    for (const testCase of [
      { headers: { ...ownerHeaders, "x-talos-worker-token": "wrong-token" }, status: 401 },
      { headers: { ...ownerHeaders, "x-talos-owner-ref": "user:other" }, status: 403 },
      { headers: { ...ownerHeaders, origin: "https://evil.example" }, status: 403 },
      { headers: { ...ownerHeaders, host: "evil.example" }, status: 403 },
    ]) {
      const response = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/mcp`,
        headers: testCase.headers,
        payload: initialize,
      });
      expect(response.statusCode).toBe(testCase.status);
    }

    const current = await app.inject({ method: "GET", url: `/sessions/${sessionId}`, headers: ownerHeaders });
    expect(current.json().data.stateVersion).toBe(stateVersion);
  });
});

async function mcpClickBearer(
  workerSessionId: string,
  request: { name: string; arguments?: Record<string, unknown>; _meta?: Record<string, unknown> },
  stateVersion: number,
): Promise<string> {
  const idempotencyKey = request._meta?.["com.github.ninozzz95.talos/idempotency-key"];
  if (typeof idempotencyKey !== "string") throw new Error("MCP click test requires an idempotency key.");
  const token = await signTestActionCapability(actionKeys, {
    ownerRef,
    workerSessionId,
    actionId: idempotencyKey,
    operation: "browser_click",
    preconditionStateVersion: stateVersion,
    request: {
      name: request.name,
      arguments: request.arguments ?? {},
      idempotency_key: idempotencyKey,
    },
  });
  return `Bearer ${token}`;
}

async function requestJson(path: string, init: RequestInit): Promise<{ statusCode: number; body: any }> {
  if (app) {
    const response = await app.inject({
      method: (init.method ?? "GET") as never,
      url: path,
      headers: init.headers as Record<string, string>,
      payload: init.body ? JSON.parse(String(init.body)) : undefined,
    } as never) as unknown as { statusCode: number; body: string; json: () => unknown };
    return { statusCode: response.statusCode, body: response.body === "" ? null : response.json() };
  }

  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  return { statusCode: response.status, body: response.status === 204 ? null : await response.json() };
}

function resultContent(result: Awaited<ReturnType<Client["callTool"]>>) {
  if (!("content" in result) || !Array.isArray(result.content)) {
    throw new Error("Expected an immediate MCP tool result.");
  }
  return result.content;
}

function resultText(result: Awaited<ReturnType<Client["callTool"]>>): string {
  return resultContent(result)
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}
