import { expect, test, type Page } from '@playwright/test'
import { installTalosApiMocks } from './helpers/talosApiMocks'

let browserErrors: string[] = []
let apiErrors: string[] = []

async function openWorkspace(page: Page) {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('#talos-workspace-root[data-authenticated="true"]')).toHaveCount(1)
    await expect(page.getByLabel('Message TALOS')).toBeVisible({ timeout: 45_000 })
}

async function resetBrowseMocks(page: Page, browser: Parameters<typeof installTalosApiMocks>[1]['browser']) {
    await page.unroute('**/api/**')
    await installTalosApiMocks(page, { browser })
    await openWorkspace(page)
}

async function openBrowsePage(page: Page) {
    await page.getByRole('button', { name: 'Browse' }).click()
    await page.waitForURL('**/browse')
    await expect(page.locator('#talos-workspace-root[data-talos-surface="browse"]')).toHaveCount(1)
    await expect(page.locator('[data-testid="talos-browse-page-controls"]')).toBeVisible()
}

async function ensureAuthenticated(page: Page) {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    if (await page.locator('#talos-workspace-root[data-authenticated="true"]').count()) {
        return
    }

    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    const form = page.locator('#talos-login-form')
    await expect(form).toBeVisible()
    await form.getByLabel('Email').fill(process.env.TALOS_E2E_EMAIL ?? 'test@example.com')
    await form.getByLabel('Password').fill(process.env.TALOS_E2E_PASSWORD ?? 'password')
    await form.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.locator('#talos-workspace-root[data-authenticated="true"]')).toHaveCount(1)
}

test.beforeEach(async ({ page }) => {
    browserErrors = []
    apiErrors = []
    page.on('pageerror', (error) => browserErrors.push(error.message))
    page.on('console', (message) => {
        if (message.type() === 'error' && !message.text().includes('the server responded with a status of 403')) browserErrors.push(message.text())
    })
    page.on('response', (response) => {
        if (response.status() >= 400 && response.url().includes('/api/')) {
            apiErrors.push(`${response.status()} ${new URL(response.url()).pathname}`)
        }
    })
    await installTalosApiMocks(page)
    await ensureAuthenticated(page)
    await openWorkspace(page)
})

test('Browse disables controls without server capabilities and renders policy denials', async ({ page }) => {
    await resetBrowseMocks(page, { capabilities: ['navigate', 'screenshot'], deny: 'screenshot' })
    await openBrowsePage(page)
    await page.getByRole('button', { name: 'Start session' }).click()

    await expect(page.getByRole('button', { name: 'Capture snapshot' })).toBeDisabled()
    await page.getByRole('button', { name: 'Capture screenshot' }).click()
    await expect(page.getByRole('alert')).toContainText('Screenshot denied by Browse policy.')
    await expect(page.locator('[data-testid="talos-browse-panel"]')).toBeVisible()
    expect(browserErrors).toEqual([])
    expect(apiErrors).toContain('403 /api/talos/browser/sessions/browser-session-e2e/screenshot')
})

for (const status of ['closed', 'expired']) {
    test(`Browse restarts a ${status} session`, async ({ page }) => {
        await resetBrowseMocks(page, { createStatuses: [status, 'active'] })
        await openBrowsePage(page)
        await page.getByRole('button', { name: 'Start session' }).click()
        await expect(page.getByText(`This session is ${status}.`)).toBeVisible()
        await expect(page.getByRole('button', { name: 'Navigate' })).toBeDisabled()

        await page.getByRole('button', { name: 'Restart session' }).click()
        await expect(page.getByText('active', { exact: true })).toBeVisible()
        expect(browserErrors).toEqual([])
        expect(apiErrors).toEqual([])
    })
}

test('Browse page keeps controls and the composer reachable with internal evidence scrolling', async ({ page }, testInfo) => {
    await openBrowsePage(page)
    await page.getByRole('button', { name: 'Start session' }).click()
    await page.getByRole('button', { name: 'Capture screenshot' }).click()
    await expect(page.getByAltText('Browser screenshot evidence')).toBeVisible()
    await page.getByRole('button', { name: 'Capture snapshot' }).click()
    await expect(page.getByText('Untrusted snapshot evidence')).toBeVisible()

    const browseControls = page.locator('[data-testid="talos-browse-page-controls"]')
    const composer = page.locator('.talos-chat-composer-shell')
    await browseControls.scrollIntoViewIfNeeded()
    const [browseBox, composerBox] = await Promise.all([browseControls.boundingBox(), composer.boundingBox()])
    expect(browseBox).not.toBeNull()
    expect(composerBox).not.toBeNull()
    expect(browseBox!.width).toBeGreaterThan(200)
    expect(composerBox!.width).toBeGreaterThan(200)
    const isMobileLayout = await page.evaluate(() => window.matchMedia('(max-width: 1023px)').matches)
    if (isMobileLayout) {
        expect(composerBox!.y).toBeGreaterThanOrEqual(browseBox!.y + browseBox!.height)
    } else {
        expect(composerBox!.x).toBeGreaterThanOrEqual(browseBox!.x + browseBox!.width)
    }
    await expect(page.locator('[data-testid="talos-browse-scroll-region"]')).toBeVisible()
    expect(browserErrors).toEqual([])
    expect(apiErrors).toEqual([])
    await testInfo.attach(`talos-browse-clearance-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: false, animations: 'disabled' }),
        contentType: 'image/png',
    })
})

test('Browse exposes an explicit return to the general TALOS chat', async ({ page }) => {
    await openBrowsePage(page)

    await page.getByRole('link', { name: 'General chat' }).click()

    await page.waitForURL('**/')
    await expect(page.locator('#talos-workspace-root[data-talos-surface="workspace"]')).toHaveCount(1)
})

test('Browse uses persisted API evidence for a read-only session', async ({ page }, testInfo) => {
    await openBrowsePage(page)
    await expect(page.getByText('TALOS BROWSE')).toBeVisible()
    await page.getByRole('button', { name: 'Start session' }).click()

    await page.getByLabel('Browser URL').fill('https://fixture.example.test/evidence')
    await page.getByRole('button', { name: 'Navigate' }).click()
    await expect(page.getByText('Fixture evidence page')).toBeVisible()

    await page.getByRole('button', { name: 'Capture screenshot' }).click()
    const screenshotEvidence = page.getByAltText('Browser screenshot evidence')
    await expect(screenshotEvidence).toBeVisible()
    const screenshotDimensions = await screenshotEvidence.evaluate((image: HTMLImageElement) => ({ width: image.naturalWidth, height: image.naturalHeight }))
    expect(screenshotDimensions.width).toBeGreaterThan(1)
    expect(screenshotDimensions.height).toBeGreaterThan(1)

    await page.getByRole('button', { name: 'Capture snapshot' }).click()
    await expect(page.getByText('Untrusted snapshot evidence')).toBeVisible()
    await expect(page.getByText('main Fixture evidence')).toBeVisible()
    await expect(page.getByText('navigation.completed')).toBeVisible()

    await expect(page.locator('body')).not.toBeEmpty()
    await expect(page.locator('[data-testid="talos-browse-panel"]')).toBeVisible()
    expect(browserErrors).toEqual([])
    await testInfo.attach(`talos-browse-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
        contentType: 'image/png',
    })
})

test('Browse reload restores the most recent owned browser session and captured evidence', async ({ page }) => {
    await openBrowsePage(page)
    await page.getByRole('button', { name: 'Start session' }).click()
    await page.getByLabel('Browser URL').fill('https://fixture.example.test/evidence')
    await page.getByRole('button', { name: 'Navigate' }).click()
    await page.getByRole('button', { name: 'Capture snapshot' }).click()
    await expect(page.getByText('Untrusted snapshot evidence')).toBeVisible()

    await page.reload({ waitUntil: 'domcontentloaded' })

    await expect(page.locator('#talos-workspace-root[data-talos-surface="browse"]')).toHaveCount(1)
    const browserPanel = page.getByTestId('talos-browse-panel')
    await expect(browserPanel.getByText('Fixture evidence page')).toBeVisible()
    await expect(browserPanel.getByText('https://fixture.example.test/evidence')).toBeVisible()
    await expect(browserPanel.getByText('Untrusted snapshot evidence')).toBeVisible()
})

test('Browse URL handoff displays a policy denial and clears the transient query', async ({ page }) => {
    await resetBrowseMocks(page, { deny: 'navigate' })

    await page.goto('/browse?open=https%3A%2F%2Ffixture.example.test%2Fevidence', { waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('alert')).toContainText('Navigation denied by Browse policy.')
    await expect(page).toHaveURL(/\/browse$/)
    await expect(page.getByLabel('Message TALOS')).toBeVisible()
})

test('Browse chat sends only the attached browser session id and supports detach', async ({ page }) => {
    const chatBodies: Record<string, unknown>[] = []
    page.on('request', (request) => {
        if (new URL(request.url()).pathname === '/api/talos/chat' && request.method() === 'POST') {
            chatBodies.push(request.postDataJSON() as Record<string, unknown>)
        }
    })

    await openBrowsePage(page)
    await page.getByRole('button', { name: 'Start session' }).click()
    await page.getByLabel('Browser URL').fill('https://fixture.example.test/evidence')
    await page.getByRole('button', { name: 'Navigate' }).click()
    await page.getByRole('button', { name: 'Capture snapshot' }).click()
    await expect(page.locator('[data-testid="talos-browser-context-chip"]')).toBeVisible()

    await page.getByLabel('Message TALOS').fill('What is the browser evidence?')
    await page.locator('button[title="Send message"]').click()
    await expect.poll(() => chatBodies.length).toBe(1)
    await expect(page.locator('[data-testid="talos-browser-evidence-disclosure"]')).toContainText('Fixture evidence page')
    expect(chatBodies[0].browser_context).toEqual({ browser_session_id: 'browser-session-e2e' })
    expect(JSON.stringify(chatBodies[0])).not.toContain('fixture.example.test/evidence')
    expect(JSON.stringify(chatBodies[0])).not.toContain('Fixture evidence')
    expect(JSON.stringify(chatBodies[0])).not.toContain('cookies')

    await page.getByRole('button', { name: 'Detach browser evidence' }).click()
    await expect(page.locator('[data-testid="talos-browser-context-chip"]')).toHaveCount(0)
    await page.getByLabel('Message TALOS').fill('Answer without browser evidence.')
    await page.locator('button[title="Send message"]').click()
    await expect.poll(() => chatBodies.length).toBe(2)
    expect(chatBodies[1].browser_context).toBeUndefined()
})

test('Browse command palette and slash URL handoff never send a browser command to chat', async ({ page }) => {
    const chatRequests: string[] = []
    const browserNavigateRequests: string[] = []
    page.on('request', (request) => {
        const path = new URL(request.url()).pathname
        if (path === '/api/talos/chat' && request.method() === 'POST') chatRequests.push(request.postData() ?? '')
        if (path.endsWith('/navigate') && request.method() === 'POST') browserNavigateRequests.push(request.postData() ?? '')
    })

    await page.getByRole('button', { name: 'Open command palette' }).click()
    await page.getByLabel('Search TALOS commands').fill('open browse')
    await page.getByRole('option', { name: /Open Browse/ }).click()
    await page.waitForURL('**/browse')
    await expect(page.locator('[data-testid="talos-browse-page-controls"]')).toBeVisible()

    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.getByLabel('Message TALOS').fill('/browse open https://fixture.example.test/evidence')
    await page.getByLabel('Message TALOS').press('Enter')
    await page.waitForURL('**/browse')
    await expect(page.getByText('Fixture evidence page')).toBeVisible()
    await expect(page).toHaveURL(/\/browse$/)
    expect(browserNavigateRequests).toContain(JSON.stringify({ url: 'https://fixture.example.test/evidence' }))
    expect(chatRequests).toEqual([])
})
