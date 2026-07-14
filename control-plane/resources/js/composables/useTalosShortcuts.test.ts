// @vitest-environment jsdom

import { computed, createApp, defineComponent, h } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultTalosShortcuts } from '../lib/talosShortcuts'
import { useTalosShortcuts } from './useTalosShortcuts'

let app: ReturnType<typeof createApp> | null = null

function mountShortcuts(cancelClose: (event: KeyboardEvent) => void) {
    const mountPoint = document.createElement('div')
    document.body.append(mountPoint)

    app = createApp(defineComponent({
        setup() {
            useTalosShortcuts(computed(defaultTalosShortcuts), {
                cancel_close: cancelClose,
            })

            return () => h('div')
        },
    }))
    app.mount(mountPoint)
}

afterEach(() => {
    app?.unmount()
    app = null
    document.body.replaceChildren()
})

describe('useTalosShortcuts', () => {
    it('leaves Escape to the active upstream dismissable layer', () => {
        const cancelClose = vi.fn()
        mountShortcuts(cancelClose)
        const dialog = document.createElement('div')
        dialog.dataset.dismissableLayer = ''
        dialog.dataset.state = 'open'
        const focusedControl = document.createElement('button')
        dialog.append(focusedControl)
        document.body.append(dialog)
        focusedControl.focus()

        const event = new KeyboardEvent('keydown', {
            key: 'Escape',
            bubbles: true,
            cancelable: true,
        })
        focusedControl.dispatchEvent(event)

        expect(cancelClose).not.toHaveBeenCalled()
        expect(event.defaultPrevented).toBe(false)
    })
})
