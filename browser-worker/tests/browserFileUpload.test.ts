import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { BrowserActionCapabilityVerifier } from "../src/BrowserActionCapability.js";
import { canonicalJson } from "../src/BrowserCanonicalJson.js";
import { BrowserFileStagingStore } from "../src/BrowserFileStagingStore.js";
import { BrowserSessionManager } from "../src/BrowserSessionManager.js";
import { buildServer } from "../src/server.js";
import { createTestActionCapabilityKeypair, signTestActionCapability } from "./support/browserActionCapability.js";

const fixtureUrl = new URL(`file://${resolve("tests/fixtures/file-upload-page.html").replaceAll("\\", "/")}`).href;
const ownerHeaders = { "x-talos-worker-token": "upload-worker-token", "x-talos-owner-ref": "user:41" };
const otherOwnerHeaders = { "x-talos-worker-token": "upload-worker-token", "x-talos-owner-ref": "user:99" };
const actionKeys = createTestActionCapabilityKeypair("upload-action-key");
const actionNowSeconds = 1_750_000_010;
const sessions = new BrowserSessionManager();
const staging = new BrowserFileStagingStore();
const app = buildServer({
  sessions,
  fileStaging: staging,
  internalToken: "upload-worker-token",
  runtimeEnvironment: "test",
  actionCapabilityVerifier: BrowserActionCapabilityVerifier.forTest(
    actionKeys.publicKeyPem,
    actionKeys.keyId,
    () => actionNowSeconds,
  ),
});

afterAll(async () => app.close());

function digest(bytes: Buffer): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function canonicalDigest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value), "utf8").digest("hex")}`;
}

function stageIdentity(value: number): string {
  return `stg_00000000-0000-4000-8000-${value.toString(16).padStart(12, "0")}`;
}

function stagePayload(bytes: Buffer, name = "evidence.txt") {
  return {
    file_id: "01900000-0000-7000-8000-000000000041",
    name,
    mime_type: "text/plain",
    size_bytes: bytes.byteLength,
    sha256: digest(bytes),
    base64: bytes.toString("base64"),
  };
}

describe("BrowserFileStagingStore", () => {
  it("binds staged bytes to owner and session and consumes them exactly once", () => {
    const bytes = Buffer.from("verified staging fixture", "utf8");
    const store = new BrowserFileStagingStore({ now: () => 1_000, ttlMs: 5_000 });
    const staged = store.stage("user:1", "brw_one", stageIdentity(1), stagePayload(bytes));

    expect(() => store.takeMany("user:2", "brw_one", [staged.stage_id])).toThrowError(/not available/i);
    const [consumed] = store.takeMany("user:1", "brw_one", [staged.stage_id]);
    expect(consumed).toMatchObject({ fileId: stagePayload(bytes).file_id, name: "evidence.txt", mimeType: "text/plain" });
    expect(consumed?.bytes.equals(bytes)).toBe(true);
    expect(() => store.takeMany("user:1", "brw_one", [staged.stage_id])).toThrowError(/not available/i);
  });

  it("rejects traversal names, hash mismatches, expiry and overbroad batches", () => {
    let now = 5_000;
    const bytes = Buffer.from("bounded", "utf8");
    const store = new BrowserFileStagingStore({ now: () => now, ttlMs: 1_000 });

    expect(() => store.stage("user:1", "brw_one", stageIdentity(2), stagePayload(bytes, "../secret.txt"))).toThrowError(/metadata/i);
    expect(() => store.stage("user:1", "brw_one", stageIdentity(3), { ...stagePayload(bytes), sha256: `sha256:${"0".repeat(64)}` })).toThrowError(/digest/i);

    const staged = store.stage("user:1", "brw_one", stageIdentity(4), stagePayload(bytes));
    now += 1_001;
    expect(() => store.takeMany("user:1", "brw_one", [staged.stage_id])).toThrowError(/expired|not available/i);
    expect(() => store.takeMany("user:1", "brw_one", ["a", "b", "c", "d", "e"])).toThrowError(/between 1 and 4/i);
  });

  it("preserves accepted file names without normalization", () => {
    const bytes = Buffer.from("exact file name", "utf8");
    const originalName = " evidence.txt ";
    const store = new BrowserFileStagingStore({ now: () => 7_000, ttlMs: 5_000 });

    const staged = store.stage("user:1", "brw_exact_name", stageIdentity(9), stagePayload(bytes, originalName));
    expect(staged.name).toBe(originalName);
    const [consumed] = store.takeMany("user:1", "brw_exact_name", [staged.stage_id]);
    expect(consumed?.name).toBe(originalName);
    store.release(consumed ? [consumed] : []);
  });

  it("zeroizes consumed staged buffers before release and on every store cleanup path", () => {
    let now = 10_000;
    const store = new BrowserFileStagingStore({ now: () => now, ttlMs: 1_000 });
    const fillSpy = vi.spyOn(Buffer.prototype, "fill");

    try {
      const consumedStage = store.stage("user:1", "brw_consume", stageIdentity(5), stagePayload(Buffer.from("consume secret", "utf8")));
      const consumed = store.takeMany("user:1", "brw_consume", [consumedStage.stage_id]);
      expect(consumed[0]?.bytes.toString("utf8")).toBe("consume secret");
      fillSpy.mockClear();
      store.release(consumed);
      expect([...consumed[0]!.bytes]).toEqual(new Array(consumed[0]!.sizeBytes).fill(0));
      expect(fillSpy).toHaveBeenCalledWith(0);

      store.stage("user:1", "brw_discard", stageIdentity(6), stagePayload(Buffer.from("discard secret", "utf8")));
      fillSpy.mockClear();
      store.discardSession("user:1", "brw_discard");
      expect(fillSpy).toHaveBeenCalledWith(0);

      store.stage("user:1", "brw_expire", stageIdentity(7), stagePayload(Buffer.from("expiry secret", "utf8")));
      now += 1_001;
      fillSpy.mockClear();
      store.sweepExpired();
      expect(fillSpy).toHaveBeenCalledWith(0);

      store.stage("user:1", "brw_shutdown", stageIdentity(8), stagePayload(Buffer.from("shutdown secret", "utf8")));
      fillSpy.mockClear();
      store.clear();
      expect(fillSpy).toHaveBeenCalledWith(0);
    } finally {
      fillSpy.mockRestore();
    }
  });
});

describe("canonical Browser file upload", () => {
  it("stages one caller-addressed resource idempotently and rejects conflicting reuse", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/sessions",
      headers: ownerHeaders,
      payload: {
        ownerRef: "user:41",
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
          uploads: true,
        },
      },
    });
    expect(created.statusCode).toBe(201);
    const sessionId = created.json().data.sessionId as string;
    const stageId = "stg_11111111-1111-4111-8111-111111111111";
    const bytes = Buffer.from("caller-addressed staging", "utf8");

    try {
      const first = await app.inject({
        method: "PUT",
        url: `/sessions/${sessionId}/files/stage/${stageId}`,
        headers: ownerHeaders,
        payload: stagePayload(bytes, "idempotent.txt"),
      });
      const replay = await app.inject({
        method: "PUT",
        url: `/sessions/${sessionId}/files/stage/${stageId}`,
        headers: ownerHeaders,
        payload: stagePayload(bytes, "idempotent.txt"),
      });
      const conflict = await app.inject({
        method: "PUT",
        url: `/sessions/${sessionId}/files/stage/${stageId}`,
        headers: ownerHeaders,
        payload: stagePayload(Buffer.from("different", "utf8"), "different.txt"),
      });

      expect(first.statusCode).toBe(201);
      expect(replay.statusCode).toBe(200);
      expect(first.json().data).toEqual(replay.json().data);
      expect(first.json().data.stage_id).toBe(stageId);
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json()).toMatchObject({ code: "TALOS_BROWSER_STAGED_FILE_CONFLICT" });
      const retained = staging.takeMany("user:41", sessionId, [stageId]);
      expect(retained).toHaveLength(1);
      staging.release(retained);
    } finally {
      await app.inject({ method: "DELETE", url: `/sessions/${sessionId}`, headers: ownerHeaders });
    }
  }, 30_000);

  it("deletes a staged resource idempotently without disclosing cross-owner existence", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/sessions",
      headers: ownerHeaders,
      payload: {
        ownerRef: "user:41",
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
          uploads: true,
        },
      },
    });
    expect(created.statusCode).toBe(201);
    const sessionId = created.json().data.sessionId as string;

    try {
      const bytes = Buffer.from("idempotent deletion", "utf8");
      const stageId = stageIdentity(101);
      const staged = await app.inject({
        method: "PUT",
        url: `/sessions/${sessionId}/files/stage/${stageId}`,
        headers: ownerHeaders,
        payload: stagePayload(bytes, "delete-me.txt"),
      });
      expect(staged.statusCode).toBe(201);
      expect(staged.json().data.stage_id).toBe(stageId);

      const foreign = await app.inject({
        method: "DELETE",
        url: `/sessions/${sessionId}/files/stage/${stageId}`,
        headers: otherOwnerHeaders,
      });
      expect(foreign.statusCode).toBe(403);
      const retainedAfterForeignAttempt = staging.takeMany("user:41", sessionId, [stageId]);
      expect(retainedAfterForeignAttempt).toHaveLength(1);
      staging.release(retainedAfterForeignAttempt);

      const replacementId = stageIdentity(102);
      const replacement = await app.inject({
        method: "PUT",
        url: `/sessions/${sessionId}/files/stage/${replacementId}`,
        headers: ownerHeaders,
        payload: stagePayload(bytes, "delete-me.txt"),
      });
      expect(replacement.json().data.stage_id).toBe(replacementId);
      const released = await app.inject({
        method: "DELETE",
        url: `/sessions/${sessionId}/files/stage/${replacementId}`,
        headers: ownerHeaders,
      });
      const repeated = await app.inject({
        method: "DELETE",
        url: `/sessions/${sessionId}/files/stage/${replacementId}`,
        headers: ownerHeaders,
      });

      expect(released.statusCode).toBe(204);
      expect(repeated.statusCode).toBe(204);
      expect(released.body).toBe("");
      expect(repeated.body).toBe("");
      expect(() => staging.takeMany("user:41", sessionId, [replacementId])).toThrowError(/not available/i);
    } finally {
      await app.inject({ method: "DELETE", url: `/sessions/${sessionId}`, headers: ownerHeaders });
    }
  }, 30_000);

  it("consumes approved staged files when upload preflight fails", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/sessions",
      headers: ownerHeaders,
      payload: {
        ownerRef: "user:41",
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
          uploads: true,
        },
      },
    });
    expect(created.statusCode).toBe(201);
    const sessionId = created.json().data.sessionId as string;
    const stagedIds: string[] = [];
    const releaseSpy = vi.spyOn(staging, "release");

    try {
      for (const [index, suffix] of ["a", "b", "c", "d"].entries()) {
        const bytes = Buffer.from(`approved preflight ${suffix}`, "utf8");
        const stageId = stageIdentity(201 + index);
        const staged = await app.inject({
          method: "PUT",
          url: `/sessions/${sessionId}/files/stage/${stageId}`,
          headers: ownerHeaders,
          payload: stagePayload(bytes, `${suffix}.txt`),
        });
        expect(staged.statusCode).toBe(201);
        expect(staged.json().data.stage_id).toBe(stageId);
        stagedIds.push(stageId);
      }

      const args = {
        target: "r1",
        element: "Upload document",
        staged_file_ids: [stagedIds[0]],
        snapshot_id: "snap_stale-approved-attempt",
        state_version: 1,
      };
      const request = { tool_use_id: "upload-stale-approved", name: "browser_file_upload", arguments: args };
      const approved = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/tools/call`,
        headers: {
          ...ownerHeaders,
          authorization: `Bearer ${await signTestActionCapability(actionKeys, {
            ownerRef: "user:41",
            workerSessionId: sessionId,
            actionId: request.tool_use_id,
            operation: request.name,
            preconditionStateVersion: args.state_version,
            request,
          }, {
            attestation: {
              kind: "user_approval",
              approval_id: "approval-upload-stale-approved",
              approval_request_sha256: `sha256:${"a".repeat(64)}`,
              execution_lease_sha256: `sha256:${"b".repeat(64)}`,
            },
          })}`,
        },
        payload: request,
      });

      expect(approved.statusCode).toBe(200);
      expect(approved.json()).toMatchObject({
        isError: true,
        structuredContent: { code: "TALOS_BROWSER_STALE_STATE" },
      });
      expect(releaseSpy).toHaveBeenCalledTimes(1);
      const released = releaseSpy.mock.calls[0]?.[0];
      expect(released).toHaveLength(1);
      expect([...(released?.[0]?.bytes ?? [])]).toEqual(new Array(released?.[0]?.sizeBytes ?? 0).fill(0));
      expect(() => staging.takeMany("user:41", sessionId, [stagedIds[0]!])).toThrowError(/not available/i);

      const replacement = Buffer.from("replacement after controlled rejection", "utf8");
      const replacementId = stageIdentity(205);
      const restaged = await app.inject({
        method: "PUT",
        url: `/sessions/${sessionId}/files/stage/${replacementId}`,
        headers: ownerHeaders,
        payload: stagePayload(replacement, "replacement.txt"),
      });
      expect(restaged.statusCode).toBe(201);
    } finally {
      releaseSpy.mockRestore();
      await app.inject({ method: "DELETE", url: `/sessions/${sessionId}`, headers: ownerHeaders });
    }
  }, 30_000);

  it("STAGE2B-BREG-017 stages owned bytes and preserves canonical snapshot evidence after approved upload", async () => {
    const tools = await app.inject({ method: "GET", url: "/tools", headers: ownerHeaders });
    expect(tools.json().data.tools.map((tool: { name: string }) => tool.name)).toContain("browser_file_upload");

    const created = await app.inject({
      method: "POST",
      url: "/sessions",
      headers: ownerHeaders,
      payload: {
        ownerRef: "user:41",
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
          uploads: true,
        },
      },
    });
    expect(created.statusCode).toBe(201);
    const sessionId = created.json().data.sessionId as string;

    const call = async (toolUseId: string, name: string, args: Record<string, unknown>, authorize = false) => {
      const request = { tool_use_id: toolUseId, name, arguments: args };
      const headers = authorize ? {
        ...ownerHeaders,
        authorization: `Bearer ${await signTestActionCapability(actionKeys, {
          ownerRef: "user:41",
          workerSessionId: sessionId,
          actionId: toolUseId,
          operation: name,
          preconditionStateVersion: args.state_version as number,
          request,
        }, {
          attestation: {
            kind: "user_approval",
            approval_id: `approval-${toolUseId}`,
            approval_request_sha256: `sha256:${"a".repeat(64)}`,
            execution_lease_sha256: `sha256:${"b".repeat(64)}`,
          },
        })}`,
      } : ownerHeaders;
      return app.inject({ method: "POST", url: `/sessions/${sessionId}/tools/call`, headers, payload: request });
    };

    try {
      expect((await call("upload-nav", "browser_navigate", { url: fixtureUrl })).json().isError).toBe(false);
      const snapshot = (await call("upload-snapshot", "browser_snapshot", { state_version: 1 })).json().structuredContent;
      const target = snapshot.nodes.find((node: { name: string }) => node.name === "Upload document");
      expect(target).toEqual(expect.objectContaining({ ref: expect.stringMatching(/^r\d+$/) }));

      const bytes = Buffer.from("TALOS staged payload", "utf8");
      const stagedId = stageIdentity(301);
      const stagedResponse = await app.inject({
        method: "PUT",
        url: `/sessions/${sessionId}/files/stage/${stagedId}`,
        headers: ownerHeaders,
        payload: stagePayload(bytes),
      });
      expect(stagedResponse.statusCode).toBe(201);
      expect(stagedResponse.json().data.stage_id).toBe(stagedId);
      expect(JSON.stringify(stagedResponse.json())).not.toContain(bytes.toString("base64"));

      const foreignStage = await app.inject({
        method: "PUT",
        url: `/sessions/${sessionId}/files/stage/${stageIdentity(302)}`,
        headers: otherOwnerHeaders,
        payload: stagePayload(bytes),
      });
      expect(foreignStage.statusCode).toBe(403);

      const args = {
        target: target.ref,
        element: "Upload document",
        staged_file_ids: [stagedId],
        snapshot_id: snapshot.snapshot_id,
        state_version: 1,
      };
      const unsigned = await call("upload-unsigned", "browser_file_upload", args);
      expect(unsigned.statusCode).toBe(401);
      expect(unsigned.json()).toMatchObject({ code: "TALOS_BROWSER_ACTION_CAPABILITY_REQUIRED" });

      const uploaded = await call("upload-approved", "browser_file_upload", args, true);
      const result = uploaded.json();
      expect(uploaded.statusCode).toBe(200);
      expect(result).toMatchObject({
        schema_version: "talos_tool_result_v1",
        isError: false,
        structuredContent: {
          state_version: 2,
          target: { ref: target.ref, name: "Upload document" },
          files: [{ file_id: stagePayload(bytes).file_id, name: "evidence.txt", size_bytes: bytes.byteLength, sha256: digest(bytes) }],
          screenshot: { mime_type: "image/png" },
          snapshot: { format: "accessibility_refs_v1" },
        },
        evidence: [
          expect.objectContaining({ kind: "screenshot" }),
          expect.objectContaining({ kind: "snapshot" }),
        ],
      });
      expect(result.structuredContent.snapshot.text_digest).toContain("evidence.txt|TALOS staged payload");
      expect(result.structuredContent.url).toBe("about:blank");
      expect(JSON.stringify(result)).not.toContain(bytes.toString("base64"));
      expect(JSON.stringify(result)).not.toMatch(/file:\/\/\/|[A-Za-z]:[\\/]|\/(?:home|tmp|Users)\//i);
      const uploadedSnapshot = result.structuredContent.snapshot;
      const uploadedSnapshotHash = canonicalDigest({
        schema_version: "talos_browser_tool_snapshot_evidence_v1",
        snapshot_id: uploadedSnapshot.snapshot_id,
        format: uploadedSnapshot.format,
        text_digest: uploadedSnapshot.text_digest,
        nodes: uploadedSnapshot.nodes,
      });
      expect(uploadedSnapshot.sha256).toBe(uploadedSnapshotHash);
      expect(result.evidence.find((item: { kind: string }) => item.kind === "snapshot")?.sha256).toBe(uploadedSnapshotHash);

      const readAfterUpload = (await call("upload-read-after", "browser_read", {
        ref: uploadedSnapshot.nodes[0].ref,
        snapshot_id: uploadedSnapshot.snapshot_id,
        state_version: 2,
      })).json();
      expect(readAfterUpload).toMatchObject({
        isError: false,
        structuredContent: { snapshot_id: uploadedSnapshot.snapshot_id },
      });
      expect(readAfterUpload.evidence.find((item: { kind: string }) => item.kind === "snapshot")?.sha256).toBe(uploadedSnapshotHash);

      const currentTarget = result.structuredContent.snapshot.nodes.find((node: { name: string }) => node.name === "Upload document");
      const reused = await call("upload-reused", "browser_file_upload", {
        ...args,
        target: currentTarget.ref,
        snapshot_id: result.structuredContent.snapshot.snapshot_id,
        state_version: 2,
      }, true);
      expect(reused.statusCode).toBe(200);
      expect(reused.json()).toMatchObject({ isError: true, structuredContent: { code: "TALOS_BROWSER_STAGED_FILE_NOT_FOUND" } });
    } finally {
      await app.inject({ method: "DELETE", url: `/sessions/${sessionId}`, headers: ownerHeaders });
    }
  }, 30_000);

  it("binds upload bytes directly to the approved snapshot target", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/sessions",
      headers: ownerHeaders,
      payload: {
        ownerRef: "user:41",
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
          uploads: true,
        },
      },
    });
    expect(created.statusCode).toBe(201);
    const sessionId = created.json().data.sessionId as string;

    const call = async (toolUseId: string, name: string, args: Record<string, unknown>, authorize = false) => {
      const request = { tool_use_id: toolUseId, name, arguments: args };
      const headers = authorize ? {
        ...ownerHeaders,
        authorization: `Bearer ${await signTestActionCapability(actionKeys, {
          ownerRef: "user:41",
          workerSessionId: sessionId,
          actionId: toolUseId,
          operation: name,
          preconditionStateVersion: args.state_version as number,
          request,
        }, {
          attestation: {
            kind: "user_approval",
            approval_id: `approval-${toolUseId}`,
            approval_request_sha256: `sha256:${"a".repeat(64)}`,
            execution_lease_sha256: `sha256:${"b".repeat(64)}`,
          },
        })}`,
      } : ownerHeaders;

      return app.inject({ method: "POST", url: `/sessions/${sessionId}/tools/call`, headers, payload: request });
    };

    try {
      const navigated = await call("divert-nav", "browser_navigate", { url: `${fixtureUrl}#redirect-chooser` });
      expect(navigated.json().isError).toBe(false);
      const snapshot = (await call("divert-snapshot", "browser_snapshot", { state_version: 1 })).json().structuredContent;
      const target = snapshot.nodes.find((node: { name: string }) => node.name === "Upload document");
      expect(target).toEqual(expect.objectContaining({ ref: expect.stringMatching(/^r\d+$/) }));

      const bytes = Buffer.from("must remain bound to approved input", "utf8");
      const stagedId = stageIdentity(303);
      const staged = await app.inject({
        method: "PUT",
        url: `/sessions/${sessionId}/files/stage/${stagedId}`,
        headers: ownerHeaders,
        payload: stagePayload(bytes, " approved-only.txt "),
      });
      expect(staged.statusCode).toBe(201);

      const response = await call("divert-upload", "browser_file_upload", {
        target: target.ref,
        element: "Upload document",
        staged_file_ids: [stagedId],
        snapshot_id: snapshot.snapshot_id,
        state_version: 1,
      }, true);

      const session = await sessions.get(sessionId);
      const assignedFileCounts = await session.page.locator("input[type=file]").evaluateAll((elements) => (
        elements.map((element) => (element as HTMLInputElement).files?.length ?? 0)
      ));
      expect(assignedFileCounts).toEqual([1, 0]);
      expect(await session.page.evaluate(() => (window as unknown as { diversionAttempts?: number }).diversionAttempts ?? 0)).toBe(0);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        isError: false,
        structuredContent: {
          state_version: 2,
          target: { ref: target.ref, name: "Upload document" },
          files: [{ name: " approved-only.txt ", size_bytes: bytes.byteLength, sha256: digest(bytes) }],
        },
      });
      expect(response.json().structuredContent.snapshot.text_digest).toContain(" approved-only.txt |must remain bound to approved input");
      expect(() => staging.takeMany("user:41", sessionId, [stagedId])).toThrowError(/not available/i);
    } finally {
      await app.inject({ method: "DELETE", url: `/sessions/${sessionId}`, headers: ownerHeaders });
    }
  }, 30_000);
});
