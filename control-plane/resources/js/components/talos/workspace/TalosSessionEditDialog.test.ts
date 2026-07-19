// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref as vueRef } from 'vue'
import type { TalosSession } from '../../../lib/talosTypes'
import TalosSessionEditDialog from './TalosSessionEditDialog.vue'

const apps: Array<ReturnType<typeof createApp>> = []

afterEach(() => {
    apps.splice(0).forEach((app) => app.unmount())
    document.body.replaceChildren()
})

const session: TalosSession = {
    id: 'session-1',
    title: 'Weekly audit',
    persistence_mode: 'persistent',
    created_at: '2026-07-10T10:00:00Z',
    updated_at: '2026-07-10T10:00:00Z',
} as TalosSession

function mountDialog(mode: 'rename' | 'move') {
    const portalRoot = document.createElement('div')
    portalRoot.id = 'talos-portal-root'
    document.body.append(portalRoot)

    const open = vueRef(true)
    const submitted: string[] = []
    const container = document.createElement('div')
    document.body.append(container)

    const app = createApp(defineComponent({
        setup() {
            return () => h(TalosSessionEditDialog, {
                open: open.value,
                'onUpdate:open': (value: boolean) => { open.value = value },
                mode,
                session,
                onSubmit: (value: string) => submitted.push(value),
            })
        },
    }))
    apps.push(app)
    app.mount(container)

    return { open, submitted }
}

describe('TalosSessionEditDialog', () => {
    it('rename mode submits the trimmed title and closes; move mode submits the folder', async () => {
        const rename = mountDialog('rename')
        await nextTick()

        const input = document.querySelector<HTMLInputElement>('#talos-session-edit-value')
        expect(input).not.toBeNull()
        expect(input!.value).toBe('Weekly audit')

        input!.value = '  Renamed audit  '
        input!.dispatchEvent(new Event('input', { bubbles: true }))
        await nextTick()

        const form = document.querySelector('form#talos-session-edit-form')
        form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
        await nextTick()

        expect(rename.submitted).toEqual(['Renamed audit'])
        expect(rename.open.value).toBe(false)

        apps.splice(0).forEach((app) => app.unmount())
        document.body.replaceChildren()

        const move = mountDialog('move')
        await nextTick()
        const moveInput = document.querySelector<HTMLInputElement>('#talos-session-edit-value')
        expect(document.body.textContent).toContain('Move to folder')
        moveInput!.value = 'Audits'
        moveInput!.dispatchEvent(new Event('input', { bubbles: true }))
        await nextTick()
        document.querySelector('form#talos-session-edit-form')
            ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
        await nextTick()

        expect(move.submitted).toEqual(['Audits'])
        expect(move.open.value).toBe(false)
    })

    it('renders an accessible title per mode and cancel closes without submitting', async () => {
        const { open, submitted } = mountDialog('rename')
        await nextTick()

        expect(document.body.textContent).toContain('Rename chat')

        const cancel = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
            .find((button) => button.textContent?.trim() === 'Cancel')
        expect(cancel).toBeTruthy()
        cancel!.click()
        await nextTick()

        expect(open.value).toBe(false)
        expect(submitted).toEqual([])
    })
})
