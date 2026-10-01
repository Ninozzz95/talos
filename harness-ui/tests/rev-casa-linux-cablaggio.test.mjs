/*
 * ⛔⛔ Fase B «casa di esecuzione» (owner 01/10/2026) — il cablaggio: la casa Linux è DELLA SESSIONE (la stessa per i suoi giri,
 *   un'altra per un'altra sessione), arriva al kernel da agent-service, si chiude con l'eliminazione della sessione e con lo
 *   spegnimento del server, e lo Stop del giro ferma anche le ricerche vive di là. «Automatico» vale Linux anche per i comandi `!`
 *   («anche Automatico», owner 01/10/2026), senza sondare comando per comando.
 *   Stessa forma di `rev-ricerca-che-continua-cablaggio.test.mjs`.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { talosLavora, destinazioneDelComando } from '../src/kernel/talosHarness.mjs'
import { avviaSessione, eseguiComandoDiretto } from '../src/agent-service.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

const BINARI = { node: 'C:\\talos\\casa-linux\\node', rg: 'C:\\talos\\casa-linux\\rg' }
const wsl = process.platform === 'win32' ? spawnSync('wsl.exe', ['--exec', 'sh', '-c', 'echo ok'], { encoding: 'utf8', timeout: 15_000, windowsHide: true }) : null
const conWsl = { skip: wsl?.status === 0 ? false : 'WSL non disponibile' }

function registroDiProva(t, { cartellaStore = null, casaLinux = BINARI, eseguiComandoDirettoFn } = {}) {
    return import('../src/session-registry.mjs').then(({ createSessionRegistry }) => {
        const runs = []
        const avviaSessioneFn = (input) => {
            let risolvi
            const promessa = new Promise((r) => { risolvi = r })
            const i = runs.length
            runs.push({ input, risolvi })
            input.onEvento({ type: 'RunStarted', threadId: `t${i}`, runId: `r${i}` })
            return promessa
        }
        const fine = (i) => { runs[i].input.onEvento({ type: 'RunFinished', threadId: `t${i}`, runId: `r${i}` }); runs[i].risolvi({ ok: true, esito: { detto: 'ok', comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'lavora' }, { role: 'assistant', content: 'ok' }] } }) }
        const registro = createSessionRegistry({ avviaSessioneFn, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true, casaLinux,
            ...(cartellaStore ? { cartellaStore } : {}), ...(eseguiComandoDirettoFn ? { eseguiComandoDirettoFn } : {}),
            preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'lavora' } }) })
        t.after(() => registro.chiudi?.())
        return { registro, runs, fine }
    })
}

test('CLC-01: la casa Linux è della SESSIONE — la stessa al giro ripreso, un altra per un altra sessione; senza binari non c è', async (t) => {
    const { registro, runs, fine } = await registroDiProva(t)
    const { sessionId } = registro.avvia('task')
    fine(0)
    await registro.attendiAssestamento(sessionId)
    assert.equal(registro.resume(sessionId, 'continua').sessionId, sessionId)
    assert.equal(typeof runs[0].input.casaLinuxSessione?.prendi, 'function')
    const presa = runs[0].input.casaLinuxSessione.prendi({ distro: 'Ubuntu' }) // nessun processo finché non si chiama
    assert.equal(presa.accesa, false, 'il registro dichiara l ambiente (SPAWN-AMBIENTE-01): la casa si crea senza lanciare')
    assert.equal(runs[1].input.casaLinuxSessione, runs[0].input.casaLinuxSessione)
    fine(1)
    await registro.attendiAssestamento(sessionId)
    const altra = registro.avvia('task')
    assert.notEqual(runs[2].input.casaLinuxSessione, runs[0].input.casaLinuxSessione)
    fine(2)
    await registro.attendiAssestamento(altra.sessionId)

    const senza = await registroDiProva(t, { casaLinux: null })
    const s = senza.registro.avvia('task')
    assert.equal(senza.runs[0].input.casaLinuxSessione, null, 'binari assenti: come prima, due case')
    senza.fine(0)
    await senza.registro.attendiAssestamento(s.sessionId)
})

test('CLC-02: agent-service porta la casa al kernel com è', async () => {
    let visto
    const casaLinuxSessione = { prendi() {}, chiudi() {} }
    await avviaSessione({ cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k', onEvento: () => {}, casaLinuxSessione,
        talosLavoraFn: async (input) => { visto = input; return { comeFinita: 'concluso', detto: 'fatto' } } })
    assert.equal(visto.casaLinuxSessione, casaLinuxSessione)
})

test('CLC-03: eliminare la sessione e spegnere il registro chiudono la casa Linux (nessun Node per Linux orfano)', async (t) => {
    const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-clc03-'))
    t.after(() => rimuoviCartellaDiProva(cartellaStore))
    const { registro, runs, fine } = await registroDiProva(t, { cartellaStore })
    const { sessionId } = registro.avvia('task')
    const chiusure = []
    runs[0].input.casaLinuxSessione.chiudi = () => chiusure.push('eliminazione')
    fine(0)
    await registro.attendiAssestamento(sessionId)
    await registro.elimina(sessionId)
    assert.deepEqual(chiusure, ['eliminazione'])
    const altra = registro.avvia('task')
    runs[1].input.casaLinuxSessione.chiudi = () => chiusure.push('spegnimento')
    fine(1)
    await registro.attendiAssestamento(altra.sessionId)
    await registro.chiudi()
    assert.deepEqual(chiusure, ['eliminazione', 'spegnimento'])
})

test('CLC-04 (WSL vero, casa finta): lo Stop del giro annulla la richiesta in corso E ferma le ricerche vive della casa Linux', conWsl, async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'talos-clc04-'))
    t.after(() => rimuoviCartellaDiProva(dir))
    const operazioni = []
    const stop = new AbortController()
    const casa = {
        chiama(op, _args, { segnale } = {}) {
            operazioni.push(op)
            if (op !== 'cerca') return Promise.resolve(true)
            return new Promise((_r, rifiuta) => {
                segnale?.addEventListener('abort', () => rifiuta(Object.assign(new Error('fermato su richiesta'), { name: 'AbortError', code: 'ABORT_ERR' })), { once: true })
                stop.abort()
            })
        },
    }
    const prese = []
    let n = 0
    await talosLavora({ cartella: dir, task: { consegna: 'cerca' }, modello: 'f', chiave: 'k', segnaleStop: stop.signal, livelloAccesso: 'accesso-pieno',
        ambienteComandiFn: async () => ({ dove: null, revisione: 0 }),
        casaLinuxSessione: { prendi: (chi) => { prese.push(chi); return casa } },
        fetchDiRete: async () => {
            const message = n++ === 0
                ? { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'cerca', arguments: JSON.stringify({ testo: 'ago' }) } }] }
                : { role: 'assistant', content: 'fatto' }
            return new Response(JSON.stringify({ choices: [{ message, finish_reason: message.tool_calls ? 'tool_calls' : 'stop' }] }), { headers: { 'Content-Type': 'application/json' } })
        } })
    assert.equal(prese.length >= 1, true, '«Automatico» con WSL presente: il giro prende la casa Linux')
    assert.ok(operazioni.includes('cerca'), 'la ricerca è andata di là')
    assert.ok(operazioni.includes('fermaRicerche'), 'lo Stop ferma anche le ricerche vive della casa Linux')
})

test('CLC-05: i comandi `!` — con la casa Linux il registro chiede «Automatico in Linux», senza no; agent-service lo porta al kernel', async (t) => {
    for (const [casaLinux, atteso] of [[BINARI, true], [null, false]]) {
        const visti = []
        const eseguiComandoDirettoFn = async (opzioni) => { visti.push(opzioni); return { codice: 0 } }
        const { registro, runs, fine } = await registroDiProva(t, { casaLinux, eseguiComandoDirettoFn })
        const { sessionId } = registro.avvia('task')
        fine(0)
        await registro.attendiAssestamento(sessionId)
        registro.shell(sessionId, 'ls')
        await new Promise((r) => setImmediate(r))
        assert.equal(visti.length, 1)
        assert.equal(visti[0].automaticoInLinux, atteso, `casa Linux ${casaLinux ? 'presente' : 'assente'}`)
        assert.ok(runs.length >= 1)
    }
    for (const [valore, atteso] of [[true, true], [false, undefined]]) {
        let opzioni = null
        await eseguiComandoDiretto({ cartella: '/tmp/x', comando: 'ls', onEvento: () => {}, automaticoInLinux: valore,
            eseguiComandoSandboxatoFn: async (_c, _d, o) => { opzioni = o; return { codice: 0, testo: '', enforcement: 'none' } } })
        assert.equal(opzioni.automaticoInLinux, atteso)
    }
})

test('CLC-06 (WSL vero): «Automatico in Linux» manda in Linux anche un programma che Linux non ha — niente sonda; senza, la sonda decide Windows', conWsl, async () => {
    const programma = 'talos-programma-che-non-esiste-in-linux-clc06'
    assert.equal((await destinazioneDelComando(programma, { automaticoInLinux: true })).ambiente, 'wsl2')
    assert.equal((await destinazioneDelComando(programma)).ambiente, 'windows')
    assert.equal((await destinazioneDelComando(programma, { dove: 'windows', automaticoInLinux: true })).ambiente, 'windows', 'la scelta «Windows» resta Windows')
})
