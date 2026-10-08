import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { eseguiComando, conIntestazioneDiTaglio, uscitaUtile, uccidiAlberoDelProcesso } from '../src/kernel/talosHarness.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

const NODE = process.execPath

test('Q0-TIMEOUT-LINUX-FLAG: un comando ucciso dal tempo lo dichiara, uno che finisce no', async () => {
    const lento = await eseguiComando(NODE, ['-e', 'setTimeout(() => {}, 10000)'], { timeoutMs: 150 })
    assert.equal(lento.fermatoDalTempo, true)
    assert.equal(lento.fermatoSuRichiesta, undefined)

    const veloce = await eseguiComando(NODE, ['-e', 'process.stdout.write("ok")'], { timeoutMs: 10000 })
    assert.equal(veloce.codice, 0)
    assert.equal(veloce.fermatoDalTempo, undefined)
    assert.equal(veloce.fuori, 'ok')
})

test('Q0-TIMEOUT-NOT-STOP: tempo scaduto e Stop restano due esiti distinti', async () => {
    const stop = new AbortController()
    const p = eseguiComando(NODE, ['-e', 'setTimeout(() => {}, 10000)'], { timeoutMs: 10000, segnaleStop: stop.signal })
    setTimeout(() => stop.abort(), 150)
    const r = await p
    assert.equal(r.fermatoSuRichiesta, true)
    assert.equal(r.codice, 130)
    assert.equal(r.fermatoDalTempo, undefined)
})

test('Q0-CUT-HEADER: l intestazione compare in testa solo se il taglio ha morso', () => {
    const corto = 'a'.repeat(4000)
    assert.equal(conIntestazioneDiTaglio(corto, uscitaUtile(corto)), corto)

    const lungo = 'b'.repeat(9000)
    const fuori = conIntestazioneDiTaglio(lungo, uscitaUtile(lungo))
    assert.ok(fuori.startsWith('[TALOS cut this output: 9000 characters were produced and 5000 were removed from the MIDDLE'))
    assert.ok(fuori.includes('[TALOS cut 5000 characters from the middle of this output]'))
})

/*
 * F-007 (audit 28/29-09, «cancel shell non esercitabile»), misurato il 30/09: allo scadere del tempo il kernel faceva
 * `p.kill()`, che uccide la SHELL ma non il comando vero sotto di lei (nodejs/node #40438). Il nipote teneva aperti i
 * tubi e `close` arrivava solo quando finiva da solo: timeout a 0,8 s, esito dopo 15,06 s; con un server di sviluppo,
 * mai. Lo Stop invece passava già da `uccidiAlberoDelProcesso` (0,87 s, nessun superstite). Codex fa lo stesso sul tempo
 * (`codex-rs/core/src/exec.rs:1035` `kill_child_process_group(&mut child)?;`, prova `exec_tests.rs:1274`
 * `kill_child_process_group_kills_grandchildren_on_timeout`), e Hermes usa un solo `_kill_process` per stop e tempo
 * (`tools/environments/base.py:376`). ⇒ Il tempo scaduto uccide l'albero intero, come lo Stop.
 * ⛔ Qui il segno che il nipote è morto è il TEMPO dell'esito: `close` non arriva finché un discendente tiene i tubi.
 */
test('F-007-TIMEOUT-KILLS-TREE: il tempo scaduto uccide anche il comando sotto la shell, non solo la shell', {
    skip: process.platform !== 'win32' && 'uccidiAlberoDelProcesso usa taskkill /T solo su Windows',
}, async () => {
    const cartella = mkdtempSync(join(tmpdir(), 'talos-f007-'))
    const dorme = join(cartella, 'dorme.js')
    writeFileSync(dorme, 'setTimeout(() => {}, 20000)\n')
    try {
        const inizio = Date.now()
        const r = await eseguiComando('cmd.exe', ['/d', '/c', 'node', dorme], { timeoutMs: 500 })
        const durata = Date.now() - inizio
        assert.equal(r.fermatoDalTempo, true)
        assert.ok(durata < 8000, `il tempo scaduto deve chiudere l'albero: esito dopo ${durata} ms con un nipote da 20 s`)
    } finally {
        rimuoviCartellaDiProva(cartella)
    }
})

/*
 * ⛔ 08/10/2026 (bugfixer, rosso riprodotto dalla CLI su r4): la prova leggeva la riga ESATTA del timer e contava 0 da
 *   3ec7cafea (04/10, BUG-3/BUG-14), che ha messo il passaggio in sottofondo fra lo stop e l'uccisione
 *   (`if (!gestoreSfondo.alTempoScaduto(timeoutMs)) uccidiAlberoDelProcesso(p)`). L'uccisione dell'albero c'era ancora: era il
 *   testo a non combaciare. ⇒ Si misura la PROPRIETÀ su ogni timer di scadenza, non la forma della riga: i timer sono tre, ognuno
 *   passa da `uccidiAlberoDelProcesso(p)` e nessuno chiama `p.kill()`.
 */
test('F-007-ONE-KILL-PATH: ogni timer di scadenza dei comandi passa dalla stessa uccisione dell albero', () => {
    const sorgente = readFileSync(new URL('../src/kernel/talosHarness.mjs', import.meta.url), 'utf8')
    const timer = sorgente.split('\n').filter((riga) => /setTimeout\(\(\) => \{ fermatoDalTempo = true;/u.test(riga))
    assert.equal(timer.length, 3, 'shell Windows, prova ed eseguiComando')
    for (const riga of timer) {
        assert.match(riga, /uccidiAlberoDelProcesso\(p\)/u, `il timer deve uccidere l'albero: ${riga.trim()}`)
        assert.doesNotMatch(riga, /\bp\.kill\(/u, `nessun timer uccide la sola shell: ${riga.trim()}`)
    }
    assert.equal((sorgente.match(/fermatoDalTempo = true; p\.kill\(\)/gu) ?? []).length, 0, 'nessun timer uccide la sola shell')
})

/*
 * ⛔⛔ F-007-PID-RIUSATO (review avversaria della 0.1.20, 01/10/2026). `taskkill /PID <pid> /T /F` su una shell GIÀ USCITA:
 *   misurato, risponde «processo non trovato» e l'orfano che tiene i tubi resta vivo — non serve a niente. E dopo che Node
 *   chiude l'handle del processo Windows può riusare quel PID: il colpo cadrebbe su un albero ESTRANEO. Hermes lo racconta
 *   come incidente vero — «taskkill on a recycled PID has killed svchost.exe» (`gateway/status.py:395-405`, #89614) — e su
 *   Windows non uccide per PID senza un controllo d'identità (`tools/environments/local.py:889-896`).
 *   Node: all'evento 'exit' uno fra `exitCode` e `signalCode` non è nullo, e i tubi «might still be open» (documentazione
 *   v24, child_process, Event 'exit'). ⇒ Figlio già uscito ⇒ nessun taskkill per PID.
 * ⇒ Prova nei due versi con un figlio VERO: uscito ⇒ nessuna uccisione lanciata; vivo ⇒ l'uccisione parte.
 */
test('F-007-PID-RIUSATO: un figlio già uscito non si uccide per PID; uno vivo sì', async () => {
    const lanciate = []
    const spia = (comando, argomenti) => { lanciate.push([comando, ...argomenti].join(' ')); return { on() {} } }

    const uscito = spawn(NODE, ['-e', 'process.exit(0)'], { stdio: 'ignore', windowsHide: true })
    await new Promise((ok) => uscito.once('exit', ok))
    assert.ok(uscito.exitCode !== null || uscito.signalCode !== null, 'il figlio deve essere uscito davvero')
    assert.equal(uccidiAlberoDelProcesso(uscito, { spawnFn: spia }), false, 'niente da uccidere: il figlio è già uscito')
    assert.deepEqual(lanciate, [], `nessun taskkill su un PID che Windows può aver riusato: ${lanciate.join(' | ')}`)

    // terminato da un segnale: `exitCode` resta null e lo dice `signalCode` — anche questo è già uscito
    const terminato = spawn(NODE, ['-e', 'setTimeout(() => {}, 20000)'], { stdio: 'ignore', windowsHide: true })
    await new Promise((ok) => terminato.once('spawn', ok))
    terminato.kill()
    await new Promise((ok) => terminato.once('exit', ok))
    assert.equal(terminato.exitCode, null, 'il caso del segnale: exitCode nullo')
    assert.equal(typeof terminato.signalCode, 'string', 'il caso del segnale: signalCode presente')
    assert.equal(uccidiAlberoDelProcesso(terminato, { spawnFn: spia }), false, 'niente da uccidere: terminato da un segnale')
    assert.deepEqual(lanciate, [], `nessun taskkill dopo un segnale: ${lanciate.join(' | ')}`)

    const vivo = spawn(NODE, ['-e', 'setTimeout(() => {}, 20000)'], { stdio: 'ignore', windowsHide: true })
    try {
        await new Promise((ok) => vivo.once('spawn', ok))
        assert.equal(uccidiAlberoDelProcesso(vivo, { spawnFn: spia }), true)
        if (process.platform === 'win32') assert.deepEqual(lanciate, [`taskkill /PID ${vivo.pid} /T /F`])
    } finally {
        vivo.kill()
    }
})
