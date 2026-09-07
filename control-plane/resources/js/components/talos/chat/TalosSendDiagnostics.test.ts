// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import TalosSendDiagnostics from './TalosSendDiagnostics.vue'

const apps: Array<ReturnType<typeof createApp>> = []

afterEach(() => {
    apps.splice(0).forEach((app) => app.unmount())
    document.body.replaceChildren()
    vi.unstubAllGlobals()
})

function mountDiagnostics(
    diagnostic: Record<string, unknown> | null,
    usage: Record<string, unknown> | null = null,
) {
    const container = document.createElement('div')
    document.body.append(container)
    const app = createApp({
        render: () => h(TalosSendDiagnostics, {
            diagnostic: diagnostic as never,
            usage: usage as never,
        }),
    })
    apps.push(app)
    app.mount(container)
    return container
}

describe('TalosSendDiagnostics', () => {
    it('renders actionable allowlisted send details without exposing prompt-shaped extras', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        vi.stubGlobal('navigator', {
            ...navigator,
            clipboard: { writeText },
        })
        const container = mountDiagnostics({
            code: 'TALOS_STREAM_INCOMPLETE',
            phase: 'stream',
            run_id: 'run-1',
            last_sequence: 7,
            retryable: true,
            reconciled: true,
            attempts: 2,
            prompt: 'do not expose this',
            api_key: 'secret',
        })

        expect(container.textContent).toContain('TALOS_STREAM_INCOMPLETE')
        expect(container.textContent).toContain('Retry is safe')
        container.querySelector<HTMLButtonElement>('[data-testid="talos-copy-send-diagnostics"]')!.click()
        await nextTick()
        await Promise.resolve()

        const copied = String(writeText.mock.calls[0]?.[0])
        expect(JSON.parse(copied)).toEqual({
            attempts: 2,
            code: 'TALOS_STREAM_INCOMPLETE',
            last_sequence: 7,
            phase: 'stream',
            reconciled: true,
            retryable: true,
            run_id: 'run-1',
        })
        expect(copied).not.toContain('do not expose this')
        expect(copied).not.toContain('secret')
    })

    it('reports a clipboard failure without leaking diagnostic data into an exception', async () => {
        vi.stubGlobal('navigator', {
            ...navigator,
            clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
        })
        const container = mountDiagnostics({
            code: 'TALOS_STREAM_CANCEL_FAILED',
            phase: 'cancel',
            run_id: 'run-1',
            last_sequence: 2,
            retryable: false,
            reconciled: false,
            attempts: 1,
        })

        container.querySelector<HTMLButtonElement>('[data-testid="talos-copy-send-diagnostics"]')!.click()
        await nextTick()
        await Promise.resolve()
        expect(container.querySelector('[role="status"]')?.textContent).toBe('Copy failed')
    })

    it('renders honest cache telemetry without requiring an error diagnostic', () => {
        const container = mountDiagnostics(null, {
            input_tokens: 20,
            output_tokens: 4,
            total_tokens: 24,
            cached_tokens: 0,
            cache_read_tokens: 0,
            cache_write_tokens: null,
            cache_miss_tokens: 20,
            cache_write_5m_tokens: null,
            cache_write_1h_tokens: null,
        })

        const cache = container.querySelector('[data-testid="talos-cache-usage"]')
        expect(cache?.textContent).toContain('Cache reads')
        expect(cache?.textContent).toContain('0')
        expect(cache?.textContent).toContain('Cache writes')
        expect(cache?.textContent).toContain('Unavailable')
        expect(cache?.textContent).toContain('Cache misses')
        expect(cache?.textContent).toContain('20')
        expect(container.querySelector('[data-testid="talos-copy-send-diagnostics"]')).toBeNull()
    })
})
