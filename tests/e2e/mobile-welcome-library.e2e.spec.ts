import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import type { TalosWelcomeCatalog } from '../../src/lib/welcome/catalog'

function readCatalog(locale: 'en' | 'it'): TalosWelcomeCatalog {
    const path = resolve(process.cwd(), `src/lib/welcome/catalogs/${locale}.json`)
    return JSON.parse(readFileSync(path, 'utf8')) as TalosWelcomeCatalog
}

const english = readCatalog('en')
const italian = readCatalog('it')

const HERO = '[data-testid="talos-empty-brand"]'
const SHEET = '[data-testid="talos-mobile-tool-sheet"]'

async function waitForBoot(page: Page): Promise<void> {
    const boot = page.locator('[data-testid="talos-boot-logo"]')
    await boot.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => undefined)
    await boot.waitFor({ state: 'detached', timeout: 15_000 })
    await expect(page.getByTestId('talos-mobile-composer')).toBeVisible()
}

async function createPersistedEmptyChat(page: Page): Promise<void> {
    await page.getByTestId('talos-mobile-header').getByLabel('Chat options').click()
    await page.getByRole('menuitem', { name: 'New chat' }).click()
    await expect(page.locator(HERO)).toBeVisible()
}

async function openLanguageSettings(page: Page): Promise<void> {
    await page.getByLabel('Open menu').click()
    await page.locator('[data-testid="talos-mobile-sidebar"]')
        .getByLabel('Open Settings').click()
    await expect(page.locator(SHEET)).toBeVisible()
    await page.locator('[data-settings-tab="language"]').click()
    await expect(page.locator('[data-testid="talos-settings-language"]')).toBeVisible()
}

async function closeSettings(page: Page): Promise<void> {
    const sheet = page.locator(SHEET)
    const back = sheet.getByTestId('talos-sheet-back')
    if (await back.getAttribute('aria-label') === 'Back') {
        await back.click()
        await expect(back).toHaveAttribute('aria-label', 'Back to chat')
    }
    await back.click()
    await expect(sheet).toBeHidden()
}

test.use({ locale: 'en-US', contextOptions: { reducedMotion: 'reduce' } })

test('WELCOME-E2E-01/02/03 keeps a localized Christmas title stable on phone, reload and tablet', async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 11, 25, 10, 0, 0))
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await waitForBoot(page)
    await createPersistedEmptyChat(page)

    const hero = page.locator(HERO)
    const heading = hero.getByRole('heading', { level: 1 })
    await expect(heading).toBeVisible()
    await expect(hero.locator('p')).toHaveCount(0)
    const decoration = hero.getByTestId('talos-welcome-easter-egg')
    await expect(decoration).toHaveAttribute('data-welcome-easter-egg', 'gift')

    const englishTitle = (await heading.innerText()).trim()
    const index = english.specialDates.christmas_day.titles.indexOf(englishTitle)
    expect(index).toBeGreaterThanOrEqual(0)

    await expect(decoration).toHaveAttribute('aria-hidden', 'true')
    await expect(decoration.locator('svg.lucide-gift')).toHaveCount(1)
    expect(await decoration.evaluate(element => element.getAnimations().length)).toBe(0)

    await openLanguageSettings(page)
    await page.locator('[data-testid="talos-settings-language"] [data-language-mode="it"]').click()
    await closeSettings(page)
    await expect(heading).toHaveText(italian.specialDates.christmas_day.titles[index]!)

    const italianTitle = await heading.innerText()
    await page.reload()
    await waitForBoot(page)
    await expect(page.locator(HERO).getByRole('heading', { level: 1 })).toHaveText(italianTitle)
    await expect(page.locator(HERO).locator('p')).toHaveCount(0)

    await page.setViewportSize({ width: 1024, height: 768 })
    await expect(page.locator(HERO).getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.locator(HERO).getByTestId('talos-welcome-easter-egg'))
        .toHaveAttribute('data-welcome-easter-egg', 'gift')
    await expect(page.getByTestId('talos-mobile-composer')).toBeVisible()
})
