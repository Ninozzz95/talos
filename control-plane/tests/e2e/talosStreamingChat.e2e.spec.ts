import { expect, test, type Page } from '@playwright/test'
import { installTalosApiMocks } from './helpers/talosApiMocks'

const SESSION_ID = 'session-stream-e2e'
const FIRST_PROMPT = 'Remember the codeword cobalt for this conversation.'
const SECOND_PROMPT = 'What codeword did I ask you to remember?'
const ANSWERS: Record<string, string> = {
    [FIRST_PROMPT]: 'Live response: I will remember cobalt.',
    [SECOND_PROMPT]: 'Live response: the codeword is cobalt.',
}
const e2eLoginEmail = process.env.TALOS_E2E_EMAIL ?? 'test@example.com'
const e2eLoginPassword = process.env.TALOS_E2E_PASSWORD ?? 'password'

type StreamHarnessMode = 'complete' | 'cancel'

type StreamHarness = {
    messages: Array<Record<string, unknown>>
    cancelRequests: () => number
    clientAssistantWrites: () => number
}

function apiMessage(
    id: string,
    role: 'user' | 'assistant',
    content: string,
    sequence: number,
    runId: string | null = null,
): Record<string, unknown> {
    const occurredAt = `2026-07-28T12:00:${String(sequence).padStart(2, '0')}.000Z`
    return {
        id,
        session_id: SESSION_ID,
        role,
        content,
        model_profile_id: role === 'assistant' ? 'profile-e2e' : null,
        run_id: runId,
        request_key: role === 'assistant' && runId
            ? `talos.chat.stream.v1:${runId}:assistant`
            : null,
        metadata: role === 'assistant'
            ? { source: 'talos_agent_turn', contract: 'talos.message.metadata.v2' }
            : {},
        created_at: occurredAt,
        updated_at: occurredAt,
    }
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
}

async function installStreamingHarness(page: Page, mode: StreamHarnessMode): Promise<StreamHarness> {
    await installTalosApiMocks(page, {
        initialSessions: [{
            id: SESSION_ID,
            title: mode === 'complete' ? 'Streaming conversation' : 'Cancelled stream',
        }],
    })

    const messages: Array<Record<string, unknown>> = []
    let sequence = 0
    let cancelRequestCount = 0
    let clientAssistantWriteCount = 0

    await page.route('**/api/talos/capabilities', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                data: {
                    contract: 'talos.product.capabilities.v1',
                    revision: 'e2e-streaming-v1',
                    capabilities: [
                        {
                            id: 'chat.provider',
                            state: 'available',
                            reason: null,
                            evidence: ['e2e:provider-profile'],
                        },
                        {
                            id: 'chat.streaming',
                            state: 'available',
                            reason: null,
                            evidence: ['e2e:browser-readable-stream'],
                        },
                    ],
                },
            }),
        })
    })

    await page.route(`**/api/talos/sessions/${SESSION_ID}/messages`, async (route) => {
        const request = route.request()
        if (request.method() === 'GET') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ data: messages }),
            })
            return
        }
        if (request.method() !== 'POST') {
            await route.fulfill({ status: 405 })
            return
        }

        const body = request.postDataJSON() as Record<string, unknown>
        if (body.role !== 'user') {
            clientAssistantWriteCount += 1
            await route.fulfill({
                status: 409,
                contentType: 'application/json',
                body: JSON.stringify({ message: 'The stream owns assistant persistence.' }),
            })
            return
        }

        sequence += 1
        const user = apiMessage(
            `user-stream-${sequence}`,
            'user',
            String(body.content ?? ''),
            sequence,
        )
        messages.push(user)

        if (mode === 'complete') {
            const runId = `run-${user.id}`
            sequence += 1
            messages.push(apiMessage(
                `assistant-${user.id}`,
                'assistant',
                ANSWERS[String(body.content ?? '')] ?? 'Live response: completed.',
                sequence,
                runId,
            ))
        }

        await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({ data: user }),
        })
    })

    await page.route('**/api/talos/runs/*/cancel', async (route) => {
        cancelRequestCount += 1
        const runId = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-2) ?? '')
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                data: {
                    run: { id: runId, session_id: SESSION_ID, status: 'cancelled' },
                    event: {
                        contract: 'talos.chat.stream.v1',
                        run_id: runId,
                        sequence: 99,
                        kind: 'run.cancelled',
                        occurred_at: '2026-07-28T12:05:00.000Z',
                        payload: { reason: 'user_requested' },
                    },
                    already_cancelled: false,
                },
            }),
        })
    })

    await page.addInitScript(({ sessionId, mode: streamMode, answers }) => {
        const nativeFetch = window.fetch.bind(window)

        window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
            const requestUrl = input instanceof Request
                ? input.url
                : input instanceof URL
                    ? input.href
                    : String(input)
            const url = new URL(requestUrl, window.location.href)
            if (url.pathname !== '/api/talos/chat/stream') {
                return nativeFetch(input, init)
            }

            const bodyText = typeof init.body === 'string'
                ? init.body
                : input instanceof Request
                    ? await input.clone().text()
                    : ''
            const payload = JSON.parse(bodyText) as {
                message: string
                session_id: string
                user_message_id: string
                model_profile_id?: string
            }
            if (payload.session_id !== sessionId) {
                return new Response(JSON.stringify({ message: 'Streaming session mismatch.' }), {
                    status: 404,
                    headers: { 'Content-Type': 'application/json' },
                })
            }

            const runId = `run-${payload.user_message_id}`
            const assistantId = `assistant-${payload.user_message_id}`
            const answer = answers[payload.message] ?? 'Live response: completed.'
            const firstDelta = 'Live '
            const rest = answer.startsWith(firstDelta) ? answer.slice(firstDelta.length) : answer
            const occurredAt = '2026-07-28T12:00:10.000Z'
            const encoder = new TextEncoder()
            const timers: number[] = []
            let closed = false

            const frame = (event: Record<string, unknown>) => (
                `id: ${String(event.sequence)}\n`
                + `event: ${String(event.kind)}\n`
                + `data: ${JSON.stringify(event)}\n\n`
            )
            const envelope = (
                sequence: number,
                kind: string,
                eventPayload: Record<string, unknown>,
            ) => ({
                contract: 'talos.chat.stream.v1',
                run_id: runId,
                sequence,
                kind,
                occurred_at: occurredAt,
                payload: eventPayload,
            })

            const signal = init.signal ?? (input instanceof Request ? input.signal : null)
            const stream = new ReadableStream<Uint8Array>({
                start(controller) {
                    const clearScheduled = () => {
                        timers.splice(0).forEach((timer) => window.clearTimeout(timer))
                    }
                    const schedule = (delay: number, action: () => void) => {
                        timers.push(window.setTimeout(() => {
                            if (!closed) action()
                        }, delay))
                    }
                    const emit = (delay: number, event: Record<string, unknown>) => {
                        schedule(delay, () => controller.enqueue(encoder.encode(frame(event))))
                    }
                    const abort = () => {
                        if (closed) return
                        closed = true
                        clearScheduled()
                        controller.error(new DOMException('The TALOS stream was cancelled.', 'AbortError'))
                    }

                    if (signal?.aborted) {
                        abort()
                        return
                    }
                    signal?.addEventListener('abort', abort, { once: true })

                    emit(0, envelope(1, 'run.started', {
                        run: {
                            id: runId,
                            session_id: sessionId,
                            model_profile_id: payload.model_profile_id ?? null,
                            model_routing_profile_id: null,
                            context_set_id: null,
                            mode: 'tool_agent',
                            status: 'running',
                            provider: 'openai',
                            model: 'gpt-e2e',
                            started_at: occurredAt,
                        },
                    }))
                    emit(120, envelope(2, 'text.delta', {
                        text: streamMode === 'cancel' ? 'Partial response ' : firstDelta,
                        provider_sequence: 1,
                    }))

                    if (streamMode === 'complete') {
                        emit(900, envelope(3, 'text.delta', {
                            text: rest,
                            provider_sequence: 2,
                        }))
                        emit(1_800, envelope(4, 'message.completed', {
                            message_id: assistantId,
                            request_key: `talos.chat.stream.v1:${runId}:assistant`,
                            message: {
                                id: assistantId,
                                session_id: sessionId,
                                role: 'assistant',
                                content: answer,
                                model_profile_id: payload.model_profile_id ?? null,
                                run_id: runId,
                                request_key: `talos.chat.stream.v1:${runId}:assistant`,
                                metadata: {
                                    source: 'talos_agent_turn',
                                    contract: 'talos.message.metadata.v2',
                                },
                                created_at: occurredAt,
                                updated_at: occurredAt,
                            },
                        }))
                        schedule(1_820, () => {
                            closed = true
                            clearScheduled()
                            controller.close()
                        })
                    }
                },
                cancel() {
                    closed = true
                    timers.splice(0).forEach((timer) => window.clearTimeout(timer))
                },
            })

            return new Response(stream, {
                status: 200,
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'X-Talos-Run-ID': runId,
                    'X-Talos-Reconciled': '0',
                },
            })
        }
    }, {
        sessionId: SESSION_ID,
        mode,
        answers: ANSWERS,
    })

    return {
        messages,
        cancelRequests: () => cancelRequestCount,
        clientAssistantWrites: () => clientAssistantWriteCount,
    }
}

test('streaming chat grows visibly, preserves multi-turn session continuity and reloads one durable answer per turn', async ({ page }) => {
    const harness = await installStreamingHarness(page, 'complete')
    await openAuthenticatedWorkspace(page)

    const composer = page.getByLabel('Message TALOS')
    await composer.fill(FIRST_PROMPT)
    await composer.press('Enter')

    const activeReply = page.getByTestId('talos-streaming-reply')
    await expect(activeReply).toBeVisible()
    await expect(activeReply).toContainText('Live')
    await expect(activeReply).not.toContainText('cobalt')

    const assistantMessages = page.locator('article[data-message-role="assistant"]')
    await expect(assistantMessages).toHaveCount(1)
    await expect(assistantMessages.last()).toContainText(ANSWERS[FIRST_PROMPT])
    await expect(activeReply).toHaveCount(0)

    await composer.fill(SECOND_PROMPT)
    await composer.press('Enter')
    await expect(assistantMessages).toHaveCount(2)
    await expect(assistantMessages.last()).toContainText(ANSWERS[SECOND_PROMPT])
    await expect(page.locator('article[data-message-role="user"]')).toHaveCount(2)
    expect(harness.clientAssistantWrites()).toBe(0)
    expect(harness.messages).toHaveLength(4)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByLabel('Message TALOS')).toBeVisible({ timeout: 45_000 })
    await expect(page.locator('article[data-message-role="user"]')).toHaveCount(2)
    await expect(page.locator('article[data-message-role="assistant"]')).toHaveCount(2)
    await expect(page.locator('article[data-message-role="assistant"]').last()).toContainText(ANSWERS[SECOND_PROMPT])
    expect(harness.messages.filter((message) => message.role === 'assistant')).toHaveLength(2)
})

test('Stop cancels the owned run and reload keeps only the persisted user turn', async ({ page }) => {
    const harness = await installStreamingHarness(page, 'cancel')
    await openAuthenticatedWorkspace(page)

    const composer = page.getByLabel('Message TALOS')
    await composer.fill('Write a long response that I can stop.')
    await composer.press('Enter')

    const activeReply = page.getByTestId('talos-streaming-reply')
    await expect(activeReply).toContainText('Partial response')
    const stop = page.getByRole('button', { name: 'Stop response' })
    await expect(stop).toBeEnabled()
    await stop.click()

    await expect.poll(harness.cancelRequests).toBe(1)
    await expect(activeReply).toHaveAttribute('data-stream-status', 'cancelled')
    await expect(activeReply).toContainText('Stopped')
    await expect(page.getByRole('button', { name: 'Stop response' })).toHaveCount(0)
    await expect(page.locator('article[data-message-role="assistant"]')).toHaveCount(0)
    await expect(page.locator('article[data-message-role="user"]')).toHaveCount(1)
    expect(harness.clientAssistantWrites()).toBe(0)
    expect(harness.messages).toHaveLength(1)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByLabel('Message TALOS')).toBeVisible({ timeout: 45_000 })
    await expect(page.getByTestId('talos-streaming-reply')).toHaveCount(0)
    await expect(page.locator('article[data-message-role="assistant"]')).toHaveCount(0)
    await expect(page.locator('article[data-message-role="user"]')).toHaveCount(1)
})
