import { createHash, randomUUID } from "node:crypto";
import type { Page, Request } from "playwright";
import { BrowserError } from "./BrowserErrors.js";
import { captureCanonicalBrowserFrame } from "./BrowserFrameCapture.js";
import {
  currentMainDocumentIdentity,
  dispatchGuardedBrowserClick,
  inspectBrowserTarget,
  type BrowserHmiTargetAttestation,
} from "./BrowserHmiAttestation.js";
import {
  BrowserHmiPreflightResponseSchema,
  BrowserHmiResultResponseSchema,
  BrowserHmiTargetDescriptorSchema,
  type BrowserHmiExecuteRequest,
  type BrowserHmiPreflightRequest,
  type BrowserHmiPreflightResponse,
  type BrowserHmiResultResponse,
  type BrowserHmiTargetDescriptor,
} from "./BrowserHmiContracts.js";
import { captureSnapshot } from "./BrowserSnapshot.js";
import { BrowserSessionManager, type BrowserSession } from "./BrowserSessionManager.js";

type TargetFacts = Omit<BrowserHmiTargetDescriptor, "fingerprint">;
type InspectedTarget = { target: BrowserHmiTargetDescriptor; attestation: BrowserHmiTargetAttestation };

const HMI_QUIESCENCE_TIMEOUT_MS = 1_000;
const HMI_QUIESCENCE_STABLE_MS = 100;
const HMI_QUIESCENCE_POLL_MS = 25;
const HMI_POST_ACTION_GUARD_MS = 400;

export class BrowserHmiService {
  constructor(private readonly sessions: BrowserSessionManager) {}

  async preflight(sessionId: string, input: BrowserHmiPreflightRequest): Promise<BrowserHmiPreflightResponse> {
    return this.sessions.runExclusive(sessionId, async (session) => {
      this.assertCapability(session);
      this.sessions.assertState(sessionId, input.state_version);
      const frameSha256 = sha256(await captureCanonicalBrowserFrame(session.page));
      if (frameSha256 !== input.expected_frame_sha256) {
        throw new BrowserError("The visible browser frame changed before preflight.", "TALOS_BROWSER_FRAME_STALE", 409, {
          state_version: session.stateVersion,
        });
      }
      const point = this.point(session, input.normalized_x, input.normalized_y);
      const { target } = await this.inspectedTarget(session, input.state_version, frameSha256, point);

      return BrowserHmiPreflightResponseSchema.parse({
        schema_version: "talos_browser_hmi_preflight_v2",
        interaction_id: input.interaction_id,
        session_id: sessionId,
        state_version: session.stateVersion,
        frame_sha256: frameSha256,
        origin: safeOrigin(session.page.url()),
        point,
        target,
      });
    });
  }

  async execute(sessionId: string, input: BrowserHmiExecuteRequest): Promise<BrowserHmiResultResponse> {
    const { command_id: _commandId, ...idempotentRequest } = input;
    const requestSha256 = sha256(canonicalJson(idempotentRequest));
    let claimedSession: BrowserSession | undefined;
    try {
      return await this.sessions.runExclusive(sessionId, async (session) => {
      const claim = session.hmiCommands.claim(input.command_id, requestSha256);
      if (claim.kind === "result") return claim.result;
      if (claim.kind === "error") throw claim.error;
      claimedSession = session;
      this.sessions.assertOperational(sessionId);
      this.assertCapability(session);
      this.sessions.assertState(sessionId, input.state_version);
      const sourceStateVersion = session.stateVersion;
      const sourceFrameSha256 = sha256(await captureCanonicalBrowserFrame(session.page));
      if (sourceFrameSha256 !== input.expected_frame_sha256) {
        throw new BrowserError("The visible browser frame changed before execution.", "TALOS_BROWSER_FRAME_STALE", 409, {
          state_version: session.stateVersion,
        });
      }
      const point = this.point(session, input.normalized_x, input.normalized_y);
      const { target } = await this.inspectedTarget(session, sourceStateVersion, sourceFrameSha256, point);

      if (target.fingerprint !== input.expected_fingerprint) {
        throw new BrowserError("The browser target changed before execution.", "TALOS_BROWSER_TARGET_STALE", 409, {
          state_version: session.stateVersion,
        });
      }
      if (!target.visible || target.disabled) {
        throw new BrowserError("The browser target cannot be interacted with.", "TALOS_BROWSER_HMI_TARGET_DENIED", 403, {
          state_version: session.stateVersion,
        });
      }
      if (target.opens_new_context) {
        throw new BrowserError("Opening a new browser context is not enabled for HMI interactions.", "TALOS_BROWSER_HMI_NEW_CONTEXT_DENIED", 403, {
          state_version: session.stateVersion,
        });
      }
      if (target.input_type === "file") {
        throw new BrowserError("File upload controls are not enabled for HMI interactions.", "TALOS_BROWSER_HMI_UPLOAD_DENIED", 403, {
          state_version: session.stateVersion,
        });
      }
      if (target.is_download) {
        throw new BrowserError("Download controls are not enabled for HMI interactions.", "TALOS_BROWSER_HMI_DOWNLOAD_DENIED", 403, {
          state_version: session.stateVersion,
        });
      }
      if (target.required_effect_classification === "sensitive"
        && input.effect_classification !== "sensitive") {
        throw new BrowserError("This browser effect cannot be attested as an ordinary action.", "TALOS_BROWSER_HMI_SENSITIVE_EFFECT_REQUIRED", 403, {
          state_version: session.stateVersion,
          required_effect_classification: target.required_effect_classification,
        });
      }
      if (input.effect_classification === "sensitive"
        && input.sensitive_effect_authorized !== true) {
        throw new BrowserError("Sensitive browser effect authorization is required.", "TALOS_BROWSER_HMI_SENSITIVE_EFFECT_AUTHORIZATION_REQUIRED", 403, {
          state_version: session.stateVersion,
          required_effect_classification: target.required_effect_classification,
        });
      }

      const baselinePages = new Set(session.context.pages());
      if (baselinePages.size !== 1 || !baselinePages.has(session.page)) {
        throw new BrowserError("The browser context is not eligible for HMI interaction.", "TALOS_BROWSER_HMI_CONTEXT_INVALID", 409, {
          state_version: session.stateVersion,
        });
      }
      const openedPages = new Set<Page>();
      let downloadObserved = false;
      let fileChooserObserved = false;
      const pageListener = (page: Page) => {
        if (!baselinePages.has(page)) openedPages.add(page);
      };
      const downloadListener = () => { downloadObserved = true; };
      const fileChooserListener = () => { fileChooserObserved = true; };
      session.context.on("page", pageListener);
      session.page.on("download", downloadListener);
      session.page.on("filechooser", fileChooserListener);
      let effectDispatched = false;
      let quiescence: QuiescenceTracker | undefined;
      const domProbeKey = `${session.hmiIdentityKey}_quiescence`;
      try {
        quiescence = createQuiescenceTracker(session.page);
        await installDomProbe(session.page, domProbeKey);
        const immediateFrameSha256 = sha256(await captureCanonicalBrowserFrame(session.page));
        if (immediateFrameSha256 !== sourceFrameSha256) {
          throw new BrowserError("The visible browser frame changed before pointer dispatch.", "TALOS_BROWSER_FRAME_STALE", 409, {
            state_version: session.stateVersion,
          });
        }
        const immediateTarget = await this.inspectedTarget(session, sourceStateVersion, immediateFrameSha256, point);
        if (immediateTarget.target.fingerprint !== target.fingerprint) {
          throw new BrowserError("The browser target changed before pointer dispatch.", "TALOS_BROWSER_TARGET_STALE", 409, {
            state_version: session.stateVersion,
          });
        }
        await dispatchGuardedBrowserClick(session.page, point, immediateTarget.attestation, {
          button: input.button,
          clickCount: input.click_count,
          effectClassification: input.effect_classification,
          onDispatch: () => {
            this.sessions.armHmiDispatchFence(sessionId, sourceStateVersion + 1);
            session.hmiCommands.markDispatched(input.command_id);
            effectDispatched = true;
          },
        });
        const current = session.recovery ? session : this.sessions.advanceState(sessionId);
        if (current.recovery) throw new Error(current.recovery.reasonCode);
        await quiescence.waitFor(current.page, domProbeKey);
        await guardPostActionContext(current, baselinePages, openedPages, () => downloadObserved, () => current.recovery?.reasonCode);

        for (const page of current.context.pages()) {
          if (!baselinePages.has(page)) openedPages.add(page);
        }
        if (openedPages.size > 0) {
          throw new Error("new_context_opened");
        }
        if (downloadObserved) throw new Error("download_started");
        this.sessions.assertSinglePage(sessionId);

        const mutationCountBeforeCapture = await readEvidenceDomProbe(current.page, domProbeKey);
        const documentBeforeCapture = await currentMainDocumentIdentity(current.page);
        await suppressCapturePresentationMutations(current.page, domProbeKey, true);
        let screenshot: Buffer;
        try {
          screenshot = await captureCanonicalBrowserFrame(current.page);
        } finally {
          await suppressCapturePresentationMutations(current.page, domProbeKey, false);
        }
        const snapshot = await captureSnapshot(current.page);
        const documentAfterCapture = await currentMainDocumentIdentity(current.page);
        const mutationCountAfterCapture = await readEvidenceDomProbe(current.page, domProbeKey);
        if (mutationCountBeforeCapture === null
          || mutationCountBeforeCapture !== mutationCountAfterCapture
          || documentBeforeCapture.frameId !== documentAfterCapture.frameId
          || documentBeforeCapture.loaderId !== documentAfterCapture.loaderId
          || documentBeforeCapture.url !== documentAfterCapture.url) {
          throw new Error("evidence_frame_changed");
        }
        this.sessions.assertOperational(sessionId);
        this.sessions.recordSnapshot(sessionId, snapshot);
        const snapshotValue = {
          snapshot_id: snapshot.snapshotId,
          format: snapshot.format,
          text_digest: snapshot.textDigest,
          nodes: snapshot.nodes,
        };

        const result = BrowserHmiResultResponseSchema.parse({
          schema_version: "talos_browser_hmi_result_v2",
          capture_id: `cap_${randomUUID()}`,
          interaction_id: input.interaction_id,
          command_id: input.command_id,
          session_id: sessionId,
          source_state_version: sourceStateVersion,
          state_version: current.stateVersion,
          frame_sha256: sourceFrameSha256,
          url: safeEvidenceUrl(current.page.url()),
          title: boundedUtf8(await current.page.title(), 512),
          effect_classification: input.effect_classification,
          sensitive_effect_authorized: input.sensitive_effect_authorized,
          target,
          screenshot: {
            mime_type: "image/png",
            width: current.viewport.width,
            height: current.viewport.height,
            sha256: sha256(screenshot),
            base64: screenshot.toString("base64"),
          },
          snapshot: {
            ...snapshotValue,
            sha256: sha256(canonicalJson(snapshotValue)),
          },
          captured_at: new Date().toISOString(),
        });
        session.hmiCommands.commit(input.command_id, result);
        return result;
      } catch (error) {
        if (!effectDispatched) throw error;
        quiescence?.dispose();
        quiescence = undefined;
        await session.page.waitForTimeout(HMI_QUIESCENCE_POLL_MS).catch(() => undefined);
        const reasonCode = session.recovery?.reasonCode
          ?? (fileChooserObserved ? "file_chooser_opened" : recoveryReason(error));
        let recoveryStateVersion = sourceStateVersion + 1;
        let current: BrowserSession | undefined;
        try {
          current = this.sessions.markRecoveryRequired(sessionId, reasonCode, sourceStateVersion + 1);
          recoveryStateVersion = current.stateVersion;
        } catch {
          // Once dispatch occurred, cleanup failures cannot replace the recovery fence.
        }
        if (current) await closeUnexpectedPages(current, baselinePages, openedPages).catch(() => undefined);
        const recoveryError = new BrowserError("The browser action may have taken effect but evidence could not be committed.", "TALOS_BROWSER_HMI_RECOVERY_REQUIRED", 409, {
          command_id: input.command_id,
          idempotency_status: "ambiguous",
          state_version: recoveryStateVersion,
          reason_code: reasonCode,
        });
        throw session.hmiCommands.markAmbiguous(input.command_id, recoveryError);
      } finally {
        quiescence?.dispose();
        await removeDomProbe(session.page, domProbeKey);
        try { session.context.off("page", pageListener); } catch { /* best-effort listener cleanup */ }
        try { session.page.off("download", downloadListener); } catch { /* best-effort listener cleanup */ }
        try { session.page.off("filechooser", fileChooserListener); } catch { /* best-effort listener cleanup */ }
        this.sessions.clearHmiDispatchFence(sessionId);
      }
      }, { allowRecovery: true });
    } catch (error) {
      const replayable = claimedSession?.hmiCommands.rejectIfPending(input.command_id, error);
      throw replayable ?? error;
    }
  }

  private assertCapability(session: BrowserSession): void {
    if (session.capabilities.hmiActions !== true) {
      throw new BrowserError("HMI browser interactions are not enabled for this session.", "TALOS_BROWSER_HMI_CAPABILITY_DENIED", 403);
    }
    if (!session.capabilities.screenshots || !session.capabilities.accessibilitySnapshot) {
      throw new BrowserError("HMI evidence capture is not enabled for this session.", "TALOS_BROWSER_HMI_CAPABILITY_DENIED", 403);
    }
  }

  private point(session: BrowserSession, normalizedX: number, normalizedY: number) {
    return {
      normalized_x: roundCoordinate(normalizedX),
      normalized_y: roundCoordinate(normalizedY),
      x: viewportPixel(normalizedX, session.viewport.width),
      y: viewportPixel(normalizedY, session.viewport.height),
    };
  }

  private async inspectedTarget(
    session: BrowserSession,
    stateVersion: number,
    frameSha256: string,
    point: { normalized_x: number; normalized_y: number; x: number; y: number },
  ): Promise<InspectedTarget> {
    const raw = await inspectBrowserTarget(session.page, point);
    const currentPageUrl = session.page.url();
    if (Buffer.byteLength(currentPageUrl, "utf8") > 8_192) {
      throw new BrowserError("The browser URL exceeds the bounded HMI contract.", "TALOS_BROWSER_HMI_TARGET_BOUNDS", 413);
    }

    const href = sanitizeHref(raw.href, raw.documentUrl);
    const browserDefaultAttested = raw.browserDefaultAttestable
      && !raw.hasRelevantEventListeners
      && (raw.tag.toLowerCase() !== "a" || href !== null);
    const facts: TargetFacts = {
      tag: boundedUtf8(raw.tag.toLowerCase(), 64) || "unknown",
      role: raw.role ? boundedUtf8(raw.role.toLowerCase(), 64) : null,
      name: boundedUtf8(raw.name.replace(/\s+/g, " ").trim(), 256),
      input_type: raw.inputType ? boundedUtf8(raw.inputType.toLowerCase(), 64) : null,
      href,
      form_method: raw.formMethod ? boundedUtf8(raw.formMethod.toLowerCase(), 16) : null,
      is_editable: raw.isEditable,
      is_submit: raw.isSubmit,
      is_download: raw.isDownload,
      opens_new_context: raw.opensNewContext,
      effect_attestation: browserDefaultAttested ? "browser_default" : "unattestable",
      required_effect_classification: browserDefaultAttested ? "ordinary" : "sensitive",
      visible: raw.visible,
      disabled: raw.disabled,
    };
    const fingerprint = sha256(canonicalJson({
      session_id: session.sessionId,
      state_version: stateVersion,
      frame_sha256: frameSha256,
      frame_id: raw.frameId,
      loader_id: raw.loaderId,
      backend_node_id: raw.backendNodeId,
      document_url_digest: sha256(raw.documentUrl),
      current_page_url_digest: sha256(currentPageUrl),
      normalized_x: point.normalized_x,
      normalized_y: point.normalized_y,
      destination_digest: raw.destination ? sha256(raw.destination) : null,
      target: facts,
    }));

    return {
      target: BrowserHmiTargetDescriptorSchema.parse({ ...facts, fingerprint }),
      attestation: raw,
    };
  }
}

function roundCoordinate(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function viewportPixel(normalized: number, size: number): number {
  return Math.min(size - 1, Math.max(0, Math.round(normalized * size)));
}

function safeOrigin(value: string): string {
  try {
    return boundedUtf8(new URL(value).origin, 2_048);
  } catch {
    return "null";
  }
}

function safeEvidenceUrl(value: string): string {
  let result = value;
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") {
      url.username = "";
      url.password = "";
      url.search = "";
      url.hash = "";
      result = url.toString();
    }
  } catch {
    // Non-HTTP fixture URLs remain useful in worker-local evidence.
  }
  if (Buffer.byteLength(result, "utf8") > 2_048) throw new Error("evidence_url_bounds");
  return result;
}

function sanitizeHref(raw: string | null, base: string): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw, base);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username !== "" || url.password !== "") return null;
  url.search = "";
  url.hash = "";
  const safeHref = url.pathname === "/" ? url.origin : `${url.origin}${url.pathname}`;
  if (Buffer.byteLength(safeHref, "utf8") > 2_048) {
    throw new BrowserError("The browser target exceeds the bounded HMI contract.", "TALOS_BROWSER_HMI_TARGET_BOUNDS", 413);
  }
  return safeHref;
}

function boundedUtf8(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;
  let result = "";
  for (const character of value) {
    if (Buffer.byteLength(result + character, "utf8") > maxBytes) break;
    result += character;
  }
  return result;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalValue(item)]));
  }
  return value;
}

function sha256(value: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

async function closeUnexpectedPages(session: BrowserSession, baselinePages: Set<Page>, observedPages: Set<Page>): Promise<void> {
  for (let pass = 0; pass < 2; pass += 1) {
    for (const page of session.context.pages()) {
      if (!baselinePages.has(page)) observedPages.add(page);
    }
    await Promise.all([...observedPages].map(async (page) => {
      if (!page.isClosed()) await page.close().catch(() => undefined);
    }));
    if (pass === 0) await session.page.waitForTimeout(25).catch(() => undefined);
  }
}

function recoveryReason(error: unknown): string {
  if (error instanceof Error && ["new_context_opened", "download_started", "file_chooser_opened", "dispatch_guard_rejected", "evidence_frame_changed", "evidence_url_bounds", "quiescence_timeout"].includes(error.message)) return error.message;
  return "post_dispatch_failure";
}

async function guardPostActionContext(
  session: BrowserSession,
  baselinePages: Set<Page>,
  observedPages: Set<Page>,
  downloadObserved: () => boolean,
  recoveryReasonCode: () => string | undefined,
): Promise<void> {
  const deadline = Date.now() + HMI_POST_ACTION_GUARD_MS;
  while (Date.now() < deadline) {
    for (const page of session.context.pages()) {
      if (!baselinePages.has(page)) observedPages.add(page);
    }
    if (observedPages.size > 0) throw new Error("new_context_opened");
    if (downloadObserved()) throw new Error("download_started");
    const recoveryReason = recoveryReasonCode();
    if (recoveryReason) throw new Error(recoveryReason);
    await session.page.waitForTimeout(Math.min(HMI_QUIESCENCE_POLL_MS, Math.max(1, deadline - Date.now())));
  }
}

interface QuiescenceTracker {
  waitFor(page: Page, domProbeKey: string): Promise<void>;
  dispose(): void;
}

function createQuiescenceTracker(page: Page): QuiescenceTracker {
  const activeRequests = new Set<Request>();
  let activityVersion = 0;
  let navigationVersion = 0;
  const onRequest = (request: Request) => {
    activeRequests.add(request);
    activityVersion += 1;
  };
  const onRequestDone = (request: Request) => {
    activeRequests.delete(request);
    activityVersion += 1;
  };
  const onNavigation = () => {
    navigationVersion += 1;
    activityVersion += 1;
  };
  page.on("request", onRequest);
  page.on("requestfinished", onRequestDone);
  page.on("requestfailed", onRequestDone);
  page.on("framenavigated", onNavigation);
  const baselineActiveRequests = activeRequests.size;
  const baselineNavigationVersion = navigationVersion;

  return {
    async waitFor(currentPage, domProbeKey) {
      const deadline = Date.now() + HMI_QUIESCENCE_TIMEOUT_MS;
      let previousMutationCount: number | undefined;
      let previousActivityVersion = activityVersion;
      let previousNavigationVersion = navigationVersion;
      let stableSince: number | undefined;

      while (Date.now() < deadline) {
        let mutationCount = await readDomProbe(currentPage, domProbeKey);
        const navigationChanged = navigationVersion > baselineNavigationVersion;
        if (navigationChanged) {
          const remaining = Math.max(1, deadline - Date.now());
          await currentPage.waitForLoadState("domcontentloaded", { timeout: remaining }).catch(() => undefined);
        }
        const probeReinstalled = mutationCount === null;
        if (probeReinstalled) {
          try {
            await installDomProbe(currentPage, domProbeKey);
            mutationCount = await readDomProbe(currentPage, domProbeKey);
          } catch {
            await currentPage.waitForTimeout(Math.min(HMI_QUIESCENCE_POLL_MS, Math.max(1, deadline - Date.now()))).catch(() => undefined);
            continue;
          }
        }
        const changed = probeReinstalled
          || previousMutationCount === undefined
          || mutationCount !== previousMutationCount
          || activityVersion !== previousActivityVersion
          || navigationVersion !== previousNavigationVersion
          || activeRequests.size > baselineActiveRequests;
        if (changed) {
          stableSince = undefined;
        } else if (stableSince === undefined) {
          stableSince = Date.now();
        }
        previousMutationCount = mutationCount ?? previousMutationCount;
        previousActivityVersion = activityVersion;
        previousNavigationVersion = navigationVersion;
        if (stableSince !== undefined && Date.now() - stableSince >= HMI_QUIESCENCE_STABLE_MS && activeRequests.size <= baselineActiveRequests) return;
        await currentPage.waitForTimeout(Math.min(HMI_QUIESCENCE_POLL_MS, Math.max(1, deadline - Date.now())));
      }
      throw new Error("quiescence_timeout");
    },
    dispose() {
      page.off("request", onRequest);
      page.off("requestfinished", onRequestDone);
      page.off("requestfailed", onRequestDone);
      page.off("framenavigated", onNavigation);
    },
  };
}

async function installDomProbe(page: Page, key: string): Promise<void> {
  await page.evaluate((probeKey) => {
    const host = window as unknown as Record<string, unknown>;
    const previous = host[probeKey] as { observer?: MutationObserver } | undefined;
    previous?.observer?.disconnect();
    const state: {
      count: number;
      evidenceCount: number;
      suppressCapturePresentationMutations: boolean;
      observer?: MutationObserver;
    } = { count: 0, evidenceCount: 0, suppressCapturePresentationMutations: false };
    state.observer = new MutationObserver((records) => {
      state.count += 1;
      if (records.some((record) => !(state.suppressCapturePresentationMutations
        && record.type === "attributes"
        && record.attributeName === "style"))) {
        state.evidenceCount += 1;
      }
    });
    if (document.documentElement) {
      state.observer.observe(document.documentElement, { attributes: true, childList: true, characterData: true, subtree: true });
    }
    host[probeKey] = state;
  }, key);
}

async function readDomProbe(page: Page, key: string): Promise<number | null> {
  return page.evaluate((probeKey) => {
    const state = (window as unknown as Record<string, unknown>)[probeKey] as { count?: unknown } | undefined;
    return typeof state?.count === "number" ? state.count : null;
  }, key).catch(() => null);
}

async function readEvidenceDomProbe(page: Page, key: string): Promise<number | null> {
  return page.evaluate((probeKey) => {
    const state = (window as unknown as Record<string, unknown>)[probeKey] as { evidenceCount?: unknown } | undefined;
    return typeof state?.evidenceCount === "number" ? state.evidenceCount : null;
  }, key).catch(() => null);
}

async function suppressCapturePresentationMutations(page: Page, key: string, suppressed: boolean): Promise<void> {
  await page.evaluate(({ probeKey, value }) => {
    const state = (window as unknown as Record<string, unknown>)[probeKey] as {
      suppressCapturePresentationMutations?: boolean;
    } | undefined;
    if (!state || typeof state.suppressCapturePresentationMutations !== "boolean") {
      throw new Error("dom_probe_missing");
    }
    state.suppressCapturePresentationMutations = value;
  }, { probeKey: key, value: suppressed });
}

async function removeDomProbe(page: Page, key: string): Promise<void> {
  await page.evaluate((probeKey) => {
    const host = window as unknown as Record<string, unknown>;
    const state = host[probeKey] as { observer?: MutationObserver } | undefined;
    state?.observer?.disconnect();
    delete host[probeKey];
  }, key).catch(() => undefined);
}
