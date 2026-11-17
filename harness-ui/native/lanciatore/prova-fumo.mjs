/*
 * La prova di fumo del lanciatore, senza dipendenze: la gira la costruzione (`.github/workflows/lanciatore.yml`) sull'exe appena
 * compilato, prima dell'impronta e dell'attestazione, e chi lo costruisce in locale. Uso: `node prova-fumo.mjs <exe>`.
 * Undici fatti (forma §1, §10.1; dal quinto in poi dal giro di cura del 12/11/2026, dall'ottavo in poi dalle cure dopo il ripasso):
 *   1. il codice d'uscita è quello della shell, e sul canale arrivano `avvio`, `uscita` e `albero vuoto`;
 *   2. un nipote staccato (`start "" /b`) tiene l'albero vivo: `albero vuoto` arriva DOPO di lui, non all'uscita della shell;
 *   3. `ferma` scritto sull'entrata del lanciatore (maniglia 4) chiude il Job intero, nipote compreso, e la risposta è `{"ferma":true}`
 *      (giro g4, 13/11/2026: il Job non ha più nome, nessun `--ferma <nome>`); l'entrata chiusa senza `ferma` (il nucleo andato) non
 *      ferma niente;
 *   4. il canale non passa alla shell (§10.1): ucciso il lanciatore, il canale si chiude SUBITO. Strada Codex (owner 13/11/2026
 *      12:45): a comando in PRIMO PIANO il Job tiene KILL_ON_JOB_CLOSE finché la shell gira (Codex `codex-rs/utils/pty/src/win/
 *      job.rs:240-257`), e ucciso il lanciatore shell e nipote si fermano con lui; la riga `sfondo` sull'entrata lo toglie (un comando
 *      in sottofondo continua senza il lanciatore), e uscita la shell il nipote lasciato acceso continua (`preserve_descendants`);
 *   5. senza il canale la riga «avvio» non si può dire, e allora il comando NON parte (il nucleo conta su «nessun avvio ⇒ mai
 *      partito» per rilanciarlo come prima senza farlo girare due volte), e la shell sospesa non resta appesa;
 *   6. l'exe non chiede le librerie C++ di Microsoft (VCRUNTIME140.dll, MSVCP140.dll): Windows non le garantisce e l'app non le
 *      porta, e senza di loro morirebbe prima di partire a ogni comando (CRT statico, `.cargo/config.toml`).
 *   7. il lanciatore non tiene per sé la cartella del comando: vive finché vive l'albero, e una cartella che è «la corrente» di un
 *      processo vivo non si cancella né si rinomina. Uscita la shell dalla cartella, la cartella si può togliere a comando ancora
 *      in corso (misurato il 12/11: senza, le prove che tolgono la cartella appena il comando è fermato erano rosse 4 volte su 8).
 *   8. il comando parte nella cartella chiesta: `cd` risponde la cartella data al lanciatore. Il fatto 7 da solo non lo dice: un
 *      lanciatore che lasciasse la cartella PRIMA di creare la shell lo passerebbe, e ogni comando girerebbe nella cartella dell'exe
 *      (mutante B7 del revisore B, che moriva solo sulla prova LANC-16 del nucleo).
 *   9. un lanciatore ucciso nei suoi primi millisecondi non lascia una shell sospesa per sempre (revisore B, 12/11: 15 su 160 fra
 *      16 e 20 ms dal lancio). Si uccide a ritardi che scorrono dalla metà a poco oltre il tempo che «avvio» impiega QUI, con una
 *      copia della shell dal nome solo nostro: ciò che resta si conta per nome d'immagine e si chiude per PID.
 *      E senza contare sulla fortuna dei millisecondi: il lanciatore FERMATO sulla riga «avvio» (il suo canale è un tubo già
 *      pieno), con la shell sospesa, e ucciso lì: la shell muore con lui e il comando non parte.
 *  10. due lanciatori insieme hanno ciascuno il SUO Job, senza nome: il «ferma» dato al secondo non tocca il comando del primo (prima
 *      del giro g4 un nome già preso lasciava il secondo senza Job, e il suo «ferma» per nome chiudeva il gruppo del primo). Il
 *      comando chiuso da «ferma» esce col codice 1; e dopo `sfondo` l'entrata legge ancora «ferma» (cura dei gialli, 13/11/2026).
 *  11. una shell che non parte (qui: un percorso che non esiste) si dice con la riga d'errore e il codice di Windows, senza «avvio».
 * Il fatto 4 non lascia vivi shell e ping: se un exe guasto li lascia, li chiude per PID (quello della shell, viva) prima del giudizio.
 * Tetto di 60 s: una shell che non riparte (sospesa) o un albero che non si svuota sono rossi, non un'attesa infinita.
 */
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { closeSync, copyFileSync, existsSync, mkdtempSync, openSync, readFileSync, realpathSync, rmdirSync, rmSync, write, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'

const exe = process.argv[2]
if (!exe || !isAbsolute(exe)) { console.error('uso: node prova-fumo.mjs <percorso assoluto dell exe>'); process.exit(2) }
const SISTEMA = join(process.env.SystemRoot || 'C:\\Windows', 'System32')
const cmd = join(SISTEMA, 'cmd.exe')
/* Un rosso non lascia niente acceso. Node chiude da sé il lanciatore (suo figlio diretto) quando questa prova esce, ma non la shell: e
   un exe guasto può averla lasciata SOSPESA (annunciata e mai fatta ripartire), che nessuno chiuderebbe più. Dei lanci ancora vivi si
   chiude allora la shell annunciata, per PID, con ciò che ha sotto: solo finché il lanciatore vive e non ne ha detto l'uscita (un PID
   già uscito non si tocca: Windows lo riusa). */
const accesi = new Set()
const rosso = (cosa) => {
  console.error(`ROSSO: ${cosa}`)
  for (const l of accesi) {
    const shell = l.righe.find((r) => Number.isSafeInteger(r.avvio))?.avvio
    if (shell && !l.righe.some((r) => Number.isSafeInteger(r.uscita))) spawnSync(join(SISTEMA, 'taskkill.exe'), ['/PID', String(shell), '/T', '/F'], { windowsHide: true })
  }
  process.exit(1)
}
setTimeout(() => rosso('tetto di 60 s superato'), 60_000).unref()
const entro = (promessa, ms) => Promise.race([promessa.then(() => true), new Promise((r) => setTimeout(() => r(false), ms))])

function lancia(comando) {
  const figlio = spawn(exe, [], {
    windowsHide: true, windowsVerbatimArguments: true, stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe'],
    argv0: `"${exe}" "${cmd}" ${cmd} /d /s /c "${comando}"`,
  })
  figlio.stdio[4].on('error', () => {})
  const righe = []
  const t0 = Date.now()
  let resto = ''
  figlio.stdio[3].setEncoding('utf8')
  figlio.stdio[3].on('data', (d) => {
    resto += d
    let a
    while ((a = resto.indexOf('\n')) >= 0) { righe.push({ ms: Date.now() - t0, ...JSON.parse(resto.slice(0, a)) }); resto = resto.slice(a + 1) }
  })
  figlio.stdout.resume(); figlio.stderr.resume()
  const fine = new Promise((r) => figlio.on('exit', (codice) => r(codice)))
  const canaleChiuso = new Promise((r) => figlio.stdio[3].on('close', () => r(Date.now())))
  // i tubi dell'uscita si chiudono quando non li tiene più NESSUNO: né il lanciatore, né la shell, né ciò che la shell ha lasciato
  const tubiChiusi = Promise.all([figlio.stdout, figlio.stderr].map((t) => new Promise((r) => t.once('close', r))))
  const l = { righe, fine, figlio, canaleChiuso, tubiChiusi }
  accesi.add(l)
  figlio.on('exit', () => accesi.delete(l))
  return l
}
/* «ferma» sull'entrata del lanciatore (maniglia 4); torna la risposta (`true`/`false`) o `null` se non arriva in 5 s. `righe`: le righe
   del canale già lette (quelle di `lancia`), o una funzione che le dà. */
const ferma = async (figlio, righe) => {
  const leggi = typeof righe === 'function' ? righe : () => righe
  const prima = leggi().filter((r) => typeof r.ferma === 'boolean').length
  figlio.stdio[4].write('ferma\n')
  for (const t0 = Date.now(); Date.now() - t0 < 5_000; await new Promise((r) => setTimeout(r, 20))) {
    const risposte = leggi().filter((r) => typeof r.ferma === 'boolean')
    if (risposte.length > prima) return risposte.at(-1).ferma
  }
  return null
}
const righeDi = (testo) => testo.split('\n').filter(Boolean).map((r) => { try { return JSON.parse(r) } catch { return {} } })
const controlla = (vero, cosa) => { if (!vero) rosso(cosa); console.log(`ok: ${cosa}`) }
const albero = (righe) => righe.find((r) => r.albero === 'vuoto')

{
  const l = lancia('echo uno & exit 3')
  const codice = await l.fine
  controlla(codice === 3, `il codice è quello della shell (${codice})`)
  controlla(Number.isInteger(l.righe[0]?.avvio) && l.righe[0].nipoti === true, 'riga di avvio col PID della shell, nipoti seguiti')
  controlla(l.righe.some((r) => r.uscita === 3) && albero(l.righe), 'righe di uscita e di albero vuoto')
}
{
  const l = lancia('start "" /b ping -n 3 127.0.0.1 >nul & exit 0')
  await l.fine
  const uscita = l.righe.find((r) => r.uscita === 0)
  controlla(uscita && albero(l.righe) && albero(l.righe).ms - uscita.ms >= 1_000, 'un nipote staccato tiene l albero vivo dopo l uscita della shell')
}
{
  const l = lancia('start "" /b ping -n 30 127.0.0.1 >nul & exit 0')
  while (!l.righe.some((r) => r.uscita === 0)) await new Promise((r) => setTimeout(r, 50))
  const prima = Date.now()
  controlla(await ferma(l.figlio, l.righe) === true, '«ferma» sull entrata del lanciatore: risposta {"ferma":true}')
  await l.fine
  controlla(albero(l.righe) && Date.now() - prima < 5_000, '«ferma» chiude il Job intero, nipote compreso')
}
{
  // l'entrata chiusa senza «ferma» (il nucleo andato: TALOS chiuso o aggiornato) non ferma niente: il nipote vive fino alla sua fine
  const l = lancia('start "" /b ping -n 3 127.0.0.1 >nul & exit 0')
  while (!l.righe.some((r) => r.uscita === 0)) await new Promise((r) => setTimeout(r, 50))
  const prima = Date.now()
  l.figlio.stdio[4].end()
  await l.fine
  controlla(albero(l.righe) && Date.now() - prima >= 1_000 && !l.righe.some((r) => typeof r.ferma === 'boolean'), 'l entrata chiusa senza «ferma» non ferma niente: il nipote finisce da solo')
}
{
  const l = lancia('start "" /b ping -n 30 127.0.0.1 >nul & ping -n 30 127.0.0.1 >nul & exit 0')
  while (!l.righe.some((r) => Number.isInteger(r.avvio))) await new Promise((r) => setTimeout(r, 20))
  await new Promise((r) => setTimeout(r, 150)) // la shell è ripartita da un pezzo e gira in primo piano
  const prima = Date.now()
  l.figlio.kill() // TerminateProcess del solo lanciatore: la sola maniglia del Job si chiude con lui
  const chiuso = await l.canaleChiuso
  // strada Codex: a comando in primo piano il Job ha KILL_ON_JOB_CLOSE, e shell e nipote muoiono con il lanciatore (i tubi si chiudono)
  const fermati = await entro(l.tubiChiusi, 2_000)
  // un exe guasto li lascia vivi: la pulizia PRIMA del giudizio, per PID (quello della riga «avvio»: la shell è viva, il suo PID non
  // può essere di un altro), con l'albero che ha sotto
  if (!fermati) spawnSync(join(SISTEMA, 'taskkill.exe'), ['/PID', String(l.righe.find((r) => Number.isInteger(r.avvio)).avvio), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
  controlla(chiuso - prima < 1_000, `il canale si chiude con il lanciatore, non con la shell (${chiuso - prima} ms)`)
  controlla(fermati, 'ucciso il lanciatore a comando in primo piano, la shell e il nipote si fermano con lui (strada Codex)')
}
{
  // «sfondo» sull'entrata (il nucleo ha mandato il comando in sottofondo) toglie KILL_ON_JOB_CLOSE: il comando continua senza il lanciatore
  const l = lancia('ping -n 3 127.0.0.1 >nul & exit 0')
  l.figlio.stdio[4].write('sfondo\n')
  while (!l.righe.some((r) => Number.isInteger(r.avvio))) await new Promise((r) => setTimeout(r, 20))
  await new Promise((r) => setTimeout(r, 150))
  l.figlio.kill()
  const sopravvive = !(await entro(l.tubiChiusi, 500))
  const finito = await entro(l.tubiChiusi, 5_000)
  controlla(sopravvive && finito, 'dopo «sfondo», ucciso il lanciatore, il comando in sottofondo continua e finisce da solo')
}
{
  // uscita la shell, il nipote che ha lasciato acceso sopravvive al lanciatore (Codex `preserve_descendants`, `job.rs:240-257`)
  const l = lancia('start "" /b ping -n 3 127.0.0.1 >nul & exit 0')
  while (!l.righe.some((r) => r.uscita === 0)) await new Promise((r) => setTimeout(r, 20))
  l.figlio.kill()
  const sopravvive = !(await entro(l.tubiChiusi, 500))
  const finito = await entro(l.tubiChiusi, 5_000)
  controlla(sopravvive && finito, 'uscita la shell, ucciso il lanciatore, il nipote lasciato acceso continua e finisce da solo')
}
{
  // due modi di non poter dire «avvio»: senza la maniglia 3 (tre tubi soli, come chi lancia l'exe a mano), e con una maniglia 3 su
  // cui non si può scrivere (un file aperto in sola lettura: la scrittura fallisce, come con un canale rotto)
  const dir = mkdtempSync(join(tmpdir(), 'talos-lanciatore-fumo-'))
  writeFileSync(join(dir, 'sola-lettura.txt'), '')
  const solaLettura = openSync(join(dir, 'sola-lettura.txt'), 'r')
  for (const [caso, stdio] of [['senza canale', ['ignore', 'pipe', 'pipe']], ['canale che non si scrive', ['ignore', 'pipe', 'pipe', solaLettura]]]) {
    const nome = `girato-${stdio.length}.txt`
    const figlio = spawn(exe, [], {
      windowsHide: true, windowsVerbatimArguments: true, stdio, cwd: dir,
      argv0: `"${exe}" "${cmd}" ${cmd} /d /s /c "echo girato> ${nome}"`,
    })
    // una shell rimasta sospesa tiene aperti i tubi che ha ereditato: è da lì che la si vede (il Job non ha nome: uscito il
    // lanciatore, che ne teneva la sola maniglia, nessuno lo raggiunge più)
    let tubiChiusi = 0
    for (const t of [figlio.stdout, figlio.stderr]) { t.once('close', () => { tubiChiusi += 1 }); t.resume() }
    const codice = await new Promise((r) => figlio.on('exit', (c) => r(c)))
    await new Promise((r) => setTimeout(r, 1_000))
    const girato = existsSync(join(dir, nome))
    const restaUnaShell = tubiChiusi < 2
    if (girato || restaUnaShell || (codice >>> 0) !== 0xC0DE0003) { closeSync(solaLettura); try { rmSync(dir, { recursive: true, force: true }) } catch { /* la pulizia non decide l'esito */ } }
    controlla((codice >>> 0) === 0xC0DE0003, `${caso}: il lanciatore esce col suo codice (${(codice >>> 0).toString(16)})`)
    controlla(!girato, `${caso}: senza la riga «avvio» il comando non parte`)
    controlla(!restaUnaShell, `${caso}: non resta una shell sospesa coi tubi in mano${restaUnaShell ? ' (un cmd.exe sospeso è rimasto: va chiuso a mano)' : ''}`)
  }
  closeSync(solaLettura)
  try { rmSync(dir, { recursive: true, force: true }) } catch { /* la pulizia non decide l'esito */ }
}
{
  const dir = mkdtempSync(join(tmpdir(), 'talos-lanciatore-fumo-'))
  const figlio = spawn(exe, [], {
    windowsHide: true, windowsVerbatimArguments: true, stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe'], cwd: dir,
    argv0: `"${exe}" "${cmd}" ${cmd} /d /s /c "cd /d %SystemRoot% & ping -n 4 127.0.0.1 >nul"`,
  })
  figlio.stdio[4].on('error', () => {})
  let canale = ''
  figlio.stdio[3].setEncoding('utf8'); figlio.stdio[3].on('data', (d) => { canale += d })
  figlio.stdout.resume(); figlio.stderr.resume()
  const fine = new Promise((r) => figlio.on('exit', r))
  while (!canale.includes('"avvio"')) await new Promise((r) => setTimeout(r, 20))
  // la shell esce dalla cartella in pochi ms; le si lascia fino a 1,5 s, a comando ancora in corso (il ping ne dura 3)
  let tolta = false, errore = null
  for (const t0 = Date.now(); !tolta && Date.now() - t0 < 1_500;) {
    try { rmdirSync(dir); tolta = true } catch (e) { errore = e.code; await new Promise((r) => setTimeout(r, 50)) }
  }
  const ancoraInCorso = !canale.includes('"uscita"')
  if (!tolta) { await ferma(figlio, () => righeDi(canale)); await fine; try { rmSync(dir, { recursive: true, force: true }) } catch { /* la pulizia non decide l'esito */ } }
  controlla(tolta && ancoraInCorso, `la cartella del comando si toglie a comando in corso: il lanciatore non la tiene (${tolta ? 'tolta' : errore})`)
  await fine
}
{
  const dir = mkdtempSync(join(tmpdir(), 'talos-lanciatore-fumo-'))
  const figlio = spawn(exe, [], {
    windowsHide: true, windowsVerbatimArguments: true, stdio: ['ignore', 'pipe', 'pipe', 'pipe'], cwd: dir,
    argv0: `"${exe}" "${cmd}" ${cmd} /d /s /c "cd"`,
  })
  let detto = ''
  figlio.stdout.setEncoding('utf8').on('data', (d) => { detto += d })
  figlio.stderr.resume(); figlio.stdio[3].resume()
  const codice = await new Promise((r) => figlio.on('close', (c) => r(c)))
  const stessa = (a, b) => { try { return realpathSync.native(a).toLowerCase() === realpathSync.native(b).toLowerCase() } catch { return false } }
  const dove = detto.trim()
  const giusta = codice === 0 && stessa(dove, dir)
  try { rmSync(dir, { recursive: true, force: true }) } catch { /* la pulizia non decide l'esito */ }
  controlla(giusta, `il comando parte nella cartella chiesta: «cd» risponde ${dove}`)
}
{
  const dir = mkdtempSync(join(tmpdir(), 'talos-lanciatore-fumo-'))
  const immagine = `talos-fumo-${randomBytes(4).toString('hex')}.exe`
  const guscio = join(dir, immagine)
  copyFileSync(cmd, guscio)
  const accese = () => String(spawnSync(join(SISTEMA, 'tasklist.exe'), ['/FI', `IMAGENAME eq ${immagine}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true }).stdout ?? '')
    .split(/\r?\n/u).map((r) => /^"([^"]+)","(\d+)"/u.exec(r)).filter((m) => m && m[1].toLowerCase() === immagine).map((m) => Number(m[2]))
  const unGiro = (ritardo) => new Promise((risolvi) => {
    const t0 = performance.now()
    const figlio = spawn(exe, [], {
      windowsHide: true, windowsVerbatimArguments: true, stdio: ['ignore', 'pipe', 'pipe', 'pipe'], cwd: dir,
      argv0: `"${exe}" "${guscio}" ${guscio} /d /s /c "echo x> nul"`,
    })
    let avvio = null
    figlio.stdio[3].on('data', () => { avvio ??= performance.now() - t0 })
    figlio.stdout.resume(); figlio.stderr.resume()
    if (ritardo !== null) {
      while (performance.now() - t0 < ritardo) { /* attesa attiva: un timer non scende sotto il millisecondo */ }
      figlio.kill()
    }
    figlio.on('exit', () => setTimeout(() => risolvi(avvio), 20))
  })
  // quanto ci mette «avvio» su questa macchina, adesso: la mediana di sette lanci lasciati finire (il primo è più lento)
  const tempi = []
  for (let i = 0; i < 7; i += 1) tempi.push(await unGiro(null) ?? 0)
  const tempoDiAvvio = tempi.sort((a, b) => a - b)[3]
  // la shell è sospesa negli ultimi millisecondi PRIMA di «avvio» (il revisore B: fra 16 e 20 ms con «avvio» a ~21): le uccisioni
  // stanno lì, dalla metà del tempo di «avvio» a poco dopo, a passi di un terzo di millisecondo, due passate
  const GIRI = 80
  for (let i = 0; i < GIRI; i += 1) await unGiro((0.5 + 0.6 * (i % 40) / 40) * tempoDiAvvio)
  await new Promise((r) => setTimeout(r, 400))
  const rimaste = accese()
  for (const pid of rimaste) spawnSync(join(SISTEMA, 'taskkill.exe'), ['/PID', String(pid), '/F'], { windowsHide: true, stdio: 'ignore' })
  /* E senza contare sulla fortuna dei millisecondi: il lanciatore FERMATO proprio lì. Il suo canale è un tubo già pieno (una scrittura
     nostra lo riempie e resta in coda, nessuno legge): la riga «avvio» non passa, e lui resta fermo con la shell sospesa. Ucciso lì, la
     shell deve morire con lui. Poi il tubo si svuota e si chiude. */
  const nomeTubo = `\\\\.\\pipe\\talos-fumo-${randomBytes(6).toString('hex')}`
  const lettori = []
  const servente = createServer({ pauseOnConnect: true }, (s) => { s.on('error', () => {}); lettori.push(s) })
  await new Promise((r) => servente.listen(nomeTubo, r))
  const pieno = openSync(nomeTubo, 'w')
  const riempito = new Promise((r) => write(pieno, Buffer.alloc(8 * 1024 * 1024), () => r()))
  await new Promise((r) => setTimeout(r, 200))
  const fermo = spawn(exe, [], {
    windowsHide: true, windowsVerbatimArguments: true, stdio: ['ignore', 'pipe', 'pipe', pieno], cwd: dir,
    argv0: `"${exe}" "${guscio}" ${guscio} /d /s /c "echo x> girato-fermo.txt"`,
  })
  fermo.stdout.resume(); fermo.stderr.resume()
  let fermoUscito = false
  const fineFermo = new Promise((r) => fermo.on('exit', () => { fermoUscito = true; r() }))
  await new Promise((r) => setTimeout(r, 800))
  const sospese = accese()
  const eraFermo = !fermoUscito && sospese.length === 1 && !existsSync(join(dir, 'girato-fermo.txt'))
  fermo.kill()
  await fineFermo
  await new Promise((r) => setTimeout(r, 500))
  const dopoLUccisione = accese()
  for (const pid of dopoLUccisione) spawnSync(join(SISTEMA, 'taskkill.exe'), ['/PID', String(pid), '/F'], { windowsHide: true, stdio: 'ignore' })
  const maiPartito = !existsSync(join(dir, 'girato-fermo.txt'))
  for (const s of lettori) s.resume()
  await entro(riempito, 5_000)
  closeSync(pieno)
  for (const s of lettori) s.destroy()
  await new Promise((r) => servente.close(r))
  for (let i = 0; i < 20 && existsSync(guscio); i += 1) { try { rmSync(dir, { recursive: true, force: true }) } catch { await new Promise((r) => setTimeout(r, 100)) } }
  controlla(eraFermo, `col canale pieno il lanciatore resta fermo sulla riga «avvio», con la shell sospesa e il comando non partito (shell: ${sospese.length})`)
  controlla(dopoLUccisione.length === 0 && maiPartito, `ucciso lì, la shell sospesa muore con lui e il comando non parte${dopoLUccisione.length ? ` (rimasta: chiusa per PID ${dopoLUccisione.join(', ')})` : ''}`)
  controlla(tempoDiAvvio > 0 && rimaste.length === 0, `un lanciatore ucciso fra ${(0.5 * tempoDiAvvio).toFixed(0)} e ${(1.1 * tempoDiAvvio).toFixed(0)} ms dal lancio («avvio» a ${tempoDiAvvio.toFixed(0)}) non lascia una shell sospesa: ${rimaste.length} rimaste su ${GIRI}${rimaste.length ? ` (chiuse per PID: ${rimaste.join(', ')})` : ''}`)
}
{
  // una shell che non esiste: nessun «avvio», la riga d'errore col codice di Windows (2: file non trovato) e il codice del lanciatore
  const manca = join(tmpdir(), `talos-fumo-non-esiste-${randomBytes(4).toString('hex')}.exe`)
  const figlio = spawn(exe, [], { windowsHide: true, windowsVerbatimArguments: true, stdio: ['ignore', 'pipe', 'pipe', 'pipe'], argv0: `"${exe}" "${manca}" ${manca} /d /s /c "exit 0"` })
  let canale = ''
  figlio.stdio[3].setEncoding('utf8').on('data', (d) => { canale += d })
  figlio.stdout.resume(); figlio.stderr.resume()
  const codice = await new Promise((r) => figlio.on('close', (c) => r(c)))
  controlla((codice >>> 0) === 0xC0DE0002 && canale === '{"errore":"avvio","codice":2}\n', `una shell che non parte si dice, senza «avvio» (codice ${(codice >>> 0).toString(16)}, ${canale.trim()})`)
}
{
  // due lanciatori insieme: ognuno ha il SUO Job senza nome, e il «ferma» del secondo non tocca il comando del primo
  const primo = lancia('ping -n 3 127.0.0.1 >nul & exit 4')
  const secondo = lancia('start "" /b ping -n 30 127.0.0.1 >nul & ping -n 30 127.0.0.1 >nul')
  while (!primo.righe.some((r) => Number.isInteger(r.avvio)) || !secondo.righe.some((r) => Number.isInteger(r.avvio))) await new Promise((r) => setTimeout(r, 20))
  const risposta = await ferma(secondo.figlio, secondo.righe)
  const codiceFermato = await secondo.fine
  const codice = await primo.fine
  controlla(risposta === true && primo.righe[0].nipoti === true && secondo.righe[0].nipoti === true && codice === 4 && albero(secondo.righe),
    `due lanciatori, due Job senza nome: il «ferma» del secondo chiude solo il suo albero, il primo finisce da solo (codice ${codice})`)
  // cura dei gialli (13/11): il comando chiuso da «ferma» esce col codice 1, mai come uno finito bene (0)
  controlla(codiceFermato === 1 && secondo.righe.some((r) => r.uscita === 1), `il comando chiuso da «ferma» esce col codice 1 (${codiceFermato})`)
}
{
  // cura dei gialli (13/11): dopo «sfondo» l'entrata legge ancora «ferma» (ogni riga si svuota dopo l'uso, non si incolla alla seguente)
  const l = lancia('start "" /b ping -n 30 127.0.0.1 >nul & ping -n 30 127.0.0.1 >nul & exit 0')
  while (!l.righe.some((r) => Number.isInteger(r.avvio))) await new Promise((r) => setTimeout(r, 20))
  l.figlio.stdio[4].write('sfondo\n')
  await new Promise((r) => setTimeout(r, 150))
  const prima = Date.now()
  const risposta = await ferma(l.figlio, l.righe)
  const fermati = await entro(l.tubiChiusi, 3_000)
  if (!fermati) spawnSync(join(SISTEMA, 'taskkill.exe'), ['/PID', String(l.righe.find((r) => Number.isInteger(r.avvio)).avvio), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
  controlla(risposta === true && fermati, `dopo «sfondo», «ferma» chiude ancora il Job intero (risposta ${risposta}, ${Date.now() - prima} ms)`)
}
{
  const nomi = readFileSync(exe).toString('latin1')
  controlla(!/VCRUNTIME140|MSVCP140/iu.test(nomi), 'l exe non chiede VCRUNTIME140.dll né MSVCP140.dll')
}
console.log('prova di fumo verde')
