import { createHash } from "node:crypto";
import sharp from "sharp";
import { BrowserError } from "./BrowserErrors.js";
import { TOOL_MAX_SCREENSHOT_BYTES } from "./BrowserToolContracts.js";

const DEFAULT_MAX_ENTRIES = 4;
const MAX_VIEWPORT_PIXELS = 3_840 * 2_160;

export interface BrowserFrameDimensions {
  width: number;
  height: number;
}

export interface BrowserFrameRegion {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type BrowserFrameComparisonReason =
  | "matched"
  | "source_frame_missing"
  | "frame_dimensions_changed"
  | "target_pixels_changed"
  | "frame_evidence_invalid";

export interface BrowserFrameComparison {
  matches: boolean;
  reason: BrowserFrameComparisonReason;
  regionSha256?: string;
}

interface BrowserFrameEvidence {
  bytes: Buffer;
  stateVersion: number;
  dimensions: BrowserFrameDimensions;
}

export interface BrowserFrameEvidenceStoreOptions {
  maxEntries?: number;
  maxFrameBytes?: number;
}

export class BrowserFrameEvidenceStore {
  private readonly frames = new Map<string, BrowserFrameEvidence>();
  private readonly maxEntries: number;
  private readonly maxFrameBytes: number;

  constructor(options: BrowserFrameEvidenceStoreOptions = {}) {
    this.maxEntries = boundedPositiveInteger(options.maxEntries, DEFAULT_MAX_ENTRIES, 32, "maxEntries");
    this.maxFrameBytes = boundedPositiveInteger(
      options.maxFrameBytes,
      TOOL_MAX_SCREENSHOT_BYTES,
      TOOL_MAX_SCREENSHOT_BYTES,
      "maxFrameBytes",
    );
  }

  get size(): number {
    return this.frames.size;
  }

  async record(
    bytes: Buffer,
    stateVersion: number,
    dimensions: BrowserFrameDimensions,
  ): Promise<string> {
    assertStateVersion(stateVersion);
    assertDimensions(dimensions);
    if (bytes.byteLength > this.maxFrameBytes) {
      throw new BrowserError(
        "Browser frame evidence exceeds the bounded cache limit.",
        "TALOS_BROWSER_FRAME_EVIDENCE_BOUNDS",
        413,
        { max_bytes: this.maxFrameBytes },
      );
    }
    await this.assertPngDimensions(bytes, dimensions);

    const digest = sha256(bytes);
    this.frames.delete(digest);
    this.frames.set(digest, {
      bytes: Buffer.from(bytes),
      stateVersion,
      dimensions: { ...dimensions },
    });
    while (this.frames.size > this.maxEntries) {
      const oldest = this.frames.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.frames.delete(oldest);
    }
    return digest;
  }

  async compareTargetRegion(
    expectedSha256: string,
    stateVersion: number,
    currentBytes: Buffer,
    dimensions: BrowserFrameDimensions,
    region: BrowserFrameRegion,
  ): Promise<BrowserFrameComparison> {
    const source = this.frames.get(expectedSha256);
    if (!source || source.stateVersion !== stateVersion) {
      return { matches: false, reason: "source_frame_missing" };
    }
    if (source.dimensions.width !== dimensions.width || source.dimensions.height !== dimensions.height) {
      return { matches: false, reason: "frame_dimensions_changed" };
    }

    try {
      assertStateVersion(stateVersion);
      assertDimensions(dimensions);
      assertRegion(region, dimensions);
      if (currentBytes.byteLength > this.maxFrameBytes) {
        return { matches: false, reason: "frame_evidence_invalid" };
      }
      await this.assertPngDimensions(currentBytes, dimensions);
      const [sourceRegion, currentRegion] = await Promise.all([
        rawRegionDigest(source.bytes, region),
        rawRegionDigest(currentBytes, region),
      ]);
      if (sourceRegion !== currentRegion) {
        return { matches: false, reason: "target_pixels_changed", regionSha256: currentRegion };
      }
      return { matches: true, reason: "matched", regionSha256: currentRegion };
    } catch {
      return { matches: false, reason: "frame_evidence_invalid" };
    }
  }

  clear(): void {
    this.frames.clear();
  }

  private async assertPngDimensions(bytes: Buffer, dimensions: BrowserFrameDimensions): Promise<void> {
    let metadata;
    try {
      metadata = await sharp(bytes, {
        failOn: "warning",
        limitInputPixels: MAX_VIEWPORT_PIXELS,
        limitInputChannels: 4,
      }).metadata();
    } catch {
      throw new BrowserError(
        "Browser frame evidence is not a valid bounded PNG.",
        "TALOS_BROWSER_FRAME_EVIDENCE_INVALID",
        422,
      );
    }
    if (metadata.format !== "png"
      || metadata.width !== dimensions.width
      || metadata.height !== dimensions.height
      || (metadata.pages ?? 1) !== 1) {
      throw new BrowserError(
        "Browser frame evidence dimensions do not match the session viewport.",
        "TALOS_BROWSER_FRAME_EVIDENCE_INVALID",
        422,
      );
    }
  }
}

async function rawRegionDigest(bytes: Buffer, region: BrowserFrameRegion): Promise<string> {
  const pixels = await sharp(bytes, {
    failOn: "warning",
    limitInputPixels: MAX_VIEWPORT_PIXELS,
    limitInputChannels: 4,
  })
    .extract(region)
    .ensureAlpha()
    .raw()
    .toBuffer();
  return sha256(pixels);
}

function assertStateVersion(value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new BrowserError("Browser frame state version is invalid.", "TALOS_BROWSER_FRAME_EVIDENCE_INVALID", 422);
  }
}

function assertDimensions(value: BrowserFrameDimensions): void {
  if (!Number.isInteger(value.width)
    || !Number.isInteger(value.height)
    || value.width < 1
    || value.height < 1
    || value.width * value.height > MAX_VIEWPORT_PIXELS) {
    throw new BrowserError("Browser frame dimensions are invalid.", "TALOS_BROWSER_FRAME_EVIDENCE_INVALID", 422);
  }
}

function assertRegion(region: BrowserFrameRegion, dimensions: BrowserFrameDimensions): void {
  if (!Number.isInteger(region.left)
    || !Number.isInteger(region.top)
    || !Number.isInteger(region.width)
    || !Number.isInteger(region.height)
    || region.left < 0
    || region.top < 0
    || region.width < 1
    || region.height < 1
    || region.left + region.width > dimensions.width
    || region.top + region.height > dimensions.height) {
    throw new BrowserError("Browser target frame region is invalid.", "TALOS_BROWSER_FRAME_EVIDENCE_INVALID", 422);
  }
}

function boundedPositiveInteger(value: number | undefined, fallback: number, maximum: number, name: string): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}.`);
  }
  return resolved;
}

function sha256(value: Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
