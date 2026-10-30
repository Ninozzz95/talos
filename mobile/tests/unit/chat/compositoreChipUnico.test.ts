// @vitest-environment jsdom
/**
 * CHIP-01..05 — il chip unico «modello livello» del compositore (owner 27/10/2026, mockup approvato, versioni 6 e 7). Il ragionamento
 * non ha più una pillola sua nel compositore: sta nel piede del foglio «Modello e ragionamento», e il chip lo dice accanto al nome.
 * Prende il posto dei test della pillola J3 (composerReasoningPill, TalosMobileReasoningPill, pillolaTocco), cancellati con lei: i
 * significati che proteggevano restano qui (lo stato si legge anche senza vederlo, cambia col livello, «Auto» senza scelta) e nel
 * piede (PIEDE-01..08); PILL-TOCCO-03 diventa CHIP-05.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import TalosMobileComposer from '@/components/chat/TalosMobileComposer.vue'
import type { TalosMobileModelProfileView } from '@/components/chat/mobileChatTypes'
import { __resetSettingsStoreForTests } from '@/stores/settings'

const luna: TalosMobileModelProfileView = {
    id: 'chatgpt:gpt-6-luna', provider: 'chatgpt', model: 'gpt-6-luna', display_name: 'GPT-6-Luna', status: 'healthy', has_secret: true,
    effort_levels: ['off', 'low', 'medium', 'high'], supports_thinking: true, thinking_toggle: true, show_in_composer: true,
    capabilities: null, probe_ok: true,
}
const locale: TalosMobileModelProfileView = { ...luna, id: 'local:lfm', provider: 'local', model: 'lfm', display_name: 'LFM2.5', effort_levels: [] }

let w: VueWrapper | null = null
afterEach(() => { w?.unmount(); w = null; document.body.innerHTML = ''; __resetSettingsStoreForTests() })

// owner 27/10/2026, forma unica: compatto a riposo, la riga sotto il campo c'è col fuoco (FORMA-01)
async function monta(extra: Record<string, unknown> = {}) {
    w = mount(TalosMobileComposer, {
        attachTo: document.body,
        global: { stubs: { teleport: true } },
        props: {
            prompt: '', modelProfiles: [luna, locale], routingProfiles: [], selectedModelProfileId: luna.id, selectedRoutingProfileId: null,
            selectedEffort: 'high', thinking: true, canSend: true, sending: false, sendDisabledReason: '', dictationSupported: true, ...extra,
        },
    })
    await w.get('[data-testid="talos-composer-prompt"]').trigger('focus')
    // il nome breve arriva da un modulo caricato a parte (tetto dell'avvio, 28/10)
    await vi.dynamicImportSettled()
    await flushPromises()
    return w
}
const chip = (v: VueWrapper) => v.get('[data-testid="talos-composer-model-chip"]')

describe('CHIP il chip unico «modello livello»', () => {
    it('CHIP-01 dice il modello e il livello; la pillola del ragionamento non c\'è più', async () => {
        const v = await monta()
        // PILLOLA-01 (owner 28/10): il nome breve del modello, come il desktop (`nomeModelloUmano`)
        expect(chip(v).get('.talos-model-chip__nome').text()).toBe('gpt-6-luna')
        expect(chip(v).get('[data-testid="talos-composer-model-level"]').text()).toBe('High')
        expect(v.find('[data-testid="talos-composer-reasoning-pill"]').exists()).toBe(false)
    })

    it('CHIP-02 il livello sta anche nel nome accessibile, e cambia col livello', async () => {
        expect(chip(await monta({ selectedEffort: 'high' })).attributes('aria-label')).toContain('High')
        w?.unmount()
        expect(chip(await monta({ selectedEffort: 'low' })).attributes('aria-label')).toContain('Low')
    })

    it('CHIP-03 senza una scelta dice «Auto»; un modello senza livelli dice solo il nome', async () => {
        expect(chip(await monta({ selectedEffort: null })).get('[data-testid="talos-composer-model-level"]').text()).toBe('Auto')
        w?.unmount()
        const v = await monta({ selectedModelProfileId: locale.id, selectedEffort: null })
        expect(chip(v).text()).toContain('LFM2.5')
        expect(chip(v).find('[data-testid="talos-composer-model-level"]').exists()).toBe(false)
    })

    it("PILLOLA-01 il logo del fornitore e SOLO il nome del modello; il fornitore mai nel testo, il nome intero nel suggerimento del pulsante", async () => {
        const v = await monta({
            modelProfiles: [{ ...luna, id: 'openrouter:z-ai/glm-5.3-flash', provider: 'openrouter', model: 'z-ai/glm-5.3-flash', display_name: 'OpenRouter · Z.ai: GLM 5.3 Flash' }],
            selectedModelProfileId: 'openrouter:z-ai/glm-5.3-flash',
        })
        expect(chip(v).find('.talos-model-chip__logo').exists()).toBe(true)
        const nome = chip(v).get('.talos-model-chip__nome')
        expect(nome.text()).toBe('glm-5.3-flash')
        expect(chip(v).text()).not.toMatch(/OpenRouter|Z\.ai/u)
        expect(chip(v).attributes('title')).toBe('OpenRouter · Z.ai: GLM 5.3 Flash')
    })

    /*
     * PILLOLA-03 — difetto visto dall'owner sul Pad (vc346, 28/10, «guarda il pad in questo preciso momento»): il logo copriva l'inizio
     * del nome («anite 4.2…» invece di «granite…»). L'icona ha di suo `size-9` (36 px) e un `class="size-4"` da fuori non la batte (nel
     * CSS vince l'ordine di Tailwind, non quello degli attributi): usciva dal suo riquadro di 16 px. La forma per una riga di testo
     * esiste già, `compatto` (come l'elenco delle chat): niente riquadro da 36 px, niente bordo.
     */
    it('PILLOLA-03 il logo nella pillola è nella forma compatta, mai quella da 36 px che copre il nome', async () => {
        const v = await monta()
        const icona = chip(v).get('.talos-model-chip__logo .talos-mobile-provider-icon')
        expect(icona.attributes('data-compatto')).toBe('true')
        expect(icona.classes()).not.toContain('size-9')
        expect(icona.classes()).not.toContain('border')
    })

    it('PILLOLA-02 una rotta automatica dice il suo nome, senza logo', async () => {
        const v = await monta({ routingProfiles: [{ id: 'r1', name: 'Automatico', status: 'enabled', lane_count: 2 }], selectedRoutingProfileId: 'r1' })
        expect(chip(v).find('.talos-model-chip__logo').exists()).toBe(false)
        expect(chip(v).get('.talos-model-chip__nome').text()).toBe('Automatico')
    })

    it('CHIP-04 il chip apre «Modello e ragionamento»; il livello scelto nel piede risale dal compositore', async () => {
        const v = await monta()
        await chip(v).trigger('click')
        for (let i = 0; i < 6; i++) { await flushPromises(); await vi.dynamicImportSettled() }
        await vi.waitFor(() => expect(v.find('[data-testid="talos-model-drawer"]').exists()).toBe(true))
        expect(v.get('[data-testid="talos-model-drawer"]').text()).toContain('Model & reasoning')
        await v.get('[data-testid="talos-mobile-effort-slider-thumb"]').trigger('keydown', { key: 'Home' })
        expect(v.emitted('selectEffort')?.at(-1)).toEqual(['off'])
        // nella Chat il ragionamento esteso segue il livello (J3-bis)
        expect(v.emitted('selectThinking')?.at(-1)).toEqual([false])
    })

    it('CHIP-05 (era PILL-TOCCO-03) il fuoco che passa dal campo al chip, dentro il compositore, non lo richiude', async () => {
        const v = await monta({ docked: true })
        ;(v.get('[data-testid="talos-composer-prompt"]').element as HTMLTextAreaElement).focus()
        await flushPromises()
        ;(chip(v).element as HTMLButtonElement).focus()
        await flushPromises()
        expect(v.find('[data-testid="talos-composer-model-chip"]').exists()).toBe(true)
        expect(document.activeElement).toBe(chip(v).element)
    })
})
