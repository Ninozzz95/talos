/*
 * ⛔⛔⛔ BC-01 e BC-02 — IL FILE CHE IL CODICE CITAVA E CHE NON ESISTEVA.
 *
 * Il lavoro del 11/09 su `talosHarness.mjs` rimanda a
 * `tests/kernel-loop-locale-e-stop.test.mjs` in CINQUE commenti, ognuno con la
 * parola «MISURATO» davanti a un numero. Il file non c'era: la sessione che lo
 * stava scrivendo e' morta su un limite prima di arrivarci, e le misure
 * dichiarate non avevano nessuna prova dietro. Questo file e' quella prova, e i
 * numeri qui dentro sono stati rimisurati da zero, non ricopiati.
 *
 * ⛔ Le misure di tempo (BC-02) sono volutamente LARGHE come soglia: la prova
 * non e' «quanti millisecondi esatti», e' «ordine di grandezza giusto». Il
 * difetto che cercano e' un ritardo di SECONDI — 46 s sul sottoprocesso, 3,0 s
 * sull'attesa del ritenta, «appeso per sempre» sull'approvazione — e una soglia
 * generosa lo prende lo stesso senza diventare rossa su una macchina carica.
 */
import { strict as assert } from 'node:assert'
import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import {
    chiamaConRitenta,
    consumaFlussoSSE,
    eseguiComandoSandboxato,
    limitaRipetizioniIdentiche,
    talosLavora,
    RIPETIZIONI_IDENTICHE_MASSIME,
} from '../src/kernel/talosHarness.mjs'

const enc = new TextEncoder()

/** Un finto backend locale: gli si danno i fotogrammi, li manda come SSE e chiude con `[DONE]`. */
const fintoBackend = (fotogrammi) => new Response(new ReadableStream({
    start(c) {
        for (const f of fotogrammi) c.enqueue(enc.encode(`data: ${JSON.stringify(f)}\n\n`))
        c.enqueue(enc.encode('data: [DONE]\n\n'))
        c.close()
    },
}))

const nomiDi = (risultato) => (risultato.scelta.tool_calls ?? []).map((c) => c.function.name)

describe('BC-01 — il modello locale che va in loop: 398 chiamate in un giro solo', () => {
    /*
     * ⭐ LA FORMA MISURATA SULLA SESSIONE VERA (08/09): 398 `ToolCallStart` in
     * UN messaggio assistant, 398 id distinti, 2 combinazioni nome+argomenti su
     * 398. La causa prima e' a monte (ik_llama.cpp #1613: «keeps emitting
     * tool_call blocks indefinitely … bounded only by max_tokens or client
     * timeout»); la nostra parte era che il client non limitava niente.
     */
    const valangaStreaming = (quante) => Array.from({ length: quante }, (_, i) => (
        { choices: [{ delta: { tool_calls: [{ index: i, id: `call_${i}`, function: { name: 'elenca', arguments: '{}' } }] } }] }
    ))

    it('⭐⭐⭐ RIPRODUZIONE — 398 chiamate identiche in streaming: ne sopravvivono 2, non 398', async () => {
        const r = await consumaFlussoSSE(fintoBackend(valangaStreaming(398)))
        assert.equal(r.scelta.tool_calls.length, 2, 'la valanga deve fermarsi alla soglia, non arrivare intera al ciclo degli attrezzi')
        assert.equal(r.ripetizione.nome, 'elenca')
        assert.equal(r.ripetizione.viste, RIPETIZIONI_IDENTICHE_MASSIME)
    })

    it('⭐⭐⭐ RIPRODUZIONE — la stessa valanga dalla porta SENZA streaming (r.json(), la strada di TALOS-BANCO)', async () => {
        const r = await chiamaConRitenta({
            modello: 'x', chiave: 'y', messaggi: [],
            fetchDiRete: async () => Response.json({ choices: [{ message: { role: 'assistant', content: null,
                tool_calls: Array.from({ length: 398 }, (_, i) => ({ id: `c${i}`, type: 'function', function: { name: 'elenca', arguments: '{}' } })) } }] }),
        })
        assert.equal(r.scelta.tool_calls.length, 2, 'senza onDelta la rete di sicurezza non esisteva: 398 dentro, 398 eseguite')
        assert.equal(r.ripetizione.viste, RIPETIZIONI_IDENTICHE_MASSIME)
    })

    it('⭐⭐⭐ END-TO-END — talosLavora esegue 2 attrezzi su una valanga di 398, e lo DICE', async (t) => {
        const cartella = mkdtempSync(join(tmpdir(), 'bc01-e2e-'))
        t.after(() => rmSync(cartella, { recursive: true, force: true }))
        let giro = 0
        const esito = await talosLavora({
            cartella, task: { consegna: 'elenca la cartella' }, modello: 'x', chiave: 'y',
            onDelta: () => {},
            fetchDiRete: async () => {
                giro += 1
                return giro === 1 ? fintoBackend(valangaStreaming(398)) : fintoBackend([{ choices: [{ delta: { content: 'finito' } }] }])
            },
        })
        const esitiAttrezzo = esito.messaggiFinali.filter((m) => m.role === 'tool')
        assert.equal(esitiAttrezzo.length, 2, '398 chiamate dentro, 2 esiti in conversazione')
        assert.equal(esito.comeFinita, 'ripetizione', 'ne "concluso" ne "giri-esauriti": la ripetizione ha un esito SUO')
        assert.match(esito.detto, /ha chiesto 3 volte la stessa identica cosa/)
    })

    /*
     * ⛔ I TRE MODI in cui i server locali sbagliano `index`, tutti e tre
     * documentati a monte e tutti e tre riprodotti qui. Prima della cura
     * dell'11/09 `pezzo.index ?? 0` faceva collassare i primi due casi su una
     * chiamata sola col nome incollato, e lasciava un BUCO nell'array nel terzo.
     */
    it('⭐⭐⭐ RIPRODUZIONE — `index` ASSENTE (ollama#7881): tre attrezzi restano tre, non diventano «elencaleggicerca»', async () => {
        const r = await consumaFlussoSSE(fintoBackend(['elenca', 'leggi', 'cerca'].flatMap((n) => [
            { choices: [{ delta: { tool_calls: [{ id: `id_${n}`, function: { name: n } }] } }] },
            { choices: [{ delta: { tool_calls: [{ function: { arguments: `{"n":"${n}"}` } }] } }] },
        ])))
        assert.deepEqual(nomiDi(r), ['elenca', 'leggi', 'cerca'])
    })

    it('⭐⭐⭐ RIPRODUZIONE — ne `index` ne `id`: l\'ultima chiamata aperta si chiude quando ne comincia un\'altra col suo nome', async () => {
        const r = await consumaFlussoSSE(fintoBackend(['elenca', 'leggi', 'cerca'].flatMap((n) => [
            { choices: [{ delta: { tool_calls: [{ function: { name: n } }] } }] },
            { choices: [{ delta: { tool_calls: [{ function: { arguments: `{"n":"${n}"}` } }] } }] },
        ])))
        assert.deepEqual(nomiDi(r), ['elenca', 'leggi', 'cerca'])
    })

    it('⭐⭐⭐ RIPRODUZIONE — `index` SEMPRE 0 con id diversi (ollama#15457): due chiamate restano due', async () => {
        const r = await consumaFlussoSSE(fintoBackend(['elenca', 'leggi'].flatMap((n) => [
            { choices: [{ delta: { tool_calls: [{ index: 0, id: `id_${n}`, function: { name: n } }] } }] },
            { choices: [{ delta: { tool_calls: [{ index: 0, id: `id_${n}`, function: { arguments: `{"n":"${n}"}` } }] } }] },
        ])))
        assert.deepEqual(nomiDi(r), ['elenca', 'leggi'])
    })

    it('⛔⛔ RIPRODUZIONE — `index` che comincia da 1 (litellm#32759): nessun BUCO, e il ciclo non muore di TypeError', async () => {
        const r = await consumaFlussoSSE(fintoBackend([
            { choices: [{ delta: { tool_calls: [{ index: 1, id: 'a', function: { name: 'elenca', arguments: '{}' } }] } }] },
            { choices: [{ delta: { tool_calls: [{ index: 2, id: 'b', function: { name: 'leggi', arguments: '{}' } }] } }] },
        ]))
        const chiamate = r.scelta.tool_calls
        assert.equal(chiamate.length, 2, 'densa in ordine di arrivo: la posizione la decidiamo noi, non il server')
        assert.equal(Array.from(chiamate).filter((c) => c === undefined).length, 0, 'un array SPARSO nasconde i buchi a `filter`: si contano su `Array.from`')
        /* ⛔ La prova che il buco uccideva: `for…of` su un array sparso tira fuori `undefined`, e la riga dopo legge `c.function`. */
        for (const c of chiamate) assert.ok(c.function, 'nessun `undefined` deve arrivare al ciclo degli attrezzi')
    })

    /*
     * ⛔⛔ crashr/llama-stream: quando la risposta contiene tool call,
     * llama-server «typically sends the entire JSON response at once, even if
     * `stream: true` was requested». Un fotogramma cosi' non ha
     * `choices[0].delta` ma `choices[0].message`, e prima dell'11/09 lo
     * buttavamo via in silenzio.
     */
    it('⭐⭐⭐ RIPRODUZIONE — llama-server manda TUTTO in un colpo: la risposta si legge invece di sparire', async () => {
        const r = await consumaFlussoSSE(fintoBackend([{ choices: [{ message: { role: 'assistant', content: 'risposta intera' } }] }]))
        assert.equal(r.scelta.content, 'risposta intera')
    })

    it('⭐⭐⭐ RIPRODUZIONE — «tutto in un colpo» CON la valanga dentro: 398 dentro, 2 fuori', async () => {
        const r = await consumaFlussoSSE(fintoBackend([{ choices: [{ message: { role: 'assistant', content: null,
            tool_calls: Array.from({ length: 398 }, (_, i) => ({ id: `call_${i}`, type: 'function', function: { name: 'elenca', arguments: '{}' } })) } }] }]))
        assert.equal(r.scelta.tool_calls.length, 2)
        assert.equal(r.ripetizione.viste, RIPETIZIONI_IDENTICHE_MASSIME)
    })

    it('⛔⛔ AL CONTRARIO — chi manda i delta E POI il messaggio completo in coda non deve RADDOPPIARE la risposta', async () => {
        const r = await consumaFlussoSSE(fintoBackend([
            { choices: [{ delta: { content: 'ciao' } }] },
            { choices: [{ message: { role: 'assistant', content: 'ciao' } }] },
        ]))
        assert.equal(r.scelta.content, 'ciao', 'non «ciaociao»: il messaggio intero vale SOLO se di delta non ne e arrivato nemmeno uno')
    })

    describe('⛔⛔⛔ AL CONTRARIO — la deduplicazione non deve mangiare il lavoro legittimo', () => {
        it('due chiamate IDENTICHE di fila restano DUE: la soglia e 3, non 2', async () => {
            const r = await consumaFlussoSSE(fintoBackend([0, 1].map((i) => (
                { choices: [{ delta: { tool_calls: [{ index: i, id: `u${i}`, function: { name: 'leggi', arguments: '{"f":"a.txt"}' } }] } }] }
            ))))
            assert.equal(r.scelta.tool_calls.length, 2)
            assert.equal(r.ripetizione, undefined, 'nessuna ripetizione dichiarata su due copie legittime')
        })

        it('venti chiamate DIVERSE nello stesso giro passano TUTTE: si conta la ripetizione, non il volume', async () => {
            const r = await consumaFlussoSSE(fintoBackend(Array.from({ length: 20 }, (_, i) => (
                { choices: [{ delta: { tool_calls: [{ index: i, id: `d${i}`, function: { name: 'leggi', arguments: `{"f":"${i}.txt"}` } }] } }] }
            ))))
            assert.equal(r.scelta.tool_calls.length, 20)
            assert.equal(r.ripetizione, undefined)
        })

        it('un NOME che arriva a frammenti con l\'indice presente non si spezza in due chiamate', async () => {
            const r = await consumaFlussoSSE(fintoBackend([
                { choices: [{ delta: { tool_calls: [{ index: 0, id: 'z', function: { name: 'ele' } }] } }] },
                { choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'nca' } }] } }] },
                { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{}' } }] } }] },
            ]))
            assert.deepEqual(nomiDi(r), ['elenca'])
        })

        it('`limitaRipetizioniIdentiche` non inventa niente su chi non ha tool_calls, e densifica un array sparso', () => {
            assert.deepEqual(limitaRipetizioniIdentiche(undefined), { toolCalls: [], ripetizione: null })
            assert.deepEqual(limitaRipetizioniIdentiche([]), { toolCalls: [], ripetizione: null })
            const sparso = []
            sparso[2] = { function: { name: 'leggi', arguments: '{}' } }
            const r = limitaRipetizioniIdentiche(sparso)
            assert.equal(r.toolCalls.length, 1, 'i buchi si scartano, non arrivano al ciclo come `undefined`')
        })
    })
})

describe('BC-02 — lo STOP deve essere immediato, non «al prossimo punto sicuro»', () => {
    it('⭐⭐⭐ lo stop DENTRO lo stream chiude in millisecondi, non ai 180 s del timeout', async () => {
        const ac = new AbortController()
        let timer = null
        const infinito = new Response(new ReadableStream({
            start(c) {
                timer = setInterval(() => { try { c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: 'x' } }] })}\n\n`)) } catch { clearInterval(timer) } }, 20)
                ac.signal.addEventListener('abort', () => clearInterval(timer), { once: true })
            },
        }))
        const t0 = Date.now()
        setTimeout(() => ac.abort(), 300)
        const errore = await consumaFlussoSSE(infinito, () => {}, { segnaleStop: ac.signal }).then(() => null, (e) => e)
        clearInterval(timer)
        assert.ok(errore, 'un flusso fermato deve LANCIARE, non tornare una risposta a meta spacciata per finita')
        assert.equal(errore.fermatoSuRichiesta, true)
        assert.ok(Date.now() - t0 < 3_000, `chiuso dopo ${Date.now() - t0} ms: lo stop non ha raggiunto lo stream`)
    })

    it('⭐⭐⭐ lo stop mentre un\'APPROVAZIONE aspetta non lascia la sessione appesa per sempre', async (t) => {
        const cartella = mkdtempSync(join(tmpdir(), 'bc02-appr-'))
        t.after(() => rmSync(cartella, { recursive: true, force: true }))
        const ac = new AbortController()
        let giro = 0, chiesto = 0
        const t0 = Date.now()
        setTimeout(() => ac.abort(), 300)
        const esito = await Promise.race([
            talosLavora({
                cartella, task: { consegna: 'scrivi' }, modello: 'x', chiave: 'y',
                livelloAccesso: 'su-richiesta', segnaleStop: ac.signal, onDelta: () => {},
                /* ⛔ La persona ha cliccato «Ferma» INVECE di rispondere: questa promessa non si risolve mai. */
                chiediApprovazioneFn: async () => { chiesto += 1; return new Promise(() => {}) },
                fetchDiRete: async () => {
                    giro += 1
                    return giro === 1
                        ? fintoBackend([{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'w', function: { name: 'scrivi', arguments: JSON.stringify({ percorso: 'a.txt', contenuto: 'ciao' }) } }] } }] }])
                        : fintoBackend([{ choices: [{ delta: { content: 'fine' } }] }])
                },
            }),
            new Promise((ok) => setTimeout(() => ok('APPESO'), 10_000)),
        ])
        assert.notEqual(esito, 'APPESO', 'la domanda deve correre in gara col segnale, non aspettare una risposta che non arrivera mai')
        assert.equal(chiesto, 1)
        assert.ok(Date.now() - t0 < 5_000, `tornato dopo ${Date.now() - t0} ms`)
        assert.equal(esito.comeFinita, 'fermato')
        /* ⛔ «l'owner non ha approvato» sarebbe una BUGIA: non ha risposto affatto, ha fermato la sessione. Due motivi diversi. */
        const esitoAttrezzo = String(esito.messaggiFinali.filter((m) => m.role === 'tool').at(0)?.content ?? '')
        assert.match(esitoAttrezzo, /fermato su richiesta mentre aspettavo la tua approvazione/)
        assert.doesNotMatch(esitoAttrezzo, /non ha approvato/)
    })

    it('⭐⭐⭐ il registro dice DOVE si e fermato, non solo che si e fermato', async (t) => {
        const cartella = mkdtempSync(join(tmpdir(), 'bc02-dove-'))
        t.after(() => rmSync(cartella, { recursive: true, force: true }))
        const ac = new AbortController()
        let giro = 0
        setTimeout(() => ac.abort(), 300)
        const esito = await talosLavora({
            cartella, task: { consegna: 'scrivi' }, modello: 'x', chiave: 'y',
            livelloAccesso: 'su-richiesta', segnaleStop: ac.signal, onDelta: () => {},
            chiediApprovazioneFn: async () => new Promise(() => {}),
            fetchDiRete: async () => {
                giro += 1
                return giro === 1
                    ? fintoBackend([{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'w', function: { name: 'scrivi', arguments: JSON.stringify({ percorso: 'a.txt', contenuto: 'ciao' }) } }] } }] }])
                    : fintoBackend([{ choices: [{ delta: { content: 'fine' } }] }])
            },
        })
        assert.match(esito.detto, /interrotto su richiesta: mentre aspettavo la tua approvazione per "scrivi"/,
            '«⛔ interrotto su richiesta.» da solo e vero e inservibile: chi rilegge domani deve sapere COSA si e fermato')
    })

    describe('⛔⛔⛔ lo stop uccide l\'ALBERO del sottoprocesso, non solo la shell', () => {
        /*
         * ⛔ Tutti gli spawn di questo file usano `shell: true` o passano da
         * `wsl.exe`: il figlio diretto e' la SHELL e il comando vero e' un
         * NIPOTE. «When using `shell: true` … `ChildProcess.kill()` kills the
         * shell process but not its descendants» (nodejs/node #40438). La via
         * su Windows e' `taskkill /T /F` al livello di chi lancia (pnpm#12406).
         *
         * ⛔ Questa prova conta processi VERI. La sonda che conta non deve
         * contare SE STESSA: si filtra per `Name = 'node.exe'`, perche' la riga
         * di comando del powershell che cerca contiene la sentinella.
         */
        const SENTINELLA = `TALOSPROVA${process.pid}`
        const COMANDO_LUNGO = `node -e "setTimeout(()=>{},45000);/*${SENTINELLA}*/"`
        const quantiVivi = () => {
            try {
                return Number(String(execSync(
                    `powershell -NoProfile -Command "@(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*${SENTINELLA}*' }).Count"`,
                    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
                )).trim()) || 0
            } catch { return -1 }
        }
        const pulisci = () => {
            try {
                execSync(`powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${SENTINELLA}*' -and $_.ProcessId -ne ${process.pid} } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`, { stdio: 'ignore' })
            } catch { /* niente da pulire */ }
        }

        it('⭐⭐⭐ un comando da 45 s fermato dopo 1 s: torna subito E il nipote e MORTO', { skip: process.platform !== 'win32' ? 'prova legata a taskkill di Windows' : false }, async (t) => {
            const cartella = mkdtempSync(join(tmpdir(), 'bc02-albero-'))
            t.after(() => { pulisci(); rmSync(cartella, { recursive: true, force: true }) })
            pulisci()
            const ac = new AbortController()
            const t0 = Date.now()
            setTimeout(() => ac.abort(), 1_000)
            const r = await eseguiComandoSandboxato(COMANDO_LUNGO, cartella, { dove: 'windows', segnaleStop: ac.signal })
            const ms = Date.now() - t0
            assert.ok(ms < 15_000, `tornato dopo ${ms} ms: il comando e stato lasciato girare fino in fondo`)
            assert.equal(r.fermatoSuRichiesta, true)
            /* ⛔ 130 = 128 + SIGINT: «l'ha interrotto qualcuno», DIVERSO dal 124 di «tempo scaduto». Tre esiti, tre codici. */
            assert.equal(r.codice, 130)
            assert.match(String(r.testo), /Fermato su richiesta/)
            await new Promise((ok) => setTimeout(ok, 2_500))
            assert.equal(quantiVivi(), 0, 'il nipote e sopravvissuto: `p.kill()` ha ucciso la shell e non l\'albero')
        })

        it('⛔⛔ AL CONTRARIO — un giro che NESSUNO ha fermato non viene ucciso, e la sua uscita arriva intatta', async (t) => {
            const cartella = mkdtempSync(join(tmpdir(), 'bc02-intatto-'))
            t.after(() => rmSync(cartella, { recursive: true, force: true }))
            const ac = new AbortController()
            const r = await eseguiComandoSandboxato('node -e "console.log(\'CIAO-INTATTO\')"', cartella, { dove: 'windows', segnaleStop: ac.signal })
            assert.equal(r.codice, 0)
            assert.notEqual(r.fermatoSuRichiesta, true)
            assert.match(String(r.testo), /CIAO-INTATTO/)
            assert.doesNotMatch(String(r.testo), /Fermato su richiesta/)
        })
    })

    describe('⛔⛔⛔ 11/09 — l\'ULTIMO «punto sicuro»: l\'attesa fra un ritenta e l\'altro', () => {
        /*
         * ⛔ MISURATO prima della cura, con un finto fornitore che risponde 429:
         * premuto «Ferma» durante l'attesa, il giro tornava 733 ms dopo il clic
         * sulla prima, 1.480 ms sulla seconda, 2.979 ms sulla terza. Lo stop
         * arrivava ovunque tranne qui — e qui l'attesa cresce apposta.
         * Dopo la cura: 0 / 1 / 0 ms.
         */
        it('⭐⭐⭐ lo stop durante l\'attesa del ritenta sveglia l\'attesa invece di aspettarla', async () => {
            for (const quando of [0, 1, 2]) {
                const ac = new AbortController()
                let tentativi = 0, clic = 0
                await chiamaConRitenta({
                    modello: 'x', chiave: 'y', messaggi: [], segnaleStop: ac.signal, caso: () => 0.999,
                    fetchDiRete: async () => {
                        tentativi += 1
                        if (tentativi === quando + 1) setTimeout(() => { clic = Date.now(); ac.abort() }, 10)
                        return new Response('rate limited', { status: 429 })
                    },
                }).then(() => null, (e) => e)
                const ritardo = Date.now() - clic
                assert.ok(ritardo < 400, `attesa n.${quando + 1}: ${ritardo} ms dopo il clic — l'attesa non e stata svegliata`)
            }
        })

        it('⛔⛔ AL CONTRARIO — senza stop i quattro tentativi si fanno tutti, con le attese vere', async () => {
            const t0 = Date.now()
            let tentativi = 0
            const errore = await chiamaConRitenta({
                modello: 'x', chiave: 'y', messaggi: [], caso: () => 0,
                fetchDiRete: async () => { tentativi += 1; return new Response('429', { status: 429 }) },
            }).then(() => null, (e) => e)
            assert.equal(tentativi, 4)
            assert.ok(Date.now() - t0 >= 3_400, 'le attese 500+1000+2000 devono esserci ancora tutte')
            assert.equal(errore.limitatoDalFornitore, true)
        })

        it('⛔⛔ AL CONTRARIO — un segnale MAI abortito non accorcia niente', async () => {
            const ac = new AbortController()
            const t0 = Date.now()
            let tentativi = 0
            await chiamaConRitenta({
                modello: 'x', chiave: 'y', messaggi: [], segnaleStop: ac.signal, caso: () => 0,
                fetchDiRete: async () => { tentativi += 1; return new Response('429', { status: 429 }) },
            }).then(() => null, () => null)
            assert.equal(tentativi, 4)
            assert.ok(Date.now() - t0 >= 3_400)
        })

        it('⛔⛔ AL CONTRARIO — un `dormi` finto di un test (un solo argomento) si comporta come prima, byte per byte', async () => {
            const attese = []
            let tentativi = 0
            await chiamaConRitenta({
                modello: 'x', chiave: 'y', messaggi: [], caso: () => 0,
                dormi: (ms) => { attese.push(ms); return Promise.resolve() },
                fetchDiRete: async () => { tentativi += 1; return new Response('429', { status: 429 }) },
            }).then(() => null, () => null)
            assert.equal(tentativi, 4)
            assert.deepEqual(attese, [500, 1_000, 2_000])
        })

        it('⛔ e il successo dopo un 429 passa ancora', async () => {
            let tentativi = 0
            const r = await chiamaConRitenta({
                modello: 'x', chiave: 'y', messaggi: [], caso: () => 0, dormi: () => Promise.resolve(),
                fetchDiRete: async () => {
                    tentativi += 1
                    return tentativi === 1 ? new Response('429', { status: 429 }) : Response.json({ choices: [{ message: { role: 'assistant', content: 'ok' } }] })
                },
            })
            assert.equal(r.scelta.content, 'ok')
            assert.equal(r.tentativi, 2)
        })
    })
})
