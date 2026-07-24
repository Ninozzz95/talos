import { createHash } from "node:crypto";
import type { Locator, Page } from "playwright";
import { parseDocument } from "yaml";
import { BrowserError } from "./BrowserErrors.js";
import { browserEvidenceUrl } from "./BrowserUrlPolicy.js";

const MAX_SNAPSHOT_BYTES = 512_000;
const MAX_SNAPSHOT_DEPTH = 64;
const MAX_VISITED_VALUES = 5_000;
const MAX_TARGETS = 250;
const MAX_NAME_BYTES = 256;
const MAX_DESTINATION_BYTES = 2_048;
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const REF_PATTERN = /^e[1-9][0-9]{0,9}$/;
const INTERACTIVE_ROLES = new Set([
  "button",
  "checkbox",
  "combobox",
  "link",
  "listbox",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "radio",
  "searchbox",
  "spinbutton",
  "switch",
  "tab",
  "textbox",
  "treeitem",
]);
const ACTIONABILITY_TIMEOUT_MS = 1_500;
const BOX_TOLERANCE_CSS_PX = 0.5;
const snapshotCandidates = new WeakMap<BrowserHmiRefSnapshot, Map<string, ParsedDescriptor>>();
const snapshotDocuments = new WeakMap<BrowserHmiRefSnapshot, BrowserHmiRefDocumentIdentity>();

export interface BrowserHmiRefDocumentIdentity {
  frameId: string;
  loaderId: string;
  url: string;
}

export interface BrowserHmiRefTarget {
  ref: string;
  role: string;
  name: string;
  destination: string | null;
}

export interface BrowserHmiRefSnapshot {
  snapshotId: string;
  stateVersion: number;
  sourceFrameSha256: string;
  viewport: { width: number; height: number };
  targets: BrowserHmiRefTarget[];
}

export interface BrowserHmiRefTargetIdentity {
  target: BrowserHmiRefTarget;
  locator: Locator;
  point: { normalized_x: number; normalized_y: number; x: number; y: number };
  position: { x: number; y: number };
  box: { x: number; y: number; width: number; height: number };
}

export interface CaptureBrowserHmiRefSnapshotInput {
  stateVersion: number;
  sourceFrameSha256: string;
  viewport: { width: number; height: number };
  documentIdentity: BrowserHmiRefDocumentIdentity;
}

type ParsedDescriptor = {
  ref: string;
  role: string;
  name: string;
  disabled: boolean;
  box: { x: number; y: number; width: number; height: number };
};

export async function captureBrowserHmiRefSnapshot(
  page: Page,
  input: CaptureBrowserHmiRefSnapshotInput,
): Promise<BrowserHmiRefSnapshot> {
  assertCaptureInput(page, input);

  let text: string;
  try {
    text = await page.ariaSnapshot({ mode: "ai", boxes: true });
  } catch {
    throw invalidSnapshot("Playwright could not capture the semantic browser snapshot.");
  }

  const byteLength = Buffer.byteLength(text, "utf8");
  if (byteLength > MAX_SNAPSHOT_BYTES) {
    throw snapshotBounds("The semantic browser snapshot exceeds the configured byte limit.");
  }

  const root = parseSnapshotDocument(text);
  const seenRefs = new Set<string>();
  const targets: BrowserHmiRefTarget[] = [];
  const candidates = new Map<string, ParsedDescriptor>();
  let visitedValues = 0;

  const registerDescriptor = (value: string, children: unknown): void => {
    const descriptor = parseDescriptor(value);
    if (descriptor === null) return;
    if (seenRefs.has(descriptor.ref)) {
      throw invalidSnapshot("The semantic browser snapshot contains a duplicate ref.");
    }
    seenRefs.add(descriptor.ref);

    if (!isEligibleTarget(descriptor, input.viewport)) return;
    candidates.set(descriptor.ref, descriptor);
    targets.push({
      ref: descriptor.ref,
      role: descriptor.role,
      name: descriptor.name,
      destination: descriptor.role === "link" ? directDestination(children) : null,
    });
    if (targets.length > MAX_TARGETS) {
      throw snapshotBounds("The semantic browser snapshot exceeds the configured target limit.");
    }
  };

  const visit = (value: unknown, depth: number): void => {
    if (depth > MAX_SNAPSHOT_DEPTH) {
      throw snapshotBounds("The semantic browser snapshot exceeds the configured depth limit.");
    }
    visitedValues += 1;
    if (visitedValues > MAX_VISITED_VALUES) {
      throw snapshotBounds("The semantic browser snapshot exceeds the configured node limit.");
    }

    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    if (typeof value === "string") {
      registerDescriptor(value, undefined);
      return;
    }
    if (!isPlainRecord(value)) return;

    for (const [key, children] of Object.entries(value)) {
      if (key.startsWith("/")) continue;
      registerDescriptor(key, children);
      visit(children, depth + 1);
    }
  };

  visit(root, 0);

  const snapshot: BrowserHmiRefSnapshot = {
    snapshotId: `hmi_ref_${createHash("sha256")
      .update(`${input.stateVersion}\0${input.sourceFrameSha256}\0${input.viewport.width}x${input.viewport.height}\0${input.documentIdentity.frameId}\0${input.documentIdentity.loaderId}\0${input.documentIdentity.url}\0${text}`)
      .digest("hex")}`,
    stateVersion: input.stateVersion,
    sourceFrameSha256: input.sourceFrameSha256,
    viewport: { ...input.viewport },
    targets,
  };
  snapshotCandidates.set(snapshot, candidates);
  snapshotDocuments.set(snapshot, { ...input.documentIdentity });
  return snapshot;
}

export function browserHmiRefSnapshotDocumentIdentity(
  snapshot: BrowserHmiRefSnapshot,
): BrowserHmiRefDocumentIdentity | undefined {
  const identity = snapshotDocuments.get(snapshot);
  return identity ? { ...identity } : undefined;
}

export async function resolveBrowserHmiRefTarget(
  page: Page,
  snapshot: BrowserHmiRefSnapshot,
  ref: string,
): Promise<BrowserHmiRefTargetIdentity> {
  if (!REF_PATTERN.test(ref)) throw staleTarget();
  const target = snapshot.targets.find((candidate) => candidate.ref === ref);
  const captured = snapshotCandidates.get(snapshot)?.get(ref);
  if (!target || !captured) throw staleTarget();

  const locator = page.locator(`aria-ref=${ref}`);
  try {
    if (await locator.count() !== 1 || !await locator.isVisible() || !await locator.isEnabled()) {
      throw staleTarget();
    }
    const initialBox = await locator.boundingBox();
    if (!initialBox || !boxesMatch(initialBox, captured.box)) throw staleTarget();
    const left = Math.max(0, initialBox.x);
    const top = Math.max(0, initialBox.y);
    const right = Math.min(snapshot.viewport.width, initialBox.x + initialBox.width);
    const bottom = Math.min(snapshot.viewport.height, initialBox.y + initialBox.height);
    if (right <= left || bottom <= top) throw staleTarget();
    const x = Math.min(snapshot.viewport.width - 1, Math.max(0, Math.floor((left + right) / 2)));
    const y = Math.min(snapshot.viewport.height - 1, Math.max(0, Math.floor((top + bottom) / 2)));
    const position = {
      x: x - initialBox.x,
      y: y - initialBox.y,
    };
    const scrollState = await readScrollState(locator);

    await locator.click({
      button: "left",
      clickCount: 1,
      position,
      trial: true,
      timeout: ACTIONABILITY_TIMEOUT_MS,
    });

    if (await readScrollState(locator) !== scrollState
      || await locator.count() !== 1
      || !await locator.isVisible()
      || !await locator.isEnabled()) {
      throw staleTarget();
    }
    const box = await locator.boundingBox();
    if (!box || !boxesMatch(box, initialBox) || !boxesMatch(box, captured.box)) throw staleTarget();

    return {
      target,
      locator,
      point: {
        normalized_x: roundCoordinate(x / snapshot.viewport.width),
        normalized_y: roundCoordinate(y / snapshot.viewport.height),
        x,
        y,
      },
      position,
      box: { ...box },
    };
  } catch (error) {
    if (error instanceof BrowserError) throw error;
    throw staleTarget();
  }
}

function parseSnapshotDocument(text: string): unknown {
  try {
    const document = parseDocument(text, {
      prettyErrors: false,
      strict: true,
      uniqueKeys: true,
    });
    if (document.errors.length > 0) {
      throw invalidSnapshot("The semantic browser snapshot is malformed.");
    }
    const value = document.toJS({ maxAliasCount: 0 });
    if (!Array.isArray(value)) {
      throw invalidSnapshot("The semantic browser snapshot root must be a sequence.");
    }
    return value;
  } catch (error) {
    if (error instanceof BrowserError) throw error;
    throw invalidSnapshot("The semantic browser snapshot contains unsupported YAML constructs.");
  }
}

function parseDescriptor(value: string): ParsedDescriptor | null {
  if (!value.includes("[ref=")) return null;

  let cursor = 0;
  const roleStart = cursor;
  while (cursor < value.length && /[a-z0-9_-]/.test(value[cursor] ?? "")) cursor += 1;
  const role = value.slice(roleStart, cursor);
  if (role === "" || role.length > 64) throw invalidSnapshot("A semantic target role is malformed.");
  cursor = skipSpaces(value, cursor);

  let name = "";
  if (value[cursor] === '"') {
    const parsed = parseQuotedName(value, cursor);
    name = normalizeName(parsed.value);
    cursor = skipSpaces(value, parsed.next);
  }

  const attributes = new Map<string, string | true>();
  while (cursor < value.length) {
    if (value[cursor] !== "[") throw invalidSnapshot("A semantic target descriptor is malformed.");
    const close = value.indexOf("]", cursor + 1);
    if (close < 0) throw invalidSnapshot("A semantic target descriptor is malformed.");
    const rawAttribute = value.slice(cursor + 1, close).trim();
    if (rawAttribute === "") throw invalidSnapshot("A semantic target attribute is empty.");
    const equals = rawAttribute.indexOf("=");
    const key = (equals < 0 ? rawAttribute : rawAttribute.slice(0, equals)).trim();
    const attributeValue = equals < 0 ? true : rawAttribute.slice(equals + 1).trim();
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(key) || attributeValue === "") {
      throw invalidSnapshot("A semantic target attribute is malformed.");
    }
    if (attributes.has(key)) throw invalidSnapshot("A semantic target attribute is duplicated.");
    attributes.set(key, attributeValue);
    cursor = skipSpaces(value, close + 1);
  }

  const ref = attributes.get("ref");
  const boxValue = attributes.get("box");
  if (typeof ref !== "string" || !REF_PATTERN.test(ref)) {
    throw invalidSnapshot("A semantic target ref is malformed.");
  }
  if (typeof boxValue !== "string") {
    throw invalidSnapshot("A semantic target box is missing.");
  }

  return {
    ref,
    role,
    name,
    disabled: attributes.get("disabled") === true,
    box: parseBox(boxValue),
  };
}

function parseQuotedName(value: string, start: number): { value: string; next: number } {
  let cursor = start + 1;
  let escaped = false;
  while (cursor < value.length) {
    const character = value[cursor];
    if (!escaped && character === '"') {
      const literal = value.slice(start, cursor + 1);
      try {
        const parsed = JSON.parse(literal);
        if (typeof parsed !== "string") throw new Error("not a string");
        return { value: parsed, next: cursor + 1 };
      } catch {
        throw invalidSnapshot("A semantic target name is malformed.");
      }
    }
    if (!escaped && character === "\\") escaped = true;
    else escaped = false;
    cursor += 1;
  }
  throw invalidSnapshot("A semantic target name is unterminated.");
}

function parseBox(value: string): { x: number; y: number; width: number; height: number } {
  const parts = value.split(",");
  if (parts.length !== 4) throw invalidSnapshot("A semantic target box is malformed.");
  const numbers = parts.map((part) => Number(part.trim()));
  if (numbers.some((number) => !Number.isFinite(number))) {
    throw invalidSnapshot("A semantic target box is malformed.");
  }
  const [x, y, width, height] = numbers as [number, number, number, number];
  if (width < 0 || height < 0 || Math.abs(x) > 100_000 || Math.abs(y) > 100_000 || width > 100_000 || height > 100_000) {
    throw invalidSnapshot("A semantic target box is outside supported bounds.");
  }
  return { x, y, width, height };
}

function isEligibleTarget(
  descriptor: ParsedDescriptor,
  viewport: { width: number; height: number },
): boolean {
  const { x, y, width, height } = descriptor.box;
  return INTERACTIVE_ROLES.has(descriptor.role)
    && descriptor.name !== ""
    && !descriptor.disabled
    && width > 0
    && height > 0
    && x < viewport.width
    && y < viewport.height
    && x + width > 0
    && y + height > 0;
}

function directDestination(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  for (const child of value) {
    if (!isPlainRecord(child)) continue;
    const raw = child["/url"];
    if (typeof raw !== "string" || Buffer.byteLength(raw, "utf8") > MAX_DESTINATION_BYTES) continue;
    const normalized = browserEvidenceUrl(raw);
    if (normalized !== "about:blank") return normalized;
  }
  return null;
}

function normalizeName(value: string): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (Buffer.byteLength(normalized, "utf8") > MAX_NAME_BYTES) {
    throw snapshotBounds("A semantic target name exceeds the configured byte limit.");
  }
  return normalized;
}

function assertCaptureInput(page: Page, input: CaptureBrowserHmiRefSnapshotInput): void {
  if (!Number.isSafeInteger(input.stateVersion) || input.stateVersion < 0 || !SHA256_PATTERN.test(input.sourceFrameSha256)) {
    throw invalidSnapshot("The semantic browser snapshot binding is invalid.");
  }
  const { width, height } = input.viewport;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 3_840 || height > 2_160) {
    throw invalidSnapshot("The semantic browser snapshot viewport is invalid.");
  }
  const actualViewport = page.viewportSize();
  if (actualViewport === null || actualViewport.width !== width || actualViewport.height !== height) {
    throw invalidSnapshot("The semantic browser snapshot viewport does not match the active page.");
  }
  const documentIdentity = input.documentIdentity;
  if (!documentIdentity
    || typeof documentIdentity.frameId !== "string"
    || documentIdentity.frameId === ""
    || Buffer.byteLength(documentIdentity.frameId, "utf8") > 512
    || typeof documentIdentity.loaderId !== "string"
    || Buffer.byteLength(documentIdentity.loaderId, "utf8") > 512
    || typeof documentIdentity.url !== "string"
    || Buffer.byteLength(documentIdentity.url, "utf8") > 8_192) {
    throw invalidSnapshot("The semantic browser snapshot document identity is invalid.");
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function skipSpaces(value: string, start: number): number {
  let cursor = start;
  while (value[cursor] === " ") cursor += 1;
  return cursor;
}

async function readScrollState(locator: Locator): Promise<string> {
  return locator.evaluate((element) => {
    const positions: Array<[string, number, number]> = [];
    const document = element.ownerDocument;
    const view = document.defaultView;
    if (!view) return "detached";
    positions.push(["window", view.scrollX, view.scrollY]);
    let ancestor = element.parentElement;
    let depth = 0;
    while (ancestor && depth < 128) {
      if (ancestor.scrollWidth > ancestor.clientWidth || ancestor.scrollHeight > ancestor.clientHeight) {
        positions.push([String(depth), ancestor.scrollLeft, ancestor.scrollTop]);
      }
      ancestor = ancestor.parentElement;
      depth += 1;
    }
    return JSON.stringify(positions);
  });
}

function boxesMatch(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
): boolean {
  return Math.abs(left.x - right.x) <= BOX_TOLERANCE_CSS_PX
    && Math.abs(left.y - right.y) <= BOX_TOLERANCE_CSS_PX
    && Math.abs(left.width - right.width) <= BOX_TOLERANCE_CSS_PX
    && Math.abs(left.height - right.height) <= BOX_TOLERANCE_CSS_PX;
}

function roundCoordinate(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function invalidSnapshot(message: string): BrowserError {
  return new BrowserError(message, "TALOS_BROWSER_HMI_REF_SNAPSHOT_INVALID", 409);
}

function snapshotBounds(message: string): BrowserError {
  return new BrowserError(message, "TALOS_BROWSER_HMI_REF_SNAPSHOT_BOUNDS", 413);
}

function staleTarget(): BrowserError {
  return new BrowserError("The semantic browser target changed before interaction.", "TALOS_BROWSER_TARGET_STALE", 409);
}
