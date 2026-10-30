// @vitest-environment jsdom
/**
 * NUOVO-01..10 — il compositore del mockup approvato dall'owner (27/10/2026, «Approvato», versione 6; posti della versione 7 approvati il
 * 28/10, «Vanno bene»). Copia su disco: `.claude/mockup/compositore-v7-approvato-2026-10-28/`.
 *   · A riposo UNA riga: «+» · campo · [scudo, solo se chiesto] · microfono · invio (spento a campo vuoto). Anche con una bozza.
 *   · Aperto (col fuoco): il campo sopra a tutta larghezza, in alto a destra scudo ed «Espandi»; sotto «+» · chip · Libreria · … ·
 *     microfono (o Accoda) · invio (o Ferma, senza numeri).
 *   · «Rivedi N azioni» in una riga sua in cima, a riposo e aperto: un permesso in attesa non sparisce mai dalla vista.
 * Il campo è sempre LO STESSO elemento: aprire non lo rimonta (sennò perderebbe il fuoco e il compositore si richiuderebbe).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { h } from 'vue'
import TalosMobileComposer from '@/components/chat/TalosMobileComposer.vue'
import type { TalosMobileModelProfileView } from '@/components/chat/mobileChatTypes'
import { __resetSettingsStoreForTests } from '@/stores/settings'

const luna: TalosMobileModelProfileView = {
    id: 'chatgpt:gpt-6-luna', provider: 'chatgpt', model: 'gpt-6-luna', display_name: 'GPT-6-Luna', status: 'healthy', has_secret: true,
    effort_levels: ['off', 'low', 'medium', 'high'], supports_thinking: true, show_in_composer: true, capabilities: null, probe_ok: true,
}

let w: VueWrapper | null = null
afterEach(() => { w?.unmount(); w = null; document.body.innerHTML = ''; __resetSettingsStoreForTests(); vi.restoreAllMocks() })

function monta(extra: Record<string, unknown> = {}, slots: Record<string, () => unknown> = {}) {
    w = mount(TalosMobileComposer, {
        attachTo: document.body,
        global: { stubs: { teleport: true } },
        props: {
            prompt: '', modelProfiles: [luna], routingProfiles: [], selectedModelProfileId: luna.id, selectedRoutingProfileId: null,
            selectedEffort: 'high', thinking: true, canSend: true, sending: false, sendDisabledReason: '', dictationSupported: true,
            docked: true, ...extra,
        },
        slots,
    })
    return w
}
const sel = {
    radice: '[data-testid="talos-mobile-composer"]',
    campo: '[data-testid="talos-composer-prompt"]',
    piu: '[data-testid="talos-composer-plus"]',
    microfono: '[data-testid="talos-composer-mic"]',
    azione: '[data-testid="talos-composer-action"]',
    accoda: '[data-testid="talos-composer-queue"]',
    fila: '[data-testid="talos-composer-tools"]',
    chip: '[data-testid="talos-composer-model-chip"]',
    alto: '[data-testid="talos-composer-alto"]',
    rivedi: '[data-testid="talos-composer-tool-review"]',
    espandi: '[data-testid="talos-composer-expand"]',
}
const aRiposo = (v: VueWrapper) => v.get(sel.radice).attributes('data-talos-composer-compact') === 'true'
async function fuoco(v: VueWrapper) { (v.get(sel.campo).element as HTMLTextAreaElement).focus(); await flushPromises() }

describe('NUOVO il compositore del mockup approvato', () => {
    it('NUOVO-01 a riposo una riga: «+», campo, microfono e invio spento; niente chip', () => {
        const v = monta()
        expect(aRiposo(v)).toBe(true)
        for (const s of [sel.piu, sel.campo, sel.microfono, sel.azione]) expect(v.find(s).exists(), s).toBe(true)
        expect(v.get(sel.azione).attributes('aria-label')).toBe('Send message')
        expect((v.get(sel.azione).element as HTMLButtonElement).disabled).toBe(true)
        expect(v.find(sel.fila).exists()).toBe(false)
    })

    it('NUOVO-02 una bozza senza fuoco resta a riposo, su una riga, con l\'invio acceso', () => {
        const v = monta({ prompt: 'Aggiungi un test per gli slug con le emoji' })
        expect(aRiposo(v)).toBe(true)
        expect((v.get(sel.azione).element as HTMLButtonElement).disabled).toBe(false)
        expect(v.find(sel.microfono).exists()).toBe(true)
    })

    it('NUOVO-03 col fuoco si apre: il campo è lo STESSO elemento, sotto la fila col chip, microfono e invio', async () => {
        const v = monta()
        const campoPrima = v.get(sel.campo).element
        await fuoco(v)
        expect(aRiposo(v)).toBe(false)
        expect(v.get(sel.campo).element).toBe(campoPrima)
        expect(document.activeElement).toBe(campoPrima)
        expect(v.find(sel.fila).find(sel.chip).exists()).toBe(true)
        expect(v.find(sel.microfono).exists()).toBe(true)
        expect(v.find(sel.azione).exists()).toBe(true)
    })

    it('NUOVO-04 durante il giro: microfono e Ferma, senza numeri nel Ferma', () => {
        const v = monta({ sending: true })
        expect(v.get(sel.azione).attributes('aria-label')).toBe('Stop response')
        expect(v.get(sel.azione).text()).not.toMatch(/\d/u)
        expect(v.find(sel.microfono).exists()).toBe(true)
    })

    it('NUOVO-05 col testo durante il giro Accoda prende il posto del microfono (B3 invariato)', () => {
        const v = monta({ sending: true, canQueue: true, prompt: 'Poi aggiorna il README' })
        expect(v.find(sel.accoda).exists()).toBe(true)
        expect(v.find(sel.microfono).exists()).toBe(false)
        expect(v.get(sel.azione).attributes('data-talos-action')).toBe('stop')
    })

    it('NUOVO-06 il microfono è un comando suo: detta; senza dettatura è spento e la ragione è scritta', async () => {
        const v = monta()
        await v.get(sel.microfono).trigger('click')
        expect(v.emitted('toggleDictation')).toHaveLength(1)
        w?.unmount()
        const spento = monta({ dictationSupported: false })
        expect((spento.get(sel.microfono).element as HTMLButtonElement).disabled).toBe(true)
        expect(spento.find('[data-testid="talos-composer-mic-reason"]').exists()).toBe(true)
    })

    it('NUOVO-07 «Rivedi N azioni» sta in una riga sua in cima, anche a riposo, e non apre il compositore', async () => {
        const v = monta({ toolReviewCount: 1 })
        expect(aRiposo(v)).toBe(true)
        const rivedi = v.get(sel.rivedi)
        const radice = v.get(sel.radice).element
        const campo = v.get(sel.campo).element
        expect(rivedi.element.compareDocumentPosition(campo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        expect(v.find(sel.fila).exists()).toBe(false)
        expect(radice.contains(rivedi.element)).toBe(true)
        await rivedi.trigger('click')
        expect(v.emitted('reviewTools')).toHaveLength(1)
    })

    it('NUOVO-08 «Espandi» sta in alto a destra, solo aperto e col testo alto', async () => {
        vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get').mockReturnValue(400)
        const v = monta({ prompt: 'riga\nriga\nriga\nriga\nriga' })
        await fuoco(v)
        await v.get(sel.campo).trigger('input')
        await flushPromises()
        expect(v.get(sel.alto).find(sel.espandi).exists()).toBe(true)
        expect(v.find(sel.fila).find(sel.espandi).exists()).toBe(false)
    })

    it('NUOVO-09 lo scudo (slot «permesso»): aperto sempre, in alto a destra; a riposo solo se chi monta lo chiede', async () => {
        const scudo = { permesso: () => h('button', { 'data-testid': 'scudo' }, 'S') }
        const v = monta({}, scudo)
        expect(v.find('[data-testid="scudo"]').exists()).toBe(false)
        await fuoco(v)
        expect(v.get(sel.alto).find('[data-testid="scudo"]').exists()).toBe(true)
        w?.unmount()
        const pieno = monta({ permessoARiposo: true }, scudo)
        expect(aRiposo(pieno)).toBe(true)
        expect(pieno.find('[data-testid="scudo"]').exists()).toBe(true)
    })

    it('NUOVO-10 il fuoco che passa dal campo a un comando del compositore non lo richiude (CHIP-05, ex PILL-TOCCO-03)', async () => {
        const v = monta()
        await fuoco(v)
        ;(v.get(sel.chip).element as HTMLButtonElement).focus()
        await flushPromises()
        expect(aRiposo(v)).toBe(false)
    })
})
