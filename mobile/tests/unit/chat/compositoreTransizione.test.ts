// @vitest-environment jsdom
/**
 * TRANS-01..07 — D2, owner 28/10/2026 dal Pad: «L'animazione di quando va in compatto e esteso e viceversa non deve essere scattosa,
 * deve essere una transizione sobria e smooth». Ricerca: `.claude/ragionamento/RICERCA-TRANSIZIONE-COMPOSITORE-2026-10-28.md`.
 * jsdom non fa layout e non ha `animate`: qui si provano il CONTRATTO del FLIP (cosa si anima, da dove a dove, quanto, quando si ferma)
 * con misure finte; la morbidezza si prova sul Pad, in tutte e quattro le configurazioni.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import TalosMobileComposer from '@/components/chat/TalosMobileComposer.vue'
import type { TalosMobileModelProfileView } from '@/components/chat/mobileChatTypes'
import { __resetSettingsStoreForTests } from '@/stores/settings'

const luna: TalosMobileModelProfileView = {
    id: 'chatgpt:gpt-6-luna', provider: 'chatgpt', model: 'gpt-6-luna', display_name: 'GPT-6-Luna', status: 'healthy', has_secret: true,
    effort_levels: ['off', 'low', 'medium', 'high'], supports_thinking: true, show_in_composer: true, capabilities: null, probe_ok: true,
}
const CALMA = 'cubic-bezier(0.22, 0.8, 0.24, 1)'

interface Finta { playState: string; currentTime: number; el: Element; fotogrammi: Keyframe[]; opzioni: KeyframeAnimationOptions; cancel: ReturnType<typeof vi.fn>; finisci: () => void; finished: Promise<unknown> }
let animazioni: Finta[] = []
/** Il fondo della scheda aperta: 766 di serie; la tastiera lo porta a 466 (la WebView salta in un colpo solo). */
let fondoAperto = 766

function rettangolo(left: number, bottom: number, width: number, height: number): DOMRect {
    return { left, right: left + width, top: bottom - height, bottom, width, height, x: left, y: bottom - height, toJSON: () => ({}) } as DOMRect
}
function misuraFinta(this: Element): DOMRect {
    const radice = document.querySelector('[data-testid="talos-mobile-composer"]')
    const aperto = radice?.getAttribute('data-talos-composer-compact') === 'false'
    const fondo = aperto ? fondoAperto : 766
    if (this === radice) return rettangolo(0, fondo, 380, aperto ? 106 : 66)
    const el = this as HTMLElement
    const chi = el.dataset?.talosFlip ?? el.dataset?.talosFlipNuovo
    if (chi === 'piu') return rettangolo(8, fondo - 11, 44, 44)
    if (chi === 'campo') return aperto ? rettangolo(12, fondo - 62, 340, 28) : rettangolo(56, fondo - 19, 200, 28)
    if (chi === 'microfono') return rettangolo(276, fondo - 11, 44, 44)
    if (chi === 'azione') return rettangolo(324, fondo - 11, 44, 44)
    if (chi === 'strumenti') return rettangolo(56, fondo - 11, 150, 44)
    return rettangolo(0, 0, 0, 0)
}

beforeEach(() => {
    animazioni = []
    fondoAperto = 766
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(misuraFinta)
    ;(Element.prototype as unknown as { animate: unknown }).animate = vi.fn(function (this: Element, fotogrammi: Keyframe[], opzioni: KeyframeAnimationOptions) {
        let finisci!: () => void
        let rifiuta!: (e: unknown) => void
        const finished = new Promise((ok, no) => { finisci = () => ok(undefined); rifiuta = no })
        finished.catch(() => {})
        const a: Finta = { playState: 'running', currentTime: 0, el: this, fotogrammi, opzioni, cancel: vi.fn(() => rifiuta(new Error('AbortError'))), finisci, finished }
        animazioni.push(a)
        return a as unknown as Animation
    })
})
let w: VueWrapper | null = null
afterEach(() => {
    w?.unmount(); w = null; document.body.innerHTML = ''; __resetSettingsStoreForTests(); vi.restoreAllMocks()
    delete (Element.prototype as unknown as { animate?: unknown }).animate
    delete (window as unknown as { matchMedia?: unknown }).matchMedia
})

function monta() {
    w = mount(TalosMobileComposer, {
        attachTo: document.body,
        // la Transition vera: @vue/test-utils la sostituisce con uno stub, e l'uscita in dissolvenza non passerebbe dal suo aggancio
        global: { stubs: { teleport: true, transition: false } },
        props: {
            prompt: '', modelProfiles: [luna], routingProfiles: [], selectedModelProfileId: luna.id, selectedRoutingProfileId: null,
            selectedEffort: 'high', thinking: true, canSend: true, sending: false, sendDisabledReason: '', dictationSupported: true, docked: true,
        },
    })
    return w
}
/** Il regista sta fuori dal pezzo d'avvio (28/10/2026): arriva al primo tocco sul compositore, come nell'app. */
async function caricaIlRegista(v: VueWrapper) {
    await v.get('[data-testid="talos-mobile-composer"]').trigger('pointerdown')
    for (let i = 0; i < 3; i++) { await vi.dynamicImportSettled(); await flushPromises() }
}
async function montaPronto() { const v = monta(); await caricaIlRegista(v); return v }
const scheda = (v: VueWrapper) => v.get('[data-testid="talos-mobile-composer"]').element as HTMLElement
const di = (el: Element) => animazioni.filter((a) => a.el === el)
async function apri(v: VueWrapper) { await v.get('[data-testid="talos-composer-prompt"]').trigger('focus'); await flushPromises() }
async function chiudi(v: VueWrapper) { await v.get('[data-testid="talos-composer-prompt"]').trigger('blur'); await flushPromises() }

describe('TRANS il compositore scorre fra riposo e aperto', () => {
    it('TRANS-01 aprendo, la scheda anima la sua altezza 66→106 in 180 ms sulla curva calma; a fine corsa niente stili lasciati', async () => {
        const v = await montaPronto()
        await apri(v)
        const [altezza] = di(scheda(v))
        expect(altezza?.fotogrammi).toEqual([{ height: '66px' }, { height: '106px' }])
        expect(altezza?.opzioni).toMatchObject({ duration: 180, easing: CALMA })
        expect(scheda(v).dataset.talosComposerAnim).toBe('apri')
        altezza!.finisci()
        await flushPromises()
        expect(scheda(v).style.height).toBe('')
        expect(scheda(v).style.overflow).toBe('')
        expect(scheda(v).dataset.talosComposerAnim).toBeUndefined()
    })

    it('TRANS-02 ⭐ la tastiera: i comandi si misurano dal fondo della SCHEDA, non dello schermo — il campo scivola di 43 px, non di 343', async () => {
        fondoAperto = 466
        const v = await montaPronto()
        await apri(v)
        const campo = v.get('[data-testid="talos-composer-prompt"]').element
        expect(di(campo)[0]?.fotogrammi).toEqual([{ transform: 'translate(44px, 43px)' }, { transform: 'none' }])
        // il «+» non si è mosso rispetto alla scheda: nessuna animazione, anche se lo schermo è saltato di 300 px
        expect(di(v.get('[data-testid="talos-composer-plus"]').element)).toHaveLength(0)
    })

    it('TRANS-03 la fila del modello entra in dissolvenza con 4 px di salita, 40 ms dopo, e finisce con la scheda', async () => {
        const v = await montaPronto()
        await apri(v)
        const [entra] = di(v.get('[data-testid="talos-composer-tools"]').element)
        expect(entra?.fotogrammi).toEqual([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }])
        expect(entra?.opzioni).toMatchObject({ delay: 40, duration: 140, fill: 'backwards' })
    })

    it('TRANS-04 chiudendo: la fila del modello svanisce in 60 ms ferma dove stava; la scheda 106→66 in 150 ms, 30 ms dopo', async () => {
        const v = await montaPronto()
        await apri(v)
        animazioni.forEach((a) => a.finisci())
        await flushPromises()
        animazioni = []
        await chiudi(v)
        const altezza = di(scheda(v)).find((a) => 'height' in (a.fotogrammi[0] ?? {}))
        expect(altezza?.fotogrammi).toEqual([{ height: '106px' }, { height: '66px' }])
        // la scheda comincia a stringersi 30 ms dopo che la fila del modello ha cominciato a svanire (niente scritte sovrapposte)
        expect(altezza?.opzioni).toMatchObject({ duration: 150, easing: CALMA, delay: 30, fill: 'backwards' })
        const fila = v.find('[data-testid="talos-composer-tools"]')
        expect(fila.exists()).toBe(true)
        const stile = (fila.element as HTMLElement).style
        expect([stile.position, stile.left, stile.bottom]).toEqual(['absolute', '56px', '11px'])
        const [esce] = di(fila.element)
        expect(esce?.fotogrammi).toEqual([{ opacity: 1 }, { opacity: 0 }])
        expect(esce?.opzioni).toMatchObject({ duration: 60 })
        esce!.finisci()
        await flushPromises()
        expect(v.find('[data-testid="talos-composer-tools"]').exists()).toBe(false)
    })

    it('TRANS-05 un fuoco e un blur rapidi: il giro che corre si ferma, il nuovo parte e alla fine non resta niente', async () => {
        const v = await montaPronto()
        await apri(v)
        const primo = di(scheda(v))[0]!
        await chiudi(v)
        expect(primo.cancel).toHaveBeenCalled()
        const ultimo = di(scheda(v)).at(-1)!
        expect(ultimo).not.toBe(primo)
        ultimo.finisci()
        await flushPromises()
        expect(scheda(v).style.height).toBe('')
        expect(scheda(v).dataset.talosComposerAnim).toBeUndefined()
        // il «+» e il microfono non spariscono mai (era MOTION-COMPOSER-03)
        expect(v.find('[data-testid="talos-composer-plus"]').exists()).toBe(true)
        expect(v.find('[data-testid="talos-composer-mic"]').exists()).toBe(true)
    })

    // Riscritto il 28/10/2026 (Desktop, il regista fuori dall'avvio): col movimento ridotto il regista NON si carica — si risparmia la
    // richiesta — e il compositore cambia forma e basta, come ogni altra superficie dell'app sotto riduzione (la dissolvenza breve di
    // prima se n'è andata con lui).
    it('TRANS-06 movimento ridotto del sistema: il regista non si carica e il compositore cambia forma senza animazioni', async () => {
        ;(window as unknown as { matchMedia: unknown }).matchMedia = vi.fn((q: string) => ({ matches: q.includes('reduce'), addEventListener() {}, removeEventListener() {} }))
        const v = await montaPronto()
        await apri(v)
        expect(animazioni).toHaveLength(0)
        expect(scheda(v).dataset.talosComposerAnim).toBeUndefined()
        expect(v.find('[data-testid="talos-composer-tools"]').exists()).toBe(true)
    })

    it('TRANS-07 movimento spento dall\'utente (token a 0): il regista non si carica, niente di niente, la forma arriva subito', async () => {
        const v = monta()
        scheda(v).style.setProperty('--talos-motion-calm-composer', '0ms')
        scheda(v).style.setProperty('--talos-motion-calm-composer-exit', '0ms')
        await caricaIlRegista(v)
        await apri(v)
        expect(animazioni).toHaveLength(0)
        expect(v.find('[data-testid="talos-composer-tools"]').exists()).toBe(true)
    })

    // ⭐ TRANS-09 (28/10/2026): il regista arriva dopo; prima il compositore è quello di prima del blocco 6, a scatto, e funziona.
    it('TRANS-09 prima che il regista arrivi il compositore si apre e si chiude a scatto, senza errori', async () => {
        const v = monta()
        await apri(v)
        expect(animazioni).toHaveLength(0)
        expect(scheda(v).getAttribute('data-talos-composer-compact')).toBe('false')
        expect(v.find('[data-testid="talos-composer-tools"]').exists()).toBe(true)
        await chiudi(v)
        expect(scheda(v).getAttribute('data-talos-composer-compact')).toBe('true')
        expect(v.find('[data-testid="talos-composer-tools"]').exists()).toBe(false)
    })

    /*
     * ⛔ TRANS-08 il guardiano dei fotogrammi (Pad 28/10/2026, vc326, Codice): al blur la tastiera che si chiude blocca la pagina per
     * 55-60 ms; l'orologio delle animazioni correva e si vedeva 126→68 in un fotogramma. Un fotogramma in ritardo restituisce il tempo.
     */
    it('TRANS-08 un fotogramma in ritardo di 60 ms restituisce alle animazioni il tempo perso: il blocco mette in pausa, non salta', async () => {
        const fotogrammi: FrameRequestCallback[] = []
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { fotogrammi.push(cb); return fotogrammi.length })
        const v = await montaPronto()
        await apri(v)
        const altezza = di(scheda(v))[0]!
        const avanti = (t: number) => { const cb = fotogrammi.shift(); expect(cb, 'un fotogramma richiesto').toBeTruthy(); cb!(t) }
        avanti(1000)
        altezza.currentTime = 16
        avanti(1016.7)
        expect(altezza.currentTime).toBe(16)
        altezza.currentTime = 76
        avanti(1076.7)
        // 60 ms fra due fotogrammi: 43,3 ms persi, restituiti
        expect(altezza.currentTime).toBeCloseTo(76 - (60 - 16.7), 1)
    })
})
