import { describe, expect, it } from "vitest";
import { assertWorkerTokenConfiguration, isStrongProductionWorkerToken } from "../src/BrowserWorkerAuth.js";
import { buildServer } from "../src/server.js";

describe("browser worker production token configuration", () => {
  it.each([
    "a".repeat(64),
    "ab".repeat(32),
    "é".repeat(32),
  ])("rejects uniform or low-entropy repeated secrets", (token) => {
    expect(isStrongProductionWorkerToken(token)).toBe(false);
    expect(() => assertWorkerTokenConfiguration(token, "production")).toThrow(
      "128 bits of estimated entropy",
    );
  });

  it("accepts a 32-byte-plus high-entropy secret", () => {
    const token = "0123456789abcdef".repeat(4);
    expect(isStrongProductionWorkerToken(token)).toBe(true);
    expect(() => assertWorkerTokenConfiguration(token, "production")).not.toThrow();
  });

  it("rejects an unauthenticated staging body before JSON parsing", async () => {
    const app = buildServer({ internalToken: "valid-worker-token", runtimeEnvironment: "test" });

    try {
      const response = await app.inject({
        method: "PUT",
        url: "/sessions/brw_auth/files/stage/stg_11111111-1111-4111-8111-111111111111",
        headers: {
          "content-type": "application/json",
          "x-talos-worker-token": "invalid-worker-token",
          "x-talos-owner-ref": "user:auth-test",
        },
        payload: "{malformed-json",
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        message: "Worker token is invalid.",
        code: "TALOS_BROWSER_WORKER_TOKEN_INVALID",
        details: {},
      });
    } finally {
      await app.close();
    }
  });
});
