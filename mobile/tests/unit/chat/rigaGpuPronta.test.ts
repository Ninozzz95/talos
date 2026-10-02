// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive } from 'vue'

/**
 * ⭐ Punto 2 (01/10/2026) — owner: «Sì» alla riga onesta mentre la GPU compila i suoi programmi (prima apertura a
 * cache vuota, ~16 s sul Pad in release, 41-69 s nella build debuggable). Prima lo schermo diceva solo «sto avviando il modello» per tutto quel tempo.
 */
const statoChat = vi.hoisted(() => ({
    state: null as unknown as { sending: boolean, streamingText: string | null, streamingSessionId: string | null },
}))
vi.mock('@/stores/chatController', () => ({
    useChatController: () => ({
        chat: { state: statoChat.state, activeSession: { value: { id: 's1', title: 'A' } } },
        toolActivity: { value: [] },
    }),
}))
vi.mock('@/stores/settings', () => ({
    useSettingsStore: () => ({ state: { shell: { streaming_animation: 'typewriter' } } }),
}))
const motore = vi.hoisted(() => ({
    stato: { fraction: null as number | null, preparingGpu: false },
}))
vi.mock('@/services/localEngine', () => ({
    talosLocalModelLoadState: vi.fn(async () => motore.stato),
    talosLocalModelLoadProgress: vi.fn(async () => motore.stato.fraction),
    talosCancelLocalModelLoad: vi.fn(async () => true),
}))

import TalosMobileStreamingReply from '@/components/chat/TalosMobileStreamingReply.vue'

function monta() {
    statoChat.state = reactive({ sending: true, streamingText: null, streamingSessionId: 's1' })
    return mount(TalosMobileStreamingReply)
}

describe('GPU pronta — la riga onesta', () => {
    it('GPU-09a mentre la GPU compila, lo dice', async () => {
        motore.stato = { fraction: null, preparingGpu: true }
        const wrapper = monta()
        await vi.waitFor(() => {
            expect(wrapper.find('[data-testid="talos-local-gpu-preparing"]').exists()).toBe(true)
        }, { timeout: 3000 })
        expect(wrapper.get('[data-testid="talos-local-gpu-preparing"]').text())
            .toBe('Preparing the GPU for the first time…')
    })

    it('GPU-09b a GPU già pronta la riga non c\'è', async () => {
        motore.stato = { fraction: 0.4, preparingGpu: false }
        const wrapper = monta()
        await vi.waitFor(() => {
            expect(wrapper.find('[data-testid="talos-local-load-progress"]').exists()).toBe(true)
        }, { timeout: 3000 })
        expect(wrapper.find('[data-testid="talos-local-gpu-preparing"]').exists()).toBe(false)
    })
})
