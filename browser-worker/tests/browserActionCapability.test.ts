import { describe, expect, it } from "vitest";
import { BrowserActionCapabilityVerifier } from "../src/BrowserActionCapability.js";
import { BrowserError } from "../src/BrowserErrors.js";
import {
  createTestActionCapabilityKeypair,
  signTestActionCapability,
} from "./support/browserActionCapability.js";

const nowSeconds = 1_750_000_010;
const expectation = {
  ownerRef: "talos-user:1",
  workerSessionId: "brw_123",
  actionId: "click-123",
  operation: "browser_click",
  preconditionStateVersion: 4,
  request: {
    tool_use_id: "click-123",
    name: "browser_click",
    arguments: { target: "r7", snapshot_id: "snap_123", state_version: 4 },
  },
} as const;

describe("Browser action capability verifier", () => {
  it("accepts one exact ES256 capability and consumes its jti exactly once", async () => {
    const keys = createTestActionCapabilityKeypair();
    const verifier = BrowserActionCapabilityVerifier.forTest(keys.publicKeyPem, keys.keyId, () => nowSeconds);
    const token = await signTestActionCapability(keys, expectation);

    await expect(verifier.verifyAndConsume(`Bearer ${token}`, expectation)).resolves.toMatchObject({
      actionId: expectation.actionId,
      operation: expectation.operation,
      ownerRef: expectation.ownerRef,
      workerSessionId: expectation.workerSessionId,
      preconditionStateVersion: expectation.preconditionStateVersion,
      authorization: { kind: "policy" },
    });
    expect(verifier.descriptor()).toEqual({
      schema_version: "talos.browser.action-capability.v1",
      algorithm: "ES256",
      type: "talos-browser-action+jwt",
      issuer: "urn:talos:control-plane",
      audience: "urn:talos:browser-worker",
      key_id: keys.keyId,
      max_ttl_seconds: 30,
    });

    await expect(verifier.verifyAndConsume(`Bearer ${token}`, expectation)).rejects.toMatchObject({
      code: "TALOS_BROWSER_ACTION_CAPABILITY_REPLAYED",
      statusCode: 409,
    });
  });

  it("rejects missing, malformed, expired, future, wrong-profile, and wrong-key capabilities", async () => {
    const keys = createTestActionCapabilityKeypair();
    const verifier = BrowserActionCapabilityVerifier.forTest(keys.publicKeyPem, keys.keyId, () => nowSeconds);
    const cases = [
      { bearer: undefined, code: "TALOS_BROWSER_ACTION_CAPABILITY_REQUIRED" },
      { bearer: "Basic abc", code: "TALOS_BROWSER_ACTION_CAPABILITY_REQUIRED" },
      { bearer: "Bearer not-a-jwt", code: "TALOS_BROWSER_ACTION_CAPABILITY_INVALID" },
      { bearer: `Bearer ${await signTestActionCapability(keys, expectation, { expiresAt: nowSeconds - 1 })}`, code: "TALOS_BROWSER_ACTION_CAPABILITY_EXPIRED" },
      { bearer: `Bearer ${await signTestActionCapability(keys, expectation, { notBefore: nowSeconds + 5, expiresAt: nowSeconds + 20 })}`, code: "TALOS_BROWSER_ACTION_CAPABILITY_NOT_ACTIVE" },
      { bearer: `Bearer ${await signTestActionCapability(keys, expectation, { type: "JWT" })}`, code: "TALOS_BROWSER_ACTION_CAPABILITY_INVALID" },
      { bearer: `Bearer ${await signTestActionCapability(keys, expectation, { keyId: "other-key" })}`, code: "TALOS_BROWSER_ACTION_CAPABILITY_INVALID" },
    ];

    for (const testCase of cases) {
      await expect(verifier.verifyAndConsume(testCase.bearer, expectation)).rejects.toMatchObject({ code: testCase.code });
    }
  });

  it("binds owner, session, action, operation, state, exact request, and authorization profile", async () => {
    const mismatches = [
      { expectation: { ...expectation, ownerRef: "talos-user:2" }, label: "owner" },
      { expectation: { ...expectation, workerSessionId: "brw_other" }, label: "session" },
      { expectation: { ...expectation, actionId: "click-other" }, label: "action" },
      { expectation: { ...expectation, operation: "hmi_pointer_execute" }, label: "operation" },
      { expectation: { ...expectation, preconditionStateVersion: 5 }, label: "state" },
      { expectation: { ...expectation, request: { ...expectation.request, arguments: { ...expectation.request.arguments, target: "r8" } } }, label: "request" },
    ];

    for (const mismatch of mismatches) {
      const keys = createTestActionCapabilityKeypair();
      const verifier = BrowserActionCapabilityVerifier.forTest(keys.publicKeyPem, keys.keyId, () => nowSeconds);
      const token = await signTestActionCapability(keys, expectation);
      await expect(verifier.verifyAndConsume(`Bearer ${token}`, mismatch.expectation)).rejects.toMatchObject({
        code: "TALOS_BROWSER_ACTION_CAPABILITY_MISMATCH",
        details: { binding: mismatch.label },
      });
    }
  });

  it("fails closed outside tests when public verification material is absent or not P-256", () => {
    expect(() => BrowserActionCapabilityVerifier.fromEnvironment({}, "production")).toThrowError(expect.objectContaining({
      code: "TALOS_BROWSER_ACTION_CAPABILITY_CONFIGURATION_INVALID",
    }));
    expect(() => BrowserActionCapabilityVerifier.forTest("not-a-public-key", "test-key", () => nowSeconds)).toThrowError(BrowserError);
  });
});
