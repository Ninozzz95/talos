// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosMobileComposerSheet from '@/components/chat/TalosMobileComposerSheet.vue'

// SF-7 (F5) — the sheets claim aria-modal: the background must really be
// inert while one is open, and focus must return to the opener on close.
function withAppRoot(): HTMLElement {
    const app = document.createElement('div')
    app.id = 'app'
    const opener = document.createElement('button')
    opener.id = 'opener'
    app.append(opener)
    document.body.append(app)
    opener.focus()
    return app
}

afterEach(() => { document.body.innerHTML = '' })

describe('TalosMobileComposerSheet modality (SF-7)', () => {
    it('marks the app root inert while open and releases it on close', async () => {
        const app = withAppRoot()
        const wrapper = mount(TalosMobileComposerSheet, {
            attachTo: document.body,
            props: { title: 'Test sheet', testid: 'test-sheet' },
        })
        expect(app.hasAttribute('inert')).toBe(true)
        wrapper.unmount()
        expect(app.hasAttribute('inert')).toBe(false)
    })

    it('restores focus to the element that opened it', async () => {
        withAppRoot()
        const opener = document.getElementById('opener')!
        expect(document.activeElement).toBe(opener)
        const wrapper = mount(TalosMobileComposerSheet, {
            attachTo: document.body,
            props: { title: 'Test sheet', testid: 'test-sheet' },
        })
        expect(document.activeElement).not.toBe(opener)
        wrapper.unmount()
        expect(document.activeElement).toBe(opener)
    })

    it('wraps Tab focus inside the sheet', async () => {
        withAppRoot()
        const wrapper = mount(TalosMobileComposerSheet, {
            attachTo: document.body,
            props: { title: 'Test sheet', testid: 'test-sheet' },
            slots: { default: '<button id="inner-a">A</button><button id="inner-b">B</button>' },
        })
        const sheet = document.querySelector('[data-testid="test-sheet"]') as HTMLElement
        const last = document.getElementById('inner-b')!
        last.focus()
        sheet.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
        // Wrap-around: from the LAST focusable, Tab returns to the first
        // (the Close button in the header).
        expect((document.activeElement as HTMLElement).getAttribute('aria-label')).toBe('Close')
        wrapper.unmount()
    })
})
