import { canonicalJson, canonicalSha256 } from "./BrowserCanonicalJson.js";
import type { BrowserSnapshotResult, SnapshotNode } from "./BrowserSnapshot.js";

export const BROWSER_TOOL_SNAPSHOT_EVIDENCE_SCHEMA_VERSION = "talos_browser_tool_snapshot_evidence_v1" as const;

export interface BrowserToolSnapshotEvidenceValue {
  schema_version: typeof BROWSER_TOOL_SNAPSHOT_EVIDENCE_SCHEMA_VERSION;
  snapshot_id: string;
  format: BrowserSnapshotResult["format"];
  text_digest: string;
  nodes: SnapshotNode[];
}

export function browserToolSnapshotEvidenceValue(
  snapshot: Pick<BrowserSnapshotResult, "snapshotId" | "format" | "textDigest" | "nodes">,
): BrowserToolSnapshotEvidenceValue {
  return {
    schema_version: BROWSER_TOOL_SNAPSHOT_EVIDENCE_SCHEMA_VERSION,
    snapshot_id: snapshot.snapshotId,
    format: snapshot.format,
    text_digest: snapshot.textDigest,
    nodes: snapshot.nodes.map((node) => ({
      ref: node.ref,
      role: node.role,
      name: node.name,
      ...(node.href === undefined ? {} : { href: node.href }),
      ...(node.level === undefined ? {} : { level: node.level }),
      visible: node.visible,
    })),
  };
}

export function browserToolSnapshotEvidenceJson(
  snapshot: Pick<BrowserSnapshotResult, "snapshotId" | "format" | "textDigest" | "nodes">,
): string {
  return canonicalJson(browserToolSnapshotEvidenceValue(snapshot));
}

export function browserToolSnapshotEvidenceSha256(
  snapshot: Pick<BrowserSnapshotResult, "snapshotId" | "format" | "textDigest" | "nodes">,
): string {
  return canonicalSha256(browserToolSnapshotEvidenceValue(snapshot));
}
