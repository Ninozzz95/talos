// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VueWrapper } from '@vue/test-utils'
import { flushPromises, mount } from '@vue/test-utils'
const deviceSave = vi.hoisted(() => ({
    saveTalosVaultFileToDevice: vi.fn(),
}))
vi.mock('@/services/saveVaultFileToDevice', () => deviceSave)
const browserMock = vi.hoisted(() => ({
    openTalosLinkOnce: vi.fn(),
}))
vi.mock('@/services/inAppBrowserService', () => browserMock)

import TalosMobileChatMediaPanel from '@/components/chat/TalosMobileChatMediaPanel.vue'
import TalosRowActions from '@/components/talos/ui/TalosRowActions.vue'
import type { TalosLocalVaultFile } from '@/repositories/chatRepository'
import { __resetToastsForTests, useTalosMobileToasts } from '@/stores/toasts'

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
const madeHerePrivate = file(
    'b-private',
    { origin: 'generated', origin_session_id: 's1', library_shared: false },
    'Riassunto privato.md',
)
const elsewhere = file('c', { origin: 'uploaded', origin_session_id: 's2' }, 'Altro.txt')
const withdrawn = file('d', { origin: 'uploaded', origin_session_id: 's1', library_shared: false }, 'Privato.txt')
const sourceHere = file(
    'source-1',
    {
        origin: 'generated',
        origin_session_id: 's1',
        kind: 'web_source',
        source_url: 'https://www.corriere.it/economia/gas',
    },
    'Il prezzo del gas.md',
    'text/markdown',
)

function mountPanel(overrides: Record<string, unknown> = {}) {
    const setShared = vi.fn(async () => {})
    const setSessionLibraryContextPolicy = vi.fn(async () => {})
    const wrapper = mount(TalosMobileChatMediaPanel, {
        props: {
            sessionId: 's1',
            sessionTitle: 'Conti di casa',
            files: [here, madeHere, elsewhere, withdrawn],
            attachedFileIds: [],
            libraryContextEnabled: true,
            globalLibraryContextPolicy: null,
            sessionLibraryContextPolicy: null,
            previewUrl: async () => null,
            readText: async () => 'totale 2196 euro',
            readBytes: async () => new Uint8Array([1, 2, 3]),
            setShared,
            setSessionLibraryContextPolicy,
            ...overrides,
        },
        global: { stubs: { teleport: true } },
    })
    return { wrapper, setShared, setSessionLibraryContextPolicy }
}

function mediaActionMenu(wrapper: VueWrapper, fileId: string) {
    const menu = wrapper.findAllComponents(TalosRowActions)
        .find((candidate) => candidate.props('testId') === `talos-chat-media-actions-${fileId}`)
    expect(menu).toBeDefined()
    return menu!
}

function mediaAction(wrapper: VueWrapper, fileId: string, actionId: string) {
    const items = mediaActionMenu(wrapper, fileId).props('items') as Array<{
        id: string
        label: string
        kind?: string
        checked?: boolean
    }>
    const action = items.find((candidate) => candidate.id === actionId)
    expect(action).toBeDefined()
    return action!
}

describe('per-chat media panel', () => {
    beforeEach(() => {
        deviceSave.saveTalosVaultFileToDevice.mockReset()
        deviceSave.saveTalosVaultFileToDevice.mockResolvedValue({
            status: 'saved',
            delivery: 'android-saf',
            bytesWritten: 3,
            displayName: 'Fattura.pdf',
        })
        browserMock.openTalosLinkOnce.mockReset()
        browserMock.openTalosLinkOnce.mockResolvedValue(true)
        __resetToastsForTests()
    })

    it('shows this chat, and says WHICH chat it is showing', () => {
        const { wrapper } = mountPanel()
        expect(wrapper.get('[data-testid="talos-chat-media-scope"]').text()).toContain('Conti di casa')
    })

    it('includes what was uploaded here AND what TALOS generated here', () => {
        const text = mountPanel().wrapper.text()
        expect(text).toContain('Fattura.pdf')
        expect(text).toContain('Riassunto.md')
    })

    it('uses the same canonical Library row and filter-chip contract', () => {
        const { wrapper } = mountPanel()
        const collection = wrapper.get('[data-testid="talos-chat-media-grid"]')
        expect(collection.attributes('role')).toBe('list')
        expect(collection.classes()).toContain('space-y-1')
        expect(collection.findAll('[data-talos-library-row]')).toHaveLength(3)
        expect(collection.findAll('[data-talos-library-extension]').map((node) => node.text()))
            .toEqual(expect.arrayContaining(['PDF', 'MD', 'TXT']))
        expect(collection.find('[data-talos-library-icon-kind="pdf"]').exists()).toBe(true)

        // Narrowing the list is a radiogroup, not a row of pressed buttons:
        // `aria-pressed` on several at once is legal, so it could never say
        // that choosing one un-chooses the rest.
        const all = wrapper.findAll('[role="radio"]').find((button) => button.text() === 'All')
        expect(all).toBeDefined()
        expect(all!.attributes('aria-checked')).toBe('true')
        expect(all!.classes()).toContain('min-h-12')
        expect(all!.classes()).toContain('min-w-12')
        expect(all!.classes()).toContain('text-sm')
    })

    it('LINK-PARITY-03 renders chat web evidence as canonical links, not markdown files', async () => {
        const { wrapper } = mountPanel({ files: [here, sourceHere] })

        expect(wrapper.text()).not.toContain('Il prezzo del gas.md')
        await wrapper.get('button[aria-label="Show Images"]').trigger('click')
        expect(wrapper.text()).not.toContain('Il prezzo del gas.md')
        await wrapper.get('button[aria-label="Show Files"]').trigger('click')
        expect(wrapper.text()).not.toContain('Il prezzo del gas.md')

        await wrapper.get('button[aria-label="Show Links"]').trigger('click')
        const links = wrapper.get('[data-testid="talos-chat-media-links"]')
        expect(links.find('[data-talos-saved-link-row]').exists()).toBe(true)
        expect(links.text()).toContain('Il prezzo del gas')
        expect(links.text()).toContain('corriere.it')
        expect(links.text()).not.toContain('Il prezzo del gas.md')
        expect(links.find('[data-talos-library-extension]').exists()).toBe(false)
    })

    it('LINK-PARITY-04 opens retained copy and original browser independently', async () => {
        const { wrapper } = mountPanel({ files: [here, sourceHere] })
        await wrapper.get('button[aria-label="Show Links"]').trigger('click')

        await wrapper.get('[data-testid="talos-chat-media-link-copy"]').trigger('click')
        await flushPromises()
        expect(wrapper.get('[data-testid="talos-chat-media-viewer"]').text()).toContain('totale 2196 euro')
        expect(browserMock.openTalosLinkOnce).not.toHaveBeenCalled()

        await wrapper.get('[data-testid="talos-chat-media-viewer-close"]').trigger('click')
        await wrapper.get('[data-testid="talos-chat-media-link-open"]').trigger('click')
        await flushPromises()
        expect(browserMock.openTalosLinkOnce).toHaveBeenCalledWith(
            'https://www.corriere.it/economia/gas',
            'system_browser',
        )
    })

    it('keeps every representative chat-Library control on a 48px Android target', async () => {
        const { wrapper } = mountPanel()

        expect(wrapper.get('[data-testid="talos-chat-media-close"]').classes()).toContain('size-12')
        const actions = wrapper.get('[data-testid="talos-chat-media-actions-a"]')
        expect(actions.classes()).toContain('size-12')
        expect(mediaActionMenu(wrapper, 'a').props('items')).toHaveLength(5)

        await wrapper.get('[data-testid="talos-chat-media-open-a"]').trigger('click')
        await flushPromises()

        expect(wrapper.get('[data-testid="talos-chat-media-viewer-save"]').classes()).toContain('size-12')
        expect(wrapper.get('[data-testid="talos-chat-media-viewer-close"]').classes()).toContain('size-12')
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

    it('LIB-MENU-08 carries the per-file permission inside its More menu', async () => {
        const { wrapper, setShared } = mountPanel()
        const toggle = mediaAction(wrapper, 'a', 'share')
        // Absent flag means SHARED — matching the injection gate's `!== false`.
        expect(toggle.kind).toBe('checkbox')
        expect(toggle.checked).toBe(true)

        mediaActionMenu(wrapper, 'a').vm.$emit('select', 'share', false)
        await flushPromises()
        expect(setShared).toHaveBeenCalledWith('a', false)

        expect(mediaAction(wrapper, 'd', 'share').checked).toBe(false)
    })

    it('LIB-MENU-10 / LIB-SHARE-01 gives generated files the same controlled explicit-read policy', async () => {
        const { wrapper, setShared } = mountPanel()
        const toggle = mediaAction(wrapper, 'b', 'share')

        expect(toggle.kind).toBe('checkbox')
        expect(toggle.checked).toBe(true)
        expect(wrapper.get('[data-testid="talos-chat-media-access-b"]').text())
            .toMatch(/every chat/i)

        mediaActionMenu(wrapper, 'b').vm.$emit('select', 'share', false)
        await flushPromises()
        expect(setShared).toHaveBeenCalledWith('b', false)
    })

    it('LIB-SHARE-02 renders a withdrawn generated file as private and unchecked', () => {
        const { wrapper } = mountPanel({ files: [madeHerePrivate] })

        expect(mediaAction(wrapper, 'b-private', 'share').checked).toBe(false)
        expect(wrapper.get('[data-testid="talos-chat-media-access-b-private"]').text())
            .toMatch(/explicitly attached/i)
    })

    it('LIB-MENU-11 says plainly when a failed write did not change stored truth', async () => {
        const { wrapper } = mountPanel({
            setShared: vi.fn(async () => { throw new Error('storage unavailable') }),
        })
        mediaActionMenu(wrapper, 'a').vm.$emit('select', 'share', false)
        await flushPromises()
        expect(wrapper.get('[data-testid="talos-chat-media-error"]').text()).toMatch(/still where it was/i)
        expect(wrapper.get('[data-testid="talos-chat-media-access-a"]').text()).toMatch(/every chat/i)

        expect(mediaAction(wrapper, 'a', 'share').checked).toBe(true)
    })

    it('a second file can be toggled while the first write is still in flight', async () => {
        // The guard used to be one id for the whole panel, so the second tap was
        // dropped in silence — control one way, document the other.
        let release: (() => void) | null = null
        const setShared = vi.fn(() => new Promise<void>((resolve) => { release = resolve }))
        const { wrapper } = mountPanel({ setShared, files: [here, withdrawn] })
        mediaActionMenu(wrapper, 'a').vm.$emit('select', 'share', false)
        mediaActionMenu(wrapper, 'd').vm.$emit('select', 'share', true)
        await flushPromises()
        expect(setShared).toHaveBeenCalledTimes(2)
        release?.()
    })

    it('LIB-MENU-09 keeps access truth beside metadata and removes the bottom native switch', () => {
        const { wrapper } = mountPanel()
        const state = wrapper.get('[data-testid="talos-chat-media-access-a"]')

        expect(state.text()).toMatch(/every chat/i)
        expect(state.element.closest('[data-talos-library-name-button]')).not.toBeNull()
        expect(wrapper.find('input[role="switch"]').exists()).toBe(false)
        expect(wrapper.get('[data-testid="talos-chat-media-access-d"]').text())
            .toMatch(/explicitly attached/i)
    })

    it('P1-CTX-UI-03 exposes inherited mode and exact per-chat file overrides', async () => {
        const globalLibraryContextPolicy = {
            schema_version: 1 as const,
            revision: 1,
            enabled: true,
            mode: 'smart_relevant_v1' as const,
            included_file_ids: ['a'],
            excluded_file_ids: [],
            updated_at: '2026-07-29T12:00:00.000Z',
        }
        const sessionLibraryContextPolicy = {
            schema_version: 1 as const,
            revision: 2,
            enabled: null,
            mode: null,
            included_file_ids: [],
            excluded_file_ids: [],
            updated_at: '2026-07-29T12:01:00.000Z',
        }
        const {
            wrapper,
            setSessionLibraryContextPolicy,
        } = mountPanel({
            globalLibraryContextPolicy,
            sessionLibraryContextPolicy,
        })

        const summary = wrapper.get('[data-testid="talos-chat-media-context-policy"]')
        expect(summary.attributes('data-mode')).toBe('smart_relevant_v1')
        expect(summary.attributes('data-source')).toBe('inherited')
        expect(wrapper.get('[data-testid="talos-chat-media-context-state-a"]').text())
            .toMatch(/Inherited.*Included/i)

        mediaActionMenu(wrapper, 'a').vm.$emit('select', 'context-exclude', true)
        await flushPromises()
        expect(setSessionLibraryContextPolicy).toHaveBeenCalledWith(
            's1',
            {
                included_file_ids: [],
                excluded_file_ids: ['a'],
            },
            2,
        )
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

    it('opens the same document from its More menu', async () => {
        const { wrapper } = mountPanel()
        mediaActionMenu(wrapper, 'a').vm.$emit('select', 'open')
        await flushPromises()

        expect(wrapper.get('[data-testid="talos-chat-media-viewer"]').text())
            .toContain('totale 2196 euro')
    })

    it('saves the exact row bytes through the canonical device-export service', async () => {
        const readBytes = vi.fn(async () => new Uint8Array([1, 2, 3]))
        const { wrapper } = mountPanel({ readBytes })

        mediaActionMenu(wrapper, 'a').vm.$emit('select', 'save')
        await flushPromises()

        expect(readBytes).toHaveBeenCalledWith('a')
        expect(deviceSave.saveTalosVaultFileToDevice).toHaveBeenCalledWith({
            displayName: 'Fattura.pdf',
            mediaType: 'text/plain',
            bytes: new Uint8Array([1, 2, 3]),
        })
        expect(useTalosMobileToasts().items.value.at(-1)?.message).toMatch(/saved.+Fattura\.pdf/i)
    })

    it('keeps save available in the open viewer and reports cancellation honestly', async () => {
        deviceSave.saveTalosVaultFileToDevice.mockResolvedValue({
            status: 'cancelled',
            delivery: 'android-saf',
        })
        const { wrapper } = mountPanel()
        await wrapper.get('[data-testid="talos-chat-media-open-a"]').trigger('click')
        await flushPromises()

        await wrapper.get('[data-testid="talos-chat-media-viewer-save"]').trigger('click')
        await flushPromises()

        expect(deviceSave.saveTalosVaultFileToDevice).toHaveBeenCalledOnce()
        expect(useTalosMobileToasts().items.value.at(-1)?.message).toMatch(/no copy was saved/i)
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

    it('says "any chat", because the flag is global and pretending otherwise misleads', async () => {
        // `library_shared` is read against the whole vault with no session
        // predicate: switching it off here withdraws the document everywhere.
        const { wrapper } = mountPanel()
        expect(wrapper.text()).toContain('Available to every chat')
        expect(mediaAction(wrapper, 'a', 'share').label).toBe('Any chat may read it')
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
