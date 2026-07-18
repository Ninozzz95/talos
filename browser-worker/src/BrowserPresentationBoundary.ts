import type { Page } from "playwright";

const MAX_PRESENTATION_FALLBACK_MS = 100;
const PRESENTATION_BOUNDARY_EXPRESSION = `(fallbackMs) => new Promise((resolveBoundary) => {
  let settled = false;
  const settle = () => {
    if (settled) return;
    settled = true;
    resolveBoundary();
  };
  window.setTimeout(settle, fallbackMs);
  window.requestAnimationFrame(() => window.requestAnimationFrame(settle));
})`;

export async function waitForBrowserPresentationBoundary(page: Page, timeoutMs: number): Promise<void> {
  const finiteTimeout = Number.isFinite(timeoutMs) ? Math.floor(timeoutMs) : 1;
  const fallbackMs = Math.max(1, Math.min(MAX_PRESENTATION_FALLBACK_MS, finiteTimeout));
  await page.evaluate(PRESENTATION_BOUNDARY_EXPRESSION, fallbackMs);
}
