// @vitest-environment jsdom
/**
 * TRANS-10 (28/10/2026, condizione del Desktop) — il regista della transizione arriva con `import()`: se il caricamento fallisce
 * (pacchetto rotto, aggiornamento a metà) il compositore resta a scatto per sempre, con UN avviso in console e nient'altro a schermo.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import TalosMobileComposer from '@/components/chat/TalosMobileComposer.vue'
import type { TalosMobileModelProfileView } from '@/components/chat/mobileChatTypes'
import { __resetSettingsStoreForTests } from '@/stores/settings'

vi.mock('@/composables/useTalosComposerFlip', () => { throw new Error('pacchetto rotto') })

const luna: TalosMobileModelProfileView = {
    id: 'chatgpt:gpt-6-luna', provider: 'chatgpt', model: 'gpt-6-luna', display_name: 'GPT-6-Luna', status: 'healthy', has_secret: true,
    effort_levels: ['off', 'low', 'medium', 'high'], supports_thinking: true, show_in_composer: true, capabilities: null, probe_ok: true,
}
afterEach(() => { document.body.innerHTML = ''; __resetSettingsStoreForTests(); vi.restoreAllMocks() })

describe('TRANS-10 il regista che non arriva', () => {
    it('TRANS-10 import rifiutato: un avviso solo, e il compositore si apre e si chiude a scatto come sempre', async () => {
        const avvisi = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const errori = vi.spyOn(console, 'error').mockImplementation(() => {})
        const v = mount(TalosMobileComposer, {
            attachTo: document.body,
            global: { stubs: { teleport: true } },
            props: {
                prompt: '', modelProfiles: [luna], routingProfiles: [], selectedModelProfileId: luna.id, selectedRoutingProfileId: null,
                selectedEffort: 'high', thinking: true, canSend: true, sending: false, sendDisabledReason: '', dictationSupported: true, docked: true,
            },
        })
        const radice = v.get('[data-testid="talos-mobile-composer"]')
        await radice.trigger('pointerdown')
        for (let i = 0; i < 3; i++) { await vi.dynamicImportSettled(); await flushPromises() }
        await radice.trigger('pointerdown')
        for (let i = 0; i < 3; i++) { await vi.dynamicImportSettled(); await flushPromises() }
        expect(avvisi.mock.calls.filter(([m]) => String(m).includes('transizione del compositore'))).toHaveLength(1)
        expect(errori).not.toHaveBeenCalled()
        await v.get('[data-testid="talos-composer-prompt"]').trigger('focus')
        await flushPromises()
        expect(radice.attributes('data-talos-composer-compact')).toBe('false')
        expect(v.find('[data-testid="talos-composer-tools"]').exists()).toBe(true)
        await v.get('[data-testid="talos-composer-prompt"]').trigger('blur')
        await flushPromises()
        expect(radice.attributes('data-talos-composer-compact')).toBe('true')
        v.unmount()
    })
})
