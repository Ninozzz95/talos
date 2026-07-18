// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import DropdownMenu from './DropdownMenu.vue'
import DropdownMenuContent from './DropdownMenuContent.vue'
import DropdownMenuItem from './DropdownMenuItem.vue'
import DropdownMenuLabel from './DropdownMenuLabel.vue'
import DropdownMenuSeparator from './DropdownMenuSeparator.vue'
import DropdownMenuTrigger from './DropdownMenuTrigger.vue'

const apps: Array<ReturnType<typeof createApp>> = []

afterEach(() => {
    apps.splice(0).forEach((app) => app.unmount())
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

function mountMenu() {
    const selected = ref('')
    const shell = document.createElement('div')
    const portalRoot = document.createElement('div')
    portalRoot.id = 'talos-portal-root'
    const mountPoint = document.createElement('div')
    shell.append(portalRoot, mountPoint)
    document.body.append(shell)

    const app = createApp(defineComponent({
        setup() {
            return () => h(DropdownMenu, {}, {
                default: () => [
                    h(DropdownMenuTrigger, { 'as-child': true }, {
                        default: () => h('button', { type: 'button' }, 'Chat actions'),
                    }),
                    h(DropdownMenuContent, { to: '#talos-portal-root' }, {
                        default: () => [
                            h(DropdownMenuLabel, {}, { default: () => 'Chat' }),
                            h(DropdownMenuItem, {
                                onSelect: () => { selected.value = 'rename' },
                            }, { default: () => 'Rename' }),
                            h(DropdownMenuSeparator),
                            h(DropdownMenuItem, {
                                onSelect: () => { selected.value = 'delete' },
                            }, { default: () => 'Delete' }),
                        ],
                    }),
                ],
            })
        },
    }))
    apps.push(app)
    app.mount(mountPoint)

    return {
        selected,
        trigger: mountPoint.querySelector('button') as HTMLButtonElement,
    }
}

describe('DropdownMenu', () => {
    it('trigger opens content, items receive roving focus, escape closes and restores trigger focus', async () => {
        const { trigger } = mountMenu()
        expect(trigger.textContent).toBe('Chat actions')
        expect(document.querySelector('[role="menu"]')).toBeNull()

        trigger.focus()
        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
        await settle()

        const menu = document.querySelector('[role="menu"]')
        expect(menu).not.toBeNull()

        const items = document.querySelectorAll('[role="menuitem"]')
        expect(items.length).toBe(2)
        expect(Array.from(items).map((item) => item.textContent)).toEqual(['Rename', 'Delete'])

        const active = document.activeElement as HTMLElement
        expect(active?.getAttribute('role')).toBe('menuitem')

        active.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        await settle()

        expect(document.querySelector('[role="menu"]')).toBeNull()
        expect(document.activeElement).toBe(trigger)
    })

    it('selecting an item emits select and closes the menu', async () => {
        const { trigger, selected } = mountMenu()

        trigger.focus()
        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
        await settle()

        const items = document.querySelectorAll<HTMLElement>('[role="menuitem"]')
        items[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        await settle()

        expect(selected.value).toBe('rename')
        expect(document.querySelector('[role="menu"]')).toBeNull()
    })
})
