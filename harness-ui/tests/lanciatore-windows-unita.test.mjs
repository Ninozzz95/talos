/*
 * Il modulo del lanciatore nel nucleo (decisione 374 R1, owner 1037; forma del giudice v1629), senza processi veri: `spawn` finto e un
 * lanciatore finto che scrive sul canale. Gira ovunque. Le prove coi processi veri sono `lanciatore-nipoti-cu.test.mjs` (solo Windows).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { createHash } from 'node:crypto'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'
import { ProcessoLanciato, azzeraLanciatorePerProve, lanciaComando, statoDelLanciatore, trovaLanciatore } from '../src/kernel/lanciatore-windows.mjs'
import * as L from '../src/kernel/lanciatore-windows.mjs'
import { uccidiAlberoDelProcesso } from '../src/kernel/talosHarness.mjs'

function figlioFinto(pid = 4242) {
  const f = new EventEmitter()
  f.pid = pid
  f.stdin = new PassThrough(); f.stdout = new PassThrough(); f.stderr = new PassThrough()
  const canale = new PassThrough()
  // giro g4: la maniglia 4 è l'entrata del lanciatore (il nucleo ci scrive «ferma»); qui si legge ciò che il nucleo vi ha scritto
  const entrata = new PassThrough()
  f.ricevuto = ''
  /* `ferme`: una voce per ogni «ferma» ricevuto; `emit('exit', 0)` è la risposta `{"ferma":true}` del lanciatore, ogni altro codice o
     un `error` è `{"ferma":false}` (le prove di prima simulavano così il processo `--ferma`: stessa forma, ora è la riga del canale). */
  f.ferme = []
  entrata.on('data', (d) => {
    f.ricevuto += d
    for (const riga of String(d).split('\n').filter(Boolean)) {
      if (riga !== 'ferma') continue
      const e = new EventEmitter()
      e.uccisi = 0
      e.on('exit', (c) => f.scrivi({ ferma: c === 0 }))
      e.on('error', () => f.scrivi({ ferma: false }))
      f.ferme.push(e)
    }
  })
  f.stdio = [f.stdin, f.stdout, f.stderr, canale, entrata]
  f.scrivi = (o) => canale.write(`${typeof o === 'string' ? o : JSON.stringify(o)}\n`)
  f.chiudi = () => { f.stdout.destroy(); f.stderr.destroy() }
  f.chiudiCanale = () => canale.destroy()
  f.uccisi = 0
  f.kill = () => { f.uccisi += 1; return true }
  return f
}
const prossimo = () => new Promise((r) => setImmediate(r))
const presto = (ms = 30) => new Promise((r) => setTimeout(r, ms))

function exeFinto(t) {
  const dir = cartellaDiProva('talos-lanciatore-unita-')
  t.after(() => rimuoviCartellaDiProva(dir))
  const exe = join(dir, 'talos-lanciatore.exe')
  writeFileSync(exe, 'finto')
  return exe
}

test('LANC-U-01 — fuori da Windows, o senza shell: è spawn com era, stessi argomenti, nessun avviso', () => {
  azzeraLanciatorePerProve()
  const chiamate = []
  const spawnFn = (...a) => { chiamate.push(a); return { pid: 1 } }
  const log = () => { throw new Error('nessun avviso') }
  lanciaComando('echo x', { shell: true, cwd: 'c' }, { spawnFn, piattaforma: 'linux', ambiente: {}, log })
  lanciaComando('echo x', { shell: false }, { spawnFn, piattaforma: 'win32', ambiente: {}, log })
  assert.deepEqual(chiamate, [['echo x', { shell: true, cwd: 'c' }], ['echo x', { shell: false }]])
})

test('LANC-U-02 — su Windows con l exe: la riga della shell è IDENTICA a quella di Node, dopo la shell (nessun nome di Job, giro g4); 5 tubi; niente shell:true', (t) => {
  azzeraLanciatorePerProve()
  const exe = exeFinto(t)
  const chiamate = []
  const spawnFn = (...a) => { chiamate.push(a); return figlioFinto() }
  const p = lanciaComando('echo "a b" & exit 3', { shell: true, cwd: 'C:\\progetto', windowsHide: true, env: { A: '1' } },
    { spawnFn, piattaforma: 'win32', ambiente: { TALOS_LANCIATORE: exe, comspec: 'C:\\Windows\\system32\\cmd.exe', SystemRoot: 'C:\\Windows' }, log: () => {} })
  assert.ok(p instanceof ProcessoLanciato)
  const [file, argomenti, opzioni] = chiamate[0]
  assert.equal(file, exe)
  assert.deepEqual(argomenti, [])
  assert.equal(opzioni.argv0, `"${exe}" "C:\\Windows\\system32\\cmd.exe" C:\\Windows\\system32\\cmd.exe /d /s /c "echo "a b" & exit 3"`)
  assert.equal(opzioni.windowsVerbatimArguments, true)
  assert.deepEqual(opzioni.stdio, ['pipe', 'pipe', 'pipe', 'pipe', 'pipe'])
  assert.equal('shell' in opzioni, false)
  assert.deepEqual([opzioni.cwd, opzioni.windowsHide, opzioni.env], ['C:\\progetto', true, { A: '1' }])
  // comspec relativo (`cmd.exe`): la shell assoluta è quella di System32, la riga dice ciò che Node direbbe
  lanciaComando('ver', { shell: true }, { spawnFn, piattaforma: 'win32', ambiente: { TALOS_LANCIATORE: exe, comspec: 'cmd.exe', SystemRoot: 'D:\\Win' }, log: () => {} })
  assert.match(chiamate[1][2].argv0, /" "D:\\Win[\\/]System32[\\/]cmd\.exe" cmd\.exe \/d \/s \/c "ver"$/u)
})

test('LANC-U-03 — ripiego detto, mai silenzioso: exe assente, shell che non è cmd, avvio rifiutato; una riga per motivo', (t) => {
  azzeraLanciatorePerProve()
  const exe = exeFinto(t)
  const righe = []
  const log = (r) => righe.push(r)
  const originali = []
  const spawnFn = (file, ...resto) => {
    if (file === exe) throw Object.assign(new Error('Access is denied'), { code: 'EACCES' })
    originali.push([file, ...resto]); return { pid: 7 }
  }
  const opzioni = { shell: true }
  lanciaComando('a', opzioni, { spawnFn, piattaforma: 'win32', ambiente: { TALOS_LANCIATORE: join(exe, '..', 'manca.exe') }, log })
  lanciaComando('b', opzioni, { spawnFn, piattaforma: 'win32', ambiente: { TALOS_LANCIATORE: join(exe, '..', 'manca.exe') }, log })
  lanciaComando('c', opzioni, { spawnFn, piattaforma: 'win32', ambiente: { TALOS_LANCIATORE: exe, comspec: 'C:\\Program Files\\PowerShell\\pwsh.exe' }, log })
  lanciaComando('d', opzioni, { spawnFn, piattaforma: 'win32', ambiente: { TALOS_LANCIATORE: exe, comspec: 'cmd.exe' }, log })
  assert.deepEqual(originali.map((c) => c[0]), ['a', 'b', 'c', 'd'], 'ogni comando parte comunque, com era')
  assert.equal(originali.every((c) => c[1] === opzioni), true)
  assert.equal(righe.length, 3, righe.join('\n'))
  assert.match(righe[0], /^\[launcher\] .*not followed.*\(assente\)/u)
  assert.match(righe[1], /\(shell\)/u)
  assert.match(righe[2], /\(bloccato\)/u)
})

test('LANC-U-04 — il canale: exit col codice della SHELL, albero vuoto dopo, righe storte scartate, close quando escono e si chiudono i tubi', async () => {
  const f = figlioFinto()
  const p = new ProcessoLanciato(f, { lanciatore: 'x.exe', log: () => {} })
  const eventi = []
  p.on('exit', (c, s) => eventi.push(['exit', c, s]))
  p.on('close', (c) => eventi.push(['close', c]))
  let vuoto = false
  p.alberoVuoto.then(() => { vuoto = true })
  f.scrivi('{"avvio":99,"nipoti":true}')
  f.scrivi('non json')
  f.scrivi({ uscita: -1 })
  f.scrivi({ uscita: 'x' })
  await prossimo()
  assert.equal(p.pidShell, 99)
  assert.equal(p.pid, 4242, 'il PID annunciato è quello del lanciatore, che vive finché vive l albero')
  assert.deepEqual(eventi, [])
  f.scrivi({ uscita: 7 })
  await prossimo()
  assert.deepEqual(eventi, [['exit', 7, null]])
  assert.equal(p.exitCode, 7)
  assert.equal(vuoto, false, 'la shell è uscita, l albero no')
  f.chiudi()
  await presto()
  assert.deepEqual(eventi, [['exit', 7, null], ['close', 7]])
  f.scrivi({ albero: 'vuoto' })
  await presto()
  assert.equal(vuoto, true)
  assert.equal(p.alberoFinito, true)
  f.emit('exit', 7, null)
  assert.equal(eventi.length, 2, 'l uscita del lanciatore non ripete exit')
})

test('LANC-U-05 — un lanciatore che muore prima delle sue righe: il comando finisce col codice che c è, l albero si dà per vuoto (§4)', async () => {
  const f = figlioFinto()
  const p = new ProcessoLanciato(f, { lanciatore: 'x.exe', log: () => {} })
  const eventi = []
  p.on('exit', (c) => eventi.push(c))
  f.emit('exit', 1, null)
  await prossimo()
  assert.deepEqual(eventi, [], 'si aspetta il canale: le righe possono arrivare dopo l exit')
  f.scrivi({ uscita: 0, albero: 'vuoto' })
  f.chiudiCanale()
  await presto()
  assert.deepEqual(eventi, [0], 'la riga arrivata dopo vince sul codice del lanciatore')
  const g = figlioFinto()
  const q = new ProcessoLanciato(g, { lanciatore: 'x.exe', log: () => {} })
  const e2 = []
  q.on('exit', (c) => e2.push(c))
  g.chiudiCanale()
  await presto()
  g.emit('exit', 1, null)
  await prossimo()
  assert.deepEqual(e2, [1])
  assert.equal(q.alberoFinito, true)
})

test('LANC-U-06 — «Ferma»: «ferma» al lanciatore (giro g4, mai per nome); se non riesce, il lanciatore dalla sua maniglia (mai taskkill, giro 3); una volta sola; niente dopo l albero vuoto', async () => {
  const f = figlioFinto(555)
  const lanci = []
  const spawnFn = (file, argomenti, opzioni) => {
    const e = new EventEmitter()
    lanci.push({ file, argomenti, opzioni, e })
    return e
  }
  const p = new ProcessoLanciato(f, { lanciatore: 'C:\\l.exe', spawnFn, log: () => {} })
  assert.equal(p.fermaAlbero(), true)
  assert.equal(p.fermaAlbero(), true)
  await prossimo()
  assert.equal(f.ricevuto, 'ferma\n', 'due Stop insieme: «ferma» una volta')
  f.scrivi({ ferma: false })
  await prossimo()
  assert.equal(lanci.length, 0, 'nessun processo lanciato, nessun taskkill sul lanciatore')
  assert.equal(f.uccisi, 1, 'il lanciatore dalla sua maniglia')
  f.scrivi({ albero: 'vuoto' })
  await presto()
  assert.equal(p.fermaAlbero(), false, 'albero vuoto: niente da fermare')
  // uccidiAlberoDelProcesso passa dal Job ANCHE se la shell è già uscita (il nipote no)
  const g = figlioFinto(556)
  const q = new ProcessoLanciato(g, { lanciatore: 'C:\\l.exe', spawnFn, log: () => {} })
  g.scrivi({ uscita: 0 })
  await prossimo()
  assert.equal(q.exitCode, 0)
  assert.equal(uccidiAlberoDelProcesso(q, { spawnFn: () => { throw new Error('mai taskkill qui') }, piattaforma: 'win32' }), true)
  await prossimo()
  assert.equal(g.ricevuto, 'ferma\n', 'shell uscita, albero vivo: «ferma» al lanciatore')
  assert.equal(lanci.length, 0)
})

test('LANC-U-07 — una riga «nipoti: false» del lanciatore (Job rifiutato) si dice: stato «non seguiti», motivo job', async (t) => {
  azzeraLanciatorePerProve()
  const righe = []
  const f = figlioFinto()
  const p = new ProcessoLanciato(f, { lanciatore: 'x.exe', log: (r) => righe.push(r) })
  f.scrivi({ avvio: 12, nipoti: false, motivo: 'assegna' })
  await prossimo()
  assert.equal(p.nipotiSeguiti, false)
  assert.equal(righe.length, 1)
  assert.match(righe[0], /\(job\)/u)
  if (process.platform === 'win32') {
    const exe = exeFinto(t)
    const prima = process.env.TALOS_LANCIATORE
    process.env.TALOS_LANCIATORE = exe
    try {
      assert.deepEqual(statoDelLanciatore(), { nipoti: false, motivo: 'job' })
      // «seguiti: sì» si dice quando arriva «avvio», non al lancio: un lanciatore partito che non ha ancora risposto non cambia lo stato
      const g = figlioFinto(13)
      const q = lanciaComando('echo x', { shell: true }, { spawnFn: () => g, piattaforma: 'win32', ambiente: { TALOS_LANCIATORE: exe, comspec: 'cmd.exe', SystemRoot: 'C:\\Windows' }, log: () => {} })
      assert.ok(q instanceof ProcessoLanciato)
      assert.deepEqual(statoDelLanciatore(), { nipoti: false, motivo: 'job' }, 'partito ma senza «avvio»: lo stato resta quello di prima')
      g.scrivi({ avvio: 14, nipoti: true })
      await prossimo()
      assert.deepEqual(statoDelLanciatore(), { nipoti: true, motivo: null }, 'arrivato «avvio»: seguiti')
    }
    finally { if (prima === undefined) delete process.env.TALOS_LANCIATORE; else process.env.TALOS_LANCIATORE = prima }
  }
})

test('LANC-U-08 — il `!` della persona: con un albero ancora vivo la riga resta fermabile fino all ultima uscita; senza, si sgancia subito come prima', async (t) => {
  const { eseguiComandoDiretto } = await import('../src/agent-service.mjs')
  const cartella = cartellaDiProva('talos-lanciatore-bang-')
  t.after(() => rimuoviCartellaDiProva(cartella))
  for (const conAlbero of [true, false]) {
    let svuota = null
    const alberoVuoto = new Promise((r) => { svuota = r })
    const registrati = new Set()
    const eventi = []
    await eseguiComandoDiretto({
      cartella, comando: 'start "" /b server & echo ok', onEvento: (e) => eventi.push(e),
      eseguiComandoSandboxatoFn: async () => ({ codice: 0, testo: 'ok', enforcement: 'none', ...(conAlbero ? { alberoVuoto } : {}) }),
      registraComandoFermabile: ({ toolCallId }) => { registrati.add(toolCallId); return () => registrati.delete(toolCallId) },
    })
    const id = eventi.find((e) => e.type === 'ToolCallStart')?.toolCallId
    assert.ok(id)
    assert.equal(registrati.has(id), conAlbero, conAlbero ? 'il nipote vive: la riga resta' : 'niente albero: sganciata subito, come prima')
    svuota()
    await presto(20)
    assert.equal(registrati.has(id), false)
  }
  // messo in sottofondo E con un albero vivo: la riga si sgancia quando sono finiti TUTTI E DUE, in un ordine o nell'altro
  // (il mutante A2 del revisore C, «alla prima delle due», era vivo)
  for (const primaLAlbero of [true, false]) {
    let svuota = null, esci = null
    const alberoVuoto = new Promise((r) => { svuota = r })
    const uscita = new Promise((r) => { esci = r })
    const registrati = new Set()
    const eventi = []
    await eseguiComandoDiretto({
      cartella, comando: 'start "" /b server & echo ok', onEvento: (e) => eventi.push(e),
      eseguiComandoSandboxatoFn: async () => ({ codice: null, testo: 'IN BACKGROUND', enforcement: 'none', messoInSfondo: true, uscita, alberoVuoto }),
      registraComandoFermabile: ({ toolCallId }) => { registrati.add(toolCallId); return () => registrati.delete(toolCallId) },
    })
    const id = eventi.find((e) => e.type === 'ToolCallStart')?.toolCallId
    assert.ok(id)
    assert.equal(registrati.has(id), true)
    if (primaLAlbero) svuota(); else esci({ codice: 0, segnale: null })
    await presto(20)
    assert.equal(registrati.has(id), true, primaLAlbero ? 'albero vuoto ma la shell sfondata vive: la riga resta' : 'shell uscita ma l albero vive: la riga resta')
    if (primaLAlbero) esci({ codice: 0, segnale: null }); else svuota()
    await presto(20)
    assert.equal(registrati.has(id), false, 'finiti tutti e due: sganciata')
  }
})

/*
 * ⛔ Giro di cura dopo i revisori B e C (12/11/2026). Nate ROSSE sulla testa `42f8a6edb`: il lanciatore che muore prima di «avvio»
 *   (LANC-U-09, 10), lo Stop nel primissimo istante (LANC-U-11), la variabile ereditata nell'app installata (LANC-U-12), l'impronta
 *   riletta a ogni lancio (LANC-U-13), l'avviso falso «bloccato» (LANC-U-14).
 *   Hermes tiene i discendenti nel Job (`hermes_cli/local_runtime/processes.py:67`); Codex lo stesso (`codex-rs/utils/pty/src/win/job.rs:91`).
 */
const spawnAFasi = (exe, { lanciatore, diPrima }) => {
  const chiamate = []
  const spawnFn = (file, argomenti, opzioni) => {
    chiamate.push([file, argomenti, opzioni])
    if (/taskkill\.exe$/iu.test(String(file))) return new EventEmitter()
    return file === exe ? lanciatore : diPrima
  }
  // giro g4: i «ferma» non sono più processi lanciati, sono righe sull'entrata del lanciatore (vedi `figlioFinto`)
  return { spawnFn, chiamate, ferme: lanciatore.ferme }
}
const AMBIENTE = (exe) => ({ TALOS_LANCIATORE: exe, comspec: 'cmd.exe', SystemRoot: 'C:\\Windows' })
const giri = async (n = 5) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)) }

test('LANC-U-09 — il lanciatore muore prima di «avvio» (o risponde errore avvio): il comando riparte con lo spawn di prima, uscita e codice sono i suoi, UN avviso, stato «non seguiti»', async (t) => {
  azzeraLanciatorePerProve()
  const exe = exeFinto(t)
  const righe = []
  for (const modo of ['muore', 'errore-avvio']) {
    const lanciatore = figlioFinto(100)
    const diPrima = figlioFinto(200)
    const { spawnFn, chiamate } = spawnAFasi(exe, { lanciatore, diPrima })
    const opzioni = { shell: true, cwd: 'C:\\p', windowsHide: true }
    const p = lanciaComando('echo ciao', opzioni, { spawnFn, piattaforma: 'win32', ambiente: AMBIENTE(exe), log: (r) => righe.push(r) })
    assert.ok(p instanceof ProcessoLanciato, modo)
    const eventi = []
    let fuori = '', errori = ''
    const ripieghi = []
    p.on('exit', (c, s) => eventi.push(['exit', c, s]))
    p.on('close', (c) => eventi.push(['close', c]))
    p.on('error', (e) => eventi.push(['error', e.code]))
    p.on('ripiego', () => ripieghi.push(p.pid))
    p.stdout.on('data', (d) => { fuori += d })
    p.stderr.on('data', (d) => { errori += d })
    assert.equal(p.pid, 100)
    if (modo === 'errore-avvio') lanciatore.scrivi({ errore: 'avvio', codice: 2 })
    // ciò che scrive un lanciatore che muore non è del comando: non deve arrivare a chi legge l'uscita
    lanciatore.stdout.write('rumore del lanciatore'); lanciatore.stderr.write('errore del lanciatore')
    lanciatore.stdout.end(); lanciatore.stderr.end()
    await prossimo()
    lanciatore.chiudiCanale()
    lanciatore.emit('exit', 57, null)
    await presto()
    assert.deepEqual(eventi, [], `${modo}: nessun exit col codice del lanciatore e nessun errore: il comando non è ancora girato`)
    assert.equal(chiamate.length, 2, `${modo}: lo spawn di prima è partito`)
    assert.deepEqual(chiamate[1].slice(0, 2), ['echo ciao', opzioni])
    assert.equal(chiamate[1][1], opzioni, 'le stesse opzioni di oggi, shell: true compresa')
    assert.deepEqual(ripieghi, [200], 'il PID diventa quello del comando vero, e lo si annuncia')
    assert.equal(p.nipotiSeguiti, false)
    diPrima.stdout.write('ciao\r\n')
    diPrima.stderr.write('avviso\r\n')
    diPrima.emit('exit', 3, null)
    assert.equal(p.alberoFinito, true, 'senza lanciatore l albero finisce con la shell, non con la chiusura dei tubi (che un nipote può tenere aperti)')
    diPrima.stdout.end(); diPrima.stderr.end()
    await presto()
    diPrima.emit('close', 3, null)
    await presto()
    assert.equal(fuori, 'ciao\r\n', modo)
    assert.equal(errori, 'avviso\r\n', modo)
    assert.deepEqual(eventi, [['exit', 3, null], ['close', 3]], modo)
    assert.equal(p.exitCode, 3)
    assert.equal(p.alberoFinito, true, 'senza lanciatore l albero non si segue: finisce con la shell')
    assert.equal(p.fermaAlbero(), false, 'uscito: niente da fermare')
  }
  assert.equal(righe.length, 1, `un avviso solo per due comandi: ${righe.join(' | ')}`)
  assert.match(righe[0], /^\[launcher\] .*not followed.*\(morto\)/u)
  if (process.platform === 'win32') {
    const prima = process.env.TALOS_LANCIATORE
    process.env.TALOS_LANCIATORE = exe
    try { assert.deepEqual(statoDelLanciatore(), { nipoti: false, motivo: 'morto' }, 'la diagnostica dice il vero: non seguiti') }
    finally { if (prima === undefined) delete process.env.TALOS_LANCIATORE; else process.env.TALOS_LANCIATORE = prima }
  }
})

test('LANC-U-10 — al contrario: con «avvio» arrivato non si ripiega mai (niente comando due volte); con lo Stop già chiesto nemmeno; il comando ripartito si ferma come un comando di prima', async (t) => {
  azzeraLanciatorePerProve()
  const exe = exeFinto(t)
  // 1. «avvio» arrivato, poi il lanciatore muore: il comando è già partito, non si rilancia
  {
    const lanciatore = figlioFinto(100)
    const { spawnFn, chiamate } = spawnAFasi(exe, { lanciatore, diPrima: figlioFinto(200) })
    const p = lanciaComando('git commit -m x', { shell: true }, { spawnFn, piattaforma: 'win32', ambiente: AMBIENTE(exe), log: () => {} })
    const codici = []
    p.on('exit', (c) => codici.push(c))
    lanciatore.scrivi({ avvio: 77, nipoti: true })
    await prossimo()
    lanciatore.chiudi(); lanciatore.chiudiCanale(); lanciatore.emit('exit', 1, null)
    await presto()
    assert.equal(chiamate.length, 1, 'un comando partito non si lancia una seconda volta')
    assert.deepEqual(codici, [1])
  }
  // 2. Stop prima di «avvio», poi il lanciatore muore senza averlo scritto: «Ferma» è una promessa, il comando NON riparte
  {
    const lanciatore = figlioFinto(101)
    const { spawnFn, chiamate } = spawnAFasi(exe, { lanciatore, diPrima: figlioFinto(201) })
    const avvisi = []
    const p = lanciaComando('del /q *', { shell: true }, { spawnFn, piattaforma: 'win32', ambiente: AMBIENTE(exe), log: (r) => avvisi.push(r) })
    const codici = []
    p.on('exit', (c) => codici.push(c))
    assert.equal(p.fermaAlbero(), true)
    await prossimo()
    assert.equal(lanciatore.ricevuto, 'ferma\n', 'giro g4: «ferma» al lanciatore, mai per nome')
    lanciatore.chiudi(); lanciatore.chiudiCanale(); lanciatore.emit('exit', 1, null)
    await presto()
    assert.equal(chiamate.some((c) => c[0] === 'del /q *'), false, 'fermato prima di partire: non si rilancia')
    assert.deepEqual(codici, [1])
    assert.equal(p.alberoFinito, true)
    assert.deepEqual(avvisi, [], 'nessun avviso: l ha fermato la persona, il lanciatore non è guasto')
  }
  // 3. dopo il ripiego, «Ferma» chiude l albero del comando ripartito come fa il nucleo senza lanciatore: taskkill /T /F sul SUO PID
  {
    const lanciatore = figlioFinto(102)
    const diPrima = figlioFinto(202)
    diPrima.exitCode = null; diPrima.signalCode = null
    const { spawnFn, chiamate } = spawnAFasi(exe, { lanciatore, diPrima })
    const p = lanciaComando('ping -n 30 127.0.0.1', { shell: true }, { spawnFn, piattaforma: 'win32', ambiente: AMBIENTE(exe), log: () => {} })
    lanciatore.chiudi(); lanciatore.chiudiCanale(); lanciatore.emit('exit', 57, null)
    await presto()
    assert.equal(p.pid, 202)
    assert.equal(uccidiAlberoDelProcesso(p, { spawnFn: () => { throw new Error('passa da fermaAlbero') }, piattaforma: 'win32' }), true)
    const boia = chiamate.at(-1)
    assert.match(boia[0], /taskkill\.exe$/iu)
    assert.deepEqual(boia[1], ['/PID', '202', '/T', '/F'])
    assert.equal(chiamate.some((c) => /--ferma/u.test(c[2]?.argv0 ?? '')), false, 'nessun Job da chiudere: il lanciatore non c è più')
    assert.equal(lanciatore.ricevuto, '', 'né «ferma» al lanciatore morto')
    // un PID già uscito non si uccide (Windows lo riusa: il colpo cadrebbe su un albero estraneo), anche prima che arrivi `exit`
    const quanti = chiamate.length
    diPrima.exitCode = 1
    assert.equal(p.fermaAlbero(), false, 'uscito: niente taskkill sul suo PID')
    assert.equal(chiamate.length, quanti)
    diPrima.emit('exit', 1, null)
    assert.equal(p.fermaAlbero(), false)
  }
})

test('LANC-U-15 — i tubi sono del comando: un uscita che nessuno legge non tiene appeso `close`; uno che la legge la riceve tutta, poi `close`', async () => {
  // nessuno legge: come Node all'uscita di un figlio, i tubi si svuotano da soli e `close` arriva
  const f = figlioFinto(700)
  const p = new ProcessoLanciato(f, { lanciatore: 'x.exe', log: () => {} })
  const eventi = []
  p.on('exit', (c) => eventi.push(['exit', c]))
  p.on('close', (c) => eventi.push(['close', c]))
  f.scrivi({ avvio: 9, nipoti: true })
  await prossimo()
  f.stdout.write('x'.repeat(100_000)); f.stderr.write('y')
  f.stdout.end(); f.stderr.end()
  f.scrivi({ uscita: 0, albero: 'vuoto' })
  await presto(60)
  assert.deepEqual(eventi, [['exit', 0], ['close', 0]])
  // qualcuno legge, in ritardo sull'uscita della shell: riceve tutto, e `close` arriva dopo l'ultimo pezzo
  const g = figlioFinto(701)
  const q = new ProcessoLanciato(g, { lanciatore: 'x.exe', log: () => {} })
  let letto = 0
  const ordine = []
  q.stdout.on('data', (d) => { letto += d.length })
  q.stderr.on('data', () => {})
  q.stdout.on('end', () => ordine.push('fine'))
  q.on('close', () => ordine.push('close'))
  g.scrivi({ avvio: 10, nipoti: true })
  await prossimo()
  g.stdout.write('z'.repeat(200_000))
  g.scrivi({ uscita: 0 })
  await presto()
  assert.deepEqual(ordine, [], 'la shell è uscita ma il tubo è ancora aperto (un nipote lo tiene): niente close')
  g.stdout.write('coda'); g.stdout.end(); g.stderr.end()
  await presto(60)
  assert.equal(letto, 200_004)
  assert.deepEqual(ordine, ['fine', 'close'])
})

test('LANC-U-11 — Stop nel primissimo istante: «ferma» prima di «avvio» resta nel tubo del lanciatore; all arrivo di «avvio» si ridà, una volta; dopo 2 s senza albero vuoto, il lanciatore dalla sua maniglia (giro 3)', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const lanci = []
  const spawnFn = (file, argomenti, opzioni) => { const e = new EventEmitter(); lanci.push({ file, argomenti, opzioni, e }); return e }
  const f = figlioFinto(600)
  const p = new ProcessoLanciato(f, { lanciatore: 'C:\\l.exe', spawnFn, log: () => {} })
  assert.equal(p.fermaAlbero(), true)
  await giri()
  assert.equal(f.ricevuto, 'ferma\n')
  f.scrivi({ avvio: 4321, nipoti: true })
  await giri()
  assert.equal(f.ricevuto, 'ferma\nferma\n', 'all arrivo di «avvio» «ferma» si ridà: ora la shell è dentro')
  f.scrivi({ avvio: 4321, nipoti: true })
  await giri()
  assert.equal(f.ricevuto, 'ferma\nferma\n', 'una volta sola')
  f.scrivi({ ferma: true })
  await giri()
  // il ripiego dei 2 s (mutante L6 del revisore C): né prima, né se l albero si è svuotato
  t.mock.timers.tick(1_999)
  assert.equal(f.uccisi, 0, 'prima dei 2 s il lanciatore non si tocca')
  t.mock.timers.tick(1)
  assert.equal(f.uccisi, 1, 'a 2 s l albero non è vuoto: il gruppo è chiuso, il lanciatore dalla sua maniglia')
  assert.equal(lanci.length, 0, 'giro 3 e g4: nessun processo lanciato per fermare')
  // al contrario: albero vuoto entro i 2 s ⇒ niente
  const g = figlioFinto(601)
  const q = new ProcessoLanciato(g, { lanciatore: 'C:\\l.exe', spawnFn, log: () => {} })
  g.scrivi({ avvio: 9, nipoti: true })
  await giri()
  assert.equal(q.fermaAlbero(), true)
  await giri()
  assert.equal(g.ricevuto, 'ferma\n', 'con «avvio» già arrivato basta un «ferma»')
  g.scrivi({ ferma: true })
  g.scrivi({ uscita: 1, albero: 'vuoto' })
  await giri()
  t.mock.timers.tick(5_000)
  assert.equal(g.ricevuto, 'ferma\n', 'albero vuoto: il ripiego non scatta')
  assert.equal(g.uccisi, 0, 'né dalla maniglia')
})

test('LANC-U-12 — nell app installata (TALOS_DESKTOP_DATA_DIR) la variabile TALOS_LANCIATORE non conta, come per iroh: vale solo l exe con l impronta', (t) => {
  azzeraLanciatorePerProve()
  const exe = exeFinto(t)
  assert.deepEqual(trovaLanciatore({ ambiente: { TALOS_LANCIATORE: exe }, candidati: [], riferimenti: [] }), { percorso: exe, motivo: null }, 'sviluppo e prove: vale')
  assert.deepEqual(trovaLanciatore({ ambiente: { TALOS_LANCIATORE: exe, TALOS_DESKTOP_DATA_DIR: 'C:\\Users\\x\\AppData\\Roaming\\TALOS' }, candidati: [], riferimenti: [] }),
    { percorso: null, motivo: 'assente' }, 'app installata: una variabile ereditata non fa eseguire un exe non verificato')
  // e lungo tutto il filo: il comando parte come prima, l exe della variabile non viene mai lanciato
  const lanciati = []
  const spawnFn = (file) => { lanciati.push(file); return { pid: 5, on() {} } }
  lanciaComando('echo x', { shell: true }, { spawnFn, piattaforma: 'win32', ambiente: { ...AMBIENTE(exe), TALOS_DESKTOP_DATA_DIR: 'C:\\dati' }, log: () => {} })
  assert.equal(lanciati.includes(exe), false, 'l exe della variabile non parte')
  assert.ok(lanciati.includes('echo x'))
})

test('LANC-U-13 — impronta dell exe e riferimento riletti a OGNI lancio: un exe o un riferimento cambiato dopo il primo controllo non passa', (t) => {
  azzeraLanciatorePerProve()
  const dir = cartellaDiProva('talos-lanciatore-b3-')
  t.after(() => rimuoviCartellaDiProva(dir))
  const exe = join(dir, 'talos-lanciatore.exe')
  const riferimento = join(dir, 'lanciatore-binding.json')
  const sha = (b) => createHash('sha256').update(b).digest('hex')
  writeFileSync(exe, 'buono')
  writeFileSync(riferimento, JSON.stringify({ sha256: sha('buono') }))
  const cerca = () => trovaLanciatore({ ambiente: {}, candidati: [exe], riferimenti: [riferimento] })
  assert.deepEqual(cerca(), { percorso: exe, motivo: null })
  writeFileSync(exe, 'sostituito da un comando')
  assert.deepEqual(cerca(), { percorso: null, motivo: 'impronta' }, 'l exe sostituito dopo il primo controllo non si lancia')
  writeFileSync(exe, 'buono')
  assert.deepEqual(cerca(), { percorso: exe, motivo: null }, 'rimesso a posto, torna buono senza riavvio')
  writeFileSync(riferimento, JSON.stringify({ sha256: null }))
  assert.deepEqual(cerca(), { percorso: null, motivo: 'non-fissato' }, 'anche il riferimento si rilegge')
})

test('LANC-U-14 — una cartella che non esiste non è un lanciatore bloccato: nessun avviso, stato intatto; «bloccato» solo se il comando di prima parte dove lui no', (t) => {
  azzeraLanciatorePerProve()
  const exe = exeFinto(t)
  const righe = []
  // la cartella non esiste: non parte né il lanciatore né il comando di prima (Node dà un processo senza PID e l errore dopo)
  const senzaPid = () => { const e = new EventEmitter(); e.pid = undefined; return e }
  const p = lanciaComando('echo x', { shell: true, cwd: 'C:\\non-esiste' }, { spawnFn: () => senzaPid(), piattaforma: 'win32', ambiente: AMBIENTE(exe), log: (r) => righe.push(r) })
  assert.equal(p instanceof ProcessoLanciato, false)
  assert.deepEqual(righe, [], 'nessun avviso falso')
  if (process.platform === 'win32') {
    const prima = process.env.TALOS_LANCIATORE
    process.env.TALOS_LANCIATORE = exe
    try { assert.deepEqual(statoDelLanciatore(), { nipoti: true, motivo: null }, 'lo stato non diventa «bloccato»') }
    finally { if (prima === undefined) delete process.env.TALOS_LANCIATORE; else process.env.TALOS_LANCIATORE = prima }
  }
  // al contrario: il lanciatore non parte e il comando di prima sì ⇒ è lui il bloccato, e lo si dice
  lanciaComando('echo x', { shell: true }, { spawnFn: (file) => (file === exe ? senzaPid() : { pid: 9 }), piattaforma: 'win32', ambiente: AMBIENTE(exe), log: (r) => righe.push(r) })
  assert.equal(righe.length, 1)
  assert.match(righe[0], /\(bloccato\)/u)
})

/*
 * ⛔ Cure dopo il ripasso dei revisori B e C (12/11/2026, giudice v1688 e v1691). Rosse sulla testa `626b648f2`: LANC-U-16…20.
 *   Verdi già lì, mancavano e uccidono i mutanti R8 e R16 del revisore C: LANC-U-21 e 22.
 *   - punto 8: un lanciatore APPESO (parte, non scrive «avvio», non esce) perdeva il comando: 124 allo scadere del tempo, mai girato.
 *     Un guardiano su «avvio» lo chiude e fa ripartire il comando; ma se «avvio» è arrivato proprio lì, NON si rilancia (LANC-U-16, 17);
 *     e lo Stop dato durante quell'attesa non aspetta due secondi (LANC-U-18);
 *   - punto 9: «avvio» e poi il lanciatore muore: non si rilancia mai, ma lo si dice (LANC-U-19);
 *   - punto 3: allo Stop l'exe si ricontrolla come al lancio (LANC-U-20).
 */
const SOGLIA = () => L.SOGLIA_AVVIO_MS ?? 5_000
const ALLO_STOP = () => L.ATTESA_AVVIO_ALLO_STOP_MS ?? 500
const CHIUSURA = () => L.ATTESA_CHIUSURA_MS ?? 1_000
const taskkillDi = (chiamate) => chiamate.filter((c) => /taskkill\.exe$/iu.test(String(c[0]))).map((c) => c[1])
const statoVero = (exe) => {
  const prima = process.env.TALOS_LANCIATORE
  process.env.TALOS_LANCIATORE = exe
  try { return statoDelLanciatore() } finally { if (prima === undefined) delete process.env.TALOS_LANCIATORE; else process.env.TALOS_LANCIATORE = prima }
}

test('LANC-U-16 — lanciatore appeso: senza «avvio» entro la soglia il guardiano chiude il lanciatore dalla sua maniglia (giro g4: nessun Job per nome), e il comando riparte con lo spawn di prima; UN avviso, stato «non seguiti»; prima della soglia niente', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  azzeraLanciatorePerProve()
  const exe = exeFinto(t)
  const righe = []
  for (const giro of [1, 2]) {
    const lanciatore = figlioFinto(100)
    const diPrima = figlioFinto(200)
    const { spawnFn, chiamate, ferme } = spawnAFasi(exe, { lanciatore, diPrima })
    const opzioni = { shell: true, cwd: 'C:\\p' }
    const p = lanciaComando('echo ciao', opzioni, { spawnFn, piattaforma: 'win32', ambiente: AMBIENTE(exe), log: (r) => righe.push(r) })
    const eventi = []
    const ripieghi = []
    p.on('exit', (c, s) => eventi.push(['exit', c, s]))
    p.on('ripiego', () => ripieghi.push(p.pid))
    t.mock.timers.tick(SOGLIA() - 1)
    await giri()
    assert.equal(lanciatore.uccisi, 0, `${giro}: prima della soglia il lanciatore non si tocca`)
    t.mock.timers.tick(1)
    await giri()
    // giro 3 e g4: il lanciatore dalla sua maniglia, una volta, mai per PID, nessun nome (la shell sospesa muore con lui: l'appoggio)
    assert.equal(lanciatore.uccisi, 1, `${giro}: alla soglia il lanciatore dalla sua maniglia, una volta`)
    assert.equal(ferme.length, 0, `${giro}: nessun «ferma»: prima di «avvio» il lanciatore non legge la sua entrata`)
    assert.deepEqual(taskkillDi(chiamate), [], `${giro}: mai taskkill sul lanciatore`)
    assert.equal(chiamate.length, 1, `${giro}: nessun processo lanciato per chiudere`)
    assert.equal(chiamate.some((c) => c[0] === 'echo ciao'), false, 'si decide solo a lanciatore finito e canale chiuso')
    lanciatore.chiudi(); lanciatore.chiudiCanale(); lanciatore.emit('exit', 1, null)
    await giri()
    assert.deepEqual(chiamate.filter((c) => c[0] === 'echo ciao').map((c) => c[1]), [opzioni], `${giro}: il comando riparte, una volta, con le opzioni di oggi`)
    assert.deepEqual(ripieghi, [200])
    assert.deepEqual(eventi, [], 'nessuna uscita col codice del lanciatore chiuso')
    assert.equal(p.nipotiSeguiti, false)
    assert.notEqual(p.forseNonGirato, true, 'è girato di sicuro UNA volta: nessun dubbio da dire')
    diPrima.emit('exit', 0, null); diPrima.chiudi(); diPrima.emit('close', 0, null)
    await giri()
    assert.deepEqual(eventi, [['exit', 0, null]])
    t.mock.timers.tick(SOGLIA() * 3)
    await giri()
    assert.equal(lanciatore.uccisi, 1, `${giro}: il guardiano scatta una volta; un lanciatore già uscito non si tocca più`)
    assert.deepEqual(taskkillDi(chiamate), [], `${giro}: nessun taskkill`)
  }
  assert.equal(righe.length, 1, `un avviso solo per due comandi: ${righe.join(' | ')}`)
  assert.match(righe[0], /^\[launcher\] .*\(appeso\)/u)
  if (process.platform === 'win32') assert.deepEqual(statoVero(exe), { nipoti: false, motivo: 'appeso' })
})

test('LANC-U-16b — al contrario: «avvio» prima della soglia ⇒ il guardiano non fa niente; e se «avvio» è già nel tubo quando la soglia scade (giro degli eventi fermo, PC tornato dalla sospensione) si legge PRIMA di decidere', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  azzeraLanciatorePerProve()
  const exe = exeFinto(t)
  const righe = []
  for (const quando of ['prima', 'nel-tubo']) {
    const lanciatore = figlioFinto(300)
    const { spawnFn, chiamate, ferme } = spawnAFasi(exe, { lanciatore, diPrima: figlioFinto(400) })
    const p = lanciaComando('echo ciao', { shell: true }, { spawnFn, piattaforma: 'win32', ambiente: AMBIENTE(exe), log: (r) => righe.push(r) })
    if (quando === 'prima') { lanciatore.scrivi({ avvio: 9, nipoti: true }); await giri() }
    t.mock.timers.tick(SOGLIA())
    if (quando === 'nel-tubo') lanciatore.scrivi({ avvio: 9, nipoti: true })
    await giri()
    t.mock.timers.tick(SOGLIA() * 3)
    await giri()
    assert.equal(ferme.length, 0, `${quando}: nessun «ferma»`)
    assert.equal(lanciatore.uccisi, 0)
    assert.equal(chiamate.length, 1, `${quando}: né taskkill né rilancio`)
    assert.notEqual(p.forseNonGirato, true)
    assert.equal(p.nipotiSeguiti, true)
  }
  assert.deepEqual(righe, [])
  // nemmeno dopo lo Stop, né dopo la fine del lanciatore: il guardiano è spento
  for (const come of ['stop', 'finito']) {
    const lanciatore = figlioFinto(310)
    const { spawnFn, chiamate, ferme } = spawnAFasi(exe, { lanciatore, diPrima: figlioFinto(410) })
    const p = lanciaComando('echo ciao', { shell: true }, { spawnFn, piattaforma: 'win32', ambiente: AMBIENTE(exe), log: () => {} })
    if (come === 'stop') { p.fermaAlbero(); ferme[0].emit('exit', 0) }
    lanciatore.chiudi(); lanciatore.chiudiCanale(); lanciatore.emit('exit', 57, null)
    await giri()
    const prima = [ferme.length, chiamate.length, lanciatore.uccisi]
    t.mock.timers.tick(SOGLIA() * 3)
    await giri()
    assert.deepEqual([ferme.length, chiamate.length, lanciatore.uccisi], prima, `${come}: alla soglia non succede più niente`)
  }
  // uscito il lanciatore ma col canale ancora aperto (le sue righe possono ancora arrivare): alla soglia non lo si tocca, il suo PID
  // può già essere di un altro
  const uscito = figlioFinto(320)
  const u = spawnAFasi(exe, { lanciatore: uscito, diPrima: figlioFinto(420) })
  lanciaComando('echo ciao', { shell: true }, { spawnFn: u.spawnFn, piattaforma: 'win32', ambiente: AMBIENTE(exe), log: () => {} })
  uscito.emit('exit', 57, null)
  t.mock.timers.tick(SOGLIA())
  await giri()
  assert.equal(uscito.uccisi, 0)
  assert.deepEqual(taskkillDi(u.chiamate), [])
  // un oggetto costruito a mano, senza un comando da far ripartire, non ha guardiano: chiudere il suo lanciatore non farebbe girare niente
  const lanci = []
  const aMano = figlioFinto(330)
  // eslint-disable-next-line no-new
  new ProcessoLanciato(aMano, { lanciatore: 'C:\\l.exe', spawnFn: (...a) => { lanci.push(a); return new EventEmitter() }, log: () => {} })
  t.mock.timers.tick(SOGLIA() * 2)
  await giri()
  assert.deepEqual(lanci, [])
  assert.equal(aMano.uccisi, 0)
  // la soglia delle prove: accorciata vale per i lanci dopo, rimessa con `null` torna quella di serie
  for (const [soglia, attesi] of [[50, 1], [null, 0]]) {
    L.sogliaAvvioPerProve(soglia)
    const l = figlioFinto(340)
    const s = spawnAFasi(exe, { lanciatore: l, diPrima: figlioFinto(440) })
    lanciaComando('echo ciao', { shell: true }, { spawnFn: s.spawnFn, piattaforma: 'win32', ambiente: AMBIENTE(exe), log: () => {} })
    t.mock.timers.tick(50)
    await giri()
    assert.equal(l.uccisi, attesi, `soglia ${soglia}`)
  }
})

test('LANC-U-17 — la gara alla soglia: il guardiano scatta mentre il lanciatore scrive «avvio»: chiuso il lanciatore si rilegge TUTTO il canale, e con «avvio» dentro il comando NON si rilancia (mai due volte); lo si dice', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  azzeraLanciatorePerProve()
  const exe = exeFinto(t)
  const righe = []
  // i momenti in cui «avvio» può arrivare dopo lo scatto (il lanciatore chiuso dalla sua maniglia, giro g4: nessun «ferma» per nome):
  // subito, insieme alla riga d'uscita della shell, e all'ULTIMO: già scritto nel canale quando il lanciatore esce, letto solo dopo
  for (const quando of ['subito', 'con-uscita', 'dopo-l-uscita-del-lanciatore']) {
    const lanciatore = figlioFinto(100)
    const { spawnFn, chiamate, ferme } = spawnAFasi(exe, { lanciatore, diPrima: figlioFinto(200) })
    const p = lanciaComando('git push', { shell: true }, { spawnFn, piattaforma: 'win32', ambiente: AMBIENTE(exe), log: (r) => righe.push(r) })
    const codici = []
    const dubbioAllUscita = []
    p.on('exit', (c, s) => { codici.push([c, s]); dubbioAllUscita.push(p.forseNonGirato === true) })
    t.mock.timers.tick(SOGLIA())
    await giri()
    assert.equal(lanciatore.uccisi, 1, quando)
    assert.equal(ferme.length, 0, quando)
    if (quando === 'subito') lanciatore.scrivi({ avvio: 77, nipoti: true })
    if (quando === 'con-uscita') { lanciatore.scrivi({ avvio: 77, nipoti: true }); lanciatore.scrivi({ uscita: 1, albero: 'vuoto' }) }
    await giri()
    if (quando === 'dopo-l-uscita-del-lanciatore') {
      lanciatore.emit('exit', 1, null)
      await giri()
      assert.equal(chiamate.some((c) => c[0] === 'git push'), false, 'uscito il lanciatore ma il canale è ancora aperto: non si decide')
      lanciatore.scrivi({ avvio: 77, nipoti: true })
      await giri()
      lanciatore.chiudi(); lanciatore.chiudiCanale()
    } else {
      lanciatore.chiudi(); lanciatore.chiudiCanale(); lanciatore.emit('exit', 1, null)
    }
    await giri()
    assert.equal(chiamate.some((c) => c[0] === 'git push'), false, `${quando}: «avvio» c è: il comando può essere partito, non si lancia una seconda volta`)
    assert.equal(codici.length, 1, `${quando}: il comando finisce, una volta`)
    assert.equal(p.forseNonGirato, true, `${quando}: l esito porta il dubbio (il nucleo lo dice alla conversazione)`)
    assert.deepEqual(dubbioAllUscita, [true], `${quando}: e lo porta già quando esce (chi legge l esito lo legge lì)`)
  }
  assert.equal(righe.length, 1, `un avviso solo: ${righe.join(' | ')}`)
  assert.match(righe[0], /^\[launcher\] .*\(incerto\)/u)
  assert.doesNotMatch(righe[0], /run as before/u, 'non è vero che il comando è girato come prima')
  // al contrario: scattato il guardiano la persona preme Stop, e «avvio» arriva dopo: l'ha fermato lei, nessun dubbio da dire
  const lanciatore = figlioFinto(110)
  const { spawnFn } = spawnAFasi(exe, { lanciatore, diPrima: figlioFinto(210) })
  const p = lanciaComando('git push', { shell: true }, { spawnFn, piattaforma: 'win32', ambiente: AMBIENTE(exe), log: (r) => righe.push(r) })
  t.mock.timers.tick(SOGLIA())
  await giri()
  p.fermaAlbero()
  lanciatore.scrivi({ avvio: 78, nipoti: true })
  await giri()
  lanciatore.chiudi(); lanciatore.chiudiCanale(); lanciatore.emit('exit', 1, null)
  await giri()
  assert.notEqual(p.forseNonGirato, true)
  assert.equal(righe.length, 1)
})

test('LANC-U-18 — Stop mentre «avvio» non è ancora arrivato: se non arriva nemmeno dopo l attesa breve, il lanciatore si chiude subito (non dopo 2 s) e il comando non riparte; se arriva, resta tutto com era', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const exe = exeFinto(t)
  const lanciatore = figlioFinto(100)
  const { spawnFn, chiamate, ferme } = spawnAFasi(exe, { lanciatore, diPrima: figlioFinto(200) })
  const p = lanciaComando('del /q *', { shell: true }, { spawnFn, piattaforma: 'win32', ambiente: AMBIENTE(exe), log: () => {} })
  assert.equal(p.fermaAlbero(), true)
  assert.equal(ferme.length, 1)
  ferme[0].emit('exit', 0) // il Job c è e risponde, ma il lanciatore è appeso: «avvio» non arriverà
  assert.ok(ALLO_STOP() < 2_000, 'l attesa breve è più corta del ripiego dei 2 s')
  t.mock.timers.tick(ALLO_STOP() - 1)
  assert.equal(lanciatore.uccisi, 0)
  t.mock.timers.tick(1)
  assert.equal(lanciatore.uccisi, 1, 'il lanciatore dalla sua maniglia, subito (la shell sospesa muore con lui)')
  assert.deepEqual(taskkillDi(chiamate), [], 'giro 3: mai taskkill sul lanciatore')
  // il lanciatore è ancora lì quando scade la soglia del guardiano: dopo uno Stop il guardiano non fa niente (non riparte nulla)
  t.mock.timers.tick(SOGLIA())
  await giri()
  assert.equal(ferme.length, 1, 'nessun altro «ferma» dal guardiano')
  lanciatore.chiudi(); lanciatore.chiudiCanale(); lanciatore.emit('exit', 1, null)
  await giri()
  assert.equal(chiamate.some((c) => c[0] === 'del /q *'), false, 'fermato prima di partire: non si rilancia')
  assert.notEqual(p.forseNonGirato, true, 'l ha fermato la persona: nessun dubbio da dire')
  t.mock.timers.tick(SOGLIA() * 3)
  await giri()
  assert.equal(ferme.length, 1, 'e il guardiano non fa altro')
  assert.equal(chiamate.some((c) => c[0] === 'del /q *'), false)
  // al contrario: «avvio» arriva nell'attesa breve ⇒ si ridà «Ferma» (come LANC-U-11) e l'attesa breve non fa niente
  const sano = figlioFinto(101)
  const altro = spawnAFasi(exe, { lanciatore: sano, diPrima: figlioFinto(201) })
  const q = lanciaComando('ping -n 30 127.0.0.1', { shell: true }, { spawnFn: altro.spawnFn, piattaforma: 'win32', ambiente: AMBIENTE(exe), log: () => {} })
  assert.equal(q.fermaAlbero(), true)
  altro.ferme[0].emit('exit', 0)
  sano.scrivi({ avvio: 55, nipoti: true })
  await giri()
  assert.equal(altro.ferme.length, 2, 'ridato all arrivo di «avvio»')
  altro.ferme[1].emit('exit', 0)
  t.mock.timers.tick(ALLO_STOP() + 10)
  assert.deepEqual(taskkillDi(altro.chiamate), [], '«avvio» è arrivato: il Job si chiude per nome, niente taskkill prima dei 2 s')
  assert.equal(sano.uccisi, 0, 'né la maniglia prima dei 2 s')
})

test('LANC-U-19 — «avvio» e poi il lanciatore muore senza dire l uscita: mai un rilancio, il codice che c è, l esito porta il dubbio, UN avviso che non dice «girato come prima», stato «non seguiti»; fermato dalla persona: nessun dubbio', async (t) => {
  azzeraLanciatorePerProve()
  const exe = exeFinto(t)
  const righe = []
  for (const giro of [1, 2]) {
    const lanciatore = figlioFinto(100)
    const { spawnFn, chiamate } = spawnAFasi(exe, { lanciatore, diPrima: figlioFinto(200) })
    const p = lanciaComando('git commit -m x', { shell: true }, { spawnFn, piattaforma: 'win32', ambiente: AMBIENTE(exe), log: (r) => righe.push(r) })
    const codici = []
    const dubbioAllUscita = []
    p.on('exit', (c) => { codici.push(c); dubbioAllUscita.push(p.forseNonGirato === true) })
    lanciatore.scrivi({ avvio: 77, nipoti: true })
    await prossimo()
    assert.notEqual(p.forseNonGirato, true, 'finché il lanciatore vive nessun dubbio')
    lanciatore.chiudi(); lanciatore.chiudiCanale(); lanciatore.emit('exit', 57, null)
    await presto()
    assert.equal(chiamate.length, 1, `giro ${giro}: mai un rilancio`)
    assert.deepEqual(codici, [57])
    assert.deepEqual(dubbioAllUscita, [true], 'il dubbio c è già quando il comando esce')
    assert.equal(p.nipotiSeguiti, false)
  }
  assert.equal(righe.length, 1, `un avviso solo per due comandi: ${righe.join(' | ')}`)
  assert.match(righe[0], /^\[launcher\] .*may not have run.*\(incerto\)/u)
  assert.doesNotMatch(righe[0], /run as before|did not run|has not run/u, 'né «come prima» né «non è girato»: non lo si sa')
  if (process.platform === 'win32') assert.deepEqual(statoVero(exe), { nipoti: false, motivo: 'incerto' }, 'la diagnostica non dice più «seguiti: sì»')
  // al contrario 1: uscita detta ⇒ nessun dubbio, e un lancio buono dopo rimette «seguiti»
  const buono = figlioFinto(300)
  const p = lanciaComando('echo ok', { shell: true }, { spawnFn: spawnAFasi(exe, { lanciatore: buono, diPrima: figlioFinto(400) }).spawnFn, piattaforma: 'win32', ambiente: AMBIENTE(exe), log: () => {} })
  buono.scrivi({ avvio: 78, nipoti: true }); buono.scrivi({ uscita: 0, albero: 'vuoto' })
  await prossimo()
  buono.chiudi(); buono.chiudiCanale(); buono.emit('exit', 0, null)
  await presto()
  assert.notEqual(p.forseNonGirato, true)
  assert.equal(p.nipotiSeguiti, true)
  if (process.platform === 'win32') assert.deepEqual(statoVero(exe), { nipoti: true, motivo: null })
  // al contrario 2: lo Stop della persona e poi il lanciatore muore ⇒ è stato fermato, non «forse non girato»
  const fermato = figlioFinto(500)
  const q = lanciaComando('ping -n 30 127.0.0.1', { shell: true }, { spawnFn: spawnAFasi(exe, { lanciatore: fermato, diPrima: figlioFinto(600) }).spawnFn, piattaforma: 'win32', ambiente: AMBIENTE(exe), log: (r) => righe.push(r) })
  fermato.scrivi({ avvio: 79, nipoti: true })
  await prossimo()
  q.fermaAlbero()
  fermato.chiudi(); fermato.chiudiCanale(); fermato.emit('exit', 1, null)
  await presto()
  assert.notEqual(q.forseNonGirato, true)
  assert.equal(righe.length, 1, 'e nessun avviso in più')
  // al contrario 3: SENZA «avvio» il comando non è mai partito, e si sa: nessun dubbio nemmeno dove non c'è un comando da far ripartire
  const muto = figlioFinto(700)
  const aMano = new ProcessoLanciato(muto, { lanciatore: exe, spawnFn: () => new EventEmitter(), log: (r) => righe.push(r) })
  const usciteAMano = []
  aMano.on('exit', (c) => usciteAMano.push(c))
  muto.chiudi(); muto.chiudiCanale(); muto.emit('exit', 1, null)
  await presto()
  assert.deepEqual(usciteAMano, [1])
  assert.equal(aMano.forseNonGirato, false)
  assert.equal(righe.length, 1)
})

test('LANC-U-20 — allo Stop nessun exe si esegue più (giro g4): né quello verificato, né uno sostituito o sparito dopo il lancio; «ferma» va al lanciatore già partito, il solo che tiene il Job', async (t) => {
  azzeraLanciatorePerProve()
  // l'exe sostituito dopo il lancio, sparito, o diverso da quello lanciato: lo Stop non lo esegue (prima del giro g4 lo si ricontrollava
  // prima di rilanciarlo con `--ferma`; ora non si rilancia proprio) e il gruppo si chiude lo stesso, dal lanciatore che gira
  for (const come of ['sostituito', 'sparito', 'un altro']) {
    const exe = exeFinto(t)
    const ambiente = AMBIENTE(exe)
    const lanciatore = figlioFinto(800)
    const { spawnFn, chiamate, ferme } = spawnAFasi(exe, { lanciatore, diPrima: figlioFinto(900) })
    const q = lanciaComando('ping -n 30 127.0.0.1', { shell: true }, { spawnFn, piattaforma: 'win32', ambiente, log: () => {} })
    lanciatore.scrivi({ avvio: 3, nipoti: true })
    await prossimo()
    if (come === 'sostituito') writeFileSync(exe, 'sostituito a comando in corso')
    if (come === 'sparito') rmSync(exe)
    if (come === 'un altro') ambiente.TALOS_LANCIATORE = exeFinto(t)
    assert.equal(q.fermaAlbero(), true)
    await prossimo()
    assert.equal(chiamate.length, 1, `${come}: solo il lancio del comando, nessun exe eseguito per fermare`)
    assert.equal(ferme.length, 1, `${come}: «ferma» al lanciatore`)
    ferme[0].emit('exit', 0)
    assert.equal(lanciatore.uccisi, 0, `${come}: gruppo chiuso, il lanciatore esce da solo`)
    assert.deepEqual(taskkillDi(chiamate), [])
  }
  // il guardiano: nemmeno lui esegue l'exe, chiude subito il lanciatore appeso dalla sua maniglia
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const exe4 = exeFinto(t)
  const quarto = figlioFinto(820)
  const s4 = spawnAFasi(exe4, { lanciatore: quarto, diPrima: figlioFinto(920) })
  lanciaComando('echo ciao', { shell: true }, { spawnFn: s4.spawnFn, piattaforma: 'win32', ambiente: AMBIENTE(exe4), log: () => {} })
  rmSync(exe4)
  t.mock.timers.tick(SOGLIA())
  await giri()
  assert.equal(s4.ferme.length, 0)
  assert.deepEqual(taskkillDi(s4.chiamate), [])
  assert.equal(quarto.uccisi, 1, 'subito, dalla sua maniglia')
})

test('LANC-U-21 — il comando ripartito senza lanciatore prende anche l ingresso: `stdin` e `stdio[0]` sono i suoi (mutante R8 del revisore C)', async (t) => {
  azzeraLanciatorePerProve()
  const exe = exeFinto(t)
  const lanciatore = figlioFinto(100)
  const diPrima = figlioFinto(200)
  const { spawnFn } = spawnAFasi(exe, { lanciatore, diPrima })
  const p = lanciaComando('sort', { shell: true }, { spawnFn, piattaforma: 'win32', ambiente: AMBIENTE(exe), log: () => {} })
  assert.equal(p.stdin, lanciatore.stdin, 'prima: l ingresso del lanciatore')
  lanciatore.chiudi(); lanciatore.chiudiCanale(); lanciatore.emit('exit', 57, null)
  await presto()
  assert.equal(p.stdin, diPrima.stdin, 'dopo: quello del comando vero, altrimenti chi scrive al comando scrive a un processo morto')
  assert.equal(p.stdio[0], diPrima.stdin)
  let letto = ''
  diPrima.stdin.on('data', (d) => { letto += d })
  p.stdin.write('riga\n')
  await prossimo()
  assert.equal(letto, 'riga\n')
})

test('LANC-U-22 — se nemmeno il comando di prima parte (nessun PID) non si dà la colpa al lanciatore: nessun avviso «morto», stato intatto, PID non toccato (mutante R16 del revisore C)', async (t) => {
  azzeraLanciatorePerProve()
  const exe = exeFinto(t)
  const righe = []
  const lanciatore = figlioFinto(100)
  const senzaPid = figlioFinto(undefined)
  senzaPid.pid = undefined
  const { spawnFn } = spawnAFasi(exe, { lanciatore, diPrima: senzaPid })
  const p = lanciaComando('echo x', { shell: true, cwd: 'C:\\sparita-nel-frattempo' }, { spawnFn, piattaforma: 'win32', ambiente: AMBIENTE(exe), log: (r) => righe.push(r) })
  const errori = []
  p.on('error', (e) => errori.push(e.code))
  lanciatore.chiudi(); lanciatore.chiudiCanale(); lanciatore.emit('exit', 57, null)
  await presto()
  assert.deepEqual(righe, [], 'nessun avviso: non è partito nemmeno il comando di prima')
  assert.equal(p.pid, 100, 'nessun PID nuovo da annunciare')
  if (process.platform === 'win32') assert.deepEqual(statoVero(exe), { nipoti: true, motivo: null }, 'lo stato non diventa «morto»')
  senzaPid.emit('error', Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }))
  assert.deepEqual(errori, ['ENOENT'], 'l errore del comando arriva a chi lo aspetta')
})

/*
 * ⛔ Giro piccolo dopo il controllore (12/11/2026). Nata ROSSA sulla testa `3d504a5da`: nella gara del controllore con l'exe vero, 1 dei 30
 *   `taskkill /PID <lanciatore> /T /F` è partito su un lanciatore GIÀ uscito (giro 13, scarto -8 ms): `chiudiIlLanciatore()` non guardava
 *   niente, e nemmeno il ripiego di «Ferma» e quello dei 2 s guardavano l'uscita (solo l'albero). Windows riusa il PID quando il processo è
 *   finito e la sua ultima maniglia è chiusa (documentazione di PROCESS_INFORMATION; libuv la chiude dopo l'uscita, `src/win/process.c:884`):
 *   il colpo /T /F cadrebbe su un albero estraneo. Si guarda la stessa cosa del ramo `diPrima`: l'uscita vista E `exitCode`/`signalCode`.
 *   DeepSeek fa lo stesso prima del suo taskkill (`packages/subprocess/subprocess-local/src/spawn.ts:220`).
 */
test('LANC-U-23 — un lanciatore già uscito non riceve mai taskkill: né dal guardiano, né dal ripiego di «Ferma», né da quello dei 2 s, né dall attesa breve dello Stop; vivo, sì', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  azzeraLanciatorePerProve()
  const exe = exeFinto(t)
  // come se ne è andato: uscita vista dal nucleo (canale ancora aperto, come nella gara), oppure solo `exitCode`/`signalCode` già scritti
  const uscite = {
    'uscita vista': (l) => l.emit('exit', 1, null),
    exitCode: (l) => { l.exitCode = 1 },
    signalCode: (l) => { l.signalCode = 'SIGKILL' },
  }
  for (const [come, esce] of Object.entries(uscite)) {
    // il guardiano: il lanciatore esce proprio mentre scade la soglia (giro g4: il guardiano va diritto a `chiudiIlLanciatore()`)
    const a = figlioFinto(100)
    const sa = spawnAFasi(exe, { lanciatore: a, diPrima: figlioFinto(200) })
    lanciaComando('echo ciao', { shell: true }, { spawnFn: sa.spawnFn, piattaforma: 'win32', ambiente: AMBIENTE(exe), log: () => {} })
    t.mock.timers.tick(SOGLIA())
    esce(a)
    await giri()
    t.mock.timers.tick(CHIUSURA() * 2)
    await giri()
    assert.deepEqual(taskkillDi(sa.chiamate), [], `${come}: guardiano, nessun taskkill sul PID di un lanciatore uscito`)
    assert.equal(a.uccisi, 0, `${come}: né dalla sua maniglia`)
    // lo Stop: «ferma» risponde male a lanciatore già uscito (ripiego di «Ferma»), poi i 2 s, poi l'attesa breve
    const b = figlioFinto(110)
    const sb = spawnAFasi(exe, { lanciatore: b, diPrima: figlioFinto(210) })
    const q = lanciaComando('echo ciao', { shell: true }, { spawnFn: sb.spawnFn, piattaforma: 'win32', ambiente: AMBIENTE(exe), log: () => {} })
    b.scrivi({ avvio: 9, nipoti: true })
    await giri()
    assert.equal(q.fermaAlbero(), true)
    esce(b)
    sb.ferme[0].emit('exit', 3)
    t.mock.timers.tick(5_000)
    await giri()
    assert.deepEqual(taskkillDi(sb.chiamate), [], `${come}: Stop, nessun taskkill sul PID di un lanciatore uscito`)
    // Stop prima di «avvio», il lanciatore esce nell'attesa breve
    const c = figlioFinto(120)
    const sc = spawnAFasi(exe, { lanciatore: c, diPrima: figlioFinto(220) })
    const r = lanciaComando('echo ciao', { shell: true }, { spawnFn: sc.spawnFn, piattaforma: 'win32', ambiente: AMBIENTE(exe), log: () => {} })
    assert.equal(r.fermaAlbero(), true)
    sc.ferme[0].emit('exit', 0)
    esce(c)
    t.mock.timers.tick(ALLO_STOP() + 5_000)
    await giri()
    assert.deepEqual(taskkillDi(sc.chiamate), [], `${come}: Stop prima di «avvio», nessun taskkill sul PID di un lanciatore uscito`)
  }
  // al contrario: un lanciatore ancora vivo si chiude, una volta, per tutte e tre le vie: giro 3, dalla sua maniglia, mai per PID
  const vivo = figlioFinto(130)
  const sv = spawnAFasi(exe, { lanciatore: vivo, diPrima: figlioFinto(230) })
  lanciaComando('echo ciao', { shell: true }, { spawnFn: sv.spawnFn, piattaforma: 'win32', ambiente: AMBIENTE(exe), log: () => {} })
  t.mock.timers.tick(SOGLIA())
  await giri()
  assert.equal(vivo.uccisi, 1, 'guardiano, lanciatore vivo: dalla maniglia')
  assert.deepEqual(taskkillDi(sv.chiamate), [])
  const vivo2 = figlioFinto(140)
  const sw = spawnAFasi(exe, { lanciatore: vivo2, diPrima: figlioFinto(240) })
  const w = lanciaComando('echo ciao', { shell: true }, { spawnFn: sw.spawnFn, piattaforma: 'win32', ambiente: AMBIENTE(exe), log: () => {} })
  vivo2.scrivi({ avvio: 9, nipoti: true })
  await giri()
  w.fermaAlbero()
  sw.ferme[0].emit('exit', 3)
  assert.equal(vivo2.uccisi, 1, 'Stop, «ferma» non riesce, lanciatore vivo: dalla maniglia')
  t.mock.timers.tick(2_000)
  assert.equal(vivo2.uccisi, 1, 'e i 2 s senza albero vuoto: non di nuovo (il gruppo non chiuso si è già detto)')
  assert.deepEqual(taskkillDi(sw.chiamate), [])
  const vivo3 = figlioFinto(150)
  const sx = spawnAFasi(exe, { lanciatore: vivo3, diPrima: figlioFinto(250) })
  const x = lanciaComando('echo ciao', { shell: true }, { spawnFn: sx.spawnFn, piattaforma: 'win32', ambiente: AMBIENTE(exe), log: () => {} })
  x.fermaAlbero()
  sx.ferme[0].emit('exit', 0)
  t.mock.timers.tick(ALLO_STOP())
  assert.equal(vivo3.uccisi, 1, 'Stop prima di «avvio», lanciatore vivo e muto: dalla maniglia')
  assert.deepEqual(taskkillDi(sx.chiamate), [])
})

/*
 * ⛔ Giro piccolo dopo il controllore (12/11/2026): il ritorno di `muore_con_me(j, true)` (`main.rs`) era ignorato. Se Windows rifiuta
 *   l'appoggio del Job, un lanciatore ucciso fra la creazione della shell sospesa e la sua ripartenza la lascia sospesa (15 su 160 prima
 *   della cura del punto 1): non si fa finta che ci sia. L'exe lo dice nella riga «avvio» (`"appoggio":false`), il nucleo lo dice UNA
 *   volta nel log e nella diagnostica; i nipoti restano seguiti (il Job c'è). Codex non ignora lo stesso ritorno
 *   (`codex-rs/utils/pty/src/win/job.rs:136-138`), Hermes nemmeno (`hermes_cli/local_runtime/processes.py:69-71`).
 */
test('LANC-U-24 — «avvio» con l appoggio rifiutato: UN avviso, la diagnostica lo dice, i nipoti restano seguiti; un lancio dopo con l appoggio lo toglie; senza il campo niente', async (t) => {
  azzeraLanciatorePerProve()
  const exe = exeFinto(t)
  const righe = []
  const lancia = (riga) => {
    const l = figlioFinto(100)
    const s = spawnAFasi(exe, { lanciatore: l, diPrima: figlioFinto(200) })
    const p = lanciaComando('echo ciao', { shell: true }, { spawnFn: s.spawnFn, piattaforma: 'win32', ambiente: AMBIENTE(exe), log: (r) => righe.push(r) })
    l.scrivi(riga)
    return p
  }
  const a = lancia({ avvio: 9, nipoti: true, appoggio: false })
  await giri()
  assert.equal(a.nipotiSeguiti, true, 'il Job c è: i nipoti sono seguiti')
  assert.equal(righe.length, 1, `un avviso: ${righe.join(' | ')}`)
  assert.match(righe[0], /^\[launcher\] .*\(appoggio\)$/u)
  assert.doesNotMatch(righe[0], /run as before|not followed/u, 'non è un ripiego: i comandi sono seguiti')
  if (process.platform === 'win32') assert.deepEqual(statoVero(exe), { nipoti: true, motivo: null, appoggio: false })
  lancia({ avvio: 9, nipoti: true, appoggio: false })
  await giri()
  assert.equal(righe.length, 1, 'una volta sola')
  // un lancio dopo con l appoggio (nessun campo, come l exe di prima): la diagnostica torna quella di prima
  lancia({ avvio: 9, nipoti: true })
  await giri()
  if (process.platform === 'win32') assert.deepEqual(statoVero(exe), { nipoti: true, motivo: null })
  // e un campo storto non vale «rifiutato»
  for (const storto of [true, 'false', 0, null]) {
    lancia({ avvio: 9, nipoti: true, appoggio: storto })
    await giri()
    if (process.platform === 'win32') assert.deepEqual(statoVero(exe), { nipoti: true, motivo: null }, String(storto))
  }
  assert.equal(righe.length, 1)
  // «Job rifiutato» vince: lì non c è un appoggio da dire
  azzeraLanciatorePerProve()
  righe.length = 0
  lancia({ avvio: 9, nipoti: false, motivo: 'job 5', appoggio: false })
  await giri()
  if (process.platform === 'win32') assert.deepEqual(statoVero(exe), { nipoti: false, motivo: 'job' })
  // (mutanti A1 e A6 del giro piccolo) nemmeno nel log: lì l'avviso è quello del Job, non quello dell'appoggio
  assert.equal(righe.filter((r) => /\(appoggio\)/u.test(r)).length, 0, `nessun avviso d appoggio col Job rifiutato: ${righe.join(' | ')}`)
  // e un lancio dopo che non segue i nipoti (il lanciatore muore prima di «avvio») non porta l'appoggio rifiutato di un lancio di prima
  azzeraLanciatorePerProve()
  lancia({ avvio: 9, nipoti: true, appoggio: false })
  await giri()
  const morto = figlioFinto(100)
  const sm = spawnAFasi(exe, { lanciatore: morto, diPrima: figlioFinto(200) })
  lanciaComando('echo ciao', { shell: true }, { spawnFn: sm.spawnFn, piattaforma: 'win32', ambiente: AMBIENTE(exe), log: () => {} })
  morto.chiudi(); morto.chiudiCanale(); morto.emit('exit', 57, null)
  await giri()
  if (process.platform === 'win32') assert.deepEqual(statoVero(exe), { nipoti: false, motivo: 'morto' }, 'coi nipoti non seguiti l appoggio non si dice')
})

/*
 * ⛔ Giro 3 del lanciatore (13/11/2026, giudice v1724 strada b e v1733 a): il lanciatore si chiude per MANIGLIA, mai per PID. Nata ROSSA
 *   sulla testa `64f3269aa`: nella gara del guardiano 45 dei 56 `taskkill /PID <lanciatore> /T /F` rispondevano 128 «processo non trovato»
 *   (il PID era già libero quando taskkill lo apriva, 70-100 ms dopo), e 44 erano decisi a lanciatore ANCORA VIVO: nessun controllo
 *   dell'uscita può vederli. `figlio.kill()` passa dalla maniglia che Node tiene del processo (libuv `uv_process_kill` → `uv__kill` →
 *   `TerminateProcess(process_handle)`, `src/win/process.c:1371` e `:1304`): finché Node la tiene il PID non si ridà, e quando l'ha
 *   chiusa `kill` non fa niente. Il gruppo si chiude con `TerminateJobObject` sul Job (per nome, dal lanciatore in modo `--ferma`).
 *   Codex fa lo stesso: colpisce solo per maniglia (`codex-rs/utils/pty/src/win/job.rs:114`) e solo i membri confermati del Job (`:314`).
 *   Il lanciatore si chiude solo DOPO che «ferma» è riuscito (il gruppo è chiuso), oppure prima di «avvio» (niente è partito, e l'appoggio
 *   del Job chiude la shell sospesa con lui). Se il gruppo non si chiude (riga «avvio» senza Job, exe cambiato, «ferma» che non riesce)
 *   il lanciatore si chiude lo stesso dalla sua maniglia e il log dice, una volta, che lo Stop non ha raggiunto i programmi del comando.
 */
test('LANC-U-25 — il lanciatore non riceve MAI un colpo per PID: per nessuna via un taskkill sul suo PID; si chiude dalla sua maniglia solo dopo il gruppo chiuso o prima di «avvio»; senza Job «ferma» chiude solo la shell; lo Stop che non raggiunge il gruppo si dice', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  azzeraLanciatorePerProve()
  const exe = exeFinto(t)
  const righe = []
  const log = (r) => righe.push(r)
  const nessunColpoPerPid = (s, chi) => assert.deepEqual(taskkillDi(s.chiamate), [], `${chi}: nessun taskkill sul lanciatore`)
  // 1. il guardiano (giro g4): prima di «avvio» niente è partito ⇒ il lanciatore dalla sua maniglia, alla soglia e non prima, una volta
  const a = figlioFinto(100)
  const sa = spawnAFasi(exe, { lanciatore: a, diPrima: figlioFinto(200) })
  lanciaComando('echo ciao', { shell: true }, { spawnFn: sa.spawnFn, piattaforma: 'win32', ambiente: AMBIENTE(exe), log })
  t.mock.timers.tick(SOGLIA() - 1)
  await giri()
  assert.equal(a.uccisi, 0, 'guardiano: prima della soglia il lanciatore non si tocca')
  t.mock.timers.tick(1)
  await giri()
  assert.equal(a.uccisi, 1, 'guardiano: dalla sua maniglia (prima di «avvio»: niente è partito)')
  t.mock.timers.tick(SOGLIA() * 3)
  await giri()
  assert.equal(a.uccisi, 1, 'guardiano: una volta')
  nessunColpoPerPid(sa, 'guardiano')
  // 2. lo Stop dopo «avvio»: «ferma» riesce ⇒ niente maniglia finché l'albero può ancora svuotarsi; ai 2 s senza albero vuoto, sì
  const b = figlioFinto(110)
  const sb = spawnAFasi(exe, { lanciatore: b, diPrima: figlioFinto(210) })
  const q = lanciaComando('ping -n 30 127.0.0.1', { shell: true }, { spawnFn: sb.spawnFn, piattaforma: 'win32', ambiente: AMBIENTE(exe), log })
  b.scrivi({ avvio: 9, nipoti: true })
  await giri()
  assert.equal(q.fermaAlbero(), true)
  assert.equal(b.uccisi, 0, 'prima il gruppo: il Job lo chiude il lanciatore, che deve essere vivo')
  sb.ferme[0].emit('exit', 0)
  t.mock.timers.tick(1_999)
  assert.equal(b.uccisi, 0, 'il gruppo è chiuso: il lanciatore esce da solo, gli si dà il tempo')
  t.mock.timers.tick(1)
  assert.equal(b.uccisi, 1, 'ai 2 s senza albero vuoto: dalla sua maniglia')
  nessunColpoPerPid(sb, 'Stop, ferma riuscito')
  // 2b. al contrario: l'albero si svuota ⇒ la maniglia non serve mai
  const c = figlioFinto(111)
  const sc = spawnAFasi(exe, { lanciatore: c, diPrima: figlioFinto(211) })
  const r = lanciaComando('ping -n 30 127.0.0.1', { shell: true }, { spawnFn: sc.spawnFn, piattaforma: 'win32', ambiente: AMBIENTE(exe), log })
  c.scrivi({ avvio: 9, nipoti: true })
  await giri()
  r.fermaAlbero()
  sc.ferme[0].emit('exit', 0)
  c.scrivi({ uscita: 1, albero: 'vuoto' })
  await giri()
  t.mock.timers.tick(5_000)
  assert.equal(c.uccisi, 0)
  nessunColpoPerPid(sc, 'Stop, albero vuoto')
  assert.equal(righe.length, 0, `fin qui ogni Stop ha chiuso il gruppo: nessun avviso (${righe.join(' | ')})`)
  // 3. «ferma» risponde false, o non si può scrivere (entrata chiusa) ⇒ il lanciatore dalla sua maniglia, e si dice
  for (const come of ['risposta false', 'entrata chiusa']) {
    azzeraLanciatorePerProve()
    righe.length = 0
    const d = figlioFinto(120)
    const chiamate = []
    const spawnFn = (...x) => { chiamate.push(x); return new EventEmitter() }
    const p = new ProcessoLanciato(d, { lanciatore: exe, spawnFn, log })
    d.scrivi({ avvio: 9, nipoti: true })
    await giri()
    if (come === 'entrata chiusa') d.stdio[4].destroy()
    p.fermaAlbero()
    if (come === 'risposta false') d.ferme[0].emit('exit', 3)
    assert.equal(d.ferme.length, come === 'entrata chiusa' ? 0 : 1, come)
    assert.equal(d.uccisi, 1, `${come}: il lanciatore dalla sua maniglia, una volta`)
    t.mock.timers.tick(5_000)
    assert.equal(d.uccisi, 1, `${come}: una volta sola, anche ai 2 s`)
    assert.deepEqual(chiamate, [], `${come}: nessun processo lanciato, nessun taskkill`)
    assert.equal(righe.filter((x) => /\(fermo\)$/u.test(x)).length, 1, `${come}: lo Stop che non ha chiuso il gruppo si dice (${righe.join(' | ')})`)
  }
  // 4. la riga «avvio» dice che il Job non c'è (Windows l'ha rifiutato): «ferma» al lanciatore lo stesso (chiude la shell dalla sua
  //    maniglia), nessun nome; i figli della shell possono restare, e si dice
  azzeraLanciatorePerProve()
  righe.length = 0
  const e = figlioFinto(130)
  const se = spawnAFasi(exe, { lanciatore: e, diPrima: figlioFinto(230) })
  const s = lanciaComando('ping -n 30 127.0.0.1', { shell: true }, { spawnFn: se.spawnFn, piattaforma: 'win32', ambiente: AMBIENTE(exe), log })
  e.scrivi({ avvio: 9, nipoti: false, motivo: 'job 5' })
  await giri()
  assert.equal(s.fermaAlbero(), true)
  assert.equal(se.ferme.length, 1, 'senza Job: «ferma» al lanciatore, che chiude la shell')
  se.ferme[0].emit('exit', 0)
  assert.equal(e.uccisi, 1, 'il lanciatore dalla sua maniglia')
  nessunColpoPerPid(se, 'senza Job')
  assert.equal(se.chiamate.length, 1, 'solo il lancio del comando')
  assert.equal(righe.filter((x) => /\(fermo\)$/u.test(x)).length, 1, `senza Job i figli della shell possono restare, e si dice (${righe.join(' | ')})`)
  // 5. lo Stop prima di «avvio», lanciatore muto: dopo l'attesa breve dalla sua maniglia, mai per PID
  const f = figlioFinto(140)
  const sf = spawnAFasi(exe, { lanciatore: f, diPrima: figlioFinto(240) })
  const u = lanciaComando('echo ciao', { shell: true }, { spawnFn: sf.spawnFn, piattaforma: 'win32', ambiente: AMBIENTE(exe), log })
  u.fermaAlbero()
  t.mock.timers.tick(ALLO_STOP() - 1)
  assert.equal(f.uccisi, 0)
  t.mock.timers.tick(1)
  assert.equal(f.uccisi, 1)
  t.mock.timers.tick(5_000)
  nessunColpoPerPid(sf, 'Stop prima di «avvio»')
  // 6. nel sorgente del modulo nessun colpo per PID sul lanciatore e nessun exe rilanciato per nome (giro g4)
  const sorgente = readFileSync(new URL('../src/kernel/lanciatore-windows.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(sorgente, /this\.boia\(this\.figlio\.pid/u, 'mai taskkill sul PID del lanciatore')
  assert.equal(sorgente.split('this.boia(').length - 1, 1, 'un solo taskkill: quello del comando ripartito senza lanciatore')
  assert.doesNotMatch(sorgente, /argv0: `[^`]*--ferma/u, 'giro g4: nessun exe rilanciato con --ferma')
  assert.doesNotMatch(sorgente, /talos-lanciatore-\$\{randomUUID/u, 'giro g4: nessun nome di Job')
})

/*
 * ⛔ Giro 3 del lanciatore (13/11/2026, punto 3 del brief): il ritorno di `muore_con_me(j, false)` non si ignora più (come quello di
 *   `muore_con_me(j, true)`; Codex `codex-rs/utils/pty/src/win/job.rs:136`; Hermes `hermes_cli/local_runtime/processes.py:69`). Se
 *   Windows rifiuta di togliere l'appoggio, il Job resta «muore con me» per tutta la sua vita: chiuso il lanciatore (TALOS aggiornato o
 *   chiuso), si chiudono anche i programmi lasciati in sottofondo. L'exe lo dice con la riga `{"sgancio":false}`, il nucleo una volta
 *   nel log e nella diagnostica, finché un lancio dopo non lo ritoglie.
 */
test('LANC-U-26 — «sgancio» rifiutato: UN avviso, la diagnostica lo dice coi nipoti seguiti; un «avvio» dopo senza la riga lo toglie; nessun altro valore conta', async (t) => {
  azzeraLanciatorePerProve()
  const exe = exeFinto(t)
  const righe = []
  const lancia = (...messaggi) => {
    const f = figlioFinto(9)
    const p = new ProcessoLanciato(f, { lanciatore: exe, log: (r) => righe.push(r) })
    for (const m of messaggi) f.scrivi(m)
    return p
  }
  lancia({ avvio: 9, nipoti: true }, { sgancio: false })
  await presto()
  assert.equal(righe.length, 1, righe.join(' | '))
  assert.match(righe[0], /^\[launcher\] .*\(sgancio\)$/u)
  if (process.platform === 'win32') assert.deepEqual(statoVero(exe), { nipoti: true, motivo: null, sgancio: false })
  lancia({ avvio: 9, nipoti: true }, { sgancio: false })
  await presto()
  assert.equal(righe.length, 1, 'una volta sola')
  // un lancio dopo senza la riga: la diagnostica torna quella di prima
  lancia({ avvio: 9, nipoti: true })
  await presto()
  if (process.platform === 'win32') assert.deepEqual(statoVero(exe), { nipoti: true, motivo: null })
  // AL CONTRARIO: un valore che non è esattamente `false` non conta
  for (const storto of [true, 'no', 0, null]) {
    lancia({ avvio: 9, nipoti: true }, { sgancio: storto })
    await presto()
    if (process.platform === 'win32') assert.deepEqual(statoVero(exe), { nipoti: true, motivo: null }, String(storto))
  }
  // e coi nipoti non seguiti non c'è un Job da tenere legato
  lancia({ avvio: 9, nipoti: false, motivo: 'job 5' }, { sgancio: false })
  await presto()
  if (process.platform === 'win32') assert.deepEqual(statoVero(exe), { nipoti: false, motivo: 'job' })
})

/*
 * Giro 3 del lanciatore (13/11/2026): seconde prove. Uccidono i quattro mutanti rimasti vivi al primo giro (J8: il ripiego dei 2 s senza
 *   il ramo «gruppo non chiuso»; J9: «chiuso» non ritolto quando «ferma» si ridà all'arrivo di «avvio»; J11: «sgancio» detto anche
 *   senza Job; J15: «fermo» detto più di una volta) e danno una seconda prova a ogni riga uccisa da una prova sola (J1, J2, J4, J10, J12,
 *   J13, J14, J17).
 */
test('LANC-U-27 — il colpo per maniglia, seconde prove: «ferma» ridato e muto ai 2 s, «fermo» una volta, senza Job per un Job rifiutato, lanciatore uscito, «sgancio» esatto e una volta', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  azzeraLanciatorePerProve()
  const exe = exeFinto(t)
  const righe = []
  const log = (r) => righe.push(r)
  const fermi = () => righe.filter((x) => /\(fermo\)$/u.test(x)).length
  // a. Stop prima di «avvio»: il primo «ferma» trova il Job vuoto e risponde 0; all'arrivo di «avvio» si ridà e resta muto: ai 2 s il
  //    gruppo NON è chiuso (quel primo 0 non valeva per la shell di ora) ⇒ dalla maniglia, e lo si dice
  const a = figlioFinto(160)
  const sa = spawnAFasi(exe, { lanciatore: a, diPrima: figlioFinto(260) })
  const pa = lanciaComando('ping -n 30 127.0.0.1', { shell: true }, { spawnFn: sa.spawnFn, piattaforma: 'win32', ambiente: AMBIENTE(exe), log })
  pa.fermaAlbero()
  sa.ferme[0].emit('exit', 0)
  a.scrivi({ avvio: 9, nipoti: true })
  await giri()
  assert.equal(sa.ferme.length, 2, 'premessa: «ferma» ridato all arrivo di «avvio»')
  t.mock.timers.tick(1_999)
  assert.equal(a.uccisi, 0)
  t.mock.timers.tick(1)
  assert.equal(a.uccisi, 1, 'ai 2 s, «ferma» ancora muto: dalla maniglia')
  assert.equal(fermi(), 1, `il gruppo non chiuso si dice (${righe.join(' | ')})`)
  assert.deepEqual(taskkillDi(sa.chiamate), [])
  // b. un secondo Stop che non chiude il gruppo, su un altro comando: dalla maniglia anche lui, ma l'avviso resta UNO
  const b = figlioFinto(161)
  const sb = spawnAFasi(exe, { lanciatore: b, diPrima: figlioFinto(261) })
  const pb = lanciaComando('ping -n 30 127.0.0.1', { shell: true }, { spawnFn: sb.spawnFn, piattaforma: 'win32', ambiente: AMBIENTE(exe), log })
  b.scrivi({ avvio: 9, nipoti: true })
  await giri()
  pb.fermaAlbero()
  sb.ferme[0].emit('exit', 3)
  assert.equal(b.uccisi, 1)
  assert.equal(fermi(), 1, 'una riga sola per due Stop')
  // c. Job rifiutato da Windows («avvio» con nipoti:false): giro g4, «ferma» al lanciatore (chiude la shell), mai per nome; poi dalla maniglia
  const c = figlioFinto(162)
  const sc = spawnAFasi(exe, { lanciatore: c, diPrima: figlioFinto(262) })
  const pc = lanciaComando('ping -n 30 127.0.0.1', { shell: true }, { spawnFn: sc.spawnFn, piattaforma: 'win32', ambiente: AMBIENTE(exe), log })
  c.scrivi({ avvio: 9, nipoti: false, motivo: 'job 5' })
  await giri()
  assert.equal(pc.kill(), true, 'anche dal tempo scaduto (kill), non solo dallo Stop')
  assert.equal(sc.ferme.length, 1)
  assert.equal(sc.chiamate.length, 1, 'nessun processo lanciato per fermare')
  sc.ferme[0].emit('exit', 0)
  assert.equal(c.uccisi, 1)
  // d. il lanciatore è già uscito (exitCode scritto) e «ferma» non riesce: la sua maniglia non si tocca, nessun taskkill
  const d = figlioFinto(163)
  const sd = spawnAFasi(exe, { lanciatore: d, diPrima: figlioFinto(263) })
  const pd = lanciaComando('ping -n 30 127.0.0.1', { shell: true }, { spawnFn: sd.spawnFn, piattaforma: 'win32', ambiente: AMBIENTE(exe), log })
  d.scrivi({ avvio: 9, nipoti: true })
  await giri()
  pd.fermaAlbero()
  d.exitCode = 1
  sd.ferme[0].emit('exit', 3)
  t.mock.timers.tick(5_000)
  assert.equal(d.uccisi, 0, 'uscito: niente da chiudere')
  assert.deepEqual(taskkillDi(sd.chiamate), [])
  // e. «sgancio»: solo il valore esatto `false`, solo col Job, una riga sola, e un «avvio» dopo lo ritoglie
  azzeraLanciatorePerProve()
  righe.length = 0
  const sganci = () => righe.filter((x) => /\(sgancio\)$/u.test(x)).length
  const lancia = (...messaggi) => { const f = figlioFinto(9); const p = new ProcessoLanciato(f, { lanciatore: exe, log }); for (const m of messaggi) f.scrivi(m); return p }
  lancia({ avvio: 9, nipoti: true }, { sgancio: 0 })
  await giri()
  assert.equal(sganci(), 0, '0 non è false')
  lancia({ avvio: 9, nipoti: false, motivo: 'job 5' }, { sgancio: false })
  await giri()
  assert.equal(sganci(), 0, 'senza Job non c è niente di legato da dire')
  lancia({ avvio: 9, nipoti: true }, { sgancio: false })
  await giri()
  assert.equal(sganci(), 1)
  if (process.platform === 'win32') assert.deepEqual(statoVero(exe), { nipoti: true, motivo: null, sgancio: false })
  lancia({ avvio: 9, nipoti: true }, { sgancio: false })
  await giri()
  assert.equal(sganci(), 1, 'una volta sola')
  lancia({ avvio: 9, nipoti: true })
  await giri()
  if (process.platform === 'win32') assert.deepEqual(statoVero(exe), { nipoti: true, motivo: null }, 'un «avvio» dopo senza la riga lo ritoglie')
})

/*
 * Giro 3 del lanciatore (13/11/2026): la seconda prova per J8, J9, J11 e J15, per un'altra strada (il tempo scaduto al posto dello Stop,
 *   «ferma» che non parte al posto di «ferma» che risponde 3, «sgancio» dopo un «avvio» senza Job dal nucleo).
 */
test('LANC-U-28 — il colpo per maniglia, seconde strade: tempo scaduto con «ferma» muto, «ferma» che non parte due volte, «sgancio» senza Job', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  azzeraLanciatorePerProve()
  const exe = exeFinto(t)
  const righe = []
  const log = (r) => righe.push(r)
  const fermi = () => righe.filter((x) => /\(fermo\)$/u.test(x)).length
  const comando = (pid) => {
    const f = figlioFinto(pid)
    const s = spawnAFasi(exe, { lanciatore: f, diPrima: figlioFinto(pid + 100) })
    const p = lanciaComando('ping -n 30 127.0.0.1', { shell: true }, { spawnFn: s.spawnFn, piattaforma: 'win32', ambiente: AMBIENTE(exe), log })
    return { f, s, p }
  }
  // a. tempo scaduto dopo «avvio», «ferma» non risponde mai: ai 2 s dalla maniglia, e «fermo» detto (J8)
  const a = comando(170)
  a.f.scrivi({ avvio: 9, nipoti: true })
  await giri()
  a.p.kill()
  assert.equal(a.s.ferme.length, 1)
  t.mock.timers.tick(2_000)
  assert.equal(a.f.uccisi, 1)
  assert.equal(fermi(), 1, `ferma muto ai 2 s (${righe.join(' | ')})`)
  // b. tempo scaduto prima di «avvio», il primo «ferma» risponde 0, quello ridato a «avvio» resta muto: «fermo» non cresce (una riga),
  //    ma la maniglia si chiude lo stesso ai 2 s (J9 lascerebbe «chiuso» del primo 0 e la chiuderebbe senza il ramo «non chiuso»)
  azzeraLanciatorePerProve()
  righe.length = 0
  const b = comando(171)
  b.p.kill()
  b.s.ferme[0].emit('exit', 0)
  b.f.scrivi({ avvio: 9, nipoti: true })
  await giri()
  assert.equal(b.s.ferme.length, 2)
  t.mock.timers.tick(2_000)
  assert.equal(b.f.uccisi, 1)
  assert.equal(fermi(), 1, 'il primo 0 non vale per la shell arrivata dopo')
  // c. «ferma» che non parte (errore) su due comandi: due chiusure dalla maniglia, una riga sola (J15)
  const c1 = comando(172)
  const c2 = comando(173)
  for (const c of [c1, c2]) { c.f.scrivi({ avvio: 9, nipoti: true }) }
  await giri()
  for (const c of [c1, c2]) { c.p.fermaAlbero(); c.s.ferme[0].emit('error', new Error('spawn EPERM')) }
  assert.equal(c1.f.uccisi + c2.f.uccisi, 2)
  assert.equal(fermi(), 1, 'una riga sola per due «ferma» che non partono')
  assert.deepEqual([...taskkillDi(c1.s.chiamate), ...taskkillDi(c2.s.chiamate)], [])
  // d. dal nucleo: «avvio» senza Job (nome già preso) e poi «sgancio»:false ⇒ niente riga, niente campo (J11)
  azzeraLanciatorePerProve()
  righe.length = 0
  const d = comando(174)
  d.f.scrivi({ avvio: 9, nipoti: false, motivo: 'job 5' })
  d.f.scrivi({ sgancio: false })
  await giri()
  assert.equal(righe.filter((x) => /\(sgancio\)$/u.test(x)).length, 0)
  if (process.platform === 'win32') assert.equal(statoVero(exe).sgancio, undefined)
})

/*
 * ⛔ Giro piccolo g4 del lanciatore (13/11/2026, giudice v1738 e v1739): il Job è ANONIMO, come Codex (`codex-rs/utils/pty/src/win/job.rs:73`,
 *   `CreateJobObjectW(null, null)`) e Hermes (`hermes_cli/local_runtime/processes.py:61-62`, «unnamed owner handle»). La sola maniglia la
 *   tiene il lanciatore, e «Ferma» passa dal lanciatore: il nucleo scrive `ferma` sulla sua entrata (maniglia 4) e il lanciatore fa
 *   `TerminateJobObject` sulla propria maniglia, poi risponde `{"ferma":true|false}` sul canale. Niente più exe rilanciato con `--ferma`,
 *   niente `OpenJobObjectW` per nome: nessun nome da prendere, nessun gruppo altrui da chiudere (nemmeno nella finestra prima di «avvio»).
 *   Rosse sulla testa `b33573f91`: LANC-U-29…32.
 */
/* il percorso dell'exe lanciato (c[0]) si toglie dal testo guardato: sta in tmpdir(), che su un runner è `…\AppData\Local\Temp` e
   conterrebbe «Local\» senza nessun nome di Job; un `Local\` o un `--ferma` in ogni altro punto della riga resta preso */
const senzaLExe = (c) => { const riga = String(c[2]?.argv0 ?? ''); const exe = String(c[0] ?? ''); return exe === '' ? riga : riga.replaceAll(exe, ''); };
const lanciNominati = (chiamate) => chiamate.filter((c) => /--ferma|Local\\/u.test(senzaLExe(c)) || /taskkill\.exe$/iu.test(String(c[0])))

test('LANC-U-29 — «Ferma» dopo «avvio» passa dal lanciatore: «ferma» sulla sua entrata, MAI un exe rilanciato per nome né un taskkill; la risposta decide «gruppo chiuso» o «fermo»', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  azzeraLanciatorePerProve()
  const chiamate = []
  const spawnFn = (...a) => { chiamate.push(a); return new EventEmitter() }
  const righe = []
  const log = (r) => righe.push(r)
  // a. risposta {"ferma":true}: il gruppo è chiuso; il lanciatore si tocca solo ai 2 s se l'albero non si svuota, e nessun «fermo»
  const f = figlioFinto(900)
  const p = new ProcessoLanciato(f, { lanciatore: 'C:\\l.exe', spawnFn, log })
  f.scrivi({ avvio: 9, nipoti: true })
  await giri()
  assert.equal(p.fermaAlbero(), true)
  await giri()
  assert.deepEqual(lanciNominati(chiamate), [], 'nessun exe rilanciato per nome, nessun taskkill')
  assert.equal(chiamate.length, 0, 'lo Stop non lancia nessun processo')
  assert.equal(f.ricevuto, 'ferma\n', '«ferma» scritto una volta sull entrata del lanciatore')
  f.scrivi({ ferma: true })
  await giri()
  assert.equal(f.uccisi, 0, 'gruppo chiuso: il lanciatore esce da solo quando l albero è vuoto')
  t.mock.timers.tick(2_000)
  assert.equal(f.uccisi, 1, 'ai 2 s senza albero vuoto: dalla maniglia')
  assert.equal(righe.filter((x) => /\(fermo\)$/u.test(x)).length, 0, 'gruppo chiuso: nessun «fermo»')
  // b. risposta {"ferma":false}: subito dalla maniglia, e «fermo» detto una volta
  const g = figlioFinto(901)
  const q = new ProcessoLanciato(g, { lanciatore: 'C:\\l.exe', spawnFn, log })
  g.scrivi({ avvio: 10, nipoti: true })
  await giri()
  q.fermaAlbero()
  g.scrivi({ ferma: false })
  await giri()
  assert.equal(g.uccisi, 1, '«ferma» non riuscito: dalla maniglia, subito')
  assert.equal(righe.filter((x) => /\(fermo\)$/u.test(x)).length, 1)
  assert.equal(chiamate.length, 0)
})

test('LANC-U-30 — la finestra prima di «avvio»: lo Stop e il guardiano non nominano MAI un gruppo; «ferma» resta sull entrata del lanciatore (riletto quando la shell è ripartita) e si ridà all arrivo di «avvio»', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  azzeraLanciatorePerProve()
  const exe = exeFinto(t)
  // lo Stop prima di «avvio»
  const f = figlioFinto(910)
  const s = spawnAFasi(exe, { lanciatore: f, diPrima: figlioFinto(911) })
  const p = lanciaComando('ping -n 30 127.0.0.1', { shell: true }, { spawnFn: s.spawnFn, piattaforma: 'win32', ambiente: AMBIENTE(exe), log: () => {} })
  assert.equal(p.fermaAlbero(), true)
  await giri()
  assert.equal(f.ricevuto, 'ferma\n', 'prima di «avvio»: «ferma» sull entrata, nessun nome')
  f.scrivi({ avvio: 77, nipoti: true })
  await giri()
  assert.equal(f.ricevuto, 'ferma\nferma\n', 'all arrivo di «avvio»: ridato una volta')
  assert.deepEqual(lanciNominati(s.chiamate), [], 'nessun «ferma» per nome: un gruppo che porta quel nome può essere di un altro')
  assert.equal(s.chiamate.length, 1, 'solo il lancio del comando')
  // il guardiano: «avvio» non arriva ⇒ il lanciatore dalla sua maniglia (l'appoggio chiude la shell sospesa), nessun nome
  const g = figlioFinto(920)
  const sg = spawnAFasi(exe, { lanciatore: g, diPrima: figlioFinto(921) })
  lanciaComando('echo ciao', { shell: true }, { spawnFn: sg.spawnFn, piattaforma: 'win32', ambiente: AMBIENTE(exe), log: () => {} })
  t.mock.timers.tick(SOGLIA())
  await giri()
  assert.equal(g.uccisi, 1, 'alla soglia: dalla maniglia, subito')
  assert.deepEqual(lanciNominati(sg.chiamate), [], 'il guardiano non nomina gruppi')
})

test('LANC-U-31 — il lanciatore parte SENZA nome di Job: la riga è exe, shell e la riga di Node identica; 5 tubi (il quinto è la sua entrata)', (t) => {
  azzeraLanciatorePerProve()
  const exe = exeFinto(t)
  const chiamate = []
  const spawnFn = (...a) => { chiamate.push(a); return figlioFinto() }
  lanciaComando('echo "a b" & exit 3', { shell: true, cwd: 'C:\\progetto' },
    { spawnFn, piattaforma: 'win32', ambiente: { TALOS_LANCIATORE: exe, comspec: 'C:\\Windows\\system32\\cmd.exe', SystemRoot: 'C:\\Windows' }, log: () => {} })
  const opzioni = chiamate[0][2]
  assert.equal(opzioni.argv0, `"${exe}" "C:\\Windows\\system32\\cmd.exe" C:\\Windows\\system32\\cmd.exe /d /s /c "echo "a b" & exit 3"`)
  assert.doesNotMatch(opzioni.argv0, /talos-lanciatore-[0-9a-f-]{36}/u, 'nessun nome')
  assert.deepEqual(opzioni.stdio, ['pipe', 'pipe', 'pipe', 'pipe', 'pipe'])
})

test('LANC-U-32 — senza Job (Windows l ha rifiutato): lo Stop passa lo stesso dal lanciatore, che chiude la shell dalla sua maniglia; i figli della shell possono restare: «fermo» detto una volta', async () => {
  azzeraLanciatorePerProve()
  const chiamate = []
  const righe = []
  const f = figlioFinto(930)
  const p = new ProcessoLanciato(f, { lanciatore: 'C:\\l.exe', spawnFn: (...a) => { chiamate.push(a); return new EventEmitter() }, log: (r) => righe.push(r) })
  f.scrivi({ avvio: 9, nipoti: false, motivo: 'job 5' })
  await giri()
  p.fermaAlbero()
  await giri()
  assert.equal(f.ricevuto, 'ferma\n', 'senza Job il lanciatore ferma comunque la shell che ha creato (per maniglia)')
  f.scrivi({ ferma: true })
  await giri()
  assert.equal(righe.filter((x) => /\(fermo\)$/u.test(x)).length, 1, 'i figli della shell non sono in un gruppo: si dice')
  assert.equal(f.uccisi, 1)
  assert.equal(chiamate.length, 0, 'nessun processo lanciato per fermare')
})

test('LANC-U-33 — una risposta a «ferma» senza Stop non conta: né «gruppo chiuso» né «fermo», il lanciatore non si tocca; dopo lo Stop sì (seconda prova della guardia `this.killed`)', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  azzeraLanciatorePerProve()
  const righe = []
  const f = figlioFinto(940)
  const p = new ProcessoLanciato(f, { lanciatore: 'C:\\l.exe', spawnFn: () => new EventEmitter(), log: (r) => righe.push(r) })
  f.scrivi({ avvio: 9, nipoti: true })
  await giri()
  // un lanciatore (o un comando che scrive sul canale) che risponde senza che nessuno abbia chiesto lo Stop
  f.scrivi({ ferma: false })
  f.scrivi({ ferma: true })
  await giri()
  assert.equal(f.uccisi, 0, 'nessuno Stop: il lanciatore non si chiude')
  assert.equal(righe.filter((x) => /\(fermo\)$/u.test(x)).length, 0, 'nessuno Stop: nessun «fermo»')
  assert.equal(p.gruppoChiuso, false, 'nessuno Stop: il gruppo non è «chiuso»')
  // dopo lo Stop la stessa risposta false conta: dalla maniglia e «fermo», una volta
  p.fermaAlbero()
  await giri()
  f.scrivi({ ferma: false })
  await giri()
  assert.equal(f.uccisi, 1)
  assert.equal(righe.filter((x) => /\(fermo\)$/u.test(x)).length, 1)
})

test('LANC-U-34 — l entrata del lanciatore che si rompe (EPIPE: è uscito) dopo lo Stop vale «ferma» non riuscito: dalla maniglia e «fermo» una volta; prima dello Stop non fa niente (seconda prova del gestore dell errore)', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  azzeraLanciatorePerProve()
  const righe = []
  const f = figlioFinto(950)
  const p = new ProcessoLanciato(f, { lanciatore: 'C:\\l.exe', spawnFn: () => new EventEmitter(), log: (r) => righe.push(r) })
  f.scrivi({ avvio: 9, nipoti: true })
  await giri()
  const epipe = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' })
  f.stdio[4].emit('error', epipe)
  await giri()
  assert.equal(f.uccisi, 0, 'prima dello Stop un errore dell entrata non chiude niente')
  assert.equal(righe.filter((x) => /\(fermo\)$/u.test(x)).length, 0)
  p.fermaAlbero()
  await giri()
  f.stdio[4].emit('error', epipe)
  await giri()
  assert.equal(f.uccisi, 1, 'dopo lo Stop: dalla maniglia, subito (non ai 2 s)')
  assert.equal(righe.filter((x) => /\(fermo\)$/u.test(x)).length, 1, '«fermo» detto una volta')
  f.stdio[4].emit('error', epipe)
  await giri()
  assert.equal(righe.filter((x) => /\(fermo\)$/u.test(x)).length, 1, 'un secondo errore non lo ridice')
})

test('LANC-U-35 — un lanciatore già uscito (Node ha già scritto `exitCode`) non riceve «ferma»: lo Stop vale subito «ferma» non riuscito, «fermo» una volta, nessun colpo (seconda prova di `lanciatoreGiaUscito` in `scriviFerma`)', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  azzeraLanciatorePerProve()
  const righe = []
  const f = figlioFinto(960)
  const p = new ProcessoLanciato(f, { lanciatore: 'C:\\l.exe', spawnFn: () => new EventEmitter(), log: (r) => righe.push(r) })
  f.scrivi({ avvio: 9, nipoti: true })
  await giri()
  f.exitCode = 1
  p.fermaAlbero()
  await giri()
  assert.equal(f.ricevuto, '', 'nessun «ferma» a un lanciatore uscito')
  assert.equal(righe.filter((x) => /\(fermo\)$/u.test(x)).length, 1, 'subito, non ai 2 s: «fermo» una volta')
  assert.equal(f.uccisi, 0, 'un lanciatore uscito non si chiude')
})

test('LANC-U-36 — seconde prove dal percorso intero (`lanciaComando`): risposta a «ferma» non chiesta, entrata rotta dopo lo Stop, lanciatore uscito (`exit`) col canale ancora aperto', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  azzeraLanciatorePerProve()
  const exe = exeFinto(t)
  const avvia = (pid) => {
    const righe = []
    const f = figlioFinto(pid)
    const s = spawnAFasi(exe, { lanciatore: f, diPrima: figlioFinto(pid + 1) })
    const p = lanciaComando('ping -n 30 127.0.0.1', { shell: true }, { spawnFn: s.spawnFn, piattaforma: 'win32', ambiente: AMBIENTE(exe), log: (r) => righe.push(r) })
    p.on?.('error', () => {})
    f.scrivi({ avvio: pid + 2, nipoti: true })
    return { f, p, righe, s }
  }
  const fermi = (righe) => righe.filter((x) => /\(fermo\)$/u.test(x)).length
  // a. una risposta che nessuno ha chiesto (un comando che scrive sul canale, un lanciatore guasto) non chiude niente
  const a = avvia(970)
  await giri()
  a.f.scrivi({ ferma: false })
  await giri()
  assert.equal(a.f.uccisi, 0, 'risposta non chiesta: il lanciatore resta')
  assert.equal(fermi(a.righe), 0, 'risposta non chiesta: nessun «fermo»')
  // b. l'entrata si rompe dopo lo Stop: subito dalla maniglia, «fermo» una volta
  const b = avvia(980)
  await giri()
  b.p.fermaAlbero()
  await giri()
  b.f.stdio[4].emit('error', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }))
  await giri()
  assert.equal(b.f.uccisi, 1, 'entrata rotta dopo lo Stop: dalla maniglia, subito')
  assert.equal(fermi(b.righe), 1)
  // c. il lanciatore ha detto `exit` ma il canale non è ancora chiuso: lo Stop non scrive niente e lo dice subito («fermo» si dice
  //    una volta per sessione: si azzera)
  azzeraLanciatorePerProve()
  const c = avvia(990)
  await giri()
  c.f.emit('exit', 1, null)
  await giri()
  c.p.fermaAlbero()
  await giri()
  assert.equal(c.f.ricevuto, '', 'nessun «ferma» a un lanciatore uscito')
  assert.equal(fermi(c.righe), 1, '«fermo» subito, non ai 2 s')
  assert.equal(c.f.uccisi, 0, 'un lanciatore uscito non si chiude')
  for (const x of [a, b, c]) assert.deepEqual(lanciNominati(x.s.chiamate), [], 'mai un nome né un taskkill')
})

/*
 * ⛔ Strada Codex (owner 13/11/2026 12:45): il Job tiene KILL_ON_JOB_CLOSE finché la shell gira; un comando che il nucleo manda in
 *   sottofondo lo dice al lanciatore con la riga `sfondo` sulla sua entrata (maniglia 4), che lo toglie: così sopravvive alla chiusura
 *   di TALOS e resta adottabile dopo un riavvio (`session-registry.mjs`, `adottaSfondiOrfani`).
 */
test('LANC-U-37 — «sfondo»: il comando mandato in sottofondo lo dice al lanciatore sulla sua entrata, una volta, anche prima di «avvio»; a un lanciatore uscito o al comando ripartito no; mai un colpo', async (t) => {
  azzeraLanciatorePerProve()
  const f = figlioFinto(1010)
  const p = new ProcessoLanciato(f, { lanciatore: 'C:\\l.exe', spawnFn: () => { throw new Error('mai un processo per «sfondo»') }, log: () => {} })
  assert.equal(p.inSfondo(), true, 'prima di «avvio»: resta nel tubo, il lanciatore la legge quando la shell è ripartita')
  assert.equal(p.inSfondo(), false, 'una volta')
  await prossimo()
  assert.equal(f.ricevuto, 'sfondo\n')
  f.scrivi({ avvio: 9, nipoti: true })
  await giri()
  assert.equal(f.uccisi, 0, '«sfondo» non chiude niente')
  // un lanciatore già uscito non riceve niente (scriverci darebbe EPIPE)
  const g = figlioFinto(1011)
  const q = new ProcessoLanciato(g, { lanciatore: 'C:\\l.exe', spawnFn: () => new EventEmitter(), log: () => {} })
  g.exitCode = 0
  assert.equal(q.inSfondo(), false)
  assert.equal(g.ricevuto, '')
  // il comando ripartito senza lanciatore (`diPrima`) non ha un lanciatore a cui dirlo
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const exe = exeFinto(t)
  const lanc = figlioFinto(1020)
  const s = spawnAFasi(exe, { lanciatore: lanc, diPrima: figlioFinto(1021) })
  const r = lanciaComando('ping -n 30 127.0.0.1', { shell: true }, { spawnFn: s.spawnFn, piattaforma: 'win32', ambiente: AMBIENTE(exe), log: () => {} })
  r.on?.('error', () => {})
  lanc.chiudiCanale(); lanc.emit('exit', 1, null)
  await giri()
  assert.ok(r.diPrima, 'premessa: il comando è ripartito con lo spawn di prima')
  assert.equal(r.inSfondo(), false)
  assert.equal(lanc.ricevuto, '')
})

/* Cura dei gialli del controllore (13/11/2026): i mutanti C7 (nessuna prova lo vedeva), C4 e C6 (una prova sola ciascuno). */
test('LANC-U-38 — seconde prove: prima di «avvio» uno Stop che non si scrive non dice «fermo» (C7); un lanciatore uscito per segnale non riceve né «ferma» né «sfondo» (C4); due Stop dal percorso intero danno un «ferma» solo (C6)', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const fermi = (righe) => righe.filter((x) => /\(fermo\)$/u.test(x)).length
  // C7: prima di «avvio» non è partito niente: il lanciatore dalla sua maniglia, e il log non dice che dei programmi restano accesi
  azzeraLanciatorePerProve()
  const righe7 = []
  const f7 = figlioFinto(1110)
  const p7 = new ProcessoLanciato(f7, { lanciatore: 'C:\\l.exe', spawnFn: () => new EventEmitter(), log: (r) => righe7.push(r) })
  f7.stdio[4].destroy()
  p7.fermaAlbero()
  await giri()
  assert.equal(f7.uccisi, 1, 'prima di «avvio», «ferma» che non si scrive: il lanciatore dalla sua maniglia')
  assert.equal(fermi(righe7), 0, 'prima di «avvio» nessun «fermo»')
  // C4: Node ha scritto `signalCode` (uscita per segnale), `exitCode` è ancora null
  azzeraLanciatorePerProve()
  const righe4 = []
  const f4 = figlioFinto(1120)
  const p4 = new ProcessoLanciato(f4, { lanciatore: 'C:\\l.exe', spawnFn: () => new EventEmitter(), log: (r) => righe4.push(r) })
  f4.scrivi({ avvio: 9, nipoti: true })
  await giri()
  f4.signalCode = 'SIGTERM'
  assert.equal(p4.inSfondo(), false, 'a un lanciatore uscito niente «sfondo»')
  p4.fermaAlbero()
  await giri()
  assert.equal(f4.ricevuto, '', 'né «ferma»')
  assert.equal(fermi(righe4), 1, '«fermo» subito')
  assert.equal(f4.uccisi, 0, 'un lanciatore uscito non si chiude')
  // C6: lo Stop e il tempo che arrivano insieme dal percorso intero chiudono il Job una volta
  const exe = exeFinto(t)
  const lanc = figlioFinto(1130)
  const s = spawnAFasi(exe, { lanciatore: lanc, diPrima: figlioFinto(1131) })
  const p6 = lanciaComando('ping -n 30 127.0.0.1', { shell: true }, { spawnFn: s.spawnFn, piattaforma: 'win32', ambiente: AMBIENTE(exe), log: () => {} })
  p6.on?.('error', () => {})
  lanc.scrivi({ avvio: 1132, nipoti: true })
  await giri()
  assert.equal(p6.kill(), true)
  assert.equal(p6.kill(), true)
  await giri()
  assert.equal(lanc.ricevuto, 'ferma\n', 'due Stop: «ferma» una volta')
})

/*
 * Cura unica dei gialli (13/11/2026, revisore B). Nate ROSSE sulla testa `689e60b68`:
 *   (b) l appoggio rifiutato da Windows toglie anche il legame del primo piano (KILL_ON_JOB_CLOSE non c è mai): il log lo dice;
 *   (c) in sottofondo, a lanciatore morto, il log diceva «può non essere girato» (falso: il comando continua da solo, 10 su 10);
 *   (d) la maniglia 4 chiusa PRIMA di «sfondo»: `inSfondo()` risponde false, il comando muore con TALOS e il log taceva.
 */
test('LANC-U-39 — l appoggio rifiutato: l avviso dice anche che un comando in primo piano non si ferma più con l aiutante o con TALOS', async (t) => {
  azzeraLanciatorePerProve()
  const exe = exeFinto(t)
  const righe = []
  const l = figlioFinto(100)
  const s = spawnAFasi(exe, { lanciatore: l, diPrima: figlioFinto(200) })
  lanciaComando('echo ciao', { shell: true }, { spawnFn: s.spawnFn, piattaforma: 'win32', ambiente: AMBIENTE(exe), log: (r) => righe.push(r) })
  l.scrivi({ avvio: 9, nipoti: true, appoggio: false })
  await giri()
  assert.equal(righe.length, 1, righe.join(' | '))
  assert.match(righe[0], /may stay paused/u, 'il primissimo istante, come prima')
  assert.match(righe[0], /foreground .*does not stop when the helper or TALOS stops.*\(appoggio\)$/u, 'e il primo piano non legato')
})

test('LANC-U-40 — in sottofondo, lanciatore morto dopo «avvio» senza dire l uscita: il log dice che il comando continua da solo e non si vede più la sua fine, mai «può non essere girato»; in primo piano resta «incerto»', async (t) => {
  azzeraLanciatorePerProve()
  const exe = exeFinto(t)
  const righe = []
  const l = figlioFinto(100)
  const s = spawnAFasi(exe, { lanciatore: l, diPrima: figlioFinto(200) })
  const p = lanciaComando('npm run dev', { shell: true }, { spawnFn: s.spawnFn, piattaforma: 'win32', ambiente: AMBIENTE(exe), log: (r) => righe.push(r) })
  p.on('error', () => {})
  l.scrivi({ avvio: 9, nipoti: true })
  await giri()
  assert.equal(p.inSfondo(), true, 'premessa: in sottofondo')
  l.chiudi(); l.chiudiCanale(); l.emit('exit', 1, null)
  await presto()
  assert.equal(p.forseNonGirato, false, 'il comando è girato: è in sottofondo')
  assert.equal(p.nipotiSeguiti, false, 'non è più seguito')
  assert.equal(righe.length, 1, righe.join(' | '))
  assert.doesNotMatch(righe[0], /may not have run|\(incerto\)/u)
  assert.match(righe[0], /^\[launcher\] .*background.*keeps running.*\(slegato\)$/u)
  if (process.platform === 'win32') assert.notDeepEqual(statoVero(exe), { nipoti: false, motivo: 'incerto' }, 'la diagnostica non dice «incerto»')
  // al contrario: in primo piano lo stesso fatto resta «può non essere girato»
  const l2 = figlioFinto(101)
  const p2 = lanciaComando('git commit -m x', { shell: true }, { spawnFn: spawnAFasi(exe, { lanciatore: l2, diPrima: figlioFinto(201) }).spawnFn, piattaforma: 'win32', ambiente: AMBIENTE(exe), log: (r) => righe.push(r) })
  l2.scrivi({ avvio: 10, nipoti: true })
  await giri()
  l2.chiudi(); l2.chiudiCanale(); l2.emit('exit', 57, null)
  await presto()
  assert.equal(p2.forseNonGirato, true)
  assert.match(righe.at(-1), /may not have run.*\(incerto\)/u)
})

test('LANC-U-41 — l entrata del lanciatore chiusa PRIMA di «sfondo», lanciatore vivo: `inSfondo()` false e UNA riga nel log; a un lanciatore uscito, al ripartito o al secondo «sfondo» nessuna', async (t) => {
  azzeraLanciatorePerProve()
  const righe = []
  const f = figlioFinto(1210)
  const p = new ProcessoLanciato(f, { lanciatore: 'C:\\l.exe', spawnFn: () => new EventEmitter(), log: (r) => righe.push(r) })
  f.scrivi({ avvio: 9, nipoti: true })
  await giri()
  f.stdio[4].destroy()
  assert.equal(p.inSfondo(), false)
  assert.equal(righe.length, 1, righe.join(' | '))
  assert.match(righe[0], /^\[launcher\] .*background.*stops if the helper or TALOS stops.*\(sfondo\)$/u)
  const g = figlioFinto(1211)
  const q = new ProcessoLanciato(g, { lanciatore: 'C:\\l.exe', spawnFn: () => new EventEmitter(), log: (r) => righe.push(r) })
  g.stdio[4].destroy()
  assert.equal(q.inSfondo(), false)
  assert.equal(righe.length, 1, 'una volta sola')
  // un lanciatore uscito: la shell è già uscita e lo sgancio c è stato, niente da dire
  azzeraLanciatorePerProve()
  const h = figlioFinto(1212)
  const r = new ProcessoLanciato(h, { lanciatore: 'C:\\l.exe', spawnFn: () => new EventEmitter(), log: (x) => righe.push(x) })
  h.exitCode = 0
  assert.equal(r.inSfondo(), false)
  const k = figlioFinto(1213)
  const u = new ProcessoLanciato(k, { lanciatore: 'C:\\l.exe', spawnFn: () => new EventEmitter(), log: (x) => righe.push(x) })
  assert.equal(u.inSfondo(), true)
  k.stdio[4].destroy()
  assert.equal(u.inSfondo(), false, 'il secondo «sfondo» non si scrive')
  assert.equal(righe.length, 1, `nessuna riga in più: ${righe.join(' | ')}`)
})

/* Mutante J-N9 della cura unica (13/11/2026): la scrittura di «sfondo» che lancia (tubo rotto fra il controllo e la scrittura) taceva
   ancora nel ramo `catch`. Due prove: dopo «avvio» e prima di «avvio». */
for (const [id, dopoAvvio] of [['42', true], ['43', false]]) {
  test(`LANC-U-${id} — la scrittura di «sfondo» sull entrata che lancia (${dopoAvvio ? 'dopo' : 'prima di'} «avvio»): \`inSfondo()\` false e UNA riga nel log`, async () => {
    azzeraLanciatorePerProve()
    const righe = []
    const f = figlioFinto(1220 + Number(id))
    const p = new ProcessoLanciato(f, { lanciatore: 'C:\\l.exe', spawnFn: () => new EventEmitter(), log: (r) => righe.push(r) })
    if (dopoAvvio) { f.scrivi({ avvio: 9, nipoti: true }); await giri() }
    f.stdio[4].write = () => { throw Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }) }
    assert.equal(p.inSfondo(), false)
    assert.equal(righe.length, 1, righe.join(' | '))
    assert.match(righe[0], /^\[launcher\] .*background.*stops if the helper or TALOS stops.*\(sfondo\)$/u)
    assert.equal(p.inSfondo(), false, 'una volta sola')
    assert.equal(righe.length, 1)
  })
}

/* Quinto giro sul lanciatore (13/11/2026, revisore dopo la cura unica): J-e (la riga «slegato» detta UNA volta, non una per comando)
   non aveva prova, e J-d (il comando slegato non è più seguito) ne aveva una sola (U-40). Due prove: due comandi in sottofondo il cui
   lanciatore muore dopo «avvio»; e lo stesso con un comando in primo piano in mezzo (lì «incerto», anche lui una volta). */
const slegatoDopoAvvio = async (righe, pid, { sfondo = true } = {}) => {
  const f = figlioFinto(pid)
  const p = new ProcessoLanciato(f, { lanciatore: 'C:\\l.exe', spawnFn: () => new EventEmitter(), log: (r) => righe.push(r) })
  p.on('error', () => {})
  f.scrivi({ avvio: pid + 1, nipoti: true })
  await giri()
  if (sfondo) assert.equal(p.inSfondo(), true, 'premessa: in sottofondo')
  f.chiudi(); f.chiudiCanale(); f.emit('exit', 1, null)
  await presto()
  return p
}
test('LANC-U-44 — due comandi in sottofondo, lanciatore morto dopo «avvio» per tutti e due: nessuno dei due è più seguito, e il log lo dice UNA volta (J-d, J-e)', async () => {
  azzeraLanciatorePerProve()
  const righe = []
  const p1 = await slegatoDopoAvvio(righe, 1240)
  const p2 = await slegatoDopoAvvio(righe, 1250)
  assert.deepEqual([p1.nipotiSeguiti, p2.nipotiSeguiti], [false, false], 'tutti e due slegati: TALOS non ne vede più la fine')
  assert.deepEqual([p1.forseNonGirato, p2.forseNonGirato], [false, false], 'sono girati: sono in sottofondo')
  assert.equal(righe.filter((r) => /\(slegato\)$/u.test(r)).length, 1, `una riga sola: ${righe.join(' | ')}`)
  assert.equal(righe.length, 1, righe.join(' | '))
})
test('LANC-U-44b — sottofondo, primo piano, sottofondo, ognuno col lanciatore morto dopo «avvio»: «slegato» una volta, «incerto» una volta, e i due in sottofondo non più seguiti (J-d, J-e, seconda prova)', async () => {
  azzeraLanciatorePerProve()
  const righe = []
  const p1 = await slegatoDopoAvvio(righe, 1260)
  const p2 = await slegatoDopoAvvio(righe, 1270, { sfondo: false })
  const p3 = await slegatoDopoAvvio(righe, 1280)
  assert.equal(p2.forseNonGirato, true, 'premessa: in primo piano resta «può non essere girato»')
  assert.deepEqual([p1.nipotiSeguiti, p3.nipotiSeguiti], [false, false])
  assert.equal(righe.filter((r) => /\(slegato\)$/u.test(r)).length, 1, righe.join(' | '))
  assert.equal(righe.filter((r) => /\(incerto\)$/u.test(r)).length, 1, righe.join(' | '))
  assert.equal(righe.length, 2, righe.join(' | '))
})
