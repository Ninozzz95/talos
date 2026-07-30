// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'

const mockState = vi.hoisted(() => ({ controller: null as unknown }))
vi.mock('@/stores/chatController', () => ({ useChatController: () => mockState.controller }))

const browserMock = vi.hoisted(() => ({ open: vi.fn().mockResolvedValue(true) }))
vi.mock('@/services/inAppBrowserService', () => ({ openTalosLinkOnce: browserMock.open }))

const deviceSave = vi.hoisted(() => ({
    saveTalosVaultFileToDevice: vi.fn(),
}))
vi.mock('@/services/saveVaultFileToDevice', () => deviceSave)

import ContextScreen from '@/screens/ContextScreen.vue'
import { __resetToastsForTests, useTalosMobileToasts } from '@/stores/toasts'
import { __resetSettingsStoreForTests, useSettingsStore } from '@/stores/settings'

function file(id: string, status: 'available' | 'failed' = 'available') {
    const isImage = id === 'vault-image'
    return {
        id,
        display_name: id === 'vault-ready' ? 'architecture.pdf' : isImage ? 'diagram.png' : 'spoofed.bin',
        media_type: id === 'vault-ready' ? 'application/pdf' : isImage ? 'image/png' : 'application/octet-stream',
        size_bytes: 4096,
        private_uri: 'talos-vault/files/' + id,
        status,
        trust: 'untrusted',
        sha256: status === 'available' ? 'a'.repeat(64) : null,
        extracted_text: status === 'available' ? 'architecture notes' : null,
        failure_code: status === 'failed' ? 'TALOS_ATTACHMENT_SIGNATURE_MISMATCH' : null,
        metadata: id === 'vault-image' ? { origin: 'generated' } : {},
        created_at: '2026-07-22T10:00:00.000Z',
        updated_at: '2026-07-22T10:00:00.000Z',
    }
}

function makeController() {
    const vaultFiles = reactive([file('vault-ready'), file('vault-image')])
    const attachments = {
        items: reactive<Array<Record<string, unknown>>>([]),
        vaultFiles,
        selecting: ref(false),
        vaultLoading: ref(false),
        vaultError: ref(null),
        refreshVault: vi.fn().mockResolvedValue(undefined),
        selectFiles: vi.fn().mockResolvedValue(undefined),
        previewUrl: vi.fn().mockResolvedValue(null),
        previewBytes: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
        hydrateText: vi.fn().mockResolvedValue('architecture notes'),
        attachExisting: vi.fn().mockImplementation(async (selected: { id: string }) => {
            attachments.items.push({ id: 'draft-' + selected.id, vaultFileId: selected.id, status: 'authorized' })
            return true
        }),
        deleteVaultFile: vi.fn().mockImplementation(async (fileId: string) => {
            const index = vaultFiles.findIndex((candidate) => candidate.id === fileId)
            if (index >= 0) vaultFiles.splice(index, 1)
        }),
    }
    return { init: vi.fn().mockResolvedValue(undefined), chat: { sessions: reactive([]) }, attachments }
}

beforeEach(() => {
    mockState.controller = makeController()
    deviceSave.saveTalosVaultFileToDevice.mockReset()
    deviceSave.saveTalosVaultFileToDevice.mockResolvedValue({
        status: 'saved',
        delivery: 'android-saf',
        bytesWritten: 3,
        displayName: 'architecture.pdf',
    })
    __resetToastsForTests()
    __resetSettingsStoreForTests()
})
afterEach(() => { document.body.innerHTML = '' })

describe('ContextScreen Library gallery', () => {
    it('renders the vault and hydrates it locally', async () => {
        const wrapper = mount(ContextScreen)
        await flushPromises()
        expect(mockState.controller.init).toHaveBeenCalledOnce()
        expect(mockState.controller.attachments.refreshVault).toHaveBeenCalledOnce()
        expect(wrapper.get('[data-vault-file-id="vault-ready"]').text()).toContain('architecture.pdf')
        expect(wrapper.find('[data-vault-file-id="vault-image"]').exists()).toBe(true)
        expect(wrapper.html()).not.toContain('talos-vault/files')
    })

    it('P1-CTX-UI-03 exposes global mode and exact included/excluded file truth', async () => {
        const controller = makeController()
        controller.attachments.vaultFiles.push(file('vault-other'))
        mockState.controller = controller
        const settings = useSettingsStore()
        await settings.setLibraryContextPolicy({
            enabled: true,
            mode: 'smart_relevant_v1',
            included_file_ids: ['vault-ready'],
            excluded_file_ids: ['vault-other'],
        }, 0)
        const wrapper = mount(ContextScreen, { attachTo: document.body })
        await flushPromises()

        expect(wrapper.get('[data-testid="talos-library-global-policy"]').attributes('data-mode'))
            .toBe('smart_relevant_v1')
        expect(wrapper.get('[data-testid="talos-library-context-state-vault-ready"]').text())
            .toContain('Included')
        expect(wrapper.get('[data-testid="talos-library-context-state-vault-other"]').text())
            .toContain('Excluded')

        await wrapper.get('[data-testid="talos-library-actions-vault-ready"]').trigger('click')
        await flushPromises()
        ;(document.body.querySelector(
            '[data-testid="talos-library-action-context-exclude-vault-ready"]',
        ) as HTMLButtonElement).click()
        await flushPromises()

        expect(settings.state.shell.library_context_policy).toMatchObject({
            revision: 2,
            included_file_ids: [],
            excluded_file_ids: ['vault-other', 'vault-ready'],
        })
        expect(wrapper.get('[data-testid="talos-library-context-state-vault-ready"]').text())
            .toContain('Excluded')
    })

    it('shows the shared file-type glyph in the optional grid view', async () => {
        const wrapper = mount(ContextScreen)
        await flushPromises()
        await wrapper.get('[aria-label="Library options"]').trigger('click')
        await wrapper.get('[data-testid="talos-library-view-grid"]').trigger('click')
        expect(wrapper.get('[data-vault-file-id="vault-ready"] [data-talos-library-extension]').text()).toBe('PDF')
        expect(wrapper.get('[data-vault-file-id="vault-ready"] [data-talos-library-icon-kind]').attributes('data-talos-library-icon-kind')).toBe('pdf')
        expect(wrapper.get('[data-vault-file-id="vault-image"] [data-talos-library-extension]').text()).toBe('PNG')
        expect(wrapper.get('[data-vault-file-id="vault-image"] [data-talos-library-icon-kind]').attributes('data-talos-library-icon-kind')).toBe('image')
    })

    it('keeps representative global-Library controls on a 48px Android target', async () => {
        const wrapper = mount(ContextScreen)
        await flushPromises()

        const options = wrapper.get('[aria-label="Library options"]')
        expect(options.classes()).toEqual(expect.arrayContaining(['min-h-12', 'min-w-12']))
        expect(wrapper.get('[data-testid="talos-library-search"]').classes()).toContain('min-h-12')
        expect(wrapper.get('[data-testid="talos-library-type-all"]').classes())
            .toEqual(expect.arrayContaining(['min-h-12', 'min-w-12']))

        await options.trigger('click')
        for (const item of wrapper.findAll('[role^="menuitem"]')) {
            expect(item.classes()).toContain('min-h-12')
        }
        await wrapper.get('[data-testid="talos-library-view-grid"]').trigger('click')
        expect(wrapper.get('[data-testid="talos-library-actions-vault-ready"]').classes()).toContain('size-12')
        await wrapper.get('[data-testid="talos-library-actions-vault-ready"]').trigger('click')
        await flushPromises()
        for (const item of Array.from(document.body.querySelectorAll('[role^="menuitem"]'))) {
            expect(item.classList).toContain('min-h-12')
        }

        await options.trigger('click')
        await wrapper.get('[data-testid="talos-library-view-list"]').trigger('click')
        expect(wrapper.get('[data-testid="talos-library-actions-vault-ready"]').classes()).toContain('size-12')
    })

    it('searches names AND extracted document text, and reports no match', async () => {
        const wrapper = mount(ContextScreen)
        await flushPromises()
        await wrapper.get('[data-testid="talos-library-search"]').setValue('architecture')
        expect(wrapper.find('[data-vault-file-id="vault-ready"]').exists()).toBe(true)
        await wrapper.get('[data-testid="talos-library-search"]').setValue('nonexistent-term')
        expect(wrapper.find('[data-vault-file-id="vault-ready"]').exists()).toBe(false)
        expect(wrapper.text()).toContain('No files match')
    })

    it('P2-UI-01 uses canonical Unicode and emoji matching in the mounted global Library', async () => {
        const controller = makeController()
        controller.attachments.vaultFiles.push({
            ...file('vault-unicode'),
            display_name: 'cafe\u0301-☕️.md',
            media_type: 'text/markdown',
            extracted_text: 'Budget € for 项目预算',
        })
        mockState.controller = controller
        const wrapper = mount(ContextScreen)
        await flushPromises()
        const search = wrapper.get('[data-testid="talos-library-search"]')

        await search.setValue('CAFÉ')
        expect(wrapper.find('[data-vault-file-id="vault-unicode"]').exists()).toBe(true)
        await search.setValue('☕')
        expect(wrapper.find('[data-vault-file-id="vault-unicode"]').exists()).toBe(true)
        await search.setValue('预算')
        expect(wrapper.find('[data-vault-file-id="vault-unicode"]').exists()).toBe(true)
        await search.setValue('🔒')
        expect(wrapper.find('[data-vault-file-id="vault-unicode"]').exists()).toBe(false)
    })

    it('filters by type — Immagini hides non-image files', async () => {
        const wrapper = mount(ContextScreen)
        await flushPromises()
        await wrapper.get('[data-testid="talos-library-type-images"]').trigger('click')
        expect(wrapper.find('[data-vault-file-id="vault-image"]').exists()).toBe(true)
        expect(wrapper.find('[data-vault-file-id="vault-ready"]').exists()).toBe(false)
    })

    it('LIB-MENU-05 groups global list actions under one More trigger and can attach', async () => {
        const wrapper = mount(ContextScreen)
        await flushPromises()
        await wrapper.get('[aria-label="Library options"]').trigger('click')
        await wrapper.get('[data-testid="talos-library-view-list"]').trigger('click')
        expect(wrapper.findAll('[data-talos-library-row]')).toHaveLength(2)
        expect(wrapper.get('[data-vault-file-id="vault-ready"] [data-talos-library-extension]').text()).toBe('PDF')
        expect(wrapper.find('[aria-label="Attach architecture.pdf to message"]').exists()).toBe(false)

        await wrapper.get('[data-testid="talos-library-actions-vault-ready"]').trigger('click')
        await flushPromises()
        ;(document.body.querySelector('[data-testid="talos-library-action-attach-vault-ready"]') as HTMLButtonElement).click()
        await flushPromises()
        expect(mockState.controller.attachments.attachExisting).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'vault-ready' }),
        )
    })

    it('passes the exact Vault bytes to device export from the global list', async () => {
        const controller = makeController()
        mockState.controller = controller
        const wrapper = mount(ContextScreen)
        await flushPromises()

        await wrapper.get('[aria-label="Library options"]').trigger('click')
        await wrapper.get('[data-testid="talos-library-view-list"]').trigger('click')
        await wrapper.get('[data-testid="talos-library-actions-vault-ready"]').trigger('click')
        await flushPromises()
        ;(document.body.querySelector('[data-testid="talos-library-action-save-vault-ready"]') as HTMLButtonElement).click()
        await flushPromises()

        expect(controller.attachments.previewBytes).toHaveBeenCalledWith('vault-ready')
        expect(deviceSave.saveTalosVaultFileToDevice).toHaveBeenCalledWith({
            displayName: 'architecture.pdf',
            mediaType: 'application/pdf',
            bytes: new Uint8Array([1, 2, 3]),
        })
        expect(useTalosMobileToasts().items.value.at(-1)?.message).toMatch(/saved.+architecture\.pdf/i)
    })

    it('LIB-MENU-06 offers the same More action contract in global list and grid', async () => {
        const controller = makeController()
        controller.attachments.previewUrl.mockResolvedValue('blob:diagram')
        controller.attachments.vaultFiles.push({
            ...file('vault-notes'),
            display_name: 'notes.md',
            media_type: 'text/markdown',
        })
        mockState.controller = controller
        const wrapper = mount(ContextScreen, { attachTo: document.body })
        await flushPromises()

        await wrapper.get('[aria-label="Library options"]').trigger('click')
        await wrapper.get('[data-testid="talos-library-view-list"]').trigger('click')
        expect(wrapper.find('[data-testid="talos-library-actions-vault-ready"]').exists()).toBe(true)

        await wrapper.get('[aria-label="Library options"]').trigger('click')
        await wrapper.get('[data-testid="talos-library-view-grid"]').trigger('click')
        expect(wrapper.find('[data-testid="talos-library-actions-vault-ready"]').exists()).toBe(true)
        await wrapper.get('[data-testid="talos-library-actions-vault-ready"]').trigger('click')
        await flushPromises()
        expect(document.body.querySelector('[data-testid="talos-library-action-attach-vault-ready"]')).not.toBeNull()
        expect(document.body.querySelector('[data-testid="talos-library-action-save-vault-ready"]')).not.toBeNull()
        expect(document.body.querySelector('[data-testid="talos-library-action-delete-vault-ready"]')).not.toBeNull()

        await wrapper.get('[aria-label="Open diagram.png"]').trigger('click')
        await flushPromises()
        expect(document.body.querySelector('[data-testid="talos-library-save-overlay-vault-image"]'))
            .not.toBeNull()
        ;(document.body.querySelector('[aria-label="Close preview"]') as HTMLButtonElement).click()
        await flushPromises()

        await wrapper.get('[aria-label="Open notes.md"]').trigger('click')
        await flushPromises()
        expect(document.body.querySelector('[data-testid="talos-library-save-overlay-vault-notes"]'))
            .not.toBeNull()
    })

    it('uploads through the Options menu picker', async () => {
        const wrapper = mount(ContextScreen)
        await flushPromises()
        await wrapper.get('[aria-label="Library options"]').trigger('click')
        const upload = wrapper.findAll('[role="menuitem"]').find((node) => node.text().includes('Upload files'))!
        await upload.trigger('click')
        expect(mockState.controller.attachments.selectFiles).toHaveBeenCalledOnce()
    })

    it('LIB-MENU-07 still requires explicit confirmation after selecting Delete from More', async () => {
        const wrapper = mount(ContextScreen, { attachTo: document.body })
        await flushPromises()
        await wrapper.get('[aria-label="Library options"]').trigger('click')
        await wrapper.get('[data-testid="talos-library-view-list"]').trigger('click')
        await wrapper.get('[data-testid="talos-library-actions-vault-ready"]').trigger('click')
        await flushPromises()
        ;(document.body.querySelector('[data-testid="talos-library-action-delete-vault-ready"]') as HTMLButtonElement).click()
        await vi.waitFor(() => expect(document.body.querySelector('[role="dialog"]')).not.toBeNull())
        expect(mockState.controller.attachments.deleteVaultFile).not.toHaveBeenCalled()
        const confirm = Array.from(document.body.querySelectorAll('button'))
            .find((button) => button.textContent?.trim() === 'Delete file') as HTMLButtonElement
        confirm.click()
        await vi.waitFor(() => expect(mockState.controller.attachments.deleteVaultFile).toHaveBeenCalledWith('vault-ready'))
    })

    /**
     * Owner 2026-07-27: "nuova sezione link in libreria, tutti i link salvati
     * nella ricerca devono essere stampati nella libreria sottoforma di link
     * oltre all'attuale transcript MD … magari nella visualizzazione mettere un
     * pulsante open in browser".
     */
    it('lists a page read while searching as a link that opens in the browser', async () => {
        const controller = makeController()
        controller.attachments.vaultFiles.push({
            ...file('vault-source'),
            display_name: 'Il prezzo del gas.md',
            media_type: 'text/markdown',
            metadata: { origin: 'generated', kind: 'web_source', source_url: 'https://www.corriere.it/gas' },
        } as ReturnType<typeof file>)
        mockState.controller = controller
        const wrapper = mount(ContextScreen)
        await flushPromises()

        await wrapper.get('[data-testid="talos-library-type-links"]').trigger('click')
        const links = wrapper.get('[data-testid="talos-library-links"]')
        expect(links.find('[data-talos-saved-link-row]').exists()).toBe(true)
        expect(links.text()).toContain('Il prezzo del gas')
        // The host, not the filename it happened to be stored under.
        expect(links.text()).toContain('corriere.it')
        // The user's own documents are not addresses and stay out.
        expect(links.text()).not.toContain('architecture.pdf')

        await wrapper.get('[data-testid="talos-library-link-open"]').trigger('click')
        await flushPromises()
        // The user's OWN browser, with his cookies: this is him going back to a
        // page, not TALOS reading one on his behalf. The isolated webview was
        // why these opened logged-out and looking broken.
        expect(browserMock.open).toHaveBeenCalledWith('https://www.corriere.it/gas', 'system_browser')
    })

    /**
     * Owner 2026-07-30: "nella libreria c'è ancora il bug che i link non
     * vengono raggruppati per nome e data chat e non vengono displayati in
     * layout griglia".
     *
     * He was right, and it was never a regression: links render in a branch of
     * their own, while the grouping and the grid/list switch both live in the
     * file branch. Choosing "grid" while looking at links did nothing at all,
     * because the grid code was not even reached.
     *
     * The grouping is now shared; the tile is not. A file tile carries
     * multi-select, an actions menu, a context-state pill and a generated
     * badge — a link has no meaning for any of them, so one template serving
     * both would be made of `v-if` and would be worse, not better.
     */
    it('LIB-LINK-GRID-01 shows saved links as tiles when the grid view is chosen', async () => {
        const controller = makeController()
        controller.attachments.vaultFiles.push({
            ...file('vault-source'),
            display_name: 'Il prezzo del gas.md',
            media_type: 'text/markdown',
            metadata: { origin: 'generated', kind: 'web_source', source_url: 'https://www.corriere.it/gas' },
        } as ReturnType<typeof file>)
        mockState.controller = controller
        const wrapper = mount(ContextScreen)
        await flushPromises()

        await wrapper.get('[data-testid="talos-library-type-links"]').trigger('click')
        await wrapper.get('[aria-label="Library options"]').trigger('click')
        await wrapper.get('[data-testid="talos-library-view-grid"]').trigger('click')

        // The tile exists, and carries the page title and its host.
        const tile = wrapper.get('[data-testid="talos-library-link-tile-vault-source"]')
        expect(tile.text()).toContain('Il prezzo del gas')
        expect(tile.text()).toContain('corriere.it')
        // Tapping the tile opens the page in the user's own browser, exactly as
        // the row does — the view changed, the contract did not.
        await tile.get('[data-testid="talos-library-link-open"]').trigger('click')
        await flushPromises()
        expect(browserMock.open).toHaveBeenCalledWith('https://www.corriere.it/gas', 'system_browser')
    })

    /**
     * The favicon, captured once when the link was saved and read from disk
     * here. Showing a real site mark costs no request at display time, which is
     * the whole reason the sources chip could only use letters before.
     *
     * A link whose card was never captured — a save from before this existed,
     * a dead site, a phone that was offline — keeps the Globe. The mark
     * degrades; the row never breaks.
     */
    it('LIB-LINK-ICON-01 shows the captured favicon, and the Globe when there is none', async () => {
        const controller = makeController()
        controller.attachments.vaultFiles.push({
            ...file('vault-source'),
            display_name: 'Il prezzo del gas.md',
            media_type: 'text/markdown',
            metadata: { origin: 'generated', kind: 'web_source', source_url: 'https://www.corriere.it/gas' },
        } as ReturnType<typeof file>)
        mockState.controller = controller
        const wrapper = mount(ContextScreen)
        await flushPromises()

        await wrapper.get('[data-testid="talos-library-type-links"]').trigger('click')
        await flushPromises()

        // No card stored in this harness, so the honest fallback is on screen
        // and nothing is broken by its absence.
        const row = wrapper.get('[data-talos-saved-link-row]')
        expect(row.find('[data-testid="talos-library-link-favicon"]').exists()).toBe(false)
        expect(row.find('svg').exists()).toBe(true)
    })

    it('LIB-LINK-GRID-02 groups saved links under the chat they came from', async () => {
        const controller = makeController()
        controller.chat.sessions.push({ id: 'session-gas', title: 'Bollette' } as never)
        controller.attachments.vaultFiles.push({
            ...file('vault-source'),
            display_name: 'Il prezzo del gas.md',
            media_type: 'text/markdown',
            metadata: {
                origin: 'generated',
                kind: 'web_source',
                source_url: 'https://www.corriere.it/gas',
                origin_session_id: 'session-gas',
            },
        } as ReturnType<typeof file>)
        mockState.controller = controller
        const wrapper = mount(ContextScreen)
        await flushPromises()

        await wrapper.get('[data-testid="talos-library-type-links"]').trigger('click')

        // The heading names the chat, the same way the file surface does.
        expect(wrapper.get('[data-testid="talos-library-links"]').text()).toContain('Bollette')
    })

    it('LIB-ALL-LINK-01 includes a web source in All as a link, never as a Markdown file', async () => {
        const controller = makeController()
        controller.attachments.vaultFiles.push({
            ...file('vault-source'),
            display_name: 'Il prezzo del gas.md',
            media_type: 'text/markdown',
            metadata: {
                origin: 'generated',
                kind: 'web_source',
                source_url: 'https://www.corriere.it/gas',
            },
        } as ReturnType<typeof file>)
        mockState.controller = controller
        const wrapper = mount(ContextScreen)
        await flushPromises()

        const sourceFileVisible = () => wrapper.find('[data-vault-file-id="vault-source"]').exists()
        const linkRows = () => wrapper.findAll('[data-talos-saved-link-row]')

        expect(linkRows()).toHaveLength(1)
        expect(linkRows()[0]!.text()).toContain('corriere.it')
        expect(sourceFileVisible()).toBe(false)

        await wrapper.get('[data-testid="talos-library-type-images"]').trigger('click')
        expect(linkRows()).toHaveLength(0)
        expect(sourceFileVisible()).toBe(false)

        await wrapper.get('[data-testid="talos-library-type-files"]').trigger('click')
        expect(linkRows()).toHaveLength(0)
        expect(sourceFileVisible()).toBe(false)

        await wrapper.get('[data-testid="talos-library-type-links"]').trigger('click')
        expect(wrapper.get('[data-testid="talos-library-links"]').text()).toContain('corriere.it')
        expect(linkRows()).toHaveLength(1)
        expect(sourceFileVisible()).toBe(false)
    })

    it('LIB-ALL-LINK-02/05 keeps exact type projections and counts logical items rather than source rows', async () => {
        const controller = makeController()
        controller.attachments.vaultFiles.push({
            ...file('vault-source'),
            display_name: 'Ricerca energia.md',
            media_type: 'text/markdown',
            metadata: {
                origin: 'generated',
                kind: 'web_source',
                source_links: [
                    { url: 'https://www.reuters.com/energy', title: 'Energy report' },
                    { url: 'https://example.org/markets', title: 'Markets report' },
                ],
            },
        } as ReturnType<typeof file>)
        mockState.controller = controller
        const wrapper = mount(ContextScreen)
        await flushPromises()

        // Two ordinary files plus two logical links. The one backing dossier is
        // storage, not a fifth user-facing item.
        expect(wrapper.text()).toContain('4 across every chat')
        expect(wrapper.find('[data-vault-file-id="vault-ready"]').exists()).toBe(true)
        expect(wrapper.find('[data-vault-file-id="vault-image"]').exists()).toBe(true)
        expect(wrapper.find('[data-vault-file-id="vault-source"]').exists()).toBe(false)
        expect(wrapper.findAll('[data-talos-saved-link-row]')).toHaveLength(2)

        await wrapper.get('[data-testid="talos-library-type-images"]').trigger('click')
        expect(wrapper.findAll('[data-vault-file-id]')).toHaveLength(1)
        expect(wrapper.find('[data-vault-file-id="vault-image"]').exists()).toBe(true)
        expect(wrapper.findAll('[data-talos-saved-link-row]')).toHaveLength(0)
        expect(wrapper.text()).toContain('4 across every chat')

        await wrapper.get('[data-testid="talos-library-type-files"]').trigger('click')
        expect(wrapper.findAll('[data-vault-file-id]')).toHaveLength(1)
        expect(wrapper.find('[data-vault-file-id="vault-ready"]').exists()).toBe(true)
        expect(wrapper.findAll('[data-talos-saved-link-row]')).toHaveLength(0)

        await wrapper.get('[data-testid="talos-library-type-links"]').trigger('click')
        expect(wrapper.findAll('[data-vault-file-id]')).toHaveLength(0)
        expect(wrapper.findAll('[data-talos-saved-link-row]')).toHaveLength(2)
    })

    it('LIB-ALL-LINK-04 composes All and Links with title, host, URL and retained-copy search', async () => {
        const controller = makeController()
        controller.attachments.vaultFiles.push({
            ...file('vault-source'),
            display_name: 'Ricerca mercati globali.md',
            media_type: 'text/markdown',
            extracted_text: 'Analisi macroeconomica del budget \u20ac',
            metadata: {
                origin: 'generated',
                kind: 'web_source',
                source_links: [
                    { url: 'https://www.reuters.com/world/alpha', title: 'Caf\u00e9 Alpha' },
                    { url: 'https://example.org/beta-report', title: 'Beta report' },
                ],
            },
        } as ReturnType<typeof file>)
        mockState.controller = controller
        const wrapper = mount(ContextScreen)
        await flushPromises()
        const search = wrapper.get('[data-testid="talos-library-search"]')

        await search.setValue('CAFE\u0301')
        expect(wrapper.findAll('[data-talos-saved-link-row]')).toHaveLength(1)
        expect(wrapper.get('[data-talos-saved-link-row]').text()).toContain('Caf\u00e9 Alpha')

        await search.setValue('example.org')
        expect(wrapper.findAll('[data-talos-saved-link-row]')).toHaveLength(1)
        expect(wrapper.get('[data-talos-saved-link-row]').text()).toContain('Beta report')

        await search.setValue('beta-report')
        expect(wrapper.findAll('[data-talos-saved-link-row]')).toHaveLength(1)

        await search.setValue('macroeconomica')
        expect(wrapper.findAll('[data-talos-saved-link-row]')).toHaveLength(2)

        await wrapper.get('[data-testid="talos-library-type-links"]').trigger('click')
        expect(wrapper.findAll('[data-talos-saved-link-row]')).toHaveLength(2)
        await search.setValue('not-present')
        expect(wrapper.findAll('[data-talos-saved-link-row]')).toHaveLength(0)
        expect(wrapper.text()).toContain('No files match')
    })

    it('LIB-ALL-LINK-06 hides links only during bulk file selection and restores them unchanged', async () => {
        const controller = makeController()
        controller.attachments.vaultFiles.push({
            ...file('vault-source'),
            display_name: 'Una pagina.md',
            media_type: 'text/markdown',
            metadata: {
                origin: 'generated',
                kind: 'web_source',
                source_url: 'https://example.com/page',
            },
        } as ReturnType<typeof file>)
        mockState.controller = controller
        const wrapper = mount(ContextScreen)
        await flushPromises()

        expect(wrapper.findAll('[data-talos-saved-link-row]')).toHaveLength(1)
        await wrapper.get('[aria-label="Library options"]').trigger('click')
        await wrapper.get('[data-testid="talos-library-select"]').trigger('click')
        expect(wrapper.findAll('[data-talos-saved-link-row]')).toHaveLength(0)
        expect(wrapper.find('[data-vault-file-id="vault-ready"]').exists()).toBe(true)

        await wrapper.get('[aria-label="Cancel selection"]').trigger('click')
        expect(wrapper.findAll('[data-talos-saved-link-row]')).toHaveLength(1)
        expect(wrapper.get('[data-talos-saved-link-row]').text()).toContain('example.com')
    })

    it('lists a source saved before the address was kept as a fact', async () => {
        // Self-review 2026-07-27: the row builder learned to read the `Source:`
        // header of an older transcript, but the screen filtered those rows out
        // before it ever ran — the fallback was dead where it mattered, and the
        // owner's existing Library would have opened empty.
        const controller = makeController()
        controller.attachments.vaultFiles.push({
            ...file('vault-legacy'),
            display_name: 'Il prezzo del gas.md',
            media_type: 'text/markdown',
            extracted_text: ['# Il prezzo del gas', '', 'Source: https://www.corriere.it/gas'].join('\n'),
            metadata: { origin: 'generated', kind: 'web_source' },
        } as ReturnType<typeof file>)
        mockState.controller = controller
        const wrapper = mount(ContextScreen)
        await flushPromises()

        await wrapper.get('[data-testid="talos-library-type-links"]').trigger('click')
        expect(wrapper.get('[data-testid="talos-library-links"]').text()).toContain('corriere.it')
    })

    it('says the Links section is empty rather than showing an empty list', async () => {
        const controller = makeController()
        controller.attachments.vaultFiles.push({
            ...file('vault-sourceless'),
            display_name: 'Senza indirizzo.md',
            media_type: 'text/markdown',
            extracted_text: 'nessun indirizzo qui',
            metadata: { origin: 'generated', kind: 'web_source' },
        } as ReturnType<typeof file>)
        mockState.controller = controller
        const wrapper = mount(ContextScreen)
        await flushPromises()

        await wrapper.get('[data-testid="talos-library-type-links"]').trigger('click')
        expect(wrapper.find('[data-testid="talos-library-links"]').exists()).toBe(false)
        expect(wrapper.text()).toContain('No links yet')
        expect(wrapper.text()).toMatch(/results TALOS finds|pages it reads/i)
    })

    it('keeps the saved transcript one tap away from its link', async () => {
        // The markdown copy is the half that survives the page going away; the
        // link section adds to it rather than replacing it.
        const controller = makeController()
        controller.attachments.hydrateText = vi.fn().mockResolvedValue('# Il prezzo del gas')
        controller.attachments.vaultFiles.push({
            ...file('vault-source'),
            display_name: 'Il prezzo del gas.md',
            media_type: 'text/markdown',
            extracted_text: 'il prezzo',
            metadata: { origin: 'generated', kind: 'web_source', source_url: 'https://example.com/gas' },
        } as ReturnType<typeof file>)
        mockState.controller = controller
        const wrapper = mount(ContextScreen, { attachTo: document.body })
        await flushPromises()

        await wrapper.get('[data-testid="talos-library-type-links"]').trigger('click')
        await wrapper.get('[aria-label="Open the saved copy of Il prezzo del gas"]').trigger('click')
        await flushPromises()
        const viewer = document.body.querySelector('[data-testid="talos-library-doc"]')
        expect(viewer).not.toBeNull()
        expect(viewer!.textContent).toContain('Il prezzo del gas')
        // And from the transcript, the original page is still reachable.
        expect(viewer!.querySelector('[data-testid="talos-library-doc-open-source"]')).not.toBeNull()
    })

    it('shows a compact empty state and a recoverable load error', async () => {
        const controller = makeController()
        controller.attachments.vaultFiles.splice(0, controller.attachments.vaultFiles.length)
        controller.attachments.vaultError.value = 'Local Vault is unavailable.'
        mockState.controller = controller
        const wrapper = mount(ContextScreen)
        await flushPromises()
        expect(wrapper.get('[role="alert"]').text()).toContain('Local Vault is unavailable.')
        expect(wrapper.text()).toContain('No files yet')
        await wrapper.get('[aria-label="Retry Library"]').trigger('click')
        expect(controller.attachments.refreshVault).toHaveBeenCalledTimes(2)
    })
})
