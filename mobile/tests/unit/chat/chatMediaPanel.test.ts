// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import TalosMobileChatMediaPanel from '@/components/chat/TalosMobileChatMediaPanel.vue'
import type { TalosLocalVaultFile } from '@/repositories/chatRepository'

/**
 * Owner 2026-07-26 — the per-chat media screen, and the point that makes it
 * more than a copy of WhatsApp: these files are also what the model of this
 * chat can read, so the gallery doubles as the chat's context panel.
 */
function file(id: string, metadata: Record<string, unknown>, name = `${id}.txt`, media = 'text/plain'): TalosLocalVaultFile {
    return {
        id,
        display_name: name,
        media_type: media,
        size_bytes: 10,
        private_uri: `file://${id}`,
        status: 'available',
        trust: 'untrusted',
        sha256: null,
        extracted_text: '',
        failure_code: null,
        metadata,
        created_at: '2026-07-26T10:00:00.000Z',
        updated_at: '2026-07-26T10:00:00.000Z',
    } as TalosLocalVaultFile
}

const here = file('a', { origin: 'uploaded', origin_session_id: 's1' }, 'Fattura.pdf')
const madeHere = file('b', { origin: 'generated', origin_session_id: 's1' }, 'Riassunto.md')
const elsewhere = file('c', { origin: 'uploaded', origin_session_id: 's2' }, 'Altro.txt')
const withdrawn = file('d', { origin: 'uploaded', origin_session_id: 's1', library_shared: false }, 'Privato.txt')

function mountPanel(overrides: Record<string, unknown> = {}) {
    const setShared = vi.fn(async () => {})
    const wrapper = mount(TalosMobileChatMediaPanel, {
        props: {
            sessionId: 's1',
            sessionTitle: 'Conti di casa',
            files: [here, madeHere, elsewhere, withdrawn],
            attachedFileIds: [],
            libraryContextEnabled: true,
            previewUrl: async () => null,
            setShared,
            ...overrides,
        },
        global: { stubs: { teleport: true } },
    })
    return { wrapper, setShared }
}

describe('per-chat media panel', () => {
    it('shows this chat, and says WHICH chat it is showing', () => {
        const { wrapper } = mountPanel()
        expect(wrapper.get('[data-testid="talos-chat-media-scope"]').text()).toContain('Conti di casa')
    })

    it('includes what was uploaded here AND what TALOS generated here', () => {
        const text = mountPanel().wrapper.text()
        expect(text).toContain('Fattura.pdf')
        expect(text).toContain('Riassunto.md')
    })

    it('leaves another chat out', () => {
        expect(mountPanel().wrapper.text()).not.toContain('Altro.txt')
    })

    it('admits a Library document that was attached HERE', () => {
        const { wrapper } = mountPanel({ attachedFileIds: ['c'] })
        expect(wrapper.text()).toContain('Altro.txt')
        // ...and is honest about where it actually came from.
        expect(wrapper.text()).toContain('From your Library')
    })

    it('states provenance per file, not just a filename', () => {
        const text = mountPanel().wrapper.text()
        expect(text).toContain('You uploaded it here')
        expect(text).toContain('Made by TALOS here')
    })

    it('carries the per-file switch that decides what the model may read', async () => {
        const { wrapper, setShared } = mountPanel()
        const toggle = wrapper.get('[data-testid="talos-chat-media-share-a"]')
        // Absent flag means SHARED — matching the injection gate's `!== false`.
        expect((toggle.element as HTMLInputElement).checked).toBe(true)
        expect((wrapper.get('[data-testid="talos-chat-media-share-d"]').element as HTMLInputElement).checked)
            .toBe(false)

        await toggle.trigger('change')
        expect(setShared).toHaveBeenCalledWith('a', false)
    })

    it('offers no switch on a generated file, because the flag would do nothing', () => {
        // Generated documents are excluded from injection upstream of this
        // flag; a control that changes nothing is a lie.
        expect(mountPanel().wrapper.find('[data-testid="talos-chat-media-share-b"]').exists()).toBe(false)
    })

    it('says plainly when a failed write did NOT take effect', async () => {
        const { wrapper } = mountPanel({
            setShared: vi.fn(async () => { throw new Error('storage unavailable') }),
        })
        await wrapper.get('[data-testid="talos-chat-media-share-a"]').trigger('change')
        await flushPromises()
        expect(wrapper.get('[data-testid="talos-chat-media-error"]').text()).toMatch(/still where it was/i)
    })

    it('warns when the global Library switch makes every per-file switch moot', () => {
        const { wrapper } = mountPanel({ libraryContextEnabled: false })
        expect(wrapper.get('[data-testid="talos-chat-media-context-off"]').text()).toMatch(/off in Settings/i)
    })

    it('an empty chat explains what will land here rather than showing a void', () => {
        const { wrapper } = mountPanel({ files: [], attachedFileIds: [] })
        expect(wrapper.get('[data-testid="talos-chat-media-empty"]').text()).toMatch(/Nothing has been shared/i)
        expect(wrapper.find('[data-testid="talos-chat-media-grid"]').exists()).toBe(false)
    })
})
