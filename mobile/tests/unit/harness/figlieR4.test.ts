import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { leggiFlussoSse } from '@/lib/harness/r4/eventiR4'
import { chiDellAgenteR4, discendentiInAttesaR4, richiestaDellaFigliaR4, voceDellaFigliaR4 } from '@/lib/harness/r4/figlieR4'

/*
 * ⛔ K3-AP3 (ledger `LEDGER-K3-FIGLIE-2026-10-16.md`; owner 16/10 «Carta nella conversazione principale»). La fixture è VERA, registrata
 * sul Pad (r4 2161afb32, fornitore finto): la madre «Su richiesta» delega; la figlia 1 chiede di eseguire un comando, la figlia 2 fa
 * due domande. Le regole sono quelle di `cartaDellaFiglia` / `leggiDomandaDellaFiglia` (`legacy/app.js:11320-11390`).
 */
const fixture = JSON.parse(readFileSync(resolve(__dirname, '..', '..', 'fixtures', 'r4', 'figlie-701c6c0d2.json'), 'utf8'))
const MADRE = '33333333-3333-4333-8333-333333333333'
const FIGLIA1 = '66666666-6666-4666-8666-666666666661'
const FIGLIA2 = '66666666-6666-4666-8666-666666666662'
const eventi = leggiFlussoSse(fixture.flusso).map((e) => e.dati)

describe('le richieste delle sotto-sessioni viste dalla madre (K3-AP3)', () => {
    it('FIG-01 dalle istantanee `talos.agenti`: in attesa e risolta, per il permesso e per la domanda; le altre operazioni no', () => {
        const richieste = eventi.map((e) => richiestaDellaFigliaR4(e, MADRE)).filter(Boolean)
        expect(richieste).toEqual([
            { childId: FIGLIA1, chi: 'Esegui i test del progetto', operazione: { kind: 'approval', status: 'waiting', requestId: '77777777-7777-4777-8777-777777777771' } },
            { childId: FIGLIA1, chi: 'Esegui i test del progetto', operazione: { kind: 'approval', status: 'resolved', requestId: '77777777-7777-4777-8777-777777777771', approvato: true } },
            { childId: FIGLIA2, chi: 'Prepara il progetto', operazione: { kind: 'question', status: 'waiting', requestId: '77777777-7777-4777-8777-777777777772' } },
            { childId: FIGLIA2, chi: 'Prepara il progetto', operazione: { kind: 'question', status: 'resolved', requestId: '77777777-7777-4777-8777-777777777772', esito: 'answered' } },
        ])
        // un'istantanea di un'altra radice, o senza figlia, non è una richiesta di QUESTA sessione
        const attesa = eventi.find((e) => richiestaDellaFigliaR4(e, MADRE))!
        expect(richiestaDellaFigliaR4(attesa, 'altra-radice')).toBeNull()
        expect(richiestaDellaFigliaR4({ type: 'CUSTOM', name: 'talos.agenti', value: { version: 1 } }, MADRE)).toBeNull()
        expect(richiestaDellaFigliaR4({ type: 'RunStarted' }, MADRE)).toBeNull()
    })

    it('FIG-02 la voce della carta da `/pending` vero: azione e politica della figlia; domande con le loro opzioni', () => {
        const permesso = voceDellaFigliaR4(fixture.pending1.pending, { sessionId: FIGLIA1, chi: 'Esegui i test del progetto' })
        expect(permesso).toEqual({
            tipo: 'approvazione',
            voce: {
                requestId: '77777777-7777-4777-8777-777777777771',
                azione: { tipo: 'shell', toolCallId: 'test3', comando: 'echo test-ok', sempreNonBasta: true },
                esito: null,
                figlia: { sessionId: FIGLIA1, chi: 'Esegui i test del progetto', politica: { permessi: 'On request', perAttrezzo: {} } },
            },
        })
        const domanda = voceDellaFigliaR4(fixture.pending2.pending, { sessionId: FIGLIA2, chi: 'Prepara il progetto' })
        expect(domanda?.tipo).toBe('domanda')
        expect(domanda?.voce).toMatchObject({ requestId: '77777777-7777-4777-8777-777777777772', esito: null, figlia: { sessionId: FIGLIA2, chi: 'Prepara il progetto' } })
        expect((domanda?.voce as { questions: Array<{ id: string }> }).questions.map((q) => q.id)).toEqual(['database', 'funzioni'])
        // ciò che non si può disegnare non diventa una carta
        for (const storto of [null, {}, { tipo: 'approvazione' }, { tipo: 'approvazione', requestId: 'x' }, { tipo: 'domanda', requestId: 'x', questions: [] }, { tipo: 'piano', requestId: 'x' }]) {
            expect(voceDellaFigliaR4(storto, { sessionId: FIGLIA1, chi: null })).toBeNull()
        }
    })

    it('FIG-03 alla ripresa: le discendenti in attesa dall\'elenco vero delle sessioni (anche le nipoti), mai la madre né le estranee', () => {
        expect(discendentiInAttesaR4(fixture.sessioni1, MADRE)).toEqual([{ sessionId: FIGLIA1, padreId: MADRE }])
        const nipote = { sessionId: 'n1', padreId: FIGLIA1, inAttesaDomanda: true }
        const estranea = { sessionId: 'e1', padreId: 'altra', inAttesaApprovazione: true }
        const ferma = { sessionId: 'f1', padreId: MADRE, inAttesaApprovazione: false, inAttesaDomanda: false }
        expect(discendentiInAttesaR4([...fixture.sessioni1, nipote, estranea, ferma], MADRE)).toEqual([{ sessionId: FIGLIA1, padreId: MADRE }, { sessionId: 'n1', padreId: FIGLIA1 }])
        expect(discendentiInAttesaR4(null, MADRE)).toEqual([])
    })

    it('FIG-04 chi chiede: `nome || taskCorto || task` (la regola `nomeDellAgente` del desktop), niente se vuoto', () => {
        expect(chiDellAgenteR4({ nome: 'Tester-2', taskCorto: 'Esegui i test', task: 'Esegui i test del progetto adesso' })).toBe('Tester-2')
        expect(chiDellAgenteR4({ nome: null, taskCorto: 'Esegui i test', task: 'x' })).toBe('Esegui i test')
        expect(chiDellAgenteR4({ task: 'Solo il compito' })).toBe('Solo il compito')
        expect(chiDellAgenteR4({ nome: '  ', taskCorto: '' })).toBeNull()
        expect(chiDellAgenteR4(null)).toBeNull()
    })
})
