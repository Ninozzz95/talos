import { randomUUID } from "node:crypto";
import { chromium, type Browser, type BrowserContext, type Download, type FileChooser, type Page } from "playwright";
import { BrowserError } from "./BrowserErrors.js";
import { installBrowserRequestPolicy } from "./BrowserUrlPolicy.js";
import { BrowserEgressProxy } from "./BrowserEgressProxy.js";
import type { BrowserSnapshotResult } from "./BrowserSnapshot.js";
import { BrowserHmiCommandLedger } from "./BrowserHmiCommandLedger.js";
import type { Capabilities, CreateSessionInput, NavigateInput } from "./schemas.js";
import type { BrowserRuntimeDescriptor } from "./BrowserWorkerProtocol.js";
import { BrowserActionLedger } from "./BrowserActionLedger.js";

export interface SessionSummary {
  sessionId: string;
  status: "ready" | "active" | "recovery_required";
  mode: "read_only";
  createdAt: string;
  expiresAt: string;
  viewport: { width: number; height: number };
  capabilities: Capabilities;
  recovery?: BrowserSessionRecovery;
}

export interface BrowserSessionRecovery {
  code: "TALOS_BROWSER_HMI_RECOVERY_REQUIRED";
  reasonCode: string;
  detectedAt: string;
  stateVersion: number;
}

export interface BrowserSession extends SessionSummary {
  ownerRef: string;
  page: Page;
  context: BrowserContext;
  stateVersion: number;
  latestSnapshot?: { stateVersion: number; value: BrowserSnapshotResult };
  singlePageViolation: boolean;
  hmiIdentityKey: string;
  singlePageGuard?: (page: Page) => void;
  downloadGuard?: (download: Download) => void;
  fileChooserGuard?: (fileChooser: FileChooser) => void;
  hmiCommands: BrowserHmiCommandLedger;
  actionLedger: BrowserActionLedger;
  hmiDispatchFenceStateVersion?: number;
}

interface OperationState {
  tail: Promise<void>;
  closing: boolean;
  closePromise?: Promise<void>;
}

interface SessionCreateClaim {
  fingerprint: string;
  promise: Promise<SessionSummary>;
  sessionId?: string;
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
  private readonly operationStates = new Map<string, OperationState>();
  private readonly pendingCreates = new Set<Promise<void>>();
  private readonly createClaims = new Map<string, SessionCreateClaim>();
  private browserPromise?: Promise<Browser>;
  private closePromise?: Promise<void>;
  private accepting = true;
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

  async create(input: CreateSessionInput, idempotencyKey?: string): Promise<SessionSummary> {
    if (idempotencyKey === undefined) return this.createFresh(input);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(idempotencyKey)) {
      throw new BrowserError("Browser session idempotency key is invalid.", "TALOS_BROWSER_IDEMPOTENCY_KEY_INVALID", 400);
    }

    const claimKey = `${input.ownerRef}\u0000${idempotencyKey.toLowerCase()}`;
    const fingerprint = createSessionFingerprint(input);
    const existing = this.createClaims.get(claimKey);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new BrowserError(
          "Browser session idempotency key was already used for another create intent.",
          "TALOS_BROWSER_SESSION_IDEMPOTENCY_CONFLICT",
          422,
        );
      }
      const replay = await existing.promise;
      if (this.sessions.has(replay.sessionId)) return replay;
      if (this.createClaims.get(claimKey) === existing) this.createClaims.delete(claimKey);
      return this.create(input, idempotencyKey);
    }

    const claim: SessionCreateClaim = {
      fingerprint,
      promise: this.createFresh(input),
    };
    this.createClaims.set(claimKey, claim);
    try {
      const session = await claim.promise;
      claim.sessionId = session.sessionId;
      return session;
    } catch (error) {
      if (this.createClaims.get(claimKey) === claim) this.createClaims.delete(claimKey);
      throw error;
    }
  }

  private async createFresh(input: CreateSessionInput): Promise<SessionSummary> {
    this.assertAccepting();
    let completeCreate!: () => void;
    const pendingCreate = new Promise<void>((resolve) => { completeCreate = resolve; });
    this.pendingCreates.add(pendingCreate);
    try {
      await this.pruneExpired();
      this.assertAccepting();
      const browser = await this.getBrowser();
      this.assertAccepting();
      const context = await browser.newContext({ viewport: input.viewport, acceptDownloads: false, serviceWorkers: "block" });
      try {
        this.assertAccepting();
        await installBrowserRequestPolicy(context);
        this.assertAccepting();
        const page = await context.newPage();
        this.assertAccepting();
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
          stateVersion: 0,
          page,
          context,
          singlePageViolation: false,
          hmiIdentityKey: `__talos_hmi_${randomUUID().replaceAll("-", "")}`,
          hmiCommands: new BrowserHmiCommandLedger(),
          actionLedger: new BrowserActionLedger(),
        };
        this.installSessionTripwires(session);
        this.sessions.set(session.sessionId, session);
        return this.summary(session);
      } catch (error) {
        await context.close().catch(() => undefined);
        throw error;
      }
    } finally {
      this.pendingCreates.delete(pendingCreate);
      completeCreate();
    }
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
    this.assertOperationalSession(session);
    session.status = "active";
    session.stateVersion += 1;
    return this.summary(session);
  }

  assertState(sessionId: string, expectedStateVersion: number | undefined): BrowserSession {
    const session = this.sessions.get(sessionId);
    if (!session) throw new BrowserError("Browser session not found.", "TALOS_BROWSER_SESSION_NOT_FOUND", 404);
    if (expectedStateVersion !== undefined && expectedStateVersion !== session.stateVersion) {
      throw new BrowserError("Browser state is stale.", "TALOS_BROWSER_STALE_STATE", 409, {
        expected_state_version: expectedStateVersion,
        state_version: session.stateVersion,
      });
    }
    return session;
  }

  assertSinglePage(sessionId: string): BrowserSession {
    const session = this.sessions.get(sessionId);
    if (!session) throw new BrowserError("Browser session not found.", "TALOS_BROWSER_SESSION_NOT_FOUND", 404);
    const hasUnexpectedPage = session.context.pages().some((page) => page !== session.page);
    if (session.singlePageViolation || hasUnexpectedPage) {
      this.markSessionRecovery(session, "new_context_opened", session.hmiDispatchFenceStateVersion);
      this.assertOperationalSession(session);
    }
    return session;
  }

  assertOperational(sessionId: string): BrowserSession {
    const session = this.sessions.get(sessionId);
    if (!session) throw new BrowserError("Browser session not found.", "TALOS_BROWSER_SESSION_NOT_FOUND", 404);
    this.assertOperationalSession(session);
    return session;
  }

  markRecoveryRequired(sessionId: string, reasonCode: string, minimumStateVersion?: number): BrowserSession {
    const session = this.sessions.get(sessionId);
    if (!session) throw new BrowserError("Browser session not found.", "TALOS_BROWSER_SESSION_NOT_FOUND", 404);
    this.markSessionRecovery(session, reasonCode, minimumStateVersion);
    return session;
  }

  armHmiDispatchFence(sessionId: string, stateVersion: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) throw new BrowserError("Browser session not found.", "TALOS_BROWSER_SESSION_NOT_FOUND", 404);
    session.hmiDispatchFenceStateVersion = stateVersion;
  }

  clearHmiDispatchFence(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) session.hmiDispatchFenceStateVersion = undefined;
  }

  async recordSnapshot(sessionId: string, value: BrowserSnapshotResult): Promise<BrowserSession> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new BrowserError("Browser session not found.", "TALOS_BROWSER_SESSION_NOT_FOUND", 404);
    this.assertOperationalSession(session);
    const previous = session.latestSnapshot?.value;
    session.latestSnapshot = { stateVersion: session.stateVersion, value };
    await this.disposeSnapshot(previous);
    return session;
  }

  snapshot(sessionId: string): { stateVersion: number; value: BrowserSnapshotResult } | undefined {
    return this.sessions.get(sessionId)?.latestSnapshot;
  }

  async runExclusive<T>(
    sessionId: string,
    operation: (session: BrowserSession) => Promise<T>,
    options: { allowRecovery?: boolean } = {},
  ): Promise<T> {
    const existing = this.operationStates.get(sessionId);
    if (existing?.closing) {
      throw new BrowserError("The browser session is closing.", "TALOS_BROWSER_SESSION_CLOSING", 409);
    }
    const previous = existing?.tail ?? Promise.resolve();
    let release!: () => void;
    const turn = new Promise<void>((resolveTurn) => {
      release = resolveTurn;
    });
    const tail = previous.then(() => turn);
    this.operationStates.set(sessionId, { tail, closing: false });
    await previous;

    try {
      const session = await this.get(sessionId);
      if (!options.allowRecovery) {
        this.assertOperationalSession(session);
        this.assertSinglePage(sessionId);
      }
      const result = await operation(session);
      if (!options.allowRecovery) this.assertOperationalSession(session);
      return result;
    } finally {
      release();
      if (this.operationStates.get(sessionId)?.tail === tail) {
        this.operationStates.delete(sessionId);
      }
    }
  }

  advanceState(sessionId: string): BrowserSession {
    const session = this.sessions.get(sessionId);
    if (!session) throw new BrowserError("Browser session not found.", "TALOS_BROWSER_SESSION_NOT_FOUND", 404);
    this.assertOperationalSession(session);
    session.stateVersion += 1;
    return session;
  }

  recordAutomationMutation(sessionId: string): BrowserSession {
    const session = this.advanceState(sessionId);
    session.status = "active";
    return session;
  }

  async assertRuntimeReady(): Promise<void> {
    await this.runtimeDescriptor();
  }

  async runtimeDescriptor(): Promise<BrowserRuntimeDescriptor> {
    const browser = await this.getBrowser();
    if (!browser.isConnected()) {
      throw new Error("Chromium runtime is not connected.");
    }
    const version = browser.version().trim();
    if (version.length === 0 || version.length > 128) {
      throw new Error("Chromium runtime returned an invalid version.");
    }

    return { engine: "chromium", version };
  }

  async delete(sessionId: string): Promise<void> {
    const state = this.operationStates.get(sessionId) ?? { tail: Promise.resolve(), closing: true };
    if (state.closePromise) return state.closePromise;
    state.closing = true;
    this.operationStates.set(sessionId, state);
    state.closePromise = (async () => {
      await state.tail;
      await this.disposeSession(sessionId, state);
    })();

    return state.closePromise;
  }

  async cancel(sessionId: string, reason: string): Promise<void> {
    const normalizedReason = reason.trim();
    if (normalizedReason.length === 0 || normalizedReason.length > 512
        || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(normalizedReason)) {
      throw new BrowserError("Browser cancellation reason is invalid.", "TALOS_BROWSER_INVALID_CANCELLATION", 400);
    }
    const state = this.operationStates.get(sessionId) ?? { tail: Promise.resolve(), closing: true };
    if (state.closePromise) return state.closePromise;
    state.closing = true;
    this.operationStates.set(sessionId, state);
    state.closePromise = this.disposeSession(sessionId, state, normalizedReason);

    return state.closePromise;
  }

  private async disposeSession(sessionId: string, state: OperationState, reason?: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      if (this.operationStates.get(sessionId) === state) this.operationStates.delete(sessionId);
      return;
    }
    session.hmiCommands.clear();
    session.actionLedger.clear();
    await this.disposeSnapshot(session.latestSnapshot?.value);
    session.latestSnapshot = undefined;
    if (session.singlePageGuard && typeof session.context.off === "function") session.context.off("page", session.singlePageGuard);
    if (session.downloadGuard && typeof session.page.off === "function") session.page.off("download", session.downloadGuard);
    if (session.fileChooserGuard && typeof session.page.off === "function") session.page.off("filechooser", session.fileChooserGuard);
    try {
      await session.context.close(reason === undefined ? undefined : { reason });
    } finally {
      if (this.sessions.get(sessionId) === session) this.sessions.delete(sessionId);
      if (this.operationStates.get(sessionId) === state) this.operationStates.delete(sessionId);
      for (const [claimKey, claim] of this.createClaims) {
        if (claim.sessionId === sessionId) this.createClaims.delete(claimKey);
      }
    }
  }

  close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.accepting = false;
    const failures: unknown[] = [];
    if (this.cleanupHandle !== undefined) {
      const cleanupHandle = this.cleanupHandle;
      try {
        this.cancelCleanup(cleanupHandle);
      } catch (error) {
        failures.push(error);
      } finally {
        if (this.cleanupHandle === cleanupHandle) this.cleanupHandle = undefined;
      }
    }
    this.closePromise = this.finishClose(failures);
    return this.closePromise;
  }

  private async finishClose(failures: unknown[]): Promise<void> {
    await Promise.all([...this.pendingCreates]);
    await Promise.all([...this.sessions.keys()].map(async (sessionId) => {
      try {
        await this.delete(sessionId);
      } catch (error) {
        failures.push(error);
      }
    }));
    const browserPromise = this.browserPromise;
    if (browserPromise) {
      try {
        const browser = await browserPromise;
        await browser.close();
      } catch (error) {
        failures.push(error);
      } finally {
        if (this.browserPromise === browserPromise) this.browserPromise = undefined;
      }
    }
    const proxy = this.egressProxy;
    if (proxy) {
      try {
        await proxy.close();
      } catch (error) {
        failures.push(error);
      } finally {
        if (this.egressProxy === proxy) this.egressProxy = undefined;
      }
    }
    if (failures.length > 0) throw failures[0];
  }

  private async pruneExpired(): Promise<void> {
    const expiredIds = [...this.sessions.values()]
      .filter((session) => Date.parse(session.expiresAt) <= this.now() && !this.operationStates.has(session.sessionId))
      .map((session) => session.sessionId);
    await Promise.all(expiredIds.map((sessionId) => this.delete(sessionId)));
  }

  private async getBrowser(): Promise<Browser> {
    this.assertAccepting();
    if (this.browserPromise) {
      const browser = await this.browserPromise;
      this.assertAccepting();
      return browser;
    }
    if (this.browserFactory !== BrowserSessionManager.defaultBrowserFactory) {
      const initialization = this.browserFactory();
      this.browserPromise = initialization;
      let browser: Browser;
      try {
        browser = await initialization;
      } catch (error) {
        if (this.browserPromise === initialization) this.browserPromise = undefined;
        throw error;
      }
      this.assertAccepting();
      return browser;
    }
    const proxy = this.proxyFactory();
    this.egressProxy = proxy;
    const initialization = (async () => {
      try {
        await proxy.start();
        this.assertAccepting();
        return await this.browserLauncher({
          headless: true,
          proxy: { server: proxy.serverUrl },
          args: [
            "--host-resolver-rules=EXCLUDE 127.0.0.1, MAP * ~NOTFOUND",
            "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
          ],
        });
      } catch (error) {
        try {
          await proxy.close();
        } catch {
          // Preserve the initialization failure while still attempting proxy cleanup.
        } finally {
          if (this.egressProxy === proxy) this.egressProxy = undefined;
        }
        throw error;
      }
    })();
    this.browserPromise = initialization;
    let browser: Browser;
    try {
      browser = await initialization;
    } catch (error) {
      if (this.browserPromise === initialization) this.browserPromise = undefined;
      throw error;
    }
    this.assertAccepting();
    return browser;
  }

  private assertAccepting(): void {
    if (!this.accepting) {
      throw new BrowserError("The browser worker is shutting down.", "TALOS_BROWSER_WORKER_SHUTTING_DOWN", 503);
    }
  }

  private static readonly defaultBrowserFactory = () => chromium.launch({ headless: true });

  private summary(session: BrowserSession): SessionSummary {
    const {
      ownerRef: _ownerRef,
      page: _page,
      context: _context,
      latestSnapshot: _latestSnapshot,
      singlePageViolation: _singlePageViolation,
      hmiIdentityKey: _hmiIdentityKey,
      singlePageGuard: _singlePageGuard,
      downloadGuard: _downloadGuard,
      fileChooserGuard: _fileChooserGuard,
      hmiCommands: _hmiCommands,
      actionLedger: _actionLedger,
      hmiDispatchFenceStateVersion: _hmiDispatchFenceStateVersion,
      ...summary
    } = session;
    return summary;
  }

  private installSessionTripwires(session: BrowserSession): void {
    if (typeof session.context.on === "function") {
      const listener = (page: Page) => {
        if (page === session.page) return;
        session.singlePageViolation = true;
        this.markSessionRecovery(session, "new_context_opened", session.hmiDispatchFenceStateVersion);
        void page.close().catch(() => undefined);
      };
      session.singlePageGuard = listener;
      session.context.on("page", listener);
    }
    if (typeof session.page.on === "function") {
      const downloadListener = (download: Download) => {
        this.markSessionRecovery(session, "download_started", session.hmiDispatchFenceStateVersion);
        void download.cancel().catch(() => undefined);
      };
      const fileChooserListener = (fileChooser: FileChooser) => {
        this.markSessionRecovery(session, "file_chooser_opened", session.hmiDispatchFenceStateVersion);
        void fileChooser.setFiles([]).catch(() => undefined);
      };
      session.downloadGuard = downloadListener;
      session.fileChooserGuard = fileChooserListener;
      session.page.on("download", downloadListener);
      session.page.on("filechooser", fileChooserListener);
    }
  }

  private markSessionRecovery(session: BrowserSession, reasonCode: string, minimumStateVersion?: number): void {
    if (session.recovery) return;
    session.stateVersion = minimumStateVersion === undefined
      ? session.stateVersion + 1
      : Math.max(session.stateVersion, minimumStateVersion);
    session.status = "recovery_required";
    const previousSnapshot = session.latestSnapshot?.value;
    session.latestSnapshot = undefined;
    void this.disposeSnapshot(previousSnapshot);
    session.recovery = {
      code: "TALOS_BROWSER_HMI_RECOVERY_REQUIRED",
      reasonCode,
      detectedAt: new Date(this.now()).toISOString(),
      stateVersion: session.stateVersion,
    };
  }

  private assertOperationalSession(session: BrowserSession): void {
    if (!session.recovery) return;
    throw new BrowserError("The browser session requires recovery before more operations can run.", session.recovery.code, 409, {
      state_version: session.recovery.stateVersion,
      reason_code: session.recovery.reasonCode,
      detected_at: session.recovery.detectedAt,
    });
  }

  private async disposeSnapshot(snapshot: BrowserSnapshotResult | undefined): Promise<void> {
    if (!snapshot?.refBindings) return;
    await Promise.all([...snapshot.refBindings.values()].map((binding) => binding.dispose().catch(() => undefined)));
  }
}

function createSessionFingerprint(input: CreateSessionInput): string {
  return JSON.stringify({
    ownerRef: input.ownerRef,
    mode: input.mode,
    viewport: { width: input.viewport.width, height: input.viewport.height },
    ttlSeconds: input.ttlSeconds,
    capabilities: {
      navigation: input.capabilities.navigation,
      screenshots: input.capabilities.screenshots,
      accessibilitySnapshot: input.capabilities.accessibilitySnapshot,
      actions: input.capabilities.actions,
      hmiActions: input.capabilities.hmiActions ?? false,
      downloads: input.capabilities.downloads,
      uploads: input.capabilities.uploads,
    },
  });
}
