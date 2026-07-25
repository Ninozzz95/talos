// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'

const mockState = vi.hoisted(() => ({ controller: null as unknown }))
vi.mock('@/stores/chatController', () => ({ useChatController: () => mockState.controller }))

import ContextScreen from '@/screens/ContextScreen.vue'

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

beforeEach(() => { mockState.controller = makeController() })
afterEach(() => { document.body.innerHTML = '' })

describe('ContextScreen Library gallery', () => {
    it('renders the vault as a grid by default and hydrates it locally', async () => {
        const wrapper = mount(ContextScreen)
        await flushPromises()
        expect(mockState.controller.init).toHaveBeenCalledOnce()
        expect(mockState.controller.attachments.refreshVault).toHaveBeenCalledOnce()
        expect(wrapper.get('[data-vault-file-id="vault-ready"]').text()).toContain('architecture.pdf')
        expect(wrapper.find('[data-vault-file-id="vault-image"]').exists()).toBe(true)
        expect(wrapper.html()).not.toContain('talos-vault/files')
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

    it('filters by type — Immagini hides non-image files', async () => {
        const wrapper = mount(ContextScreen)
        await flushPromises()
        await wrapper.get('[data-testid="talos-library-type-images"]').trigger('click')
        expect(wrapper.find('[data-vault-file-id="vault-image"]').exists()).toBe(true)
        expect(wrapper.find('[data-vault-file-id="vault-ready"]').exists()).toBe(false)
    })

    it('switches to list view via the Options menu and can attach a file to the composer', async () => {
        const wrapper = mount(ContextScreen)
        await flushPromises()
        await wrapper.get('[aria-label="Library options"]').trigger('click')
        await wrapper.get('[data-testid="talos-library-view-list"]').trigger('click')
        await wrapper.get('[aria-label="Attach architecture.pdf to message"]').trigger('click')
        expect(mockState.controller.attachments.attachExisting).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'vault-ready' }),
        )
    })

    it('uploads through the Options menu picker', async () => {
        const wrapper = mount(ContextScreen)
        await flushPromises()
        await wrapper.get('[aria-label="Library options"]').trigger('click')
        const upload = wrapper.findAll('[role="menuitem"]').find((node) => node.text().includes('Carica file'))!
        await upload.trigger('click')
        expect(mockState.controller.attachments.selectFiles).toHaveBeenCalledOnce()
    })

    it('requires an explicit dialog confirmation before deleting a private file', async () => {
        const wrapper = mount(ContextScreen, { attachTo: document.body })
        await flushPromises()
        await wrapper.get('[aria-label="Delete architecture.pdf"]').trigger('click')
        await vi.waitFor(() => expect(document.body.querySelector('[role="dialog"]')).not.toBeNull())
        expect(mockState.controller.attachments.deleteVaultFile).not.toHaveBeenCalled()
        const confirm = Array.from(document.body.querySelectorAll('button'))
            .find((button) => button.textContent?.trim() === 'Delete file') as HTMLButtonElement
        confirm.click()
        await vi.waitFor(() => expect(mockState.controller.attachments.deleteVaultFile).toHaveBeenCalledWith('vault-ready'))
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
