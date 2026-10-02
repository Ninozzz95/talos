import { describe, expect, it } from 'vitest'
import { createSessionRegistry } from '../../../android/app/src/main/assets/talos-harness-ui/harness-ui/src/session-registry.mjs'

/**
 * ⭐⭐⭐ P4-ter (02/10/2026) — la compattazione del Codice nel registro del server del Pad. Porta del desktop
 * (`AVM-integrazione-r4` @ `e027390ba`, `session-registry.mjs:3813-3906`, `:9845-9899`; decisioni dell'owner del 24/09:
 * record + storia grezza, background a fine giro, Annulla). Prima: il «Compatta» sostituiva `messaggiFinali` col
 * riassunto (storia persa) e nessun record sopravviveva al turno. Ledger `LEDGER-P4TER-COMPATTATORE-2026-10-02.md`.
 */
type Evento = Record<string, unknown> & { type: string }
type Messaggio = Record<string, unknown>
type Record_ = Record<string, unknown> & { coveredThrough: number, at: string, tokenPrima: number, tokenDopo: number }

const RECORD = (coveredThrough: number, at = '2026-10-02T10:00:00.000Z'): Record_ => ({
    schema: 'talos.compattazione.v1', coveredThrough, riassunto: [{ role: 'user', content: 'RIASSUNTO' }],
    tokenPrima: 9_000, tokenDopo: 1_200, misura: 'fornitore', at, modello: 'm', indice: null,
})
const storia = (n: number): Messaggio[] => Array.from({ length: n }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` }))
const attendi = () => new Promise((ok) => setTimeout(ok, 0))

function registroDiProva(extra: Record<string, unknown> = {}) {
    const righe: Record<string, unknown>[] = []
    const ricevuti: Record<string, unknown>[] = []
    const compattazioniChieste: Record<string, unknown>[] = []
    // Ogni giro conclude subito con la storia data e, se c'è, il record del turno.
    let prossimoEsito: { messaggiFinali: Messaggio[], recordDiCompattazione?: Record_[] } = { messaggiFinali: storia(4) }
    const registro = createSessionRegistry({
        cartellaStore: '/finta',
        chiave: 'chiave-finta-mai-usata-in-rete',
        registraRigaFn: async ({ record }: { record: Record<string, unknown> }) => { righe.push(record) },
        registraRigaSyncFn: () => undefined,
        elencaSessioniPersistiteFn: async () => [],
        preparaEsecuzioneLiberaFn: () => ({ cartella: '/area/workspace', task: { consegna: 'ciao' }, comandoProva: null }),
        avviaSessioneFn: async (argomenti: Record<string, unknown> & { onEvento: (e: Evento) => void }) => {
            ricevuti.push(argomenti)
            argomenti.onEvento({ type: 'RunStarted' })
            argomenti.onEvento({ type: 'RunFinished' })
            return { ok: true, esito: { comeFinita: 'concluso', ...prossimoEsito }, erroreInterno: null }
        },
        compattaSessioneFn: async (argomenti: Record<string, unknown>) => {
            compattazioniChieste.push(argomenti)
            return { record: RECORD((argomenti.messaggiFinali as Messaggio[]).length, '2026-10-02T11:00:00.000Z'), motivo: null, usage: null }
        },
        serveCompattareFn: () => ({ scatta: false }),
        ...extra,
    } as never) as unknown as {
        avviaLibero(o: Record<string, unknown>): { sessionId: string }
        resume(s: string, m?: string): { sessionId?: string, erroreAvvio?: string }
        compatta(s: string): Promise<Record<string, unknown>>
        annullaCompattazione(s: string, at: string): Promise<Record<string, unknown>>
        statoCompattazione(s: string): Record<string, unknown>
        iscriviti(s: string, f: (e: Evento) => void): () => void
        ripristina(): Promise<unknown>
    }
    return { registro, righe, ricevuti, compattazioniChieste, prossimo: (e: typeof prossimoEsito) => { prossimoEsito = e } }
}

describe('P4-ter — il registro conserva il record e riparte proiettato', () => {
    it('REG-COMP-01 il record del turno si salva e il turno dopo lo riceve come recordCompattazioneIniziale', async () => {
        const { registro, righe, ricevuti, prossimo } = registroDiProva()
        prossimo({ messaggiFinali: storia(10), recordDiCompattazione: [RECORD(8, 'a'), RECORD(10, 'b')] })
        const { sessionId } = registro.avviaLibero({ cartellaId: '0', consegna: 'ciao', mobile: true })
        await attendi()
        expect(righe.filter((r) => r.tipo === 'compattazione').map((r) => (r.record as Record_).at)).toEqual(['b'])
        prossimo({ messaggiFinali: storia(12) })
        expect(registro.resume(sessionId, 'continua').erroreAvvio).toBeUndefined()
        expect((ricevuti[1]!.recordCompattazioneIniziale as Record_).at).toBe('b')
        // La storia che riparte è GREZZA: la proiezione la fa il kernel col record (decisione 3 dell'owner).
        expect((ricevuti[1]!.messaggiIniziali as Messaggio[]).slice(0, 10)).toEqual(storia(10))
        expect(registro.statoCompattazione(sessionId)).toMatchObject({ record: { at: 'b', tokenPrima: 9_000, tokenDopo: 1_200 }, inCorso: false })
    })

    it('REG-COMP-02 dopo un riavvio: l\'ULTIMA storia salvata e l\'ultimo record; una lapide lo annulla', async () => {
        const righe = [
            { tipo: 'intestazione', sessionId: 's1', taskId: 'libero:0', cartella: '/area/workspace', task: { consegna: 'x' }, avviataAlle: '2026-10-02T09:00:00.000Z', permessi: 'Workspace write' },
            { type: 'RunFinished', _sequenza: 1 },
            { tipo: 'messaggi-finali', messaggiFinali: storia(4) },
            { tipo: 'compattazione', record: RECORD(4, 'primo') },
            { type: 'RunFinished', _sequenza: 2 },
            { tipo: 'messaggi-finali', messaggiFinali: storia(8) },
            { tipo: 'compattazione', record: RECORD(8, 'secondo') },
        ]
        const conLapide = [...righe, { tipo: 'compattazione-annullata', at: 'secondo' }]
        for (const [registrate, atteso] of [[righe, 'secondo'], [conLapide, null]] as const) {
            const ricevuti: Record<string, unknown>[] = []
            const registro = createSessionRegistry({
                cartellaStore: '/finta', chiave: 'k', registraRigaFn: async () => undefined, registraRigaSyncFn: () => undefined,
                elencaSessioniPersistiteFn: async () => ['s1'], leggiRegistroFn: async () => registrate,
                avviaSessioneFn: async (a: Record<string, unknown>) => { ricevuti.push(a); return new Promise(() => {}) },
                serveCompattareFn: () => ({ scatta: false }),
            } as never) as unknown as { ripristina(): Promise<unknown>, resume(s: string, m?: string): { erroreAvvio?: string } }
            await registro.ripristina()
            expect(registro.resume('s1', 'avanti').erroreAvvio).toBeUndefined()
            // ⛔ Difetto vecchio trovato qui: il ripristino prendeva la PRIMA riga `messaggi-finali` (righe accodate).
            expect((ricevuti[0]!.messaggiIniziali as Messaggio[]).slice(0, 8)).toEqual(storia(8))
            expect((ricevuti[0]!.recordCompattazioneIniziale as Record_ | undefined)?.at ?? null).toBe(atteso)
        }
    })

    it('REG-COMP-03 a fine giro, sopra soglia: compattazione in background, record salvato, eventi per la UI', async () => {
        const { registro, righe, compattazioniChieste, prossimo } = registroDiProva({ serveCompattareFn: () => ({ scatta: true }) })
        prossimo({ messaggiFinali: storia(20) })
        const { sessionId } = registro.avviaLibero({ cartellaId: '0', consegna: 'ciao', mobile: true })
        const eventi: Evento[] = []
        registro.iscriviti(sessionId, (e) => eventi.push(e))
        await attendi(); await attendi()
        expect(compattazioniChieste).toHaveLength(1)
        expect(compattazioniChieste[0]).toMatchObject({ motivo: 'background' })
        expect(compattazioniChieste[0]!.messaggiFinali).toEqual(storia(20))
        expect(righe.some((r) => r.tipo === 'compattazione')).toBe(true)
        expect(eventi.find((e) => e.type === 'CompactionStart')).toMatchObject({ motivo: 'background' })
        expect(eventi.find((e) => e.type === 'CompactionEnd')).toMatchObject({ compattato: true, tokenPrima: 9_000, tokenDopo: 1_200, at: '2026-10-02T11:00:00.000Z' })
    })

    it('REG-COMP-04 sotto soglia: nessuna chiamata, nessuna riga, nessun evento', async () => {
        const { registro, righe, compattazioniChieste } = registroDiProva()
        const { sessionId } = registro.avviaLibero({ cartellaId: '0', consegna: 'ciao', mobile: true })
        const eventi: Evento[] = []
        registro.iscriviti(sessionId, (e) => eventi.push(e))
        await attendi(); await attendi()
        expect(compattazioniChieste).toHaveLength(0)
        expect(righe.some((r) => r.tipo === 'compattazione')).toBe(false)
        expect(eventi.some((e) => e.type === 'CompactionStart' || e.type === 'CompactionEnd')).toBe(false)
    })

    it('REG-COMP-05 «Compatta ora»: un record, la storia NON cambia (prima: sostituita dal riassunto)', async () => {
        const { registro, compattazioniChieste, prossimo } = registroDiProva()
        prossimo({ messaggiFinali: storia(6) })
        const { sessionId } = registro.avviaLibero({ cartellaId: '0', consegna: 'ciao', mobile: true })
        await attendi()
        const esito = await registro.compatta(sessionId)
        expect(esito).toMatchObject({ ok: true, compattato: true, tokenPrima: 9_000, tokenDopo: 1_200 })
        expect(compattazioniChieste[0]).toMatchObject({ motivo: 'manuale' })
        expect(registro.statoCompattazione(sessionId)).toMatchObject({ record: { coveredThrough: 6 } })
        prossimo({ messaggiFinali: storia(8) })
        registro.resume(sessionId, 'continua')
        await attendi()
    })

    /*
     * ⛔ Gli eventi si salvano e si rigiocano alla riapertura: un CompactionStart senza il suo CompactionEnd lascerebbe la
     * riga «Riassumo la conversazione…» per sempre. «Compatta ora» non mandava lo Start (nessuna barra durante) e un
     * riassuntore che lancia, a mano o in background, non mandava la fine.
     */
    it('REG-COMP-08 ogni inizio ha la sua fine: «Compatta ora» manda inizio e fine; se il riassunto lancia, fine «non compattato»', async () => {
        const { registro, prossimo } = registroDiProva()
        prossimo({ messaggiFinali: storia(6) })
        const { sessionId } = registro.avviaLibero({ cartellaId: '0', consegna: 'ciao', mobile: true })
        await attendi()
        const eventi: Evento[] = []
        registro.iscriviti(sessionId, (e) => eventi.push(e))
        await registro.compatta(sessionId)
        const compattazione = (lista: Evento[]) => lista.filter((e) => e.type === 'CompactionStart' || e.type === 'CompactionEnd')
        expect(compattazione(eventi).map((e) => [e.type, e.motivo])).toEqual([['CompactionStart', 'manuale'], ['CompactionEnd', 'manuale']])

        const lancia = async () => { throw new Error('rete giù') }
        const aMano = registroDiProva({ compattaSessioneFn: lancia })
        aMano.prossimo({ messaggiFinali: storia(6) })
        const s2 = aMano.registro.avviaLibero({ cartellaId: '0', consegna: 'ciao', mobile: true }).sessionId
        await attendi()
        const eventi2: Evento[] = []
        aMano.registro.iscriviti(s2, (e) => eventi2.push(e))
        expect(await aMano.registro.compatta(s2)).toMatchObject({ ok: true, compattato: false })
        expect(compattazione(eventi2).map((e) => [e.type, e.compattato])).toEqual([['CompactionStart', undefined], ['CompactionEnd', false]])

        const sfondo = registroDiProva({ compattaSessioneFn: lancia, serveCompattareFn: () => ({ scatta: true }) })
        sfondo.prossimo({ messaggiFinali: storia(20) })
        const s3 = sfondo.registro.avviaLibero({ cartellaId: '0', consegna: 'ciao', mobile: true }).sessionId
        const eventi3: Evento[] = []
        sfondo.registro.iscriviti(s3, (e) => eventi3.push(e))
        await attendi(); await attendi(); await attendi()
        expect(compattazione(eventi3).map((e) => [e.type, e.compattato])).toEqual([['CompactionStart', undefined], ['CompactionEnd', false]])
    })

    /*
     * ⛔ Trovato leggendo il kernel durante la prova sul Pad (02/10): sull'errore `compattaFuoriDalGiro` rende
     * `motivo: "errore: <messaggio>"` (`talosHarness.mjs:296`) e il registro lo passava tale e quale alla risposta HTTP e
     * agli eventi salvati su disco. Il messaggio può portare ciò che il fornitore ha rimandato: resta nel log del server.
     */
    it('REG-COMP-09 il messaggio di un errore non esce dal server: risposta ed eventi dicono solo «errore»', async () => {
        const fallisce = async () => ({ record: null, motivo: 'errore: 401 {"error":"chiave sk-or-v1-abcdef0123456789 rifiutata"}', usage: null })
        for (const extra of [{}, { serveCompattareFn: () => ({ scatta: true }) }]) {
            const p = registroDiProva({ compattaSessioneFn: fallisce, ...extra })
            p.prossimo({ messaggiFinali: storia(20) })
            const s = p.registro.avviaLibero({ cartellaId: '0', consegna: 'ciao', mobile: true }).sessionId
            const eventi: Evento[] = []
            p.registro.iscriviti(s, (e) => eventi.push(e))
            await attendi(); await attendi(); await attendi()
            const esito = 'serveCompattareFn' in extra ? null : await p.registro.compatta(s)
            if (esito) expect(esito).toMatchObject({ ok: true, compattato: false, motivo: 'errore' })
            const fine = eventi.filter((e) => e.type === 'CompactionEnd')
            expect(fine.length).toBeGreaterThan(0)
            for (const e of fine) expect(e.motivo).toBe('errore')
            expect(JSON.stringify([esito, eventi, p.righe])).not.toContain('sk-or-v1')
        }
    })

    it('REG-COMP-06 Annulla: una lapide su disco, la proiezione torna grezza, la UI lo sa', async () => {
        const { registro, righe, ricevuti, prossimo } = registroDiProva()
        prossimo({ messaggiFinali: storia(10), recordDiCompattazione: [RECORD(10, 'da-annullare')] })
        const { sessionId } = registro.avviaLibero({ cartellaId: '0', consegna: 'ciao', mobile: true })
        await attendi()
        const eventi: Evento[] = []
        registro.iscriviti(sessionId, (e) => eventi.push(e))
        expect(await registro.annullaCompattazione(sessionId, 'altro')).toMatchObject({ code: 'COMPACTION_NOT_FOUND' })
        expect(await registro.annullaCompattazione(sessionId, 'da-annullare')).toEqual({ ok: true, annullata: true })
        // (gli eventi si salvano anch'essi come righe: si cerca la lapide, non l'ultima riga)
        expect(righe.find((r) => r.tipo === 'compattazione-annullata')).toMatchObject({ at: 'da-annullare' })
        expect(eventi.find((e) => e.type === 'CompactionUndone')).toMatchObject({ at: 'da-annullare' })
        prossimo({ messaggiFinali: storia(12) })
        registro.resume(sessionId, 'continua')
        expect(ricevuti[1]!.recordCompattazioneIniziale ?? null).toBeNull()
    })

    it('REG-COMP-07 la finestra del modello viene dal catalogo e arriva al kernel; il tetto dal server', async () => {
        const { registro, ricevuti } = registroDiProva({ finestraTokenFn: (modello: string) => (modello === 'z-ai/glm-5.3-flash' ? 131_072 : null), tettoToken: 50_000 })
        registro.avviaLibero({ cartellaId: '0', consegna: 'ciao', mobile: true, modello: 'z-ai/glm-5.3-flash' })
        await attendi()
        expect(ricevuti[0]).toMatchObject({ finestraToken: 131_072, tettoToken: 50_000 })
    })
})

import { createServer as creaServerHttp } from 'node:http'
import { createHttpApp } from '../../../android/app/src/main/assets/talos-harness-ui/harness-ui/src/http-app.mjs'

describe('P4-ter — le rotte della compattazione', () => {
    it('HTTP-COMP-01 stato, annulla (solo {at}) e «Compatta ora» coi numeri', async () => {
        const chiamate: unknown[][] = []
        const registro = {
            statoCompattazione: (s: string) => (s === 's1' ? { record: { at: 'x', tokenPrima: 9_000, tokenDopo: 1_200 }, inCorso: false } : { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' }),
            annullaCompattazione: async (s: string, at: string) => { chiamate.push(['annulla', s, at]); return at === 'x' ? { ok: true, annullata: true } : { erroreAvvio: 'no', code: 'COMPACTION_NOT_FOUND' } },
            compatta: async (s: string) => { chiamate.push(['compatta', s]); return { ok: true, compattato: true, tokenPrima: 9_000, tokenDopo: 1_200, at: 'y' } },
        }
        const segreto = 'e'.repeat(64)
        const app = createHttpApp({ campaignService: { list: async () => [], get: async () => null }, staticHandler: async () => null, sessionRegistry: registro, segreto } as never)
        const server = creaServerHttp(app as never)
        await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
        try {
            const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/v1/sessions/s1`
            const intestazioni = { 'Content-Type': 'application/json', Authorization: `Bearer ${segreto}` }
            const stato = await (await fetch(`${base}/compaction`, { headers: intestazioni })).json() as { ok: boolean, data: Record<string, unknown> }
            expect(stato).toMatchObject({ ok: true, data: { record: { at: 'x' }, inCorso: false } })
            const annulla = await fetch(`${base}/compaction/undo`, { method: 'POST', headers: intestazioni, body: JSON.stringify({ at: 'x' }) })
            expect(annulla.status).toBe(200)
            const sbagliata = await fetch(`${base}/compaction/undo`, { method: 'POST', headers: intestazioni, body: JSON.stringify({ at: 'z' }) })
            expect(sbagliata.status).toBe(404)
            const malformata = await fetch(`${base}/compaction/undo`, { method: 'POST', headers: intestazioni, body: JSON.stringify({ at: 'x', extra: 1 }) })
            expect(malformata.status).toBe(400)
            const compatta = await (await fetch(`${base}/compact`, { method: 'POST', headers: intestazioni, body: '{}' })).json() as { data: Record<string, unknown> }
            expect(compatta.data).toEqual({ compattato: true, tokenPrima: 9_000, tokenDopo: 1_200, at: 'y' })
            expect(chiamate).toEqual([['annulla', 's1', 'x'], ['annulla', 's1', 'z'], ['compatta', 's1']])
        } finally {
            server.close()
        }
    })
})
