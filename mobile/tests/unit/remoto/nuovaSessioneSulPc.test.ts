// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ATTESA_CONTROLLO_MS } from '@/lib/remoto/computerRemoti'

/**
 * La sessione nuova sul PC, estratta così com'era dal dettaglio del computer quando il mockup remoto del 23/10 (tavole 2-3) l'ha
 * spostata nella lista del Codice. Le prove sono quelle di prima (CIS-07, 08, 11, 12 in `computerItemScreen.test.ts`), sul
 * componente: R-M4 Q2 (owner 20/10 «fra le cartelle ammesse»), RA-12 (il tetto) e RA-13 («Annulla» anche senza cartelle).
 */
vi.setConfig({ testTimeout: 30_000 })
const push = vi.fn()
const stato = vi.hoisted(() => ({ cartelle: [] as Array<{ id: string, nome: string, dettaglio?: string | null, usataAlle?: string | null, consentita?: boolean, bloccata?: boolean }>, mute: false, guasto: null as string | null }))

vi.mock('vue-router', () => ({ useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }), useRoute: () => ({ params: {}, query: {} }) }))
vi.mock('@/i18n', () => ({
    useTalosI18n: () => ({
        t: (key: string, p?: Record<string, unknown>) => (p ? `${key}${JSON.stringify(p)}` : key),
        tTesto: (key: string, p?: Record<string, unknown>) => (p ? `${key}${JSON.stringify(p)}` : key),
        locale: { value: 'it' },
    }),
}))
vi.mock('@/lib/remoto/computerRemoti', async (originale) => {
    const remoti = {
        cartelle: vi.fn(() => (stato.mute ? new Promise(() => {})
            : Promise.resolve(stato.guasto ? { ok: false, code: stato.guasto } : { ok: true, cartelle: stato.cartelle }))),
    }
    return { ...(await originale<typeof import('@/lib/remoto/computerRemoti')>()), useComputerRemoti: () => remoti }
})

async function monta(progettoRecente: string | null = 'Altra') {
    const { default: Foglio } = await import('@/components/remoto/TalosNuovaSessioneSulPc.vue')
    const chiudi = vi.fn()
    const w = mount(Foglio, { attachTo: document.body, props: { pcId: 'pc-uno', nome: 'UFFICIO', progettoRecente, onChiudi: chiudi } })
    await flushPromises()
    return { w, chiudi }
}
const $ = (sel: string) => document.body.querySelector<HTMLElement>(sel)
const $$ = (sel: string) => [...document.body.querySelectorAll<HTMLElement>(sel)]

beforeEach(() => {
    push.mockReset()
    stato.cartelle = [{ id: 'r4-remoto', nome: 'r4 remoto', consentita: true }, { id: 'altra', nome: 'Altra', consentita: true }]
    stato.mute = false
    stato.guasto = null
    document.body.innerHTML = ''
})

describe('una sessione nuova sul PC', () => {
    it('NSP-01 (era CIS-07) le cartelle del PC, preselezionata quella della sessione più recente; «Apri» va al Codice del PC con la cartella', async () => {
        await monta()
        expect(document.body.textContent).toContain('harness.newSessionOn{"name":"UFFICIO"}')
        const righe = $$('[data-testid="talos-computer-folder"]')
        expect(righe.map((x) => [x.textContent?.trim(), x.getAttribute('aria-checked')])).toEqual([['r4 remoto', 'false'], ['Altra', 'true']])
        expect(righe.every((x) => x.getAttribute('role') === 'radio')).toBe(true)
        righe[0]!.click()
        await flushPromises()
        expect($$('[data-testid="talos-computer-folder"]').map((x) => x.getAttribute('aria-checked'))).toEqual(['true', 'false'])
        $('[data-testid="talos-computer-open-session"]')!.click()
        expect(push).toHaveBeenCalledWith({ name: 'computer-codice', params: { pcId: 'pc-uno' }, query: { cartella: 'r4-remoto' } })
    })

    it('NSP-02 (era CIS-08) nessuna cartella aperta al dispositivo ⇒ lo dice e non c\'è niente da aprire; senza una scelta «Apri» è spento', async () => {
        stato.cartelle = []
        let { w } = await monta()
        expect(document.body.textContent).toContain('computer.noFolders')
        expect($('[data-testid="talos-computer-open-session"]')).toBeNull()
        w.unmount()
        document.body.innerHTML = ''
        stato.cartelle = [{ id: 'r4-remoto', nome: 'r4 remoto' }]
        ;({ w } = await monta())
        expect($('[data-testid="talos-computer-folder"]')!.getAttribute('aria-checked')).toBe('false')
        expect($('[data-testid="talos-computer-open-session"]')!.hasAttribute('disabled')).toBe(true)
    })

    it('NSP-03 (era CIS-11) ⛔ RA-12: le cartelle che il PC non manda mai, dopo il tetto lo dice, con «Riprova»', async () => {
        stato.mute = true
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
        try {
            await monta()
            expect(document.body.textContent).toContain('computer.checking')
            await vi.advanceTimersByTimeAsync(ATTESA_CONTROLLO_MS)
            await flushPromises()
        } finally {
            vi.useRealTimers()
        }
        expect(document.body.textContent).toContain('computer.errors.timeout')
        stato.mute = false
        $('[data-testid="talos-computer-folders-retry"]')!.click()
        await flushPromises()
        expect($$('[data-testid="talos-computer-folder"]')).toHaveLength(2)
    })

    it('NSP-04 (era CIS-12) ⛔ RA-13: senza cartelle c\'è «Annulla», che chiude', async () => {
        stato.cartelle = []
        const { chiudi } = await monta()
        $('[data-testid="talos-computer-folders-cancel"]')!.click()
        expect(chiudi).toHaveBeenCalled()
    })

    it('CART-R512-03 D-MOCK-12, tavola 4: una cartella non consentita dice che la prima volta il PC chiede il permesso; due con lo stesso nome si distinguono', async () => {
        stato.cartelle = [
            { id: 'c-1', nome: 'talos', dettaglio: 'progetti', usataAlle: null, consentita: true },
            { id: 'c-2', nome: 'talos', dettaglio: 'vecchi', usataAlle: null, consentita: false },
        ]
        const { w } = await monta(null)
        const righe = $$('[data-testid="talos-computer-folder"]')
        expect(righe.map((r) => r.querySelector('.truncate')?.textContent?.replace(/\s+/gu, ' ').trim())).toEqual(['talos progetti', 'talos vecchi'])
        // il catalogo qui restituisce la chiave (`@/i18n` finto, sopra)
        expect(righe.map((r) => r.querySelector('[data-testid="talos-computer-folder-first-time"]')?.textContent ?? null)).toEqual([null, 'computer.consent.firstTime'])
        w.unmount()
    })

    /*
     * Cartelle bloccate (owner 27/10/2026, contratto del Desktop rev.1, parole proposte dal Mobile e accettate): la riga si vede, dice
     * «Bloccata dal computer», non si sceglie (aria-disabled, nessun radio) e non ha azioni: si sblocca dal PC.
     */
    it('CART-BLOC-02 una cartella bloccata si vede ma non si sceglie: niente radio, aria-disabled, la sua frase; mai preselezionata', async () => {
        stato.cartelle = [
            { id: 'c-blocco', nome: 'Documenti', consentita: false, bloccata: true },
            { id: 'c-libera', nome: 'Utenti', consentita: true },
        ]
        const { w } = await monta('Documenti')
        const bloccata = $('[data-testid="talos-computer-folder-blocked"]')!
        expect(bloccata.getAttribute('aria-disabled')).toBe('true')
        expect(bloccata.getAttribute('role')).not.toBe('radio')
        expect(bloccata.textContent).toContain('Documenti')
        expect(bloccata.textContent).toContain('computer.consent.blocked')
        expect(bloccata.textContent).not.toContain('computer.consent.firstTime')
        expect(bloccata.querySelector('button')).toBeNull()
        // la sessione più recente era nella bloccata: niente preselezione, «Apri» spento
        const radio = $$('[role="radio"]')
        expect(radio.map((r) => r.textContent?.trim())).toEqual(['Utenti'])
        expect(radio[0]!.getAttribute('aria-checked')).toBe('false')
        expect(radio[0]!.getAttribute('tabindex')).toBe('0')
        expect($('[data-testid="talos-computer-open-session"]')!.hasAttribute('disabled')).toBe(true)
        bloccata.click()
        await flushPromises()
        expect($('[data-testid="talos-computer-open-session"]')!.hasAttribute('disabled')).toBe(true)
        w.unmount()
    })

    it("CART-BLOC-03 ⛔ verso contrario: tutte bloccate ⇒ nessun radio, «Apri» spento, «Annulla» c'è", async () => {
        stato.cartelle = [{ id: 'c-blocco', nome: 'Documenti', consentita: false, bloccata: true }]
        const { w } = await monta(null)
        expect($$('[role="radio"]')).toHaveLength(0)
        expect($('[data-testid="talos-computer-open-session"]')!.hasAttribute('disabled')).toBe(true)
        expect($('[data-testid="talos-computer-folders-cancel"]')).not.toBeNull()
        w.unmount()
    })

    /* Revisione del blocco 10, F-R1 (F6): il lucchetto dei consensi del PC diventava «Qualcosa è andato storto nel collegamento». */
    it('CART-BUSY-01 il PC occupato (REMOTE_STORE_BUSY) dice di riprovare fra un momento, con «Riprova»; ⛔ non il guasto generico', async () => {
        stato.guasto = 'REMOTE_STORE_BUSY'
        const { w } = await monta(null)
        expect(document.body.textContent).toContain('computer.errors.busy')
        expect(document.body.textContent).not.toContain('computer.errors.generic')
        expect($('[data-testid="talos-computer-folders-retry"]')).not.toBeNull()
        w.unmount()
    })
})
