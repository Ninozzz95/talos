import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { leggiFlussoSse } from '@/lib/harness/r4/eventiR4'
import {
    agentiDelPannelloR4, annotaRichiestaR4, contaAgentiAttiviR4, etichettaDelegaR4, gruppiAgentiR4, istantaneaAgenteR4,
    nomeDiRipiegoAttrezzoR4, nomeUmanoAttrezzoR4, NOMI_UMANI_ATTREZZI_R4, statoDelegaR4, suUnaRigaR4, senzaInganniSuPiuRigheR4,
    contoDellaRichiestaR4, statoDelPassoR4, type RichiestaR4,
} from '@/lib/harness/r4/agentiR4'
import { agenteVivoR4 } from '@/lib/harness/r4/fermaTuttoR4'

/*
 * ⛔ K3-C3b-2b (ledger `LEDGER-K3-CODICE-COME-LA-CHAT-2026-10-15.md`): la scheda Agenti su r4. Il golden l'hanno calcolato le funzioni
 * VERE del desktop r4 @ 2161afb32 (K3-R4SPOSTA; prima fc5e25d62) (`modelloGrafoAgenti`, `runDalleDeleghe`, `contaAgentiAttivi`, `nomeUmanoAttrezzo`) con la composizione
 * di `agentiPerInspector`, su una sessione registrata da r4 con due richieste che delegano (due figlie, poi una 21 s dopo).
 */
const FIXTURE = resolve(__dirname, '..', '..', 'fixtures', 'r4')
const golden = JSON.parse(readFileSync(resolve(FIXTURE, 'agenti-4cee78f33.json'), 'utf8'))
const eventi = leggiFlussoSse(readFileSync(resolve(FIXTURE, 'r4-fc5e25d62-delega-vivo.sse'), 'utf8')).map((e) => e.dati as Record<string, unknown>)

describe('gli Agenti su r4, contro il desktop (K3-C3b-2b)', () => {
    it('AGE-01 dagli eventi: le richieste della persona (regola della rigiocata) e le istantanee dal vivo delle figlie', () => {
        expect(golden.origine.commit).toBe('4cee78f3349c5d34b4f44303a157b93542656aef')
        const richieste = eventi.reduce<RichiestaR4[]>((r, e) => annotaRichiestaR4(r, e), [])
        expect(richieste).toEqual(golden.ingressi.richieste)
        const inDiretta = new Map<string, unknown>()
        for (const e of eventi) { const a = istantaneaAgenteR4(e, golden.ingressi.id); if (a) inDiretta.set(a.sessionId as string, a) }
        expect([...inDiretta.values()]).toEqual(golden.ingressi.inDiretta)
        // un evento di un'altra sessione non entra
        expect(istantaneaAgenteR4(eventi.find((e) => e.type === 'CUSTOM' && e.name === 'talos.agenti')!, 'un-altra')).toBeNull()
    })

    it('AGE-02 gli agenti della scheda e il numero degli attivi, uguali al desktop in ogni caso e in tutte e due le lingue', () => {
        for (const esito of golden.esiti) {
            for (const caso of ['vivo', 'soloElenco', 'senzaRichieste', 'alLavoro']) {
                const agenti = agentiDelPannelloR4(golden.casi[caso], esito.lingua)
                expect(agenti, `${esito.lingua} · ${caso}`).toEqual(esito[caso].agenti)
                // ⛔ adattamento dichiarato (owner 29/10 notte, AGE-VIVI-01): il numero conta TUTTI i vivi, anche chi aspetta te; il
                // desktop @ 4cee78f33 (`esito[caso].attivi`) conta solo «in corso». Dove nessuno aspetta, i due numeri sono uguali.
                expect(contaAgentiAttiviR4(agenti), caso).toBe(agenti.filter(agenteVivoR4).length)
                if (!agenti.some((a) => statoDelegaR4(a) === 'attesa')) expect(contaAgentiAttiviR4(agenti), caso).toBe(esito[caso].attivi)
            }
        }
    })

    it('AGE-03 due gruppi: la richiesta più recente in cima e aperta; senza richieste o con una sola, niente gruppi', () => {
        const agenti = agentiDelPannelloR4(golden.casi.vivo, 'it')
        const g = gruppiAgentiR4(agenti, agenti)!
        expect(g.gruppi.map((x) => [x.richiesta.testo, x.agenti.length, x.richiesta.corrente])).toEqual([
            ['Delega ancora un controllo', 1, true],
            ['Delega i compiti a due agenti', 2, false],
        ])
        expect(g.piuRecente).toBe(g.gruppi[0].richiesta.id)
        expect(gruppiAgentiR4(agentiDelPannelloR4(golden.casi.senzaRichieste, 'it'), agentiDelPannelloR4(golden.casi.senzaRichieste, 'it'))).toBeNull()
        const soloPrime = agenti.filter((a) => a.richiesta?.id === g.gruppi[1].richiesta.id)
        expect(gruppiAgentiR4(soloPrime, soloPrime)).toBeNull()
    })

    it('AGE-04 i nomi degli attrezzi: la stessa tabella del desktop, le stesse parole, lo stesso ripiego', () => {
        expect(NOMI_UMANI_ATTREZZI_R4).toEqual(golden.nomiAttrezzi)
        const ids = ['leggi', 'shell', 'delega_sottotask', 'web_search', 'inventato', 'mcp__github__create_issue']
        for (const esito of golden.esiti) {
            expect(ids.map((x) => nomeUmanoAttrezzoR4(x, esito.lingua))).toEqual(esito.nomiUmani)
            expect(ids.map((x) => nomeDiRipiegoAttrezzoR4(x))).toEqual(esito.ripieghi)
        }
    })

    it('AGE-05 lo stato di una delega a parole, «interrotta» prima di tutto; i caratteri che ingannano non arrivano a schermo', () => {
        const casi: [Record<string, unknown>, string, string][] = [
            [{ conclusa: false, interrotta: true }, 'interrotta', 'it'],
            [{ conclusa: true, motivoChiusura: 'fermata' }, 'interrotta', 'it'],
            [{ conclusa: false, esitoDelega: 'in-pausa' }, 'in-pausa', 'it'],
            [{ conclusa: true, esitoDelega: 'fallito' }, 'fallita', 'en'],
            [{ conclusa: true, ultimoEsito: 'successo' }, 'conclusa', 'en'],
            [{ conclusa: false, approvalPendingCount: 2 }, 'attesa', 'it'],
            [{ conclusa: false }, 'in-corso', 'it'],
            [{}, 'ignoto', 'en'],
        ]
        for (const [a, stato] of casi) expect(statoDelegaR4(a), JSON.stringify(a)).toBe(stato)
        expect(etichettaDelegaR4({ conclusa: false }, 'it')).not.toBe('processi.agents.stateRunning')
        expect(etichettaDelegaR4({}, 'en')).not.toMatch(/^agenti\./u)
        expect(suUnaRigaR4('Leggi ‮foto\nexe.jpg')).toBe('Leggi foto exe.jpg')
        expect(senzaInganniSuPiuRigheR4('riga 1\nriga‎ 2')).toBe('riga 1\nriga 2')
    })

    /*
     * ⛔ L3-15 del desktop (13/10, r4 2161afb32 `inspector.js` `contoDellaRichiesta`): il pannello contava «terminati» solo i riusciti
     * (`statoDelega === 'conclusa'`, incerto compreso), il diagramma ogni stato finale. Ora come il diagramma (`statoDelPasso`,
     * `TERMINALI`, `ATTENZIONE` di `grafo/run-dalle-deleghe.js`): riuscito, fallito o fermato è terminato; fallito, incerto o da
     * riconciliare è «da controllare».
     */
    it('AGE-06 il conto di ogni richiesta e lo stato di ogni agente, uguali al desktop in ogni caso', () => {
        for (const esito of golden.esiti) {
            for (const caso of ['vivo', 'soloElenco', 'senzaRichieste', 'alLavoro']) {
                const gruppi = new Map<string, Record<string, unknown>[]>()
                for (const a of agentiDelPannelloR4(golden.casi[caso], esito.lingua)) {
                    const rid = (a.richiesta as { id?: string } | null)?.id ?? '(senza)'
                    gruppi.set(rid, [...(gruppi.get(rid) ?? []), a])
                }
                expect(Object.fromEntries([...gruppi].map(([rid, g]) => [rid, contoDellaRichiestaR4(g)])), `${esito.lingua} ${caso}`).toEqual(esito[caso].conti)
            }
            expect(golden.statiDiProva.map((a: Record<string, unknown>) => ({ stato: statoDelPassoR4(a), conto: contoDellaRichiestaR4([a]) }))).toEqual(esito.stati.singoli)
            expect(contoDellaRichiestaR4(golden.statiDiProva)).toEqual(esito.stati.tutti)
            expect(contoDellaRichiestaR4([])).toEqual(esito.stati.vuoto)
        }
    })
})

/*
 * ⛔ Owner 29/10 notte (scheda «Ferma» nella scheda Agenti, «Correzioni dopo il mockup»): il numero accanto ad «Agenti» conta TUTTI i
 * vivi (`agenteVivoR4`: non conclusi e non interrotti, compresi quelli che aspettano te), come lo Stop e «Ferma tutto»; la delega in
 * pausa (conclusa per r4) no. Prima contava solo «in corso» (`contaAgentiAttivi` del desktop).
 */
describe('il numero della scheda Agenti (owner 29/10 notte)', () => {
    it('AGE-VIVI-01 conta chi lavora E chi aspetta te; non i finiti, gli interrotti, quelli in pausa, né un dato che manca', () => {
        const lista = [
            { sessionId: 'lavora', conclusa: false },
            { sessionId: 'aspetta', conclusa: false, inAttesaApprovazione: true },
            { sessionId: 'domanda', conclusa: false, inAttesaDomanda: true },
            { sessionId: 'finito', conclusa: true },
            { sessionId: 'fermato', conclusa: false, interrotta: true },
            { sessionId: 'pausa', conclusa: true, esitoDelega: 'in-pausa' },
            { sessionId: 'ignoto' },
        ]
        expect(contaAgentiAttiviR4(lista)).toBe(3)
        expect(contaAgentiAttiviR4([])).toBe(0)
        // la stessa regola di «Ferma tutto» (`agenteVivoR4`), voce per voce
        for (const a of lista) expect(contaAgentiAttiviR4([a]), a.sessionId).toBe(agenteVivoR4(a) ? 1 : 0)
    })
})
