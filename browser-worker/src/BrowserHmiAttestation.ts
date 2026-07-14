import type { CDPSession, Page } from "playwright";
import { BrowserError } from "./BrowserErrors.js";

const ACTIONABLE_SELECTOR = [
  "button",
  "a[href]",
  "input",
  "select",
  "textarea",
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="menuitem"]',
  '[role="tab"]',
  '[contenteditable="true"]',
].join(",");

const MAX_DESTINATION_BYTES = 8_192;
const OBJECT_GROUP = "talos-hmi-attestation";
const ORDINARY_GUARD_EVENT_TYPES = [
  "pointerover",
  "pointerenter",
  "pointermove",
  "pointerdown",
  "pointerup",
  "pointerout",
  "pointerleave",
  "mouseover",
  "mouseenter",
  "mousemove",
  "mousedown",
  "mouseup",
  "mouseout",
  "mouseleave",
  "focus",
  "focusin",
  "blur",
  "focusout",
  "selectstart",
  "click",
  "auxclick",
  "dblclick",
] as const;
const RELEVANT_EVENT_TYPES = new Set<string>(ORDINARY_GUARD_EVENT_TYPES);

export interface BrowserHmiTargetAttestation {
  backendNodeId: number;
  frameId: string;
  loaderId: string;
  documentUrl: string;
  tag: string;
  role: string | null;
  name: string;
  inputType: string | null;
  href: string | null;
  destination: string | null;
  formMethod: string | null;
  isEditable: boolean;
  isSubmit: boolean;
  isDownload: boolean;
  opensNewContext: boolean;
  browserDefaultAttestable: boolean;
  hasRelevantEventListeners: boolean;
  visible: boolean;
  disabled: boolean;
}

interface FrameTreeNode {
  frame: { id: string; loaderId: string; url: string };
  childFrames?: FrameTreeNode[];
}

interface IsolatedFacts {
  tag: string;
  role: string | null;
  name: string;
  input_type: string | null;
  href: string | null;
  destination: string | null;
  form_method: string | null;
  is_editable: boolean;
  is_submit: boolean;
  is_download: boolean;
  opens_new_context: boolean;
  browser_default_attestable: boolean;
  visible: boolean;
  disabled: boolean;
  bounds_exceeded: boolean;
}

export async function inspectBrowserTarget(
  page: Page,
  point: { x: number; y: number },
): Promise<BrowserHmiTargetAttestation> {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("DOM.enable");
    const [hit, frameTree] = await Promise.all([
      cdp.send("DOM.getNodeForLocation", {
        x: point.x,
        y: point.y,
        includeUserAgentShadowDOM: true,
      }),
      cdp.send("Page.getFrameTree"),
    ]);
    const frame = findFrame(frameTree.frameTree as FrameTreeNode, hit.frameId);
    if (!frame || !frame.loaderId) throw missingTarget();
    assertBounded(frame.url, MAX_DESTINATION_BYTES);

    const world = await cdp.send("Page.createIsolatedWorld", {
      frameId: hit.frameId,
      worldName: OBJECT_GROUP,
      grantUniveralAccess: false,
    });
    const resolved = await cdp.send("DOM.resolveNode", {
      backendNodeId: hit.backendNodeId,
      executionContextId: world.executionContextId,
      objectGroup: OBJECT_GROUP,
    });
    const hitObjectId = resolved.object.objectId;
    if (!hitObjectId) throw missingTarget();

    const actionable = await cdp.send("Runtime.callFunctionOn", {
      objectId: hitObjectId,
      functionDeclaration: `function () {
        let element = this;
        if (!element || element.nodeType !== 1) element = element?.parentElement ?? null;
        if (!element) return null;
        return globalThis.Element.prototype.closest.call(element, ${JSON.stringify(ACTIONABLE_SELECTOR)}) ?? element;
      }`,
      returnByValue: false,
      objectGroup: OBJECT_GROUP,
    });
    if (actionable.exceptionDetails || !actionable.result.objectId) throw missingTarget();

    const described = await cdp.send("DOM.describeNode", { objectId: actionable.result.objectId, depth: 0 });
    const factsResult = await cdp.send("Runtime.callFunctionOn", {
      objectId: actionable.result.objectId,
      functionDeclaration: isolatedFactsFunction(),
      returnByValue: true,
      objectGroup: OBJECT_GROUP,
    });
    if (factsResult.exceptionDetails || !factsResult.result.value) throw missingTarget();
    const facts = factsResult.result.value as IsolatedFacts;
    if (facts.bounds_exceeded) {
      throw new BrowserError("The browser target exceeds the bounded HMI contract.", "TALOS_BROWSER_HMI_TARGET_BOUNDS", 413);
    }
    const hasRelevantEventListeners = await hasUnexpectedRelevantListeners(cdp, hitObjectId);

    return {
      backendNodeId: described.node.backendNodeId,
      frameId: hit.frameId,
      loaderId: frame.loaderId,
      documentUrl: frame.url,
      tag: facts.tag,
      role: facts.role,
      name: facts.name,
      inputType: facts.input_type,
      href: facts.href,
      destination: facts.destination,
      formMethod: facts.form_method,
      isEditable: facts.is_editable,
      isSubmit: facts.is_submit,
      isDownload: facts.is_download,
      opensNewContext: facts.opens_new_context,
      browserDefaultAttestable: facts.browser_default_attestable,
      hasRelevantEventListeners,
      visible: facts.visible,
      disabled: facts.disabled,
    };
  } finally {
    await cdp.send("Runtime.releaseObjectGroup", { objectGroup: OBJECT_GROUP }).catch(() => undefined);
    await cdp.detach().catch(() => undefined);
  }
}

export async function currentMainDocumentIdentity(page: Page): Promise<{ frameId: string; loaderId: string; url: string }> {
  const cdp = await page.context().newCDPSession(page);
  try {
    const tree = await cdp.send("Page.getFrameTree");
    return {
      frameId: tree.frameTree.frame.id,
      loaderId: tree.frameTree.frame.loaderId,
      url: tree.frameTree.frame.url,
    };
  } finally {
    await cdp.detach().catch(() => undefined);
  }
}

export async function dispatchGuardedBrowserClick(
  page: Page,
  point: { x: number; y: number },
  expected: BrowserHmiTargetAttestation,
  options: {
    button: "left";
    clickCount: number;
    effectClassification: "ordinary" | "sensitive";
    onDispatch: () => void;
  },
): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  let guardObjectId: string | undefined;
  try {
    await cdp.send("DOM.enable");
    const [hit, frameTree] = await Promise.all([
      cdp.send("DOM.getNodeForLocation", {
        x: point.x,
        y: point.y,
        includeUserAgentShadowDOM: true,
      }),
      cdp.send("Page.getFrameTree"),
    ]);
    const frame = findFrame(frameTree.frameTree as FrameTreeNode, hit.frameId);
    if (!frame
      || frame.id !== expected.frameId
      || frame.loaderId !== expected.loaderId
      || frame.url !== expected.documentUrl) {
      throw staleDispatchTarget();
    }

    const world = await cdp.send("Page.createIsolatedWorld", {
      frameId: hit.frameId,
      worldName: `${OBJECT_GROUP}-dispatch`,
      grantUniveralAccess: false,
    });
    const resolved = await cdp.send("DOM.resolveNode", {
      backendNodeId: hit.backendNodeId,
      executionContextId: world.executionContextId,
      objectGroup: OBJECT_GROUP,
    });
    if (!resolved.object.objectId) throw staleDispatchTarget();
    const actionable = await cdp.send("Runtime.callFunctionOn", {
      objectId: resolved.object.objectId,
      functionDeclaration: `function () {
        let element = this;
        if (!element || element.nodeType !== 1) element = element?.parentElement ?? null;
        if (!element) return null;
        return globalThis.Element.prototype.closest.call(element, ${JSON.stringify(ACTIONABLE_SELECTOR)}) ?? element;
      }`,
      returnByValue: false,
      objectGroup: OBJECT_GROUP,
    });
    if (actionable.exceptionDetails || !actionable.result.objectId) throw staleDispatchTarget();
    const described = await cdp.send("DOM.describeNode", { objectId: actionable.result.objectId, depth: 0 });
    if (described.node.backendNodeId !== expected.backendNodeId) throw staleDispatchTarget();

    const guard = await cdp.send("Runtime.callFunctionOn", {
      objectId: actionable.result.objectId,
      functionDeclaration: `function (expectedClickCount, effectClassification, expectedEffect) {
        const target = this;
        const win = target?.ownerDocument?.defaultView ?? null;
        if (!win || !target.isConnected) return null;
        const ordinary = effectClassification === "ordinary";
        const types = ordinary
          ? ${JSON.stringify(ORDINARY_GUARD_EVENT_TYPES)}
          : ["mousedown", "mouseup", "click"];
        const transitionTypes = new globalThis.Set([
          "pointerout", "pointerleave", "mouseout", "mouseleave", "blur", "focusout",
        ]);
        const buttonTypes = new globalThis.Set([
          "pointerdown", "pointerup", "mousedown", "mouseup", "click", "auxclick", "dblclick",
        ]);
        const detailTypes = new globalThis.Set(["mousedown", "mouseup", "click"]);
        const state = { mousedown: false, mouseup: false, click: false, rejected: false };
        const effectMatches = () => {
          const attr = (name) => globalThis.Element.prototype.getAttribute.call(target, name);
          const has = (name) => globalThis.Element.prototype.hasAttribute.call(target, name);
          const tag = String(target.localName ?? "").toLowerCase();
          const input = target instanceof globalThis.HTMLInputElement ? target : null;
          const button = target instanceof globalThis.HTMLButtonElement ? target : null;
          const anchor = target instanceof globalThis.HTMLAnchorElement ? target : null;
          const formControl = input || button || target instanceof globalThis.HTMLSelectElement || target instanceof globalThis.HTMLTextAreaElement ? target : null;
          const form = formControl?.form ?? null;
          const href = anchor?.href ?? null;
          const destination = href ?? form?.action ?? null;
          const explicitTarget = anchor?.target
            || ("formTarget" in (formControl ?? {}) ? formControl.formTarget : "")
            || form?.target
            || target.ownerDocument.querySelector("base[target]")?.getAttribute("target")
            || "";
          const normalizedTarget = String(explicitTarget).trim().toLowerCase();
          const opensNewContext = normalizedTarget !== "" && !["_self", "_top", "_parent"].includes(normalizedTarget);
          const activationAttributes = ["popovertarget", "command", "commandfor", "interesttarget"];
          const inertButton = Boolean(
            ((button && button.type === "button") || (input && input.type === "button"))
            && !activationAttributes.some(has),
          );
          let safeAnchor = false;
          if (anchor && !has("download") && !has("ping") && !has("attributionsrc")
            && (normalizedTarget === "" || normalizedTarget === "_self")) {
            try {
              const parsed = new globalThis.URL(anchor.href);
              safeAnchor = (parsed.protocol === "http:" || parsed.protocol === "https:")
                && parsed.username === ""
                && parsed.password === "";
            } catch {
              safeAnchor = false;
            }
          }
          const browserDefaultAttestable = inertButton || safeAnchor;
          const isEditable = target.isContentEditable
            || tag === "textarea"
            || tag === "select"
            || (input !== null && !["button", "submit", "reset", "checkbox", "radio", "file", "hidden"].includes(input.type));
          const isSubmit = (button?.type ?? input?.type ?? null) === "submit";
          const disabled = Boolean(formControl?.disabled) || attr("aria-disabled") === "true";
          return target.isConnected
            && win.location.href === expectedEffect.documentUrl
            && tag === expectedEffect.tag
            && (input?.type ?? null) === expectedEffect.inputType
            && href === expectedEffect.href
            && destination === expectedEffect.destination
            && (form ? form.method.toLowerCase() : null) === expectedEffect.formMethod
            && isEditable === expectedEffect.isEditable
            && isSubmit === expectedEffect.isSubmit
            && Boolean(anchor && has("download")) === expectedEffect.isDownload
            && opensNewContext === expectedEffect.opensNewContext
            && browserDefaultAttestable === expectedEffect.browserDefaultAttestable
            && disabled === expectedEffect.disabled;
        };
        const listener = (event) => {
          const path = globalThis.Event.prototype.composedPath.call(event);
          const allowed = event.isTrusted === true
            && (!buttonTypes.has(event.type) || event.button === 0)
            && (!detailTypes.has(event.type) || event.detail === expectedClickCount)
            && (transitionTypes.has(event.type) || path.includes(target))
            && (!ordinary || effectMatches());
          if (!allowed) {
            state.rejected = true;
            globalThis.Event.prototype.preventDefault.call(event);
            globalThis.Event.prototype.stopImmediatePropagation.call(event);
            return;
          }
          state[event.type] = true;
          if (ordinary) globalThis.Event.prototype.stopImmediatePropagation.call(event);
        };
        for (const type of types) win.addEventListener(type, listener, true);
        return { win, types, listener, state };
      }`,
      arguments: [
        { value: options.clickCount },
        { value: options.effectClassification },
        { value: dispatchEffectSignature(expected) },
      ],
      returnByValue: false,
      objectGroup: OBJECT_GROUP,
    });
    if (guard.exceptionDetails || !guard.result.objectId) throw staleDispatchTarget();
    guardObjectId = guard.result.objectId;

    if (options.effectClassification === "ordinary"
      && await hasUnexpectedRelevantListeners(cdp, resolved.object.objectId, ORDINARY_GUARD_EVENT_TYPES)) {
      throw staleDispatchTarget();
    }

    options.onDispatch();
    await page.mouse.click(point.x, point.y, {
      button: options.button,
      clickCount: options.clickCount,
    });

    try {
      const verification = await cdp.send("Runtime.callFunctionOn", {
        objectId: guardObjectId,
        functionDeclaration: `function () {
          for (const type of this.types) this.win.removeEventListener(type, this.listener, true);
          return {
            allowed: this.state.rejected !== true
              && this.state.mousedown === true
              && this.state.mouseup === true
              && this.state.click === true,
          };
        }`,
        returnByValue: true,
      });
      guardObjectId = undefined;
      if (verification.result.value?.allowed !== true) throw new Error("dispatch_guard_rejected");
    } catch (error) {
      const currentTree = await cdp.send("Page.getFrameTree").catch(() => undefined);
      const currentFrame = currentTree
        ? findFrame(currentTree.frameTree as FrameTreeNode, expected.frameId)
        : null;
      if (!currentFrame || currentFrame.loaderId === expected.loaderId) throw error;
      guardObjectId = undefined;
    }
  } finally {
    if (guardObjectId) {
      await cdp.send("Runtime.callFunctionOn", {
        objectId: guardObjectId,
        functionDeclaration: `function () {
          for (const type of this.types) this.win.removeEventListener(type, this.listener, true);
        }`,
        returnByValue: true,
      }).catch(() => undefined);
    }
    await cdp.send("Runtime.releaseObjectGroup", { objectGroup: OBJECT_GROUP }).catch(() => undefined);
    await cdp.detach().catch(() => undefined);
  }
}

async function hasUnexpectedRelevantListeners(
  cdp: CDPSession,
  targetObjectId: string,
  expectedGuardTypes: readonly string[] = [],
): Promise<boolean> {
  try {
    const path = await cdp.send("Runtime.callFunctionOn", {
      objectId: targetObjectId,
      functionDeclaration: `function () {
        const values = [];
        const seen = new globalThis.Set();
        let node = this;
        while (node) {
          if (seen.has(node) || values.length >= 128) return null;
          seen.add(node);
          values.push(node);
          node = node.assignedSlot ?? node.parentNode ?? node.host ?? node.getRootNode?.()?.host ?? null;
        }
        const document = this?.ownerDocument ?? (this?.nodeType === 9 ? this : null);
        if (document && !seen.has(document)) {
          if (values.length >= 128) return null;
          seen.add(document);
          values.push(document);
        }
        const win = document?.defaultView ?? null;
        if (win && !seen.has(win)) {
          if (values.length >= 128) return null;
          values.push(win);
        }
        return values;
      }`,
      returnByValue: false,
      objectGroup: OBJECT_GROUP,
    });
    if (path.exceptionDetails || !path.result.objectId) return true;

    const properties = await cdp.send("Runtime.getProperties", {
      objectId: path.result.objectId,
      ownProperties: true,
    });
    const objectIds = properties.result
      .filter((property) => /^\d+$/.test(property.name) && property.value?.objectId)
      .map((property) => property.value?.objectId)
      .filter((objectId): objectId is string => typeof objectId === "string");
    if (objectIds.length === 0) return true;

    const actualCounts = new Map<string, number>();
    for (const objectId of objectIds) {
      const inspected = await cdp.send("DOMDebugger.getEventListeners", { objectId });
      for (const listener of inspected.listeners) {
        if (!RELEVANT_EVENT_TYPES.has(listener.type)) continue;
        actualCounts.set(listener.type, (actualCounts.get(listener.type) ?? 0) + 1);
      }
    }

    const actualTotal = [...actualCounts.values()].reduce((total, count) => total + count, 0);
    if (expectedGuardTypes.length === 0) return actualTotal > 0;
    if (actualTotal !== expectedGuardTypes.length) return true;

    const expectedCounts = new Map<string, number>();
    for (const type of expectedGuardTypes) {
      expectedCounts.set(type, (expectedCounts.get(type) ?? 0) + 1);
    }
    if (actualCounts.size !== expectedCounts.size) return true;
    for (const [type, count] of expectedCounts) {
      if (actualCounts.get(type) !== count) return true;
    }
    return false;
  } catch {
    return true;
  }
}

function dispatchEffectSignature(expected: BrowserHmiTargetAttestation) {
  return {
    documentUrl: expected.documentUrl,
    tag: expected.tag,
    inputType: expected.inputType,
    href: expected.href,
    destination: expected.destination,
    formMethod: expected.formMethod,
    isEditable: expected.isEditable,
    isSubmit: expected.isSubmit,
    isDownload: expected.isDownload,
    opensNewContext: expected.opensNewContext,
    browserDefaultAttestable: expected.browserDefaultAttestable,
    disabled: expected.disabled,
  };
}

function findFrame(tree: FrameTreeNode, frameId: string): FrameTreeNode["frame"] | null {
  if (tree.frame.id === frameId) return tree.frame;
  for (const child of tree.childFrames ?? []) {
    const found = findFrame(child, frameId);
    if (found) return found;
  }
  return null;
}

function assertBounded(value: string, maxBytes: number): void {
  if (Buffer.byteLength(value, "utf8") > maxBytes) {
    throw new BrowserError("The browser target exceeds the bounded HMI contract.", "TALOS_BROWSER_HMI_TARGET_BOUNDS", 413);
  }
}

function missingTarget(): BrowserError {
  return new BrowserError("No browser target exists at this point.", "TALOS_BROWSER_HMI_TARGET_MISSING", 403);
}

function staleDispatchTarget(): BrowserError {
  return new BrowserError("The browser target changed before pointer dispatch.", "TALOS_BROWSER_TARGET_STALE", 409);
}

function isolatedFactsFunction(): string {
  return `function () {
    const element = this;
    const encoder = new globalThis.TextEncoder();
    const bytes = (value) => encoder.encode(String(value ?? "")).byteLength;
    const bounded = (value, maxBytes) => {
      const source = String(value ?? "");
      if (bytes(source) <= maxBytes) return source;
      let result = "";
      for (const character of source) {
        if (bytes(result + character) > maxBytes) break;
        result += character;
      }
      return result;
    };
    const attr = (name) => globalThis.Element.prototype.getAttribute.call(element, name);
    const has = (name) => globalThis.Element.prototype.hasAttribute.call(element, name);
    const tag = String(element.localName ?? "").toLowerCase();
    const input = element instanceof globalThis.HTMLInputElement ? element : null;
    const button = element instanceof globalThis.HTMLButtonElement ? element : null;
    const anchor = element instanceof globalThis.HTMLAnchorElement ? element : null;
    const formControl = input || button || element instanceof globalThis.HTMLSelectElement || element instanceof globalThis.HTMLTextAreaElement ? element : null;
    const form = formControl?.form ?? null;
    const explicitRole = bounded((attr("role") ?? "").trim().toLowerCase(), 64) || null;
    const implicitRole = tag === "button"
      ? "button"
      : tag === "a" && anchor?.href
        ? "link"
        : tag === "select"
          ? "combobox"
          : tag === "textarea"
            ? "textbox"
            : tag === "input"
              ? input?.type === "checkbox" ? "checkbox" : input?.type === "radio" ? "radio" : input?.type === "submit" || input?.type === "button" ? "button" : "textbox"
              : null;
    const rawName = attr("aria-label")
      ?? (input?.type === "submit" || input?.type === "button" ? input.value : null)
      ?? attr("alt")
      ?? element.textContent
      ?? "";
    const href = anchor?.href ?? null;
    const destination = href ?? form?.action ?? null;
    const explicitTarget = anchor?.target
      || ("formTarget" in (formControl ?? {}) ? formControl.formTarget : "")
      || form?.target
      || globalThis.document.querySelector("base[target]")?.getAttribute("target")
      || "";
    const normalizedTarget = String(explicitTarget).trim().toLowerCase();
    const opensNewContext = normalizedTarget !== "" && !["_self", "_top", "_parent"].includes(normalizedTarget);
    const activationAttributes = ["popovertarget", "command", "commandfor", "interesttarget"];
    const inertButton = Boolean(
      ((button && button.type === "button") || (input && input.type === "button"))
      && !activationAttributes.some(has),
    );
    let safeAnchor = false;
    if (anchor && !has("download") && !has("ping") && !has("attributionsrc")
      && (normalizedTarget === "" || normalizedTarget === "_self")) {
      try {
        const parsed = new globalThis.URL(anchor.href);
        safeAnchor = (parsed.protocol === "http:" || parsed.protocol === "https:")
          && parsed.username === ""
          && parsed.password === "";
      } catch {
        safeAnchor = false;
      }
    }
    const style = globalThis.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      tag: bounded(tag, 64),
      role: explicitRole ?? implicitRole,
      name: bounded(String(rawName).replace(/\\s+/g, " ").trim(), 256),
      input_type: input ? bounded(input.type.toLowerCase(), 64) : null,
      href: href && bytes(href) <= ${MAX_DESTINATION_BYTES} ? href : null,
      destination: destination && bytes(destination) <= ${MAX_DESTINATION_BYTES} ? destination : null,
      form_method: form ? bounded(form.method.toLowerCase(), 16) : null,
      is_editable: element.isContentEditable || tag === "textarea" || tag === "select" || (input !== null && !["button", "submit", "reset", "checkbox", "radio", "file", "hidden"].includes(input.type)),
      is_submit: (button?.type ?? input?.type ?? null) === "submit",
      is_download: Boolean(anchor && has("download")),
      opens_new_context: opensNewContext,
      browser_default_attestable: inertButton || safeAnchor,
      visible: rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0",
      disabled: Boolean(formControl?.disabled) || attr("aria-disabled") === "true",
      bounds_exceeded: Boolean((href && bytes(href) > ${MAX_DESTINATION_BYTES}) || (destination && bytes(destination) > ${MAX_DESTINATION_BYTES})),
    };
  }`;
}
