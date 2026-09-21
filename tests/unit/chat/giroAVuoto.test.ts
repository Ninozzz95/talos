import { describe, expect, it, vi } from 'vitest'
import { runTalosAgentLoop } from '@/lib/tools/agentLoop'
import type { TalosToolCall } from '@/stores/chat'

/**
 * ⛔⛔ IL GIRO A VUOTO, misurato sul Pad il 2026-08-09.
 *
 * Qwen3-1.7B, «elenca le notifiche». Il tool parte, il risultato torna, e il
 * modello richiede **la stessa identica chiamata** cinque volte di fila. La
 * rete anti-ripetizione la ferma ogni volta e gli risponde «già fatto, usa il
 * risultato che hai sopra» — e lui la richiede di nuovo, finché i giri
 * finiscono. Il messaggio che arriva alla persona è **vuoto**.
 *
 * Chiedere di nuovo con le stesse carte in mano non ha nessuna ragione di
 * andare diversamente. Togliere gli strumenti per UN giro cambia il problema:
 * senza schemi da compilare, l'unica cosa che il modello può produrre è prosa.
 */
const chiamata: TalosToolCall = {
    id: 'call-1',
    name: 'notification_list',
    arguments: JSON.stringify({}),
}

/** La stessa cosa, con un id nuovo: e' cosi' che si ripresenta davvero. */
const stessaChiamataAltroId: TalosToolCall = {
    ...chiamata,
    id: 'call-2',
}

describe('quando il modello gira a vuoto', () => {
    it('⛔ il giro dopo gli si chiede la risposta SENZA strumenti', async () => {
        const visti: Array<{ senzaStrumenti?: boolean } | undefined> = []
        let giro = 0
        const complete = vi.fn(async (_turni: unknown, opzioni?: { senzaStrumenti?: boolean }) => {
            visti.push(opzioni)
            giro += 1
            if (giro === 1) return { text: '', finishReason: 'tool_calls', toolCalls: [chiamata] }
            if (giro === 2) {
                // Il giro della ripetizione: stessa chiamata, id diverso.
                return { text: '', finishReason: 'tool_calls', toolCalls: [stessaChiamataAltroId] }
            }
            return { text: 'Ecco le notifiche: 1. WhatsApp', finishReason: 'stop' }
        })

        const outcome = await runTalosAgentLoop(
            [{ role: 'user', content: 'elenca le notifiche' }],
            {
                complete: complete as never,
                execute: async () => ({ ok: true, content: '1. WhatsApp' }),
            },
        )

        // L'esito che conta: la persona riceve una RISPOSTA, non una bolla vuota.
        expect(outcome.text).toContain('WhatsApp')
        // E il terzo giro — quello dopo la ripetizione — e' stato chiesto
        // senza strumenti. E' la riga che impedisce al ciclo di ripartire.
        expect(visti[2]).toEqual({ senzaStrumenti: true })
    })

    it('⛔ e il giro forzato porta l ANCORAGGIO, o si inventa la risposta', async () => {
        /*
         * MISURATO sul Pad il 2026-08-09: senza questo turno, Qwen3-1.7B ha
         * risposto a «elenca le notifiche» con DIECI righe plausibili e
         * nessuna vera — «Notifica di connessione a rete», «Notifica di
         * errori di sistema» — mentre le vere (WhatsApp, Shizuku, batteria,
         * meteo) stavano nel risultato dello strumento poche righe sopra.
         *
         * Vuoto e' «non lo so»; inventato e' «ecco». Il secondo e' peggio.
         */
        const turniVisti: Array<Array<{ role: string, content?: string }>> = []
        let giro = 0
        const complete = vi.fn(async (turni: Array<{ role: string, content?: string }>) => {
            turniVisti.push(turni)
            giro += 1
            if (giro === 1) return { text: '', finishReason: 'tool_calls', toolCalls: [chiamata] }
            if (giro === 2) {
                return { text: '', finishReason: 'tool_calls', toolCalls: [stessaChiamataAltroId] }
            }
            return { text: 'Ecco le notifiche: 1. WhatsApp', finishReason: 'stop' }
        })

        await runTalosAgentLoop(
            [{ role: 'user', content: 'elenca le notifiche' }],
            { complete: complete as never, execute: async () => ({ ok: true, content: '1. WhatsApp' }) },
        )

        const ultimo = turniVisti[2]!.at(-1)!
        expect(ultimo.content).toContain('ONLY the tool results above')
        expect(ultimo.content).toContain('Do not invent')

        // ⛔ E NON deve finire nella conversazione: e' una spinta per quella
        // chiamata, non un pezzo di cronologia.
        const giroNormale = turniVisti[1]!
        expect(giroNormale.some((t) => (t.content ?? '').includes('Do not invent'))).toBe(false)
    })

    it('⛔ NON tocca un giro che ha portato qualcosa di nuovo', async () => {
        // Un giro con anche una sola chiamata nuova e' un modello che sta
        // lavorando: togliergli gli strumenti gli spezzerebbe la catena a meta'.
        const visti: Array<{ senzaStrumenti?: boolean } | undefined> = []
        let giro = 0
        const complete = vi.fn(async (_turni: unknown, opzioni?: { senzaStrumenti?: boolean }) => {
            visti.push(opzioni)
            giro += 1
            if (giro === 1) return { text: '', finishReason: 'tool_calls', toolCalls: [chiamata] }
            if (giro === 2) {
                return {
                    text: '',
                    finishReason: 'tool_calls',
                    toolCalls: [{
                        id: 'call-3',
                        name: 'device_torch',
                        arguments: JSON.stringify({ on: true }),
                    }],
                }
            }
            return { text: 'Fatto.', finishReason: 'stop' }
        })

        await runTalosAgentLoop(
            [{ role: 'user', content: 'elenca le notifiche e accendi la torcia' }],
            {
                complete: complete as never,
                execute: async () => ({ ok: true, content: 'ok' }),
            },
        )

        expect(visti[1]).toBeUndefined()
        expect(visti[2]).toBeUndefined()
    })

    it('⛔ il primo giro non è mai a vuoto, e non deve esserlo', async () => {
        // Se il primo giro partisse senza strumenti, TALOS non chiamerebbe piu'
        // niente: nessuna ripetizione e' ancora avvenuta.
        const visti: Array<{ senzaStrumenti?: boolean } | undefined> = []
        const complete = vi.fn(async (_turni: unknown, opzioni?: { senzaStrumenti?: boolean }) => {
            visti.push(opzioni)
            return { text: 'Ciao.', finishReason: 'stop' }
        })

        await runTalosAgentLoop(
            [{ role: 'user', content: 'ciao' }],
            { complete: complete as never, execute: async () => ({ ok: true, content: '' }) },
        )

        expect(visti).toEqual([undefined])
    })
})
