import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { fileURLToPath } from "node:url";
import { isAbsolute, relative, resolve } from "node:path";
import type { BrowserContext, Route } from "playwright";
import { BrowserError } from "./BrowserErrors.js";

const FIXTURE_ROOT = resolve(process.cwd(), "tests", "fixtures");

export async function assertAllowedBrowserUrl(value: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw invalidUrl();
  }

  if (url.protocol === "file:") {
    if (isAllowedFixturePath(url)) return;
    throw invalidUrl();
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw invalidUrl();

  const hostname = url.hostname.toLowerCase();
  if (isReservedHostname(hostname)) throw invalidUrl();
  let addresses: Array<{ address: string }>;
  try {
    addresses = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true });
  } catch {
    throw invalidUrl();
  }
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateOrReservedIp(address))) throw invalidUrl();
}

export async function installBrowserRequestPolicy(context: BrowserContext): Promise<void> {
  await context.route("**/*", async (route: Route) => {
    try {
      await assertAllowedBrowserUrl(route.request().url());
      await route.continue();
    } catch {
      await route.abort("blockedbyclient");
    }
  });
}

function isAllowedFixturePath(url: URL): boolean {
  try {
    const pathFromRoot = relative(FIXTURE_ROOT, fileURLToPath(url));
    return pathFromRoot.length > 0 && !pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot);
  } catch {
    return false;
  }
}

export function isReservedHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname === "metadata.google.internal";
}

export function isPrivateOrReservedIp(address: string): boolean {
  const mappedIpv4 = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mappedIpv4) return isPrivateOrReservedIp(mappedIpv4);
  if (isIP(address) === 4) {
    const octets = address.split(".").map(Number);
    const [first, second, third] = octets;
    return first === 0 || first === 10 || first === 127 || first >= 224 || (first === 100 && second >= 64 && second <= 127) || (first === 169 && second === 254) || (first === 172 && second >= 16 && second <= 31) || (first === 192 && (second === 0 || second === 168)) || (first === 192 && second === 2) || (first === 198 && (second === 18 || second === 19 || second === 51)) || (first === 203 && second === 0 && third === 113);
  }
  const normalized = address.toLowerCase();
  return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb") || normalized.startsWith("ff");
}

function invalidUrl(): BrowserError {
  return new BrowserError("Browser URL is not allowed.", "TALOS_BROWSER_INVALID_NAVIGATION_URL", 400);
}
