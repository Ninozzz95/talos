import { createHash } from "node:crypto";
import canonicalize from "canonicalize";
import { BrowserError } from "./BrowserErrors.js";

export function canonicalJson(value: unknown): string {
  try {
    const canonical = canonicalize(value);
    if (canonical === undefined) throw new TypeError("The value has no canonical JSON representation.");
    return canonical;
  } catch {
    throw new BrowserError(
      "The browser action value cannot be represented as canonical JSON.",
      "TALOS_BROWSER_CANONICAL_JSON_INVALID",
      400,
    );
  }
}

export function canonicalSha256(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value), "utf8").digest("hex")}`;
}
