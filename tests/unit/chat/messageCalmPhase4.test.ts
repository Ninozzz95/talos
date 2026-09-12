// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { reactive, ref } from 'vue'
import TalosMobileMessageList from '@/components/chat/TalosMobileMessageList.vue'
import TalosMobileMessageFile from '@/components/chat/TalosMobileMessageFile.vue'
import type { TalosMobileMessageView, TalosMobileMessageAttachmentView } from '@/components/chat/mobileChatTypes'
import { TALOS_MOTION_V6_DEFAULTS } from '@/motion-v6/defaults'
import { talosCalmMotionTokens } from '@/composables/useTalosCalmMotion'

const ports = vi.hoisted(() => ({ edit: vi.fn(), hydrateText: vi.fn(), previewBytes: vi.fn() }))
vi.mock('@/stores/chatController', () => ({ useChatController: () => ({
    chat: { state: reactive({ sending: false, streamingSessionId: null }), activeSession: ref({ id: 's1' }) },
    toolActivity: ref([]), editUserMessage: ports.edit,
    attachments: { hydrateText: ports.hydrateText, previewBytes: ports.previewBytes },
}) }))

const msg = (id: string, role: 'user' | 'assistant', extra = {}): TalosMobileMessageView => ({
    id, role, content: '**Testo**', created_at: '2026-09-12T16:00:00Z', state: 'persisted',
    metadata: {}, model_profile_id: null, run_id: null, ...extra,
})
const attachment: TalosMobileMessageAttachmentView = {
    id: 'binding', vault_file_id: 'file', grant_id: 'grant', display_name: 'report.md',
    media_type: 'text/markdown', size_bytes: 4096, permissions: ['model.read'], grant_status: 'active',
}
const mounted: Array<{ unmount(): void }> = []
beforeEach(() => { vi.resetAllMocks(); ports.edit.mockResolvedValue(undefined) })
afterEach(() => { mounted.splice(0).forEach(w => w.unmount()); document.body.innerHTML = '' })
async function list(messages: TalosMobileMessageView[], extra = {}) {
    const wrapper = mount(TalosMobileMessageList, { attachTo: document.body, props: { messages, sending: false, ...extra } })
    mounted.push(wrapper)
    await vi.dynamicImportSettled()
    await flushPromises()
    return wrapper
}

describe('Fase 4 — messaggi Calm', () => {
    it('ogni risposta consecutiva ha marchio vero, meta sopra, markdown e tutte le azioni', async () => {
        const wrapper = await list([msg('u', 'user'), msg('a1', 'assistant'), msg('a2', 'assistant')])
        for (const id of ['a1', 'a2']) {
            const article = wrapper.get(`[data-message-id="${id}"]`)
            expect(article.get('.talos-short-logo-mark').exists()).toBe(true)
            expect(article.get('.assistant-text strong').text()).toBe('Testo')
            expect(article.get('.assistant-header').element.compareDocumentPosition(article.get('.assistant-text').element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
            for (const action of ['copy', 'speak', 'retry', 'save', 'overflow']) expect(article.find(`[data-testid="talos-message-${action}"]`).exists()).toBe(true)
        }
        const user = wrapper.get('[data-message-id="u"]')
        expect(user.find('.user-bubble').exists()).toBe(true)
        expect(user.find('.user-actions [data-testid="talos-message-edit"]').exists()).toBe(true)
        expect(user.find('[data-testid="talos-message-speak"]').exists()).toBe(false)
    })
    it('distingue risposta interrotta, limite output e risposta normale; conserva il parziale', async () => {
        const wrapper = await list([msg('stop', 'assistant', { metadata: { interrupted: true } }), msg('ok', 'assistant')])
        expect(wrapper.findAll('[data-testid="talos-message-interrupted"]')).toHaveLength(1)
        expect(wrapper.get('[data-message-id="stop"] strong').text()).toBe('Testo')
        expect(wrapper.find('[data-testid="talos-risposta-troncata"]').exists()).toBe(false)
    })
    it('conserva stato e copia anche per i messaggi pending già nella trascrizione', async () => {
        const wrapper = await list([msg('pending', 'assistant', { state: 'pending' })])
        expect(wrapper.find('[data-testid="talos-message-actions"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="talos-message-copy"]').exists()).toBe(true)
        expect(wrapper.text()).toContain('pending')
    })
    it('Modifica a metà richiede conferma, Annulla non chiama il controller, conferma cattura id e coda', async () => {
        const wrapper = await list([msg('u', 'user'), msg('a', 'assistant')])
        await wrapper.get('[data-testid="talos-message-edit"]').trigger('click')
        await vi.dynamicImportSettled(); await flushPromises()
        expect(ports.edit).not.toHaveBeenCalled()
        document.body.querySelector<HTMLButtonElement>('[data-testid="talos-message-edit-cancel"]')!.click()
        await flushPromises()
        expect(ports.edit).not.toHaveBeenCalled()
        expect(document.querySelector('[data-testid="talos-confirm-dialog"]')).toBeNull()
        await wrapper.get('[data-testid="talos-message-edit"]').trigger('click')
        await flushPromises()
        document.body.querySelector<HTMLButtonElement>('[data-testid="talos-message-edit-confirm"]')!.click()
        await flushPromises()
        expect(ports.edit).toHaveBeenCalledExactlyOnceWith('s1', 'u', 'a')
    })
    it('Modifica ultimo messaggio senza turni successivi non chiede conferma', async () => {
        const wrapper = await list([msg('u', 'user')])
        await wrapper.get('[data-testid="talos-message-edit"]').trigger('click')
        await vi.dynamicImportSettled(); await flushPromises()
        expect(ports.edit).toHaveBeenCalledExactlyOnceWith('s1', 'u', 'u')
        expect(document.querySelector('[data-testid="talos-confirm-dialog"]')).toBeNull()
    })
    it('conserva la preferenza bolle come variante della superficie Calm', async () => {
        const wrapper = await list([msg('a', 'assistant')], { messageStyle: 'bubbles' })
        expect(wrapper.find('.assistant-text.assistant-bubble').exists()).toBe(true)
        await wrapper.setProps({ messageStyle: 'sections' })
        expect(wrapper.find('.assistant-text').exists()).toBe(true)
        expect(wrapper.find('.assistant-bubble').exists()).toBe(false)
    })
})

describe('Fase 4 — file prodotti', () => {
    async function file(value = attachment) {
        const wrapper = mount(TalosMobileMessageFile, { props: { attachment: value }, global: { stubs: { teleport: true } } })
        mounted.push(wrapper); await flushPromises(); return wrapper
    }
    it('apre il file della Libreria, conserva nome/formato/dimensione e rende markdown vero', async () => {
        ports.hydrateText.mockResolvedValue('# Rapporto\n\n**Verificato**')
        const wrapper = await file()
        expect(ports.hydrateText).toHaveBeenCalledWith('file')
        expect(wrapper.text()).toContain('report.md')
        expect(wrapper.text()).toContain('MD · 4 KB')
        await wrapper.get('[data-testid="talos-message-file-open"]').trigger('click')
        expect(wrapper.get('[data-testid="talos-message-file-preview"] .talos-message-content h2').text()).toBe('Rapporto')
        expect(wrapper.get('[data-testid="talos-message-file-preview"] strong').text()).toBe('Verificato')
    })
    it('HTML ha un’anteprima vera isolata, senza script o riferimenti di rete', async () => {
        ports.previewBytes.mockResolvedValue(new TextEncoder().encode('<h1>Rapporto</h1><script>fetch("https://example.com")</script><img src="https://example.com/x"><a href="https://example.com">Link</a>'))
        const wrapper = await file({ ...attachment, media_type: 'text/html', display_name: 'report.html' })
        await wrapper.get('[data-testid="talos-message-file-open"]').trigger('click')
        const preview = wrapper.get('[data-testid="talos-message-file-html"]')
        expect(preview.attributes('sandbox')).toBe('')
        expect(preview.attributes('srcdoc')).toContain('<h1>Rapporto</h1>')
        expect(preview.attributes('srcdoc')).toContain("default-src 'none'")
        expect(preview.attributes('srcdoc')).not.toMatch(/<script|https:\/\//)
    })
    it('file non leggibile: scheda presente e motivo visibile in anteprima', async () => {
        ports.hydrateText.mockResolvedValue(null)
        const wrapper = await file({ ...attachment, grant_status: 'revoked' })
        expect(wrapper.text()).toContain('Access revoked')
        await wrapper.get('[data-testid="talos-message-file-open"]').trigger('click')
        expect(wrapper.find('[data-testid="talos-message-file-unavailable"]').exists()).toBe(true)
    })
})

it('orb a 1500 ms e risposta a 184 ms; riduzione e categoria Messaggi fermano entrambi', () => {
    const tokens = talosCalmMotionTokens({ preferences: TALOS_MOTION_V6_DEFAULTS, reducedMotion: false })
    expect(tokens['--talos-motion-calm-orb']).toBe('1500ms')
    expect(tokens['--talos-motion-calm-answer']).toBe('184ms')
    for (const reducedMotion of [true, false]) {
        const off = talosCalmMotionTokens({ reducedMotion, preferences: { ...TALOS_MOTION_V6_DEFAULTS, interface: { ...TALOS_MOTION_V6_DEFAULTS.interface, categories: { ...TALOS_MOTION_V6_DEFAULTS.interface.categories, messages: false } } } })
        expect(off['--talos-motion-calm-orb']).toBe('0ms')
        expect(off['--talos-motion-calm-answer']).toBe('0ms')
        expect(off['--talos-motion-calm-orb-state']).toBe('paused')
    }
})
