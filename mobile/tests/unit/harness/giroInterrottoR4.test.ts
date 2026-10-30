import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { applicaEventoR4, conversazioneDaEventi, creaConversazioneR4, leggiFlussoSse } from '@/lib/harness/r4/eventiR4'
import { TALOS_METADATA_SEQUENZA } from '@/lib/chat/sequenzaDelTurno'

/**
 * ⛔ Difetto dal vivo (prova 8 del guardiano, Pad vc321, 27/10/2026 21:35): il PC è stato spento e riacceso mentre «sleep 60; npm
 * test» girava. Il giro non ha una fine nel registro (dopo un riavvio r4 non la scrive: la sessione è «interrotta»). Al messaggio
 * dopo, il RunStarted nuovo apriva un giro SOPRA quello aperto e lo buttava: di «Prova 8» restava solo la bolla della persona, senza
 * la riga del comando. Regola: un RunStarted con un giro ancora aperto chiude quello vecchio come interrotto, con le sue righe; le
 * chiamate rimaste senza risultato diventano «interrotte». Forme vere: il registro della sessione e7ce3dea, sequenze 1069-1118.
 */
const FIXTURE = resolve(__dirname, '..', '..', 'fixtures', 'r4', 'giro-interrotto-b377932e7.sse')
const vere = () => leggiFlussoSse(readFileSync(FIXTURE, 'utf8').replace(/\n*$/u, '\n\n')).map((e) => e.dati)

type Attrezzo = { name?: string; esito?: string; argomenti?: string }
const righeDi = (m: { metadata: Record<string, unknown> }): Attrezzo[] =>
    ((m.metadata[TALOS_METADATA_SEQUENZA] ?? []) as { tipo: string; attrezzi?: Attrezzo[] }[]).flatMap((s) => s.attrezzi ?? [])

describe('un giro rimasto aperto quando ne parte un altro', () => {
    it('GIR-01 ⛔ (registro vero) il giro interrotto dal riavvio resta, con la riga del comando «interrotta»; poi il giro nuovo', () => {
        const c = conversazioneDaEventi(vere())
        const risposte = c.messaggi.filter((m) => m.role === 'assistant')
        const interrotto = risposte.find((m) => righeDi(m).some((r) => r.name === 'shell'))
        expect(interrotto).toBeDefined()
        const shell = righeDi(interrotto!).find((r) => r.name === 'shell')!
        expect(shell.esito).toBe('interrotta')
        expect(shell.argomenti).toMatch(/sleep 60/u)
        // il giro dopo c'è, dopo quello interrotto, e risponde
        expect(risposte.at(-1)!.content).toMatch(/ripresa/iu)
        expect(c.messaggi.indexOf(interrotto!)).toBeLessThan(c.messaggi.indexOf(risposte.at(-1)!))
        expect(c.inCorso).toBeNull()
    })

    it('GIR-02 dal vivo: col giro aperto, il RunStarted nuovo chiude il vecchio come messaggio e apre il nuovo', () => {
        const eventi = vere()
        const nuovo = eventi.findIndex((e, i) => i > 0 && e.type === 'RunStarted')
        let c = creaConversazioneR4()
        for (const e of eventi.slice(0, nuovo)) c = applicaEventoR4(c, e)
        expect(c.inCorso).not.toBeNull()
        const prima = c.messaggi.length
        c = applicaEventoR4(c, eventi[nuovo]!)
        expect(c.messaggi.length).toBeGreaterThan(prima)
        expect(c.messaggi.some((m) => m.role === 'assistant' && righeDi(m).some((r) => r.name === 'shell' && r.esito === 'interrotta'))).toBe(true)
        expect(c.inCorso).not.toBeNull()
    })

    it('GIR-04 ⛔ carta a metà attrezzo, poi il PC riavviato: la riga PRIMA della carta (in una parte già scritta) diventa «interrotta»', () => {
        const c = conversazioneDaEventi([
            { type: 'RunStarted', runId: 'a', input: { consegna: 'uno' } },
            { type: 'ToolCallStart', toolCallId: 'x', toolCallName: 'shell' },
            { type: 'ToolCallArgs', toolCallId: 'x', delta: '{"comando":"sleep 60; npm test"}' },
            // le forme vere della prova 6 (`approvazione-esito-b377932e7.sse`, sequenze 1023-1024)
            { type: 'ApprovalRequested', requestId: 'p1', azione: { tipo: 'shell', toolCallId: 'x', comando: 'sleep 60; npm test' } },
            { type: 'ApprovalResolved', requestId: 'p1', approvato: true },
            // il PC riavviato: nessun risultato, nessuna fine; poi il messaggio dopo
            { type: 'RunStarted', runId: 'b', input: { consegna: 'due', seguito: true } },
            { type: 'RunFinished', runId: 'b' },
        ])
        const shell = c.messaggi.filter((m) => m.role === 'assistant').flatMap(righeDi).filter((r) => r.name === 'shell')
        expect(shell).toHaveLength(1)
        expect(shell[0]!.esito).toBe('interrotta')
    })

    it('GIR-03 un giro chiuso normalmente non cambia: niente doppioni né righe «interrotte»', () => {
        const c = conversazioneDaEventi([
            { type: 'RunStarted', runId: 'a', input: { consegna: 'uno' } },
            { type: 'ToolCallStart', toolCallId: 'x', toolCallName: 'leggi' },
            { type: 'ToolCallResult', toolCallId: 'x', role: 'tool', content: 'ok' },
            { type: 'RunFinished', runId: 'a' },
            { type: 'RunStarted', runId: 'b', input: { consegna: 'due', seguito: true } },
            { type: 'RunFinished', runId: 'b' },
        ])
        const righe = c.messaggi.filter((m) => m.role === 'assistant').flatMap(righeDi)
        expect(righe.filter((r) => r.esito === 'interrotta')).toEqual([])
        expect(righe.filter((r) => r.name === 'leggi')).toHaveLength(1)
    })
})
