// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import TalosGuideInfoButton from './TalosGuideInfoButton.vue'

const apps: Array<ReturnType<typeof createApp>> = []

afterEach(() => {
    apps.splice(0).forEach((app) => app.unmount())
    document.body.replaceChildren()
})

function mountGuideButton(guideId: string) {
    let parentClicks = 0
    const shell = document.createElement('div')
    shell.className = 'talos-shell'
    const portalRoot = document.createElement('div')
    portalRoot.id = 'talos-portal-root'
    const mountPoint = document.createElement('div')
    shell.append(portalRoot, mountPoint)
    document.body.append(shell)

    const app = createApp(defineComponent({
        setup() {
            return () => h('div', { onClick: () => { parentClicks += 1 } }, [
                h(TalosGuideInfoButton, { guideId }),
            ])
        },
    }))

    apps.push(app)
    app.mount(mountPoint)

    return {
        portalRoot,
        button: mountPoint.querySelector<HTMLButtonElement>('button'),
        parentClicks: () => parentClicks,
    }
}

async function flushDismissableLayer() {
    await nextTick()
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    await nextTick()
}

describe('TalosGuideInfoButton', () => {
    it('opens canonical content in the TALOS portal without activating its parent', async () => {
        const mounted = mountGuideButton('rail.runtime')
        expect(mounted.button?.getAttribute('aria-label')).toBe('Information about Cockpit')

        mounted.button?.click()
        await nextTick()
        await nextTick()

        expect(mounted.parentClicks()).toBe(0)
        expect(mounted.portalRoot.textContent).toContain('Inspect persisted runs, events and execution evidence.')
        expect(mounted.portalRoot.textContent).toContain('Use Cockpit to review node state')
    })

    it('closes on Escape and restores focus to the information trigger', async () => {
        const mounted = mountGuideButton('rail.runtime')
        mounted.button?.focus()
        mounted.button?.click()
        await flushDismissableLayer()

        expect(mounted.portalRoot.querySelector('[data-state="open"]')).not.toBeNull()
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        await flushDismissableLayer()

        expect(mounted.portalRoot.textContent).not.toContain('Inspect persisted runs, events and execution evidence.')
        expect(document.activeElement).toBe(mounted.button)
    })

    it('fails closed when the canonical entry is missing', () => {
        const mounted = mountGuideButton('missing.surface')

        expect(mounted.button?.disabled).toBe(true)
        expect(mounted.button?.getAttribute('aria-label')).toBe('Information unavailable')
        expect(mounted.button?.getAttribute('data-guide-available')).toBe('false')
    })
})
