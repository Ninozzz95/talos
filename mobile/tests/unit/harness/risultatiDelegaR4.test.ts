import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { applicaEventoR4, conversazioneDaEventi, creaConversazioneR4, leggiFlussoSse } from '@/lib/harness/r4/eventiR4'
import {
    TALOS_METADATA_RISULTATO_DELEGA,
    descriviRisultatoDelegaR4,
    fermataNellaLinguaR4,
    vociRisultatoDelegaR4,
} from '@/lib/harness/r4/risultatiDelegaR4'

/**
 * ⛔ K3-RISDEL (ledger `LEDGER-K3-CODICE-COME-LA-CHAT-2026-10-15.md`), trovato nelle foto sul Pad di K3-NOMI: i giri della madre dopo
 * una delega finivano incollati al testo della risposta («Ho delegato un compito.Fatto: controlla…») o comparivano senza nessun segno
 * del risultato del sotto-agente. Il desktop r4 mostra un riquadro a sé (`mostraRisultatoDelega`, `legacy/app.js:11055` @ fc5) sia al
 * `RunStarted` con `input.origine:'delega'` sia al `QueuedMessageDelivered` dentro il giro. Golden: le funzioni VERE del desktop
 * (`coda-messaggi.js` `descriviRisultatoDelega`, `fermataNellaLingua`) sui casi del flusso registrato e di confine.
 */
const FIXTURE = resolve(__dirname, '..', '..', 'fixtures', 'r4')
const flusso = (nome: string) => leggiFlussoSse(readFileSync(resolve(FIXTURE, nome), 'utf8')).map((e) => e.dati)
const golden = JSON.parse(readFileSync(resolve(FIXTURE, 'risultati-delega-701c6c0d2.json'), 'utf8'))
const sintesi = (eventi: Record<string, unknown>[]) => conversazioneDaEventi(eventi).messaggi.map((m) => {
    const voce = m.metadata[TALOS_METADATA_RISULTATO_DELEGA] as { codaId: string | null; childId: string | null; daGiro: boolean } | undefined
    return voce ? `risultato ${voce.childId?.slice(0, 8)} ${voce.daGiro ? 'giro' : 'consegna'}` : `${m.role} ${m.content}`
})

describe('i risultati dei sotto-agenti nella conversazione del Codice (K3-RISDEL)', () => {
    it('RDL-01 un riquadro per ogni risultato, nel punto in cui arriva; il testo prima e dopo resta in due messaggi', () => {
        const attesa = [
            'user Leggi NOTA.md e dimmi cosa dice',
            expect.stringMatching(/^assistant ## Cosa dice la nota/u),
            'user Riassumi in una riga',
            'assistant In una riga: la nota chiede `slugify` entro **venerdì**.',
            'user Delega i compiti a due agenti',
            'assistant Ho delegato due compiti.',
            'risultato 7c917933 giro',
            'risultato cabd4999 giro',
            'assistant Fatto: conta le righe di nota.md.',
            'user Delega ancora un controllo',
            'assistant Ho delegato un compito.',
            'risultato f60335f5 consegna',
            'assistant Fatto: controlla la data di consegna in nota.md.',
        ]
        expect(sintesi(flusso('r4-fc5e25d62-delega-rigiocata.sse'))).toEqual(attesa)
        expect(sintesi(flusso('r4-fc5e25d62-delega-vivo.sse'))).toEqual(attesa)
    })

    it('RDL-02 la descrizione e la fermata sono quelle del desktop, in italiano e in inglese (golden @ fc5)', () => {
        for (const lingua of ['it', 'en'] as const) {
            expect(golden.casi.map((c: { testo: unknown; childId: unknown }) => descriviRisultatoDelegaR4(c.testo, c.childId, lingua)), lingua).toEqual(golden[lingua])
            expect(golden.fermate.map((f: string) => fermataNellaLinguaR4(f, lingua)), lingua).toEqual(golden[lingua === 'it' ? 'fermateIt' : 'fermateEn'])
        }
    })

    it('RDL-03 una voce si mostra una volta sola, anche se la stessa consegna torna (rigiocata dopo il dal vivo)', () => {
        const eventi = flusso('r4-fc5e25d62-delega-rigiocata.sse')
        const consegna = eventi.find((e) => e.type === 'QueuedMessageDelivered')!
        const giroDelega = eventi.find((e) => e.type === 'RunStarted' && (e.input as Record<string, unknown>)?.origine === 'delega')!
        let c = conversazioneDaEventi(eventi)
        const prima = c.messaggi.length
        for (const e of [consegna, giroDelega]) c = applicaEventoR4(c, e)
        const risultati = c.messaggi.filter((m) => m.metadata[TALOS_METADATA_RISULTATO_DELEGA])
        expect(risultati).toHaveLength(3)
        expect(new Set(c.messaggi.map((m) => m.id)).size).toBe(c.messaggi.length)
        expect(c.messaggi.length).toBe(prima)
        // le voci lette dalle due forme: la consegna singola e il giro con più risultati
        expect(vociRisultatoDelegaR4(consegna, false).map((v) => v.childId)).toEqual(['f60335f5-eda5-4472-9621-b9e1b9637b8c'])
        expect(vociRisultatoDelegaR4(giroDelega.input, true).map((v) => [v.codaId, v.daGiro])).toEqual([
            ['a3ee1504-44cc-4219-aca7-6f57697525ab', true], ['1fc12791-fd12-47f9-9587-69e82df082f7', true],
        ])
        // un'origine diversa da «delega», o una consegna della persona, non è un risultato
        expect(vociRisultatoDelegaR4({ origine: 'workflow', testo: 'x' }, false)).toEqual([])
        expect(vociRisultatoDelegaR4({ testo: 'Una domanda in coda' }, false)).toEqual([])
    })

    it('RDL-04 dopo una consegna il giro riparte vuoto: `detto` della fine non ripete il testo già mostrato', () => {
        const c = conversazioneDaEventi([
            { type: 'RunStarted', runId: 'g1', input: { consegna: 'Delega' } },
            { type: 'TextMessageStart', messageId: 'm1' },
            { type: 'TextMessageContent', messageId: 'm1', delta: 'Ho delegato.' },
            { type: 'QueuedMessageDelivered', origine: 'delega', codaId: 'q1', childId: 'f1', testo: 'Esito della delega' },
            { type: 'RunFinished', result: { detto: 'Ho delegato.' } },
        ])
        expect(c.messaggi.map((m) => `${m.role}:${m.content}`)).toEqual(['user:Delega', 'assistant:Ho delegato.', 'system:'])
        expect(c.inCorso).toBeNull()
        // dopo la consegna il giro chiama solo un attrezzo: il suo messaggio non riprende il testo già mostrato
        const conAttrezzo = conversazioneDaEventi([
            { type: 'RunStarted', runId: 'g1', input: { consegna: 'Delega' } },
            { type: 'TextMessageContent', messageId: 'm1', delta: 'Ho delegato.' },
            { type: 'QueuedMessageDelivered', origine: 'delega', codaId: 'q1', childId: 'f1', testo: 'Esito della delega' },
            { type: 'ToolCallStart', toolCallId: 't1', toolCallName: 'leggi' },
            { type: 'ToolCallResult', toolCallId: 't1' },
            { type: 'RunFinished', result: { detto: 'Ho delegato.' } },
        ])
        expect(conAttrezzo.messaggi.map((m) => `${m.role}:${m.content}`)).toEqual(['user:Delega', 'assistant:Ho delegato.', 'system:', 'assistant:'])
        // ancora dentro il giro: la parte già scritta è un messaggio, il giro in corso è vuoto e continua
        let vivo = creaConversazioneR4()
        for (const e of [
            { type: 'RunStarted', runId: 'g2', input: { consegna: 'Delega' } },
            { type: 'ReasoningMessageContent', delta: 'Delego.' },
            { type: 'ToolCallStart', toolCallId: 't1', toolCallName: 'delega_sottotask' },
            { type: 'ToolCallResult', toolCallId: 't1' },
            { type: 'QueuedMessageDelivered', origine: 'delega', codaId: 'q2', childId: 'f2', testo: 'Esito' },
        ]) vivo = applicaEventoR4(vivo, e)
        expect(vivo.messaggi.map((m) => m.role)).toEqual(['user', 'assistant', 'system'])
        expect(vivo.messaggi[1].reasoning).toBe('Delego.')
        expect(vivo.inCorso).toEqual({ testo: '', ragionamento: '', confini: [], attivi: [] })
        // una consegna della persona (senza `origine`) non divide il giro: la coda della persona è un'altra fase (Accoda)
        const persona = applicaEventoR4(applicaEventoR4(creaConversazioneR4(), { type: 'RunStarted', runId: 'g3', input: { consegna: 'x' } }),
            { type: 'QueuedMessageDelivered', testo: 'Un seguito' })
        expect(persona.messaggi.map((m) => m.role)).toEqual(['user'])
    })
})
