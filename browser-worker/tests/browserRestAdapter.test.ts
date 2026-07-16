import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { BrowserSessionManager } from "../src/BrowserSessionManager.js";
import { buildServer } from "../src/server.js";
import { BrowserToolResultSchema, validateToolStructuredOutput } from "../src/BrowserToolContracts.js";
import { BrowserActionCapabilityVerifier } from "../src/BrowserActionCapability.js";
import { TALOS_BROWSER_IDEMPOTENT_SESSION_BOOTSTRAP_PATH } from "../src/BrowserWorkerProtocol.js";
import { createTestActionCapabilityKeypair, signTestActionCapability } from "./support/browserActionCapability.js";

const fixtureUrl = new URL(`file://${resolve("tests/fixtures/read-only-page.html").replaceAll("\\", "/")}`).href;
const hmiFixtureUrl = new URL(`file://${resolve("tests/fixtures/hmi-page.html").replaceAll("\\", "/")}`).href;
const sessions = new BrowserSessionManager();
const actionKeys = createTestActionCapabilityKeypair("rest-action-test-key");
const actionNowSeconds = 1_750_000_010;
const app = buildServer({
  sessions,
  internalToken: "mcp-test-token",
  actionCapabilityVerifier: BrowserActionCapabilityVerifier.forTest(
    actionKeys.publicKeyPem,
    actionKeys.keyId,
    () => actionNowSeconds,
  ),
});
const ownerHeaders = { "x-talos-worker-token": "mcp-test-token", "x-talos-owner-ref": "user:1" };
const otherOwnerHeaders = { "x-talos-worker-token": "mcp-test-token", "x-talos-owner-ref": "user:2" };
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
    hmiActions: true,
    downloads: false,
    uploads: false,
  },
};

afterAll(async () => app.close());

async function createSession(payload = createPayload): Promise<string> {
  const response = await app.inject({ method: "POST", url: "/sessions", headers: ownerHeaders, payload });
  expect(response.statusCode).toBe(201);
  return response.json().data.sessionId as string;
}

async function callTool(
  sessionId: string,
  tool_use_id: string,
  name: string,
  arguments_: Record<string, unknown>,
  headers = ownerHeaders,
  authorizeAction = true,
) {
  const payload = { tool_use_id, name, arguments: arguments_ };
  const requestHeaders = name === "browser_click" && authorizeAction
    ? {
        ...headers,
        authorization: `Bearer ${await signTestActionCapability(actionKeys, {
          ownerRef: headers["x-talos-owner-ref"],
          workerSessionId: sessionId,
          actionId: tool_use_id,
          operation: "browser_click",
          preconditionStateVersion: typeof arguments_.state_version === "number" ? arguments_.state_version : 0,
          request: payload,
        })}`,
      }
    : headers;
  return app.inject({
    method: "POST",
    url: `/sessions/${sessionId}/tools/call`,
    headers: requestHeaders,
    payload,
  });
}

async function deleteSession(sessionId: string): Promise<void> {
  await app.inject({ method: "DELETE", url: `/sessions/${sessionId}`, headers: ownerHeaders });
}

describe("TALOS REST browser tool adapter", () => {
  it("replays the same bootstrap result for one structured Idempotency-Key and rejects a changed payload", async () => {
    const idempotencyKey = '"123e4567-e89b-42d3-a456-426614174333"';
    const request = (payload = createPayload) => app.inject({
      method: "POST",
      url: TALOS_BROWSER_IDEMPOTENT_SESSION_BOOTSTRAP_PATH,
      headers: { ...ownerHeaders, "idempotency-key": idempotencyKey },
      payload,
    });

    const first = await request();
    const replay = await request();
    const conflict = await request({ ...createPayload, viewport: { width: 1280, height: 800 } });

    expect(first.statusCode).toBe(201);
    expect(replay.statusCode).toBe(201);
    expect(first.json().data.sessionId).toBe(replay.json().data.sessionId);
    expect(conflict.statusCode).toBe(422);
    expect(conflict.json()).toMatchObject({ code: "TALOS_BROWSER_SESSION_IDEMPOTENCY_CONFLICT" });
    await deleteSession(first.json().data.sessionId as string);
  });

  it("returns the stable six-tool discovery list with closed canonical schemas", async () => {
    const response = await app.inject({ method: "GET", url: "/tools", headers: ownerHeaders });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body).toEqual(expect.objectContaining({ data: { tools: expect.any(Array) } }));
    expect(body.data.tools.map((tool: { name: string }) => tool.name)).toEqual([
      "browser_navigate",
      "browser_snapshot",
      "browser_read",
      "browser_take_screenshot",
      "browser_wait_for",
      "browser_click",
    ]);
    for (const tool of body.data.tools) {
      expect(tool.inputSchema).toMatchObject({ type: "object", additionalProperties: false });
      expect(tool.outputSchema).toMatchObject({ type: "object", additionalProperties: false });
    }
    expect(body.data.tools.some((tool: { name: string }) => /hmi|pointer/i.test(tool.name))).toBe(false);
    expect(body.data.tools.find((tool: { name: string }) => tool.name === "browser_snapshot").inputSchema).toMatchObject({
      properties: { state_version: { type: "integer", minimum: 0 } },
    });
    expect(body.data.tools.find((tool: { name: string }) => tool.name === "browser_click")).toMatchObject({
      inputSchema: {
        properties: {
          target: { type: "string", pattern: "^r[0-9]+$" },
          snapshot_id: { type: "string" },
          state_version: { type: "integer", minimum: 0 },
        },
        required: ["target", "snapshot_id", "state_version"],
      },
    });
  });

  it("enforces session capabilities on canonical snapshot and screenshot calls", async () => {
    const sessionId = await createSession({
      ...createPayload,
      capabilities: {
        ...createPayload.capabilities,
        screenshots: false,
        accessibilitySnapshot: false,
      },
    });

    try {
      const snapshot = await callTool(sessionId, "cap-snapshot", "browser_snapshot", {});
      expect(snapshot.statusCode).toBe(200);
      expect(snapshot.json()).toMatchObject({
        tool_use_id: "cap-snapshot",
        isError: true,
        structuredContent: { code: "TALOS_BROWSER_CAPABILITY_DENIED" },
      });

      const screenshot = await callTool(sessionId, "cap-screenshot", "browser_take_screenshot", {});
      expect(screenshot.statusCode).toBe(200);
      expect(screenshot.json()).toMatchObject({
        tool_use_id: "cap-screenshot",
        isError: true,
        structuredContent: { code: "TALOS_BROWSER_CAPABILITY_DENIED" },
      });
    } finally {
      await deleteSession(sessionId);
    }
  });

  it("executes valid navigation, snapshot, read, screenshot, and wait calls as canonical results", async () => {
    const sessionId = await createSession();
    try {
      const navigated = await callTool(sessionId, "call-nav", "browser_navigate", { url: fixtureUrl });
      const navigationResult = navigated.json();
      expect(navigated.statusCode).toBe(200);
      expect(navigationResult).toMatchObject({ schema_version: "talos_tool_result_v1", tool_use_id: "call-nav", isError: false });
      expect(navigationResult.structuredContent).toMatchObject({ url: fixtureUrl, title: "TALOS Browse Fixture", state_version: 1 });
      expect(navigationResult.evidence[0].sha256).toMatch(/^sha256:[a-f0-9]{64}$/);

      const snapshotResponse = await callTool(sessionId, "call-snapshot", "browser_snapshot", {});
      const snapshotResult = snapshotResponse.json();
      expect(snapshotResponse.statusCode).toBe(200);
      expect(snapshotResult.structuredContent).toMatchObject({ state_version: 1, url: fixtureUrl, title: "TALOS Browse Fixture" });
      expect(snapshotResult.structuredContent.snapshot_id).toMatch(/^snap_/);
      expect(snapshotResult.structuredContent.nodes.length).toBeGreaterThan(0);
      expect(snapshotResult.evidence[0]).toMatchObject({ kind: "snapshot", trusted_boundary: "untrusted_web_content" });

      const inspected = await app.inject({ method: "GET", url: `/sessions/${sessionId}`, headers: ownerHeaders });
      expect(inspected.json().data).not.toHaveProperty("latestSnapshot");

      const readResponse = await callTool(sessionId, "call-read", "browser_read", {
        ref: "r1",
        snapshot_id: snapshotResult.structuredContent.snapshot_id,
        state_version: 1,
      });
      expect(readResponse.statusCode).toBe(200);
      expect(readResponse.json()).toMatchObject({
        schema_version: "talos_tool_result_v1",
        tool_use_id: "call-read",
        isError: false,
        structuredContent: { state_version: 1, matches: [expect.objectContaining({ ref: "r1" })] },
      });

      const screenshotResponse = await callTool(sessionId, "call-screenshot", "browser_take_screenshot", { state_version: 1 });
      const screenshotResult = screenshotResponse.json();
      expect(screenshotResponse.statusCode).toBe(200);
      const image = screenshotResult.content.find((content: { type: string }) => content.type === "image");
      expect(image).toMatchObject({ type: "image", mimeType: "image/png" });
      expect(screenshotResult.evidence[0].sha256).toBe(`sha256:${createHash("sha256").update(Buffer.from(image.data, "base64")).digest("hex")}`);

      const waited = await callTool(sessionId, "call-wait", "browser_wait_for", { time: 0.01, state_version: 1 });
      expect(waited.statusCode).toBe(200);
      expect(waited.json()).toMatchObject({ isError: false, structuredContent: { state_version: 2 } });
    } finally {
      await deleteSession(sessionId);
    }
  }, 20_000);

  it("rejects stale state and stale snapshot references after multiple transitions", async () => {
    const sessionId = await createSession();
    try {
      await callTool(sessionId, "nav-1", "browser_navigate", { url: fixtureUrl });
      const snapshot = (await callTool(sessionId, "snapshot-1", "browser_snapshot", {})).json().structuredContent;
      await callTool(sessionId, "wait-1", "browser_wait_for", { time: 0.01, state_version: 1 });

      const staleState = await callTool(sessionId, "stale-state", "browser_read", { ref: "r1", snapshot_id: snapshot.snapshot_id, state_version: 1 });
      expect(staleState.json()).toMatchObject({ isError: true, structuredContent: { code: "TALOS_BROWSER_STALE_STATE" } });

      const staleRef = await callTool(sessionId, "stale-ref", "browser_read", { ref: "r1", snapshot_id: snapshot.snapshot_id, state_version: 2 });
      expect(staleRef.json()).toMatchObject({ isError: true, structuredContent: { code: "TALOS_BROWSER_STALE_REF" } });
    } finally {
      await deleteSession(sessionId);
    }
  }, 20_000);

  it("rejects a consequential REST click authenticated only with the worker service token", async () => {
    const sessionId = await createSession();
    try {
      await callTool(sessionId, "unsigned-click-nav", "browser_navigate", { url: hmiFixtureUrl });
      const snapshot = (await callTool(sessionId, "unsigned-click-snapshot", "browser_snapshot", { state_version: 1 })).json().structuredContent;
      const target = snapshot.nodes.find((node: { name: string }) => node.name === "Reject optional cookies");
      expect(target).toEqual(expect.objectContaining({ ref: expect.stringMatching(/^r\d+$/) }));

      const response = await callTool(sessionId, "unsigned-click", "browser_click", {
        target: target.ref,
        element: "Reject optional cookies",
        snapshot_id: snapshot.snapshot_id,
        state_version: 1,
      }, ownerHeaders, false);

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        code: "TALOS_BROWSER_ACTION_CAPABILITY_REQUIRED",
      });
    } finally {
      await deleteSession(sessionId);
    }
  }, 20_000);

  it("clicks an exact snapshot ref once and returns atomic screenshot and post-action snapshot evidence", async () => {
    const sessionId = await createSession();
    try {
      await callTool(sessionId, "click-nav", "browser_navigate", { url: hmiFixtureUrl });
      const snapshot = (await callTool(sessionId, "click-snapshot", "browser_snapshot", { state_version: 1 })).json().structuredContent;
      const target = snapshot.nodes.find((node: { name: string }) => node.name === "Reject optional cookies");
      expect(target).toEqual(expect.objectContaining({ ref: expect.stringMatching(/^r\d+$/) }));

      const clicked = await callTool(sessionId, "click-cookie", "browser_click", {
        target: target.ref,
        element: "Reject optional cookies",
        snapshot_id: snapshot.snapshot_id,
        state_version: 1,
      });
      const result = clicked.json();

      expect(clicked.statusCode).toBe(200);
      expect(result).toMatchObject({
        schema_version: "talos_tool_result_v1",
        tool_use_id: "click-cookie",
        isError: false,
        structuredContent: {
          url: hmiFixtureUrl,
          title: "TALOS HMI Fixture",
          state_version: 2,
          target: { ref: target.ref, role: "button", name: "Reject optional cookies" },
          screenshot: { mime_type: "image/png", width: 1440, height: 900 },
          snapshot: { format: "accessibility_refs_v1", nodes: expect.any(Array) },
        },
        evidence: [
          expect.objectContaining({ kind: "screenshot", trusted_boundary: "untrusted_web_content" }),
          expect.objectContaining({ kind: "snapshot", trusted_boundary: "untrusted_web_content" }),
        ],
      });
      expect(result.structuredContent.screenshot.sha256).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(result.structuredContent.snapshot.snapshot_id).toMatch(/^snap_/);
      expect(result.structuredContent.snapshot.nodes).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: "Cookie preferences" })]));
      expect(result.content).toEqual(expect.arrayContaining([expect.objectContaining({ type: "image", mimeType: "image/png" })]));

      const session = await app.inject({ method: "GET", url: `/sessions/${sessionId}`, headers: ownerHeaders });
      expect(session.json().data.stateVersion).toBe(2);

      const replay = await callTool(sessionId, "click-cookie", "browser_click", {
        target: target.ref,
        element: "Reject optional cookies",
        snapshot_id: snapshot.snapshot_id,
        state_version: 1,
      });
      expect(replay.json()).toEqual(result);

      const conflict = await callTool(sessionId, "click-cookie", "browser_click", {
        target: target.ref,
        element: "Different element",
        snapshot_id: snapshot.snapshot_id,
        state_version: 1,
      });
      expect(conflict.json()).toMatchObject({ isError: true, structuredContent: { code: "TALOS_BROWSER_CLICK_COMMAND_CONFLICT" } });
    } finally {
      await deleteSession(sessionId);
    }
  }, 20_000);

  it("resolves the exact snapshot ref when multiple controls share the same accessible name", async () => {
    const sessionId = await createSession();
    try {
      await callTool(sessionId, "duplicate-nav", "browser_navigate", { url: hmiFixtureUrl });
      const page = (await sessions.get(sessionId)).page;
      await page.evaluate(() => {
        const first = document.createElement("button");
        first.type = "button";
        first.textContent = "Choose option";
        first.style.cssText = "position:fixed;left:720px;top:100px;width:160px;height:48px";
        first.addEventListener("click", () => document.body.setAttribute("data-selected-option", "first"));
        const second = document.createElement("button");
        second.type = "button";
        second.textContent = "Choose option";
        second.style.cssText = "position:fixed;left:720px;top:180px;width:160px;height:48px";
        second.addEventListener("click", () => document.body.setAttribute("data-selected-option", "second"));
        document.body.append(first, second);
      });
      const snapshot = (await callTool(sessionId, "duplicate-snapshot", "browser_snapshot", { state_version: 1 })).json().structuredContent;
      const targets = snapshot.nodes.filter((node: { role: string; name: string }) => node.role === "button" && node.name === "Choose option");
      expect(targets).toHaveLength(2);

      const clicked = await callTool(sessionId, "duplicate-click", "browser_click", {
        target: targets[1].ref,
        element: "Choose option",
        snapshot_id: snapshot.snapshot_id,
        state_version: 1,
      });

      expect(clicked.json()).toMatchObject({
        isError: false,
        structuredContent: { target: { ref: targets[1].ref }, state_version: 2 },
      });
      expect(await page.locator("body").getAttribute("data-selected-option")).toBe("second");
    } finally {
      await deleteSession(sessionId);
    }
  }, 20_000);

  it("clicks a bound button whose accessible name comes from aria-labelledby", async () => {
    const sessionId = await createSession();
    try {
      await callTool(sessionId, "labelled-button-nav", "browser_navigate", { url: hmiFixtureUrl });
      const page = (await sessions.get(sessionId)).page;
      await page.evaluate(() => {
        const label = document.createElement("span");
        label.id = "semantic-button-label";
        label.textContent = "Continue with semantic label";
        const button = document.createElement("button");
        button.setAttribute("aria-labelledby", label.id);
        button.style.cssText = "position:fixed;left:720px;top:100px;width:200px;height:48px";
        button.addEventListener("click", () => document.body.setAttribute("data-labelled-button-clicked", "yes"));
        document.body.append(label, button);
      });
      const snapshot = (await callTool(sessionId, "labelled-button-snapshot", "browser_snapshot", { state_version: 1 })).json().structuredContent;
      const target = snapshot.nodes.find((node: { role: string; name: string }) => (
        node.role === "button" && node.name === "Continue with semantic label"
      ));

      const clicked = await callTool(sessionId, "labelled-button-click", "browser_click", {
        target: target.ref,
        snapshot_id: snapshot.snapshot_id,
        state_version: 1,
      });

      expect(clicked.json()).toMatchObject({ isError: false, structuredContent: { target: { ref: target.ref, role: "button", name: "Continue with semantic label" } } });
      expect(await page.locator("body").getAttribute("data-labelled-button-clicked")).toBe("yes");
    } finally {
      await deleteSession(sessionId);
    }
  }, 20_000);

  it("clicks a bound native checkbox using its label-derived accessible role and name", async () => {
    const sessionId = await createSession();
    try {
      await callTool(sessionId, "native-checkbox-nav", "browser_navigate", { url: hmiFixtureUrl });
      const page = (await sessions.get(sessionId)).page;
      await page.evaluate(() => {
        const label = document.createElement("label");
        label.htmlFor = "semantic-checkbox";
        label.textContent = "Enable semantic option";
        const checkbox = document.createElement("input");
        checkbox.id = "semantic-checkbox";
        checkbox.type = "checkbox";
        checkbox.style.cssText = "position:fixed;left:720px;top:180px;width:32px;height:32px";
        checkbox.addEventListener("change", () => document.body.setAttribute("data-native-checkbox", checkbox.checked ? "checked" : "unchecked"));
        document.body.append(label, checkbox);
      });
      const snapshot = (await callTool(sessionId, "native-checkbox-snapshot", "browser_snapshot", { state_version: 1 })).json().structuredContent;
      const target = snapshot.nodes.find((node: { role: string; name: string }) => (
        node.role === "checkbox" && node.name === "Enable semantic option"
      ));

      const clicked = await callTool(sessionId, "native-checkbox-click", "browser_click", {
        target: target.ref,
        snapshot_id: snapshot.snapshot_id,
        state_version: 1,
      });

      expect(clicked.json()).toMatchObject({ isError: false, structuredContent: { target: { ref: target.ref, role: "checkbox", name: "Enable semantic option" } } });
      expect(await page.locator("body").getAttribute("data-native-checkbox")).toBe("checked");
    } finally {
      await deleteSession(sessionId);
    }
  }, 20_000);

  it("keeps a ref bound to its original DOM node when same-name controls are inserted and reordered", async () => {
    const sessionId = await createSession();
    try {
      await callTool(sessionId, "identity-nav", "browser_navigate", { url: hmiFixtureUrl });
      const page = (await sessions.get(sessionId)).page;
      await page.evaluate(() => {
      for (const [id, top] of [["first", 100], ["second", 160]] as const) {
          const button = document.createElement("button");
          button.id = `identity-${id}`;
          button.textContent = "Same semantic action";
          button.style.cssText = `position:fixed;left:720px;top:${top}px;width:160px;height:48px`;
          button.addEventListener("click", () => document.body.setAttribute("data-identity-click", id));
          document.body.append(button);
        }
      });
      const snapshot = (await callTool(sessionId, "identity-snapshot", "browser_snapshot", { state_version: 1 })).json().structuredContent;
      const targets = snapshot.nodes.filter((node: { role: string; name: string }) => node.role === "button" && node.name === "Same semantic action");
      const target = targets[1];
      await page.evaluate(() => {
        const inserted = document.createElement("button");
        inserted.textContent = "Same semantic action";
        inserted.style.cssText = "position:fixed;left:720px;top:220px;width:160px;height:48px";
        inserted.addEventListener("click", () => document.body.setAttribute("data-identity-click", "inserted"));
        document.body.prepend(inserted);
        document.querySelector("#identity-second")?.parentElement?.prepend(document.querySelector("#identity-second")!);
      });

      const clicked = await callTool(sessionId, "identity-click", "browser_click", {
        target: target.ref,
        snapshot_id: snapshot.snapshot_id,
        state_version: 1,
      });

      expect(clicked.json()).toMatchObject({ isError: false, structuredContent: { target: { ref: target.ref } } });
      expect(await page.locator("body").getAttribute("data-identity-click")).toBe("second");
    } finally {
      await deleteSession(sessionId);
    }
  }, 20_000);

  it("fails closed when a referenced DOM node is replaced by an identical semantic control", async () => {
    const sessionId = await createSession();
    try {
      await callTool(sessionId, "replacement-nav", "browser_navigate", { url: hmiFixtureUrl });
      const snapshot = (await callTool(sessionId, "replacement-snapshot", "browser_snapshot", { state_version: 1 })).json().structuredContent;
      const target = snapshot.nodes.find((node: { name: string }) => node.name === "Reject optional cookies");
      const page = (await sessions.get(sessionId)).page;
      await page.locator("#dismiss-cookie").evaluate((element) => {
        const replacement = element.cloneNode(true) as HTMLButtonElement;
        replacement.addEventListener("click", () => document.body.setAttribute("data-replacement-clicked", "yes"));
        element.replaceWith(replacement);
      });

      const response = await callTool(sessionId, "replacement-click", "browser_click", {
        target: target.ref,
        snapshot_id: snapshot.snapshot_id,
        state_version: 1,
      });

      expect(response.json()).toMatchObject({ isError: true, structuredContent: { code: "TALOS_BROWSER_REF_MISSING" } });
      expect(await page.locator("body").getAttribute("data-replacement-clicked")).toBeNull();
      expect((await sessions.get(sessionId)).stateVersion).toBe(1);
    } finally {
      await deleteSession(sessionId);
    }
  }, 20_000);

  it("treats a locator click error after dispatch as ambiguous and replays the recovery result", async () => {
    const sessionId = await createSession();
    try {
      await callTool(sessionId, "dispatch-error-nav", "browser_navigate", { url: hmiFixtureUrl });
      const snapshot = (await callTool(sessionId, "dispatch-error-snapshot", "browser_snapshot", { state_version: 1 })).json().structuredContent;
      const target = snapshot.nodes.find((node: { name: string }) => node.name === "Reject optional cookies");
      const page = (await sessions.get(sessionId)).page;
      await page.locator("#dismiss-cookie").evaluate((element) => {
        element.addEventListener("click", () => {
          const body = document.body as HTMLBodyElement & { clickCount?: number };
          body.clickCount = (body.clickCount ?? 0) + 1;
        });
      });
      const binding = (sessions.snapshot(sessionId)?.value as { refBindings?: Map<string, { click: () => Promise<void> }> }).refBindings?.get(target.ref);
      expect(binding).toBeDefined();
      const originalClick = binding!.click.bind(binding);
      Object.defineProperty(binding!, "click", {
        configurable: true,
        value: async () => {
          await originalClick();
          throw new Error("late-click-error");
        },
      });
      const arguments_ = { target: target.ref, snapshot_id: snapshot.snapshot_id, state_version: 1 };

      const first = await callTool(sessionId, "dispatch-error-click", "browser_click", arguments_);
      const retry = await callTool(sessionId, "dispatch-error-click", "browser_click", arguments_);

      expect(first.json()).toMatchObject({ isError: true, structuredContent: { code: "TALOS_BROWSER_CLICK_RECOVERY_REQUIRED", idempotency_status: "ambiguous" } });
      expect(retry.json()).toEqual(first.json());
      expect(await page.locator("body").evaluate((body) => (body as HTMLBodyElement & { clickCount?: number }).clickCount)).toBe(1);
      expect((await sessions.get(sessionId)).status).toBe("recovery_required");
    } finally {
      await deleteSession(sessionId);
    }
  }, 20_000);

  it("requires recovery when an invisible post-click DOM mutation occurs between evidence samples", async () => {
    const sessionId = await createSession();
    try {
      await callTool(sessionId, "invisible-dom-nav", "browser_navigate", { url: hmiFixtureUrl });
      const snapshot = (await callTool(sessionId, "invisible-dom-snapshot", "browser_snapshot", { state_version: 1 })).json().structuredContent;
      const target = snapshot.nodes.find((node: { name: string }) => node.name === "Reject optional cookies");
      const page = (await sessions.get(sessionId)).page;
      const originalScreenshot = page.screenshot.bind(page);
      let screenshotCalls = 0;
      Object.defineProperty(page, "screenshot", {
        configurable: true,
        value: async (options: Parameters<typeof originalScreenshot>[0]) => {
          const result = await originalScreenshot(options);
          screenshotCalls += 1;
          if (screenshotCalls === 2) {
            await page.evaluate(() => document.body.setAttribute("data-invisible-evidence-race", "changed"));
          }
          return result;
        },
      });

      const response = await callTool(sessionId, "invisible-dom-click", "browser_click", {
        target: target.ref,
        snapshot_id: snapshot.snapshot_id,
        state_version: 1,
      });

      expect(response.json()).toMatchObject({ isError: true, structuredContent: { code: "TALOS_BROWSER_CLICK_RECOVERY_REQUIRED", reason_code: "evidence_dom_changed" } });
      expect((await sessions.get(sessionId)).status).toBe("recovery_required");
    } finally {
      await deleteSession(sessionId);
    }
  }, 20_000);

  it("turns a post-click output validation failure into cached recovery", async () => {
    const sessionId = await createSession();
    try {
      await callTool(sessionId, "invalid-output-nav", "browser_navigate", { url: hmiFixtureUrl });
      const page = (await sessions.get(sessionId)).page;
      await page.evaluate(() => {
        const button = document.createElement("button");
        button.textContent = "Invalidate output";
        button.style.cssText = "position:fixed;left:720px;top:240px;width:160px;height:48px";
        button.addEventListener("click", () => { document.title = "x".repeat(513); });
        document.body.append(button);
      });
      const snapshot = (await callTool(sessionId, "invalid-output-snapshot", "browser_snapshot", { state_version: 1 })).json().structuredContent;
      const target = snapshot.nodes.find((node: { name: string }) => node.name === "Invalidate output");
      const arguments_ = { target: target.ref, snapshot_id: snapshot.snapshot_id, state_version: 1 };

      const first = await callTool(sessionId, "invalid-output-click", "browser_click", arguments_);
      const retry = await callTool(sessionId, "invalid-output-click", "browser_click", arguments_);

      expect(first.json()).toMatchObject({ isError: true, structuredContent: { code: "TALOS_BROWSER_CLICK_RECOVERY_REQUIRED", reason_code: "post_click_output_validation" } });
      expect(retry.json()).toEqual(first.json());
      expect((await sessions.get(sessionId)).status).toBe("recovery_required");
    } finally {
      await deleteSession(sessionId);
    }
  }, 20_000);

  it.each([
    ["stale ref", { target: "r999", snapshot_id: "USE_SNAPSHOT", state_version: 1 }, "TALOS_BROWSER_STALE_REF"],
    ["stale snapshot", { target: "USE_TARGET", snapshot_id: "snap_missing", state_version: 1 }, "TALOS_BROWSER_STALE_SNAPSHOT"],
    ["stale state", { target: "USE_TARGET", snapshot_id: "USE_SNAPSHOT", state_version: 0 }, "TALOS_BROWSER_STALE_STATE"],
  ])("rejects %s without clicking or advancing state", async (_label, rawArguments, code) => {
    const sessionId = await createSession();
    try {
      await callTool(sessionId, "stale-nav", "browser_navigate", { url: hmiFixtureUrl });
      const snapshot = (await callTool(sessionId, "stale-snapshot", "browser_snapshot", { state_version: 1 })).json().structuredContent;
      const target = snapshot.nodes.find((node: { name: string }) => node.name === "Reject optional cookies");
      const arguments_ = {
        ...rawArguments,
        target: rawArguments.target === "USE_TARGET" ? target.ref : rawArguments.target,
        snapshot_id: rawArguments.snapshot_id === "USE_SNAPSHOT" ? snapshot.snapshot_id : rawArguments.snapshot_id,
      };

      const response = await callTool(sessionId, "stale-click", "browser_click", arguments_);
      expect(response.json()).toMatchObject({ isError: true, structuredContent: { code } });
      expect((await app.inject({ method: "GET", url: `/sessions/${sessionId}`, headers: ownerHeaders })).json().data.stateVersion).toBe(1);
      const session = await app.inject({ method: "GET", url: `/sessions/${sessionId}`, headers: ownerHeaders });
      expect(session.json().data.stateVersion).toBe(1);
    } finally {
      await deleteSession(sessionId);
    }
  });

  it("rejects an unsupported semantic target without effect", async () => {
    const sessionId = await createSession();
    try {
      await callTool(sessionId, "unsupported-nav", "browser_navigate", { url: hmiFixtureUrl });
      const snapshot = (await callTool(sessionId, "unsupported-snapshot", "browser_snapshot", { state_version: 1 })).json().structuredContent;
      const target = snapshot.nodes.find((node: { role: string }) => node.role === "heading");
      const response = await callTool(sessionId, "unsupported-click", "browser_click", {
        target: target.ref,
        snapshot_id: snapshot.snapshot_id,
        state_version: 1,
      });
      expect(response.json()).toMatchObject({ isError: true, structuredContent: { code: "TALOS_BROWSER_UNSUPPORTED_TARGET" } });
      expect((await app.inject({ method: "GET", url: `/sessions/${sessionId}`, headers: ownerHeaders })).json().data.stateVersion).toBe(1);
    } finally {
      await deleteSession(sessionId);
    }
  });

  it.each([
    ["hidden", "TALOS_BROWSER_TARGET_HIDDEN"],
    ["disabled", "TALOS_BROWSER_TARGET_DISABLED"],
  ])("rejects a %s target without effect", async (label, code) => {
    const sessionId = await createSession();
    try {
      await callTool(sessionId, "denied-nav", "browser_navigate", { url: hmiFixtureUrl });
      const snapshot = (await callTool(sessionId, "denied-snapshot", "browser_snapshot", { state_version: 1 })).json().structuredContent;
      const target = snapshot.nodes.find((node: { name: string }) => node.name === "Reject optional cookies");
      const page = (await sessions.get(sessionId)).page;
      await page.locator("#dismiss-cookie").evaluate((element, currentLabel) => {
        if (currentLabel === "hidden") (element as HTMLElement).style.display = "none";
        if (currentLabel === "disabled") (element as HTMLButtonElement).disabled = true;
      }, label);
      const response = await callTool(sessionId, "denied-click", "browser_click", { target: target.ref, snapshot_id: snapshot.snapshot_id, state_version: 1 });
      expect(response.json()).toMatchObject({ isError: true, structuredContent: { code } });
      expect((await app.inject({ method: "GET", url: `/sessions/${sessionId}`, headers: ownerHeaders })).json().data.stateVersion).toBe(1);
    } finally {
      await deleteSession(sessionId);
    }
  });

  it("rejects a changed document without clicking or advancing state", async () => {
    const sessionId = await createSession();
    try {
      await callTool(sessionId, "document-nav", "browser_navigate", { url: hmiFixtureUrl });
      const snapshot = (await callTool(sessionId, "document-snapshot", "browser_snapshot", { state_version: 1 })).json().structuredContent;
      const target = snapshot.nodes.find((node: { name: string }) => node.name === "Reject optional cookies");
      await (await sessions.get(sessionId)).page.goto(fixtureUrl);
      const response = await callTool(sessionId, "document-click", "browser_click", { target: target.ref, snapshot_id: snapshot.snapshot_id, state_version: 1 });
      expect(response.json()).toMatchObject({ isError: true, structuredContent: { code: "TALOS_BROWSER_DOCUMENT_CHANGED" } });
      expect((await app.inject({ method: "GET", url: `/sessions/${sessionId}`, headers: ownerHeaders })).json().data.stateVersion).toBe(1);
    } finally {
      await deleteSession(sessionId);
    }
  }, 20_000);

  it("requires hmiActions for semantic clicks", async () => {
    const sessionId = await createSession({
      ...createPayload,
      capabilities: { ...createPayload.capabilities, hmiActions: false },
    });
    try {
      await callTool(sessionId, "capability-nav", "browser_navigate", { url: hmiFixtureUrl });
      const snapshot = (await callTool(sessionId, "capability-snapshot", "browser_snapshot", { state_version: 1 })).json().structuredContent;
      const target = snapshot.nodes.find((node: { name: string }) => node.name === "Reject optional cookies");
      const response = await callTool(sessionId, "capability-click", "browser_click", { target: target.ref, snapshot_id: snapshot.snapshot_id, state_version: 1 });
      expect(response.json()).toMatchObject({ isError: true, structuredContent: { code: "TALOS_BROWSER_CAPABILITY_DENIED" } });
    } finally {
      await deleteSession(sessionId);
    }
  });

  it("blocks file chooser, download, and new-context targets before dispatch", async () => {
    const sessionId = await createSession();
    try {
      await callTool(sessionId, "blocked-nav", "browser_navigate", { url: hmiFixtureUrl });
      const page = (await sessions.get(sessionId)).page;
      await page.evaluate(() => {
        const file = document.createElement("input");
        file.type = "file";
        file.setAttribute("aria-label", "Upload file");
        file.style.cssText = "position:fixed;left:10px;top:10px;width:100px;height:30px";
        const download = document.createElement("a");
        download.href = "https://example.com/export";
        download.download = "export.txt";
        download.textContent = "Download export";
        const popup = document.createElement("a");
        popup.href = "https://example.com/popup";
        popup.target = "_blank";
        popup.textContent = "Open new context";
        document.body.append(file, download, popup);
      });
      const snapshot = (await callTool(sessionId, "blocked-snapshot", "browser_snapshot", { state_version: 1 })).json().structuredContent;
      const cases = [
        ["Upload file", "TALOS_BROWSER_FILE_CHOOSER_DENIED"],
        ["Download export", "TALOS_BROWSER_DOWNLOAD_DENIED"],
        ["Open new context", "TALOS_BROWSER_NEW_CONTEXT_DENIED"],
      ] as const;
      for (const [name, code] of cases) {
        const target = snapshot.nodes.find((node: { name: string }) => node.name === name);
        const response = await callTool(sessionId, `blocked-${name}`, "browser_click", { target: target.ref, snapshot_id: snapshot.snapshot_id, state_version: 1 });
        expect(response.json()).toMatchObject({ isError: true, structuredContent: { code } });
      }
      expect((await app.inject({ method: "GET", url: `/sessions/${sessionId}`, headers: ownerHeaders })).json().data.stateVersion).toBe(1);
    } finally {
      await deleteSession(sessionId);
    }
  }, 20_000);

  it("returns canonical unsupported-tool and bounded-wait errors", async () => {
    const sessionId = await createSession();
    try {
      const unsupported = await callTool(sessionId, "unsupported", "browser_future", {});
      expect(unsupported.statusCode).toBe(200);
      expect(unsupported.json()).toMatchObject({ schema_version: "talos_tool_result_v1", tool_use_id: "unsupported", isError: true, structuredContent: { code: "TALOS_BROWSER_UNSUPPORTED_TOOL" } });

      const tooLong = await callTool(sessionId, "too-long", "browser_wait_for", { time: 11 });
      expect(tooLong.statusCode).toBe(200);
      expect(tooLong.json()).toMatchObject({ isError: true, structuredContent: { code: "TALOS_BROWSER_WAIT_BOUNDS" } });

      const conflicting = await callTool(sessionId, "conflicting-wait", "browser_wait_for", { time: 0, textGone: "never-present" });
      expect(conflicting.statusCode).toBe(200);
      expect(conflicting.json()).toMatchObject({ isError: true, structuredContent: { code: "TALOS_BROWSER_INVALID_TOOL_ARGUMENTS" } });
    } finally {
      await deleteSession(sessionId);
    }
  });

  it("serializes tool operations per session so stale state cannot race a transition", async () => {
    const sessionId = await createSession();
    try {
      const waiting = callTool(sessionId, "serialized-wait", "browser_wait_for", { time: 0.05, state_version: 0 });
      const racingNavigation = callTool(sessionId, "serialized-navigation", "browser_navigate", { url: fixtureUrl, state_version: 0 });
      const [waited, navigated] = await Promise.all([waiting, racingNavigation]);

      expect(waited.json()).toMatchObject({ isError: false, structuredContent: { state_version: 1 } });
      expect(navigated.json()).toMatchObject({ isError: true, structuredContent: { code: "TALOS_BROWSER_STALE_STATE", state_version: 1 } });
    } finally {
      await deleteSession(sessionId);
    }
  });

  it("serializes legacy navigation with canonical tool operations", async () => {
    const sessionId = await createSession();
    try {
      const waiting = callTool(sessionId, "legacy-serialization-wait", "browser_wait_for", { time: 1, state_version: 0 });
      const legacyNavigation = app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/navigate`,
        headers: ownerHeaders,
        payload: { url: fixtureUrl },
      });
      const [waited, navigated] = await Promise.all([waiting, legacyNavigation]);

      expect(waited.json()).toMatchObject({ isError: false, structuredContent: { state_version: 1 } });
      expect(navigated.statusCode).toBe(200);
      expect(navigated.json()).toMatchObject({ data: { stateVersion: 2, url: fixtureUrl } });
    } finally {
      await deleteSession(sessionId);
    }
  }, 20_000);

  it("rejects malformed tool output through the Zod result boundary", () => {
    const malformed = BrowserToolResultSchema.safeParse({
      schema_version: "talos_tool_result_v1",
      tool_use_id: "malformed",
      isError: false,
      content: [{ type: "image", data: "not-base64", mimeType: "image/png" }],
      structuredContent: { url: fixtureUrl, title: "Fixture", state_version: "1" },
      evidence: [],
    });

    expect(malformed.success).toBe(false);
    expect(() => validateToolStructuredOutput("browser_navigate", { url: fixtureUrl, title: "Fixture", state_version: "1" })).toThrow();
    expect(() => validateToolStructuredOutput("browser_navigate", { url: `https://example.com/${"x".repeat(2_100)}`, title: "Fixture", state_version: 1 })).toThrow();
    expect(() => validateToolStructuredOutput("browser_navigate", { url: fixtureUrl, title: "x".repeat(513), state_version: 1 })).toThrow();
    expect(() => validateToolStructuredOutput("browser_navigate", { url: `https://example.com/${"界".repeat(700)}`, title: "Fixture", state_version: 1 })).toThrow();
    expect(() => validateToolStructuredOutput("browser_navigate", { url: fixtureUrl, title: "界".repeat(200), state_version: 1 })).toThrow();
  });

  it("accepts the shared canonical tool-result fixture used by PHP and Validator", () => {
    const fixture = JSON.parse(readFileSync(resolve("..", "core", "tests", "fixtures", "tool-contracts", "valid-result.json"), "utf8"));

    expect(BrowserToolResultSchema.parse(fixture)).toEqual(fixture);
  });

  it("preserves authentication, ownership, and legacy data envelopes", async () => {
    const unauthenticated = await app.inject({ method: "GET", url: "/tools" });
    expect(unauthenticated.statusCode).toBe(401);

    const sessionId = await createSession();
    try {
      const forbidden = await callTool(sessionId, "other-owner", "browser_snapshot", {}, otherOwnerHeaders);
      expect(forbidden.statusCode).toBe(403);
      expect(forbidden.json()).toMatchObject({ code: "TALOS_BROWSER_OWNER_MISMATCH" });

      const legacy = await app.inject({ method: "POST", url: `/sessions/${sessionId}/navigate`, headers: ownerHeaders, payload: { url: fixtureUrl } });
      expect(legacy.statusCode).toBe(200);
      expect(legacy.json()).toEqual(expect.objectContaining({ data: expect.objectContaining({ title: "TALOS Browse Fixture", url: fixtureUrl }) }));
    } finally {
      await deleteSession(sessionId);
    }
  }, 20_000);
});
