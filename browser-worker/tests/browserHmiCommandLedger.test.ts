import { describe, expect, it } from "vitest";
import { BrowserError } from "../src/BrowserErrors.js";
import { BrowserHmiCommandLedger } from "../src/BrowserHmiCommandLedger.js";

describe("Browser HMI command ledger", () => {
  it("allows an exact request to reclaim after a pre-dispatch rejection", () => {
    const ledger = new BrowserHmiCommandLedger();
    const commandId = "hmi_cmd_pre_dispatch_retry";
    const requestSha256 = "sha256:exact-request";
    const rejection = new BrowserError("Target became stale.", "TALOS_BROWSER_TARGET_STALE", 409);

    expect(ledger.claim(commandId, requestSha256)).toEqual({ kind: "new" });
    expect(ledger.rejectIfPending(commandId, rejection)).toEqual(rejection);
    expect(() => ledger.claim(commandId, "sha256:different-request")).toThrowError(expect.objectContaining({
      code: "TALOS_BROWSER_HMI_COMMAND_CONFLICT",
    }));
    expect(ledger.claim(commandId, requestSha256)).toEqual({ kind: "new" });
  });
});
