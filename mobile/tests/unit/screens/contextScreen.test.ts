// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'

const mockState = vi.hoisted(() => ({ controller: null as unknown }))
vi.mock('@/stores/chatController', () => ({ useChatController: () => mockState.controller }))

import ContextScreen from '@/screens/ContextScreen.vue'

function file(id: string, status: 'available' | 'failed' = 'available') {
    return {
        id,
        display_name: id === 'vault-ready' ? 'architecture.pdf' : 'spoofed.png',
        media_type: id === 'vault-ready' ? 'application/pdf' : 'image/png',
        size_bytes: id === 'vault-ready' ? 4096 : 512,
        private_uri: 'talos-vault/files/' + id,
        status,
        trust: 'untrusted',
        sha256: status === 'available' ? 'a'.repeat(64) : null,
        extracted_text: status === 'available' ? 'architecture' : null,
        failure_code: status === 'failed' ? 'TALOS_ATTACHMENT_SIGNATURE_MISMATCH' : null,
        metadata: {},
        created_at: '2026-07-22T10:00:00.000Z',
        updated_at: '2026-07-22T10:00:00.000Z',
    }
}

function makeController() {
    const vaultFiles = reactive([file('vault-ready'), file('vault-failed', 'failed')])
    const attachments = {
        items: reactive<Array<Record<string, unknown>>>([]),
        vaultFiles,
        selecting: ref(false),
        error: ref(null),
        vaultLoading: ref(false),
        vaultError: ref(null),
        hasAuthorized: ref(false),
        blocking: ref(false),
        bindings: ref([]),
        initialize: vi.fn().mockResolvedValue(undefined),
        refreshVault: vi.fn().mockResolvedValue(undefined),
        selectFiles: vi.fn().mockResolvedValue(undefined),
        attachExisting: vi.fn().mockImplementation(async (selected: { id: string }) => {
            attachments.items.push({ id: 'draft-' + selected.id, vaultFileId: selected.id })
            return true
        }),
        remove: vi.fn().mockResolvedValue(undefined),
        deleteVaultFile: vi.fn().mockImplementation(async (fileId: string) => {
            const index = vaultFiles.findIndex((candidate) => candidate.id === fileId)
            if (index >= 0) vaultFiles.splice(index, 1)
        }),
        clearSent: vi.fn(),
        clearError: vi.fn(),
    }
    return {
        init: vi.fn().mockResolvedValue(undefined),
        attachments,
    }
}

beforeEach(() => {
    mockState.controller = makeController()
})

afterEach(() => {
    document.body.innerHTML = ''
})

describe('ContextScreen local Vault', () => {
    it('renders durable available and failed files without fake server copy or private paths', async () => {
        const wrapper = mount(ContextScreen)
        await flushPromises()

        expect(mockState.controller.init).toHaveBeenCalledOnce()
        expect(mockState.controller.attachments.refreshVault).toHaveBeenCalledOnce()
        expect(wrapper.get('[data-vault-file-id="vault-ready"]').text()).toContain('architecture.pdf')
        expect(wrapper.get('[data-vault-file-id="vault-ready"]').text()).toContain('4 KB')
        expect(wrapper.get('[data-vault-file-id="vault-failed"]').text()).toContain('Could not inspect')
        expect(wrapper.get('[data-vault-file-id="vault-failed"]').text()).toContain('TALOS_ATTACHMENT_SIGNATURE_MISMATCH')
        expect(wrapper.text()).not.toContain('/api/talos/context-sets')
        expect(wrapper.html()).not.toContain('talos-vault/files')
    })

    it('adds files through the native picker and grants an existing file to the current composer', async () => {
        const wrapper = mount(ContextScreen)
        await flushPromises()

        await wrapper.get('[aria-label="Add files to Vault"]').trigger('click')
        await wrapper.get('[aria-label="Attach architecture.pdf to message"]').trigger('click')

        expect(mockState.controller.attachments.selectFiles).toHaveBeenCalledOnce()
        expect(mockState.controller.attachments.attachExisting).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'vault-ready' }),
        )
        await vi.waitFor(() => {
            expect(wrapper.get('[role="status"]').text()).toContain('architecture.pdf is ready in the composer')
        })
    })

    it('requires an explicit dialog confirmation before deleting a private Vault file', async () => {
        const wrapper = mount(ContextScreen, { attachTo: document.body })
        await flushPromises()

        await wrapper.get('[aria-label="Delete architecture.pdf"]').trigger('click')
        await vi.waitFor(() => {
            expect(document.body.querySelector('[role="dialog"]')).not.toBeNull()
        })
        expect(mockState.controller.attachments.deleteVaultFile).not.toHaveBeenCalled()

        const confirm = Array.from(document.body.querySelectorAll('button'))
            .find((button) => button.textContent?.trim() === 'Delete file') as HTMLButtonElement
        confirm.click()
        await vi.waitFor(() => {
            expect(mockState.controller.attachments.deleteVaultFile).toHaveBeenCalledWith('vault-ready')
        })
        expect(wrapper.find('[data-vault-file-id="vault-ready"]').exists()).toBe(false)
    })

    it('shows a compact empty state and a recoverable Vault load error', async () => {
        const controller = makeController()
        controller.attachments.vaultFiles.splice(0, controller.attachments.vaultFiles.length)
        controller.attachments.vaultError.value = 'Local Vault is unavailable.'
        mockState.controller = controller
        const wrapper = mount(ContextScreen)
        await flushPromises()

        expect(wrapper.get('[role="alert"]').text()).toContain('Local Vault is unavailable.')
        expect(wrapper.text()).toContain('No files in your Vault')
        await wrapper.get('[aria-label="Retry Vault"]').trigger('click')
        expect(controller.attachments.refreshVault).toHaveBeenCalledTimes(2)
    })
})
