import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { BrowserSessionManager } from "../src/BrowserSessionManager.js";
import {
  BrowserHmiResultResponseSchema,
  BrowserHmiTargetDescriptorSchema,
} from "../src/BrowserHmiContracts.js";
import { buildServer } from "../src/server.js";
import { BrowserActionCapabilityVerifier } from "../src/BrowserActionCapability.js";
import { createTestActionCapabilityKeypair, signTestActionCapability } from "./support/browserActionCapability.js";

const viewport = { width: 800, height: 600 };
const fixtureUrl = new URL(`file://${resolve("tests/fixtures/hmi-page.html").replaceAll("\\", "/")}`).href;
const sessions = new BrowserSessionManager();
const actionKeys = createTestActionCapabilityKeypair("hmi-action-test-key");
const actionNowSeconds = 1_750_000_010;
const app = buildServer({
  sessions,
  internalToken: "hmi-test-token",
  actionCapabilityVerifier: BrowserActionCapabilityVerifier.forTest(
    actionKeys.publicKeyPem,
    actionKeys.keyId,
    () => actionNowSeconds,
  ),
});
const ownerHeaders = { "x-talos-worker-token": "hmi-test-token", "x-talos-owner-ref": "user:1" };
const otherOwnerHeaders = { "x-talos-worker-token": "hmi-test-token", "x-talos-owner-ref": "user:2" };
let commandSequence = 0;

afterAll(async () => app.close());

async function createSession(hmiActions = true): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/sessions",
    headers: ownerHeaders,
    payload: {
      ownerRef: "user:1",
      mode: "read_only",
      viewport,
      ttlSeconds: 1_800,
      capabilities: {
        navigation: true,
        screenshots: true,
        accessibilitySnapshot: true,
        actions: false,
        hmiActions,
        downloads: false,
        uploads: false,
      },
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json().data.sessionId as string;
}

async function navigate(sessionId: string): Promise<void> {
  const response = await app.inject({
    method: "POST",
    url: `/sessions/${sessionId}/navigate`,
    headers: ownerHeaders,
    payload: { url: fixtureUrl },
  });
  expect(response.statusCode).toBe(200);
  expect(response.json().data.stateVersion).toBe(1);
}

function pointerPayload(normalizedX: number, normalizedY: number) {
  return {
    schema_version: "talos_browser_hmi_pointer_v2",
    interaction_id: "123e4567-e89b-42d3-a456-426614174000",
    state_version: 1,
    normalized_x: normalizedX,
    normalized_y: normalizedY,
    button: "left",
    click_count: 1,
  };
}

async function preflight(sessionId: string, payload = pointerPayload(0.2, 0.28)) {
  const expectedFrameSha256 = await currentFrameSha256(sessionId);
  return app.inject({
    method: "POST",
    url: `/sessions/${sessionId}/hmi/pointer/preflight`,
    headers: ownerHeaders,
    payload: { ...payload, expected_frame_sha256: expectedFrameSha256 },
  });
}

async function currentFrameSha256(sessionId: string): Promise<string> {
  const session = await sessions.get(sessionId);
  const frame = await session.page.screenshot({ type: "png", animations: "disabled", caret: "hide" });
  return `sha256:${createHash("sha256").update(frame).digest("hex")}`;
}

function executionPayload(
  inspected: { data: { frame_sha256: string; target: { fingerprint: string } } },
  payload = pointerPayload(0.2, 0.28),
  effectClassification: "ordinary" | "sensitive" = "sensitive",
  commandId = `hmi_cmd_test_${++commandSequence}`,
) {
  return {
    ...payload,
    command_id: commandId,
    expected_frame_sha256: inspected.data.frame_sha256,
    expected_fingerprint: inspected.data.target.fingerprint,
    effect_classification: effectClassification,
    sensitive_effect_authorized: effectClassification === "sensitive",
  };
}

async function executePointer(
  sessionId: string,
  payload: ReturnType<typeof executionPayload>,
  headers = ownerHeaders,
  authorizeAction = true,
) {
  const requestHeaders = authorizeAction
    ? {
        ...headers,
        authorization: `Bearer ${await signTestActionCapability(actionKeys, {
          ownerRef: headers["x-talos-owner-ref"],
          workerSessionId: sessionId,
          actionId: payload.command_id,
          operation: "hmi_pointer_execute",
          preconditionStateVersion: payload.state_version,
          request: payload,
        }, {
          attestation: {
            kind: "user_approval",
            approval_id: `approval-${payload.command_id}`,
            approval_request_sha256: `sha256:${"a".repeat(64)}`,
            execution_lease_sha256: `sha256:${"b".repeat(64)}`,
          },
        })}`,
      }
    : headers;

  return app.inject({
    method: "POST",
    url: `/sessions/${sessionId}/hmi/pointer/execute`,
    headers: requestHeaders,
    payload,
  });
}

describe("TALOS Browser HMI pointer boundary", () => {
  it("requires the dedicated HMI capability without enabling model actions", async () => {
    const sessionId = await createSession(false);
    try {
      await navigate(sessionId);
      const response = await preflight(sessionId);

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: "TALOS_BROWSER_HMI_CAPABILITY_DENIED" });

      const summary = await app.inject({ method: "GET", url: `/sessions/${sessionId}`, headers: ownerHeaders });
      expect(summary.json().data.capabilities).toMatchObject({ actions: false, hmiActions: false });
    } finally {
      await app.inject({ method: "DELETE", url: `/sessions/${sessionId}`, headers: ownerHeaders });
    }
  });

  it("rejects HMI execution authenticated only with the worker service token", async () => {
    const sessionId = await createSession();
    try {
      await navigate(sessionId);
      const inspected = await preflight(sessionId);
      expect(inspected.statusCode).toBe(200);

      const response = await executePointer(sessionId, executionPayload(inspected.json()), ownerHeaders, false);

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        code: "TALOS_BROWSER_ACTION_CAPABILITY_REQUIRED",
      });
    } finally {
      await app.inject({ method: "DELETE", url: `/sessions/${sessionId}`, headers: ownerHeaders });
    }
  });

  it("rejects malformed coordinates, stale state, and a different owner before inspection", async () => {
    const sessionId = await createSession();
    try {
      await navigate(sessionId);

      const malformed = await preflight(sessionId, pointerPayload(Number.NaN, 0.5));
      expect(malformed.statusCode).toBe(400);
      expect(malformed.json()).toMatchObject({ code: "TALOS_BROWSER_HMI_INVALID_POINTER" });

      const outside = await preflight(sessionId, pointerPayload(1.01, 0.5));
      expect(outside.statusCode).toBe(400);
      expect(outside.json()).toMatchObject({ code: "TALOS_BROWSER_HMI_INVALID_POINTER" });

      const stale = await preflight(sessionId, { ...pointerPayload(0.2, 0.28), state_version: 0 });
      expect(stale.statusCode).toBe(409);
      expect(stale.json()).toMatchObject({ code: "TALOS_BROWSER_STALE_STATE" });

      const forbidden = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/hmi/pointer/preflight`,
        headers: otherOwnerHeaders,
        payload: {
          ...pointerPayload(0.2, 0.28),
          expected_frame_sha256: await currentFrameSha256(sessionId),
        },
      });
      expect(forbidden.statusCode).toBe(403);
      expect(forbidden.json()).toMatchObject({ code: "TALOS_BROWSER_OWNER_MISMATCH" });
    } finally {
      await app.inject({ method: "DELETE", url: `/sessions/${sessionId}`, headers: ownerHeaders });
    }
  });

  it("preflights a bounded target and returns a deterministic fingerprint in CSS viewport pixels", async () => {
    const sessionId = await createSession();
    try {
      await navigate(sessionId);
      const response = await preflight(sessionId);
      const data = response.json().data;

      expect(response.statusCode).toBe(200);
      expect(data).toMatchObject({
        schema_version: "talos_browser_hmi_preflight_v2",
        session_id: sessionId,
        state_version: 1,
        origin: "null",
        point: { normalized_x: 0.2, normalized_y: 0.28, x: 160, y: 168 },
        target: {
          tag: "button",
          role: "button",
          name: "Reject optional cookies",
          input_type: null,
          href: null,
          form_method: null,
          is_editable: false,
          is_submit: false,
          is_download: false,
          opens_new_context: false,
          effect_attestation: "browser_default",
          required_effect_classification: "ordinary",
          visible: true,
          disabled: false,
        },
      });
      expect(data.target.fingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(data.frame_sha256).toMatch(/^sha256:[a-f0-9]{64}$/);
    } finally {
      await app.inject({ method: "DELETE", url: `/sessions/${sessionId}`, headers: ownerHeaders });
    }
  });

  it("converts fractional viewport coordinates to integer CDP hit-test pixels", async () => {
    const sessionId = await createSession();
    try {
      await navigate(sessionId);

      const response = await preflight(sessionId, pointerPayload(0.200625, 0.280834));

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toMatchObject({
        point: {
          normalized_x: 0.200625,
          normalized_y: 0.280834,
          x: 161,
          y: 169,
        },
        target: {
          tag: "button",
          name: "Reject optional cookies",
        },
      });
    } finally {
      await app.inject({ method: "DELETE", url: `/sessions/${sessionId}`, headers: ownerHeaders });
    }
  });

  it("keeps rounded CDP hit-test pixels inside the viewport at normalized edges", async () => {
    const sessionId = await createSession();
    try {
      await navigate(sessionId);

      const response = await preflight(sessionId, pointerPayload(0.999999, 0.999999));

      expect(response.statusCode).toBe(200);
      expect(response.json().data.point).toEqual({
        normalized_x: 0.999999,
        normalized_y: 0.999999,
        x: 799,
        y: 599,
      });
    } finally {
      await app.inject({ method: "DELETE", url: `/sessions/${sessionId}`, headers: ownerHeaders });
    }
  });

  it("executes an attestable ordinary target without sensitive authorization and binds the result", async () => {
    const sessionId = await createSession();
    try {
      await navigate(sessionId);
      const session = await sessions.get(sessionId);
      await session.page.evaluate(() => {
        const button = document.createElement("button");
        button.id = "ordinary-browser-default";
        button.type = "button";
        button.textContent = "Ordinary browser default";
        button.style = "position:fixed;left:0;top:0;width:100px;height:100px;z-index:9999";
        document.body.append(button);
      });

      const inspected = await preflight(sessionId, pointerPayload(0.05, 0.05));
      expect(inspected.statusCode).toBe(200);
      expect(inspected.json().data.target).toMatchObject({
        effect_attestation: "browser_default",
        required_effect_classification: "ordinary",
      });

      const commandId = "hmi_cmd_ordinary_no_sensitive_auth";
      const response = await executePointer(sessionId, executionPayload(
          inspected.json(),
          pointerPayload(0.05, 0.05),
          "ordinary",
          commandId,
        ), ownerHeaders);

      expect(response.statusCode).toBe(200);
      const result = response.json().data;
      expect(result).toMatchObject({
        command_id: commandId,
        effect_classification: "ordinary",
        sensitive_effect_authorized: false,
        target: {
          effect_attestation: "browser_default",
          required_effect_classification: "ordinary",
        },
      });
      expect(BrowserHmiResultResponseSchema.safeParse(result).success).toBe(true);
      expect(BrowserHmiResultResponseSchema.safeParse({
        ...result,
        target: {
          ...result.target,
          effect_attestation: "unattestable",
          required_effect_classification: "sensitive",
        },
      }).success).toBe(false);
    } finally {
      await app.inject({ method: "DELETE", url: `/sessions/${sessionId}`, headers: ownerHeaders });
    }
  });

  it("uses the same canonical frame capture for the screenshot route and HMI attestation", async () => {
    const sessionId = await createSession();
    try {
      await navigate(sessionId);
      const session = await sessions.get(sessionId);
      await session.page.evaluate(() => {
        const style = document.createElement("style");
        style.textContent = "@keyframes talos-pulse { from { background:#fff; } to { background:#000; } } body { animation: talos-pulse 80ms infinite alternate; }";
        document.head.append(style);
      });

      const screenshot = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/screenshot`,
        headers: ownerHeaders,
      });
      expect(screenshot.statusCode).toBe(200);

      const response = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/hmi/pointer/preflight`,
        headers: ownerHeaders,
        payload: {
          ...pointerPayload(0.2, 0.28),
          expected_frame_sha256: `sha256:${screenshot.json().data.sha256}`,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.frame_sha256).toBe(`sha256:${screenshot.json().data.sha256}`);
    } finally {
      await app.inject({ method: "DELETE", url: `/sessions/${sessionId}`, headers: ownerHeaders });
    }
  });

  it("rejects execution when the visible frame changed after preflight without dispatching the click", async () => {
    const sessionId = await createSession();
    try {
      await navigate(sessionId);
      const inspected = await preflight(sessionId);
      expect(inspected.statusCode).toBe(200);

      const session = await sessions.get(sessionId);
      await session.page.evaluate(() => {
        document.body.style.backgroundColor = "rgb(255, 0, 0)";
      });

      const response = await executePointer(sessionId, executionPayload(inspected.json()), ownerHeaders);

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: "TALOS_BROWSER_FRAME_STALE" });
      expect(await session.page.locator("#cookie-banner").count()).toBe(1);
      expect(session.stateVersion).toBe(1);
    } finally {
      await app.inject({ method: "DELETE", url: `/sessions/${sessionId}`, headers: ownerHeaders });
    }
  });

  it("uses browser-internal hit testing when the page spoofs elementFromPoint", async () => {
    const sessionId = await createSession();
    try {
      await navigate(sessionId);
      const session = await sessions.get(sessionId);
      await session.page.evaluate(() => {
        const forged = document.createElement("button");
        forged.textContent = "Forged target";
        forged.style = "position:fixed;left:799px;top:599px;width:1px;height:1px";
        document.body.append(forged);
        document.elementFromPoint = () => forged;
      });

      const inspected = await preflight(sessionId);

      expect(inspected.statusCode).toBe(200);
      expect(inspected.json().data.target.name).toBe("Reject optional cookies");
    } finally {
      await app.inject({ method: "DELETE", url: `/sessions/${sessionId}`, headers: ownerHeaders });
    }
  });

  it("clicks exactly once and captures the resulting PNG and accessibility snapshot in one state transition", async () => {
    const sessionId = await createSession();
    try {
      await navigate(sessionId);
      const inspected = await preflight(sessionId);
      const target = inspected.json().data.target;

      const response = await executePointer(sessionId, executionPayload(inspected.json()), ownerHeaders);
      const data = response.json().data;

      expect(response.statusCode).toBe(200);
      expect(data).toMatchObject({
        schema_version: "talos_browser_hmi_result_v2",
        session_id: sessionId,
        source_state_version: 1,
        state_version: 2,
        frame_sha256: inspected.json().data.frame_sha256,
        url: fixtureUrl,
        title: "TALOS HMI Fixture",
        screenshot: {
          mime_type: "image/png",
          width: 800,
          height: 600,
        },
        snapshot: {
          format: "accessibility_refs_v1",
        },
      });
      expect(data.capture_id).toMatch(/^cap_[a-f0-9-]+$/);
      expect(data.screenshot.sha256).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(data.screenshot.base64).toMatch(/^[A-Za-z0-9+/]+=*$/);
      expect(data.snapshot.sha256).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(data.snapshot.nodes).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: "Cookie preferences" })]));

      const session = await app.inject({ method: "GET", url: `/sessions/${sessionId}`, headers: ownerHeaders });
      expect(session.json().data.stateVersion).toBe(2);

      const replay = await executePointer(sessionId, executionPayload(inspected.json()), ownerHeaders);
      expect(replay.statusCode).toBe(409);
      expect(replay.json()).toMatchObject({ code: "TALOS_BROWSER_STALE_STATE" });
    } finally {
      await app.inject({ method: "DELETE", url: `/sessions/${sessionId}`, headers: ownerHeaders });
    }
  }, 20_000);

  it("replays the committed result for the same command id and identical request without a second click", async () => {
    const sessionId = await createSession();
    try {
      await navigate(sessionId);
      const session = await sessions.get(sessionId);
      await session.page.evaluate(() => {
        const button = document.createElement("button");
        button.id = "idempotent-action";
        button.textContent = "Idempotent action";
        button.style = "position:fixed;left:0;top:0;width:100px;height:100px;z-index:9999";
        button.onclick = () => {
          const host = window as unknown as { hmiClickCount?: number };
          host.hmiClickCount = (host.hmiClickCount ?? 0) + 1;
        };
        document.body.append(button);
      });
      const inspected = await preflight(sessionId, pointerPayload(0.05, 0.05));
      const payload = executionPayload(
        inspected.json(),
        pointerPayload(0.05, 0.05),
        "sensitive",
        "hmi_cmd_duplicate_same",
      );

      const first = await executePointer(sessionId, payload, ownerHeaders);
      const second = await executePointer(sessionId, payload, ownerHeaders);

      expect(first.statusCode).toBe(200);
      expect(first.json().data.command_id).toBe("hmi_cmd_duplicate_same");
      expect(second.statusCode).toBe(200);
      expect(second.json()).toEqual(first.json());
      expect(await session.page.evaluate(() => (window as unknown as { hmiClickCount?: number }).hmiClickCount)).toBe(1);
      expect(session.stateVersion).toBe(2);
    } finally {
      await app.inject({ method: "DELETE", url: `/sessions/${sessionId}`, headers: ownerHeaders });
    }
  }, 20_000);

  it("fails closed when the same command id is reused with a different request", async () => {
    const sessionId = await createSession();
    try {
      await navigate(sessionId);
      const session = await sessions.get(sessionId);
      await session.page.evaluate(() => {
        const button = document.createElement("button");
        button.id = "conflicting-action";
        button.textContent = "Conflicting action";
        button.style = "position:fixed;left:0;top:0;width:100px;height:100px;z-index:9999";
        button.onclick = () => {
          const host = window as unknown as { hmiClickCount?: number };
          host.hmiClickCount = (host.hmiClickCount ?? 0) + 1;
        };
        document.body.append(button);
      });
      const inspected = await preflight(sessionId, pointerPayload(0.05, 0.05));
      const commandId = "hmi_cmd_duplicate_different";
      const firstPayload = executionPayload(inspected.json(), pointerPayload(0.05, 0.05), "sensitive", commandId);
      const first = await executePointer(sessionId, firstPayload, ownerHeaders);
      expect(first.statusCode).toBe(200);

      const conflict = await executePointer(sessionId, { ...firstPayload, click_count: 2 }, ownerHeaders);

      expect(conflict.statusCode).toBe(409);
      expect(conflict.json()).toMatchObject({
        code: "TALOS_BROWSER_HMI_COMMAND_CONFLICT",
        details: { command_id: commandId },
      });
      expect(await session.page.evaluate(() => (window as unknown as { hmiClickCount?: number }).hmiClickCount)).toBe(1);
      expect(session.stateVersion).toBe(2);
    } finally {
      await app.inject({ method: "DELETE", url: `/sessions/${sessionId}`, headers: ownerHeaders });
    }
  }, 20_000);

  it("replays an ambiguous post-dispatch outcome without dispatching the command again", async () => {
    const sessionId = await createSession();
    try {
      await navigate(sessionId);
      const session = await sessions.get(sessionId);
      await session.page.evaluate(() => {
        const button = document.createElement("button");
        button.id = "ambiguous-action";
        button.textContent = "Ambiguous action";
        button.style = "position:fixed;left:0;top:0;width:100px;height:100px;z-index:9999";
        button.onclick = () => {
          const host = window as unknown as { hmiClickCount?: number };
          host.hmiClickCount = (host.hmiClickCount ?? 0) + 1;
        };
        document.body.append(button);
      });
      const inspected = await preflight(sessionId, pointerPayload(0.05, 0.05));
      const payload = executionPayload(
        inspected.json(),
        pointerPayload(0.05, 0.05),
        "sensitive",
        "hmi_cmd_ambiguous_retry",
      );
      const originalScreenshot = session.page.screenshot.bind(session.page);
      let screenshotCalls = 0;
      Object.defineProperty(session.page, "screenshot", {
        configurable: true,
        value: async (options: Parameters<typeof originalScreenshot>[0]) => {
          screenshotCalls += 1;
          if (screenshotCalls >= 3) return Buffer.alloc(4 * 1024 * 1024 + 1);
          return originalScreenshot(options);
        },
      });

      const first = await executePointer(sessionId, payload, ownerHeaders);
      const retry = await executePointer(sessionId, payload, ownerHeaders);

      expect(first.statusCode).toBe(409);
      expect(first.json()).toMatchObject({
        code: "TALOS_BROWSER_HMI_RECOVERY_REQUIRED",
        details: {
          command_id: "hmi_cmd_ambiguous_retry",
          idempotency_status: "ambiguous",
          state_version: 2,
        },
      });
      expect(retry.statusCode).toBe(409);
      expect(retry.json()).toEqual(first.json());
      expect(await session.page.evaluate(() => (window as unknown as { hmiClickCount?: number }).hmiClickCount)).toBe(1);
      expect(session.stateVersion).toBe(2);
    } finally {
      await app.inject({ method: "DELETE", url: `/sessions/${sessionId}`, headers: ownerHeaders });
    }
  }, 20_000);

  it("waits for a navigated document before attesting final evidence", async () => {
    const sessionId = await createSession();
    try {
      await navigate(sessionId);
      const session = await sessions.get(sessionId);
      await session.page.evaluate(() => {
        const button = document.createElement("button");
        button.textContent = "Reload document";
        button.style = "position:fixed;left:0;top:0;width:160px;height:48px;z-index:9999";
        button.onclick = () => window.location.reload();
        document.body.append(button);
      });
      const inspected = await preflight(sessionId, pointerPayload(0.05, 0.05));
      const response = await executePointer(sessionId, executionPayload(inspected.json(), pointerPayload(0.05, 0.05)), ownerHeaders);

      expect(response.statusCode).toBe(200);
      expect(response.json().data.state_version).toBe(2);
    } finally {
      await app.inject({ method: "DELETE", url: `/sessions/${sessionId}`, headers: ownerHeaders });
    }
  }, 20_000);

  it("rejects a target that changed after preflight without clicking or advancing state", async () => {
    const sessionId = await createSession();
    try {
      await navigate(sessionId);
      const inspected = await preflight(sessionId, pointerPayload(0.6, 0.2066666667));
      expect(inspected.statusCode).toBe(200);

      const session = await sessions.get(sessionId);
      await session.page.locator("#changing-target").evaluate((element) => element.setAttribute("aria-label", "Changed target"));

      const response = await executePointer(sessionId, executionPayload(inspected.json(), pointerPayload(0.6, 0.2066666667)), ownerHeaders);

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: "TALOS_BROWSER_TARGET_STALE" });
      const current = await sessions.get(sessionId);
      expect(current.stateVersion).toBe(1);
    } finally {
      await app.inject({ method: "DELETE", url: `/sessions/${sessionId}`, headers: ownerHeaders });
    }
  });

  it("fails closed when the same node mutates its click handler at dispatch time without sensitive authorization", async () => {
    const sessionId = await createSession();
    try {
      await navigate(sessionId);
      const session = await sessions.get(sessionId);
      await session.page.evaluate(() => {
        const button = document.createElement("button");
        button.id = "dispatch-race";
        button.textContent = "Dispatch race";
        button.style = "position:fixed;left:0;top:0;width:100px;height:100px;z-index:9999";
        button.onclick = () => { document.body.dataset.effect = "original"; };
        button.addEventListener("mousedown", () => {
          button.onclick = () => { document.body.dataset.effect = "mutated"; };
        }, { once: true });
        document.body.append(button);
      });

      const inspected = await preflight(sessionId, pointerPayload(0.05, 0.05));
      expect(inspected.statusCode).toBe(200);
      expect(inspected.json().data.target).toMatchObject({
        effect_attestation: "unattestable",
        required_effect_classification: "sensitive",
      });

      const ordinary = await executePointer(sessionId, executionPayload(inspected.json(), pointerPayload(0.05, 0.05), "ordinary"), ownerHeaders);
      expect(ordinary.statusCode).toBe(403);
      expect(ordinary.json()).toMatchObject({ code: "TALOS_BROWSER_HMI_SENSITIVE_EFFECT_REQUIRED" });

      const unauthorized = executionPayload(inspected.json(), pointerPayload(0.05, 0.05));
      unauthorized.sensitive_effect_authorized = false;
      const sensitive = await executePointer(sessionId, unauthorized, ownerHeaders);
      expect(sensitive.statusCode).toBe(403);
      expect(sensitive.json()).toMatchObject({ code: "TALOS_BROWSER_HMI_SENSITIVE_EFFECT_AUTHORIZATION_REQUIRED" });
      expect(await session.page.locator("body").getAttribute("data-effect")).toBeNull();
      expect(session.stateVersion).toBe(1);
    } finally {
      await app.inject({ method: "DELETE", url: `/sessions/${sessionId}`, headers: ownerHeaders });
    }
  });

  it("rejects a replacement DOM element even when it copies page-visible HMI expandos", async () => {
    const sessionId = await createSession();
    try {
      await navigate(sessionId);
      const inspected = await preflight(sessionId, pointerPayload(0.6, 0.2066666667));
      const session = await sessions.get(sessionId);
      await session.page.locator("#changing-target").evaluate((element) => {
        const replacement = element.cloneNode(true) as HTMLElement;
        for (const key of Reflect.ownKeys(element)) {
          if (typeof key !== "string" || !key.startsWith("__talos_hmi_")) continue;
          const descriptor = Object.getOwnPropertyDescriptor(element, key);
          if (descriptor) Object.defineProperty(replacement, key, descriptor);
        }
        replacement.addEventListener("click", () => { document.body.dataset.spoofed = "yes"; });
        element.replaceWith(replacement);
      });

      const response = await executePointer(sessionId, executionPayload(inspected.json(), pointerPayload(0.6, 0.2066666667)), ownerHeaders);

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: "TALOS_BROWSER_TARGET_STALE" });
      expect((await sessions.get(sessionId)).stateVersion).toBe(1);
      expect(await session.page.locator("body").getAttribute("data-spoofed")).toBeNull();
    } finally {
      await app.inject({ method: "DELETE", url: `/sessions/${sessionId}`, headers: ownerHeaders });
    }
  });

  it("binds the target fingerprint to the full document URL, including history state", async () => {
    const sessionId = await createSession();
    try {
      await navigate(sessionId);
      const inspected = await preflight(sessionId, pointerPayload(0.6, 0.2066666667));
      const session = await sessions.get(sessionId);
      await session.page.evaluate(() => history.pushState({}, "", "#changed-before-execute"));

      const response = await executePointer(sessionId, executionPayload(inspected.json(), pointerPayload(0.6, 0.2066666667)), ownerHeaders);

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: "TALOS_BROWSER_TARGET_STALE" });
      expect(session.stateVersion).toBe(1);
    } finally {
      await app.inject({ method: "DELETE", url: `/sessions/${sessionId}`, headers: ownerHeaders });
    }
  });

  it("rejects a destination query change even when the exposed href stays sanitized", async () => {
    const sessionId = await createSession();
    try {
      await navigate(sessionId);
      const session = await sessions.get(sessionId);
      await session.page.evaluate(() => {
        const link = document.createElement("a");
        link.id = "destination-probe";
        link.href = "https://example.com/reset/secret-path?token=first";
        link.textContent = "Destination probe";
        link.style = "position:fixed;left:0;top:0;width:100px;height:100px;z-index:9999";
        document.body.append(link);
      });
      const inspected = await preflight(sessionId, pointerPayload(0.05, 0.05));
      expect(inspected.json().data.target.href).toBe("https://example.com/reset/secret-path");
      await session.page.locator("#destination-probe").evaluate((element) => {
        (element as HTMLAnchorElement).href = "https://example.com/reset/secret-path?token=second";
      });

      const response = await executePointer(sessionId, executionPayload(inspected.json(), pointerPayload(0.05, 0.05)), ownerHeaders);

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: "TALOS_BROWSER_TARGET_STALE" });
    } finally {
      await app.inject({ method: "DELETE", url: `/sessions/${sessionId}`, headers: ownerHeaders });
    }
  });

  it("inspects the actionable ancestor so nested content cannot hide disabled or submit semantics", async () => {
    const sessionId = await createSession();
    try {
      await navigate(sessionId);
      const inspected = await preflight(sessionId, pointerPayload(0.6, 0.3733333333));

      expect(inspected.statusCode).toBe(200);
      expect(inspected.json().data.target).toMatchObject({
        tag: "button",
        role: "button",
        name: "Disabled nested action",
        is_submit: true,
        disabled: true,
      });

      const denied = await executePointer(sessionId, executionPayload(inspected.json(), pointerPayload(0.6, 0.3733333333)), ownerHeaders);
      expect(denied.statusCode).toBe(403);
      expect(denied.json()).toMatchObject({ code: "TALOS_BROWSER_HMI_TARGET_DENIED" });
      expect((await sessions.get(sessionId)).stateVersion).toBe(1);
    } finally {
      await app.inject({ method: "DELETE", url: `/sessions/${sessionId}`, headers: ownerHeaders });
    }
  });

  it("hard-denies upload and download controls before dispatch", async () => {
    const sessionId = await createSession();
    try {
      await navigate(sessionId);
      const session = await sessions.get(sessionId);
      await session.page.evaluate(() => {
        const upload = document.createElement("input");
        upload.id = "upload-target";
        upload.type = "file";
        upload.style = "position:fixed;left:0;top:0;width:100px;height:100px;z-index:9999";
        const download = document.createElement("a");
        download.id = "download-target";
        download.href = "data:text/plain,blocked";
        download.download = "blocked.txt";
        download.textContent = "Download";
        download.style = "position:fixed;left:120px;top:0;width:100px;height:100px;z-index:9999";
        document.body.append(upload, download);
      });

      const uploadPreflight = await preflight(sessionId, pointerPayload(0.05, 0.05));
      expect(uploadPreflight.statusCode).toBe(200);
      const uploadResponse = await executePointer(sessionId, executionPayload(uploadPreflight.json(), pointerPayload(0.05, 0.05)), ownerHeaders);
      expect(uploadResponse.statusCode).toBe(403);
      expect(uploadResponse.json()).toMatchObject({ code: "TALOS_BROWSER_HMI_UPLOAD_DENIED" });

      const downloadPreflight = await preflight(sessionId, pointerPayload(0.2, 0.05));
      expect(downloadPreflight.statusCode).toBe(200);
      const downloadResponse = await executePointer(sessionId, executionPayload(downloadPreflight.json(), pointerPayload(0.2, 0.05)), ownerHeaders);
      expect(downloadResponse.statusCode).toBe(403);
      expect(downloadResponse.json()).toMatchObject({ code: "TALOS_BROWSER_HMI_DOWNLOAD_DENIED" });
      expect(session.stateVersion).toBe(1);
    } finally {
      await app.inject({ method: "DELETE", url: `/sessions/${sessionId}`, headers: ownerHeaders });
    }
  });

  it("blocks an indirect file chooser activated by a button script", async () => {
    const sessionId = await createSession();
    try {
      await navigate(sessionId);
      const session = await sessions.get(sessionId);
      await session.page.evaluate(() => {
        const upload = document.createElement("input");
        upload.id = "indirect-upload";
        upload.type = "file";
        upload.hidden = true;
        const button = document.createElement("button");
        button.id = "indirect-upload-button";
        button.textContent = "Choose a file";
        button.style = "position:fixed;left:0;top:0;width:100px;height:100px;z-index:9999";
        button.onclick = () => upload.click();
        document.body.append(upload, button);
      });

      const inspected = await preflight(sessionId, pointerPayload(0.05, 0.05));
      const response = await executePointer(sessionId, executionPayload(inspected.json(), pointerPayload(0.05, 0.05)), ownerHeaders);

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({
        code: "TALOS_BROWSER_HMI_RECOVERY_REQUIRED",
        details: { state_version: 2, reason_code: "dispatch_guard_rejected" },
      });
      expect(session.status).toBe("recovery_required");
      expect(await session.page.locator("#indirect-upload").evaluate((element) => (element as HTMLInputElement).files?.length)).toBe(0);
    } finally {
      await app.inject({ method: "DELETE", url: `/sessions/${sessionId}`, headers: ownerHeaders });
    }
  });

  it("classifies named anchor targets and form targets as new contexts", async () => {
    const sessionId = await createSession();
    try {
      await navigate(sessionId);
      const session = await sessions.get(sessionId);
      await session.page.evaluate(() => {
        const named = document.createElement("a");
        named.href = "https://example.com";
        named.target = "report-window";
        named.textContent = "Named target";
        named.style = "position:fixed;left:0;top:0;width:100px;height:100px;z-index:9999";
        const form = document.createElement("form");
        form.action = "https://example.com";
        form.target = "_blank";
        form.style = "position:fixed;left:120px;top:0;width:100px;height:100px;z-index:9999";
        const submit = document.createElement("button");
        submit.type = "submit";
        submit.textContent = "Submit elsewhere";
        submit.style = "width:100%;height:100%";
        form.append(submit);
        document.body.append(named, form);
      });

      const named = await preflight(sessionId, pointerPayload(0.05, 0.05));
      const form = await preflight(sessionId, pointerPayload(0.2, 0.05));
      expect(named.json().data.target.opens_new_context).toBe(true);
      expect(form.json().data.target.opens_new_context).toBe(true);

      for (const [inspected, payload] of [
        [named, pointerPayload(0.05, 0.05)],
        [form, pointerPayload(0.2, 0.05)],
      ] as const) {
        const denied = await executePointer(sessionId, executionPayload(inspected.json(), payload), ownerHeaders);
        expect(denied.statusCode).toBe(403);
        expect(denied.json()).toMatchObject({ code: "TALOS_BROWSER_HMI_NEW_CONTEXT_DENIED" });
      }
      expect(session.stateVersion).toBe(1);
    } finally {
      await app.inject({ method: "DELETE", url: `/sessions/${sessionId}`, headers: ownerHeaders });
    }
  });

  it("accepts an empty post-click snapshot and redacts query secrets from snapshot hrefs", async () => {
    const sessionId = await createSession();
    try {
      await navigate(sessionId);
      const snapshotBefore = await app.inject({ method: "POST", url: `/sessions/${sessionId}/snapshot`, headers: ownerHeaders });
      const sensitiveLink = snapshotBefore.json().data.nodes.find((node: { name: string }) => node.name === "Sensitive query link");
      expect(sensitiveLink.href).toBe("https://example.com");

      const inspected = await preflight(sessionId, pointerPayload(0.2, 0.4733333333));
      const response = await executePointer(sessionId, executionPayload(inspected.json(), pointerPayload(0.2, 0.4733333333)), ownerHeaders);

      expect(response.statusCode).toBe(200);
      expect(response.json().data.snapshot).toMatchObject({ text_digest: "", nodes: [] });
    } finally {
      await app.inject({ method: "DELETE", url: `/sessions/${sessionId}`, headers: ownerHeaders });
    }
  });

  it("exposes canonical safe HTTP href paths, binds effect semantics, and keeps UTF-8 byte bounds strict", async () => {
    const validTarget = {
      tag: "a",
      role: "link",
      name: "Link",
      input_type: null,
      href: "https://example.com",
      form_method: null,
      is_editable: false,
      is_submit: false,
      is_download: false,
      opens_new_context: false,
      effect_attestation: "unattestable",
      required_effect_classification: "sensitive",
      visible: true,
      disabled: false,
      fingerprint: `sha256:${"a".repeat(64)}`,
    };
    expect(BrowserHmiTargetDescriptorSchema.safeParse({ ...validTarget, href: "https://example.com/private-path" }).success).toBe(true);
    expect(BrowserHmiTargetDescriptorSchema.safeParse({ ...validTarget, href: "https://example.com/private-path?token=secret" }).success).toBe(false);
    expect(BrowserHmiTargetDescriptorSchema.safeParse({ ...validTarget, href: "https://example.com/private-path#fragment" }).success).toBe(false);
    expect(BrowserHmiTargetDescriptorSchema.safeParse({ ...validTarget, href: "https://user:secret@example.com/private-path" }).success).toBe(false);
    expect(BrowserHmiTargetDescriptorSchema.safeParse({
      ...validTarget,
      effect_attestation: "browser_default",
    }).success).toBe(false);
    expect(BrowserHmiTargetDescriptorSchema.safeParse({
      ...validTarget,
      required_effect_classification: "ordinary",
    }).success).toBe(false);
    expect(BrowserHmiTargetDescriptorSchema.safeParse({ ...validTarget, name: "界".repeat(256) }).success).toBe(false);
    expect(BrowserHmiTargetDescriptorSchema.safeParse({ ...validTarget, href: `https://example.com/${"界".repeat(700)}` }).success).toBe(false);

    const sessionId = await createSession();
    try {
      await navigate(sessionId);
      const session = await sessions.get(sessionId);
      await session.page.evaluate(() => {
        const scriptLink = document.createElement("a");
        scriptLink.id = "script-link";
        scriptLink.href = "javascript:document.body.dataset.clicked = 'yes'";
        scriptLink.textContent = "Script link";
        scriptLink.style = "position:fixed;left:0;top:0;width:100px;height:100px;z-index:9999";
        document.body.append(scriptLink);
        const unicodeLink = document.createElement("a");
        unicodeLink.href = "https://example.com/private-path-token";
        unicodeLink.textContent = "界".repeat(300);
        unicodeLink.style = "position:fixed;left:120px;top:0;width:100px;height:100px;z-index:9999";
        document.body.append(unicodeLink);
      });

      const scriptPreflight = await preflight(sessionId, pointerPayload(0.05, 0.05));
      expect(scriptPreflight.statusCode).toBe(200);
      expect(scriptPreflight.json().data.target.href).toBeNull();

      const snapshot = await app.inject({ method: "POST", url: `/sessions/${sessionId}/snapshot`, headers: ownerHeaders });
      const unicodeNode = snapshot.json().data.nodes.find((node: { name: string }) => node.name.startsWith("界"));
      expect(Buffer.byteLength(unicodeNode.name, "utf8")).toBeLessThanOrEqual(200);
      expect(unicodeNode.href).toBe("https://example.com");
    } finally {
      await app.inject({ method: "DELETE", url: `/sessions/${sessionId}`, headers: ownerHeaders });
    }
  });

  it("fences every failure after pointer dispatch as recovery-required", async () => {
    const sessionId = await createSession();
    try {
      await navigate(sessionId);
      const inspected = await preflight(sessionId);
      const session = await sessions.get(sessionId);
      const originalScreenshot = session.page.screenshot.bind(session.page);
      let screenshotCalls = 0;
      Object.defineProperty(session.page, "screenshot", {
        configurable: true,
        value: async (options: Parameters<typeof originalScreenshot>[0]) => {
          screenshotCalls += 1;
          if (screenshotCalls >= 3) return Buffer.alloc(4 * 1024 * 1024 + 1);
          return originalScreenshot(options);
        },
      });

      const response = await executePointer(sessionId, executionPayload(inspected.json()), ownerHeaders);

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({
        code: "TALOS_BROWSER_HMI_RECOVERY_REQUIRED",
        details: { state_version: 2 },
      });
      expect((await sessions.get(sessionId)).stateVersion).toBe(2);
    } finally {
      await app.inject({ method: "DELETE", url: `/sessions/${sessionId}`, headers: ownerHeaders });
    }
  });

  it("commits exactly one canonical post-action frame instead of comparing volatile pixels", async () => {
    const sessionId = await createSession();
    try {
      await navigate(sessionId);
      const inspected = await preflight(sessionId);
      const session = await sessions.get(sessionId);
      const originalScreenshot = session.page.screenshot.bind(session.page);
      let screenshotCalls = 0;
      Object.defineProperty(session.page, "screenshot", {
        configurable: true,
        value: async (options: Parameters<typeof originalScreenshot>[0]) => {
          const image = await originalScreenshot(options);
          screenshotCalls += 1;
          if (screenshotCalls === 3) {
            await session.page.evaluate(() => {
              document.documentElement.style.setProperty("--talos-capture-probe", String(performance.now()));
            });
          }
          return screenshotCalls === 4
            ? Buffer.concat([image, Buffer.from([screenshotCalls])])
            : image;
        },
      });

      const response = await executePointer(sessionId, executionPayload(inspected.json()), ownerHeaders);

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toMatchObject({
        state_version: 2,
        target: { name: "Reject optional cookies" },
        screenshot: { mime_type: "image/png" },
      });
      expect(screenshotCalls).toBe(3);
      expect(await session.page.locator("#cookie-banner").count()).toBe(0);
      expect((await sessions.get(sessionId)).status).toBe("active");
    } finally {
      await app.inject({ method: "DELETE", url: `/sessions/${sessionId}`, headers: ownerHeaders });
    }
  });

  it("requires recovery when the DOM changes between post-action screenshot and accessibility capture", async () => {
    const sessionId = await createSession();
    try {
      await navigate(sessionId);
      const inspected = await preflight(sessionId);
      const session = await sessions.get(sessionId);
      const originalScreenshot = session.page.screenshot.bind(session.page);
      let screenshotCalls = 0;
      Object.defineProperty(session.page, "screenshot", {
        configurable: true,
        value: async (options: Parameters<typeof originalScreenshot>[0]) => {
          const image = await originalScreenshot(options);
          screenshotCalls += 1;
          if (screenshotCalls === 3) {
            await session.page.evaluate(() => document.body.setAttribute("data-evidence-race", "changed"));
          }
          return image;
        },
      });

      const response = await executePointer(sessionId, executionPayload(inspected.json()), ownerHeaders);

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({
        code: "TALOS_BROWSER_HMI_RECOVERY_REQUIRED",
        details: { state_version: 2, reason_code: "evidence_frame_changed" },
      });
    } finally {
      await app.inject({ method: "DELETE", url: `/sessions/${sessionId}`, headers: ownerHeaders });
    }
  });

  it("always returns typed recovery after dispatch even when browser cleanup also fails", async () => {
    const sessionId = await createSession();
    try {
      await navigate(sessionId);
      const inspected = await preflight(sessionId);
      const session = await sessions.get(sessionId);
      const originalClick = session.page.mouse.click.bind(session.page.mouse);
      Object.defineProperty(session.page.mouse, "click", {
        configurable: true,
        value: async (...args: Parameters<typeof originalClick>) => {
          await originalClick(...args);
          Object.defineProperty(session.context, "pages", {
            configurable: true,
            value: () => { throw new Error("cleanup-failed"); },
          });
        },
      });

      const response = await executePointer(sessionId, executionPayload(inspected.json()), ownerHeaders);

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({
        code: "TALOS_BROWSER_HMI_RECOVERY_REQUIRED",
        details: { state_version: 2 },
      });
    } finally {
      await app.inject({ method: "DELETE", url: `/sessions/${sessionId}`, headers: ownerHeaders });
    }
  });

  it("closes every popup created by an HMI click and requires recovery", async () => {
    const sessionId = await createSession();
    try {
      await navigate(sessionId);
      const inspected = await preflight(sessionId, pointerPayload(0.6, 0.54));
      const response = await executePointer(sessionId, executionPayload(inspected.json(), pointerPayload(0.6, 0.54)), ownerHeaders);

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: "TALOS_BROWSER_HMI_RECOVERY_REQUIRED" });
      const session = await sessions.get(sessionId);
      expect(session.context.pages()).toEqual([session.page]);
      expect(session.stateVersion).toBe(2);
    } finally {
      await app.inject({ method: "DELETE", url: `/sessions/${sessionId}`, headers: ownerHeaders });
    }
  });

  it("does not report success when a delayed popup opens during the post-action guard", async () => {
    const sessionId = await createSession();
    try {
      await navigate(sessionId);
      const session = await sessions.get(sessionId);
      await session.page.evaluate(() => {
        const button = document.createElement("button");
        button.id = "delayed-popup";
        button.textContent = "Delayed popup";
        button.style = "position:fixed;left:0;top:0;width:100px;height:100px;z-index:9999";
        button.onclick = () => setTimeout(() => window.open("about:blank", "_blank"), 250);
        document.body.append(button);
      });
      const inspected = await preflight(sessionId, pointerPayload(0.05, 0.05));
      const response = await executePointer(sessionId, executionPayload(inspected.json(), pointerPayload(0.05, 0.05)), ownerHeaders);

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({
        code: "TALOS_BROWSER_HMI_RECOVERY_REQUIRED",
        details: { state_version: 2, reason_code: "new_context_opened" },
      });
      expect(session.context.pages()).toEqual([session.page]);
      expect(session.stateVersion).toBe(2);
    } finally {
      await app.inject({ method: "DELETE", url: `/sessions/${sessionId}`, headers: ownerHeaders });
    }
  }, 20_000);

  it.each([
    ["popup", "new_context_opened"],
    ["download", "download_started"],
    ["filechooser", "file_chooser_opened"],
  ] as const)("moves the session to observable recovery when a late %s fires after the action guard", async (effect, reasonCode) => {
    const sessionId = await createSession();
    try {
      await navigate(sessionId);
      const session = await sessions.get(sessionId);
      await session.page.evaluate((lateEffect) => {
        const button = document.createElement("button");
        button.id = "late-effect";
        button.textContent = "Late effect";
        button.style = "position:fixed;left:0;top:0;width:100px;height:100px;z-index:9999";
        button.onclick = () => {
          setTimeout(() => {
            if (lateEffect === "popup") {
              window.open("about:blank", "_blank");
              return;
            }
            if (lateEffect === "download") {
              const anchor = document.createElement("a");
              anchor.href = "data:text/plain,blocked";
              anchor.download = "blocked.txt";
              anchor.click();
              return;
            }
            const upload = document.createElement("input");
            upload.type = "file";
            document.body.append(upload);
            upload.click();
          }, 1_500);
        };
        document.body.append(button);
      }, effect);

      const inspected = await preflight(sessionId, pointerPayload(0.05, 0.05));
      const executed = await executePointer(sessionId, executionPayload(inspected.json(), pointerPayload(0.05, 0.05)), ownerHeaders);
      expect(executed.statusCode).toBe(200);

      await session.page.waitForTimeout(1_750);
      const summary = await app.inject({ method: "GET", url: `/sessions/${sessionId}`, headers: ownerHeaders });
      expect(summary.statusCode).toBe(200);
      expect(summary.json().data).toMatchObject({
        status: "recovery_required",
        stateVersion: 3,
        recovery: {
          code: "TALOS_BROWSER_HMI_RECOVERY_REQUIRED",
          reasonCode,
          stateVersion: 3,
        },
      });

      const fenced = await app.inject({ method: "POST", url: `/sessions/${sessionId}/snapshot`, headers: ownerHeaders });
      expect(fenced.statusCode).toBe(409);
      expect(fenced.json()).toMatchObject({
        code: "TALOS_BROWSER_HMI_RECOVERY_REQUIRED",
        details: { state_version: 3, reason_code: reasonCode },
      });
      expect(session.context.pages()).toEqual([session.page]);
    } finally {
      await app.inject({ method: "DELETE", url: `/sessions/${sessionId}`, headers: ownerHeaders });
    }
  }, 20_000);

  it("requires recovery when the post-click DOM never reaches quiescence", async () => {
    const sessionId = await createSession();
    try {
      await navigate(sessionId);
      const session = await sessions.get(sessionId);
      await session.page.evaluate(() => {
        const button = document.createElement("button");
        button.id = "flapping-dom";
        button.textContent = "Flapping DOM";
        button.style = "position:fixed;left:0;top:0;width:100px;height:100px;z-index:9999";
        button.onclick = () => setInterval(() => button.toggleAttribute("data-flap"), 20);
        document.body.append(button);
      });
      const inspected = await preflight(sessionId, pointerPayload(0.05, 0.05));
      const response = await executePointer(sessionId, executionPayload(inspected.json(), pointerPayload(0.05, 0.05)), ownerHeaders);

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({
        code: "TALOS_BROWSER_HMI_RECOVERY_REQUIRED",
        details: { state_version: 2, reason_code: "quiescence_timeout" },
      });
      expect(session.stateVersion).toBe(2);
    } finally {
      await app.inject({ method: "DELETE", url: `/sessions/${sessionId}`, headers: ownerHeaders });
    }
  }, 20_000);

  it("bounds the legacy screenshot route", async () => {
    const sessionId = await createSession();
    try {
      const session = await sessions.get(sessionId);
      Object.defineProperty(session.page, "screenshot", {
        configurable: true,
        value: async () => Buffer.alloc(4 * 1024 * 1024 + 1),
      });

      const response = await app.inject({ method: "POST", url: `/sessions/${sessionId}/screenshot`, headers: ownerHeaders });
      expect(response.statusCode).toBe(413);
      expect(response.json()).toMatchObject({ code: "TALOS_BROWSER_SCREENSHOT_BOUNDS" });
    } finally {
      await app.inject({ method: "DELETE", url: `/sessions/${sessionId}`, headers: ownerHeaders });
    }
  });

  it("waits for an active session operation before deletion closes the context", async () => {
    const sessionId = await createSession();
    let release!: () => void;
    const gate = new Promise<void>((resolveGate) => { release = resolveGate; });
    let deletionFinished = false;
    const active = sessions.runExclusive(sessionId, async () => gate);
    const deletion = sessions.delete(sessionId).then(() => { deletionFinished = true; });

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
    expect(deletionFinished).toBe(false);
    release();
    await Promise.all([active, deletion]);
    expect(deletionFinished).toBe(true);
  });

  it("fences new operation admission as soon as deletion starts", async () => {
    const sessionId = await createSession();
    const deletion = sessions.delete(sessionId);

    await expect(sessions.runExclusive(sessionId, async () => undefined)).rejects.toMatchObject({
      code: "TALOS_BROWSER_SESSION_CLOSING",
    });
    await deletion;
  });
});
