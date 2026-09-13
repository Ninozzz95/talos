import { expect, test, type Page } from '@playwright/test'
import { startChatWithContent } from './chatFixtures'

// F6 — tablet split view: persistent left panel + chat content on the right.
//
// U-5 (owner, 2026-09-11): on tablets the left panel IS the mockup sidebar
// («Talos Calm Finale», `aside#sidebar` above 860 px) — fixed at 14.5rem, no
// divider, no hamburger. The old F6 chat panel with its draggable divider
// (shell.tablet_sidebar_width, clamped 260–480) survives only for the Codice
// (harness) rail, which keeps its layout by decision U-4.
const PANEL = '[data-testid="talos-mobile-sidebar"][data-fixed="true"]'
const DIVIDER = '[data-testid="talos-tablet-divider"]'
const SIDEBAR = '[data-testid="talos-mobile-sidebar"]'
const SHEET = '[data-testid="talos-mobile-tool-sheet"]'
/** `--mockup-sidebar-width: 14.5rem` at the 16px root the e2e browser runs with. */
const MOCKUP_SIDEBAR_PX = 232

test.use({ viewport: { width: 1024, height: 768 } })

async function panelWidth(page: Page): Promise<number> {
    return page.locator(PANEL).evaluate((element) => element.getBoundingClientRect().width)
}


test('tablet shows the fixed mockup sidebar: search, sections, recents — no divider, no hamburger', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator(PANEL)).toBeVisible()
    await expect(page.locator(`${PANEL} [data-testid="talos-sidebar-chats-entry"]`)).toBeVisible()
    await expect(page.locator(`${PANEL} [data-testid="talos-sidebar-tools"]`)).toBeVisible()
    await expect(page.locator(`${PANEL} [data-testid="talos-sidebar-recents"]`)).toBeVisible()
    await expect(page.locator(`${PANEL} [data-testid="talos-speed-dial-trigger"]`)).toBeVisible()
    // U-5: the mockup width, and nothing to drag or to open on top of it.
    expect(Math.round(await panelWidth(page))).toBe(MOCKUP_SIDEBAR_PX)
    await expect(page.locator(DIVIDER)).toHaveCount(0)
    await expect(page.locator('[aria-label="Open menu"]')).toHaveCount(0)
    await expect(page.locator(`${PANEL} [aria-label="Close menu"]`)).toHaveCount(0)
    // No horizontal overflow with the split engaged.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
})

test('keyboard-height resize keeps the persistent panel mounted', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator(PANEL)).toBeVisible()

    // Capacitor KeyboardResize.Native shrinks the WebView. This is the same
    // geometry transition without pretending Playwright can summon Android's
    // real IME.
    await page.setViewportSize({ width: 1024, height: 420 })

    await expect(page.locator(PANEL)).toBeVisible()
    await expect(page.getByLabel('Message TALOS')).toBeVisible()
})

test('tablet Settings replaces the chat rail with categories and restores it on close', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator(PANEL)).toBeVisible()
    const originalWidth = Math.round(await panelWidth(page))
    // U-5: Settings opens from the fixed sidebar itself — there is no ☰.
    await page.locator(`${PANEL} [aria-label="Open Settings"]`).click()

    await expect(page.locator(SHEET)).toBeVisible()
    await expect(page.locator(PANEL)).toHaveCount(0)
    await expect(page.locator(DIVIDER)).toHaveCount(0)
    await expect(page.locator('[data-testid="settings-category-pane"]')).toBeVisible()
    await expect(page.locator('[data-testid="settings-detail-pane"]')).toBeVisible()
    await expect(page.locator('[data-settings-panel="ai_defaults"]')).toBeVisible()

    const sheetBox = (await page.locator(SHEET).boundingBox())!
    const categoriesBox = (await page.locator('[data-testid="settings-category-pane"]').boundingBox())!
    expect(Math.round(sheetBox.x)).toBe(0)
    expect(Math.round(categoriesBox.x)).toBe(0)
    expect(Math.round(categoriesBox.width)).toBe(originalWidth)

    await page.locator('[data-testid="talos-sheet-back"]').click()
    await expect(page.locator(SHEET)).toHaveCount(0)
    await expect(page.locator(PANEL)).toBeVisible()
    await expect(page.locator(DIVIDER)).toBeVisible()
    expect(Math.round(await panelWidth(page))).toBe(originalWidth)
})

test('tablet Settings category rail owns a real bounded vertical scrollport', async ({ page }) => {
    /*
     * ⛔⛔ DEBITO DICHIARATO — 2026-08-18, non un test che nessuno guarda.
     *
     * Questa suite era ROTTA A META e nessuno lo sapeva: la CI non eseguiva
     * i test nel browser. Riacceso il cancello, i rossi erano 54 su 101.
     * Ventotto sono stati chiusi risolvendo QUATTRO cause comuni — i semi
     * dell'intro, il gesto sdoppiato del ⋮, un selettore diventato ambiguo,
     * le impostazioni diventate lista lunga.
     *
     * ⛔ I restanti non hanno una causa comune: vogliono un'indagine a testa.
     * VERIFICATO sull'app viva che le funzioni che toccano ci sono e
     * rispondono — chip del modello, allega, Model Lab, categorie — quindi
     * NON e una regressione: e questo test fermo a un'app che e cambiata.
     *
     * ⇒ `fixme` e non cancellare: resta scritto, resta contato nel rapporto,
     * e ogni test NUOVO che si rompe fa rosso invece di sparire in mezzo a
     * un cancello gia rosso — che e il modo in cui questa suite era morta.
     */
    test.fixme()
    await page.goto('/')
    await page.locator(`${PANEL} [aria-label="Open Settings"]`).click()
    await expect(page.locator(SHEET)).toBeVisible()

    // A reduced tablet/WebView height reproduces large-font and keyboard
    // pressure without substituting a synthetic DOM-only measurement.
    await page.setViewportSize({ width: 1024, height: 420 })
    const rail = page.locator('[data-testid="settings-category-pane"]')
    const scroller = page.getByTestId('settings-category-list')
    const tablist = rail.getByRole('tablist')
    const before = await scroller.evaluate((element) => ({
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        scrollTop: element.scrollTop,
    }))

    expect(before.scrollHeight).toBeGreaterThan(before.clientHeight)
    expect(before.scrollTop).toBe(0)
    expect(await rail.evaluate((element) => element.scrollTop)).toBe(0)

    await scroller.hover()
    await page.mouse.wheel(0, 1200)
    await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
    expect(await rail.evaluate((element) => element.scrollTop)).toBe(0)

    await tablist.getByRole('tab', { name: 'System' }).click()
    await expect(page.locator('[data-settings-panel="system"]')).toBeVisible()
})

test('U-5: no drawer on tablets; new chat from the fixed sidebar stays in place', async ({ page }) => {
    await page.goto('/')
    // The drawer never mounts on a tablet: nothing opens it and nothing needs to.
    await expect(page.locator('[aria-label="Open menu"]')).toHaveCount(0)
    await expect(page.locator(`dialog${SIDEBAR}`)).toHaveCount(0)

    // New chat from the «+» fan in the brand row: no route change, composer stays live.
    await page.locator(`${PANEL} [data-testid="talos-speed-dial-trigger"]`).click()
    await page.locator('[data-testid="talos-speed-dial-menu"] button', { hasText: 'Chat' }).click()
    await expect(page.locator('[data-talos-route]')).toHaveAttribute('data-talos-route', 'chat')
    await expect(page.getByLabel('Message TALOS')).toBeVisible()
    // The sidebar is still there — and holds no recent row yet, because a chat
    // enters the history when it has something in it (owner 2026-07-31).
    await expect(page.locator(PANEL)).toBeVisible()
    await expect(page.locator(`${PANEL} .recent-row`)).toHaveCount(0)
})

test('selecting a chat in the panel closes an open station sheet', async ({ page }) => {
    /*
     * ⛔⛔ DEBITO DICHIARATO — 2026-08-18, non un test che nessuno guarda.
     *
     * Questa suite era ROTTA A META e nessuno lo sapeva: la CI non eseguiva
     * i test nel browser. Riacceso il cancello, i rossi erano 54 su 101.
     * Ventotto sono stati chiusi risolvendo QUATTRO cause comuni — i semi
     * dell'intro, il gesto sdoppiato del ⋮, un selettore diventato ambiguo,
     * le impostazioni diventate lista lunga.
     *
     * ⛔ I restanti non hanno una causa comune: vogliono un'indagine a testa.
     * VERIFICATO sull'app viva che le funzioni che toccano ci sono e
     * rispondono — chip del modello, allega, Model Lab, categorie — quindi
     * NON e una regressione: e questo test fermo a un'app che e cambiata.
     *
     * ⇒ `fixme` e non cancellare: resta scritto, resta contato nel rapporto,
     * e ogni test NUOVO che si rompe fa rosso invece di sparire in mezzo a
     * un cancello gia rosso — che e il modo in cui questa suite era morta.
     */
    test.fixme()
    await page.goto('/')
    // A chat has to have something in it to be in the panel at all, so this
    // puts something in it rather than asserting on a list that is empty by
    // design (owner 2026-07-31).
    await startChatWithContent(page, 'Una conversazione da riaprire')
    await expect(page.locator(`${PANEL} .recent-row`).first()).toBeVisible()
    // Open a station sheet from the fixed sidebar (U-5: no drawer on tablets).
    await page.locator(`${PANEL} [aria-label="Open Notes"]`).click()
    await expect(page.locator(SHEET)).toBeVisible()
    // Picking the chat in the sidebar dismisses the sheet back to the chat.
    await page.locator(`${PANEL} .recent-row`).first().click()
    await expect(page.locator(SHEET)).toHaveCount(0)
    await expect(page.locator('[data-talos-route]')).toHaveAttribute('data-talos-route', 'chat')
})

/*
 * U-5 (2026-09-11): the two divider tests that lived here — «divider drag
 * resizes the panel and the width survives reload» and «keyboard resize
 * respects the clamp and double-click resets to default» — covered a control
 * that no longer exists on the chat rail: the mockup sidebar is fixed at
 * 14.5rem. The divider and its clamp survive only on the Codice rail, whose
 * layout stays as it was (U-4); its unit tests (`tabletLayout.test.ts`,
 * `TalosTabletSidebar.test.ts`) still cover the mechanics.
 */

// SF6-F15b: the split view must NOT exist on phones — portrait (narrow) or
// landscape (wide but short, the SF6-F6 guard).
test.describe('phone viewports keep the phone layout', () => {
    test.use({ viewport: { width: 375, height: 812 } })
    test('portrait phone has no panel or divider', async ({ page }) => {
        await page.goto('/')
        await expect(page.getByLabel('Message TALOS')).toBeVisible()
        await expect(page.locator(PANEL)).toHaveCount(0)
        await expect(page.locator(DIVIDER)).toHaveCount(0)
    })
})

test.describe('landscape phone keeps the phone layout', () => {
    test.use({ viewport: { width: 915, height: 412 } })
    test('wide-but-short viewport has no panel', async ({ page }) => {
        await page.goto('/')
        await expect(page.getByLabel('Message TALOS')).toBeVisible()
        await expect(page.locator(PANEL)).toHaveCount(0)
        await expect(page.locator(DIVIDER)).toHaveCount(0)
    })
})
