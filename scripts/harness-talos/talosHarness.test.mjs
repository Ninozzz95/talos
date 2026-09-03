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
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import {
    siRitenta, attesaDelTentativo, chiamaConRitenta, consumaFlussoSSE,
    comeSonoFinitiIGiri, uscitaUtile,
    stimaToken, stimaTokenConversazione, serveCompattare, compattaConversazione,
    GIRI_PRIMA_DI_COMPATTARE, TOKEN_MINIMI_PER_COMPATTARE,
    serveRiflettere, GIRI_PRIMA_DI_RIFLETTERE,
    primoProgramma, convertiPercorsoWsl,
    indirizzoPubblico, validaUrlNaviga, leggiPaginaSicura,
    talosLavora, pareFallito,
    ATTREZZI_CONCORRENZA, eseguiChiamateRispettandoContratto,
    richiestaRicerca, analizzaRisultatiRicerca, formattaRisultatiRicerca, eseguiRicercaWeb,
    formattaOraCorrente,
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
describe('pareFallito — 6.1, il vocabolario che il file stesso già scrive', () => {
    it('⭐ riconosce i prefissi che questo file dichiara per un esito non riuscito', () => {
        assert.equal(pareFallito('REFUSED. Nothing was written.'), true)
        assert.equal(pareFallito('blocked: indirizzo vietato'), true)
        assert.equal(pareFallito('error: qualcosa è esploso'), true)
        assert.equal(pareFallito('unknown tool: strumento_fantasma'), true)
        assert.equal(pareFallito('search failed: timeout'), true)
        assert.equal(pareFallito('document creation failed: motivo'), true)
    })

    it('⭐ un exit non zero è un fallimento, exit 0 non lo è', () => {
        assert.equal(pareFallito('exit 1\nqualcosa'), true)
        assert.equal(pareFallito('exit -1\nqualcosa'), true)
        assert.equal(pareFallito('exit 0\ntutto bene'), false)
    })

    it('⛔⛔ AL CONTRARIO — un esito riuscito, o "error" a metà frase, NON conta come fallito', () => {
        assert.equal(pareFallito('written: a.txt'), false)
        assert.equal(pareFallito('no error found in the log'), false, 'la parola a metà frase non deve bastare: si guarda solo l\'inizio')
        assert.equal(pareFallito(''), false)
        assert.equal(pareFallito('created: "Titolo" (id: x)'), false)
    })
})

describe('eseguiChiamateRispettandoContratto — 6.2, il contratto di concorrenza', () => {
    const chiamata = (nome, id = nome) => ({ id, function: { name: nome, arguments: '{}' } })

    /** Un `esegui` finto che traccia quanti sono IN VOLO insieme — la prova vera di concorrenza, non solo "non lancia". */
    function esecutoreConTraccia(ritardoMs = 5) {
        let inVolo = 0
        let picco = 0
        const ordine = []
        const esegui = async (c) => {
            inVolo += 1
            picco = Math.max(picco, inVolo)
            await new Promise((risolvi) => setTimeout(risolvi, ritardoMs))
            inVolo -= 1
            ordine.push(c.function.name)
            return `esito-${c.function.name}`
        }
        return { esegui, ordine, picco: () => picco }
    }

    it('⭐⭐⭐ ATTREZZI_CONCORRENZA — SOLO leggi è promosso (6.2 passo 2); tutti gli altri restano exclusive finché non hanno la LORO prova', () => {
        for (const nome of Object.keys(ATTREZZI_CONCORRENZA)) {
            const atteso = nome === 'leggi' ? 'safe' : 'exclusive'
            assert.equal(ATTREZZI_CONCORRENZA[nome], atteso,
                nome === 'leggi' ? 'leggi doveva essere il promosso' : `${nome} non dovrebbe essere già promosso`)
        }
    })

    it('⭐⭐⭐ PARITÀ DEL MECCANISMO — con un contratto TUTTO exclusive, il picco di chiamate in volo è SEMPRE 1', async () => {
        // ⛔ Contratto esplicito, non ATTREZZI_CONCORRENZA: questo prova il
        // MECCANISMO in isolamento dallo stato reale del catalogo — resiste
        // a future promozioni senza doversi riscrivere ogni volta.
        const tuttoExclusive = Object.fromEntries(Object.keys(ATTREZZI_CONCORRENZA).map((n) => [n, 'exclusive']))
        const chiamate = [chiamata('elenca'), chiamata('leggi'), chiamata('scrivi'), chiamata('prova')]
        const { esegui, picco } = esecutoreConTraccia()
        const elaborati = []

        await eseguiChiamateRispettandoContratto(chiamate, esegui, (c, esito) => elaborati.push({ c, esito }), tuttoExclusive)

        assert.equal(picco(), 1, 'tutto exclusive: mai più di una chiamata in volo insieme, come il vecchio for seriale')
        assert.deepEqual(elaborati.map((e) => e.c.function.name), ['elenca', 'leggi', 'scrivi', 'prova'],
            'elabora arriva nello stesso ordine di chiamate, uno alla volta')
    })

    it('⭐⭐⭐ 6.2 PASSO 2 — col contratto VERO di oggi, due "leggi" nello stesso giro girano insieme davvero', async () => {
        const chiamate = [chiamata('leggi', 'call_a'), chiamata('leggi', 'call_b'), chiamata('scrivi', 'call_c')]
        const { esegui, picco, ordine } = esecutoreConTraccia()
        const elaborati = []

        // ⛔ NESSUN override: ATTREZZI_CONCORRENZA di produzione, così com'è oggi.
        await eseguiChiamateRispettandoContratto(chiamate, esegui, (c, esito) => elaborati.push({ c, esito }))

        assert.equal(picco(), 2, 'due leggi consecutive nello stesso giro devono girare insieme, col contratto reale')
        assert.equal(ordine[2], 'scrivi', 'scrivi (exclusive) parte solo dopo che le due letture sono finite')
        assert.deepEqual(elaborati.map((e) => e.c.id), ['call_a', 'call_b', 'call_c'],
            'elabora rispetta comunque l\'ordine originale delle chiamate')
    })

    it('⭐⭐⭐ una corsa SAFE consecutiva parte davvero insieme — il picco lo dimostra, non solo l\'assenza di un lancio', async () => {
        const contrattoDiProva = { ...ATTREZZI_CONCORRENZA, elenca: 'safe', cerca: 'safe', leggi: 'safe' }
        const chiamate = [chiamata('elenca'), chiamata('cerca'), chiamata('leggi'), chiamata('scrivi')]
        const { esegui, picco, ordine } = esecutoreConTraccia()
        const elaborati = []

        await eseguiChiamateRispettandoContratto(chiamate, esegui, (c, esito) => elaborati.push({ c, esito }), contrattoDiProva)

        assert.equal(picco(), 3, 'i tre safe consecutivi (elenca/cerca/leggi) devono aver girato TUTTI insieme')
        assert.deepEqual(ordine.slice(0, 3).sort(), ['cerca', 'elenca', 'leggi'].sort(),
            'i tre safe finiscono (in un ordine qualunque fra loro, sono concorrenti) prima di scrivi')
        assert.equal(ordine[3], 'scrivi', 'scrivi (exclusive) parte SOLO dopo che l\'intera corsa safe è finita')
        assert.deepEqual(elaborati.map((e) => e.c.function.name), ['elenca', 'cerca', 'leggi', 'scrivi'],
            'elabora rispetta SEMPRE l\'ordine originale di chiamate, anche se l\'esecuzione non lo è')
    })

    it('⛔⛔ AL CONTRARIO — un safe isolato fra due exclusive non si raggruppa con nessuno: il picco resta 1', async () => {
        const contrattoDiProva = { ...ATTREZZI_CONCORRENZA, leggi: 'safe' }
        const chiamate = [chiamata('scrivi'), chiamata('leggi'), chiamata('prova')]
        const { esegui, picco } = esecutoreConTraccia()

        await eseguiChiamateRispettandoContratto(chiamate, esegui, () => {}, contrattoDiProva)

        assert.equal(picco(), 1, 'una corsa safe di UN solo elemento non è una prova di concorrenza: resta da sola')
    })

    it('⛔ AL CONTRARIO — un nome assente dal contratto (attrezzo nuovo, mai classificato) resta exclusive, mai safe per sbaglio', async () => {
        const chiamate = [chiamata('attrezzo_mai_visto'), chiamata('elenca')]
        const { esegui, picco } = esecutoreConTraccia()

        await eseguiChiamateRispettandoContratto(chiamate, esegui, () => {})

        assert.equal(picco(), 1, 'un nome ignoto al contratto deve leggersi come exclusive, mai come safe implicito')
    })
})

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

    /**
     * ⭐⭐⭐ 2/9 — chiude il buco dichiarato sopra la firma di talosLavora
     * (il giro di compattazione, Stadio A, non passava mai da onGiro — la
     * UI non vedeva mai "sto riassumendo"). Otto giri con un attrezzo
     * sconosciuto (rifiutato onestamente, mai eseguito per davvero — zero
     * I/O reale, solo per tenere il ciclo vivo) e abbastanza testo da
     * superare TOKEN_MINIMI_PER_COMPATTARE, cosi' il giro 8 compatta per
     * davvero — non un valore finto, la stessa soglia che governa la
     * produzione.
     */
    it('⭐⭐⭐ onGiro porta compattazione-inizio/fine quando Stadio A scatta per davvero', async () => {
        const cartella = cartellaVuota(it)
        const girataConToolIgnoto = (indice) => ({
            role: 'assistant',
            content: 'x'.repeat(1200),
            tool_calls: [{ id: `call_${indice}`, type: 'function', function: { name: 'attrezzo_inesistente_per_la_prova', arguments: '{}' } }],
        })
        const RIASSUNTO_FINTO = { role: 'assistant', content: 'Riassunto: otto tentativi con un attrezzo sconosciuto, tutti rifiutati onestamente; nessun file toccato; prossimo passo: nessuno, era solo per superare la soglia.', tool_calls: [] }
        const rete = reteDiRisposte(
            ...Array.from({ length: GIRI_PRIMA_DI_COMPATTARE }, (_, i) => girataConToolIgnoto(i)),
            RIASSUNTO_FINTO,
            CONCLUSO_SUBITO,
        )
        const eventi = []

        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            onGiro: (e) => eventi.push(e),
        })

        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(esito.compattazioni, 1, 'una sola compattazione: il task conclude al giro 9, prima del prossimo checkpoint')

        const inizio = eventi.filter((e) => e.tipo === 'compattazione-inizio')
        const fine = eventi.filter((e) => e.tipo === 'compattazione-fine')
        assert.equal(inizio.length, 1, 'un solo evento di inizio compattazione')
        assert.equal(fine.length, 1, 'un solo evento di fine compattazione')
        assert.equal(inizio[0].giro, GIRI_PRIMA_DI_COMPATTARE, 'scatta esattamente al giro previsto da Stadio A')
        assert.equal(fine[0].giro, GIRI_PRIMA_DI_COMPATTARE)
        assert.equal(fine[0].compattato, true, 'il riassunto finto è stato accettato: compattato deve dirlo')

        // AL CONTRARIO — ordine: l'evento di inizio precede quello di fine, che precede la ripresa del lavoro normale.
        const indiceInizio = eventi.indexOf(inizio[0])
        const indiceFine = eventi.indexOf(fine[0])
        assert.ok(indiceInizio < indiceFine, 'inizio prima di fine, mai il contrario')
        const primoEventoDopo = eventi[indiceFine + 1]
        assert.ok(primoEventoDopo, 'il lavoro riprende dopo la compattazione, non si ferma lì')
        assert.notEqual(primoEventoDopo.tipo, 'compattazione-inizio', 'una sola compattazione in questa prova, non due di fila')
    })

    /**
     * ⛔ AL CONTRARIO — un task che non arriva mai al checkpoint (conclude
     * al primo giro) non deve mai emettere un evento di compattazione: il
     * segnale non deve comparire quando Stadio A non è nemmeno entrato in
     * gioco.
     */
    it('⛔ AL CONTRARIO — nessun evento di compattazione quando il task conclude prima del checkpoint', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CONCLUSO_SUBITO)
        const eventi = []

        await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            onGiro: (e) => eventi.push(e),
        })

        assert.equal(eventi.filter((e) => e.tipo === 'compattazione-inizio').length, 0)
        assert.equal(eventi.filter((e) => e.tipo === 'compattazione-fine').length, 0)
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

    /* ═══ 6.1 — planner costoso + editor economico ═══ */

    const CHIAMA_ELENCA = {
        role: 'assistant', content: '',
        tool_calls: [{ id: 'call_ok', function: { name: 'elenca', arguments: '{}' } }],
    }
    const CHIAMA_ATTREZZO_FANTASMA = {
        role: 'assistant', content: '',
        tool_calls: [{ id: 'call_ko', function: { name: 'strumento_fantasma', arguments: '{}' } }],
    }

    it('⭐⭐⭐ PARITÀ — senza modelloEsecutore, ogni giro chiama sempre modello, bit-per-bit come prima di 6.1', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CHIAMA_ELENCA, CHIAMA_ATTREZZO_FANTASMA, CONCLUSO_SUBITO)

        await talosLavora({ cartella, task: TASK, modello: 'costoso-x', chiave: 'y', fetchDiRete: rete.fetch })

        assert.deepEqual(rete.chiamate.map((c) => c.corpo.model), ['costoso-x', 'costoso-x', 'costoso-x'],
            'senza modelloEsecutore la riga di scelta deve valere sempre modello, come prima di questa mossa')
    })

    it('⭐⭐⭐ 6.1 — con modelloEsecutore: giro 0 sul costoso, il giro dopo un successo passa all\'economico', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CHIAMA_ELENCA, CONCLUSO_SUBITO)

        await talosLavora({
            cartella, task: TASK, modello: 'costoso-x', chiave: 'y', fetchDiRete: rete.fetch,
            modelloEsecutore: 'economico-y',
        })

        assert.deepEqual(rete.chiamate.map((c) => c.corpo.model), ['costoso-x', 'economico-y'])
    })

    it('⛔⛔ AL CONTRARIO — un giro con un attrezzo "pareFallito" fa tornare il giro DOPO sul costoso, e NON resta sticky', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CHIAMA_ELENCA, CHIAMA_ATTREZZO_FANTASMA, CHIAMA_ELENCA, CONCLUSO_SUBITO)

        await talosLavora({
            cartella, task: TASK, modello: 'costoso-x', chiave: 'y', fetchDiRete: rete.fetch,
            modelloEsecutore: 'economico-y',
        })

        assert.deepEqual(rete.chiamate.map((c) => c.corpo.model), [
            'costoso-x', // giro 0: sempre costoso, qualunque cosa succeda dopo
            'economico-y', // giro 1: il giro 0 (elenca) è riuscito
            'costoso-x', // giro 2: il giro 1 ha chiamato un attrezzo fantasma — pareFallito, si ri-pianifica
            'economico-y', // giro 3: il giro 2 (elenca) è di nuovo riuscito — torna economico, non è sticky
        ])
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

    it('⭐⭐⭐ LEGGI-CONCORRENTE-01 — 6.2 passo 2: due "leggi" nello stesso giro tornano il contenuto GIUSTO a ciascuna, anche in parallelo, su disco VERO', async () => {
        const cartella = cartellaVuota(it)
        writeFileSync(join(cartella, 'alfa.txt'), 'contenuto di alfa, unico e riconoscibile')
        writeFileSync(join(cartella, 'beta.txt'), 'contenuto di beta, completamente diverso da alfa')
        const LEGGE_DUE_FILE = {
            role: 'assistant', content: '',
            tool_calls: [
                { id: 'call_alfa', function: { name: 'leggi', arguments: JSON.stringify({ percorso: 'alfa.txt' }) } },
                { id: 'call_beta', function: { name: 'leggi', arguments: JSON.stringify({ percorso: 'beta.txt' }) } },
            ],
        }
        const rete = reteDiRisposte(LEGGE_DUE_FILE, CONCLUSO_SUBITO)

        await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch })

        // ⛔ Non un dettaglio interno: è la history VERA che il giro dopo manda al
        // modello — se le due letture concorrenti si fossero scambiate il
        // contenuto, il modello leggerebbe alfa dove si aspetta beta.
        const messaggiInviati = rete.chiamate[1].corpo.messages
        const rispostaAlfa = messaggiInviati.find((m) => m.tool_call_id === 'call_alfa')
        const rispostaBeta = messaggiInviati.find((m) => m.tool_call_id === 'call_beta')
        assert.match(rispostaAlfa.content, /contenuto di alfa/)
        assert.match(rispostaBeta.content, /contenuto di beta/)
        assert.doesNotMatch(rispostaAlfa.content, /contenuto di beta/, 'AL CONTRARIO — mai il contenuto scambiato')
        assert.doesNotMatch(rispostaBeta.content, /contenuto di alfa/, 'AL CONTRARIO — mai il contenuto scambiato')
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
            convertiPercorsoWsl('C:\\Users\\utente\\AppData\\Local\\Temp\\banco-iva-XTnAO2'),
            '/mnt/c/Users/utente/AppData/Local/Temp/banco-iva-XTnAO2',
        )
    })

    it('⭐⭐ la lettera di unità diventa minuscola: il mount WSL2 la vuole così', () => {
        assert.equal(convertiPercorsoWsl('D:\\progetti\\foo'), '/mnt/d/progetti/foo')
    })

    it('⛔ e AL CONTRARIO: il resto del percorso NON perde le maiuscole — solo la lettera di unità cambia', () => {
        const risultato = convertiPercorsoWsl('C:\\Users\\utente\\Progetti')
        assert.equal(risultato, '/mnt/c/Users/utente/Progetti',
            'un percorso minuscolizzato per intero punterebbe a una cartella che non esiste su un filesystem case-sensitive')
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

    it('⭐⭐⭐ PARITÀ — i sei parametri nuovi, assenti, non cambiano un solo campo dell esito (stesso stile della PARITÀ di onGiro/onScrittura)', async () => {
        const cartella = cartellaVuota(it)
        const reteA = reteDiRisposte(CONCLUSO_SUBITO)
        const reteB = reteDiRisposte(CONCLUSO_SUBITO)
        const senzaNulla = await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: reteA.fetch })
        const conParametriAssenti = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: reteB.fetch,
            strumentiEstesi: undefined, ricercaWeb: undefined, onArtefatto: undefined, richiediRicercaFn: undefined, orologioFn: undefined, onDocumento: undefined,
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

    it('⛔⛔⛔ 2/9, R8 — livelloAccesso:\'lettura\' rifiuta artifact_create, onArtefatto MAI chiamata', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_ARTEFATTO = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'artifact_create', arguments: '{"titolo":"Grafico","html":"<!doctype html><html><body>x</body></html>"}' } }] }
        const rete = reteDiRisposte(CHIAMA_ARTEFATTO, CONCLUSO_SUBITO)
        let chiamata = false
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, livelloAccesso: 'lettura',
            strumentiEstesi: ['artifact_create'],
            onArtefatto: async () => { chiamata = true; return { id: 'mai' } },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(chiamata, false, 'onArtefatto non va MAI chiamata se il permesso rifiuta prima')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /^REFUSED\./)
    })

    it('⭐ AL CONTRARIO — livelloAccesso di default consente artifact_create, stesso esito di sempre', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_ARTEFATTO = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'artifact_create', arguments: '{"titolo":"Grafico","html":"<!doctype html><html><body>x</body></html>"}' } }] }
        const rete = reteDiRisposte(CHIAMA_ARTEFATTO, CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            strumentiEstesi: ['artifact_create'],
            onArtefatto: async () => ({ id: 'artefatto-vero-42' }),
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.equal(messaggioTool.content, 'created: "Grafico" (id: artefatto-vero-42)')
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
     * ⭐⭐⭐ 30/8 — owner, correggendo un errore: Note/Attività/Memoria/
     * Libreria esistono già sul telefono (mobile/src/lib/tools/toolset.ts),
     * andavano COLLEGATE a questo kernel, non ricostruite. Prima fetta,
     * deliberatamente: SOLO `notes_list`, in lettura — stesso schema di
     * `document_create` sopra.
     */
    it('⛔⛔⛔ notes_list SENZA elencaNoteFn: messaggio onesto al modello, mai un tentativo silenzioso', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_NOTE = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'notes_list', arguments: '{}' } }] }
        const rete = reteDiRisposte(CHIAMA_NOTE, CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['notes_list'],
            // elencaNoteFn ASSENTE apposta
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /not configured on this harness/)
    })

    it('⭐⭐⭐ notes_list CON elencaNoteFn: le note VERE arrivano al modello come JSON, invariate', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_NOTE = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'notes_list', arguments: '{}' } }] }
        const rete = reteDiRisposte(CHIAMA_NOTE, CONCLUSO_SUBITO)
        const NOTE_VERE = [{ id: 'n1', title: 'Spesa', content: 'latte, pane', updatedAt: '2026-08-30T00:00:00.000Z' }]
        let chiamataFatta = false
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['notes_list'],
            elencaNoteFn: async () => { chiamataFatta = true; return NOTE_VERE },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.ok(chiamataFatta)
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.deepEqual(JSON.parse(messaggioTool.content), NOTE_VERE)
    })

    it('⛔ AL CONTRARIO — notes_list con zero note reali: dice onestamente "nessuna nota", mai un array vuoto ambiguo', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_NOTE = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'notes_list', arguments: '{}' } }] }
        const rete = reteDiRisposte(CHIAMA_NOTE, CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['notes_list'],
            elencaNoteFn: async () => [],
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.equal(messaggioTool.content, 'no notes saved on this device.')
    })

    it('⛔ AL CONTRARIO — notes_list con elencaNoteFn che fallisce: errore onesto, mai un successo inventato', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA_NOTE = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'notes_list', arguments: '{}' } }] }
        const rete = reteDiRisposte(CHIAMA_NOTE, CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['notes_list'],
            elencaNoteFn: async () => { throw new Error('ponte non disponibile su questo client') },
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /notes_list failed: ponte non disponibile su questo client/)
    })
})

/*
 * ⭐⭐⭐ 30/8, Fase C (2/7) — generate_image, porta canonico dal desktop
 * (FASE H). Stesso schema esatto di document_create (gate permessi,
 * onesto senza callback, `onImmagine` restituisce {ok, esito} e il
 * kernel estrae solo `.esito`) — coperto qui con lo stesso stile del
 * blocco web_search/artifact_create/document_create/time_now appena
 * sopra, non ATTREZZI_DATI (quella famiglia è Note/Attività/Memoria/
 * Libreria/Ricerca, un pattern diverso — il ponte dati verso il
 * telefono, non un side-channel del kernel verso un provider esterno).
 */
describe('talosLavora — generate_image, opzionale per costruzione', () => {
    function cartellaVuota(t) {
        const radice = mkdtempSync(join(tmpdir(), 'talos-harness-immagine-'))
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
    const CHIAMA_IMMAGINE = { role: 'assistant', content: null, tool_calls: [{ id: 'c1', function: { name: 'generate_image', arguments: '{"prompt":"un gatto rosso su un tetto","shape":"landscape"}' } }] }

    it('⛔ AL CONTRARIO — senza strumentiEstesi, il modello non vede MAI generate_image', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CONCLUSO_SUBITO)
        await talosLavora({ cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch })
        const nomiOfferti = rete.chiamate[0].corpo.tools.map((t) => t.function.name)
        assert.ok(!nomiOfferti.includes('generate_image'))
    })

    it('⭐⭐⭐ round trip vero: onImmagine riceve prompt/shape intatti, il messaggio "Generated and saved..." arriva al modello', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CHIAMA_IMMAGINE, CONCLUSO_SUBITO)
        const ricevuti = []
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['generate_image'],
            onImmagine: async (argomenti) => { ricevuti.push(argomenti); return { ok: true, esito: 'Generated and saved "un-gatto-rosso.png" (12 KB) with bytedance-seed/seedream-4.5.' } },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.deepEqual(ricevuti, [{ prompt: 'un gatto rosso su un tetto', shape: 'landscape' }])
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /Generated and saved "un-gatto-rosso\.png" \(12 KB\)/)
    })

    it('⛔⛔⛔ AL CONTRARIO — senza onImmagine: messaggio onesto, mai un tentativo silenzioso', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CHIAMA_IMMAGINE, CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['generate_image'],
            // NESSUN onImmagine iniettato apposta
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /image generation is not configured on this harness/)
    })

    it('⛔⛔⛔ AL CONTRARIO — livelloAccesso:\'lettura\' rifiuta, mai chiama onImmagine (genera credito reale se sbagliato)', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CHIAMA_IMMAGINE, CONCLUSO_SUBITO)
        let chiamataFatta = false
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['generate_image'],
            livelloAccesso: 'lettura',
            onImmagine: async () => { chiamataFatta = true; return { ok: true, esito: 'generated' } },
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /^REFUSED\./)
        assert.equal(chiamataFatta, false, 'la callback non deve MAI essere chiamata quando il permesso rifiuta prima — costerebbe credito reale per niente')
    })

    it('⛔⛔ AL CONTRARIO — onImmagine lancia (provider irraggiungibile): errore onesto, mai un successo inventato', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CHIAMA_IMMAGINE, CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['generate_image'],
            onImmagine: async () => { throw new Error('TALOS_IMAGE_UNREACHABLE: the OpenRouter Image API could not be reached.') },
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /image generation failed: TALOS_IMAGE_UNREACHABLE/)
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
    const CHIAMA_LEGGI = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'leggi', arguments: '{"percorso":"gia-presente.txt"}' } }] }

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
            chiediApprovazioneFn: async (azione) => { azioniViste.push(azione); return false },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.deepEqual(azioniViste, [{ tipo: 'scrivi', percorso: 'nuovo.txt' }])
        assert.equal(existsSync(join(cartella, 'nuovo.txt')), false)
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /non ha approvato/)
    })

    it('⭐⭐⭐ chiediApprovazioneFn(true) CONSENTE scrivi — il file esiste davvero sul disco', async () => {
        const cartella = cartellaVuota(it)
        const rete = reteDiRisposte(CHIAMA_SCRIVI, CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
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
 * ⭐⭐⭐ 30/8 — seconda fetta: Note in scrittura, Attività/Memoria/
 * Libreria intere, più Ricerca (SOLO lettura, aggiunta in un terzo
 * passo lo stesso giorno — investigando DAVVERO `chatController.ts`
 * invece di fermarsi al primo grep a vuoto, vedi `codiceDati.ts`).
 * Owner: "vai avanti finché non le completi e verifichi tutte".
 * Diciotto attrezzi nuovi, stesso schema esatto di `notes_list`/
 * `document_create` già in suite — coperti qui con test DATA-DRIVEN
 * (un loop sui 18 nomi) per le due proprietà che valgono per TUTTI
 * insieme, più un piccolo numero di round-trip funzionali scelti come
 * rappresentanti, non decine di blocchi quasi identici.
 */
describe('talosLavora — Note/Attività/Memoria/Libreria/Ricerca collegate al kernel (30/8)', () => {
    function cartellaVuota(t) {
        const radice = mkdtempSync(join(tmpdir(), 'talos-harness-dati-'))
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

    /** Un attrezzo per nome, con gli argomenti minimi che passano la sua validazione a monte del test. */
    const ATTREZZI_DATI = [
        { nome: 'notes_list', scrittura: false, argomenti: {} },
        { nome: 'notes_create', scrittura: true, argomenti: { title: 't', content: 'c' } },
        { nome: 'notes_update', scrittura: true, argomenti: { id: 'x', title: 't' } },
        { nome: 'notes_delete', scrittura: true, argomenti: { id: 'x' } },
        { nome: 'tasks_list', scrittura: false, argomenti: {} },
        { nome: 'tasks_create', scrittura: true, argomenti: { title: 't' } },
        { nome: 'tasks_complete', scrittura: true, argomenti: { id: 'x', status: 'done' } },
        { nome: 'tasks_update', scrittura: true, argomenti: { id: 'x', title: 't' } },
        { nome: 'tasks_delete', scrittura: true, argomenti: { id: 'x' } },
        { nome: 'memory_search', scrittura: false, argomenti: { query: 'q' } },
        { nome: 'memory_write', scrittura: true, argomenti: { title: 't', content: 'c' } },
        { nome: 'memory_update', scrittura: true, argomenti: { title: 't', newTitle: 't2' } },
        { nome: 'memory_delete', scrittura: true, argomenti: { title: 't' } },
        { nome: 'library_list', scrittura: false, argomenti: {} },
        { nome: 'library_read', scrittura: false, argomenti: { id: 'x' } },
        { nome: 'library_rename', scrittura: true, argomenti: { id: 'x', name: 'n' } },
        { nome: 'library_delete', scrittura: true, argomenti: { id: 'x' } },
        { nome: 'library_search', scrittura: false, argomenti: { query: 'q' } },
        { nome: 'library_file_origin', scrittura: false, argomenti: { id: 'x' } },
        { nome: 'research_list', scrittura: false, argomenti: {} },
        { nome: 'research_read', scrittura: false, argomenti: { id: 'x' } },
    ]

    for (const { nome, argomenti } of ATTREZZI_DATI) {
        it(`⛔⛔⛔ ${nome} SENZA la sua callback: messaggio onesto al modello, mai un tentativo silenzioso`, async () => {
            const cartella = cartellaVuota(it)
            const CHIAMA = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: nome, arguments: JSON.stringify(argomenti) } }] }
            const rete = reteDiRisposte(CHIAMA, CONCLUSO_SUBITO)
            const esito = await talosLavora({
                cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: [nome],
                // NESSUNA callback iniettata apposta
            })
            assert.equal(esito.comeFinita, 'concluso')
            const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
            assert.match(messaggioTool.content, /not configured on this harness/)
        })
    }

    for (const { nome, argomenti } of ATTREZZI_DATI.filter((a) => a.scrittura)) {
        it(`⛔⛔⛔ AL CONTRARIO — livelloAccesso:'lettura' rifiuta ${nome} anche con la callback presente e pronta ad accettare`, async () => {
            const cartella = cartellaVuota(it)
            const CHIAMA = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: nome, arguments: JSON.stringify(argomenti) } }] }
            const rete = reteDiRisposte(CHIAMA, CONCLUSO_SUBITO)
            let chiamataFatta = false
            const callbackChePotrebbeAccettare = async () => { chiamataFatta = true; return { id: 'x', title: 'x', name: 'x' } }
            const nomeParametro = {
                notes_create: 'creaNotaFn', notes_update: 'aggiornaNotaFn', notes_delete: 'eliminaNotaFn',
                tasks_create: 'creaTaskFn', tasks_complete: 'completaTaskFn', tasks_update: 'aggiornaTaskFn', tasks_delete: 'eliminaTaskFn',
                memory_write: 'creaMemoriaFn', memory_update: 'aggiornaMemoriaFn', memory_delete: 'eliminaMemoriaFn',
                library_rename: 'rinominaLibreriaFn', library_delete: 'eliminaLibreriaFn',
            }[nome]
            const esito = await talosLavora({
                cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: [nome],
                livelloAccesso: 'lettura',
                [nomeParametro]: callbackChePotrebbeAccettare,
            })
            assert.equal(esito.comeFinita, 'concluso')
            const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
            assert.match(messaggioTool.content, /^REFUSED\./)
            assert.equal(chiamataFatta, false, 'la callback non deve MAI essere chiamata quando il permesso rifiuta prima')
        })
    }

    it('⭐⭐⭐ notes_create → notes_update → notes_delete, round trip vero, dati veri passano intatti', async () => {
        const cartella = cartellaVuota(it)
        const CREA = { role: 'assistant', content: null, tool_calls: [{ id: 'c1', function: { name: 'notes_create', arguments: '{"title":"Spesa","content":"latte, pane"}' } }] }
        const rete = reteDiRisposte(CREA, CONCLUSO_SUBITO)
        const ricevuti = []
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['notes_create'],
            creaNotaFn: async (input) => { ricevuti.push(input); return { id: 'n1', title: input.title, content: input.content, updatedAt: '2026-08-30T00:00:00.000Z' } },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.deepEqual(ricevuti, [{ title: 'Spesa', content: 'latte, pane' }])
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /saved: "Spesa" \(id: n1\)/)
    })

    it('⭐⭐⭐ tasks_complete manda lo status VERO al modello, non "fatto" generico', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA = { role: 'assistant', content: null, tool_calls: [{ id: 'c1', function: { name: 'tasks_complete', arguments: '{"id":"t1","status":"doing"}' } }] }
        const rete = reteDiRisposte(CHIAMA, CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['tasks_complete'],
            completaTaskFn: async (id, status) => ({ id, title: 'Chiama idraulico', status }),
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /"Chiama idraulico" is now doing\./)
    })

    it('⛔ AL CONTRARIO — memory_update su un titolo che non esiste: messaggio onesto, mai un successo inventato', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA = { role: 'assistant', content: null, tool_calls: [{ id: 'c1', function: { name: 'memory_update', arguments: '{"title":"mai esistita","newTitle":"x"}' } }] }
        const rete = reteDiRisposte(CHIAMA, CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['memory_update'],
            aggiornaMemoriaFn: async () => null, // stesso contratto di codiceDati.ts: null quando il titolo non trova nulla
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /no memory has the title "mai esistita"/)
    })

    it('⛔ AL CONTRARIO — notes_update senza title né content: REFUSED prima ancora di chiamare la callback', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA = { role: 'assistant', content: null, tool_calls: [{ id: 'c1', function: { name: 'notes_update', arguments: '{"id":"n1"}' } }] }
        const rete = reteDiRisposte(CHIAMA, CONCLUSO_SUBITO)
        let chiamataFatta = false
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['notes_update'],
            aggiornaNotaFn: async () => { chiamataFatta = true; return { id: 'n1', title: 't', content: 'c' } },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.equal(chiamataFatta, false)
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /^REFUSED\. Nothing to change/)
    })

    it('⭐ library_rename: il vero nome nuovo arriva al modello', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA = { role: 'assistant', content: null, tool_calls: [{ id: 'c1', function: { name: 'library_rename', arguments: '{"id":"f1","name":"bilancio.xlsx"}' } }] }
        const rete = reteDiRisposte(CHIAMA, CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['library_rename'],
            rinominaLibreriaFn: async (id, name) => ({ id, name }),
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /renamed to: "bilancio\.xlsx"/)
    })

    it('⛔ AL CONTRARIO — library_rename su un id inesistente: messaggio onesto, mai un rinomina inventato', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA = { role: 'assistant', content: null, tool_calls: [{ id: 'c1', function: { name: 'library_rename', arguments: '{"id":"non-esiste","name":"x"}' } }] }
        const rete = reteDiRisposte(CHIAMA, CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['library_rename'],
            rinominaLibreriaFn: async () => null,
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /no Library file has the id "non-esiste"/)
    })

    it('⭐⭐⭐ 2/9 — library_search: i risultati veri della ricerca arrivano al modello, mai un JSON vuoto letto come "0 hit"', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA = { role: 'assistant', content: null, tool_calls: [{ id: 'c1', function: { name: 'library_search', arguments: '{"query":"quarzo","limit":3}' } }] }
        const rete = reteDiRisposte(CHIAMA, CONCLUSO_SUBITO)
        const ricevuti = []
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['library_search'],
            cercaLibreriaFn: async (query, limit) => {
                ricevuti.push({ query, limit })
                return [{ id: 'f2', displayName: 'quarzo.txt', mediaType: 'text/plain', excerpt: 'proprietà del quarzo' }]
            },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.deepEqual(ricevuti, [{ query: 'quarzo', limit: 3 }])
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /"displayName":"quarzo\.txt"/)
    })

    it('⛔ AL CONTRARIO — library_search senza corrispondenze: messaggio onesto, mai un JSON "[]" che il modello deve interpretare da solo', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA = { role: 'assistant', content: null, tool_calls: [{ id: 'c1', function: { name: 'library_search', arguments: '{"query":"nulla"}' } }] }
        const rete = reteDiRisposte(CHIAMA, CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['library_search'],
            cercaLibreriaFn: async () => [],
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /no Library file matched that\./)
    })

    it('⭐ library_file_origin: la provenienza vera arriva al modello', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA = { role: 'assistant', content: null, tool_calls: [{ id: 'c1', function: { name: 'library_file_origin', arguments: '{"id":"f3"}' } }] }
        const rete = reteDiRisposte(CHIAMA, CONCLUSO_SUBITO)
        const ricevuti = []
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['library_file_origin'],
            origineLibreriaFn: async (id) => {
                ricevuti.push(id)
                return { name: 'grafico.png', origin: 'generated', model: 'gemini-3.7-flash', provider: 'google', createdAt: '2026-09-02T10:00:00.000Z', sourceUrl: null }
            },
        })
        assert.equal(esito.comeFinita, 'concluso')
        assert.deepEqual(ricevuti, ['f3'])
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /"model":"gemini-3\.7-flash"/)
    })

    it('⛔ AL CONTRARIO — library_file_origin su un id inesistente: messaggio onesto, mai una provenienza inventata', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA = { role: 'assistant', content: null, tool_calls: [{ id: 'c1', function: { name: 'library_file_origin', arguments: '{"id":"non-esiste"}' } }] }
        const rete = reteDiRisposte(CHIAMA, CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['library_file_origin'],
            origineLibreriaFn: async () => null,
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /no Library file has the id "non-esiste"/)
    })

    it('⭐ research_list: le ricerche vere arrivano al modello, non un elenco vuoto ambiguo', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA = { role: 'assistant', content: null, tool_calls: [{ id: 'c1', function: { name: 'research_list', arguments: '{}' } }] }
        const rete = reteDiRisposte(CHIAMA, CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['research_list'],
            elencaRicercaFn: async () => [{ id: 'r1', title: 'Confronto fornitori', status: 'done', startedAt: '2026-08-29T00:00:00.000Z' }],
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /Confronto fornitori/)
    })

    it('⛔ AL CONTRARIO — research_read su una ricerca senza rapporto leggibile: messaggio onesto, mai un rapporto inventato', async () => {
        const cartella = cartellaVuota(it)
        const CHIAMA = { role: 'assistant', content: null, tool_calls: [{ id: 'c1', function: { name: 'research_read', arguments: '{"id":"r1"}' } }] }
        const rete = reteDiRisposte(CHIAMA, CONCLUSO_SUBITO)
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['research_read'],
            leggiRicercaFn: async () => null, // stesso contratto di codiceDati.ts: null quando non c'è un rapporto leggibile
        })
        assert.equal(esito.comeFinita, 'concluso')
        const messaggioTool = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool')
        assert.match(messaggioTool.content, /there is no readable report for that research/)
    })
})
