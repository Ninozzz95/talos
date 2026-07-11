// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h } from 'vue'
import type { TalosMessage } from '../../../lib/talosTypes'
import TalosRunActivity from './TalosRunActivity.vue'

const mounted: Array<ReturnType<typeof createApp>> = []

afterEach(() => {
    mounted.splice(0).forEach((app) => app.unmount())
    document.body.replaceChildren()
})

function mountStatus(status: string) {
    const message: TalosMessage = {
        id: `message-${status}`,
        session_id: 'session-1',
        role: 'assistant',
        content: 'Answer',
        run_id: `run-${status}`,
        created_at: '2026-07-10T10:00:00Z',
        metadata: {
            run: {
                id: `run-${status}`,
                status,
                provider: 'deepseek',
                model: 'deepseek-chat',
            },
        },
    }
    const container = document.createElement('div')
    document.body.append(container)
    const app = createApp({ render: () => h(TalosRunActivity, { message }) })
    mounted.push(app)
    app.mount(container)
    return container
}

describe('TalosRunActivity', () => {
    it.each([
        ['queued', 'Run queued'],
        ['running', 'Run in progress'],
        ['succeeded', 'Run succeeded'],
        ['failed', 'Run failed'],
        ['denied', 'Run denied'],
    ])('renders persisted %s state with typed semantics', (status, label) => {
        const container = mountStatus(status)
        const row = container.querySelector<HTMLElement>('[data-talos-run-activity]')

        expect(row?.dataset.runStatus).toBe(status)
        expect(row?.textContent).toContain(label)
        expect(row?.textContent).toContain('deepseek / deepseek-chat')
        expect(row?.textContent).not.toContain('{"id"')
        expect(row?.getAttribute('role')).toBe(status === 'failed' || status === 'denied' ? 'alert' : 'status')
    })

    it('renders nothing when no persisted run snapshot exists', () => {
        const container = document.createElement('div')
        document.body.append(container)
        const message: TalosMessage = {
            id: 'message-no-run',
            session_id: 'session-1',
            role: 'assistant',
            content: 'Answer',
            created_at: '2026-07-10T10:00:00Z',
            metadata: {},
        }
        const app = createApp({ render: () => h(TalosRunActivity, { message }) })
        mounted.push(app)
        app.mount(container)

        expect(container.querySelector('[data-talos-run-activity]')).toBeNull()
    })
})
