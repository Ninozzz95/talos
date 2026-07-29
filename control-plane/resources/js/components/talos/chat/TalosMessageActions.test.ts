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

async function settle() {
    for (let round = 0; round < 3; round += 1) {
        await nextTick()
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
        await new Promise<void>((resolve) => window.setTimeout(resolve, 16))
    }
    await nextTick()
}

async function settleUntil(condition: () => boolean, timeoutMs = 2000) {
    const start = Date.now()
    await settle()
    while (!condition() && Date.now() - start < timeoutMs) {
        await settle()
    }
}

function ensurePortalRoot() {
    if (!document.getElementById('talos-portal-root')) {
        const portalRoot = document.createElement('div')
        portalRoot.id = 'talos-portal-root'
        document.body.append(portalRoot)
    }
    return document.getElementById('talos-portal-root') as HTMLElement
}

function openMenuByKeyboard(more: HTMLButtonElement) {
    more.focus()
    more.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
}

async function resolveMoreButton(container: HTMLElement) {
    await settleUntil(() => container.querySelector('[aria-label="More message actions"]') !== null)
    return container.querySelector<HTMLButtonElement>('[aria-label="More message actions"]')!
}

function portalMenu() {
    return document.querySelector<HTMLElement>('#talos-portal-root [role="menu"]')
}

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
    ensurePortalRoot()
    const events = ref<string[]>([])
    const container = document.createElement('div')
    document.body.append(container)
    const app = createApp(defineComponent({
        setup() {
            return () => h(TalosMessageActions, {
                message: assistantMessage,
                canRetry: true,
                hasEvidence: true,
                hasMedia: true,
                evidenceOpen: false,
                hasBenchmark: true,
                benchmarking: false,
                onCopy: () => events.value.push('copy'),
                onRetry: () => events.value.push('retry'),
                onOpenMedia: () => events.value.push('media'),
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
    ensurePortalRoot()
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
    it('keeps copy and retry primary while exposing secondary capabilities through More', async () => {
        const { container } = mountActions()
        await resolveMoreButton(container)
        const labels = Array.from(container.querySelectorAll<HTMLButtonElement>('[data-primary-action]')).map((button) => button.getAttribute('aria-label'))

        expect(labels).toEqual([
            'Copy message',
            'Retry assistant response',
            'More message actions',
        ])
        expect(container.querySelector('[aria-label="Reuse prompt"]')).toBeNull()
        expect(container.querySelector('[aria-label="Resend message"]')).toBeNull()
        expect(portalMenu()).toBeNull()
        expect(container.querySelector('[aria-label="Message actions"]')?.className).toContain('min-h-11')
    })

    it('emits evidence and benchmark actions through the same toolbar', async () => {
        const { container, events } = mountActions()
        const more = await resolveMoreButton(container)

        openMenuByKeyboard(more)
        await settleUntil(() => portalMenu() !== null)
        const evidence = document.querySelector<HTMLElement>('[role="menuitem"][aria-label="Open evidence"]')
        expect(evidence).not.toBeNull()
        evidence?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        await settle()
        expect(document.activeElement).toBe(more)

        openMenuByKeyboard(more)
        await settleUntil(() => portalMenu() !== null)
        const benchmark = document.querySelector<HTMLElement>('[role="menuitem"][aria-label="Compare AVM ON/OFF"]')
        benchmark?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        await settle()

        expect(events.value).toEqual(['evidence', 'benchmark'])
    })

    it('opens a semantic capability-aware menu in deterministic focus order', async () => {
        const { container } = mountActions()
        const more = await resolveMoreButton(container)

        openMenuByKeyboard(more)
        await settleUntil(() => document.activeElement?.getAttribute('role') === 'menuitem')

        const menu = portalMenu()
        expect(menu?.getAttribute('aria-label')).toBe('More message actions')
        expect(Array.from(menu?.querySelectorAll('[role="menuitem"]') ?? []).map((item) => item.getAttribute('aria-label'))).toEqual([
            'Open media',
            'Open evidence',
            'Compare AVM ON/OFF',
        ])
        expect(document.activeElement?.getAttribute('role')).toBe('menuitem')
        expect(more.getAttribute('aria-expanded')).toBe('true')
    })

    it('opens message media through the same accessible capability menu', async () => {
        const { container, events } = mountActions()
        const more = await resolveMoreButton(container)

        openMenuByKeyboard(more)
        await settleUntil(() => portalMenu() !== null)
        const media = document.querySelector<HTMLElement>('[role="menuitem"][aria-label="Open media"]')
        media?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        await settle()

        expect(events.value).toEqual(['media'])
        expect(document.activeElement).toBe(more)
    })

    it('closes on Escape and restores focus to More', async () => {
        const { container } = mountActions()
        const more = await resolveMoreButton(container)

        openMenuByKeyboard(more)
        await settleUntil(() => portalMenu() !== null)
        const active = document.activeElement as HTMLElement
        active.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        await settle()

        expect(portalMenu()).toBeNull()
        expect(document.activeElement).toBe(more)
    })

    it('closes when focus or a pointer moves outside the action menu', async () => {
        const { container } = mountActions()
        const more = await resolveMoreButton(container)

        openMenuByKeyboard(more)
        await settleUntil(() => portalMenu() !== null)
        expect(portalMenu()).not.toBeNull()
        document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
        document.body.click()
        await settle()

        expect(portalMenu()).toBeNull()
    })

    it('keeps user copy and resend primary while placing reuse in More', async () => {
        const { container, events } = mountUserActions()
        const more = await resolveMoreButton(container)
        const labels = Array.from(container.querySelectorAll<HTMLButtonElement>('[data-primary-action]')).map((button) => button.getAttribute('aria-label'))

        expect(labels).toEqual(['Copy message', 'Resend message', 'More message actions'])
        openMenuByKeyboard(more)
        await settleUntil(() => portalMenu() !== null)
        const reuse = document.querySelector<HTMLElement>('[role="menuitem"][aria-label="Reuse prompt"]')
        reuse?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        await settle()

        expect(events.value).toEqual(['edit'])
    })

    it('renders the More menu through the shared reka dropdown in the portal with v7 elevation', async () => {
        const { container } = mountActions()
        const more = await resolveMoreButton(container)

        openMenuByKeyboard(more)
        await settleUntil(() => portalMenu() !== null)

        const menu = portalMenu()
        expect(menu, 'the More menu must render through the shared portal').not.toBeNull()
        expect(menu?.className).toContain('talos-elev-2')

        const active = document.activeElement as HTMLElement
        active.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        await settle()

        expect(portalMenu()).toBeNull()
        expect(document.activeElement).toBe(more)
    })
})
