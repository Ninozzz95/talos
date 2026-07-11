import { randomUUID } from "node:crypto";
import type { Page } from "playwright";

export interface SnapshotNode {
  ref: string;
  role: string;
  name: string;
  level?: number;
  visible: boolean;
}

export interface BrowserSnapshotResult {
  snapshotId: string;
  format: "accessibility_refs_v1";
  nodes: SnapshotNode[];
  textDigest: string;
}

interface RawSnapshotNode {
  role: string;
  name: string;
  level?: number;
  visible: boolean;
}

const MAX_NODE_NAME_LENGTH = 200;
const MAX_SNAPSHOT_NODES = 200;
const MAX_DOM_ELEMENTS_INSPECTED = 5_000;
const MAX_TEXT_NODES_INSPECTED = 5_000;
const MAX_TEXT_DIGEST_LENGTH = 4_000;

export async function captureSnapshot(page: Page): Promise<BrowserSnapshotResult> {
  const snapshot = await page.evaluate((limits) => {
    const root = document.body;
    if (!root) return { nodes: [], textDigest: "" };
    const semanticTags = new Set([
      "H1", "H2", "H3", "H4", "H5", "H6", "A", "BUTTON", "INPUT", "TEXTAREA", "SELECT", "IMG", "LI",
      "MAIN", "NAV", "ARTICLE", "SECTION", "P", "DL", "DT", "DD", "TABLE", "TH", "TD",
    ]);
    const nodes: RawSnapshotNode[] = [];
    const elementWalker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let inspectedElements = 0;

    let current = elementWalker.nextNode();
    while (current && inspectedElements < limits.maxElements && nodes.length < limits.maxNodes) {
      inspectedElements++;
      const element = current as Element;
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
      const role = (
        element.getAttribute("role")
        || (tag.startsWith("h") ? "heading" : tag === "a" ? "link" : tag === "button" ? "button" : isLeafText ? "text" : tag)
      ).trim().replace(/\s+/g, " ").slice(0, 64);
      const input = element as HTMLInputElement;
      const explicitName = (
        element.getAttribute("aria-label")
        || element.getAttribute("alt")
        || element.getAttribute("placeholder")
        || input.value
        || ""
      ).slice(0, limits.maxNodeNameLength * 2).trim().replace(/\s+/g, " ").slice(0, limits.maxNodeNameLength);
      let derivedName = "";
      if (!explicitName) {
        const nameWalker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        const nameParts: string[] = [];
        let nameLength = 0;
        let inspectedNameNodes = 0;
        let nameNode = nameWalker.nextNode();
        while (nameNode && nameLength < limits.maxNodeNameLength && inspectedNameNodes < 32) {
          inspectedNameNodes++;
          const remaining = limits.maxNodeNameLength - nameLength;
          const value = (nameNode.nodeValue || "").slice(0, remaining * 2).trim().replace(/\s+/g, " ");
          if (value) {
            const bounded = value.slice(0, remaining);
            nameParts.push(bounded);
            nameLength += bounded.length + 1;
          }
          nameNode = nameWalker.nextNode();
        }
        derivedName = nameParts.join(" ").slice(0, limits.maxNodeNameLength);
      }
      const name = explicitName || derivedName;
      if (name.length === 0) {
        current = elementWalker.nextNode();
        continue;
      }

      nodes.push({ role, name, level: tag.startsWith("h") ? Number(tag.slice(1)) : undefined, visible });
      current = elementWalker.nextNode();
    }

    const textParts: string[] = [];
    const textWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let textLength = 0;
    let inspectedTextNodes = 0;
    let textNode = textWalker.nextNode();
    while (textNode && textLength < limits.maxTextLength && inspectedTextNodes < limits.maxTextNodes) {
      inspectedTextNodes++;
      const parent = textNode.parentElement;
      const hidden = !parent
        || parent.closest('[hidden], [aria-hidden="true"]') !== null
        || getComputedStyle(parent).display === "none"
        || getComputedStyle(parent).visibility === "hidden";
      if (!hidden) {
        const remaining = limits.maxTextLength - textLength;
        const value = (textNode.nodeValue || "").slice(0, remaining * 2).trim().replace(/\s+/g, " ");
        if (value) {
          const bounded = value.slice(0, remaining);
          textParts.push(bounded);
          textLength += bounded.length + 1;
        }
      }
      textNode = textWalker.nextNode();
    }

    return { nodes, textDigest: textParts.join(" ").slice(0, limits.maxTextLength) };
  }, {
    maxNodeNameLength: MAX_NODE_NAME_LENGTH,
    maxNodes: MAX_SNAPSHOT_NODES,
    maxElements: MAX_DOM_ELEMENTS_INSPECTED,
    maxTextNodes: MAX_TEXT_NODES_INSPECTED,
    maxTextLength: MAX_TEXT_DIGEST_LENGTH,
  });

  const nodes = (snapshot.nodes as RawSnapshotNode[]).map((node, index) => ({ ...node, ref: `r${index + 1}` }));
  return { snapshotId: `snap_${randomUUID()}`, format: "accessibility_refs_v1", nodes, textDigest: snapshot.textDigest };
}
