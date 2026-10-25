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
const stato = vi.hoisted(() => ({ cartelle: [] as Array<{ id: string, nome: string, dettaglio?: string | null, usataAlle?: string | null, consentita?: boolean }>, mute: false }))

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
        cartelle: vi.fn(() => (stato.mute ? new Promise(() => {}) : Promise.resolve({ ok: true, cartelle: stato.cartelle }))),
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
})
