// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, nextTick } from 'vue'
import TalosBrowserCard from './TalosBrowserCard.vue'
import type { TalosBrowserActivity, TalosBrowserTask } from '../../../lib/talosTypes'

function task(status: TalosBrowserTask['status']): TalosBrowserTask {
    return {
        id: 'task-1',
        talos_session_id: 'chat-1',
        origin_message_id: 'message-1',
        browser_session_id: 'browser-1',
        runtime_id: 'runtime-1',
        active_tab_id: 'tab-1',
        goal: 'Inspect the requested product page.',
        status,
        autonomy_profile: 'assist',
        budget: { max_domains: 16, max_tokens: 196608 },
        state_version: 3,
        requested_at: '2026-07-16T08:00:00Z',
        started_at: '2026-07-16T08:00:01Z',
        completed_at: status === 'completed' ? '2026-07-16T08:00:04Z' : null,
        failed_at: status === 'failed' ? '2026-07-16T08:00:04Z' : null,
        cancelled_at: status === 'cancelled' ? '2026-07-16T08:00:04Z' : null,
        reconciled_at: null,
        created_at: '2026-07-16T08:00:00Z',
        updated_at: '2026-07-16T08:00:04Z',
    }
}

const activities: TalosBrowserActivity[] = [{
    id: 'navigate-1',
    operation: 'navigate',
    status: 'succeeded',
    label: 'Navigated to https://example.com/products/1',
    run_id: 'run-1',
    browser_session_id: 'browser-1',
    artifact_ids: [],
    occurred_at: '2026-07-16T08:00:02Z',
}]

let app: ReturnType<typeof createApp> | null = null

async function mountCard(status: TalosBrowserTask['status'] = 'running', onCancelTask?: (taskId: string) => void) {
    const root = document.createElement('div')
    document.body.append(root)
    app = createApp(TalosBrowserCard, {
        task: task(status),
        activities,
        snapshot: null,
        talosSessionId: 'chat-1',
        currentPage: {
            host: 'example.com',
            title: 'Product one',
            url: 'https://example.com/products/1',
        },
        onCancelTask,
    })
    app.mount(root)
    await nextTick()
    return root
}

afterEach(() => {
    app?.unmount()
    app = null
    document.body.replaceChildren()
})

describe('TalosBrowserCard', () => {
    it('presents one compact turn-owned card with page, goal, budget and embedded activity', async () => {
        const root = await mountCard()
        const card = root.querySelector('[data-testid="talos-browser-card"]')

        expect(card).not.toBeNull()
        expect(card?.getAttribute('data-task-id')).toBe('task-1')
        expect(root.textContent).toContain('Product one')
        expect(root.textContent).toContain('example.com')
        expect(root.textContent).toContain('Inspect the requested product page.')
        expect(root.textContent).toContain('16 domains')
        expect(root.textContent).toContain('192K tokens')
        expect(root.textContent).toContain('Browsing in progress')
        expect(root.querySelector('[data-testid="talos-browser-activity"]')?.getAttribute('data-presentation')).toBe('embedded')
        expect(root.querySelectorAll('[data-testid="talos-browser-card"]')).toHaveLength(1)
    })

    it.each([
        ['waiting_user', 'Browser task is waiting for your input'],
        ['recovering', 'Recovering browser task'],
        ['completed', 'Browser task completed'],
        ['failed', 'Browser task stopped because it could not continue'],
        ['cancelled', 'Browser task cancelled'],
    ] as const)('uses human language for %s state', async (status, label) => {
        const root = await mountCard(status)
        expect(root.textContent).toContain(label)
    })

    it('does not expose worker or tab identifiers in the standard card', async () => {
        const root = await mountCard()
        expect(root.textContent).not.toContain('runtime-1')
        expect(root.textContent).not.toContain('tab-1')
    })

    it('BREG-020 forwards the immutable identity of the task whose Cancel control was clicked', async () => {
        const cancelled: string[] = []
        const root = await mountCard('running', (taskId) => cancelled.push(taskId))

        root.querySelector<HTMLButtonElement>('[data-testid="talos-browser-task-cancel"]')?.click()

        expect(cancelled).toEqual(['task-1'])
    })
})
