// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { TalosR4ClientePonte } from '@/lib/harness/r4/clienteR4'

/**
 * ⛔ K3-AP3 (ledger `LEDGER-K3-FIGLIE-2026-10-16.md`; owner 16/10: carta nella conversazione principale, il nome apre l'agente,
 * alla ricarica tornano solo le carte in attesa). Il flusso è quello VERO della madre registrato sul Pad (r4 2161afb32, fornitore
 * finto): istantanee `talos.agenti` delle due figlie, `/pending` vero di ciascuna.
 */
const figlie = JSON.parse(readFileSync(resolve(__dirname, '..', '..', 'fixtures', 'r4', 'figlie-701c6c0d2.json'), 'utf8'))
const MADRE = '33333333-3333-4333-8333-333333333333'
const FIGLIA1 = '66666666-6666-4666-8666-666666666661'
const FIGLIA2 = '66666666-6666-4666-8666-666666666662'
const blocchi = (figlie.flusso as string).split(/\n\n/u).filter((b) => b.includes('data:'))
const operazione = (b: string) => {
    const d = JSON.parse(b.split('\n').find((r) => r.startsWith('data:'))!.slice(5)) as { name?: string; value?: { operation?: { kind?: string; status?: string } } }
    return d.name === 'talos.agenti' ? `${d.value?.operation?.kind}/${d.value?.operation?.status}` : ''
}
const indice = (op: string) => blocchi.findIndex((b) => operazione(b) === op)
const fino = (op: string) => blocchi.slice(0, indice(op) + 1)
const tra = (da: string, a: string) => blocchi.slice(indice(da) + 1, indice(a) + 1)

const stato = vi.hoisted(() => ({
    ascoltatori: {} as Record<string, ((d: Record<string, unknown>) => void)[]>,
    flussi: [] as { id: string; percorso: string }[],
    richieste: [] as { metodo: string; percorso: string; corpo?: string }[],
    rispondi: null as null | ((r: { metodo: string; percorso: string; corpo?: string }) => { stato: number; corpo: string } | null),
    push: [] as unknown[],
}))
vi.mock('vue-router', async () => {
    const { reactive } = await import('vue')
    const rotta = reactive({ params: { id: '33333333-3333-4333-8333-333333333333' } as Record<string, string> })
    return { useRoute: () => rotta, useRouter: () => ({ push: (r: unknown) => { stato.push.push(r) }, replace: vi.fn() }) }
})
vi.mock('@/lib/harness/terminalePonte', () => ({ talosR4Pronto: async () => ({ disponibile: true, acceso: true, porta: 4178, cartella: '/data/w' }) }))
vi.mock('@/lib/harness/r4/clienteR4', () => ({
    talosClienteR4: (): TalosR4ClientePonte => ({
        richiesta: async (r) => {
            stato.richieste.push(r)
            const scelta = stato.rispondi?.(r)
            if (scelta) return scelta
            if (r.percorso.endsWith('66666666-6666-4666-8666-666666666661/pending')) return { stato: 200, corpo: JSON.stringify({ ok: true, data: figlie.pending1 }) }
            if (r.percorso.endsWith('66666666-6666-4666-8666-666666666662/pending')) return { stato: 200, corpo: JSON.stringify({ ok: true, data: figlie.pending2 }) }
            if (r.metodo === 'GET' && r.percorso === '/api/v1/sessions') {
                return { stato: 200, corpo: JSON.stringify({ ok: true, data: { items: [{ sessionId: '33333333-3333-4333-8333-333333333333', nome: 'Delega i test', permessi: 'Full access', permessiPerAttrezzo: {} }] } }) }
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

async function asciuga() { for (let i = 0; i < 4; i++) { await flushPromises(); await vi.dynamicImportSettled() } }
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
const cartaDellaFiglia = (w: W, figlia: string) => w.find(`[data-figlia="${figlia}"]`)
const posti = (fine: string) => stato.richieste.filter((r) => r.metodo === 'POST' && r.percorso.endsWith(fine)).map((r) => ({ percorso: r.percorso, corpo: JSON.parse(r.corpo!) }))

afterEach(() => {
    document.body.innerHTML = ''
    stato.ascoltatori = {}
    stato.flussi = []
    stato.richieste = []
    stato.rispondi = null
    stato.push = []
    sessionStorage.clear()
})

describe('le richieste delle sotto-sessioni nel Codice su r4 (K3-AP3)', () => {
    // la madre qui è su «Accesso pieno», la figlia su «Chiede prima»: il perché deve dire quella della figlia
    it('CFG-01 la carta della figlia sta nella conversazione della madre: chi chiede, il comando esatto, il perché con la SUA politica', async () => {
        const w = await schermata()
        await consegna(fino('approval/waiting'))
        const c = cartaDellaFiglia(w, FIGLIA1)
        expect(c.exists()).toBe(true)
        expect(c.attributes('data-testid')).toBe('talos-approvazione')
        expect(c.get('[data-parte="chi"]').text()).toBe('The agent “Esegui i test del progetto” is asking')
        expect(c.get('[data-parte="codice"]').text()).toBe('echo test-ok')
        expect(c.get('[data-parte="motivo"]').text()).toBe('It asks because the session is on “Asks first”: every action that changes something goes through you.')
        // `sempreNonBasta` vero dalla figlia: «Per questa sessione» sarebbe una promessa falsa
        expect(c.findAll('[data-scelta]').map((b) => b.attributes('data-scelta'))).toEqual(['nega', 'unaVolta'])
        w.unmount()
    })

    it('CFG-02 «Consenti una volta» risponde alla figlia con `rispostoDa`; l\'esito arriva dall\'istantanea, senza «da un\'altra finestra»', async () => {
        const w = await schermata()
        await consegna(fino('approval/waiting'))
        await cartaDellaFiglia(w, FIGLIA1).get('[data-scelta="unaVolta"]').trigger('click')
        await asciuga()
        expect(posti('/approve').at(-1)).toEqual({ percorso: `/api/v1/sessions/${FIGLIA1}/approve`, corpo: { requestId: '77777777-7777-4777-8777-777777777771', approvato: true, rispostoDa: MADRE } })
        await consegna(tra('approval/waiting', 'approval/resolved'))
        expect(cartaDellaFiglia(w, FIGLIA1).get('[data-parte="esito"]').text()).toBe('Approved')
        w.unmount()
    })

    it('CFG-03 il nome dell\'agente apre la sotto-sessione', async () => {
        const w = await schermata()
        await consegna(fino('approval/waiting'))
        await cartaDellaFiglia(w, FIGLIA1).get('[data-parte="apri-figlia"]').trigger('click')
        await asciuga()
        expect(stato.push).toContainEqual({ name: 'codice-r4', params: { id: FIGLIA1 } })
        w.unmount()
    })

    it('CFG-04 la domanda della figlia: badge «Question», risposta alla figlia, ricevuta con le risposte date da qui', async () => {
        const w = await schermata()
        await consegna(fino('question/waiting'))
        const c = () => cartaDellaFiglia(w, FIGLIA2)
        expect(c().attributes('data-testid')).toBe('talos-domanda')
        expect(c().get('[data-parte="chi"]').text()).toBe('The agent “Prepara il progetto” is asking')
        expect(c().get('[data-parte="badge"]').text()).toBe('Question')
        await c().get('[data-opzione="SQLite"]').trigger('click'); await asciuga()
        await c().get('[data-opzione="Ricerca"]').trigger('click'); await asciuga()
        await c().get('[data-azione="rivedi"]').trigger('click'); await asciuga()
        await c().get('[data-azione="invia"]').trigger('click'); await asciuga()
        expect(posti('/question').at(-1)).toEqual({ percorso: `/api/v1/sessions/${FIGLIA2}/question`,
            corpo: { requestId: '77777777-7777-4777-8777-777777777772', status: 'answered', answers: { database: 'SQLite', funzioni: ['Ricerca'] }, rispostoDa: MADRE } })
        await consegna(tra('question/waiting', 'question/resolved'))
        expect(c().get('[data-parte="progresso"]').text()).toBe('Answer sent')
        expect(c().findAll('[data-parte="risposta"]').map((r) => r.text())).toEqual(['SQLite', 'Ricerca'])
        w.unmount()
    })

    it('CFG-05 un 403 vero della catena riapre i pulsanti; dopo una ricarica la figlia che aspetta ancora ritrova la carta', async () => {
        stato.rispondi = (r) => (r.percorso.endsWith('/approve') ? { stato: 403, corpo: JSON.stringify(figlie.rispostoDaSbagliato.d) } : null)
        const w = await schermata()
        await consegna(fino('approval/waiting'))
        await cartaDellaFiglia(w, FIGLIA1).get('[data-scelta="nega"]').trigger('click')
        await asciuga()
        expect(cartaDellaFiglia(w, FIGLIA1).get('[data-parte="non-inviata"]').text()).toBe('Response failed')
        expect(cartaDellaFiglia(w, FIGLIA1).get('[data-scelta="nega"]').attributes('disabled')).toBeUndefined()
        w.unmount()

        stato.rispondi = (r) => {
            if (r.metodo === 'GET' && r.percorso === '/api/v1/sessions') return { stato: 200, corpo: JSON.stringify({ ok: true, data: { items: figlie.sessioni1 } }) }
            if (r.percorso === `/api/v1/sessions/${MADRE}/children`) return { stato: 200, corpo: JSON.stringify({ ok: true, data: { figli: [{ sessionId: FIGLIA1, taskCorto: 'Esegui i test del progetto' }] } }) }
            return null
        }
        const v = await schermata()
        await consegna(['data: {"type":"CUSTOM","name":"talos.fine-rigiocata","value":null}'])
        expect(cartaDellaFiglia(v, FIGLIA1).get('[data-parte="chi"]').text()).toBe('The agent “Esegui i test del progetto” is asking')
        v.unmount()
    })

    /* Regressione trovata nelle foto del Pad (16/10): dopo la ricarica la carta della domanda di una FIGLIA diceva «Il server è stato
       riavviato: la domanda è ancora aperta», perché la madre era ferma. L'avviso è delle domande della sessione stessa
       (`segnalaDomandeSopravvissute` scorre solo `domandePendenti`): la figlia aspetta con il suo giro vivo. */
    it('CFG-06 la domanda di una figlia non dice mai «il server è stato riavviato», anche con la madre ferma', async () => {
        stato.rispondi = (r) => {
            if (r.metodo === 'GET' && r.percorso === '/api/v1/sessions') return { stato: 200, corpo: JSON.stringify({ ok: true, data: { items: [{ sessionId: FIGLIA2, padreId: MADRE, inAttesaDomanda: true }] } }) }
            if (r.percorso === `/api/v1/sessions/${MADRE}/children`) return { stato: 200, corpo: JSON.stringify({ ok: true, data: { figli: [{ sessionId: FIGLIA2, taskCorto: 'Prepara il progetto' }] } }) }
            return null
        }
        const w = await schermata()
        await consegna(['data: {"type":"CUSTOM","name":"talos.fine-rigiocata","value":null}'])
        const c = cartaDellaFiglia(w, FIGLIA2)
        expect(c.attributes('data-testid')).toBe('talos-domanda')
        expect(c.find('[data-parte="avviso-invio"]').exists()).toBe(false)
        w.unmount()
    })

    /* Regressione misurata sul Pad (16/10, K3-AP3): i testi per il lettore di schermo (`sr-only`, `position:absolute`) dei messaggi e
       delle carte avevano come blocco contenitore il `div.relative` FUORI dallo scorrimento, che non è posizionato e quindi non li
       taglia: restavano alla loro posizione naturale (fino a 4.452 px) e la cornice `mobile-screen-body` (overflow:hidden) arrivava a
       5.023 px contro 914. Uno `scrollIntoView` o un `focus()` la faceva scorrere, e la testata finiva sotto la barra di stato. jsdom
       non calcola il layout: qui si fissa il contratto (lo scorrimento è `relative`), la misura vera è sul Pad. */
    it('CFG-07 lo scorrimento del Codice è il blocco contenitore delle sue righe assolute (la cornice non si allunga)', async () => {
        const w = await schermata()
        expect(w.get('[data-testid="talos-codice-r4-scorrimento"]').classes()).toContain('relative')
        w.unmount()
    })
})
