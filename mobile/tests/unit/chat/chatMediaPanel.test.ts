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
            readText: async () => 'totale 2196 euro',
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

    it('says plainly when a failed write did NOT take effect — AND puts the switch back', async () => {
        const { wrapper } = mountPanel({
            setShared: vi.fn(async () => { throw new Error('storage unavailable') }),
        })
        const toggle = wrapper.get('[data-testid="talos-chat-media-share-a"]')
        // A native checkbox flips ITSELF on tap; Vue then skips the patch because
        // the bound value has not changed. Without an explicit correction the
        // user is left looking at "the model cannot read this" over a document
        // the next send still injects. This is the assertion that catches it.
        ;(toggle.element as HTMLInputElement).checked = false
        await toggle.trigger('change')
        await flushPromises()
        expect(wrapper.get('[data-testid="talos-chat-media-error"]').text()).toMatch(/still where it was/i)
        expect((toggle.element as HTMLInputElement).checked).toBe(true)
    })

    it('a second file can be toggled while the first write is still in flight', async () => {
        // The guard used to be one id for the whole panel, so the second tap was
        // dropped in silence — control one way, document the other.
        let release: (() => void) | null = null
        const setShared = vi.fn(() => new Promise<void>((resolve) => { release = resolve }))
        const { wrapper } = mountPanel({ setShared, files: [here, withdrawn] })
        await wrapper.get('[data-testid="talos-chat-media-share-a"]').trigger('change')
        await wrapper.get('[data-testid="talos-chat-media-share-d"]').trigger('change')
        expect(setShared).toHaveBeenCalledTimes(2)
        release?.()
    })

    it('hides files the model could not read anyway, rather than offering a dead switch', () => {
        // Both flag consumers filter `status === 'available'` first, so a failed
        // or still-analysing upload would have shown a checked switch governing
        // precisely nothing.
        const pending = { ...here, id: 'e', display_name: 'Ancora.pdf', status: 'pending' } as TalosLocalVaultFile
        const { wrapper } = mountPanel({ files: [here, pending] })
        expect(wrapper.text()).not.toContain('Ancora.pdf')
    })

    it('opening a document shows it, instead of dismissing the gallery', async () => {
        const { wrapper } = mountPanel()
        await wrapper.get('[data-testid="talos-chat-media-open-a"]').trigger('click')
        await flushPromises()
        const viewer = wrapper.get('[data-testid="talos-chat-media-viewer"]')
        expect(viewer.text()).toContain('totale 2196 euro')
        expect(wrapper.find('[data-testid="talos-chat-media-panel"]').exists()).toBe(true)

        await wrapper.get('[data-testid="talos-chat-media-viewer-close"]').trigger('click')
        expect(wrapper.find('[data-testid="talos-chat-media-viewer"]').exists()).toBe(false)
    })

    it('is a real modal surface: focusable, trapped, and closable with Escape', async () => {
        // Every other modal in this app has tabindex + trapTab + Escape. Without
        // tabindex the composable's focus() is a no-op, the opener goes inert,
        // and focus lands on <body> — outside the dialog.
        const { wrapper } = mountPanel()
        const panel = wrapper.get('[data-testid="talos-chat-media-panel"]')
        expect(panel.attributes('tabindex')).toBe('-1')
        expect(panel.attributes('aria-modal')).toBe('true')
        await panel.trigger('keydown.escape')
        expect(wrapper.emitted('close')).toBeTruthy()
    })

    it('says "any chat", because the flag is global and pretending otherwise misleads', () => {
        // `library_shared` is read against the whole vault with no session
        // predicate: switching it off here withdraws the document everywhere.
        expect(mountPanel().wrapper.text()).toContain('Any chat may read it')
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
