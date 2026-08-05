import { expect, test, type Page } from '@playwright/test'
import { startChatWithContent } from './chatFixtures'

// F6 — tablet split view (Claude pattern, owner's screenshot): persistent left
// chat panel + draggable divider + chat content on the right. Width persisted
// in shell.tablet_sidebar_width (clamped 260–480, default 320).
const PANEL = '[data-testid="talos-tablet-sidebar"]'
const DIVIDER = '[data-testid="talos-tablet-divider"]'
const SIDEBAR = '[data-testid="talos-mobile-sidebar"]'
const SHEET = '[data-testid="talos-mobile-tool-sheet"]'

test.use({ viewport: { width: 1024, height: 768 } })

async function panelWidth(page: Page): Promise<number> {
    return page.locator(PANEL).evaluate((element) => element.getBoundingClientRect().width)
}

// Raw page.mouse.* has no actionability wait — the boot-logo overlay would
// swallow the drag. Visible FIRST, then detached: right after goto the logo
// has not mounted yet, so a bare detached-wait passes vacuously (F5 lesson).
async function waitForBoot(page: Page): Promise<void> {
    const boot = page.locator('[data-testid="talos-boot-logo"]')
    await boot.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined)
    await boot.waitFor({ state: 'detached', timeout: 15_000 })
}

test('tablet shows the persistent chat panel with search, list and divider', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator(PANEL)).toBeVisible()
    await expect(page.locator(`${PANEL} [data-testid="talos-chats-search"]`)).toBeVisible()
    await expect(page.locator(`${PANEL} [data-testid="talos-chats-new"]`)).toBeVisible()
    await expect(page.locator(DIVIDER)).toBeVisible()
    // Design default width engages out of the box.
    expect(Math.round(await panelWidth(page))).toBe(320)
    // The a11y separator contract is real.
    await expect(page.locator(DIVIDER)).toHaveAttribute('aria-orientation', 'vertical')
    await expect(page.locator(DIVIDER)).toHaveAttribute('aria-valuenow', '320')
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
    await expect(page.locator(DIVIDER)).toBeVisible()
    await expect(page.getByLabel('Message TALOS')).toBeVisible()
})

test('tablet Settings replaces the chat rail with categories and restores it on close', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator(PANEL)).toBeVisible()
    const originalWidth = Math.round(await panelWidth(page))
    await page.locator('[data-testid="talos-tablet-menu"]').click()
    await page.locator(`${SIDEBAR} [aria-label="Open Settings"]`).click()

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
    await page.goto('/')
    await page.locator('[data-testid="talos-tablet-menu"]').click()
    await page.locator(`${SIDEBAR} [aria-label="Open Settings"]`).click()
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

test('panel hamburger opens the tools drawer; new chat from the panel stays in place', async ({ page }) => {
    await page.goto('/')
    await page.locator('[aria-label="Open menu"]').click()
    await expect(page.locator(SIDEBAR)).toBeVisible()
    await page.locator(`${SIDEBAR} [aria-label="Close menu"]`).click()
    await expect(page.locator(SIDEBAR)).toHaveCount(0)

    // New chat from the embedded panel: no route change, composer stays live.
    await page.locator(`${PANEL} [data-testid="talos-chats-new"]`).click()
    await expect(page.locator('[data-talos-route]')).toHaveAttribute('data-talos-route', 'chat')
    await expect(page.getByLabel('Message TALOS')).toBeVisible()
    // The panel is still the panel — and it holds no row yet, because a chat
    // enters the history when it has something in it (owner 2026-07-31).
    await expect(page.locator(`${PANEL} [data-testid="talos-chats-new"]`)).toBeVisible()
    await expect(page.locator(`${PANEL} [data-testid="talos-chats-row"]`)).toHaveCount(0)
})

test('selecting a chat in the panel closes an open station sheet', async ({ page }) => {
    await page.goto('/')
    // A chat has to have something in it to be in the panel at all, so this
    // puts something in it rather than asserting on a list that is empty by
    // design (owner 2026-07-31).
    await startChatWithContent(page, 'Una conversazione da riaprire')
    await expect(page.locator(`${PANEL} [data-testid="talos-chats-row"]`).first()).toBeVisible()
    // Open a station sheet via the tools drawer.
    await page.locator('[aria-label="Open menu"]').click()
    await page.locator(`${SIDEBAR} [aria-label="Open Notes"]`).click()
    await expect(page.locator(SHEET)).toBeVisible()
    // Picking the chat in the panel dismisses the sheet back to the chat.
    await page.locator(`${PANEL} [data-testid="talos-chats-open"]`).first().click()
    await expect(page.locator(SHEET)).toHaveCount(0)
    await expect(page.locator('[data-talos-route]')).toHaveAttribute('data-talos-route', 'chat')
})

test('divider drag resizes the panel and the width survives reload', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator(DIVIDER)).toBeVisible()
    await waitForBoot(page)
    const divider = page.locator(DIVIDER)
    const box = (await divider.boundingBox())!
    const centerY = box.y + box.height / 2
    const centerX = box.x + box.width / 2
    await page.mouse.move(centerX, centerY)
    await page.mouse.down()
    await page.mouse.move(centerX + 100, centerY, { steps: 5 })
    await page.mouse.up()
    await expect(divider).toHaveAttribute('aria-valuenow', '420')
    expect(Math.round(await panelWidth(page))).toBe(420)

    await page.reload()
    await expect(page.locator(PANEL)).toBeVisible()
    await expect(page.locator(DIVIDER)).toHaveAttribute('aria-valuenow', '420')
    expect(Math.round(await panelWidth(page))).toBe(420)
})

test('keyboard resize respects the clamp and double-click resets to default', async ({ page }) => {
    await page.goto('/')
    await waitForBoot(page)
    const divider = page.locator(DIVIDER)
    await divider.focus()
    await page.keyboard.press('ArrowRight')
    await expect(divider).toHaveAttribute('aria-valuenow', '336')
    // SF6-F10: Home/End jump to the bounds — the KEYBOARD clamp itself.
    await page.keyboard.press('End')
    await expect(divider).toHaveAttribute('aria-valuenow', '480')
    await page.keyboard.press('Home')
    await expect(divider).toHaveAttribute('aria-valuenow', '260')
    // Drag far beyond the max: the pointer clamp holds at 480.
    const box = (await divider.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + 200)
    await page.mouse.down()
    await page.mouse.move(box.x + 600, box.y + 200, { steps: 4 })
    await page.mouse.up()
    await expect(divider).toHaveAttribute('aria-valuenow', '480')
    await divider.dblclick()
    await expect(divider).toHaveAttribute('aria-valuenow', '320')
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
