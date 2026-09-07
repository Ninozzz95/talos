import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { installTalosApiMocks } from './helpers/talosApiMocks'

type HistoricalRegression = {
    id: string
    title: string
    expected_contract: string
    current_state: 'covered' | 'partial' | 'known_gap' | 'characterization_required'
    tests: string[]
    promotion_phase: string
}

type HistoricalRegressionCorpus = {
    schema_version: string
    scenarios: HistoricalRegression[]
}

type TalosBrowserTaskFixture = {
    id: string
    talos_session_id: string
    origin_message_id: string | null
    browser_session_id: string | null
    runtime_id: string | null
    active_tab_id: string | null
    goal: string
    status: 'running' | 'recovering' | 'failed'
    autonomy_profile: string
    budget: Record<string, unknown>
    state_version: number
    requested_at: string | null
    started_at: string | null
    completed_at: string | null
    failed_at: string | null
    cancelled_at: string | null
    reconciled_at: string | null
    created_at: string | null
    updated_at: string | null
}

const corpusPath = fileURLToPath(new URL('../fixtures/browser/historical-regressions.json', import.meta.url))
const corpus = JSON.parse(readFileSync(corpusPath, 'utf8')) as HistoricalRegressionCorpus
const e2eLoginEmail = process.env.TALOS_E2E_EMAIL ?? 'test@example.com'
const e2eLoginPassword = process.env.TALOS_E2E_PASSWORD ?? 'password'

async function settleRequiredFirstRunIntro(page: Page) {
    const introRequired = await page.evaluate(async () => {
        const response = await fetch('/api/talos/settings')
        if (!response.ok) return false

        const payload = await response.json() as {
            data?: { preferences?: { onboarding?: { intro_version?: unknown } } }
        }
        const version = payload.data?.preferences?.onboarding?.intro_version
        return typeof version !== 'number' || version < 1
    })
    if (!introRequired) return

    const intro = page.getByTestId('talos-intro-modal')
    await expect(intro).toBeVisible()
    await intro.getByRole('button', { name: 'Skip introduction' }).click()
    await expect(intro).toHaveCount(0)
}

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
    await settleRequiredFirstRunIntro(page)
}

test('Browser historical regression corpus has stable complete identifiers and explicit ownership', () => {
    expect(corpus.schema_version).toBe('talos_browser_regression_corpus_v1')
    expect(corpus.scenarios.map(({ id }) => id)).toEqual(
        Array.from({ length: 27 }, (_, index) => `BREG-${String(index + 1).padStart(3, '0')}`),
    )
    expect(new Set(corpus.scenarios.map(({ id }) => id)).size).toBe(27)

    for (const scenario of corpus.scenarios) {
        expect(scenario.title.trim(), scenario.id).not.toBe('')
        expect(scenario.expected_contract.trim(), scenario.id).not.toBe('')
        expect(scenario.tests.length, scenario.id).toBeGreaterThan(0)
        expect(scenario.tests.every((selector) => selector.includes('::')), scenario.id).toBe(true)
        expect(scenario.promotion_phase, scenario.id).toMatch(/^B[2-6]$/)
    }
})

test('BREG-003 durable task state survives reload and user cancellation', async ({ page }) => {
    const talosSessionId = 'browser-recovery-chat'
    let task = {
        id: 'browser-task-recovery-e2e',
        talos_session_id: talosSessionId,
        origin_message_id: 'message-e2e-1',
        browser_session_id: null,
        goal: 'Recover a Browser task from durable state.',
        status: 'recovering',
        autonomy_profile: 'assist',
        budget: { actions: 12 },
        state_version: 3,
        requested_at: '2026-07-16T08:00:00Z',
        started_at: '2026-07-16T08:00:01Z',
        completed_at: null,
        failed_at: null,
        cancelled_at: null as string | null,
        reconciled_at: '2026-07-16T08:00:02Z',
        created_at: '2026-07-16T08:00:00Z',
        updated_at: '2026-07-16T08:00:02Z',
    }
    const cancellationBodies: Array<Record<string, unknown>> = []

    await installTalosApiMocks(page, {
        initialSessions: [{
            id: talosSessionId,
            title: 'Browser recovery task',
            metadata: { surface: 'chat', chat_state: { browse_enabled: false } },
            messages: [{
                role: 'user',
                content: 'Recover this Browser task.',
                run_id: 'run-recovery-e2e',
            }],
        }],
    })
    await page.route('**/api/talos/browser/tasks**', async (route) => {
        const request = route.request()
        const url = new URL(request.url())
        const headers = request.headers()
        const json = (body: unknown, status = 200) => route.fulfill({
            status,
            contentType: 'application/json',
            body: JSON.stringify(body),
        })

        if (request.method() === 'GET' && url.pathname === '/api/talos/browser/tasks') {
            if (headers['x-talos-session-id'] !== talosSessionId || url.searchParams.get('talos_session_id') !== talosSessionId) {
                return json({ code: 'NOT_FOUND', message: 'Browser task was not found.' }, 404)
            }
            return json({ data: [task] })
        }

        if (request.method() === 'POST' && url.pathname === `/api/talos/browser/tasks/${task.id}/cancel`) {
            const body = request.postDataJSON() as Record<string, unknown>
            cancellationBodies.push(body)
            if (body.expected_state_version !== task.state_version || typeof body.command_id !== 'string') {
                return json({ message: 'Browser task cancellation payload is stale.' }, 409)
            }
            task = {
                ...task,
                status: 'cancelled',
                state_version: task.state_version + 1,
                cancelled_at: '2026-07-16T08:00:03Z',
                updated_at: '2026-07-16T08:00:03Z',
            }
            return json({ data: { task } })
        }

        return json({ message: `Unhandled Browser task request: ${request.method()} ${url.pathname}` }, 405)
    })
    await openAuthenticatedWorkspace(page)

    const browsePreferenceSaved = page.waitForResponse((response) => (
        response.request().method() === 'PATCH'
        && /\/api\/talos\/sessions\/[^/]+$/.test(new URL(response.url()).pathname)
    ))
    await page.getByRole('button', { name: 'Browse', exact: true }).click()
    await browsePreferenceSaved
    await expect(page.getByTestId('talos-browser-task-status')).toContainText('Recovering browser task')
    await expect(page.getByTestId('talos-browser-task-cancel')).toBeEnabled()

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByLabel('Message TALOS')).toBeVisible({ timeout: 45_000 })
    await expect(page.getByTestId('talos-browser-task-status')).toContainText('Recovering browser task')

    await page.getByTestId('talos-browser-task-cancel').click()
    await expect(page.getByTestId('talos-browser-task-status')).toContainText('Browser task cancelled')
    await expect(page.getByTestId('talos-browser-task-cancel')).toHaveCount(0)
    expect(cancellationBodies).toHaveLength(1)
    expect(cancellationBodies[0]).toMatchObject({
        expected_state_version: 3,
        reason: 'The user stopped this Browser task.',
    })
    expect(cancellationBodies[0]?.command_id).toMatch(/^[0-9a-f-]{36}$/)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByLabel('Message TALOS')).toBeVisible({ timeout: 45_000 })
    await expect(page.getByTestId('talos-browser-task-status')).toContainText('Browser task cancelled')
    await expect(page.getByTestId('talos-browser-task-cancel')).toHaveCount(0)
})

test('STAGE2A-011 recovery survives reload and selects an existing fresh session without duplication', async ({ page }) => {
    const talosSessionId = 'browser-stage2a-recovery'
    const browserSessionId = `browser-session-${talosSessionId}`
    let task: TalosBrowserTaskFixture = {
        id: 'browser-task-stage2a-recovery',
        talos_session_id: talosSessionId,
        origin_message_id: 'message-stage2a-recovery',
        browser_session_id: browserSessionId,
        runtime_id: 'runtime-stage2a-recovery',
        active_tab_id: 'tab-stage2a-recovery',
        goal: 'Recover Browser evidence without redispatch.',
        status: 'running',
        autonomy_profile: 'assist',
        budget: { actions: 12 },
        state_version: 3,
        requested_at: '2026-07-22T08:00:00Z',
        started_at: '2026-07-22T08:00:01Z',
        completed_at: null,
        failed_at: null,
        cancelled_at: null,
        reconciled_at: null,
        created_at: '2026-07-22T08:00:00Z',
        updated_at: '2026-07-22T08:00:01Z',
    }
    const recoveryBodies: Array<Record<string, unknown>> = []
    const browserSessionCreates: string[] = []
    page.on('request', (request) => {
        if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/talos/browser/sessions') {
            browserSessionCreates.push(request.postData() ?? '')
        }
    })

    await installTalosApiMocks(page, {
        initialSessions: [{
            id: talosSessionId,
            title: 'Browser Stage-2a recovery',
            metadata: { surface: 'chat', chat_state: { browse_enabled: false } },
            messages: [{ role: 'user', content: 'Recover this Browser task.', run_id: 'run-stage2a-recovery' }],
        }],
        browser: { createStatuses: ['recovery_required', 'ready'] },
    })
    await page.route('**/api/talos/browser/tasks**', async (route) => {
        const request = route.request()
        const url = new URL(request.url())
        const json = (body: unknown, status = 200) => route.fulfill({
            status,
            contentType: 'application/json',
            body: JSON.stringify(body),
        })

        if (request.method() === 'GET' && url.pathname === '/api/talos/browser/tasks') {
            return json({ data: [task] })
        }
        if (request.method() === 'POST' && url.pathname === `/api/talos/browser/tasks/${task.id}/recover`) {
            const body = request.postDataJSON() as Record<string, unknown>
            recoveryBodies.push(body)
            task = {
                ...task,
                status: 'recovering',
                state_version: 4,
                reconciled_at: '2026-07-22T08:00:02Z',
                updated_at: '2026-07-22T08:00:02Z',
            }
            return json({ data: {
                decision: {
                    strategy: 'reconcile',
                    reason_code: 'browser_recovery_evidence_reconcile',
                    remediation: 'Capture missing evidence without redispatch.',
                    task_id: task.id,
                    resulting_task_id: null,
                },
                task,
                resulting_task: null,
            } })
        }

        return json({ message: `Unhandled Browser task request: ${request.method()} ${url.pathname}` }, 405)
    })
    await openAuthenticatedWorkspace(page)

    await page.getByRole('button', { name: 'Browse', exact: true }).click()
    await expect(page.getByTestId('talos-browse-mode')).toContainText('Recovery required')
    await expect.poll(() => browserSessionCreates.length).toBe(1)

    await page.getByRole('button', { name: 'Browse status: Recovery required' }).click()
    await page.getByRole('menuitem', { name: 'Recover browser task' }).click()
    await expect.poll(() => recoveryBodies.length).toBe(1)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByLabel('Message TALOS')).toBeVisible({ timeout: 45_000 })
    await expect(page.getByTestId('talos-browse-mode')).toContainText('Recovery required')
    await page.getByRole('button', { name: 'Browse status: Recovery required' }).click()
    await page.getByRole('menuitem', { name: 'Recover browser task' }).click()
    await expect.poll(() => recoveryBodies.length).toBe(2)

    expect(recoveryBodies[0]?.command_id).toMatch(/^talos_ui_recovery_[a-f0-9]{64}$/)
    expect(recoveryBodies[1]?.command_id).toBe(recoveryBodies[0]?.command_id)
    expect(browserSessionCreates).toHaveLength(1)

    await page.evaluate(async ({ chatId }) => {
        const response = await fetch('/api/talos/browser/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Talos-Session-Id': chatId },
            body: JSON.stringify({ talos_session_id: chatId }),
        })
        if (!response.ok) throw new Error(`Replacement Browser session failed: ${response.status}`)
    }, { chatId: talosSessionId })
    task = {
        ...task,
        status: 'failed',
        state_version: 5,
        failed_at: '2026-07-22T08:00:03Z',
        updated_at: '2026-07-22T08:00:03Z',
    }
    expect(browserSessionCreates).toHaveLength(2)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByLabel('Message TALOS')).toBeVisible({ timeout: 45_000 })
    await expect(page.getByTestId('talos-browse-mode')).toContainText('Recovery required')
    await page.getByRole('button', { name: 'Browse status: Recovery required' }).click()
    await page.getByRole('menuitem', { name: 'Start fresh browser session' }).click()

    await expect(page.getByTestId('talos-browse-mode')).toContainText(/Ready|Active/)
    expect(browserSessionCreates).toHaveLength(2)
})

test('BREG-004 reload restores a screenshot action while evidence is still committing', async ({ page }) => {
    await openAuthenticatedWorkspace(page)

    await page.getByRole('button', { name: 'Browse', exact: true }).click()
    await expect(page.getByTestId('talos-browse-mode')).toContainText(/Ready|Active/)

    const chatRequest = page.waitForRequest((request) => (
        request.method() === 'POST'
        && new URL(request.url()).pathname === '/api/talos/chat'
    ))
    await page.getByLabel('Message TALOS').fill('cattura screenshot')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await chatRequest

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByLabel('Message TALOS')).toBeVisible({ timeout: 45_000 })

    const assistantBubbles = page.locator('.talos-chat-message[data-message-role="assistant"]')
    const assistantBubble = assistantBubbles.last()
    const screenshot = assistantBubble.getByRole('img', { name: /^Browser screenshot \d+ of \d+$/ })
    await expect(assistantBubble).toContainText('Screenshot captured and attached as verified TALOS evidence.')
    await expect(screenshot).toBeVisible()
    await expect.poll(() => screenshot.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0)
    await expect(assistantBubbles).toHaveCount(1)

    const firstPreviewUrl = await screenshot.getAttribute('src')
    expect(firstPreviewUrl).toMatch(/^\/api\/talos\/browser\/artifacts\/[^/]+\/preview\?talos_session_id=/)
    const previewArtifactMatch = firstPreviewUrl?.match(/\/artifacts\/([^/]+)\/preview/)
    expect(previewArtifactMatch).not.toBeNull()
    const previewArtifactId = decodeURIComponent(previewArtifactMatch?.[1] ?? '')

    const journal = await page.evaluate(async () => {
        const sessions = await fetch('/api/talos/sessions').then((response) => response.json())
        const activeChat = sessions.data.find((session: { metadata?: { chat_state?: { browse_enabled?: boolean } } }) => (
            session.metadata?.chat_state?.browse_enabled === true
        ))
        if (!activeChat) throw new Error('The owning chat session is missing after reload.')
        const headers = { 'X-Talos-Session-Id': activeChat.id }
        const browserSessions = await fetch(`/api/talos/browser/sessions?${new URLSearchParams({ talos_session_id: activeChat.id })}`, { headers })
            .then((response) => response.json())
        const browserSession = browserSessions.data.find((session: { status: string }) => ['ready', 'active'].includes(session.status))
        if (!browserSession) throw new Error('The owning Browser session is missing after reload.')
        const events = await fetch(`/api/talos/browser/sessions/${encodeURIComponent(browserSession.id)}/events`, { headers })
            .then((response) => response.json())

        return { events: events.data }
    }) as { events: Array<{ type: string, payload?: { operation?: string, artifact_id?: string } }> }
    expect(journal.events.filter((event) => (
        event.type === 'command.succeeded'
        && event.payload?.operation === 'screenshot'
        && event.payload.artifact_id === previewArtifactId
    ))).toHaveLength(1)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByLabel('Message TALOS')).toBeVisible({ timeout: 45_000 })
    const restoredBubbles = page.locator('.talos-chat-message[data-message-role="assistant"]')
    const restoredScreenshot = restoredBubbles.last().getByRole('img', { name: /^Browser screenshot \d+ of \d+$/ })
    await expect(restoredBubbles).toHaveCount(1)
    await expect(restoredScreenshot).toBeVisible()
    expect(await restoredScreenshot.getAttribute('src')).toBe(firstPreviewUrl)
})

test('BREG-005 duplicate action reuses committed evidence without a second physical dispatch', async ({ page }) => {
    const chatRequests: Record<string, unknown>[] = []
    page.on('request', (request) => {
        if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/talos/chat') {
            chatRequests.push(request.postDataJSON() as Record<string, unknown>)
        }
    })
    await installTalosApiMocks(page, {
        chatResponseText: 'The completed Browser result was reused safely.',
        proceduralServerPersistedAssistant: true,
    })
    await openAuthenticatedWorkspace(page)

    await page.getByRole('button', { name: 'Browse', exact: true }).click()
    await expect(page.getByTestId('talos-browse-mode')).toHaveAttribute('data-enabled', 'true')
    await expect(page.getByTestId('talos-browse-mode')).toContainText(/Ready|Active/)

    await page.getByLabel('Message TALOS').fill('Repeat the completed Browser snapshot safely.')
    await page.getByRole('button', { name: 'Send', exact: true }).click()

    const assistantBubbles = page.locator('.talos-chat-message[data-message-role="assistant"]')
    await expect.poll(() => chatRequests.length).toBe(1)
    await expect(assistantBubbles).toHaveCount(1)
    await expect(assistantBubbles.last()).toContainText('The completed Browser result was reused safely.')
    await expect(page.getByText('TALOS_BROWSER_REPEATED_COMMAND', { exact: false })).toHaveCount(0)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByLabel('Message TALOS')).toBeVisible({ timeout: 45_000 })
    const restoredBubbles = page.locator('.talos-chat-message[data-message-role="assistant"]')
    await expect(restoredBubbles).toHaveCount(1)
    await expect(restoredBubbles.last()).toContainText('The completed Browser result was reused safely.')
    expect(chatRequests).toHaveLength(1)
    await expect(page.getByText('TALOS_BROWSER_REPEATED_COMMAND', { exact: false })).toHaveCount(0)
})

test('BREG-009 incompatible worker protocol keeps Browse disabled with an actionable setup fault', async ({ page }) => {
    await installTalosApiMocks(page, {
        browser: {
            createFault: {
                status: 502,
                code: 'TALOS_BROWSER_WORKER_PROTOCOL_MISMATCH',
                message: 'Browser worker protocol is incompatible with this TALOS control plane.',
            },
        },
    })
    await openAuthenticatedWorkspace(page)

    await page.getByRole('button', { name: 'Browse', exact: true }).click()

    const setupFault = page.getByTestId('talos-browse-setup-fault')
    await expect(setupFault).toBeVisible()
    await expect(setupFault).toContainText(/incompatible/i)
    await expect(setupFault).toContainText(/update the browser worker/i)
    await expect(page.getByTestId('talos-browse-mode')).toHaveCount(0)
    await expect(page.getByText('TALOS_BROWSER_WORKER_PROTOCOL_MISMATCH', { exact: false })).toHaveCount(0)
})
