// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import TalosWindowSnapPreview from './TalosWindowSnapPreview.vue'

afterEach(() => document.body.replaceChildren())

describe('TalosWindowSnapPreview', () => {
    it('renders one pointer-transparent semantic ghost and clears it for none', async () => {
        const target = ref<'none' | 'left-half'>('left-half')
        const root = document.createElement('div')
        document.body.append(root)
        const app = createApp(defineComponent({
            setup: () => () => h(TalosWindowSnapPreview, {
                target: target.value,
                bounds: target.value === 'none' ? null : { x: 0, y: 56, width: 600, height: 664 },
            }),
        }))
        app.mount(root)

        const preview = root.querySelector<HTMLElement>('[data-testid="talos-window-snap-preview"]')
        expect(preview).not.toBeNull()
        expect(preview?.getAttribute('aria-hidden')).toBe('true')
        expect(preview?.dataset.snapTarget).toBe('left-half')
        expect(preview?.className).toContain('pointer-events-none')
        expect(preview?.style.getPropertyValue('--talos-snap-preview-width')).toBe('600px')

        target.value = 'none'
        await nextTick()
        expect(root.querySelector('[data-testid="talos-window-snap-preview"]')).toBeNull()
        app.unmount()
    })
})
