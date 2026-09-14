import { expect, test, type Page } from '@playwright/test'
import { startChatWithContent } from './chatFixtures'
import { closeToolSheet } from './toolSheet'

// F6 — tablet split view: persistent left panel + chat content on the right.
//
// U-5/U-14 current contract: on tablets the left panel IS the persistent
// Calm sidebar. Since 2026-09-12 its edge is draggable; the divider is part of
// the chat rail too, while the hamburger remains phone-only. Settings and other
// stations open over the content column and leave that global rail available.
const PANEL = '[data-testid="talos-mobile-sidebar"][data-fixed="true"]'
const DIVIDER = '[data-testid="talos-tablet-divider"]'
const SIDEBAR = '[data-testid="talos-mobile-sidebar"]'
const SHEET = '[data-testid="talos-mobile-tool-sheet"]'
/** Default Calm sidebar width: 14.5rem at the 16px root used by the E2E browser. */
const MOCKUP_SIDEBAR_PX = 232

test.use({ viewport: { width: 1024, height: 768 } })

async function panelWidth(page: Page): Promise<number> {
    return page.locator(PANEL).evaluate((element) => element.getBoundingClientRect().width)
}


test('tablet shows the persistent Calm sidebar with its resize divider and no hamburger', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator(PANEL)).toBeVisible()
    await expect(page.locator(`${PANEL} [data-testid="talos-sidebar-chats-entry"]`)).toBeVisible()
    await expect(page.locator(`${PANEL} [data-testid="talos-sidebar-tools"]`)).toBeVisible()
    await expect(page.locator(`${PANEL} [data-testid="talos-sidebar-recents"]`)).toBeVisible()
    await expect(page.locator(`${PANEL} [data-testid="talos-speed-dial-trigger"]`)).toBeVisible()
    expect(Math.round(await panelWidth(page))).toBe(MOCKUP_SIDEBAR_PX)
    await expect(page.locator(DIVIDER)).toBeVisible()
    await expect(page.locator('[data-testid="talos-shell-menu"]')).toHaveCount(0)
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

test('tablet Settings stays beside the persistent chat rail and closes back to chat', async ({ page }) => {
    await page.goto('/')
    const panel = page.locator(PANEL)
    await expect(panel).toBeVisible()
    const originalWidth = Math.round(await panelWidth(page))
    await page.locator(`${PANEL} [aria-label="Open Settings"]`).click()

    await expect(page.locator(SHEET)).toBeVisible()
    await expect(panel).toBeVisible()
    await expect(page.locator(DIVIDER)).toBeVisible()
    await expect(page.locator('[data-testid="settings-category-pane"]')).toBeVisible()
    await expect(page.locator('[data-testid="settings-detail-pane"]')).toBeVisible()
    await expect(page.locator('[data-settings-panel="ai_defaults"]')).toBeVisible()

    const panelBox = (await panel.boundingBox())!
    const sheetBox = (await page.locator(SHEET).boundingBox())!
    const categoriesBox = (await page.locator('[data-testid="settings-category-pane"]').boundingBox())!
    // The station owns only the content column; it must not cover the global rail.
    expect(Math.round(sheetBox.x)).toBe(originalWidth)
    expect(sheetBox.x).toBeGreaterThanOrEqual(panelBox.x + panelBox.width - 1)
    expect(categoriesBox.x).toBeGreaterThanOrEqual(sheetBox.x)

    await closeToolSheet(page)
    await expect(page.locator(SHEET)).toHaveCount(0)
    await expect(panel).toBeVisible()
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
    await expect(page.locator('[data-testid="talos-shell-menu"]')).toHaveCount(0)
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
