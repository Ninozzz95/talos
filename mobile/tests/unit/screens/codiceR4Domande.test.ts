// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { TalosR4ClientePonte } from '@/lib/harness/r4/clienteR4'

/**
 * ⛔ K3-AP2 (ledger `LEDGER-K3-DOMANDE-2026-10-16.md`; owner 16/10: carta nella conversazione, una alla volta, parità col desktop).
 * Il flusso è quello VERO di r4 @ 2161afb32 registrato sul Pad col fornitore finto: due domande (singola con la consigliata, multipla),
 * la prima con risposta («Login» + «Altro: Backup»), la seconda saltata.
 */
const sse = readFileSync(resolve(__dirname, '..', '..', 'fixtures', 'r4', 'domanda-2161afb32.sse'), 'utf8')
const blocchi = sse.split(/\n\n/u).filter((b) => b.includes('data:'))
const dati = (b: string) => JSON.parse(b.split('\n').find((r) => r.startsWith('data:'))!.slice(5)) as Record<string, unknown>
const tipo = (b: string) => dati(b).type as string
const finoAllaPrima = blocchi.slice(0, blocchi.findIndex((b) => tipo(b) === 'UserQuestionRequested') + 1)
const primaRisolta = blocchi.find((b) => tipo(b) === 'UserQuestionResolved')!
const richiesta = blocchi.find((b) => tipo(b) === 'UserQuestionRequested')!
const ID = '55555555-5555-4555-8555-555555555551'
/** La stessa richiesta vera con altre domande (la forma resta quella di r4). */
const conDomande = (questions: unknown[]) => `data: ${JSON.stringify({ ...dati(richiesta), questions })}`

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
                return { stato: 200, corpo: JSON.stringify({ ok: true, data: { items: [{ sessionId: 's1', nome: 'Test', permessi: 'Workspace write', permessiPerAttrezzo: {} }] } }) }
            }
            if (r.percorso.endsWith('/export')) return { stato: 200, corpo: JSON.stringify({ ok: true, data: { sessionId: 's1', eventi: [] } }) }
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
type W = ReturnType<typeof mount>
const carte = (w: W) => w.findAll('[data-testid="talos-domanda"]')
const carta = (w: W) => carte(w).at(-1)!
const azioni = (w: W) => carta(w).findAll('[data-azione]').map((b) => b.text())
const premi = async (w: W, azione: string) => { await carta(w).get(`[data-azione="${azione}"]`).trigger('click'); await asciuga() }
const tocca = async (w: W, etichetta: string) => { await carta(w).get(`[data-opzione="${etichetta}"]`).trigger('click'); await asciuga() }
const domande = () => stato.richieste.filter((r) => r.percorso.endsWith('/question')).map((r) => JSON.parse(r.corpo!))

afterEach(() => {
    document.body.innerHTML = ''
    stato.ascoltatori = {}
    stato.flussi = []
    stato.richieste = []
    stato.rispondi = null
    sessionStorage.clear()
})

describe('le domande di TALOS nel Codice su r4 (K3-AP2)', () => {
    it('CDM-01 la carta compare sotto la riga dell\'attrezzo, una domanda alla volta, con le parole del desktop; il fuoco non si sposta', async () => {
        const w = await schermata()
        const composer = w.find('[data-testid="talos-composer-prompt"]')
        ;(composer.element as HTMLElement).focus()
        await consegna(finoAllaPrima)
        const c = carta(w)
        expect(c.attributes('data-fase')).toBe('answer')
        expect(c.get('[data-parte="badge"]').text()).toBe('TALOS asks')
        expect(c.get('[data-parte="progresso"]').text()).toBe('Question 1 of 2')
        expect(c.get('[data-parte="domanda"]').text()).toBe('Quale database uso?')
        expect(c.get('[data-parte="perche"]').text()).toBe('Why it matters: Decide lo schema e le dipendenze.')
        const opzioni = c.findAll('[data-opzione]')
        expect(opzioni.map((o) => [o.attributes('role'), o.attributes('aria-checked')])).toEqual([['radio', 'false'], ['radio', 'false']])
        expect(opzioni[0].text()).toContain('Recommended')
        expect(c.get('[data-parte="altro"]').attributes('placeholder')).toBe('Other…')
        expect(azioni(w)).toEqual(['Skip', 'Next'])
        // sotto la riga dell'attrezzo
        const riga = w.findAll('[data-testid="talos-tool-trail"]').at(-1)!
        expect(riga.element.compareDocumentPosition(c.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        // la domanda si annuncia (regione viva educata, frase del mobile), il fuoco resta nel compositore
        expect(c.get('[data-parte="annuncio"]').attributes('role')).toBe('status')
        expect(c.get('[data-parte="annuncio"]').text()).toBe('TALOS asks for 2 decisions: Quale database uso? · Quali funzioni aggiungo? The questions are in the conversation.')
        expect(document.activeElement).toBe(composer.element)
        w.unmount()
    })

    it('CDM-02 singola che porta avanti, multipla con «Altro», revisione, conferma: il corpo esatto; poi la ricevuta dall\'esito vero', async () => {
        const w = await schermata()
        await consegna(finoAllaPrima)
        await tocca(w, 'PostgreSQL')
        expect(carta(w).get('[data-parte="progresso"]').text()).toBe('Question 2 of 2')
        expect(carta(w).findAll('[data-opzione]').map((o) => o.attributes('role'))).toEqual(['checkbox', 'checkbox', 'checkbox'])
        expect(azioni(w)).toEqual(['Back', 'Skip', 'Review answers'])
        await tocca(w, 'Login')
        expect(carta(w).get('[data-opzione="Login"]').attributes('aria-checked')).toBe('true')
        await carta(w).get('[data-parte="altro"]').setValue('Backup')
        await premi(w, 'rivedi')
        expect(carta(w).attributes('data-fase')).toBe('review')
        expect(carta(w).findAll('[data-parte="riga-revisione"]').map((r) => r.text())).toEqual(['Quale database uso?PostgreSQL', 'Quali funzioni aggiungo?Login, Backup'])
        expect(carta(w).get('[data-parte="avviso"]').text()).toBe('All answers are ready.')
        await premi(w, 'invia')
        expect(domande()).toEqual([{ requestId: ID, status: 'answered', answers: { database: 'PostgreSQL', funzioni: ['Login', 'Backup'] } }])
        expect(carta(w).get('[data-azione="invia"]').attributes('disabled')).toBeDefined()
        expect(carta(w).get('[data-parte="avviso-invio"]').text()).toBe('Submission received. Waiting for server confirmation…')
        await consegna([primaRisolta])
        const c = carta(w)
        expect(c.attributes('data-fase')).toBe('resolved')
        expect(c.get('[data-parte="badge"]').text()).toBe('Decision')
        expect(c.get('[data-parte="progresso"]').text()).toBe('Answer sent')
        expect(c.get('[data-parte="meta"]').text()).toMatch(/^Asked at \d\d:\d\d in Normal mode · you answered at \d\d:\d\d$/u)
        expect(c.findAll('[data-parte="risposta"]').map((r) => r.text())).toEqual(['PostgreSQL', 'Login, Other: “Backup”'])
        expect(c.find('[data-azione]').exists()).toBe(false)
        w.unmount()
    })

    it('CDM-03 «Salta» chiede conferma; «Conferma salto» manda `skipped`; «Modifica» torna alle risposte', async () => {
        const w = await schermata()
        await consegna(finoAllaPrima)
        await premi(w, 'salta')
        expect(carta(w).attributes('data-fase')).toBe('skip-review')
        expect(carta(w).get('[data-parte="titolo-revisione"]').text()).toBe('Skip all questions?')
        expect(azioni(w)).toEqual(['Edit answers', 'Confirm skip'])
        await premi(w, 'modifica')
        expect(carta(w).attributes('data-fase')).toBe('answer')
        await premi(w, 'salta')
        await premi(w, 'confermaSalto')
        expect(domande()).toEqual([{ requestId: ID, status: 'skipped' }])
        w.unmount()
    })

    it('CDM-04 409 vero: domanda non più attiva (dopo il registro); 422: riapre col motivo del desktop', async () => {
        stato.rispondi = (r) => (r.percorso.endsWith('/question')
            ? { stato: 409, corpo: JSON.stringify({ ok: false, error: { code: 'QUESTION_NOT_PENDING', message: 'This question is no longer pending: the session has moved on', reason: 'question-expired' } }) }
            : null)
        const w = await schermata()
        await consegna(finoAllaPrima)
        await premi(w, 'salta')
        await premi(w, 'confermaSalto')
        expect(stato.richieste.at(-1)!.percorso).toBe('/api/v1/sessions/s1/export')
        expect(carta(w).attributes('data-fase')).toBe('stale')
        expect(carta(w).get('[data-parte="avviso-invio"]').text())
            .toBe('Question no longer active: This question is no longer pending: the session has moved on. Reload the session to check its status.')
        expect(carta(w).find('[data-azione]').exists()).toBe(false)
        w.unmount()

        stato.rispondi = (r) => (r.percorso.endsWith('/question') ? { stato: 422, corpo: JSON.stringify({ ok: false, error: { code: 'QUERY_INVALID', message: 'bad' } }) } : null)
        const v = await schermata()
        await consegna(finoAllaPrima)
        await premi(v, 'salta')
        await premi(v, 'confermaSalto')
        expect(carta(v).attributes('data-fase')).toBe('skip-review')
        expect(carta(v).get('[data-parte="avviso-invio"]').text()).toBe('Submission failed: Invalid query. You can make changes and retry.')
        expect(carta(v).get('[data-azione="confermaSalto"]').attributes('disabled')).toBeUndefined()
        v.unmount()
    })

    it('CDM-05 una risposta data altrove dice «da un\'altra finestra»; la storia intera mostra le due ricevute senza pulsanti', async () => {
        const w = await schermata()
        await consegna(finoAllaPrima)
        await consegna([primaRisolta])
        expect(carta(w).get('[data-parte="progresso"]').text()).toBe('Answer sent from another window')
        w.unmount()
        const storia = await schermata()
        await consegna(blocchi)
        expect(carte(storia).map((c) => c.get('[data-parte="progresso"]').text())).toEqual(['Answer sent', 'Question skipped'])
        expect(storia.find('[data-testid="talos-domanda"] [data-azione]').exists()).toBe(false)
        // le opzioni offerte, con la consigliata e la scelta
        const offerte = carte(storia)[0].findAll('[data-parte="offerta"]')
        expect(offerte.map((o) => [o.attributes('data-etichetta'), o.attributes('data-scelta')])).toEqual([['SQLite', 'false'], ['PostgreSQL', 'true'], ['Login', 'true'], ['Ricerca', 'false'], ['Esporta', 'false']])
        storia.unmount()
    })

    it('CDM-06 la bozza resta: rimontata la schermata, la scelta e «Altro» tornano', async () => {
        const w = await schermata()
        await consegna(finoAllaPrima)
        await tocca(w, 'PostgreSQL')
        await tocca(w, 'Ricerca')
        await carta(w).get('[data-parte="altro"]').setValue('Backup')
        w.unmount()
        const v = await schermata()
        await consegna(finoAllaPrima)
        expect(carta(v).get('[data-opzione="PostgreSQL"]').attributes('aria-checked')).toBe('true')
        await premi(v, 'avanti')
        expect(carta(v).get('[data-opzione="Ricerca"]').attributes('aria-checked')).toBe('true')
        expect((carta(v).get('[data-parte="altro"]').element as HTMLInputElement).value).toBe('Backup')
        v.unmount()
    })

    it('CDM-07 testo libero, tasti 1-9 con il fuoco nella carta, e la domanda sopravvissuta a un riavvio', async () => {
        const w = await schermata()
        await consegna([...finoAllaPrima.slice(0, -1), conDomande([{ id: 'nome', question: 'Come si chiama il progetto?', why: 'Va nel titolo.' }])])
        expect(carta(w).get('[data-parte="progresso"]').text()).toBe('One decision')
        await carta(w).get('[data-parte="libera"]').setValue('  Atlas  ')
        await premi(w, 'rivedi')
        await premi(w, 'invia')
        expect(domande()).toEqual([{ requestId: ID, status: 'answered', answers: { nome: 'Atlas' } }])
        w.unmount()

        const v = await schermata()
        await consegna(finoAllaPrima)
        const prima = carta(v).get('[data-opzione="SQLite"]')
        ;(prima.element as HTMLElement).focus()
        await prima.trigger('keydown', { key: '2' })
        await asciuga()
        expect(carta(v).get('[data-parte="progresso"]').text()).toBe('Question 2 of 2')
        await carta(v).get('[data-opzione="Login"]').trigger('keydown', { key: '3' })
        expect(carta(v).get('[data-opzione="Esporta"]').attributes('aria-checked')).toBe('true')
        v.unmount()

        // dopo un riavvio la storia finisce senza giro in corso e la domanda è ancora aperta: la carta lo dice
        const r = await schermata()
        await consegna(['data: {"type":"CUSTOM","name":"talos.fine-rigiocata","value":null}', richiesta])
        expect(carta(r).get('[data-parte="avviso-invio"]').text()).toBe('The server restarted: the question is still open. Answer here to resume work; writing a new message closes the question.')
        r.unmount()
    })
})
