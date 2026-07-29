// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h } from 'vue'
import TalosToolActivityRow from './TalosToolActivityRow.vue'

const apps: Array<ReturnType<typeof createApp>> = []

afterEach(() => {
    apps.splice(0).forEach((app) => app.unmount())
    document.body.replaceChildren()
    vi.useRealTimers()
})

describe('TalosToolActivityRow', () => {
    it('maintains one elapsed clock per running tool and freezes completed tools', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-07-28T10:00:10Z'))
        const container = document.createElement('div')
        document.body.append(container)
        const app = createApp({
            render: () => h('div', [
                h(TalosToolActivityRow, {
                    activity: {
                        id: 'tool-a',
                        name: 'Browser snapshot',
                        status: 'running',
                        started_at: '2026-07-28T10:00:05Z',
                        completed_at: null,
                    },
                }),
                h(TalosToolActivityRow, {
                    activity: {
                        id: 'tool-b',
                        name: 'Read document',
                        status: 'running',
                        started_at: '2026-07-28T10:00:08Z',
                        completed_at: null,
                    },
                }),
                h(TalosToolActivityRow, {
                    activity: {
                        id: 'tool-c',
                        name: 'Completed lookup',
                        status: 'succeeded',
                        started_at: '2026-07-28T10:00:00Z',
                        completed_at: '2026-07-28T10:00:03Z',
                    },
                }),
            ]),
        })
        apps.push(app)
        app.mount(container)

        const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-talos-tool-activity]'))
        expect(rows[0].textContent).toContain('5s')
        expect(rows[1].textContent).toContain('2s')
        expect(rows[2].textContent).toContain('3s')

        await vi.advanceTimersByTimeAsync(1000)
        expect(rows[0].textContent).toContain('6s')
        expect(rows[1].textContent).toContain('3s')
        expect(rows[2].textContent).toContain('3s')
    })
})
