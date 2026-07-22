// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import TalosSettingsBrowserPanel from './TalosSettingsBrowserPanel.vue'

vi.mock('../../../composables/useTalosFileAuthority', async () => {
    const { computed, ref } = await import('vue')
    return {
        useTalosFileAuthority: () => ({
            grants: ref([]),
            availableVaultFiles: ref([]),
            activeGlobalGrant: computed(() => null),
            loadingGrants: ref(false),
            loadingVaultFiles: ref(false),
            mutating: ref(false),
            authorityError: ref(null),
            folderPermissionByGrant: ref({}),
            folderPickerSupported: ref(false),
            lastFolderImport: ref(null),
            loadGrants: vi.fn(async () => undefined),
            loadVaultFiles: vi.fn(async () => undefined),
            createGrant: vi.fn(async () => undefined),
            revokeGrant: vi.fn(async () => undefined),
            pickFolder: vi.fn(async () => undefined),
            importFolderFiles: vi.fn(async () => undefined),
            reauthorizeFolder: vi.fn(async () => 'unavailable'),
            setGlobalAccess: vi.fn(async () => undefined),
        }),
    }
})

// reka Select (themed dropdown) needs these APIs jsdom omits.
if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined
}
if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false
    Element.prototype.setPointerCapture = () => undefined
    Element.prototype.releasePointerCapture = () => undefined
}

async function settle() {
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
}

function firePointer(element: Element, type: 'pointerdown' | 'pointerup') {
    const Ctor = typeof PointerEvent === 'function' ? PointerEvent : MouseEvent
    element.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true, button: 0 }))
}

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
            activeTalosSessionId: 'session-1',
            'onUpdate:modelValue': (value: string) => updates.push(value),
        })
        app.mount(root)
        await nextTick()

        const trigger = root.querySelector<HTMLElement>('[aria-label="Browser interaction policy"]')
        expect(trigger?.tagName).toBe('BUTTON')
        expect(root.textContent).toContain('Effective: Confirm every interaction')
        expect(root.textContent).toContain('Workspace minimum')
        expect(root.textContent).toContain('File authority')

        if (trigger) firePointer(trigger, 'pointerdown')
        await settle()

        expect(document.querySelector('[data-value="confirm_sensitive"]')?.hasAttribute('data-disabled')).toBe(true)
        expect(document.querySelector('[data-value="confirm_every_interaction"]')?.hasAttribute('data-disabled')).toBe(false)
        expect(document.querySelector('[data-value="read_only"]')?.hasAttribute('data-disabled')).toBe(false)

        const readOnly = document.querySelector<HTMLElement>('[data-value="read_only"]')
        readOnly?.focus()
        readOnly?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
        await settle()

        expect(updates).toEqual(['read_only'])
    })
})
