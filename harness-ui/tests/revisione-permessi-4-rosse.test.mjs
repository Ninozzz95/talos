/*
 * Adversarial review, permissions block, round 4 (cure 208 bis, branch fix/cura-208-bis-2026-11-05 @ 3e8e3fabb), 05/11/2026.
 *
 * Part A (R4-A*): the third-round findings, with spellings and paths of my own (not the ones of R3 nor of the cure's tests).
 *   Red on ed6fdc00f, green on 3e8e3fabb.
 * Part B (R4-B*): what is still open on 3e8e3fabb. RED ON PURPOSE: each one is a finding of the report
 *   (`REVISIONE-BLOCCO-PERMESSI-4-2026-11-05.md`). Every cmd.exe spelling of part B was run in a REAL cmd.exe (spawn with
 *   `shell: true`, like the shell tool) on a scratch folder `padre\progetto` + `padre\sorella`: it deleted the project or the sister.
 * Part G (R4-G*): guards, green on both: rule 17 (the everyday commands stay without a card) and the card-only invariants.
 *
 * Sources (read 05/11/2026): Microsoft `set /?` and docs.microsoft.com archive «Batch File String Substitution with Nested Environment
 * Variables» (`%VAR:str1=str2%`); Microsoft Learn `for` (`/l`, `/f`, `/r`), `forfiles`, `del` (a folder name deletes the files inside
 * it, `/s` in every subfolder); `%=C:%` and `%__CD__%` measured in a real cmd.exe on this PC (they expand to the project and to the
 * project with a trailing backslash); `git(1)` `--work-tree`, `GIT_WORK_TREE`; `git-clean(1)` (`-f` twice); about_Locations
 * (`Push-Location`); Hermes `tools/approval.py:1079-1102` (dangerous-delete patterns, no cmd.exe dynamic variables); Codex
 * `windows_dangerous_commands.rs:256`.
 *
 * Fake APPDATA, no key, no real server, no network.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { cancellazioneCritica, dimenticaPercorsiVeri } from '../src/kernel/cancellazioni-critiche.mjs'
import { createSessionRegistry } from '../src/session-registry.mjs'

const qui = dirname(fileURLToPath(import.meta.url))
const PROGETTO = 'C:\\Users\\nino\\lavoro\\progetto'
const LINK = `${PROGETTO}\\link`
/* `progetto\link` is a junction to the user folder; every other path is itself */
const realpathFn = (p) => (p.toLowerCase().startsWith(LINK.toLowerCase()) ? `C:\\Users\\nino${p.slice(LINK.length)}` : p)
const W = { cartella: PROGETTO, home: 'C:\\Users\\nino', piattaforma: 'win32', ambiente: { USERPROFILE: 'C:\\Users\\nino', TEMP: 'C:\\Users\\nino\\AppData\\Local\\Temp' }, realpathFn }
const giudica = (c) => { dimenticaPercorsiVeri(); return cancellazioneCritica(c, W) }
const senzaCarta = (lista) => lista.filter((c) => giudica(c) === null)

/* ---------------------------------------------------------------- Part A: third round, closed? ---------------------------------- */

test('R4-A1 (ALTO-1) — cmd.exe spellings of my own get a card', () => {
  assert.deepEqual(senzaCarta([
    '@rd /s /q ..',
    'r^d /s /q ..',
    'rd,/s,/q,..',
    'cd.. & rd /s /q progetto',
    'if not exist x rd /s /q ..',
    'for /d %i in (..) do rd /s /q %i',
    'rd /s /q %CD:~0,3%',
    'cmd /v:on /c rd /s /q !CD!\\..',
  ]), [])
})

test('R4-A2 (MEDIA-2) — PowerShell paths through $PWD and Get-Item get a card', () => {
  assert.deepEqual(senzaCarta([
    'powershell -c "Remove-Item -Recurse -Force $pwd.ProviderPath"',
    'powershell -c "$d = Get-Item ..; Remove-Item $d.FullName -Recurse -Force"',
    'powershell -c "$d = Get-Location; Remove-Item -Recurse -Force $d"',
  ]), [])
})

test('R4-A3 (MEDIA-3) — git clean on a critical place gets a card', () => {
  assert.deepEqual(senzaCarta(['git -C ..\\.. clean -ffdx', 'git clean -fdx ..\\..', 'git -C %USERPROFILE% clean -fdx', 'git clean -d -x -f C:\\']), [])
})

test('R4-A4 (MEDIA-4) — deleting through a junction to the user folder gets a card (trailing slash, Remove-Item)', () => {
  assert.deepEqual(senzaCarta(['rd /s /q link\\', 'rm -rf link/', 'powershell -c "Remove-Item -Recurse -Force link"']), [])
})

async function cartaInAttesa(t, carta) {
  const runs = []
  const registry = createSessionRegistry({ cartellaStore: mkdtempSync(join(tmpdir(), 'talos-rev4-')), modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
    preparaEsecuzioneFn: () => ({ cartella: 'C:/progetto', comandoProva: null, task: { id: 'task', consegna: 'x' } }),
    avviaSessioneFn: (input) => { input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' }); runs.push(input); return new Promise(() => {}) } })
  t.after(() => registry.chiudi?.())
  const { sessionId } = registry.avvia('task', { permessiScelto: 'Full access', modalitaOperativaScelta: 'normale' })
  const domanda = runs[0].chiediApprovazioneFn(carta)
  await new Promise((r) => setTimeout(r, 10))
  return { registry, sessionId, domanda, requestId: registry.domandaInAttesa(sessionId)?.requestId }
}
const CRITICA = { tipo: 'shell', comando: 'rd /s /q C:\\Users\\nino', cancellazioneCritica: { percorso: 'C:\\Users\\nino', perche: 'casa' } }

test('R4-A5 (MEDIA-5) — in Full access an automatic yes («modalita») never opens the critical card', async (t) => {
  const { registry, sessionId, domanda, requestId } = await cartaInAttesa(t, CRITICA)
  assert.ok(requestId, 'premise: the card is pending')
  registry.rispondiApprovazione(sessionId, requestId, true, { motivo: 'modalita' })
  const esito = await domanda
  assert.notEqual(esito === true || esito?.approvato === true, true)
})

/* Mobile's question (point 3 of the brief), server half: if a critical card ever carried `wslRoot`, the PC's «Allow just this once»
   sends `ambito: 'volta'` (`legacy/app.js:18399`) and the server refuses it; the card stays pending and only «Deny» works. */
test('R4-A5b (point 3) — `ambito: volta` on a critical card is refused and the card stays pending; a plain yes still works', async (t) => {
  const { registry, sessionId, domanda, requestId } = await cartaInAttesa(t, { ...CRITICA, wslRoot: { distro: 'Ubuntu', utente: 'root' } })
  assert.equal(registry.rispondiApprovazione(sessionId, requestId, true, { ambito: 'volta' }).code, 'QUERY_INVALID')
  assert.equal(registry.domandaInAttesa(sessionId)?.requestId, requestId)
  assert.deepEqual(registry.rispondiApprovazione(sessionId, requestId, true), { ok: true })
  const esito = await domanda
  assert.equal(esito === true || esito?.approvato === true, true)
})

/* MEDIA-6 nearby case: the «No» given WHILE the session is open. The next turn of the same session (resume) offers no project skill. */
test('R4-A6 (MEDIA-6) — «No» given mid-session: the resumed turn offers no project skills', async (t) => {
  const { avviaSessione } = await import('../src/agent-service.mjs')
  const { talosLavora } = await import('../src/kernel/talosHarness.mjs')
  const radice = realpathSync.native(mkdtempSync(join(tmpdir(), 'talos-rev4-a6-')))
  const sse = (...pezzi) => new Response(pezzi.map((p) => `data: ${JSON.stringify(p)}\n\n`).join('') + 'data: [DONE]\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } })
  const fetchDiRete = async () => sse({ choices: [{ index: 0, delta: { role: 'assistant', content: 'ok' }, finish_reason: null }] },
    { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } })
  let fiducia = null
  const offerte = []
  let fine = () => {}
  const registro = createSessionRegistry({ cartellaStore: mkdtempSync(join(tmpdir(), 'talos-rev4-a6-store-')), modello: 'fixture', chiave: 'fixture',
    guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true, caricaHooksFn: async () => ({ hooks: [] }),
    fiduciaDellaCartellaFn: () => fiducia, senzaIstruzioniDelProgettoFn: () => fiducia === false,
    preparaEsecuzioneLiberaFn: (_c, { consegna }) => ({ ok: true, cartella: radice, task: { id: 'libero', consegna }, comandoProva: null }),
    avviaSessioneFn: async (input) => { try { return await avviaSessione({ ...input,
      caricaSkillDisponibiliFn: async () => ({ skills: [{ name: 'deploy', description: 'Push to production.', corpo: 'x' }] }),
      talosLavoraFn: (i) => { offerte.push(i.skillsDisponibili ?? null); return talosLavora({ ...i, fetchDiRete }) } }) } finally { fine() } } })
  t.after(() => registro.chiudi())
  const giro = () => Promise.race([new Promise((r) => { fine = r }), new Promise((r) => { setTimeout(r, 8000) })])
  let attesa = giro()
  const { sessionId } = registro.avviaLibero({ cartellaLibera: radice, consegna: 'x', permessi: 'On request' })
  await attesa
  await new Promise((r) => setTimeout(r, 50))
  assert.equal(offerte.length, 1, 'premise: the first turn ran')
  assert.notEqual(offerte[0], null, 'premise: before the «No» the skills are offered')
  fiducia = false
  attesa = giro()
  await registro.resume(sessionId, 'y', [])
  await attesa
  assert.equal(offerte.length, 2, 'premise: the second turn ran')
  assert.equal(offerte[1], null, 'after the «No» the project skills are still offered')
})

/* ---------------------------------------------------------------- Part B: still open (RED ON PURPOSE) ------------------------- */

test('R4-B1 ROSSA (HIGH) — cmd string substitution `%CD:x=y%` deletes the parent with no card (measured in a real cmd.exe)', () => {
  assert.deepEqual(senzaCarta(['rd /s /q "%CD:\\progetto=%"', 'rd /s /q %CD:\\progetto=%', 'rd /s /q "%USERPROFILE:x=x%"']), [])
})

test('R4-B2 ROSSA (HIGH) — cmd hidden dynamic variables `%=C:%` and `%__CD__%` (measured in a real cmd.exe)', () => {
  assert.deepEqual(senzaCarta(['rd /s /q %=C:%', 'rd /s /q %__CD__%..']), [])
})

test('R4-B3 ROSSA (HIGH) — cmd `for /l`, `for /f`, `for /r` run `rd` on the parent with no card (measured in a real cmd.exe)', () => {
  assert.deepEqual(senzaCarta(['for /l %i in (1,1,1) do rd /s /q ..', 'for /f %i in ("..") do rd /s /q %i', 'for /r .. %i in (.) do rd /s /q "%i"']), [])
})

test('R4-B4 ROSSA (HIGH) — `forfiles /p .. /c "cmd /c rd /s /q @path"` deletes the project and its sisters (measured)', () => {
  assert.deepEqual(senzaCarta(['forfiles /p .. /c "cmd /c rd /s /q @path"', 'forfiles /p .. /c "cmd /c if @isdir==TRUE rd /s /q @path"']), [])
})

test('R4-B5 ROSSA (MEDIUM) — PowerShell `Push-Location ..` / `pushd ..` before a relative delete (measured)', () => {
  assert.deepEqual(senzaCarta(['powershell -c "Push-Location ..; ri -r -fo progetto"', 'powershell -c "pushd ..; Remove-Item -Recurse -Force progetto"']), [])
})

test('R4-B6 ROSSA (MEDIUM) — `git --work-tree=..` / `GIT_WORK_TREE=..` turn `git clean -ffdx` on the project .git (measured: .git and src deleted)', () => {
  assert.deepEqual(senzaCarta(['git --work-tree=.. clean -ffdx', 'git --work-tree .. clean -ffdx', 'set GIT_WORK_TREE=..&& git clean -ffdx', 'git --work-tree=.. clean -ffdx :/']), [])
})

test('R4-B7 ROSSA (MEDIUM) — cmd `del /s` / `erase /s` THROUGH a junction empty its target, with no card (measured)', () => {
  assert.deepEqual(senzaCarta(['del /s /q link', 'erase /s /q link', 'del /s /q link\\*', 'del /f /s /q link\\*.*']), [])
})

test('R4-B8 ROSSA (LOW) — PC card: secret + critical delete keeps the foot note «Applies to the whole session» with no session button', () => {
  const app = readFileSync(join(qui, '../frontend/src/legacy/app.js'), 'utf8')
  const riga = /const percorsoConsentibile = [\s\S]*?;/u.exec(app)?.[0] ?? ''
  assert.ok(riga.includes('percorsoDiRete'), 'premise: found the expression')
  assert.match(riga, /cancellazioneCritica/u, 'percorsoConsentibile does not exclude the critical card: the foot note says «for the whole session»')
})

/* ---------------------------------------------------------------- Part G: guards (green) ------------------------------------- */

test('R4-G1 (rule 17) — everyday Windows commands stay without a card', () => {
  const tutti = [
    'rd /s /q build && npm run build', 'del /q /s *.pyc', 'rd /s /q "%TEMP%\\talos-x"', 'git clean -fdx', 'git clean -fdx build', 'git clean -fdxn ..',
    'powershell -c "Remove-Item -Recurse -Force .\\node_modules"', 'if exist node_modules rd /s /q node_modules',
    'for /d /r . %d in (__pycache__) do @if exist "%d" rd /s /q "%d"', 'for /r %i in (*.tmp) do del /q "%i"', 'cmd /c "rd /s /q dist && mkdir dist"',
    'del /q "%CD%\\*.log"', 'set /a N=1 && rd /s /q build', 'echo rd /s /q .. > nota.txt', 'git commit -m "rd /s /q .. is dangerous"',
    'rmdir /s /q link', 'git --work-tree=.. status',
  ]
  assert.deepEqual(tutti.filter((c) => giudica(c) !== null), [])
})

test('R4-G2 — a scoped yes on the critical card is refused, and the person can still say no', async (t) => {
  const { registry, sessionId, domanda, requestId } = await cartaInAttesa(t, CRITICA)
  assert.equal(registry.rispondiApprovazione(sessionId, requestId, true, { ambito: 'cartella' }).code, 'QUERY_INVALID')
  assert.deepEqual(registry.rispondiApprovazione(sessionId, requestId, false), { ok: true })
  const esito = await domanda
  assert.notEqual(esito === true || esito?.approvato === true, true)
})
