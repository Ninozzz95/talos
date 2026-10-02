import { describe, expect, it, vi } from 'vitest'
import { runTalosAgentLoop } from '@/lib/tools/agentLoop'
import { TALOS_SOLLECITO_AZIONE_DICHIARATA } from '@/lib/tools/azioneDichiarata'
import type { ChatTurn, TalosToolCall } from '@/stores/chat'

/*
 * ⭐⭐ P4-quinquies nel ciclo (owner 02/10/2026: «Riprova, poi avviso», per tutti i modelli). Se la risposta finale
 * dichiara un'azione fatta e nel turno non è partito NESSUNO strumento: UN secondo giro col sollecito e gli attrezzi;
 * se di nuovo niente, l'esito porta `azioneNonEseguita` e la vista mette la riga onesta. Il testo già visto resta
 * (regola dell'owner: «il preambolo si tiene»).
 */
const nota: TalosToolCall = { id: 'n1', name: 'notes_add', arguments: '{"text":"comprare il pane domani"}' }
const domanda: ChatTurn[] = [{ role: 'user', content: 'salvami una nota: comprare il pane domani' }]

describe('P4-quinquies — riprova, poi avviso', () => {
    it('LOOP-AZD-01 «Salvato ✅» senza chiamate ⇒ un secondo giro col sollecito; se chiama, nessun avviso', async () => {
        const complete = vi.fn()
            .mockResolvedValueOnce({ text: 'Salvato la nota ✅' })
            .mockResolvedValueOnce({ text: '', toolCalls: [nota] })
            .mockResolvedValueOnce({ text: 'Nota salvata davvero.' })
        const execute = vi.fn(async () => ({ content: 'saved', ok: true }))
        const esito = await runTalosAgentLoop(domanda, { complete, execute })
        expect(complete).toHaveBeenCalledTimes(3)
        const secondo = complete.mock.calls[1]![0] as ChatTurn[]
        expect(secondo.at(-2)).toMatchObject({ role: 'assistant', content: 'Salvato la nota ✅' })
        expect(secondo.at(-1)).toMatchObject({ role: 'user', content: TALOS_SOLLECITO_AZIONE_DICHIARATA })
        // Con gli attrezzi: il secondo giro deve poter FARE l'azione.
        expect(complete.mock.calls[1]![1]?.senzaStrumenti).not.toBe(true)
        expect(execute).toHaveBeenCalledWith(nota)
        expect(esito.azioneNonEseguita).not.toBe(true)
        // Il testo già visto resta, seguito dall'esito vero.
        expect(esito.text).toContain('Salvato la nota ✅')
        expect(esito.text).toContain('Nota salvata davvero.')
    })

    it('LOOP-AZD-02 se anche il secondo giro non chiama niente ⇒ avviso, mai un terzo giro', async () => {
        const complete = vi.fn()
            .mockResolvedValueOnce({ text: 'Salvato la nota ✅' })
            .mockResolvedValueOnce({ text: 'Fatto, nota salvata ✅' })
        const execute = vi.fn()
        const esito = await runTalosAgentLoop(domanda, { complete, execute })
        expect(complete).toHaveBeenCalledTimes(2)
        expect(execute).not.toHaveBeenCalled()
        expect(esito.azioneNonEseguita).toBe(true)
    })

    it('LOOP-AZD-03 un turno in cui uno strumento è partito non viene controllato', async () => {
        const complete = vi.fn()
            .mockResolvedValueOnce({ text: '', toolCalls: [nota] })
            .mockResolvedValueOnce({ text: 'Salvato la nota ✅' })
        const execute = vi.fn(async () => ({ content: 'saved', ok: true }))
        const esito = await runTalosAgentLoop(domanda, { complete, execute })
        expect(complete).toHaveBeenCalledTimes(2)
        expect(esito.azioneNonEseguita).not.toBe(true)
    })

    /*
     * ⭐⭐ LOOP-AZD-05 — trovato SUL PAD (02/10/2026, Spark-X2.5-4B, APK con la prima versione): il modello ha chiamato
     * `tool_search` tre volte per cercare lo strumento delle note, non ha mai chiamato quello vero e ha scritto «La nota è
     * stata salvata». Per la prima versione «nessuno strumento» voleva dire `executed` vuoto, e `tool_search` contava come
     * uno strumento: il difetto restava, e proprio nel profilo ridotto del punto 4. Gli strumenti di sola SCOPERTA
     * (`tool_search`, `tool_details`) non FANNO niente: non contano come azione.
     */
    it('LOOP-AZD-05 solo ricerche di strumenti e poi «nota salvata» ⇒ stesso sollecito e, se non cambia, lo stesso avviso', async () => {
        const cerca: TalosToolCall = { id: 's1', name: 'tool_search', arguments: '{"query":"salva nota"}' }
        const complete = vi.fn()
            .mockResolvedValueOnce({ text: '', toolCalls: [cerca] })
            .mockResolvedValueOnce({ text: 'La nota è stata salvata su un file con il titolo "pane".' })
            .mockResolvedValueOnce({ text: 'Fatto, nota salvata davvero.' })
        const execute = vi.fn(async () => ({ content: 'schema di notes_add', ok: true }))
        const esito = await runTalosAgentLoop(domanda, { complete, execute })
        expect(execute).toHaveBeenCalledTimes(1)
        expect(complete).toHaveBeenCalledTimes(3)
        expect((complete.mock.calls[2]![0] as ChatTurn[]).at(-1)).toMatchObject({ role: 'user', content: TALOS_SOLLECITO_AZIONE_DICHIARATA })
        expect(esito.azioneNonEseguita).toBe(true)
    })

    it('LOOP-AZD-06 se dopo la ricerca chiama lo strumento vero, niente avviso', async () => {
        const cerca: TalosToolCall = { id: 's1', name: 'tool_search', arguments: '{"query":"salva nota"}' }
        const complete = vi.fn()
            .mockResolvedValueOnce({ text: '', toolCalls: [cerca] })
            .mockResolvedValueOnce({ text: '', toolCalls: [nota] })
            .mockResolvedValueOnce({ text: 'Nota salvata.' })
        const execute = vi.fn(async () => ({ content: 'ok', ok: true }))
        const esito = await runTalosAgentLoop(domanda, { complete, execute })
        expect(execute).toHaveBeenCalledTimes(2)
        expect(complete).toHaveBeenCalledTimes(3)
        expect(esito.azioneNonEseguita).not.toBe(true)
    })

    it('LOOP-AZD-04 una risposta che non dichiara azioni chiude al primo giro', async () => {
        const complete = vi.fn().mockResolvedValueOnce({ text: 'Ecco la ricetta delle crêpe.' })
        const esito = await runTalosAgentLoop([{ role: 'user', content: 'ricetta delle crêpe' }], { complete, execute: vi.fn() })
        expect(complete).toHaveBeenCalledTimes(1)
        expect(esito.azioneNonEseguita).not.toBe(true)
    })
})
