/*
 * Cure 208 bis (05/11/2026): cmd.exe reads the line its own way before running it. The spellings below were MEASURED in a real cmd.exe on
 * a scratch folder (each one deleted the sibling folder, except where noted): `,` `;` `=` are delimiters, `@` hides the echo, a switch can
 * be glued to the command name (`rd/s/q`, `cd..`, `cd\`), `^` is removed outside quotes, `if <condition> <command>`, `for … do`, `%VAR:~a,b%`
 * substrings and `!VAR!` delayed expansion. Every one of them must ask in EVERY mode (decision 208); subfolders pass as before (rule 17).
 * Sources: Microsoft Learn «rd» and «cmd» (`/S`, `/Q`, `/V:ON`), `cmd /?`, `rd /?`; jeb and dbenham «How does cmd.exe parse scripts»
 * (Stack Overflow 4094699: token delimiters space , ; = and caret phase, read 05/11/2026); Hermes `tools/approval_detection.py:257`; Codex
 * `windows_dangerous_commands.rs:190-222`.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { cancellazioneCritica, dimenticaPercorsiVeri } from '../src/kernel/cancellazioni-critiche.mjs'

const W = { cartella: 'C:\\Users\\nino\\lavoro\\progetto', home: 'C:\\Users\\nino', piattaforma: 'win32', ambiente: {}, realpathFn: (p) => p }
const giudica = (comando, ctx = W) => { dimenticaPercorsiVeri(); return cancellazioneCritica(comando, ctx) }
const buchi = (casi) => casi.filter((c) => giudica(c) === null)
const carte = (casi) => casi.filter((c) => giudica(c) !== null)

test('C208B-1 — cmd delimiters, @, glued names and switches (measured in a real cmd.exe)', () => {
  assert.deepEqual(buchi(['rd;/s;/q;..', 'rd,/s,/q,..', 'rd=/s=/q=..', '@rd /s /q ..', 'rd..\\progetto /s /q', 'rd.. /s /q', 'rmdir/s/q ..',
    'rd /s/q"..\\progetto"', 'del/s/q ..\\*']), [])
})

test('C208B-2 — cmd conditions, loops and moves before the rd', () => {
  assert.deepEqual(buchi(['if 1==1 rd /s /q ..', 'if /i a equ A rd /s /q ..', 'if not exist zz rd /s /q ..', 'if defined X (rd /s /q ..)',
    'for /d %i in (..) do rd /s /q %i', 'for %%d in (build,..) do rd /s /q %%d', 'cd/d.. && rd /s /q progetto', 'pushd .. && rd /s /q progetto',
    'cd .. & rd /s /q progetto']), [])
})

test('C208B-3 — cmd escapes and computed paths', () => {
  assert.deepEqual(buchi(['r^d /s /q ..', 'rd /s /q ^.^.', 'rd /s /q %CD%\\..', 'rd /s /q "%CD:~0,-9%"', 'rd /s /q %~dp0', 'rd /s /q !X!']), [])
  assert.equal(giudica('rd /s /q %CD:~0,3%')?.perche, 'radice')
  assert.equal(giudica('rd /s /q "%CD:~0,-9%"')?.perche, 'sopra-il-progetto', 'a negative length counts from the end')
  assert.equal(giudica('rd /s /q %NOPE:~0,3%')?.perche, 'sostituzione', 'an unknown variable cut by cmd: the place is not known')
  assert.equal(giudica('rd /s/q ..')?.perche, 'sopra-il-progetto')
  assert.equal(giudica('rd/s/q ..')?.perche, 'sopra-il-progetto')
  assert.equal(giudica('cmd /v:on /c "set D=..&& rd /s /q !D!"')?.perche, 'sopra-il-progetto')
})

test('C208B-4 — rule 17: everyday cmd work inside the project stays without a card', () => {
  assert.deepEqual(carte(['rd /s /q build', 'rd/s/q build', 'rmdir /s /q node_modules', 'del /q *.tmp', 'del /s /q *.log', '@echo off && rd /s /q dist',
    'if exist build rd /s /q build', 'for /d %i in (build dist) do rd /s /q %i', 'cd src && rd /s /q gen', 'set D=out&& rd /s /q !D!',
    'git status', 'npm ci', 'echo a^&b > f.txt', 'rd /s /q "%CD%\\build"', 'del /q "%TEMP%\\x.tmp"']), [])
})

/* ── through the real gate (`verificaPermessoScrittura`): the card says the right place, and rule 17 holds in every mode ── */
const { verificaPermessoScrittura } = await import('../src/kernel/talosHarness.mjs')
const { readFileSync } = await import('node:fs')
const MODI = [
  { nome: 'Full access', livelloAccesso: 'accesso-pieno' },
  { nome: 'Workspace write', livelloAccesso: 'scrittura-progetto' },
  { nome: 'Workspace write + shell always', livelloAccesso: 'scrittura-progetto', permessiPerAttrezzo: { shell: 'sempre' } },
  { nome: 'On request + shell always', livelloAccesso: 'su-richiesta', permessiPerAttrezzo: { shell: 'sempre' } },
]
/** 10 typical tasks, two commands each, as a model writes them in cmd and PowerShell on Windows */
const COMPITI_TIPICI = ['npm ci', 'npm test', 'git status', 'git diff --stat', 'rd /s /q node_modules', 'rd/s/q dist', 'del /q *.log', 'del /s /q build\\*.obj',
  'if exist build rd /s /q build', 'cd src && del /q *.tmp', 'mkdir out && copy a.txt out', 'Remove-Item -Recurse -Force .\\dist', 'for /d %i in (build out) do rd /s /q %i',
  'npx tsc --noEmit', 'node scripts\\build.mjs', 'git clean -fdx', 'pushd tests && del /q *.snap && popd', 'set D=out&& rd /s /q !D!', 'rd /s /q "%CD%\\coverage"', 'echo done']
const cartellaVera = W.cartella

async function carteDi(comando, modo) {
  const carte = []
  await verificaPermessoScrittura({ tipo: 'shell', comando }, { livelloAccesso: modo.livelloAccesso, cartella: cartellaVera, consensiSessione: {},
    ...(modo.permessiPerAttrezzo ? { permessiPerAttrezzo: modo.permessiPerAttrezzo } : {}), chiediApprovazioneFn: async (a) => { carte.push(a); return false } })
  return carte
}

test('C208B-8 — LOW: `rd /s/q ..` asks in every mode with the right reason, in English and Italian', { skip: process.platform !== 'win32' }, async () => {
  for (const modo of MODI) {
    const carte = await carteDi('rd /s/q ..', modo)
    assert.equal(carte.length, 1, modo.nome)
    assert.equal(carte[0].cancellazioneCritica?.perche, 'sopra-il-progetto', modo.nome)
    assert.equal(carte[0].cancellazioneCritica?.fraseChiave, 'server.approval.criticalDelete.aboveProject', modo.nome)
  }
  const testi = readFileSync(new URL('../frontend/src/i18n/testi/server.js', import.meta.url), 'utf8')
  const frasi = [...testi.matchAll(/'approval\.criticalDelete\.aboveProject': '([^']+)'/gu)].map((m) => m[1])
  assert.equal(frasi.length, 2, 'Italian and English')
  for (const f of frasi) assert.doesNotMatch(f, /sopra-il-progetto|rd |\/s|cmd|aboveProject/u, 'no technical names')
})

test('C208B-9 — rule 17: no critical card on 10 typical tasks (20 commands) in any mode; every cmd spelling of «delete the project» asks', { skip: process.platform !== 'win32' }, async () => {
  for (const modo of MODI) {
    const critiche = []
    for (const comando of COMPITI_TIPICI) for (const a of await carteDi(comando, modo)) if (a.cancellazioneCritica) critiche.push(comando)
    assert.deepEqual(critiche, [], `${modo.nome}: no critical card on typical work`)
    for (const comando of ['rd;/s;/q;..', 'r^d /s /q ..', 'cd.. && rd /s /q progetto', 'if exist .. rd /s /q ..', 'rd /s /q %CD:~0,3%']) {
      assert.ok((await carteDi(comando, modo)).some((a) => a.cancellazioneCritica), `${modo.nome}: ${comando}`)
    }
  }
})

/* MEDIA-2 and MEDIA-3 (the red ones live in revisione-permessi-3-rosse R3-B2 and R3-B3): the guards that keep everyday work without a card */
test('C208B-10 — git clean and PowerShell computed folders: only the dangerous spelling asks', () => {
  assert.deepEqual(carte(['git clean -fdx', 'git clean -fdx src', 'git -C .. clean -nfdx', 'git -C .. clean --dry-run -fdx', 'git -C .. clean -dx',
    'git clean -fdx -e ..', 'git -C .. status', '$d = Get-Location; Remove-Item (Join-Path $d build) -Recurse', '$d = (Get-Item .).FullName; Remove-Item "$d\\dist" -Recurse',
    'Remove-Item -Recurse "$($PWD.Path)\\out"', 'Remove-Item -Recurse -Force "$($pwd.ProviderPath)\\coverage"']), [])
  assert.equal(giudica('git -C .. clean -fdx -e keep')?.perche, 'sopra-il-progetto')
  assert.equal(giudica('git -c core.x=1 -C .. clean -f')?.perche, 'sopra-il-progetto')
  assert.equal(giudica('$d = (Get-Item .).Parent.Parent.FullName; Remove-Item $d -Recurse')?.perche, 'casa')
  assert.equal(giudica('$d = (Get-Item .).Parent.Name; Remove-Item $d -Recurse'), null, 'a property we do not read stays unknown, like any $X')
})

/* MEDIA-4 (the red one lives in revisione-permessi-3-rosse R3-B4): through the link asks, the link alone and a real subfolder do not */
test('C208B-11 — a link to the project: only deleting THROUGH it asks', async () => {
  const { mkdtempSync, mkdirSync, realpathSync, symlinkSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const radice = realpathSync.native(mkdtempSync(join(tmpdir(), 'talos-c208b-link-')))
  const progetto = join(radice, 'lavoro', 'progetto')
  mkdirSync(join(progetto, 'dist'), { recursive: true })
  const link = join(radice, 'collegamento')
  symlinkSync(progetto, link, process.platform === 'win32' ? 'junction' : 'dir')
  const ctx = { cartella: progetto, home: radice, piattaforma: process.platform, ambiente: {} }
  dimenticaPercorsiVeri()
  assert.equal(cancellazioneCritica(`rm -rf "${link}/"`, ctx)?.perche, 'progetto')
  assert.equal(cancellazioneCritica(`rm -rf "${link}"`, ctx), null, 'rm -rf on the link removes the link only')
  assert.equal(cancellazioneCritica(`rm -rf "${join(progetto, 'dist')}/"`, ctx), null, 'a real subfolder stays without a card')
})
