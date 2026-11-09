/*
 * Cure 208 ter (05/11/2026), review «permessi 4»: the cmd.exe and PowerShell ways to delete a critical place with no card that the fourth
 * review MEASURED in a real cmd.exe (ALTO-1 substitutions and hidden variables, ALTO-2 every `for` form and `forfiles`, MEDIA-1 `del /s`
 * through a junction, MEDIA-2 `git --work-tree`/`GIT_WORK_TREE`, MEDIA-3 `Push-Location`). The reviewer's own red tests live in
 * revisione-permessi-4-rosse (R4-B1..B8); here: more spellings of the same holes, the rule-17 measurement (0 extra cards on everyday work in
 * every mode) and the disk-read count.
 * Sources: Microsoft Learn «for» (/d /r /l /f, usebackq, tokens) and «forfiles» (/p /m /s /c /d, @path @file @isdir, 0xHH), read
 * 05/11/2026; `set /?` (%VAR:str1=str2%, *str1); git-scm «git» (--work-tree, GIT_WORK_TREE) and «gitglossary» (pathspec :/ and :(top));
 * Microsoft Learn «Push-Location» (-StackName); Hermes `tools/approval_detection.py:244,247,257` (flags any cmd/PowerShell delete
 * coarsely, does not read dynamic variables).
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { cancellazioneCritica, dimenticaPercorsiVeri } from '../src/kernel/cancellazioni-critiche.mjs'

const W = {
  cartella: 'C:\\Users\\nino\\lavoro\\progetto', home: 'C:\\Users\\nino', piattaforma: 'win32',
  ambiente: { USERPROFILE: 'C:\\Users\\nino', TEMP: 'C:\\Users\\nino\\AppData\\Local\\Temp' },
  realpathFn: (p) => (/\\progetto\\link(?:\\|$)/iu.test(p) ? p.replace(/\\lavoro\\progetto\\link/iu, '') : p),
}
const giudica = (comando, ctx = W) => { dimenticaPercorsiVeri(); return cancellazioneCritica(comando, ctx) }
const buchi = (casi) => casi.filter((c) => giudica(c) === null)
const carte = (casi) => casi.filter((c) => giudica(c) !== null)

test('C208T-1 (ALTO-1) — cmd substitutions and hidden variables in a delete: resolved, or a card', () => {
  assert.deepEqual(buchi(['rd /s /q "%CD:*lavoro=%"', 'rd /s /q %=C:%\\..', 'rd /s /q %=D:%', 'rd /s /q %__CD__%', 'rd /s /q "%CD:PROGETTO=%"',
    'rd /s /q %CD:\\progetto=%', 'rd /s /q "%NOPE:a=b%"', 'del /s /q "%CD:~0,-9%\\*"']), [])
  assert.equal(giudica('rd /s /q %=C:%\\..')?.perche, 'sopra-il-progetto', '%=C:% is the current folder on C:')
  assert.equal(giudica('rd /s /q %__CD__%')?.perche, 'progetto', '%__CD__% is the current folder with a trailing backslash')
  assert.equal(giudica('rd /s /q %=D:%')?.perche, 'sostituzione', 'the current folder on another drive is not known')
  assert.equal(giudica('rd /s /q "%CD:PROGETTO=%"')?.perche, 'sopra-il-progetto', 'cmd replaces without looking at the case')
  assert.equal(giudica('rd /s /q "%NOPE:a=b%"')?.perche, 'sostituzione', 'an unknown variable: the place is not known')
})

test('C208T-2 (ALTO-2) — every `for` form and `forfiles` whose body deletes a critical place asks', () => {
  assert.deepEqual(buchi(['for /f "delims=" %i in ("..") do rd /s /q "%i"', 'for /f "usebackq" %i in (`cd`) do rd /s /q %i\\..',
    'for /f %i in (lista.txt) do rd /s /q %i', 'for /f "tokens=1,2" %i in ("a ..") do rd /s /q %j', 'for /l %a in (1,1,2) do for /d %b in (..) do rd /s /q %b',
    'for /r C:\\Users %i in (.) do rd /s /q "%i"', 'for /d %i in (C:\\Users\\nino) do rd /s /q %i', 'for /d %%i in (%~dp0..) do rd /s /q %%i',
    'forfiles /p .. /s /m progetto /c "cmd /c rd /s /q @path"', 'forfiles /p C:\\Users /c "cmd /c rd /s /q @path"',
    'forfiles /p .. /c "cmd /c 0x72d /s /q @path"', 'forfiles /p %CD:~0,3% /c "cmd /c rd /s /q @path"', 'forfiles /p .. /m prog* /c "cmd /c rd /s /q @file"',
    'forfiles /c "cmd /c rd /s /q .."', 'forfiles /P .. /C "cmd /c rmdir /s /q @PATH"']), [])
  assert.equal(giudica('for /r C:\\Users %i in (.) do rd /s /q "%i"')?.perche, 'primo-livello')
  assert.equal(giudica('forfiles /p .. /s /m progetto /c "cmd /c rd /s /q @path"')?.perche, 'progetto')
  assert.equal(giudica('forfiles /p .. /c "cmd /c 0x72d /s /q @path"')?.perche, 'progetto', '0x72 is «r»: the hidden rd is read')
  assert.equal(giudica('for /f %i in (lista.txt) do rd /s /q %i')?.perche, 'sostituzione', 'values read from a file are not known')
})

test('C208T-3 (MEDIA-1/2/3) — del /s through a junction, git --work-tree, Push-Location', () => {
  assert.deepEqual(buchi(['del /s /q link\\', 'erase /s link', '$env:GIT_WORK_TREE=".."; git clean -ffdx', 'git --git-dir=.git --work-tree=C:\\Users\\nino clean -ffdx',
    'git -C .. --work-tree=. clean -ffdx', 'powershell -c "Set-Location ..; Remove-Item -Recurse -Force progetto"',
    'powershell -c "Push-Location -StackName s ..; ri -r -fo progetto"', 'powershell -c "Push-Location src; Pop-Location; Push-Location ..; ri -r -fo progetto"']), [])
  assert.equal(giudica('del /s /q link\\')?.perche, 'casa', 'del /s through the junction: the destination is judged')
  assert.equal(giudica('del /s /q link\\a.txt'), null, 'one file below the destination is not a critical place')
  assert.equal(giudica('rmdir /s /q link'), null, 'rd on the junction removes the junction only (measured)')
})

test('C208T-7 (BASSO) — PC card: a critical delete never offers a session yes, even with a secret or a WSL root', async () => {
  const { readFileSync } = await import('node:fs')
  const app = readFileSync(new URL('../frontend/src/legacy/app.js', import.meta.url), 'utf8')
  const consentibile = /const percorsoConsentibile = [\s\S]*?;/u.exec(app)?.[0] ?? ''
  const root = /const cartaDiRoot = [^;]*;/u.exec(app)?.[0] ?? ''
  assert.match(consentibile, /!azione\?\.cancellazioneCritica/u, 'with a secret the foot note stays «Applies only to this request»')
  assert.match(root, /!azione\?\.cancellazioneCritica/u, 'with a WSL root the foot note is not removed')
  assert.match(app, /if \(azione\?\.cancellazioneCritica\) sessioneBtn\.remove\(\);/u, 'no «For this session» button')
  assert.match(app, /if \(azione\?\.percorsoDiRete\?\.ambito === 'sessione' && !azione\?\.cancellazioneCritica\)/u,
    'a network folder remembered for the session does not turn the critical card into «Allow for this session» (the phone does the same)')
})

/* Rule 17 (owner 02/11): the 10 harmless `for` and `%VAR%` commands of the brief, plus the everyday spellings next to the new readings */
const INNOCUI = ['for %f in (*.txt) do type %f', 'echo %USERPROFILE%', 'cd %TEMP%', 'for /l %i in (1,1,3) do echo %i', "for /f %i in ('dir /b') do echo %i",
  'forfiles /m *.log /c "cmd /c echo @path"', 'del /s /q *.pyc', 'git --work-tree=.. status', 'powershell -c "Push-Location src; Remove-Item -Recurse build; Pop-Location"',
  'rd /s /q "%TEMP%\\x"']
const QUOTIDIANI = ['for /d /r . %d in (__pycache__) do @if exist "%d" rd /s /q "%d"', 'for /r %i in (*.tmp) do del /q "%i"',
  'forfiles /p build /s /m *.tmp /c "cmd /c del @path"', 'forfiles /m *.bak /d -30 /c "cmd /c del @file"', 'for /l %i in (1,1,3) do rd /s /q out%i',
  'for /f %i in ("build") do rd /s /q %i', 'rd /s /q "%CD%\\build"', 'echo %CD:\\=/%', 'set X=%PATH:;=,%', 'git --work-tree=. clean -fdx', 'GIT_WORK_TREE=. git clean -fdx',
  'del /s /q src\\*.obj', 'rd /s /q %USERPROFILE:x=x%\\lavoro\\progetto\\build', 'forfiles /p src /c "cmd /c rd /s /q @path"', 'rmdir /s /q link', 'del /q link\\a.txt']

test('C208T-4 (rule 17) — the harmless and everyday spellings stay without a card', () => {
  assert.deepEqual(carte(INNOCUI), [])
  assert.deepEqual(carte(QUOTIDIANI), [])
})

test('C208T-5 (rule 17) — reading the disk: no command that does not delete reads it, del /s on a glob does not follow links', () => {
  const lette = []
  const ctx = { ...W, realpathFn: (p) => { lette.push(p); return W.realpathFn(p) } }
  dimenticaPercorsiVeri()
  for (let i = 0; i < 10; i += 1) for (const c of [...INNOCUI, ...QUOTIDIANI]) cancellazioneCritica(c, ctx)
  /* the same as before the cure (measured on the base): folder and home once; `Remove-Item` on a plain name reads its target (R4-A4) */
  assert.deepEqual([...new Set(lette)].sort(), [W.home, W.cartella, `${W.cartella}\\src\\build`].sort())
  assert.equal(lette.length, 12, 'folder and home once, the Remove-Item target once per run')
  assert.equal(cancellazioneCritica('for %f in (*.txt) do type %f', { ...W, realpathFn: () => { throw new Error('no read') } }), null)
  assert.equal(cancellazioneCritica('del /s /q *.pyc', { ...W, realpathFn: (p) => { if (p !== W.cartella && p !== W.home) throw new Error(`read ${p}`); return p } }), null)
})

/* through the real gate (`verificaPermessoScrittura`): the reviewer's 17, the 20 typical tasks of 208 bis and the 26 above, in 4 modes */
const { verificaPermessoScrittura } = await import('../src/kernel/talosHarness.mjs')
const MODI = [
  { nome: 'Full access', livelloAccesso: 'accesso-pieno' },
  { nome: 'Workspace write', livelloAccesso: 'scrittura-progetto' },
  { nome: 'Workspace write + shell always', livelloAccesso: 'scrittura-progetto', permessiPerAttrezzo: { shell: 'sempre' } },
  { nome: 'On request + shell always', livelloAccesso: 'su-richiesta', permessiPerAttrezzo: { shell: 'sempre' } },
]
const G1_DEL_REVISORE = ['rd /s /q build && npm run build', 'del /q /s *.pyc', 'rd /s /q "%TEMP%\\talos-x"', 'git clean -fdx', 'git clean -fdx build', 'git clean -fdxn ..',
  'powershell -c "Remove-Item -Recurse -Force .\\node_modules"', 'if exist node_modules rd /s /q node_modules',
  'for /d /r . %d in (__pycache__) do @if exist "%d" rd /s /q "%d"', 'for /r %i in (*.tmp) do del /q "%i"', 'cmd /c "rd /s /q dist && mkdir dist"',
  'del /q "%CD%\\*.log"', 'set /a N=1 && rd /s /q build', 'echo rd /s /q .. > nota.txt', 'git commit -m "rd /s /q .. is dangerous"', 'git --work-tree=.. status']
const COMPITI_TIPICI = ['npm ci', 'npm test', 'git status', 'git diff --stat', 'rd /s /q node_modules', 'rd/s/q dist', 'del /q *.log', 'del /s /q build\\*.obj',
  'if exist build rd /s /q build', 'cd src && del /q *.tmp', 'mkdir out && copy a.txt out', 'Remove-Item -Recurse -Force .\\dist', 'for /d %i in (build out) do rd /s /q %i',
  'npx tsc --noEmit', 'node scripts\\build.mjs', 'git clean -fdx', 'pushd tests && del /q *.snap && popd', 'set D=out&& rd /s /q !D!', 'rd /s /q "%CD%\\coverage"', 'echo done']
async function carteDi(comando, modo) {
  const viste = []
  await verificaPermessoScrittura({ tipo: 'shell', comando }, { livelloAccesso: modo.livelloAccesso, cartella: W.cartella, consensiSessione: {},
    ...(modo.permessiPerAttrezzo ? { permessiPerAttrezzo: modo.permessiPerAttrezzo } : {}), chiediApprovazioneFn: async (a) => { viste.push(a); return false } })
  return viste
}

test('C208T-6 (rule 17) — no critical card on everyday work in any mode; the new holes ask in every mode', { skip: process.platform !== 'win32' }, async () => {
  const tutti = [...G1_DEL_REVISORE, ...COMPITI_TIPICI, ...INNOCUI, ...QUOTIDIANI.filter((c) => !/link/u.test(c))]
  for (const modo of MODI) {
    const critiche = []
    for (const comando of tutti) for (const a of await carteDi(comando, modo)) if (a.cancellazioneCritica) critiche.push(comando)
    assert.deepEqual(critiche, [], `${modo.nome}: no critical card on everyday work`)
    let piene = 0
    if (modo.livelloAccesso === 'accesso-pieno') for (const comando of tutti) piene += (await carteDi(comando, modo)).length
    assert.equal(piene, 0, `${modo.nome}: no card at all in Full access`)
    for (const comando of ['rd /s /q %=C:%\\..', 'for /l %i in (1,1,1) do rd /s /q ..', 'forfiles /p .. /c "cmd /c rd /s /q @path"',
      'git --work-tree=.. clean -ffdx', 'powershell -c "Push-Location ..; ri -r -fo progetto"']) {
      assert.ok((await carteDi(comando, modo)).some((a) => a.cancellazioneCritica), `${modo.nome}: ${comando}`)
    }
  }
})
