// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h } from 'vue'
import type { TalosMessage } from '../../../lib/talosTypes'
import TalosAutoReceipt from './TalosAutoReceipt.vue'

const mounted: Array<ReturnType<typeof createApp>> = []

afterEach(() => {
    mounted.splice(0).forEach((app) => app.unmount())
    document.body.replaceChildren()
})

function mountReceipt(message: TalosMessage) {
    const container = document.createElement('div')
    document.body.append(container)
    const app = createApp({ render: () => h(TalosAutoReceipt, { message }) })
    mounted.push(app)
    app.mount(container)
    return container
}

function assistant(run: Record<string, unknown>): TalosMessage {
    return {
        id: 'assistant-1',
        session_id: 'session-1',
        role: 'assistant',
        content: 'Answer',
        run_id: String(run.id ?? 'run-1'),
        created_at: '2026-07-20T00:00:00Z',
        metadata: { run },
    }
}

describe('TalosAutoReceipt', () => {
    it('shows the resolved provider/model when the turn used a routing profile', () => {
        const container = mountReceipt(assistant({
            id: 'run-1',
            status: 'succeeded',
            provider: 'anthropic',
            model: 'claude-sonnet-4-6',
            model_routing_profile_id: 'routing-fast',
        }))

        const receipt = container.querySelector('[data-testid="talos-auto-receipt"]')
        expect(receipt).not.toBeNull()
        expect(receipt?.textContent).toContain('Auto')
        expect(receipt?.textContent).toContain('anthropic / claude-sonnet-4-6')
    })

    it('renders nothing for a direct (non-routed) reply', () => {
        const container = mountReceipt(assistant({
            id: 'run-1',
            status: 'succeeded',
            provider: 'deepseek',
            model: 'deepseek-v4-flash',
        }))

        expect(container.querySelector('[data-testid="talos-auto-receipt"]')).toBeNull()
    })

    it('renders nothing when no persisted run snapshot exists', () => {
        const message: TalosMessage = {
            id: 'assistant-no-run',
            session_id: 'session-1',
            role: 'assistant',
            content: 'Answer',
            created_at: '2026-07-20T00:00:00Z',
            metadata: {},
        }
        const container = mountReceipt(message)
        expect(container.querySelector('[data-testid="talos-auto-receipt"]')).toBeNull()
    })
})
