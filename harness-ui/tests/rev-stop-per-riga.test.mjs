/*
 * ⛔ Stop per riga (owner 02/10/2026): ferma UN comando della scheda «Processi» — dell'agente, una `prova`, o un `!` della
 *   persona — e l'agente CONTINUA (130, «fermato su richiesta»). Come Hermes (`process.kill`), Codex
 *   (`command/exec/terminate`) e Claude Code (`TaskStop`). Catena: kernel → agent-service → registro → HTTP → interfaccia
 *   (quest'ultima in `frontend/tests/unit/inspector-processi.test.mjs`, PROC-STOP-01..04).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { talosLavora, eseguiComandoSandboxato, MOTIVO_STOP_DELLA_RIGA, INTESTAZIONE_SFONDO } from '../src/kernel/talosHarness.mjs'
import { eseguiComandoDiretto, avviaSessione } from '../src/agent-service.mjs'
import { createSessionRegistry, registraComandoFermabileIn, processiDaEventi } from '../src/session-registry.mjs'
import { createHttpApp } from '../src/http-app.mjs'
import { registraRiga } from '../src/session-store.mjs'
import { rimuoviCartellaDiProva, rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs'

const FERMATO = '⛔ Stopped on request: the command was stopped while it ran.'
/* Un esecutore finto che gira finché il SUO segnale non si ferma: niente processi veri sotto i giri del modello.
   ⛔ BUG-14: risponde a ENTRAMBI i segnali che arrivano (kernel/agent-service): `segnaleStop` conclude con l'exit
   130 dello Stop; `segnaleSfondo` NON uccide — come il vero esecutore del kernel (`creaGestoreSfondo`) si conclude
   SUBITO con l'esito-sfondo: niente exit, «IN BACKGROUND», il file e chi lo ha sfondato. Il vecchio finto, che
   sentiva solo lo Stop, lasciava SFONDO-01 appeso fino al timeout. */
function esecutoreCheAspetta(partiti) {
    return (comando, _cartella, { segnaleStop, segnaleSfondo, fileSfondo } = {}) => new Promise((risolvi) => {
        partiti.push({ comando, segnaleStop, segnaleSfondo })
        segnaleStop.addEventListener('abort', () => risolvi({ codice: 130, fermatoSuRichiesta: true, testo: FERMATO, enforcement: 'none' }), { once: true })
        if (segnaleSfondo) {
            const sfondaAdesso = () => risolvi({
                codice: null,
                messoInSfondo: true,
                daSfondo: 'persona',
                ...(fileSfondo ? { fileSfondo } : {}),
                testo: `${INTESTAZIONE_SFONDO}: moved to the background by the person (Processes tab). ${fileSfondo ? `Output file: ${fileSfondo}` : '(No output file.)'}`,
                parziale: '',
            })
            if (segnaleSfondo.aborted) sfondaAdesso()
            else segnaleSfondo.addEventListener('abort', sfondaAdesso, { once: true })
        }
    })
}
const cartellaDiProva = (t) => { const c = mkdtempSync(join(tmpdir(), 'talos-stop-riga-')); t.after(() => rimuoviCartellaDiProva(c)); return c }

async function giro(t, { comandi, registraComandoFermabile, segnaleStop, partiti, quandoParte }) {
    const cartella = cartellaDiProva(t)
    const corpi = []
    let n = 0
    const esito = await talosLavora({
        cartella, task: { consegna: 'prova' }, modello: 'f', chiave: 'k', giriMassimi: comandi.length + 2, livelloAccesso: 'accesso-pieno',
        registraComandoFermabile, segnaleStop,
        eseguiComandoSandboxatoFn: (...a) => { const p = esecutoreCheAspetta(partiti)(...a); quandoParte?.(); return p },
        fetchDiRete: async (_url, init) => {
            corpi.push(JSON.parse(init.body))
            const comando = comandi[n++]
            const message = comando !== undefined
                ? { role: 'assistant', content: null, tool_calls: [{ id: `c${n}`, type: 'function', function: { name: 'shell', arguments: JSON.stringify({ comando }) } }] }
                : { role: 'assistant', content: 'fatto' }
            return new Response(JSON.stringify({ choices: [{ message, finish_reason: comando !== undefined ? 'tool_calls' : 'stop' }] }), { headers: { 'Content-Type': 'application/json' } })
        },
    })
    return { esito, corpi }
}

test('STOP-01 (porta vera del kernel): fermare UNA riga chiude quel comando con 130, e il giro CONTINUA fino in fondo', { timeout: 20_000 }, async (t) => {
    const registro = new Map(), partiti = []
    const registraComandoFermabile = ({ toolCallId, ferma }) => { registro.set(toolCallId, ferma); return () => registro.delete(toolCallId) }
    const { esito, corpi } = await giro(t, {
        comandi: ['npm run dev'], registraComandoFermabile, partiti,
        quandoParte: () => setImmediate(() => { assert.ok(registro.has('c1'), 'il comando è registrato col suo id mentre gira'); registro.get('c1')() }),
    })
    assert.equal(partiti.length, 1)
    const risultato = corpi[1].messages.find((m) => m.role === 'tool' && m.tool_call_id === 'c1')
    assert.match(risultato.content, /^exit 130/u)
    assert.match(risultato.content, /Stopped on request/u)
    assert.equal(corpi.length, 2, 'il modello ha avuto il turno dopo lo Stop della riga')
    assert.equal(esito.comeFinita, 'concluso', 'il giro non è stato fermato')
    assert.doesNotMatch(String(esito.detto), /stopped on request/u)
    assert.equal(registro.size, 0, 'finito il comando, la riga non si può più fermare')
})

test('STOP-02: lo Stop del GIRO ferma ancora anche il comando (il segnale è l uno O l altro)', { timeout: 20_000 }, async (t) => {
    const stop = new AbortController(), partiti = []
    const { esito } = await giro(t, {
        comandi: ['npm run dev'], segnaleStop: stop.signal, partiti, registraComandoFermabile: () => () => {},
        quandoParte: () => setImmediate(() => stop.abort()),
    })
    assert.equal(partiti[0].segnaleStop.aborted, true)
    assert.match(String(esito.detto), /stopped on request: while "shell" was running/u, 'col giro fermato, il punto di fermata si dice')
})

test('STOP-03 (agent-service): anche il `!` della persona riceve il suo segnale, si ferma, e si sgancia', { timeout: 20_000 }, async () => {
    const registro = new Map(), partiti = [], eventi = []
    const atteso = eseguiComandoDiretto({
        cartella: '/tmp/x', comando: 'ping -t localhost', onEvento: (e) => eventi.push(e),
        eseguiComandoSandboxatoFn: esecutoreCheAspetta(partiti),
        registraComandoFermabile: ({ toolCallId, ferma }) => { registro.set(toolCallId, ferma); return () => registro.delete(toolCallId) },
    })
    await new Promise((r) => setImmediate(r))
    const id = eventi.find((e) => e.type === 'ToolCallStart').toolCallId
    assert.ok(registro.has(id), 'registrato col toolCallId della riga dei Processi')
    registro.get(id)()
    await atteso
    const risultato = eventi.find((e) => e.type === 'ToolCallResult')
    assert.match(String(risultato.content), /^exit 130/u)
    assert.equal(partiti[0].segnaleStop.reason, MOTIVO_STOP_DELLA_RIGA, 'il motivo dice al kernel che l ha fermato la persona dalla riga')
    assert.equal(registro.size, 0)
})

test('STOP-04 (registro + HTTP veri): 200 su un comando in corso, 409 su uno finito, 404 su una sessione che non c è', async (t) => {
    const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-stop-riga-reg-'))
    const runs = []
    const registro = createSessionRegistry({
        cartellaStore, guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true, modello: 'm', chiave: 'test', registraRigaFn: registraRiga,
        preparaEsecuzioneFn: () => ({ cartella: cartellaStore, task: { id: 'task', consegna: 'Controlla' } }),
        avviaSessioneFn(input) { return new Promise((resolve) => { runs.push({ input, resolve }); input.onEvento({ type: 'RunStarted' }) }) },
    })
    t.after(async () => {
        for (const r of runs) { r.input.onEvento({ type: 'RunFinished' }); r.resolve({ ok: true, esito: { messaggiFinali: [], detto: 'Fine', comeFinita: 'concluso' } }) }
        await new Promise((r) => setTimeout(r, 50))
        await rimuoviCartellaDiProvaAttesa(cartellaStore)
    })
    const { sessionId } = registro.avvia('task')
    assert.equal(typeof runs[0].input.registraComandoFermabile, 'function', 'il registro passa la registrazione al giro')
    let fermato = 0
    const sgancia = runs[0].input.registraComandoFermabile({ toolCallId: 'c7', ferma: () => { fermato += 1 } })
    const server = createServer(createHttpApp({ staticHandler: async () => null, sessionRegistry: registro }))
    await new Promise((r) => server.listen(0, '127.0.0.1', r))
    t.after(() => new Promise((r) => server.close(r)))
    const base = `http://127.0.0.1:${server.address().port}/api/v1/sessions`
    const ok = await fetch(`${base}/${sessionId}/processes/c7/stop`, { method: 'POST' })
    assert.equal(ok.status, 200)
    assert.deepEqual((await ok.json()).data, { stopped: true })
    assert.equal(fermato, 1)
    sgancia()
    const finito = await fetch(`${base}/${sessionId}/processes/c7/stop`, { method: 'POST' })
    assert.equal(finito.status, 409)
    assert.equal((await finito.json()).error.code, 'PROCESS_NOT_RUNNING')
    assert.equal((await fetch(`${base}/nessuna/processes/c7/stop`, { method: 'POST' })).status, 404)
    assert.equal((await fetch(`${base}/${sessionId}/processes/c7/stop`, { method: 'GET' })).status, 405, 'solo POST')
})

test('STOP-05: lo sgancio toglie solo la SUA registrazione (un id riusato non viene cancellato dal comando vecchio)', () => {
    const voce = {}
    const registra = registraComandoFermabileIn(voce)
    const vecchio = () => {}, nuovo = () => {}
    const sganciaVecchio = registra({ toolCallId: 'x', ferma: vecchio })
    registra({ toolCallId: 'x', ferma: nuovo })
    sganciaVecchio()
    /* ⛔ BUG-14: la voce della mappa ora è { ferma, sfonda } — il confronto segue la forma nuova. */
    assert.equal(voce.comandiFermabili.get('x').ferma, nuovo)
    assert.equal(voce.comandiFermabili.get('x').sfonda, null, 'chi non dichiara `sfonda` non lo ottiene: il pulsante deve sparire')
})

test('STOP-06 (prova vera, Windows): anche `prova` si ferma dalla sua riga, con un processo vero, e il giro continua', { skip: process.platform === 'win32' ? false : 'ping -n è di Windows', timeout: 60_000 }, async (t) => {
    const cartella = cartellaDiProva(t)
    const registro = new Map(), corpi = []
    let n = 0
    const t0 = Date.now()
    const esito = await talosLavora({
        cartella, task: { consegna: 'prova' }, modello: 'f', chiave: 'k', giriMassimi: 3, livelloAccesso: 'accesso-pieno',
        comandoProva: 'ping -n 40 127.0.0.1',
        registraComandoFermabile: ({ toolCallId, ferma }) => {
            registro.set(toolCallId, ferma)
            setTimeout(() => registro.get(toolCallId)?.(), 1_000)
            return () => registro.delete(toolCallId)
        },
        fetchDiRete: async (_url, init) => {
            corpi.push(JSON.parse(init.body))
            const message = n++ === 0
                ? { role: 'assistant', content: null, tool_calls: [{ id: 'p1', type: 'function', function: { name: 'prova', arguments: '{}' } }] }
                : { role: 'assistant', content: 'fatto' }
            return new Response(JSON.stringify({ choices: [{ message, finish_reason: n === 1 ? 'tool_calls' : 'stop' }] }), { headers: { 'Content-Type': 'application/json' } })
        },
    })
    assert.ok(Date.now() - t0 < 20_000, `ping da 40 s fermato dopo 1 s: ${Date.now() - t0} ms`)
    const risultato = corpi[1].messages.find((m) => m.role === 'tool' && m.tool_call_id === 'p1')
    assert.match(risultato.content, /^exit 130/u)
    // owner 02/10/2026: dopo lo Stop della RIGA il modello legge chi l'ha fermata e di non rilanciarla
    assert.match(risultato.content, /⛔ The person stopped this test on purpose from the Processes tab while it ran\. Do not run it again unless they ask you to\./u)
    assert.doesNotMatch(risultato.content, /Stopped on request/u, 'la marca del giro fermato non c è: il giro non si è fermato')
    assert.equal(esito.comeFinita, 'concluso')
    assert.equal(registro.size, 0)
})

test('STOP-07 (agent-service): avviaSessione porta la registrazione fino al kernel', async () => {
    let osservato
    const registraComandoFermabile = () => () => {}
    await avviaSessione({
        cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k', onEvento: () => {}, registraComandoFermabile,
        talosLavoraFn: async (input) => { osservato = input; return { comeFinita: 'concluso', detto: 'fatto', messaggiFinali: [] } },
    })
    assert.strictEqual(osservato.registraComandoFermabile, registraComandoFermabile)
})

test('STOP-08 (registro): anche il `!` della persona lanciato dal registro riceve la registrazione', async (t) => {
    const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-stop-riga-shell-'))
    t.after(() => rimuoviCartellaDiProvaAttesa(cartellaStore))
    const runs = []
    let osservato
    const registro = createSessionRegistry({
        cartellaStore, guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true, modello: 'm', chiave: 'test', registraRigaFn: async () => {},
        preparaEsecuzioneFn: () => ({ cartella: cartellaStore, task: { id: 'task', consegna: 'Controlla' } }),
        avviaSessioneFn(input) { return new Promise((resolve) => { runs.push({ input, resolve }); input.onEvento({ type: 'RunStarted' }) }) },
        eseguiComandoDirettoFn: async (input) => { osservato = input; return { codice: 0, testo: '' } },
    })
    t.after(() => { for (const r of runs) { r.input.onEvento({ type: 'RunFinished' }); r.resolve({ ok: true, esito: { messaggiFinali: [], detto: 'Fine', comeFinita: 'concluso' } }) } })
    const { sessionId } = registro.avvia('task')
    registro.shell(sessionId, 'ping -t localhost')
    await new Promise((r) => setTimeout(r, 20))
    assert.equal(typeof osservato?.registraComandoFermabile, 'function')
    let fermato = 0
    osservato.registraComandoFermabile({ toolCallId: 'u1', ferma: () => { fermato += 1 } })
    assert.equal(registro.fermaComando(sessionId, 'u1'), 'fermato')
    assert.equal(fermato, 1)
})

test('STOP-09: dopo lo Stop di una riga, se più tardi si ferma il GIRO, il punto di fermata è quello vero (non la riga)', { timeout: 20_000 }, async (t) => {
    const cartella = cartellaDiProva(t)
    const stop = new AbortController(), registro = new Map(), partiti = []
    let n = 0
    const esito = await talosLavora({
        cartella, task: { consegna: 'prova' }, modello: 'f', chiave: 'k', giriMassimi: 4, livelloAccesso: 'accesso-pieno', segnaleStop: stop.signal,
        registraComandoFermabile: ({ toolCallId, ferma }) => { registro.set(toolCallId, ferma); setImmediate(() => ferma()); return () => registro.delete(toolCallId) },
        eseguiComandoSandboxatoFn: esecutoreCheAspetta(partiti),
        fetchDiRete: async () => {
            if (n++ === 0) {
                const message = { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'shell', arguments: JSON.stringify({ comando: 'npm run dev' }) } }] }
                return new Response(JSON.stringify({ choices: [{ message, finish_reason: 'tool_calls' }] }), { headers: { 'Content-Type': 'application/json' } })
            }
            stop.abort() // la persona ferma il giro mentre il modello risponde, DOPO lo Stop della riga
            const message = { role: 'assistant', content: null, tool_calls: [{ id: 'c2', type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: 'x.txt' }) } }] }
            return new Response(JSON.stringify({ choices: [{ message, finish_reason: 'tool_calls' }] }), { headers: { 'Content-Type': 'application/json' } })
        },
    })
    assert.match(String(esito.detto), /stopped on request/u)
    assert.doesNotMatch(String(esito.detto), /while "shell" was running/u, 'lo Stop della riga non è il punto in cui si è fermato il giro')
})

test('STOP-10 (shell vera, Windows): lo Stop della RIGA dice al modello chi l ha fermato e di non rilanciarlo; lo Stop del GIRO resta «Fermato su richiesta»', { skip: process.platform === 'win32' ? false : 'ping -n è di Windows', timeout: 60_000 }, async (t) => {
    const cartella = cartellaDiProva(t)
    const casi = [
        [MOTIVO_STOP_DELLA_RIGA, /⛔ The person stopped this command on purpose from the Processes tab while it ran\. Do not run it again unless they ask you to\./u, /Stopped on request/u],
        [undefined, /⛔ Stopped on request: the command was stopped while it ran\./u, /The person stopped this command/u],
    ]
    for (const [motivo, attesa, vietata] of casi) {
        const giro = new AbortController(), riga = new AbortController()
        const chi = motivo === undefined ? giro : riga
        setTimeout(() => chi.abort(motivo), 800)
        const esito = await eseguiComandoSandboxato('ping -n 30 127.0.0.1', cartella, { dove: 'windows', segnaleStop: AbortSignal.any([giro.signal, riga.signal]) })
        assert.equal(esito.codice, 130)
        assert.match(esito.testo, attesa)
        assert.doesNotMatch(esito.testo, vietata)
    }
})

/*
 * ⛔⛔⛔ BUG-14 (05/10/2026) — SFONDO per riga: la terza strada del comando lungo, e la DOLCE.
 *   Come lo Stop (STOP-01..04) ma il segnale è `sfonda`: niente 130, niente morte — la cattura si stacca,
 *   il file di output apre, l'attesa conclude, e il processo VIVE. L'esito del giro porta «IN BACKGROUND»
 *   (l'intestazione del kernel), e l'evento dice CHI lo ha sfondato e DOVE va l'output.
 */

test('SFONDO-01 (agent-service, `!` della persona): sfondare NON uccide — esito «IN BACKGROUND», evento con file e chi, nessun exit', { timeout: 20_000 }, async () => {
    const registro = new Map(), partiti = [], eventi = []
    const atteso = eseguiComandoDiretto({
        cartella: '/tmp/x', comando: 'npm run dev', onEvento: (e) => eventi.push(e),
        eseguiComandoSandboxatoFn: esecutoreCheAspetta(partiti),
        registraComandoFermabile: ({ toolCallId, ferma, sfonda }) => {
            registro.set(toolCallId, { ferma, sfonda })
            return () => registro.delete(toolCallId)
        },
    })
    await new Promise((r) => setImmediate(r))
    const id = eventi.find((e) => e.type === 'ToolCallStart').toolCallId
    assert.equal(typeof registro.get(id).sfonda, 'function', 'la registrazione porta il SECONDO segnale, quello che non uccide')
    registro.get(id).sfonda()
    await atteso
    const risultato = eventi.find((e) => e.type === 'ToolCallResult')
    assert.match(String(risultato.content), new RegExp(`^${INTESTAZIONE_SFONDO}`), 'l esito non è un exit: è la consegna dello sfondo')
    assert.equal(risultato.inSfondo, true)
    assert.equal(risultato.sfondoDa, 'persona')
    assert.match(String(risultato.fileSfondo ?? ''), /processi-sfondo/, 'l output su file è dichiarato, non inventato')
    assert.doesNotMatch(String(risultato.content), /^exit /u, 'un comando sfondato non ha nessun codice d uscita')
    assert.equal(registro.size, 0, 'sfondato il comando, la riga non ha più segnali da chiamare')
})

test('SFONDO-02 (registro + HTTP veri): POST /processes/:id/sfondo — 200 su un comando in corso, 409 dopo lo sgancio, 404 su sessione assente, 405 su GET', async (t) => {
    const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-sfondo-riga-reg-'))
    const runs = []
    const registro = createSessionRegistry({
        cartellaStore, guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true, modello: 'm', chiave: 'test', registraRigaFn: registraRiga,
        preparaEsecuzioneFn: () => ({ cartella: cartellaStore, task: { id: 'task', consegna: 'Controlla' } }),
        avviaSessioneFn(input) { return new Promise((resolve) => { runs.push({ input, resolve }); input.onEvento({ type: 'RunStarted' }) }) },
    })
    t.after(async () => {
        for (const r of runs) { r.input.onEvento({ type: 'RunFinished' }); r.resolve({ ok: true, esito: { messaggiFinali: [], detto: 'Fine', comeFinita: 'concluso' } }) }
        await new Promise((r) => setTimeout(r, 50))
        await rimuoviCartellaDiProvaAttesa(cartellaStore)
    })
    const { sessionId } = registro.avvia('task')
    let sfondato = 0
    const sgancia = runs[0].input.registraComandoFermabile({ toolCallId: 'c7', ferma: () => {}, sfonda: () => { sfondato += 1 } })
    const server = createServer(createHttpApp({ staticHandler: async () => null, sessionRegistry: registro }))
    await new Promise((r) => server.listen(0, '127.0.0.1', r))
    t.after(() => new Promise((r) => server.close(r)))
    const base = `http://127.0.0.1:${server.address().port}/api/v1/sessions`
    const ok = await fetch(`${base}/${sessionId}/processes/c7/sfondo`, { method: 'POST' })
    assert.equal(ok.status, 200)
    assert.deepEqual((await ok.json()).data, { backgrounded: true })
    assert.equal(sfondato, 1, 'il segnale è partito UNA volta: sfondare non è fermare')
    sgancia()
    const finito = await fetch(`${base}/${sessionId}/processes/c7/sfondo`, { method: 'POST' })
    assert.equal(finito.status, 409)
    assert.equal((await finito.json()).error.code, 'PROCESS_NOT_RUNNING')
    assert.equal((await fetch(`${base}/nessuna/processes/c7/sfondo`, { method: 'POST' })).status, 404)
    assert.equal((await fetch(`${base}/${sessionId}/processes/c7/sfondo`, { method: 'GET' })).status, 405, 'solo POST')
})

test('SFONDO-03 (ledger dai SOLI eventi): un risultato sfondato è «in-sfondo» col suo file — anche ripristinato dal solo testo — e un exit resta «concluso»', () => {
    const conCampi = processiDaEventi([
        { type: 'RunStarted' },
        { type: 'ToolCallStart', toolCallId: 'b1', toolCallName: 'shell', _sequenza: 1 },
        /* ⛔ L'evento AG-UI porta SEMPRE `toolCallId` (agui-events, `toolCallArgs`/`toolCallResult`):
           senza, il guard del ledger scarta l'evento e la riga resta «in corso» per sempre. */
        { type: 'ToolCallArgs', toolCallId: 'b1', delta: JSON.stringify({ comando: 'npm run dev' }), _sequenza: 2 },
        { type: 'ToolCallResult', toolCallId: 'b1', content: `${INTESTAZIONE_SFONDO}: persona. L'output continua su file.`, inSfondo: true, fileSfondo: '/s/.talos/processi-sfondo/b1.log', sfondoDa: 'persona', _sequenza: 3 },
    ])
    const p = conCampi.processi.find((x) => x.toolCallId === 'b1')
    assert.equal(p.esito, 'in-sfondo')
    assert.equal(p.inSfondo, true)
    assert.equal(p.fileSfondo, '/s/.talos/processi-sfondo/b1.log')
    assert.equal(p.sfondoDa, 'persona')
    assert.equal(p.codiceUscita, null, 'non è uscito: nessun codice inventato')

    const daTesto = processiDaEventi([
        { type: 'RunStarted' },
        { type: 'ToolCallStart', toolCallId: 'b2', toolCallName: 'shell', _sequenza: 1 },
        { type: 'ToolCallArgs', toolCallId: 'b2', delta: JSON.stringify({ comando: 'vitest' }), _sequenza: 2 },
        { type: 'ToolCallResult', toolCallId: 'b2', content: `${INTESTAZIONE_SFONDO}: tempo-scaduto. L'output continua su file.`, _sequenza: 3 },
    ])
    const q = daTesto.processi.find((x) => x.toolCallId === 'b2')
    assert.equal(q.esito, 'in-sfondo', 'l intestazione in testa al testo resta la riserva per le sessioni ripristinate dal disco')
    assert.equal(q.sfondoDa, null, 'senza il campo, chi lo ha sfondato NON si inventa')

    const normale = processiDaEventi([
        { type: 'RunStarted' },
        { type: 'ToolCallStart', toolCallId: 'b3', toolCallName: 'shell', _sequenza: 1 },
        { type: 'ToolCallArgs', toolCallId: 'b3', delta: JSON.stringify({ comando: 'ls' }), _sequenza: 2 },
        { type: 'ToolCallResult', toolCallId: 'b3', content: 'exit 0 [sandbox: none]\nok', _sequenza: 3 },
    ])
    const r = normale.processi.find((x) => x.toolCallId === 'b3')
    assert.equal(r.esito, 'concluso', 'un exit resta un exit: il mutante che marca tutto «in-sfondo» cade qui')
    assert.equal(r.inSfondo, false)
})
