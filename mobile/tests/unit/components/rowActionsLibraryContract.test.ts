// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { Download, Trash2 } from '@lucide/vue'
import TalosRowActions from '@/components/talos/ui/TalosRowActions.vue'

function mountMenu() {
    return mount(TalosRowActions, {
        props: {
            label: 'Actions for budget.pdf',
            testId: 'file-actions',
            items: [
                {
                    id: 'save',
                    label: 'Save to phone',
                    ariaLabel: 'Save budget.pdf to device',
                    icon: Download,
                    testId: 'save-action',
                },
                {
                    id: 'shared',
                    label: 'Any chat may read it',
                    ariaLabel: 'Let the model read budget.pdf',
                    icon: Download,
                    checked: true,
                    testId: 'share-action',
                },
                {
                    id: 'delete',
                    label: 'Delete file',
                    ariaLabel: 'Delete budget.pdf',
                    icon: Trash2,
                    danger: true,
                    disabled: true,
                    testId: 'delete-action',
                },
            ],
        },
        attachTo: document.body,
    })
}

function bodyElement(selector: string): HTMLElement {
    const element = document.body.querySelector(selector)
    expect(element).not.toBeNull()
    return element as HTMLElement
}

afterEach(() => { document.body.innerHTML = '' })

describe('TalosRowActions', () => {
    it('LIB-MENU-01 exposes a 48px Reka menu button and opens the menu', async () => {
        const wrapper = mountMenu()
        const trigger = wrapper.get('[data-testid="file-actions"]')

        expect(trigger.attributes('aria-label')).toBe('Actions for budget.pdf')
        expect(trigger.attributes('aria-haspopup')).toBe('menu')
        expect(trigger.classes()).toContain('size-12')
        expect(trigger.attributes('aria-expanded')).toBe('false')

        await trigger.trigger('click')
        await flushPromises()

        expect(trigger.attributes('aria-expanded')).toBe('true')
        expect(bodyElement('[data-testid="talos-row-actions-menu"]').getAttribute('role')).toBe('menu')
    })

    it('LIB-MENU-02 emits a stable id when an ordinary item is selected', async () => {
        const wrapper = mountMenu()
        await wrapper.get('[data-testid="file-actions"]').trigger('click')
        bodyElement('[data-testid="save-action"]').click()
        await flushPromises()

        // Il menu condiviso NON aggiunge un secondo argomento alle voci
        // normali: sarebbe una firma diversa per tutti quelli che non hanno
        // voci a due stati.
        expect(wrapper.emitted('select')).toEqual([['save']])
    })

    it('LIB-MENU-03 exposes controlled checkbox truth and emits the requested boolean', async () => {
        const wrapper = mountMenu()
        await wrapper.get('[data-testid="file-actions"]').trigger('click')
        const item = bodyElement('[data-testid="share-action"]')

        expect(item.getAttribute('role')).toBe('menuitemcheckbox')
        expect(item.getAttribute('aria-checked')).toBe('true')
        item.click()
        await flushPromises()

        expect(wrapper.emitted('select')).toEqual([['shared', false]])
    })

    it('LIB-MENU-04 preserves disabled and destructive action states on 48px rows', async () => {
        const wrapper = mountMenu()
        await wrapper.get('[data-testid="file-actions"]').trigger('click')
        const item = bodyElement('[data-testid="delete-action"]')

        // Un `<button>` disabilitato lo e' davvero, non lo dichiara soltanto:
        // il click non parte, che e' l'unica cosa che conta.
        expect((item as HTMLButtonElement).disabled).toBe(true)
        expect(item.classList).toContain('min-h-12')
        expect(item.className).toContain('talos-danger')
        item.click()
        await flushPromises()
        expect(wrapper.emitted('select')).toBeUndefined()
    })
})
