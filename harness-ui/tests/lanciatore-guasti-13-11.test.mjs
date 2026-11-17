/*
 * ⛔ Cura unica dei gialli del lanciatore (13/11/2026, revisori A, B e C della strada Codex; giudice v1796-v1800). Processi VERI, solo
 *   Windows. Qui le prove che il ramo non aveva:
 *   - un comando mandato in sottofondo A METÀ (dalla persona, o allo scadere del tempo) sopravvive al lanciatore ucciso (revisore C, J3
 *     e S4: prima lo provava solo il sottofondo dalla partenza, LANC-23);
 *   - il ripiego SENZA Job (`chiudi_albero_senza_job`, revisore C: SN, SC, M6, M8 li uccidevano solo le sue sonde fuori dal repo);
 *   - i ripieghi di «ferma» quando TerminateJobObject fallisce (revisore A, SR: in sottofondo 20 programmi vivi su 20 col ripiego tolto)
 *     e quando Windows rifiuta anche di rilegare il gruppo;
 *   - che l exe di rilascio IGNORA i guasti di prova, e che senza impronta fissata la strada non è attiva (giudice v1796).
 * ⛔ I guasti si forzano SOLO con l exe costruito con `--features guasti-di-prova` (`native/lanciatore/Cargo.toml`), indicato con
 *   TALOS_LANCIATORE_PROVE: `cargo build --release --features guasti-di-prova --target-dir <cartella tua>`. Senza, quelle prove sono
 *   SALTATE col motivo, mai verdi. L exe di rilascio (TALOS_LANCIATORE, o quello del pacchetto) non ha il codice dei guasti.
 * Ogni programma di queste prove è un node che scrive il suo PID e si ferma da solo quando compare `stop.txt`: la pulizia non colpisce
 *   mai per numero (un PID riusato sarebbe di un processo estraneo).
 * ⛔ Quinto giro (13/11/2026, revisore dopo la cura unica): i nipoti ORFANI nel terzo ripiego (LANC-G-14, mutante R-m) e la risposta a
 *   «ferma» trattenuta apposta dall aggancio di prova `tarda=<ms>` (LANC-G-12, 13, 15, mutanti R7 e R-b), un giro per prova invece di cinque.
 * Concorrenti: codex codex-rs/utils/pty/src/win/job.rs:314-318 (un PID dell elenco del Job si colpisce solo se IsProcessInJob lo
 *   conferma); hermes-agent tools/process_registry_termination.py:45-48 (ora di partenza diversa: non si tocca) e :41 (su Windows
 *   «psutil's stale PPID links miss orphans there»: l albero dei padri non trova gli orfani, come la fotografia di R-m).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { setTimeout as attendi } from 'node:timers/promises'
import * as K from '../src/kernel/talosHarness.mjs'
import { NOME_LANCIATORE, ProcessoLanciato, azzeraLanciatorePerProve, trovaLanciatore } from '../src/kernel/lanciatore-windows.mjs'
import * as L from '../src/kernel/lanciatore-windows.mjs'
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs'

const SU_WINDOWS = process.platform === 'win32'
const EXE = process.env.TALOS_LANCIATORE ?? ''
const EXE_PROVE = process.env.TALOS_LANCIATORE_PROVE ?? ''
const STATO = SU_WINDOWS ? K.statoDelLanciatore() : { nipoti: false, motivo: 'non-windows' }
const conLanciatore = { skip: !SU_WINDOWS ? 'solo Windows' : (STATO.nipoti ? false : `SALTATA, non verde: qui il lanciatore non è usabile (${STATO.motivo})`), timeout: 60_000 }
const conProve = { skip: !SU_WINDOWS ? 'solo Windows' : (EXE_PROVE && existsSync(EXE_PROVE) ? false : 'SALTATA, non verde: serve l exe dei guasti di prova (TALOS_LANCIATORE_PROVE)'), timeout: 60_000 }
const conTutti = { skip: conProve.skip || (EXE && existsSync(EXE) ? false : 'SALTATA, non verde: serve anche l exe di rilascio (TALOS_LANCIATORE)'), timeout: 60_000 }
const NODE = `"${process.execPath}"`
const CMD = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe')
const vivo = (pid) => { try { process.kill(pid, 0); return true } catch { return false } }
const aspetta = async (f, ms = 6_000) => { for (const t0 = Date.now(); Date.now() - t0 < ms; await attendi(30)) if (f()) return true; return f() }

/* `prog.js <nome> <ms>`: scrive `pid-<nome>.txt`, vive `ms` (poi `fine-<nome>.txt`), si ferma da solo quando compare `stop.txt`. */
const PROG = "const f=require('fs');const n=process.argv[2];f.writeFileSync('pid-'+n+'.txt',String(process.pid));"
  + "const fine=(x)=>{if(x)f.writeFileSync('fine-'+n+'.txt','');process.exit(0)};setTimeout(()=>fine(true),Number(process.argv[3]));setInterval(()=>{if(f.existsSync('stop.txt'))fine(false)},50)"
function banco(t) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-lanc-guasti-'))
  writeFileSync(join(cartella, 'prog.js'), PROG)
  t.after(async () => {
    writeFileSync(join(cartella, 'stop.txt'), '')
    for (let i = 0; i < 100 && pidi(cartella).some(vivo); i++) await attendi(100)
    await rimuoviCartellaDiProvaAttesa(cartella)
  })
  return cartella
}
const pidDi = (cartella, nome) => { const f = join(cartella, `pid-${nome}.txt`); const n = existsSync(f) ? Number(readFileSync(f, 'utf8')) : NaN; return Number.isInteger(n) && n > 0 ? n : null }
const pidi = (cartella) => ['a', 'b', 'x', 'y'].map((n) => pidDi(cartella, n)).filter(Boolean)
const prog = (nome, ms = 30_000) => `${NODE} prog.js ${nome} ${ms}`

/* Il lanciatore lanciato a mano, come lo lancia il nucleo (riga di Node identica dopo la shell; 3 il canale, 4 la sua entrata). */
function lancia(exe, comando, cartella, guasti = '') {
  const env = { ...process.env }
  if (guasti) env.TALOS_LANCIATORE_GUASTI = guasti; else delete env.TALOS_LANCIATORE_GUASTI
  const figlio = spawn(exe, [], {
    windowsHide: true, windowsVerbatimArguments: true, stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe'], cwd: cartella, env,
    argv0: `"${exe}" "${CMD}" ${CMD} /d /s /c "${comando}"`,
  })
  figlio.stdio[4].on('error', () => {})
  const righe = []
  let resto = ''
  figlio.stdio[3].setEncoding('utf8')
  figlio.stdio[3].on('data', (d) => { resto += d; let a; while ((a = resto.indexOf('\n')) >= 0) { try { righe.push(JSON.parse(resto.slice(0, a))) } catch { /* riga rotta */ } resto = resto.slice(a + 1) } })
  figlio.stdout.resume(); figlio.stderr.resume()
  const l = { figlio, righe, codice: null, uscito: false }
  l.fine = new Promise((r) => figlio.on('exit', (c) => { l.codice = c; l.uscito = true; r(c) }))
  l.avvio = async () => { await aspetta(() => righe.some((r) => Number.isInteger(r.avvio)), 6_000); return righe.find((r) => Number.isInteger(r.avvio)) ?? null }
  l.scrivi = (riga) => { try { figlio.stdio[4].write(`${riga}\n`); return true } catch { return false } }
  l.ferma = async () => {
    const prima = righe.filter((r) => typeof r.ferma === 'boolean').length
    if (!l.scrivi('ferma')) return null
    await aspetta(() => righe.filter((r) => typeof r.ferma === 'boolean').length > prima, 6_000)
    return righe.filter((r) => typeof r.ferma === 'boolean').at(-1)?.ferma ?? null
  }
  l.entro = (ms) => Promise.race([l.fine.then(() => true), attendi(ms).then(() => false)])
  l.dopoFerma = () => righe.slice(righe.findIndex((r) => typeof r.ferma === 'boolean') + 1)
  return l
}
const aspettaPid = async (cartella, nome) => { assert.ok(await aspetta(() => pidDi(cartella, nome) !== null, 8_000), `premessa: il programma ${nome} è partito`); return pidDi(cartella, nome) }

/* ———————————————————— revisore C, J3 e S4: sottofondo a metà ———————————————————— */
for (const [nome, come] of [['persona', 'abort'], ['tempo-scaduto', 'tempo']]) {
  test(`LANC-G-01-${nome}: un comando mandato in sottofondo A METÀ (${nome}) sopravvive al lanciatore ucciso (riga «sfondo» anche da lì, non solo dalla partenza)`, conLanciatore, async (t) => {
    const cartella = banco(t)
    let pid = null
    const sfondo = new AbortController()
    // revisore B (c): a lanciatore morto il log dice ciò che è vero (il comando continua), mai «può non essere girato»
    azzeraLanciatorePerProve()
    const righe = []
    const avviso = console.warn
    console.warn = (...a) => { righe.push(a.join(' ')) }
    t.after(() => { console.warn = avviso })
    const p = K.eseguiComandoSandboxato(`${NODE} -e "setTimeout(()=>require('fs').writeFileSync('vivo.txt',''),3500)"`, cartella,
      { dove: 'windows', segnaleSfondo: sfondo.signal, fileSfondo: join(cartella, 'bg.log'), onAvvio: (n) => { pid = n }, ...(come === 'tempo' ? { timeoutMs: 1_000 } : {}) })
    assert.ok(await aspetta(() => Number.isInteger(pid), 5_000), 'premessa: il PID del lanciatore è noto')
    await attendi(600) // ancora in primo piano
    if (come === 'abort') sfondo.abort()
    const r = await p
    assert.equal(r.messoInSfondo, true, `premessa: è in sottofondo (${come})`)
    assert.equal(r.daSfondo, come === 'abort' ? 'persona' : 'tempo-scaduto')
    await attendi(300)
    spawnSync(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(pid), '/F'], { windowsHide: true }) // il lanciatore di questa prova
    assert.ok(await aspetta(() => existsSync(join(cartella, 'vivo.txt')), 7_000), 'il comando mandato in sottofondo a metà continua senza il lanciatore')
    await r.uscita?.catch?.(() => {})
    const dette = righe.filter((x) => /^\[launcher\]/u.test(x))
    assert.equal(dette.some((x) => /\(slegato\)$/u.test(x)), true, `il log dice che continua da solo: ${dette.join(' | ')}`)
    assert.equal(dette.some((x) => /\(incerto\)$/u.test(x)), false, 'e non che può non essere girato')
  })
}

/* ———————————————————— revisore C, SN SC M6 M8: il ripiego senza Job ———————————————————— */
test('LANC-G-02: senza Job (forzato) la riga «avvio» dice nipoti:false col motivo del Job; lo Stop chiude la shell e non solo il programma di adesso: il secondo programma non parte mai (SC)', conProve, async (t) => {
  const c0 = banco(t)
  const l0 = lancia(EXE_PROVE, 'exit 0', c0, 'job')
  const a0 = await l0.avvio()
  assert.equal(a0?.nipoti, false, `nipoti:false (${JSON.stringify(a0)})`)
  assert.match(String(a0?.motivo), /^job /u)
  await l0.entro(5_000)
  const c1 = banco(t)
  const l1 = lancia(EXE_PROVE, `${prog('a')} & ${prog('b')} & exit 0`, c1, 'job')
  await l1.avvio()
  const pa = await aspettaPid(c1, 'a')
  assert.equal(await l1.ferma(), true, 'risposta «ferma»: true')
  assert.ok(await l1.entro(3_000), 'il lanciatore esce: la shell è chiusa')
  await attendi(800)
  assert.equal(vivo(pa), false, 'il primo programma è fermato')
  assert.equal(pidDi(c1, 'b'), null, 'il secondo non è mai partito: la shell non continua')
})

test('LANC-G-02b: senza Job (forzato) il comando fermato esce col codice 1: la shell è chiusa, non arrivata a «exit 0» (SC, seconda prova)', conProve, async (t) => {
  const c4 = banco(t)
  const l4 = lancia(EXE_PROVE, `${prog('a')} & exit 0`, c4, 'job')
  await l4.avvio(); await aspettaPid(c4, 'a')
  assert.equal(await l4.ferma(), true)
  assert.ok(await l4.entro(3_000))
  assert.equal(l4.codice, 1, 'codice 1: fermato, non finito')
})

for (const [id, comando, cosa] of [
  ['a', `cmd /d /c ${prog('a')} & exit 0`, 'un nipote dietro una cmd interna (M6)'],
  ['c', `cmd /d /c cmd /d /c ${prog('a')} & exit 0`, 'un pronipote dietro due cmd interne (M6, seconda prova)'],
]) {
  test(`LANC-G-03${id}: senza Job (forzato) lo Stop segue l albero: ${cosa}`, conProve, async (t) => {
    const c = banco(t)
    const l = lancia(EXE_PROVE, comando, c, 'job')
    await l.avvio()
    const pa = await aspettaPid(c, 'a')
    assert.equal(await l.ferma(), true)
    await l.entro(3_000); await attendi(800)
    assert.equal(vivo(pa), false, `fermato: ${cosa}`)
  })
}

test('LANC-G-03b: senza Job (forzato) uno `start "" /b` accanto al primo piano: lo Stop chiude tutti e due (M8)', conProve, async (t) => {
  const c5 = banco(t)
  const l5 = lancia(EXE_PROVE, `start "" /b ${prog('a')} & ${prog('b')}`, c5, 'job')
  await l5.avvio()
  const qa = await aspettaPid(c5, 'a'); const qb = await aspettaPid(c5, 'b')
  assert.equal(await l5.ferma(), true)
  await l5.entro(3_000); await attendi(800)
  assert.equal(vivo(qa), false, 'il programma partito con start /b è fermato')
  assert.equal(vivo(qb), false, 'il programma in primo piano è fermato')
})

test('LANC-G-04a: senza Job (forzato) un processo nato PRIMA della shell e visto come suo figlio (un numero ridato, guasto di prova) non si tocca (SN)', conProve, async (t) => {
  const ca = banco(t)
  const estraneo = spawn(process.execPath, ['prog.js', 'x', '60000'], { cwd: ca, windowsHide: true, stdio: 'ignore' })
  estraneo.on('error', () => {})
  const px = await aspettaPid(ca, 'x')
  const la = lancia(EXE_PROVE, prog('a'), ca, `job,padre=${px}`)
  await la.avvio()
  const pa = await aspettaPid(ca, 'a')
  assert.equal(await la.ferma(), true)
  await la.entro(3_000); await attendi(800)
  assert.equal(vivo(pa), false, 'il programma del comando è fermato')
  assert.equal(vivo(px), true, 'l estraneo nato prima della shell resta vivo')
})

test('LANC-G-04b: senza Job (forzato) un estraneo (cmd) col suo figlio, visto come figlio della shell: né lui né suo figlio si toccano (SN, seconda prova)', conProve, async (t) => {
  const cb = banco(t)
  const capo = spawn(CMD, ['/d', '/s', '/c', `"${NODE} prog.js y 60000"`], { cwd: cb, windowsHide: true, stdio: 'ignore', windowsVerbatimArguments: true })
  capo.on('error', () => {})
  const py = await aspettaPid(cb, 'y')
  const lb = lancia(EXE_PROVE, prog('a'), cb, `job,padre=${capo.pid}`)
  await lb.avvio()
  const pb = await aspettaPid(cb, 'a')
  assert.equal(await lb.ferma(), true)
  await lb.entro(3_000); await attendi(800)
  assert.equal(vivo(pb), false)
  assert.equal(vivo(capo.pid) && capo.exitCode === null, true, 'l estraneo resta vivo')
  assert.equal(vivo(py), true, 'e anche suo figlio')
})

/* ———————————————————— revisore A, SR: TerminateJobObject che fallisce ———————————————————— */
for (const dove of ['primo-piano', 'sottofondo']) {
  test(`LANC-G-05-${dove}: TerminateJobObject che fallisce (guasto di prova): il lanciatore rilega il gruppo ed esce, e Windows chiude tutti i programmi (SR)`, conProve, async (t) => {
    const c = banco(t)
    const l = lancia(EXE_PROVE, `start "" /b ${prog('a')} & ${prog('b')}`, c, 'termina')
    await l.avvio()
    const pa = await aspettaPid(c, 'a'); const pb = await aspettaPid(c, 'b')
    if (dove === 'sottofondo') { assert.ok(l.scrivi('sfondo')); await attendi(300) }
    assert.equal(await l.ferma(), true, 'risposta «ferma»: true')
    assert.ok(await l.entro(3_000), 'lo Stop non resta appeso')
    await attendi(800)
    assert.equal(vivo(pa), false, 'il programma partito con start /b è fermato')
    assert.equal(vivo(pb), false, 'il programma in primo piano è fermato')
    assert.equal(l.dopoFerma().some((r) => Number.isInteger(r.uscita)), false, 'il ripiego del gruppo rilegato: il lanciatore esce subito dopo la risposta, senza dire l uscita della shell')
    // quinto giro (mutante SR, ucciso da una prova sola): la shell muore con l ultima maniglia del gruppo, DOPO il lanciatore, quindi
    // nessuna riga d uscita c è mai, nemmeno prima della risposta (col terzo ripiego al suo posto la shell muore prima, e la riga c è)
    assert.equal(l.righe.some((r) => Number.isInteger(r.uscita)), false, `nessuna riga d uscita della shell: ${JSON.stringify(l.righe)}`)
    assert.equal(l.codice, 1)
  })
}

/* ———————————————————— revisore A, SR dopo «sfondo»: Windows rifiuta anche di rilegare il gruppo ———————————————————— */
for (const dove of ['primo-piano', 'sottofondo']) {
  test(`LANC-G-06-${dove}: Windows rifiuta anche di rilegare il gruppo (guasti di prova): il lanciatore chiude uno per uno i programmi che Windows conferma nel gruppo (nata ROSSA)`, conProve, async (t) => {
    const c = banco(t)
    const l = lancia(EXE_PROVE, `start "" /b ${prog('a')} & ${prog('b')}`, c, 'termina,riaggancia')
    await l.avvio()
    const pa = await aspettaPid(c, 'a'); const pb = await aspettaPid(c, 'b')
    if (dove === 'sottofondo') { assert.ok(l.scrivi('sfondo')); await attendi(300) }
    const risposta = await l.ferma()
    await attendi(800)
    const vivi = [pa, pb].filter(vivo).length
    if (vivi) writeFileSync(join(c, 'stop.txt'), '') // rossa: i programmi si fermano da soli, mai per numero
    assert.equal(risposta, true, `${dove}: risposta «ferma» true`)
    assert.equal(vivi, 0, `${dove}: nessun programma resta acceso`)
    assert.ok(await l.entro(3_000), `${dove}: svuotato il gruppo il lanciatore esce`)
    assert.ok(l.righe.some((r) => r.albero === 'vuoto'), `${dove}: e lo dice («albero vuoto»)`)
  })
  test(`LANC-G-09-${dove}: nel terzo ripiego un numero dell elenco che non è nel gruppo (ridato a un estraneo, guasto di prova) non si tocca`, conProve, async (t) => {
    const c = banco(t)
    const estraneo = spawn(process.execPath, ['prog.js', 'x', '60000'], { cwd: c, windowsHide: true, stdio: 'ignore' })
    estraneo.on('error', () => {})
    const px = await aspettaPid(c, 'x')
    const l = lancia(EXE_PROVE, `start "" /b ${prog('a')} & ${prog('b')}`, c, `termina,riaggancia,membro=${px}`)
    await l.avvio()
    const pa = await aspettaPid(c, 'a'); const pb = await aspettaPid(c, 'b')
    if (dove === 'sottofondo') { assert.ok(l.scrivi('sfondo')); await attendi(300) }
    assert.equal(await l.ferma(), true)
    await attendi(800)
    assert.deepEqual([vivo(pa), vivo(pb)], [false, false], 'i programmi del comando sono fermati')
    assert.equal(vivo(px), true, 'l estraneo, che Windows non conferma nel gruppo, resta vivo')
  })
}

/* ———————————————————— revisore B (b, d): appoggio rifiutato ed entrata chiusa, dal vivo ———————————————————— */
test('LANC-G-10: l entrata del lanciatore chiusa PRIMA di «sfondo»: `inSfondo()` false, una riga nel log, e il comando si ferma davvero col lanciatore', conLanciatore, async (t) => {
  const c = banco(t)
  azzeraLanciatorePerProve()
  const righe = []
  const p = L.lanciaComando(`${NODE} -e "setTimeout(()=>require('fs').writeFileSync('vivo.txt',''),3000)"`, { shell: true, cwd: c, windowsHide: true }, { log: (r) => righe.push(r) })
  p.stdout.resume(); p.stderr.resume(); p.on('error', () => {})
  assert.ok(await aspetta(() => p.pidShell !== null, 4_000), 'premessa: «avvio»')
  p.figlio.stdio[4].end()
  await attendi(100)
  assert.equal(p.inSfondo(), false)
  assert.equal(righe.filter((r) => /\(sfondo\)$/u.test(r)).length, 1, righe.join(' | '))
  p.figlio.kill() // il lanciatore, dalla maniglia di questa prova
  await attendi(4_000)
  assert.equal(existsSync(join(c, 'vivo.txt')), false, 'come dice il log: il comando si è fermato col lanciatore')
})

test('LANC-G-11: Windows rifiuta l appoggio (guasto di prova): il log lo dice, e un comando in primo piano non si ferma più col lanciatore', conProve, async (t) => {
  const c = banco(t)
  azzeraLanciatorePerProve()
  const righe = []
  const env = { ...process.env, TALOS_LANCIATORE_GUASTI: 'appoggio' }
  const p = L.lanciaComando(`${NODE} -e "setTimeout(()=>require('fs').writeFileSync('vivo.txt',''),3000)"`, { shell: true, cwd: c, windowsHide: true, env },
    { log: (r) => righe.push(r), ambiente: { ...process.env, TALOS_LANCIATORE: EXE_PROVE } })
  p.stdout.resume(); p.stderr.resume(); p.on('error', () => {})
  assert.ok(await aspetta(() => p.pidShell !== null, 4_000), 'premessa: «avvio»')
  await attendi(200)
  const appoggio = righe.filter((r) => /\(appoggio\)$/u.test(r))
  assert.equal(appoggio.length, 1, righe.join(' | '))
  assert.match(appoggio[0], /foreground .*does not stop when the helper or TALOS stops/u)
  p.figlio.kill()
  assert.ok(await aspetta(() => existsSync(join(c, 'vivo.txt')), 7_000), 'come dice il log: il comando in primo piano continua senza il lanciatore')
})

/* ———————————————————— l exe di rilascio ignora i guasti ———————————————————— */
test('LANC-G-07: l exe di rilascio IGNORA i guasti di prova (il codice non c è: la variabile non compare nel file); la build pubblica non passa `--features`', conTutti, async (t) => {
  assert.equal(readFileSync(EXE).includes('TALOS_LANCIATORE_GUASTI'), false, 'exe di rilascio: nessuna traccia dei guasti')
  assert.equal(readFileSync(EXE_PROVE).includes('TALOS_LANCIATORE_GUASTI'), true, 'premessa: l exe di prova li ha')
  const c = banco(t)
  const l = lancia(EXE, 'exit 0', c, 'job,appoggio,termina,riaggancia')
  const a = await l.avvio()
  assert.deepEqual({ nipoti: a?.nipoti, appoggio: a?.appoggio }, { nipoti: true, appoggio: undefined }, 'col rilascio il Job e l appoggio ci sono lo stesso')
  await l.entro(5_000)
  const lp = lancia(EXE_PROVE, 'exit 0', c, 'appoggio')
  assert.equal((await lp.avvio())?.appoggio, false, 'premessa: con l exe di prova lo stesso guasto si vede')
  await lp.entro(5_000)
  const flusso = readFileSync(new URL('../../.github/workflows/lanciatore.yml', import.meta.url), 'utf8')
  const righeCargo = flusso.split(/\r?\n/u).filter((r) => /\bcargo (build|test)\b/u.test(r))
  assert.ok(righeCargo.length >= 3, 'premessa: le righe di cargo della build pubblica')
  for (const r of righeCargo) assert.doesNotMatch(r, /--features|--all-features|guasti/u, r.trim())
})

/* ———————————————————— giudice v1796: senza impronta la strada non è attiva ———————————————————— */
test('LANC-G-08: il riferimento del repo non è ancora fissato e lì la strada non è attiva; lo stesso exe col riferimento fissato alla sua impronta sì', (t) => {
  const rif = JSON.parse(readFileSync(new URL('../native/lanciatore-binding.json', import.meta.url), 'utf8'))
  assert.equal(rif.sha256, null, 'oggi l impronta non è fissata: la fissa la build di rilascio dalla prima corsa pubblica di lanciatore.yml')
  const cartella = mkdtempSync(join(tmpdir(), 'talos-lanc-rif-'))
  t.after(() => rimuoviCartellaDiProvaAttesa(cartella))
  const exe = join(cartella, NOME_LANCIATORE)
  if (EXE && existsSync(EXE)) copyFileSync(EXE, exe); else writeFileSync(exe, 'un exe qualunque')
  const repo = new URL('../native/lanciatore-binding.json', import.meta.url)
  assert.deepEqual(trovaLanciatore({ ambiente: {}, candidati: [exe], riferimenti: [repo] }), { percorso: null, motivo: 'non-fissato' }, 'senza impronta: non attiva')
  const fissato = join(cartella, 'lanciatore-binding.json')
  writeFileSync(fissato, JSON.stringify({ ...rif, sha256: createHash('sha256').update(readFileSync(exe)).digest('hex') }))
  assert.deepEqual(trovaLanciatore({ ambiente: {}, candidati: [exe], riferimenti: [fissato] }), { percorso: exe, motivo: null }, 'con l impronta: attiva')
  writeFileSync(fissato, JSON.stringify({ ...rif, sha256: 'a'.repeat(64) }))
  assert.deepEqual(trovaLanciatore({ ambiente: {}, candidati: [exe], riferimenti: [fissato] }), { percorso: null, motivo: 'impronta' }, 'con un impronta diversa: no')
  assert.equal(typeof ProcessoLanciato, 'function')
})

/* ———————————————————— cura unica, mutanti R7 e R-b: il lanciatore non esce mentre la risposta a «ferma» è a metà ———————————————————— */
// Misurato prima della cura: col terzo ripiego 1 volta su 5 in primo piano nessuna risposta (il filo principale vedeva il gruppo vuoto
// ed usciva prima che il filo di «ferma» scrivesse). ⛔ Quinto giro (13/11/2026, revisore: R-b, cioè l attesa a 0, viveva perché cinque
// giri prendevano la gara solo a volte): il momento ora lo forza l aggancio di prova `tarda=<ms>` (solo nell exe dei guasti): il filo
// di «ferma» ha chiuso il gruppo e aspetta prima di rispondere, quindi il filo principale vede SEMPRE il gruppo vuoto prima della
// risposta. Un giro per prova; la prova controlla anche che l aggancio abbia agito (la risposta arriva dopo l attesa).
const TARDA_MS = 1_000
for (const [id, guasti, cosa] of [
  ['12', 'job', 'senza Job (forzato): la shell si chiude per prima, poi i programmi presi'],
  ['13', 'termina,riaggancia', 'col terzo ripiego: i membri confermati uno per uno'],
  ['15', '', 'col Job e TerminateJobObject riuscito (la strada di sempre)'],
]) {
  test(`LANC-G-${id}: ${cosa}; con la risposta trattenuta apposta, la risposta «ferma» arriva SEMPRE prima dell uscita del lanciatore, e niente resta acceso`, { ...conProve, timeout: 60_000 }, async (t) => {
    const c = banco(t)
    const l = lancia(EXE_PROVE, `start "" /b ${prog('a')} & start "" /b ${prog('b')} & start "" /b ${prog('x')} & ${prog('y')}`, c, [guasti, `tarda=${TARDA_MS}`].filter(Boolean).join(','))
    await l.avvio()
    const p = [await aspettaPid(c, 'a'), await aspettaPid(c, 'b'), await aspettaPid(c, 'x'), await aspettaPid(c, 'y')]
    const t0 = Date.now()
    const risposta = await l.ferma()
    const dopo = Date.now() - t0
    assert.ok(await l.entro(5_000), 'il lanciatore esce')
    await attendi(500)
    const vivi = p.filter(vivo).length
    if (vivi) writeFileSync(join(c, 'stop.txt'), '')
    assert.equal(risposta, true, 'la risposta «ferma» arriva ed è true, anche se il gruppo era già vuoto da un secondo')
    assert.ok(dopo >= TARDA_MS - 100, `premessa: l aggancio di prova ha trattenuto la risposta (${dopo} ms)`)
    assert.equal(vivi, 0, 'nessun programma resta acceso')
  })
}

/* ———————————————————— quinto giro, mutante R-m: il terzo ripiego coi nipoti orfani ———————————————————— */
// Revisore dopo la cura unica (13/11/2026): con `chiudi_membri_del_job` sostituito dalla fotografia dell albero (R-m) lo Stop rispondeva
// ferma:true 5 volte su 5 con 20 programmi su 20 ancora accesi: un programma il cui padre (una cmd interna) è già uscito non sta
// nell albero, ma sta nel Job. Qui i nipoti orfani: `cmd /d /c start "" /b <programma>` esce subito e lascia il programma senza padre.
// ⛔ Lo Stop non risponde MAI ferma:true con un programma ancora acceso.
const orfano = (nome) => `cmd /d /c start "" /b ${prog(nome)}`
for (const [dove, comando] of [
  ['primo-piano', `${orfano('a')} & ${orfano('b')} & ${prog('y')}`],
  ['sottofondo', `${orfano('a')} & ${orfano('b')} & ${prog('y')}`],
  ['shell-uscita', `${orfano('a')} & ${orfano('b')} & exit 0`],
]) {
  test(`LANC-G-14-${dove}: col terzo ripiego (guasti di prova) i nipoti ORFANI, il cui padre è già uscito, si chiudono anche loro: mai ferma:true con un programma acceso (R-m)`, conProve, async (t) => {
    const c = banco(t)
    const l = lancia(EXE_PROVE, comando, c, 'termina,riaggancia')
    await l.avvio()
    const p = [await aspettaPid(c, 'a'), await aspettaPid(c, 'b')]
    if (dove === 'shell-uscita') assert.ok(await aspetta(() => l.righe.some((r) => Number.isInteger(r.uscita)), 6_000), 'premessa: la shell è uscita, restano solo gli orfani')
    else p.push(await aspettaPid(c, 'y'))
    if (dove === 'sottofondo') { assert.ok(l.scrivi('sfondo')); await attendi(300) }
    const risposta = await l.ferma()
    await attendi(800)
    const vivi = p.filter(vivo).length
    if (vivi) writeFileSync(join(c, 'stop.txt'), '') // rossa: i programmi si fermano da soli, mai per numero
    assert.notDeepEqual({ risposta, vivi: vivi > 0 }, { risposta: true, vivi: true }, `${dove}: ferma:true con ${vivi} programmi accesi`)
    assert.equal(risposta, true, `${dove}: risposta «ferma» true`)
    assert.equal(vivi, 0, `${dove}: nessun programma resta acceso, nemmeno gli orfani`)
    assert.ok(await l.entro(3_000), `${dove}: svuotato il gruppo il lanciatore esce`)
  })
}
