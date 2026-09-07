import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { BrowserFrameEvidenceStore } from "../src/BrowserFrameEvidenceStore.js";

const dimensions = { width: 100, height: 80 };
const targetRegion = { left: 8, top: 8, width: 32, height: 24 };

async function frame(changes: Array<{ x: number; y: number; rgba: [number, number, number, number] }> = []): Promise<Buffer> {
  const pixels = Buffer.alloc(dimensions.width * dimensions.height * 4, 255);
  for (const change of changes) {
    const offset = (change.y * dimensions.width + change.x) * 4;
    pixels.set(change.rgba, offset);
  }
  return sharp(pixels, { raw: { ...dimensions, channels: 4 } }).png().toBuffer();
}

describe("BrowserFrameEvidenceStore", () => {
  it("STAGE2B-003 reports exact frame presence only for the recorded state and viewport", async () => {
    const store = new BrowserFrameEvidenceStore();
    const sourceHash = await store.record(await frame(), 7, dimensions);

    expect(store.has(sourceHash, 7, dimensions)).toBe(true);
    expect(store.has(sourceHash, 8, dimensions)).toBe(false);
    expect(store.has(sourceHash, 7, { width: 99, height: 80 })).toBe(false);
    expect(store.has(`sha256:${"f".repeat(64)}`, 7, dimensions)).toBe(false);
  });

  it("matches exact target pixels while ignoring unrelated viewport changes", async () => {
    const store = new BrowserFrameEvidenceStore();
    const source = await frame();
    const sourceHash = await store.record(source, 7, dimensions);
    const unrelatedChange = await frame([{ x: 90, y: 70, rgba: [0, 0, 0, 255] }]);

    const comparison = await store.compareTargetRegion(
      sourceHash,
      7,
      unrelatedChange,
      dimensions,
      targetRegion,
    );

    expect(comparison).toMatchObject({ matches: true, reason: "matched" });
    expect(comparison.regionSha256).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("fails closed when target pixels, state, dimensions, or source evidence differ", async () => {
    const store = new BrowserFrameEvidenceStore();
    const sourceHash = await store.record(await frame(), 7, dimensions);
    const targetChange = await frame([{ x: 12, y: 12, rgba: [0, 0, 0, 255] }]);

    await expect(store.compareTargetRegion(sourceHash, 7, targetChange, dimensions, targetRegion))
      .resolves.toMatchObject({ matches: false, reason: "target_pixels_changed" });
    await expect(store.compareTargetRegion(sourceHash, 8, await frame(), dimensions, targetRegion))
      .resolves.toMatchObject({ matches: false, reason: "source_frame_missing" });
    await expect(store.compareTargetRegion(sourceHash, 7, await frame(), { width: 99, height: 80 }, targetRegion))
      .resolves.toMatchObject({ matches: false, reason: "frame_dimensions_changed" });
    await expect(store.compareTargetRegion(`sha256:${"f".repeat(64)}`, 7, await frame(), dimensions, targetRegion))
      .resolves.toMatchObject({ matches: false, reason: "source_frame_missing" });
  });

  it("bounds and evicts session-local source frames deterministically", async () => {
    const store = new BrowserFrameEvidenceStore({ maxEntries: 2 });
    const first = await store.record(await frame(), 1, dimensions);
    const second = await store.record(await frame([{ x: 90, y: 70, rgba: [1, 1, 1, 255] }]), 1, dimensions);
    const third = await store.record(await frame([{ x: 91, y: 70, rgba: [2, 2, 2, 255] }]), 1, dimensions);

    expect(store.size).toBe(2);
    await expect(store.compareTargetRegion(first, 1, await frame(), dimensions, targetRegion))
      .resolves.toMatchObject({ matches: false, reason: "source_frame_missing" });
    await expect(store.compareTargetRegion(second, 1, await frame(), dimensions, targetRegion))
      .resolves.toMatchObject({ matches: true });
    expect(third).not.toBe(second);

    store.clear();
    expect(store.size).toBe(0);
  });

  it("rejects malformed and oversized frame evidence before caching it", async () => {
    const store = new BrowserFrameEvidenceStore({ maxFrameBytes: 32 });

    await expect(store.record(Buffer.from("not-a-png"), 1, dimensions))
      .rejects.toMatchObject({ code: "TALOS_BROWSER_FRAME_EVIDENCE_INVALID" });
    await expect(store.record(await frame(), 1, dimensions))
      .rejects.toMatchObject({ code: "TALOS_BROWSER_FRAME_EVIDENCE_BOUNDS" });
    expect(store.size).toBe(0);
  });
});
