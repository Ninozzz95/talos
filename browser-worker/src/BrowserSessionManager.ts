import { randomUUID } from "node:crypto";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { BrowserError } from "./BrowserErrors.js";
import { installBrowserRequestPolicy } from "./BrowserUrlPolicy.js";
import { BrowserEgressProxy } from "./BrowserEgressProxy.js";
import type { Capabilities, CreateSessionInput, NavigateInput } from "./schemas.js";

export interface SessionSummary {
  sessionId: string;
  status: "ready" | "active";
  mode: "read_only";
  createdAt: string;
  expiresAt: string;
  viewport: { width: number; height: number };
  capabilities: Capabilities;
}

export interface BrowserSession extends SessionSummary {
  ownerRef: string;
  page: Page;
  context: BrowserContext;
}

export interface BrowserSessionManagerOptions {
  browserFactory?: () => Promise<Browser>;
  now?: () => number;
  cleanupIntervalMs?: number;
  scheduleCleanup?: (callback: () => Promise<void>, intervalMs: number) => unknown;
  cancelCleanup?: (handle: unknown) => void;
  proxyFactory?: () => BrowserEgressProxyLike;
  browserLauncher?: (options: BrowserLaunchOptions) => Promise<Browser>;
}

export interface BrowserLaunchOptions {
  headless: true;
  proxy: { server: string };
  args: string[];
}

export interface BrowserEgressProxyLike {
  readonly serverUrl: string;
  start(): Promise<void>;
  close(): Promise<void>;
}

export class BrowserSessionManager {
  private readonly sessions = new Map<string, BrowserSession>();
  private browserPromise?: Promise<Browser>;
  private readonly browserFactory: () => Promise<Browser>;
  private readonly now: () => number;
  private readonly cancelCleanup: (handle: unknown) => void;
  private cleanupHandle?: unknown;
  private readonly proxyFactory: () => BrowserEgressProxyLike;
  private readonly browserLauncher: (options: BrowserLaunchOptions) => Promise<Browser>;
  private egressProxy?: BrowserEgressProxyLike;

  constructor(options: BrowserSessionManagerOptions = {}) {
    this.browserFactory = options.browserFactory ?? BrowserSessionManager.defaultBrowserFactory;
    this.now = options.now ?? Date.now;
    this.cancelCleanup = options.cancelCleanup ?? ((handle) => clearInterval(handle as NodeJS.Timeout));
    this.proxyFactory = options.proxyFactory ?? (() => new BrowserEgressProxy());
    this.browserLauncher = options.browserLauncher ?? ((launchOptions) => chromium.launch(launchOptions));
    const scheduleCleanup = options.scheduleCleanup ?? ((callback, intervalMs) => setInterval(() => void callback(), intervalMs));
    this.cleanupHandle = scheduleCleanup(() => this.pruneExpired(), options.cleanupIntervalMs ?? 1_000);
  }

  async create(input: CreateSessionInput): Promise<SessionSummary> {
    await this.pruneExpired();
    const browser = await this.getBrowser();
    const context = await browser.newContext({ viewport: input.viewport, acceptDownloads: false, serviceWorkers: "block" });
    await installBrowserRequestPolicy(context);
    const page = await context.newPage();
    page.on("download", (download) => {
      void download.cancel();
    });
    const createdAt = new Date(this.now());
    const session: BrowserSession = {
      ownerRef: input.ownerRef,
      sessionId: `brw_${randomUUID()}`,
      status: "ready",
      mode: "read_only",
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + input.ttlSeconds * 1000).toISOString(),
      viewport: input.viewport,
      capabilities: input.capabilities,
      page,
      context,
    };
    this.sessions.set(session.sessionId, session);
    return this.summary(session);
  }

  async get(sessionId: string): Promise<BrowserSession> {
    await this.pruneExpired();
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new BrowserError("Browser session not found.", "TALOS_BROWSER_SESSION_NOT_FOUND", 404);
    }
    return session;
  }

  async navigate(sessionId: string, input: NavigateInput): Promise<SessionSummary> {
    const session = await this.get(sessionId);
    if (!session.capabilities.navigation) {
      throw new BrowserError("Navigation is not enabled for this session.", "TALOS_BROWSER_CAPABILITY_DENIED", 403);
    }
    const startedAt = Date.now();
    try {
      await session.page.goto(input.url, { waitUntil: input.waitUntil, timeout: input.timeoutMs });
    } catch (error) {
      throw new BrowserError("Browser navigation failed.", "TALOS_BROWSER_NAVIGATION_FAILED", 502, { reason: error instanceof Error ? error.message : "unknown" });
    }

    if (input.waitUntil !== "networkidle") {
      const remainingMilliseconds = input.timeoutMs - (Date.now() - startedAt) - 250;
      if (remainingMilliseconds > 0) {
        await session.page.waitForLoadState("networkidle", {
          timeout: Math.min(4_000, remainingMilliseconds),
        }).catch(() => undefined);
      }
    }
    session.status = "active";
    return this.summary(session);
  }

  async delete(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.sessions.delete(sessionId);
    await session.context.close();
  }

  async close(): Promise<void> {
    if (this.cleanupHandle !== undefined) {
      this.cancelCleanup(this.cleanupHandle);
      this.cleanupHandle = undefined;
    }
    await Promise.all([...this.sessions.keys()].map((sessionId) => this.delete(sessionId)));
    const browserPromise = this.browserPromise;
    this.browserPromise = undefined;
    let closeError: unknown;
    if (browserPromise) {
      try {
        const browser = await browserPromise;
        await browser.close();
      } catch (error) {
        closeError = error;
      }
    }
    const proxy = this.egressProxy;
    this.egressProxy = undefined;
    if (proxy) {
      try {
        await proxy.close();
      } catch (error) {
        closeError ??= error;
      }
    }
    if (closeError) throw closeError;
  }

  private async pruneExpired(): Promise<void> {
    const expiredIds = [...this.sessions.values()]
      .filter((session) => Date.parse(session.expiresAt) <= this.now())
      .map((session) => session.sessionId);
    await Promise.all(expiredIds.map((sessionId) => this.delete(sessionId)));
  }

  private async getBrowser(): Promise<Browser> {
    if (this.browserPromise) return this.browserPromise;
    if (this.browserFactory !== BrowserSessionManager.defaultBrowserFactory) {
      this.browserPromise = this.browserFactory();
      try {
        return await this.browserPromise;
      } catch (error) {
        this.browserPromise = undefined;
        throw error;
      }
    }
    this.egressProxy = this.proxyFactory();
    try {
      await this.egressProxy.start();
      this.browserPromise = this.browserLauncher({ headless: true, proxy: { server: this.egressProxy.serverUrl }, args: ["--host-resolver-rules=EXCLUDE 127.0.0.1, MAP * ~NOTFOUND"] });
      return await this.browserPromise;
    } catch (error) {
      this.browserPromise = undefined;
      const proxy = this.egressProxy;
      this.egressProxy = undefined;
      await proxy.close().catch(() => undefined);
      throw error;
    }
  }

  private static readonly defaultBrowserFactory = () => chromium.launch({ headless: true });

  private summary(session: BrowserSession): SessionSummary {
    const { ownerRef: _ownerRef, page: _page, context: _context, ...summary } = session;
    return summary;
  }
}
