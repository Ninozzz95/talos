// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { TalosR4ClientePonte } from '@/lib/harness/r4/clienteR4'

/**
 * ⛔ «Ferma tutto» e «Stop anche a chat ferma» nella schermata del Codice su r4 (owner 29/10/2026; scheda
 * `mockup/ferma-tutto/pezzi/SCHEDA-DI-CONSEGNA.md`, voci 1, 3, 5, 7; ledger `LEDGER-FERMA-TUTTO-MOBILE-2026-10-29.md`, riga 12).
 * Lo Stop passa da `decidiStopR4`: senza agenti vivi immediato come oggi (`{}`); con agenti e «chiedi» il foglio; con la preferenza
 * ricordata la scelta parte da sola; a chat FERMA lo Stop resta al posto dell'Invio e ferma gli agenti subito (`figlie: 'tutte'`), e
 * sopra il compositore la riga viva «N agenti continuano a lavorare», coi secondi solo dopo 2 s.
 * Gli agenti vengono dalle sorgenti vere della schermata (elenco e figli di r4), anche col pannello chiuso.
 */
const stato = vi.hoisted(() => ({
    ascoltatori: {} as Record<string, ((d: Record<string, unknown>) => void)[]>,
    flussi: [] as { id: string; percorso: string }[],
    richieste: [] as { metodo: string; percorso: string; corpo?: string }[],
    agenti: [] as Record<string, unknown>[],
    preferenza: 'chiedi' as string,
    setShell: null as null | ((patch: Record<string, unknown>) => Promise<void>),
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
            if (r.metodo === 'GET' && r.percorso === '/api/v1/sessions') {
                return { stato: 200, corpo: JSON.stringify({ ok: true, data: { items: [{ sessionId: 's1', nome: 'Release', conclusa: true }, ...stato.agenti] } }) }
            }
            if (r.metodo === 'GET' && r.percorso === '/api/v1/sessions/s1/children') {
                return { stato: 200, corpo: JSON.stringify({ ok: true, data: { figli: stato.agenti.filter((a) => a.padreId === 's1') } }) }
            }
            if (r.metodo === 'POST' && r.percorso.endsWith('/stop')) {
                const figlie = (JSON.parse(r.corpo ?? '{}') as { figlie?: string }).figlie
                const vivi = stato.agenti.filter((a) => a.conclusa === false && !a.interrotta).length
                if (figlie === 'tutte') stato.agenti = stato.agenti.map((a) => ({ ...a, interrotta: true }))
                return { stato: 200, corpo: JSON.stringify({ ok: true, data: { stopped: true, ...(figlie === 'tutte' ? { figlieFermate: vivi } : {}) } }) }
            }
            return { stato: 200, corpo: '{"ok":true,"data":{}}' }
        },
        apriFlusso: async (f) => { stato.flussi.push(f) },
        chiudiFlusso: async () => undefined,
        addListener: async (evento, a) => {
            ;(stato.ascoltatori[evento] ??= []).push(a)
            return { remove: async () => { stato.ascoltatori[evento] = (stato.ascoltatori[evento] ?? []).filter((x) => x !== a) } }
        },
    }),
}))
vi.mock('@/stores/settings', async () => {
    const { reactive } = await import('vue')
    return {
        useSettingsStore: () => {
            const s = reactive({
                state: {
                    chat_layout: { message_style: 'sections', bubble_scale: 'large' },
                    shell: {
                        debug_diagnostics: false, streaming_animation: 'fade', composer_shape: 'calm', composer_plus: 'dropdown',
                        get stop_con_sotto_agenti() { return stato.preferenza },
                    },
                    voice: { dictation_language: 'auto' },
                },
                setShell: async (patch: Record<string, unknown>) => {
                    if (typeof patch.stop_con_sotto_agenti === 'string') stato.preferenza = patch.stop_con_sotto_agenti
                    await stato.setShell?.(patch)
                },
            })
            return s
        },
    }
})
vi.mock('@/composables/useTalosMobileDictation', async () => {
    const { ref } = await import('vue')
    return {
        useTalosMobileDictation: () => ({
            visible: ref(true), status: ref('idle'), level: ref(0), error: ref(''), errorCode: ref(null),
            toggle: vi.fn(), cancel: vi.fn(), finisci: vi.fn(),
        }),
    }
})

import CodiceR4Screen from '@/screens/CodiceR4Screen.vue'

const asciuga = async () => { await flushPromises(); await vi.dynamicImportSettled(); await flushPromises() }
async function schermata() {
    const w = mount(CodiceR4Screen, { attachTo: document.body, global: { stubs: { teleport: true } } })
    await asciuga()
    return w
}
function consegna(...eventi: Record<string, unknown>[]): void {
    const id = stato.flussi.at(-1)!.id
    const testo = eventi.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')
    for (const a of stato.ascoltatori.r4Pezzo ?? []) a({ id, testo })
}
const fineStoria = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: {} }
const giroVivo = { type: 'RunStarted', threadId: 's1', runId: 'g1', input: { consegna: 'Prepara la release' }, _sequenza: 1 }
const treAgenti = () => [
    { sessionId: 'a', padreId: 's1', conclusa: false, taskCorto: 'Esegui i test' },
    { sessionId: 'b', padreId: 's1', conclusa: false, inAttesaApprovazione: true, taskCorto: 'Scrivi le note' },
    { sessionId: 'a1', padreId: 'a', conclusa: false, taskCorto: 'Controlla i tipi' },
]
const stop = (w: ReturnType<typeof mount>) => w.get('[data-testid="talos-composer-action"]')
const fermate = () => stato.richieste.filter((r) => r.metodo === 'POST' && r.percorso.endsWith('/stop'))

afterEach(() => {
    document.body.innerHTML = ''
    stato.flussi = []
    stato.ascoltatori = {}
    stato.richieste = []
    stato.agenti = []
    stato.preferenza = 'chiedi'
    stato.setShell = null
    vi.useRealTimers()
})

describe('FT-SCR — lo Stop del Codice su r4 con i sotto-agenti', () => {
    it('FT-SCR-01 chat al lavoro e 3 agenti vivi (uno aspetta): lo Stop apre il foglio; «Ferma tutto» manda `figlie: tutte`', async () => {
        stato.agenti = treAgenti()
        const w = await schermata()
        consegna(fineStoria, giroVivo)
        await asciuga()
        expect(stop(w).attributes('data-talos-action')).toBe('stop')
        await stop(w).trigger('click')
        await asciuga()
        expect(fermate()).toEqual([])
        const foglio = w.get('[data-testid="talos-codice-r4-ferma-tutto-foglio"]')
        expect(foglio.text()).toContain('3 agents are still working')
        expect(foglio.text()).toContain('The chat and 3 agents')
        await w.get('[data-testid="talos-codice-r4-ferma-tutto-tutte"]').trigger('click')
        await asciuga()
        expect(fermate().map((r) => [r.percorso, r.corpo])).toEqual([['/api/v1/sessions/s1/stop', JSON.stringify({ figlie: 'tutte' })]])
        expect(w.find('[data-testid="talos-codice-r4-ferma-tutto-foglio"]').exists()).toBe(false)
        expect(stato.preferenza).toBe('chiedi')
        w.unmount()
    })

    it('FT-SCR-02 «Ferma solo la chat» con «Ricorda la scelta»: `figlie: nessuna`, la preferenza salvata; lo Stop dopo non chiede', async () => {
        stato.agenti = treAgenti()
        const w = await schermata()
        consegna(fineStoria, giroVivo)
        await asciuga()
        await stop(w).trigger('click')
        await asciuga()
        await w.get('[data-testid="talos-codice-r4-ferma-tutto-ricorda"]').trigger('click')
        await w.get('[data-testid="talos-codice-r4-ferma-tutto-solo-chat"]').trigger('click')
        await asciuga()
        expect(stato.preferenza).toBe('solo-chat')
        expect(fermate().map((r) => r.corpo)).toEqual([JSON.stringify({ figlie: 'nessuna' })])
        // un giro nuovo: lo Stop non chiede più, manda la scelta ricordata
        consegna({ type: 'RunError', runId: 'g1', code: 'fermato', message: '⛔ stopped on request.', _sequenza: 2 },
            { type: 'RunStarted', threadId: 's1', runId: 'g2', input: { consegna: 'Ancora' }, _sequenza: 3 })
        await asciuga()
        await stop(w).trigger('click')
        await asciuga()
        expect(w.find('[data-testid="talos-codice-r4-ferma-tutto-foglio"]').exists()).toBe(false)
        expect(fermate().map((r) => r.corpo)).toEqual([JSON.stringify({ figlie: 'nessuna' }), JSON.stringify({ figlie: 'nessuna' })])
        w.unmount()
    })

    it('FT-SCR-03 senza agenti vivi lo Stop è immediato, come oggi: `{}`, nessun foglio', async () => {
        stato.agenti = [{ sessionId: 'c', padreId: 's1', conclusa: true }]
        const w = await schermata()
        consegna(fineStoria, giroVivo)
        await asciuga()
        await stop(w).trigger('click')
        await asciuga()
        expect(w.find('[data-testid="talos-codice-r4-ferma-tutto-foglio"]').exists()).toBe(false)
        expect(fermate().map((r) => r.corpo)).toEqual(['{}'])
        w.unmount()
    })

    it('FT-SCR-04 a chat ferma con 2 agenti: lo Stop «Stop the 2 agents» al posto dell’Invio li ferma subito (`figlie: tutte`), senza foglio', async () => {
        stato.agenti = treAgenti().slice(0, 2)
        const w = await schermata()
        consegna(fineStoria)
        await asciuga()
        expect(stop(w).attributes('data-talos-action')).toBe('stop')
        expect(stop(w).attributes('aria-label')).toBe('Stop the 2 agents')
        await stop(w).trigger('click')
        await asciuga()
        expect(w.find('[data-testid="talos-codice-r4-ferma-tutto-foglio"]').exists()).toBe(false)
        expect(fermate().map((r) => r.corpo)).toEqual([JSON.stringify({ figlie: 'tutte' })])
        // riletti gli agenti, nessuno è più vivo: torna l'Invio e la riga viva sparisce
        expect(stop(w).attributes('data-talos-action')).toBe('send')
        expect(w.find('[data-testid="talos-codice-r4-agenti-continuano"]').exists()).toBe(false)
        w.unmount()
    })

    it('FT-UI-S-01 a chat ferma con agenti la riga viva «2 agents keep working»: niente secondi nei primi 2 s, poi sì; sparisce col giro', async () => {
        stato.agenti = treAgenti().slice(0, 2)
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
        const w = await schermata()
        consegna(fineStoria)
        await vi.advanceTimersByTimeAsync(0)
        await asciuga()
        const riga = () => w.find('[data-testid="talos-codice-r4-agenti-continuano"]')
        expect(riga().exists()).toBe(true)
        expect(riga().get('[data-testid="talos-riga-in-corso"]').attributes('aria-label')).toBe('2 agents keep working')
        expect(riga().find('[data-testid="talos-riga-in-corso-durata"]').exists()).toBe(false)
        await vi.advanceTimersByTimeAsync(1_900)
        expect(riga().find('[data-testid="talos-riga-in-corso-durata"]').exists()).toBe(false)
        await vi.advanceTimersByTimeAsync(200)
        expect(riga().get('[data-testid="talos-riga-in-corso-durata"]').text()).toBe('· 2s')
        // la chat riprende a lavorare: la riga sparisce, torna lo Stop del giro
        consegna({ type: 'RunStarted', threadId: 's1', runId: 'g2', input: { consegna: 'Ancora' }, _sequenza: 2 })
        await vi.advanceTimersByTimeAsync(0)
        expect(riga().exists()).toBe(false)
        expect(stop(w).attributes('aria-label')).toBe('Stop response')
        w.unmount()
    })
})
