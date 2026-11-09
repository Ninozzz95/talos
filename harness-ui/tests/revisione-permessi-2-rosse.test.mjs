/*
 * Revisione avversaria del blocco permessi, secondo giro (04/11/2026 sera), su `fix/permessi-cure-2026-11-04` @ cc3634611.
 * Prove ROSSE dei reperti nuovi, più le guardie che devono restare verdi. Solo decisione: nessun comando si esegue, i percorsi sono
 * parole, `realpathFn` è l'identità; il registro gira con un giro finto e uno store temporaneo. Nessuna chiave, nessun dato vero.
 * Fonti (lette il 04/11/2026): Python issue 41509 e Microsoft Learn «PathCchCanonicalizeEx» (Win32 toglie punti e spazi in coda
 *   all'ultimo pezzo); AOSP MediaProvider `jni/FuseUtils.cpp` e LWN 718640 (la memoria condivisa del telefono emula il FAT: nomi
 *   senza maiuscole).
 * Rapporto: TALOS/desktop/in-corso/REVISIONE-BLOCCO-PERMESSI-2-2026-11-04.md
 */
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { cancellazioneCritica, dimenticaPercorsiVeri } from '../src/kernel/cancellazioni-critiche.mjs'
import { createSessionRegistry } from '../src/session-registry.mjs'

const W = { cartella: 'C:\\Users\\nino\\lavoro\\progetto', home: 'C:\\Users\\nino', piattaforma: 'win32', ambiente: {}, realpathFn: (p) => p }
const U = { cartella: '/home/nino/lavoro/progetto', home: '/home/nino', piattaforma: 'linux', ambiente: {}, realpathFn: (p) => p }
const CASA = '/data/user/0/ai.talos.dev/files/codice-r4'
const A = { cartella: '/storage/emulated/0/Progetti/orca', home: CASA, piattaforma: 'android',
  ambiente: { HOME: CASA, TALOS_HARNESS_UI_PROJECT_DIRS: '/data/user/0/ai.talos.dev/files/codice/workspace' }, realpathFn: (p) => p }
const giudica = (comando, ctx) => { dimenticaPercorsiVeri(); return cancellazioneCritica(comando, ctx) }
const buchi = (casi, ctx) => casi.filter((c) => giudica(c, ctx) === null)

test('R2-P1 ROSSA — POSIX: le parole chiave della shell (`then`, `do`, `else`) nascondono il rm che segue', () => {
  assert.deepEqual(buchi([
    'if [ -d .. ]; then rm -rf ..; fi',
    'for d in build ..; do rm -rf "$d"; done',
    'while true; do rm -rf ..; break; done',
    'if false; then :; else rm -rf ..; fi',
  ], U), [])
})

test('R2-P2 ROSSA — Windows/PowerShell: grafie a parole fisse che passano senza carta', () => {
  assert.deepEqual(buchi([
    'cmd /c"rd /s /q C:\\Users\\nino\\lavoro\\progetto"', // `/c` attaccato al comando
    'iex "Remove-Item -Recurse -Force C:\\Users\\nino\\lavoro\\progetto"', // l'eval di PowerShell
    'Invoke-Expression \'Remove-Item -Recurse ..\'',
    'start /b cmd /c rd /s /q C:\\Users\\nino\\lavoro\\progetto', // `start` di cmd
    'Start-Process cmd -ArgumentList \'/c rd /s /q ..\'',
    'gci .. | % { ri $_ -r -fo }', // la pipe con ForEach-Object
    'Get-ChildItem C:\\Users\\nino\\lavoro\\progetto | ForEach-Object { Remove-Item $_.FullName -Recurse -Force }',
    'Remove-Item -Recurse -Force (Join-Path $env:USERPROFILE "lavoro\\progetto")', // l'argomento fra parentesi
    'Remove-Item -Recurse -Force -Path (Get-Location)',
    'powershell -c "& {Remove-Item -Recurse C:\\Users\\nino}"', // il blocco attaccato alla graffa
    'pwsh -wd C:\\Users -c "Remove-Item -Recurse nino"', // -WorkingDirectory cambia la cartella
    'rd /s /q C:\\Users\\nino\\lavoro\\progetto.', // Win32 toglie il punto in coda
  ], W), [])
})

test('R2-P3 ROSSA — la variabile assegnata NELLO STESSO testo e la shell che legge da stdin', () => {
  assert.deepEqual(buchi(['D=..; rm -rf $D', 'D=/home/nino/lavoro/progetto; rm -rf "$D"', "echo 'rm -rf ..' | bash", "bash <<< 'rm -rf ..'",
    "sh -c 'rm -rf \"$1\"' _ /home/nino/lavoro/progetto", 'find .. -maxdepth 0 -exec rm -rf {} +'], U), [])
  assert.deepEqual(buchi(['$d = "C:\\Users\\nino\\lavoro\\progetto"; Remove-Item -Recurse -Force $d'], W), [])
})

test('R2-C1 ROSSA — carte in più (regola 17): il lavoro normale in Accesso pieno non chiede', () => {
  const carte = (casi, ctx) => casi.filter((c) => giudica(c, ctx) !== null)
  assert.deepEqual(carte([
    'Get-ChildItem -Recurse -Filter *.log | Remove-Item', // il filtro decide cosa arriva alla pipe
    'Get-ChildItem -Recurse -Include *.tmp,*.bak | Remove-Item -Force',
    'pwsh -c "gci | Remove-Item -Recurse -Filter *.bak"',
  ], W), [])
  assert.deepEqual(carte([
    'cd "$(git rev-parse --show-toplevel)" && rm -rf build', // la radice del repo: il progetto o una madre, mai ignota
    'cd $(mktemp -d) && git clone https://example.invalid/x.git && rm -rf x', // una cartella nuova e vuota
  ], U), [])
})

test('R2-C1 GUARDIA — ciò che la cura ha preso resta preso (deve restare VERDE)', () => {
  assert.equal(giudica('Get-ChildItem | Remove-Item -Recurse', W)?.perche, 'progetto')
  assert.equal(giudica('cd "$UNA_IGNOTA" && rm -rf .', U)?.perche, 'sostituzione')
  assert.equal(giudica('cmd /c cmd /c cmd /c cmd /c cmd /c cmd /c rd /s /q C:\\Users\\nino\\lavoro\\progetto', W)?.perche, 'troppo-annidato')
})

test('R2-T1 ROSSA — telefono: la memoria condivisa non bada alle maiuscole, il progetto scritto con altre maiuscole resta il progetto', () => {
  assert.deepEqual(buchi(['rm -rf /storage/emulated/0/progetti/orca', 'rm -rf /sdcard/PROGETTI/ORCA', 'rm -rf /storage/emulated/0/Progetti/Orca'], A), [])
})

test('R2-T2 ROSSA (BASSA) — la cartella del progetto elencata in TALOS_HARNESS_UI_PROJECT_DIRS (PC) si chiama «progetto», non «tutti i progetti»', () => {
  const pc = { ...W, ambiente: { TALOS_HARNESS_UI_PROJECT_DIRS: 'C:\\Users\\nino\\lavoro\\progetto' } }
  assert.equal(giudica('rd /s /q .', pc)?.perche, 'progetto')
})

const finito = { esito: 'completato', motivo: 'fine' }
function banco(t, opzioni = {}) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-rev2-banco-'))
  const corse = []
  const registro = createSessionRegistry({ cartellaStore: mkdtempSync(join(tmpdir(), 'talos-rev2-store-')), modello: 'fixture', chiave: 'fixture',
    guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true, ...opzioni,
    preparaEsecuzioneFn: (id) => ({ ok: true, cartella: radice, task: { id, consegna: 'Verifica.' }, comandoProva: null }),
    preparaEsecuzioneLiberaFn: (_c, { consegna }) => ({ ok: true, cartella: radice, task: { id: 'libero', consegna }, comandoProva: null }),
    avviaSessioneFn: async (input) => { corse.push(input); input.onEvento({ type: 'RunStarted' }); input.onEvento({ type: 'RunFinished' })
      return { ok: true, esito: { ...finito, messaggiFinali: [{ role: 'user', content: 'Verifica.' }, { role: 'assistant', content: 'ok' }] } } } })
  t.after(() => registro.chiudi())
  return { registro, corse, radice }
}
const pausa = () => new Promise((r) => { setTimeout(r, 60) })

/*
 * R2-K1 riscritta (forma permessi 2, punto 1, OK di CLI e Performance): la cartella del giro resta allargata alla radice del disco (lo vuole
 * l'Accesso pieno da una cartella dell'elenco), ma il cancello critico riceve il progetto vero (`progettiCritici`). Filo intero: registro
 * vero → agent-service vero → nucleo vero (`talosLavora`), un modello finto che chiede di cancellare il progetto; la persona dice NO.
 * Sulla base: nessuna carta, il comando parte (e cancella la cartella temporanea del banco).
 */
test('R2-K1 — Accesso pieno con una cartella dell\'elenco (`cartellaId`): cancellare il progetto dà la carta «progetto» anche con la cartella allargata', async (t) => {
  const { avviaSessione } = await import('../src/agent-service.mjs')
  const { talosLavora } = await import('../src/kernel/talosHarness.mjs')
  const { realpathSync, existsSync } = await import('node:fs')
  const radice = realpathSync.native(mkdtempSync(join(tmpdir(), 'talos-rev2-k1-')))
  const comando = process.platform === 'win32' ? `Remove-Item -Recurse -Force "${radice}"` : `rm -rf '${radice}'`
  /* il giro del desktop chiede lo streaming: due risposte SSE nel formato di chat/completions */
  const sse = (...pezzi) => new Response(pezzi.map((p) => `data: ${JSON.stringify(p)}\n\n`).join('') + 'data: [DONE]\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } })
  const risposte = [
    () => sse({ choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'k1', type: 'function', function: { name: 'shell', arguments: JSON.stringify({ comando }) } }] }, finish_reason: null }] },
      { choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 1, completion_tokens: 1 } }),
    () => sse({ choices: [{ index: 0, delta: { role: 'assistant', content: 'fatto' }, finish_reason: null }] },
      { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } })]
  let indice = 0
  const fetchDiRete = async () => risposte[Math.min(indice++, risposte.length - 1)]()
  let cartellaDelGiro = null
  let fine
  const finito2 = new Promise((r) => { fine = r })
  const registro = createSessionRegistry({ cartellaStore: mkdtempSync(join(tmpdir(), 'talos-rev2-k1-store-')), modello: 'fixture', chiave: 'fixture',
    guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true, caricaHooksFn: async () => ({ hooks: [] }),
    preparaEsecuzioneLiberaFn: (_c, { consegna }) => ({ ok: true, cartella: radice, task: { id: 'libero', consegna }, comandoProva: null }),
    avviaSessioneFn: async (input) => { try { return await avviaSessione({ ...input, talosLavoraFn: (i) => { cartellaDelGiro = i.cartella; return talosLavora({ ...i, fetchDiRete }) } }) } finally { fine() } } })
  t.after(() => registro.chiudi())
  const carte = []
  const { sessionId } = registro.avviaLibero({ cartellaId: 'default', consegna: 'x', permessi: 'Full access' })
  registro.iscriviti(sessionId, (e) => { if (e.type !== 'ApprovalRequested') return; carte.push(e); registro.rispondiApprovazione(sessionId, e.requestId, false) })
  await Promise.race([finito2, new Promise((r) => { setTimeout(r, 8000) })])
  assert.notEqual(cartellaDelGiro, null, 'il giro è partito')
  assert.notEqual(cartellaDelGiro, radice, 'premessa: la cartella del giro è allargata (radice del disco)')
  assert.equal(existsSync(radice), true, 'il progetto non è stato cancellato')
  assert.deepEqual(carte.map((c) => c.azione?.cancellazioneCritica?.perche), ['progetto'], JSON.stringify(carte.map((c) => c.azione)))
})

test('R2-F1 ROSSA — 173: fidata all\'avvio, poi «No»: il giro dopo resta in Accesso pieno (la fiducia si legge solo quando si sceglie il modo)', async (t) => {
  let fidata = true
  const b = banco(t, { fiduciaDellaCartellaFn: () => fidata })
  const { sessionId } = b.registro.avvia('a', { permessiScelto: 'Full access' })
  await pausa()
  assert.equal(b.corse[0].livelloAccesso, 'accesso-pieno')
  fidata = false // la persona risponde «No» (o toglie la fiducia) a sessione aperta
  await b.registro.resume(sessionId, 'ancora')
  await pausa()
  assert.equal(b.corse.at(-1).livelloAccesso, 'su-richiesta', '173: con «No» in quella cartella si lavora come in Normale')
})

test('R2-F2 — 173: «non ancora chiesta» (null) vale fidata: la domanda deve arrivare PRIMA che il modo si scelga (documenta il contratto)', async (t) => {
  const b = banco(t, { fiduciaDellaCartellaFn: () => null })
  b.registro.avvia('a', { permessiScelto: 'Full access' })
  await pausa()
  assert.equal(b.corse[0].livelloAccesso, 'accesso-pieno')
})
