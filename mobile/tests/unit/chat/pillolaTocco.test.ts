// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { __resetSettingsStoreForTests } from '@/stores/settings'
import TalosMobileComposer from '@/components/chat/TalosMobileComposer.vue'
import type { TalosMobileModelProfileView } from '@/components/chat/mobileChatTypes'

/*
 * ⛔ PILL-TOCCO-01 (J3-ter, difetto trovato sul Pad, build vc190, traccia via CDP): Chat, GPT-6-Luna, compositore IMMERSIVO a
 * campo vuoto. Il tocco sulla pillola del ragionamento apriva il menu, il menu metteva il fuoco sulla sua prima voce, il campo
 * perdeva il fuoco, il compositore tornava compatto e la fila delle pillole si smontava col menu dentro:
 *   pointerdown pill@291 → click pill@294 → focusout prompt@314 → focusin level@314 → focusout level@317 → menu=false, pill=false.
 * Qui la stessa scena sul compositore VERO (lo stesso di Chat e Codice).
 */
const profilo: TalosMobileModelProfileView = {
    id: 'openrouter:gpt-6-luna', provider: 'openrouter', model: 'openai/gpt-6-luna', display_name: 'GPT-6-Luna', status: 'healthy',
    has_secret: true, effort_levels: ['low', 'medium', 'high', 'xhigh', 'max'], supports_thinking: true, thinking_toggle: true,
    show_in_composer: true, capabilities: null, probe_ok: true,
}

let w: VueWrapper | null = null
afterEach(() => {
    vi.restoreAllMocks()
    w?.unmount()
    w = null
    document.body.innerHTML = ''
    __resetSettingsStoreForTests()
})

async function immersivo() {
    w = mount(TalosMobileComposer, {
        attachTo: document.body,
        global: { stubs: { teleport: true } },
        props: {
            prompt: '', modelProfiles: [profilo], selectedModelProfileId: profilo.id, selectedEffort: 'off', thinking: false,
            canSend: true, sending: false, docked: true, immersiveComposer: true,
        },
    })
    await flushPromises()
    return w
}
const sel = {
    campo: '[data-testid="talos-composer-prompt"]',
    fila: '[data-testid="talos-composer-tools"]',
    pillola: '[data-testid="talos-composer-reasoning-pill"]',
    menu: '[data-testid="talos-reasoning-menu"]',
    voce: '[data-testid="talos-reasoning-level"]',
}
const attivo = () => document.activeElement as HTMLElement | null
/*
 * Chromium (e il WebView del Pad, traccia «focusout level@317») emette `blur`/`focusout` verso nessuno quando l'elemento col fuoco
 * esce dal DOM; jsdom no. Qui lo si rifà: senza, l'ordine «prima il fuoco, poi si smonta il menu» non sarebbe provato.
 */
function comeChromium() {
    const vero = Node.prototype.removeChild
    vi.spyOn(Node.prototype, 'removeChild').mockImplementation(function (this: Node, figlio: Node) {
        const a = document.activeElement
        if (a && a !== document.body && figlio.contains(a)) {
            a.dispatchEvent(new FocusEvent('blur', { relatedTarget: null }))
            a.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }))
        }
        return vero.call(this, figlio) as never
    })
}
async function assesta() { for (let i = 0; i < 6; i++) { await flushPromises(); await vi.dynamicImportSettled() } }

describe('la pillola del ragionamento nel compositore immersivo (J3-ter)', () => {
    it('PILL-TOCCO-01 il menu resta aperto mentre il fuoco passa dal campo alla prima voce; si richiude solo col fuoco fuori', async () => {
        const v = await immersivo()
        // a riposo: una riga sola
        expect(v.find(sel.fila).exists()).toBe(false)

        // fuoco nel campo: la fila compare
        ;(v.get(sel.campo).element as HTMLTextAreaElement).focus()
        await flushPromises()
        expect(v.find(sel.pillola).exists()).toBe(true)

        // tocco sulla pillola: il menu si apre e la sua prima voce prende il fuoco (il campo lo perde, come sul Pad)
        await v.get(sel.pillola).trigger('pointerdown', { pointerType: 'touch' })
        await v.get(sel.pillola).trigger('click')
        await assesta()
        expect(attivo()?.getAttribute('data-testid')).toBe('talos-reasoning-level')
        expect(attivo()).not.toBe(v.get(sel.campo).element)
        // menu e pillola restano montati
        expect(v.find(sel.menu).exists()).toBe(true)
        expect(v.find(sel.pillola).exists()).toBe(true)
        expect(v.get('[data-testid="talos-mobile-composer"]').attributes('data-talos-composer-compact')).toBe('false')

        // una scelta col DITO: il menu si chiude, la pillola resta visibile e ha il fuoco (J3-bis: niente tastiera)
        const voce = v.get(`${sel.voce}[data-livello="low"]`)
        await voce.trigger('pointerdown', { pointerType: 'touch' })
        await voce.trigger('click')
        await assesta()
        expect(v.emitted('selectEffort')).toEqual([['low']])
        expect(v.find(sel.menu).exists()).toBe(false)
        expect(v.find(sel.pillola).exists()).toBe(true)
        expect(attivo()).toBe(v.get(sel.pillola).element)

        // il fuoco esce davvero dal compositore: torna compatto
        const fuori = document.createElement('button')
        document.body.appendChild(fuori)
        fuori.focus()
        await flushPromises()
        expect(v.find(sel.fila).exists()).toBe(false)
        expect(v.get('[data-testid="talos-mobile-composer"]').attributes('data-talos-composer-compact')).toBe('true')
    })

    it('PILL-TOCCO-02 un tocco fuori col menu aperto lo chiude e il compositore torna compatto', async () => {
        const v = await immersivo()
        ;(v.get(sel.campo).element as HTMLTextAreaElement).focus()
        await flushPromises()
        await v.get(sel.pillola).trigger('click')
        await assesta()
        expect(v.find(sel.menu).exists()).toBe(true)

        const fuori = document.createElement('div')
        document.body.appendChild(fuori)
        fuori.dispatchEvent(new Event('pointerdown', { bubbles: true }))
        ;(document.activeElement as HTMLElement | null)?.blur()
        await flushPromises()
        expect(v.find(sel.menu).exists()).toBe(false)
        expect(v.find(sel.fila).exists()).toBe(false)
    })

    it('PILL-TOCCO-04 come sul WebView (focusout quando la voce col fuoco si smonta): dopo la scelta col dito la pillola resta', async () => {
        comeChromium()
        const v = await immersivo()
        ;(v.get(sel.campo).element as HTMLTextAreaElement).focus()
        await flushPromises()
        await v.get(sel.pillola).trigger('click')
        await assesta()
        const voce = v.get(`${sel.voce}[data-livello="medium"]`)
        await voce.trigger('pointerdown', { pointerType: 'touch' })
        await voce.trigger('click')
        await assesta()
        expect(v.find(sel.menu).exists()).toBe(false)
        expect(v.find(sel.pillola).exists()).toBe(true)
        expect(attivo()).toBe(v.get(sel.pillola).element)
    })

    it('PILL-TOCCO-06 (REV6-J1) con la PENNA come col dito: dopo la scelta il fuoco resta sulla pillola, il campo non apre la tastiera', async () => {
        comeChromium()
        const v = await immersivo()
        ;(v.get(sel.campo).element as HTMLTextAreaElement).focus()
        await flushPromises()
        await v.get(sel.pillola).trigger('click')
        await assesta()
        const voce = v.get(`${sel.voce}[data-livello="medium"]`)
        await voce.trigger('pointerdown', { pointerType: 'pen' })
        await voce.trigger('click')
        await assesta()
        expect(v.find(sel.menu).exists()).toBe(false)
        expect(attivo()).toBe(v.get(sel.pillola).element)
        expect(attivo()).not.toBe(v.find(sel.campo).element ?? null)
    })

    it('PILL-TOCCO-05 col menu aperto un focusout verso nessuno (la finestra perde il fuoco: tendina, altra app) non smonta il menu', async () => {
        const v = await immersivo()
        ;(v.get(sel.campo).element as HTMLTextAreaElement).focus()
        await flushPromises()
        await v.get(sel.pillola).trigger('click')
        await assesta()
        attivo()?.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }))
        await flushPromises()
        expect(v.find(sel.menu).exists()).toBe(true)
        expect(v.find(sel.pillola).exists()).toBe(true)
    })

    it('PILL-TOCCO-03 il fuoco che passa dal campo a un altro elemento DEL compositore non lo richiude', async () => {
        const v = await immersivo()
        ;(v.get(sel.campo).element as HTMLTextAreaElement).focus()
        await flushPromises()
        ;(v.get(sel.pillola).element as HTMLButtonElement).focus()
        await flushPromises()
        expect(v.find(sel.pillola).exists()).toBe(true)
        expect(attivo()).toBe(v.get(sel.pillola).element)
    })
})
