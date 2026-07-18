import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Browser presentation boundary", () => {
  it("BREG-027 remains self-contained under the production tsx transform", () => {
    const result = spawnSync(
      process.execPath,
      [
        resolve("node_modules/tsx/dist/cli.mjs"),
        resolve("tests/support/tsxPresentationBoundaryProbe.ts"),
      ],
      {
        cwd: resolve("."),
        encoding: "utf8",
        timeout: 20_000,
      },
    );

    expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(0);
  }, 25_000);
});
