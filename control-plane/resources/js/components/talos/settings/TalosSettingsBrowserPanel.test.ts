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

        const select = root.querySelector<HTMLSelectElement>('[aria-label="Browser interaction policy"]')
        expect(select).not.toBeNull()
        expect(root.textContent).toContain('Effective: Confirm every interaction')
        expect(root.textContent).toContain('Workspace minimum')
        expect(root.textContent).toContain('File authority')
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
