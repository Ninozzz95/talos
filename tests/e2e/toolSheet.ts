import type { Page } from '@playwright/test'

const SHEET = '[data-testid="talos-mobile-tool-sheet"]'
const BACK = '[data-testid="talos-sheet-back"]'

/**
 * Close whatever tool sheets are open, without racing their own closing.
 *
 * This replaces a line copy-pasted into 48 places across the suite:
 *
 *   if (await page.locator(SHEET).count() > 0) { await page.locator(BACK).click(); await page.waitForTimeout(320) }
 *
 * which is a check-then-act race. `count()` answers "is the sheet in the DOM",
 * but a sheet playing its leave transition is still in the DOM — so under load
 * the check passes, the sheet finishes closing, and the click lands on a button
 * that has just detached. Playwright retries, waits for an element that will
 * never come back, and the test dies on the full 60s timeout having asserted
 * nothing. It was the cause of every intermittent failure in this suite: always
 * this locator, and whichever spec happened to hit the timing lost that run.
 *
 * So: click if it is there, tolerate it having closed itself, and wait for the
 * sheet count to actually drop rather than for a fixed 320ms that is either too
 * long or — the failure above — not the thing being waited for at all. The loop
 * is what the doubled call sites were reaching for: a sheet opened from a sheet
 * takes more than one Back.
 */
export async function closeToolSheet(page: Page): Promise<void> {
    const sheet = page.locator(SHEET)
    for (let guard = 0; guard < 4; guard += 1) {
        const open = await sheet.count()
        if (open === 0) return
        // A refusal here is the race itself, and the wait below is what
        // establishes the outcome either way.
        await page.locator(BACK).first().click({ timeout: 5_000 }).catch(() => {})
        await page.waitForFunction(
            ([selector, before]) => document.querySelectorAll(selector as string).length < (before as number),
            [SHEET, open] as const,
            { timeout: 5_000 },
        ).catch(() => {})
    }
}
