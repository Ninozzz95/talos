import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { fileURLToPath } from "node:url";
import { isAbsolute, relative, resolve } from "node:path";
import ipaddr from "ipaddr.js";
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

  const hostname = normalizeHostname(url.hostname);
  if (hostname === "") throw invalidUrl();
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
  const normalized = normalizeHostname(hostname);
  return normalized === "localhost" || normalized.endsWith(".localhost") || normalized.endsWith(".local") || normalized === "metadata.google.internal";
}

export function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.+$/, "");
}

export function isPrivateOrReservedIp(address: string): boolean {
  try {
    if (!ipaddr.isValid(address)) return true;
    const parsed = ipaddr.parse(address);
    if (parsed.kind() === "ipv6") {
      const ipv6 = parsed as ipaddr.IPv6;
      return (ipv6.isIPv4MappedAddress() ? ipv6.toIPv4Address() : ipv6).range() !== "unicast";
    }
    return parsed.range() !== "unicast";
  } catch {
    return true;
  }
}

function invalidUrl(): BrowserError {
  return new BrowserError("Browser URL is not allowed.", "TALOS_BROWSER_INVALID_NAVIGATION_URL", 400);
}
