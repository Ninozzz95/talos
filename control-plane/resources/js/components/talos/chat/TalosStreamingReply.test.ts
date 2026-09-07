// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, reactive, ref } from 'vue'
import type { TalosStreamingChatState } from '../../../composables/useTalosStreamingChat'
import TalosStreamingReply from './TalosStreamingReply.vue'

function state(overrides: Partial<TalosStreamingChatState> = {}) {
    return reactive<TalosStreamingChatState>({
        ownerSessionId: 'session-1',
        ownerMessageId: 'message-user-1',
        runId: 'run-1',
        rawText: 'Verified answer.',
        reasoningText: '',
        tools: [],
        artifacts: [],
        usage: null,
        status: 'streaming',
        lastSequence: 2,
        attempts: 1,
        reconciled: false,
        error: null,
        cancelError: null,
        diagnostic: null,
        ...overrides,
    })
}

const apps: Array<ReturnType<typeof createApp>> = []

afterEach(() => {
    apps.splice(0).forEach((app) => app.unmount())
    document.body.replaceChildren()
    vi.unstubAllGlobals()
})

function mountReply(initial: TalosStreamingChatState) {
    const current = ref(initial)
    const container = document.createElement('div')
    document.body.append(container)
    const app = createApp(defineComponent({
        setup() {
            return () => h(TalosStreamingReply, {
                state: current.value,
                reducedMotion: true,
                sensitiveBlur: false,
            })
        },
    }))
    apps.push(app)
    app.mount(container)
    return { container, current }
}

describe('TalosStreamingReply', () => {
    it('renders the active answer, separate reasoning and live tool state in one isolated subtree', async () => {
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
            queueMicrotask(() => callback(40))
            return 1
        })
        vi.stubGlobal('cancelAnimationFrame', vi.fn())
        const { container } = mountReply(state({
            reasoningText: 'Checked the source.',
            tools: [{ id: 'call-1', name: 'browser_read', status: 'running' }],
        }))
        await vi.waitFor(() => expect(container.textContent).toContain('Verified answer.'))

        expect(container.querySelector('[data-testid="talos-streaming-reply"]')?.getAttribute('data-stream-status')).toBe('streaming')
        expect(container.querySelector('[data-testid="talos-stream-reasoning"]')?.textContent).toContain('Checked the source.')
        expect(container.querySelector('[data-testid="talos-stream-tool-call-1"]')?.textContent).toContain('browser_read')
        expect(container.textContent).toContain('Responding')
    })

    it('keeps partial canonical text visible and exposes copy-safe diagnostics after a failure', async () => {
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
            queueMicrotask(() => callback(40))
            return 1
        })
        vi.stubGlobal('cancelAnimationFrame', vi.fn())
        const { container } = mountReply(state({
            rawText: 'Partial verified output',
            status: 'failed',
            error: 'TALOS could not reconcile the stream.',
            diagnostic: {
                code: 'TALOS_STREAM_INCOMPLETE',
                phase: 'stream',
                run_id: 'run-1',
                last_sequence: 3,
                retryable: true,
                reconciled: false,
                attempts: 2,
            },
        }))
        await vi.waitFor(() => expect(container.textContent).toContain('Partial verified output'))

        expect(container.querySelector('[role="alert"]')?.textContent).toContain('TALOS could not reconcile the stream.')
        expect(container.querySelector('[data-testid="talos-copy-send-diagnostics"]')).not.toBeNull()
    })

    it('marks an approval pause and cancellation as explicit non-loading states', async () => {
        const { container, current } = mountReply(state({ rawText: '', status: 'awaiting_approval' }))
        expect(container.textContent).toContain('Waiting for approval')

        current.value = state({ rawText: 'Stopped output', status: 'cancelled' })
        await nextTick()
        expect(container.textContent).toContain('Stopped')
    })

    it('shows cache usage for a successful reply even when there is no send fault', () => {
        const { container } = mountReply(state({
            status: 'completed',
            usage: {
                input_tokens: 20,
                output_tokens: 4,
                total_tokens: 24,
                cached_tokens: 0,
                cache_read_tokens: 0,
                cache_write_tokens: null,
                cache_miss_tokens: 20,
                cache_write_5m_tokens: null,
                cache_write_1h_tokens: null,
            },
        }))

        expect(container.querySelector('[data-testid="talos-cache-usage"]')).not.toBeNull()
        expect(container.textContent).toContain('Unavailable')
    })
})
