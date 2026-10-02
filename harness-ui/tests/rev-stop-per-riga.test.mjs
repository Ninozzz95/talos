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
import { talosLavora, eseguiComandoSandboxato, MOTIVO_STOP_DELLA_RIGA } from '../src/kernel/talosHarness.mjs'
import { eseguiComandoDiretto, avviaSessione } from '../src/agent-service.mjs'
import { createSessionRegistry, registraComandoFermabileIn } from '../src/session-registry.mjs'
import { createHttpApp } from '../src/http-app.mjs'
import { registraRiga } from '../src/session-store.mjs'
import { rimuoviCartellaDiProva, rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs'

const FERMATO = '⛔ Fermato su richiesta: il comando e stato interrotto mentre girava.'
/* Un esecutore finto che gira finché il SUO segnale non si ferma: niente processi veri sotto i giri del modello. */
function esecutoreCheAspetta(partiti) {
    return (comando, _cartella, { segnaleStop }) => new Promise((risolvi) => {
        partiti.push({ comando, segnaleStop })
        segnaleStop.addEventListener('abort', () => risolvi({ codice: 130, fermatoSuRichiesta: true, testo: FERMATO, enforcement: 'none' }), { once: true })
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
    assert.match(risultato.content, /Fermato su richiesta/u)
    assert.equal(corpi.length, 2, 'il modello ha avuto il turno dopo lo Stop della riga')
    assert.equal(esito.comeFinita, 'concluso', 'il giro non è stato fermato')
    assert.doesNotMatch(String(esito.detto), /interrotto su richiesta/u)
    assert.equal(registro.size, 0, 'finito il comando, la riga non si può più fermare')
})

test('STOP-02: lo Stop del GIRO ferma ancora anche il comando (il segnale è l uno O l altro)', { timeout: 20_000 }, async (t) => {
    const stop = new AbortController(), partiti = []
    const { esito } = await giro(t, {
        comandi: ['npm run dev'], segnaleStop: stop.signal, partiti, registraComandoFermabile: () => () => {},
        quandoParte: () => setImmediate(() => stop.abort()),
    })
    assert.equal(partiti[0].segnaleStop.aborted, true)
    assert.match(String(esito.detto), /interrotto su richiesta: mentre "shell" era in corso/u, 'col giro fermato, il punto di fermata si dice')
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
    assert.equal(voce.comandiFermabili.get('x'), nuovo)
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
    assert.match(risultato.content, /⛔ L'ha fermata la persona dalla scheda Processi, apposta, mentre girava\. Non rilanciarla se non te lo chiede\./u)
    assert.doesNotMatch(risultato.content, /Fermato su richiesta/u, 'la marca del giro fermato non c è: il giro non si è fermato')
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
    assert.match(String(esito.detto), /interrotto su richiesta/u)
    assert.doesNotMatch(String(esito.detto), /mentre "shell" era in corso/u, 'lo Stop della riga non è il punto in cui si è fermato il giro')
})

test('STOP-10 (shell vera, Windows): lo Stop della RIGA dice al modello chi l ha fermato e di non rilanciarlo; lo Stop del GIRO resta «Fermato su richiesta»', { skip: process.platform === 'win32' ? false : 'ping -n è di Windows', timeout: 60_000 }, async (t) => {
    const cartella = cartellaDiProva(t)
    const casi = [
        [MOTIVO_STOP_DELLA_RIGA, /⛔ L'ha fermato la persona dalla scheda Processi, apposta, mentre girava\. Non rilanciarlo se non te lo chiede\./u, /Fermato su richiesta/u],
        [undefined, /⛔ Fermato su richiesta: il comando e stato interrotto mentre girava\./u, /L'ha fermato la persona/u],
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
