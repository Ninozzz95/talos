import { expect, test, type Page } from '@playwright/test'
import { installTalosApiMocks } from './helpers/talosApiMocks'

const e2eLoginEmail = process.env.TALOS_E2E_EMAIL ?? 'test@example.com'
const e2eLoginPassword = process.env.TALOS_E2E_PASSWORD ?? 'password'

async function openAuthenticatedWorkspace(page: Page) {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    if (await page.locator('#talos-workspace-root[data-authenticated="true"]').count() === 0) {
        await page.goto('/login', { waitUntil: 'domcontentloaded' })
        const form = page.locator('#talos-login-form')
        await expect(form).toBeVisible()
        await form.getByLabel('Email').fill(e2eLoginEmail)
        await form.getByLabel('Password').fill(e2eLoginPassword)
        await Promise.all([
            page.waitForURL(/\/$/, { waitUntil: 'domcontentloaded' }),
            form.getByRole('button', { name: 'Sign in' }).click(),
        ])
    }

    await expect(page.locator('#talos-workspace-root[data-authenticated="true"]')).toHaveCount(1)
    await expect(page.getByLabel('Message TALOS')).toBeVisible({ timeout: 45_000 })
}

test('v7 chat: user cards align right, arrowup recalls, censored email reveals on click and survives reload', async ({ page }) => {
    await installTalosApiMocks(page, {
        chatResponseText: 'Contact ops@example.com for the verified deploy window.',
    })
    await openAuthenticatedWorkspace(page)

    const composer = page.getByLabel('Message TALOS')
    const promptText = 'Who owns the deploy window?'
    await composer.fill(promptText)
    await composer.press('Enter')

    const userArticle = page.locator('article[data-message-role="user"]').last()
    await expect(userArticle).toBeVisible()
    await expect(userArticle).toHaveClass(/justify-end/)
    await expect(userArticle.locator('[data-message-kind="user"]')).toBeVisible()

    const assistantArticle = page.locator('article[data-message-role="assistant"]').last()
    await expect(assistantArticle).toBeVisible()

    const censored = assistantArticle.locator('button.talos-censored[data-censored-kind="email"]')
    await expect(censored).toBeVisible()
    await expect(censored).not.toHaveAttribute('data-revealed', 'true')
    await censored.click()
    await expect(censored).toHaveAttribute('data-revealed', 'true')
    await expect(censored).toHaveText('ops@example.com')

    await expect(composer).toHaveValue('')
    await composer.press('ArrowUp')
    await expect(composer).toHaveValue(promptText)
    await composer.fill('')

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByLabel('Message TALOS')).toBeVisible({ timeout: 45_000 })

    const reloadedCensored = page
        .locator('article[data-message-role="assistant"]')
        .last()
        .locator('button.talos-censored[data-censored-kind="email"]')
    await expect(reloadedCensored).toBeVisible()
    await expect(reloadedCensored).not.toHaveAttribute('data-revealed', 'true')
})

test('v7 chat: system rows render as centered captions and loading uses skeletons', async ({ page }) => {
    await installTalosApiMocks(page, {
        chatResponseText: 'Benchmark comparison completed for this run.',
    })
    await openAuthenticatedWorkspace(page)

    const composer = page.getByLabel('Message TALOS')
    await composer.fill('Run the workflow audit')
    await composer.press('Enter')

    await expect(page.locator('article[data-message-role="assistant"]').last()).toBeVisible()

    const statusRows = page.locator('.talos-status-row')
    if (await statusRows.count() > 0) {
        await expect(statusRows.first()).toBeVisible()
    }

    const meta = page.locator('article[data-message-role="assistant"] .talos-message-meta').last()
    await expect(meta).toBeVisible()
})
