// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, nextTick } from 'vue'
import TalosSettingsBrowserPanel from './TalosSettingsBrowserPanel.vue'

let app: ReturnType<typeof createApp> | null = null

afterEach(() => {
    app?.unmount()
    app = null
    document.body.replaceChildren()
})

describe('TalosSettingsBrowserPanel', () => {
    it('shows the effective workspace policy and disables weaker choices', async () => {
        const updates: string[] = []
        const root = document.createElement('div')
        document.body.append(root)
        app = createApp(TalosSettingsBrowserPanel, {
            modelValue: 'confirm_sensitive',
            policy: {
                user_mode: 'confirm_sensitive',
                workspace_minimum_mode: 'confirm_every_interaction',
                effective_mode: 'confirm_every_interaction',
                preference_constrained: true,
            },
            'onUpdate:modelValue': (value: string) => updates.push(value),
        })
        app.mount(root)
        await nextTick()

        const select = root.querySelector<HTMLSelectElement>('[aria-label="Browser interaction policy"]')
        expect(select).not.toBeNull()
        expect(root.textContent).toContain('Effective: Confirm every interaction')
        expect(root.textContent).toContain('Workspace minimum')
        expect(select?.querySelector<HTMLOptionElement>('option[value="confirm_sensitive"]')?.disabled).toBe(true)
        expect(select?.querySelector<HTMLOptionElement>('option[value="confirm_every_interaction"]')?.disabled).toBe(false)
        expect(select?.querySelector<HTMLOptionElement>('option[value="read_only"]')?.disabled).toBe(false)

        if (select) {
            select.value = 'read_only'
            select.dispatchEvent(new Event('change', { bubbles: true }))
            await nextTick()
        }
        expect(updates).toEqual(['read_only'])
    })
})

