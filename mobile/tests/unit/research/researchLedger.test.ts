import { describe, expect, it } from 'vitest'
import { talosResearchLedger } from '@/lib/research/researchLedger'

/**
 * ⛔⛔ REGISTRO-01 — «Come è stato costruito», la sezione che manca.
 *
 * ## Perché serve
 *
 * Una ricerca approfondita dura minuti e costa crediti. Alla fine la persona
 * legge un rapporto e una percentuale, e deve decidere se fidarsi — **senza
 * aver visto niente di quello che è successo in mezzo**. Il mockup approvato lo
 * chiama «Come è stato costruito»: dieci passi, ognuno col suo tempo.
 *
 * ⛔ E non è trasparenza per bellezza. Il numero dei passi e la loro durata
 * sono l'unica cosa che distingue una ricerca che ha davvero letto le pagine da
 * una che ha guardato quattro estratti: due rapporti possono avere lo stesso
 * 100% e dietro avere lavori diversissimi.
 *
 * ## La forma, dalla ricerca del 2026-08-20
 *
 * Il pattern concorde per gli agenti che lavorano a lungo è **sommario →
 * dettaglio → dati grezzi**: si riassume per tappe, si interrompe la persona
 * solo per ciò che decide, e il registro completo resta **a un clic**. Non
 * dieci righe sempre aperte: un sommario che si apre.
 *
 * ⇒ Questo modulo produce le due cose insieme — il sommario e le righe — così
 * la schermata non deve ricalcolare né decidere.
 */

const T0 = '2026-08-20T10:00:00.000Z'

function passo(over: Partial<{
    id: string
    kind: 'search' | 'read' | 'synthesise' | 'verify'
    state: 'pending' | 'running' | 'done' | 'failed' | 'interrupted'
    attempts: number
    startedAt: string | null
    finishedAt: string | null
    error: string | null
}> = {}) {
    return {
        id: 's1',
        branchId: 'b1',
        kind: 'search' as const,
        state: 'done' as const,
        attempts: 1,
        startedAt: T0,
        finishedAt: '2026-08-20T10:00:03.000Z',
        spend: {},
        resultRef: null,
        error: null,
        ...over,
    }
}

describe('REGISTRO-01 il sommario', () => {
    /**
     * ⛔⛔ LE PROVE, non i tipi di passo — e questo test è nato da un errore MIO.
     *
     * La prima versione contava `kind === 'read'` e `kind === 'verify'`, e sul
     * Pad il 2026-08-20 ha scritto «3 passi · 2 ricerche · **0 pagine lette · 0
     * verifiche**» sotto un rapporto al 100% verificato da un giudice.
     *
     * MISURATO subito dopo in `researchRuntime.ts`: il runtime emette **solo**
     * `search` e `synthesise`. `read` e `verify` non vengono creati mai — non
     * perché il lavoro non si faccia, ma perché avviene DENTRO quei due passi.
     *
     * ⇒ Il registro conta le prove che esistono: le fonti aperte per davvero e
     * le affermazioni che un giudice ha guardato.
     */
    it('conta le ricerche dai passi, e le letture dalle FONTI', () => {
        const registro = talosResearchLedger(
            [
                passo({ kind: 'search' }),
                passo({ id: 's2', kind: 'synthesise' }),
            ] as never,
            {
                sources: [{ obtained: 'page' }, { obtained: 'page' }, { obtained: 'snippet' }],
                claims: [{ checks: { judge: 'local:qwen3' } }, { checks: { judge: null } }],
            },
        )

        expect(registro.summary.search).toBe(1)
        expect(registro.summary.synthesise).toBe(1)
        // Due pagine aperte davvero; il terzo è un estratto e non conta.
        expect(registro.summary.read).toBe(2)
        // Una affermazione guardata da un giudice, una no.
        expect(registro.summary.verify).toBe(1)
    })

    it('⛔ e senza prove non inventa: zero, non il numero dei passi', () => {
        const registro = talosResearchLedger([
            passo({ kind: 'search' }),
            passo({ id: 's2', kind: 'search' }),
        ] as never)

        expect(registro.summary.read).toBe(0)
        expect(registro.summary.verify).toBe(0)
        expect(registro.summary.search).toBe(2)
    })

    it('⛔ i passi FALLITI si contano a parte: un lavoro incompleto va detto', () => {
        const registro = talosResearchLedger([
            passo(),
            passo({ id: 's2', state: 'failed', error: 'timeout' }),
            passo({ id: 's3', state: 'interrupted' }),
        ] as never)

        expect(registro.summary.failed).toBe(1)
        expect(registro.summary.interrupted).toBe(1)
        expect(registro.summary.total).toBe(3)
    })

    it('somma il tempo davvero speso, non quello dall’inizio alla fine', () => {
        // ⛔ Due passi da 3 s partiti insieme fanno 6 s di lavoro, non 3 di
        // orologio: la persona vuole sapere quanto è costato, non quanto ha
        // aspettato — quello lo sa già.
        const registro = talosResearchLedger([
            passo({ startedAt: T0, finishedAt: '2026-08-20T10:00:03.000Z' }),
            passo({ id: 's2', startedAt: T0, finishedAt: '2026-08-20T10:00:03.000Z' }),
        ] as never)

        expect(registro.summary.workedSeconds).toBe(6)
    })
})

describe('REGISTRO-01 le righe', () => {
    it('ogni riga porta il tipo, l’esito e la durata leggibile', () => {
        const [riga] = talosResearchLedger([
            passo({ kind: 'read', startedAt: T0, finishedAt: '2026-08-20T10:01:07.000Z' }),
        ] as never).entries

        expect(riga?.kind).toBe('read')
        expect(riga?.state).toBe('done')
        expect(riga?.duration).toBe('1 min 07 s')
    })

    it('⛔ un passo ancora in corso non inventa una durata', () => {
        const [riga] = talosResearchLedger([
            passo({ state: 'running', finishedAt: null }),
        ] as never).entries

        expect(riga?.duration).toBeNull()
    })

    it('⛔ un passo RIPETUTO lo dichiara: due tentativi non sono un tentativo', () => {
        const [riga] = talosResearchLedger([passo({ attempts: 3 })] as never).entries
        expect(riga?.attempts).toBe(3)
    })

    it('il motivo di un fallimento arriva alla riga, non resta nel registro', () => {
        const [riga] = talosResearchLedger([
            passo({ state: 'failed', error: 'la pagina ha risposto 403' }),
        ] as never).entries

        expect(riga?.error).toBe('la pagina ha risposto 403')
    })

    it('⛔ e al contrario: nessun passo fa un registro VUOTO, non uno finto', () => {
        const registro = talosResearchLedger([])
        expect(registro.entries).toHaveLength(0)
        expect(registro.summary.total).toBe(0)
        expect(registro.summary.workedSeconds).toBe(0)
    })

    it('l’ordine è quello in cui sono avvenuti, non quello degli identificativi', () => {
        const registro = talosResearchLedger([
            passo({ id: 'z', startedAt: '2026-08-20T10:00:10.000Z', finishedAt: '2026-08-20T10:00:11.000Z' }),
            passo({ id: 'a', startedAt: T0, finishedAt: '2026-08-20T10:00:01.000Z' }),
        ] as never)

        expect(registro.entries.map((entry) => entry.id)).toEqual(['a', 'z'])
    })
})
