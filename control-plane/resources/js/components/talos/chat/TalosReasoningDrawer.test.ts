// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import TalosReasoningDrawer from './TalosReasoningDrawer.vue'

const apps: Array<ReturnType<typeof createApp>> = []

afterEach(() => {
    apps.splice(0).forEach((app) => app.unmount())
    document.body.replaceChildren()
})

async function settle() {
    for (let index = 0; index < 3; index += 1) {
        await nextTick()
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    }
}

describe('TalosReasoningDrawer', () => {
    it('uses an accessible modal, renders plain text and restores focus on close', async () => {
        const portal = document.createElement('div')
        portal.id = 'talos-portal-root'
        document.body.append(portal)
        const opener = document.createElement('button')
        opener.textContent = 'Reasoning opener'
        document.body.append(opener)
        opener.focus()
        const open = ref(true)
        const container = document.createElement('div')
        document.body.append(container)
        const app = createApp(defineComponent({
            setup() {
                return () => h(TalosReasoningDrawer, {
                    open: open.value,
                    reasoning: {
                        source: 'provider',
                        provider: 'anthropic',
                        text: '<script>unsafe()</script>\nCompared two sources.',
                        duration_ms: null,
                    },
                    'onUpdate:open': (value: boolean) => { open.value = value },
                })
            },
        }))
        apps.push(app)
        app.mount(container)
        await settle()

        const dialog = document.querySelector<HTMLElement>('#talos-portal-root [role="dialog"]')
        expect(dialog?.getAttribute('aria-modal')).toBe('true')
        expect(dialog?.textContent).toContain('Reasoning')
        expect(dialog?.textContent).toContain('<script>unsafe()</script>')
        expect(dialog?.querySelector('script')).toBeNull()

        const close = dialog?.querySelector<HTMLButtonElement>('button')
        close?.click()
        await settle()

        expect(open.value).toBe(false)
        expect(document.activeElement).toBe(opener)
    })
})
