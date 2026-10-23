import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
    applicaEventoR4,
    conversazioneDaEventi,
    creaConversazioneR4,
    leggiFlussoSse,
} from '@/lib/harness/r4/eventiR4'
import { TALOS_METADATA_SEQUENZA } from '@/lib/chat/sequenzaDelTurno'
import { TALOS_METADATA_APPROVAZIONE } from '@/lib/harness/r4/approvazioneChiave'
import { TALOS_METADATA_DOMANDA } from '@/lib/harness/r4/domandaChiave'
import { TALOS_METADATA_FERMATO } from '@/lib/harness/r4/fermatoChiave'

/**
 * ⛔ K3-A (ledger `LEDGER-K3-CODICE-COME-LA-CHAT-2026-10-15.md`; owner 15/10 «Stessi componenti della chat», «Dentro K3, su r4»):
 * gli eventi di sessione di r4 (stile AG-UI, nomi PascalCase, niente ToolCallEnd) diventano i messaggi che la chat sa già mostrare.
 * Golden registrati da una sessione VERA di r4 @ 99ffa3d38 contro un fornitore finto (`scripts/r4-mobile/registra-golden-r4.mjs`),
 * con il `timestamp` di AG-UI sui giri. Il golden @ 8bfe38fa8 (senza ora) resta per R4EV-09: le sessioni salvate prima.
 */

const FIXTURE = resolve(__dirname, '..', '..', 'fixtures', 'r4')
const vivo = readFileSync(resolve(FIXTURE, 'r4-99ffa3d38-vivo.sse'), 'utf8')
const rigiocata = readFileSync(resolve(FIXTURE, 'r4-99ffa3d38-rigiocata.sse'), 'utf8')

const dati = (testo: string) => leggiFlussoSse(testo).map((e) => e.dati)
const sintesi = (testo: string) => conversazioneDaEventi(dati(testo)).messaggi.map((m) => ({
    role: m.role, content: m.content, reasoning: m.reasoning ?? null, state: m.state, sequenza: m.metadata[TALOS_METADATA_SEQUENZA] ?? null,
}))

describe('eventi di r4 → messaggi della chat (K3-A)', () => {
    it('R4EV-01 il flusso SSE si legge, coi suoi id; un blocco storto non rompe', () => {
        const eventi = leggiFlussoSse(vivo)
        const tipi = eventi.map((e) => e.dati.type)
        expect(tipi.filter((t) => t === 'RunStarted')).toHaveLength(2)
        expect(tipi.filter((t) => t === 'RunFinished')).toHaveLength(2)
        expect(tipi).toContain('ToolCallResult')
        expect(eventi.some((e) => typeof e.id === 'number')).toBe(true)
        const storto = leggiFlussoSse(': commento\n\ndata: {non json\n\nid: 7\ndata: {"type":"RunStarted","runId":"r","input":{"consegna":"x"}}\n\n')
        expect(storto).toEqual([{ id: 7, dati: { type: 'RunStarted', runId: 'r', input: { consegna: 'x' } } }])
    })

    it('R4EV-02 dal vivo: utente, assistente (ragionamento → leggi → ragionamento → testo), utente, assistente', () => {
        const messaggi = sintesi(vivo)
        expect(messaggi.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant'])
        expect(messaggi[0].content).toBe('Leggi NOTA.md e dimmi cosa dice')
        expect(messaggi[1].content).toContain('## Cosa dice la nota')
        expect(messaggi[1].content).toContain('```js')
        expect(messaggi[1].reasoning).toContain('Devo leggere NOTA.md')
        expect(messaggi[1].state).toBe('persisted')
        const sequenza = messaggi[1].sequenza as { tipo: string, attrezzi?: { name: string, detail: string | null }[] }[]
        expect(sequenza.map((s) => s.tipo)).toEqual(['ragionamento', 'attrezzi', 'ragionamento', 'testo'])
        expect(sequenza[1].attrezzi).toEqual([{ name: 'leggi', detail: 'NOTA.md' }])
        expect(messaggi[2].content).toBe('Riassumi in una riga')
        expect(messaggi[3].content).toBe('In una riga: la nota chiede `slugify` entro **venerdì**.')
    })

    it('R4EV-03 la storia rigiocata (delta fusi) dà ESATTAMENTE gli stessi messaggi del dal vivo', () => {
        expect(sintesi(rigiocata)).toEqual(sintesi(vivo))
    })

    it('R4EV-04 eventi sconosciuti, campi mancanti o di tipo sbagliato non lanciano e non cambiano i messaggi', () => {
        const rumore: Record<string, unknown>[] = [
            { type: 'NonEsiste' }, { type: 'TextMessageContent' }, { type: 'TextMessageContent', delta: 42 },
            { type: 'ToolCallStart', toolCallName: 7 }, { type: 'ToolCallArgs', toolCallId: 'x', delta: '{rotto' },
            { type: 'RunFinished' }, { type: 'CUSTOM', name: 'talos.qualcosa', value: { a: 1 } }, { type: 'RunError', message: 5 },
            {}, { type: null as unknown as string },
        ]
        const base = conversazioneDaEventi(dati(vivo))
        const conRumore = conversazioneDaEventi([...dati(vivo), ...rumore.filter((e) => e.type !== 'RunFinished' && e.type !== 'RunError')])
        expect(conRumore.messaggi).toEqual(base.messaggi)
        expect(() => conversazioneDaEventi(rumore)).not.toThrow()
    })

    it('R4EV-05 un giro senza fine è «in corso», con testo, ragionamento, confini e attrezzi attivi', () => {
        const parziale = dati(vivo)
        const primaFine = parziale.findIndex((e) => e.type === 'TextMessageEnd')
        const c = conversazioneDaEventi(parziale.slice(0, primaFine))
        expect(c.messaggi.map((m) => m.role)).toEqual(['user'])
        expect(c.inCorso).not.toBeNull()
        expect(c.inCorso!.ragionamento).toContain('Devo leggere NOTA.md')
        expect(c.inCorso!.testo).toContain('## Cosa dice la nota')
        expect(c.inCorso!.confini).toHaveLength(1)
        // il risultato di `leggi` è già arrivato: la chiamata lo dice (R4EV-14, owner 22/10)
        expect(c.inCorso!.confini[0].attrezzi).toEqual([{ name: 'leggi', detail: 'NOTA.md', finita: true }])
        const soloAttrezzo = parziale.slice(0, parziale.findIndex((e) => e.type === 'ToolCallArgs') + 1)
        expect(conversazioneDaEventi(soloAttrezzo).inCorso!.attivi).toEqual([{ name: 'leggi', detail: 'NOTA.md' }])
    })

    /* Owner 22/10/2026 (foto, «che casino»): due chiamate senza testo in mezzo stanno nello stesso confine; la prima, col suo
       risultato, è finita e lo dice; la seconda no. Nel salvato la forma resta quella di prima (niente `finita`). */
    it('R4EV-14 nello stesso confine ogni chiamata dice se è finita', () => {
        const eventi = [
            { type: 'RunStarted', runId: 'g', input: { consegna: 'x' } },
            { type: 'ToolCallStart', toolCallId: 'c1', toolCallName: 'scrivi' },
            { type: 'ToolCallArgs', toolCallId: 'c1', delta: '{"percorso":"calcolatrice.js"}' },
            { type: 'ToolCallResult', toolCallId: 'c1', content: 'ok', role: 'tool' },
            { type: 'ToolCallStart', toolCallId: 'c2', toolCallName: 'shell' },
        ]
        const c = conversazioneDaEventi(eventi)
        expect(c.inCorso!.confini).toHaveLength(1)
        const [prima, seconda] = c.inCorso!.confini[0].attrezzi
        expect(prima).toMatchObject({ name: 'scrivi', finita: true })
        expect(seconda.name).toBe('shell')
        expect(seconda.finita).not.toBe(true)
    })

    /* Decisione owner 22/10/2026 («Ragionamento dentro il gruppo»: a fine «Ha lavorato per X · N passi»): il messaggio del giro si
       porta quanto è durato, dall'ora di RunStarted a quella di RunFinished (i `timestamp` di AG-UI). Senza le due ore, niente. */
    it('R4EV-15 il giro finito sa quanto è durato', () => {
        const t0 = Date.UTC(2026, 9, 22, 18, 0, 0)
        const eventi = [
            { type: 'RunStarted', runId: 'g', input: { consegna: 'x' }, timestamp: t0 },
            { type: 'TextMessageStart', messageId: 'm', role: 'assistant' },
            { type: 'TextMessageContent', messageId: 'm', delta: 'fatto' },
            { type: 'TextMessageEnd', messageId: 'm' },
            { type: 'RunFinished', runId: 'g', timestamp: t0 + 95_000 },
        ]
        const finito = conversazioneDaEventi(eventi).messaggi.find((m) => m.role === 'assistant')!
        expect(finito.metadata.durataMs).toBe(95_000)
        const senzaOre = conversazioneDaEventi(eventi.map((e) => ({ ...e, timestamp: undefined }))).messaggi.find((m) => m.role === 'assistant')!
        expect(senzaOre.metadata.durataMs).toBeUndefined()
    })

    it('R4EV-06 un giro finito in errore è un messaggio «failed» col codice', () => {
        let c = creaConversazioneR4()
        for (const e of [
            { type: 'RunStarted', runId: 'g1', input: { consegna: 'fai' } },
            { type: 'TextMessageContent', messageId: 'm', delta: 'Comincio…' },
            { type: 'RunError', message: 'Il fornitore non risponde', code: 'PROVIDER_UNAVAILABLE' },
        ]) c = applicaEventoR4(c, e)
        expect(c.inCorso).toBeNull()
        // K3-C3a2: sotto la bolla c'è la riga di stato col motivo (R4EV-10/11)
        const fallito = c.messaggi.find((m) => m.role === 'assistant')!
        expect(fallito.state).toBe('failed')
        expect(fallito.content).toBe('Comincio…')
        expect(fallito.metadata.errore).toEqual({ code: 'PROVIDER_UNAVAILABLE', message: 'Il fornitore non risponde' })
    })

    it('R4EV-07 l’ultima sequenza vista (per ?after=) e la fine della storia rigiocata', () => {
        const c = conversazioneDaEventi(dati(rigiocata))
        const massimo = Math.max(...leggiFlussoSse(rigiocata).map((e) => e.id ?? -1))
        expect(c.ultimaSequenza).toBe(massimo)
        expect(c.storiaFinita).toBe(true)
        expect(creaConversazioneR4().storiaFinita).toBe(false)
    })

    /*
     * ⛔ Visto sul Pad il 15/10: la storia rigiocata di r4 non portava l'ora del giro (`talos.contesto-richiesta` c'è solo dal
     * vivo), e riaprendo una sessione i messaggi restavano senza ora. Nino1 (15/10, `b4e6b1f76` su feat/ora-dei-giri): il campo
     * facoltativo di AG-UI `timestamp`, in MILLISECONDI, su RunStarted, RunFinished e RunError, dal vivo e rigiocato. Le sessioni
     * salvate prima non ce l'hanno e restano senza ora. Golden nuovo quando il ramo entra in r4.
     */
    it('R4EV-08 l\'ora del giro viene da RunStarted.timestamp, uguale dal vivo e rigiocata', () => {
        const inizio = Date.UTC(2026, 9, 15, 18, 0, 0)
        const iso = new Date(inizio).toISOString()
        const giro = (conDelta: boolean) => [
            { type: 'RunStarted', runId: 'r1', input: { consegna: 'Ciao' }, timestamp: inizio, _sequenza: 1 },
            ...(conDelta
                ? [{ type: 'TextMessageContent', delta: 'Ci', _sequenza: 2 }, { type: 'TextMessageContent', delta: 'ao', _sequenza: 3 }]
                : [{ type: 'TextMessageContent', delta: 'Ciao', _sequenza: 3 }]),
            { type: 'RunFinished', runId: 'r1', timestamp: inizio + 4000, _sequenza: 4 },
        ]
        const ore = (eventi: Record<string, unknown>[]) => conversazioneDaEventi(eventi).messaggi.map((m) => [m.role, m.created_at])
        expect(ore(giro(true))).toEqual([['user', iso], ['assistant', iso]])
        expect(ore(giro(false))).toEqual(ore(giro(true)))
        // un timestamp storto non vale niente: resta l'ora di prima (qui nessuna), mai un'eccezione
        expect(ore([{ type: 'RunStarted', runId: 'r2', input: { consegna: 'x' }, timestamp: 'ieri' }, { type: 'RunFinished' }]))
            .toEqual([['user', ''], ['assistant', '']])
        // senza RunStarted.timestamp, la fine del giro dà almeno l'ora della risposta
        expect(ore([{ type: 'RunStarted', runId: 'r3', input: { consegna: 'x' } }, { type: 'RunFinished', timestamp: inizio }]))
            .toEqual([['user', ''], ['assistant', iso]])
        // e sul golden VERO di r4 @ 99ffa3d38: ogni messaggio ha un'ora, la stessa dal vivo e rigiocato
        const oreVere = (sse: string) => conversazioneDaEventi(dati(sse)).messaggi.map((m) => m.created_at)
        expect(oreVere(vivo).every((o) => /^\d{4}-\d{2}-\d{2}T/u.test(o))).toBe(true)
        expect(oreVere(rigiocata)).toEqual(oreVere(vivo))
    })

    it('R4EV-09 le sessioni salvate prima del timestamp (golden @ 8bfe38fa8) restano senza ora, mai un\'ora inventata', () => {
        const vecchio = readFileSync(resolve(FIXTURE, 'r4-8bfe38fa8-rigiocata.sse'), 'utf8')
        const messaggi = conversazioneDaEventi(dati(vecchio)).messaggi
        expect(messaggi.length).toBeGreaterThan(0)
        expect(messaggi.every((m) => m.created_at === '')).toBe(true)
    })

    /**
     * ⛔ K3-C3a2 (owner 15/10: «Riga di stato come la chat»). Sul Pad la copia di una sessione è finita con «Talos · ora · non
     * riuscito» e una bolla VUOTA (con «Copia» e «Leggi» su niente): il motivo restava in `metadata.errore`. La chat lo dice in una
     * riga `system` `failed` con `chat_error` (`stores/chat.ts:2295`), e qui si fa lo stesso. Il RunError è quello vero di r4.
     */
    const erroreVero = {
        type: 'RunError', code: 'PROVIDER_OUTCOME_UNKNOWN', classe: 'rete', messageChiave: 'server.providerOutcome.interrupted',
        message: 'The provider response was interrupted and the outcome of the request is uncertain. Resume explicitly when you want to continue: a new request may incur another cost.',
        timestamp: 1792045692406,
    }
    const traduciInItaliano = { testoDelServer: (chiave: string | undefined, _p: unknown, riserva: string) => (chiave === 'server.providerOutcome.interrupted' ? 'FRASE ITALIANA' : riserva) }

    it('R4EV-10 un giro fallito senza aver detto niente: nessuna bolla vuota, una riga di stato col motivo tradotto', () => {
        let c = creaConversazioneR4()
        for (const e of [{ type: 'RunStarted', runId: 'g1', input: { consegna: 'fai' }, timestamp: 1792045692189 }, erroreVero]) {
            c = applicaEventoR4(c, e, traduciInItaliano)
        }
        expect(c.inCorso).toBeNull()
        expect(c.messaggi.map((m) => m.role)).toEqual(['user', 'system'])
        const riga = c.messaggi[1]
        expect(riga.state).toBe('failed')
        expect(riga.content).toBe('FRASE ITALIANA')
        expect(riga.created_at).toBe(new Date(1792045692189).toISOString())
        expect(riga.metadata.chat_error).toEqual({ layer: 'network', code: 'PROVIDER_OUTCOME_UNKNOWN', message: 'FRASE ITALIANA' })
        // senza traduttore resta la frase del server, mai la chiave
        const grezza = conversazioneDaEventi([{ type: 'RunStarted', runId: 'g1', input: { consegna: 'fai' } }, erroreVero])
        expect(grezza.messaggi[1].content).toBe(erroreVero.message)
    })

    /*
     * Visto sul Pad il 21/10 (sessione lunga col modello locale): «Errore di esecuzione LOCAL_ENGINE_BUSY — The local model is busy
     * answering in the chat…» in INGLESE con l'app in italiano. r4 manda il RunError del motore dell'app col solo `code` e la frase
     * inglese, senza `messageChiave`; la frase italiana il telefono ce l'ha (`testi/errori-locale-r4.json`), ma la riga non la cercava.
     */
    it('R4EV-12 un errore senza chiave ma con un codice che il telefono conosce si dice nella lingua dell\'app', () => {
        const occupato = { type: 'RunError', code: 'LOCAL_ENGINE_BUSY', message: 'The local model is busy answering in the chat: one reply at a time. Try again when it has finished.' }
        const opzioni = { testoDelCodice: (codice: string, riserva: string) => (codice === 'LOCAL_ENGINE_BUSY' ? 'FRASE DEL CODICE' : riserva) }
        const c = conversazioneDaEventi([{ type: 'RunStarted', runId: 'g', input: { consegna: 'x' } }, occupato], opzioni)
        expect(c.messaggi[1].content).toBe('FRASE DEL CODICE')
        expect(c.messaggi[1].metadata.chat_error).toMatchObject({ code: 'LOCAL_ENGINE_BUSY', message: 'FRASE DEL CODICE' })
        // la chiave del server, quando c'è, resta la prima strada
        const conChiave = conversazioneDaEventi([{ type: 'RunStarted', runId: 'g', input: { consegna: 'x' } }, erroreVero], { ...traduciInItaliano, ...opzioni })
        expect(conChiave.messaggi[1].content).toBe('FRASE ITALIANA')
    })

    /*
     * Visto sul Pad il 21/10 (sessione lunga col modello locale): «This model does not use tools: this remains a chat…» in INGLESE
     * con l'app in italiano. r4 lo manda come pezzo di testo con `deltaChiave: server.runtime.notice.noTools`; la frase italiana il
     * telefono ce l'ha (`testi/server-r4.json`), ma il pezzo di testo non guardava la chiave.
     */
    it('R4EV-13 un pezzo di testo con la sua chiave si dice nella lingua dell\'app', () => {
        const avviso = {
            type: 'TextMessageContent', messageId: 'm1',
            delta: 'This model does not use tools: this remains a chat. It can answer, but it cannot read files or run commands.',
            deltaChiave: 'server.runtime.notice.noTools',
        }
        const opzioni = { testoDelServer: (chiave: string | null | undefined, _p: unknown, riserva: string) => (chiave === 'server.runtime.notice.noTools' ? 'FRASE ITALIANA' : riserva) }
        let c = creaConversazioneR4()
        for (const e of [{ type: 'RunStarted', runId: 'g', input: { consegna: 'x' } }, avviso]) c = applicaEventoR4(c, e, opzioni)
        expect(c.inCorso!.testo).toBe('FRASE ITALIANA')
        // AL CONTRARIO: un pezzo senza chiave resta com'è
        let d = creaConversazioneR4()
        for (const e of [{ type: 'RunStarted', runId: 'g', input: { consegna: 'x' } }, { type: 'TextMessageContent', delta: 'ciao' }]) d = applicaEventoR4(d, e, opzioni)
        expect(d.inCorso!.testo).toBe('ciao')
    })

    it('R4EV-11 un giro fallito dopo aver scritto: la bolla resta «failed» e la riga di stato si aggiunge sotto', () => {
        let c = creaConversazioneR4()
        for (const e of [
            { type: 'RunStarted', runId: 'g1', input: { consegna: 'fai' } },
            { type: 'TextMessageContent', messageId: 'm', delta: 'Comincio…' },
            { ...erroreVero, classe: 'fornitore', code: 'PROVIDER_UNAVAILABLE' },
        ]) c = applicaEventoR4(c, e, traduciInItaliano)
        expect(c.messaggi.map((m) => [m.role, m.state])).toEqual([['user', 'persisted'], ['assistant', 'failed'], ['system', 'failed']])
        expect(c.messaggi[1].content).toBe('Comincio…')
        expect(c.messaggi[2].metadata.chat_error).toMatchObject({ layer: 'provider', code: 'PROVIDER_UNAVAILABLE' })
        const altro = conversazioneDaEventi([{ type: 'RunStarted', runId: 'g', input: { consegna: 'x' } }, { type: 'RunError', message: 'Boom', code: 'TOOL_CRASH' }])
        expect(altro.messaggi[1].metadata.chat_error).toEqual({ layer: 'system', code: 'TOOL_CRASH', message: 'Boom' })
        const senzaCodice = conversazioneDaEventi([{ type: 'RunStarted', runId: 'g', input: { consegna: 'x' } }, { type: 'RunError', message: 'Boom' }])
        expect(senzaCodice.messaggi[1].metadata.chat_error).toEqual({ layer: 'system', code: 'RUN_ERROR', message: 'Boom' })
    })

    /**
     * ⛔ K3-C3a2, trovato sul Pad (copia + «Riprendi»): dopo la ripresa compariva di nuovo «Tu · Leggi NOTA.md…», che la persona
     * non aveva riscritto. Il desktop r4 (`app.js:21290` @ 99ffa3d38) mostra la bolla della persona sul PRIMO giro e poi solo su
     * un `RunStarted` con `input.seguito:true` (r4 `resume(messaggio)`); una ripresa senza messaggio rimanda la stessa consegna
     * senza `seguito`, e un giro nato da una delega, un workflow, lo sfondo o un obiettivo (`input.origine`) non è la persona.
     */
    it('R4EV-12 la bolla «Tu» solo per ciò che la persona ha scritto: primo giro e seguiti, mai una ripresa o una delega', () => {
        const giro = (runId: string, input: Record<string, unknown>) => [
            { type: 'RunStarted', runId, input },
            { type: 'TextMessageContent', messageId: `${runId}m`, delta: `risposta ${runId}` },
            { type: 'RunFinished', result: {} },
        ]
        const c = conversazioneDaEventi([
            ...giro('g1', { consegna: 'Leggi NOTA.md' }),
            ...giro('g2', { consegna: 'Leggi NOTA.md' }),
            ...giro('g3', { consegna: 'Riassumi in una riga', seguito: true }),
            ...giro('g4', { consegna: 'Esito della delega', origine: 'delega', seguito: true }),
        ])
        expect(c.messaggi.filter((m) => m.role === 'user').map((m) => m.content)).toEqual(['Leggi NOTA.md', 'Riassumi in una riga'])
        expect(c.messaggi.filter((m) => m.role === 'assistant').map((m) => m.content)).toEqual(['risposta g1', 'risposta g2', 'risposta g3', 'risposta g4'])
    })

    /*
     * ⛔ K3-AP1 (ledger `LEDGER-K3-APPROVAZIONI-2026-10-16.md`): `ApprovalRequested` divide il giro come un risultato consegnato
     * (K3-RISDEL) e la carta sta SOTTO la riga dell'attrezzo; `ApprovalResolved` scrive l'esito. Flusso VERO di r4 @ 2161afb32 sul Pad
     * col fornitore finto, sessione «Su richiesta»: un sì, poi un seguito e un no (id anonimizzati).
     */
    const approvazione = readFileSync(resolve(FIXTURE, 'approvazione-2161afb32.sse'), 'utf8')
    const voceDi = (m: { metadata: Record<string, unknown> }) => m.metadata[TALOS_METADATA_APPROVAZIONE] as { requestId: string; azione: Record<string, unknown>; esito: unknown } | undefined

    it('R4EV-AP-01 la carta sta fra la parte del giro con la riga dell\'attrezzo e la risposta; l\'esito dal server', () => {
        const c = conversazioneDaEventi(dati(approvazione))
        expect(c.messaggi.map((m) => (voceDi(m) ? `carta:${voceDi(m)!.requestId.slice(-1)}` : `${m.role}:${m.content}`))).toEqual([
            'user:Esegui i test del progetto', 'assistant:', 'carta:1', 'assistant:Fatto: i test sono passati.',
            'user:Esegui i test di nuovo', 'assistant:', 'carta:2', 'assistant:Va bene: non ho lanciato i test.',
        ])
        const parte = c.messaggi[1]
        expect(parte.reasoning).toBe('Lancio i test.')
        expect((parte.metadata[TALOS_METADATA_SEQUENZA] as { attrezzi?: unknown } | undefined)).toBeTruthy()
        const [prima, seconda] = c.messaggi.filter((m) => voceDi(m)).map((m) => voceDi(m)!)
        expect(prima.azione).toMatchObject({ tipo: 'shell', comando: 'echo test-ok' })
        expect(prima.esito).toEqual({ approvato: true, ambito: null, motivo: null })
        expect(seconda.esito).toEqual({ approvato: false, ambito: null, motivo: null })
        expect(c.messaggi.filter((m) => voceDi(m)).every((m) => m.role === 'system' && m.state === 'persisted')).toBe(true)
    })

    it('R4EV-AP-02 dal vivo: la carta compare quando r4 chiede, senza esito; il giro resta aperto e continua dopo', () => {
        const eventi = dati(approvazione)
        const fino = eventi.findIndex((e) => e.type === 'ApprovalRequested')
        let c = creaConversazioneR4()
        for (const e of eventi.slice(0, fino + 1)) c = applicaEventoR4(c, e)
        const ultima = c.messaggi.at(-1)!
        expect(voceDi(ultima)).toMatchObject({ requestId: '44444444-4444-4444-8444-444444444441', esito: null })
        expect(c.inCorso).not.toBeNull()
        expect(c.inCorso!.confini).toEqual([])
    })

    it('R4EV-AP-03 una carta per richiesta: la stessa richiesta due volte (rigiocata) non raddoppia; un esito di una richiesta ignota non cambia niente', () => {
        const eventi = dati(approvazione)
        const richiesta = eventi.find((e) => e.type === 'ApprovalRequested')!
        const una = conversazioneDaEventi(eventi)
        const doppia = conversazioneDaEventi([...eventi.slice(0, eventi.indexOf(richiesta) + 1), richiesta, ...eventi.slice(eventi.indexOf(richiesta) + 1)])
        expect(doppia.messaggi.map((m) => m.id)).toEqual(una.messaggi.map((m) => m.id))
        const ignota = applicaEventoR4(una, { type: 'ApprovalResolved', requestId: 'nessuna', approvato: true })
        expect(ignota.messaggi).toEqual(una.messaggi)
        const storta = applicaEventoR4(una, { type: 'ApprovalRequested', requestId: 7 })
        expect(storta.messaggi).toEqual(una.messaggi)
    })
})

describe('le domande di TALOS nel flusso di r4 (K3-AP2)', () => {
    /* Flusso VERO registrato sul Pad (r4 2161afb32, fornitore finto): due domande, la prima con risposta (con un «Altro» nella
       multipla), la seconda saltata. Id della sessione e delle richieste anonimizzati. */
    const domanda = readFileSync(resolve(FIXTURE, 'domanda-2161afb32.sse'), 'utf8')
    const voceDi = (m: { metadata: Record<string, unknown> }) => m.metadata[TALOS_METADATA_DOMANDA] as { requestId: string; questions: Array<{ id: string }>; at: string | null; origine: unknown; esito: Record<string, unknown> | null } | undefined

    it('R4EV-DOM-01 la carta sta fra la parte del giro con la riga dell\'attrezzo e la risposta; l\'esito completo dal server', () => {
        const c = conversazioneDaEventi(dati(domanda))
        expect(c.messaggi.map((m) => (voceDi(m) ? `domanda:${voceDi(m)!.requestId.slice(-1)}` : `${m.role}:${m.content}`))).toEqual([
            'user:Prepara il progetto', 'assistant:', 'domanda:1', 'assistant:Preparo il progetto con le tue scelte: PostgreSQL.',
            'user:Prepara un altro progetto', 'assistant:', 'domanda:2', 'assistant:Va bene: procedo con SQLite, l\'ipotesi più prudente.',
        ])
        expect(c.messaggi[1].reasoning).toBe('Mi servono due scelte.')
        const [prima, seconda] = c.messaggi.filter((m) => voceDi(m)).map((m) => voceDi(m)!)
        expect(prima.questions.map((q) => q.id)).toEqual(['database', 'funzioni'])
        expect(prima.at).toMatch(/^2026-10-16T/)
        expect(prima.origine).toEqual({ modalita: 'normale', agente: 'principale' })
        expect(prima.esito).toEqual({ status: 'answered', answers: { database: 'PostgreSQL', funzioni: ['Login', 'Backup'] }, at: expect.stringMatching(/^2026-10-16T/), da: 'persona' })
        expect(seconda.esito).toEqual({ status: 'skipped', at: expect.stringMatching(/^2026-10-16T/), da: 'persona' })
        expect(c.messaggi.filter((m) => voceDi(m)).every((m) => m.role === 'system' && m.state === 'persisted' && m.id.startsWith('domanda:'))).toBe(true)
    })

    it('R4EV-DOM-02 dal vivo: la carta compare quando r4 chiede, senza esito; il giro resta aperto', () => {
        const eventi = dati(domanda)
        const fino = eventi.findIndex((e) => e.type === 'UserQuestionRequested')
        let c = creaConversazioneR4()
        for (const e of eventi.slice(0, fino + 1)) c = applicaEventoR4(c, e)
        expect(voceDi(c.messaggi.at(-1)!)).toMatchObject({ requestId: '55555555-5555-4555-8555-555555555551', esito: null })
        expect(c.inCorso).not.toBeNull()
    })

    it('R4EV-DOM-03 una carta per richiesta (rigiocata); domande storte o esiti ignoti non cambiano niente', () => {
        const eventi = dati(domanda)
        const richiesta = eventi.find((e) => e.type === 'UserQuestionRequested')!
        const una = conversazioneDaEventi(eventi)
        const doppia = conversazioneDaEventi([...eventi.slice(0, eventi.indexOf(richiesta) + 1), richiesta, ...eventi.slice(eventi.indexOf(richiesta) + 1)])
        expect(doppia.messaggi.map((m) => m.id)).toEqual(una.messaggi.map((m) => m.id))
        expect(applicaEventoR4(una, { type: 'UserQuestionResolved', requestId: 'nessuna', status: 'answered' }).messaggi).toEqual(una.messaggi)
        expect(applicaEventoR4(una, { type: 'UserQuestionRequested', requestId: 'x', questions: 'non un elenco' }).messaggi).toEqual(una.messaggi)
        expect(applicaEventoR4(una, { type: 'UserQuestionRequested', requestId: 'x', questions: [] }).messaggi).toEqual(una.messaggi)
    })
})

/**
 * ⛔ K3-C Accoda, Pad 16/10 (`coda-foto/orizzontale-indirizzata.png`): «Indirizza ora» chiude il giro vecchio con lo stesso
 * `RunError` `fermato` dello Stop (r4 chiama `abort()` senza motivo in tutti e due, `session-registry.mjs`), e il Codice lo mostrava
 * come «Errore di esecuzione» rosso con il giro «non riuscito». Il desktop r4 (`errori.js`, famiglia `reindirizzato`, `silenziosa`)
 * non mostra niente: la provenienza la dà il `RunRedirectRequested` ancora in volo, e il fermo dev'essere davvero un fermo su
 * richiesta (un guasto vero durante il reindirizzamento resta rosso).
 */
describe('il reindirizzamento della coda (K3-C Accoda)', () => {
    const coda = dati(readFileSync(resolve(FIXTURE, 'coda-2161afb32.sse'), 'utf8'))
    const errori = (c: ReturnType<typeof conversazioneDaEventi>) => c.messaggi.filter((m) => m.metadata.chat_error)
    const fermati = (c: ReturnType<typeof conversazioneDaEventi>) => c.messaggi.flatMap((m) => (m.metadata[TALOS_METADATA_FERMATO] ? [m.metadata[TALOS_METADATA_FERMATO]] : []))

    it('R4EV-RED-01 il giro chiuso da «Indirizza ora» non è un errore: nessuna riga rossa, il parziale resta salvato', () => {
        const fino = coda.findIndex((e) => e.type === 'RunRedirectApplied')
        const c = conversazioneDaEventi(coda.slice(0, fino + 1))
        expect(errori(c)).toEqual([])
        const risposta = c.messaggi.filter((m) => m.role === 'assistant')
        expect(risposta.map((m) => m.state)).toEqual(['persisted'])
        expect(risposta[0].metadata.errore).toBeUndefined()
    })

    it('R4EV-RED-02 un guasto vero durante il reindirizzamento resta rosso; annullato, un fermo dopo è di nuovo uno Stop', () => {
        const richiesta = coda.findIndex((e) => e.type === 'RunRedirectRequested')
        const guasto = conversazioneDaEventi([...coda.slice(0, richiesta + 1), { type: 'RunError', code: 'PROVIDER_ERROR', message: 'fetch failed' }])
        expect(errori(guasto).map((m) => m.metadata.chat_error)).toEqual([expect.objectContaining({ code: 'PROVIDER_ERROR' })])
        // annullato o fallito, il reindirizzamento non è più in volo: un fermo dopo è di nuovo uno Stop, con la sua nota
        const annullato = conversazioneDaEventi([...coda.slice(0, richiesta + 1), { type: 'RunRedirectCancelled', redirectId: coda[richiesta].redirectId },
            { type: 'RunError', code: 'fermato', message: '⛔ stopped on request.' }])
        expect(fermati(annullato)).toEqual([{ tecnico: '⛔ stopped on request.' }])
        // la frase muta del modello porta anche lei `fermato`, ma non è un fermo su richiesta
        const muto = conversazioneDaEventi([...coda.slice(0, richiesta + 1),
            { type: 'RunError', code: 'fermato', message: '⛔ generation stopped without an answer and without exhausting the turns.' }])
        expect(errori(muto)).toHaveLength(1)
        expect(fermati(muto)).toEqual([])
    })

    /*
     * ⛔ K3 Stop come il desktop (ledger `LEDGER-K3-STOP-2026-10-16.md`; owner 16/10 «Come il desktop»): lo Stop chiesto dalla
     * persona non è un guasto. Nessuna carta rossa e nessun «non riuscito»: una riga con la nota d'accento («Hai fermato il giro.»).
     */
    it('R4EV-STOP-01 lo Stop vero (dopo il reindirizzamento, nessuno in volo): la nota del fermo col grezzo, la bolla salvata', () => {
        const stop = coda.findIndex((e, i) => e.type === 'RunError' && i > coda.findIndex((x) => x.type === 'RunRedirectApplied'))
        const c = conversazioneDaEventi(coda.slice(0, stop + 1))
        expect(errori(c)).toEqual([])
        expect(fermati(c)).toEqual([{ tecnico: '⛔ stopped on request: while "shell" was running.' }])
        const nota = c.messaggi.at(-1)!
        expect([nota.role, nota.state, nota.content]).toEqual(['system', 'persisted', ''])
        expect(c.messaggi.filter((m) => m.role === 'assistant').map((m) => m.state)).toEqual(['persisted', 'persisted'])
        // e al rigioco (ricarica) è uguale
        expect(conversazioneDaEventi(coda.slice(0, stop + 1)).messaggi).toEqual(c.messaggi)
    })
})

/**
 * ⛔ K3-C Allegati A2 (ledger `LEDGER-K3-ALLEGATI-2026-10-16.md`): le immagini e la bolla della persona, sul flusso VERO di r4 registrato
 * sul Pad (`immagini-2161afb32.sse`). La bolla mostra ciò che la persona ha scritto (`input.bolla`, o il testo per il modello senza il
 * blocco degli allegati, `bollaPerLaRigiocata`); con sole immagini la frase per il modello non si mostra; le immagini sono allegati
 * della bolla (`r4:<id>`, l'anteprima la legge il Codice da r4).
 */
describe('le immagini e la bolla della persona (K3-C Allegati A2)', () => {
    const flusso = dati(readFileSync(resolve(FIXTURE, 'immagini-2161afb32.sse'), 'utf8'))

    it('R4EV-IMG-01 testo e immagine; solo immagine (bolla vuota); bolla diversa dal testo per il modello', () => {
        const utente = conversazioneDaEventi(flusso).messaggi.filter((m) => m.role === 'user')
        expect(utente.map((m) => m.content)).toEqual(['Cosa vedi?', '', 'Guarda questo'])
        expect(utente[0].attachments).toEqual([{
            id: 'f96a15661978a2be826647b7c5408072b03394d6399bf8be50753464a8d3e0fa',
            vault_file_id: 'r4:f96a15661978a2be826647b7c5408072b03394d6399bf8be50753464a8d3e0fa',
            grant_id: '', display_name: 'foto-uno.png', media_type: 'image/png', size_bytes: 110, permissions: ['model.read'], grant_status: 'active',
        }])
        expect(utente[1].attachments?.map((a) => a.display_name)).toEqual(['foto-due.png'])
        // K3-C Allegati A3: la bolla del terzo giro porta un file, che ora diventa un chip (R4EV-FILE-01)
        expect(utente[2].attachments?.map((a) => a.display_name)).toEqual(['dati.bin'])
        // un'immagine storta non entra
        const storta = conversazioneDaEventi([{ type: 'RunStarted', runId: 'r', input: { consegna: 'x', immagini: [{ id: '../x', nome: 'a' }, null] } }])
        expect(storta.messaggi[0].attachments ?? []).toEqual([])
    })
})

/**
 * ⛔ K3-C Allegati A3 (ledger `LEDGER-K3-ALLEGATI-2026-10-16.md`; owner 16/10, chip «Come il desktop»): i file della bolla diventano
 * chip sotto il testo della persona (`chipAllegato` del desktop): il nome, il percorso intero, i caratteri solo se il testo è stato
 * letto, nessun peso. Dal `RunStarted` VERO registrato sul Pad (bolla conservata) e da una consegna senza bolla (ricostruita).
 */
describe('i file nella bolla della persona (K3-C Allegati A3)', () => {
    it('R4EV-FILE-01 la bolla conservata e quella ricostruita dal testo per il modello danno i chip dei file', () => {
        const flusso = dati(readFileSync(resolve(FIXTURE, 'immagini-2161afb32.sse'), 'utf8'))
        const utente = conversazioneDaEventi(flusso).messaggi.filter((m) => m.role === 'user')
        expect(utente[2].attachments).toEqual([{
            id: 'r4file:0:/w/allegati/dati.bin', vault_file_id: '', grant_id: '', display_name: 'dati.bin', media_type: 'application/octet-stream',
            size_bytes: 0, permissions: ['model.read'], grant_status: 'active', percorso: '/w/allegati/dati.bin',
        }])
        const consegna = 'Leggi qui\n\nAttachments of this message:\n- NOTA.md (/w/allegati/NOTA.md)\n- attached file: /w/allegati/foto.raw'
        const senzaBolla = conversazioneDaEventi([{ type: 'RunStarted', runId: 'r', input: { consegna } }]).messaggi[0]
        expect(senzaBolla.content).toBe('Leggi qui')
        expect(senzaBolla.attachments?.map((a) => [a.display_name, a.percorso, a.size_bytes])).toEqual([
            ['NOTA.md', '/w/allegati/NOTA.md', 0], ['foto.raw', '/w/allegati/foto.raw', 0],
        ])
        // i caratteri arrivano solo dalla bolla conservata, e solo se interi
        const conCaratteri = conversazioneDaEventi([{ type: 'RunStarted', runId: 'r', input: {
            consegna: 'x\n\nAttachments of this message:\n- a.md (/w/a.md)', bolla: { testo: 'x', allegati: [{ tipo: 'file', nome: 'a.md', percorso: '/w/a.md', caratteri: 812 }, { tipo: 'file', nome: 'b.md', caratteri: -1 }, null, { tipo: 'immagine', nome: 'foto.png' }] },
        } }]).messaggi[0]
        expect(conCaratteri.attachments?.map((a) => [a.display_name, a.percorso ?? null, a.caratteri ?? null])).toEqual([['a.md', '/w/a.md', 812], ['b.md', null, null]])
    })
})
