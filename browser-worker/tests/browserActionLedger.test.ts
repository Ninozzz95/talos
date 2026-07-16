import { describe, expect, it } from "vitest";
import { BrowserActionLedger } from "../src/BrowserActionLedger.js";
import { BrowserError } from "../src/BrowserErrors.js";

const readInput = {
  actionId: "read-1",
  idempotencyKey: "read-1",
  operation: "browser_snapshot",
  preconditionStateVersion: 3,
  request: { name: "browser_snapshot", arguments: { state_version: 3 } },
  consequential: false,
} as const;

describe("Browser action ledger", () => {
  it("replays an exact committed read with a stable RFC 8785 outcome digest", () => {
    const ledger = new BrowserActionLedger();
    const result = { ok: true, nested: { z: 1, a: 2 } };

    expect(ledger.claim(readInput)).toEqual({ kind: "new" });
    ledger.markDispatched(readInput.idempotencyKey);
    const committed = ledger.commit(readInput.idempotencyKey, result);

    expect(committed).toMatchObject({
      action_id: readInput.actionId,
      idempotency_key: readInput.idempotencyKey,
      operation: readInput.operation,
      precondition_state_version: 3,
      status: "committed",
      outcome_sha256: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    });
    expect(ledger.claim({ ...readInput, request: { arguments: { state_version: 3 }, name: "browser_snapshot" } })).toEqual({
      kind: "result",
      result,
      outcomeSha256: committed.outcome_sha256,
    });
    expect(ledger.size).toBe(1);
  });

  it("rejects the same identity with changed action bindings", () => {
    const changes = [
      { ...readInput, actionId: "read-other" },
      { ...readInput, operation: "browser_read" },
      { ...readInput, preconditionStateVersion: 4 },
      { ...readInput, request: { name: "browser_snapshot", arguments: { state_version: 4 } } },
    ];

    for (const changed of changes) {
      const ledger = new BrowserActionLedger();
      ledger.claim(readInput);
      expect(() => ledger.claim(changed)).toThrowError(expect.objectContaining({
        code: "TALOS_BROWSER_ACTION_CONFLICT",
        statusCode: 409,
      }));
    }
  });

  it("fences an ambiguous consequential dispatch and never permits a second effect", () => {
    const ledger = new BrowserActionLedger();
    const click = { ...readInput, actionId: "click-1", idempotencyKey: "click-1", operation: "browser_click", consequential: true };
    ledger.claim(click);
    ledger.markDispatched(click.idempotencyKey);
    const recovery = ledger.markAmbiguous(
      click.idempotencyKey,
      new BrowserError("Outcome unknown.", "TALOS_BROWSER_ACTION_RECOVERY_REQUIRED", 409),
    );

    expect(recovery).toMatchObject({ code: "TALOS_BROWSER_ACTION_RECOVERY_REQUIRED" });
    expect(ledger.claim(click)).toMatchObject({
      kind: "error",
      error: { code: "TALOS_BROWSER_ACTION_RECOVERY_REQUIRED" },
    });
  });

  it("allows an exact pre-dispatch rejection to retry but fails closed at bounded retention", () => {
    const ledger = new BrowserActionLedger(1, 16 * 1024 * 1024);
    ledger.claim(readInput);
    ledger.rejectIfPending(readInput.idempotencyKey, new BrowserError("Denied.", "DENIED", 403));
    expect(ledger.claim(readInput)).toEqual({ kind: "new" });

    const second = { ...readInput, actionId: "read-2", idempotencyKey: "read-2" };
    expect(() => ledger.claim(second)).toThrowError(expect.objectContaining({
      code: "TALOS_BROWSER_ACTION_RETENTION_EXHAUSTED",
      statusCode: 429,
    }));
  });
});
