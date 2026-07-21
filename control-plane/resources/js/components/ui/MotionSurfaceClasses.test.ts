// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h } from 'vue'
import Switch from './Switch.vue'
import TalosSonnerToastContent from './sonner/TalosSonnerToastContent.vue'

const mounted: Array<ReturnType<typeof createApp>> = []

afterEach(() => {
    mounted.splice(0).forEach((app) => app.unmount())
    document.body.replaceChildren()
})

function mount(render: () => ReturnType<typeof h>) {
    const container = document.createElement('div')
    document.body.append(container)
    const app = createApp(defineComponent({ setup: () => render }))
    mounted.push(app)
    app.mount(container)
    return container
}

describe('owned motion surface classes', () => {
    it('keeps Switch motion transform-only', () => {
        const container = mount(() => h(Switch, { 'aria-label': 'Motion switch' }))
        const control = container.getElementsByClassName('talos-motion-control')[0] as HTMLElement

        expect(control).toBeTruthy()
        expect(control.classList.contains('transition')).toBe(false)
        expect(control.className).toContain('before:transition-transform')
    })

    it('maps toast tone to a semantic motion intent', () => {
        const container = mount(() => h(TalosSonnerToastContent, { message: 'Failed', tone: 'error' }))
        const toast = container.querySelector('[data-motion-intent]')

        expect(toast?.classList.contains('talos-motion-feedback')).toBe(true)
        expect(toast?.getAttribute('data-motion-intent')).toBe('error-attention')
        expect(toast?.getAttribute('role')).toBe('alert')
        expect(toast?.getAttribute('aria-atomic')).toBe('true')
    })

    it('marks delete and export dialogs as semantic surfaces', () => {
        const deleteDialog = readFileSync(join(process.cwd(), 'resources/js/components/talos/chat/TalosDeleteSessionDialog.vue'), 'utf8')
        const exportDialog = readFileSync(join(process.cwd(), 'resources/js/components/talos/chat/TalosExportDialog.vue'), 'utf8')

        for (const source of [deleteDialog, exportDialog]) {
            expect(source).toContain('talos-action-surface')
            expect(source).toContain('data-motion-intent="surface-enter"')
        }
    })
})
