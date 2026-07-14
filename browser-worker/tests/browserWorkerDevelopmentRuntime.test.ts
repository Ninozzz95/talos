import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packagePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "package.json",
);

describe("browser worker development runtime", () => {
  it("restarts the worker when source files change", () => {
    const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.dev).toBe("tsx watch src/cli.ts");
    expect(packageJson.scripts?.start).toBe("tsx src/cli.ts");
  });
});
