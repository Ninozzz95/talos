import { chromium } from "playwright";
import { waitForBrowserPresentationBoundary } from "../../src/BrowserPresentationBoundary.js";

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 320, height: 240 } });
  await page.setContent("<!doctype html><html><body>ready</body></html>");
  await waitForBrowserPresentationBoundary(page, 1_000);
} finally {
  await browser.close();
}
