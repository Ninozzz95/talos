// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import Tooltip from './Tooltip.vue'

const apps: Array<ReturnType<typeof createApp>> = []

afterEach(() => {
    apps.splice(0).forEach((app) => app.unmount())
    document.body.replaceChildren()
})

async function flushTooltipDelay() {
    await nextTick()
    await new Promise<void>((resolve) => window.setTimeout(resolve, 300))
    await nextTick()
}

describe('Tooltip', () => {
    it('keeps closed content out of the trigger layout and portals it on keyboard focus', async () => {
        const shell = document.createElement('div')
        const portalRoot = document.createElement('div')
        portalRoot.id = 'talos-portal-root'
        const mountPoint = document.createElement('div')
        shell.append(portalRoot, mountPoint)
        document.body.append(shell)

        const app = createApp(defineComponent({
            setup() {
                return () => h(Tooltip, { content: 'Open contextual controls', align: 'end' }, {
                    default: () => h('button', 'Controls'),
                })
            },
        }))
        apps.push(app)
        app.mount(mountPoint)

        const trigger = mountPoint.querySelector<HTMLButtonElement>('button')
        expect(trigger?.getAttribute('aria-describedby')).toBeNull()
        expect(mountPoint.querySelector('[role="tooltip"]')).toBeNull()

        trigger?.focus()
        await flushTooltipDelay()

        const content = portalRoot.querySelector<HTMLElement>('[role="tooltip"]')
        const visualContent = portalRoot.querySelector<HTMLElement>('.shadow-md')
        expect(content?.textContent).toContain('Open contextual controls')
        expect(trigger?.getAttribute('aria-describedby')).toBe(content?.id)
        expect(visualContent?.className).toContain('bg-neutral-950')
        expect(visualContent?.className).toContain('text-neutral-50')
        expect(visualContent?.className).toContain('border-neutral-700')
        expect(visualContent?.className).not.toContain('data-[state=closed]:animate-out')
    })
})
