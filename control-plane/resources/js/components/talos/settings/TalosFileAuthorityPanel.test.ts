// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, ref } from 'vue'
import TalosFileAuthorityPanel from './TalosFileAuthorityPanel.vue'

const holder = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }))

vi.mock('../../../composables/useTalosFileAuthority', () => ({
    useTalosFileAuthority: () => holder.current,
}))

function file(id: string, name: string) {
    return {
        id,
        original_name: name,
        mime_type: 'text/plain',
        size_bytes: 1024,
        checksum: `sha-${id}`,
        status: 'available',
        created_at: '2026-07-17T00:00:00Z',
        updated_at: '2026-07-17T00:00:00Z',
    }
}

function grant(overrides: Record<string, unknown> = {}) {
    return {
        id: 'grant-1',
        scope: 'file',
        label: 'notes.txt',
        permissions: ['model.read', 'browser.upload'],
        status: 'active',
        talos_session_id: null,
        files: [{ ...file('file-1', 'notes.txt') }],
        expires_at: null,
        revoked_at: null,
        last_used_at: null,
        created_at: '2026-07-17T00:00:00Z',
        updated_at: '2026-07-17T00:00:00Z',
        ...overrides,
    }
}

function authorityMock() {
    return {
        grants: ref([grant()]),
        availableVaultFiles: ref([file('file-1', 'notes.txt'), file('file-2', 'brief.pdf')]),
        activeGlobalGrant: ref(null),
        loadingGrants: ref(false),
        loadingVaultFiles: ref(false),
        mutating: ref(false),
        authorityError: ref(null),
        folderPermissionByGrant: ref<Record<string, string>>({}),
        folderPickerSupported: ref(true),
        lastFolderImport: ref(null),
        loadGrants: vi.fn(async () => undefined),
        loadVaultFiles: vi.fn(async () => undefined),
        createGrant: vi.fn(async () => grant()),
        revokeGrant: vi.fn(async () => undefined),
        pickFolder: vi.fn(async () => undefined),
        importFolderFiles: vi.fn(async () => undefined),
        reauthorizeFolder: vi.fn(async () => 'granted'),
        setGlobalAccess: vi.fn(async () => undefined),
    }
}

let app: ReturnType<typeof createApp> | null = null

async function mountPanel(activeTalosSessionId: string | null = 'session-1') {
    const portal = document.createElement('div')
    portal.id = 'talos-portal-root'
    const root = document.createElement('div')
    document.body.append(portal, root)
    app = createApp(TalosFileAuthorityPanel, { activeTalosSessionId })
    app.mount(root)
    await nextTick()
    return root
}

beforeEach(() => {
    holder.current = authorityMock()
})

afterEach(() => {
    app?.unmount()
    app = null
    document.body.replaceChildren()
})

describe('TalosFileAuthorityPanel', () => {
    it('loads real grants and exposes per-file, folder, session and global authority controls', async () => {
        const root = await mountPanel()
        const authority = holder.current as ReturnType<typeof authorityMock>

        expect(authority.loadGrants).toHaveBeenCalledWith('session-1')
        expect(authority.loadVaultFiles).toHaveBeenCalledOnce()
        expect(root.textContent).toContain('File authority')
        expect(root.textContent).toContain('notes.txt')
        expect(root.textContent).toContain('\u00b7 1 file')
        expect(root.textContent).not.toContain('\u00c2')
        expect(root.querySelector('[data-testid="file-authority-scope-file"]')).not.toBeNull()
        expect(root.querySelector('[data-testid="file-authority-scope-session"]')).not.toBeNull()
        expect(root.querySelector('[data-testid="file-authority-pick-folder"]')).not.toBeNull()
        expect(root.querySelector('[data-testid="file-authority-enable-global"]')).not.toBeNull()
    })

    it('creates a session-bound grant from selected Vault files', async () => {
        const root = await mountPanel('session-1')
        const authority = holder.current as ReturnType<typeof authorityMock>

        root.querySelector<HTMLButtonElement>('[data-testid="file-authority-scope-session"]')?.click()
        await nextTick()
        root.querySelector<HTMLInputElement>('[data-testid="file-authority-file-file-1"]')?.click()
        root.querySelector<HTMLInputElement>('[data-testid="file-authority-file-file-2"]')?.click()
        await nextTick()
        root.querySelector<HTMLButtonElement>('[data-testid="file-authority-create"]')?.click()
        await nextTick()

        expect(authority.createGrant).toHaveBeenCalledWith({
            scope: 'session',
            permissions: ['model.read', 'browser.upload'],
            file_ids: ['file-1', 'file-2'],
            session_id: 'session-1',
            label: 'Current chat files',
        })
    })

    it('requires an explicit shadcn alert confirmation before global access is enabled', async () => {
        const root = await mountPanel()
        const authority = holder.current as ReturnType<typeof authorityMock>

        root.querySelector<HTMLButtonElement>('[data-testid="file-authority-enable-global"]')?.click()
        await nextTick()
        expect(document.body.textContent).toContain('present and future Vault files')
        document.body.querySelector<HTMLButtonElement>('[data-testid="file-authority-confirm-global"]')?.click()
        await nextTick()

        expect(authority.setGlobalAccess).toHaveBeenCalledWith(true, ['model.read', 'browser.upload'])
    })

    it('imports the directory-input fallback and confirms revocation before the grant is changed', async () => {
        const root = await mountPanel()
        const authority = holder.current as ReturnType<typeof authorityMock>
        const fallbackInput = root.querySelector<HTMLInputElement>('[data-testid="file-authority-folder-fallback"]')
        const selected = new File(['fallback'], 'fallback.txt', { type: 'text/plain' })
        Object.defineProperty(fallbackInput, 'files', { configurable: true, value: [selected] })
        fallbackInput?.dispatchEvent(new Event('change', { bubbles: true }))
        await nextTick()
        expect(authority.importFolderFiles).toHaveBeenCalledWith([selected], ['model.read', 'browser.upload'], 'Imported folder')

        root.querySelector<HTMLButtonElement>('[data-testid="file-authority-revoke-grant-1"]')?.click()
        await nextTick()
        expect(authority.revokeGrant).not.toHaveBeenCalled()
        document.body.querySelector<HTMLButtonElement>('[data-testid="file-authority-confirm-revoke"]')?.click()
        await nextTick()
        expect(authority.revokeGrant).toHaveBeenCalledWith('grant-1')
    })

    it('disables session authority when no persistent chat is active', async () => {
        const root = await mountPanel(null)
        const sessionButton = root.querySelector<HTMLButtonElement>('[data-testid="file-authority-scope-session"]')

        expect(sessionButton?.disabled).toBe(true)
        expect(root.textContent).toContain('Open a persistent chat')
    })
})
