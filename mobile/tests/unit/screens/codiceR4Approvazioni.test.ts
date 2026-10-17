// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { TalosR4ClientePonte } from '@/lib/harness/r4/clienteR4'

/**
 * ⛔ K3-AP1 (ledger `LEDGER-K3-APPROVAZIONI-2026-10-16.md`; owner 16/10 «Carta nella conversazione»). Il flusso è quello VERO di r4 @
 * 2161afb32 registrato sul Pad col fornitore finto (sessione «Su richiesta», `shell echo test-ok`): un sì, poi un seguito e un no.
 */
const sse = readFileSync(resolve(__dirname, '..', '..', 'fixtures', 'r4', 'approvazione-2161afb32.sse'), 'utf8')
const blocchi = sse.split(/\n\n/u).filter((b) => b.includes('data:'))
const tipo = (b: string) => (JSON.parse(b.split('\n').find((r) => r.startsWith('data:'))!.slice(5)) as { type: string }).type
const finoAllaPrima = blocchi.slice(0, blocchi.findIndex((b) => tipo(b) === 'ApprovalRequested') + 1)
const primaRisolta = blocchi.find((b) => tipo(b) === 'ApprovalResolved')!

const stato = vi.hoisted(() => ({
    ascoltatori: {} as Record<string, ((d: Record<string, unknown>) => void)[]>,
    flussi: [] as { id: string; percorso: string }[],
    richieste: [] as { metodo: string; percorso: string; corpo?: string }[],
    rispondi: null as null | ((r: { metodo: string; percorso: string; corpo?: string }) => { stato: number; corpo: string } | null),
}))
vi.mock('vue-router', async () => {
    const { reactive } = await import('vue')
    const rotta = reactive({ params: { id: 's1' } as Record<string, string> })
    return { useRoute: () => rotta, useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }
})
vi.mock('@/lib/harness/terminalePonte', () => ({ talosR4Pronto: async () => ({ disponibile: true, acceso: true, porta: 4178, cartella: '/data/w' }) }))
vi.mock('@/lib/harness/r4/clienteR4', () => ({
    talosClienteR4: (): TalosR4ClientePonte => ({
        richiesta: async (r) => {
            stato.richieste.push(r)
            const scelta = stato.rispondi?.(r)
            if (scelta) return scelta
            if (r.metodo === 'GET' && r.percorso === '/api/v1/sessions') {
                return { stato: 200, corpo: JSON.stringify({ ok: true, data: { items: [{ sessionId: 's1', nome: 'Test', permessi: 'On request', permessiPerAttrezzo: {} }] } }) }
            }
            return { stato: 200, corpo: '{"ok":true,"data":{"ok":true}}' }
        },
        apriFlusso: async (f) => { stato.flussi.push(f) },
        chiudiFlusso: async () => undefined,
        apriTerminale: async () => undefined,
        scriviTerminale: async () => undefined,
        ridimensionaTerminale: async () => undefined,
        chiudiTerminale: async () => undefined,
        addListener: async (evento, a) => {
            ;(stato.ascoltatori[evento] ??= []).push(a)
            return { remove: async () => { stato.ascoltatori[evento] = (stato.ascoltatori[evento] ?? []).filter((x) => x !== a) } }
        },
    }),
}))
vi.mock('@/stores/settings', () => ({
    useSettingsStore: () => ({
        state: {
            chat_layout: { message_style: 'sections', bubble_scale: 'large' },
            shell: { debug_diagnostics: false, streaming_animation: 'fade', composer_shape: 'calm', composer_plus: 'dropdown' },
            voice: { dictation_language: 'auto' },
        },
    }),
}))
vi.mock('@/composables/useTalosMobileDictation', async () => {
    const { ref } = await import('vue')
    return { useTalosMobileDictation: () => ({ visible: ref(true), status: ref('idle'), level: ref(0), error: ref(''), errorCode: ref(null), toggle: vi.fn(), cancel: vi.fn(), finisci: vi.fn() }) }
})

import CodiceR4Screen from '@/screens/CodiceR4Screen.vue'

async function asciuga() { for (let i = 0; i < 3; i++) { await flushPromises(); await vi.dynamicImportSettled() } }
async function schermata() {
    const w = mount(CodiceR4Screen, { attachTo: document.body, global: { stubs: { teleport: true } } })
    await asciuga()
    return w
}
async function consegna(blocchiDaDare: string[]) {
    const id = stato.flussi.at(-1)!.id
    for (const a of stato.ascoltatori.r4Pezzo ?? []) a({ id, testo: `${blocchiDaDare.join('\n\n')}\n\n` })
    await asciuga()
}
const carte = (w: ReturnType<typeof mount>) => w.findAll('[data-testid="talos-approvazione"]')
const approva = () => stato.richieste.filter((r) => r.percorso.endsWith('/approve')).map((r) => JSON.parse(r.corpo!))

afterEach(() => {
    document.body.innerHTML = ''
    stato.ascoltatori = {}
    stato.flussi = []
    stato.richieste = []
    stato.rispondi = null
})

describe('le approvazioni nel Codice su r4 (K3-AP1)', () => {
    it('CAP-01 la carta compare sotto la riga dell\'attrezzo, in attesa, con le parole del desktop e il comando esatto', async () => {
        const w = await schermata()
        await consegna(finoAllaPrima)
        const [carta] = carte(w)
        expect(carta.attributes('data-tono')).toBe('attesa')
        expect(carta.text()).toContain('Asks to run')
        expect(carta.get('[data-parte="codice"]').text()).toBe('echo test-ok')
        expect(carta.get('[data-parte="motivo"]').text()).toContain('“Asks first”')
        expect(carta.findAll('[data-scelta]').map((b) => b.attributes('data-scelta'))).toEqual(['nega', 'unaVolta', 'sessione'])
        // sotto la riga dell'attrezzo: la parte del giro con «Lancia i test» viene prima della carta
        const riga = w.findAll('[data-testid="talos-tool-trail"]').at(-1)!
        expect(riga.text()).toContain('echo test-ok')
        expect(riga.element.compareDocumentPosition(carta.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        w.unmount()
    })

    it('CAP-02 «Consenti una volta» manda il corpo esatto e blocca i pulsanti; l\'esito lo scrive r4, senza «da un\'altra finestra»', async () => {
        const w = await schermata()
        await consegna(finoAllaPrima)
        await carte(w)[0].get('[data-scelta="unaVolta"]').trigger('click')
        await asciuga()
        expect(approva()).toEqual([{ requestId: '44444444-4444-4444-8444-444444444441', approvato: true }])
        expect(carte(w)[0].get('[data-scelta="nega"]').attributes('disabled')).toBeDefined()
        await consegna([primaRisolta])
        const esito = carte(w)[0].get('[data-parte="esito"]')
        expect(esito.text()).toBe('Approved')
        expect(carte(w)[0].find('[data-scelta]').exists()).toBe(false)
        w.unmount()
    })

    it('CAP-03 una risposta data altrove: l\'esito dice «da un\'altra finestra»; una carta della storia no', async () => {
        const w = await schermata()
        await consegna(finoAllaPrima)
        await consegna([primaRisolta])
        expect(carte(w)[0].get('[data-parte="esito"]').text()).toBe('Approved from another window')
        w.unmount()
        const storia = await schermata()
        await consegna(blocchi)
        expect(carte(storia).map((c) => c.get('[data-parte="esito"]').text())).toEqual(['Approved', 'Denied'])
        storia.unmount()
    })

    it('CAP-04 «Per questa sessione»: prima il «sempre» in settings, poi il sì; se r4 non lo unisce, la carta lo dice', async () => {
        stato.rispondi = (r) => (r.percorso.endsWith('/settings') ? { stato: 200, corpo: '{"ok":true,"data":{"ok":true,"nonUniti":["shell"]}}' } : null)
        const w = await schermata()
        await consegna(finoAllaPrima)
        await carte(w)[0].get('[data-scelta="sessione"]').trigger('click')
        await asciuga()
        const ultime = stato.richieste.filter((r) => r.metodo === 'POST').map((r) => r.percorso.replace('/api/v1/sessions/s1', ''))
        expect(ultime).toEqual(['/settings', '/approve'])
        await consegna([primaRisolta])
        expect(carte(w)[0].get('[data-parte="sempre-non-salvato"]').text()).toContain('“Terminal command”')
        w.unmount()
    })

    it('CAP-05 un rifiuto del server: i pulsanti tornano e la carta dice che la risposta non è partita', async () => {
        stato.rispondi = (r) => (r.percorso.endsWith('/approve') ? { stato: 404, corpo: '{"ok":false,"error":{"code":"NOT_FOUND","message":"Resource not found"}}' } : null)
        const w = await schermata()
        await consegna(finoAllaPrima)
        await carte(w)[0].get('[data-scelta="nega"]').trigger('click')
        await asciuga()
        expect(carte(w)[0].get('[data-parte="non-inviata"]').text()).not.toBe('')
        expect(carte(w)[0].get('[data-scelta="nega"]').attributes('disabled')).toBeUndefined()
        expect(carte(w)[0].attributes('data-tono')).toBe('attesa')
        w.unmount()
    })
})
