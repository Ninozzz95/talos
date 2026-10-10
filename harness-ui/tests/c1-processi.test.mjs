/*
 * C1 (owner 10/10/2026) — la scheda «Processi»: CPU e memoria dei comandi vivi («misurate da noi, solo a scheda aperta») e «Togli»
 *   una riga finita («Sì, resta tolta»). Catena: kernel (`onAvvio` → il PID) → registro (`pidDeiComandi`, `togliProcesso`) → HTTP
 *   (`GET /processes/resources`, `POST /processes/:id/remove`). Il campionatore vero è in c1-risorse-processi.test.mjs.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { spawnSync } from 'node:child_process'
import { eseguiComandoSandboxato, registroDellAvvio, talosLavora } from '../src/kernel/talosHarness.mjs'
import { eseguiComandoDiretto } from '../src/agent-service.mjs'
import { createSessionRegistry } from '../src/session-registry.mjs'
import { createHttpApp } from '../src/http-app.mjs'
import { registraRiga } from '../src/session-store.mjs'
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs'

test('PROC-C1-01 (kernel, shell vera): l esecutore dice il PID della shell appena la lancia; un annuncio che lancia non tocca il comando', { skip: process.platform === 'win32' ? false : 'il ramo di Windows', timeout: 30_000 }, async () => {
    /* il ramo di Windows, esplicito: in WSL il PID sarebbe quello di wsl.exe, che non misura il comando vero (si annuncia solo qui) */
    const pid = []
    const esito = await eseguiComandoSandboxato('node -e "setTimeout(()=>{},200)"', process.cwd(), { dove: 'windows', onAvvio: (n) => pid.push(n) })
    assert.equal(esito.codice, 0)
    assert.equal(pid.length, 1)
    assert.ok(Number.isSafeInteger(pid[0]) && pid[0] > 0, `a real PID (${pid[0]})`)
    const rotto = await eseguiComandoSandboxato('node -e "process.exit(0)"', process.cwd(), { dove: 'windows', onAvvio: () => { throw new Error('boom') } })
    assert.equal(rotto.codice, 0, 'the command runs anyway')
})

test('PROC-C1-02 (agent-service): anche il `!` della persona passa il PID alla sua registrazione', { timeout: 20_000 }, async () => {
    let lettura = null
    await eseguiComandoDiretto({
        cartella: process.cwd(), comando: 'echo ciao', onEvento: () => {},
        eseguiComandoSandboxatoFn: async (_c, _d, opzioni) => { opzioni.onAvvio?.(4242); assert.equal(lettura(), 4242, 'readable while running'); return { codice: 0, testo: 'ciao', enforcement: 'none' } },
        registraComandoFermabile: ({ pid }) => { lettura = pid; return () => {} },
    })
    assert.equal(typeof lettura, 'function')
})

/* WSL vero solo se c'è una distro che risponde (la macchina dell'owner: Ubuntu). */
const conWsl = process.platform === 'win32' && spawnSync('wsl.exe', ['--exec', 'true'], { windowsHide: true, timeout: 20_000 }).status === 0

test('PROC-C1-05 (kernel, WSL vero): l esecutore annuncia distro e marcatore, e il comando lo eredita; senza `onAvvio` lo script è quello di prima', { skip: conWsl ? false : 'no WSL', timeout: 60_000 }, async () => {
    const annunci = []
    const esito = await eseguiComandoSandboxato(`sh -c 'echo "dentro=$TALOS_CMD_ID"'`,process.cwd(), { dove: 'wsl2', onAvvio: (a) => annunci.push(a) })
    assert.equal(esito.enforcement, 'wsl2')
    assert.equal(annunci.length, 1)
    const { distro, marcatore } = annunci[0].wsl
    assert.ok(distro && /^t[0-9a-f]{32}$/.test(marcatore), JSON.stringify(annunci[0]))
    assert.match(esito.testo, new RegExp(`dentro=${marcatore}`), 'a grandchild inherits the marker')
    const senza = await eseguiComandoSandboxato('echo "dentro=${TALOS_CMD_ID:-niente}"', process.cwd(), { dove: 'wsl2' })
    assert.match(senza.testo, /dentro=niente/)
})

test('PROC-C1-06 (registroDellAvvio): un PID o una coppia distro/marcatore; ciò che è malformato si ignora', () => {
    const a = registroDellAvvio()
    assert.equal(a.pid(), null); assert.equal(a.wsl(), null)
    a.annuncia(-3); a.annuncia('12'); a.annuncia({ wsl: { distro: 'Ubuntu', marcatore: "t'; rm" } }); a.annuncia({ wsl: {} })
    assert.equal(a.pid(), null); assert.equal(a.wsl(), null)
    a.annuncia(77); a.annuncia({ wsl: { distro: 'Ubuntu', marcatore: 'tabc' } })
    assert.equal(a.pid(), 77); assert.deepEqual(a.wsl(), { distro: 'Ubuntu', marcatore: 'tabc' })
})

test('PROC-C1-07 (kernel, `prova` vera su Windows): anche la prova del progetto passa il PID alla sua riga mentre gira', { skip: process.platform === 'win32' ? false : 'ping -n è di Windows', timeout: 60_000 }, async (t) => {
    const cartella = mkdtempSync(join(tmpdir(), 'talos-c1-prova-'))
    t.after(() => rimuoviCartellaDiProvaAttesa(cartella))
    const letti = []
    let n = 0
    await talosLavora({
        cartella, task: { consegna: 'prova' }, modello: 'f', chiave: 'k', giriMassimi: 3, livelloAccesso: 'accesso-pieno',
        comandoProva: 'ping -n 3 127.0.0.1',
        /* come il server vero: l'output passa dalla cattura, che dà `onBytes` (il ramo dell'esecutore che perdeva `onAvvio`) */
        captureProcessFn: (_contesto, esegui) => esegui({ onBytes: () => {} }),
        registraComandoFermabile: ({ pid }) => { const timer = setTimeout(() => letti.push(pid()), 1_000); return () => clearTimeout(timer) },
        fetchDiRete: async () => {
            const message = n++ === 0
                ? { role: 'assistant', content: null, tool_calls: [{ id: 'p1', type: 'function', function: { name: 'prova', arguments: '{}' } }] }
                : { role: 'assistant', content: 'fatto' }
            return new Response(JSON.stringify({ choices: [{ message, finish_reason: n === 1 ? 'tool_calls' : 'stop' }] }), { headers: { 'Content-Type': 'application/json' } })
        },
    })
    assert.equal(letti.length, 1, 'read while the test ran')
    assert.ok(Number.isSafeInteger(letti[0]) && letti[0] > 0, `a real PID (${letti[0]})`)
})

async function banco(t, { campionatore = null } = {}) {
    const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-c1-processi-'))
    const runs = []
    const nuovoRegistro = () => createSessionRegistry({
        cartellaStore, guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true, modello: 'm', chiave: 'test', registraRigaFn: registraRiga,
        preparaEsecuzioneFn: () => ({ cartella: cartellaStore, task: { id: 'task', consegna: 'Controlla' } }),
        avviaSessioneFn(input) { return new Promise((resolve) => { runs.push({ input, resolve }); input.onEvento({ type: 'RunStarted' }) }) },
    })
    const registro = nuovoRegistro()
    const server = createServer(createHttpApp({ staticHandler: async () => null, sessionRegistry: registro, campionatoreRisorse: campionatore }))
    await new Promise((r) => server.listen(0, '127.0.0.1', r))
    t.after(async () => {
        await new Promise((r) => server.close(r))
        for (const r of runs) { r.input.onEvento({ type: 'RunFinished' }); r.resolve({ ok: true, esito: { messaggiFinali: [], detto: 'Fine', comeFinita: 'concluso' } }) }
        await new Promise((r) => setTimeout(r, 50))
        await rimuoviCartellaDiProvaAttesa(cartellaStore)
    })
    const { sessionId } = registro.avvia('task')
    return { registro, nuovoRegistro, runs, sessionId, base: `http://127.0.0.1:${server.address().port}/api/v1/sessions` }
}

test('PROC-C1-03 (registro + HTTP veri): le risorse dei comandi vivi, per toolCallId; senza PID niente numeri; 404 e 405', async (t) => {
    const chieste = []
    const campionatore = { misura: async (r) => { chieste.push(r); return { metodo: 'cim',
        perPid: new Map([[4242, { cpuPercento: 12.5, memoriaByte: 150_000_000, processi: 3 }]]),
        perMarcatore: new Map([['Ubuntu:tabc', { cpuPercento: 3, memoriaByte: 9_000_000, processi: 4 }]]) } } }
    const { runs, sessionId, base } = await banco(t, { campionatore })
    let pid = null
    const sgancia = runs[0].input.registraComandoFermabile({ toolCallId: 'c7', ferma: () => {}, pid: () => pid })
    runs[0].input.registraComandoFermabile({ toolCallId: 'c8', ferma: () => {} }) // un esecutore che non dice niente (la CLI)
    runs[0].input.registraComandoFermabile({ toolCallId: 'c10', ferma: () => {}, wsl: () => ({ distro: 'Ubuntu', marcatore: 'tabc' }) })
    pid = 4242
    const r = await fetch(`${base}/${sessionId}/processes/resources`)
    assert.equal(r.status, 200)
    const dati = (await r.json()).data
    assert.equal(dati.metodo, 'cim')
    assert.deepEqual(dati.processi, [
        { toolCallId: 'c7', cpuPercento: 12.5, memoriaByte: 150_000_000, processi: 3 },
        { toolCallId: 'c8', cpuPercento: null, memoriaByte: null, processi: null },
        { toolCallId: 'c10', cpuPercento: 3, memoriaByte: 9_000_000, processi: 4 },
    ])
    assert.deepEqual(chieste, [{ pid: [4242], wsl: [{ distro: 'Ubuntu', marcatore: 'tabc' }] }], 'only what is known is sampled')
    sgancia()
    const dopo = (await (await fetch(`${base}/${sessionId}/processes/resources`)).json()).data
    assert.deepEqual(dopo.processi.map((p) => p.toolCallId), ['c8', 'c10'], 'a finished command is no longer measured')
    assert.equal((await fetch(`${base}/nessuna/processes/resources`)).status, 404)
    assert.equal((await fetch(`${base}/${sessionId}/processes/resources`, { method: 'POST' })).status, 405)
})

test('PROC-C1-04 (registro + HTTP veri): «Togli» — 409 se vivo, 200 e un evento DUREVOLE se finito, una volta sola; resta tolta dopo un riavvio', async (t) => {
    const { registro, nuovoRegistro, runs, sessionId, base } = await banco(t)
    const giro = runs[0].input
    giro.onEvento({ type: 'ToolCallStart', toolCallId: 'c9', toolCallName: 'shell' })
    const sgancia = giro.registraComandoFermabile({ toolCallId: 'c9', ferma: () => {} })
    const vivo = await fetch(`${base}/${sessionId}/processes/c9/remove`, { method: 'POST' })
    assert.equal(vivo.status, 409)
    assert.equal((await vivo.json()).error.code, 'PROCESS_STILL_RUNNING')
    sgancia()
    // senza risultato e a giro vivo (un comando che aspetta il consenso): non è finito
    assert.equal((await fetch(`${base}/${sessionId}/processes/c9/remove`, { method: 'POST' })).status, 409)
    giro.onEvento({ type: 'ToolCallResult', toolCallId: 'c9', content: 'exit 0' })
    const tolto = await fetch(`${base}/${sessionId}/processes/c9/remove`, { method: 'POST' })
    assert.equal(tolto.status, 200)
    assert.deepEqual((await tolto.json()).data, { removed: true })
    assert.equal((await fetch(`${base}/${sessionId}/processes/c9/remove`, { method: 'POST' })).status, 200, 'again: still removed')
    const tolti = (r) => r.esporta(sessionId).eventi.filter((e) => e.type === 'CUSTOM' && e.name === 'talos.processo-tolto')
    assert.deepEqual(tolti(registro).map((e) => e.value.toolCallId), ['c9'], 'one event, not two')
    // ⛔ review Y1 (10/10): uno SFONDATO vivo ha già il suo risultato e resta registrato finché vive (A6-bis R2) — la
    //   registrazione è l'unica cosa che lo tiene: 409 finché gira, tolto solo dopo la sua uscita vera
    giro.onEvento({ type: 'ToolCallStart', toolCallId: 's1', toolCallName: 'shell' })
    const sganciaSfondo = giro.registraComandoFermabile({ toolCallId: 's1', ferma: () => {} })
    giro.onEvento({ type: 'ToolCallResult', toolCallId: 's1', content: 'IN BACKGROUND: npm run dev', inSfondo: true })
    const sfondoVivo = await fetch(`${base}/${sessionId}/processes/s1/remove`, { method: 'POST' })
    assert.equal(sfondoVivo.status, 409)
    assert.equal((await sfondoVivo.json()).error.code, 'PROCESS_STILL_RUNNING')
    sganciaSfondo()
    assert.equal((await fetch(`${base}/${sessionId}/processes/s1/remove`, { method: 'POST' })).status, 200, 'after its real exit it can go')
    assert.equal((await fetch(`${base}/${sessionId}/processes/sconosciuto/remove`, { method: 'POST' })).status, 404)
    assert.equal((await fetch(`${base}/nessuna/processes/c9/remove`, { method: 'POST' })).status, 404)
    // resta tolta: un registro nuovo sullo stesso archivio rilegge l'evento dal giornale
    await new Promise((r) => setTimeout(r, 100))
    const dopo = nuovoRegistro()
    await dopo.ripristina()
    t.after(() => dopo.chiudi({ attesaMassimaMs: 1_000 }))
    assert.deepEqual(tolti(dopo).map((e) => e.value.toolCallId), ['c9', 's1'])
})
