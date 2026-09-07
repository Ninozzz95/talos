/*
 * ⛔⛔⛔ LE TRE CURE, TRAPIANTATE DA `cureDiTalos.mjs` — 2026-08-23.
 *
 * Questi test erano in TALOS-BANCO/cureDiTalos.test.mjs, scritti il 22/8 prima
 * del trapianto perche' la campagna in corso non permetteva di toccare
 * `talosHarness.mjs` (vedi la doc in cima a quel file, e quella sopra le tre
 * leve qui). Stessi numeri, stesso testo dove il testo e' la prova (le sei
 * misure vere della leva 4) — solo l'import cambia bersaglio.
 */
import { strict as assert } from 'node:assert'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
    siRitenta, attesaDelTentativo, chiamaConRitenta, consumaFlussoSSE,
    comeSonoFinitiIGiri, uscitaUtile,
    stimaToken, stimaTokenConversazione, serveCompattare, compattaConversazione,
    GIRI_PRIMA_DI_COMPATTARE, TOKEN_MINIMI_PER_COMPATTARE,
    serveRiflettere, GIRI_PRIMA_DI_RIFLETTERE,
    primoProgramma, convertiPercorsoWsl, percorsoMirrorDevice,
    indirizzoPubblico, validaUrlNaviga, leggiPaginaSicura,
    talosLavora,
    richiestaRicerca, analizzaRisultatiRicerca, formattaRisultatiRicerca, eseguiRicercaWeb,
    formattaOraCorrente, formattaEsitoMcp,
    formattaListaLibreria, formattaRicercaLibreria, formattaLetturaLibreria, formattaOrigineLibreria,
    formattaListaNote, formattaListaAttivita, formattaRicercaMemoria,
    formattaListaRicerche, formattaLetturaRicerca,
    forgePercorsoViolazione, forgeLeggiPercorso, forgeScriviPercorso, forgeRaccogliRiferimenti,
    forgeRisolviEspressione, forgeValutaCondizione, validaManifestForge, eseguiFlowForge, formattaEsitoForge,
    CAPACITA_FORGE,
    ATTREZZI_OPENAI, ATTREZZI_ESTESI_OPENAI,
    ambienteSenzaCredenziali, CHIAVI_CREDENZIALI_DA_NASCONDERE,
    comandoSenzaRecupero, creaRicevutaOperazione, postcondizioneDiScrivi,
    serializzaCanonica, generaChiaviFirmaRicevute, verificaFirmaRicevuta,
    avanzaCatena, verdettoTrifecta, rischioEffettivo, SICUREZZA_PER_ATTREZZO, CATENA_VUOTA,
} from './talosHarness.mjs'

/** Uno sportello finto: torna in fila gli stati che gli si danno. */
function reteChe(...stati) {
    const chiamate = []
    return {
        chiamate,
        fetch: async (url, opzioni) => {
            const stato = stati[chiamate.length] ?? 200
            chiamate.push({ url, opzioni })
            return {
                ok: stato >= 200 && stato < 300,
                status: stato,
                json: async () => ({ choices: [{ message: { content: 'fatto' } }], usage: { prompt_tokens: 7 } }),
                text: async () => `errore ${stato}`,
            }
        },
    }
}

describe('LEVA 5 — la chiamata che ritenta', () => {

    it('quali errori vale la pena ritentare, e quali no', () => {
        assert.equal(siRitenta(429), true, 'il limite di traffico passa')
        assert.equal(siRitenta(503), true, 'un guasto del fornitore passa')
        assert.equal(siRitenta(500), true)
        assert.equal(siRitenta(401), false, 'una chiave sbagliata non migliora ritentando')
        assert.equal(siRitenta(400), false, 'una richiesta malformata nemmeno')
    })

    it('⭐ un 429 seguito da un 200 NON uccide il task', async () => {
        const rete = reteChe(429, 200)
        const r = await chiamaConRitenta({
            modello: 'x', chiave: 'y', messaggi: [], attrezzi: [],
            fetchDiRete: rete.fetch, dormi: async () => {}, caso: () => 0,
        })
        assert.equal(r.tentativi, 2, 'ha ritentato una volta e ce l ha fatta')
        assert.equal(r.scelta.content, 'fatto')
        assert.equal(rete.chiamate.length, 2)
    })

    /*
     * ⛔⛔ IL NUMERO CHE GIUSTIFICA TUTTA QUESTA CURA.
     *
     * La campagna del 20/8 e' stata CONTAMINATA da questo: il fornitore
     * rispondeva 429 e il banco scriveva `fallito`. Diciotto righe su diciotto
     * per talos, e `codex 48 su 66`. Senza ritenta, un limite di traffico al
     * giro 3 di 24 butta via un task intero e lo fa sembrare bravura.
     */
    it('⛔ e chi esaurisce i tentativi porta lo STATO, non un errore generico', async () => {
        const rete = reteChe(429, 429, 429, 429)
        await assert.rejects(
            chiamaConRitenta({
                modello: 'x', chiave: 'y', messaggi: [], attrezzi: [],
                tentativiMassimi: 4, fetchDiRete: rete.fetch, dormi: async () => {}, caso: () => 0,
            }),
            (e) => {
                assert.equal(e.stato, 429, 'lo stato viaggia con l errore')
                assert.equal(e.limitatoDalFornitore, true,
                    'il banco distingue «prova mai fatta» da «fallito» leggendo questo')
                assert.match(e.message, /4 tentativi/)
                return true
            })
        assert.equal(rete.chiamate.length, 4, 'quattro tentativi, non uno e non otto')
    })

    it('⛔ e il verso contrario: su un 401 NON ritenta nemmeno una volta', async () => {
        const rete = reteChe(401, 200)
        await assert.rejects(chiamaConRitenta({
            modello: 'x', chiave: 'y', messaggi: [], attrezzi: [],
            fetchDiRete: rete.fetch, dormi: async () => {}, caso: () => 0,
        }))
        assert.equal(rete.chiamate.length, 1,
            'ritentare una chiave sbagliata brucia tempo e quota per niente')
    })

    it('l attesa CRESCE fra un tentativo e l altro', () => {
        const a = attesaDelTentativo(0, () => 0)
        const b = attesaDelTentativo(1, () => 0)
        const c = attesaDelTentativo(2, () => 0)
        assert.ok(a < b && b < c, `le attese devono crescere: ${a} ${b} ${c}`)
    })

    it('⛔ e porta il JITTER: due corse che prendono 429 insieme non ritentano insieme', () => {
        assert.notEqual(attesaDelTentativo(1, () => 0), attesaDelTentativo(1, () => 0.9),
            'senza jitter il secondo 429 e garantito')
    })
})

/*
 * ⭐⭐⭐ R1 — streaming, piano `elegant-spinning-dongarra.md`, sezione
 * "RICOGNIZIONE COMPETITIVA" (27/8). `rispostaStreaming(...)` costruisce un
 * `Response` finto il cui `.body` è un vero ReadableStream — non un mock
 * dell'interfaccia, lo STESSO oggetto che `consumaFlussoSSE` leggerebbe da
 * un `fetch` reale (stesso principio di `leggiPaginaSicura`: un trasporto
 * finto, ma con la forma vera).
 */
function rispostaStreaming(eventiSSE) {
    const testo = eventiSSE.map((e) => `data: ${typeof e === 'string' ? e : JSON.stringify(e)}\n\n`).join('')
    const bytes = new TextEncoder().encode(testo)
    return {
        ok: true,
        status: 200,
        body: new ReadableStream({
            start(controller) {
                /* ⭐ un solo chunk basta a provare il parsing; la prova che il
                 * FRAMMENTO di rete arriva a pezzi sta nel test dedicato sotto. */
                controller.enqueue(bytes)
                controller.close()
            },
        }),
    }
}

describe('R1 — lo streaming SSE, testo + ragionamento + tool-call', () => {

    it('⭐ accumula testo a pezzi e chiama onDelta per ognuno', async () => {
        const risposta = rispostaStreaming([
            { choices: [{ delta: { content: 'Ciao' } }] },
            { choices: [{ delta: { content: ', mondo' } }] },
            '[DONE]',
        ])
        const visti = []
        const { scelta } = await consumaFlussoSSE(risposta, (e) => visti.push(e))
        assert.equal(scelta.content, 'Ciao, mondo')
        assert.deepEqual(visti, [{ tipo: 'testo', delta: 'Ciao' }, { tipo: 'testo', delta: ', mondo' }])
    })

    it('⭐⭐ accumula il ragionamento SEPARATO dal testo, stesso trattamento', async () => {
        const risposta = rispostaStreaming([
            { choices: [{ delta: { reasoning_content: 'Penso che ' } }] },
            { choices: [{ delta: { reasoning_content: 'la risposta sia 4.' } }] },
            { choices: [{ delta: { content: '4' } }] },
        ])
        const visti = []
        const { scelta } = await consumaFlussoSSE(risposta, (e) => visti.push(e))
        assert.equal(scelta.reasoning_content, 'Penso che la risposta sia 4.')
        assert.equal(scelta.content, '4')
        assert.deepEqual(visti.map((v) => v.tipo), ['ragionamento', 'ragionamento', 'testo'])
    })

    it('⭐⭐⭐ accumula gli argomenti di UNA tool-call sparsi su più chunk (come manda davvero OpenAI/OpenRouter)', async () => {
        const risposta = rispostaStreaming([
            { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'scrivi', arguments: '' } }] } }] },
            { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"percorso":"a.' } }] } }] },
            { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'txt"}' } }] } }] },
        ])
        const { scelta } = await consumaFlussoSSE(risposta, () => {})
        assert.equal(scelta.tool_calls.length, 1)
        assert.equal(scelta.tool_calls[0].id, 'call_1')
        assert.equal(scelta.tool_calls[0].function.name, 'scrivi')
        assert.equal(scelta.tool_calls[0].function.arguments, '{"percorso":"a.txt"}')
        assert.deepEqual(JSON.parse(scelta.tool_calls[0].function.arguments), { percorso: 'a.txt' })
    })

    /*
     * ⭐⭐⭐ Piano procedi-col-generare-un-snoopy-neumann.md, Fase 4 — TERZO
     * tipo di delta, mai emesso prima: gli argomenti di una tool-call
     * arrivavano già accumulati (test sopra), ma MAI riportati a onDelta.
     * Stesso schema di 'testo'/'ragionamento': un evento 'tool-inizio' la
     * prima volta che un indice compare, un 'tool-args' per ogni
     * frammento — mai un evento per un frammento di NOME (solo gli
     * argomenti streamano davvero; il nome arriva quasi sempre intero nel
     * primo pezzo, dichiarato nel commento del codice).
     */
    it('⭐⭐⭐ FASE 4 — onDelta riceve tool-inizio UNA volta per indice, poi tool-args per ogni frammento di argomenti', async () => {
        const risposta = rispostaStreaming([
            { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'scrivi', arguments: '' } }] } }] },
            { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"percorso":"a.' } }] } }] },
            { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'txt"}' } }] } }] },
        ])
        const visti = []
        await consumaFlussoSSE(risposta, (e) => visti.push(e))
        assert.deepEqual(visti, [
            { tipo: 'tool-inizio', indice: 0, toolCallId: 'call_1', nome: 'scrivi' },
            { tipo: 'tool-args', indice: 0, toolCallId: 'call_1', delta: '{"percorso":"a.' },
            { tipo: 'tool-args', indice: 0, toolCallId: 'call_1', delta: 'txt"}' },
        ])
    })

    it('⭐⭐ FASE 4 — DUE tool-call in parallelo: ogni indice ha il proprio tool-inizio, gli args non si mescolano', async () => {
        const risposta = rispostaStreaming([
            { choices: [{ delta: { tool_calls: [
                { index: 0, id: 'call_a', function: { name: 'leggi', arguments: '' } },
                { index: 1, id: 'call_b', function: { name: 'cerca', arguments: '' } },
            ] } }] },
            { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"p":1}' } }] } }] },
            { choices: [{ delta: { tool_calls: [{ index: 1, function: { arguments: '{"q":2}' } }] } }] },
        ])
        const visti = []
        await consumaFlussoSSE(risposta, (e) => visti.push(e))
        const inizi = visti.filter((v) => v.tipo === 'tool-inizio')
        assert.deepEqual(inizi, [
            { tipo: 'tool-inizio', indice: 0, toolCallId: 'call_a', nome: 'leggi' },
            { tipo: 'tool-inizio', indice: 1, toolCallId: 'call_b', nome: 'cerca' },
        ])
        const argsIndice0 = visti.filter((v) => v.tipo === 'tool-args' && v.indice === 0)
        const argsIndice1 = visti.filter((v) => v.tipo === 'tool-args' && v.indice === 1)
        assert.deepEqual(argsIndice0.map((v) => v.delta), ['{"p":1}'])
        assert.deepEqual(argsIndice1.map((v) => v.delta), ['{"q":2}'])
    })

    it('⛔ AL CONTRARIO: senza nessuna tool-call nel flusso, nessun evento tool-inizio/tool-args — solo testo, come prima di questa fase', async () => {
        const risposta = rispostaStreaming([
            { choices: [{ delta: { content: 'nessun attrezzo qui' } }] },
        ])
        const visti = []
        await consumaFlussoSSE(risposta, (e) => visti.push(e))
        assert.ok(!visti.some((v) => v.tipo === 'tool-inizio' || v.tipo === 'tool-args'))
    })

    it('⭐ legge lo `usage` quando arriva nell ultimo chunk (stream_options.include_usage)', async () => {
        const risposta = rispostaStreaming([
            { choices: [{ delta: { content: 'ok' } }] },
            { choices: [{ delta: {} }], usage: { prompt_tokens: 12, completion_tokens: 3 } },
        ])
        const { usage } = await consumaFlussoSSE(risposta, () => {})
        assert.deepEqual(usage, { prompt_tokens: 12, completion_tokens: 3 })
    })

    it('⛔ un chunk malformato non fa crashare il flusso — solo quello viene ignorato', async () => {
        const testoGrezzo = 'data: {rotto\n\ndata: ' + JSON.stringify({ choices: [{ delta: { content: 'sopravvive' } }] }) + '\n\n'
        const rispostaMista = { ok: true, status: 200, body: new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(testoGrezzo)); c.close() } }) }
        const { scelta } = await consumaFlussoSSE(rispostaMista, () => {})
        assert.equal(scelta.content, 'sopravvive')
    })

    it('⛔⛔⛔ chiamaConRitenta SENZA onDelta: bit-per-bit lo stesso comportamento di oggi — nessun `stream` nel corpo, r.json() come sempre', async () => {
        let corpoInviato = null
        const fetchFinto = async (url, opzioni) => {
            corpoInviato = JSON.parse(opzioni.body)
            return {
                ok: true, status: 200,
                json: async () => ({ choices: [{ message: { content: 'risposta non-streaming' } }] }),
                text: async () => '',
            }
        }
        const r = await chiamaConRitenta({ modello: 'x', chiave: 'y', messaggi: [], attrezzi: [], fetchDiRete: fetchFinto })
        assert.equal(r.scelta.content, 'risposta non-streaming')
        assert.equal('stream' in corpoInviato, false, 'un chiamante senza onDelta non deve MAI chiedere streaming')
        assert.equal('reasoning' in corpoInviato, false)
    })

    it('⭐⭐⭐ chiamaConRitenta CON onDelta: chiede stream:true e reasoning, consuma l SSE, torna la STESSA forma di scelta/usage/tentativi', async () => {
        let corpoInviato = null
        const fetchFinto = async (url, opzioni) => {
            corpoInviato = JSON.parse(opzioni.body)
            return rispostaStreaming([
                { choices: [{ delta: { content: 'fatto in streaming' } }] },
                { choices: [{ delta: {} }], usage: { prompt_tokens: 5 } },
            ])
        }
        const visti = []
        const r = await chiamaConRitenta({
            modello: 'x', chiave: 'y', messaggi: [], attrezzi: [],
            fetchDiRete: fetchFinto, onDelta: (e) => visti.push(e), reasoning: { effort: 'medium' },
        })
        assert.equal(corpoInviato.stream, true)
        assert.deepEqual(corpoInviato.reasoning, { effort: 'medium' })
        assert.equal(r.scelta.content, 'fatto in streaming')
        assert.deepEqual(r.usage, { prompt_tokens: 5 })
        assert.equal(r.tentativi, 1)
        assert.equal(visti.length, 1)
    })

    it('⛔ e AL CONTRARIO: uno stream che si interrompe a metà (dopo un r.ok vero) LANCIA, non inventa una risposta vuota', async () => {
        const rispostaRotta = {
            ok: true, status: 200,
            body: new ReadableStream({
                start(controller) {
                    controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{}}]}\n\n'))
                    controller.close() // chiude SENZA mai mandare content né tool_calls: un flusso troncato
                },
            }),
        }
        await assert.rejects(
            chiamaConRitenta({ modello: 'x', chiave: 'y', messaggi: [], attrezzi: [], fetchDiRete: async () => rispostaRotta, onDelta: () => {} }),
            /senza contenuto/,
        )
    })
})

describe('LEVA 3 — i giri che finiscono, e lo dicono', () => {

    it('⛔ esaurire i giri e un esito SUO, non un fallimento', () => {
        const r = comeSonoFinitiIGiri({ giroRaggiunto: 24, giriMassimi: 24, haRisposto: false })
        assert.equal(r.esito, 'giri-esauriti')
        assert.match(r.detto, /giri esauriti/)
        assert.match(r.detto, /non e un fallimento del ragionamento/i)
    })

    it('⭐ chi chiude prima e «concluso», e non dice niente', () => {
        const r = comeSonoFinitiIGiri({ giroRaggiunto: 9, giriMassimi: 24, haRisposto: true })
        assert.equal(r.esito, 'concluso')
        assert.equal(r.detto, null, 'un esito normale non merita una riga')
    })

    it('⛔ e chi si ferma senza rispondere non e nessuno dei due', () => {
        assert.equal(comeSonoFinitiIGiri({ giroRaggiunto: 5, giriMassimi: 24, haRisposto: false }).esito,
            'fermato')
    })
})

describe('LEVA 4 — l uscita del giudice, dove sta la diagnosi', () => {

    it('un uscita corta passa INTERA, senza marcatori', () => {
        assert.equal(uscitaUtile('poca roba', 4_000), 'poca roba')
    })

    it('⛔ un uscita lunga tiene testa E coda, e DICHIARA quanto ha tolto', () => {
        const t = 'A'.repeat(1_000) + 'X'.repeat(8_000) + 'Z'.repeat(1_000)
        const r = uscitaUtile(t, 4_000)
        assert.ok(r.startsWith('A'), 'la testa resta: dice QUALI test sono rossi')
        assert.ok(r.endsWith('Z'), 'la coda resta: dice PERCHE')
        assert.match(r, /caratteri tolti nel mezzo/,
            'un taglio silenzioso si legge come «era tutto qui»')
    })

    /*
     * ⭐⭐⭐ LE SEI MISURE VERE, e la domanda che contano: la cura le salva?
     *
     * Prese il 22/8 costruendo l area di lavoro vera di ogni task e lanciando il
     * SUO comando. `ultimo` e' il carattere dove cade l ultimo segnale d errore
     * (`AssertionError`, `FAIL `, `expected`, `Error:`) — cioe' la diagnosi.
     *
     * Col taglio di prima (primi 4.000) ne perdiamo QUATTRO su sei.
     */
    const MISURATE = [
        { id: 'storia-72e62cc', len: 3_988, ultimo: 3_310 },
        { id: 'storia-79ccedf', len: 6_297, ultimo: 5_821 },
        { id: 'storia-4333598', len: 9_317, ultimo: 8_797 },
        { id: 'storia-b489416', len: 1_967, ultimo: 1_550 },
        { id: 'storia-d254e20', len: 18_908, ultimo: 16_349 },
        { id: 'storia-e74da18', len: 4_667, ultimo: 4_115 },
    ]

    /** Il segnale sopravvive al taglio? Si guarda DOVE cade rispetto a cio' che si tiene. */
    function sopravvive({ len, ultimo }, tetto, quotaInTesta) {
        if (len <= tetto) return true
        const testa = Math.round(tetto * quotaInTesta)
        const inizioCoda = len - (tetto - testa)
        return ultimo < testa || ultimo >= inizioCoda
    }

    it('⛔ il taglio VECCHIO (solo testa) perde la diagnosi in 4 casi su 6', () => {
        const persi = MISURATE.filter((m) => m.len > 4_000 && m.ultimo >= 4_000)
        assert.equal(persi.length, 4,
            'e la misura che ha aperto questa leva: ' + persi.map((p) => p.id).join(', '))
    })

    it('⭐⭐ e la cura (testa+coda) li salva TUTTI E SEI, a parita di budget', () => {
        const persi = MISURATE.filter((m) => !sopravvive(m, 4_000, 0.25))
        assert.equal(persi.length, 0,
            'restano ciechi: ' + persi.map((p) => `${p.id} (segnale a ${p.ultimo} su ${p.len})`).join(' · '))
    })

    /*
     * ⛔ IL FALSIFICATORE DELLA CURA, e va scritto o la cura non e' scartabile.
     *
     * Se la quota in testa fosse troppo grande la coda si accorcia e i casi
     * lunghi tornano ciechi. Su `storia-d254e20` (segnale a 16.349 su 18.908) la
     * coda deve arrivare almeno a 2.559 caratteri ⇒ la testa non puo' superare
     * 1.441 su 4.000, cioe' il 36%.
     */
    it('⛔ e con una testa troppo generosa la cura TORNA CIECA — il suo falsificatore', () => {
        const persi = MISURATE.filter((m) => !sopravvive(m, 4_000, 0.6))
        assert.ok(persi.length > 0,
            'se nemmeno il 60% in testa acceca, questo test non sta guardando niente')
        assert.ok(persi.some((p) => p.id === 'storia-d254e20'),
            'il caso piu lungo e il primo a cadere')
    })
})

/*
 * ⭐⭐ IL PROMEMORIA "SCRITTURE SENZA PROVA" — nuovo il 23/8, non misurato.
 *
 * Non e' una funzione pura esportata (vive dentro il ciclo di `talosLavora`,
 * come contatore locale): qui si prova solo la regola dichiarata nel commento
 * sopra `SOGLIA_SCRITTURE_SENZA_PROVA` in `talosHarness.mjs`, cioe' che la
 * soglia sia 3 e non blocchi nulla — e' testo aggiunto al risultato di
 * `scrivi`, mai un rifiuto. Un test di integrazione sul ciclo intero
 * servirebbe una rete finta anche per `cerca`/`leggi`/`prova`: non c'era prima
 * di oggi e non lo si inventa qui solo per questo trapianto.
 */
describe('Il promemoria "scritture senza prova" — verifica di sola lettura', () => {
    it('la soglia dichiarata e 3, e il messaggio non e un rifiuto', async () => {
        const testo = await import('node:fs/promises')
            .then((fs) => fs.readFile(new URL('./talosHarness.mjs', import.meta.url), 'utf8'))
        assert.match(testo, /SOGLIA_SCRITTURE_SENZA_PROVA = 3/,
            'se questo numero cambia, va cambiato anche nella doc che lo giustifica')
        assert.doesNotMatch(testo.match(/scritture senza chiamare "prova"[^}]*/)[0], /REFUSED/,
            'e un avviso, non un cancello: non deve mai rifiutare la scrittura')
    })
})

/*
 * ⭐⭐⭐ STADIO A — LA COMPATTAZIONE. Piano `elegant-spinning-dongarra.md`, 23/8.
 *
 * Attacca "giri esauriti" ([[talos-esaurisce-i-giri-non-le-capacita]]): la
 * conversazione ricresce intera a ogni giro, quindi il costo e' quadratico.
 * Qui si prova che il TRIGGER scatta solo quando deve (mai al giro 0, mai su
 * un task corto) e che la SOSTITUZIONE preserva il compito originale parola
 * per parola — se lo riscrivesse, un riassunto impreciso cambierebbe il task
 * a meta' corsa, ed e' esattamente il guasto che questa cura non deve fare.
 */
describe('STADIO A — la compattazione della conversazione', () => {

    it('la stima dei token e allineata a circa 4 caratteri per token', () => {
        assert.equal(stimaToken('a'.repeat(40)), 10)
        assert.equal(stimaToken(''), 0)
        assert.equal(stimaToken(null), 0, 'un content assente non deve lanciare')
    })

    it('la stima della conversazione somma testo E argomenti delle chiamate attrezzo', () => {
        const messaggi = [
            { role: 'user', content: 'a'.repeat(40) },
            { role: 'assistant', tool_calls: [{ function: { arguments: 'b'.repeat(20) } }] },
        ]
        assert.equal(stimaTokenConversazione(messaggi), 10 + 5)
    })

    it('⛔ non compatta MAI al giro 0, anche con una conversazione enorme', () => {
        const messaggi = [{ role: 'user', content: 'x'.repeat(TOKEN_MINIMI_PER_COMPATTARE * 10) }]
        assert.equal(serveCompattare(0, messaggi), false)
    })

    it('⛔ non compatta fuori dai checkpoint, anche se la conversazione e grande', () => {
        const messaggi = [{ role: 'user', content: 'x'.repeat(TOKEN_MINIMI_PER_COMPATTARE * 10) }]
        assert.equal(serveCompattare(GIRI_PRIMA_DI_COMPATTARE - 1, messaggi), false,
            'un giro qualunque, non multiplo del checkpoint, non deve mai scattare')
    })

    it('⛔ su un checkpoint, ma con un task corto: NON compatta — non c e niente da riassumere', () => {
        const messaggi = [{ role: 'user', content: 'poca roba' }]
        assert.equal(serveCompattare(GIRI_PRIMA_DI_COMPATTARE, messaggi), false)
    })

    it('⭐ su un checkpoint E una conversazione grande: compatta', () => {
        const messaggi = [{ role: 'user', content: 'x'.repeat(TOKEN_MINIMI_PER_COMPATTARE * 5) }]
        assert.equal(serveCompattare(GIRI_PRIMA_DI_COMPATTARE, messaggi), true)
        assert.equal(serveCompattare(GIRI_PRIMA_DI_COMPATTARE * 2, messaggi), true,
            'ogni multiplo del checkpoint, non solo il primo')
    })

    const SISTEMA = { role: 'system', content: 'istruzioni' }
    const COMPITO = { role: 'user', content: 'il compito vero, parola per parola' }

    it('⭐⭐⭐ il riassunto sostituisce la storia, ma il COMPITO resta intatto', async () => {
        const storiaLunga = [SISTEMA, COMPITO,
            { role: 'assistant', content: 'ho provato X' },
            { role: 'tool', content: 'X non ha funzionato' }]
        const chiamaModello = async () => ({
            scelta: { content: 'ho provato X, non ha funzionato; i file sono a posto' },
            usage: { prompt_tokens: 500, completion_tokens: 50 },
        })
        const r = await compattaConversazione(storiaLunga, chiamaModello)

        assert.equal(r.compattato, true)
        assert.equal(r.messaggi.length, 3, 'sistema + compito + riassunto, non di piu')
        assert.deepEqual(r.messaggi[0], SISTEMA, 'il sistema non cambia MAI')
        assert.deepEqual(r.messaggi[1], COMPITO,
            'il compito resta PAROLA PER PAROLA — un riassunto impreciso non deve poter cambiare cosa si sta chiedendo')
        assert.match(r.messaggi[2].content, /ho provato X, non ha funzionato/,
            'il riassunto vero e in quel messaggio')
        assert.equal(r.usage.prompt_tokens, 500, 'il costo della chiamata di riassunto si conta')
    })

    it('⛔ un riassunto vuoto non compatta — meglio niente che un buco', async () => {
        const messaggi = [SISTEMA, COMPITO]
        const chiamaModello = async () => ({ scelta: { content: '   ' }, usage: null })
        const r = await compattaConversazione(messaggi, chiamaModello)
        assert.equal(r.compattato, false)
        assert.deepEqual(r.messaggi, messaggi, 'niente cambia se il riassunto e vuoto')
    })

    it('⛔ e AL CONTRARIO: una chiamata che lancia non deve fermare il task', async () => {
        const messaggi = [SISTEMA, COMPITO, { role: 'assistant', content: 'lavoro in corso' }]
        const chiamaModello = async () => { throw new Error('rete giu') }
        const r = await compattaConversazione(messaggi, chiamaModello)
        assert.equal(r.compattato, false)
        assert.equal(r.usage, null)
        assert.deepEqual(r.messaggi, messaggi,
            'un riassunto fallito lascia la conversazione com era: si riprovera al prossimo checkpoint')
    })
})

/*
 * ⭐ STADIO A — LA RIFLESSIONE, adattata da Live-SWE-agent senza il costo di
 * una chiamata in più (TALOS non ha margine: paga già 2,3× aider a task).
 * Cadenza diversa da quella della compattazione apposta, cosi' i due
 * checkpoint non coincidono sempre sullo stesso giro.
 */
describe('STADIO A — la riflessione (zero chiamate in piu)', () => {
    it('⛔ mai al giro 0', () => {
        assert.equal(serveRiflettere(0), false)
    })

    it('⛔ mai fuori dal checkpoint', () => {
        assert.equal(serveRiflettere(GIRI_PRIMA_DI_RIFLETTERE - 1), false)
        assert.equal(serveRiflettere(GIRI_PRIMA_DI_RIFLETTERE + 1), false)
    })

    it('⭐ scatta a ogni multiplo del checkpoint', () => {
        assert.equal(serveRiflettere(GIRI_PRIMA_DI_RIFLETTERE), true)
        assert.equal(serveRiflettere(GIRI_PRIMA_DI_RIFLETTERE * 2), true)
        assert.equal(serveRiflettere(GIRI_PRIMA_DI_RIFLETTERE * 3), true)
    })

    it('⭐⭐ la cadenza non coincide sempre con quella della compattazione', () => {
        assert.notEqual(GIRI_PRIMA_DI_RIFLETTERE, GIRI_PRIMA_DI_COMPATTARE,
            'due checkpoint identici sprecherebbero il vantaggio di averne due')
    })
})

/*
 * ⭐⭐⭐ IL CICLO INTERO, PER LA PRIMA VOLTA — piano `elegant-spinning-dongarra.md`,
 * §1.2/§1.6, 2026-08-24.
 *
 * ⛔ Prima di questi test, `talosLavora` (la funzione che il banco chiama
 * davvero) non aveva NESSUNA prova diretta: solo le sue funzioni pure
 * interne. Non era possibile provarla senza colpire la rete vera — mancava
 * un modo di iniettare un fetch finto. `fetchDiRete` esiste ORA solo per
 * questo: rendere provabile il ciclo, non per cambiarne il comportamento di
 * default (che resta `fetch` globale quando il parametro manca).
 *
 * `discoNode`/`cancelloSemantico` sono gli stessi del kernel vero — questi
 * test scrivono su una cartella temporanea reale, non su un disco finto:
 * un mock del filesystem qui proverebbe la nostra idea di come si comporta
 * il kernel, non il kernel stesso.
 */
describe('talosLavora — il ciclo intero, con una rete finta', () => {
    function cartellaVuota(t) {
        const radice = mkdtempSync(join(tmpdir(), 'talos-harness-lavora-'))
        t.after(() => rmSync(radice, { recursive: true, force: true }))
        return radice
    }

    /** Uno sportello finto che risponde con la sequenza di messaggi data, una per chiamata (l'ultima si ripete se le chiamate superano la sequenza). */
    function reteDiRisposte(...risposte) {
        const chiamate = []
        return {
            chiamate,
            fetch: async (url, opzioni) => {
                const indice = chiamate.length
                chiamate.push({ url, opzioni, corpo: JSON.parse(opzioni.body) })
                const scelta = risposte[Math.min(indice, risposte.length - 1)]
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        choices: [{ message: scelta }],
                        usage: { prompt_tokens: 10, completion_tokens: 5 },
                    }),
                    text: async () => '',
                }
            },
        }
    }

    const TASK = { consegna: 'un compito qualunque, per la prova' }
    const CONCLUSO_SUBITO = { role: 'assistant', content: 'fatto, nessun attrezzo serve', tool_calls: [] }

    it('⭐⭐⭐ PARITÀ: gli hook nuovi, presenti ma inerti, non cambiano un solo campo dell\'esito', async () => {
        const cartella = cartellaVuota(it)
        const reteA = reteDiRisposte(CONCLUSO_SUBITO)
        const reteB = reteDiRisposte(CONCLUSO_SUBITO)

        const senzaHook = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: reteA.fetch,
        })
        const conHookInerti = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: reteB.fetch,
            onGiro: () => {}, onScrittura: () => {},
        })

        assert.deepEqual(conHookInerti, senzaHook,
            'aggiungere ascoltatori non deve toccare un solo campo del risultato')
    })

    it('⭐⭐ onGiro riceve la risposta grezza del modello, con il numero di giro giusto', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CONCLUSO_SUBITO)
        const eventi = []

        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            onGiro: (e) => eventi.push(e),
        })

        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(eventi.length, 1, 'un solo giro, nessun attrezzo chiamato: un solo evento')
        assert.equal(eventi[0].tipo, 'risposta')
        assert.equal(eventi[0].giro, 0, 'il primo giro è 0, non 1')
        assert.equal(eventi[0].risposta.content, CONCLUSO_SUBITO.content,
            'onGiro porta la risposta VERA, non una copia riassunta')
    })

    /** SSE finto per un giro solo, per testare onDelta/reasoning fino in fondo a talosLavora. */
    function reteStreamingConclusaSubito() {
        const chiamate = []
        const eventiSSE = [
            { choices: [{ delta: { reasoning_content: 'Penso ' } }] },
            { choices: [{ delta: { reasoning_content: 'un attimo.' } }] },
            { choices: [{ delta: { content: 'fatto, nessun attrezzo serve' } }] },
        ]
        const testo = eventiSSE.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')
        return {
            chiamate,
            fetch: async (url, opzioni) => {
                chiamate.push({ url, opzioni, corpo: JSON.parse(opzioni.body) })
                return {
                    ok: true, status: 200,
                    body: new ReadableStream({
                        start(controller) {
                            controller.enqueue(new TextEncoder().encode(testo))
                            controller.close()
                        },
                    }),
                }
            },
        }
    }

    it('⭐⭐⭐ onDelta arriva DENTRO talosLavora, giro incluso, PRIMA che il giro sia concluso — e reasoning viaggia fino a OpenRouter', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteStreamingConclusaSubito()
        const eventi = []

        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            onDelta: (e) => eventi.push(e),
            reasoning: { effort: 'medium' },
        })

        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(rete.chiamate[0].corpo.stream, true)
        assert.deepEqual(rete.chiamate[0].corpo.reasoning, { effort: 'medium' })
        assert.deepEqual(eventi.map((e) => e.tipo), ['ragionamento', 'ragionamento', 'testo'])
        assert.ok(eventi.every((e) => e.giro === 0), 'ogni delta porta il numero di giro giusto, come onGiro')
    })

    it('⛔ e AL CONTRARIO: SENZA onDelta, talosLavora non chiede MAI streaming, nemmeno passando reasoning da solo', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CONCLUSO_SUBITO)

        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            reasoning: { effort: 'medium' }, // presente, ma onDelta manca — chiamaIlModelloConRitenta legge onDelta per decidere stream
        })

        assert.equal(esito.comeFinita, 'concluso')
        assert.equal('stream' in rete.chiamate[0].corpo, false,
            'reasoning da solo non basta a chiedere streaming: serve onDelta, altrimenti nessuno consumerebbe l SSE')
    })

    it('⛔⛔ segnaleStop già attivo ferma PRIMA di chiamare la rete, e l\'esito è "fermato" (mai "concluso")', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CONCLUSO_SUBITO)
        const controller = new AbortController()
        controller.abort()

        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            segnaleStop: controller.signal,
        })

        assert.equal(esito.comeFinita, 'fermato')
        assert.equal(rete.chiamate.length, 0,
            'il controllo è PRIMA della chiamata: zero traffico dopo lo stop')
        assert.match(esito.detto, /interrotto su richiesta/)
    })

    it('⭐⭐⭐ messaggiIniziali sostituisce [sistema, compito]: la PRIMA richiesta alla rete lo dimostra', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CONCLUSO_SUBITO)
        const storiaDiRipresa = [
            { role: 'system', content: 'istruzioni' },
            { role: 'user', content: 'il compito originale' },
            { role: 'assistant', content: 'riassunto di una sessione precedente' },
        ]

        await talosLavora({
            cartella, task: { consegna: 'MAI dovrebbe apparire nella richiesta' },
            modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            messaggiIniziali: storiaDiRipresa,
        })

        assert.deepEqual(rete.chiamate[0].corpo.messages, storiaDiRipresa,
            'la ripresa deve ripartire ESATTAMENTE da dove l\'ha lasciata, non dal compito di default')
    })

    it('⭐ onScrittura si attiva su una "scrivi" che il cancello semantico approva, e dice esisteva:false su un file mai visto prima', async () => {
        const cartella = cartellaVuota(it)
        const SCRIVE_UN_FILE = {
            role: 'assistant',
            content: '',
            tool_calls: [{
                id: 'call_1',
                function: {
                    name: 'scrivi',
                    arguments: JSON.stringify({ percorso: 'nuovo.txt', contenuto: 'contenuto semplice, autonomo' }),
                },
            }],
        }
        const rete = reteDiRisposte(SCRIVE_UN_FILE, CONCLUSO_SUBITO)
        const scritture = []

        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            onScrittura: (percorso, contenuto, esisteva, contenutoPrima) => scritture.push({ percorso, contenuto, esisteva, contenutoPrima }),
        })

        assert.equal(esito.premesseNegate, 0, 'un file nuovo e autonomo non deve essere respinto dal cancello')
        assert.deepEqual(scritture, [{ percorso: 'nuovo.txt', contenuto: 'contenuto semplice, autonomo', esisteva: false, contenutoPrima: null }],
            'un file MAI esistito non ha un "prima" da mostrare in un diff: null, non una stringa vuota inventata')
    })

    it('⭐⭐⭐ e AL CONTRARIO: onScrittura dice esisteva:true su un file GIÀ su disco, toccato per la prima volta in questa sessione — il difetto del pannello Review, 27/8', async () => {
        const cartella = cartellaVuota(it)
        writeFileSync(join(cartella, 'gia-presente.txt'), 'versione originale, mai vista da questa sessione')
        const RISCRIVE_UN_FILE_ESISTENTE = {
            role: 'assistant',
            content: '',
            tool_calls: [{
                id: 'call_1',
                function: {
                    name: 'scrivi',
                    arguments: JSON.stringify({ percorso: 'gia-presente.txt', contenuto: 'versione aggiornata' }),
                },
            }],
        }
        const rete = reteDiRisposte(RISCRIVE_UN_FILE_ESISTENTE, CONCLUSO_SUBITO)
        const scritture = []

        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            onScrittura: (percorso, contenuto, esisteva, contenutoPrima) => scritture.push({ percorso, contenuto, esisteva, contenutoPrima }),
        })

        assert.equal(esito.premesseNegate, 0)
        assert.deepEqual(scritture, [{
            percorso: 'gia-presente.txt', contenuto: 'versione aggiornata', esisteva: true,
            contenutoPrima: 'versione originale, mai vista da questa sessione',
        }], 'una approssimazione per-sessione (mai visto PRIMA in questo run) direbbe false qui: sbagliato, il file era già sul disco — e contenutoPrima è il testo VERO che c\'era, non solo un booleano, il pezzo che serve a un diff riga per riga')
    })

    it('⭐⭐⭐ e AL CONTRARIO: una SECONDA scrittura nello stesso giro porta il "prima" VERO del disco (quanto scritto dalla prima), non il testo di prima della sessione — 27/8', async () => {
        /*
         * ⛔ `contenutoPrima` si legge da disco a ogni scrittura, non dalla
         * cache in memoria (`spazio.sorgenti`, popolata una sola volta a inizio
         * giro). Se leggesse quella cache invece del disco vero, una riscrittura
         * successiva nello STESSO run mostrerebbe come "prima" il contenuto
         * originale pre-sessione anche alla seconda scrittura — un diff falso,
         * che confronterebbe la versione 2 con la versione 0 invece che con la 1.
         */
        const cartella = cartellaVuota(it)
        writeFileSync(join(cartella, 'due-versioni.txt'), 'versione 0, pre-sessione')
        const PRIMA_SCRITTURA = {
            role: 'assistant', content: '',
            tool_calls: [{
                id: 'call_1',
                function: { name: 'scrivi', arguments: JSON.stringify({ percorso: 'due-versioni.txt', contenuto: 'versione 1' }) },
            }],
        }
        const SECONDA_SCRITTURA = {
            role: 'assistant', content: '',
            tool_calls: [{
                id: 'call_2',
                function: { name: 'scrivi', arguments: JSON.stringify({ percorso: 'due-versioni.txt', contenuto: 'versione 2' }) },
            }],
        }
        const rete = reteDiRisposte(PRIMA_SCRITTURA, SECONDA_SCRITTURA, CONCLUSO_SUBITO)
        const scritture = []

        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            onScrittura: (_percorso, contenuto, _esisteva, contenutoPrima) => scritture.push({ contenuto, contenutoPrima }),
        })

        assert.equal(esito.premesseNegate, 0)
        assert.deepEqual(scritture, [
            { contenuto: 'versione 1', contenutoPrima: 'versione 0, pre-sessione' },
            { contenuto: 'versione 2', contenutoPrima: 'versione 1' },
        ], 'la seconda scrittura deve mostrare "versione 1" come prima, non "versione 0" — il disco vero, non la cache di inizio giro')
    })

    it('⛔⛔⛔ e il cancello semantico REALMENTE blocca — mai provato prima: una funzione inventata è respinta, zero scritture — 27/8', async () => {
        /*
         * ⛔ Fino a oggi nessun test verificava `premesseNegate > 0`: ogni test
         * su `onScrittura`/`scrivi` controllava solo che una scrittura LEGITTIMA
         * passasse. Un cancello inerte (rotto da `libreriaStandard()` chiamata
         * senza il suo argomento — vedi la doc sopra `premessaDellaScrittura`)
         * superava quella prova esattamente come uno vero: `premesseNegate`
         * resta 0 sia che il cancello funzioni sia che sia spento. Questo test
         * prova il VERSO CONTRARIO, con lo stesso caso già provato a livello di
         * sorgente in `mobile/tests/unit/kernel/semantica.test.ts` (chiamare una
         * funzione che non esiste da nessuna parte).
         */
        const cartella = cartellaVuota(it)
        const SCRIVE_CODICE_ROTTO = {
            role: 'assistant',
            content: '',
            tool_calls: [{
                id: 'call_1',
                function: {
                    name: 'scrivi',
                    arguments: JSON.stringify({
                        percorso: 'uso.ts',
                        contenuto: 'export const x = funzioneCheNonEsisteDavvero(10)\n',
                    }),
                },
            }],
        }
        const rete = reteDiRisposte(SCRIVE_CODICE_ROTTO, CONCLUSO_SUBITO)
        const scritture = []

        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            onScrittura: (percorso, contenuto, esisteva) => scritture.push({ percorso, contenuto, esisteva }),
        })

        assert.equal(esito.premesseNegate, 1, 'una funzione inventata deve essere respinta esattamente una volta')
        assert.deepEqual(scritture, [], 'un rifiuto non chiama MAI onScrittura: niente è finito sul disco')
        const messaggioDelTool = esito.messaggiFinali.find((m) => m.role === 'tool')
        assert.match(messaggioDelTool.content, /REFUSED/)
        assert.match(messaggioDelTool.content, /funzioneCheNonEsisteDavvero/,
            'il motivo deve nominare il riferimento mancante, non un rifiuto generico')
    })

    it('⭐⭐⭐ 28/8, FASE D — la STESSA corsa emette una ricevuta status:\'premise_absent\', non \'denied\': il permesso era concesso, il cancello semantico ha bloccato dopo', async () => {
        const cartella = cartellaVuota(it)
        const SCRIVE_CODICE_ROTTO = {
            role: 'assistant', content: '',
            tool_calls: [{
                id: 'call_1',
                function: {
                    name: 'scrivi',
                    arguments: JSON.stringify({ percorso: 'uso.ts', contenuto: 'export const x = funzioneCheNonEsisteDavvero(10)\n' }),
                },
            }],
        }
        const rete = reteDiRisposte(SCRIVE_CODICE_ROTTO, CONCLUSO_SUBITO)
        const ricevute = []
        await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            onGiro(e) { if (e.tipo === 'ricevuta') ricevute.push(e.ricevuta) },
        })
        assert.equal(ricevute.length, 1)
        assert.equal(ricevute[0].consentito, true, 'il PERMESSO era concesso — nessun livelloAccesso/permessiPerAttrezzo che lo neghi')
        assert.equal(ricevute[0].status, 'premise_absent', 'ma il cancello semantico ha bloccato DOPO: e un fatto diverso da denied')
        assert.equal(ricevute[0].hashContenuto, null, 'niente e stato scritto per davvero')
    })

    it('⭐⭐⭐ messaggiFinali porta la conversazione INTERA, non solo il testo per una persona — piano §1.4, 24/8', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CONCLUSO_SUBITO)

        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
        })

        assert.ok(Array.isArray(esito.messaggiFinali))
        assert.equal(esito.messaggiFinali.length, 3, 'sistema + compito + la risposta del modello, niente di piu')
        assert.equal(esito.messaggiFinali[0].role, 'system')
        assert.ok(esito.messaggiFinali[0].content.length > 0, 'le istruzioni di sistema non sono vuote')
        assert.deepEqual(esito.messaggiFinali[1], { role: 'user', content: TASK.consegna })
        assert.deepEqual(esito.messaggiFinali[2], CONCLUSO_SUBITO)
    })

    it('⭐⭐ e il VERSO CONTRARIO: ripartendo da messaggiIniziali, messaggiFinali li estende, non li sostituisce', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CONCLUSO_SUBITO)
        const storiaDiRipresa = [
            { role: 'system', content: 'istruzioni' },
            { role: 'user', content: 'il compito originale' },
            { role: 'assistant', content: 'riassunto di una sessione precedente' },
        ]

        const esito = await talosLavora({
            cartella, task: { consegna: 'MAI dovrebbe apparire' }, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            messaggiIniziali: storiaDiRipresa,
        })

        assert.deepEqual(esito.messaggiFinali, [...storiaDiRipresa, CONCLUSO_SUBITO],
            'i tre messaggi di ripresa restano in testa, intatti, con solo il nuovo giro appeso in coda')
    })
})

/*
 * ⭐⭐⭐ 28/8 — trovato ispezionando il repo di Hermes Agent (owner:
 * "ispeziona doc e repo e progetto Hermes... e migliorarlo tutti"):
 * `ambienteSenzaCredenziali()` è la funzione pura dietro lo scrub delle
 * credenziali sui tre `spawn()`/`eseguiComando` di questo file — testata
 * qui in isolamento (deterministica, zero processo reale). La prova che
 * conta per davvero — un comando VERO non vede la chiave — è live sotto,
 * un vero `node -e` spawnato con `spawn` reale, stesso principio "si
 * strumenta sempre" per un fix di sicurezza.
 */
describe('ambienteSenzaCredenziali — lo scrub delle credenziali passate ai sottoprocessi', () => {
    it('⭐⭐⭐ toglie OPENROUTER_API_KEY, preserva tutto il resto', () => {
        const originale = { ...process.env, OPENROUTER_API_KEY: 'sk-vera-non-deve-uscire', ALTRA_VARIABILE: 'resta' }
        const vecchioValore = process.env.OPENROUTER_API_KEY
        process.env.OPENROUTER_API_KEY = 'sk-vera-non-deve-uscire'
        process.env.ALTRA_VARIABILE = 'resta'
        try {
            const pulito = ambienteSenzaCredenziali()
            assert.equal(pulito.OPENROUTER_API_KEY, undefined)
            assert.equal(pulito.ALTRA_VARIABILE, 'resta')
            assert.equal(Object.keys(pulito).length, Object.keys(originale).length - 1,
                'solo la credenziale è tolta, nessuna altra chiave sparisce per errore')
        } finally {
            if (vecchioValore === undefined) delete process.env.OPENROUTER_API_KEY
            else process.env.OPENROUTER_API_KEY = vecchioValore
            delete process.env.ALTRA_VARIABILE
        }
    })

    it('⛔⛔ AL CONTRARIO — senza la credenziale mai impostata, il risultato è identico a process.env (nessuna chiave inventata, nessuna altra tolta)', () => {
        delete process.env.OPENROUTER_API_KEY
        const pulito = ambienteSenzaCredenziali()
        assert.deepEqual(Object.keys(pulito).sort(), Object.keys(process.env).sort())
    })

    it('⭐ CHIAVI_CREDENZIALI_DA_NASCONDERE contiene esattamente il nome vero usato altrove in questo ecosistema (provaTalos.mjs, harness-ui/src/config.mjs)', () => {
        assert.deepEqual(CHIAVI_CREDENZIALI_DA_NASCONDERE, ['OPENROUTER_API_KEY'])
    })

    it('⭐⭐⭐ DAL VIVO — un vero sottoprocesso spawnato con questo ambiente NON vede la chiave, anche se il processo padre (questo test) la possiede', async () => {
        const { spawn } = await import('node:child_process')
        const vecchioValore = process.env.OPENROUTER_API_KEY
        process.env.OPENROUTER_API_KEY = 'sk-una-chiave-vera-di-prova'
        try {
            const output = await new Promise((risolvi, rifiuta) => {
                const p = spawn(process.execPath, ['-e', 'process.stdout.write(process.env.OPENROUTER_API_KEY || "ASSENTE")'],
                    { env: ambienteSenzaCredenziali() })
                let fuori = ''
                p.stdout.on('data', (d) => { fuori += d })
                p.on('close', () => risolvi(fuori))
                p.on('error', rifiuta)
            })
            assert.equal(output, 'ASSENTE', 'il figlio non deve MAI vedere la chiave vera, nemmeno se il padre (questo test) ce l\'ha')
        } finally {
            if (vecchioValore === undefined) delete process.env.OPENROUTER_API_KEY
            else process.env.OPENROUTER_API_KEY = vecchioValore
        }
    })
})

/*
 * ⭐⭐⭐ L'attrezzo `shell` — piano `elegant-spinning-dongarra.md`, §1.3-BIS.T.
 * Solo le due funzioni pure: `distroWslPredefinita`/`programmaDisponibileInWsl`/
 * `eseguiComandoSandboxato` toccano processi veri (wsl.exe, spawn) — stesso
 * limite già accettato per `eseguiProva`, mai testata a unità in questo file,
 * verificata invece dal vivo (vedi il piano, sezione verifica). Non un buco
 * silenzioso: una scelta, la stessa già fatta per `eseguiProva`.
 */
describe('primoProgramma — il primo token di un comando', () => {
    it('⭐ "npm test" -> "npm"', () => {
        assert.equal(primoProgramma('npm test'), 'npm')
    })

    it('⭐ un singolo programma senza argomenti', () => {
        assert.equal(primoProgramma('ls'), 'ls')
    })

    it('⭐ spazi in testa e in coda non contano', () => {
        assert.equal(primoProgramma('  node --version  '), 'node')
    })

    it('⛔ e AL CONTRARIO: una stringa vuota non lancia, torna vuota', () => {
        assert.equal(primoProgramma(''), '')
    })
})

describe('convertiPercorsoWsl — il percorso Windows nel mount WSL2', () => {
    it('⭐ il caso reale, misurato il 27/8 su questa macchina', () => {
        assert.equal(
            convertiPercorsoWsl('C:\\Users\\Antonino\\AppData\\Local\\Temp\\banco-iva-XTnAO2'),
            '/mnt/c/Users/Antonino/AppData/Local/Temp/banco-iva-XTnAO2',
        )
    })

    it('⭐⭐ la lettera di unità diventa minuscola: il mount WSL2 la vuole così', () => {
        assert.equal(convertiPercorsoWsl('D:\\progetti\\foo'), '/mnt/d/progetti/foo')
    })

    it('⛔ e AL CONTRARIO: il resto del percorso NON perde le maiuscole — solo la lettera di unità cambia', () => {
        const risultato = convertiPercorsoWsl('C:\\Users\\Antonino\\Progetti')
        assert.equal(risultato, '/mnt/c/Users/Antonino/Progetti',
            'un percorso minuscolizzato per intero punterebbe a una cartella che non esiste su un filesystem case-sensitive')
    })
})

/*
 * ⭐⭐⭐ FIX-1, ledger FASE-3 §6-quater (28/8) — dove finisce il mirror
 * scrivibile di `cartella` sul telefono. Solo la parte pura: la funzione
 * tocca solo una stringa, non `adb` — stesso limite già accettato sopra
 * per convertiPercorsoWsl/eseguiComandoSandboxato (verificato dal vivo:
 * TALOS-BANCO/rifai-livello-3-runtime-vero.json e il ledger FASE 3).
 */
describe('percorsoMirrorDevice — dove il mirror del task finisce sul telefono', () => {
    it('⭐ un caso reale, lo stesso pattern usato da preparaCopia in TALOS-BANCO', () => {
        assert.equal(
            percorsoMirrorDevice('C:\\Users\\Antonino\\AppData\\Local\\Temp\\banco-iva-XTnAO2'),
            '/data/local/tmp/talos-mobile/banco-iva-XTnAO2',
        )
    })

    it('⛔ e AL CONTRARIO: due cartelle con nome diverso NON collidono sullo stesso mirror', () => {
        const a = percorsoMirrorDevice('C:\\Users\\Antonino\\AppData\\Local\\Temp\\banco-iva-AAAA')
        const b = percorsoMirrorDevice('C:\\Users\\Antonino\\AppData\\Local\\Temp\\banco-iva-BBBB')
        assert.notEqual(a, b, 'due task in corso nello stesso momento finirebbero a scriversi addosso sul device')
    })
})

/*
 * ⭐⭐⭐ Ledger permessi §7.C, 28/8 — il floor incondizionato minimo,
 * sotto-insieme "hardline" di Hermes. Pura, un pattern per riga del
 * sotto-insieme dichiarato — non pretende difese anti-elusione.
 */
describe('comandoSenzaRecupero — il floor incondizionato, un pattern per riga dichiarata', () => {
    it('⭐ i cinque casi diretti, uno per pattern', () => {
        assert.match(comandoSenzaRecupero('rm -rf /') ?? '', /cancellazione ricorsiva/)
        assert.match(comandoSenzaRecupero('mkfs.ext4 /dev/sda1') ?? '', /formattazione/)
        assert.match(comandoSenzaRecupero('dd if=/dev/zero of=/dev/sda') ?? '', /device a blocchi/)
        assert.match(comandoSenzaRecupero(':(){ :|:& };:') ?? '', /fork bomb/)
        assert.match(comandoSenzaRecupero('shutdown -h now') ?? '', /spegnimento/)
    })

    it('⛔ e AL CONTRARIO: un comando innocuo, o uno che TOCCA solo un sotto-percorso, non è bloccato', () => {
        assert.equal(comandoSenzaRecupero('npm test'), null)
        assert.equal(comandoSenzaRecupero('rm -rf ./dist'), null, 'cancella una sottocartella, non la radice')
        assert.equal(comandoSenzaRecupero('git status'), null)
    })
})

/*
 * ⭐⭐⭐ FASE D (kernel headless), primo incremento, 28/8 — la ricevuta
 * d'operazione adattata da "Agent Action Receipts" (ricerca 28/8).
 * Pura: nessun I/O, testata da sola come le altre funzioni pure sopra.
 */
describe('creaRicevutaOperazione — FASE D, il mattone condiviso per la ricevuta universale', () => {
    it('⭐⭐⭐ una scrittura consentita: hash reale del contenuto, via tracciata', () => {
        const ricevuta = creaRicevutaOperazione({
            azione: { tipo: 'scrivi', percorso: 'src/x.mjs' },
            toolCallId: 'call_1',
            esitoPermesso: { consentito: true, via: 'nessun-vincolo' },
            contenutoScritto: 'export const x = 1\n',
        })
        assert.equal(ricevuta.azione, 'scrivi')
        assert.equal(ricevuta.percorso, 'src/x.mjs')
        assert.equal(ricevuta.toolCallId, 'call_1')
        assert.equal(ricevuta.consentito, true)
        assert.equal(ricevuta.via, 'nessun-vincolo')
        assert.equal(ricevuta.hashContenuto, createHash('sha256').update('export const x = 1\n').digest('hex'))
        // ⭐⭐⭐ 28/8, allineato a TalosToolAuditRow (mobile): status/risk, non solo consentito/via.
        assert.equal(ricevuta.status, 'succeeded')
        assert.equal(ricevuta.risk, 'R1', 'scrivi tocca solo il workspace del task, come document_create sul mobile (R1)')
    })

    it('⛔⛔⛔ e AL CONTRARIO: un\'operazione RIFIUTATA porta hashContenuto:null, mai l\'hash di una stringa vuota spacciato per "niente prodotto"', () => {
        const ricevuta = creaRicevutaOperazione({
            azione: { tipo: 'scrivi', percorso: 'src/x.mjs' },
            toolCallId: 'call_2',
            esitoPermesso: { consentito: false, via: 'livello-lettura', motivo: 'la sessione è in sola lettura...' },
            contenutoScritto: null,
        })
        assert.equal(ricevuta.consentito, false)
        assert.equal(ricevuta.via, 'livello-lettura')
        assert.equal(ricevuta.hashContenuto, null)
        assert.notEqual(ricevuta.hashContenuto, createHash('sha256').update('').digest('hex'), 'null e l\'hash di una stringa vuota sono due fatti diversi')
        assert.equal(ricevuta.status, 'denied')
    })

    it('⭐⭐ un comando shell (nessun contenuto testuale prodotto): azione/comando tracciati, hashContenuto resta null, risk R2', () => {
        const ricevuta = creaRicevutaOperazione({
            azione: { tipo: 'shell', comando: 'npm test' },
            toolCallId: 'call_3',
            esitoPermesso: { consentito: true, via: 'nessun-vincolo' },
            contenutoScritto: null,
        })
        assert.equal(ricevuta.azione, 'shell')
        assert.equal(ricevuta.comando, 'npm test')
        assert.equal(ricevuta.percorso, null)
        assert.equal(ricevuta.hashContenuto, null)
        assert.equal(ricevuta.status, 'succeeded')
        assert.equal(ricevuta.risk, 'R2', 'shell ha portata piu ampia di scrivi/prova/document_create, come web_search/local_model_download sul mobile')
    })

    it('⛔⛔⛔ AL CONTRARIO — status:\'premise_absent\' quando il cancello semantico rifiuta (distinto da \'denied\': il runtime non ha nemmeno chiesto)', () => {
        const ricevuta = creaRicevutaOperazione({
            azione: { tipo: 'scrivi', percorso: 'src/inesistente.mjs' },
            toolCallId: 'call_4',
            esitoPermesso: { consentito: true, via: 'nessun-vincolo' }, // il PERMESSO era concesso...
            contenutoScritto: null, // ...ma il cancello semantico ha bloccato prima di scrivere
            premessaAssente: true,
        })
        assert.equal(ricevuta.status, 'premise_absent')
        assert.notEqual(ricevuta.status, 'denied', 'denied e premise_absent sono due fatti diversi: chi ha detto no, la persona o il runtime che non ha nemmeno chiesto')
    })

    it('⛔⛔⛔ AL CONTRARIO — risk:\'R4\' SOLO quando il floor SS7.C ha bloccato, non per ogni shell rifiutata', () => {
        const bloccatoDalFloor = creaRicevutaOperazione({
            azione: { tipo: 'shell', comando: 'rm -rf /' },
            toolCallId: 'call_5',
            esitoPermesso: { consentito: false, via: 'floor-comando-senza-recupero', motivo: 'cancellazione ricorsiva della radice' },
            contenutoScritto: null,
        })
        assert.equal(bloccatoDalFloor.risk, 'R4')

        const rifiutatoPerAltro = creaRicevutaOperazione({
            azione: { tipo: 'shell', comando: 'npm test' },
            toolCallId: 'call_6',
            esitoPermesso: { consentito: false, via: 'livello-lettura', motivo: 'la sessione è in sola lettura...' },
            contenutoScritto: null,
        })
        assert.equal(rifiutatoPerAltro.risk, 'R2', 'un rifiuto qualunque non e automaticamente R4 — solo il floor lo e')
    })

    /*
     * ⭐⭐⭐ 29/8, continuazione FASE D — `evidence`, il campo nuovo di questo
     * incremento. Stessa disciplina delle prove sopra: un valore reale passa
     * intatto, l'assenza e null (mai undefined — la differenza sopravvive a
     * JSON.stringify, e questa ricevuta e destinata a diventare log/ledger).
     */
    it('⭐⭐⭐ evidence: un payload reale (shell, exitCode 0 incluso) passa intatto, senza perdere il valore falsy', () => {
        const ricevuta = creaRicevutaOperazione({
            azione: { tipo: 'shell', comando: 'npm test' },
            toolCallId: 'call_7',
            esitoPermesso: { consentito: true, via: 'nessun-vincolo' },
            contenutoScritto: null,
            // ⛔ exitCode:0 e' il caso che tradisce un `valore || null` invece
            // di un vero controllo di presenza: 0 e' falsy in JS ma e' un
            // successo vero, non un'assenza di dato.
            evidence: { exitCode: 0, sandboxEnforcement: 'adb-shell-on-device' },
        })
        assert.deepEqual(ricevuta.evidence, { exitCode: 0, sandboxEnforcement: 'adb-shell-on-device' })
    })

    it('⛔⛔⛔ e AL CONTRARIO — evidence omesso resta null, mai undefined (sparisce da un JSON.stringify, un null no)', () => {
        const ricevuta = creaRicevutaOperazione({
            azione: { tipo: 'document_create' },
            toolCallId: 'call_8',
            esitoPermesso: { consentito: true, via: 'nessun-vincolo' },
            contenutoScritto: null,
            // nessun campo evidence passato — il caso reale di document_create oggi
        })
        assert.equal(ricevuta.evidence, null)
        assert.equal(JSON.parse(JSON.stringify(ricevuta)).evidence, null, 'un null sopravvive alla serializzazione, un campo assente/undefined sparirebbe e basterebbe a nascondere la differenza')
    })

    it('⛔⛔ evidence: null esplicito (permesso negato prima che il comando partisse) resta null, non un oggetto vuoto inventato', () => {
        const ricevuta = creaRicevutaOperazione({
            azione: { tipo: 'prova', comando: 'npm run test' },
            toolCallId: 'call_9',
            esitoPermesso: { consentito: false, via: 'livello-lettura', motivo: 'la sessione è in sola lettura...' },
            contenutoScritto: null,
            evidence: null,
        })
        assert.equal(ricevuta.evidence, null)
        assert.notDeepEqual(ricevuta.evidence, {}, 'null e {} sono due fatti diversi: "nessun dato" non e "un oggetto senza campi"')
    })

    /*
     * ⭐⭐⭐ 29/8, continuazione FASE D — `status:'failed'`, il primo dei 3
     * stati mancanti dichiarati nella §Stato del ledger. Precedenza: denied
     * e premise_absent si decidono PRIMA che l'attrezzo giri (vedi
     * `TalosToolAuditRow`, `executor.ts`), quindi vincono sempre su
     * esecuzioneFallita — non possono mai coesistere per costruzione, ma la
     * funzione pura non lo sa da sola: si prova esplicitamente.
     */
    it('⭐⭐⭐ esecuzioneFallita:true, permesso concesso, nessuna premessa assente → status:\'failed\'', () => {
        const ricevuta = creaRicevutaOperazione({
            azione: { tipo: 'scrivi', percorso: 'src/x.mjs' },
            toolCallId: 'call_10',
            esitoPermesso: { consentito: true, via: 'nessun-vincolo' },
            contenutoScritto: null,
            esecuzioneFallita: true,
        })
        assert.equal(ricevuta.status, 'failed')
        assert.equal(ricevuta.consentito, true, 'failed non e denied: il permesso VERO era stato concesso, poi l\'esecuzione si e rotta dopo')
    })

    it('⛔⛔⛔ AL CONTRARIO — esecuzioneFallita:true MA il permesso era negato → status resta \'denied\', mai \'failed\'', () => {
        const ricevuta = creaRicevutaOperazione({
            azione: { tipo: 'shell', comando: 'npm test' },
            toolCallId: 'call_11',
            esitoPermesso: { consentito: false, via: 'livello-lettura', motivo: 'la sessione è in sola lettura...' },
            contenutoScritto: null,
            esecuzioneFallita: true,
        })
        assert.equal(ricevuta.status, 'denied', 'denied vince sempre: un attrezzo mai partito non puo essere "fallito in esecuzione"')
    })

    it('⛔⛔⛔ AL CONTRARIO — esecuzioneFallita:true MA la premessa era assente → status resta \'premise_absent\', mai \'failed\'', () => {
        const ricevuta = creaRicevutaOperazione({
            azione: { tipo: 'scrivi', percorso: 'src/inesistente.mjs' },
            toolCallId: 'call_12',
            esitoPermesso: { consentito: true, via: 'nessun-vincolo' },
            contenutoScritto: null,
            premessaAssente: true,
            esecuzioneFallita: true,
        })
        assert.equal(ricevuta.status, 'premise_absent', 'il cancello semantico ha gia fermato tutto: non e mai arrivato a "eseguire e fallire"')
    })

    it('⭐⭐ PARITÀ — esecuzioneFallita assente (default false) produce lo stesso esito di prima di questo incremento', () => {
        const ricevuta = creaRicevutaOperazione({
            azione: { tipo: 'scrivi', percorso: 'src/x.mjs' },
            toolCallId: 'call_13',
            esitoPermesso: { consentito: true, via: 'nessun-vincolo' },
            contenutoScritto: 'export const x = 1\n',
        })
        assert.equal(ricevuta.status, 'succeeded')
    })

    /*
     * ⭐⭐⭐ 29/8, continuazione FASE D — `postcondizione`, la seconda metà
     * dei campi mancanti. Precedenza rispetto a `esecuzioneFallita`: uno
     * `smentita` produce LO STESSO status ('failed') per una ragione
     * diversa — la difesa ha morso, non un'eccezione — e lo status da
     * solo non distingue i due casi: e' `postcondizione` a farlo.
     */
    it('⭐⭐⭐ postcondizione:\'retta\' → verified:true, status resta \'succeeded\'', () => {
        const ricevuta = creaRicevutaOperazione({
            azione: { tipo: 'scrivi', percorso: 'src/x.mjs' },
            toolCallId: 'call_14',
            esitoPermesso: { consentito: true, via: 'nessun-vincolo' },
            contenutoScritto: 'ciao',
            postcondizione: 'retta',
        })
        assert.equal(ricevuta.status, 'succeeded')
        assert.equal(ricevuta.postcondizione, 'retta')
        assert.equal(ricevuta.verified, true)
    })

    it('⛔⛔⛔ AL CONTRARIO — postcondizione:\'smentita\' DEGRADA a status:\'failed\', verified:false', () => {
        const ricevuta = creaRicevutaOperazione({
            azione: { tipo: 'scrivi', percorso: 'src/x.mjs' },
            toolCallId: 'call_15',
            esitoPermesso: { consentito: true, via: 'nessun-vincolo' },
            contenutoScritto: 'ciao',
            postcondizione: 'smentita',
        })
        assert.equal(ricevuta.status, 'failed', 'un successo dichiarato che non regge e\' un fallimento, stessa parola di un\'eccezione')
        assert.equal(ricevuta.postcondizione, 'smentita')
        assert.equal(ricevuta.verified, false, '"la difesa ha morso" si dice esplicitamente, non si lascia assente')
    })

    it('⛔⛔⛔ AL CONTRARIO — postcondizione:\'ignota\' produce status:\'effect_unknown\', MAI \'failed\'', () => {
        const ricevuta = creaRicevutaOperazione({
            azione: { tipo: 'scrivi', percorso: 'src/x.mjs' },
            toolCallId: 'call_16',
            esitoPermesso: { consentito: true, via: 'nessun-vincolo' },
            contenutoScritto: 'ciao',
            postcondizione: 'ignota',
        })
        assert.equal(ricevuta.status, 'effect_unknown', 'dire "fallito" qui farebbe ripetere una scrittura forse gia avvenuta — il doppione')
        assert.notEqual(ricevuta.status, 'failed')
        assert.equal(ricevuta.postcondizione, 'ignota')
        assert.equal(ricevuta.verified, null, 'incertezza genuina: ne vero ne falso, non si inventa un verdetto')
    })

    it('⭐⭐ PARITÀ — postcondizione assente (default \'nessuna\') → verified:null, status invariato', () => {
        const ricevuta = creaRicevutaOperazione({
            azione: { tipo: 'shell', comando: 'npm test' },
            toolCallId: 'call_17',
            esitoPermesso: { consentito: true, via: 'nessun-vincolo' },
            contenutoScritto: null,
        })
        assert.equal(ricevuta.postcondizione, 'nessuna', 'valore esplicito, non un placeholder — TalosToolAuditRow lo scrive alla lettera')
        assert.equal(ricevuta.verified, null)
        assert.equal(ricevuta.status, 'succeeded')
    })

    it('⛔⛔⛔ AL CONTRARIO — denied vince SEMPRE su postcondizione, anche se \'smentita\'', () => {
        const ricevuta = creaRicevutaOperazione({
            azione: { tipo: 'scrivi', percorso: 'src/x.mjs' },
            toolCallId: 'call_18',
            esitoPermesso: { consentito: false, via: 'livello-lettura', motivo: 'la sessione è in sola lettura...' },
            contenutoScritto: null,
            postcondizione: 'smentita',
        })
        assert.equal(ricevuta.status, 'denied', 'un attrezzo mai partito non ha nulla da verificare, qualunque valore arrivi in postcondizione')
    })
})

/*
 * ⭐⭐⭐ 29/8 — `postcondizioneDiScrivi`, isolata dalla sua chiamante. A
 * differenza di `talosLavora` (dove `disco` e' sempre `discoNode()` vero,
 * non iniettabile — vedi discoNode.ts), questa funzione prende `disco`
 * come parametro ESPLICITO: e' il punto giusto per provare 'smentita'/
 * 'ignota' senza inventare una race condition sul filesystem reale.
 */
describe('postcondizioneDiScrivi — la rilettura vera, isolata dal suo chiamante', () => {
    it('⭐⭐⭐ il contenuto riletto combacia → retta', async () => {
        const discoChe = { leggi: async () => 'contenuto vero' }
        const verdetto = await postcondizioneDiScrivi(discoChe, 'x.txt', 'contenuto vero')
        assert.deepEqual(verdetto, { esito: 'retta' })
    })

    it('⛔⛔⛔ AL CONTRARIO — il contenuto riletto NON combacia → smentita, col perche\' vero', async () => {
        const discoChe = { leggi: async () => 'un altro contenuto, diverso da quello atteso' }
        const verdetto = await postcondizioneDiScrivi(discoChe, 'x.txt', 'contenuto vero')
        assert.equal(verdetto.esito, 'smentita')
        assert.ok(verdetto.perche, 'un motivo vero, non un\'assenza silenziosa')
    })

    it('⛔⛔⛔ AL CONTRARIO — leggi() che LANCIA → ignota, mai smentita: il controllore e\' esploso, non necessariamente l\'effetto', async () => {
        const discoChe = { leggi: async () => { throw new Error('EACCES: permesso negato') } }
        const verdetto = await postcondizioneDiScrivi(discoChe, 'x.txt', 'contenuto vero')
        assert.equal(verdetto.esito, 'ignota')
        assert.notEqual(verdetto.esito, 'smentita', 'accusare la scrittura per un guasto del controllo sarebbe una bugia')
        assert.match(verdetto.perche, /EACCES/, 'il messaggio VERO dell\'eccezione, non una parola generica')
    })

    it('⭐⭐ stringa vuota reletta correttamente: \'\' !== null, mai confusi', async () => {
        const discoChe = { leggi: async () => '' }
        const verdetto = await postcondizioneDiScrivi(discoChe, 'x.txt', '')
        assert.deepEqual(verdetto, { esito: 'retta' }, 'una scrittura di stringa vuota che rilegge stringa vuota E\' una postcondizione retta')
    })
})

/*
 * ⭐⭐⭐ 29/8 — serializzazione canonica. Copre esattamente la forma che
 * questa ricevuta produce (valori piatti + un livello di oggetti
 * annidati), non un input arbitrario — vedi il commento sulla funzione.
 */
describe('serializzaCanonica — deterministica per la forma che questa ricevuta produce', () => {
    it('⭐⭐⭐ due oggetti con le STESSE chiavi in ordine DIVERSO producono la STESSA stringa', () => {
        const a = serializzaCanonica({ b: 2, a: 1, c: 3 })
        const b = serializzaCanonica({ c: 3, a: 1, b: 2 })
        assert.equal(a, b)
        assert.equal(a, '{"a":1,"b":2,"c":3}')
    })

    it('⭐⭐ annidamento: le chiavi si ordinano anche dentro un oggetto interno', () => {
        assert.equal(
            serializzaCanonica({ z: { y: 2, x: 1 }, a: 1 }),
            '{"a":1,"z":{"x":1,"y":2}}',
        )
    })

    it('⭐ array: ordine degli ELEMENTI preservato (non sono chiavi da ordinare), contenuto ricorsivo', () => {
        assert.equal(serializzaCanonica([3, 1, 2]), '[3,1,2]', 'un array non e un oggetto: l\'ordine e informazione, non si tocca')
        assert.equal(serializzaCanonica([{ b: 1, a: 1 }]), '[{"a":1,"b":1}]')
    })

    it('⭐ null e stringhe/numeri/booleani piatti', () => {
        assert.equal(serializzaCanonica(null), 'null')
        assert.equal(serializzaCanonica('ciao'), '"ciao"')
        assert.equal(serializzaCanonica(42), '42')
        assert.equal(serializzaCanonica(true), 'true')
        assert.equal(serializzaCanonica(false), 'false')
    })

    it('⛔⛔⛔ AL CONTRARIO — NaN/Infinity/undefined/funzione/BigInt LANCIANO, mai una resa silenziosa', () => {
        assert.throws(() => serializzaCanonica(NaN))
        assert.throws(() => serializzaCanonica(Infinity))
        assert.throws(() => serializzaCanonica(undefined))
        assert.throws(() => serializzaCanonica(() => {}))
        assert.throws(() => serializzaCanonica(10n))
    })
})

/*
 * ⭐⭐⭐ 29/8, continuazione FASE D — la firma Ed25519. La parte più
 * sensibile di questo intero incremento: ogni test qui prova una
 * proprietà di SICUREZZA reale (non solo "produce una stringa"), con
 * chiavi VERE generate da node:crypto, mai simulate.
 */
describe('creaRicevutaOperazione + firma Ed25519 — round-trip vero, mai simulato', () => {
    it('⭐⭐ PARITÀ — senza firma, signature/keyId restano null (comportamento identico a prima di questo incremento)', () => {
        const ricevuta = creaRicevutaOperazione({
            azione: { tipo: 'scrivi', percorso: 'src/x.mjs' },
            toolCallId: 'call_20',
            esitoPermesso: { consentito: true, via: 'nessun-vincolo' },
            contenutoScritto: 'ciao',
        })
        assert.equal(ricevuta.signature, null)
        assert.equal(ricevuta.keyId, null)
    })

    it('⭐⭐⭐ CON firma: signature e\' un base64 non vuoto, keyId combacia con quello passato', () => {
        const chiavi = generaChiaviFirmaRicevute()
        const ricevuta = creaRicevutaOperazione({
            azione: { tipo: 'scrivi', percorso: 'src/x.mjs' },
            toolCallId: 'call_21',
            esitoPermesso: { consentito: true, via: 'nessun-vincolo' },
            contenutoScritto: 'ciao',
            firma: { chiavePrivata: chiavi.chiavePrivata, keyId: chiavi.keyId },
        })
        assert.equal(ricevuta.keyId, chiavi.keyId)
        assert.ok(typeof ricevuta.signature === 'string' && ricevuta.signature.length > 0)
        assert.match(ricevuta.signature, /^[A-Za-z0-9+/]+=*$/, 'base64 vero, non un placeholder')
    })

    it('⭐⭐⭐ la firma VERIFICA con la chiave pubblica corrispondente — round-trip vero, chiavi reali', () => {
        const chiavi = generaChiaviFirmaRicevute()
        const ricevuta = creaRicevutaOperazione({
            azione: { tipo: 'shell', comando: 'npm test' },
            toolCallId: 'call_22',
            esitoPermesso: { consentito: true, via: 'nessun-vincolo' },
            contenutoScritto: null,
            firma: { chiavePrivata: chiavi.chiavePrivata, keyId: chiavi.keyId },
        })
        assert.equal(verificaFirmaRicevuta(ricevuta, chiavi.chiavePubblica), true)
    })

    it('⛔⛔⛔ AL CONTRARIO — una ricevuta MANOMESSA dopo la firma NON verifica più (la proprietà di sicurezza vera)', () => {
        const chiavi = generaChiaviFirmaRicevute()
        const ricevuta = creaRicevutaOperazione({
            azione: { tipo: 'shell', comando: 'npm test' },
            toolCallId: 'call_23',
            esitoPermesso: { consentito: true, via: 'nessun-vincolo' },
            contenutoScritto: null,
            firma: { chiavePrivata: chiavi.chiavePrivata, keyId: chiavi.keyId },
        })
        assert.equal(verificaFirmaRicevuta(ricevuta, chiavi.chiavePubblica), true, 'sanity: la ricevuta ORIGINALE verifica')
        const manomessa = { ...ricevuta, status: 'succeeded', comando: 'rm -rf /' }
        assert.equal(verificaFirmaRicevuta(manomessa, chiavi.chiavePubblica), false, 'un solo campo cambiato basta a rompere la firma')
    })

    it('⛔⛔⛔ AL CONTRARIO — verificare con la chiave pubblica SBAGLIATA (un altro keypair reale) fallisce', () => {
        const chiaviVere = generaChiaviFirmaRicevute()
        const chiaviAltrui = generaChiaviFirmaRicevute()
        const ricevuta = creaRicevutaOperazione({
            azione: { tipo: 'scrivi', percorso: 'x.txt' },
            toolCallId: 'call_24',
            esitoPermesso: { consentito: true, via: 'nessun-vincolo' },
            contenutoScritto: 'ciao',
            firma: { chiavePrivata: chiaviVere.chiavePrivata, keyId: chiaviVere.keyId },
        })
        assert.equal(verificaFirmaRicevuta(ricevuta, chiaviAltrui.chiavePubblica), false)
    })

    it('⛔⛔ AL CONTRARIO — verificare una ricevuta MAI firmata (signature:null) torna false, mai un\'eccezione', () => {
        const chiavi = generaChiaviFirmaRicevute()
        const ricevuta = creaRicevutaOperazione({
            azione: { tipo: 'scrivi', percorso: 'x.txt' },
            toolCallId: 'call_25',
            esitoPermesso: { consentito: true, via: 'nessun-vincolo' },
            contenutoScritto: 'ciao',
        })
        assert.equal(verificaFirmaRicevuta(ricevuta, chiavi.chiavePubblica), false)
    })

    it('⭐⭐ Ed25519 e\' deterministico (RFC 8032, non ECDSA): stessa ricevuta logica, stessa firma, due volte', () => {
        const chiavi = generaChiaviFirmaRicevute()
        const argomenti = {
            azione: { tipo: 'scrivi', percorso: 'x.txt' },
            toolCallId: 'call_26',
            esitoPermesso: { consentito: true, via: 'nessun-vincolo' },
            contenutoScritto: 'ciao',
            firma: { chiavePrivata: chiavi.chiavePrivata, keyId: chiavi.keyId },
        }
        const r1 = creaRicevutaOperazione(argomenti)
        const r2 = creaRicevutaOperazione(argomenti)
        assert.equal(r1.signature, r2.signature, 'Ed25519 non usa un nonce casuale come ECDSA: stesso messaggio, stessa chiave, stessa firma sempre')
    })

    it('⭐⭐ generaChiaviFirmaRicevute: due chiamate producono DUE keyId diversi e DUE coppie di chiavi diverse', () => {
        const c1 = generaChiaviFirmaRicevute()
        const c2 = generaChiaviFirmaRicevute()
        assert.notEqual(c1.keyId, c2.keyId)
        assert.notEqual(c1.chiavePrivata, c2.chiavePrivata)
        assert.match(c1.chiavePrivata, /^-----BEGIN PRIVATE KEY-----/)
        assert.match(c1.chiavePubblica, /^-----BEGIN PUBLIC KEY-----/)
    })
})

/*
 * ⭐⭐⭐ 29/8 — FASE D, item 4 del "procedi in ordine" (corretto in corsa:
 * NON "agentLoop.ts" — letto il sorgente, agentLoop.ts e' un loop generico
 * senza logica d'audit, riceve `execute()` iniettato da chatController.ts,
 * che lo implementa chiamando executor.ts. Il vero omologo mobile di
 * creaRicevutaOperazione e' TalosToolAuditRow/executor.ts, quello gia'
 * usato come riferimento in TUTTI gli incrementi di oggi).
 *
 * GUARDIA DI DERIVA: non un test di comportamento, un CENSIMENTO fissato.
 * Se qualcuno aggiunge/toglie un campo dalla ricevuta senza aggiornare
 * questa lista, il test fallisce — costringe una decisione cosciente
 * invece di una deriva silenziosa. Le due liste sotto (mobile/kernel)
 * vanno rilette a mano dal sorgente vero il giorno che si riapre questo
 * confronto, non fidate a memoria.
 */

/*
 * ⭐⭐⭐ 29/8 — TRIFECTA, porta diretta di security.ts. Ogni test qui prova
 * una proprietà della REGOLA ("due su tre non bastano", "mai azzerata da
 * sola", "canTransmit:false non scala mai"), non solo che le funzioni
 * tornino un valore.
 */
describe('avanzaCatena — porta diretta di talosAdvanceChain, mai azzerata da sola', () => {
    it('⭐⭐⭐ un attrezzo che legge dati privati alza privateDataSeen, untrustedSeen resta com\'era', () => {
        const catena = avanzaCatena(CATENA_VUOTA, { readsPrivateData: true, readsUntrustedContent: false })
        assert.deepEqual(catena, { privateDataSeen: true, untrustedSeen: false })
    })

    it('⭐⭐⭐ un attrezzo che legge contenuto non attendibile alza untrustedSeen', () => {
        const catena = avanzaCatena(CATENA_VUOTA, { readsPrivateData: false, readsUntrustedContent: true })
        assert.deepEqual(catena, { privateDataSeen: false, untrustedSeen: true })
    })

    it('⛔⛔⛔ AL CONTRARIO — una volta vero, resta vero anche se il PROSSIMO attrezzo non lo dichiara', () => {
        const dopoUno = avanzaCatena(CATENA_VUOTA, { readsPrivateData: true, readsUntrustedContent: false })
        const dopoDue = avanzaCatena(dopoUno, { readsPrivateData: false, readsUntrustedContent: false })
        assert.equal(dopoDue.privateDataSeen, true, 'mai azzerata da sola — "il discorso resta contaminato"')
    })

    it('⭐⭐ se nessun flag cambia, torna lo STESSO oggetto (non uno nuovo) — porta diretta della fonte', () => {
        const dopoUno = avanzaCatena(CATENA_VUOTA, { readsPrivateData: true, readsUntrustedContent: false })
        const dopoDue = avanzaCatena(dopoUno, { readsPrivateData: true, readsUntrustedContent: false })
        assert.equal(dopoDue, dopoUno, 'stesso riferimento, non solo stesso contenuto')
    })
})

describe('verdettoTrifecta — vera SOLO quando tutte e tre le condizioni sono presenti', () => {
    it('⛔⛔⛔ AL CONTRARIO — canTransmit:false non chiude MAI, anche con la catena già piena', () => {
        const catenaPiena = { privateDataSeen: true, untrustedSeen: true }
        assert.equal(verdettoTrifecta(catenaPiena, { canTransmit: false }), false)
    })

    it('⛔⛔⛔ AL CONTRARIO — due condizioni su tre non bastano (canTransmit + uno solo dei due flag)', () => {
        assert.equal(verdettoTrifecta({ privateDataSeen: true, untrustedSeen: false }, { canTransmit: true }), false, 'solo privateDataSeen')
        assert.equal(verdettoTrifecta({ privateDataSeen: false, untrustedSeen: true }, { canTransmit: true }), false, 'solo untrustedSeen')
    })

    it('⭐⭐⭐ le tre condizioni tutte presenti insieme chiudono la trifecta', () => {
        assert.equal(verdettoTrifecta({ privateDataSeen: true, untrustedSeen: true }, { canTransmit: true }), true)
    })
})

describe('rischioEffettivo — scala R0-R4 in base alla catena, mai per un attrezzo che non trasmette', () => {
    it('⭐⭐ PARITÀ — catena vuota: il rischio torna INVARIATO, qualunque sia canTransmit', () => {
        assert.equal(rischioEffettivo(CATENA_VUOTA, { risk: 'R1', canTransmit: false }), 'R1')
        assert.equal(rischioEffettivo(CATENA_VUOTA, { risk: 'R2', canTransmit: true }), 'R2')
    })

    it('⛔⛔⛔ AL CONTRARIO — canTransmit:false non scala MAI, anche con la catena piena', () => {
        const catenaPiena = { privateDataSeen: true, untrustedSeen: true }
        assert.equal(rischioEffettivo(catenaPiena, { risk: 'R1', canTransmit: false }), 'R1', 'un attrezzo che non trasmette non deve mai salire: non e lui il canale')
    })

    it('⭐⭐⭐ un solo flag della catena presente, canTransmit:true, sale di UN gradino', () => {
        assert.equal(rischioEffettivo({ privateDataSeen: false, untrustedSeen: true }, { risk: 'R1', canTransmit: true }), 'R2')
        assert.equal(rischioEffettivo({ privateDataSeen: true, untrustedSeen: false }, { risk: 'R1', canTransmit: true }), 'R2')
    })

    it('⭐⭐⭐ ENTRAMBI i flag presenti, canTransmit:true, sale di DUE gradini', () => {
        assert.equal(rischioEffettivo({ privateDataSeen: true, untrustedSeen: true }, { risk: 'R1', canTransmit: true }), 'R3')
    })

    it('⛔⛔ AL CONTRARIO — il tetto e R4, non si sfonda mai (nessun R5 inventato)', () => {
        assert.equal(rischioEffettivo({ privateDataSeen: true, untrustedSeen: true }, { risk: 'R3', canTransmit: true }), 'R4')
        assert.equal(rischioEffettivo({ privateDataSeen: true, untrustedSeen: true }, { risk: 'R4', canTransmit: true }), 'R4')
    })
})

describe('SICUREZZA_PER_ATTREZZO — il catalogo, censito attrezzo per attrezzo', () => {
    it('⭐ document_create riusa BIT A BIT securityCatalog.ts:79 (l\'unico omologo diretto)', () => {
        assert.deepEqual(SICUREZZA_PER_ATTREZZO.document_create, {
            risk: 'R1', readsPrivateData: true, readsUntrustedContent: false, canTransmit: false,
        })
    })

    it('⭐ FASE H (29/8) — generate_image riusa BIT A BIT securityCatalog.ts:86 (omologo diretto), risk PIÙ ALTO di document_create', () => {
        assert.deepEqual(SICUREZZA_PER_ATTREZZO.generate_image, {
            risk: 'R2', readsPrivateData: true, readsUntrustedContent: false, canTransmit: true,
        })
    })

    it('⭐ shell e generate_image sono i DUE attrezzi del catalogo con canTransmit:true — per due ragioni diverse (conservativo vs outbound VERO)', () => {
        for (const nome of ['shell', 'generate_image']) {
            assert.equal(SICUREZZA_PER_ATTREZZO[nome].canTransmit, true, `${nome} deve poter trasmettere`)
        }
        for (const nome of ['scrivi', 'prova', 'document_create']) {
            assert.equal(SICUREZZA_PER_ATTREZZO[nome].canTransmit, false, `${nome} non deve poter trasmettere`)
        }
    })
})

describe('creaRicevutaOperazione + catena — trifecta/risk sulla ricevuta vera, non solo sulle funzioni isolate', () => {
    it('⭐⭐ PARITÀ — senza catena (default vuota), risk resta il valore statico di sempre, trifecta:false', () => {
        const ricevuta = creaRicevutaOperazione({
            azione: { tipo: 'shell', comando: 'npm test' },
            toolCallId: 'call_tc1',
            esitoPermesso: { consentito: true, via: 'nessun-vincolo' },
            contenutoScritto: null,
        })
        assert.equal(ricevuta.risk, 'R2')
        assert.equal(ricevuta.trifecta, false)
    })

    it('⭐⭐⭐ CON una catena già piena, shell (canTransmit:true) mostra trifecta:true e risk scalato', () => {
        const catenaPiena = { privateDataSeen: true, untrustedSeen: true }
        const ricevuta = creaRicevutaOperazione({
            azione: { tipo: 'shell', comando: 'npm test' },
            toolCallId: 'call_tc2',
            esitoPermesso: { consentito: true, via: 'nessun-vincolo' },
            contenutoScritto: null,
            catena: catenaPiena,
        })
        assert.equal(ricevuta.trifecta, true)
        assert.equal(ricevuta.risk, 'R4', 'R2 base + due gradini per privateDataSeen e untrustedSeen')
    })

    it('⛔⛔⛔ AL CONTRARIO — la STESSA catena piena su scrivi (canTransmit:false) NON chiude niente e NON scala il rischio', () => {
        const catenaPiena = { privateDataSeen: true, untrustedSeen: true }
        const ricevuta = creaRicevutaOperazione({
            azione: { tipo: 'scrivi', percorso: 'x.txt' },
            toolCallId: 'call_tc3',
            esitoPermesso: { consentito: true, via: 'nessun-vincolo' },
            contenutoScritto: 'ciao',
            catena: catenaPiena,
        })
        assert.equal(ricevuta.trifecta, false, 'scrivi non trasmette: la trifecta non si chiude su di lui, qualunque sia la catena')
        assert.equal(ricevuta.risk, 'R1', 'nessuna scala per un attrezzo che non e il canale')
    })

    it('⛔⛔⛔ AL CONTRARIO — il floor SS7.C resta R4 ANCHE con catena vuota (precedenza invariata)', () => {
        const ricevuta = creaRicevutaOperazione({
            azione: { tipo: 'shell', comando: 'rm -rf /' },
            toolCallId: 'call_tc4',
            esitoPermesso: { consentito: false, via: 'floor-comando-senza-recupero', motivo: 'cancellazione ricorsiva della radice' },
            contenutoScritto: null,
        })
        assert.equal(ricevuta.risk, 'R4')
    })
})

/*
 * ⭐⭐⭐ 29/8 — "l'unificazione vera", primo passo NON rischioso: la guardia
 * di deriva sotto confrontava la ricevuta del kernel con una lista SCRITTA
 * A MANO (`CAMPI_MOBILE`) — copiata da `executor.ts` una volta, mai
 * riletta. Ha già avuto due bug reali (item 4: `tool`/`input` contati
 * come "portati" senza verifica; oggi, se `executor.ts` guadagna un
 * quindicesimo campo, questa guardia non se ne accorgerebbe MAI). Non
 * un'unione di codice (`node:crypto` non esiste in una WebView — vedi il
 * ledger, "l'unificazione vera" — resta un progetto a sé) ma un
 * confronto AUTOMATICO, in sola lettura, cross-worktree: questa funzione
 * rilegge `TalosToolAuditRow` dal sorgente VERO a ogni corsa dei test.
 *
 * ⛔ Degrada, non fallisce, se il worktree `AVM` non è presente accanto
 * (un checkout CI che ha solo `AVM-harness` non deve rompersi per un
 * controllo extra) — dichiarato con un log, mai un errore silenzioso.
 */
/*
 * ⭐ Parser puro, separato dalla lettura del file apposta: testabile con
 * testo sintetico, AL CONTRARIO incluso — senza dover creare un
 * executor.ts finto sul disco per provare che la guardia morde davvero.
 */
export function estraiCampiInterfaccia(testoSorgente, nomeInterfaccia) {
    const inizioMarcatore = `export interface ${nomeInterfaccia} {`
    const inizio = testoSorgente.indexOf(inizioMarcatore)
    if (inizio === -1) throw new Error(`'export interface ${nomeInterfaccia} {' non trovato — il marcatore è cambiato o l'interfaccia non c'è più`)
    const dopoInizio = inizio + inizioMarcatore.length
    const fine = testoSorgente.indexOf('\n}', dopoInizio)
    if (fine === -1) throw new Error(`${nomeInterfaccia} trovata ma senza una chiusura "\\n}" — il parsing ha fallito`)
    const corpo = testoSorgente.slice(dopoInizio, fine)
    // ⭐ Solo le righe a indentazione 4 (i campi diretti dell'interfaccia): esclude commenti doc e qualunque tipo annidato.
    return [...corpo.matchAll(/^ {4}(\w+)\??:/gm)].map((m) => m[1])
}

function leggiCampiTalosToolAuditRowDalSorgente() {
    const percorso = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../AVM/mobile/src/lib/tools/executor.ts')
    if (!existsSync(percorso)) return null
    return estraiCampiInterfaccia(readFileSync(percorso, 'utf8'), 'TalosToolAuditRow')
}

describe('Parità di schema — TalosToolAuditRow (mobile) contro la ricevuta del kernel, censita non assunta', () => {
    /*
     * ⭐⭐⭐ 29/8, riscritta — la prima versione (item 4) aveva un buco nella
     * guardia stessa: `tool`/`input` erano contati come "portati" nella
     * somma di copertura senza che NESSUN test verificasse un campo con
     * quel nome esatto sulla ricevuta — passavano perché la ricevuta usa
     * `azione`/`percorso`/`comando`, nomi DIVERSI, e il vecchio test non
     * lo distingueva da "non c'è per niente". Trovato riusando la guardia
     * per action/requiredActions, non prima. Ora UNA sola mappa, in
     * entrambe le direzioni: `null` = non coperto affatto (verificato
     * ASSENTE sotto il nome mobile); una stringa = il nome ESATTO del
     * campo kernel che copre quel concetto (verificato PRESENTE).
     */
    const COPERTURA = {
        // executor.ts:72-133, 14 campi mobile. Aggiornare a mano se quel file cambia forma.
        tool: null, // concettualmente azione.tipo, ma NON un campo chiamato `tool` — nome diverso, mai finto uguale
        action: 'action', // PORTATO 29/8
        requiredActions: 'requiredActions', // PORTATO 29/8
        status: 'status',
        risk: 'risk',
        trifecta: 'trifecta', // PORTATO 29/8
        verified: 'verified',
        postcondizione: 'postcondizione',
        input: null, // azione.percorso/azione.comando sono parziali e tool-specific, non un input:unknown generico — trovato riscrivendo questa guardia, non ancora portato
        senzaEffetto: null,
        scheda: null,
        evidence: 'evidence',
        error: 'error', // PORTATO 29/8
        code: null, // executor.ts lo popola su UN SOLO sito su undici — non inseguito, vedi ledger
    }
    const CAMPI_MOBILE = Object.keys(COPERTURA).sort()

    it('⭐⭐⭐ i campi PORTATI esistono davvero, sotto il nome kernel dichiarato', () => {
        const ricevuta = creaRicevutaOperazione({
            azione: { tipo: 'scrivi', percorso: 'x.txt' },
            toolCallId: 'call_x',
            esitoPermesso: { consentito: true, via: 'nessun-vincolo' },
            contenutoScritto: 'ciao',
        })
        for (const [campoMobile, campoKernel] of Object.entries(COPERTURA)) {
            if (campoKernel === null) continue
            assert.ok(campoKernel in ricevuta, `${campoMobile} dovrebbe essere coperto da '${campoKernel}', ma manca sulla ricevuta`)
        }
    })

    it('⛔ i campi NON coperti (ledger FASE D) NON compaiono sotto il loro nome mobile — mai un falso presente', () => {
        const ricevuta = creaRicevutaOperazione({
            azione: { tipo: 'scrivi', percorso: 'x.txt' },
            toolCallId: 'call_y',
            esitoPermesso: { consentito: true, via: 'nessun-vincolo' },
            contenutoScritto: 'ciao',
        })
        for (const [campoMobile, campoKernel] of Object.entries(COPERTURA)) {
            if (campoKernel !== null) continue
            assert.equal(campoMobile in ricevuta, false, `${campoMobile} e' comparso sulla ricevuta ma la guardia lo dichiara non coperto — aggiornare ENTRAMBI insieme, non uno dei due`)
        }
    })

    it('⭐ sanity (statica) — la mappa qui sopra elenca ESATTAMENTE i 14 campi documentati di TalosToolAuditRow', () => {
        assert.deepEqual(CAMPI_MOBILE, [
            'tool', 'action', 'requiredActions', 'status', 'risk', 'trifecta',
            'verified', 'postcondizione', 'input', 'senzaEffetto', 'scheda',
            'evidence', 'error', 'code',
        ].sort(), 'ne uno di meno ne uno in più rispetto a executor.ts:72-133')
    })

    /*
     * ⭐⭐⭐ 29/8 — "l'unificazione vera", primo passo NON rischioso (vedi il
     * commento sopra `leggiCampiTalosToolAuditRowDalSorgente`). La guardia
     * di sopra confronta la ricevuta con `CAMPI_MOBILE`, una lista scritta
     * a mano; QUESTA confronta `CAMPI_MOBILE` stessa con `executor.ts`
     * VERO, riletto a ogni corsa — se un futuro incremento (su questo lato
     * o sul mobile) fa divergere i due, un test rosso lo dice SUBITO,
     * invece di aspettare la prossima volta che qualcuno riapre questo
     * ledger a mano.
     */
    it('⭐⭐⭐ sanity (VIVA) — CAMPI_MOBILE combacia con TalosToolAuditRow riletto da executor.ts, non da una copia', (t) => {
        const campiVeri = leggiCampiTalosToolAuditRowDalSorgente()
        if (campiVeri === null) {
            console.log('  (executor.ts non trovato accanto — worktree AVM assente, guardia viva saltata)')
            t.skip('worktree AVM non presente accanto a AVM-harness')
            return
        }
        assert.deepEqual(
            [...campiVeri].sort(), CAMPI_MOBILE,
            'TalosToolAuditRow (executor.ts) e CAMPI_MOBILE (questo file) sono divergenti — uno dei due lati è cambiato senza aggiornare l\'altro',
        )
    })

    it('⭐⭐⭐ action/requiredActions: censiti attrezzo per attrezzo, letti dal sorgente mobile (documentTools/webTools/modelTools)', () => {
        const perAttrezzo = (tipo) => creaRicevutaOperazione({
            azione: { tipo, percorso: 'x.txt', comando: 'echo ok' },
            toolCallId: `call_${tipo}`,
            esitoPermesso: { consentito: true, via: 'nessun-vincolo' },
            contenutoScritto: null,
        })
        assert.deepEqual(
            { action: perAttrezzo('scrivi').action, requiredActions: perAttrezzo('scrivi').requiredActions },
            { action: 'write', requiredActions: ['write'] },
        )
        assert.deepEqual(
            { action: perAttrezzo('document_create').action, requiredActions: perAttrezzo('document_create').requiredActions },
            { action: 'write', requiredActions: ['write'] },
            'stesso valore di documentTools.ts:65 — l\'UNICO omologo diretto sui due lati',
        )
        assert.deepEqual(
            { action: perAttrezzo('generate_image').action, requiredActions: perAttrezzo('generate_image').requiredActions },
            { action: 'write', requiredActions: ['outbound', 'write'] },
            'FASE H (29/8) — stesso valore di imageTools.ts:85-86, omologo diretto: outbound in più rispetto a document_create, perché genera chiamando un fornitore remoto',
        )
        assert.deepEqual(
            { action: perAttrezzo('prova').action, requiredActions: perAttrezzo('prova').requiredActions },
            { action: 'execute', requiredActions: ['execute'] },
        )
        assert.deepEqual(
            { action: perAttrezzo('shell').action, requiredActions: perAttrezzo('shell').requiredActions },
            { action: 'execute', requiredActions: ['execute', 'outbound', 'write'] },
            'eredita lo stesso compound di web_search/local_model_download (webTools.ts:120, modelTools.ts:208), gia\' usato per risk',
        )
    })

    it('⛔⛔⛔ AL CONTRARIO — un azione.tipo INVENTATO non deve mai matchare silenziosamente uno dei 4 censiti', () => {
        const ricevuta = creaRicevutaOperazione({
            azione: { tipo: 'attrezzo-che-non-esiste' },
            toolCallId: 'call_ignoto',
            esitoPermesso: { consentito: true, via: 'nessun-vincolo' },
            contenutoScritto: null,
        })
        assert.equal(ricevuta.action, null, 'nessuna azione inventata per un attrezzo non classificato')
        assert.equal(ricevuta.requiredActions, null)
    })

    it('⭐⭐⭐ error: un valore reale passa intatto, l\'assenza resta null (mai un\'eccezione duplicata dentro evidence)', () => {
        const conErrore = creaRicevutaOperazione({
            azione: { tipo: 'shell', comando: 'npm test' },
            toolCallId: 'call_err1',
            esitoPermesso: { consentito: true, via: 'nessun-vincolo' },
            contenutoScritto: null,
            esecuzioneFallita: true,
            error: 'EISDIR: illegal operation on a directory',
        })
        assert.equal(conErrore.error, 'EISDIR: illegal operation on a directory')

        const senzaErrore = creaRicevutaOperazione({
            azione: { tipo: 'scrivi', percorso: 'x.txt' },
            toolCallId: 'call_err2',
            esitoPermesso: { consentito: true, via: 'nessun-vincolo' },
            contenutoScritto: 'ciao',
        })
        assert.equal(senzaErrore.error, null, 'PARITÀ: un successo pulito non ha mai un error inventato')
    })

    it('⭐ il kernel e\' ANCHE avanti su un punto: signature/keyId (firma Ed25519) non esistono ancora su TalosToolAuditRow', () => {
        const ricevuta = creaRicevutaOperazione({
            azione: { tipo: 'scrivi', percorso: 'x.txt' },
            toolCallId: 'call_z',
            esitoPermesso: { consentito: true, via: 'nessun-vincolo' },
            contenutoScritto: 'ciao',
        })
        assert.ok('signature' in ricevuta && 'keyId' in ricevuta)
        assert.ok(!CAMPI_MOBILE.includes('signature'), 'non e\' un errore di battitura: mobile non firma ancora le sue ricevute')
    })
})

/*
 * ⭐⭐⭐ 29/8 — estraiCampiInterfaccia isolata dal disco: qui si prova che la
 * guardia VIVA morda davvero su un cambiamento reale, non solo che
 * combaci col file di oggi (già provato sopra, ma un match non prova che
 * un MISMATCH sarebbe stato notato — serve il verso contrario).
 */
describe('estraiCampiInterfaccia — il parser dietro la guardia viva, provato AL CONTRARIO', () => {
    it('⭐⭐⭐ estrae i campi diretti, ignora i commenti doc e le righe vuote', () => {
        const finto = `export interface Prova {\n    /** un commento doc */\n    campoUno: string\n\n    campoDue?: boolean\n}\n`
        assert.deepEqual(estraiCampiInterfaccia(finto, 'Prova'), ['campoUno', 'campoDue'])
    })

    it('⛔⛔⛔ AL CONTRARIO — un campo IN PIÙ nel sorgente finto viene rilevato, non ignorato', () => {
        const finto = `export interface Prova {\n    campoUno: string\n    campoNuovo: number\n}\n`
        const campi = estraiCampiInterfaccia(finto, 'Prova')
        assert.ok(campi.includes('campoNuovo'), 'un campo aggiunto deve comparire — è esattamente quello che la guardia viva deve notare')
        assert.notDeepEqual(campi.sort(), ['campoUno'], 'un mismatch reale non deve leggersi come nessun cambiamento')
    })

    it('⛔⛔⛔ AL CONTRARIO — un campo RIMOSSO nel sorgente finto sparisce dall\'estrazione, non resta fantasma', () => {
        const finto = `export interface Prova {\n    campoUno: string\n}\n`
        assert.deepEqual(estraiCampiInterfaccia(finto, 'Prova'), ['campoUno'])
    })

    it('⛔ AL CONTRARIO — un\'interfaccia che non esiste nel testo lancia, mai un array vuoto silenzioso', () => {
        assert.throws(() => estraiCampiInterfaccia('export interface AltraCosa {\n    x: string\n}\n', 'Prova'), /non trovato/)
    })

    it('⭐ un tipo con virgole/generici sulla stessa riga (es. Record<string, unknown>) non spezza il parsing', () => {
        const finto = `export interface Prova {\n    evidence?: Record<string, unknown>\n    altro: string\n}\n`
        assert.deepEqual(estraiCampiInterfaccia(finto, 'Prova'), ['evidence', 'altro'])
    })
})

/*
 * ⭐⭐⭐ L'attrezzo `naviga` — piano `elegant-spinning-dongarra.md`, §1.3,
 * riga "Browser". Porta diretta di TalosPublicAddressPolicy/TalosSafeWebClient
 * (Android, letti il 27/8) — stessi casi del loro TalosSafeWebClientTest.java,
 * tradotti qui. Mai una vera richiesta di rete in questi test: solo le
 * funzioni pure (la policy, non il trasporto) — stesso limite già accettato
 * per eseguiProva/eseguiComandoSandboxato, verificate dal vivo invece.
 */
describe('indirizzoPubblico — il confine IANA, porta di TalosPublicAddressPolicy', () => {
    it('⛔ IPv4 privati/riservati noti, uno per fascia', () => {
        for (const indirizzo of ['10.0.0.1', '127.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.1.1', '0.0.0.0', '224.0.0.1']) {
            assert.equal(indirizzoPubblico(indirizzo, 4), false, indirizzo)
        }
    })

    it('⛔ le fasce di documentazione/test IPv4 (RFC 5737, 3927, benchmarking)', () => {
        for (const indirizzo of ['192.0.2.1', '198.51.100.1', '203.0.113.1', '198.18.0.1', '100.64.0.1']) {
            assert.equal(indirizzoPubblico(indirizzo, 4), false, indirizzo)
        }
    })

    it('⭐ IPv4 pubblici veri restano ammessi', () => {
        for (const indirizzo of ['8.8.8.8', '1.1.1.1', '93.184.216.34']) {
            assert.equal(indirizzoPubblico(indirizzo, 4), true, indirizzo)
        }
    })

    it('⛔ IPv6 loopback, link-local, ULC e documentazione', () => {
        for (const indirizzo of ['::1', 'fe80::1', 'fc00::1', '2001:db8::1', '::ffff:127.0.0.1']) {
            assert.equal(indirizzoPubblico(indirizzo, 6), false, indirizzo)
        }
    })

    it('⭐ IPv6 pubblico vero (2001:4860:4860::8888, Google DNS) resta ammesso', () => {
        assert.equal(indirizzoPubblico('2001:4860:4860::8888', 6), true)
    })

    it('⛔ un IPv4-mapped verso un indirizzo privato resta bloccato — la mappatura non è una scappatoia', () => {
        assert.equal(indirizzoPubblico('::ffff:10.0.0.1', 6), false)
    })
})

describe('validaUrlNaviga — porta di TalosSafeWebClient.validate', () => {
    it('⭐ un URL pubblico normale passa, e il frammento sparisce', () => {
        const url = validaUrlNaviga('https://example.org/pagina#sezione')
        assert.equal(url.hash, '')
        assert.equal(url.hostname, 'example.org')
    })

    it('⛔ credenziali nell\'URL: bloccato PRIMA di qualunque rete', () => {
        assert.throws(() => validaUrlNaviga('https://utente:segreta@example.org/'), /TALOS_WEB_URL_BLOCKED:credentials/)
    })

    it('⛔ porta non standard: bloccata', () => {
        assert.throws(() => validaUrlNaviga('https://example.org:8443/'), /TALOS_WEB_URL_BLOCKED:port/)
    })

    it('⛔ schema diverso da http/https (es. file:) bloccato', () => {
        assert.throws(() => validaUrlNaviga('file:///etc/passwd'), /TALOS_WEB_URL_BLOCKED:scheme/)
    })

    it('⛔ hostname vietati per nome, non solo per indirizzo', () => {
        for (const url of ['http://localhost/', 'http://router.local/', 'http://server.internal/', 'http://nas.lan/']) {
            assert.throws(() => validaUrlNaviga(url), /TALOS_WEB_URL_BLOCKED:hostname/, url)
        }
    })

    it('⛔ un indirizzo IPv4 letterale privato è bloccato qui, non solo dal DNS pinning (non c\'è nessun DNS da agganciare)', () => {
        assert.throws(() => validaUrlNaviga('http://127.0.0.1/'), /TALOS_WEB_URL_BLOCKED:address/)
    })

    it('⛔ e AL CONTRARIO: un IPv4 letterale PUBBLICO non viene bloccato dal controllo indirizzo', () => {
        assert.doesNotThrow(() => validaUrlNaviga('http://93.184.216.34/'))
    })
})

describe('leggiPaginaSicura — la camminata sui redirect, con un trasporto finto (stesso principio del Transport finto di TalosSafeWebClientTest.java)', () => {
    /** Una tappa finta: risponde secondo lo script, una voce per chiamata. */
    function trasportoDi(...tappe) {
        let indice = 0
        const chiamate = []
        return {
            chiamate,
            fn: async (url) => {
                chiamate.push(url.toString())
                const tappa = tappe[indice++]
                if (!tappa) throw new Error('il finto trasporto non ha più tappe scriptate')
                return tappa
            },
        }
    }

    it('⭐ un salto pubblico solo: torna stato/url/corpo della tappa finale', async () => {
        const t = trasportoDi({ stato: 200, corpo: '<html>ciao</html>' })
        const r = await leggiPaginaSicura('https://example.org/pagina', t.fn)
        assert.equal(r.stato, 200)
        assert.equal(r.url, 'https://example.org/pagina')
        assert.equal(r.corpo, '<html>ciao</html>')
        assert.equal(t.chiamate.length, 1)
    })

    it('⭐⭐ segue UN redirect pubblico e torna l\'URL finale VALIDATO, con due chiamate al trasporto', async () => {
        const t = trasportoDi(
            { stato: 302, posizione: 'https://example.org/finale' },
            { stato: 200, corpo: 'finale' },
        )
        const r = await leggiPaginaSicura('https://example.org/partenza', t.fn)
        assert.equal(r.url, 'https://example.org/finale')
        assert.equal(r.corpo, 'finale')
        assert.equal(t.chiamate.length, 2)
    })

    it('⛔⛔ il bersaglio del redirect è validato PRIMA di una seconda chiamata al trasporto — un redirect verso un indirizzo privato non parte mai', async () => {
        const t = trasportoDi({ stato: 302, posizione: 'http://127.0.0.1/interno' })
        await assert.rejects(() => leggiPaginaSicura('https://example.org/partenza', t.fn), /TALOS_WEB_URL_BLOCKED:address/)
        assert.equal(t.chiamate.length, 1, 'la seconda tappa non deve MAI essere chiamata')
    })

    it('⛔ un downgrade https->http nel redirect è bloccato', async () => {
        const t = trasportoDi({ stato: 302, posizione: 'http://example.org/insicuro' })
        await assert.rejects(() => leggiPaginaSicura('https://example.org/partenza', t.fn), /TALOS_WEB_REDIRECT_DOWNGRADE/)
    })

    it('⛔ e AL CONTRARIO: un upgrade http->https NON è bloccato (solo il downgrade lo è)', async () => {
        const t = trasportoDi(
            { stato: 302, posizione: 'https://example.org/sicuro' },
            { stato: 200, corpo: 'ok' },
        )
        const r = await leggiPaginaSicura('http://example.org/partenza', t.fn)
        assert.equal(r.url, 'https://example.org/sicuro')
    })

    it('⛔ un ciclo di redirect si accorge da sé', async () => {
        const t = trasportoDi(
            { stato: 302, posizione: 'https://example.org/b' },
            { stato: 302, posizione: 'https://example.org/partenza' }, // torna al punto di partenza
        )
        await assert.rejects(() => leggiPaginaSicura('https://example.org/partenza', t.fn), /TALOS_WEB_REDIRECT_LOOP/)
    })

    it('⛔ più di 5 salti: TROPPI_REDIRECT, mai un ciclo infinito', async () => {
        const tappe = Array.from({ length: 8 }, (_, i) => ({ stato: 302, posizione: `https://example.org/salto-${i + 1}` }))
        const t = trasportoDi(...tappe)
        await assert.rejects(() => leggiPaginaSicura('https://example.org/salto-0', t.fn), /TALOS_WEB_TOO_MANY_REDIRECTS/)
        assert.ok(t.chiamate.length <= 6, 'non deve continuare a chiamare il trasporto oltre il tetto')
    })

    it('⛔ un redirect senza Location è un errore dichiarato, non un crash', async () => {
        const t = trasportoDi({ stato: 302, posizione: undefined })
        await assert.rejects(() => leggiPaginaSicura('https://example.org/partenza', t.fn), /TALOS_WEB_REDIRECT_INVALID/)
    })
})

/*
 * ⭐⭐⭐ 28/8 — web_search/artifact_create, gli attrezzi OPZIONALI per
 * l'harness desktop (owner: "tutti i tool come la generazione di
 * artefatti oppure la ricerca web"). Vedi la doc sopra `ATTREZZI_ESTESI`
 * nel sorgente per il perché sono opzionali e mai offerti a TALOS-BANCO.
 */
describe('richiestaRicerca — le quattro fonti, stessa scelta del mobile', () => {
    it('⭐ tavily: POST, chiave nel header (mai nella URL), corpo con query/max_results', () => {
        const r = richiestaRicerca('tavily', 'gatti', 5, { apiKey: 'k' })
        assert.equal(r.metodo, 'POST')
        assert.equal(r.url.toString(), 'https://api.tavily.com/search')
        assert.equal(r.intestazioni.authorization, 'Bearer k')
        assert.deepEqual(r.corpo, { query: 'gatti', max_results: 5, search_depth: 'basic' })
    })

    it('⛔ tavily senza chiave: rifiutato PRIMA di qualunque rete', () => {
        assert.throws(() => richiestaRicerca('tavily', 'gatti', 5, {}), /TALOS_SEARCH_CREDENTIAL_MISSING/)
    })

    it('⭐ brave: GET, querystring q/count, chiave nell header x-subscription-token', () => {
        const r = richiestaRicerca('brave', 'cani', 3, { apiKey: 'k' })
        assert.equal(r.metodo, 'GET')
        assert.equal(r.url.searchParams.get('q'), 'cani')
        assert.equal(r.url.searchParams.get('count'), '3')
        assert.equal(r.intestazioni['x-subscription-token'], 'k')
    })

    it('⭐ searxng: GET, format=json esplicito (spento di default sulla maggior parte delle istanze)', () => {
        const r = richiestaRicerca('searxng', 'pesci', 5, { endpoint: 'https://searx.esempio.it/' })
        assert.equal(r.url.toString(), 'https://searx.esempio.it/search?q=pesci&format=json')
    })

    it('⛔ searxng/custom senza endpoint: rifiutato PRIMA di qualunque rete', () => {
        assert.throws(() => richiestaRicerca('searxng', 'x', 5, {}), /TALOS_SEARCH_ENDPOINT_MISSING/)
        assert.throws(() => richiestaRicerca('custom', 'x', 5, {}), /TALOS_SEARCH_ENDPOINT_MISSING/)
    })

    it('⭐ custom: escape hatch, chiave opzionale', () => {
        const senzaChiave = richiestaRicerca('custom', 'x', 5, { endpoint: 'https://mio.esempio.it/cerca' })
        assert.equal('authorization' in senzaChiave.intestazioni, false)
        const conChiave = richiestaRicerca('custom', 'x', 5, { endpoint: 'https://mio.esempio.it/cerca', apiKey: 'k' })
        assert.equal(conChiave.intestazioni.authorization, 'Bearer k')
    })

    it('⛔⛔ un provider ignoto è un errore dichiarato, non un tentativo alla cieca', () => {
        assert.throws(() => richiestaRicerca('inventato', 'x', 5, {}), /TALOS_SEARCH_SOURCE_UNKNOWN/)
    })
})

describe('analizzaRisultatiRicerca — un fornitore terzo non deve mai far lanciare il parser', () => {
    it('⭐ tavily/searxng/custom condividono la forma { results: [...] }', () => {
        const righe = analizzaRisultatiRicerca('tavily', {
            results: [{ url: 'https://a.esempio.it', title: 'A', content: 'contenuto A', published_date: '2026-01-01' }],
        })
        // ⛔ `new URL(...).toString()` normalizza un dominio nudo con lo slash finale — comportamento vero della classe URL, non un difetto del parser.
        assert.deepEqual(righe, [{ url: 'https://a.esempio.it/', title: 'A', snippet: 'contenuto A', pubblicato: '2026-01-01' }])
    })

    it('⭐ brave usa web.results[] e description/page_age', () => {
        const righe = analizzaRisultatiRicerca('brave', {
            web: { results: [{ url: 'https://b.esempio.it', title: 'B', description: 'd', page_age: '2026-02-02' }] },
        })
        assert.deepEqual(righe, [{ url: 'https://b.esempio.it/', title: 'B', snippet: 'd', pubblicato: '2026-02-02' }])
    })

    it('⛔ un url mancante o non http(s) scarta SOLO quella riga, non l intera risposta', () => {
        const righe = analizzaRisultatiRicerca('tavily', {
            results: [{ url: 'javascript:alert(1)', title: 'cattivo' }, { url: 'https://buono.esempio.it', title: 'buono' }],
        })
        assert.equal(righe.length, 1)
        assert.equal(righe[0].title, 'buono')
    })

    it('⛔⛔ AL CONTRARIO: un corpo che non è nemmeno un oggetto (HTML/errore/niente) torna [] e non lancia', () => {
        assert.deepEqual(analizzaRisultatiRicerca('tavily', null), [])
        assert.deepEqual(analizzaRisultatiRicerca('tavily', '<html>errore</html>'), [])
        assert.deepEqual(analizzaRisultatiRicerca('brave', {}), [])
    })

    it('⭐ D7 del mobile, stessa onestà qui: una data assente resta null, mai una data inventata', () => {
        const righe = analizzaRisultatiRicerca('custom', { results: [{ url: 'https://x.esempio.it' }] })
        assert.equal(righe[0].pubblicato, null)
        assert.equal(righe[0].title, '')
        assert.equal(righe[0].snippet, '')
    })
})

describe('formattaRisultatiRicerca', () => {
    it('⭐ zero risultati: lo dice, non tace', () => {
        assert.equal(formattaRisultatiRicerca('query rara', []), 'No results for "query rara".')
    })

    it('⭐ una data ignota si dichiara "date unknown", mai omessa', () => {
        const testo = formattaRisultatiRicerca('q', [{ url: 'https://x.it', title: 'T', snippet: 's', pubblicato: null }])
        assert.match(testo, /published: date unknown/)
    })
})

describe('eseguiRicercaWeb — il trasporto è iniettato, mai una rete vera nei test', () => {
    it('⭐ un 200 con risultati veri torna l elenco già analizzato', async () => {
        const trasportoFinto = async () => ({ stato: 200, corpo: JSON.stringify({ results: [{ url: 'https://a.it', title: 'A' }] }) })
        const righe = await eseguiRicercaWeb('q', 5, { provider: 'tavily', apiKey: 'k' }, trasportoFinto)
        assert.equal(righe.length, 1)
        assert.equal(righe[0].url, 'https://a.it/') // new URL(...).toString() normalizza un dominio nudo con lo slash finale
    })

    it('⛔ uno stato non-2xx è un errore dichiarato, mai un elenco vuoto silenzioso', async () => {
        const trasportoFinto = async () => ({ stato: 401, corpo: '{}' })
        await assert.rejects(() => eseguiRicercaWeb('q', 5, { provider: 'tavily', apiKey: 'k' }, trasportoFinto), /HTTP 401/)
    })

    it('⭐ maxResults è sempre nel tetto [1,10], anche se il modello manda un numero fuori scala', async () => {
        let corpoVisto
        const trasportoFinto = async (url, opzioni) => { corpoVisto = opzioni.corpo; return { stato: 200, corpo: '{}' } }
        await eseguiRicercaWeb('q', 999, { provider: 'tavily', apiKey: 'k' }, trasportoFinto)
        assert.equal(corpoVisto.max_results, 10)
        await eseguiRicercaWeb('q', 0, { provider: 'tavily', apiKey: 'k' }, trasportoFinto)
        assert.equal(corpoVisto.max_results, 5, 'un valore invalido (0, NaN) torna al default 5, non a 1')
    })
})

describe('talosLavora — web_search, artifact_create, document_create e time_now, opzionali per costruzione', () => {
    function cartellaVuota(t) {
        const radice = mkdtempSync(join(tmpdir(), 'talos-harness-estesi-'))
        t.after(() => rmSync(radice, { recursive: true, force: true }))
        return radice
    }

    function reteDiRisposte(...risposte) {
        const chiamate = []
        return {
            chiamate,
            fetch: async (url, opzioni) => {
                const indice = chiamate.length
                chiamate.push({ url, opzioni, corpo: JSON.parse(opzioni.body) })
                const scelta = risposte[Math.min(indice, risposte.length - 1)]
                return {
                    ok: true, status: 200,
                    json: async () => ({ choices: [{ message: scelta }], usage: { prompt_tokens: 10, completion_tokens: 5 } }),
                    text: async () => '',
                }
            },
        }
    }

    const TASK = { consegna: 'un compito qualunque, per la prova' }
    const CONCLUSO_SUBITO = { role: 'assistant', content: 'fatto', tool_calls: [] }

    it('⭐⭐⭐ PARITÀ — i sette parametri nuovi, assenti, non cambiano un solo campo dell esito (stesso stile della PARITÀ di onGiro/onScrittura)', async () => {
        const cartella = cartellaVuota(it)
        const reteA = reteDiRisposte(CONCLUSO_SUBITO)
        const reteB = reteDiRisposte(CONCLUSO_SUBITO)
        const senzaNulla = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: reteA.fetch })
        const conParametriAssenti = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: reteB.fetch,
            strumentiEstesi: undefined, ricercaWeb: undefined, onArtefatto: undefined, richiediRicercaFn: undefined, orologioFn: undefined, onDocumento: undefined, onImmagine: undefined,
        })
        assert.deepEqual(conParametriAssenti, senzaNulla)
    })

    it('⛔⛔⛔ AL CONTRARIO — senza strumentiEstesi, il modello non vede MAI web_search/artifact_create/document_create/time_now, e la lista è bit-per-bit quella di sempre', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CONCLUSO_SUBITO)
        await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch })
        const nomiOfferti = rete.chiamate[0].corpo.tools.map((t) => t.function.name)
        assert.equal(nomiOfferti.length, 7, 'i sette attrezzi di sempre, non uno di più')
        assert.ok(!nomiOfferti.includes('web_search'))
        assert.ok(!nomiOfferti.includes('artifact_create'))
        assert.ok(!nomiOfferti.includes('document_create'))
        assert.ok(!nomiOfferti.includes('time_now'))
    })

    it('⭐ strumentiEstesi aggiunge SOLO i nomi richiesti, non tutto ATTREZZI_ESTESI', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CONCLUSO_SUBITO)
        await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['web_search'] })
        const nomiOfferti = rete.chiamate[0].corpo.tools.map((t) => t.function.name)
        assert.equal(nomiOfferti.length, 8)
        assert.ok(nomiOfferti.includes('web_search'))
        assert.ok(!nomiOfferti.includes('artifact_create'))
    })

    it('⛔ un nome inventato in strumentiEstesi non aggiunge niente (filtrato, non un attrezzo fantasma)', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CONCLUSO_SUBITO)
        await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['non_esiste'] })
        assert.equal(rete.chiamate[0].corpo.tools.length, 7)
    })

    it('⛔⛔⛔ web_search SENZA ricercaWeb configurato: messaggio onesto al modello, mai un tentativo di rete', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_RICERCA = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'web_search', arguments: '{"query":"gatti"}' } }] }
        const rete = reteDiRisposte(CHIAMA_RICERCA, CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['web_search'] })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /not configured/)
    })

    it('⭐⭐⭐ web_search CON ricercaWeb: il risultato vero arriva al modello come esito dell attrezzo (trasporto iniettato, ZERO rete vera)', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_RICERCA = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'web_search', arguments: '{"query":"gatti","maxResults":2}' } }] }
        const rete = reteDiRisposte(CHIAMA_RICERCA, CONCLUSO_SUBITO)
        const chiamateRicerca = []
        const trasportoRicercaFinto = async (url, opzioni) => {
            chiamateRicerca.push({ url: url.toString(), opzioni })
            return { stato: 200, corpo: JSON.stringify({ results: [{ url: 'https://gatti.esempio.it', title: 'Gatti' }] }) }
        }
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['web_search'],
            ricercaWeb: { provider: 'tavily', apiKey: 'k' }, richiediRicercaFn: trasportoRicercaFinto,
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(chiamateRicerca.length, 1, 'nessuna rete vera: un solo passaggio dal trasporto iniettato')
        assert.equal(chiamateRicerca[0].opzioni.corpo.query, 'gatti')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /1 results for "gatti"/)
        assert.match(messaggioTool.content, /Gatti/)
    })

    it('⛔ AL CONTRARIO — web_search con provider dichiarato ma trasporto che fallisce: errore onesto, mai un esito inventato', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_RICERCA = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'web_search', arguments: '{"query":"gatti"}' } }] }
        const rete = reteDiRisposte(CHIAMA_RICERCA, CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['web_search'],
            ricercaWeb: { provider: 'tavily', apiKey: 'k' },
            richiediRicercaFn: async () => { throw new Error('TALOS_WEB_TIMEOUT') },
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /search failed: TALOS_WEB_TIMEOUT/)
    })

    it('⭐⭐⭐ artifact_create SENZA onArtefatto: id locale deterministico da c.id, mai Date.now()/Math.random()', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_ARTEFATTO = { role: 'assistant', content: null, tool_calls: [{ id: 'call_xyz', function: { name: 'artifact_create', arguments: '{"titolo":"Prova","html":"<!doctype html><html></html>"}' } }] }
        const rete = reteDiRisposte(CHIAMA_ARTEFATTO, CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['artifact_create'] })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.equal(messaggioTool.content, 'created: "Prova" (id: artefatto-call_xyz)')
    })

    it('⭐⭐⭐ artifact_create CON onArtefatto: la callback riceve titolo+html VERI, e il suo id vince', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_ARTEFATTO = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'artifact_create', arguments: '{"titolo":"Grafico","html":"<!doctype html><html><body>x</body></html>"}' } }] }
        const rete = reteDiRisposte(CHIAMA_ARTEFATTO, CONCLUSO_SUBITO)
        const ricevuti = []
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['artifact_create'],
            onArtefatto: async (titolo, html) => { ricevuti.push({ titolo, html }); return { id: 'artefatto-vero-42' } },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.deepEqual(ricevuti, [{ titolo: 'Grafico', html: '<!doctype html><html><body>x</body></html>' }])
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.equal(messaggioTool.content, 'created: "Grafico" (id: artefatto-vero-42)')
    })

    it('⛔ artifact_create con html vuoto: REFUSED, onArtefatto MAI chiamata', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_ARTEFATTO = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'artifact_create', arguments: '{"titolo":"Vuoto","html":"   "}' } }] }
        const rete = reteDiRisposte(CHIAMA_ARTEFATTO, CONCLUSO_SUBITO)
        let chiamata = false
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['artifact_create'],
            onArtefatto: async () => { chiamata = true; return { id: 'mai' } },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(chiamata, false)
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /^REFUSED/)
    })

    it('⭐⭐⭐ time_now: offerto solo se richiesto, e il modello riceve giorno della settimana + fuso + ISO, mai un timestamp nudo', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_ORA = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'time_now', arguments: '{}' } }] }
        const rete = reteDiRisposte(CHIAMA_ORA, CONCLUSO_SUBITO)
        // ⭐ 2026-08-14T10:30:00.000Z era esattamente il giorno del difetto misurato sul Pad citato nella doc — un venerdì, non un giovedì.
        const epocaFissa = new Date('2026-08-14T10:30:00.000Z').getTime()
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['time_now'],
            orologioFn: () => epocaFissa,
        })
        assert.equal(esito.comeFinita, 'concluso')
        const nomiOfferti = rete.chiamate[0].corpo.tools.map((t) => t.function.name)
        assert.equal(nomiOfferti.length, 8)
        assert.ok(nomiOfferti.includes('time_now'))
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /Friday/, 'il giorno della settimana è DETTO, mai lasciato calcolare al modello')
        assert.match(messaggioTool.content, /ISO: 2026-08-14T10:30:00\.000Z/)
    })

    it('⛔ AL CONTRARIO — senza orologioFn iniettato, time_now usa l orologio VERO, non un valore fisso a caso', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_ORA = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'time_now', arguments: '{}' } }] }
        const rete = reteDiRisposte(CHIAMA_ORA, CONCLUSO_SUBITO)
        const prima = Date.now()
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['time_now'] })
        const dopo = Date.now()
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        const isoTrovato = messaggioTool.content.match(/ISO: (\S+)/)?.[1]
        assert.ok(isoTrovato, 'la riga ISO deve esserci')
        const epocaVista = new Date(isoTrovato).getTime()
        assert.ok(epocaVista >= prima && epocaVista <= dopo, 'l epoca vista deve cadere nella finestra reale della chiamata, non un valore inventato')
    })

    it('⛔⛔⛔ document_create SENZA onDocumento: messaggio onesto al modello, mai un tentativo silenzioso', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_DOC = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'document_create', arguments: '{"format":"md","title":"Prova","body":"testo"}' } }] }
        const rete = reteDiRisposte(CHIAMA_DOC, CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['document_create'] })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /not configured/)
    })

    it('⭐⭐⭐ document_create CON onDocumento: gli argomenti VERI del modello arrivano intatti, l esito della callback è la riga mostrata', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_DOC = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'document_create', arguments: '{"format":"xlsx","title":"Vendite","rows":[["a","b"],["1","2"]]}' } }] }
        const rete = reteDiRisposte(CHIAMA_DOC, CONCLUSO_SUBITO)
        const ricevuti = []
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['document_create'],
            onDocumento: async (spec) => { ricevuti.push(spec); return { ok: true, esito: 'Created "Vendite.xlsx" (12 KB). Checked: 1 sheet, 2 rows.' } },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.deepEqual(ricevuti, [{ format: 'xlsx', title: 'Vendite', rows: [['a', 'b'], ['1', '2']] }])
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.equal(messaggioTool.content, 'Created "Vendite.xlsx" (12 KB). Checked: 1 sheet, 2 rows.')
    })

    it('⛔ AL CONTRARIO — document_create con onDocumento che fallisce: errore onesto, mai un successo inventato', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_DOC = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'document_create', arguments: '{"format":"pdf","title":"Rotto","body":"x"}' } }] }
        const rete = reteDiRisposte(CHIAMA_DOC, CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['document_create'],
            onDocumento: async () => { throw new Error('TALOS_DOCUMENT_VERIFY_FAILED') },
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /document creation failed: TALOS_DOCUMENT_VERIFY_FAILED/)
    })

    it('⛔ document_create con onDocumento che torna ok:false: il messaggio della callback vince, non una parola generica', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_DOC = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'document_create', arguments: '{"format":"docx","title":"Vuoto"}' } }] }
        const rete = reteDiRisposte(CHIAMA_DOC, CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['document_create'],
            onDocumento: async () => ({ ok: false, esito: 'The document was not created: TALOS_DOCUMENT_EMPTY' }),
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.equal(messaggioTool.content, 'The document was not created: TALOS_DOCUMENT_EMPTY')
    })

    /*
     * ⭐⭐⭐ FASE H (29/8), piano elegant-spinning-dongarra.md. Stesso
     * identico stile di document_create appena sopra — mirror completo
     * del contratto onXxx(spec)=>{ok,esito}, stesso onesto "not
     * configured", stessa distinzione fra un throw e un ok:false.
     */
    it('⛔⛔⛔ generate_image SENZA onImmagine: messaggio onesto al modello, mai un tentativo silenzioso', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_IMG = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'generate_image', arguments: '{"prompt":"un gatto rosso"}' } }] }
        const rete = reteDiRisposte(CHIAMA_IMG, CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['generate_image'] })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /not configured/)
    })

    it('⭐⭐⭐ generate_image CON onImmagine: gli argomenti VERI del modello arrivano intatti, l\'esito della callback è la riga mostrata', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_IMG = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'generate_image', arguments: '{"prompt":"un tramonto sul mare","shape":"landscape"}' } }] }
        const rete = reteDiRisposte(CHIAMA_IMG, CONCLUSO_SUBITO)
        const ricevuti = []
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['generate_image'],
            onImmagine: async (spec) => { ricevuti.push(spec); return { ok: true, esito: 'Generated "un-tramonto-sul-mare.png" (312 KB) with bytedance-seed/seedream-4.5.' } },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.deepEqual(ricevuti, [{ prompt: 'un tramonto sul mare', shape: 'landscape' }])
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.equal(messaggioTool.content, 'Generated "un-tramonto-sul-mare.png" (312 KB) with bytedance-seed/seedream-4.5.')
    })

    it('⛔ AL CONTRARIO — generate_image con onImmagine che fallisce: errore onesto, mai un successo inventato', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_IMG = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'generate_image', arguments: '{"prompt":"x"}' } }] }
        const rete = reteDiRisposte(CHIAMA_IMG, CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['generate_image'],
            onImmagine: async () => { throw new Error('TALOS_IMAGE_UPSTREAM_ERROR: 402 insufficient credit') },
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /image generation failed: TALOS_IMAGE_UPSTREAM_ERROR: 402 insufficient credit/)
    })

    it('⛔ generate_image con onImmagine che torna ok:false: il messaggio della callback vince, non una parola generica', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_IMG = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'generate_image', arguments: '{"prompt":"x"}' } }] }
        const rete = reteDiRisposte(CHIAMA_IMG, CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['generate_image'],
            onImmagine: async () => ({ ok: false, esito: 'No configured provider can generate images.' }),
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.equal(messaggioTool.content, 'No configured provider can generate images.')
    })

    /*
     * ⭐⭐⭐ FASE C (28/8) — sub-agenti, piano elegant-spinning-dongarra.md.
     * Stesso stile di document_create/artifact_create: PARITÀ (offerto
     * solo su richiesta), onDelega assente → messaggio onesto, AL
     * CONTRARIO su ogni guardia (cartella mancante, cartella uguale al
     * padre, esito:'rifiutato', callback che lancia).
     */
    it('⭐⭐⭐ delega_sottotask: offerto solo se richiesto (8° attrezzo, come time_now/document_create)', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['delega_sottotask'] })
        assert.equal(esito.comeFinita, 'concluso')
        const nomiOfferti = rete.chiamate[0].corpo.tools.map((t) => t.function.name)
        assert.equal(nomiOfferti.length, 8)
        assert.ok(nomiOfferti.includes('delega_sottotask'))
    })

    it('⛔⛔⛔ delega_sottotask SENZA onDelega: messaggio onesto al modello, mai un tentativo silenzioso', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_DELEGA = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'delega_sottotask', arguments: '{"task":"fai qualcosa","cartella":"/tmp/altra-cartella"}' } }] }
        const rete = reteDiRisposte(CHIAMA_DELEGA, CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['delega_sottotask'] })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /not configured/)
    })

    it('⭐⭐⭐ delega_sottotask CON onDelega: task/cartella VERI arrivano intatti, il riassunto della callback è la riga mostrata', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_DELEGA = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'delega_sottotask', arguments: '{"task":"scrivi un modulo di test","cartella":"/tmp/figlio-isolato"}' } }] }
        const rete = reteDiRisposte(CHIAMA_DELEGA, CONCLUSO_SUBITO)
        const ricevuti = []
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['delega_sottotask'],
            onDelega: async (task, cartellaFiglio) => { ricevuti.push({ task, cartellaFiglio }); return { riassunto: 'Fatto: modulo scritto e testato.', esito: 'concluso' } },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.deepEqual(ricevuti, [{ task: 'scrivi un modulo di test', cartellaFiglio: '/tmp/figlio-isolato' }])
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.equal(messaggioTool.content, 'Fatto: modulo scritto e testato.')
    })

    it('⭐⭐⭐ 06/9 — delega_sottotask con cartella ASSENTE: parte nella cartella del PADRE', async () => {
        /*
         * ⛔⛔⛔ Questo test diceva l'opposto fino al 06/9 («REFUSED, onDelega MAI chiamata»), ed è
         * stato capovolto su una MISURA, non su un'opinione: dal vivo, un giro con una sola delega
         * ha prodotto quattro sessioni figlie, otto giri e 76,8k token, tutte fallite. Il modello
         * vedeva REFUSED sulla cartella del padre — il caso normale — e aggirava riscrivendo il
         * percorso in forma WSL (`/mnt/c/...`), che passa il confronto e non esiste su Windows.
         * Lo stato dell'arte dice l'opposto della vecchia regola (Hermes Agent «Subagent
         * delegation», letto 06/09/2026): «by default subagents share the parent's working
         * directory». Chi deve dire di no a un percorso è chi conosce il disco: `onDelega`.
         */
        const cartella = cartellaVuota(it)
        const CHIAMA_DELEGA = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'delega_sottotask', arguments: '{"task":"fai qualcosa"}' } }] }
        const rete = reteDiRisposte(CHIAMA_DELEGA, CONCLUSO_SUBITO)
        let vista = null
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['delega_sottotask'],
            onDelega: async (task, dove) => { vista = { task, dove }; return { riassunto: 'figlio concluso', esito: 'concluso' } },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.deepEqual(vista, { task: 'fai qualcosa', dove: cartella }, 'senza cartella il figlio lavora dove lavora il padre')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.equal(messaggioTool.content, 'figlio concluso')
    })

    it('⭐⭐⭐ 06/9 — delega_sottotask con cartella UGUALE al padre: parte, non è più un rifiuto', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_DELEGA = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'delega_sottotask', arguments: JSON.stringify({ task: 'fai qualcosa', cartella }) } }] }
        const rete = reteDiRisposte(CHIAMA_DELEGA, CONCLUSO_SUBITO)
        let vista = null
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['delega_sottotask'],
            onDelega: async (task, dove) => { vista = { task, dove }; return { riassunto: 'fatto', esito: 'concluso' } },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(vista.dove, cartella, 'delegare un sotto-compito sullo stesso progetto è il caso normale')
    })

    it('⛔⛔⛔ AL CONTRARIO — delega_sottotask con una cartella che non è una stringa: REFUSED, onDelega MAI chiamata', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_DELEGA = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'delega_sottotask', arguments: '{"task":"fai qualcosa","cartella":42}' } }] }
        const rete = reteDiRisposte(CHIAMA_DELEGA, CONCLUSO_SUBITO)
        let chiamata = false
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['delega_sottotask'],
            onDelega: async () => { chiamata = true; return { riassunto: 'mai', esito: 'concluso' } },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(chiamata, false)
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /^REFUSED\./)
        assert.match(messaggioTool.content, /must be a string/)
    })

    it('⭐⭐⭐ 06/9 — onDelega può ancora rifiutare: chi conosce il disco dice di no, e il modello lo legge', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_DELEGA = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'delega_sottotask', arguments: '{"task":"fai qualcosa","cartella":"/mnt/c/non-esiste"}' } }] }
        const rete = reteDiRisposte(CHIAMA_DELEGA, CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['delega_sottotask'],
            onDelega: async () => ({ esito: 'rifiutato', motivo: 'la cartella /mnt/c/non-esiste non esiste su questo computer' }),
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /^REFUSED\./)
        assert.match(messaggioTool.content, /non esiste su questo computer/)
    })

    it('⛔ delega_sottotask con esito:\'rifiutato\' (tetto di concorrenza/profondità simulato): REFUSED col motivo esatto del chiamante', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_DELEGA = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'delega_sottotask', arguments: '{"task":"fai qualcosa","cartella":"/tmp/altra-cartella"}' } }] }
        const rete = reteDiRisposte(CHIAMA_DELEGA, CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['delega_sottotask'],
            onDelega: async () => ({ esito: 'rifiutato', motivo: 'limite di 10 figli concorrenti raggiunto' }),
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /^REFUSED\./)
        assert.match(messaggioTool.content, /limite di 10 figli concorrenti raggiunto/)
    })

    it('⛔ AL CONTRARIO — delega_sottotask con onDelega che LANCIA: errore onesto, mai un successo inventato', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_DELEGA = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'delega_sottotask', arguments: '{"task":"fai qualcosa","cartella":"/tmp/altra-cartella"}' } }] }
        const rete = reteDiRisposte(CHIAMA_DELEGA, CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['delega_sottotask'],
            onDelega: async () => { throw new Error('registro sessioni non raggiungibile') },
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /delegation failed: registro sessioni non raggiungibile/)
    })
})

/*
 * ⭐⭐⭐ FASE D (28/8), piano elegant-spinning-dongarra.md — "Coda: un
 * messaggio su una sessione ANCORA IN CORSO". `codaMessaggiFn` è
 * controllata SOLO nel punto dove il modello avrebbe concluso da solo
 * (zero tool-call nell'ultima risposta) — stesso stile PARITÀ/AL
 * CONTRARIO di ogni altro parametro di questo file.
 */
describe('talosLavora — codaMessaggiFn (FASE D, coda su una sessione in corso)', () => {
    function cartellaVuota(t) {
        const radice = mkdtempSync(join(tmpdir(), 'talos-harness-coda-'))
        t.after(() => rmSync(radice, { recursive: true, force: true }))
        return radice
    }

    function reteDiRisposte(...risposte) {
        const chiamate = []
        return {
            chiamate,
            fetch: async (url, opzioni) => {
                const indice = chiamate.length
                chiamate.push({ url, opzioni, corpo: JSON.parse(opzioni.body) })
                const scelta = risposte[Math.min(indice, risposte.length - 1)]
                return {
                    ok: true, status: 200,
                    json: async () => ({ choices: [{ message: scelta }], usage: { prompt_tokens: 10, completion_tokens: 5 } }),
                    text: async () => '',
                }
            },
        }
    }

    const TASK = { consegna: 'un compito qualunque, per la prova' }
    const CONCLUSO_SUBITO = { role: 'assistant', content: 'fatto', tool_calls: [] }
    const CHIAMA_SCRIVI = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'scrivi', arguments: '{"percorso":"nuovo.txt","contenuto":"ciao"}' } }] }

    it('⭐⭐⭐ PARITÀ — codaMessaggiFn assente, esito bit-per-bit identico a oggi', async () => {
        const cartella = cartellaVuota(it)
        const reteA = reteDiRisposte(CONCLUSO_SUBITO)
        const reteB = reteDiRisposte(CONCLUSO_SUBITO)
        const senzaNulla = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: reteA.fetch })
        const conParametroAssente = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: reteB.fetch, codaMessaggiFn: undefined })
        assert.deepEqual(conParametroAssente, senzaNulla)
        assert.equal(reteA.chiamate.length, 1, 'un solo giro: nessuna coda, il modello conclude e basta')
    })

    it('⭐⭐⭐ un messaggio in coda diventa un turno utente VERO, il ciclo continua invece di fermarsi', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CONCLUSO_SUBITO, CONCLUSO_SUBITO)
        let chiamate = 0
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            codaMessaggiFn: () => { chiamate += 1; return chiamate === 1 ? 'un secondo messaggio vero dall\'owner' : null },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(rete.chiamate.length, 2, 'due giri REALI al modello: il primo concluso, il secondo dopo la coda')
        const secondoMessaggioMandato = rete.chiamate[1].corpo.messages.at(-1)
        assert.deepEqual(secondoMessaggioMandato, { role: 'user', content: 'un secondo messaggio vero dall\'owner' })
        assert.equal(chiamate, 2, 'la coda è stata interpellata due volte: una che consegna, una che la trova vuota')
    })

    it('⛔⛔ AL CONTRARIO — codaMessaggiFn NON è MAI chiamata mentre il modello sta ancora facendo tool-call', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CHIAMA_SCRIVI, CONCLUSO_SUBITO)
        let chiamateAllaCoda = 0
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            codaMessaggiFn: () => { chiamateAllaCoda += 1; return null },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(chiamateAllaCoda, 1, 'interpellata una volta sola — al giro CONCLUSO_SUBITO, mai al giro con la tool-call scrivi')
    })

    it('⭐⭐ AL CONTRARIO — una coda che drena a più riprese consegna OGNI messaggio, uno per punto di conclusione', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CONCLUSO_SUBITO, CONCLUSO_SUBITO, CONCLUSO_SUBITO)
        const coda = ['primo messaggio in coda', 'secondo messaggio in coda']
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            codaMessaggiFn: () => coda.shift() ?? null,
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(rete.chiamate.length, 3, 'tre giri reali: concluso, coda 1, coda 2 — poi si ferma per davvero')
        assert.deepEqual(rete.chiamate[1].corpo.messages.at(-1), { role: 'user', content: 'primo messaggio in coda' })
        assert.deepEqual(rete.chiamate[2].corpo.messages.at(-1), { role: 'user', content: 'secondo messaggio in coda' })
    })

    it('⛔⛔⛔ AL CONTRARIO — codaMessaggiFn che LANCIA non rompe il task: trattata come coda vuota, il task si conclude comunque', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            codaMessaggiFn: () => { throw new Error('il canale della coda è caduto') },
        })
        assert.equal(esito.comeFinita, 'concluso', 'un cancello rotto non deve MAI bloccare/rompere un task altrimenti riuscito')
        assert.equal(rete.chiamate.length, 1)
    })

    it('⛔ AL CONTRARIO — codaMessaggiFn che torna stringa vuota/spazi conta come "nessun messaggio", mai un turno utente vuoto', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            codaMessaggiFn: () => '',
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(rete.chiamate.length, 1, 'una stringa vuota è falsy: nessun secondo giro, nessun turno utente vuoto mandato al modello')
    })
})

/*
 * ⭐⭐⭐ 28/8 — LA PILLOLA PERMESSI (piano elegant-spinning-dongarra.md,
 * owner: "read only/workspace write/on request/full access"). Due
 * parametri nuovi su talosLavora, `livelloAccesso`/`chiediApprovazioneFn`
 * — stesso stile PARITÀ/AL CONTRARIO di ogni altro parametro di questa
 * lista, vedi doc su `verificaPermessoScrittura` in talosHarness.mjs.
 */
describe('talosLavora — verificaPermessoScrittura (livelloAccesso/chiediApprovazioneFn), opzionali per costruzione', () => {
    function cartellaVuota(t) {
        const radice = mkdtempSync(join(tmpdir(), 'talos-harness-permessi-'))
        t.after(() => rmSync(radice, { recursive: true, force: true }))
        return radice
    }

    function reteDiRisposte(...risposte) {
        const chiamate = []
        return {
            chiamate,
            fetch: async (url, opzioni) => {
                const indice = chiamate.length
                chiamate.push({ url, opzioni, corpo: JSON.parse(opzioni.body) })
                const scelta = risposte[Math.min(indice, risposte.length - 1)]
                return {
                    ok: true, status: 200,
                    json: async () => ({ choices: [{ message: scelta }], usage: { prompt_tokens: 10, completion_tokens: 5 } }),
                    text: async () => '',
                }
            },
        }
    }

    const TASK = { consegna: 'un compito qualunque, per la prova' }
    const CONCLUSO_SUBITO = { role: 'assistant', content: 'fatto', tool_calls: [] }
    const CHIAMA_SCRIVI = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'scrivi', arguments: '{"percorso":"nuovo.txt","contenuto":"ciao"}' } }] }
    const CHIAMA_SHELL = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'shell', arguments: '{"comando":"echo segno>marker.txt"}' } }] }
    const CHIAMA_DOCUMENTO = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'document_create', arguments: '{"format":"markdown","title":"t","body":"b"}' } }] }
    const CHIAMA_IMMAGINE = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'generate_image', arguments: '{"prompt":"un gatto rosso"}' } }] }
    const CHIAMA_LEGGI = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'leggi', arguments: '{"percorso":"gia-presente.txt"}' } }] }
    const CHIAMA_PROVA = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'prova', arguments: '{}' } }] }

    it('⭐⭐⭐ PARITÀ — livelloAccesso/chiediApprovazioneFn assenti, esito bit-per-bit identico a oggi', async () => {
        const cartella = cartellaVuota(it)
        const reteA = reteDiRisposte(CONCLUSO_SUBITO)
        const reteB = reteDiRisposte(CONCLUSO_SUBITO)
        const senzaNulla = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: reteA.fetch })
        const conParametriAssenti = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: reteB.fetch,
            livelloAccesso: undefined, chiediApprovazioneFn: undefined,
        })
        assert.deepEqual(conParametriAssenti, senzaNulla)
    })

    it('⛔⛔⛔ livelloAccesso:\'lettura\' rifiuta scrivi — REFUSED, il file NON esiste sul disco', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CHIAMA_SCRIVI, CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, livelloAccesso: 'lettura' })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /^REFUSED\./)
        assert.match(messaggioTool.content, /sola lettura/)
        assert.equal(existsSync(join(cartella, 'nuovo.txt')), false, 'la sessione è read-only: nessun file nuovo sul disco')
    })

    it('⛔⛔⛔ livelloAccesso:\'lettura\' rifiuta shell — REFUSED, il comando NON è mai girato (nessun marker.txt)', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CHIAMA_SHELL, CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, livelloAccesso: 'lettura' })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /^REFUSED\./)
        assert.equal(existsSync(join(cartella, 'marker.txt')), false, 'il comando non deve MAI essere eseguito in sola lettura')
    })

    it('⛔⛔⛔ livelloAccesso:\'lettura\' rifiuta document_create — REFUSED, onDocumento MAI chiamata', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CHIAMA_DOCUMENTO, CONCLUSO_SUBITO)
        let chiamataOnDocumento = false
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, livelloAccesso: 'lettura',
            strumentiEstesi: ['document_create'], onDocumento: async () => { chiamataOnDocumento = true; return { ok: true, esito: 'creato' } },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(chiamataOnDocumento, false, 'onDocumento non va MAI chiamata se il permesso rifiuta prima')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /^REFUSED\./)
    })

    it('⛔⛔⛔ FASE H — livelloAccesso:\'lettura\' rifiuta generate_image — REFUSED, onImmagine MAI chiamata', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CHIAMA_IMMAGINE, CONCLUSO_SUBITO)
        let chiamataOnImmagine = false
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, livelloAccesso: 'lettura',
            strumentiEstesi: ['generate_image'], onImmagine: async () => { chiamataOnImmagine = true; return { ok: true, esito: 'creata' } },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(chiamataOnImmagine, false, 'onImmagine non va MAI chiamata se il permesso rifiuta prima')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /^REFUSED\./)
    })

    it('⛔⛔⛔ 28/8, review ledger permessi §2.5/§7.E — livelloAccesso:\'lettura\' rifiuta prova — REFUSED, il comando NON è mai girato (nessun marker-prova.txt)', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CHIAMA_PROVA, CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            livelloAccesso: 'lettura', comandoProva: 'echo segno>marker-prova.txt',
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /^REFUSED\./)
        assert.equal(existsSync(join(cartella, 'marker-prova.txt')), false, 'prova non deve MAI girare in sola lettura — stesso trattamento di shell')
    })

    // ⭐⭐⭐ Ledger permessi §7.B, 28/8 — il vocabolario a quattro valori: 'scrittura-area'.
    it('⭐⭐⭐ livelloAccesso:\'scrittura-area\' CONSENTE scrivi dentro il workspace', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CHIAMA_SCRIVI, CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, livelloAccesso: 'scrittura-area' })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(existsSync(join(cartella, 'nuovo.txt')), true, 'un percorso dentro il workspace deve scrivere per davvero')
    })

    it('⛔⛔⛔ e AL CONTRARIO — livelloAccesso:\'scrittura-area\' RIFIUTA scrivi che esce dal workspace (../fuori.txt)', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_SCRIVI_FUORI = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'scrivi', arguments: '{"percorso":"../fuori.txt","contenuto":"ciao"}' } }] }
        const rete = reteDiRisposte(CHIAMA_SCRIVI_FUORI, CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, livelloAccesso: 'scrittura-area' })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /^REFUSED\./)
        assert.match(messaggioTool.content, /non risolve dentro il workspace/)
        assert.equal(existsSync(join(dirname(cartella), 'fuori.txt')), false, 'niente deve finire fuori dal workspace')
    })

    it('⛔⛔ e AL CONTRARIO — livelloAccesso:\'scrittura-area\' RIFIUTA shell (un controllo di percorso non vede dove un comando esce)', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CHIAMA_SHELL, CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, livelloAccesso: 'scrittura-area' })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /^REFUSED\./)
        assert.equal(existsSync(join(cartella, 'marker.txt')), false)
    })

    // ⭐⭐⭐ Ledger permessi §7.B — 'su-richiesta': come chiediApprovazioneFn presente, ma SELEZIONABILE senza.
    it('⛔⛔⛔ livelloAccesso:\'su-richiesta\' SENZA chiediApprovazioneFn: fail-closed, REFUSED (nessun canale attivo)', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CHIAMA_SCRIVI, CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, livelloAccesso: 'su-richiesta' })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /^REFUSED\./)
        assert.match(messaggioTool.content, /livello di accesso: su-richiesta/)
        assert.match(messaggioTool.content, /non ha un canale di approvazione attivo/)
        assert.equal(existsSync(join(cartella, 'nuovo.txt')), false)
    })

    it('⭐⭐⭐ e AL CONTRARIO — livelloAccesso:\'su-richiesta\' CON chiediApprovazioneFn(true) consente per davvero', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CHIAMA_SCRIVI, CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            livelloAccesso: 'su-richiesta', chiediApprovazioneFn: async () => true,
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(existsSync(join(cartella, 'nuovo.txt')), true)
    })

    /*
     * ⛔⛔⛔ O-35, owner 06/9: «se clicco "Per questa sessione" continua a chiedermi permesso anche
     *   con full access completamente acceso». La colpa era una clausola che diceva «se esiste un
     *   canale di approvazione, chiedi comunque»: bastava UN attrezzo su «chiedi» perché tutti gli
     *   altri chiedessero, e «Accesso completo» diventava una parola vuota. Chi decide è il LIVELLO,
     *   non l'esistenza del canale — e questa prova lo tiene fermo.
     */
    it('⭐⭐⭐ O-35 — «Per questa sessione»: con accesso pieno e l\'attrezzo su «sempre» NON si chiede più', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CHIAMA_SCRIVI, CONCLUSO_SUBITO)
        let quanteVolteHaChiesto = 0
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            livelloAccesso: 'accesso-pieno',
            // il canale ESISTE (un altro attrezzo è su «chiedi»), ed è proprio questo che prima rovinava tutto
            chiediApprovazioneFn: async () => { quanteVolteHaChiesto += 1; return true },
            permessiPerAttrezzo: { scrivi: 'sempre', shell: 'chiedi' },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(existsSync(join(cartella, 'nuovo.txt')), true, 'il file va scritto')
        assert.equal(quanteVolteHaChiesto, 0, 'con «sempre» su questo attrezzo il permesso non si chiede: era il difetto di O-35')
    })

    it('⭐⭐ O-35 AL CONTRARIO — lo stesso attrezzo su «chiedi» il permesso lo chiede eccome', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CHIAMA_SCRIVI, CONCLUSO_SUBITO)
        let quanteVolteHaChiesto = 0
        await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            livelloAccesso: 'accesso-pieno',
            chiediApprovazioneFn: async () => { quanteVolteHaChiesto += 1; return true },
            permessiPerAttrezzo: { scrivi: 'chiedi' },
        })
        assert.equal(quanteVolteHaChiesto, 1, 'senza questa metà, la prova sopra passerebbe anche con i permessi spenti del tutto')
    })

    it('⭐⭐ PARITÀ — livelloAccesso:\'accesso-pieno\' si comporta ESATTAMENTE come nessun livelloAccesso', async () => {
        const cartella = cartellaVuota(it)
        const reteA = reteDiRisposte(CHIAMA_SCRIVI, CONCLUSO_SUBITO)
        const reteB = reteDiRisposte(CHIAMA_SCRIVI, CONCLUSO_SUBITO)
        const conAccessoPieno = await talosLavora({ cartella: cartellaVuota(it), task: TASK, modello: 'x', chiave: 'y', fetchDiRete: reteA.fetch, livelloAccesso: 'accesso-pieno' })
        const senzaLivello = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: reteB.fetch })
        assert.equal(conAccessoPieno.comeFinita, senzaLivello.comeFinita)
        assert.equal(conAccessoPieno.premesseNegate, senzaLivello.premesseNegate)
    })

    // ⭐⭐⭐ Ledger permessi §7.C — il floor incondizionato: nessun livello lo scavalca.
    it('⛔⛔⛔ il floor di comandoSenzaRecupero nega shell ANCHE con accesso-pieno e chiediApprovazioneFn che approverebbe', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_SHELL_PERICOLOSA = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'shell', arguments: JSON.stringify({ comando: 'rm -rf /' }) } }] }
        const rete = reteDiRisposte(CHIAMA_SHELL_PERICOLOSA, CONCLUSO_SUBITO)
        let chiestoApprovazione = false
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            livelloAccesso: 'accesso-pieno', chiediApprovazioneFn: async () => { chiestoApprovazione = true; return true },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(chiestoApprovazione, false, 'il floor nega PRIMA del cancello normale: non chiede nemmeno')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /^REFUSED\./)
        assert.match(messaggioTool.content, /no recovery path/)
    })

    // ⭐⭐⭐ FASE D, primo incremento — integrazione VERA: onGiro riceve una ricevuta reale, non solo la funzione pura testata da sola sopra.
    it('⭐⭐⭐ una scrivi CONSENTITA emette una ricevuta reale via onGiro, hash del contenuto vero', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CHIAMA_SCRIVI, CONCLUSO_SUBITO)
        const ricevute = []
        await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            onGiro(e) { if (e.tipo === 'ricevuta') ricevute.push(e.ricevuta) },
        })
        assert.equal(ricevute.length, 1)
        assert.equal(ricevute[0].azione, 'scrivi')
        assert.equal(ricevute[0].percorso, 'nuovo.txt')
        assert.equal(ricevute[0].consentito, true)
        assert.equal(ricevute[0].via, 'nessun-vincolo')
        assert.equal(ricevute[0].hashContenuto, createHash('sha256').update('ciao').digest('hex'), 'hash del contenuto VERO scritto sul disco, non un valore a caso')
        /*
         * ⭐⭐⭐ 29/8 — la postcondizione: prova che il SITO DI CHIAMATA
         * legge davvero il verdetto di postcondizioneDiScrivi() e lo passa
         * a creaRicevutaOperazione — non solo che le due funzioni, isolate,
         * si comportano bene da sole (la stessa lezione della verifica
         * precedente su prova/shell). Rilettura VERA dal disco reale.
         */
        assert.equal(ricevute[0].postcondizione, 'retta', 'una scrittura pulita, riletta subito dopo dal disco vero, deve tornare retta')
        assert.equal(ricevute[0].verified, true)
    })

    /*
     * ⭐⭐⭐ 29/8 — prova che talosLavora legga davvero il parametro `firma`
     * e lo passi a OGNI ricevuta del giro, non solo che creaRicevutaOperazione
     * da sola sappia firmare (gia' provato altrove) — lo stesso gap di
     * wiring gia' trovato e corretto per evidence/postcondizione.
     */
    it('⭐⭐⭐ talosLavora con firma: la ricevuta REALE (via onGiro) verifica con la chiave pubblica vera', async () => {
        const cartella = cartellaVuota(it)
        const chiavi = generaChiaviFirmaRicevute()
        const rete = reteDiRisposte(CHIAMA_SCRIVI, CONCLUSO_SUBITO)
        const ricevute = []
        await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            firma: { chiavePrivata: chiavi.chiavePrivata, keyId: chiavi.keyId },
            onGiro(e) { if (e.tipo === 'ricevuta') ricevute.push(e.ricevuta) },
        })
        assert.equal(ricevute.length, 1)
        assert.equal(ricevute[0].keyId, chiavi.keyId)
        assert.equal(verificaFirmaRicevuta(ricevute[0], chiavi.chiavePubblica), true, 'la ricevuta VERA, uscita dal vero ciclo di talosLavora, deve verificare')
    })

    /*
     * ⭐⭐⭐ 29/8 — FASE D, trifecta: prova che talosLavora ACCUMULA la
     * catena attraverso PIÙ chiamate reali, non solo che le funzioni
     * pure la calcolino bene isolate — lo stesso gap di wiring già
     * trovato e corretto per evidence/postcondizione/firma/action.
     * Tre chiamate VERE in sequenza (scrivi, poi shell, poi shell): la
     * terza deve chiudere la trifecta usando la storia delle prime due.
     */
    it('⭐⭐⭐ talosLavora accumula la catena attraverso chiamate VERE: scrivi poi shell poi shell chiude la trifecta alla terza', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_TRE_IN_SEQUENZA = {
            role: 'assistant', content: null, tool_calls: [
                { id: 'call_1', function: { name: 'scrivi', arguments: JSON.stringify({ percorso: 'nuovo.txt', contenuto: 'ciao' }) } },
                { id: 'call_2', function: { name: 'shell', arguments: JSON.stringify({ comando: 'echo primo>marker1.txt' }) } },
                { id: 'call_3', function: { name: 'shell', arguments: JSON.stringify({ comando: 'echo secondo>marker2.txt' }) } },
            ],
        }
        const rete = reteDiRisposte(CHIAMA_TRE_IN_SEQUENZA, CONCLUSO_SUBITO)
        const ricevute = []
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            onGiro(e) { if (e.tipo === 'ricevuta') ricevute.push(e.ricevuta) },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(ricevute.length, 3)
        // scrivi: catena era vuota all'inizio del task — nessuna storia da ereditare.
        assert.equal(ricevute[0].azione, 'scrivi')
        assert.equal(ricevute[0].trifecta, false)
        assert.equal(ricevute[0].risk, 'R1')
        // shell #1: eredita SOLO privateDataSeen (da scrivi) — untrustedSeen ancora falso
        // in QUESTO momento (shell lo dichiara ma solo per i giri FUTURI, non per se stesso).
        assert.equal(ricevute[1].azione, 'shell')
        assert.equal(ricevute[1].trifecta, false, 'due condizioni su tre non bastano ancora')
        assert.equal(ricevute[1].risk, 'R3', 'R2 base + un gradino per privateDataSeen ereditato da scrivi')
        // shell #2: ora la catena porta ANCHE untrustedSeen (contribuito dalla shell #1 riuscita) — chiude.
        assert.equal(ricevute[2].azione, 'shell')
        assert.equal(ricevute[2].trifecta, true, 'la storia delle prime due chiamate chiude la trifecta sulla terza')
        assert.equal(ricevute[2].risk, 'R4', 'R2 base + due gradini: entrambe le condizioni ereditate')
    })

    /*
     * ⭐⭐⭐ 29/8 — FASE D, il buco vero trovato leggendo il sito di chiamata:
     * un'eccezione VERA (non simulata a mano — `disco` non e iniettabile,
     * vedi discoNode.ts, sempre il vero node:fs) dentro il ramo di un
     * attrezzo spariva senza lasciare NESSUNA ricevuta. EISDIR e' l'errore
     * piu' affidabile e portabile da forzare per davvero: scrivere su un
     * percorso che e' GIA' una directory fallisce sempre, su ogni piattaforma
     * Node supporta — nessun mock, nessuna eccezione iniettata a mano.
     */
    it('⭐⭐⭐ scrivi che INCONTRA UN\'ECCEZIONE VERA (EISDIR): emette comunque una ricevuta, status:\'failed\', mai silenziosa', async () => {
        const cartella = cartellaVuota(it)
        mkdirSync(join(cartella, 'era-una-cartella'))
        const CHIAMA_SCRIVI_SU_DIRECTORY = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'scrivi', arguments: JSON.stringify({ percorso: 'era-una-cartella', contenuto: 'ciao' }) } }] }
        const rete = reteDiRisposte(CHIAMA_SCRIVI_SU_DIRECTORY, CONCLUSO_SUBITO)
        const ricevute = []
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            onGiro(e) { if (e.tipo === 'ricevuta') ricevute.push(e.ricevuta) },
        })
        assert.equal(esito.comeFinita, 'concluso', 'un tool fallito non deve mai interrompere il task: il modello riceve il testo e decide lui')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /^error:/, 'il testo per il modello resta quello di sempre — questo incremento aggiunge la ricevuta, non cambia il messaggio')
        assert.equal(ricevute.length, 1, 'PRIMA di questo incremento qui non ce ne sarebbe stata NESSUNA: un\'eccezione a metà ramo spariva senza lasciare traccia')
        assert.equal(ricevute[0].azione, 'scrivi')
        assert.equal(ricevute[0].percorso, 'era-una-cartella')
        assert.equal(ricevute[0].status, 'failed')
        assert.equal(ricevute[0].consentito, true, 'il permesso era stato concesso per davvero: e\' l\'esecuzione a essersi rotta, non un rifiuto')
        // ⭐⭐⭐ 29/8 — spostato da evidence?.error al campo error dedicato,
        // la casa giusta (vedi creaRicevutaOperazione).
        assert.ok(ricevute[0].error, 'il messaggio VERO dell\'eccezione, non un placeholder')
        assert.equal(ricevute[0].evidence, null, 'niente altro da dire qui: l\'unico dato era il messaggio, ora in error')
    })

    it('⛔⛔⛔ e AL CONTRARIO — una scrivi RIFIUTATA emette comunque una ricevuta, consentito:false, hashContenuto:null', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CHIAMA_SCRIVI, CONCLUSO_SUBITO)
        const ricevute = []
        await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, livelloAccesso: 'lettura',
            onGiro(e) { if (e.tipo === 'ricevuta') ricevute.push(e.ricevuta) },
        })
        assert.equal(ricevute.length, 1, 'un rifiuto è un fatto verificabile quanto un successo: la ricevuta esiste comunque')
        assert.equal(ricevute[0].consentito, false)
        assert.equal(ricevute[0].via, 'livello-lettura')
        assert.equal(ricevute[0].hashContenuto, null)
    })

    it('⭐⭐ il floor di SS7.C emette una ricevuta con via:\'floor-comando-senza-recupero\', distinta dal cancello normale', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_SHELL_PERICOLOSA = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'shell', arguments: JSON.stringify({ comando: 'rm -rf /' }) } }] }
        const rete = reteDiRisposte(CHIAMA_SHELL_PERICOLOSA, CONCLUSO_SUBITO)
        const ricevute = []
        await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            onGiro(e) { if (e.tipo === 'ricevuta') ricevute.push(e.ricevuta) },
        })
        assert.equal(ricevute.length, 1)
        assert.equal(ricevute[0].azione, 'shell')
        assert.equal(ricevute[0].consentito, false)
        assert.equal(ricevute[0].via, 'floor-comando-senza-recupero')
    })

    it('⭐⭐⭐ AL CONTRARIO — chiediApprovazioneFn(true) CONSENTE prova, con l\'azione VERA {tipo,comando}', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CHIAMA_PROVA, CONCLUSO_SUBITO)
        const azioniViste = []
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            comandoProva: 'echo segno>marker-prova.txt',
            // 06/9: la politica si dichiara come LIVELLO — il canale è il mezzo, non la regola (vedi vaChiesto)
            livelloAccesso: 'su-richiesta',
            chiediApprovazioneFn: async (azione) => { azioniViste.push(azione); return true },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.deepEqual(azioniViste, [{ tipo: 'prova', comando: 'echo segno>marker-prova.txt' }])
        assert.equal(existsSync(join(cartella, 'marker-prova.txt')), true, 'con il consenso, prova gira davvero')
    })

    /*
     * ⭐⭐⭐ 29/8 — FASE D, evidence: integrazione VERA, non solo la funzione
     * pura già testata sopra (§'creaRicevutaOperazione'). Il gap che quella
     * prova da sola non vede: `p` è hoisted fuori dal ramo `else` che lo
     * produce (vedi il sorgente, 'prova'/'shell') — qui si prova che la
     * lettura funzioni DAVVERO nel percorso reale di talosLavora, con un
     * comando che gira per davvero e un exit code vero, non passato a mano.
     */
    it('⭐⭐⭐ prova CONSENTITA: evidence.exitCode è quello VERO del comando eseguito, non un valore passato a mano', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CHIAMA_PROVA, CONCLUSO_SUBITO)
        const ricevute = []
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            comandoProva: 'echo segno>marker-prova2.txt',
            onGiro(e) { if (e.tipo === 'ricevuta') ricevute.push(e.ricevuta) },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(existsSync(join(cartella, 'marker-prova2.txt')), true, 'il comando è girato per davvero, non solo dichiarato')
        assert.equal(ricevute.length, 1)
        assert.equal(ricevute[0].azione, 'prova')
        assert.ok(ricevute[0].evidence, 'un comando che gira per davvero deve lasciare un evidence, non null')
        assert.equal(ricevute[0].evidence.exitCode, 0, 'exit 0 VERO del processo appena girato, non un default inventato')
    })

    it('⛔⛔⛔ e AL CONTRARIO — prova RIFIUTATA (sola lettura): evidence resta null, nessun processo è mai partito', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CHIAMA_PROVA, CONCLUSO_SUBITO)
        const ricevute = []
        await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, livelloAccesso: 'lettura',
            comandoProva: 'echo segno>marker-prova3.txt',
            onGiro(e) { if (e.tipo === 'ricevuta') ricevute.push(e.ricevuta) },
        })
        assert.equal(existsSync(join(cartella, 'marker-prova3.txt')), false, 'REFUSED per davvero: il comando non è mai partito')
        assert.equal(ricevute.length, 1)
        assert.equal(ricevute[0].consentito, false)
        assert.equal(ricevute[0].evidence, null, 'nessun processo è mai partito: evidence non può inventare un exitCode che non esiste')
    })

    it('⭐⭐⭐ shell CONSENTITA: evidence porta exitCode E sandboxEnforcement VERI, non solo azione/comando', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CHIAMA_SHELL, CONCLUSO_SUBITO)
        const ricevute = []
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            onGiro(e) { if (e.tipo === 'ricevuta') ricevute.push(e.ricevuta) },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(existsSync(join(cartella, 'marker.txt')), true, 'il comando è girato per davvero, non solo dichiarato')
        assert.equal(ricevute.length, 1)
        assert.equal(ricevute[0].azione, 'shell')
        assert.ok(ricevute[0].evidence, 'un comando che gira per davvero deve lasciare un evidence, non null')
        assert.equal(ricevute[0].evidence.exitCode, 0, 'exit 0 VERO del processo appena girato, non un default inventato')
        // ⛔ il valore esatto ('none' o 'wsl2') dipende da quale distro WSL è
        // configurata sulla macchina che fa girare il test — mai
        // 'adb-shell-on-device' qui, 'mobile' non è passato a talosLavora.
        assert.ok(['none', 'wsl2'].includes(ricevute[0].evidence.sandboxEnforcement),
            `sandboxEnforcement inatteso, ne' locale ne' WSL: ${ricevute[0].evidence.sandboxEnforcement}`)
    })

    it('⭐⭐ AL CONTRARIO — livelloAccesso:\'lettura\' NON blocca le letture: leggi continua a funzionare', async () => {
        const cartella = cartellaVuota(it)
        writeFileSync(join(cartella, 'gia-presente.txt'), 'contenuto vero')
        const rete = reteDiRisposte(CHIAMA_LEGGI, CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, livelloAccesso: 'lettura' })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.equal(messaggioTool.content, 'contenuto vero', 'sola lettura non vuol dire nessuna capacità: leggi resta vera')
    })

    it('⭐⭐⭐ chiediApprovazioneFn(false) rifiuta scrivi con l\'azione VERA — {tipo,percorso} — e il file non esiste', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CHIAMA_SCRIVI, CONCLUSO_SUBITO)
        const azioniViste = []
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            // 06/9: la politica si dichiara come LIVELLO — il canale è il mezzo, non la regola (vedi vaChiesto)
            livelloAccesso: 'su-richiesta',
            chiediApprovazioneFn: async (azione) => { azioniViste.push(azione); return false },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.deepEqual(azioniViste, [{ tipo: 'scrivi', percorso: 'nuovo.txt', contenutoPrima: null, contenutoProposto: 'ciao' }])
        assert.equal(existsSync(join(cartella, 'nuovo.txt')), false)
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /non ha approvato/)
    })

    it('⭐⭐⭐ 28/8, ledger permessi §7.A — chiediApprovazioneFn su un file ESISTENTE riceve il contenuto VERO di prima, non null', async () => {
        const cartella = cartellaVuota(it)
        writeFileSync(join(cartella, 'nuovo.txt'), 'era già qui prima\n')
        const rete = reteDiRisposte(CHIAMA_SCRIVI, CONCLUSO_SUBITO)
        const azioniViste = []
        await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            // 06/9: la politica si dichiara come LIVELLO — il canale è il mezzo, non la regola (vedi vaChiesto)
            livelloAccesso: 'su-richiesta',
            chiediApprovazioneFn: async (azione) => { azioniViste.push(azione); return true },
        })
        assert.deepEqual(azioniViste, [{
            tipo: 'scrivi', percorso: 'nuovo.txt',
            contenutoPrima: 'era già qui prima\n', contenutoProposto: 'ciao',
        }])
    })

    it('⭐⭐⭐ chiediApprovazioneFn(true) CONSENTE scrivi — il file esiste davvero sul disco', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CHIAMA_SCRIVI, CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            // 06/9: la politica si dichiara come LIVELLO — il canale è il mezzo, non la regola (vedi vaChiesto)
            livelloAccesso: 'su-richiesta',
            chiediApprovazioneFn: async () => true,
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(readFileSync(join(cartella, 'nuovo.txt'), 'utf8'), 'ciao')
    })

    it('⛔⛔ AL CONTRARIO — chiediApprovazioneFn che LANCIA non autorizza in silenzio: rifiuta come un false esplicito', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CHIAMA_SCRIVI, CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            // 06/9: la politica si dichiara come LIVELLO — il canale è il mezzo, non la regola (vedi vaChiesto)
            livelloAccesso: 'su-richiesta',
            chiediApprovazioneFn: async () => { throw new Error('il canale di approvazione è caduto') },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(existsSync(join(cartella, 'nuovo.txt')), false, 'un cancello rotto non deve MAI tradursi in un consenso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /^REFUSED\./)
    })

    it('⛔⛔⛔ AL CONTRARIO — livelloAccesso:\'lettura\' vince SEMPRE su chiediApprovazioneFn, anche se approverebbe', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CHIAMA_SCRIVI, CONCLUSO_SUBITO)
        let chiamatoApprovazione = false
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            livelloAccesso: 'lettura', chiediApprovazioneFn: async () => { chiamatoApprovazione = true; return true },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(chiamatoApprovazione, false, 'in sola lettura il cancello di approvazione non va nemmeno interpellato')
        assert.equal(existsSync(join(cartella, 'nuovo.txt')), false)
    })
})

/*
 * ⭐⭐⭐ 28/8 — FASE B, piano `elegant-spinning-dongarra.md`: permesso
 * PER-ATTREZZO (`permessiPerAttrezzo`), un override più specifico di
 * `livelloAccesso` — vedi la doc su `verificaPermessoScrittura`. Stesso
 * stile PARITÀ/AL CONTRARIO del blocco sopra, stessi helper locali
 * (duplicati apposta: ogni describe di questo file tiene i propri, stessa
 * convenzione già in uso).
 */
describe('talosLavora — permessiPerAttrezzo (FASE B, override per-attrezzo)', () => {
    function cartellaVuota(t) {
        const radice = mkdtempSync(join(tmpdir(), 'talos-harness-permessi-attrezzo-'))
        t.after(() => rmSync(radice, { recursive: true, force: true }))
        return radice
    }

    function reteDiRisposte(...risposte) {
        const chiamate = []
        return {
            chiamate,
            fetch: async (url, opzioni) => {
                const indice = chiamate.length
                chiamate.push({ url, opzioni, corpo: JSON.parse(opzioni.body) })
                const scelta = risposte[Math.min(indice, risposte.length - 1)]
                return {
                    ok: true, status: 200,
                    json: async () => ({ choices: [{ message: scelta }], usage: { prompt_tokens: 10, completion_tokens: 5 } }),
                    text: async () => '',
                }
            },
        }
    }

    const TASK = { consegna: 'un compito qualunque, per la prova' }
    const CONCLUSO_SUBITO = { role: 'assistant', content: 'fatto', tool_calls: [] }
    const CHIAMA_SCRIVI = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'scrivi', arguments: '{"percorso":"nuovo.txt","contenuto":"ciao"}' } }] }
    const CHIAMA_SHELL = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'shell', arguments: '{"comando":"echo segno>marker.txt"}' } }] }

    it('⭐⭐⭐ PARITÀ — permessiPerAttrezzo assente/undefined/{} producono lo stesso esito di oggi', async () => {
        const casi = [undefined, 'omesso']
        const esiti = []
        for (const valore of casi) {
            const cartella = cartellaVuota(it)
            const rete = reteDiRisposte(CHIAMA_SCRIVI, CONCLUSO_SUBITO)
            const opzioni = { cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch }
            if (valore !== 'omesso') opzioni.permessiPerAttrezzo = valore
            const esito = await talosLavora(opzioni)
            esiti.push(esito.comeFinita)
            assert.equal(existsSync(join(cartella, 'nuovo.txt')), true, `permessiPerAttrezzo:${valore} deve scrivere come oggi`)
        }
        assert.deepEqual(esiti, ['concluso', 'concluso'])
    })

    it('⛔⛔⛔ override \'nega\' rifiuta scrivi anche SENZA livelloAccesso (che da solo permetterebbe) — file assente', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CHIAMA_SCRIVI, CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            permessiPerAttrezzo: { scrivi: 'nega' },
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /^REFUSED\./)
        assert.match(messaggioTool.content, /permesso per-attrezzo/)
        assert.equal(existsSync(join(cartella, 'nuovo.txt')), false)
    })

    it('⭐⭐⭐ override \'sempre\' CONSENTE scrivi anche con livelloAccesso:\'lettura\' (che da solo bloccherebbe) — file presente', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CHIAMA_SCRIVI, CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            livelloAccesso: 'lettura', permessiPerAttrezzo: { scrivi: 'sempre' },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(readFileSync(join(cartella, 'nuovo.txt'), 'utf8'), 'ciao')
    })

    it('⭐⭐⭐ override \'chiedi\' passa per chiediApprovazioneFn anche con livelloAccesso:\'lettura\' (bypassa il blocco) — approvato, consente', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CHIAMA_SCRIVI, CONCLUSO_SUBITO)
        let chiamatoApprovazione = false
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            livelloAccesso: 'lettura',
            permessiPerAttrezzo: { scrivi: 'chiedi' },
            chiediApprovazioneFn: async () => { chiamatoApprovazione = true; return true },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(chiamatoApprovazione, true, '\'chiedi\' deve interpellare il canale anche in sola lettura, a differenza del comportamento di base')
        assert.equal(readFileSync(join(cartella, 'nuovo.txt'), 'utf8'), 'ciao')
    })

    it('⛔⛔⛔ override \'chiedi\' SENZA chiediApprovazioneFn è FAIL-CLOSED — REFUSED, mai un sì implicito', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CHIAMA_SCRIVI, CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            // Nessun livelloAccesso, nessun chiediApprovazioneFn: da soli permetterebbero sempre.
            permessiPerAttrezzo: { scrivi: 'chiedi' },
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /^REFUSED\./)
        assert.match(messaggioTool.content, /non ha un canale di approvazione attivo/)
        assert.equal(existsSync(join(cartella, 'nuovo.txt')), false)
    })

    it('⭐⭐ AL CONTRARIO — un nome attrezzo INVENTATO non deve mai matchare silenziosamente un attrezzo vero', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CHIAMA_SCRIVI, CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            permessiPerAttrezzo: { strumento_inventato_che_non_esiste: 'nega' },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(readFileSync(join(cartella, 'nuovo.txt'), 'utf8'), 'ciao', 'una chiave inventata non deve influenzare "scrivi"')
    })

    it('⛔⛔ AL CONTRARIO — un valore non riconosciuto (refuso) non bypassa silenziosamente: cade sul comportamento base', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CHIAMA_SCRIVI, CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            livelloAccesso: 'lettura',
            permessiPerAttrezzo: { scrivi: 'SEMPRE' }, // refuso: maiuscolo, non uno dei tre letterali validi
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /^REFUSED\./)
        assert.match(messaggioTool.content, /sola lettura/, 'un valore non riconosciuto deve cadere sul cancello di livelloAccesso, mai su un consenso implicito')
        assert.equal(existsSync(join(cartella, 'nuovo.txt')), false)
    })

    it('⭐⭐⭐ Isolamento per-chiave — {shell:\'nega\'} blocca shell ma NON scrivi, nello stesso giro', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CHIAMA_SHELL, CHIAMA_SCRIVI, CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            permessiPerAttrezzo: { shell: 'nega' },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(existsSync(join(cartella, 'marker.txt')), false, 'shell è negato per-attrezzo')
        assert.equal(readFileSync(join(cartella, 'nuovo.txt'), 'utf8'), 'ciao', 'scrivi non è toccato dall\'override su shell')
    })

    /*
     * ⭐⭐⭐ 29/8, continuazione FASE D — ENFORCEMENT della trifecta, non più
     * solo osservativa (vedi la doc su `verificaPermessoScrittura`, la
     * costante `trifectaForzaConferma`). Tre chiamate VERE in sequenza
     * (scrivi, poi shell due volte — subprocess reali, non simulati),
     * `shell: 'sempre'` configurato: la TERZA chiamata deve accorgersi che
     * la trifecta si è chiusa e chiedere per davvero, anche se "sempre"
     * l'avrebbe approvata in silenzio. Stesso schema del test osservativo
     * di oggi (scrivi→shell→shell chiude alla terza), qui con un
     * chiediApprovazioneFn VERO che registra quando viene interpellato.
     */
    it('⭐⭐⭐⭐ ENFORCEMENT — shell:\'sempre\' auto-approva le prime due chiamate, la TERZA (trifecta chiusa) chiede per davvero', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_TRE_IN_SEQUENZA = {
            role: 'assistant', content: null, tool_calls: [
                { id: 'call_1', function: { name: 'scrivi', arguments: JSON.stringify({ percorso: 'nuovo.txt', contenuto: 'ciao' }) } },
                { id: 'call_2', function: { name: 'shell', arguments: JSON.stringify({ comando: 'echo primo>marker1.txt' }) } },
                { id: 'call_3', function: { name: 'shell', arguments: JSON.stringify({ comando: 'echo secondo>marker2.txt' }) } },
            ],
        }
        const rete = reteDiRisposte(CHIAMA_TRE_IN_SEQUENZA, CONCLUSO_SUBITO)
        const chiamateApprovazione = []
        const ricevute = []
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            permessiPerAttrezzo: { scrivi: 'sempre', shell: 'sempre' },
            chiediApprovazioneFn: async (azione) => { chiamateApprovazione.push(azione); return true },
            onGiro(e) { if (e.tipo === 'ricevuta') ricevute.push(e.ricevuta) },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(existsSync(join(cartella, 'marker1.txt')), true, 'la prima shell è girata per davvero')
        assert.equal(existsSync(join(cartella, 'marker2.txt')), true, 'la seconda shell (quella forzata) è girata per davvero DOPO l\'approvazione')
        assert.equal(chiamateApprovazione.length, 1, 'il cancello va interpellato UNA sola volta — solo sulla terza chiamata, non sulle prime due')
        assert.equal(chiamateApprovazione[0].tipo, 'shell')
        assert.equal(chiamateApprovazione[0].trifecta, true, 'la ragione VERA arriva al cancello — TalosToolConsentRequest.reason su mobile')
        assert.equal(ricevute[1].via, 'permesso-per-attrezzo-sempre', 'la prima shell: nessuna trifecta ancora, il "sempre" vale davvero')
        assert.equal(ricevute[2].via, 'trifecta-forza-conferma', 'la seconda shell: il "sempre" non basta più, e la ricevuta lo dice')
    })

    it('⛔⛔⛔ AL CONTRARIO — ENFORCEMENT: se il cancello RIFIUTA la riconferma forzata, la chiamata è REFUSED per davvero', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_TRE_IN_SEQUENZA = {
            role: 'assistant', content: null, tool_calls: [
                { id: 'call_1', function: { name: 'scrivi', arguments: JSON.stringify({ percorso: 'nuovo.txt', contenuto: 'ciao' }) } },
                { id: 'call_2', function: { name: 'shell', arguments: JSON.stringify({ comando: 'echo primo>marker1.txt' }) } },
                { id: 'call_3', function: { name: 'shell', arguments: JSON.stringify({ comando: 'echo secondo>marker2.txt' }) } },
            ],
        }
        const rete = reteDiRisposte(CHIAMA_TRE_IN_SEQUENZA, CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            permessiPerAttrezzo: { scrivi: 'sempre', shell: 'sempre' },
            chiediApprovazioneFn: async () => false,
        })
        assert.equal(esito.comeFinita, 'concluso', 'un rifiuto non deve mai far cadere il task: il modello riceve il testo e decide lui')
        assert.equal(existsSync(join(cartella, 'marker1.txt')), true, 'la prima shell (trifecta non ancora chiusa) resta approvata')
        assert.equal(existsSync(join(cartella, 'marker2.txt')), false, 'la terza chiamata (trifecta chiusa, cancello rifiuta) NON deve girare — questa è la protezione vera')
    })

    it('⭐⭐⭐ PARITÀ — shell:\'sempre\' SENZA mai chiudere la trifecta (una sola chiamata) resta silenzioso: il cancello non viene MAI interpellato', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CHIAMA_SHELL, CONCLUSO_SUBITO)
        let chiamatoApprovazione = false
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            permessiPerAttrezzo: { shell: 'sempre' },
            chiediApprovazioneFn: async () => { chiamatoApprovazione = true; return true },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(existsSync(join(cartella, 'marker.txt')), true)
        assert.equal(chiamatoApprovazione, false, 'una sola chiamata non chiude mai la trifecta da sola: "sempre" resta "sempre"')
    })

    /*
     * ⭐⭐⭐⭐⭐ 29/8 — LA REGRESSIONE VERA da non introdurre: TALOS-BANCO (il
     * banco di misura automatico) non passa MAI chiediApprovazioneFn — per
     * costruzione, non c'è una persona a rispondere. Se l'enforcement
     * toccasse anche il percorso "nessun-vincolo" (nessun override, nessun
     * canale), un task che chiude la trifecta comincerebbe a fallire in
     * silenzio su un corpus di misura che oggi passa. Questo test prova
     * che NON è successo: la stessa identica sequenza di sopra, ma senza
     * NESSUN permessiPerAttrezzo e NESSUN chiediApprovazioneFn, si
     * comporta ESATTAMENTE come prima di questo incremento.
     */
    it('⛔⛔⛔⛔⛔ AL CONTRARIO — TALOS-BANCO (nessun override, nessun canale di approvazione): la trifecta NON tocca "nessun-vincolo", zero regressione sul banco di misura', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_TRE_IN_SEQUENZA = {
            role: 'assistant', content: null, tool_calls: [
                { id: 'call_1', function: { name: 'scrivi', arguments: JSON.stringify({ percorso: 'nuovo.txt', contenuto: 'ciao' }) } },
                { id: 'call_2', function: { name: 'shell', arguments: JSON.stringify({ comando: 'echo primo>marker1.txt' }) } },
                { id: 'call_3', function: { name: 'shell', arguments: JSON.stringify({ comando: 'echo secondo>marker2.txt' }) } },
            ],
        }
        const rete = reteDiRisposte(CHIAMA_TRE_IN_SEQUENZA, CONCLUSO_SUBITO)
        const ricevute = []
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            onGiro(e) { if (e.tipo === 'ricevuta') ricevute.push(e.ricevuta) },
            // ⛔ deliberatamente: nessun permessiPerAttrezzo, nessun chiediApprovazioneFn — lo scenario reale di TALOS-BANCO.
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(existsSync(join(cartella, 'marker1.txt')), true)
        assert.equal(existsSync(join(cartella, 'marker2.txt')), true, 'anche la terza chiamata (trifecta chiusa) gira: nessun canale da interpellare, nessuna regressione sul banco automatico')
        assert.equal(ricevute[2].via, 'nessun-vincolo', 'lo stesso "via" di sempre — la trifecta non ha toccato questo percorso')
        assert.equal(ricevute[2].trifecta, true, 'la ricevuta REGISTRA comunque che la trifecta era chiusa (già FATTO oggi, osservativo) — solo l\'enforcement non si applica qui')
    })
})

/*
 * ⭐⭐⭐ 28/8 — FASE A (hook), piano `elegant-spinning-dongarra.md`. Ricerca:
 * Hermes ha hook "universali e attivi di default" su ogni tool
 * (https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks);
 * Codex CLI (installato, v0.149.1) ha 12 eventi PascalCase stabili
 * (`codex features list` → `hooks: stable=true`). `hookFn` è UN solo
 * parametro opzionale, stesso stile PARITÀ/AL CONTRARIO delle altre
 * liste di questo file.
 */
describe('talosLavora — hookFn (pre_tool_call/post_tool_call/session_start/session_end), opzionale per costruzione', () => {
    function cartellaVuota(t) {
        const radice = mkdtempSync(join(tmpdir(), 'talos-harness-hook-'))
        t.after(() => rmSync(radice, { recursive: true, force: true }))
        return radice
    }

    function reteDiRisposte(...risposte) {
        const chiamate = []
        return {
            chiamate,
            fetch: async (url, opzioni) => {
                const indice = chiamate.length
                chiamate.push({ url, opzioni, corpo: JSON.parse(opzioni.body) })
                const scelta = risposte[Math.min(indice, risposte.length - 1)]
                return {
                    ok: true, status: 200,
                    json: async () => ({ choices: [{ message: scelta }], usage: { prompt_tokens: 10, completion_tokens: 5 } }),
                    text: async () => '',
                }
            },
        }
    }

    const TASK = { consegna: 'un compito qualunque, per la prova hook' }
    const CONCLUSO_SUBITO = { role: 'assistant', content: 'fatto', tool_calls: [] }
    const CHIAMA_SCRIVI = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'scrivi', arguments: '{"percorso":"nuovo.txt","contenuto":"ciao"}' } }] }
    const CHIAMA_SHELL = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'shell', arguments: '{"comando":"echo segno>marker.txt"}' } }] }
    const CHIAMA_DOCUMENTO = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'document_create', arguments: '{"format":"markdown","title":"t","body":"b"}' } }] }
    const CHIAMA_IMMAGINE = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'generate_image', arguments: '{"prompt":"un gatto rosso"}' } }] }
    const CHIAMA_LEGGI = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'leggi', arguments: '{"percorso":"gia-presente.txt"}' } }] }

    it('⭐⭐⭐ PARITÀ — hookFn assente, esito bit-per-bit identico a oggi', async () => {
        const cartella = cartellaVuota(it)
        const reteA = reteDiRisposte(CONCLUSO_SUBITO)
        const reteB = reteDiRisposte(CONCLUSO_SUBITO)
        const senzaHook = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: reteA.fetch })
        const conHookAssente = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: reteB.fetch, hookFn: undefined })
        assert.deepEqual(conHookAssente, senzaHook)
    })

    it('⛔⛔⛔ pre_tool_call che rifiuta scrivi — REFUSED, il file NON esiste sul disco', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CHIAMA_SCRIVI, CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            hookFn: async (evento) => (evento.tipo === 'pre_tool_call' && evento.azione === 'scrivi' ? { consentito: false, motivo: 'bloccato da un hook di prova.' } : undefined),
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /^REFUSED\./)
        assert.match(messaggioTool.content, /bloccato da un hook di prova/)
        assert.equal(existsSync(join(cartella, 'nuovo.txt')), false, 'il pre-hook blocca PRIMA del cancello semantico: il file non deve esistere')
    })

    it('⛔⛔⛔ pre_tool_call che rifiuta shell — REFUSED, il comando NON è mai girato (nessun marker.txt)', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CHIAMA_SHELL, CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            hookFn: async (evento) => (evento.tipo === 'pre_tool_call' && evento.azione === 'shell' ? { consentito: false } : undefined),
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(existsSync(join(cartella, 'marker.txt')), false)
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /^REFUSED\./)
    })

    it('⛔⛔⛔ pre_tool_call che rifiuta document_create — REFUSED, onDocumento MAI chiamata', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CHIAMA_DOCUMENTO, CONCLUSO_SUBITO)
        let chiamataOnDocumento = false
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            strumentiEstesi: ['document_create'], onDocumento: async () => { chiamataOnDocumento = true; return { ok: true, esito: 'creato' } },
            hookFn: async (evento) => (evento.tipo === 'pre_tool_call' && evento.azione === 'document_create' ? { consentito: false } : undefined),
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(chiamataOnDocumento, false, 'onDocumento non va MAI chiamata se il pre-hook rifiuta prima')
    })

    it('⛔⛔⛔ FASE H — pre_tool_call che rifiuta generate_image — REFUSED, onImmagine MAI chiamata', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CHIAMA_IMMAGINE, CONCLUSO_SUBITO)
        let chiamataOnImmagine = false
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            strumentiEstesi: ['generate_image'], onImmagine: async () => { chiamataOnImmagine = true; return { ok: true, esito: 'creata' } },
            hookFn: async (evento) => (evento.tipo === 'pre_tool_call' && evento.azione === 'generate_image' ? { consentito: false } : undefined),
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(chiamataOnImmagine, false, 'onImmagine non va MAI chiamata se il pre-hook rifiuta prima')
    })

    it('⭐⭐ AL CONTRARIO — pre_tool_call che rifiuta una LETTURA (leggi) viene ignorato: la lettura riesce comunque', async () => {
        const cartella = cartellaVuota(it)
        writeFileSync(join(cartella, 'gia-presente.txt'), 'contenuto vero')
        const rete = reteDiRisposte(CHIAMA_LEGGI, CONCLUSO_SUBITO)
        const eventiVisti = []
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            hookFn: async (evento) => { eventiVisti.push(evento); return { consentito: false, motivo: 'un hook che prova (a torto) a bloccare una lettura' } },
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.equal(messaggioTool.content, 'contenuto vero', 'una lettura non è mai bloccabile da un hook: fuori scope per costruzione')
        assert.ok(eventiVisti.some((e) => e.tipo === 'pre_tool_call' && e.azione === 'leggi'), 'il pre_tool_call VIENE comunque chiamato anche su una lettura — "universale" come Hermes, solo il suo rifiuto è ignorato')
    })

    it('⭐⭐⭐ post_tool_call riceve l\'esito VERO di una scrittura riuscita', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CHIAMA_SCRIVI, CONCLUSO_SUBITO)
        const eventiPost = []
        await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            hookFn: async (evento) => { if (evento.tipo === 'post_tool_call') eventiPost.push(evento) },
        })
        assert.equal(eventiPost.length, 1)
        assert.equal(eventiPost[0].azione, 'scrivi')
        assert.match(eventiPost[0].esito, /^written: nuovo\.txt/)
    })

    it('⛔⛔ AL CONTRARIO — hookFn che LANCIA su pre_tool_call di un\'azione MUTANTE non autorizza comunque (stessa disciplina di chiediApprovazioneFn)', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CHIAMA_SCRIVI, CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            hookFn: async () => { throw new Error('il canale hook è caduto') },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(existsSync(join(cartella, 'nuovo.txt')), false, 'un hook rotto non deve MAI tradursi in un consenso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /^REFUSED\./)
    })

    it('⭐⭐ AL CONTRARIO — hookFn che LANCIA su una LETTURA non la blocca (l\'eccezione, come il rifiuto, è fuori scope per le letture)', async () => {
        const cartella = cartellaVuota(it)
        writeFileSync(join(cartella, 'gia-presente.txt'), 'contenuto vero')
        const rete = reteDiRisposte(CHIAMA_LEGGI, CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            hookFn: async () => { throw new Error('il canale hook è caduto') },
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.equal(messaggioTool.content, 'contenuto vero')
    })

    it('⭐⭐⭐ session_start/session_end chiamati esattamente una volta, con comeFinita coerente con l\'esito reale', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CONCLUSO_SUBITO)
        const eventi = []
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            hookFn: async (evento) => { eventi.push(evento) },
        })
        const iniziali = eventi.filter((e) => e.tipo === 'session_start')
        const finali = eventi.filter((e) => e.tipo === 'session_end')
        assert.equal(iniziali.length, 1)
        assert.deepEqual(iniziali[0], { tipo: 'session_start', task: TASK.consegna })
        assert.equal(finali.length, 1)
        assert.equal(finali[0].comeFinita, esito.comeFinita)
    })

    it('⭐⭐ un hook con consentito:true non blocca nulla — verifica positiva di base', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CHIAMA_SCRIVI, CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            hookFn: async () => ({ consentito: true }),
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(readFileSync(join(cartella, 'nuovo.txt'), 'utf8'), 'ciao')
    })
})

describe('⛔⛔⛔ 28/8, ledger Fase 3 §6-bis — la descrizione di shell dichiara il limite Bionic/glibc trovato sul device reale', () => {
    it('⭐ dichiara che il telefono non ha Node/npm/apt, prima che il modello ci sbatta contro', () => {
        const shell = ATTREZZI_OPENAI.find((a) => a.function.name === 'shell')
        assert.ok(shell, 'l\'attrezzo shell deve esistere nel catalogo esportato')
        assert.match(shell.function.description, /Node\/npm/)
        assert.match(shell.function.description, /Bionic/i)
        assert.match(shell.function.description, /[Dd]o not spend turns trying to install/)
    })
})

describe('formattaOraCorrente — pura, stesso formato del mobile (readTools.ts timeNow)', () => {
    it('⭐ weekday esplicito, fuso IANA, ISO — le tre cose che il difetto del 14/8 sul Pad aveva perso', () => {
        const testo = formattaOraCorrente(new Date('2026-08-14T10:30:00.000Z').getTime())
        assert.match(testo, /Friday/)
        assert.match(testo, /14 August 2026/)
        assert.match(testo, /ISO: 2026-08-14T10:30:00\.000Z/)
        // ⭐ il fuso è quello RISOLTO dalla macchina (Intl), mai una stringa scritta a mano.
        const fusoAtteso = Intl.DateTimeFormat().resolvedOptions().timeZone
        assert.ok(testo.includes(`(${fusoAtteso})`))
    })

    it('⛔ AL CONTRARIO — due epoche diverse producono testi diversi, non un formato statico che ignora l input', () => {
        const a = formattaOraCorrente(new Date('2026-01-01T00:00:00.000Z').getTime())
        const b = formattaOraCorrente(new Date('2026-12-31T23:59:00.000Z').getTime())
        assert.notEqual(a, b)
    })
})

/*
 * FASE E (29/8), piano elegant-spinning-dongarra.md - MCP client.
 * Stesso stile PARITA'/AL CONTRARIO di ogni altro parametro opzionale
 * di questo file (delega_sottotask/onDelega e' il precedente piu'
 * vicino: callback assente -> messaggio onesto, callback che lancia ->
 * errore onesto, mai un successo inventato). `toolMcp` e' sempre
 * passato nella forma GREZZA del protocollo (`{name, description,
 * inputSchema}`) - esattamente quello che elencaToolMcp+filtraToolMcp
 * (harness-ui/src/mcp-client.mjs, verificato dal vivo il 29/8 contro
 * il server ufficiale @modelcontextprotocol/server-filesystem) tornano.
 */
describe('talosLavora - tool MCP (FASE E, dispatch verso mcp-client.mjs)', () => {
    function cartellaVuota(t) {
        const radice = mkdtempSync(join(tmpdir(), 'talos-harness-mcp-'))
        t.after(() => rmSync(radice, { recursive: true, force: true }))
        return radice
    }

    function reteDiRisposte(...risposte) {
        const chiamate = []
        return {
            chiamate,
            fetch: async (url, opzioni) => {
                const indice = chiamate.length
                chiamate.push({ url, opzioni, corpo: JSON.parse(opzioni.body) })
                const scelta = risposte[Math.min(indice, risposte.length - 1)]
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        choices: [{ message: scelta }],
                        usage: { prompt_tokens: 10, completion_tokens: 5 },
                    }),
                    text: async () => '',
                }
            },
        }
    }

    const TASK = { consegna: 'un compito qualunque, per la prova' }
    const CONCLUSO_SUBITO = { role: 'assistant', content: 'fatto, nessun attrezzo serve', tool_calls: [] }
    const UN_TOOL_MCP = [{ name: 'read_file', description: 'legge un file', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } }]

    it('toolMcp: offerto al modello, avvolto nello schema OpenAI (name/description/parameters da inputSchema)', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, toolMcp: UN_TOOL_MCP })
        assert.equal(esito.comeFinita, 'concluso')
        const offerto = rete.chiamate[0].corpo.tools.find((t) => t.function.name === 'read_file')
        assert.ok(offerto, 'il tool MCP deve comparire fra quelli offerti al modello')
        assert.equal(offerto.function.description, 'legge un file')
        assert.deepEqual(offerto.function.parameters, UN_TOOL_MCP[0].inputSchema)
        assert.equal(rete.chiamate[0].corpo.tools.length, 8)
    })

    it('toolMcp SENZA chiamaToolMcpFn: messaggio onesto al modello, mai un tentativo silenzioso', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_MCP = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'read_file', arguments: '{"path":"/tmp/ciao.txt"}' } }] }
        const rete = reteDiRisposte(CHIAMA_MCP, CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, toolMcp: UN_TOOL_MCP })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /not configured/)
    })

    it('toolMcp CON chiamaToolMcpFn: nome/argomenti VERI arrivano intatti, il testo del content e la riga mostrata', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_MCP = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'read_file', arguments: '{"path":"/tmp/ciao.txt"}' } }] }
        const rete = reteDiRisposte(CHIAMA_MCP, CONCLUSO_SUBITO)
        const ricevuti = []
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, toolMcp: UN_TOOL_MCP,
            chiamaToolMcpFn: async (nome, argomenti) => { ricevuti.push({ nome, argomenti }); return { content: [{ type: 'text', text: 'contenuto vero, non un mock' }], isError: false } },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.deepEqual(ricevuti, [{ nome: 'read_file', argomenti: { path: '/tmp/ciao.txt' } }])
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.equal(messaggioTool.content, 'contenuto vero, non un mock')
    })

    it('AL CONTRARIO - un isError:true del tool MCP NON lancia: esito onesto, non un successo inventato', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_MCP = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'read_file', arguments: '{"path":"/tmp/non-esiste.txt"}' } }] }
        const rete = reteDiRisposte(CHIAMA_MCP, CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, toolMcp: UN_TOOL_MCP,
            chiamaToolMcpFn: async () => ({ content: [{ type: 'text', text: 'ENOENT: file non trovato' }], isError: true }),
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /^MCP tool error:/)
        assert.match(messaggioTool.content, /ENOENT: file non trovato/)
    })

    it('AL CONTRARIO - chiamaToolMcpFn che LANCIA: errore onesto, mai un successo inventato', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_MCP = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'read_file', arguments: '{"path":"/tmp/x.txt"}' } }] }
        const rete = reteDiRisposte(CHIAMA_MCP, CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, toolMcp: UN_TOOL_MCP,
            chiamaToolMcpFn: async () => { throw new Error('connessione al server MCP persa') },
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /MCP tool call failed: connessione al server MCP persa/)
    })

    it('AL CONTRARIO - PARITA: senza toolMcp, comportamento bit-per-bit quello di oggi (7 attrezzi, zero riferimenti MCP)', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(rete.chiamate[0].corpo.tools.length, 7)
        assert.ok(!rete.chiamate[0].corpo.tools.some((t) => t.function.name === 'read_file'))
    })

    it('AL CONTRARIO - un nome che non e ne un attrezzo base ne in toolMcp resta "unknown tool", non un errore MCP', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_IGNOTO = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'nome_inventato_di_sicuro', arguments: '{}' } }] }
        const rete = reteDiRisposte(CHIAMA_IGNOTO, CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, toolMcp: UN_TOOL_MCP,
            chiamaToolMcpFn: async () => ({ content: [], isError: false }),
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.equal(messaggioTool.content, 'unknown tool: nome_inventato_di_sicuro')
    })
})

describe('formattaEsitoMcp - pura, traduce {content,isError} del protocollo MCP in una stringa', () => {
    it('un blocco di testo: torna il testo, isError assente trattato come successo', () => {
        const testo = formattaEsitoMcp({ content: [{ type: 'text', text: 'contenuto vero' }] })
        assert.equal(testo, 'contenuto vero')
    })

    it('piu blocchi di testo: uniti con un a-capo, in ordine', () => {
        const testo = formattaEsitoMcp({ content: [{ type: 'text', text: 'prima riga' }, { type: 'text', text: 'seconda riga' }] })
        assert.equal(testo, 'prima riga\nseconda riga')
    })

    it('AL CONTRARIO - un blocco non testuale non sparisce: diventa una riga onesta, mai un vuoto silenzioso', () => {
        const testo = formattaEsitoMcp({ content: [{ type: 'image', data: 'base64...', mimeType: 'image/png' }] })
        assert.equal(testo, '[image non testuale omesso]')
    })

    it('AL CONTRARIO - isError:true antepone un prefisso onesto, mai un successo travestito', () => {
        const testo = formattaEsitoMcp({ content: [{ type: 'text', text: 'ENOENT' }], isError: true })
        assert.equal(testo, 'MCP tool error: ENOENT')
    })

    it('AL CONTRARIO - content assente o vuoto: stringa onesta, mai undefined o una eccezione', () => {
        assert.equal(formattaEsitoMcp({ content: [] }), '(empty result)')
        assert.equal(formattaEsitoMcp({}), '(empty result)')
        assert.equal(formattaEsitoMcp(null), '(empty result)')
    })

    it('AL CONTRARIO - isError:true senza testo: dice onestamente che manca il dettaglio, mai una stringa vuota', () => {
        assert.equal(formattaEsitoMcp({ content: [], isError: true }), 'MCP tool error: (no error detail)')
    })
})

/*
 * FASE F (29/8), piano elegant-spinning-dongarra.md - Skills. Stesso
 * stile PARITA'/AL CONTRARIO di FASE E sopra (toolMcp e' il precedente
 * piu' vicino: callback assente -> messaggio onesto, callback che
 * lancia -> errore onesto). Differenza di forma: UN tool solo
 * (carica_skill), non uno per voce - il modello sceglie da un menu.
 */
describe('talosLavora - skills (FASE F, dispatch verso skill-registry.mjs)', () => {
    function cartellaVuota(t) {
        const radice = mkdtempSync(join(tmpdir(), 'talos-harness-skills-'))
        t.after(() => rmSync(radice, { recursive: true, force: true }))
        return radice
    }

    function reteDiRisposte(...risposte) {
        const chiamate = []
        return {
            chiamate,
            fetch: async (url, opzioni) => {
                const indice = chiamate.length
                chiamate.push({ url, opzioni, corpo: JSON.parse(opzioni.body) })
                const scelta = risposte[Math.min(indice, risposte.length - 1)]
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        choices: [{ message: scelta }],
                        usage: { prompt_tokens: 10, completion_tokens: 5 },
                    }),
                    text: async () => '',
                }
            },
        }
    }

    const TASK = { consegna: 'un compito qualunque, per la prova' }
    const CONCLUSO_SUBITO = { role: 'assistant', content: 'fatto, nessun attrezzo serve', tool_calls: [] }
    const SKILL_DI_PROVA = [{ name: 'code-review', description: 'Revisione del codice in due assi.' }]

    it('skillsDisponibili: offerto al modello come UN tool, description elenca le skill, enum sui nomi', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, skillsDisponibili: SKILL_DI_PROVA })
        assert.equal(esito.comeFinita, 'concluso')
        const offerto = rete.chiamate[0].corpo.tools.find((t) => t.function.name === 'carica_skill')
        assert.ok(offerto, 'il tool carica_skill deve comparire fra quelli offerti al modello')
        assert.match(offerto.function.description, /code-review/)
        assert.match(offerto.function.description, /Revisione del codice in due assi\./)
        assert.deepEqual(offerto.function.parameters.properties.nome.enum, ['code-review'])
        assert.equal(rete.chiamate[0].corpo.tools.length, 8, '7 attrezzi base + 1 (carica_skill)')
    })

    it('skillsDisponibili SENZA caricaSkillFn: messaggio onesto al modello, mai un tentativo silenzioso', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_SKILL = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'carica_skill', arguments: '{"nome":"code-review"}' } }] }
        const rete = reteDiRisposte(CHIAMA_SKILL, CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, skillsDisponibili: SKILL_DI_PROVA })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /not configured/)
    })

    it('skillsDisponibili CON caricaSkillFn: il nome VERO arriva intatto, il corpo tornato e\' la riga mostrata', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_SKILL = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'carica_skill', arguments: '{"nome":"code-review"}' } }] }
        const rete = reteDiRisposte(CHIAMA_SKILL, CONCLUSO_SUBITO)
        const ricevuti = []
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, skillsDisponibili: SKILL_DI_PROVA,
            caricaSkillFn: async (nome) => { ricevuti.push(nome); return '# Code review\n\nIl processo vero.' },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.deepEqual(ricevuti, ['code-review'])
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.equal(messaggioTool.content, '# Code review\n\nIl processo vero.')
    })

    it('AL CONTRARIO - un nome INVENTATO (fuori da skillsDisponibili): REFUSED, caricaSkillFn MAI chiamata', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_SKILL = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'carica_skill', arguments: '{"nome":"skill-che-non-esiste"}' } }] }
        const rete = reteDiRisposte(CHIAMA_SKILL, CONCLUSO_SUBITO)
        let chiamata = false
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, skillsDisponibili: SKILL_DI_PROVA,
            caricaSkillFn: async () => { chiamata = true; return 'mai' },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(chiamata, false)
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /^REFUSED\./)
        assert.match(messaggioTool.content, /skill-che-non-esiste/)
        assert.match(messaggioTool.content, /code-review/, 'il messaggio deve elencare le skill VERE disponibili')
    })

    it('AL CONTRARIO - caricaSkillFn che LANCIA: errore onesto, mai un successo inventato', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_SKILL = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'carica_skill', arguments: '{"nome":"code-review"}' } }] }
        const rete = reteDiRisposte(CHIAMA_SKILL, CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, skillsDisponibili: SKILL_DI_PROVA,
            caricaSkillFn: async () => { throw new Error('disco non raggiungibile') },
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /skill load failed: disco non raggiungibile/)
    })

    it('AL CONTRARIO - PARITA: senza skillsDisponibili, comportamento bit-per-bit quello di oggi (7 attrezzi, zero carica_skill)', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(rete.chiamate[0].corpo.tools.length, 7)
        assert.ok(!rete.chiamate[0].corpo.tools.some((t) => t.function.name === 'carica_skill'))
    })

    it('toolMcp E skillsDisponibili insieme: nessuno esclude l\'altro, entrambi offerti', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            toolMcp: [{ name: 'read_file', description: 'legge', inputSchema: {} }],
            skillsDisponibili: SKILL_DI_PROVA,
        })
        assert.equal(esito.comeFinita, 'concluso')
        const nomi = rete.chiamate[0].corpo.tools.map((t) => t.function.name)
        assert.ok(nomi.includes('read_file'))
        assert.ok(nomi.includes('carica_skill'))
        assert.equal(nomi.length, 9, '7 base + 1 MCP + 1 carica_skill')
    })
})

/*
 * FASE G (29/8), piano elegant-spinning-dongarra.md - Plugin system.
 * Stesso stile PARITA'/AL CONTRARIO di FASE E/F sopra. Piu' vicino a
 * toolMcp che a skillsDisponibili in FORMA (un tool OpenAI per voce di
 * toolPlugin, non un menu) ma piu' vicino a caricaSkillFn in CONTRATTO
 * (eseguiToolPluginFn torna gia' una stringa, mai un {content,isError}
 * da formattare - un tool di plugin e' un comando locale, il suo esito
 * e' testo, non un blocco tipato del protocollo MCP).
 */
describe('talosLavora - plugin tools (FASE G, dispatch verso plugin-session.mjs)', () => {
    function cartellaVuota(t) {
        const radice = mkdtempSync(join(tmpdir(), 'talos-harness-plugin-'))
        t.after(() => rmSync(radice, { recursive: true, force: true }))
        return radice
    }

    function reteDiRisposte(...risposte) {
        const chiamate = []
        return {
            chiamate,
            fetch: async (url, opzioni) => {
                const indice = chiamate.length
                chiamate.push({ url, opzioni, corpo: JSON.parse(opzioni.body) })
                const scelta = risposte[Math.min(indice, risposte.length - 1)]
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        choices: [{ message: scelta }],
                        usage: { prompt_tokens: 10, completion_tokens: 5 },
                    }),
                    text: async () => '',
                }
            },
        }
    }

    const TASK = { consegna: 'un compito qualunque, per la prova' }
    const CONCLUSO_SUBITO = { role: 'assistant', content: 'fatto, nessun attrezzo serve', tool_calls: [] }
    const UN_TOOL_PLUGIN = [{ nome: 'conta_righe', descrizione: 'conta le righe di un file', parametri: { type: 'object', properties: { percorso: { type: 'string' } }, required: ['percorso'] } }]

    it('toolPlugin: offerto al modello, avvolto nello schema OpenAI (name/description/parameters da nome/descrizione/parametri)', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, toolPlugin: UN_TOOL_PLUGIN })
        assert.equal(esito.comeFinita, 'concluso')
        const offerto = rete.chiamate[0].corpo.tools.find((t) => t.function.name === 'conta_righe')
        assert.ok(offerto, 'il tool di plugin deve comparire fra quelli offerti al modello')
        assert.equal(offerto.function.description, 'conta le righe di un file')
        assert.deepEqual(offerto.function.parameters, UN_TOOL_PLUGIN[0].parametri)
        assert.equal(rete.chiamate[0].corpo.tools.length, 8)
    })

    it('toolPlugin SENZA eseguiToolPluginFn: messaggio onesto al modello, mai un tentativo silenzioso', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_PLUGIN = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'conta_righe', arguments: '{"percorso":"a.txt"}' } }] }
        const rete = reteDiRisposte(CHIAMA_PLUGIN, CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, toolPlugin: UN_TOOL_PLUGIN })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /not configured/)
    })

    it('toolPlugin CON eseguiToolPluginFn: nome/argomenti VERI arrivano intatti, la stringa tornata e\' la riga mostrata (mai formattaEsitoMcp)', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_PLUGIN = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'conta_righe', arguments: '{"percorso":"a.txt"}' } }] }
        const rete = reteDiRisposte(CHIAMA_PLUGIN, CONCLUSO_SUBITO)
        const ricevuti = []
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, toolPlugin: UN_TOOL_PLUGIN,
            eseguiToolPluginFn: async (nome, argomenti) => { ricevuti.push({ nome, argomenti }); return '42 righe' },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.deepEqual(ricevuti, [{ nome: 'conta_righe', argomenti: { percorso: 'a.txt' } }])
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.equal(messaggioTool.content, '42 righe')
    })

    it('AL CONTRARIO - eseguiToolPluginFn che LANCIA: errore onesto, mai un successo inventato', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_PLUGIN = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'conta_righe', arguments: '{"percorso":"a.txt"}' } }] }
        const rete = reteDiRisposte(CHIAMA_PLUGIN, CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, toolPlugin: UN_TOOL_PLUGIN,
            eseguiToolPluginFn: async () => { throw new Error('comando terminato con codice 1') },
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /plugin tool call failed: comando terminato con codice 1/)
    })

    it('AL CONTRARIO - PARITA: senza toolPlugin, comportamento bit-per-bit quello di oggi (7 attrezzi, zero riferimenti plugin)', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(rete.chiamate[0].corpo.tools.length, 7)
        assert.ok(!rete.chiamate[0].corpo.tools.some((t) => t.function.name === 'conta_righe'))
    })

    it('AL CONTRARIO - un nome che non e ne un attrezzo base ne in toolPlugin resta "unknown tool"', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_IGNOTO = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'nome_inventato_di_sicuro', arguments: '{}' } }] }
        const rete = reteDiRisposte(CHIAMA_IGNOTO, CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, toolPlugin: UN_TOOL_PLUGIN,
            eseguiToolPluginFn: async () => 'mai chiamata',
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.equal(messaggioTool.content, 'unknown tool: nome_inventato_di_sicuro')
    })

    it('toolMcp E toolPlugin E skillsDisponibili insieme: nessuno esclude gli altri, tutti offerti', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            toolMcp: [{ name: 'read_file', description: 'legge', inputSchema: {} }],
            toolPlugin: UN_TOOL_PLUGIN,
            skillsDisponibili: [{ name: 'code-review', description: 'Revisione del codice in due assi.' }],
        })
        assert.equal(esito.comeFinita, 'concluso')
        const nomi = rete.chiamate[0].corpo.tools.map((t) => t.function.name)
        assert.ok(nomi.includes('read_file'))
        assert.ok(nomi.includes('conta_righe'))
        assert.ok(nomi.includes('carica_skill'))
        assert.equal(nomi.length, 10, '7 base + 1 MCP + 1 plugin + 1 carica_skill')
    })
})

/*
 * FASE K (29/8), piano elegant-spinning-dongarra.md - R2, planner
 * costoso + editor economico. Ricerca fatta PRIMA di scrivere (owner
 * ha fermato un primo giro incompleto: "rifai ricerca... Hermes dsh
 * etc"): nessun concorrente censito spedisce questo pattern come
 * feature nativa automatica - un one-up, non un pareggio. Design:
 * un pre-loop di sola esplorazione con `modelloPlanner` (talosLavora
 * chiama SE STESSA ricorsivamente, `livelloAccesso:'lettura'`),
 * seguito dal loop normale con `modello` (l'editor), col piano
 * iniettato come messaggio.
 */
describe('talosLavora - FASE K, R2 (planner costoso + editor economico)', () => {
    function cartellaVuota(t) {
        const radice = mkdtempSync(join(tmpdir(), 'talos-harness-r2-'))
        t.after(() => rmSync(radice, { recursive: true, force: true }))
        return radice
    }

    /*
     * ⭐ A differenza di `reteDiRisposte` (una sola sequenza, un solo
     * modello) qui servono DUE modelli distinti con le LORO sequenze -
     * lo script è tenuto per `model`, letto dal corpo di ogni
     * richiesta (lo stesso campo che chiamaConRitenta scrive davvero).
     */
    function reteMultiModello(scriptPerModello) {
        const chiamate = []
        const contaPerModello = new Map()
        return {
            chiamate,
            fetch: async (url, opzioni) => {
                const corpo = JSON.parse(opzioni.body)
                chiamate.push({ url, opzioni, corpo })
                const risposte = scriptPerModello[corpo.model] ?? []
                const indice = contaPerModello.get(corpo.model) ?? 0
                contaPerModello.set(corpo.model, indice + 1)
                const scelta = risposte[Math.min(indice, Math.max(risposte.length - 1, 0))]
                return {
                    ok: true, status: 200,
                    json: async () => ({ choices: [{ message: scelta }], usage: { prompt_tokens: 10, completion_tokens: 5 } }),
                    text: async () => '',
                }
            },
        }
    }

    const TASK = { consegna: 'un compito qualunque, per la prova' }
    const CONCLUSO_SUBITO = { role: 'assistant', content: 'fatto', tool_calls: [] }
    const PIANO = { role: 'assistant', content: 'Piano: aggiungi una funzione somma() in math.mjs.', tool_calls: [] }

    it('⭐⭐⭐ PARITÀ — modelloPlanner assente: usagePlanner è null, UNA sola chiamata (nessun pre-loop)', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteMultiModello({ 'solo-modello': [CONCLUSO_SUBITO] })
        const esito = await talosLavora({ cartella, task: TASK, modello: 'solo-modello', chiave: 'y', fetchDiRete: rete.fetch })
        assert.equal(esito.usagePlanner, null)
        assert.equal(rete.chiamate.length, 1, 'nessun pre-loop senza modelloPlanner')
    })

    it('⭐⭐⭐ modelloPlanner presente: il PLANNER chiama prima dell\'editor, il suo testo finale finisce iniettato come messaggio prima del loop dell\'editor', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteMultiModello({
            'planner-costoso': [PIANO],
            'editor-economico': [CONCLUSO_SUBITO],
        })
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'editor-economico', modelloPlanner: 'planner-costoso', chiave: 'y', fetchDiRete: rete.fetch,
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(rete.chiamate[0].corpo.model, 'planner-costoso', 'il planner chiama PRIMA di tutto')
        assert.equal(rete.chiamate[1].corpo.model, 'editor-economico', 'poi l\'editor')
        const messaggiEditor = rete.chiamate[1].corpo.messages
        const messaggioPiano = messaggiEditor.find((m) => typeof m.content === 'string' && m.content.includes('aggiungi una funzione somma()'))
        assert.ok(messaggioPiano, 'il piano del planner deve arrivare nel contesto dell\'editor')
    })

    it('⭐⭐⭐ il planner riceve SOLO gli attrezzi read-safe: document_create/generate_image/delega_sottotask MAI offerti, anche se richiesti', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteMultiModello({
            'planner-costoso': [PIANO],
            'editor-economico': [CONCLUSO_SUBITO],
        })
        await talosLavora({
            cartella, task: TASK, modello: 'editor-economico', modelloPlanner: 'planner-costoso', chiave: 'y', fetchDiRete: rete.fetch,
            strumentiEstesi: ['web_search', 'document_create', 'generate_image', 'delega_sottotask', 'time_now'],
        })
        const nomiOffertiAlPlanner = rete.chiamate[0].corpo.tools.map((t) => t.function.name)
        assert.ok(nomiOffertiAlPlanner.includes('web_search'), 'web_search è read-safe, deve restare offerto')
        assert.ok(nomiOffertiAlPlanner.includes('time_now'), 'time_now è read-safe, deve restare offerto')
        assert.ok(!nomiOffertiAlPlanner.includes('document_create'))
        assert.ok(!nomiOffertiAlPlanner.includes('generate_image'))
        assert.ok(!nomiOffertiAlPlanner.includes('delega_sottotask'))
        // l'editor, invece, li vede TUTTI — nessuna restrizione sul loop principale
        const nomiOffertiAllEditor = rete.chiamate[1].corpo.tools.map((t) => t.function.name)
        for (const nome of ['document_create', 'generate_image', 'delega_sottotask']) assert.ok(nomiOffertiAllEditor.includes(nome), `l'editor deve vedere ${nome}`)
    })

    it('⛔⛔⛔ AL CONTRARIO — il planner NON può scrivere: livelloAccesso:\'lettura\' lo rifiuta anche se lo prova', async () => {
        const cartella = cartellaVuota(it)
        const PLANNER_PROVA_A_SCRIVERE = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'scrivi', arguments: '{"percorso":"non-dovrebbe-esistere.txt","contenuto":"x"}' } }] }
        const rete = reteMultiModello({
            'planner-costoso': [PLANNER_PROVA_A_SCRIVERE, PIANO],
            'editor-economico': [CONCLUSO_SUBITO],
        })
        await talosLavora({
            cartella, task: TASK, modello: 'editor-economico', modelloPlanner: 'planner-costoso', chiave: 'y', fetchDiRete: rete.fetch,
        })
        assert.equal(existsSync(join(cartella, 'non-dovrebbe-esistere.txt')), false, 'il planner non deve MAI scrivere per davvero, qualunque cosa chieda')
        const messaggioToolDelPlanner = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioToolDelPlanner.content, /^REFUSED\./)
    })

    it('⭐⭐⭐ usagePlanner arriva SEPARATO da usage — mai sommato (listini diversi, sommarli sbaglierebbe il costo)', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteMultiModello({
            'planner-costoso': [PIANO],
            'editor-economico': [CONCLUSO_SUBITO],
        })
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'editor-economico', modelloPlanner: 'planner-costoso', chiave: 'y', fetchDiRete: rete.fetch,
        })
        assert.ok(esito.usagePlanner, 'usagePlanner deve essere popolato')
        assert.ok(esito.usage, 'usage (editor) deve restare popolato, invariato')
        assert.equal(esito.usagePlanner.giri, 1)
        assert.equal(esito.usage.giri, 1)
    })

    it('⛔⛔ AL CONTRARIO — su un resume (messaggiIniziali presente), il planner NON gira una seconda volta', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteMultiModello({ 'editor-economico': [CONCLUSO_SUBITO] })
        const messaggiIniziali = [
            { role: 'system', content: 'x' },
            { role: 'user', content: 'primo turno' },
            { role: 'assistant', content: 'già risposto', tool_calls: [] },
        ]
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'editor-economico', modelloPlanner: 'planner-costoso', chiave: 'y', fetchDiRete: rete.fetch,
            messaggiIniziali,
        })
        assert.equal(esito.usagePlanner, null, 'un resume non ripete il piano — quello del primo giro, se c\'era, è già nei messaggi passati')
        assert.equal(rete.chiamate.length, 1, 'una sola chiamata, tutta editor')
    })

    it('⛔ AL CONTRARIO — il planner che esaurisce il suo tetto (GIRI_MASSIMI_PLANNER) produce un piano dichiarato PARZIALE, ma l\'editor procede comunque (mai un blocco del task)', async () => {
        const cartella = cartellaVuota(it)
        const CONTINUA_A_CERCARE = { role: 'assistant', content: null, tool_calls: [{ id: 'call_x', function: { name: 'elenca', arguments: '{}' } }] }
        const rete = reteMultiModello({
            'planner-costoso': [CONTINUA_A_CERCARE], // non produce MAI una risposta finale — esaurisce il tetto
            'editor-economico': [CONCLUSO_SUBITO],
        })
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'editor-economico', modelloPlanner: 'planner-costoso', chiave: 'y', fetchDiRete: rete.fetch,
        })
        assert.equal(esito.comeFinita, 'concluso', 'il TASK (dell\'editor) conclude comunque')
        const messaggiEditor = rete.chiamate.find((c) => c.corpo.model === 'editor-economico').corpo.messages
        const messaggioPiano = messaggiEditor.find((m) => typeof m.content === 'string' && m.content.includes('giri-esauriti'))
        assert.ok(messaggioPiano, 'il piano iniettato deve dichiarare onestamente che il planner non ha concluso da solo')
    })
})

describe('talosLavora - Libreria (FASE N, dispatch verso library-store.mjs)', () => {
    function cartellaVuota(t) {
        const radice = mkdtempSync(join(tmpdir(), 'talos-harness-libreria-'))
        t.after(() => rmSync(radice, { recursive: true, force: true }))
        return radice
    }

    function reteDiRisposte(...risposte) {
        const chiamate = []
        return {
            chiamate,
            fetch: async (url, opzioni) => {
                const indice = chiamate.length
                chiamate.push({ url, opzioni, corpo: JSON.parse(opzioni.body) })
                const scelta = risposte[Math.min(indice, risposte.length - 1)]
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        choices: [{ message: scelta }],
                        usage: { prompt_tokens: 10, completion_tokens: 5 },
                    }),
                    text: async () => '',
                }
            },
        }
    }

    const TASK = { consegna: 'un compito qualunque, per la prova' }
    const CONCLUSO_SUBITO = { role: 'assistant', content: 'fatto, nessun attrezzo serve', tool_calls: [] }
    const QUATTRO_TOOL = ['library_list', 'library_search', 'library_read', 'library_file_origin']
    const LISTA_OK = { pagina: [{ id: 'lib-1', nome: 'a.md', fileType: 'document', origine: 'uploaded', aggiornatoIl: '2026-08-29T10:00:00.000Z' }], totale: 1, vistiPrima: 0, vistiDopo: 1, nextPageToken: null }
    const RICERCA_OK = { pagina: [{ id: 'lib-1', nome: 'a.md', origine: 'uploaded', testoEstratto: 'trovato' }], totale: 1, nextOffset: null }
    const LETTURA_OK = { nome: 'a.md', mediaType: 'text/markdown', origine: 'uploaded', testo: 'contenuto vero' }
    const ORIGINE_OK = { nome: 'a.md', origine: 'uploaded', modello: null, provider: null, creatoIl: '2026-08-29T10:00:00.000Z' }

    function chiamataTool(nome, argomenti) {
        return { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: nome, arguments: JSON.stringify(argomenti) } }] }
    }

    it('i 4 tool sono offerti al modello SOLO se nominati in strumentiEstesi, avvolti nello schema OpenAI', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: QUATTRO_TOOL })
        assert.equal(esito.comeFinita, 'concluso')
        const nomi = rete.chiamate[0].corpo.tools.map((t) => t.function.name)
        for (const nome of QUATTRO_TOOL) assert.ok(nomi.includes(nome), `${nome} deve comparire fra i tool offerti`)
        assert.equal(rete.chiamate[0].corpo.tools.length, 7 + 4)
    })

    it('AL CONTRARIO - PARITA: senza strumentiEstesi, 7 attrezzi, zero riferimenti Libreria', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(rete.chiamate[0].corpo.tools.length, 7)
        assert.ok(!rete.chiamate[0].corpo.tools.some((t) => QUATTRO_TOOL.includes(t.function.name)))
    })

    for (const [nome, callbackKey, risultato, atteso] of [
        ['library_list', 'onLibreriaLista', LISTA_OK, /Library list: showing 1-1 of 1/],
        ['library_search', 'onLibreriaCerca', RICERCA_OK, /Library search: 1 of 1 matches/],
        ['library_read', 'onLibreriaLeggi', LETTURA_OK, /name: a\.md[\s\S]*contenuto vero/],
        ['library_file_origin', 'onLibreriaOrigine', ORIGINE_OK, /name: a\.md/],
    ]) {
        it(`${nome} SENZA ${callbackKey}: messaggio onesto, mai un tentativo silenzioso`, async () => {
            const cartella = cartellaVuota(it)
            const rete = reteDiRisposte(chiamataTool(nome, { id: 'lib-1', query: 'x' }), CONCLUSO_SUBITO)
            const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: QUATTRO_TOOL })
            assert.equal(esito.comeFinita, 'concluso')
            const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
            assert.match(messaggioTool.content, /not configured/)
        })

        it(`${nome} CON ${callbackKey}: argomenti VERI arrivano intatti, il risultato passa per il formattatore giusto`, async () => {
            const cartella = cartellaVuota(it)
            const argomenti = { id: 'lib-1', query: 'x', origin: 'uploaded' }
            const rete = reteDiRisposte(chiamataTool(nome, argomenti), CONCLUSO_SUBITO)
            const ricevuti = []
            const esito = await talosLavora({
                cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: QUATTRO_TOOL,
                [callbackKey]: async (a) => { ricevuti.push(a); return risultato },
            })
            assert.equal(esito.comeFinita, 'concluso')
            assert.deepEqual(ricevuti, [argomenti], 'gli argomenti del modello arrivano VERBATIM al callback')
            const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
            assert.match(messaggioTool.content, atteso)
        })

        it(`AL CONTRARIO - ${nome}: un ${callbackKey} che LANCIA produce un "failed:" onesto, mai un successo inventato`, async () => {
            const cartella = cartellaVuota(it)
            const rete = reteDiRisposte(chiamataTool(nome, { id: 'lib-1', query: 'x' }), CONCLUSO_SUBITO)
            const esito = await talosLavora({
                cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: QUATTRO_TOOL,
                [callbackKey]: async () => { throw new Error('disco pieno') },
            })
            assert.equal(esito.comeFinita, 'concluso')
            const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
            assert.match(messaggioTool.content, new RegExp(`^${nome} failed: disco pieno$`))
        })
    }
})

describe('formattaListaLibreria/formattaRicercaLibreria/formattaLetturaLibreria/formattaOrigineLibreria - pure, traducono i dati grezzi di library-store.mjs nel testo che il modello legge', () => {
    it('formattaListaLibreria: CURSOR_INVALID/FILTER_DRIFT sono messaggi onesti, non un salto silenzioso a un\'altra pagina', () => {
        assert.match(formattaListaLibreria({ errore: 'CURSOR_INVALID' }), /invalid or expired/)
        assert.match(formattaListaLibreria({ errore: 'FILTER_DRIFT' }), /same filters/)
    })

    it('formattaListaLibreria: zero voci in tutto contro zero voci SU QUESTA pagina sono due messaggi diversi', () => {
        assert.match(formattaListaLibreria({ pagina: [], totale: 0, vistiPrima: 0, vistiDopo: 0, nextPageToken: null }), /There are no Library files/)
        assert.match(formattaListaLibreria({ pagina: [], totale: 3, vistiPrima: 3, vistiDopo: 3, nextPageToken: null }), /No more Library files\. Total current files for those filters: 3\./)
    })

    it('formattaListaLibreria: una pagina reale porta id/nome/tipo/origine/data, e il nextPageToken quando c\'è', () => {
        const testo = formattaListaLibreria({ pagina: [{ id: 'lib-1', nome: 'report.pdf', fileType: 'document', origine: 'generated', aggiornatoIl: '2026-08-29T10:00:00.000Z' }], totale: 5, vistiPrima: 0, vistiDopo: 1, nextPageToken: 'tok-abc' })
        assert.match(testo, /showing 1-1 of 5/)
        assert.match(testo, /id: lib-1/)
        assert.match(testo, /name: report\.pdf/)
        assert.match(testo, /type: document/)
        assert.match(testo, /origin: generated/)
        assert.match(testo, /Next page token: tok-abc/)
    })

    it('AL CONTRARIO - formattaListaLibreria: nextPageToken assente dichiara "End of Library list", mai un token inventato', () => {
        const testo = formattaListaLibreria({ pagina: [{ id: 'lib-1', nome: 'a', fileType: 'document', origine: 'uploaded', aggiornatoIl: 'x' }], totale: 1, vistiPrima: 0, vistiDopo: 1, nextPageToken: null })
        assert.match(testo, /End of Library list\./)
        assert.ok(!testo.includes('Next page token'))
    })

    it('formattaRicercaLibreria: zero match in tutto contro fine dei match sono due messaggi diversi', () => {
        assert.equal(formattaRicercaLibreria({ pagina: [], totale: 0, nextOffset: null }), 'No document in the Library matched that.')
        assert.equal(formattaRicercaLibreria({ pagina: [], totale: 2, nextOffset: null }), 'No more Library matches. Total matching files: 2.')
    })

    it('formattaRicercaLibreria: una pagina reale porta id/nome/origine/estratto, e il nextOffset quando c\'è', () => {
        const testo = formattaRicercaLibreria({ pagina: [{ id: 'lib-1', nome: 'a.md', origine: 'uploaded', testoEstratto: 'un lungo   testo\ncon righe multiple' }], totale: 3, nextOffset: 1 })
        assert.match(testo, /1 of 3 matches/)
        assert.match(testo, /id: lib-1/)
        assert.match(testo, /excerpt: un lungo testo con righe multiple/) // spazi collassati, come titoloDalPrimoMessaggio lato frontend
        assert.match(testo, /Next offset: 1\./)
    })

    it('formattaLetturaLibreria: un id inesistente (null) è REFUSED, mai un\'eccezione', () => {
        assert.match(formattaLetturaLibreria(null), /^REFUSED\. That Library id does not exist\./)
    })

    it('formattaLetturaLibreria: un documento porta nome+testo per intero', () => {
        const testo = formattaLetturaLibreria({ nome: 'note.md', mediaType: 'text/markdown', origine: 'uploaded', testo: 'riga uno\nriga due' })
        assert.match(testo, /^name: note\.md/)
        assert.match(testo, /riga uno\nriga due/)
    })

    it('formattaLetturaLibreria: un\'immagine dichiara onestamente il limite, mai un tentativo di mostrarla', () => {
        const testo = formattaLetturaLibreria({ nome: 'foto.png', mediaType: 'image/png', origine: 'generated', immagineBase64: 'AAAA' })
        assert.match(testo, /this is an image \(image\/png\)/)
        assert.match(testo, /cannot show image content inline yet/)
        assert.ok(!testo.includes('AAAA'), 'i byte base64 non finiscono mai nel testo per il modello')
    })

    it('AL CONTRARIO - formattaLetturaLibreria: un testo molto lungo viene troncato da uscitaUtile, mai spedito per intero senza limite', () => {
        const testoLungo = 'x'.repeat(10_000)
        const testo = formattaLetturaLibreria({ nome: 'grande.txt', mediaType: 'text/plain', origine: 'uploaded', testo: testoLungo })
        assert.ok(testo.length < 10_000, 'deve essere più corto del testo originale — uscitaUtile ha tagliato')
    })

    it('formattaOrigineLibreria: un id inesistente (null) è REFUSED', () => {
        assert.equal(formattaOrigineLibreria(null), 'REFUSED. That Library id does not exist.')
    })

    it('formattaOrigineLibreria: "generated" con modello/provider noti', () => {
        const testo = formattaOrigineLibreria({ nome: 'gen.md', origine: 'generated', modello: 'z-ai/glm-5.3-flash', provider: 'openrouter', creatoIl: '2026-08-29T10:00:00.000Z' })
        assert.match(testo, /origin: generated/)
        assert.match(testo, /made by: z-ai\/glm-5\.3-flash/)
        assert.match(testo, /provider: openrouter/)
        assert.match(testo, /created: 2026-08-29T10:00:00\.000Z/)
    })

    it('AL CONTRARIO - formattaOrigineLibreria: "generated" SENZA modello registrato dice "an unrecorded model", mai un vuoto silenzioso', () => {
        const testo = formattaOrigineLibreria({ nome: 'gen.md', origine: 'generated', modello: null, provider: null, creatoIl: null })
        assert.match(testo, /made by: an unrecorded model/)
        assert.ok(!testo.includes('provider:'))
        assert.ok(!testo.includes('created:'))
    })

    it('formattaOrigineLibreria: "uploaded" non porta mai un campo "made by"', () => {
        const testo = formattaOrigineLibreria({ nome: 'up.txt', origine: 'uploaded', modello: null, provider: null, creatoIl: '2026-08-29T10:00:00.000Z' })
        assert.match(testo, /origin: uploaded/)
        assert.ok(!testo.includes('made by'))
    })
})

describe('talosLavora - Libreria, mutazioni (FASE N seconda fetta, dispatch verso library-store.mjs)', () => {
    function cartellaVuota(t) {
        const radice = mkdtempSync(join(tmpdir(), 'talos-harness-libreria-mut-'))
        t.after(() => rmSync(radice, { recursive: true, force: true }))
        return radice
    }

    function reteDiRisposte(...risposte) {
        const chiamate = []
        return {
            chiamate,
            fetch: async (url, opzioni) => {
                const indice = chiamate.length
                chiamate.push({ url, opzioni, corpo: JSON.parse(opzioni.body) })
                const scelta = risposte[Math.min(indice, risposte.length - 1)]
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        choices: [{ message: scelta }],
                        usage: { prompt_tokens: 10, completion_tokens: 5 },
                    }),
                    text: async () => '',
                }
            },
        }
    }

    const TASK = { consegna: 'un compito qualunque, per la prova' }
    const CONCLUSO_SUBITO = { role: 'assistant', content: 'fatto, nessun attrezzo serve', tool_calls: [] }

    function chiamataTool(nome, argomenti) {
        return { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: nome, arguments: JSON.stringify(argomenti) } }] }
    }

    it('i 3 tool di mutazione sono offerti SOLO se nominati in strumentiEstesi', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CONCLUSO_SUBITO)
        const attrezzi = ['library_rename', 'library_delete', 'library_export']
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: attrezzi })
        assert.equal(esito.comeFinita, 'concluso')
        const nomi = rete.chiamate[0].corpo.tools.map((t) => t.function.name)
        for (const nome of attrezzi) assert.ok(nomi.includes(nome), `${nome} deve comparire fra i tool offerti`)
    })

    for (const [nome, callbackKey, argomenti, esitoOk] of [
        ['library_rename', 'onLibreriaRinomina', { id: 'lib-1', name: 'nuovo.md' }, 'Renamed «vecchio.md» to «nuovo.md».'],
        ['library_delete', 'onLibreriaElimina', { id: 'lib-1' }, '«vecchio.md» has been removed from the Library.'],
        ['library_export', 'onLibreriaEsporta', { reference: 'lib-1' }, 'Exported «vecchio.md» into the workspace (120 bytes).'],
    ]) {
        it(`${nome} SENZA ${callbackKey}: messaggio onesto, mai un tentativo silenzioso`, async () => {
            const cartella = cartellaVuota(it)
            const rete = reteDiRisposte(chiamataTool(nome, argomenti), CONCLUSO_SUBITO)
            const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: [nome] })
            assert.equal(esito.comeFinita, 'concluso')
            const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
            assert.match(messaggioTool.content, /not configured/)
        })

        it(`${nome} CON ${callbackKey}: argomenti VERI arrivano intatti, l'esito della callback è la riga mostrata`, async () => {
            const cartella = cartellaVuota(it)
            const rete = reteDiRisposte(chiamataTool(nome, argomenti), CONCLUSO_SUBITO)
            const ricevuti = []
            const esito = await talosLavora({
                cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: [nome],
                [callbackKey]: async (spec) => { ricevuti.push(spec); return { ok: true, esito: esitoOk } },
            })
            assert.equal(esito.comeFinita, 'concluso')
            assert.deepEqual(ricevuti, [argomenti])
            const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
            assert.equal(messaggioTool.content, esitoOk)
        })

        it(`AL CONTRARIO - ${nome}: un ${callbackKey} che LANCIA produce un "failed:" onesto, mai un successo inventato`, async () => {
            const cartella = cartellaVuota(it)
            const rete = reteDiRisposte(chiamataTool(nome, argomenti), CONCLUSO_SUBITO)
            const esito = await talosLavora({
                cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: [nome],
                [callbackKey]: async () => { throw new Error('disco pieno') },
            })
            assert.equal(esito.comeFinita, 'concluso')
            const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
            assert.match(messaggioTool.content, new RegExp(`^${nome} failed: disco pieno$`))
        })

        it(`${nome} con ${callbackKey} che torna ok:false: il messaggio della callback vince, non una parola generica`, async () => {
            const cartella = cartellaVuota(it)
            const rete = reteDiRisposte(chiamataTool(nome, argomenti), CONCLUSO_SUBITO)
            const esito = await talosLavora({
                cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: [nome],
                [callbackKey]: async () => ({ ok: false, esito: 'That Library id does not exist.' }),
            })
            assert.equal(esito.comeFinita, 'concluso')
            const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
            assert.equal(messaggioTool.content, 'That Library id does not exist.')
        })

        it(`⛔⛔⛔ AL CONTRARIO — livelloAccesso:'lettura' rifiuta ${nome} — REFUSED, ${callbackKey} MAI chiamata`, async () => {
            const cartella = cartellaVuota(it)
            const rete = reteDiRisposte(chiamataTool(nome, argomenti), CONCLUSO_SUBITO)
            let chiamata = false
            const esito = await talosLavora({
                cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, livelloAccesso: 'lettura',
                strumentiEstesi: [nome], [callbackKey]: async () => { chiamata = true; return { ok: true, esito: 'x' } },
            })
            assert.equal(esito.comeFinita, 'concluso')
            assert.equal(chiamata, false, `${callbackKey} non va MAI chiamata se il permesso rifiuta prima`)
            const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
            assert.match(messaggioTool.content, /^REFUSED\./)
        })
    }

    it('⛔⛔⛔ AL CONTRARIO — PARITÀ: senza strumentiEstesi, zero riferimenti alle 3 mutazioni Libreria', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(rete.chiamate[0].corpo.tools.length, 7)
        assert.ok(!rete.chiamate[0].corpo.tools.some((t) => ['library_rename', 'library_delete', 'library_export'].includes(t.function.name)))
    })

    const ARGOMENTI_POLITICA = { action: 'set_enabled', expected_revision: 0, enabled: false }

    it('library_context_policy_update: offerto SOLO se nominato in strumentiEstesi', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['library_context_policy_update'] })
        assert.equal(esito.comeFinita, 'concluso')
        assert.ok(rete.chiamate[0].corpo.tools.some((t) => t.function.name === 'library_context_policy_update'))
    })

    it('library_context_policy_update SENZA onLibreriaPolitica, con un canale di approvazione presente: messaggio onesto, mai un tentativo silenzioso', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(chiamataTool('library_context_policy_update', ARGOMENTI_POLITICA), CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['library_context_policy_update'],
            chiediApprovazioneFn: async () => true, // deve comunque chiedere — è sempreDaConfermare — ma onLibreriaPolitica manca
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /not configured/)
    })

    it('library_context_policy_update CON onLibreriaPolitica e approvazione concessa: argomenti VERI arrivano intatti, esito della callback mostrato', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(chiamataTool('library_context_policy_update', ARGOMENTI_POLITICA), CONCLUSO_SUBITO)
        const ricevuti = []
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['library_context_policy_update'],
            chiediApprovazioneFn: async () => true,
            onLibreriaPolitica: async (spec) => { ricevuti.push(spec); return { ok: true, esito: 'Updated the Library policy to revision 1.' } },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.deepEqual(ricevuti, [ARGOMENTI_POLITICA])
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.equal(messaggioTool.content, 'Updated the Library policy to revision 1.')
    })

    it('AL CONTRARIO - library_context_policy_update: un onLibreriaPolitica che LANCIA produce un "failed:" onesto', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(chiamataTool('library_context_policy_update', ARGOMENTI_POLITICA), CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['library_context_policy_update'],
            chiediApprovazioneFn: async () => true,
            onLibreriaPolitica: async () => { throw new Error('conflitto di revisione') },
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /^library_context_policy_update failed: conflitto di revisione$/)
    })

    it('⛔⛔⛔ AL CONTRARIO — livelloAccesso:\'lettura\' rifiuta library_context_policy_update — REFUSED, onLibreriaPolitica MAI chiamata', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(chiamataTool('library_context_policy_update', ARGOMENTI_POLITICA), CONCLUSO_SUBITO)
        let chiamata = false
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, livelloAccesso: 'lettura',
            strumentiEstesi: ['library_context_policy_update'], onLibreriaPolitica: async () => { chiamata = true; return { ok: true, esito: 'x' } },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(chiamata, false)
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /^REFUSED\./)
    })

    /*
     * ⭐⭐⭐⭐⭐ Il cuore della terza fetta — `ATTREZZI_SEMPRE_DA_CONFERMARE`:
     * a differenza di OGNI altro attrezzo con ricevuta, un
     * `permessiPerAttrezzo:'sempre'` esplicito NON basta per questo
     * tool — mai un'eccezione, porto diretto di `confirmation:'always'`
     * mobile.
     */
    it('⛔⛔⛔⛔⛔ library_context_policy_update: un permessiPerAttrezzo:\'sempre\' esplicito NON basta — chiede comunque conferma', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(chiamataTool('library_context_policy_update', ARGOMENTI_POLITICA), CONCLUSO_SUBITO)
        let chiestaApprovazione = false
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['library_context_policy_update'],
            permessiPerAttrezzo: { library_context_policy_update: 'sempre' },
            chiediApprovazioneFn: async (azione) => { chiestaApprovazione = true; return true },
            onLibreriaPolitica: async () => ({ ok: true, esito: 'Updated.' }),
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(chiestaApprovazione, true, 'anche con "sempre" esplicito, deve comunque passare da chiediApprovazioneFn')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.equal(messaggioTool.content, 'Updated.')
    })

    it('⛔⛔⛔ AL CONTRARIO — library_context_policy_update: "sempre" MA senza chiediApprovazioneFn è REFUSED, mai un\'esecuzione silenziosa', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(chiamataTool('library_context_policy_update', ARGOMENTI_POLITICA), CONCLUSO_SUBITO)
        let chiamataPolitica = false
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['library_context_policy_update'],
            permessiPerAttrezzo: { library_context_policy_update: 'sempre' },
            onLibreriaPolitica: async () => { chiamataPolitica = true; return { ok: true, esito: 'x' } },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(chiamataPolitica, false)
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /^REFUSED\./)
        assert.match(messaggioTool.content, /richiede sempre una conferma umana separata/)
    })

    it('⛔ AL CONTRARIO — un "sempre" esplicito su un ALTRO attrezzo (document_create) resta bypassato come sempre: il nuovo meccanismo non regredisce gli altri', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_DOC = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'document_create', arguments: '{"format":"md","title":"x","body":"y"}' } }] }
        const rete = reteDiRisposte(CHIAMA_DOC, CONCLUSO_SUBITO)
        let chiestaApprovazione = false
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['document_create'],
            permessiPerAttrezzo: { document_create: 'sempre' },
            chiediApprovazioneFn: async () => { chiestaApprovazione = true; return true },
            onDocumento: async () => ({ ok: true, esito: 'creato' }),
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(chiestaApprovazione, false, 'document_create con "sempre" non deve MAI passare da chiediApprovazioneFn — solo library_context_policy_update lo fa')
    })
})

describe('talosLavora - Notes (FASE N, quarto sistema, dispatch verso notes-store.mjs)', () => {
    function cartellaVuota(t) {
        const radice = mkdtempSync(join(tmpdir(), 'talos-harness-notes-'))
        t.after(() => rmSync(radice, { recursive: true, force: true }))
        return radice
    }

    function reteDiRisposte(...risposte) {
        const chiamate = []
        return {
            chiamate,
            fetch: async (url, opzioni) => {
                const indice = chiamate.length
                chiamate.push({ url, opzioni, corpo: JSON.parse(opzioni.body) })
                const scelta = risposte[Math.min(indice, risposte.length - 1)]
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        choices: [{ message: scelta }],
                        usage: { prompt_tokens: 10, completion_tokens: 5 },
                    }),
                    text: async () => '',
                }
            },
        }
    }

    const TASK = { consegna: 'un compito qualunque, per la prova' }
    const CONCLUSO_SUBITO = { role: 'assistant', content: 'fatto, nessun attrezzo serve', tool_calls: [] }
    const QUATTRO_TOOL = ['notes_list', 'notes_create', 'notes_update', 'notes_delete']

    function chiamataTool(nome, argomenti) {
        return { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: nome, arguments: JSON.stringify(argomenti) } }] }
    }

    it('i 4 tool sono offerti al modello SOLO se nominati in strumentiEstesi', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: QUATTRO_TOOL })
        assert.equal(esito.comeFinita, 'concluso')
        const nomi = rete.chiamate[0].corpo.tools.map((t) => t.function.name)
        for (const nome of QUATTRO_TOOL) assert.ok(nomi.includes(nome), `${nome} deve comparire fra i tool offerti`)
        assert.equal(rete.chiamate[0].corpo.tools.length, 7 + 4)
    })

    it('⛔⛔⛔ AL CONTRARIO — PARITÀ: senza strumentiEstesi, 7 attrezzi, zero riferimenti a Notes', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(rete.chiamate[0].corpo.tools.length, 7)
        assert.ok(!rete.chiamate[0].corpo.tools.some((t) => QUATTRO_TOOL.includes(t.function.name)))
    })

    it('notes_list SENZA onNoteLista: messaggio onesto, mai un tentativo silenzioso', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(chiamataTool('notes_list', {}), CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['notes_list'] })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /not configured/)
    })

    it('notes_list CON onNoteLista: argomenti VERI arrivano intatti, il risultato passa per formattaListaNote', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(chiamataTool('notes_list', { limit: 5 }), CONCLUSO_SUBITO)
        const ricevuti = []
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['notes_list'],
            onNoteLista: async (spec) => { ricevuti.push(spec); return { note: [{ id: 'nota-1', titolo: 'Codice cancello', contenuto: '4471' }], totale: 1 } },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.deepEqual(ricevuti, [{ limit: 5 }])
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /Notes: showing 1 of 1/)
        assert.match(messaggioTool.content, /Codice cancello: 4471 — id nota-1/)
    })

    it('AL CONTRARIO - notes_list: un onNoteLista che LANCIA produce un "failed:" onesto', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(chiamataTool('notes_list', {}), CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['notes_list'],
            onNoteLista: async () => { throw new Error('archivio corrotto') },
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /^notes_list failed: archivio corrotto$/)
    })

    for (const [nome, callbackKey, argomenti, esitoOk] of [
        ['notes_create', 'onNoteCrea', { title: 'Codice cancello', content: '4471' }, 'Saved the note «Codice cancello» (id nota-1).'],
        ['notes_update', 'onNoteAggiorna', { id: 'nota-1', content: '4472' }, 'Updated the note «Codice cancello».'],
        ['notes_delete', 'onNoteElimina', { id: 'nota-1' }, 'That note has been deleted.'],
    ]) {
        it(`${nome} SENZA ${callbackKey}: messaggio onesto, mai un tentativo silenzioso`, async () => {
            const cartella = cartellaVuota(it)
            const rete = reteDiRisposte(chiamataTool(nome, argomenti), CONCLUSO_SUBITO)
            const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: [nome] })
            assert.equal(esito.comeFinita, 'concluso')
            const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
            assert.match(messaggioTool.content, /not configured/)
        })

        it(`${nome} CON ${callbackKey}: argomenti VERI arrivano intatti, l'esito della callback è la riga mostrata`, async () => {
            const cartella = cartellaVuota(it)
            const rete = reteDiRisposte(chiamataTool(nome, argomenti), CONCLUSO_SUBITO)
            const ricevuti = []
            const esito = await talosLavora({
                cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: [nome],
                [callbackKey]: async (spec) => { ricevuti.push(spec); return { ok: true, esito: esitoOk } },
            })
            assert.equal(esito.comeFinita, 'concluso')
            assert.deepEqual(ricevuti, [argomenti])
            const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
            assert.equal(messaggioTool.content, esitoOk)
        })

        it(`AL CONTRARIO - ${nome}: un ${callbackKey} che LANCIA produce un "failed:" onesto, mai un successo inventato`, async () => {
            const cartella = cartellaVuota(it)
            const rete = reteDiRisposte(chiamataTool(nome, argomenti), CONCLUSO_SUBITO)
            const esito = await talosLavora({
                cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: [nome],
                [callbackKey]: async () => { throw new Error('disco pieno') },
            })
            assert.equal(esito.comeFinita, 'concluso')
            const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
            assert.match(messaggioTool.content, new RegExp(`^${nome} failed: disco pieno$`))
        })

        it(`${nome} con ${callbackKey} che torna ok:false: il messaggio della callback vince, non una parola generica`, async () => {
            const cartella = cartellaVuota(it)
            const rete = reteDiRisposte(chiamataTool(nome, argomenti), CONCLUSO_SUBITO)
            const esito = await talosLavora({
                cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: [nome],
                [callbackKey]: async () => ({ ok: false, esito: 'There is no note with that id.' }),
            })
            assert.equal(esito.comeFinita, 'concluso')
            const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
            assert.equal(messaggioTool.content, 'There is no note with that id.')
        })

        it(`⛔⛔⛔ AL CONTRARIO — livelloAccesso:'lettura' rifiuta ${nome} — REFUSED, ${callbackKey} MAI chiamata`, async () => {
            const cartella = cartellaVuota(it)
            const rete = reteDiRisposte(chiamataTool(nome, argomenti), CONCLUSO_SUBITO)
            let chiamata = false
            const esito = await talosLavora({
                cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, livelloAccesso: 'lettura',
                strumentiEstesi: [nome], [callbackKey]: async () => { chiamata = true; return { ok: true, esito: 'x' } },
            })
            assert.equal(esito.comeFinita, 'concluso')
            assert.equal(chiamata, false, `${callbackKey} non va MAI chiamata se il permesso rifiuta prima`)
            const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
            assert.match(messaggioTool.content, /^REFUSED\./)
        })
    }

    it('⛔⛔⛔ AL CONTRARIO — PARITÀ: senza strumentiEstesi, zero riferimenti alle 3 mutazioni Notes', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(rete.chiamate[0].corpo.tools.length, 7)
        assert.ok(!rete.chiamate[0].corpo.tools.some((t) => ['notes_create', 'notes_update', 'notes_delete'].includes(t.function.name)))
    })
})

describe('formattaListaNote - pura (FASE N, quarto sistema)', () => {
    it('nessuna nota: un messaggio onesto, non un elenco vuoto', () => {
        assert.equal(formattaListaNote({ note: [], totale: 0 }), 'There are no notes.')
    })

    it('note presenti: intestazione col totale, una riga per nota con id in coda', () => {
        const testo = formattaListaNote({
            note: [
                { id: 'nota-1', titolo: 'Codice cancello', contenuto: '4471' },
                { id: 'nota-2', titolo: 'Idraulico', contenuto: 'Chiamare giovedì mattina' },
            ],
            totale: 2,
        })
        assert.match(testo, /Notes: showing 2 of 2, most recently updated first\./)
        assert.match(testo, /- Codice cancello: 4471 — id nota-1/)
        assert.match(testo, /- Idraulico: Chiamare giovedì mattina — id nota-2/)
    })

    it('AL CONTRARIO - un contenuto oltre 200 caratteri viene troncato nell\'estratto, mai mostrato per intero', () => {
        const lungo = 'x'.repeat(300)
        const testo = formattaListaNote({ note: [{ id: 'nota-1', titolo: 'Lunga', contenuto: lungo }], totale: 1 })
        assert.ok(testo.includes('x'.repeat(200)))
        assert.ok(!testo.includes('x'.repeat(201)))
    })
})

describe('talosLavora - Tasks (FASE N, quinto sistema, dispatch verso tasks-store.mjs)', () => {
    function cartellaVuota(t) {
        const radice = mkdtempSync(join(tmpdir(), 'talos-harness-tasks-'))
        t.after(() => rmSync(radice, { recursive: true, force: true }))
        return radice
    }

    function reteDiRisposte(...risposte) {
        const chiamate = []
        return {
            chiamate,
            fetch: async (url, opzioni) => {
                const indice = chiamate.length
                chiamate.push({ url, opzioni, corpo: JSON.parse(opzioni.body) })
                const scelta = risposte[Math.min(indice, risposte.length - 1)]
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        choices: [{ message: scelta }],
                        usage: { prompt_tokens: 10, completion_tokens: 5 },
                    }),
                    text: async () => '',
                }
            },
        }
    }

    const TASK = { consegna: 'un compito qualunque, per la prova' }
    const CONCLUSO_SUBITO = { role: 'assistant', content: 'fatto, nessun attrezzo serve', tool_calls: [] }
    const CINQUE_TOOL = ['tasks_list', 'tasks_create', 'tasks_complete', 'tasks_update', 'tasks_delete']

    function chiamataTool(nome, argomenti) {
        return { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: nome, arguments: JSON.stringify(argomenti) } }] }
    }

    it('i 5 tool sono offerti al modello SOLO se nominati in strumentiEstesi', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: CINQUE_TOOL })
        assert.equal(esito.comeFinita, 'concluso')
        const nomi = rete.chiamate[0].corpo.tools.map((t) => t.function.name)
        for (const nome of CINQUE_TOOL) assert.ok(nomi.includes(nome), `${nome} deve comparire fra i tool offerti`)
        assert.equal(rete.chiamate[0].corpo.tools.length, 7 + 5)
    })

    it('⛔⛔⛔ AL CONTRARIO — PARITÀ: senza strumentiEstesi, 7 attrezzi, zero riferimenti a Tasks', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(rete.chiamate[0].corpo.tools.length, 7)
        assert.ok(!rete.chiamate[0].corpo.tools.some((t) => CINQUE_TOOL.includes(t.function.name)))
    })

    it('tasks_list SENZA onAttivitaLista: messaggio onesto, mai un tentativo silenzioso', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(chiamataTool('tasks_list', {}), CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['tasks_list'] })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /not configured/)
    })

    it('tasks_list CON onAttivitaLista: argomenti VERI arrivano intatti, il risultato passa per formattaListaAttivita', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(chiamataTool('tasks_list', { status: 'open', limit: 5 }), CONCLUSO_SUBITO)
        const ricevuti = []
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['tasks_list'],
            onAttivitaLista: async (spec) => { ricevuti.push(spec); return { attivita: [{ id: 'task-1', titolo: 'Chiama idraulico', stato: 'todo', priorita: 'normal', descrizione: null }], totale: 1 } },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.deepEqual(ricevuti, [{ status: 'open', limit: 5 }])
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /Tasks: showing 1 of 1/)
        assert.match(messaggioTool.content, /- \[todo\] Chiama idraulico \(normal\) — id task-1/)
    })

    it('AL CONTRARIO - tasks_list: un onAttivitaLista che LANCIA produce un "failed:" onesto', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(chiamataTool('tasks_list', {}), CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['tasks_list'],
            onAttivitaLista: async () => { throw new Error('archivio corrotto') },
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /^tasks_list failed: archivio corrotto$/)
    })

    for (const [nome, callbackKey, argomenti, esitoOk] of [
        ['tasks_create', 'onAttivitaCrea', { title: 'Chiama idraulico', priority: 'high' }, 'Added the task «Chiama idraulico» (id task-1).'],
        ['tasks_complete', 'onAttivitaCompleta', { id: 'task-1', status: 'done' }, 'Marked «Chiama idraulico» as done.'],
        ['tasks_update', 'onAttivitaAggiorna', { id: 'task-1', priority: 'low' }, 'Updated the task «Chiama idraulico».'],
        ['tasks_delete', 'onAttivitaElimina', { id: 'task-1' }, 'That task has been deleted.'],
    ]) {
        it(`${nome} SENZA ${callbackKey}: messaggio onesto, mai un tentativo silenzioso`, async () => {
            const cartella = cartellaVuota(it)
            const rete = reteDiRisposte(chiamataTool(nome, argomenti), CONCLUSO_SUBITO)
            const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: [nome] })
            assert.equal(esito.comeFinita, 'concluso')
            const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
            assert.match(messaggioTool.content, /not configured/)
        })

        it(`${nome} CON ${callbackKey}: argomenti VERI arrivano intatti, l'esito della callback è la riga mostrata`, async () => {
            const cartella = cartellaVuota(it)
            const rete = reteDiRisposte(chiamataTool(nome, argomenti), CONCLUSO_SUBITO)
            const ricevuti = []
            const esito = await talosLavora({
                cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: [nome],
                [callbackKey]: async (spec) => { ricevuti.push(spec); return { ok: true, esito: esitoOk } },
            })
            assert.equal(esito.comeFinita, 'concluso')
            assert.deepEqual(ricevuti, [argomenti])
            const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
            assert.equal(messaggioTool.content, esitoOk)
        })

        it(`AL CONTRARIO - ${nome}: un ${callbackKey} che LANCIA produce un "failed:" onesto, mai un successo inventato`, async () => {
            const cartella = cartellaVuota(it)
            const rete = reteDiRisposte(chiamataTool(nome, argomenti), CONCLUSO_SUBITO)
            const esito = await talosLavora({
                cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: [nome],
                [callbackKey]: async () => { throw new Error('disco pieno') },
            })
            assert.equal(esito.comeFinita, 'concluso')
            const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
            assert.match(messaggioTool.content, new RegExp(`^${nome} failed: disco pieno$`))
        })

        it(`${nome} con ${callbackKey} che torna ok:false: il messaggio della callback vince, non una parola generica`, async () => {
            const cartella = cartellaVuota(it)
            const rete = reteDiRisposte(chiamataTool(nome, argomenti), CONCLUSO_SUBITO)
            const esito = await talosLavora({
                cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: [nome],
                [callbackKey]: async () => ({ ok: false, esito: 'There is no task with that id.' }),
            })
            assert.equal(esito.comeFinita, 'concluso')
            const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
            assert.equal(messaggioTool.content, 'There is no task with that id.')
        })

        it(`⛔⛔⛔ AL CONTRARIO — livelloAccesso:'lettura' rifiuta ${nome} — REFUSED, ${callbackKey} MAI chiamata`, async () => {
            const cartella = cartellaVuota(it)
            const rete = reteDiRisposte(chiamataTool(nome, argomenti), CONCLUSO_SUBITO)
            let chiamata = false
            const esito = await talosLavora({
                cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, livelloAccesso: 'lettura',
                strumentiEstesi: [nome], [callbackKey]: async () => { chiamata = true; return { ok: true, esito: 'x' } },
            })
            assert.equal(esito.comeFinita, 'concluso')
            assert.equal(chiamata, false, `${callbackKey} non va MAI chiamata se il permesso rifiuta prima`)
            const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
            assert.match(messaggioTool.content, /^REFUSED\./)
        })
    }

    it('⛔⛔⛔ AL CONTRARIO — PARITÀ: senza strumentiEstesi, zero riferimenti alle 4 mutazioni Tasks', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(rete.chiamate[0].corpo.tools.length, 7)
        assert.ok(!rete.chiamate[0].corpo.tools.some((t) => ['tasks_create', 'tasks_complete', 'tasks_update', 'tasks_delete'].includes(t.function.name)))
    })
})

describe('formattaListaAttivita - pura (FASE N, quinto sistema)', () => {
    it('nessuna attività: un messaggio onesto, non un elenco vuoto', () => {
        assert.equal(formattaListaAttivita({ attivita: [], totale: 0 }), 'There are no matching tasks.')
    })

    it('attività presenti: intestazione col totale, id in coda, descrizione troncata a 160 caratteri', () => {
        const lunga = 'y'.repeat(200)
        const testo = formattaListaAttivita({
            attivita: [
                { id: 'task-1', titolo: 'Chiama idraulico', stato: 'todo', priorita: 'high', descrizione: null },
                { id: 'task-2', titolo: 'Con descrizione', stato: 'doing', priorita: 'normal', descrizione: lunga },
            ],
            totale: 2,
        })
        assert.match(testo, /Tasks: showing 2 of 2, most recently updated first\./)
        assert.match(testo, /- \[todo\] Chiama idraulico \(high\) — id task-1/)
        assert.ok(testo.includes(`- [doing] Con descrizione (normal) — ${lunga.slice(0, 160)} — id task-2`));
        assert.ok(!testo.includes(lunga.slice(0, 161)));
    })
})

describe('talosLavora - Memory (FASE N, sesto sistema, dispatch verso memory-store.mjs)', () => {
    function cartellaVuota(t) {
        const radice = mkdtempSync(join(tmpdir(), 'talos-harness-memory-'))
        t.after(() => rmSync(radice, { recursive: true, force: true }))
        return radice
    }

    function reteDiRisposte(...risposte) {
        const chiamate = []
        return {
            chiamate,
            fetch: async (url, opzioni) => {
                const indice = chiamate.length
                chiamate.push({ url, opzioni, corpo: JSON.parse(opzioni.body) })
                const scelta = risposte[Math.min(indice, risposte.length - 1)]
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        choices: [{ message: scelta }],
                        usage: { prompt_tokens: 10, completion_tokens: 5 },
                    }),
                    text: async () => '',
                }
            },
        }
    }

    const TASK = { consegna: 'un compito qualunque, per la prova' }
    const CONCLUSO_SUBITO = { role: 'assistant', content: 'fatto, nessun attrezzo serve', tool_calls: [] }
    const QUATTRO_TOOL = ['memory_search', 'memory_write', 'memory_update', 'memory_delete']

    function chiamataTool(nome, argomenti) {
        return { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: nome, arguments: JSON.stringify(argomenti) } }] }
    }

    it('i 4 tool sono offerti al modello SOLO se nominati in strumentiEstesi', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: QUATTRO_TOOL })
        assert.equal(esito.comeFinita, 'concluso')
        const nomi = rete.chiamate[0].corpo.tools.map((t) => t.function.name)
        for (const nome of QUATTRO_TOOL) assert.ok(nomi.includes(nome), `${nome} deve comparire fra i tool offerti`)
        assert.equal(rete.chiamate[0].corpo.tools.length, 7 + 4)
    })

    it('⛔⛔⛔ AL CONTRARIO — PARITÀ: senza strumentiEstesi, 7 attrezzi, zero riferimenti a Memory', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(rete.chiamate[0].corpo.tools.length, 7)
        assert.ok(!rete.chiamate[0].corpo.tools.some((t) => QUATTRO_TOOL.includes(t.function.name)))
    })

    it('memory_search SENZA onMemoriaCerca: messaggio onesto, mai un tentativo silenzioso', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(chiamataTool('memory_search', { query: 'x' }), CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['memory_search'] })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /not configured/)
    })

    it('memory_search CON onMemoriaCerca: argomenti VERI arrivano intatti, il risultato passa per formattaRicercaMemoria', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(chiamataTool('memory_search', { query: 'risposte brevi', limit: 3 }), CONCLUSO_SUBITO)
        const ricevuti = []
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['memory_search'],
            onMemoriaCerca: async (spec) => { ricevuti.push(spec); return { memorie: [{ id: 'mem-1', titolo: 'Preferenze risposta', contenuto: 'Risposte brevi' }], totale: 1 } },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.deepEqual(ricevuti, [{ query: 'risposte brevi', limit: 3 }])
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /Memory: showing 1 of 1 matches/)
        assert.match(messaggioTool.content, /- Preferenze risposta: Risposte brevi — id mem-1/)
    })

    it('AL CONTRARIO - memory_search: un onMemoriaCerca che LANCIA produce un "failed:" onesto', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(chiamataTool('memory_search', { query: 'x' }), CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['memory_search'],
            onMemoriaCerca: async () => { throw new Error('archivio corrotto') },
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /^memory_search failed: archivio corrotto$/)
    })

    for (const [nome, callbackKey, argomenti, esitoOk] of [
        ['memory_write', 'onMemoriaScrivi', { title: 'Preferenze risposta', content: 'Risposte brevi' }, 'Remembered as «Preferenze risposta» (id mem-1): Risposte brevi'],
        ['memory_update', 'onMemoriaAggiorna', { id: 'mem-1', content: 'Risposte brevi e in italiano' }, 'Memory «Preferenze risposta» updated.'],
        ['memory_delete', 'onMemoriaElimina', { id: 'mem-1' }, 'That memory has been removed from this device.'],
    ]) {
        it(`${nome} SENZA ${callbackKey}: messaggio onesto, mai un tentativo silenzioso`, async () => {
            const cartella = cartellaVuota(it)
            const rete = reteDiRisposte(chiamataTool(nome, argomenti), CONCLUSO_SUBITO)
            const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: [nome] })
            assert.equal(esito.comeFinita, 'concluso')
            const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
            assert.match(messaggioTool.content, /not configured/)
        })

        it(`${nome} CON ${callbackKey}: argomenti VERI arrivano intatti, l'esito della callback è la riga mostrata`, async () => {
            const cartella = cartellaVuota(it)
            const rete = reteDiRisposte(chiamataTool(nome, argomenti), CONCLUSO_SUBITO)
            const ricevuti = []
            const esito = await talosLavora({
                cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: [nome],
                [callbackKey]: async (spec) => { ricevuti.push(spec); return { ok: true, esito: esitoOk } },
            })
            assert.equal(esito.comeFinita, 'concluso')
            assert.deepEqual(ricevuti, [argomenti])
            const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
            assert.equal(messaggioTool.content, esitoOk)
        })

        it(`AL CONTRARIO - ${nome}: un ${callbackKey} che LANCIA produce un "failed:" onesto, mai un successo inventato`, async () => {
            const cartella = cartellaVuota(it)
            const rete = reteDiRisposte(chiamataTool(nome, argomenti), CONCLUSO_SUBITO)
            const esito = await talosLavora({
                cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: [nome],
                [callbackKey]: async () => { throw new Error('disco pieno') },
            })
            assert.equal(esito.comeFinita, 'concluso')
            const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
            assert.match(messaggioTool.content, new RegExp(`^${nome} failed: disco pieno$`))
        })

        it(`${nome} con ${callbackKey} che torna ok:false: il messaggio della callback vince, non una parola generica`, async () => {
            const cartella = cartellaVuota(it)
            const rete = reteDiRisposte(chiamataTool(nome, argomenti), CONCLUSO_SUBITO)
            const esito = await talosLavora({
                cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: [nome],
                [callbackKey]: async () => ({ ok: false, esito: 'No memory has that id.' }),
            })
            assert.equal(esito.comeFinita, 'concluso')
            const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
            assert.equal(messaggioTool.content, 'No memory has that id.')
        })

        it(`⛔⛔⛔ AL CONTRARIO — livelloAccesso:'lettura' rifiuta ${nome} — REFUSED, ${callbackKey} MAI chiamata`, async () => {
            const cartella = cartellaVuota(it)
            const rete = reteDiRisposte(chiamataTool(nome, argomenti), CONCLUSO_SUBITO)
            let chiamata = false
            const esito = await talosLavora({
                cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, livelloAccesso: 'lettura',
                strumentiEstesi: [nome], [callbackKey]: async () => { chiamata = true; return { ok: true, esito: 'x' } },
            })
            assert.equal(esito.comeFinita, 'concluso')
            assert.equal(chiamata, false, `${callbackKey} non va MAI chiamata se il permesso rifiuta prima`)
            const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
            assert.match(messaggioTool.content, /^REFUSED\./)
        })
    }

    it('⛔⛔⛔ AL CONTRARIO — PARITÀ: senza strumentiEstesi, zero riferimenti alle 3 mutazioni Memory', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(rete.chiamate[0].corpo.tools.length, 7)
        assert.ok(!rete.chiamate[0].corpo.tools.some((t) => ['memory_write', 'memory_update', 'memory_delete'].includes(t.function.name)))
    })
})

describe('formattaRicercaMemoria - pura (FASE N, sesto sistema)', () => {
    it('nessuna memoria trovata: un messaggio onesto', () => {
        assert.equal(formattaRicercaMemoria({ memorie: [], totale: 0 }), 'Nothing remembered matches that.')
    })

    it('memorie trovate: intestazione col totale, id in coda', () => {
        const testo = formattaRicercaMemoria({
            memorie: [{ id: 'mem-1', titolo: 'Preferenze risposta', contenuto: 'Risposte brevi' }],
            totale: 1,
        })
        assert.match(testo, /Memory: showing 1 of 1 matches\./)
        assert.match(testo, /- Preferenze risposta: Risposte brevi — id mem-1/)
    })

    it('AL CONTRARIO - un contenuto oltre 300 caratteri viene troncato nell\'estratto, mai mostrato per intero', () => {
        const lungo = 'x'.repeat(400)
        const testo = formattaRicercaMemoria({ memorie: [{ id: 'mem-1', titolo: 'Lunga', contenuto: lungo }], totale: 1 })
        assert.ok(testo.includes('x'.repeat(300)))
        assert.ok(!testo.includes('x'.repeat(301)))
    })
})

describe('talosLavora - Deep Research (FASE N, ottavo sistema, "fetta onesta")', () => {
    function cartellaVuota(t) {
        const radice = mkdtempSync(join(tmpdir(), 'talos-harness-research-'))
        t.after(() => rmSync(radice, { recursive: true, force: true }))
        return radice
    }

    function reteDiRisposte(...risposte) {
        const chiamate = []
        return {
            chiamate,
            fetch: async (url, opzioni) => {
                const indice = chiamate.length
                chiamate.push({ url, opzioni, corpo: JSON.parse(opzioni.body) })
                const scelta = risposte[Math.min(indice, risposte.length - 1)]
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        choices: [{ message: scelta }],
                        usage: { prompt_tokens: 10, completion_tokens: 5 },
                    }),
                    text: async () => '',
                }
            },
        }
    }

    const TASK = { consegna: 'un compito qualunque, per la prova' }
    const CONCLUSO_SUBITO = { role: 'assistant', content: 'fatto, nessun attrezzo serve', tool_calls: [] }
    const OTTO_TOOL = ['research_list', 'research_start', 'research_read', 'research_rename', 'research_pause', 'research_resume', 'research_cancel', 'research_delete']

    function chiamataTool(nome, argomenti) {
        return { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: nome, arguments: JSON.stringify(argomenti) } }] }
    }

    it('gli 8 tool sono offerti al modello SOLO se nominati in strumentiEstesi', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: OTTO_TOOL })
        assert.equal(esito.comeFinita, 'concluso')
        const nomi = rete.chiamate[0].corpo.tools.map((t) => t.function.name)
        for (const nome of OTTO_TOOL) assert.ok(nomi.includes(nome), `${nome} deve comparire fra i tool offerti`)
        assert.equal(rete.chiamate[0].corpo.tools.length, 7 + 8)
    })

    it('⛔⛔⛔ AL CONTRARIO — PARITÀ: senza strumentiEstesi, 7 attrezzi, zero riferimenti a Research', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(rete.chiamate[0].corpo.tools.length, 7)
        assert.ok(!rete.chiamate[0].corpo.tools.some((t) => OTTO_TOOL.includes(t.function.name)))
    })

    it('research_list SENZA onRicercaLista: messaggio onesto, mai un tentativo silenzioso', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(chiamataTool('research_list', {}), CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['research_list'] })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /not configured/)
    })

    it('research_list CON onRicercaLista: argomenti VERI arrivano intatti, il risultato passa per formattaListaRicerche', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(chiamataTool('research_list', { status: 'done', page_size: 5 }), CONCLUSO_SUBITO)
        const ricevuti = []
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['research_list'],
            onRicercaLista: async (spec) => { ricevuti.push(spec); return { ricerche: [{ id: 'sess-1', titolo: 'Il caching di OpenRouter', stato: 'done', avviataAlle: '2026-08-30T10:00:00.000Z' }], totale: 1 } },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.deepEqual(ricevuti, [{ status: 'done', page_size: 5 }])
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /Research: showing 1 of 1\./)
        assert.match(messaggioTool.content, /Il caching di OpenRouter — done — 2026-08-30 — id sess-1/)
    })

    it('AL CONTRARIO - research_list: un onRicercaLista che LANCIA produce un "failed:" onesto', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(chiamataTool('research_list', {}), CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['research_list'],
            onRicercaLista: async () => { throw new Error('giornale corrotto') },
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /^research_list failed: giornale corrotto$/)
    })

    it('research_read SENZA onRicercaLeggi: messaggio onesto, mai un tentativo silenzioso', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(chiamataTool('research_read', { id: 'sess-1' }), CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['research_read'] })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /not configured/)
    })

    it('research_read CON onRicercaLeggi: rapporto pronto — il testo del rapporto è la riga mostrata, verbatim', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(chiamataTool('research_read', { id: 'sess-1' }), CONCLUSO_SUBITO)
        const ricevuti = []
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['research_read'],
            onRicercaLeggi: async (spec) => { ricevuti.push(spec); return { trovata: true, stato: 'done', titolo: 'x', contenutoRapporto: 'Il rapporto completo, verbatim.' } },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.deepEqual(ricevuti, [{ id: 'sess-1' }])
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.equal(messaggioTool.content, 'Il rapporto completo, verbatim.')
    })

    it('research_read CON onRicercaLeggi: id inesistente — "no research with that id", mai un\'invenzione', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(chiamataTool('research_read', { id: 'mai-esistita' }), CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['research_read'],
            onRicercaLeggi: async () => ({ trovata: false }),
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /^There is no research with that id\./)
    })

    it('research_read CON onRicercaLeggi: esiste ma ancora nessun rapporto leggibile — dice cosa fare, non cosa è successo', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(chiamataTool('research_read', { id: 'sess-2' }), CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['research_read'],
            onRicercaLeggi: async () => ({ trovata: true, stato: 'running', titolo: 'x', contenutoRapporto: null }),
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /That research is "running": there is no readable report for it yet\./)
    })

    it('AL CONTRARIO - research_read: un onRicercaLeggi che LANCIA produce un "failed:" onesto', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(chiamataTool('research_read', { id: 'sess-1' }), CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['research_read'],
            onRicercaLeggi: async () => { throw new Error('libreria irraggiungibile') },
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /^research_read failed: libreria irraggiungibile$/)
    })

    for (const [nome, callbackKey, argomenti, esitoOk] of [
        ['research_start', 'onRicercaAvvia', { question: 'Come funziona il caching di OpenRouter?', depth: 'deep' }, 'Started the research «Come funziona il caching di OpenRouter?» (id sess-99). It runs in the background.'],
        ['research_rename', 'onRicercaRinomina', { id: 'sess-1', title: 'Nuovo titolo' }, 'Renamed that research to «Nuovo titolo».'],
        ['research_pause', 'onRicercaPausa', { id: 'sess-1' }, 'That research is paused. Everything it collected is kept, and it can be resumed.'],
        ['research_resume', 'onRicercaRiprendi', { id: 'sess-1' }, 'That research is running again, from where it had stopped.'],
        ['research_cancel', 'onRicercaAnnulla', { id: 'sess-1' }, 'That research is stopped for good. What it collected is still readable.'],
        ['research_delete', 'onRicercaElimina', { id: 'sess-1' }, 'That research and its report have been deleted.'],
    ]) {
        it(`${nome} SENZA ${callbackKey}: messaggio onesto, mai un tentativo silenzioso`, async () => {
            const cartella = cartellaVuota(it)
            const rete = reteDiRisposte(chiamataTool(nome, argomenti), CONCLUSO_SUBITO)
            const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: [nome] })
            assert.equal(esito.comeFinita, 'concluso')
            const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
            assert.match(messaggioTool.content, /not configured/)
        })

        it(`${nome} CON ${callbackKey}: argomenti VERI arrivano intatti, l'esito della callback è la riga mostrata`, async () => {
            const cartella = cartellaVuota(it)
            const rete = reteDiRisposte(chiamataTool(nome, argomenti), CONCLUSO_SUBITO)
            const ricevuti = []
            const esito = await talosLavora({
                cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: [nome],
                [callbackKey]: async (spec) => { ricevuti.push(spec); return { ok: true, esito: esitoOk } },
            })
            assert.equal(esito.comeFinita, 'concluso')
            assert.deepEqual(ricevuti, [argomenti])
            const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
            assert.equal(messaggioTool.content, esitoOk)
        })

        it(`AL CONTRARIO - ${nome}: un ${callbackKey} che LANCIA produce un "failed:" onesto, mai un successo inventato`, async () => {
            const cartella = cartellaVuota(it)
            const rete = reteDiRisposte(chiamataTool(nome, argomenti), CONCLUSO_SUBITO)
            const esito = await talosLavora({
                cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: [nome],
                [callbackKey]: async () => { throw new Error('disco pieno') },
            })
            assert.equal(esito.comeFinita, 'concluso')
            const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
            assert.match(messaggioTool.content, new RegExp(`^${nome} failed: disco pieno$`))
        })

        it(`${nome} con ${callbackKey} che torna ok:false: il messaggio della callback vince, non una parola generica`, async () => {
            const cartella = cartellaVuota(it)
            const rete = reteDiRisposte(chiamataTool(nome, argomenti), CONCLUSO_SUBITO)
            const esito = await talosLavora({
                cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: [nome],
                [callbackKey]: async () => ({ ok: false, esito: 'There is no research with that id. Call research_list to see the current ones.' }),
            })
            assert.equal(esito.comeFinita, 'concluso')
            const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
            assert.equal(messaggioTool.content, 'There is no research with that id. Call research_list to see the current ones.')
        })

        it(`⛔⛔⛔ AL CONTRARIO — livelloAccesso:'lettura' rifiuta ${nome} — REFUSED, ${callbackKey} MAI chiamata`, async () => {
            const cartella = cartellaVuota(it)
            const rete = reteDiRisposte(chiamataTool(nome, argomenti), CONCLUSO_SUBITO)
            let chiamata = false
            const esito = await talosLavora({
                cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, livelloAccesso: 'lettura',
                strumentiEstesi: [nome], [callbackKey]: async () => { chiamata = true; return { ok: true, esito: 'x' } },
            })
            assert.equal(esito.comeFinita, 'concluso')
            assert.equal(chiamata, false, `${callbackKey} non va MAI chiamata se il permesso rifiuta prima`)
            const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
            assert.match(messaggioTool.content, /^REFUSED\./)
        })
    }

    it('⛔⛔⛔ AL CONTRARIO — PARITÀ: senza strumentiEstesi, zero riferimenti alle 6 mutazioni Research', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(rete.chiamate[0].corpo.tools.length, 7)
        assert.ok(!rete.chiamate[0].corpo.tools.some((t) => ['research_start', 'research_rename', 'research_pause', 'research_resume', 'research_cancel', 'research_delete'].includes(t.function.name)))
    })
})

describe('formattaListaRicerche - pura (FASE N, ottavo sistema)', () => {
    it('nessuna ricerca trovata: un messaggio onesto', () => {
        assert.equal(formattaListaRicerche({ ricerche: [], totale: 0 }), 'No deep research has been run on this project yet.')
    })

    it('ricerche trovate: intestazione col totale, id in coda, data ridotta a 10 caratteri (YYYY-MM-DD)', () => {
        const testo = formattaListaRicerche({
            ricerche: [{ id: 'sess-1', titolo: 'Il caching di OpenRouter', stato: 'done', avviataAlle: '2026-08-30T10:15:00.000Z' }],
            totale: 1,
        })
        assert.match(testo, /Research: showing 1 of 1\./)
        assert.match(testo, /Il caching di OpenRouter — done — 2026-08-30 — id sess-1/)
    })

    it('AL CONTRARIO - due ricerche restano nell\'ordine passato dal chiamante (il formattatore non riordina)', () => {
        const testo = formattaListaRicerche({
            ricerche: [
                { id: 'sess-b', titolo: 'seconda', stato: 'running', avviataAlle: '2026-08-30T09:00:00.000Z' },
                { id: 'sess-a', titolo: 'prima', stato: 'done', avviataAlle: '2026-08-29T09:00:00.000Z' },
            ],
            totale: 2,
        })
        const indiceB = testo.indexOf('sess-b')
        const indiceA = testo.indexOf('sess-a')
        assert.ok(indiceB < indiceA, 'sess-b (passata per prima) resta prima nel testo')
    })
})

describe('formattaLetturaRicerca - pura (FASE N, ottavo sistema)', () => {
    it('id inesistente: "no research with that id", mai un\'invenzione', () => {
        assert.match(formattaLetturaRicerca({ trovata: false }), /^There is no research with that id\. Call research_list/)
    })

    it('rapporto pronto: il testo del rapporto torna VERBATIM, nessuna intestazione aggiunta', () => {
        assert.equal(
            formattaLetturaRicerca({ trovata: true, stato: 'done', titolo: 'x', contenutoRapporto: 'Il rapporto, per intero.' }),
            'Il rapporto, per intero.',
        )
    })

    it('AL CONTRARIO - esiste ma nessun rapporto leggibile: il messaggio nomina lo stato reale, non un placeholder fisso', () => {
        const testo = formattaLetturaRicerca({ trovata: true, stato: 'paused', titolo: 'x', contenutoRapporto: null })
        assert.match(testo, /That research is "paused": there is no readable report for it yet\./)
    })
})

/*
 * ⭐⭐⭐⭐ FASE N, nono e ultimo sistema (30/8) — Tool Forge, "fetta
 * onesta". Il path-safety layer (forgePercorsoViolazione/
 * forgeLeggiPercorso/forgeScriviPercorso) è la parte più critica di
 * tutta la fetta — porta VERBATIM la difesa da una prototype-pollution
 * CONFERMATA sul mobile (owner 27/8) — quindi riceve il test più fitto.
 */
describe('Tool Forge - path safety (forgePercorsoViolazione/forgeLeggiPercorso/forgeScriviPercorso)', () => {
    it('percorsi sicuri: nessuna violazione', () => {
        assert.equal(forgePercorsoViolazione('$.input.title'), null)
        assert.equal(forgePercorsoViolazione('$.state.risultato'), null)
        assert.equal(forgePercorsoViolazione('$'), null)
    })

    it('⛔⛔⛔ AL CONTRARIO — __proto__/constructor/prototype sono SEMPRE rifiutati, in lettura E in scrittura', () => {
        for (const segmento of ['__proto__', 'constructor', 'prototype', '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__']) {
            assert.match(forgePercorsoViolazione(`$.state.${segmento}`), /forbidden/, `${segmento} deve essere rifiutato`)
            assert.match(forgePercorsoViolazione(`$.state.${segmento}`, { scrivibile: true }), /forbidden/, `${segmento} deve essere rifiutato anche in scrittura`)
        }
    })

    it('⛔⛔ AL CONTRARIO — un $ref che scrive su "input" o "runtime" è rifiutato, "state" no', () => {
        assert.match(forgePercorsoViolazione('$.input.x', { scrivibile: true }), /read-only/)
        assert.match(forgePercorsoViolazione('$.runtime.x', { scrivibile: true }), /read-only/)
        assert.equal(forgePercorsoViolazione('$.state.x', { scrivibile: true }), null)
        // in LETTURA, input resta pienamente leggibile (solo la SCRITTURA su input è vietata).
        assert.equal(forgePercorsoViolazione('$.input.x'), null)
    })

    it('⛔ segmenti troppo lunghi, troppi segmenti, o caratteri non alfanumerici sono rifiutati', () => {
        assert.match(forgePercorsoViolazione(`$.state.${'x'.repeat(65)}`), /exceeds 64 characters/)
        assert.match(forgePercorsoViolazione(`$.state.${Array.from({ length: 17 }, (_, i) => `s${i}`).join('.')}`), /exceeds 16 segments/)
        assert.match(forgePercorsoViolazione('$.state.x y'), /alphanumeric/)
        assert.match(forgePercorsoViolazione('$.state.x;DROP TABLE'), /alphanumeric/)
    })

    it('⭐⭐⭐ forgeLeggiPercorso: legge davvero, torna undefined per un percorso assente (mai un\'eccezione su un dato mancante)', () => {
        const radice = { input: { title: 'Bevi acqua' }, state: {} }
        assert.equal(forgeLeggiPercorso(radice, '$.input.title'), 'Bevi acqua')
        assert.equal(forgeLeggiPercorso(radice, '$.state.mai-scritto'), undefined)
        assert.equal(forgeLeggiPercorso(radice, '$'), radice)
    })

    it('⛔⛔⛔ AL CONTRARIO — forgeLeggiPercorso non risale MAI la catena del prototipo (hasOwnProperty, non un accesso nudo)', () => {
        const radice = { input: {}, state: {} }
        assert.equal(forgeLeggiPercorso(radice, '$.input.toString'), undefined, 'toString esiste su Object.prototype ma non è una chiave PROPRIA di input')
    })

    it('⭐⭐⭐ forgeScriviPercorso: scrive davvero, crea contenitori intermedi mancanti', () => {
        const radice = { input: {}, state: {} }
        forgeScriviPercorso(radice, '$.state.risultato', { ok: true })
        assert.deepEqual(radice.state.risultato, { ok: true })
        forgeScriviPercorso(radice, '$.state.a.b.c', 42)
        assert.equal(radice.state.a.b.c, 42)
    })

    it('⛔⛔⛔⭐⭐⭐ AL CONTRARIO — LA PROTOTYPE POLLUTION CONFERMATA sul mobile: un target "__proto__.polluted" NON scrive su Object.prototype, lancia invece', () => {
        const radice = { input: {}, state: {} }
        assert.throws(() => forgeScriviPercorso(radice, '$.state.__proto__.polluted', 'x'), /TALOS_FORGE_PATH_UNSAFE/)
        assert.equal({}.polluted, undefined, 'Object.prototype NON deve essere stato toccato — se questa asserzione fallisse, l\'inquinamento sarebbe visibile su OGNI oggetto del processo')
    })

    it('⛔⛔ AL CONTRARIO — la SECONDA difesa indipendente: anche un contenitore intermedio creato da forgeScriviPercorso ha prototipo nullo', () => {
        const radice = { input: {}, state: {} }
        forgeScriviPercorso(radice, '$.state.nuovo.campo', 1)
        assert.equal(Object.getPrototypeOf(radice.state.nuovo), null, 'un contenitore intermedio creato dall\'interprete non deve MAI ereditare da Object.prototype')
    })
})

describe('Tool Forge - espressioni (forgeRisolviEspressione/forgeRaccogliRiferimenti/forgeValutaCondizione)', () => {
    it('forgeRisolviEspressione: un letterale torna se stesso, un $ref legge da vars, ricorsivo dentro oggetti/array', () => {
        const vars = { input: { titolo: 'x', tag: ['a', 'b'] }, state: {} }
        assert.equal(forgeRisolviEspressione(42, vars), 42)
        assert.equal(forgeRisolviEspressione({ $ref: '$.input.titolo' }, vars), 'x')
        assert.deepEqual(
            forgeRisolviEspressione({ titolo: { $ref: '$.input.titolo' }, tags: { $ref: '$.input.tag' }, fisso: 'y' }, vars),
            { titolo: 'x', tags: ['a', 'b'], fisso: 'y' },
        )
        assert.deepEqual(forgeRisolviEspressione([1, { $ref: '$.input.titolo' }], vars), [1, 'x'])
    })

    it('forgeRaccogliRiferimenti: trova ogni $ref annidato, in ordine, anche dentro array', () => {
        const espressione = { a: { $ref: '$.input.x' }, b: [{ $ref: '$.state.y' }, 'letterale'] }
        assert.deepEqual(forgeRaccogliRiferimenti(espressione), ['$.input.x', '$.state.y'])
    })

    it('⛔ AL CONTRARIO — forgeRaccogliRiferimenti su un\'espressione senza $ref torna []', () => {
        assert.deepEqual(forgeRaccogliRiferimenti({ a: 1, b: 'x' }), [])
    })

    for (const [op, sinistra, destra, atteso] of [
        ['eq', 1, 1, true], ['eq', 1, 2, false],
        ['neq', 1, 2, true], ['neq', 1, 1, false],
        ['truthy', 'x', undefined, true], ['truthy', '', undefined, false],
        ['exists', 0, undefined, true], ['exists', undefined, undefined, false],
        ['contains', 'ciao mondo', 'mondo', true], ['contains', 'ciao', 'mondo', false],
        ['gt', 5, 3, true], ['gt', 3, 5, false],
        ['gte', 5, 5, true], ['lt', 3, 5, true], ['lte', 5, 5, true],
    ]) {
        it(`forgeValutaCondizione: ${op}(${JSON.stringify(sinistra)}, ${JSON.stringify(destra)}) === ${atteso}`, () => {
            assert.equal(forgeValutaCondizione({ left: sinistra, op, right: destra }, {}), atteso)
        })
    }
})

describe('Tool Forge - validaManifestForge', () => {
    function manifestoValido(sovrascrizioni = {}) {
        return {
            id: 'log-water-intake', title: 'Log water intake', description: 'Creates a note logging water intake.',
            flow: {
                entry: 'n1', maxTransitions: 10,
                nodes: [
                    { id: 'n1', type: 'capability', capability: 'notes.create', input: { title: { $ref: '$.input.title' } }, target: '$.state.esito', next: 'n2' },
                    { id: 'n2', type: 'return', value: { $ref: '$.state.esito' } },
                ],
            },
            ...sovrascrizioni,
        }
    }

    it('⭐⭐⭐ un manifesto valido passa, con capacita/azioni/rischio derivati correttamente', () => {
        const esito = validaManifestForge(manifestoValido())
        assert.equal(esito.ok, true)
        assert.deepEqual(esito.capacita, ['notes.create'])
        assert.deepEqual(esito.azioni, ['write'])
        assert.equal(esito.rischio, 'R2')
    })

    it('⭐⭐ if/return/fail: un manifesto con tutti e 4 i tipi di nodo passa', () => {
        const esito = validaManifestForge({
            id: 'check-and-log', title: 'x', description: 'y',
            flow: {
                entry: 'n1', maxTransitions: 10,
                nodes: [
                    { id: 'n1', type: 'capability', capability: 'tasks.list', input: {}, target: '$.state.elenco', next: 'n2' },
                    { id: 'n2', type: 'if', condition: { left: { $ref: '$.state.elenco' }, op: 'exists' }, then: 'n3', else: 'n4' },
                    { id: 'n3', type: 'return', value: 'trovato' },
                    { id: 'n4', type: 'fail', code: 'NOT_FOUND', message: 'niente da fare' },
                ],
            },
        })
        assert.equal(esito.ok, true)
    })

    for (const [nome, sovrascrizioni, atteso] of [
        ['id non valido (maiuscolo)', { id: 'Log-Water' }, /id.*lowercase slug/],
        ['id troppo corto', { id: 'ab' }, /id.*lowercase slug/],
        ['id con un punto (adattamento deliberato dal mobile)', { id: 'log.water' }, /id.*lowercase slug/],
        ['title vuoto', { title: '' }, /title.*1-80/],
        ['title troppo lungo', { title: 'x'.repeat(81) }, /title.*1-80/],
        ['description vuota', { description: '' }, /description.*1-400/],
    ]) {
        it(`⛔ AL CONTRARIO — ${nome}: rifiutato con un diagnostico che lo nomina`, () => {
            const esito = validaManifestForge(manifestoValido(sovrascrizioni))
            assert.equal(esito.ok, false)
            assert.ok(esito.diagnostica.some((d) => atteso.test(d)), `atteso un diagnostico che combacia ${atteso}, ricevuto: ${JSON.stringify(esito.diagnostica)}`)
        })
    }

    it('⛔⛔⛔ AL CONTRARIO — una capability sconosciuta (es. "web.search", MAI wired nemmeno sul mobile) è rifiutata', () => {
        const manifesto = manifestoValido()
        manifesto.flow.nodes[0].capability = 'web.search'
        const esito = validaManifestForge(manifesto)
        assert.equal(esito.ok, false)
        assert.ok(esito.diagnostica.some((d) => d.includes('capability') && d.includes('must be one of')))
    })

    it('⛔⛔⛔ AL CONTRARIO — un $ref con __proto__ dentro l\'input di una capability è rifiutato all\'INSTALLAZIONE, mai lasciato per il runtime', () => {
        const manifesto = manifestoValido()
        manifesto.flow.nodes[0].input = { title: { $ref: '$.input.__proto__.polluted' } }
        const esito = validaManifestForge(manifesto)
        assert.equal(esito.ok, false)
        assert.ok(esito.diagnostica.some((d) => d.includes('forbidden')))
    })

    it('⛔⛔ AL CONTRARIO — un target che scrive su "input" invece di "state" è rifiutato', () => {
        const manifesto = manifestoValido()
        manifesto.flow.nodes[0].target = '$.input.x'
        const esito = validaManifestForge(manifesto)
        assert.equal(esito.ok, false)
        assert.ok(esito.diagnostica.some((d) => d.includes('read-only')))
    })

    it('⛔⛔ AL CONTRARIO — un "next" che punta a un id INESISTENTE è rifiutato (non un crash a runtime)', () => {
        const manifesto = manifestoValido()
        manifesto.flow.nodes[0].next = 'nodo-fantasma'
        const esito = validaManifestForge(manifesto)
        assert.equal(esito.ok, false)
        assert.match(esito.diagnostica[0], /nodo-fantasma.*is not a node id/)
    })

    it('⛔ AL CONTRARIO — flow.entry che punta a un id inesistente è rifiutato', () => {
        const manifesto = manifestoValido({ flow: { entry: 'fantasma', maxTransitions: 10, nodes: manifestoValido().flow.nodes } })
        const esito = validaManifestForge(manifesto)
        assert.equal(esito.ok, false)
        assert.match(esito.diagnostica[0], /flow\.entry.*fantasma.*is not a node id/)
    })

    it('⛔⛔ AL CONTRARIO — due nodi con lo STESSO id sono rifiutati (duplicato)', () => {
        const manifesto = manifestoValido()
        manifesto.flow.nodes[1].id = 'n1'
        const esito = validaManifestForge(manifesto)
        assert.equal(esito.ok, false)
        assert.ok(esito.diagnostica.some((d) => d.includes('duplicate node id')))
    })

    it('⛔ AL CONTRARIO — maxTransitions fuori range (0, o oltre 256) è rifiutato', () => {
        assert.equal(validaManifestForge(manifestoValido({ flow: { ...manifestoValido().flow, maxTransitions: 0 } })).ok, false)
        assert.equal(validaManifestForge(manifestoValido({ flow: { ...manifestoValido().flow, maxTransitions: 257 } })).ok, false)
    })

    it('⛔⛔ AL CONTRARIO — più di 64 nodi è rifiutato', () => {
        const nodi = []
        for (let i = 0; i < 65; i += 1) nodi.push({ id: `n${i}`, type: 'return', value: i })
        const esito = validaManifestForge({ id: 'x', title: 'x', description: 'x', flow: { entry: 'n0', maxTransitions: 10, nodes: nodi } })
        assert.equal(esito.ok, false)
        assert.ok(esito.diagnostica.some((d) => d.includes('exceeds 64 nodes')))
    })

    it('⛔ AL CONTRARIO — un manifesto/non-oggetto è rifiutato, mai un\'eccezione', () => {
        assert.equal(validaManifestForge(null).ok, false)
        assert.equal(validaManifestForge('stringa').ok, false)
        assert.equal(validaManifestForge(undefined).ok, false)
    })
})

describe('Tool Forge - eseguiFlowForge (l\'interprete)', () => {
    function capacitaFinta(risposte) {
        const chiamate = []
        return { chiamate, fn: async (id, input) => { chiamate.push({ id, input }); if (risposte[id] instanceof Error) throw risposte[id]; return risposte[id] } }
    }

    it('⭐⭐⭐ capability -> return: chiama la capacita con l\'input risolto, torna il suo risultato via target', async () => {
        const capacita = capacitaFinta({ 'notes.create': { id: 'nota-1' } })
        const manifest = {
            flow: {
                entry: 'n1', maxTransitions: 10,
                nodes: [
                    { id: 'n1', type: 'capability', capability: 'notes.create', input: { title: { $ref: '$.input.titolo' } }, target: '$.state.esito', next: 'n2' },
                    { id: 'n2', type: 'return', value: { $ref: '$.state.esito' } },
                ],
            },
        }
        const risultato = await eseguiFlowForge(manifest, { titolo: 'Bevi acqua' }, { capacitaFn: capacita.fn })
        assert.equal(risultato.status, 'succeeded')
        assert.deepEqual(risultato.output, { id: 'nota-1' })
        assert.deepEqual(capacita.chiamate, [{ id: 'notes.create', input: { title: 'Bevi acqua' } }])
    })

    it('⭐⭐ if/else: il ramo giusto viene preso in base alla condizione', async () => {
        const manifest = {
            flow: {
                entry: 'n1', maxTransitions: 10,
                nodes: [
                    { id: 'n1', type: 'if', condition: { left: { $ref: '$.input.x' }, op: 'gt', right: 5 }, then: 'n2', else: 'n3' },
                    { id: 'n2', type: 'return', value: 'grande' },
                    { id: 'n3', type: 'return', value: 'piccolo' },
                ],
            },
        }
        assert.equal((await eseguiFlowForge(manifest, { x: 10 }, { capacitaFn: async () => {} })).output, 'grande')
        assert.equal((await eseguiFlowForge(manifest, { x: 1 }, { capacitaFn: async () => {} })).output, 'piccolo')
    })

    it('⭐ fail: termina con lo status/codice/messaggio del nodo', async () => {
        const manifest = { flow: { entry: 'n1', maxTransitions: 10, nodes: [{ id: 'n1', type: 'fail', code: 'NOT_ALLOWED', message: 'non permesso' }] } }
        const risultato = await eseguiFlowForge(manifest, {}, { capacitaFn: async () => {} })
        assert.equal(risultato.status, 'failed')
        assert.deepEqual(risultato.error, { code: 'NOT_ALLOWED', message: 'non permesso' })
    })

    it('⛔⛔⛔ AL CONTRARIO — una capability che LANCIA produce un esito failed onesto, mai un successo inventato', async () => {
        const capacita = capacitaFinta({ 'notes.create': new Error('disco pieno') })
        const manifest = { flow: { entry: 'n1', maxTransitions: 10, nodes: [{ id: 'n1', type: 'capability', capability: 'notes.create', input: {}, next: 'n2' }, { id: 'n2', type: 'return', value: 'mai' }] } }
        const risultato = await eseguiFlowForge(manifest, {}, { capacitaFn: capacita.fn })
        assert.equal(risultato.status, 'failed')
        assert.equal(risultato.error.code, 'TALOS_FORGE_CAPABILITY_FAILED')
        assert.match(risultato.error.message, /disco pieno/)
    })

    it('⛔⛔ AL CONTRARIO — un ciclo (next che torna su se stesso) si ferma al tetto maxTransitions, mai un loop infinito', async () => {
        const manifest = { flow: { entry: 'n1', maxTransitions: 5, nodes: [{ id: 'n1', type: 'if', condition: { left: true, op: 'truthy' }, then: 'n1', else: 'n1' }] } }
        const risultato = await eseguiFlowForge(manifest, {}, { capacitaFn: async () => {} })
        assert.equal(risultato.status, 'failed')
        assert.equal(risultato.error.code, 'TALOS_FORGE_MAX_TRANSITIONS')
        assert.ok(risultato.trace.length <= 5)
    })

    it('⛔ AL CONTRARIO — un next verso un nodo mai dichiarato produce TALOS_FORGE_NODE_MISSING, non un\'eccezione', async () => {
        const manifest = { flow: { entry: 'n1', maxTransitions: 10, nodes: [{ id: 'n1', type: 'capability', capability: 'notes.list', input: {}, next: 'fantasma' }] } }
        const risultato = await eseguiFlowForge(manifest, {}, { capacitaFn: async () => ({}) })
        assert.equal(risultato.status, 'failed')
        assert.equal(risultato.error.code, 'TALOS_FORGE_NODE_MISSING')
    })
})

describe('formattaEsitoForge - pura', () => {
    it('succeeded con output stringa: torna il testo verbatim', () => {
        assert.equal(formattaEsitoForge({ status: 'succeeded', output: 'fatto davvero' }), 'fatto davvero')
    })

    it('succeeded con output oggetto: torna il JSON', () => {
        assert.equal(formattaEsitoForge({ status: 'succeeded', output: { id: 'x' } }), '{"id":"x"}')
    })

    it('AL CONTRARIO - failed: il codice e il messaggio dell\'errore, mai un testo generico', () => {
        assert.equal(formattaEsitoForge({ status: 'failed', error: { code: 'TALOS_FORGE_CAPABILITY_FAILED', message: 'x è fallito' } }), 'TALOS_FORGE_CAPABILITY_FAILED: x è fallito')
    })
})

describe('talosLavora - Tool Forge (FASE N, nono e ultimo sistema, "fetta onesta")', () => {
    function cartellaVuota(t) {
        const radice = mkdtempSync(join(tmpdir(), 'talos-harness-forge-'))
        t.after(() => rmSync(radice, { recursive: true, force: true }))
        return radice
    }

    function reteDiRisposte(...risposte) {
        const chiamate = []
        return {
            chiamate,
            fetch: async (url, opzioni) => {
                const indice = chiamate.length
                chiamate.push({ url, opzioni, corpo: JSON.parse(opzioni.body) })
                const scelta = risposte[Math.min(indice, risposte.length - 1)]
                return { ok: true, status: 200, json: async () => ({ choices: [{ message: scelta }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), text: async () => '' }
            },
        }
    }

    const TASK = { consegna: 'un compito qualunque, per la prova' }
    const CONCLUSO_SUBITO = { role: 'assistant', content: 'fatto, nessun attrezzo serve', tool_calls: [] }

    function chiamataTool(nome, argomenti) {
        return { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: nome, arguments: JSON.stringify(argomenti) } }] }
    }

    const MANIFESTO_ARGOMENTI = {
        id: 'log-water-intake', title: 'Log water intake', description: 'Creates a note logging water intake.',
        flow: { entry: 'n1', maxTransitions: 10, nodes: [{ id: 'n1', type: 'capability', capability: 'notes.create', input: { title: { $ref: '$.input.title' } }, target: '$.state.x', next: 'n2' }, { id: 'n2', type: 'return', value: { $ref: '$.state.x' } }] },
    }

    it('tool_create è offerto al modello SOLO se nominato in strumentiEstesi', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['tool_create'] })
        assert.equal(esito.comeFinita, 'concluso')
        assert.ok(rete.chiamate[0].corpo.tools.some((t) => t.function.name === 'tool_create'))
        assert.equal(rete.chiamate[0].corpo.tools.length, 7 + 1)
    })

    it('tool_create SENZA onForgeCrea: messaggio onesto, mai un tentativo silenzioso', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(chiamataTool('tool_create', MANIFESTO_ARGOMENTI), CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['tool_create'] })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /not configured/)
    })

    it('tool_create CON onForgeCrea: argomenti VERI arrivano intatti, l\'esito della callback è la riga mostrata', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(chiamataTool('tool_create', MANIFESTO_ARGOMENTI), CONCLUSO_SUBITO)
        const ricevuti = []
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['tool_create'],
            onForgeCrea: async (spec) => { ricevuti.push(spec); return { ok: true, esito: 'Created "Log water intake" — it stays off until the user enables it in Tool Forge.' } },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.deepEqual(ricevuti, [MANIFESTO_ARGOMENTI])
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.equal(messaggioTool.content, 'Created "Log water intake" — it stays off until the user enables it in Tool Forge.')
    })

    it('AL CONTRARIO - tool_create: un onForgeCrea che LANCIA produce un "failed:" onesto, mai un successo inventato', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(chiamataTool('tool_create', MANIFESTO_ARGOMENTI), CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['tool_create'],
            onForgeCrea: async () => { throw new Error('registro pieno') },
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /^tool_create failed: registro pieno$/)
    })

    it('tool_create con onForgeCrea che torna ok:false: il messaggio della callback vince, non una parola generica', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(chiamataTool('tool_create', MANIFESTO_ARGOMENTI), CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['tool_create'],
            onForgeCrea: async () => ({ ok: false, esito: 'That tool could not be created: id already exists.' }),
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.equal(messaggioTool.content, 'That tool could not be created: id already exists.')
    })

    it('⛔⛔⛔ AL CONTRARIO — livelloAccesso:\'lettura\' rifiuta tool_create — REFUSED, onForgeCrea MAI chiamata', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(chiamataTool('tool_create', MANIFESTO_ARGOMENTI), CONCLUSO_SUBITO)
        let chiamata = false
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, livelloAccesso: 'lettura',
            strumentiEstesi: ['tool_create'], onForgeCrea: async () => { chiamata = true; return { ok: true, esito: 'x' } },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(chiamata, false)
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /^REFUSED\./)
    })

    it('⛔⛔⛔ AL CONTRARIO — PARITÀ: senza strumentiEstesi, 7 attrezzi, zero tool_create', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(rete.chiamate[0].corpo.tools.length, 7)
        assert.ok(!rete.chiamate[0].corpo.tools.some((t) => t.function.name === 'tool_create'))
    })

    /*
     * ⭐⭐⭐⭐ Il tool FORGIATO dinamico — stesso principio di prova già
     * usato per toolMcp/toolPlugin: un tool costruito dal CHIAMANTE
     * (non da ATTREZZI_ESTESI), offerto SOLO se toolForge lo elenca,
     * dispatchato tramite eseguiToolForgeFn.
     */
    const TOOL_FORGIATO = [{ name: 'forge_log-water-intake', description: 'Log water intake', inputSchema: { type: 'object', properties: { title: { type: 'string' } } } }]

    it('⭐⭐⭐ un tool forgiato ABILITATO è offerto al modello (fuori da ATTREZZI_ESTESI)', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, toolForge: TOOL_FORGIATO })
        assert.equal(esito.comeFinita, 'concluso')
        assert.ok(rete.chiamate[0].corpo.tools.some((t) => t.function.name === 'forge_log-water-intake'))
        assert.equal(rete.chiamate[0].corpo.tools.length, 7 + 1)
    })

    it('un tool forgiato SENZA eseguiToolForgeFn: messaggio onesto', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(chiamataTool('forge_log-water-intake', { title: 'Bevi acqua' }), CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, toolForge: TOOL_FORGIATO })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /not configured/)
    })

    it('un tool forgiato CON eseguiToolForgeFn: argomenti VERI arrivano intatti, l\'esito passa per formattaEsitoForge', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(chiamataTool('forge_log-water-intake', { title: 'Bevi acqua' }), CONCLUSO_SUBITO)
        const ricevuti = []
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, toolForge: TOOL_FORGIATO,
            eseguiToolForgeFn: async (nome, argomenti) => { ricevuti.push({ nome, argomenti }); return { status: 'succeeded', output: 'Nota creata.' } },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.deepEqual(ricevuti, [{ nome: 'forge_log-water-intake', argomenti: { title: 'Bevi acqua' } }])
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.equal(messaggioTool.content, 'Nota creata.')
    })

    it('AL CONTRARIO - tool forgiato: un eseguiToolForgeFn che LANCIA produce un "failed:" onesto', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(chiamataTool('forge_log-water-intake', {}), CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, toolForge: TOOL_FORGIATO,
            eseguiToolForgeFn: async () => { throw new Error('interprete rotto') },
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /^forged tool call failed: interprete rotto$/)
    })

    it('un tool forgiato che l\'interprete segnala "failed": formattaEsitoForge produce codice+messaggio, non un successo', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(chiamataTool('forge_log-water-intake', {}), CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, toolForge: TOOL_FORGIATO,
            eseguiToolForgeFn: async () => ({ status: 'failed', error: { code: 'TALOS_FORGE_CAPABILITY_FAILED', message: 'notes.create fallita' } }),
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.equal(messaggioTool.content, 'TALOS_FORGE_CAPABILITY_FAILED: notes.create fallita')
    })

    it('⛔⛔⛔ AL CONTRARIO — PARITÀ: senza toolForge, zero tool dinamici forgiati offerti', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CONCLUSO_SUBITO)
        const esito = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(rete.chiamate[0].corpo.tools.length, 7)
    })

    it('⭐⭐ la description di tool_create nomina TUTTE E OTTO le capacità VERE (CAPACITA_FORGE), mai disallineata', () => {
        const strumento = ATTREZZI_ESTESI_OPENAI.find((a) => a.function.name === 'tool_create')
        for (const id of Object.keys(CAPACITA_FORGE)) {
            assert.ok(strumento.function.description.includes(id), `la description di tool_create deve nominare "${id}"`)
        }
    })
})
