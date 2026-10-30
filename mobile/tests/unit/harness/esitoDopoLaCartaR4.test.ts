import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { conversazioneDaEventi, leggiFlussoSse } from '@/lib/harness/r4/eventiR4'
import { TALOS_METADATA_SEQUENZA } from '@/lib/chat/sequenzaDelTurno'

/**
 * ⛔ Difetto dal vivo (prova 6 del guardiano, Pad vc321, 27/10/2026 21:24): sessione su «Chiede prima», «npm test» passa dalla carta
 * di permesso ed esce con 1; sul PC il risultato è giusto (`ToolCallResult` `isError:true`, `exitCode:1`), sul dispositivo la riga
 * restava «Comando nel terminale: npm test» grigia, senza «non riuscito» né output. La carta entra nel giro (`conCartaNelGiro`): ciò
 * che il giro aveva detto diventa un messaggio a sé e il giro continua con `chiamate: {}`; il risultato non trovava più la sua
 * chiamata. Il desktop tiene UNA mappa id → riga per tutto il giro (`state.realSession.toolCallNomi`, `legacy/app.js:394`, usata a
 * `:23346-23347`), azzerata solo a fine giro. Forme vere: il registro della sessione e7ce3dea, sequenze 990-1033 (percorsi tolti).
 */
const FIXTURE = resolve(__dirname, '..', '..', 'fixtures', 'r4', 'approvazione-esito-b377932e7.sse')
const vere = () => leggiFlussoSse(readFileSync(FIXTURE, 'utf8').replace(/\n*$/u, '\n\n')).map((e) => e.dati)

type Attrezzo = { name?: string; esito?: string; finita?: boolean; risultato?: { contenuto?: string } }
/** Tutte le righe d'attrezzo salvate nei messaggi del giro, con l'id del messaggio che le tiene. */
function righe(messaggi: readonly { id: string; metadata: Record<string, unknown> }[]): (Attrezzo & { messaggio: string })[] {
    return messaggi.flatMap((m) => ((m.metadata[TALOS_METADATA_SEQUENZA] ?? []) as { tipo: string; attrezzi?: Attrezzo[] }[])
        .flatMap((s) => (s.attrezzi ?? []).map((a) => ({ ...a, messaggio: m.id }))))
}

describe('il risultato di un attrezzo che arriva dopo una carta del giro', () => {
    it('ESC-01 ⛔ (registro vero) «npm test» approvato dalla carta ed uscito con 1: la riga prima della carta dice «non riuscito» e tiene l’output', () => {
        const c = conversazioneDaEventi(vere())
        const shell = righe(c.messaggi).filter((r) => r.name === 'shell')
        expect(shell).toHaveLength(1)
        // nel messaggio salvato una riga è finita per definizione (`finita` vale solo dal vivo): contano l'esito e il risultato
        expect(shell[0]).toMatchObject({ esito: 'errore' })
        expect(shell[0]!.risultato?.contenuto).toMatch(/exit 1/u)
    })

    it('ESC-02 lo stesso con una carta di DOMANDA a metà attrezzo', () => {
        const c = conversazioneDaEventi([
            { type: 'RunStarted', runId: 'g', input: { consegna: 'x' } },
            { type: 'ToolCallStart', toolCallId: 'a', toolCallName: 'shell' },
            { type: 'ToolCallArgs', toolCallId: 'a', delta: '{"comando":"npm test"}' },
            { type: 'UserQuestionRequested', requestId: 'q1', questions: [{ id: 'x', header: 'Scelta', question: 'Continuo?', options: [{ label: 'Sì' }, { label: 'No' }] }] },
            { type: 'ToolCallResult', toolCallId: 'a', role: 'tool', content: 'exit 1 [sandbox: wsl2]\n1 failing', isError: true, exitCode: 1 },
            { type: 'RunFinished', runId: 'g' },
        ])
        const shell = righe(c.messaggi).filter((r) => r.name === 'shell')
        expect(shell).toHaveLength(1)
        expect(shell[0]).toMatchObject({ esito: 'errore', risultato: { contenuto: 'exit 1 [sandbox: wsl2]\n1 failing' } })
    })

    it('ESC-03 lo stesso quando la parte è stata divisa da un risultato consegnato dentro il giro (QueuedMessageDelivered)', () => {
        const c = conversazioneDaEventi([
            { type: 'RunStarted', runId: 'g', input: { consegna: 'x' } },
            { type: 'TextMessageStart', messageId: 'm1', role: 'assistant' },
            { type: 'TextMessageContent', messageId: 'm1', delta: 'Lancio i test.' },
            { type: 'ToolCallStart', toolCallId: 'a', toolCallName: 'shell' },
            { type: 'QueuedMessageDelivered', voci: [{ id: 'd1', origine: 'delega', childId: 'f1', testo: 'Sub-agent result (untrusted):\n{}' }] },
            { type: 'ToolCallResult', toolCallId: 'a', role: 'tool', content: 'exit 1 [sandbox: wsl2]\n1 failing', isError: true, exitCode: 1 },
            { type: 'RunFinished', runId: 'g' },
        ])
        const shell = righe(c.messaggi).filter((r) => r.name === 'shell')
        expect(shell).toHaveLength(1)
        expect(shell[0]).toMatchObject({ esito: 'errore', risultato: { contenuto: 'exit 1 [sandbox: wsl2]\n1 failing' } })
    })

    it('ESC-04 una chiamata sconosciuta al giro resta ignorata (nessuna riga inventata)', () => {
        const c = conversazioneDaEventi([
            { type: 'RunStarted', runId: 'g', input: { consegna: 'x' } },
            { type: 'ToolCallResult', toolCallId: 'mai-vista', role: 'tool', content: 'exit 1\n', isError: true },
            { type: 'RunFinished', runId: 'g' },
        ])
        expect(righe(c.messaggi)).toEqual([])
    })
})
