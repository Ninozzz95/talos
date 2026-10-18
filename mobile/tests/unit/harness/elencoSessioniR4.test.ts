import { describe, expect, it, vi } from 'vitest'
import { eliminaSessioneR4, fraseRifiutoSessioneR4, leggiSessioniR4, righeElencoSessioniR4, rinominaSessioneR4 } from '@/lib/harness/r4/elencoSessioniR4'

/**
 * ⛔ Owner 18/10 «non riesco andare alla lista delle sessioni … esattamente come sulla chat Legacy»
 * (ledger `LEDGER-ELENCO-SESSIONI-R4-2026-10-18.md`): la pagina elenco del Codice legge le sessioni di r4. Voci nella forma misurata
 * sul Pad (`GET /api/v1/sessions`, 18/10: 58 voci, 44 principali, `ultimaRispostaAlle` spesso nullo).
 */
const voce = (sessionId: string, extra: Record<string, unknown> = {}) => ({
    sessionId, nome: `Sessione ${sessionId}`, avviataAlle: '2026-10-17T10:00:00.000Z', ultimaRispostaAlle: null,
    conclusa: true, interrotta: false, ultimoEsito: 'successo', padreId: null, profonditaDelega: 0,
    inAttesaApprovazione: false, inAttesaDomanda: false, inAttesaPiano: false, inAttesaRichiestaMcp: false, inAttesaDiscendente: false,
    ...extra,
})

describe('ELENCO-R4: le righe della pagina elenco dalle sessioni di r4', () => {
    it('ELENCO-R4-01: solo le sessioni principali, come il desktop (niente deleghe)', () => {
        const righe = righeElencoSessioniR4([
            voce('a'),
            voce('figlia', { padreId: 'a', profonditaDelega: 1 }),
            voce('orfana', { padreId: null, profonditaDelega: 2 }),
        ])
        expect(righe.map((r) => r.id)).toEqual(['a'])
    })

    it('ELENCO-R4-02: titolo = nome; data = ultima risposta, altrimenti l\'avvio; dalla più recente', () => {
        const righe = righeElencoSessioniR4([
            voce('vecchia', { avviataAlle: '2026-10-10T08:00:00.000Z' }),
            voce('parlata', { avviataAlle: '2026-10-09T08:00:00.000Z', ultimaRispostaAlle: '2026-10-18T07:00:00.000Z' }),
            voce('nuova', { avviataAlle: '2026-10-17T08:00:00.000Z' }),
        ])
        expect(righe.map((r) => [r.id, r.title, r.updated_at])).toEqual([
            ['parlata', 'Sessione parlata', '2026-10-18T07:00:00.000Z'],
            ['nuova', 'Sessione nuova', '2026-10-17T08:00:00.000Z'],
            ['vecchia', 'Sessione vecchia', '2026-10-10T08:00:00.000Z'],
        ])
    })

    it('ELENCO-R4-03: lo stato per riga nella forma della pagina; ogni attesa di una persona conta come attesa', () => {
        const [domanda] = righeElencoSessioniR4([voce('d', { inAttesaDomanda: true, conclusa: false })])
        expect(domanda!.stato).toEqual({ conclusa: false, interrotta: false, ultimoMessaggio: null, inAttesaApprovazione: true, ultimoEsito: 'successo' })
        for (const campo of ['inAttesaApprovazione', 'inAttesaPiano', 'inAttesaRichiestaMcp', 'inAttesaDiscendente']) {
            expect(righeElencoSessioniR4([voce('x', { [campo]: true })])[0]!.stato.inAttesaApprovazione).toBe(true)
        }
        const [rotta] = righeElencoSessioniR4([voce('e', { interrotta: true, ultimoEsito: 'errore' })])
        expect(rotta!.stato).toMatchObject({ interrotta: true, ultimoEsito: 'errore', inAttesaApprovazione: false })
    })

    it('ELENCO-R4-04: voci malformate scartate, senza nome si intitola col compito o resta vuoto', () => {
        const righe = righeElencoSessioniR4([null, 7, { nome: 'senza id' }, voce('t', { nome: '', taskDelega: 'Scrivi\n  i test' })])
        expect(righe.map((r) => [r.id, r.title])).toEqual([['t', 'Scrivi i test']])
    })
})

describe('ELENCO-R4: lettura, rinomina ed eliminazione sulle rotte di r4', () => {
    const cliente = (stato: number, corpo: unknown) => ({ richiesta: vi.fn(async () => ({ stato, corpo: JSON.stringify(corpo) })) })

    it('ELENCO-R4-05: legge GET /api/v1/sessions e un rifiuto diventa un errore col codice di r4', async () => {
        const ok = cliente(200, { ok: true, data: { items: [voce('a')] } })
        expect((await leggiSessioniR4(ok)).map((r) => r.id)).toEqual(['a'])
        expect(ok.richiesta).toHaveBeenCalledWith({ metodo: 'GET', percorso: '/api/v1/sessions' })
        await expect(leggiSessioniR4(cliente(503, { ok: false, error: { code: 'X', message: 'giù' } }))).rejects.toThrow('giù')
    })

    /*
     * ⛔ ELENCO-R4-07 — visto sul Pad (18/10, app appena aperta, vista telefono): «Le sessioni non si sono caricate:
     * TALOS_R4_IRRAGGIUNGIBILE». Per il nativo r4 è «acceso» appena il processo vive (`TalosR4Avvio.acceso`), prima che la porta
     * ascolti; il client rifiuta con quel messaggio (`TalosR4ClientePlugin.kt`). Un secondo dopo rispondeva 200. Si riprova solo quello.
     */
    it('ELENCO-R4-07: r4 appena acceso e non ancora in ascolto si riprova; un rifiuto vero no, e si smette dopo i tentativi', async () => {
        const dorme = vi.fn(async () => undefined)
        const nonAncora = Object.assign(new Error('TALOS_R4_IRRAGGIUNGIBILE'), { code: 'ConnectException' })
        const avvio = { richiesta: vi.fn() }
        avvio.richiesta.mockRejectedValueOnce(nonAncora).mockRejectedValueOnce(nonAncora)
            .mockResolvedValueOnce({ stato: 200, corpo: JSON.stringify({ data: { items: [voce('a')] } }) })
        expect((await leggiSessioniR4(avvio, { dorme })).map((r) => r.id)).toEqual(['a'])
        expect(avvio.richiesta).toHaveBeenCalledTimes(3)
        expect(dorme).toHaveBeenCalledTimes(2)

        const rifiuto = cliente(503, { ok: false, error: { code: 'X', message: 'giù' } })
        await expect(leggiSessioniR4(rifiuto, { dorme })).rejects.toThrow('giù')
        expect(rifiuto.richiesta).toHaveBeenCalledTimes(1)

        const mai = { richiesta: vi.fn(async () => { throw nonAncora }) }
        await expect(leggiSessioniR4(mai, { dorme, tentativi: 4 })).rejects.toThrow('TALOS_R4_IRRAGGIUNGIBILE')
        expect(mai.richiesta).toHaveBeenCalledTimes(4)
    })

    /*
     * ⛔ ELENCO-R4-08 — review avversariale (18/10): la busta di r4 ha un `message` generico. Misurato sul Pad: rinomina con nome
     * vuoto → 400 `{code:'QUERY_INVALID', message:'Invalid query', reason:'session-name-invalid'}`; id inesistente → 404
     * `{code:'NOT_FOUND', message:'Resource not found', reason:'session-not-found'}`. L'elenco mostrava «Invalid query», in inglese.
     * La frase è quella del desktop per il MOTIVO (`errori.js` @ 701c6c0d2, `testi/errori-sessioni-r4.json`), poi per il codice.
     */
    it('ELENCO-R4-08: il perché di un rifiuto nella lingua dell\'app, dal motivo e poi dal codice; niente frase se r4 non la conosce', async () => {
        const busta = (stato: number, error: Record<string, unknown>) => ({ richiesta: vi.fn(async () => ({ stato, corpo: JSON.stringify({ ok: false, error }) })) })
        const errore = async (p: Promise<unknown>) => { try { await p } catch (e) { return e } throw new Error('doveva fallire') }
        const nome = await errore(rinominaSessioneR4(busta(400, { code: 'QUERY_INVALID', message: 'Invalid query', title: 'Operation failed', reason: 'session-name-invalid' }), 'a', ' '))
        expect(fraseRifiutoSessioneR4(nome, 'it')).toBe('Nome non valido: serve 1-80 caratteri')
        expect(fraseRifiutoSessioneR4(nome, 'en-US')).toBe('Invalid name: 1-80 characters are needed')
        const inCorso = await errore(eliminaSessioneR4(busta(409, { code: 'SESSION_STILL_RUNNING', message: 'Operation failed', reason: 'running-stop-before-delete' }), 'a'))
        expect(fraseRifiutoSessioneR4(inCorso, 'it')).toBe('Sessione ancora in corso — fermala prima di eliminarla')
        const workflow = await errore(eliminaSessioneR4(busta(409, { code: 'WORKFLOW_RUN_NOT_FINISHED', message: 'Operation failed' }), 'a'))
        expect(fraseRifiutoSessioneR4(workflow, 'it')).toBe('Un Workflow di questa conversazione è ancora in corso — annullalo prima di eliminarla')
        const sparita = await errore(eliminaSessioneR4(busta(404, { code: 'NOT_FOUND', message: 'Resource not found', reason: 'session-not-found' }), 'a'))
        expect(fraseRifiutoSessioneR4(sparita, 'it')).toBe('Sessione non trovata')
        const ignoto = await errore(eliminaSessioneR4(busta(500, { code: 'INTERNAL_ERROR', message: 'Operation failed' }), 'a'))
        expect(fraseRifiutoSessioneR4(ignoto, 'it')).toBe('')
        expect(fraseRifiutoSessioneR4(new Error('TALOS_R4_IRRAGGIUNGIBILE'), 'it')).toBe('')
        // `toString` non è una frase del dizionario
        const strano = await errore(eliminaSessioneR4(busta(409, { code: 'toString', reason: 'constructor' }), 'a'))
        expect(fraseRifiutoSessioneR4(strano, 'it')).toBe('')
    })

    it('ELENCO-R4-06: rinomina con POST /:id/rename {nome} ed elimina con POST /:id/delete', async () => {
        const ok = cliente(200, { ok: true, data: {} })
        await rinominaSessioneR4(ok, 'a/b', 'Nome nuovo')
        expect(ok.richiesta).toHaveBeenLastCalledWith({ metodo: 'POST', percorso: '/api/v1/sessions/a%2Fb/rename', corpo: JSON.stringify({ nome: 'Nome nuovo' }) })
        await eliminaSessioneR4(ok, 'a')
        expect(ok.richiesta).toHaveBeenLastCalledWith({ metodo: 'POST', percorso: '/api/v1/sessions/a/delete', corpo: '{}' })
        await expect(eliminaSessioneR4(cliente(409, { ok: false, error: { code: 'WORKFLOW_RUN_NOT_FINISHED', message: 'Workflow in corso' } }), 'a'))
            .rejects.toThrow('Workflow in corso')
    })
})
