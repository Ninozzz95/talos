import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        const host = window as Window & { __talosOpenedUrls?: string[] }
        host.__talosOpenedUrls = []
        Object.defineProperty(window, 'open', {
            configurable: true,
            value: (url?: string | URL) => {
                if (url) host.__talosOpenedUrls?.push(String(url))
                return { close: () => undefined } as Window
            },
        })
    })
})

test('Browse remains in Chat, opens the exact detected URL and restores truthful lifecycle evidence', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')

    const composer = page.getByLabel('Message TALOS')
    await composer.fill('Apri https://example.com/path e dimmi cosa vedi')
    const suggestion = page.getByTestId('talos-mobile-browser-url-suggestion')
    await expect(suggestion).toContainText('example.com/path')

    await page.getByLabel('Enable Browse mode').click()
    await expect(page.getByTestId('talos-mobile-browse-mode-status')).toContainText('Manual local browser')
    await expect(page.locator('[data-talos-route]')).toHaveAttribute('data-talos-route', 'chat')

    await suggestion.getByRole('button').click()
    await expect(page.getByText('Page navigation succeeded', { exact: true })).toBeVisible()
    expect(await page.evaluate(() => (
        window as Window & { __talosOpenedUrls?: string[] }
    ).__talosOpenedUrls)).toEqual(['https://example.com/path'])
    await expect(page.getByTestId('talos-mobile-browser-raw-trigger')).toHaveCount(0)

    await page.reload()
    await expect(page.getByTestId('talos-mobile-browse-mode-status')).toContainText('Manual local browser')
    await expect(page.getByText('Page navigation succeeded', { exact: true })).toBeVisible()
    await expect(page.locator('[data-talos-route]')).toHaveAttribute('data-talos-route', 'chat')

    for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 640 }]) {
        await page.setViewportSize(viewport)
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(overflow).toBeLessThanOrEqual(0)
    }
})

test('slash Browse enables the current conversation without opening another route', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 })
    await page.goto('/')
    const composer = page.getByLabel('Message TALOS')
    await composer.fill('/browse')
    await expect(page.getByRole('option', { name: /Open Browse/i })).toHaveAttribute('aria-disabled', 'false')
    await composer.press('Enter')

    await expect(page.getByTestId('talos-mobile-browse-mode-status')).toBeVisible()
    await expect(page.locator('[data-talos-route]')).toHaveAttribute('data-talos-route', 'chat')
    await expect(composer).toHaveValue('')
})
