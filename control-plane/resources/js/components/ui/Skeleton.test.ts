// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h } from 'vue'
import Skeleton from './Skeleton.vue'

const apps: Array<ReturnType<typeof createApp>> = []

afterEach(() => {
    apps.splice(0).forEach((app) => app.unmount())
    document.body.replaceChildren()
})

function mountSkeleton(props: Record<string, unknown> = {}) {
    const container = document.createElement('div')
    document.body.append(container)
    const app = createApp(defineComponent({
        setup() {
            return () => h(Skeleton, props)
        },
    }))
    apps.push(app)
    app.mount(container)
    return container
}

describe('Skeleton', () => {
    it('presets render aria-hidden placeholders and no animation class under motion-disable', () => {
        const container = mountSkeleton({ preset: 'list', count: 4 })

        const root = container.querySelector('.talos-skeleton')
        expect(root?.getAttribute('aria-hidden')).toBe('true')

        const blocks = container.querySelectorAll('.talos-skeleton-block')
        expect(blocks.length).toBe(4)

        for (const block of blocks) {
            expect(block.classList.contains('talos-motion-loader')).toBe(true)
        }
    })

    it('defaults to three line placeholders', () => {
        const container = mountSkeleton()
        expect(container.querySelectorAll('.talos-skeleton-block').length).toBe(3)
        expect(container.querySelector('.talos-skeleton')?.getAttribute('data-preset')).toBe('line')
    })

    it('card and grid presets mark their layout for styling', () => {
        const card = mountSkeleton({ preset: 'card', count: 2 })
        expect(card.querySelector('.talos-skeleton')?.getAttribute('data-preset')).toBe('card')

        const grid = mountSkeleton({ preset: 'grid', count: 6 })
        expect(grid.querySelector('.talos-skeleton')?.getAttribute('data-preset')).toBe('grid')
        expect(grid.querySelectorAll('.talos-skeleton-block').length).toBe(6)
    })
})
