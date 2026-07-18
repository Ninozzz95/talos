// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, ref } from 'vue'
import EmptyState from './EmptyState.vue'

const apps: Array<ReturnType<typeof createApp>> = []

afterEach(() => {
    apps.splice(0).forEach((app) => app.unmount())
    document.body.replaceChildren()
})

describe('EmptyState', () => {
    it('renders title, invitation and a single action that emits', () => {
        const actions = ref(0)
        const container = document.createElement('div')
        document.body.append(container)
        const app = createApp(defineComponent({
            setup() {
                return () => h(EmptyState, {
                    title: 'No chats yet',
                    description: 'Start a conversation to see it here.',
                    actionLabel: 'Start a chat',
                    onAction: () => { actions.value += 1 },
                }, {
                    icon: () => h('svg', { 'data-testid': 'empty-icon' }),
                })
            },
        }))
        apps.push(app)
        app.mount(container)

        expect(container.textContent).toContain('No chats yet')
        expect(container.textContent).toContain('Start a conversation to see it here.')
        expect(container.querySelector('[data-testid="empty-icon"]')).not.toBeNull()

        const buttons = container.querySelectorAll('button')
        expect(buttons.length).toBe(1)
        buttons[0].click()
        expect(actions.value).toBe(1)
    })

    it('renders no action button without an action label', () => {
        const container = document.createElement('div')
        document.body.append(container)
        const app = createApp(defineComponent({
            setup() {
                return () => h(EmptyState, { title: 'Nothing here' })
            },
        }))
        apps.push(app)
        app.mount(container)

        expect(container.querySelector('button')).toBeNull()
    })
})
