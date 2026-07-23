import { describe, expect, it, vi } from "vitest";
import type { Page } from "playwright";
import { captureBrowserHmiRefSnapshot } from "../src/BrowserHmiRefSnapshot.js";

const sourceFrameSha256 = `sha256:${"a".repeat(64)}`;
const viewport = { width: 800, height: 600 };
const documentIdentity = { frameId: "frame-main", loaderId: "loader-main", url: "https://example.com/" };

function snapshotPage(snapshot: string): Page {
  return {
    ariaSnapshot: vi.fn(async () => snapshot),
    viewportSize: vi.fn(() => viewport),
  } as unknown as Page;
}

function capture(snapshot: string) {
  return captureBrowserHmiRefSnapshot(snapshotPage(snapshot), {
    stateVersion: 7,
    sourceFrameSha256,
    viewport,
    documentIdentity,
  });
}

describe("Browser HMI semantic ref snapshot", () => {
  it("STAGE2B-001 parses bounded Playwright AI ARIA YAML into named viewport targets without leaking static text", async () => {
    const page = snapshotPage(`
- main [ref=e2] [box=8,8,784,420]:
  - heading "Account details" [level=1] [ref=e3] [box=8,8,300,40]
  - link "Open docs" [ref=e4] [cursor=pointer] [box=8,60,90,24]:
    - /url: https://example.com/path?private=token#fragment
  - button "Save & continue" [ref=e5] [box=110,60,150,24]
  - textbox "Secret field" [ref=e6] [box=8,100,220,24]: do-not-leak-input-value
  - button "Disabled action" [disabled] [ref=e7] [box=8,140,140,24]
  - paragraph [ref=e8] [box=8,180,300,24]: private static text should not leak
`);

    const result = await captureBrowserHmiRefSnapshot(page, {
      stateVersion: 7,
      sourceFrameSha256,
      viewport,
      documentIdentity,
    });

    expect(page.ariaSnapshot).toHaveBeenCalledOnce();
    expect(page.ariaSnapshot).toHaveBeenCalledWith({ mode: "ai", boxes: true });
    expect(result).toEqual({
      snapshotId: expect.stringMatching(/^hmi_ref_[a-f0-9]{64}$/),
      stateVersion: 7,
      sourceFrameSha256,
      viewport,
      targets: [
        { ref: "e4", role: "link", name: "Open docs", destination: "https://example.com/path" },
        { ref: "e5", role: "button", name: "Save & continue", destination: null },
        { ref: "e6", role: "textbox", name: "Secret field", destination: null },
      ],
    });
    const safeProjection = JSON.stringify(result);
    expect(safeProjection).not.toContain("private static text");
    expect(safeProjection).not.toContain("do-not-leak-input-value");
    expect(safeProjection).not.toContain("private=token");
    expect(result.targets.every((target) => !("box" in target))).toBe(true);
  });

  it("STAGE2B-002 rejects aliases, oversized snapshots, duplicate refs, and malformed boxes", async () => {
    await expect(capture(`- &target 'button "Unsafe" [ref=e2] [box=1,1,20,20]'\n- *target`))
      .rejects.toMatchObject({ code: "TALOS_BROWSER_HMI_REF_SNAPSHOT_INVALID" });

    await expect(capture(`- paragraph [ref=e1] [box=0,0,1,1]: ${"x".repeat(1_000_000)}`))
      .rejects.toMatchObject({ code: "TALOS_BROWSER_HMI_REF_SNAPSHOT_BOUNDS" });

    await expect(capture(`- button "First" [ref=e2] [box=1,1,20,20]\n- link "Second" [ref=e2] [box=30,1,20,20]`))
      .rejects.toMatchObject({ code: "TALOS_BROWSER_HMI_REF_SNAPSHOT_INVALID" });

    await expect(capture(`- button "Broken" [ref=e2] [box=left,1,20,20]`))
      .rejects.toMatchObject({ code: "TALOS_BROWSER_HMI_REF_SNAPSHOT_INVALID" });
  });

  it("STAGE2B-002 omits unnamed, disabled, zero-area, and off-viewport controls", async () => {
    const result = await capture(`
- button [ref=e2] [box=1,1,20,20]
- button "Disabled" [disabled] [ref=e3] [box=1,1,20,20]
- link "Outside" [ref=e4] [box=900,1,20,20]
- checkbox "Zero" [ref=e5] [box=10,10,0,20]
- radio "Partially visible" [ref=e6] [box=790,590,20,20]
`);

    expect(result.targets).toEqual([
      { ref: "e6", role: "radio", name: "Partially visible", destination: null },
    ]);
  });
});
