import { expect, test, type Page } from '@playwright/test'
import { installTalosApiMocks } from './helpers/talosApiMocks'

const e2eSetupEmail = 'talos-e2e@example.test'
const e2eSetupPassword = 'talos-e2e-password-123'
const browserScreenshotName = /^Browser screenshot \d+ of \d+$/
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

async function openAdvancedNavigation(page: Page, isMobile: boolean) {
    if (isMobile) {
        const navigation = page.getByRole('dialog', { name: 'TALOS navigation', exact: true })
        if (!await navigation.isVisible().catch(() => false)) {
            await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click()
            await expect(navigation).toBeVisible()
        }
        const advanced = navigation.getByRole('button', { name: 'Advanced', exact: true })
        if (await advanced.getAttribute('aria-expanded') !== 'true') await advanced.click()

        return navigation
    }

    const advanced = page.getByRole('button', { name: 'Advanced', exact: true })
    if (await advanced.getAttribute('aria-expanded') !== 'true') await advanced.click()

    return page.locator('body')
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

test('persisted Browser clarification choices survive reload and only fill the composer', async ({ page }) => {
    await resetMocks(page, {
        initialSessions: [{
            id: 'browser-clarification-chat',
            title: 'Browser destination choice',
            messages: [{
                role: 'user',
                content: 'Compare https://one.example/path and https://two.example/item.',
            }, {
                role: 'assistant',
                content: 'I found multiple destinations. Choose which one TALOS should open.',
                metadata: {
                    source: 'talos_browser_clarification',
                    browser_follow_up: {
                        schema_version: 'talos_browser_follow_up_v1',
                        operation: 'clarify',
                        choices: [
                            { index: 1, url: 'https://one.example/path', host: 'one.example', label: 'one.example/path' },
                            { index: 2, url: 'https://two.example/item', host: 'two.example', label: 'two.example/item' },
                        ],
                        reason: 'multiple_urls',
                    },
                },
            }],
        }],
    })
    const choices = page.getByTestId('talos-browser-clarification-choices')
    await expect(choices).toBeVisible()
    await expect(choices.getByRole('button')).toHaveCount(2)
    await expectNoDocumentOverflow(page)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('talos-browser-clarification-choices')).toBeVisible()

    let chatPosts = 0
    page.on('request', (request) => {
        if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/talos/chat') chatPosts += 1
    })
    await page.getByRole('button', { name: 'Use destination two.example/item' }).click()

    await expect(page.getByLabel('Message TALOS')).toHaveValue('Open and inspect https://two.example/item')
    expect(chatPosts).toBe(0)
})

test('Browse keeps every real module available on desktop and mobile', async ({ page, isMobile }) => {
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

    let advancedNavigation = await openAdvancedNavigation(page, isMobile)
    const advancedLabels = await advancedNavigation.locator('[id^="talos-advanced-items-"] button').allTextContents()
    expect(advancedLabels.map((label) => label.trim())).toEqual(['Tasks', 'Notes', 'Knowledge', 'Brain', 'Tools', 'Doctor'])
    for (const module of ['Tasks', 'Notes', 'Knowledge', 'Brain', 'Tools', 'Doctor']) {
        advancedNavigation = await openAdvancedNavigation(page, isMobile)
        const moduleButton = advancedNavigation.getByRole('button', { name: module, exact: true })
        await moduleButton.click()
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
    await expect(page.getByRole('img', { name: browserScreenshotName })).toBeVisible()

    await page.getByRole('button', { name: 'Browse actions' }).click()
    await expect(page.getByRole('menuitem', { name: 'Capture page structure' })).toHaveCount(0)
    await expect(page.getByTestId('talos-browser-snapshot-viewer')).toHaveCount(0)
    await expect(page.getByRole('menuitem', { name: 'Disable Browse' })).toBeVisible()
})

test('Browse exposes the current page and a real stop then retry lifecycle', async ({ page }) => {
    const browserCreates: Record<string, unknown>[] = []
    let chatCreates = 0
    page.on('request', (request) => {
        const path = new URL(request.url()).pathname
        if (path === '/api/talos/browser/sessions' && request.method() === 'POST') {
            browserCreates.push(request.postDataJSON() as Record<string, unknown>)
        }
        if (path === '/api/talos/sessions' && request.method() === 'POST') chatCreates += 1
    })
    await page.getByRole('button', { name: 'Browse', exact: true }).click()
    await page.getByLabel('Message TALOS').fill('/browse open https://fixture.example.test/evidence')
    await page.getByLabel('Message TALOS').press('Enter')

    await page.getByRole('button', { name: 'Browse actions' }).click()
    const currentPage = page.getByTestId('talos-browser-current-page')
    await expect(currentPage).toContainText('Fixture evidence page')
    await expect(currentPage).toContainText('fixture.example.test')

    await page.getByRole('button', { name: 'Browse actions' }).click()
    const firstScreenshotResponse = page.waitForResponse((response) => (
        response.request().method() === 'POST'
        && new URL(response.url()).pathname.endsWith('/screenshot')
    ))
    await page.getByRole('button', { name: 'Capture browser screenshot' }).click()
    const firstScreenshot = await (await firstScreenshotResponse).json()
    await expect(page.getByRole('img', { name: browserScreenshotName })).toBeVisible()

    const stopResponse = page.waitForResponse((response) => (
        response.request().method() === 'DELETE'
        && /\/api\/talos\/browser\/sessions\/[^/]+$/.test(new URL(response.url()).pathname)
    ))
    await page.getByRole('button', { name: 'Browse actions' }).click()
    await page.getByRole('menuitem', { name: 'Stop browser' }).click()
    const stoppedSession = await (await stopResponse).json()
    expect(stoppedSession.data.status).toBe('closed')
    const stoppedBrowserSessionId = stoppedSession.data.id

    await expect(page.getByTestId('talos-browse-mode')).toHaveAttribute('aria-label', 'Browse status: Stopped')
    await expect(page.getByRole('button', { name: 'Capture browser screenshot' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled()

    await page.getByRole('button', { name: 'Browse actions' }).click()
    const retryResponse = page.waitForResponse((response) => (
        response.request().method() === 'POST'
        && new URL(response.url()).pathname === '/api/talos/browser/sessions'
    ))
    await page.getByRole('menuitem', { name: 'Retry browser' }).click()
    const retriedSession = await (await retryResponse).json()
    await expect(page.getByTestId('talos-browse-mode')).toHaveAttribute('aria-label', /Browse status: (Ready|Active)/)
    expect(browserCreates).toHaveLength(2)
    expect(chatCreates).toBe(1)
    const talosSessionId = String(browserCreates[0]?.talos_session_id ?? '')
    expect(talosSessionId).not.toBe('')
    expect(browserCreates[1]?.talos_session_id).toBe(talosSessionId)
    expect(retriedSession.data.id).not.toBe(stoppedBrowserSessionId)
    expect(retriedSession.data.status).toMatch(/active|ready/)
    const sessionsAfterRetry = await page.evaluate(async (sessionId) => fetch(`/api/talos/browser/sessions?${new URLSearchParams({ talos_session_id: sessionId })}`, {
        headers: { 'X-Talos-Session-Id': sessionId },
    }).then((response) => response.json()), talosSessionId)
    expect(sessionsAfterRetry.data).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: stoppedBrowserSessionId, status: 'closed' }),
        expect.objectContaining({ id: retriedSession.data.id, status: expect.stringMatching(/active|ready/) }),
    ]))
    await expect(page.getByRole('img', { name: browserScreenshotName })).toHaveCount(0)
    await expect(page.getByTestId('talos-browser-activity')).not.toContainText('Screenshot capture succeeded')

    const retriedScreenshotRequest = page.waitForRequest((request) => (
        request.method() === 'POST'
        && new URL(request.url()).pathname.endsWith('/screenshot')
    ))
    const retriedScreenshotResponse = page.waitForResponse((response) => (
        response.request().method() === 'POST'
        && new URL(response.url()).pathname.endsWith('/screenshot')
    ))
    const retriedScreenshotPreview = page.waitForResponse((response) => (
        response.request().method() === 'GET'
        && /\/api\/talos\/browser\/artifacts\/[^/]+\/preview$/.test(new URL(response.url()).pathname)
    ))
    await page.getByRole('button', { name: 'Capture browser screenshot' }).click()
    const retriedScreenshot = await (await retriedScreenshotResponse).json()
    expect(new URL((await retriedScreenshotRequest).url()).pathname).toBe(`/api/talos/browser/sessions/${retriedSession.data.id}/screenshot`)
    expect(retriedScreenshot.data.id).not.toBe(firstScreenshot.data.id)
    expect(new URL((await retriedScreenshotPreview).url()).pathname).toBe(`/api/talos/browser/artifacts/${retriedScreenshot.data.id}/preview`)
    await expect(page.getByRole('img', { name: browserScreenshotName })).toBeVisible()

    const scopedEvidence = await page.evaluate(async ({ stoppedBrowserSessionId, retriedBrowserSessionId, talosSessionId }) => {
        const headers = { 'X-Talos-Session-Id': talosSessionId }
        const [sessions, stoppedEvents, retriedEvents] = await Promise.all([
            fetch(`/api/talos/browser/sessions?${new URLSearchParams({ talos_session_id: talosSessionId })}`, { headers }).then((response) => response.json()),
            fetch(`/api/talos/browser/sessions/${stoppedBrowserSessionId}/events`, { headers }).then((response) => response.json()),
            fetch(`/api/talos/browser/sessions/${retriedBrowserSessionId}/events`, { headers }).then((response) => response.json()),
        ])
        return { sessions, stoppedEvents, retriedEvents }
    }, {
        stoppedBrowserSessionId,
        retriedBrowserSessionId: retriedSession.data.id,
        talosSessionId,
    })
    expect(scopedEvidence.sessions.data).toEqual(expect.arrayContaining([
        expect.objectContaining({
            id: stoppedBrowserSessionId,
            last_screenshot_artifact_id: firstScreenshot.data.id,
        }),
        expect.objectContaining({
            id: retriedSession.data.id,
            last_screenshot_artifact_id: retriedScreenshot.data.id,
        }),
    ]))
    const stoppedEventIds = scopedEvidence.stoppedEvents.data.map((event: { id: string }) => event.id)
    const retriedEventIds = scopedEvidence.retriedEvents.data.map((event: { id: string }) => event.id)
    expect(retriedEventIds.filter((eventId: string) => stoppedEventIds.includes(eventId))).toEqual([])
    expect(scopedEvidence.retriedEvents.data).toEqual(expect.arrayContaining([
        expect.objectContaining({ payload: expect.objectContaining({ artifact_id: retriedScreenshot.data.id }) }),
    ]))
})

test('composer blocks chat submission while Browse is still starting', async ({ page }) => {
    let releaseBrowserCreate: (() => void) | null = null
    const browserCreateGate = new Promise<void>((resolve) => {
        releaseBrowserCreate = resolve
    })
    await page.route('**/api/talos/browser/sessions', async (route) => {
        if (route.request().method() === 'POST') {
            await browserCreateGate
        }
        await route.fallback()
    })

    await page.getByRole('button', { name: 'Browse', exact: true }).click()
    await expect(page.getByTestId('talos-browse-mode')).toContainText('Starting')
    await page.getByLabel('Message TALOS').fill('Inspect the current page')
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled()

    releaseBrowserCreate?.()
    await expect(page.getByTestId('talos-browse-mode')).toContainText(/Ready|Active/)
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeEnabled()
})

test('Browse state is isolated per TALOS chat session', async ({ page, isMobile }) => {
    await resetMocks(page, {
        initialSessions: [{ id: 'chat-a-e2e', title: 'Chat A' }],
    })

    const browserCreates: Record<string, unknown>[] = []
    page.on('request', (request) => {
        if (request.url().endsWith('/api/talos/browser/sessions') && request.method() === 'POST') {
            browserCreates.push(request.postDataJSON() as Record<string, unknown>)
        }
    })

    await page.getByRole('button', { name: 'Browse', exact: true }).click()
    await expect.poll(() => browserCreates.length).toBe(1)
    expect(browserCreates[0].talos_session_id).toBe('chat-a-e2e')

    await page.getByRole('button', { name: 'Capture browser screenshot' }).click()
    await expect(page.getByRole('img', { name: browserScreenshotName })).toBeVisible()
    await expect(page.getByTestId('talos-browser-activity')).toContainText(/Screenshot|screenshot/)

    await page.getByRole('button', { name: 'New Chat', exact: true }).first().click()
    const history = page.getByTestId('talos-session-history')
    if (!isMobile) await expect(history.getByRole('button', { name: 'Open chat New chat', exact: true })).toBeVisible()
    await expect(page.getByTestId('talos-browser-activity')).toHaveCount(0)
    await expect(page.getByRole('img', { name: browserScreenshotName })).toHaveCount(0)

    await page.getByRole('button', { name: 'Browse', exact: true }).click()
    await expect.poll(() => browserCreates.length).toBe(2)
    expect(browserCreates[1].talos_session_id).toBe('session-e2e')
    await expect(page.getByTestId('talos-browser-activity')).toContainText('Browser session succeeded')
    await expect(page.getByRole('img', { name: browserScreenshotName })).toHaveCount(0)

    await page.getByLabel('Message TALOS').fill('Read the current page')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(page.getByTestId('talos-browser-activity')).toContainText('Page read succeeded')
    await expect(page.getByRole('img', { name: browserScreenshotName })).toHaveCount(0)

    if (isMobile) {
        await expectNoDocumentOverflow(page)
        return
    }

    await history.getByRole('button', { name: 'Open chat Chat A', exact: true }).click()
    await expect(page.getByTestId('talos-browse-mode')).toContainText(/Ready|Active/)
    await expect(page.getByRole('img', { name: browserScreenshotName })).toBeVisible()
    await expect(page.getByTestId('talos-browser-activity')).toContainText(/Screenshot|screenshot/)
    expect(browserCreates).toHaveLength(2)
    await expectNoDocumentOverflow(page)
})

test('BREG-007 Browse chat can capture screenshot evidence and restores it after reload', async ({ page }) => {
    await resetMocks(page, { proceduralServerPersistedAssistant: true })
    let browserSessionCreates = 0
    page.on('request', (request) => {
        if (new URL(request.url()).pathname === '/api/talos/browser/sessions' && request.method() === 'POST') {
            browserSessionCreates += 1
        }
    })
    await page.getByRole('button', { name: 'Browse', exact: true }).click()
    await page.getByLabel('Message TALOS').fill('Riesci a farmi uno screenshot?')
    await page.getByRole('button', { name: 'Send', exact: true }).click()

    const assistantBubble = page.locator('.talos-chat-message[data-message-role="assistant"]').last()
    const screenshotEvidence = assistantBubble.getByTestId('talos-browser-screenshot-evidence')
    const screenshot = assistantBubble.getByRole('img', { name: browserScreenshotName })
    await expect(assistantBubble).toContainText('E2E response from AVM')
    await expect(screenshotEvidence).toBeVisible()
    await expect(screenshot).toBeVisible()
    await expect.poll(() => screenshot.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByLabel('Message TALOS')).toBeVisible({ timeout: 45_000 })
    await expect(page.getByTestId('talos-browse-mode')).toContainText(/Ready|Active/)
    expect(browserSessionCreates).toBe(1)
    const restoredAssistantBubble = page.locator('.talos-chat-message[data-message-role="assistant"]').last()
    await expect(restoredAssistantBubble.getByRole('img', { name: browserScreenshotName })).toBeVisible()

    await page.getByLabel('Message TALOS').fill('prova ora')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    const retriedAssistantBubble = page.locator('.talos-chat-message[data-message-role="assistant"]').last()
    await expect(retriedAssistantBubble.getByRole('img', { name: browserScreenshotName })).toBeVisible()
    await expect(page.getByText('TALOS_BROWSER_COMMAND_MALFORMED', { exact: false })).toHaveCount(0)
    expect(browserSessionCreates).toBe(1)
})

test('procedural screenshot answer renders immediately from authenticated evidence and survives reload', async ({ page }) => {
    await resetMocks(page, {
        proceduralServerPersistedAssistant: true,
        chatResponseText: `Ecco l'ultimo screenshot della pagina:\n\n![Screenshot ManagerCar](https://talo.sh/artifact/fabricated)`,
    })
    const messagePosts: Array<Record<string, unknown>> = []
    page.on('request', (request) => {
        if (request.method() !== 'POST') return
        if (!/^\/api\/talos\/sessions\/[^/]+\/messages$/.test(new URL(request.url()).pathname)) return
        messagePosts.push(request.postDataJSON() as Record<string, unknown>)
    })

    await page.getByRole('button', { name: 'Browse', exact: true }).click()
    await page.getByLabel('Message TALOS').fill('cattura screenshot')
    await page.getByRole('button', { name: 'Send', exact: true }).click()

    const assistantBubble = page.locator('.talos-chat-message[data-message-role="assistant"]').last()
    const verifiedScreenshot = assistantBubble.getByRole('img', { name: browserScreenshotName })
    await expect(assistantBubble).toContainText("Ecco l'ultimo screenshot della pagina")
    await expect(assistantBubble).toContainText('External image omitted: Screenshot ManagerCar')
    await expect(verifiedScreenshot).toBeVisible()
    await expect.poll(() => verifiedScreenshot.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0)
    await expect(page.getByText('Processing', { exact: true })).toHaveCount(0)
    await expect.poll(() => messagePosts.length).toBe(1)
    expect(messagePosts[0]).toMatchObject({ role: 'user' })
    const previewUrl = await verifiedScreenshot.getAttribute('src')
    expect(previewUrl).toContain('/api/talos/browser/artifacts/')
    expect(previewUrl).not.toContain('talo.sh')

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByLabel('Message TALOS')).toBeVisible({ timeout: 45_000 })
    const restoredBubble = page.locator('.talos-chat-message[data-message-role="assistant"]').last()
    await expect(restoredBubble.getByRole('img', { name: browserScreenshotName })).toBeVisible()
    await expect(restoredBubble).toContainText('External image omitted: Screenshot ManagerCar')
})

test('procedural browser approval survives reload and resumes into a persisted answer', async ({ page }) => {
    await resetMocks(page, { proceduralBrowserApproval: true })
    await page.getByRole('button', { name: 'Browse', exact: true }).click()
    await page.getByLabel('Message TALOS').fill('Accept the cookie banner.')
    await page.getByRole('button', { name: 'Send', exact: true }).click()

    const approvalCard = page.getByTestId('tool-approval-card')
    await expect(approvalCard).toContainText('Browser action requires approval')
    await expect(approvalCard).toContainText('Accept all')
    await expect(page.getByText('Processing', { exact: true })).toHaveCount(0)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByLabel('Message TALOS')).toBeVisible({ timeout: 45_000 })
    await expect(page.getByTestId('tool-approval-card')).toContainText('Accept all')

    await page.getByTestId('tool-approval-open-confirm').click()
    await expect(page.getByText('Approve this exact browser action?')).toBeVisible()
    await page.getByTestId('tool-approval-confirm').click()

    const assistantBubble = page.locator('.talos-chat-message[data-message-role="assistant"]').last()
    await expect(assistantBubble).toContainText('The cookie banner was dismissed through verified browser evidence.')
    await expect(page.getByTestId('tool-approval-card')).toHaveCount(0)
})

test('BREG-008 a screenshot capability question does not fabricate screenshot evidence', async ({ page }) => {
    await page.getByRole('button', { name: 'Browse', exact: true }).click()
    await page.getByLabel('Message TALOS').fill('quindi hai permessi screenshot?')
    await page.getByRole('button', { name: 'Send', exact: true }).click()

    await expect(page.getByTestId('talos-browser-activity')).toContainText('Page read succeeded')
    await expect(page.getByRole('img', { name: browserScreenshotName })).toHaveCount(0)
})

test('Browse actions close on Escape and click outside', async ({ page }) => {
    await page.getByRole('button', { name: 'Browse', exact: true }).click()
    await page.getByRole('button', { name: 'Browse actions' }).click()
    await expect(page.getByRole('menuitem', { name: 'Restart browser' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menuitem', { name: 'Restart browser' })).toBeHidden()

    await page.getByRole('button', { name: 'Browse actions' }).click()
    await page.getByTestId('talos-workspace-header').click({ position: { x: 4, y: 4 } })
    await expect(page.getByRole('menuitem', { name: 'Restart browser' })).toBeHidden()
})

test('Browse keeps every composer capability while the retired density toggle stays absent', async ({ page }) => {
    await page.getByRole('button', { name: 'Browse', exact: true }).click()

    const composer = page.locator('[data-composer-mode="full"]')
    await expect(composer).toBeVisible()
    await expect(composer.getByTestId('talos-browse-mode')).toHaveAttribute('aria-label', 'Browse status: Active')
    for (const accessibleName of [
        'Choose model profile',
        'Choose grounding context',
        'Temporary chat',
        'Capture browser screenshot',
        'Browse actions',
        'Improve prompt',
        'Open settings',
        'Send',
    ]) {
        await expect(composer.getByRole('button', { name: accessibleName, exact: true })).toBeVisible()
    }
    await expect(composer.getByLabel('Message TALOS')).toBeVisible()
    await expect(composer.getByRole('button', { name: 'Use minimal composer' })).toHaveCount(0)
    await expect(composer.getByRole('button', { name: 'Use full composer' })).toHaveCount(0)
})

test('Browse deep links hydrate as the normal chat and normalize the URL', async ({ page }) => {
    await page.goto('/browse?open=https%3A%2F%2Ffixture.example.test%2Fevidence', { waitUntil: 'domcontentloaded' })
    await expect(page.getByLabel('TALOS chat thread')).toBeVisible({ timeout: 45_000 })
    await expect(page).toHaveURL(/\/$/)
    await expect(page.locator('[data-testid="talos-browse-page-controls"]')).toHaveCount(0)
    await expect(page.getByTestId('talos-browse-mode')).toHaveAttribute('data-enabled', 'true')
    await expect(page.getByText('normalizeTalosTheme is not defined', { exact: false })).toHaveCount(0)
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
    await expect(page.getByTestId('talos-browser-activity').getByText('Page read succeeded')).toHaveCount(1)
    expect(await page).toHaveURL(/\/$/)
})

test('human Browser conversation handles a typo, bare URL, follow-up and reload without a validator fault', async ({ page }) => {
    const chatBodies: Record<string, unknown>[] = []
    page.on('request', (request) => {
        if (new URL(request.url()).pathname === '/api/talos/chat' && request.method() === 'POST') {
            chatBodies.push(request.postDataJSON() as Record<string, unknown>)
        }
    })

    await page.getByRole('button', { name: 'Browse', exact: true }).click()
    await page.getByLabel('Message TALOS').fill('ciao, puoi navaigare su https://fixture.example.test/evidence e dimmi cosa vedi?')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(page.locator('.talos-chat-message[data-message-role="assistant"]').last()).toContainText('E2E response from AVM')

    await page.getByLabel('Message TALOS').fill('fixture.example.test/evidence')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect.poll(() => chatBodies.length).toBe(2)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByLabel('Message TALOS')).toBeVisible({ timeout: 45_000 })
    await expect(page.getByTestId('talos-browse-mode')).toHaveAttribute('data-enabled', 'true')
    await page.getByLabel('Message TALOS').fill('riprova e cattura uno screenshot')
    await page.getByRole('button', { name: 'Send', exact: true }).click()

    await expect.poll(() => chatBodies.length).toBe(3)
    for (const body of chatBodies) {
        expect(body.browser_mode).toEqual({ enabled: true, browser_session_id: 'browser-session-e2e' })
    }
    await expect(page.getByText('TALOS_BROWSER_COMMAND_MALFORMED', { exact: false })).toHaveCount(0)
    await expect(page.getByText('validator rejected', { exact: false })).toHaveCount(0)
    await expect(page.locator('[data-window-id="settings"]')).toHaveCount(0)
})

test('BREG-001 a normal chat can enable Browse only for a contextual retry turn', async ({ page }) => {
    const chatBodies: Record<string, unknown>[] = []
    page.on('request', (request) => {
        if (new URL(request.url()).pathname === '/api/talos/chat' && request.method() === 'POST') {
            chatBodies.push(request.postDataJSON() as Record<string, unknown>)
        }
    })

    await page.getByLabel('Message TALOS').fill('Open https://fixture.example.test/evidence and tell me what you see')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect.poll(() => chatBodies.length).toBe(1)
    expect(chatBodies[0].browser_mode).toBeUndefined()
    expect(chatBodies[0].user_message_id).toEqual(expect.any(String))

    await page.getByRole('button', { name: 'Browse', exact: true }).click()
    await expect(page.getByTestId('talos-browse-mode')).toHaveAttribute('data-enabled', 'true')

    await page.getByLabel('Message TALOS').fill('riprova')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect.poll(() => chatBodies.length).toBe(2)

    expect(chatBodies[1].session_id).toBe(chatBodies[0].session_id)
    expect(chatBodies[1].user_message_id).toEqual(expect.any(String))
    expect(chatBodies[1].user_message_id).not.toBe(chatBodies[0].user_message_id)
    expect(chatBodies[1].browser_mode).toEqual({ enabled: true, browser_session_id: 'browser-session-e2e' })
})
