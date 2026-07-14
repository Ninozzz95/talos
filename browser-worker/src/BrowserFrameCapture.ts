import type { Page } from "playwright";
import { BrowserError } from "./BrowserErrors.js";
import { TOOL_MAX_SCREENSHOT_BYTES } from "./BrowserToolContracts.js";

export async function captureCanonicalBrowserFrame(page: Page): Promise<Buffer> {
  const frame = await page.screenshot({
    type: "png",
    animations: "disabled",
    caret: "hide",
  });
  if (frame.byteLength > TOOL_MAX_SCREENSHOT_BYTES) {
    throw new BrowserError(
      "The browser screenshot exceeds the bounded output limit.",
      "TALOS_BROWSER_SCREENSHOT_BOUNDS",
      413,
      { max_bytes: TOOL_MAX_SCREENSHOT_BYTES },
    );
  }
  return frame;
}
