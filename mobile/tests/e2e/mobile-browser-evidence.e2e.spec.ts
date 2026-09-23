import { expect, test } from '@playwright/test'

test('Web browsing stays out of Chat when a URL is typed', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')

    const composer = page.getByLabel('Message TALOS')
    const prompt = 'Apri https://example.com/path e dimmi cosa vedi'
    await composer.fill(prompt)

    // Since v0.1.30 browsing is intentionally no longer a Chat surface. The
    // local browser remains a model tool, while Chat must not resurrect the
    // retired URL pill, Browse banner, or direct Browse control.
    await expect(composer).toHaveValue(prompt)
    await expect(page.getByTestId('talos-mobile-browser-url-suggestion')).toHaveCount(0)
    await expect(page.getByTestId('talos-mobile-browse-mode-status')).toHaveCount(0)
    await expect(page.getByLabel('Enable Browse mode')).toHaveCount(0)
    await expect(page.locator('[data-talos-route]')).toHaveAttribute('data-talos-route', 'chat')

    for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 640 }]) {
        await page.setViewportSize(viewport)
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(overflow).toBeLessThanOrEqual(0)
    }
})
