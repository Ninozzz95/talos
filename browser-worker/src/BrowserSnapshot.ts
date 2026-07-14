import { randomUUID } from "node:crypto";
import type { ElementHandle, Page } from "playwright";

export interface SnapshotNode {
  ref: string;
  role: string;
  name: string;
  href?: string;
  level?: number;
  visible: boolean;
}

export interface BrowserSnapshotResult {
  snapshotId: string;
  format: "accessibility_refs_v1";
  nodes: SnapshotNode[];
  textDigest: string;
  /** Internal binding used to reject a ref after a document reload/navigation. */
  documentToken?: string;
  /** Internal identity bindings; intentionally excluded from serialized snapshots. */
  refBindings?: ReadonlyMap<string, ElementHandle<Element>>;
  /** Internal digest over DOM structure and ARIA attributes. */
  domDigest?: string;
}

interface RawSnapshotNode {
  role: string;
  name: string;
  href?: string;
  level?: number;
  visible: boolean;
  bindingId: string;
}

interface RawSnapshotPage {
  nodes: RawSnapshotNode[];
  textDigest: string;
  documentToken: string;
  domDigest: string;
}

const MAX_NODE_NAME_LENGTH = 200;
const MAX_NODE_HREF_LENGTH = 2_048;
const MAX_DOCUMENT_TOKEN_LENGTH = 4_096;
const MAX_SNAPSHOT_NODES = 200;
const MAX_DOM_ELEMENTS_INSPECTED = 5_000;
const MAX_TEXT_NODES_INSPECTED = 5_000;
const MAX_TEXT_DIGEST_LENGTH = 4_000;
const MAX_DOM_DIGEST_INPUT_LENGTH = 60_000;

function boundedUtf8(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;
  let result = "";
  let resultBytes = 0;
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (resultBytes + characterBytes > maxBytes) break;
    result += character;
    resultBytes += characterBytes;
  }
  return result;
}

export async function captureSnapshot(page: Page): Promise<BrowserSnapshotResult> {
  const bindingKey = `__talos_snapshot_${randomUUID().replaceAll("-", "")}`;
  const snapshot = await page.evaluate(async (limits) => {
    const root = document.body;
    if (!root) return { nodes: [], textDigest: "", documentToken: `${document.location.href}|${performance.timeOrigin}`, domDigest: "sha256:empty" };
    const encoder = new TextEncoder();
    const bindings = new Map<string, Element>();
    Object.defineProperty(globalThis, limits.bindingKey, { configurable: true, value: bindings });
    const secretControlSelector = 'input, textarea, select, option, [contenteditable="true"], [role="textbox"]';
    const dom = {
      boundedUtf8(value: string, maxBytes: number): string {
        let result = "";
        let resultBytes = 0;
        for (const character of value) {
          const characterBytes = encoder.encode(character).byteLength;
          if (resultBytes + characterBytes > maxBytes) break;
          result += character;
          resultBytes += characterBytes;
        }
        return result;
      },
      boundedText(value: string, maxBytes: number): string {
        let result = "";
        let resultBytes = 0;
        let pendingSpace = false;
        let inspectedCharacters = 0;
        for (const character of value) {
          inspectedCharacters++;
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
            resultBytes++;
            pendingSpace = false;
          }
          result += character;
          resultBytes += characterBytes;
        }
        return result;
      },
      descendantTextName(element: Element, maxBytes: number): string {
        const nameWalker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        const nameParts: string[] = [];
        let nameBytes = 0;
        let inspectedNameNodes = 0;
        let nameNode = nameWalker.nextNode();
        while (nameNode && nameBytes < maxBytes && inspectedNameNodes < 32) {
          inspectedNameNodes++;
          if (nameNode.parentElement?.closest(secretControlSelector) !== null) {
            nameNode = nameWalker.nextNode();
            continue;
          }
          const separatorBytes = nameParts.length > 0 ? 1 : 0;
          const value = dom.boundedText(nameNode.nodeValue || "", maxBytes - nameBytes - separatorBytes);
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
        for (const element of elements) {
          if (inspectedElements++ >= 16 || nameBytes >= maxBytes) break;
          const separatorBytes = nameParts.length > 0 ? 1 : 0;
          const value = dom.descendantTextName(element, maxBytes - nameBytes - separatorBytes);
          if (value) {
            nameParts.push(value);
            nameBytes += separatorBytes + encoder.encode(value).byteLength;
          }
        }
        return nameParts.join(" ");
      },
    };
    const semanticTags = new Set([
      "H1", "H2", "H3", "H4", "H5", "H6", "A", "BUTTON", "INPUT", "TEXTAREA", "SELECT", "IMG", "LI",
      "MAIN", "NAV", "ARTICLE", "SECTION", "P", "DL", "DT", "DD", "TABLE", "TH", "TD",
    ]);
    const nodes: RawSnapshotNode[] = [];
    const domParts: string[] = [];
    const rootAttributes = [...root.attributes]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((attribute) => `${attribute.name}=${dom.boundedUtf8(attribute.value, 256)}`)
      .join("|");
    domParts.push(`<${root.tagName.toLowerCase()} ${rootAttributes}>`);
    const elementWalker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let inspectedElements = 0;

    let current = elementWalker.nextNode();
    while (current && inspectedElements < limits.maxElements && nodes.length < limits.maxNodes) {
      inspectedElements++;
      const element = current as Element;
      if (domParts.length < limits.maxDomParts) {
        const attributes = [...element.attributes]
          .sort((left, right) => left.name.localeCompare(right.name))
          .map((attribute) => {
            const controlValue = element.matches(secretControlSelector) && attribute.name.toLocaleLowerCase() === "value";
            return `${attribute.name}=${controlValue ? "[redacted]" : dom.boundedUtf8(attribute.value, 256)}`;
          })
          .join("|");
        domParts.push(`<${element.tagName.toLowerCase()} ${attributes}>`);
      }
      const isLeafText = ["DIV", "SPAN", "STRONG", "SMALL"].includes(element.tagName) && element.children.length === 0;
      if (!semanticTags.has(element.tagName) && !element.hasAttribute("role") && !isLeafText) {
        current = elementWalker.nextNode();
        continue;
      }

      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const visible = style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      if (!visible) {
        current = elementWalker.nextNode();
        continue;
      }

      const tag = element.tagName.toLowerCase();
      const input = element as HTMLInputElement;
      const inputType = tag === "input" ? input.type.toLocaleLowerCase() : "";
      const role = dom.boundedText(
        element.getAttribute("role")
        || (tag.startsWith("h") ? "heading" : tag === "a" ? "link" : tag === "button" ? "button"
          : tag === "input" && ["button", "submit", "reset", "image", "file"].includes(inputType) ? "button"
            : tag === "input" && inputType === "checkbox" ? "checkbox"
              : tag === "input" && inputType === "radio" ? "radio"
                : tag === "select" ? "combobox"
                  : isLeafText ? "text" : tag),
        64,
      );
      const isFormControl = tag === "input" || tag === "textarea" || tag === "select";
      const labelledBy = dom.boundedText(element.getAttribute("aria-labelledby") || "", 512)
        .split(" ")
        .slice(0, 16)
        .map((id) => document.getElementById(id))
        .filter((label): label is HTMLElement => label !== null);
      let name = dom.elementsTextName(labelledBy, limits.maxNodeNameLength);
      if (!name) name = dom.boundedText(element.getAttribute("aria-label") || "", limits.maxNodeNameLength);
      if (!name && isFormControl) {
        const labels = (element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).labels;
        if (labels) name = dom.elementsTextName(labels, limits.maxNodeNameLength);
      }
      if (!name) name = dom.boundedText(element.getAttribute("alt") || "", limits.maxNodeNameLength);
      if (!name) name = dom.boundedText(element.getAttribute("placeholder") || "", limits.maxNodeNameLength);
      if (!name) name = dom.boundedText(element.getAttribute("title") || "", limits.maxNodeNameLength);
      if (!name && !isFormControl) name = dom.descendantTextName(element, limits.maxNodeNameLength);
      if (name.length === 0) {
        current = elementWalker.nextNode();
        continue;
      }

      let href: string | undefined;
      if (tag === "a") {
        const rawHref = dom.boundedUtf8(element.getAttribute("href") || "", limits.maxNodeHrefLength).trim();
        const baseHref = dom.boundedUtf8(document.baseURI, limits.maxNodeHrefLength);
        try {
          const absoluteHref = new URL(rawHref, baseHref);
          if ((absoluteHref.protocol === "http:" || absoluteHref.protocol === "https:")
            && absoluteHref.username === ""
            && absoluteHref.password === "") {
            href = absoluteHref.origin;
          }
        } catch {
          href = undefined;
        }
      }

      const bindingId = `${limits.bindingPrefix}${nodes.length + 1}`;
      bindings.set(bindingId, element);
      nodes.push({ role, name, ...(href === undefined ? {} : { href }), level: tag.startsWith("h") ? Number(tag.slice(1)) : undefined, visible, bindingId });
      current = elementWalker.nextNode();
    }

    const textParts: string[] = [];
    const textWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let textBytes = 0;
    let inspectedTextNodes = 0;
    let textNode = textWalker.nextNode();
    while (textNode && textBytes < limits.maxTextLength && inspectedTextNodes < limits.maxTextNodes) {
      inspectedTextNodes++;
      const parent = textNode.parentElement;
      const hidden = !parent
        || parent.closest('[hidden], [aria-hidden="true"]') !== null
        || parent.closest(secretControlSelector) !== null
        || getComputedStyle(parent).display === "none"
        || getComputedStyle(parent).visibility === "hidden";
      if (!hidden) {
        const separatorBytes = textParts.length > 0 ? 1 : 0;
        const value = dom.boundedText(textNode.nodeValue || "", limits.maxTextLength - textBytes - separatorBytes);
        if (value) {
          textParts.push(value);
          textBytes += separatorBytes + encoder.encode(value).byteLength;
        }
      }
      if (domParts.length < limits.maxDomParts && textNode.parentElement?.closest(secretControlSelector) === null) {
        domParts.push(`#${dom.boundedText(textNode.nodeValue || "", 256)}`);
      }
      textNode = textWalker.nextNode();
    }

    const domCanonical = dom.boundedUtf8(domParts.join("\n"), limits.maxDomDigestInputLength);
    const digestBytes = await globalThis.crypto?.subtle?.digest("SHA-256", encoder.encode(domCanonical));
    const domDigest = digestBytes
      ? `sha256:${Array.from(new Uint8Array(digestBytes), (byte) => byte.toString(16).padStart(2, "0")).join("")}`
      : `fallback:${domCanonical.length}:${domCanonical.charCodeAt(0) || 0}:${domCanonical.charCodeAt(domCanonical.length - 1) || 0}`;
    return { nodes, textDigest: textParts.join(" "), documentToken: `${document.location.href}|${performance.timeOrigin}`, domDigest };
  }, {
    maxNodeNameLength: MAX_NODE_NAME_LENGTH,
    maxNodeHrefLength: MAX_NODE_HREF_LENGTH,
    maxNodes: MAX_SNAPSHOT_NODES,
    maxElements: MAX_DOM_ELEMENTS_INSPECTED,
    maxTextNodes: MAX_TEXT_NODES_INSPECTED,
    maxTextLength: MAX_TEXT_DIGEST_LENGTH,
    maxDomParts: MAX_DOM_ELEMENTS_INSPECTED + MAX_TEXT_NODES_INSPECTED,
    maxDomDigestInputLength: MAX_DOM_DIGEST_INPUT_LENGTH,
    bindingKey,
    bindingPrefix: `${bindingKey}_`,
  });

  const rawNodes = snapshot.nodes as RawSnapshotNode[];
  const refBindings = new Map<string, ElementHandle<Element>>();
  try {
    for (let index = 0; index < rawNodes.length; index += 1) {
      const binding = await page.evaluateHandle(({ key, id }) => {
        const bindings = (globalThis as typeof globalThis & { [key: string]: Map<string, Element> | undefined })[key];
        return bindings?.get(id) ?? null;
      }, { key: bindingKey, id: rawNodes[index].bindingId });
      const element = binding.asElement();
      if (element) refBindings.set(`r${index + 1}`, element);
      else await binding.dispose();
    }
  } finally {
    await page.evaluate((key) => { delete (globalThis as typeof globalThis & { [key: string]: unknown })[key]; }, bindingKey).catch(() => undefined);
  }

  const nodes = rawNodes.map((node, index) => ({
    ...node,
    bindingId: undefined,
    ref: `r${index + 1}`,
    role: boundedUtf8(node.role, 64),
    name: boundedUtf8(node.name, MAX_NODE_NAME_LENGTH),
    ...(node.href === undefined ? {} : { href: boundedUtf8(node.href, MAX_NODE_HREF_LENGTH) }),
  })).map(({ bindingId: _bindingId, ...node }) => node);
  const result: BrowserSnapshotResult = {
    snapshotId: `snap_${randomUUID()}`,
    format: "accessibility_refs_v1",
    nodes,
    textDigest: boundedUtf8(snapshot.textDigest, MAX_TEXT_DIGEST_LENGTH),
  };
  Object.defineProperty(result, "documentToken", {
    value: boundedUtf8((snapshot as RawSnapshotPage).documentToken, MAX_DOCUMENT_TOKEN_LENGTH),
    enumerable: false,
    writable: false,
  });
  Object.defineProperty(result, "refBindings", { value: refBindings, enumerable: false, writable: false });
  Object.defineProperty(result, "domDigest", {
    value: boundedUtf8((snapshot as RawSnapshotPage).domDigest, 128),
    enumerable: false,
    writable: false,
  });
  return result;
}
