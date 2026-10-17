import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { leggiFlussoSse } from '@/lib/harness/r4/eventiR4'
import { analizzaComandoR4 } from '@/lib/harness/r4/comandoShellR4'
import {
    contaProcessiAttiviR4, datiProcessoR4, eventoAttrezzoR4, motivoDelRifiutoR4, processiDagliEventiR4, richiestaConclusaR4,
    testoRisorseR4, vociDellaRigaR4, type ProcessoGrezzoR4, type VoceAttrezzoR4,
} from '@/lib/harness/r4/processiR4'

/*
 * ⛔ K3-C3b-2a (ledger `LEDGER-K3-CODICE-COME-LA-CHAT-2026-10-15.md`): la scheda Processi su r4. Il golden l'hanno calcolato le
 * funzioni VERE del desktop r4 @ fc5e25d62 (`processiDagliEventi`, `datiProcesso`, `contaProcessiAttivi`, `analizzaComando`) su un
 * flusso registrato da r4 (un comando lungo fermato con lo Stop, uno che esce 2, uno riuscito, poi «Togli») e su casi rari scritti
 * nella forma degli eventi di r4 (consenso, rifiuto, sfondo, prove senza suite, interrotto, «in attesa»). Le ore sono in UTC.
 */
process.env.TZ = 'UTC'
const FIXTURE = resolve(__dirname, '..', '..', 'fixtures', 'r4')
const golden = JSON.parse(readFileSync(resolve(FIXTURE, 'processi-fc5e25d62.json'), 'utf8'))

/** Come lo script del golden: un orologio finto (250 ms per evento) e i giri contati a ogni `RunStarted`. */
function vociDalFlusso(testo: string): VoceAttrezzoR4[] {
    const voci: VoceAttrezzoR4[] = []
    let giro = 0
    leggiFlussoSse(testo).map((e) => e.dati as Record<string, unknown>).forEach((e, i) => {
        if (e.type === 'RunStarted') giro += 1
        const v = eventoAttrezzoR4(e, { ricevutoA: 1792065600000 + i * 250, giro })
        if (v) voci.push(v)
    })
    return voci
}

describe('i Processi su r4, contro il desktop (K3-C3b-2a)', () => {
    it('PRC-01 dagli eventi registrati alle voci: la stessa trasformazione di legacy/app.js', () => {
        expect(golden.origine.commit).toBe('fc5e25d6209721788aa425c8455bbaa37147e46e')
        expect(vociDalFlusso(readFileSync(resolve(FIXTURE, 'r4-fc5e25d62-comando-vivo.sse'), 'utf8'))).toEqual(golden.casi[0].voci)
        expect(vociDalFlusso(readFileSync(resolve(FIXTURE, 'r4-fc5e25d62-comando-rigiocata.sse'), 'utf8'))).toEqual(golden.casi[1].voci)
    })

    it('PRC-02 righe grezze, righe pronte e numero dei vivi uguali al desktop, in italiano e in inglese, in ogni caso', () => {
        for (const esito of golden.esiti) {
            golden.casi.forEach((caso: { nome: string; voci: VoceAttrezzoR4[]; opzioni: Record<string, unknown> }, i: number) => {
                const atteso = esito.casi[i]
                const grezzi = processiDagliEventiR4(structuredClone(caso.voci), caso.opzioni)
                expect(grezzi, `${esito.lingua} · ${caso.nome}`).toEqual(atteso.grezzi)
                const pronti = grezzi.map((p: ProcessoGrezzoR4) => datiProcessoR4(p, esito.lingua))
                // il desktop aggiunge due campi suoi: `preparato` (idempotenza del disegno) e `icona` (l'id dello sprite)
                const delDesktop = atteso.pronti.map(({ preparato, icona, ...resto }: Record<string, unknown>) => {
                    expect(preparato).toBe(true)
                    expect(typeof icona).toBe('string')
                    return resto
                })
                expect(pronti, `${esito.lingua} · ${caso.nome}`).toEqual(delDesktop)
                expect(contaProcessiAttiviR4(grezzi.filter((p) => !p.tolto)), caso.nome).toBe(atteso.attivi)
            })
        }
    })

    it('PRC-03 il comando letto a segmenti, con la famiglia: come comando-shell.js', () => {
        const righe = ['npm run build', 'git status --short', 'node -e "process.exit(2)"', 'FOO=1 sudo rm -rf /tmp/x | grep y > out.txt', '', 'cargo test -- --nocapture']
        for (const esito of golden.esiti) expect(righe.map((r) => analizzaComandoR4(r))).toEqual(esito.analisi)
        // una sostituzione malformata non butta giù la scheda: la riga intera, nuda
        expect(analizzaComandoR4('echo ${}')).toEqual({ ok: false, segmenti: [{ tipo: 'grezzo', testo: 'echo ${}' }], eseguibile: null, sottocomando: null, famiglia: 'generico', testo: 'echo ${}' })
    })

    it('PRC-04 il menu della riga: Sfonda e Ferma solo vivi, Togli solo finiti; la richiesta si chiude quando lo stato lo dice', () => {
        expect(vociDellaRigaR4('in-corso')).toEqual(['sfonda', 'ferma'])
        expect(vociDellaRigaR4('in-attesa')).toEqual(['sfonda', 'ferma'])
        expect(vociDellaRigaR4('in-sfondo')).toEqual(['ferma'])
        expect(vociDellaRigaR4('in-consenso')).toEqual([])
        for (const s of ['riuscito', 'fallito', 'annullato', 'ucciso', 'non-eseguito', 'interrotto', 'perso'] as const) expect(vociDellaRigaR4(s), s).toEqual(['togli'])
        expect(richiestaConclusaR4('ferma', 'in-sfondo')).toBe(false)
        expect(richiestaConclusaR4('ferma', 'annullato')).toBe(true)
        expect(richiestaConclusaR4('sfonda', 'in-sfondo')).toBe(true)
        expect(richiestaConclusaR4('togli', 'riuscito')).toBe(false)
    })

    it('PRC-05 il perché di un rifiuto con le parole del desktop; CPU e memoria solo per una riga viva, «non misurate» se mancano', () => {
        expect(motivoDelRifiutoR4('{"ok":false,"error":{"code":"PROCESS_NOT_RUNNING"}}', 'it')).toBe('Questo comando non è più in corso')
        expect(motivoDelRifiutoR4('{"ok":false,"error":{"code":"PROCESS_STILL_RUNNING"}}', 'en')).toBe('This command is still running: stop it first')
        expect(motivoDelRifiutoR4('{"ok":false,"error":{"code":"ALTRO"}}', 'it')).toBeNull()
        expect(motivoDelRifiutoR4('non json', 'it')).toBeNull()
        const risorse = new Map([['a', { cpuPercento: 3.5, memoriaByte: 52_428_800 }], ['b', { cpuPercento: null, memoriaByte: 2_147_483_648 }]])
        expect(testoRisorseR4({ id: 'a', stato: 'in-corso' }, risorse, 'it')).toContain('50 MB')
        expect(testoRisorseR4({ id: 'b', stato: 'in-corso' }, risorse, 'en')).toBe('2 GB')
        expect(testoRisorseR4({ id: 'c', stato: 'in-corso' }, risorse, 'en')).not.toBe('')
        expect(testoRisorseR4({ id: 'a', stato: 'riuscito' }, risorse, 'it')).toBe('')
        expect(testoRisorseR4({ id: 'a', stato: 'in-corso' }, null, 'it')).toBe('')
    })
})
