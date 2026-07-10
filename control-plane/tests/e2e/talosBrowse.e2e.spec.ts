import { expect, test, type Page } from '@playwright/test'
import { installTalosApiMocks } from './helpers/talosApiMocks'

const e2eSetupEmail = 'talos-e2e@example.test'
const e2eSetupPassword = 'talos-e2e-password-123'
const e2eLoginEmail = process.env.TALOS_E2E_EMAIL ?? 'test@example.com'
const e2eLoginPassword = process.env.TALOS_E2E_PASSWORD ?? 'password'

async function isAuthenticatedWorkspace(page: Page) {
    return await page.locator('#talos-workspace-root[data-authenticated="true"]').count() > 0
}

async function openWorkspace(page: Page) {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('#talos-workspace-root[data-authenticated="true"]')).toHaveCount(1)
    await expect(page.getByLabel('Message TALOS')).toBeVisible({ timeout: 45_000 })
}

async function submitLogin(page: Page, email: string, password: string) {
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    const form = page.locator('#talos-login-form')
    if (!await form.isVisible().catch(() => false)) return false

    await form.getByLabel('Email').fill(email)
    await form.getByLabel('Password').fill(password)
    await Promise.all([
        page.waitForURL(/\/$/, { waitUntil: 'domcontentloaded', timeout: 4_000 }).catch(() => undefined),
        form.getByRole('button', { name: 'Sign in' }).click(),
    ])

    return isAuthenticatedWorkspace(page)
}

async function ensureAuthenticated(page: Page) {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    if (await isAuthenticatedWorkspace(page)) {
        await openWorkspace(page)
        return
    }

    await page.goto('/setup', { waitUntil: 'domcontentloaded' })
    const setupForm = page.locator('#talos-setup-form')
    if (await setupForm.isVisible().catch(() => false)) {
        await setupForm.getByLabel('Name').fill('TALOS E2E Admin')
        await setupForm.getByLabel('Email').fill(e2eSetupEmail)
        await setupForm.getByLabel('Password', { exact: true }).fill(e2eSetupPassword)
        await setupForm.getByLabel('Confirm password').fill(e2eSetupPassword)
        await Promise.all([
            page.waitForURL(/\/$/, { waitUntil: 'domcontentloaded', timeout: 4_000 }).catch(() => undefined),
            setupForm.getByRole('button', { name: 'Create first admin' }).click(),
        ])

        if (await isAuthenticatedWorkspace(page)) {
            await openWorkspace(page)
            return
        }
    }

    for (const [email, password] of [[e2eLoginEmail, e2eLoginPassword], [e2eSetupEmail, e2eSetupPassword]] as const) {
        if (await submitLogin(page, email, password)) {
            await openWorkspace(page)
            return
        }
    }

    throw new Error('TALOS Browse E2E could not authenticate through setup or login.')
}

async function resetMocks(page: Page, options: Parameters<typeof installTalosApiMocks>[1] = {}) {
    await page.unroute('**/api/**')
    await installTalosApiMocks(page, options)
    await openWorkspace(page)
}

async function expectNoDocumentOverflow(page: Page) {
    const geometry = await page.evaluate(() => ({
        document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        thread: Array.from(document.querySelectorAll('.talos-chat-thread')).map((element) => element.scrollWidth - element.clientWidth),
        bubbles: Array.from(document.querySelectorAll('.talos-chat-message > div')).map((element) => element.scrollWidth - element.clientWidth),
    }))

    expect(geometry.document, JSON.stringify(geometry)).toBeLessThanOrEqual(1)
    expect(Math.max(0, ...geometry.thread), JSON.stringify(geometry)).toBeLessThanOrEqual(1)
    expect(Math.max(0, ...geometry.bubbles), JSON.stringify(geometry)).toBeLessThanOrEqual(1)
}

test.beforeEach(async ({ page }) => {
    await installTalosApiMocks(page)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await ensureAuthenticated(page)
})

test('Browse is an in-place mode with one chat and no automatic evidence sidebar', async ({ page }) => {
    await page.getByRole('button', { name: 'Browse', exact: true }).click()

    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByLabel('TALOS chat thread')).toBeVisible()
    await expect(page.getByLabel('Message TALOS')).toBeVisible()
    await expect(page.locator('[data-testid="talos-browse-page-controls"]')).toHaveCount(0)
    await expect(page.locator('[data-testid="talos-browse-panel"]')).toHaveCount(0)
    await expect(page.locator('[data-testid="talos-window-layer"]')).toHaveCount(1)
    await expect(page.getByTestId('talos-browse-mode')).toHaveAttribute('data-enabled', 'true')
    await expect(page.getByTestId('talos-browse-mode')).toContainText(/Ready|Active/)
})

test('Browse keeps every real module available on desktop and mobile', async ({ page }) => {
    await page.getByRole('button', { name: 'Browse', exact: true }).click()
    const modules = ['Runtime', 'Compare', 'Model Lab', 'Deep Research', 'Artifacts', 'Library', 'Calendar', 'Settings']

    for (const module of modules) {
        await page.getByRole('button', { name: module, exact: true }).first().click()
        const windowId = {
            'Deep Research': 'research',
            Artifacts: 'gallery',
            'Model Lab': 'model_lab',
        }[module] ?? module.toLowerCase()
        const window = page.locator(`[data-window-id="${windowId}"]`)
        await expect(window).toBeVisible()
        await window.getByRole('button', { name: new RegExp(`Close ${module}|Close ${windowId}`, 'i') }).click()
    }

    await page.getByRole('button', { name: 'Advanced', exact: true }).click()
    const advancedLabels = await page.locator('[id^="talos-advanced-items-"]:visible button').allTextContents()
    expect(advancedLabels.map((label) => label.trim())).toEqual(['Tasks', 'Notes', 'Knowledge', 'Brain', 'Tools', 'Doctor'])
    for (const module of ['Tasks', 'Notes', 'Knowledge', 'Brain', 'Tools', 'Doctor']) {
        await page.getByRole('button', { name: module, exact: true }).first().click()
        const windowId = module === 'Knowledge' ? 'search' : module.toLowerCase()
        const window = page.locator(`[data-window-id="${windowId}"]`)
        await expect(window).toBeVisible()
        await window.getByRole('button', { name: new RegExp(`Close ${module}|Close ${windowId}`, 'i') }).click()
    }
})

test('Browse lifecycle starts a real session and captures screenshot evidence inline', async ({ page }) => {
    await page.getByRole('button', { name: 'Browse', exact: true }).click()
    await expect(page.getByTestId('talos-browse-mode')).toContainText(/Ready|Active/)
    await expect(page.getByRole('button', { name: 'Capture browser screenshot' })).toBeEnabled()

    const screenshotRequest = page.waitForRequest((request) => request.url().endsWith('/screenshot') && request.method() === 'POST')
    await page.getByRole('button', { name: 'Capture browser screenshot' }).click()
    await screenshotRequest
    await expect(page.getByTestId('talos-browser-activity')).toContainText(/Screenshot|screenshot/)
    await expect(page.getByRole('img', { name: 'Browser screenshot evidence' })).toBeVisible()
    await page.getByRole('button', { name: 'Browse actions' }).click()
    await expect(page.getByRole('button', { name: 'Disable Browse' })).toBeVisible()
})

test('Browse chat can capture screenshot evidence and restores it after reload', async ({ page }) => {
    await page.getByRole('button', { name: 'Browse', exact: true }).click()
    await page.getByLabel('Message TALOS').fill('puoi fare screenshot^')
    await page.getByRole('button', { name: 'Send', exact: true }).click()

    const activity = page.getByTestId('talos-browser-activity')
    const screenshot = page.getByRole('img', { name: 'Browser screenshot evidence' })
    await expect(activity).toContainText('Screenshot')
    await expect(screenshot).toBeVisible()
    const activityBox = await activity.boundingBox()
    const screenshotBox = await screenshot.boundingBox()
    expect(screenshotBox?.width ?? 0).toBeGreaterThan((activityBox?.width ?? 0) * 0.9)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByLabel('Message TALOS')).toBeVisible({ timeout: 45_000 })
    await page.getByRole('button', { name: 'Browse', exact: true }).click()
    await expect(page.getByRole('img', { name: 'Browser screenshot evidence' })).toBeVisible()
})

test('a screenshot capability question does not fabricate screenshot evidence', async ({ page }) => {
    await page.getByRole('button', { name: 'Browse', exact: true }).click()
    await page.getByLabel('Message TALOS').fill('quindi hai permessi screenshot?')
    await page.getByRole('button', { name: 'Send', exact: true }).click()

    await expect(page.getByTestId('talos-browser-activity')).toContainText('Chat browser read')
    await expect(page.getByRole('img', { name: 'Browser screenshot evidence' })).toHaveCount(0)
})

test('Browse actions close on Escape and click outside', async ({ page }) => {
    await page.getByRole('button', { name: 'Browse', exact: true }).click()
    await page.getByRole('button', { name: 'Browse actions' }).click()
    await expect(page.getByRole('button', { name: 'Restart browser' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Restart browser' })).toBeHidden()

    await page.getByRole('button', { name: 'Browse actions' }).click()
    await page.getByRole('heading', { name: 'TALOS', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Restart browser' })).toBeHidden()
})

test('minimal composer keeps only Browse status, textarea, icon send, and expand', async ({ page }) => {
    await page.getByRole('button', { name: 'Browse', exact: true }).click()
    await page.getByRole('button', { name: 'Use minimal composer' }).click()

    const composer = page.locator('[data-composer-mode="minimal"]')
    await expect(composer).toBeVisible()
    await expect(composer.getByTestId('talos-browse-mode')).toHaveAttribute('aria-label', 'Browse status: Active')
    const controls = await composer.evaluate((element) => Array.from(element.querySelectorAll('button')).map((button) => ({
        label: button.getAttribute('aria-label'),
        text: button.textContent?.trim(),
    })))

    expect(controls.map((control) => control.label)).toEqual([
        'Send',
        'Use full composer',
    ])
    expect(controls[0].text).toBe('')
    await expect(composer.getByLabel('Message TALOS')).toBeVisible()
})

test('Browse deep links hydrate as the normal chat and normalize the URL', async ({ page }) => {
    await page.goto('/browse?open=https%3A%2F%2Ffixture.example.test%2Fevidence', { waitUntil: 'domcontentloaded' })
    await expect(page.getByLabel('TALOS chat thread')).toBeVisible({ timeout: 45_000 })
    await expect(page).toHaveURL(/\/$/)
    await expect(page.locator('[data-testid="talos-browse-page-controls"]')).toHaveCount(0)
    await expect(page.getByTestId('talos-browse-mode')).toHaveAttribute('data-enabled', 'true')
})

test('Long chat content stays inside the document and thread at mobile widths', async ({ page }) => {
    const longToken = 'x'.repeat(4096)
    await resetMocks(page, {
        initialSessions: [{
            id: 'session-long-e2e',
            title: 'Long content',
            messages: [
                { role: 'user', content: `https://fixture.example.test/${longToken}` },
                { role: 'assistant', content: `${longToken}\n\n| ${longToken} | ${longToken} |\n\n\`\`\`text\n${longToken}\n\`\`\`` },
            ],
        }],
    })

    await page.setViewportSize({ width: 320, height: 740 })
    await expect(page.locator('.talos-chat-message').last()).toBeVisible()
    await expectNoDocumentOverflow(page)
})

test('Browse remains in place while the chat request carries the typed browser mode', async ({ page }) => {
    const chatBodies: Record<string, unknown>[] = []
    page.on('request', (request) => {
        if (new URL(request.url()).pathname === '/api/talos/chat' && request.method() === 'POST') {
            chatBodies.push(request.postDataJSON() as Record<string, unknown>)
        }
    })

    await page.getByRole('button', { name: 'Browse', exact: true }).click()
    await page.getByLabel('Message TALOS').fill('Read the current page')
    await page.getByRole('button', { name: 'Send', exact: true }).click()

    await expect.poll(() => chatBodies.length).toBe(1)
    expect(chatBodies[0].browser_mode).toEqual({ enabled: true, browser_session_id: 'browser-session-e2e' })
    expect(chatBodies[0].browser_context).toBeUndefined()
    await expect(page.getByTestId('talos-browser-activity').getByText('Chat browser read')).toHaveCount(1)
    expect(await page).toHaveURL(/\/$/)
})
