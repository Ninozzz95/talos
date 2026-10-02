/*
 * ⛔⛔ F007-B (owner 02/10/2026, «come Hermes: resta vivo, e si dice») — un comando finisce quando esce LUI, non quando si
 *   chiudono i tubi tenuti da un processo che ha lanciato in background. Hermes: `tools/environments/base.py:491` (decide
 *   sull'uscita) e `:531-536` (drena al massimo 2 s). Processi VERI: `start "" /b` di cmd, su Windows.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as attendi } from 'node:timers/promises'
import { eseguiComandoSandboxato, eseguiComando, talosLavora } from '../src/kernel/talosHarness.mjs'
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs'

const soloWindows = { skip: process.platform === 'win32' ? false : 'cmd e `start /b` esistono solo su Windows', timeout: 40_000 }
const NOTA = /⛔ Un processo avviato da questo comando gira ancora in background e tiene aperta l'uscita: ciò che stampa da ora non viene raccolto\.$/u
const vivo = (pid) => { try { process.kill(pid, 0); return true } catch { return false } }

/*
 * ⛔⛔ LA PULIZIA NON UCCIDE MAI PER PID. Un PID letto da file può essere di un processo GIÀ USCITO da solo (F007B-02 e 02b
 *   finiscono per conto loro) e Windows lo riusa in fretta sotto il carico della suite: `process.kill` colpirebbe un processo
 *   ESTRANEO della macchina. E un `pid.txt` letto a metà scrittura dà `Number('') = 0`, che libuv su Windows tratta come IL
 *   PROCESSO CORRENTE. ⇒ Il processo in background si ferma DA SOLO quando compare `stop.txt` nella sua cartella, e uscendo
 *   lascia `uscito-<pid>.txt`: la pulizia crea il primo e aspetta il secondo.
 */
const AVVIO = "const _f=require('fs');_f.writeFileSync('pid.txt',String(process.pid));process.on('exit',()=>_f.writeFileSync('uscito-'+process.pid+'.txt',''));"
const RESTA = "setInterval(()=>{if(_f.existsSync('stop.txt'))process.exit(0)},100);setTimeout(()=>process.exit(0),20000)"
const pidValido = (testo) => { const n = Number(testo); return Number.isInteger(n) && n > 0 ? n : null }

/* Un processo in background che scrive il suo PID su file e poi fa `programma` (testo JS). */
function preparazione(t) {
    const cartella = mkdtempSync(join(tmpdir(), 'talos-f007b-'))
    const pid = join(cartella, 'pid.txt')
    const pids = new Set()
    t.after(async () => {
        writeFileSync(join(cartella, 'stop.txt'), '')
        const scritto = existsSync(pid) ? pidValido(readFileSync(pid, 'utf8')) : null
        if (scritto) pids.add(scritto)
        const vivi = () => [...pids].filter((p) => !existsSync(join(cartella, `uscito-${p}.txt`)))
        for (let i = 0; i < 80 && vivi().length; i++) await attendi(100)
        assert.deepEqual(vivi(), [], 'i processi in background si fermano da soli con stop.txt')
        /* ⛔ Misurato nella corsa intera del 02/10: `uscito-<pid>.txt` si scrive nell'handler di `exit`, un attimo PRIMA che il
           processo lasci la cartella (il suo cwd) — `rmSync` ha dato EPERM, e su Windows la via sincrona non ritenta l'EPERM
           (`aiuto/rimuovi-cartella-di-prova.mjs`, punto 3). Si aspetta anche che il processo sparisca (segnale 0: guarda,
           non tocca), poi la rimozione ASINCRONA, che ritenta. */
        for (let i = 0; i < 50 && [...pids].some(vivo); i++) await attendi(100)
        await rimuoviCartellaDiProvaAttesa(cartella)
    })
    const sfondo = (programma) => `start "" /b "${process.execPath}" -e "${AVVIO}${programma}"`
    const leggiPid = async () => {
        for (let i = 0; i < 100; i++) {
            const n = existsSync(pid) ? pidValido(readFileSync(pid, 'utf8')) : null
            if (n) { pids.add(n); return n }
            await attendi(50)
        }
        throw new Error('il processo in background non ha scritto il suo PID')
    }
    return { cartella, sfondo, leggiPid }
}

test('F007B-01: il comando che lascia un processo in background si conclude dopo l uscita + 2 s, lo DICE, e il processo resta vivo', soloWindows, async (t) => {
    const { cartella, sfondo, leggiPid } = preparazione(t)
    const t0 = Date.now()
    const esito = await eseguiComandoSandboxato(`echo partito & ${sfondo(RESTA)} & echo ancora`, cartella, { dove: 'windows' })
    const durata = Date.now() - t0
    assert.ok(durata < 8_000, `prima non arrivava NESSUN esito: ora in ${durata} ms`)
    assert.ok(durata >= 1_900, `si drena per 2 s prima di concludere: ${durata} ms`)
    assert.equal(esito.codice, 0)
    assert.equal(esito.processoInBackground, true)
    assert.match(esito.testo, /^partito\s+ancora/u)
    assert.match(esito.testo, NOTA)
    assert.ok(vivo(await leggiPid()), 'come Hermes: il processo in background resta vivo')
})

test('F007B-02: il processo in background che SCRIVE ancora non muore (tubi letti a vuoto), e ciò che scrive entro 2 s si raccoglie', soloWindows, async (t) => {
    const { cartella, sfondo, leggiPid } = preparazione(t)
    // stampa «presto» subito, poi una riga ogni 100 ms per 4 s, poi lascia un file: se i tubi si chiudessero, la scrittura
    // fallirebbe (EPIPE) e il file non arriverebbe mai
    const programma = "console.log('presto');let n=0;const i=setInterval(()=>{console.log('riga'+(n++));if(n>40){clearInterval(i);require('fs').writeFileSync('finito.txt','si')}},100)"
    const esito = await eseguiComandoSandboxato(`${sfondo(programma)}`, cartella, { dove: 'windows' })
    assert.equal(esito.processoInBackground, true)
    assert.match(esito.testo, /presto/u, 'ciò che arriva nei 2 s di drenaggio si raccoglie')
    assert.doesNotMatch(esito.testo, /riga40/u, 'ciò che arriva dopo, no')
    const pid = await leggiPid()
    for (let i = 0; i < 80 && !existsSync(join(cartella, 'finito.txt')); i++) await attendi(100)
    assert.ok(existsSync(join(cartella, 'finito.txt')), `il processo in background è arrivato in fondo scrivendo (pid ${pid})`)
})

test('F007B-02b: con la cattura dei byte, il processo in background che scrive ancora non muore (tubi letti a vuoto)', soloWindows, async (t) => {
    const { cartella, sfondo, leggiPid } = preparazione(t)
    const programma = "console.log('presto');let n=0;const i=setInterval(()=>{console.log('riga'+(n++));if(n>40){clearInterval(i);require('fs').writeFileSync('finito.txt','si')}},100)"
    const esito = await eseguiComandoSandboxato(`${sfondo(programma)}`, cartella, { dove: 'windows', onBytes: async () => {} })
    assert.equal(esito.processoInBackground, true)
    await leggiPid()
    for (let i = 0; i < 80 && !existsSync(join(cartella, 'finito.txt')); i++) await attendi(100)
    assert.ok(existsSync(join(cartella, 'finito.txt')), 'il processo in background è arrivato in fondo scrivendo')
})

test('F007B-07: un comando normale non lascia un timer del drenaggio vivo (il processo che lo ospita può uscire)', soloWindows, async (t) => {
    const { cartella } = preparazione(t)
    const timer = () => process.getActiveResourcesInfo().filter((r) => r === 'Timeout').length
    const prima = timer()
    await eseguiComandoSandboxato('echo ciao', cartella, { dove: 'windows' })
    assert.equal(timer(), prima, 'all uscita + chiusura dei tubi l attesa di 2 s si annulla')
})

test('F007B-03: anche con la cattura dei byte (il registro dell uscita) il comando si conclude, e la cattura resta «delivered»', soloWindows, async (t) => {
    const { cartella, sfondo, leggiPid } = preparazione(t)
    const pezzi = []
    const esito = await eseguiComandoSandboxato(`echo prima & ${sfondo(RESTA)}`, cartella, {
        dove: 'windows', onBytes: async ({ bytes }) => { pezzi.push(Buffer.from(bytes)) },
    })
    assert.equal(esito.processoInBackground, true)
    assert.equal(esito.outputCapture.state, 'delivered', 'staccare la cattura non è un guasto della cattura')
    assert.match(Buffer.concat(pezzi).toString('utf8'), /prima/u)
    assert.match(esito.testo, NOTA)
    assert.ok(vivo(await leggiPid()))
})

test('F007B-04: eseguiComando (la strada di wsl.exe e adb) fa lo stesso; e al contrario un comando normale non cambia', soloWindows, async (t) => {
    const { cartella, leggiPid } = preparazione(t)
    // il cuore del difetto senza cmd: un processo che lancia un figlio coi tubi EREDITATI ed esce subito. ⛔ `detached`: su
    // Windows libuv mette i figli in un job object che li uccide all'uscita del genitore (misurato: senza, il figlio non parte
    // nemmeno a scrivere il suo PID) — un vero server in background si stacca così.
    const genitore = `const f=require('child_process').spawn(process.execPath,['-e',${JSON.stringify(AVVIO + RESTA)}],{stdio:'inherit',detached:true,windowsHide:true});f.unref();console.log('genitore uscito')`
    const t0 = Date.now()
    const conSfondo = await eseguiComando(process.execPath, ['-e', genitore], { cwd: cartella, timeoutMs: 30_000 })
    assert.ok(Date.now() - t0 < 8_000, `prima aspettava il figlio (20 s): ora ${Date.now() - t0} ms`)
    assert.ok(vivo(await leggiPid()), 'il figlio in background resta vivo')
    assert.match(conSfondo.fuori, /genitore uscito/u)
    assert.equal(conSfondo.processoInBackground, true)
    assert.match(conSfondo.insieme, NOTA)
    assert.doesNotMatch(conSfondo.fuori, /⛔/u, 'la nota non finisce nell uscita del programma')
    const t1 = Date.now()
    const normale = await eseguiComandoSandboxato('echo ciao', cartella, { dove: 'windows' })
    assert.ok(Date.now() - t1 < 1_900, 'un comando normale non aspetta il drenaggio')
    assert.equal(normale.processoInBackground, undefined)
    assert.doesNotMatch(normale.testo, /⛔/u)
    assert.equal(normale.testo.trim(), 'ciao')
})

test('F007B-06: eseguiComando con la cattura dei byte (com è la strada di wsl.exe) si stacca, resta «delivered» e lo dice', soloWindows, async (t) => {
    const { cartella, leggiPid } = preparazione(t)
    const genitore = `const f=require('child_process').spawn(process.execPath,['-e',${JSON.stringify(AVVIO + RESTA)}],{stdio:'inherit',detached:true,windowsHide:true});f.unref();console.log('genitore uscito')`
    const pezzi = []
    const esito = await eseguiComando(process.execPath, ['-e', genitore], { cwd: cartella, timeoutMs: 30_000, onBytes: async ({ bytes }) => { pezzi.push(Buffer.from(bytes)) } })
    assert.equal(esito.processoInBackground, true)
    assert.equal(esito.outputCapture.state, 'delivered')
    assert.match(esito.insieme, NOTA)
    assert.match(Buffer.concat(pezzi).toString('utf8'), /genitore uscito/u)
    assert.ok(vivo(await leggiPid()))
})

test('F007B-05 (porta vera): anche `prova` si conclude all uscita del suo comando, e lo dice al modello', soloWindows, async (t) => {
    const { cartella, sfondo, leggiPid } = preparazione(t)
    const esiti = []
    let n = 0
    await talosLavora({
        cartella, task: { consegna: 'prova' }, modello: 'f', chiave: 'k', giriMassimi: 3, livelloAccesso: 'accesso-pieno',
        comandoProva: `echo prova & ${sfondo(RESTA)}`,
        fetchDiRete: async () => {
            const message = n++ === 0
                ? { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'prova', arguments: '{}' } }] }
                : { role: 'assistant', content: 'fatto' }
            return new Response(JSON.stringify({ choices: [{ message, finish_reason: n === 1 ? 'tool_calls' : 'stop' }] }), { headers: { 'Content-Type': 'application/json' } })
        },
        onGiro: (e) => { if (e.tipo === 'tool-esito') esiti.push(String(e.content)) },
    })
    assert.match(esiti[0] ?? '', /prova/u)
    assert.match(esiti[0] ?? '', /⛔ Un processo avviato da questo comando gira ancora in background/u)
    assert.ok(vivo(await leggiPid()))
})
