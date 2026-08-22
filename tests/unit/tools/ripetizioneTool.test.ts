/**
 * ⛔ La stessa identica chiamata non riparte dopo il proprio risultato.
 *
 * ## Cosa è successo davvero, e perché la rete non può stare nel modello
 *
 * MISURATO sul Pad il 2026-08-08 con Qwen3-1.7B-Q4_K_M: a un solo «Accendi la
 * torcia», e a un solo «sì», il tool è partito **cinque volte**. Non è
 * un'inferenza: sono cinque righe nel registro della fotocamera di sistema, con
 * l'ora e il PID di TALOS.
 *
 * ```
 * 06:27:04  Torch for camera id 0 turned on for client PID 12309
 * 06:27:20  Torch ... turned on
 * 06:27:38  Torch ... turned on
 * 06:27:57  Torch ... turned on
 * 06:28:21  Torch ... turned on
 * ```
 *
 * Con Claude Sonnet 5, stessa frase e stessa app, l'accensione è **una**. La
 * causa sta nel motore locale — la grammatica pigra non si carica, quindi
 * niente vincola la *fine* della chiamata — ma la garanzia non può dipendere da
 * quale modello si è scelto nel compositore. Qui era la torcia; la stessa forma
 * vale per un messaggio da mandare o una scrittura in Libreria.
 *
 * ## La regola, e i due lati che deve avere
 *
 * Vale **fra un giro e l'altro**. Dentro lo stesso giro due chiamate identiche
 * sono una richiesta esplicita — «fallo due volte» — e vanno rispettate: un
 * modello che vuole due vibrazioni le chiede insieme. Una chiamata identica
 * DOPO aver letto il proprio risultato non è mai un'intenzione, è un ciclo.
 */
import { describe, expect, it, vi } from 'vitest'
import { runTalosAgentLoop } from '@/lib/tools/agentLoop'
import type { TalosToolCall } from '@/stores/chat'

function call(id: string, name = 'device_torch', args = '{"on":true}'): TalosToolCall {
    return { id, name, arguments: args }
}

describe('la stessa chiamata non si ripete', () => {
    it('RIPETIZIONE-01 il secondo giro NON riesegue: la torcia si accende una volta sola', async () => {
        const complete = vi.fn()
            .mockResolvedValueOnce({ text: '', toolCalls: [call('1')] })
            // Il modello locale rilancia la stessa identica chiamata.
            .mockResolvedValueOnce({ text: '', toolCalls: [call('2')] })
            .mockResolvedValueOnce({ text: '', toolCalls: [call('3')] })
            .mockResolvedValueOnce({ text: 'Fatto.' })
        const execute = vi.fn(async () => ({ content: 'Torch on.', ok: true }))

        const outcome = await runTalosAgentLoop(
            [{ role: 'user', content: 'Accendi la torcia' }],
            { complete, execute },
        )

        // ⛔ UNA. È il numero che sul Pad era cinque.
        expect(execute).toHaveBeenCalledTimes(1)
        expect(outcome.text).toContain('Fatto.')
    })

    it('RIPETIZIONE-02 al modello si dice che è già fatto, e cosa fare adesso', async () => {
        const complete = vi.fn()
            .mockResolvedValueOnce({ text: '', toolCalls: [call('1')] })
            .mockResolvedValueOnce({ text: '', toolCalls: [call('2')] })
            .mockResolvedValueOnce({ text: 'Fatto.' })
        const execute = vi.fn(async () => ({ content: 'Torch on.', ok: true }))

        await runTalosAgentLoop([{ role: 'user', content: 'x' }], { complete, execute })

        const terzoGiro = complete.mock.calls[2]![0] as Array<{ role: string, content: string }>
        const risposta = terzoGiro.filter((turno) => turno.role === 'tool').at(-1)
        expect(risposta?.content).toContain('Already done in this message')
        // L'istruzione, non solo la constatazione: senza, un modello riprova.
        expect(risposta?.content).toContain('NOT run again')
    })

    it('RIPETIZIONE-03 argomenti DIVERSI restano due chiamate diverse', async () => {
        const complete = vi.fn()
            .mockResolvedValueOnce({ text: '', toolCalls: [call('1', 'device_torch', '{"on":true}')] })
            .mockResolvedValueOnce({ text: '', toolCalls: [call('2', 'device_torch', '{"on":false}')] })
            .mockResolvedValueOnce({ text: 'Fatto.' })
        const execute = vi.fn(async () => ({ content: 'ok', ok: true }))

        await runTalosAgentLoop([{ role: 'user', content: 'accendi e spegni' }], { complete, execute })

        // ⛔ Accendere e spegnere sono due cose. Se la rete le confondesse,
        // TALOS non potrebbe piu' spegnere niente.
        expect(execute).toHaveBeenCalledTimes(2)
    })

    it('RIPETIZIONE-04 la SPAZIATURA non rende diversa la stessa chiamata', async () => {
        /*
         * I modelli locali rigenerano la chiamata da capo a ogni giro, e la
         * spaziatura la cambiano. Un confronto fra stringhe grezze lascerebbe
         * passare la ripetizione proprio nel caso per cui la rete esiste.
         */
        const complete = vi.fn()
            .mockResolvedValueOnce({ text: '', toolCalls: [call('1', 'device_torch', '{"on":true}')] })
            .mockResolvedValueOnce({ text: '', toolCalls: [call('2', 'device_torch', '{ "on" : true }')] })
            .mockResolvedValueOnce({ text: 'Fatto.' })
        const execute = vi.fn(async () => ({ content: 'ok', ok: true }))

        await runTalosAgentLoop([{ role: 'user', content: 'x' }], { complete, execute })

        expect(execute).toHaveBeenCalledTimes(1)
    })

    it('RIPETIZIONE-05 due identiche NELLO STESSO giro sono volute, e girano entrambe', async () => {
        const complete = vi.fn()
            .mockResolvedValueOnce({
                text: '',
                toolCalls: [
                    call('1', 'device_vibrate', '{"milliseconds":200}'),
                    call('2', 'device_vibrate', '{"milliseconds":200}'),
                ],
            })
            .mockResolvedValueOnce({ text: 'Fatto.' })
        const execute = vi.fn(async () => ({ content: 'ok', ok: true }))

        await runTalosAgentLoop([{ role: 'user', content: 'vibra due volte' }], { complete, execute })

        expect(execute).toHaveBeenCalledTimes(2)
    })

    it('RIPETIZIONE-06 un tentativo FALLITO non si riprova all’infinito, e si dice perché', async () => {
        const complete = vi.fn()
            .mockResolvedValueOnce({ text: '', toolCalls: [call('1')] })
            .mockResolvedValueOnce({ text: '', toolCalls: [call('2')] })
            .mockResolvedValueOnce({ text: 'Non ci riesco.' })
        const execute = vi.fn(async () => ({ content: 'no-torch', ok: false }))

        await runTalosAgentLoop([{ role: 'user', content: 'x' }], { complete, execute })

        expect(execute).toHaveBeenCalledTimes(1)
        const terzoGiro = complete.mock.calls[2]![0] as Array<{ role: string, content: string }>
        const risposta = terzoGiro.filter((turno) => turno.role === 'tool').at(-1)
        expect(risposta?.content).toContain('failed')
        expect(risposta?.content).toContain('NOT retried')
    })
})
