/*
 * 0.2.4, voce S1 (decisione dell'owner 2026-11-18-1334, registro 164; forma `FORMA-024-S1-2026-11-18.md`, variante B decisa dal giudice
 *   v2172): una cancellazione critica scritta DENTRO un altro linguaggio (`python -c`, `node -e`, `perl -e`, `ruby -e`, `php -r`, `bun -e`,
 *   `deno eval`, un heredoc, stdin, un file scritto nello stesso comando) dà la carta come la stessa cancellazione scritta nella shell.
 *   Il codice in linea si LEGGE: bersaglio critico ⇒ la carta del posto; bersaglio che non si sa dire, codice offuscato o costruito a
 *   pezzi ⇒ «troppo complesso»; niente che cancelli ⇒ nessuna carta (i 20 innocui d'uso comune qui sotto).
 *
 * Fonti: Hermes `tools/approval_detection.py:632-642` (interpreti e flag del codice) e `:1008-1011` (con `-e/-c` o `<<` chiede sempre: la
 *   variante A, che qui NON si fa); Codex `is_dangerous_command.rs:67-72` (rilegge solo i comandi letterali di `bash -lc`); Claude Code
 *   `CHANGELOG.md:1941` (chiedere a ogni `python3 -c` era rumore); docs.python.org cmdline, nodejs.org cli, perldoc perlrun (18/11/2026).
 *
 * ⛔ Nessun comando di queste prove gira: le stringhe sono solo testo dato al riconoscitore e al cancello, che risponde «no» o «sì» e basta.
 *   Bersagli: solo i percorsi FINTI dei contesti qui sotto (`/finto/casa`, `C:\finto\casa`), la radice scritta come testo, mai «..».
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

import { cancellazioneCritica, dimenticaPercorsiVeri, __perLeProve } from '../src/kernel/cancellazioni-critiche.mjs'
import { verificaPermessoScrittura, talosLavora } from '../src/kernel/talosHarness.mjs'
import { createSessionRegistry } from '../src/session-registry.mjs'
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs'
import { U, W, PYTHON, NODE_E_ALTRI, DI_WINDOWS, INNOCUI, NON_CRITICHE, NON_SI_LEGGONO, DAI_MUTANTI, GIRO_2, PARI_ALLA_SHELL, MUTANTI_GIRO_2, MUTANTI_GIRO_2_W } from './aiuto/casi-024-s1.mjs'

const giudica = (comando, ctx) => { dimenticaPercorsiVeri(); return cancellazioneCritica(comando, ctx) }
const motivo = (comando, ctx) => giudica(comando, ctx)?.perche ?? null
/** I casi che non danno il motivo atteso (`*` = una carta qualsiasi), uno per riga: la prova li mostra tutti insieme */
const sbagliati = (casi, ctx) => casi.filter(([c, atteso]) => (atteso === '*' ? motivo(c, ctx) === null : motivo(c, ctx) !== atteso))
  .map(([c, atteso]) => `${JSON.stringify(c).slice(0, 110)} → ${motivo(c, ctx)} (atteso ${atteso})`)

test('S1 ROSSA→VERDE — python: -c, opzioni unite e attaccate, heredoc, <<<, stdin, file scritto nel comando, offuscato (Linux)', () => {
  assert.deepEqual(sbagliati(PYTHON, U), [])
})

test('S1 ROSSA→VERDE — node, perl, ruby, php, bun, deno e dentro sh -c / bash -lc (Linux)', () => {
  assert.deepEqual(sbagliati(NODE_E_ALTRI, U), [])
})

test('S1 ROSSA→VERDE — macOS e telefono leggono come Linux: le stesse forme chiedono', () => {
  const M = { ...U, piattaforma: 'darwin' }
  const A = { ...U, piattaforma: 'android' }
  const scelta = [...PYTHON.slice(0, 8), ...NODE_E_ALTRI.slice(0, 6), ...NODE_E_ALTRI.slice(14, 18)]
  assert.deepEqual(sbagliati(scelta, M), [])
  assert.deepEqual(sbagliati(scelta, A), [])
})

test('S1 ROSSA→VERDE — Windows: .exe, percorso intero, py, cmd /c, powershell -Command, heredoc, stdin', () => {
  assert.deepEqual(sbagliati(DI_WINDOWS, W), [])
})

test('S1 AL CONTRARIO — i 20 innocui d\'uso comune non danno la carta critica (Linux e Windows)', () => {
  for (const ctx of [U, W]) assert.deepEqual(INNOCUI.filter((c) => giudica(c, ctx) !== null), [], ctx.piattaforma)
})

test('S1 AL CONTRARIO — cancellare una cartella NON critica in un altro linguaggio non dà carta (come `rm -rf dist`)', () => {
  for (const ctx of [U, W]) assert.deepEqual(NON_CRITICHE.filter((c) => giudica(c, ctx) !== null), [], ctx.piattaforma)
})

test('S1 AL CONTRARIO — uno script che non nasce nel comando non si legge; un testo fra virgolette non è codice', () => {
  for (const c of NON_SI_LEGGONO) {
    assert.equal(giudica(c, U), null, c)
  }
})

test('S1 MUTANTI — un caso per ramo della lettura: commenti, stringhe calcolate, q()/%w(), opzioni col valore, redirezioni, tetti', () => {
  const diversi = DAI_MUTANTI.filter(([c, atteso]) => motivo(c, U) !== atteso).map(([c, atteso]) => `${JSON.stringify(c).slice(0, 110)} → ${motivo(c, U)} (atteso ${atteso})`)
  assert.deepEqual(diversi, [])
})

test('S1 GIRO 2 ROSSA→VERDE — R1 getattr/send che nominano ciò che cancella, R2 le fughe, R3 fs-extra per nome, R4 oltre il tetto, i mutanti vivi', () => {
  assert.deepEqual(sbagliati(GIRO_2, U), [])
  /* macOS e telefono come Linux */
  assert.deepEqual(sbagliati(GIRO_2.slice(0, 20), { ...U, piattaforma: 'darwin' }), [])
})

test('S1 GIRO 2 MUTANTI — un caso per ogni ramo nuovo che il primo giro dei mutanti lasciava vivo (fughe, legami, tetti, nomi scelti)', () => {
  assert.deepEqual(sbagliati(MUTANTI_GIRO_2, U), [])
  assert.deepEqual(sbagliati(MUTANTI_GIRO_2_W, W), [])
})

test('S1 GIRO 2 PARI ALLA SHELL — lo stesso bersaglio dà la stessa risposta nel codice in linea e in `rm` (punto 6)', () => {
  const diversi = []
  for (const [codice, shell, atteso] of PARI_ALLA_SHELL) {
    const a = motivo(codice, U)
    const b = motivo(shell, U)
    if (a !== atteso || b !== atteso) diversi.push(`${JSON.stringify(codice).slice(0, 80)} → ${a} | shell ${JSON.stringify(shell)} → ${b} (atteso ${atteso})`)
  }
  assert.deepEqual(diversi, [])
})

test('S1 TETTI — codice enorme o annidato senza fine: mai un errore, mai un sì muto, mai oltre i tetti del comando', () => {
  const lungo = `python -c "${'x = 1; '.repeat(20000)}import shutil; shutil.rmtree('/')"`
  const r = giudica(lungo, U)
  assert.ok(r && ['radice', 'troppo-complesso', 'troppo-annidato'].includes(r.perche), `codice lungo: ${r?.perche}`)
  /* exec dentro exec dentro exec…: oltre il tetto di annidamento si fallisce chiusi */
  let codice = "import shutil; shutil.rmtree('/')"
  for (let i = 0; i < 8; i += 1) codice = `exec(${JSON.stringify(codice)})`
  const n = giudica(`python3 - <<'EOF'\n${codice}\nEOF`, U)
  assert.equal(n?.perche, 'troppo-annidato', 'exec annidato oltre il tetto: si fallisce chiusi')
  assert.ok(__perLeProve.lavoro() <= __perLeProve.TETTO_DEL_LAVORO + 64, 'il lavoro resta nel tetto del comando')
  /* le stringhe fatte per far esplodere una regex: aperte e mai chiuse, migliaia di parentesi */
  const t0 = performance.now()
  for (const c of [`python -c "${"('".repeat(5000)}"`, `node -e "${'(['.repeat(8000)}rmSync"`, `perl -e '${'q('.repeat(6000)}'`, `ruby -e "${'%x('.repeat(4000)}"`]) {
    const x = giudica(c, U)
    assert.ok(x === null || typeof x.perche === 'string')
  }
  assert.ok(performance.now() - t0 < 2000, `quattro testi cattivi in ${Math.round(performance.now() - t0)} ms`)
})

/* ───────────── il cancello vero, in ogni modo dei permessi: chiede OGNI volta, anche in Accesso pieno ───────────── */

const radiceProve = realpathSync.native(mkdtempSync(join(tmpdir(), 'talos-024s1-')))
const casaFinta = join(radiceProve, 'casa')
mkdirSync(casaFinta, { recursive: true })
const primaEnv = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME, TALOS_HARNESS_UI_PROJECT_DIRS: process.env.TALOS_HARNESS_UI_PROJECT_DIRS }
process.env.USERPROFILE = casaFinta
process.env.HOME = casaFinta
delete process.env.TALOS_HARNESS_UI_PROJECT_DIRS
test.after(async () => {
  for (const [k, v] of Object.entries(primaEnv)) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
  dimenticaPercorsiVeri()
  await rimuoviCartellaDiProvaAttesa(radiceProve)
})
let contatore = 0
const progetto = () => { contatore += 1; const c = join(radiceProve, 'lavoro', `p${contatore}`); mkdirSync(c, { recursive: true }); return c }

const MODI = [
  { livelloAccesso: 'accesso-pieno' },
  { livelloAccesso: 'accesso-pieno', permessiPerAttrezzo: { shell: 'sempre' } },
  { livelloAccesso: 'scrittura-progetto', permessiPerAttrezzo: { shell: 'sempre' } },
  { livelloAccesso: 'su-richiesta', permessiPerAttrezzo: { shell: 'sempre' } },
  { livelloAccesso: 'scrittura-area', permessiPerAttrezzo: { shell: 'sempre' } },
]
/* il bersaglio è la cartella del progetto di prova (`.`): anche se il comando girasse, toccherebbe solo una cartella temporanea finta */
const DAL_MODELLO = [
  `python3 -c "import shutil; shutil.rmtree('.')"`,
  `node -e "require('fs').rmSync(process.cwd(), { recursive: true, force: true })"`,
  `perl -MFile::Path=rmtree -e 'rmtree(".")'`,
  "python - <<'EOF'\nimport shutil, os\nshutil.rmtree(os.getcwd())\nEOF",
]

test('S1 ROSSA→VERDE — il cancello vero: in ogni modo, Accesso pieno compreso, la carta critica arriva, e arriva OGNI volta', async () => {
  assert.equal(homedir(), casaFinta, 'premessa: la casa è quella finta')
  for (const modo of MODI) {
    for (const comando of DAL_MODELLO) {
      const cartella = progetto()
      const consensiSessione = {}
      const carte = []
      for (let volta = 0; volta < 2; volta += 1) {
        await verificaPermessoScrittura({ tipo: 'shell', comando }, {
          ...modo, cartella, consensiSessione, chiediApprovazioneFn: async (a) => { carte.push(a); return true },
        })
      }
      const etichetta = `${modo.livelloAccesso}${modo.permessiPerAttrezzo ? ' + sempre' : ''}: ${comando.slice(0, 50)}`
      assert.equal(carte.length, 2, `${etichetta}: una carta a ogni volta, anche dopo un sì`)
      for (const c of carte) assert.equal(c.cancellazioneCritica?.perche, 'progetto', etichetta)
    }
  }
})

/* ───────────── il filo intero: il modello chiede il comando → registro vero → nucleo vero → la carta alla persona, che dice NO ───────────── */

test('S1 PERCORSO INTERO — dal modello alla carta: `python3 -c` che cancella il progetto arriva alla persona col segno, e il no arriva al modello', async () => {
  const cartella = progetto()
  let input = null
  const registro = createSessionRegistry({
    guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
    preparaEsecuzioneFn: () => ({ cartella, comandoProva: null, task: { id: 'task-024s1', consegna: 'prova' } }),
    caricaHooksFn: async () => ({ hooks: [] }),
    avviaSessioneFn: (i) => { input = i; i.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' }); return new Promise(() => {}) },
  })
  const { sessionId } = registro.avvia('task-024s1', { permessiScelto: 'Full access' })
  const carte = []
  registro.iscriviti(sessionId, (e) => {
    if (e.type !== 'ApprovalRequested') return
    carte.push(e)
    registro.rispondiApprovazione(sessionId, e.requestId, false)
  })
  /* il bersaglio è la cartella del progetto di prova, temporanea e finta: anche se girasse non toccherebbe altro */
  const comando = `python3 -c "import shutil; shutil.rmtree('.')"`
  const risposte = [{ role: 'assistant', content: null, tool_calls: [{ id: 'c0', type: 'function', function: { name: 'shell', arguments: JSON.stringify({ comando }) } }] },
    { role: 'assistant', content: 'fatto', tool_calls: [] }]
  let indice = 0
  const visti = []
  const fetchDiRete = async (_url, richiesta) => {
    visti.push(JSON.parse(richiesta?.body ?? '{}'))
    const scelta = risposte[Math.min(indice++, risposte.length - 1)]
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: scelta }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), text: async () => '' }
  }
  await talosLavora({
    cartella, task: { consegna: 'prova' }, modello: 'x', chiave: 'y', fetchDiRete,
    livelloAccesso: input.livelloAccesso, permessiPerAttrezzo: input.permessiPerAttrezzo, chiediApprovazioneFn: input.chiediApprovazioneFn, hookFn: input.hookFn,
  })
  assert.equal(carte.length, 1, `una carta (livello ${input.livelloAccesso})`)
  assert.equal(carte[0].azione?.cancellazioneCritica?.perche, 'progetto', 'col segno della cancellazione critica')
  const risultato = JSON.stringify(visti.at(-1)?.messages?.filter((m) => m.role === 'tool') ?? [])
  assert.doesNotMatch(risultato, /"exitCode":0|uscita 0/u, 'il comando non è girato')
})

test('S1 AL CONTRARIO — il cancello vero in Accesso pieno: i 20 innocui passano senza carta', async () => {
  for (const comando of INNOCUI) {
    const carte = []
    const esito = await verificaPermessoScrittura({ tipo: 'shell', comando }, {
      livelloAccesso: 'accesso-pieno', cartella: progetto(), consensiSessione: {}, chiediApprovazioneFn: async (a) => { carte.push(a); return true },
    })
    assert.equal(carte.length, 0, comando.slice(0, 60))
    assert.equal(esito.consentito, true, comando.slice(0, 60))
  }
})
