// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import type { TalosMessage } from '../../../lib/talosTypes'
import TalosMessageActions from './TalosMessageActions.vue'

const mounted: Array<ReturnType<typeof createApp>> = []

afterEach(() => {
    mounted.splice(0).forEach((app) => app.unmount())
    document.body.replaceChildren()
})

const assistantMessage: TalosMessage = {
    id: 'message-1',
    session_id: 'session-1',
    role: 'assistant',
    content: 'Verified answer',
    run_id: 'run-1',
    metadata: {},
    created_at: '2026-07-10T10:00:00Z',
}

function mountActions() {
    const events = ref<string[]>([])
    const container = document.createElement('div')
    document.body.append(container)
    const app = createApp(defineComponent({
        setup() {
            return () => h(TalosMessageActions, {
                message: assistantMessage,
                canRetry: true,
                hasEvidence: true,
                evidenceOpen: false,
                hasBenchmark: true,
                benchmarking: false,
                onCopy: () => events.value.push('copy'),
                onRetry: () => events.value.push('retry'),
                onToggleEvidence: () => events.value.push('evidence'),
                onBenchmark: () => events.value.push('benchmark'),
            })
        },
    }))

    mounted.push(app)
    app.mount(container)

    return { container, events }
}

function mountUserActions() {
    const events = ref<string[]>([])
    const container = document.createElement('div')
    document.body.append(container)
    const userMessage = { ...assistantMessage, role: 'user' as const, content: 'Use this prompt' }
    const app = createApp(defineComponent({
        setup() {
            return () => h(TalosMessageActions, {
                message: userMessage,
                onCopy: () => events.value.push('copy'),
                onEdit: () => events.value.push('edit'),
                onResend: () => events.value.push('resend'),
            })
        },
    }))

    mounted.push(app)
    app.mount(container)

    return { container, events }
}

describe('TalosMessageActions', () => {
    it('keeps copy and retry primary while exposing secondary capabilities through More', () => {
        const { container } = mountActions()
        const labels = Array.from(container.querySelectorAll<HTMLButtonElement>('[data-primary-action]')).map((button) => button.getAttribute('aria-label'))

        expect(labels).toEqual([
            'Copy message',
            'Retry assistant response',
            'More message actions',
        ])
        expect(container.querySelector('[aria-label="Reuse prompt"]')).toBeNull()
        expect(container.querySelector('[aria-label="Resend message"]')).toBeNull()
        expect(container.querySelector('[role="menu"]')).toBeNull()
        expect(container.querySelector('[aria-label="Message actions"]')?.className).toContain('min-h-11')
    })

    it('emits evidence and benchmark actions through the same toolbar', async () => {
        const { container, events } = mountActions()
        const more = container.querySelector<HTMLButtonElement>('[aria-label="More message actions"]')!

        more.click()
        await nextTick()
        container.querySelector<HTMLButtonElement>('[role="menuitem"][aria-label="Open evidence"]')?.click()
        await nextTick()
        expect(document.activeElement).toBe(more)

        more.click()
        await nextTick()
        container.querySelector<HTMLButtonElement>('[role="menuitem"][aria-label="Compare AVM ON/OFF"]')?.click()
        await nextTick()

        expect(events.value).toEqual(['evidence', 'benchmark'])
    })

    it('opens a semantic capability-aware menu in deterministic focus order', async () => {
        const { container } = mountActions()
        const more = container.querySelector<HTMLButtonElement>('[aria-label="More message actions"]')!

        more.focus()
        more.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        await nextTick()

        const menu = container.querySelector<HTMLElement>('[role="menu"]')
        expect(menu?.getAttribute('aria-label')).toBe('More message actions')
        expect(Array.from(menu?.querySelectorAll('[role="menuitem"]') ?? []).map((item) => item.getAttribute('aria-label'))).toEqual([
            'Open evidence',
            'Compare AVM ON/OFF',
        ])
        expect(document.activeElement).toBe(menu?.querySelector('[role="menuitem"]'))
        expect(more.getAttribute('aria-expanded')).toBe('true')
    })

    it('closes on Escape and restores focus to More', async () => {
        const { container } = mountActions()
        const more = container.querySelector<HTMLButtonElement>('[aria-label="More message actions"]')!

        more.click()
        await nextTick()
        container.querySelector<HTMLElement>('[role="menu"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        await nextTick()

        expect(container.querySelector('[role="menu"]')).toBeNull()
        expect(document.activeElement).toBe(more)
    })

    it('closes when focus or a pointer moves outside the action menu', async () => {
        const { container } = mountActions()
        const more = container.querySelector<HTMLButtonElement>('[aria-label="More message actions"]')!

        more.click()
        await nextTick()
        document.body.click()
        await nextTick()

        expect(container.querySelector('[role="menu"]')).toBeNull()
    })

    it('keeps user copy and resend primary while placing reuse in More', async () => {
        const { container, events } = mountUserActions()
        const labels = Array.from(container.querySelectorAll<HTMLButtonElement>('[data-primary-action]')).map((button) => button.getAttribute('aria-label'))

        expect(labels).toEqual(['Copy message', 'Resend message', 'More message actions'])
        container.querySelector<HTMLButtonElement>('[aria-label="More message actions"]')?.click()
        await nextTick()
        container.querySelector<HTMLButtonElement>('[role="menuitem"][aria-label="Reuse prompt"]')?.click()
        await nextTick()

        expect(events.value).toEqual(['edit'])
    })
})
