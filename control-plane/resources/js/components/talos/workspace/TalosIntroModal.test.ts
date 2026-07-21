// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, reactive } from 'vue'
import TalosIntroModal from './TalosIntroModal.vue'
import type { TalosPublicLinks } from '../../../lib/talosPublicLinks'

let app: ReturnType<typeof createApp> | undefined

afterEach(() => {
    app?.unmount()
    app = undefined
    document.body.replaceChildren()
})

type MountState = {
    open: boolean
    links: TalosPublicLinks
    outcomes: string[]
}

function mountModal(links: TalosPublicLinks = {}) {
    const state = reactive<MountState>({ open: true, links, outcomes: [] })
    const shell = document.createElement('div')
    shell.className = 'talos-shell'
    const portalRoot = document.createElement('div')
    portalRoot.id = 'talos-portal-root'
    const mountPoint = document.createElement('div')
    shell.append(portalRoot, mountPoint)
    document.body.append(shell)

    app = createApp(defineComponent({
        setup() {
            return () => h(TalosIntroModal, {
                open: state.open,
                links: state.links,
                onClose: (outcome: string) => {
                    state.outcomes.push(outcome)
                    state.open = false
                },
            })
        },
    }))
    app.mount(mountPoint)
    return state
}

function dialog() {
    return document.querySelector('[data-testid="talos-intro-modal"]') as HTMLElement | null
}

function buttonByName(name: string) {
    return [...document.querySelectorAll('button')].find((candidate) => (
        candidate.getAttribute('aria-label') === name || candidate.textContent?.trim() === name
    )) as HTMLButtonElement | undefined
}

async function settle() {
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 50))
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
}

describe('TalosIntroModal', () => {
    it('six slides advance by buttons, dots and arrow keys with accessible step X of 6 and aria-live announcements', async () => {
        mountModal()
        await settle()

        const surface = dialog()
        expect(surface).toBeTruthy()
        expect(surface?.textContent).toContain('Meet TALOS')
        expect(surface?.textContent).toContain('Step 1 of 6')

        buttonByName('Next')?.click()
        await settle()
        expect(surface?.textContent).toContain('Answers you can verify')
        expect(surface?.textContent).toContain('Step 2 of 6')

        buttonByName('Back')?.click()
        await settle()
        expect(surface?.textContent).toContain('Meet TALOS')

        surface?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
        await settle()
        expect(surface?.textContent).toContain('Step 2 of 6')
        surface?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
        await settle()
        expect(surface?.textContent).toContain('Step 1 of 6')

        const dots = [...document.querySelectorAll('[data-testid="talos-intro-dot"]')]
        expect(dots).toHaveLength(6)
        expect(dots[0].getAttribute('aria-current')).toBe('true')
        ;(dots[5] as HTMLButtonElement).click()
        await settle()
        expect(surface?.textContent).toContain('Plugged into your world')
        expect(dots[5].getAttribute('aria-current')).toBe('true')
        expect(dots[0].getAttribute('aria-current')).not.toBe('true')

        const live = document.querySelector('[aria-live="polite"][data-testid="talos-intro-live"]')
        expect(live?.textContent).toContain('Step 6 of 6')
        expect(live?.textContent).toContain('Plugged into your world')
    })

    it('skip, x, escape and final CTA each emit exactly one outcome and backdrop clicks never close', async () => {
        const skipState = mountModal()
        await settle()
        const skip = buttonByName('Skip introduction')
        expect(skip).toBeTruthy()
        skip?.click()
        skip?.click()
        await settle()
        expect(skipState.outcomes).toEqual(['skipped'])
        app?.unmount()
        document.body.replaceChildren()

        const closeState = mountModal()
        await settle()
        buttonByName('Close introduction')?.click()
        await settle()
        expect(closeState.outcomes).toEqual(['skipped'])
        app?.unmount()
        document.body.replaceChildren()

        const backdropState = mountModal()
        await settle()
        const overlay = document.querySelector('[data-testid="talos-intro-modal"]')?.parentElement?.querySelector(':scope > :first-child')
        document.querySelectorAll('[data-dismissable-layer], [data-reka-dialog-overlay], .fixed.inset-0').forEach((element) => {
            element.dispatchEvent(new Event('pointerdown', { bubbles: true }))
            element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        })
        void overlay
        await settle()
        expect(backdropState.outcomes).toEqual([])
        expect(dialog()).toBeTruthy()

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        await settle()
        expect(backdropState.outcomes).toEqual(['skipped'])
        app?.unmount()
        document.body.replaceChildren()

        const ctaState = mountModal()
        await settle()
        for (let step = 0; step < 5; step += 1) {
            buttonByName('Next')?.click()
            await settle()
        }
        const cta = buttonByName('Start your first chat')
        expect(cta).toBeTruthy()
        cta?.click()
        cta?.click()
        await settle()
        expect(ctaState.outcomes).toEqual(['completed'])
    })

    it('arrow keys do not intercept while focus is on a link and only the current slide is reachable', async () => {
        mountModal({ avmDeepDive: 'https://github.com/example/avm' })
        await settle()
        const surface = dialog()

        expect(surface?.textContent).toContain('Meet TALOS')
        expect(surface?.textContent).not.toContain('Answers you can verify')
        expect(surface?.textContent).not.toContain('Powered by AVM')

        buttonByName('Next')?.click()
        await settle()
        buttonByName('Next')?.click()
        await settle()
        expect(surface?.textContent).toContain('Powered by AVM')

        const link = surface?.querySelector('a[href="https://github.com/example/avm"]') as HTMLAnchorElement
        expect(link).toBeTruthy()
        link.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
        await settle()
        expect(surface?.textContent).toContain('Powered by AVM')
        expect(surface?.textContent).toContain('Step 3 of 6')
    })

    it('roadmap chips mark local models, Zethos, orchestration, Workspace and Supermemory; links render only when valid with safe rel', async () => {
        mountModal({ patreon: 'https://patreon.com/talos' })
        await settle()
        const surface = dialog()

        const dots = [...document.querySelectorAll('[data-testid="talos-intro-dot"]')]
        ;(dots[3] as HTMLButtonElement).click()
        await settle()
        expect(surface?.querySelectorAll('[data-testid="talos-intro-roadmap-chip"]').length).toBe(1)
        expect(surface?.textContent).toContain('On the roadmap')
        expect(surface?.textContent).toContain('Hugging Face')
        expect(surface?.textContent).toContain('Zethos')
        expect(surface?.textContent).toContain('three models in concert')

        ;(dots[2] as HTMLButtonElement).click()
        await settle()
        expect(surface?.querySelector('a')).toBeNull()

        ;(dots[5] as HTMLButtonElement).click()
        await settle()
        expect(surface?.querySelectorAll('[data-testid="talos-intro-roadmap-chip"]').length).toBe(1)
        expect(surface?.textContent).toContain('Google Workspace')
        expect(surface?.textContent).toContain('Supermemory')

        const chips = [...(surface?.querySelectorAll('.talos-chip-code') ?? [])].map((chip) => chip.textContent)
        expect(chips).toEqual(expect.arrayContaining(['RUN', 'VLT', 'MEM', 'BNC']))

        const patreon = surface?.querySelector('a[href="https://patreon.com/talos"]') as HTMLAnchorElement
        expect(patreon).toBeTruthy()
        expect(patreon.getAttribute('target')).toBe('_blank')
        expect(patreon.getAttribute('rel')).toBe('noopener noreferrer')
        expect(surface?.textContent).toContain('Ko-fi')
        expect(surface?.querySelectorAll('a').length).toBe(1)
    })

    it('reduced motion renders slides without transition frames and content scrolls inside max-height', async () => {
        const source = (await import('./TalosIntroModal.vue?raw')).default as string
        expect(source).toContain('<Transition')
        expect(source).toContain('duration-[var(--talos-motion-open-duration')
        expect(source).not.toMatch(/enter-active-class="[^"]*duration-\d/)
        expect(source).not.toMatch(/leave-active-class="[^"]*duration-\d/)

        mountModal()
        await settle()
        const surface = dialog()

        expect(surface?.querySelector('[data-testid="talos-intro-slide-host"]')).toBeTruthy()

        const scroller = surface?.querySelector('[data-testid="talos-intro-scroll"]') as HTMLElement
        expect(scroller).toBeTruthy()
        expect(scroller.className).toContain('overflow-y-auto')
        expect(scroller.className).toMatch(/max-h-/)
        expect(scroller.getAttribute('tabindex')).toBe('0')
    })
})
