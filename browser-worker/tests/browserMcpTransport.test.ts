import { resolve } from "node:path";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { buildServer } from "../src/server.js";

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
const app = liveWorkerUrl === "" ? buildServer({ internalToken: token, runtimeEnvironment: "test" }) : null;

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
  it("round-trips discovery and browser tools through the official SDK client", async () => {
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
        "browser_read",
        "browser_take_screenshot",
        "browser_wait_for",
        "browser_click",
      ]);
      expect(discovery.tools.every((tool) => tool.inputSchema.additionalProperties === false)).toBe(true);

      const navigation = await client.callTool({
        name: "browser_navigate",
        arguments: { url: fixtureUrl },
      });
      expect(navigation.isError).toBe(false);
      expect(navigation.structuredContent).toMatchObject({
        url: fixtureUrl,
        title: "TALOS Browse Fixture",
        state_version: 1,
      });
      expect(navigation._meta?.["com.github.ninozzz95.talos/tool-result"]).toMatchObject({
        schema_version: "talos_tool_result_v1",
        tool_use_id: expect.stringMatching(/^mcp_/),
        evidence: [expect.objectContaining({ kind: "navigation", trusted_boundary: "untrusted_web_content" })],
      });

      const snapshot = await client.callTool({ name: "browser_snapshot", arguments: {} });
      expect(snapshot.isError).toBe(false);
      expect(snapshot.structuredContent).toMatchObject({
        url: fixtureUrl,
        title: "TALOS Browse Fixture",
        state_version: 1,
        nodes: expect.any(Array),
      });
      expect((snapshot.structuredContent as { nodes: unknown[] }).nodes.length).toBeGreaterThan(0);
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
    const transport = new StreamableHTTPClientTransport(
      new URL(`${baseUrl}/sessions/${clickSessionId}/mcp`),
      { requestInit: { headers: liveWorkerUrl === "" ? ownerHeaders : { "x-talos-worker-token": liveWorkerToken, "x-talos-owner-ref": ownerRef } } },
    );
    const client = new Client({ name: "talos-mcp-idempotency-test", version: "1.0.0" });

    try {
      await client.connect(transport);
      await client.callTool({ name: "browser_navigate", arguments: { url: hmiFixtureUrl } });
      const snapshot = await client.callTool({ name: "browser_snapshot", arguments: { state_version: 1 } });
      const target = (snapshot.structuredContent as { nodes: Array<{ name: string; ref: string }>; snapshot_id: string }).nodes
        .find((node) => node.name === "Reject optional cookies");
      const arguments_ = { target: target!.ref, snapshot_id: (snapshot.structuredContent as { snapshot_id: string }).snapshot_id, state_version: 1 };
      const request = {
        name: "browser_click",
        arguments: arguments_,
        _meta: { "com.github.ninozzz95.talos/idempotency-key": "mcp-click-retry-001" },
      };

      const first = await client.callTool(request);
      const retry = await client.callTool(request);
      const conflict = await client.callTool({ ...request, arguments: { ...arguments_, element: "Different target" } });

      expect(first.isError).toBe(false);
      expect(retry).toEqual(first);
      expect(conflict).toMatchObject({ isError: true, structuredContent: { code: "TALOS_BROWSER_CLICK_COMMAND_CONFLICT" } });
    } finally {
      await client.close();
      await requestJson(`/sessions/${clickSessionId}`, {
        method: "DELETE",
        headers: liveWorkerUrl === "" ? ownerHeaders : { "x-talos-worker-token": liveWorkerToken, "x-talos-owner-ref": ownerRef },
      });
    }
  }, 30_000);

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
