import { expect, test, type Page } from '@playwright/test'

const loginEmail = process.env.TALOS_REAL_PROVIDER_EMAIL!
const loginPassword = process.env.TALOS_REAL_PROVIDER_PASSWORD!
const modelProfileId = process.env.TALOS_REAL_PROVIDER_PROFILE_ID!
const contextMarker = 'P3-CONTEXT-7A91'
const sessionPrefix = 'P3 real-provider gate'

type ApiEnvelope<T> = {
    data: T
}

type ApiSession = {
    id: string
    title: string
}

type ApiMessage = {
    id: string
    role: 'user' | 'assistant' | 'system'
    content: string
    run_id: string | null
    request_key: string | null
}

type ApiRun = {
    id: string
    session_id: string
    status: string
}

type ApiProfile = {
    id: string
    display_name: string
    provider: string
    status: string
    show_in_composer: boolean
}

async function dismissIntroductionIfVisible(page: Page) {
    const introduction = page.getByRole('dialog', { name: 'Meet TALOS' })
    try {
        await introduction.waitFor({ state: 'visible', timeout: 5_000 })
    } catch {
        return
    }

    await introduction.getByRole('button', { name: 'Skip introduction' }).click()
    await expect(introduction).toHaveCount(0)
}

async function authenticatedApi<T>(
    page: Page,
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: Record<string, unknown>,
): Promise<T> {
    const result = await page.evaluate(async ({ method, path, body }) => {
        const token = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? ''
        const response = await fetch(path, {
            method,
            credentials: 'same-origin',
            headers: {
                Accept: 'application/json',
                ...(body ? { 'Content-Type': 'application/json' } : {}),
                ...(token ? { 'X-CSRF-TOKEN': token } : {}),
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
        })

        return {
            ok: response.ok,
            status: response.status,
            text: await response.text(),
        }
    }, { method, path, body })

    if (!result.ok) {
        throw new Error(`TALOS API ${method} ${path} failed with HTTP ${result.status}: ${result.text}`)
    }

    return (result.text ? JSON.parse(result.text) : null) as T
}

async function openAuthenticatedWorkspace(page: Page) {
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    const form = page.locator('#talos-login-form')
    await expect(form).toBeVisible()
    await form.getByLabel('Email').fill(loginEmail)
    await form.getByLabel('Password').fill(loginPassword)
    await Promise.all([
        page.waitForURL(/\/$/, { waitUntil: 'domcontentloaded' }),
        form.getByRole('button', { name: 'Sign in' }).click(),
    ])

    await expect(page.locator('#talos-workspace-root[data-authenticated="true"]')).toHaveCount(1)
    await expect(page.getByLabel('Message TALOS')).toBeVisible({ timeout: 45_000 })
    await dismissIntroductionIfVisible(page)
}

async function createIsolatedSession(page: Page, title: string): Promise<ApiSession> {
    const sessions = await authenticatedApi<ApiEnvelope<ApiSession[]>>(
        page,
        'GET',
        '/api/talos/sessions?surface=chat',
    )
    for (const session of sessions.data.filter((candidate) => candidate.title.startsWith(sessionPrefix))) {
        await authenticatedApi<null>(
            page,
            'DELETE',
            `/api/talos/sessions/${encodeURIComponent(session.id)}`,
        )
    }

    const created = await authenticatedApi<ApiEnvelope<ApiSession>>(
        page,
        'POST',
        '/api/talos/sessions',
        {
            title,
            mode: 'verified_execution',
            persistence_mode: 'persistent',
            surface: 'chat',
            active_model_profile_id: modelProfileId,
            metadata: {
                surface: 'chat',
                real_provider_gate: true,
            },
        },
    )

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByLabel('Message TALOS')).toBeVisible({ timeout: 45_000 })
    await dismissIntroductionIfVisible(page)
    return created.data
}

async function assertSelectedHealthyProfile(page: Page) {
    const profiles = await authenticatedApi<ApiEnvelope<ApiProfile[]>>(
        page,
        'GET',
        '/api/talos/model-profiles',
    )
    const selected = profiles.data.find((profile) => profile.id === modelProfileId)
    expect(selected).toMatchObject({
        id: modelProfileId,
        provider: 'deepseek',
        status: 'healthy',
        show_in_composer: true,
    })
    await expect(page.getByTestId('talos-composer-model-label')).toContainText(selected!.display_name)
}

async function beginGrowthProbe(page: Page) {
    await page.evaluate(() => {
        const target = window as typeof window & {
            __talosRealProviderGrowth?: {
                observer: MutationObserver
                samples: string[]
            }
        }
        target.__talosRealProviderGrowth?.observer.disconnect()
        const samples: string[] = []
        const capture = () => {
            const text = document.querySelector<HTMLElement>(
                '[data-testid="talos-streaming-reply"]',
            )?.innerText.trim() ?? ''
            if (text && samples.at(-1) !== text) samples.push(text)
        }
        const observer = new MutationObserver(capture)
        observer.observe(document.body, {
            childList: true,
            characterData: true,
            subtree: true,
        })
        target.__talosRealProviderGrowth = { observer, samples }
        capture()
    })
}

async function finishGrowthProbe(page: Page): Promise<string[]> {
    return page.evaluate(() => {
        const target = window as typeof window & {
            __talosRealProviderGrowth?: {
                observer: MutationObserver
                samples: string[]
            }
        }
        target.__talosRealProviderGrowth?.observer.disconnect()
        return target.__talosRealProviderGrowth?.samples ?? []
    })
}

async function sessionMessages(page: Page, sessionId: string): Promise<ApiMessage[]> {
    return (
        await authenticatedApi<ApiEnvelope<ApiMessage[]>>(
            page,
            'GET',
            `/api/talos/sessions/${encodeURIComponent(sessionId)}/messages`,
        )
    ).data
}

test.describe.serial('TALOS real-provider streaming promotion gate', () => {
    test('real provider visibly streams, retains context and reloads one durable answer per turn', async ({ page }) => {
        await openAuthenticatedWorkspace(page)
        const session = await createIsolatedSession(page, `${sessionPrefix} continuity`)
        await assertSelectedHealthyProfile(page)

        const composer = page.getByLabel('Message TALOS')
        const assistantMessages = page.locator('article[data-message-role="assistant"]')
        const firstPrompt = [
            `Remember the exact codeword ${contextMarker} for this chat.`,
            `Include ${contextMarker} once in this reply, then write thirty short numbered`,
            'observations about deterministic software testing. Do not use tools.',
        ].join(' ')

        await beginGrowthProbe(page)
        await composer.fill(firstPrompt)
        await composer.press('Enter')

        const activeReply = page.getByTestId('talos-streaming-reply')
        await expect(activeReply).toBeVisible({ timeout: 45_000 })
        await expect.poll(
            async () => (await activeReply.innerText()).length,
            { timeout: 45_000 },
        ).toBeGreaterThan(30)
        await expect(assistantMessages).toHaveCount(1, { timeout: 120_000 })
        await expect(assistantMessages.last()).toContainText(contextMarker)
        await expect(activeReply).toHaveCount(0)

        const growthSamples = await finishGrowthProbe(page)
        const distinctLengths = [...new Set(growthSamples.map((sample) => sample.length))]
        expect(distinctLengths.length).toBeGreaterThanOrEqual(3)
        expect(Math.max(...distinctLengths) - Math.min(...distinctLengths)).toBeGreaterThan(20)

        await composer.fill(
            'Without asking me to repeat it, state the exact codeword from my previous message in one sentence.',
        )
        await composer.press('Enter')
        await expect(assistantMessages).toHaveCount(2, { timeout: 120_000 })
        await expect(assistantMessages.last()).toContainText(contextMarker)
        await expect(page.locator('article[data-message-role="user"]')).toHaveCount(2)

        const beforeReload = await sessionMessages(page, session.id)
        expect(beforeReload.map((message) => message.role)).toEqual([
            'user',
            'assistant',
            'user',
            'assistant',
        ])
        const assistantRuns = beforeReload
            .filter((message) => message.role === 'assistant')
            .map((message) => message.run_id)
        const requestKeys = beforeReload
            .filter((message) => message.role === 'assistant')
            .map((message) => message.request_key)
        expect(assistantRuns.every(Boolean)).toBe(true)
        expect(new Set(assistantRuns).size).toBe(2)
        expect(requestKeys.every(Boolean)).toBe(true)
        expect(new Set(requestKeys).size).toBe(2)

        await page.reload({ waitUntil: 'domcontentloaded' })
        await expect(page.getByLabel('Message TALOS')).toBeVisible({ timeout: 45_000 })
        await dismissIntroductionIfVisible(page)
        await expect(page.locator('article[data-message-role="user"]')).toHaveCount(2)
        await expect(page.locator('article[data-message-role="assistant"]')).toHaveCount(2)
        await expect(page.locator('article[data-message-role="assistant"]').last()).toContainText(contextMarker)
        expect(await sessionMessages(page, session.id)).toEqual(beforeReload)
    })

    test('real provider Stop cancels the owned run without persisting a partial answer', async ({ page }) => {
        await openAuthenticatedWorkspace(page)
        const session = await createIsolatedSession(page, `${sessionPrefix} cancellation`)
        await assertSelectedHealthyProfile(page)

        let successfulCancelResponses = 0
        page.on('response', (response) => {
            const request = response.request()
            if (request.method() === 'POST'
                && /\/api\/talos\/runs\/[^/]+\/cancel$/u.test(new URL(response.url()).pathname)
                && response.ok()) {
                successfulCancelResponses += 1
            }
        })

        const composer = page.getByLabel('Message TALOS')
        await composer.fill(
            'Write a 300-item numbered list about software reliability. '
            + 'Use a complete sentence for every item, begin immediately, and do not summarize.',
        )
        await composer.press('Enter')

        const activeReply = page.getByTestId('talos-streaming-reply')
        await expect(activeReply).toBeVisible({ timeout: 45_000 })
        await expect.poll(
            async () => (await activeReply.innerText()).length,
            { timeout: 45_000 },
        ).toBeGreaterThan(30)
        const stop = page.getByRole('button', { name: 'Stop response' })
        await expect(stop).toBeEnabled()
        await stop.click()

        await expect.poll(() => successfulCancelResponses, { timeout: 45_000 }).toBe(1)
        await expect(activeReply).toHaveAttribute('data-stream-status', 'cancelled')
        await expect(activeReply).toContainText('Stopped')
        await expect(page.getByText('Send details', { exact: true })).toHaveCount(0)
        await expect(page.locator('article[data-message-role="assistant"]')).toHaveCount(0)

        const runs = (
            await authenticatedApi<ApiEnvelope<ApiRun[]>>(page, 'GET', '/api/talos/runs')
        ).data.filter((run) => run.session_id === session.id)
        expect(runs).toHaveLength(1)
        expect(runs[0]).toMatchObject({ status: 'cancelled' })

        await page.reload({ waitUntil: 'domcontentloaded' })
        await expect(page.getByLabel('Message TALOS')).toBeVisible({ timeout: 45_000 })
        await dismissIntroductionIfVisible(page)
        await expect(page.getByTestId('talos-streaming-reply')).toHaveCount(0)
        await expect(page.locator('article[data-message-role="user"]')).toHaveCount(1)
        await expect(page.locator('article[data-message-role="assistant"]')).toHaveCount(0)
        expect((await sessionMessages(page, session.id)).map((message) => message.role)).toEqual(['user'])
    })
})
