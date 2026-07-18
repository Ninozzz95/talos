// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h } from 'vue'
import type { TalosMessage } from '../../../lib/talosTypes'
import TalosStatusMessage from './TalosStatusMessage.vue'

const mounted: Array<ReturnType<typeof createApp>> = []

afterEach(() => {
    mounted.splice(0).forEach((app) => app.unmount())
    document.body.replaceChildren()
})

function mountMessage(message: TalosMessage) {
    const container = document.createElement('div')
    document.body.append(container)
    const app = createApp({ render: () => h(TalosStatusMessage, { message }) })
    mounted.push(app)
    app.mount(container)
    return container
}

describe('TalosStatusMessage', () => {
    it('renders a provider fault as structured recovery guidance', () => {
        const container = mountMessage({
            id: 'fault-1',
            session_id: 'session-1',
            role: 'system',
            content: 'Legacy concatenated fallback that must not be rendered.',
            run_id: 'run-1',
            created_at: '2026-07-10T10:00:00Z',
            metadata: {
                chat_error: {
                    layer: 'provider',
                    code: 'PROVIDER_AUTHENTICATION_FAILED',
                    message: 'DeepSeek rejected the configured credential.',
                    next_action: 'Open Model Lab and update the secret.',
                    retryable: false,
                    status: 401,
                    provider: 'deepseek',
                    model: 'deepseek-chat',
                },
            },
        })

        const alert = container.querySelector<HTMLElement>('[role="alert"]')
        expect(alert?.dataset.faultLayer).toBe('provider')
        expect(alert?.dataset.faultCode).toBe('PROVIDER_AUTHENTICATION_FAILED')
        expect(alert?.textContent).toContain('Provider failure')
        expect(alert?.textContent).toContain('DeepSeek rejected the configured credential.')
        expect(alert?.textContent).toContain('Open Model Lab and update the secret.')
        expect(alert?.textContent).toContain('deepseek / deepseek-chat')
        expect(alert?.textContent).toContain('Manual action required')
        expect(alert?.textContent).not.toContain('Legacy concatenated fallback')
        expect(alert?.textContent).not.toContain('{"layer"')
    })

    it.each([
        ['validator', 'Validation fault'],
        ['policy', 'Policy denial'],
        ['network', 'Network failure'],
        ['worker', 'Worker failure'],
    ])('maps %s faults to a controlled title', (layer, title) => {
        const container = mountMessage({
            id: `fault-${layer}`,
            session_id: 'session-1',
            role: 'system',
            content: 'fallback',
            created_at: '2026-07-10T10:00:00Z',
            metadata: {
                chat_error: {
                    layer,
                    code: `${layer.toUpperCase()}_FAILED`,
                    message: 'Controlled message.',
                    retryable: true,
                },
            },
        })

        expect(container.querySelector('[role="alert"]')?.textContent).toContain(title)
        expect(container.textContent).toContain('Retry available')
    })

    it('keeps an ordinary system notice distinct from a fault', () => {
        const container = mountMessage({
            id: 'notice-1',
            session_id: 'session-1',
            role: 'system',
            content: 'Context set updated.',
            created_at: '2026-07-10T10:00:00Z',
            metadata: {},
        })

        expect(container.querySelector('[role="status"]')?.textContent).toContain('Context set updated.')
        expect(container.querySelector('[role="alert"]')).toBeNull()
    })

    it('system rows render as centered caption rows, not warning washes', () => {
        const container = mountMessage({
            id: 'notice-2',
            session_id: 'session-1',
            role: 'system',
            content: 'Benchmark run created.',
            created_at: '2026-07-10T10:05:00Z',
            metadata: {},
        })

        const row = container.querySelector<HTMLElement>('[role="status"]')
        expect(row?.classList.contains('talos-status-row')).toBe(true)
        expect(row?.className).not.toContain('warning')
    })
})
