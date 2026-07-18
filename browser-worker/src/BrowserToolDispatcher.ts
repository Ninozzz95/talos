import { BrowserError } from "./BrowserErrors.js";
import { assertAllowedBrowserUrl, browserEvidenceUrl } from "./BrowserUrlPolicy.js";
import { captureSnapshot } from "./BrowserSnapshot.js";
import { captureCanonicalBrowserFrame } from "./BrowserFrameCapture.js";
import { BrowserSessionManager, type BrowserSession } from "./BrowserSessionManager.js";
import { BrowserFileStagingStore, type StagedBrowserFile } from "./BrowserFileStagingStore.js";
import {
  BrowserToolCallSchema,
  BrowserToolResultSchema,
  BrowserFileUploadToolArgumentsSchema,
  ClickToolArgumentsSchema,
  NavigateToolArgumentsSchema,
  ReadToolArgumentsSchema,
  ScreenshotToolArgumentsSchema,
  SnapshotToolArgumentsSchema,
  TOOL_MAX_SCREENSHOT_BYTES,
  TOOL_MAX_WAIT_SECONDS,
  WaitToolArgumentsSchema,
  sha256,
  toolResult,
  validateToolStructuredOutput,
} from "./BrowserToolContracts.js";
import { z } from "zod";

type BrowserToolCall = z.infer<typeof BrowserToolCallSchema>;
type CanonicalToolResult = z.infer<typeof BrowserToolResultSchema>;
type BrowserFileUploadArguments = z.infer<typeof BrowserFileUploadToolArgumentsSchema>;

export interface BrowserToolRequestContext {
  idempotencyKey?: string;
}

const SEMANTIC_CLICK_ROLES = new Set([
  "button", "link", "checkbox", "radio", "tab", "menuitem", "option", "combobox", "switch",
]);

export class BrowserToolDispatcher {
  constructor(
    private readonly sessions: BrowserSessionManager,
    private readonly fileStaging: BrowserFileStagingStore = new BrowserFileStagingStore(),
  ) {}

  async call(sessionId: string, rawCall: unknown, context: BrowserToolRequestContext = {}): Promise<CanonicalToolResult> {
    const parsedCall = BrowserToolCallSchema.safeParse(rawCall);
    if (!parsedCall.success) {
      return this.errorResult(
        "unknown",
        "TALOS_BROWSER_INVALID_TOOL_CALL",
        "The browser tool call envelope is invalid.",
      );
    }

    const call = parsedCall.data;
    let session: BrowserSession | undefined;
    try {
      session = await this.sessions.get(sessionId);
      const idempotencyKey = context.idempotencyKey ?? call.tool_use_id;
      const requestedStateVersion = call.arguments.state_version;
      const claim = session.actionLedger.claim<CanonicalToolResult>({
        actionId: call.tool_use_id,
        idempotencyKey,
        operation: call.name,
        preconditionStateVersion: typeof requestedStateVersion === "number" && Number.isInteger(requestedStateVersion)
          ? requestedStateVersion
          : session.stateVersion,
        request: { name: call.name, arguments: call.arguments },
        consequential: isConsequentialTool(call.name),
      });
      if (claim.kind === "result") return BrowserToolResultSchema.parse(claim.result);
      if (claim.kind === "error") return this.errorResult(call.tool_use_id, claim.error.code, claim.error.message, claim.error.details);

      let dispatched = false;
      try {
        const result = await this.sessions.runExclusive(sessionId, async (current) => {
          session = current;
          if (call.name === "browser_click") {
            return this.click(current, call, () => {
              current.actionLedger.markDispatched(idempotencyKey);
              dispatched = true;
            });
          }
          if (call.name === "browser_file_upload") {
            return this.upload(current, call, () => {
              current.actionLedger.markDispatched(idempotencyKey);
              dispatched = true;
            });
          }
          current.actionLedger.markDispatched(idempotencyKey);
          dispatched = true;
          switch (call.name) {
            case "browser_navigate": return await this.navigate(current, call);
            case "browser_snapshot": return await this.snapshot(current, call);
            case "browser_read": return await this.read(current, call);
            case "browser_take_screenshot": return await this.screenshot(current, call);
            case "browser_wait_for": return await this.waitFor(current, call);
            default: return this.errorResult(call.tool_use_id, "TALOS_BROWSER_UNSUPPORTED_TOOL", `Unsupported browser tool: ${call.name}.`);
          }
        });
        if (!dispatched) session.actionLedger.markDispatched(idempotencyKey);
        session.actionLedger.commit(idempotencyKey, result);
        return result;
      } catch (error) {
        const controlled = error instanceof BrowserError
          ? error
          : new BrowserError("The browser tool failed.", "TALOS_BROWSER_TOOL_EXECUTION_FAILED", 500);
        if (!dispatched) {
          session.actionLedger.rejectIfPending(idempotencyKey, controlled);
        } else if (isConsequentialTool(call.name)) {
          session.actionLedger.markAmbiguous(idempotencyKey, controlled);
        } else {
          const result = this.errorResult(call.tool_use_id, controlled.code, controlled.message, controlled.details);
          session.actionLedger.commit(idempotencyKey, result);
          return result;
        }
        return this.errorResult(call.tool_use_id, controlled.code, controlled.message, controlled.details);
      }
    } catch (error) {
      const controlled = error instanceof BrowserError && isConsequentialTool(call.name) && error.code === "TALOS_BROWSER_ACTION_CONFLICT"
        ? new BrowserError(
          error.message,
          call.name === "browser_file_upload" ? "TALOS_BROWSER_UPLOAD_COMMAND_CONFLICT" : "TALOS_BROWSER_CLICK_COMMAND_CONFLICT",
          error.statusCode,
          error.details,
        )
        : error;
      return this.errorResult(
        call.tool_use_id,
        controlled instanceof BrowserError ? controlled.code : "TALOS_BROWSER_TOOL_EXECUTION_FAILED",
        controlled instanceof BrowserError ? controlled.message : "The browser tool failed.",
        controlled instanceof BrowserError ? { ...controlled.details, state_version: session?.stateVersion } : { state_version: session?.stateVersion },
      );
    }
  }

  private async navigate(session: BrowserSession, call: BrowserToolCall): Promise<CanonicalToolResult> {
    const parsed = NavigateToolArgumentsSchema.safeParse(call.arguments);
    if (!parsed.success) return this.errorResult(call.tool_use_id, "TALOS_BROWSER_INVALID_TOOL_ARGUMENTS", "Invalid browser_navigate arguments.");
    this.sessions.assertState(session.sessionId, parsed.data.state_version);
    await assertAllowedBrowserUrl(parsed.data.url);
    await this.sessions.navigate(session.sessionId, {
      url: parsed.data.url,
      waitUntil: parsed.data.waitUntil ?? "domcontentloaded",
      timeoutMs: parsed.data.timeoutMs ?? 15_000,
    });
    const current = await this.sessions.get(session.sessionId);
    const structured = {
      url: browserEvidenceUrl(current.page.url()),
      title: await current.page.title(),
      state_version: current.stateVersion,
    };
    return this.success(call.tool_use_id, call.name, structured, "Browser navigation completed.", "navigation", structured);
  }

  private async snapshot(session: BrowserSession, call: BrowserToolCall): Promise<CanonicalToolResult> {
    const parsed = SnapshotToolArgumentsSchema.safeParse(call.arguments);
    if (!parsed.success) return this.errorResult(call.tool_use_id, "TALOS_BROWSER_INVALID_TOOL_ARGUMENTS", "Invalid browser_snapshot arguments.");
    if (!session.capabilities.accessibilitySnapshot) {
      throw new BrowserError("Accessibility snapshots are not enabled for this session.", "TALOS_BROWSER_CAPABILITY_DENIED", 403);
    }
    this.sessions.assertState(session.sessionId, parsed.data.state_version);
    const captured = await captureSnapshot(session.page);
    const current = await this.sessions.get(session.sessionId);
    await this.sessions.recordSnapshot(session.sessionId, captured);
    const structured = {
      url: browserEvidenceUrl(current.page.url()),
      title: await current.page.title(),
      state_version: current.stateVersion,
      snapshot_id: captured.snapshotId,
      format: captured.format,
      text_digest: captured.textDigest,
      nodes: captured.nodes,
    };
    return this.success(call.tool_use_id, call.name, structured, "Browser snapshot captured.", "snapshot", captured);
  }

  private async read(session: BrowserSession, call: BrowserToolCall): Promise<CanonicalToolResult> {
    const parsed = ReadToolArgumentsSchema.safeParse(call.arguments);
    if (!parsed.success) return this.errorResult(call.tool_use_id, "TALOS_BROWSER_INVALID_TOOL_ARGUMENTS", "Invalid browser_read arguments.");
    this.sessions.assertState(session.sessionId, parsed.data.state_version);
    const stored = this.sessions.snapshot(session.sessionId);
    if (!stored || stored.stateVersion !== session.stateVersion || (parsed.data.snapshot_id !== undefined && parsed.data.snapshot_id !== stored.value.snapshotId)) {
      return this.errorResult(call.tool_use_id, "TALOS_BROWSER_STALE_REF", "The requested browser snapshot reference is stale.", { state_version: session.stateVersion });
    }

    const query = parsed.data.query?.toLocaleLowerCase();
    const matches = stored.value.nodes
      .filter((node) => (parsed.data.ref === undefined || node.ref === parsed.data.ref) && (query === undefined || node.name.toLocaleLowerCase().includes(query)))
      .slice(0, 20);
    const structured = {
      url: browserEvidenceUrl(session.page.url()),
      title: await session.page.title(),
      state_version: session.stateVersion,
      snapshot_id: stored.value.snapshotId,
      matches,
    };
    return this.success(call.tool_use_id, call.name, structured, JSON.stringify({ matches }), "snapshot", stored.value);
  }

  private async screenshot(session: BrowserSession, call: BrowserToolCall): Promise<CanonicalToolResult> {
    const parsed = ScreenshotToolArgumentsSchema.safeParse(call.arguments);
    if (!parsed.success) return this.errorResult(call.tool_use_id, "TALOS_BROWSER_INVALID_TOOL_ARGUMENTS", "Invalid browser_take_screenshot arguments.");
    if (!session.capabilities.screenshots) {
      throw new BrowserError("Screenshots are not enabled for this session.", "TALOS_BROWSER_CAPABILITY_DENIED", 403);
    }
    this.sessions.assertState(session.sessionId, parsed.data.state_version);
    const image = await captureCanonicalBrowserFrame(session.page);
    if (image.byteLength > TOOL_MAX_SCREENSHOT_BYTES) {
      return this.errorResult(call.tool_use_id, "TALOS_BROWSER_SCREENSHOT_BOUNDS", "The browser screenshot exceeds the bounded output limit.", { max_bytes: TOOL_MAX_SCREENSHOT_BYTES });
    }
    const digest = sha256(image);
    await this.sessions.recordFrame(session.sessionId, image, session.stateVersion);
    const structured = {
      url: browserEvidenceUrl(session.page.url()),
      title: await session.page.title(),
      state_version: session.stateVersion,
      mime_type: "image/png" as const,
      width: session.viewport.width,
      height: session.viewport.height,
      sha256: digest,
    };
    return this.success(call.tool_use_id, call.name, structured, "Browser screenshot captured.", "screenshot", image, [{ type: "image", data: image.toString("base64"), mimeType: "image/png" }]);
  }

  private async waitFor(session: BrowserSession, call: BrowserToolCall): Promise<CanonicalToolResult> {
    const rawTime = call.arguments.time;
    if (typeof rawTime === "number" && (!Number.isFinite(rawTime) || rawTime < 0 || rawTime > TOOL_MAX_WAIT_SECONDS)) {
      return this.errorResult(call.tool_use_id, "TALOS_BROWSER_WAIT_BOUNDS", "The browser wait time must be between 0 and 10 seconds.");
    }
    const parsed = WaitToolArgumentsSchema.safeParse(call.arguments);
    if (!parsed.success) return this.errorResult(call.tool_use_id, "TALOS_BROWSER_INVALID_TOOL_ARGUMENTS", "Invalid browser_wait_for arguments.");
    this.sessions.assertState(session.sessionId, parsed.data.state_version);
    try {
      if (parsed.data.time !== undefined) await session.page.waitForTimeout(parsed.data.time * 1000);
      if (parsed.data.text !== undefined) await session.page.getByText(parsed.data.text, { exact: false }).first().waitFor({ state: "visible", timeout: TOOL_MAX_WAIT_SECONDS * 1000 });
      if (parsed.data.textGone !== undefined) await session.page.getByText(parsed.data.textGone, { exact: false }).first().waitFor({ state: "hidden", timeout: TOOL_MAX_WAIT_SECONDS * 1000 });
    } catch (error) {
      throw new BrowserError("The browser wait condition timed out.", "TALOS_BROWSER_WAIT_TIMEOUT", 408, { reason: error instanceof Error ? error.message : "unknown" });
    }
    const current = this.sessions.advanceState(session.sessionId);
    const structured = { url: browserEvidenceUrl(current.page.url()), title: await current.page.title(), state_version: current.stateVersion };
    return this.success(call.tool_use_id, call.name, structured, "Browser wait completed.", "wait", structured);
  }

  private async click(session: BrowserSession, call: BrowserToolCall, onDispatch: () => void): Promise<CanonicalToolResult> {
    const parsed = ClickToolArgumentsSchema.safeParse(call.arguments);
    if (!parsed.success) return this.errorResult(call.tool_use_id, "TALOS_BROWSER_INVALID_TOOL_ARGUMENTS", "Invalid browser_click arguments.");
    if (session.capabilities.hmiActions !== true) {
      throw new BrowserError("Semantic browser clicks are not enabled for this session.", "TALOS_BROWSER_CAPABILITY_DENIED", 403);
    }
    if (!session.capabilities.screenshots || !session.capabilities.accessibilitySnapshot) {
      throw new BrowserError("Semantic browser click evidence is not enabled for this session.", "TALOS_BROWSER_CAPABILITY_DENIED", 403);
    }

    this.sessions.assertState(session.sessionId, parsed.data.state_version);
    const stored = this.sessions.snapshot(session.sessionId);
    if (!stored || stored.stateVersion !== session.stateVersion || stored.value.snapshotId !== parsed.data.snapshot_id) {
      return this.errorResult(call.tool_use_id, "TALOS_BROWSER_STALE_SNAPSHOT", "The requested browser snapshot is stale.", { state_version: session.stateVersion });
    }

    const node = stored.value.nodes.find((candidate) => candidate.ref === parsed.data.target);
    if (!node) {
      return this.errorResult(call.tool_use_id, "TALOS_BROWSER_STALE_REF", "The requested browser ref is missing from the stored snapshot.", { state_version: session.stateVersion });
    }
    if (parsed.data.element !== undefined && parsed.data.element !== node.name) {
      return this.errorResult(call.tool_use_id, "TALOS_BROWSER_TARGET_MISMATCH", "The descriptive element does not match the stored target.", { state_version: session.stateVersion });
    }

    const role = node.role.toLocaleLowerCase();
    if (!SEMANTIC_CLICK_ROLES.has(role)) {
      return this.errorResult(call.tool_use_id, "TALOS_BROWSER_UNSUPPORTED_TARGET", "The stored ref does not identify a supported clickable target.", { state_version: session.stateVersion });
    }
    if (stored.value.documentToken !== undefined && stored.value.documentToken !== await documentToken(session.page)) {
      return this.errorResult(call.tool_use_id, "TALOS_BROWSER_DOCUMENT_CHANGED", "The document changed after the snapshot was captured.", { state_version: session.stateVersion });
    }

    const binding = stored.value.refBindings?.get(node.ref);
    if (!binding) return this.errorResult(call.tool_use_id, "TALOS_BROWSER_REF_MISSING", "The stored target is no longer present in the document.", { state_version: session.stateVersion });

    const targetState = await binding.evaluate((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const tag = element.tagName.toLowerCase();
      const input = element as HTMLInputElement;
      const inputType = tag === "input" ? input.type.toLocaleLowerCase() : "";
      const explicitTarget = (element as HTMLAnchorElement).target || element.getAttribute("target") || "";
      const normalizedTarget = explicitTarget.trim().toLowerCase();
      const encoder = new TextEncoder();
      const secretControlSelector = 'input, textarea, select, option, [contenteditable="true"], [role="textbox"]';
      const semantic = {
        boundedText(value: string, maxBytes: number): string {
          let result = "";
          let resultBytes = 0;
          let pendingSpace = false;
          let inspectedCharacters = 0;
          for (const character of value) {
            inspectedCharacters += 1;
            if (inspectedCharacters > maxBytes * 2) break;
            if (/\s/u.test(character)) {
              pendingSpace = resultBytes > 0;
              continue;
            }
            const characterBytes = encoder.encode(character).byteLength;
            const separatorBytes = pendingSpace ? 1 : 0;
            if (resultBytes + separatorBytes + characterBytes > maxBytes) break;
            if (pendingSpace) {
              result += " ";
              resultBytes += 1;
              pendingSpace = false;
            }
            result += character;
            resultBytes += characterBytes;
          }
          return result;
        },
        descendantTextName(target: Element, maxBytes: number): string {
          const nameWalker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
          const nameParts: string[] = [];
          let nameBytes = 0;
          let inspectedNameNodes = 0;
          let nameNode = nameWalker.nextNode();
          while (nameNode && nameBytes < maxBytes && inspectedNameNodes < 32) {
            inspectedNameNodes += 1;
            if (nameNode.parentElement?.closest(secretControlSelector) !== null) {
              nameNode = nameWalker.nextNode();
              continue;
            }
            const separatorBytes = nameParts.length > 0 ? 1 : 0;
            const value = semantic.boundedText(nameNode.nodeValue || "", maxBytes - nameBytes - separatorBytes);
            if (value) {
              nameParts.push(value);
              nameBytes += separatorBytes + encoder.encode(value).byteLength;
            }
            nameNode = nameWalker.nextNode();
          }
          return nameParts.join(" ");
        },
        elementsTextName(elements: Iterable<Element>, maxBytes: number): string {
          const nameParts: string[] = [];
          let nameBytes = 0;
          let inspectedElements = 0;
          for (const target of elements) {
            if (inspectedElements++ >= 16 || nameBytes >= maxBytes) break;
            const separatorBytes = nameParts.length > 0 ? 1 : 0;
            const value = semantic.descendantTextName(target, maxBytes - nameBytes - separatorBytes);
            if (value) {
              nameParts.push(value);
              nameBytes += separatorBytes + encoder.encode(value).byteLength;
            }
          }
          return nameParts.join(" ");
        },
      };
      const currentRole = element.getAttribute("role")
        || (tag.startsWith("h") ? "heading" : tag === "a" ? "link" : tag === "button" ? "button"
          : tag === "input" && ["button", "submit", "reset", "image", "file"].includes(inputType) ? "button"
            : tag === "input" && inputType === "checkbox" ? "checkbox"
              : tag === "input" && inputType === "radio" ? "radio"
                : tag === "select" ? "combobox" : tag);
      const isFormControl = tag === "input" || tag === "textarea" || tag === "select";
      const labelledBy = semantic.boundedText(element.getAttribute("aria-labelledby") || "", 512)
        .split(" ")
        .slice(0, 16)
        .map((id) => document.getElementById(id))
        .filter((label): label is HTMLElement => label !== null);
      let currentName = semantic.elementsTextName(labelledBy, 200);
      if (!currentName) currentName = semantic.boundedText(element.getAttribute("aria-label") || "", 200);
      if (!currentName && isFormControl) {
        const labels = (element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).labels;
        if (labels) currentName = semantic.elementsTextName(labels, 200);
      }
      if (!currentName) currentName = semantic.boundedText(element.getAttribute("alt") || "", 200);
      if (!currentName) currentName = semantic.boundedText(element.getAttribute("placeholder") || "", 200);
      if (!currentName) currentName = semantic.boundedText(element.getAttribute("title") || "", 200);
      if (!currentName && !isFormControl) currentName = semantic.descendantTextName(element, 200);
      return {
        connected: element.isConnected,
        visible: element.isConnected
          && style.display !== "none"
          && style.visibility !== "hidden"
          && element.getAttribute("aria-hidden") !== "true"
          && rect.width > 0
          && rect.height > 0,
        disabled: element.matches(":disabled") || element.getAttribute("aria-disabled") === "true",
        fileChooser: tag === "input" && input.type === "file",
        download: tag === "a" && element.hasAttribute("download"),
        newContext: normalizedTarget !== "" && !["_self", "_top", "_parent"].includes(normalizedTarget),
        role: currentRole,
        name: currentName,
      };
    }).catch(() => null);

    if (!targetState) return this.errorResult(call.tool_use_id, "TALOS_BROWSER_REF_MISSING", "The stored target is no longer present in the document.", { state_version: session.stateVersion });
    if (!targetState.connected) return this.errorResult(call.tool_use_id, "TALOS_BROWSER_REF_MISSING", "The stored target is no longer present in the document.", { state_version: session.stateVersion });
    if (targetState.role !== node.role || targetState.name !== node.name) {
      return this.errorResult(call.tool_use_id, "TALOS_BROWSER_REF_CHANGED", "The referenced browser node changed after the snapshot was captured.", { state_version: session.stateVersion });
    }
    if (!targetState.visible || !node.visible) return this.errorResult(call.tool_use_id, "TALOS_BROWSER_TARGET_HIDDEN", "The stored target is hidden.", { state_version: session.stateVersion });
    if (targetState.disabled) return this.errorResult(call.tool_use_id, "TALOS_BROWSER_TARGET_DISABLED", "The stored target is disabled.", { state_version: session.stateVersion });
    if (targetState.fileChooser) return this.errorResult(call.tool_use_id, "TALOS_BROWSER_FILE_CHOOSER_DENIED", "File chooser controls are not enabled for browser clicks.", { state_version: session.stateVersion });
    if (targetState.download) return this.errorResult(call.tool_use_id, "TALOS_BROWSER_DOWNLOAD_DENIED", "Downloads are not enabled for browser clicks.", { state_version: session.stateVersion });
    if (targetState.newContext) return this.errorResult(call.tool_use_id, "TALOS_BROWSER_NEW_CONTEXT_DENIED", "Opening a new browser context is not enabled for browser clicks.", { state_version: session.stateVersion });

    const baselinePages = new Set(session.context.pages());
    let openedPage = false;
    let downloadObserved = false;
    let fileChooserObserved = false;
    const pageListener = (page: unknown) => { if (!baselinePages.has(page as never)) openedPage = true; };
    const downloadListener = () => { downloadObserved = true; };
    const fileChooserListener = () => { fileChooserObserved = true; };
    session.context.on("page", pageListener);
    session.page.on("download", downloadListener);
    session.page.on("filechooser", fileChooserListener);
    const dispatchStateVersion = session.stateVersion + 1;
    let dispatchThresholdReached = false;
    let stateAdvanced = false;
    try {
      this.sessions.armHmiDispatchFence(session.sessionId, dispatchStateVersion);
      dispatchThresholdReached = true;
      onDispatch();
      await binding.click({ button: "left", clickCount: 1 });
      const current = session.recovery ? session : this.sessions.advanceState(session.sessionId);
      stateAdvanced = !session.recovery;
      if (current.recovery || openedPage || downloadObserved || fileChooserObserved) {
        throw new Error(openedPage ? "new_context_opened" : downloadObserved ? "download_started" : "file_chooser_opened");
      }
      await current.page.waitForLoadState("networkidle", { timeout: 1_000 });
      const screenshot = await captureCanonicalBrowserFrame(current.page);
      const snapshot = await captureSnapshot(current.page);
      const verificationScreenshot = await captureCanonicalBrowserFrame(current.page);
      const verificationSnapshot = await captureSnapshot(current.page);
      if (sha256(screenshot) !== sha256(verificationScreenshot)
        || snapshot.documentToken !== await documentToken(current.page)) {
        throw new Error("evidence_frame_changed");
      }
      if (snapshot.domDigest !== verificationSnapshot.domDigest) throw new Error("evidence_dom_changed");
      await this.sessions.recordSnapshot(current.sessionId, snapshot);
      await this.sessions.recordFrame(current.sessionId, screenshot, current.stateVersion);
      const snapshotValue = {
        snapshot_id: snapshot.snapshotId,
        format: snapshot.format,
        text_digest: snapshot.textDigest,
        nodes: snapshot.nodes,
      };
      const screenshotValue = {
        mime_type: "image/png" as const,
        width: current.viewport.width,
        height: current.viewport.height,
        sha256: sha256(screenshot),
      };
      const result = this.successWithEvidence(
        call.tool_use_id,
        call.name,
        {
          url: browserEvidenceUrl(current.page.url()),
          title: await current.page.title(),
          state_version: current.stateVersion,
          target: { ref: node.ref, role: node.role, name: node.name },
          screenshot: screenshotValue,
          snapshot: { ...snapshotValue, sha256: sha256(JSON.stringify(snapshotValue)) },
        },
        "Browser click completed.",
        [
          { kind: "screenshot", source: screenshot, image: { type: "image", data: screenshot.toString("base64"), mimeType: "image/png" } },
          { kind: "snapshot", source: JSON.stringify(snapshotValue) },
        ],
      );
      if (result.isError) throw new Error("post_click_output_validation");
      return result;
    } catch (error) {
      if (!dispatchThresholdReached) throw error;
      if (!stateAdvanced && !session.recovery) this.sessions.advanceState(session.sessionId);
      const reasonCode = error instanceof Error ? error.message : "post_dispatch_failure";
      const recovery = this.sessions.markRecoveryRequired(session.sessionId, reasonCode, dispatchStateVersion);
      throw new BrowserError("The browser click may have taken effect but evidence could not be committed.", "TALOS_BROWSER_CLICK_RECOVERY_REQUIRED", 409, {
        state_version: recovery.stateVersion,
        reason_code: recovery.recovery?.reasonCode ?? reasonCode,
        idempotency_status: "ambiguous",
      });
    } finally {
      this.sessions.clearHmiDispatchFence(session.sessionId);
      session.context.off("page", pageListener);
      session.page.off("download", downloadListener);
      session.page.off("filechooser", fileChooserListener);
    }
  }

  private async upload(session: BrowserSession, call: BrowserToolCall, onDispatch: () => void): Promise<CanonicalToolResult> {
    const parsed = BrowserFileUploadToolArgumentsSchema.safeParse(call.arguments);
    if (!parsed.success) return this.errorResult(call.tool_use_id, "TALOS_BROWSER_INVALID_TOOL_ARGUMENTS", "Invalid browser_file_upload arguments.");
    if (session.capabilities.uploads !== true) {
      throw new BrowserError("Browser file uploads are not enabled for this session.", "TALOS_BROWSER_CAPABILITY_DENIED", 403);
    }
    if (!session.capabilities.screenshots || !session.capabilities.accessibilitySnapshot) {
      throw new BrowserError("Browser upload evidence is not enabled for this session.", "TALOS_BROWSER_CAPABILITY_DENIED", 403);
    }

    const stagedFiles = this.fileStaging.takeMany(session.ownerRef, session.sessionId, parsed.data.staged_file_ids);
    try {
      return await this.uploadApprovedStagedFiles(session, call, parsed.data, stagedFiles, onDispatch);
    } finally {
      this.fileStaging.release(stagedFiles);
    }
  }

  private async uploadApprovedStagedFiles(
    session: BrowserSession,
    call: BrowserToolCall,
    input: BrowserFileUploadArguments,
    stagedFiles: readonly StagedBrowserFile[],
    onDispatch: () => void,
  ): Promise<CanonicalToolResult> {
    this.sessions.assertState(session.sessionId, input.state_version);
    const stored = this.sessions.snapshot(session.sessionId);
    if (!stored || stored.stateVersion !== session.stateVersion || stored.value.snapshotId !== input.snapshot_id) {
      return this.errorResult(call.tool_use_id, "TALOS_BROWSER_STALE_SNAPSHOT", "The requested browser snapshot is stale.", { state_version: session.stateVersion });
    }
    const node = stored.value.nodes.find((candidate) => candidate.ref === input.target);
    if (!node) {
      return this.errorResult(call.tool_use_id, "TALOS_BROWSER_STALE_REF", "The requested browser ref is missing from the stored snapshot.", { state_version: session.stateVersion });
    }
    if (input.element !== undefined && input.element !== node.name) {
      return this.errorResult(call.tool_use_id, "TALOS_BROWSER_TARGET_MISMATCH", "The descriptive element does not match the stored upload target.", { state_version: session.stateVersion });
    }
    if (stored.value.documentToken !== undefined && stored.value.documentToken !== await documentToken(session.page)) {
      return this.errorResult(call.tool_use_id, "TALOS_BROWSER_DOCUMENT_CHANGED", "The document changed after the snapshot was captured.", { state_version: session.stateVersion });
    }
    const binding = stored.value.refBindings?.get(node.ref);
    if (!binding) {
      return this.errorResult(call.tool_use_id, "TALOS_BROWSER_REF_MISSING", "The stored upload target is no longer present.", { state_version: session.stateVersion });
    }
    const targetState = await binding.evaluate((element) => {
      const input = element as HTMLInputElement;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        connected: element.isConnected,
        visible: element.isConnected
          && style.display !== "none"
          && style.visibility !== "hidden"
          && element.getAttribute("aria-hidden") !== "true"
          && rect.width > 0
          && rect.height > 0,
        disabled: element.matches(":disabled") || element.getAttribute("aria-disabled") === "true",
        fileChooser: element.tagName.toLowerCase() === "input" && input.type.toLocaleLowerCase() === "file",
        multiple: input.multiple,
      };
    }).catch(() => null);
    if (!targetState?.connected) return this.errorResult(call.tool_use_id, "TALOS_BROWSER_REF_MISSING", "The stored upload target is no longer present.", { state_version: session.stateVersion });
    if (!targetState.visible || !node.visible) return this.errorResult(call.tool_use_id, "TALOS_BROWSER_TARGET_HIDDEN", "The stored upload target is hidden.", { state_version: session.stateVersion });
    if (targetState.disabled) return this.errorResult(call.tool_use_id, "TALOS_BROWSER_TARGET_DISABLED", "The stored upload target is disabled.", { state_version: session.stateVersion });
    if (!targetState.fileChooser) return this.errorResult(call.tool_use_id, "TALOS_BROWSER_UPLOAD_TARGET_INVALID", "The stored ref is not a file chooser control.", { state_version: session.stateVersion });
    if (!targetState.multiple && input.staged_file_ids.length > 1) {
      return this.errorResult(call.tool_use_id, "TALOS_BROWSER_UPLOAD_MULTIPLE_DENIED", "The selected file input accepts only one file.", { state_version: session.stateVersion });
    }

    const baselinePages = new Set(session.context.pages());
    let openedPage = false;
    let downloadObserved = false;
    const pageListener = (page: unknown) => { if (!baselinePages.has(page as never)) openedPage = true; };
    const downloadListener = () => { downloadObserved = true; };
    session.context.on("page", pageListener);
    session.page.on("download", downloadListener);
    const dispatchStateVersion = session.stateVersion + 1;
    let dispatchThresholdReached = false;
    let stateAdvanced = false;
    try {
      this.sessions.armHmiDispatchFence(session.sessionId, dispatchStateVersion);
      dispatchThresholdReached = true;
      onDispatch();
      await binding.setInputFiles(stagedFiles.map((file) => ({
        name: file.name,
        mimeType: file.mimeType,
        buffer: file.bytes,
      })));
      const assignedFiles = await binding.evaluate((element) => (
        Array.from((element as HTMLInputElement).files ?? []).map((file) => ({
          name: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        }))
      )).catch(() => null);
      const assignmentMatches = assignedFiles !== null
        && assignedFiles.length === stagedFiles.length
        && assignedFiles.every((assigned, index) => {
          const expected = stagedFiles[index];
          return expected !== undefined
            && assigned.name === expected.name
            && assigned.mimeType === expected.mimeType
            && assigned.sizeBytes === expected.sizeBytes;
        });
      if (!assignmentMatches) throw new Error("file_input_assignment_mismatch");
      await session.page.waitForTimeout(50);
      const current = session.recovery ? session : this.sessions.advanceState(session.sessionId);
      stateAdvanced = !session.recovery;
      if (current.recovery || openedPage || downloadObserved) {
        throw new Error(openedPage ? "new_context_opened" : downloadObserved ? "download_started" : "session_recovery_required");
      }

      const screenshot = await captureCanonicalBrowserFrame(current.page);
      const snapshot = await captureSnapshot(current.page);
      const verificationScreenshot = await captureCanonicalBrowserFrame(current.page);
      const verificationSnapshot = await captureSnapshot(current.page);
      if (sha256(screenshot) !== sha256(verificationScreenshot)
        || snapshot.documentToken !== await documentToken(current.page)
        || snapshot.domDigest !== verificationSnapshot.domDigest) {
        throw new Error("evidence_frame_changed");
      }
      await this.sessions.recordSnapshot(current.sessionId, snapshot);
      await this.sessions.recordFrame(current.sessionId, screenshot, current.stateVersion);
      const snapshotValue = {
        snapshot_id: snapshot.snapshotId,
        format: snapshot.format,
        text_digest: snapshot.textDigest,
        nodes: snapshot.nodes,
      };
      const result = this.successWithEvidence(
        call.tool_use_id,
        call.name,
        {
          url: browserEvidenceUrl(current.page.url()),
          title: await current.page.title(),
          state_version: current.stateVersion,
          target: { ref: node.ref, role: node.role, name: node.name },
          files: stagedFiles.map((file) => ({
            file_id: file.fileId,
            name: file.name,
            mime_type: file.mimeType,
            size_bytes: file.sizeBytes,
            sha256: file.sha256,
          })),
          screenshot: {
            mime_type: "image/png",
            width: current.viewport.width,
            height: current.viewport.height,
            sha256: sha256(screenshot),
          },
          snapshot: { ...snapshotValue, sha256: sha256(JSON.stringify(snapshotValue)) },
        },
        "Approved files were uploaded to the selected Browser control.",
        [
          { kind: "screenshot", source: screenshot, image: { type: "image", data: screenshot.toString("base64"), mimeType: "image/png" } },
          { kind: "snapshot", source: JSON.stringify(snapshotValue) },
        ],
      );
      if (result.isError) throw new Error("post_upload_output_validation");
      return result;
    } catch (error) {
      if (!dispatchThresholdReached) throw error;
      if (!stateAdvanced && !session.recovery) this.sessions.advanceState(session.sessionId);
      const reasonCode = error instanceof Error ? error.message : "post_dispatch_failure";
      const recovery = this.sessions.markRecoveryRequired(session.sessionId, reasonCode, dispatchStateVersion);
      throw new BrowserError("The browser upload may have taken effect but evidence could not be committed.", "TALOS_BROWSER_UPLOAD_RECOVERY_REQUIRED", 409, {
        state_version: recovery.stateVersion,
        reason_code: recovery.recovery?.reasonCode ?? reasonCode,
        idempotency_status: "ambiguous",
      });
    } finally {
      this.sessions.clearHmiDispatchFence(session.sessionId);
      session.context.off("page", pageListener);
      session.page.off("download", downloadListener);
    }
  }

  private success(
    toolUseId: string,
    name: string,
    rawStructured: Record<string, unknown>,
    text: string,
    kind: string,
    evidenceSource: Uint8Array | string | object,
    extraContent: Array<{ type: "image"; data: string; mimeType: string }> = [],
  ): CanonicalToolResult {
    return this.successWithEvidence(toolUseId, name, rawStructured, text, [{ kind, source: evidenceSource }], extraContent);
  }

  private successWithEvidence(
    toolUseId: string,
    name: string,
    rawStructured: Record<string, unknown>,
    text: string,
    evidenceSources: Array<{ kind: string; source: Uint8Array | string | object; image?: { type: "image"; data: string; mimeType: string } }>,
    extraContent: Array<{ type: "image"; data: string; mimeType: string }> = [],
  ): CanonicalToolResult {
    try {
      const structured = validateToolStructuredOutput(name, rawStructured);
      const evidence = evidenceSources.map(({ kind, source }) => {
        const digest = sha256(typeof source === "string" || source instanceof Uint8Array ? source : JSON.stringify(source));
        return {
          artifact_id: `${kind}-${digest.slice(7)}`,
          kind,
          sha256: digest,
          trusted_boundary: "untrusted_web_content",
        };
      });
      return toolResult({
        schema_version: "talos_tool_result_v1",
        tool_use_id: toolUseId,
        isError: false,
        content: [{ type: "text", text: text.slice(0, 60_000) }, ...evidenceSources.flatMap(({ image }) => image ? [image] : []), ...extraContent],
        structuredContent: { ...structured, evidence_ids: evidence.map((item) => item.artifact_id) },
        evidence,
      });
    } catch {
      return this.errorResult(toolUseId, "TALOS_BROWSER_TOOL_OUTPUT_INVALID", "The browser tool returned malformed output.");
    }
  }

  private errorResult(toolUseId: string, code: string, message: string, details: Record<string, unknown> = {}): CanonicalToolResult {
    return toolResult({
      schema_version: "talos_tool_result_v1",
      tool_use_id: toolUseId || "unknown",
      isError: true,
      content: [{ type: "text", text: message.slice(0, 4_096) }],
      structuredContent: { code, message: message.slice(0, 4_096), ...details },
      evidence: [],
    });
  }
}

async function documentToken(page: BrowserSession["page"]): Promise<string> {
  return page.evaluate(() => `${document.location.href}|${performance.timeOrigin}`);
}

function isConsequentialTool(name: string): boolean {
  return name === "browser_click" || name === "browser_file_upload";
}
