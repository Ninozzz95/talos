/*
 * ⛔ Lanciatore nativo dei comandi (decisione 374, R1 dei nipoti staccati; owner 12/11/2026, strada A: nostro exe in Rust; forma VERDE
 *   del giudice v1629, §7 e §10). Processi VERI, solo Windows, sul nucleo vero.
 *   Oggi Node mette ogni figlio in un Job con SILENT_BREAKAWAY_OK (libuv v1.52.1 `src/win/process.c:77-96`): un programma che il comando
 *   lascia acceso (`start "" /b`, `detached: true`) non è più di nessuno, il comando «finisce» mentre lui scrive, e «Ferma» non lo
 *   raggiunge. Col lanciatore la shell parte sospesa in un Job SENZA breakaway: il comando resta di chi l'ha lanciato finché l'ultimo
 *   processo del Job esce (JOB_OBJECT_MSG_ACTIVE_PROCESS_ZERO), e «Ferma» chiude il Job intero.
 * L'exe si costruisce in locale con cargo (`native/lanciatore/`) e si indica con TALOS_LANCIATORE, oppure è quello del pacchetto con la
 *   sua impronta. ⛔ Senza un lanciatore usabile le prove che lo vogliono NON sono verdi: sono SALTATE, col motivo che dà il nucleo
 *   (revisore B, 12/11: si contano come saltate, mai come passate). Il ripiego e la caduta non vogliono l'exe e girano sempre.
 * Concorrenti: hermes-agent hermes_cli/local_runtime/processes.py:47-67 (Job senza BREAKAWAY_OK né SILENT_BREAKAWAY_OK: «descendants
 *   stay contained»); codex codex-rs/utils/pty/src/win/job.rs:91-95 (`create_without_breakaway`).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'
import { setTimeout as attendi } from 'node:timers/promises'
import * as K from '../src/kernel/talosHarness.mjs'
import { trovaLanciatore } from '../src/kernel/lanciatore-windows.mjs'
import * as L from '../src/kernel/lanciatore-windows.mjs'
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs'

const SU_WINDOWS = process.platform === 'win32'
const STATO_ALL_INIZIO = SU_WINDOWS ? K.statoDelLanciatore() : { nipoti: false, motivo: 'non-windows' }
const conLanciatore = { skip: !SU_WINDOWS ? 'solo Windows' : (STATO_ALL_INIZIO.nipoti ? false : `SALTATA, non verde: qui il lanciatore non è usabile (${STATO_ALL_INIZIO.motivo}); in locale si indica l exe costruito con TALOS_LANCIATORE`), timeout: 40_000 }
const rimettiLanciatore = (prima) => { if (prima === undefined) delete process.env.TALOS_LANCIATORE; else process.env.TALOS_LANCIATORE = prima }
const soloWindows = { skip: SU_WINDOWS ? false : 'solo Windows', timeout: 40_000 }
const vivo = (pid) => { try { process.kill(pid, 0); return true } catch { return false } }
const NODE = `"${process.execPath}"`

/* Il nipote: scrive il suo PID, vive `ms`, poi lascia `uscito.txt` ed esce; si ferma prima se compare `stop.txt` (la pulizia non uccide
   mai per PID: F007-B, un PID riusato sarebbe di un processo estraneo). */
const NIPOTE = (ms) => `const f=require('fs');f.writeFileSync('pid-nipote.txt',String(process.pid));`
  + `const fine=()=>{f.writeFileSync('uscito.txt','');process.exit(0)};setTimeout(fine,${ms});setInterval(()=>{if(f.existsSync('stop.txt'))fine()},50)`
const PADRE_STACCATO = "require('child_process').spawn(process.execPath,['nipote.js'],{detached:true,stdio:'ignore'}).unref()"

function banco(t, msNipote = 3000) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-lanciatore-'))
  writeFileSync(join(cartella, 'nipote.js'), NIPOTE(msNipote))
  writeFileSync(join(cartella, 'padre.js'), PADRE_STACCATO)
  t.after(async () => {
    writeFileSync(join(cartella, 'stop.txt'), '')
    const pid = leggiPid(cartella)
    for (let i = 0; i < 80 && pid && vivo(pid); i++) await attendi(100)
    await rimuoviCartellaDiProvaAttesa(cartella)
  })
  return cartella
}
function leggiPid(cartella) {
  const f = join(cartella, 'pid-nipote.txt')
  const n = existsSync(f) ? Number(readFileSync(f, 'utf8')) : NaN
  return Number.isInteger(n) && n > 0 ? n : null
}
async function aspettaPid(cartella) {
  for (let i = 0; i < 100; i++) { const n = leggiPid(cartella); if (n) return n; await attendi(50) }
  throw new Error('il nipote non ha scritto il suo PID')
}

/* Un giro del modello con UNA chiamata `shell`, come il kernel la fa per una conversazione (registro dei comandi fermabili compreso). */
/* `attrezzo: 'prova'`: la stessa riga gira come prova del progetto (`comandoProva`), l'altro percorso del nucleo che lancia una shell. */
async function giroConUnComando(cartella, comando, { attrezzo = 'shell', argomenti = {}, opzioni = {} } = {}) {
  const registrati = new Map()
  const sganci = []
  const avvii = []
  let n = 0
  const chiamata = attrezzo === 'prova' ? { name: 'prova', arguments: '{}' } : { name: 'shell', arguments: JSON.stringify({ comando, ...argomenti }) }
  const fetchDiRete = async () => {
    n += 1
    const message = n === 1
      ? { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: chiamata }] }
      : { role: 'assistant', content: 'fatto' }
    return new Response(JSON.stringify({ choices: [{ message, finish_reason: n === 1 ? 'tool_calls' : 'stop' }] }), { headers: { 'Content-Type': 'application/json' } })
  }
  const esiti = []
  const t0 = Date.now()
  let caduto = null
  try {
    await K.talosLavora({
      cartella, task: { consegna: 'prova' }, modello: 'f', chiave: 'k', giriMassimi: 3, livelloAccesso: 'accesso-pieno', fetchDiRete,
      chiediApprovazioneFn: async () => true, ambienteComandiFn: async () => ({ dove: 'windows', revisione: 0 }),
      registraComandoFermabile: (dati) => { registrati.set(dati.toolCallId, dati); return () => { sganci.push({ id: dati.toolCallId, ms: Date.now() - t0 }) } },
      onGiro: (e) => { if (e.tipo === 'tool-esito') esiti.push(String(e.content)) },
      ...(attrezzo === 'prova' ? { comandoProva: comando } : {}),
      ...opzioni,
    })
  } catch (e) { if (!opzioni.captureProcessFn) throw e; caduto = e }
  for (const d of registrati.values()) avvii.push(d.pid?.())
  return { registrati, sganci, esiti, avvii, caduto, finito: Date.now() - t0 }
}
async function aspetta(condizione, ms = 6_000) {
  const fine = Date.now() + ms
  while (Date.now() < fine) { if (condizione()) return true; await attendi(50) }
  return condizione()
}

test('LANC-1: un nipote lasciato con `start "" /b` tiene il comando «in corso» finché esce: lo sgancio arriva dopo di lui, non alla fine della shell', conLanciatore, async (t) => {
  const cartella = banco(t, 3000)
  const r = await giroConUnComando(cartella, `start "" /b ${NODE} nipote.js >nul 2>nul <nul & echo fatto`)
  const pid = await aspettaPid(cartella)
  assert.match(r.esiti[0] ?? '', /fatto/u)
  assert.ok(vivo(pid), 'premessa: il nipote è ancora vivo a giro finito')
  assert.deepEqual(r.sganci, [], 'il comando resta registrato finché un suo processo vive (prima: sganciato alla fine della shell)')
  assert.ok(await aspetta(() => r.sganci.length === 1), 'uscito il nipote, il comando si sgancia')
  assert.ok(existsSync(join(cartella, 'uscito.txt')), 'lo sgancio arriva DOPO l uscita del nipote')
})

test('LANC-2: lo stesso con un nipote `detached: true` di Node (fuori dal Job di libuv oggi)', conLanciatore, async (t) => {
  const cartella = banco(t, 3000)
  const r = await giroConUnComando(cartella, `${NODE} padre.js`)
  const pid = await aspettaPid(cartella)
  assert.ok(vivo(pid))
  assert.deepEqual(r.sganci, [], 'il comando resta registrato finché il nipote staccato vive')
  assert.ok(await aspetta(() => r.sganci.length === 1))
  assert.ok(existsSync(join(cartella, 'uscito.txt')))
})

test('LANC-3: «Ferma» della riga ferma anche il nipote staccato (prima restava vivo)', conLanciatore, async (t) => {
  const cartella = banco(t, 15_000)
  const r = await giroConUnComando(cartella, `start "" /b ${NODE} nipote.js >nul 2>nul <nul & echo fatto`)
  const pid = await aspettaPid(cartella)
  assert.ok(vivo(pid), 'premessa')
  r.registrati.get('c1').ferma()
  assert.ok(await aspetta(() => !vivo(pid), 4_000), 'il nipote è fermato con il comando')
  assert.equal(existsSync(join(cartella, 'uscito.txt')), false, 'fermato, non uscito da solo')
  assert.ok(await aspetta(() => r.sganci.length === 1), 'e la riga si sgancia')
})

test('LANC-4: codici 0 e 3, tempo scaduto (124), Ferma (130) e sottofondo restano come oggi', conLanciatore, async (t) => {
  const cartella = banco(t)
  assert.equal((await K.eseguiComandoSandboxato('exit 0', cartella, { dove: 'windows' })).codice, 0)
  assert.equal((await K.eseguiComandoSandboxato('echo uno & exit 3', cartella, { dove: 'windows' })).codice, 3)
  const tempo = await K.eseguiComandoSandboxato('ping -n 6 127.0.0.1 >nul', cartella, { dove: 'windows', timeoutMs: 500 })
  assert.equal(tempo.codice, 124)
  const stop = new AbortController()
  setTimeout(() => stop.abort(), 400)
  const fermato = await K.eseguiComandoSandboxato('ping -n 6 127.0.0.1 >nul', cartella, { dove: 'windows', segnaleStop: stop.signal })
  assert.equal(fermato.codice, 130)
  const sfondo = new AbortController()
  const bg = await K.eseguiComandoSandboxato('ping -n 2 127.0.0.1 >nul & exit 4', cartella, { dove: 'windows', segnaleSfondo: sfondo.signal, inSfondoSubito: true, fileSfondo: join(cartella, 'bg.log') })
  assert.equal(bg.messoInSfondo, true)
  assert.deepEqual(await bg.uscita, { codice: 4, segnale: null })
})

test('LANC-5: senza l exe il comando parte come oggi (ripiego), detto: stato «nipoti seguiti: no» col motivo e una riga nel log una volta', soloWindows, async (t) => {
  const cartella = banco(t)
  const prima = process.env.TALOS_LANCIATORE
  process.env.TALOS_LANCIATORE = join(cartella, 'non-c-e', 'talos-lanciatore.exe')
  const righe = []
  const avviso = console.warn
  console.warn = (...a) => { righe.push(a.join(' ')) }
  try {
    assert.equal(typeof K.statoDelLanciatore, 'function', 'il nucleo dice se segue i nipoti')
    assert.equal((await K.eseguiComandoSandboxato('echo uno & exit 3', cartella, { dove: 'windows' })).codice, 3)
    assert.equal((await K.eseguiComandoSandboxato('exit 0', cartella, { dove: 'windows' })).codice, 0)
    assert.deepEqual(K.statoDelLanciatore(), { nipoti: false, motivo: 'assente' })
    assert.equal(righe.filter((r) => /launcher/u.test(r)).length, 1, 'una riga sola nel log, non una per comando')
  } finally {
    console.warn = avviso
    if (prima === undefined) delete process.env.TALOS_LANCIATORE; else process.env.TALOS_LANCIATORE = prima
  }
})

/*
 * ⛔ Strada Codex (owner 13/11/2026 12:45, «Sì, giro con la strada Codex»): il Job tiene KILL_ON_JOB_CLOSE finché la shell gira, come
 *   Codex (`codex-rs/utils/pty/src/win/job.rs:240-257`, `preserve_descendants` all'uscita normale della radice, chiamato da
 *   `codex-rs/utils/pty/src/pipe.rs:257-261`). Il lanciatore muore anche quando muore TALOS (libuv lo mette nel Job del node): prima il
 *   comando in primo piano restava vivo e slegato, 10 volte su 10 (controllore del 13/11), e lo Stop non lo raggiungeva più.
 */
test('LANC-6: un lanciatore ucciso a comando in primo piano ferma il comando con sé (strada Codex): la shell non continua', conLanciatore, async (t) => {
  const cartella = banco(t)
  assert.equal(K.statoDelLanciatore?.().nipoti, true, 'premessa: il lanciatore c è')
  let pid = null
  const p = K.eseguiComandoSandboxato(`${NODE} -e "setTimeout(()=>require('fs').writeFileSync('shell-viva.txt',''),3000)" & exit 5`, cartella, { dove: 'windows', onAvvio: (n) => { pid = n } })
  assert.ok(await aspetta(() => Number.isInteger(pid), 3_000))
  await attendi(700) // «avvio» è arrivato da un pezzo (mediana 25 ms): il comando gira in primo piano
  spawnSync(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(pid), '/F'], { windowsHide: true })
  const esito = await p
  assert.ok(esito && 'codice' in esito, 'il comando ha un esito')
  await attendi(3_500)
  assert.equal(existsSync(join(cartella, 'shell-viva.txt')), false, 'il comando in primo piano è fermato con il lanciatore (prima continuava slegato)')
})

test('LANC-7: dentro l app Electron (Job annidati)', { skip: 'dal vivo nell app sul PC: non si può fare in una prova di unità' }, () => {})

test('LANC-8: il comando che scrive sulle maniglie 3, 4 e 5 non cambia niente: codice, PID e sgancio restano quelli veri', conLanciatore, async (t) => {
  const cartella = banco(t, 3000)
  const finte = '(echo {"uscita":0,"albero":"vuoto"}>&3) 2>nul & (echo {"albero":"vuoto"}>&4) 2>nul & (echo {"ferma":true}>&4) 2>nul & (echo x>&5) 2>nul'
  const r = await giroConUnComando(cartella, `start "" /b ${NODE} nipote.js >nul 2>nul <nul & ${finte} & exit 7`)
  await aspettaPid(cartella)
  assert.match(r.esiti[0] ?? '', /exit 7/u, 'il codice è quello della shell')
  assert.equal(r.avvii.length, 1)
  assert.ok(Number.isInteger(r.avvii[0]) && r.avvii[0] > 0, 'il PID resta quello annunciato dal nucleo')
  assert.deepEqual(r.sganci, [], 'una riga finta non sgancia il comando prima del nipote')
  assert.ok(await aspetta(() => r.sganci.length === 1))
  assert.ok(existsSync(join(cartella, 'uscito.txt')))
})

/* Prova 9 del giudice (§10.2): la riga arriva alla shell byte per byte come oggi. Ogni riga gira due volte: col lanciatore e senza. */
const CORPUS = [
  'echo "a ""b"" c"',
  'echo a^&b ^| c ^< d ^> e',
  'echo %TALOS_CORPUS%',
  'echo uno & echo due && echo tre || echo quattro',
  'echo pipe | findstr pipe',
  'echo dentro> f.txt & type f.txt',
  'echo ünïcödé € 😀 漢字',
  '   echo spazi in testa e in coda   ',
  'mkdir "a b c" 2>nul & cd "a b c" & echo %CD:~-5%',
  '"' + process.execPath + '" -e "console.log(process.argv.slice(1).join(\'|\'))" "x y" z ""',
  `echo ${'x'.repeat(7900)}`,
  'exit 9',
]
test('LANC-9: un corpus di righe dà la stessa uscita, byte per byte, e lo stesso codice con e senza il lanciatore', conLanciatore, async (t) => {
  const cartella = banco(t)
  const prima = process.env.TALOS_LANCIATORE
  process.env.TALOS_CORPUS = 'x & y "z" %PATH% ^'
  try {
    for (const riga of CORPUS) {
      rimettiLanciatore(prima)
      const con = await K.eseguiComandoSandboxato(riga, cartella, { dove: 'windows' })
      process.env.TALOS_LANCIATORE = join(cartella, 'non-c-e.exe')
      const senza = await K.eseguiComandoSandboxato(riga, cartella, { dove: 'windows' })
      assert.deepEqual([con.codice, con.testo], [senza.codice, senza.testo], `riga: ${riga.slice(0, 60)}`)
    }
  } finally {
    rimettiLanciatore(prima)
    delete process.env.TALOS_CORPUS
  }
})

/*
 * ⛔ Giro di cura dopo i revisori B e C (12/11/2026). LANC-10, 11 e 15 sono nate ROSSE sulla testa `42f8a6edb`; LANC-12, 13 e 14 sono
 *   le prove che mancavano (i mutanti K7, K8, K9 e K4 del revisore C erano vivi): verdi prima e dopo.
 */
test('LANC-11: Stop nel primissimo istante: il comando smette di lavorare subito, non due secondi dopo', conLanciatore, async (t) => {
  const cartella = banco(t)
  writeFileSync(join(cartella, 'batte.js'), "const f=require('fs');const tag=process.argv[2];setInterval(()=>{try{f.appendFileSync('batte-'+tag+'.txt',Date.now()+'\\n')}catch{}},20);setTimeout(()=>process.exit(0),6000)")
  const dopoLoStop = []
  for (const [i, ritardo] of [null, 0, 0, 5, 10, 20, 30, 40, 60, 80].entries()) {
    const stop = new AbortController()
    let tStop = Date.now()
    if (ritardo === null) stop.abort()
    else setTimeout(() => { tStop = Date.now(); stop.abort() }, ritardo)
    const r = await K.eseguiComandoSandboxato(`${NODE} batte.js ${i}`, cartella, { dove: 'windows', segnaleStop: stop.signal, timeoutMs: 20_000 })
    assert.equal(r.codice, 130, `corsa ${i}`)
    // i battiti del comando: si aspetta che siano fermi da 400 ms (al massimo 3 s), poi si legge l ultimo
    const file = join(cartella, `batte-${i}.txt`)
    const ultimo = () => (existsSync(file) ? Number(readFileSync(file, 'utf8').trim().split('\n').at(-1)) : 0)
    const fine = Date.now() + 3_000
    for (let u = ultimo(); Date.now() < fine;) { await attendi(400); const v = ultimo(); if (v === u) break; u = v }
    dopoLoStop.push(Math.max(0, ultimo() - tStop))
  }
  t.diagnostic(`lavoro dopo lo Stop, ms, una voce per corsa: ${dopoLoStop.join(', ')}`)
  assert.ok(Math.max(...dopoLoStop) < 1_000, `dopo lo Stop il comando ha lavorato ancora (ms, una voce per corsa): ${dopoLoStop.join(', ')}`)
})

test('LANC-12: anche la `prova` del progetto passa dal lanciatore: il nipote che lascia accesa tiene la riga fino alla sua uscita', conLanciatore, async (t) => {
  // due strade nel nucleo: con il posto dei comandi scelto («windows») e senza (la strada di sempre della prova, che lancia da sé)
  for (const [strada, opzioni] of [['posto scelto', {}], ['strada di sempre', { ambienteComandiFn: undefined }]]) {
    const cartella = banco(t, 3000)
    const r = await giroConUnComando(cartella, `start "" /b ${NODE} nipote.js >nul 2>nul <nul & echo fatto`, { attrezzo: 'prova', opzioni })
    const pid = await aspettaPid(cartella)
    assert.equal(r.esiti.length, 1, `${strada}: la prova ha un esito`)
    assert.ok(vivo(pid), `${strada}: premessa, il nipote è ancora vivo a giro finito`)
    assert.deepEqual(r.sganci, [], `${strada}: la riga della prova resta registrata finché un suo processo vive`)
    assert.ok(await aspetta(() => r.sganci.length === 1), `${strada}: uscito il nipote, la riga si sgancia`)
    assert.ok(existsSync(join(cartella, 'uscito.txt')), `${strada}: lo sgancio arriva DOPO l uscita del nipote`)
  }
})

test('LANC-13: se l esecuzione cade (la cattura lancia), la riga si sgancia subito, una volta: per `shell` e per `prova`', soloWindows, async (t) => {
  for (const attrezzo of ['shell', 'prova']) {
    const cartella = banco(t)
    const r = await giroConUnComando(cartella, 'echo fatto', { attrezzo, opzioni: { captureProcessFn: async () => { throw new Error('cattura caduta') } } })
    assert.equal(r.registrati.size, 1, `${attrezzo}: il comando era registrato`)
    assert.equal(r.sganci.length, 1, `${attrezzo}: un errore non lascia la riga appesa (né la sgancia due volte)`)
    await attendi(100)
    assert.equal(r.sganci.length, 1, attrezzo)
  }
})

test('LANC-14: un comando partito in sottofondo si sgancia quando sono finiti TUTTI E DUE: la sua shell e l ultimo processo del suo albero', conLanciatore, async (t) => {
  const cartella = banco(t, 3000)
  const r = await giroConUnComando(cartella, `start "" /b ${NODE} nipote.js >nul 2>nul <nul & echo fatto`, { argomenti: { background: true } })
  const pid = await aspettaPid(cartella)
  assert.match(r.esiti[0] ?? '', /IN BACKGROUND/u, 'premessa: è partito in sottofondo')
  await attendi(1_000) // la shell è uscita da un pezzo (la sua `uscita` è risolta), il nipote no
  assert.ok(vivo(pid), 'premessa: il nipote è ancora vivo')
  assert.deepEqual(r.sganci, [], 'uscita la shell ma non il nipote: la riga resta')
  assert.ok(await aspetta(() => r.sganci.length === 1), 'uscito anche il nipote, la riga si sgancia')
  assert.ok(existsSync(join(cartella, 'uscito.txt')))
})

test('LANC-15: un comando in una cartella che non esiste finisce come oggi (-1) e NON fa dire «lanciatore bloccato»', conLanciatore, async (t) => {
  const cartella = banco(t)
  assert.equal((await K.eseguiComandoSandboxato('exit 0', cartella, { dove: 'windows' })).codice, 0)
  assert.deepEqual(K.statoDelLanciatore(), { nipoti: true, motivo: null }, 'premessa: il lanciatore funziona')
  const righe = []
  const avviso = console.warn
  console.warn = (...a) => { righe.push(a.join(' ')) }
  try {
    const r = await K.eseguiComandoSandboxato('echo ciao', join(cartella, 'non-esiste'), { dove: 'windows' })
    assert.equal(r.codice, -1)
    assert.deepEqual(righe.filter((x) => /launcher/u.test(x)), [], 'nessun avviso falso')
    assert.deepEqual(K.statoDelLanciatore(), { nipoti: true, motivo: null }, 'la diagnostica non dice «bloccato»')
  } finally { console.warn = avviso }
})

test('LANC-10: un lanciatore che parte e muore prima di «avvio» non ferma i comandi: 5 su 5 girano come prima, UN avviso, stato «non seguiti»', soloWindows, async (t) => {
  const cartella = banco(t)
  const prima = process.env.TALOS_LANCIATORE
  // node al posto del lanciatore: parte, non trova uno «script» col nome del Job, esce 1 senza aver scritto «avvio»
  process.env.TALOS_LANCIATORE = process.execPath
  const righe = []
  const avviso = console.warn
  console.warn = (...a) => { righe.push(a.join(' ')) }
  try {
    const uno = await K.eseguiComandoSandboxato('echo ciao', cartella, { dove: 'windows' })
    assert.equal(uno.codice, 0)
    assert.match(uno.testo, /ciao/u)
    assert.doesNotMatch(uno.testo, /Cannot find module|MODULE_NOT_FOUND|node:internal/u, 'ciò che ha scritto il lanciatore morto non entra nell uscita del comando')
    assert.equal((await K.eseguiComandoSandboxato('echo uno & exit 3', cartella, { dove: 'windows' })).codice, 3)
    const tre = await K.eseguiComandoSandboxato(`${NODE} -e "console.log(6*7)"`, cartella, { dove: 'windows' })
    assert.equal(tre.codice, 0)
    assert.match(tre.testo, /42/u)
    const annunci = []
    const quattro = await K.eseguiComandoSandboxato('echo dentro> ripiego.txt & type ripiego.txt', cartella, { dove: 'windows', onAvvio: (pid) => annunci.push(pid) })
    assert.equal(quattro.codice, 0)
    assert.ok(existsSync(join(cartella, 'ripiego.txt')), 'il comando è girato davvero')
    assert.equal(annunci.length, 2, 'il PID annunciato diventa quello del comando ripartito')
    assert.notEqual(annunci[0], annunci[1])
    const sfondo = new AbortController()
    const bg = await K.eseguiComandoSandboxato('echo sfondo & exit 4', cartella, { dove: 'windows', segnaleSfondo: sfondo.signal, inSfondoSubito: true, fileSfondo: join(cartella, 'bg.log') })
    assert.equal(bg.messoInSfondo, true)
    assert.deepEqual(await bg.uscita, { codice: 4, segnale: null })
    assert.ok(await aspetta(() => existsSync(join(cartella, 'bg.log')) && /sfondo/u.test(readFileSync(join(cartella, 'bg.log'), 'utf8')), 3_000), 'l uscita del comando ripartito arriva nel file del sottofondo')
    assert.deepEqual(K.statoDelLanciatore(), { nipoti: false, motivo: 'morto' }, 'la diagnostica dice il vero')
    /* il PID registrato per la riga (scheda Processi, Stop per riga) è quello del comando ripartito, non quello del lanciatore morto:
       il comando scrive il PID di suo padre, che è la shell lanciata dal nucleo. Per `shell`, per la `prova` col posto scelto e per la
       `prova` sulla strada di sempre (i due punti del nucleo che lanciano una shell). */
    const scriviPadre = (nome) => `${NODE} -e "require('fs').writeFileSync('${nome}.txt',String(process.ppid))"`
    for (const [nome, opzioniDelGiro] of [['shell', { attrezzo: 'shell' }], ['prova-scelta', { attrezzo: 'prova' }], ['prova-di-sempre', { attrezzo: 'prova', opzioni: { ambienteComandiFn: undefined } }]]) {
      const r = await giroConUnComando(cartella, scriviPadre(nome), opzioniDelGiro)
      assert.ok(existsSync(join(cartella, `${nome}.txt`)), `${nome}: il comando è girato`)
      assert.equal(r.avvii[0], Number(readFileSync(join(cartella, `${nome}.txt`), 'utf8')), `${nome}: il PID della riga è quello della shell ripartita`)
    }
    assert.equal(righe.filter((r) => /launcher/u.test(r)).length, 1, 'una riga sola nel log, non una per comando')
  } finally {
    console.warn = avviso
    if (prima === undefined) delete process.env.TALOS_LANCIATORE; else process.env.TALOS_LANCIATORE = prima
  }
})

/*
 * ⛔ La garanzia su cui poggia il ripiego (giro di cura del 12/11): «nessuna riga avvio ⇒ il comando non è mai partito». La dà l'exe:
 *   scrive «avvio» PRIMA di far ripartire la shell sospesa, e se non riesce a scriverla (qui: lanciato senza il canale) chiude la
 *   shell sospesa ed esce 0xC0DE0003. Con l'exe di prima il comando girava lo stesso (uscita 0, file scritto): col ripiego nel nucleo
 *   sarebbe girato due volte.
 */
test('LANC-16: senza il canale l exe non fa partire il comando (esce 0xC0DE0003, niente file): «nessun avvio» vuol dire «mai partito»', conLanciatore, async (t) => {
  const cartella = banco(t)
  const exe = trovaLanciatore().percorso
  const cmd = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe')
  const lancia = (stdio) => new Promise((risolvi) => {
    const righe = []
    const p = spawn(exe, [], {
      cwd: cartella, windowsHide: true, windowsVerbatimArguments: true, stdio,
      argv0: `"${exe}" "${cmd}" ${cmd} /d /s /c "echo girato> girato-${stdio.length}.txt"`,
    })
    p.stdout.resume(); p.stderr.resume()
    p.stdio[3]?.setEncoding('utf8').on('data', (d) => righe.push(d))
    p.on('exit', (codice) => setTimeout(() => risolvi({ codice: codice >>> 0, righe: righe.join('') }), 200))
  })
  const senza = await lancia(['ignore', 'pipe', 'pipe'])
  assert.equal(senza.codice, 0xC0DE0003, 'il codice del lanciatore, non quello della shell')
  assert.equal(existsSync(join(cartella, 'girato-3.txt')), false, 'il comando NON è partito')
  // al contrario: col canale parte, e «avvio» è la prima riga
  const con = await lancia(['ignore', 'pipe', 'pipe', 'pipe'])
  assert.equal(con.codice, 0)
  assert.ok(existsSync(join(cartella, 'girato-4.txt')), 'col canale il comando gira')
  assert.match(con.righe, /^\{"avvio":\d+,"nipoti":true\}\n/u)
  // e nel sorgente la riga «avvio» sta prima della ripartenza della shell (l'ordine non si prova coi processi: è una gara di pochi µs)
  const sorgente = readFileSync(new URL('../native/lanciatore/src/main.rs', import.meta.url), 'utf8')
  // giro piccolo dopo il controllore (12/11): la riga si scrive da `riga_avvio` (che dice anche l'appoggio rifiutato)
  const avvio = sorgente.indexOf('let detto = canale.scrivi(&riga_avvio(')
  assert.ok(avvio > 0 && avvio < sorgente.indexOf('ResumeThread(pi.hThread)'), '«avvio» si scrive prima di ResumeThread')
  assert.ok(sorgente.indexOf('TerminateProcess(pi.hProcess, USCITA_AVVIO_NON_DETTO)') > avvio && sorgente.indexOf('TerminateProcess(pi.hProcess, USCITA_AVVIO_NON_DETTO)') < sorgente.indexOf('ResumeThread(pi.hThread)'), 'e senza «avvio» la shell si chiude prima di ripartire')
  /* Cure dopo il ripasso (12/11): il Job fa da appoggio alla shell SOSPESA (un lanciatore ucciso lì non la lascia sospesa per sempre:
     lo prova il fatto 9 della prova di fumo). Anche qui l'ordine è una gara di µs e si legge nel sorgente: acceso PRIMA di creare la
     shell, tolto DOPO la ripartenza (tolto prima, la finestra si riapre). Strada Codex (owner 13/11/2026 12:45): tolto solo all'uscita
     della shell o alla riga «sfondo» (`sgancia`), mai subito dopo la ripartenza (lì un lanciatore ucciso lasciava il comando slegato). */
  const acceso = sorgente.indexOf('muore_con_me(j, true);')
  const creata = sorgente.indexOf('creata = crea_shell_sospesa(')
  const ripartita = sorgente.indexOf('ResumeThread(pi.hThread)')
  const uscitaShell = sorgente.indexOf('WaitForSingleObject(pi.hProcess, INFINITE)')
  const tolto = sorgente.indexOf('sgancia(j, appoggio, &canale);')
  assert.ok(acceso > 0 && acceso < creata && creata < ripartita && ripartita < uscitaShell && uscitaShell < tolto, `l appoggio si accende prima di creare la shell e si toglie dopo l uscita della shell (${acceso}, ${creata}, ${ripartita}, ${uscitaShell}, ${tolto})`)
  assert.equal(sorgente.split('muore_con_me(j, false)').length - 1 + sorgente.split('muore_con_me(job, false)').length - 1, 1, 'e si toglie in un posto solo (`sgancia`)')
})

/*
 * ⛔ Cure dopo il ripasso dei revisori B e C (12/11/2026, giudice v1688 e v1691), coi processi veri e un lanciatore FINTO: node stesso
 *   al posto dell'exe, caricato con `tests/aiuto/lanciatore-finto.cjs` (agisce solo quando node parte come lanciatore).
 *   - LANC-17 (punto 8): il lanciatore APPESO. Prima: comando perso, 124 allo scadere del tempo, mai girato, 0 avvisi.
 *   - LANC-18 (punto 8, la gara): il lanciatore scrive «avvio» proprio alla soglia del guardiano. Il comando non gira MAI due volte.
 *   - LANC-19 (punto 9): «avvio» e poi il lanciatore muore. Prima: 5 su 5 non girati, 0 avvisi, diagnostica «seguiti: sì».
 *   - LANC-20 (K1 del revisore C, sua la prova): lo Stop che arriva fra la fine del comando e il suo esito.
 */
const FINTO = new URL('./aiuto/lanciatore-finto.cjs', import.meta.url)
function conLanciatoreFinto(t, modo) {
  const nomi = ['TALOS_LANCIATORE', 'NODE_OPTIONS', 'FINTO_LANCIATORE_MODO', 'FINTO_LANCIATORE_RITARDO_MS']
  const prima = Object.fromEntries(nomi.map((n) => [n, process.env[n]]))
  const percorso = fileURLToPath(FINTO).replace(/\\/gu, '/')
  process.env.TALOS_LANCIATORE = process.execPath
  process.env.NODE_OPTIONS = `${prima.NODE_OPTIONS ? `${prima.NODE_OPTIONS} ` : ''}--require "${percorso}"`
  process.env.FINTO_LANCIATORE_MODO = modo
  L.azzeraLanciatorePerProve()
  const righe = []
  const avviso = console.warn
  console.warn = (...a) => { righe.push(a.join(' ')) }
  t.after(() => {
    console.warn = avviso
    L.sogliaAvvioPerProve?.(null)
    for (const n of nomi) { if (prima[n] === undefined) delete process.env[n]; else process.env[n] = prima[n] }
  })
  return { righe, delLanciatore: () => righe.filter((r) => /\[launcher\]/u.test(r)) }
}
const righeDi = (file) => (existsSync(file) ? readFileSync(file, 'utf8').split(/\r?\n/u).map((r) => r.trim()).filter(Boolean) : [])
const DUBBIO = /may not have run/u

test('LANC-17: un lanciatore appeso (parte, non scrive «avvio», non esce) non perde più il comando: alla soglia si chiude e il comando gira, UNA volta; UN avviso, stato «non seguiti»; lo Stop nell attesa ferma subito', soloWindows, async (t) => {
  const cartella = banco(t)
  const finto = conLanciatoreFinto(t, 'appeso')
  const SOGLIA = 700
  assert.equal(typeof L.sogliaAvvioPerProve, 'function', 'il guardiano su «avvio» c è (e la sua soglia si accorcia per le prove)')
  L.sogliaAvvioPerProve(SOGLIA)
  const annunci = []
  const t0 = Date.now()
  const uno = await K.eseguiComandoSandboxato('echo girato>> conta.txt & echo ciao', cartella, { dove: 'windows', timeoutMs: 20_000, onAvvio: (pid) => annunci.push(pid) })
  const ms = Date.now() - t0
  assert.equal(uno.codice, 0, `il comando è girato (${uno.testo})`)
  assert.match(uno.testo, /ciao/u)
  assert.doesNotMatch(uno.testo, DUBBIO, 'è girato di sicuro: nessun dubbio da dire')
  assert.deepEqual(righeDi(join(cartella, 'conta.txt')), ['girato'], 'una volta sola')
  assert.ok(ms >= SOGLIA && ms < SOGLIA + 6_000, `alla soglia, non allo scadere del tempo del comando: ${ms} ms`)
  assert.equal(annunci.length, 2, 'il PID annunciato diventa quello del comando ripartito')
  assert.ok(await aspetta(() => !vivo(annunci[0]), 3_000), 'il lanciatore appeso è stato chiuso, non lasciato lì')
  const due = await K.eseguiComandoSandboxato('echo girato>> conta.txt & exit 3', cartella, { dove: 'windows', timeoutMs: 20_000 })
  assert.equal(due.codice, 3, 'codice del comando, come prima')
  assert.deepEqual(righeDi(join(cartella, 'conta.txt')), ['girato', 'girato'])
  assert.equal(finto.delLanciatore().length, 1, `un avviso solo per due comandi: ${finto.delLanciatore().join(' | ')}`)
  assert.match(finto.delLanciatore()[0], /\(appeso\)/u)
  assert.deepEqual(K.statoDelLanciatore(), { nipoti: false, motivo: 'appeso' }, 'la diagnostica non dice «seguiti: sì»')
  // lo Stop durante l'attesa di «avvio» (soglia lontana): ferma subito, il comando non parte né allora né dopo
  L.sogliaAvvioPerProve(20_000)
  const stop = new AbortController()
  const pidStop = []
  setTimeout(() => stop.abort(), 300)
  const t1 = Date.now()
  const tre = await K.eseguiComandoSandboxato('echo girato>> fermato.txt', cartella, { dove: 'windows', timeoutMs: 20_000, segnaleStop: stop.signal, onAvvio: (pid) => pidStop.push(pid) })
  const msStop = Date.now() - t1
  assert.equal(tre.codice, 130)
  assert.ok(msStop < 3_000, `lo Stop non aspetta la soglia: ${msStop} ms`)
  assert.ok(await aspetta(() => !vivo(pidStop[0]), 3_000), 'il lanciatore appeso non resta acceso dopo lo Stop')
  await attendi(500)
  assert.equal(existsSync(join(cartella, 'fermato.txt')), false, 'un comando fermato prima di partire non parte dopo')
  t.diagnostic(`lanciatore appeso: comando girato dopo ${ms} ms (soglia ${SOGLIA}); Stop nell attesa: ${msStop} ms`)
})

test('LANC-18: la gara alla soglia: un lanciatore lento che scrive «avvio» proprio mentre scatta il guardiano non fa girare il comando due volte, mai; se non si sa se è girato, lo si dice', soloWindows, async (t) => {
  const cartella = banco(t)
  conLanciatoreFinto(t, 'avvio-tardi')
  const SOGLIA = 400
  L.sogliaAvvioPerProve?.(SOGLIA)
  const visti = []
  // il lanciatore finto ci mette ~60 ms a partire: i ritardi stanno a cavallo della soglia, da molto prima a subito dopo
  for (const [i, scarto] of [-160, -130, -100, -80, -60, -40, -20, 0, 30, 80].entries()) {
    const dove = join(cartella, `g${i}`)
    mkdirSync(dove)
    process.env.FINTO_LANCIATORE_RITARDO_MS = String(SOGLIA + scarto)
    const r = await K.eseguiComandoSandboxato('echo dal nucleo>> conta.txt', dove, { dove: 'windows', timeoutMs: 20_000 })
    await attendi(150)
    const righe = righeDi(join(dove, 'conta.txt')).map((x) => x.trim())
    visti.push(`${scarto}:${righe.join('+') || 'niente'}${DUBBIO.test(r.testo) ? '?' : ''}`)
    assert.ok(righe.length <= 1, `scarto ${scarto} ms: il comando è girato ${righe.length} volte (${righe.join(', ')})`)
    if (righe.length === 0) assert.match(r.testo, DUBBIO, `scarto ${scarto} ms: non è girato e nessuno lo dice`)
  }
  t.diagnostic(`scarto dalla soglia : chi ha fatto girare il comando (? = «può non essere girato» detto): ${visti.join('  ')}`)
})

test('LANC-19: un lanciatore che scrive «avvio» e muore senza far partire niente: il comando non si rilancia MAI, ma ogni esito dice che può non essere girato, la diagnostica non dice «seguiti: sì», UNA riga nel log', soloWindows, async (t) => {
  const cartella = banco(t)
  const finto = conLanciatoreFinto(t, 'avvio-poi-muore')
  for (let i = 0; i < 5; i += 1) {
    const r = await K.eseguiComandoSandboxato(`echo girato> girato-${i}.txt`, cartella, { dove: 'windows', timeoutMs: 20_000 })
    assert.equal(r.codice, 57, `comando ${i}: il codice che c è`)
    assert.equal(existsSync(join(cartella, `girato-${i}.txt`)), false, `comando ${i}: mai un rilancio (la scelta «mai due volte» resta)`)
    assert.equal(r.testo.split('may not have run').length - 1, 1, `comando ${i}: UN avviso nell esito: ${r.testo}`)
    assert.doesNotMatch(r.testo, /did not run|has not run|was not run/u, 'mai «non è girato»: non lo si sa')
    assert.equal(r.forseNonGirato, true)
  }
  assert.deepEqual(K.statoDelLanciatore(), { nipoti: false, motivo: 'incerto' }, 'la diagnostica non dice più «seguiti: sì»')
  assert.equal(finto.delLanciatore().length, 1, `una riga sola nel log per cinque comandi: ${finto.delLanciatore().join(' | ')}`)
  assert.match(finto.delLanciatore()[0], /may not have run.*\(incerto\)/u)
  // e arriva alla CONVERSAZIONE: l'esito dell'attrezzo che il modello legge, per `shell` e per la `prova` del progetto
  for (const attrezzo of ['shell', 'prova']) {
    const r = await giroConUnComando(cartella, `echo girato> girato-${attrezzo}.txt`, { attrezzo })
    assert.equal(existsSync(join(cartella, `girato-${attrezzo}.txt`)), false, `${attrezzo}: mai un rilancio`)
    assert.equal(r.esiti.length, 1)
    assert.match(r.esiti[0], DUBBIO, `${attrezzo}: la conversazione lo riceve: ${r.esiti[0]}`)
  }
  // al contrario: fermato dalla persona, l'esito dice «fermato», non «può non essere girato»
  const stop = new AbortController()
  stop.abort()
  const fermato = await K.eseguiComandoSandboxato('echo girato> girato-stop.txt', cartella, { dove: 'windows', timeoutMs: 20_000, segnaleStop: stop.signal })
  assert.equal(fermato.codice, 130)
  assert.doesNotMatch(fermato.testo, DUBBIO)
})

test('LANC-20: uno Stop arrivato fra la fine del comando e il suo esito chiude il programma lasciato acceso (mutante K1; prova del revisore C)', conLanciatore, async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-lanciatore-'))
  writeFileSync(join(cartella, 'vive.js'), "const f=require('fs');f.writeFileSync('pid.txt',String(process.pid));setInterval(()=>{if(f.existsSync('stop.txt'))process.exit(9)},100);setTimeout(()=>process.exit(0),12000)")
  writeFileSync(join(cartella, 'padre.js'), "require('child_process').spawn(process.execPath,['vive.js'],{detached:true,stdio:'ignore',windowsHide:true}).unref();const f=require('fs');const t=Date.now();while(!f.existsSync('pid.txt')&&Date.now()-t<5000){}")
  const pidVivo = () => (existsSync(join(cartella, 'pid.txt')) ? Number(readFileSync(join(cartella, 'pid.txt'), 'utf8')) : null)
  t.after(async () => {
    writeFileSync(join(cartella, 'stop.txt'), '')
    for (let i = 0; i < 80 && pidVivo() && vivo(pidVivo()); i++) await attendi(100)
    await rimuoviCartellaDiProvaAttesa(cartella)
  })
  const ctl = new AbortController()
  let tolti = 0
  // lo Stop della persona arriva nell'istante in cui il nucleo ha appena tolto il suo ascolto (il comando è finito, l'esito non c'è ancora)
  const segnale = {
    get aborted() { return ctl.signal.aborted }, get reason() { return ctl.signal.reason },
    addEventListener: (...a) => ctl.signal.addEventListener(...a),
    removeEventListener: (...a) => { ctl.signal.removeEventListener(...a); tolti += 1; ctl.abort() },
    throwIfAborted: () => ctl.signal.throwIfAborted(),
  }
  const r = await K.eseguiComandoSandboxato(`${NODE} padre.js`, cartella, { dove: 'windows', timeoutMs: 20_000, segnaleStop: segnale, onBytes: () => {} })
  assert.ok(tolti >= 1, 'il nucleo ha tolto il suo ascolto prima dell esito')
  assert.ok(pidVivo(), 'il programma lasciato acceso è partito')
  assert.equal(r?.codice, 0, 'il comando era già finito da solo')
  assert.ok(await aspetta(() => !vivo(pidVivo()), 1_500), 'dopo lo Stop il programma lasciato acceso non vive più')
})

/*
 * ⛔ Giro piccolo g4 (13/11/2026, giudice v1738): il Job è anonimo e «Ferma» passa dal lanciatore (la sua entrata, maniglia 4), mai da un
 *   exe rilanciato per nome. Rossa sulla testa `b33573f91` (lì lo Stop rilancia l'exe con `--ferma "<nome>"`, anche prima di «avvio»).
 */
test('LANC-21: lo Stop chiude comando e nipote staccato senza mai rilanciare l exe per nome, anche dato prima di «avvio»', conLanciatore, async (t) => {
  for (const quando of ['dopo-avvio', 'prima-di-avvio']) {
    const cartella = banco(t, 15_000)
    const lanci = []
    const spawnFn = (file, argomenti, opzioni) => { lanci.push(String(opzioni?.argv0 ?? file)); return spawn(file, argomenti, opzioni) }
    const p = L.lanciaComando(`start "" /b ${NODE} nipote.js >nul 2>nul <nul & ${NODE} -e "setTimeout(()=>require('fs').writeFileSync('finito.txt',''),4000)"`,
      { shell: true, cwd: cartella, windowsHide: true }, { spawnFn, log: () => {} })
    p.stdout.resume(); p.stderr.resume(); p.on('error', () => {})
    const uscito = new Promise((r) => p.once('exit', (codice) => r(codice)))
    if (quando === 'prima-di-avvio') p.kill()
    else { await aspettaPid(cartella); assert.ok(await aspetta(() => p.pidShell !== null, 3_000), 'premessa: «avvio»'); p.kill() }
    const codice = await uscito
    if (quando === 'dopo-avvio') {
      // cura dei gialli (13/11): la risposta {"ferma":true} arriva (mutante RH) e il comando chiuso dal Job esce col codice 1 (mutante RF)
      assert.equal(p.gruppoChiuso, true, 'dopo-avvio: il lanciatore ha risposto che il gruppo è chiuso')
      assert.equal(codice, 1, 'dopo-avvio: il comando chiuso dallo Stop esce col codice 1, non come uno finito bene')
    }
    await attendi(1_500)
    const pid = leggiPid(cartella)
    assert.ok(pid === null || !vivo(pid), `${quando}: il nipote staccato è fermato con il comando`)
    assert.equal(existsSync(join(cartella, 'finito.txt')), false, `${quando}: il comando è fermato, non finito da solo`)
    assert.deepEqual(lanci.filter((a) => /--ferma|Local\\/u.test(a)), [], `${quando}: nessun exe rilanciato per nome (${lanci.join(' | ')})`)
    assert.equal(lanci.length, 1, `${quando}: solo il lancio del comando`)
  }
})

/*
 * ⛔ Giro piccolo g4, seconda prova del Job anonimo (mutante R7: un Job con un nome fisso passava tutte le prove di prima tranne il fatto
 *   10 della prova di fumo). Due comandi insieme, due lanciatori, due Job senza nome: lo Stop del secondo non tocca il primo.
 */
test('LANC-22: due comandi insieme hanno due gruppi: lo Stop del secondo ferma lui e il suo nipote, il primo finisce da solo col suo nipote vivo', conLanciatore, async (t) => {
  const lancia = (cartella) => {
    const p = L.lanciaComando(`start "" /b ${NODE} nipote.js >nul 2>nul <nul & ${NODE} -e "setTimeout(()=>require('fs').writeFileSync('finito.txt',''),3000)"`,
      { shell: true, cwd: cartella, windowsHide: true }, { log: () => {} })
    p.stdout.resume(); p.stderr.resume(); p.on('error', () => {})
    return { p, uscito: new Promise((r) => p.once('exit', r)) }
  }
  const ca = banco(t, 15_000)
  const cb = banco(t, 15_000)
  const a = lancia(ca)
  const b = lancia(cb)
  const pidA = await aspettaPid(ca)
  const pidB = await aspettaPid(cb)
  assert.ok(await aspetta(() => a.p.pidShell !== null && b.p.pidShell !== null, 3_000), 'premessa: «avvio» da tutti e due')
  b.p.kill()
  await b.uscito
  await attendi(1_000)
  assert.ok(!vivo(pidB), 'il nipote del secondo è fermato con lui')
  assert.equal(existsSync(join(cb, 'finito.txt')), false, 'il secondo è fermato, non finito da solo')
  assert.ok(vivo(pidA), 'il nipote del primo è vivo: lo Stop del secondo non è arrivato al suo gruppo')
  await a.uscito
  assert.ok(existsSync(join(ca, 'finito.txt')), 'il primo è finito da solo')
})

/*
 * ⛔ Strada Codex, al contrario (owner 13/11/2026 12:45): ciò che deve sopravvivere al lanciatore (e quindi alla chiusura di TALOS)
 *   sopravvive. Un comando mandato in sottofondo lo dice al lanciatore con la riga `sfondo` sulla sua entrata (maniglia 4), che toglie
 *   subito KILL_ON_JOB_CLOSE: resta adottabile dopo un riavvio (`session-registry.mjs`, `adottaSfondiOrfani`). I programmi che un
 *   comando FINITO ha lasciato accesi sopravvivono come in Codex (`preserve_descendants` all'uscita della radice, `job.rs:240-257`).
 */
test('LANC-23: al contrario — un comando messo in sottofondo sopravvive al lanciatore ucciso (riga «sfondo» sulla sua entrata)', conLanciatore, async (t) => {
  const cartella = banco(t)
  let pid = null
  const sfondo = new AbortController()
  const bg = await K.eseguiComandoSandboxato(`${NODE} -e "setTimeout(()=>require('fs').writeFileSync('sfondo-vivo.txt',''),3000)"`, cartella,
    { dove: 'windows', segnaleSfondo: sfondo.signal, inSfondoSubito: true, fileSfondo: join(cartella, 'bg.log'), onAvvio: (n) => { pid = n } })
  assert.equal(bg.messoInSfondo, true, 'premessa: è in sottofondo')
  assert.ok(Number.isInteger(pid), 'premessa: il PID del lanciatore è noto')
  await attendi(700)
  spawnSync(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(pid), '/F'], { windowsHide: true })
  assert.ok(await aspetta(() => existsSync(join(cartella, 'sfondo-vivo.txt')), 6_000), 'il comando in sottofondo continua senza il lanciatore')
  await bg.uscita
})

test('LANC-24: al contrario — il programma che un comando finito ha lasciato acceso sopravvive al lanciatore ucciso (come Codex preserve_descendants)', conLanciatore, async (t) => {
  const cartella = banco(t, 4_000)
  const p = L.lanciaComando(`start "" /b ${NODE} nipote.js >nul 2>nul <nul & echo fatto`, { shell: true, cwd: cartella, windowsHide: true }, { log: () => {} })
  p.stdout.resume(); p.stderr.resume(); p.on('error', () => {})
  await new Promise((r) => p.once('exit', r))
  const pid = await aspettaPid(cartella)
  assert.ok(vivo(pid), 'premessa: la shell è uscita, il nipote vive')
  p.figlio.kill() // il lanciatore, dalla maniglia di questa prova
  await attendi(1_000)
  assert.ok(vivo(pid), 'ucciso il lanciatore, il programma lasciato acceso continua')
  assert.ok(await aspetta(() => existsSync(join(cartella, 'uscito.txt')), 8_000), 'ed esce da solo, alla sua fine')
})

/*
 * ⛔ Ripiego «entrata chiusa» (controllore del 13/11: 20 processi vivi su 20 e `close` oltre 8 s mentre il log diceva «fermo»): il nucleo
 *   non può scrivere «ferma» e chiude il lanciatore dalla sua maniglia. Con la strada Codex, a comando in primo piano, il gruppo si
 *   chiude con lui: lo Stop raggiunge comando e nipote, e `close` arriva.
 */
test('LANC-25: l entrata del lanciatore chiusa prima del tempo: lo Stop chiude lo stesso comando e nipote, e non resta appeso', conLanciatore, async (t) => {
  const cartella = banco(t, 15_000)
  const p = L.lanciaComando(`start "" /b ${NODE} nipote.js >nul 2>nul <nul & ${NODE} -e "setTimeout(()=>require('fs').writeFileSync('finito.txt',''),6000)"`,
    { shell: true, cwd: cartella, windowsHide: true }, { log: () => {} })
  p.stdout.resume(); p.stderr.resume(); p.on('error', () => {})
  const chiuso = new Promise((r) => p.once('close', () => r(true)))
  const pid = await aspettaPid(cartella)
  assert.ok(await aspetta(() => p.pidShell !== null, 3_000), 'premessa: «avvio»')
  p.figlio.stdio[4].end()
  await attendi(200)
  p.kill()
  assert.ok(await Promise.race([chiuso, attendi(5_000).then(() => false)]), 'lo Stop non resta appeso: `close` arriva')
  await attendi(1_000)
  assert.ok(!vivo(pid), 'il nipote è fermato')
  assert.equal(existsSync(join(cartella, 'finito.txt')), false, 'il comando è fermato, non finito da solo')
})

/*
 * Cura dei gialli (13/11/2026): dopo «sfondo» l'entrata del lanciatore legge ancora «ferma» (mutante RB: una riga non svuotata dopo la
 * prima si incolla alla seconda), e lo Stop di un comando in sottofondo chiude comando e nipote con la risposta del gruppo chiuso.
 */
test('LANC-26: un comando mandato in sottofondo si ferma lo stesso con lo Stop (la riga «ferma» dopo «sfondo»)', conLanciatore, async (t) => {
  const cartella = banco(t, 15_000)
  const p = L.lanciaComando(`start "" /b ${NODE} nipote.js >nul 2>nul <nul & ${NODE} -e "setTimeout(()=>require('fs').writeFileSync('finito.txt',''),4000)"`,
    { shell: true, cwd: cartella, windowsHide: true }, { log: () => {} })
  p.stdout.resume(); p.stderr.resume(); p.on('error', () => {})
  const uscito = new Promise((r) => p.once('exit', (codice) => r(codice)))
  const pid = await aspettaPid(cartella)
  assert.ok(await aspetta(() => p.pidShell !== null, 3_000), 'premessa: «avvio»')
  assert.equal(p.inSfondo(), true, 'premessa: «sfondo» scritto')
  await attendi(200)
  p.kill()
  const codice = await Promise.race([uscito, attendi(5_000).then(() => 'appeso')])
  assert.equal(codice, 1, 'lo Stop in sottofondo chiude il comando dal Job (codice 1), non resta appeso')
  assert.equal(p.gruppoChiuso, true, 'il lanciatore ha risposto che il gruppo è chiuso')
  await attendi(1_000)
  assert.ok(!vivo(pid), 'il nipote è fermato')
  assert.equal(existsSync(join(cartella, 'finito.txt')), false, 'il comando è fermato, non finito da solo')
})
