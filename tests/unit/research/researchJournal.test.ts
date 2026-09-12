import { describe, expect, it } from 'vitest'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import { createTalosResearchRuntime } from '@/services/researchRuntime'
import { talosResearchLoadJournal, talosResearchReadJournal } from '@/lib/research/researchJournal'
import { talosResearchCardOf } from '@/lib/research/researchCard'
import { talosResearchSpent, type TalosResearchEvent } from '@/lib/research/researchRun'
import type { TalosRunKeeper } from '@/services/longRunKeeper'

/**
 * §3.1 e §3.2 del disegno — la ripresa dopo la morte del processo, PROVATA.
 *
 * `talosResearchReplay` non ha mai avuto un difetto: e' aritmetica su una lista.
 * Il difetto stava un passo prima, nel lettore che quella lista la costruiva, e
 * non lo vedeva nessuno perche' nessun test aveva mai dato in pasto al lettore
 * una riga scritta a meta' — che su questo telefono e' il caso normale, non il
 * caso limite.
 */

function riga(event: TalosResearchEvent): { payload_json: string } {
    return { payload_json: JSON.stringify(event) }
}

const AVVIO: TalosResearchEvent = {
    kind: 'run_started',
    at: '2026-09-12T08:00:00.000Z',
    id: 'run-1',
    sessionId: 's',
    question: 'quanto costa una pagina',
    depth: 'quick',
    engine: 'device',
}

const PIANO: TalosResearchEvent = {
    kind: 'plan_approved',
    at: '2026-09-12T08:00:01.000Z',
    branches: [
        { id: 'b1', question: 'prezzi', estimate: { tokens: 900, searches: 1, pages: 2 } },
        { id: 'b2', question: 'recensioni', estimate: { tokens: 900, searches: 1, pages: 2 } },
    ],
}

const PRIMO_AVVIATO: TalosResearchEvent = {
    kind: 'step_started',
    at: '2026-09-12T08:00:02.000Z',
    stepId: 'b1:search',
    branchId: 'b1',
    stepKind: 'search',
}

const PRIMO_FINITO: TalosResearchEvent = {
    kind: 'step_finished',
    at: '2026-09-12T08:00:03.000Z',
    stepId: 'b1:search',
    spend: { tokens: 500, searches: 1, pages: 2 },
    resultRef: 'vault:uno',
}

describe('§3.1 — un giornale troncato a metà riga', () => {
    it('si carica lo stesso e riprende dal passo dopo l’ultimo committato', () => {
        const rows = [
            riga(AVVIO),
            riga(PIANO),
            riga(PRIMO_AVVIATO),
            riga(PRIMO_FINITO),
            // Il telefono è stato ucciso qui, a metà `JSON.stringify`.
            { payload_json: '{"kind":"step_started","at":"2026-09-12T08:00:04.000Z","stepI' },
        ]

        const caricato = talosResearchLoadJournal(rows)

        expect(caricato.run).not.toBeNull()
        expect(caricato.torn).toBe(1)
        // L'ultimo passo COMMITTATO è il primo, ed è `done`: il lavoro pagato
        // è tutto lì. Del passo strappato non si sa niente e non si finge.
        expect(caricato.run!.steps).toHaveLength(1)
        expect(caricato.run!.steps[0]!.state).toBe('done')
        expect(talosResearchSpent(caricato.run!)).toEqual({ tokens: 500, searches: 1, pages: 2 })
    })

    it('⛔ il contatore riparte dalle RIGHE su disco, non dagli eventi letti', () => {
        // Se ripartisse da 4 (gli eventi letti) la scrittura successiva
        // riassegnerebbe il posto 4, già occupato dalla riga strappata, e
        // `UNIQUE (run_id, seq)` la rifiuterebbe: la corsa non avanzerebbe mai
        // più di un passo. Meglio un posto bruciato che un giornale bloccato.
        const caricato = talosResearchLoadJournal([
            riga(AVVIO), riga(PIANO), riga(PRIMO_AVVIATO), riga(PRIMO_FINITO),
            { payload_json: '{"kind":"step_st' },
        ])
        expect(caricato.length).toBe(5)
    })

    it('si ferma alla prima riga rotta invece di saltarla e proseguire', () => {
        // ⛔ Il verso contrario di «ripara e continua»: gli eventi dopo un buco
        // si ripiegherebbero su uno stato mai esistito, e un rendiconto dei
        // soldi costruito su uno stato inventato è peggio di uno corto.
        const letto = talosResearchReadJournal([
            riga(AVVIO), riga(PIANO),
            { payload_json: 'non è json' },
            riga(PRIMO_AVVIATO), riga(PRIMO_FINITO),
        ])
        expect(letto.events).toHaveLength(2)
        expect(letto.torn).toBe(3)
    })

    it('una riga valida che non è un evento conta come strappata', () => {
        const letto = talosResearchReadJournal([riga(AVVIO), { payload_json: '{"foo":1}' }])
        expect(letto.events).toHaveLength(1)
        expect(letto.torn).toBe(1)
    })

    it('AL DRITTO: un giornale intero non perde niente e non dichiara strappi', () => {
        const letto = talosResearchReadJournal([riga(AVVIO), riga(PIANO), riga(PRIMO_AVVIATO), riga(PRIMO_FINITO)])
        expect(letto.events).toHaveLength(4)
        expect(letto.torn).toBe(0)
    })

    it('un evento DUPLICATO non conta due volte la spesa', () => {
        // `researchRun.ts:239-249` lo prevede — una scrittura ripetuta perché il
        // processo è morto fra il write e l'ack. Provato, non solo previsto.
        const singolo = talosResearchLoadJournal([riga(AVVIO), riga(PIANO), riga(PRIMO_AVVIATO), riga(PRIMO_FINITO)])
        const doppio = talosResearchLoadJournal([
            riga(AVVIO), riga(PIANO), riga(PRIMO_AVVIATO), riga(PRIMO_FINITO), riga(PRIMO_FINITO),
        ])
        expect(talosResearchSpent(doppio.run!)).toEqual(talosResearchSpent(singolo.run!))
        expect(doppio.run!.steps).toHaveLength(1)
    })
})

function keeper(): TalosRunKeeper {
    return { engage: () => undefined, describe: () => undefined, release: () => undefined }
}

describe('§3.2 — dopo un riavvio nessuna ricerca resta «in corso» per sempre', () => {
    it('una corsa uccisa esce come interrupted, non running né failed', async () => {
        const repository = createMemoryChatRepository()
        let tick = 0
        const now = () => new Date(Date.UTC(2026, 8, 12, 9, 0, tick++)).toISOString()

        // Il processo muore DENTRO il primo passo: la promessa non torna mai.
        const morente = createTalosResearchRuntime({
            repository,
            keeper,
            now,
            perform: () => new Promise(() => undefined),
        })
        void morente.start({
            id: 'run-1',
            sessionId: 's',
            question: 'q',
            depth: 'quick',
            branches: PIANO.kind === 'plan_approved' ? PIANO.branches : [],
        })
        // Un giro del microtask: il giornale ha già `run_started`, `plan_approved`
        // e `step_started`, e nessuno scriverà mai la fine di quel passo.
        await new Promise((resolve) => setTimeout(resolve, 0))

        // Il processo nuovo: stesso magazzino, runtime nuovo — un riavvio.
        const rinato = createTalosResearchRuntime({ repository, keeper, now, perform: async () => ({ spend: { tokens: 0, searches: 0, pages: 0 }, resultRef: null }) })
        const tutte = await rinato.all()

        expect(tutte).toHaveLength(1)
        const passo = tutte[0]!.steps.find((step) => step.id === 'b1:search')!
        expect(passo.state).toBe('interrupted')
        expect(passo.state).not.toBe('running')
        expect(passo.state).not.toBe('failed')

        // E a schermo: il registro vivo del processo nuovo non conosce nessuno,
        // quindi la scheda dice «interrotta» e non «in corso».
        const scheda = talosResearchCardOf(tutte[0]!, { isRunning: false })
        expect(scheda.bucket).toBe('unfinished')
        expect(scheda.bucket).not.toBe('running')
        expect(scheda.bucket).not.toBe('failed')
    })

    it('e quel passo è il PRIMO che la ripresa ritenta', async () => {
        const repository = createMemoryChatRepository()
        let tick = 0
        const now = () => new Date(Date.UTC(2026, 8, 12, 10, 0, tick++)).toISOString()
        const morente = createTalosResearchRuntime({ repository, keeper, now, perform: () => new Promise(() => undefined) })
        void morente.start({
            id: 'run-2',
            sessionId: 's',
            question: 'q',
            depth: 'quick',
            branches: PIANO.kind === 'plan_approved' ? PIANO.branches : [],
        })
        await new Promise((resolve) => setTimeout(resolve, 0))

        const visti: string[] = []
        const rinato = createTalosResearchRuntime({
            repository,
            keeper,
            now,
            perform: async (branch) => {
                visti.push(branch.id)
                return { spend: { tokens: 10, searches: 1, pages: 0 }, resultRef: `vault:${branch.id}` }
            },
        })
        await rinato.resume('run-2')

        // Il ramo interrotto per primo, e una volta sola: niente è stato pagato
        // due volte e niente è rimasto indietro.
        expect(visti).toEqual(['b1', 'b2'])
    })
})
