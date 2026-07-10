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

export async function captureSnapshot(page: Page): Promise<BrowserSnapshotResult> {
  const rawNodes = await page.evaluate((maxNodeNameLength) => {
    const elements = [...document.querySelectorAll("body *")];
    const allowed = new Set(["H1", "H2", "H3", "H4", "H5", "H6", "A", "BUTTON", "INPUT", "TEXTAREA", "SELECT", "IMG", "LI", "MAIN", "NAV"]);
    return elements
      .filter((element) => allowed.has(element.tagName))
      .slice(0, 200)
      .map((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const tag = element.tagName.toLowerCase();
        const role = element.getAttribute("role") || (tag.startsWith("h") ? "heading" : tag === "a" ? "link" : tag === "button" ? "button" : tag);
        const name = (element.getAttribute("aria-label") || element.textContent || (element as HTMLInputElement).value || "").trim().replace(/\s+/g, " ");
        return { role, name: name.slice(0, maxNodeNameLength), level: tag.startsWith("h") ? Number(tag.slice(1)) : undefined, visible: style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0 };
      })
      .filter((node) => node.visible && node.name.length > 0);
  }, MAX_NODE_NAME_LENGTH);

  const nodes = (rawNodes as RawSnapshotNode[]).map((node, index) => ({ ...node, ref: `r${index + 1}` }));
  const textDigest = (await page.locator("body").innerText()).replace(/\s+/g, " ").trim().slice(0, 4000);
  return { snapshotId: `snap_${randomUUID()}`, format: "accessibility_refs_v1", nodes, textDigest };
}
