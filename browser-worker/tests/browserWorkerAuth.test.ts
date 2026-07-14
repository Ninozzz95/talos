import { describe, expect, it } from "vitest";
import { assertWorkerTokenConfiguration, isStrongProductionWorkerToken } from "../src/BrowserWorkerAuth.js";

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
});
