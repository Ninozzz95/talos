/*
 * Cure del blocco permessi (04/11/2026), dopo la revisione avversaria: i buchi del parser (M1), i mutanti sopravvissuti della sezione T
 * (R04, R05, R09, R10, R14, R16) e i motivi nuovi delle radici del telefono (decisione 179). Solo decisione, nessun comando si esegue.
 * Fonti: Codex `is_dangerous_command.rs:35-58` (oltre il tetto si fallisce chiusi), code.claude.com/docs/en/permission-modes («Critical
 * paths»: nome corto 8.3, `\\?\C:\` e `\\localhost\C$` sono `C:\`), Microsoft Learn about_pwsh (`-EncodedCommand`, abbreviazioni).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { cancellazioneCritica, dimenticaPercorsiVeri } from '../src/kernel/cancellazioni-critiche.mjs'
import { verificaPermessoScrittura, fraseDiPermesso } from '../src/kernel/talosHarness.mjs'

const W = { cartella: 'C:\\Users\\nino\\lavoro\\progetto', home: 'C:\\Users\\nino', piattaforma: 'win32', ambiente: {}, realpathFn: (p) => p }
const U = { cartella: '/home/nino/prog', home: '/home/nino', piattaforma: 'linux', ambiente: {}, realpathFn: (p) => p }
const giudica = (comando, ctx) => { dimenticaPercorsiVeri(); return cancellazioneCritica(comando, ctx) }
const motivo = (comando, ctx) => giudica(comando, ctx)?.perche ?? null
const enc = (s) => Buffer.from(s, 'utf16le').toString('base64')
/** `bash -c "…"` annidato n volte, con le fughe vere di POSIX */
const nido = (s, n) => { for (let i = 0; i < n; i += 1) s = `bash -c "${s.replace(/[\\"$`]/gu, (x) => `\\${x}`)}"`; return s }

test('M1 ROSSA→VERDE — Windows: le grafie che la revisione ha trovato, e le loro sorelle, fanno la carta', () => {
  const casi = [
    ['rm -rf \\\\?\\C:\\Users\\nino', 'casa'], // R09
    ['rm -rf \\\\?\\C:\\Users\\nino\\lavoro\\progetto', 'progetto'], // R09
    ['rm -rf \\\\.\\C:\\Users', 'primo-livello'],
    ['rm -rf \\\\localhost\\C$\\Users\\nino', 'casa'], // R10
    ['rm -rf \\\\HOST\\C$\\Users\\nino', 'casa'], // R10, M1 (UNC di un'altra macchina)
    ['rm -rf \\\\?\\UNC\\HOST\\C$\\Users', 'primo-livello'],
    ['rm -rf C:\\Users\\NINO~1', 'casa'],
    ['rm -rf C:\\Users\\NINO~1\\lavoro', 'sopra-il-progetto'],
    ['Remove-Item -Path:C:\\Users\\nino -Recurse', 'casa'],
    ['Remove-Item -LiteralPath:C:\\Users\\nino -Recurse', 'casa'],
    ['ri -lp:C:\\Users\\nino -r', 'casa'],
    ['powershell -Com "Remove-Item -Recurse C:\\Users"', 'primo-livello'],
    ['powershell "Remove-Item -Recurse C:\\Users"', 'primo-livello'],
    [`powershell -EncodedCommand ${enc('Remove-Item -Recurse -Force C:\\Users\\nino')}`, 'casa'],
    [`pwsh -ec ${enc('Remove-Item -Recurse -Force C:\\Users\\nino')}`, 'casa'],
    ['gci C:\\Users\\nino -Recurse | Remove-Item -Force', 'casa'],
    ['Get-ChildItem | Remove-Item -Recurse', 'progetto'],
    ['cd C:\\Users && rm -rf nino', 'casa'],
    ['cd /d C:\\ && rd /s /q Users', 'primo-livello'],
    ['Set-Location -Path:C:\\Users; Remove-Item -Recurse nino', 'casa'],
    ['pushd C:\\Users && popd && rm -rf ..', 'sopra-il-progetto'],
    ['env -C C:\\Users rm -rf nino', 'casa'],
    ['sudo -D C:\\Users rm -rf nino', 'casa'],
    ['sudo -u root -- rm -rf ..', 'sopra-il-progetto'],
    ['timeout -s KILL 5 rm -rf ..', 'sopra-il-progetto'],
    ['nice -n 5 rm -rf ..', 'sopra-il-progetto'],
    ['eval rm -rf ..', 'sopra-il-progetto'],
    ['rm -rf C:\\Users\\ni*', 'casa'],
    ['rm -rf C:\\Users\\[nN]ino', 'casa'],
    ['rm -rf C:\\Users\\nino\\lav*', 'sopra-il-progetto'],
    ['Remove-Item -Recurse build,C:\\Users\\nino', 'casa'],
    ['find .. -delete', 'sopra-il-progetto'],
    ['find -L .. -mindepth 1 -delete', 'sopra-il-progetto'],
    ['rm -rf ~nino', 'casa'],
    ['rd /s /q %USERPROFILE%', 'casa'],
  ]
  const sbagliati = casi.filter(([c, atteso]) => motivo(c, W) !== atteso).map(([c, atteso]) => `${c} → ${motivo(c, W)} (atteso ${atteso})`)
  assert.deepEqual(sbagliati, [])
})

test('M1 ROSSA→VERDE — POSIX: fughe, `$\'..\'`, `$PWD`, involucri, `find -delete`', () => {
  const casi = [
    ['rm -rf \\.\\.', 'casa'],
    ["rm -rf $'..'", 'casa'],
    ['rm -rf "$PWD"', 'progetto'],
    ['rm -rf $(pwd)', 'progetto'],
    ['\\rm -rf ..', 'casa'],
    ['r\\m -rf ..', 'casa'],
    ['sh -c -- "rm -rf .."', 'casa'],
    ['env -S "rm -rf .." true', 'casa'],
    ['bash -c "rm -rf \\"$HOME\\""', 'casa'],
    ['cd && rm -rf prog', 'progetto'],
    ['find . -delete', 'progetto'],
    [nido('rm -rf ..', 4), 'casa'],
    ['gci /home/nino | Remove-Item -Recurse', 'casa'],
  ]
  const sbagliati = casi.filter(([c, atteso]) => motivo(c, U) !== atteso).map(([c, atteso]) => `${c} → ${motivo(c, U)} (atteso ${atteso})`)
  assert.deepEqual(sbagliati, [])
})

test('M1 — oltre il tetto di annidamento si FALLISCE CHIUSI (Codex `is_dangerous_command.rs:35-58`): carta «troppo-annidato»', () => {
  assert.deepEqual(giudica(nido('rm -rf build', 5), U), { percorso: null, perche: 'troppo-annidato' })
  assert.deepEqual(giudica('eval eval eval eval eval eval rm -rf build', U), { percorso: null, perche: 'troppo-annidato' })
  assert.deepEqual(giudica('cmd /c cmd /c cmd /c cmd /c cmd /c cmd /c rd /s /q build', W), { percorso: null, perche: 'troppo-annidato' })
  assert.deepEqual(giudica('powershell -e !!!', W), { percorso: null, perche: 'troppo-annidato' }, 'un -EncodedCommand che non si decodifica non si lascia passare')
  // AL CONTRARIO: entro il tetto si guarda davvero; oltre il tetto senza nulla che cancelli non c'è carta
  assert.equal(giudica(nido('rm -rf build', 4), U), null)
  assert.equal(giudica(nido('echo ciao', 7), U), null)
})

test('M1 AL CONTRARIO — il lavoro normale resta senza carta (nessun falso allarme nuovo)', () => {
  const windows = [
    'Remove-Item -Filter .. -Recurse build', // R16: il valore di -Filter non è un bersaglio
    'Remove-Item -ErrorAction:SilentlyContinue build -Recurse',
    `powershell -e ${enc('Remove-Item -Recurse build')}`,
    'pwsh -File x.ps1 rm',
    'gci build | Remove-Item -Recurse',
    'echo x || Remove-Item -Recurse',
    'find build -delete',
    'find . -name "*.o" -delete',
    'cd .. && rm -rf build',
    'pushd C:\\Users && popd && rm -rf build',
    'rm -rf C:\\Users\\nino\\lavoro\\progetto\\bu*',
    'eval "rm -rf build"',
    'rm -rf ~altro',
    'echo ok # ; rm -rf ..', // R05: il commento si salta
  ]
  /* forma permessi 2, punto 3 (04/11 sera, OK di CLI e Performance): `xargs rm -r…` prende il bersaglio da fuori → `troppo-annidato`;
     `xargs rm` senza -r resta senza carta */
  const posix = ['echo \\; rm -rf ..', 'rm -rf "$(pwd)/build"', 'rm -rf /home/nino/prog/build', 'find . -name "*.o" -delete', 'xargs rm -f < lista', 'cd - && ls prog', 'cd $ALTROVE && rm -f prog/a.o']
  assert.deepEqual(windows.filter((c) => giudica(c, W) !== null), [])
  assert.deepEqual(posix.filter((c) => giudica(c, U) !== null), [])
  assert.equal(giudica('xargs rm -rf < lista', U)?.perche, 'troppo-annidato')
})

test('M1 — `cd` in un posto che si sa solo mentre gira, poi `rm -r` relativo: si fallisce chiusi (carta «sostituzione»); un bersaglio assoluto si giudica lo stesso', () => {
  assert.deepEqual(giudica('cd "$(mktemp -d)/../.." && rm -rf *', U), { percorso: '*', perche: 'sostituzione' })
  assert.deepEqual(giudica('cd $ALTROVE && rm -rf nino', W), { percorso: 'nino', perche: 'sostituzione' })
  assert.deepEqual(giudica('cd - && rm -rf prog', U), { percorso: 'prog', perche: 'sostituzione' })
  assert.equal(motivo('cd $ALTROVE && rm -rf C:\\Users\\nino', W), 'casa')
  assert.equal(giudica('cd $ALTROVE && rm -rf /tmp/x', U), null)
})

test('M1 — POSIX: graffe (`{..,x}`) e variabile col taglio (`${HOME%/}`) sono bersagli; una graffa innocua no', () => {
  assert.equal(motivo('rm -rf {..,x}', U), 'casa')
  assert.equal(motivo('rm -rf /home/{altro,nino}', U), 'casa')
  assert.equal(motivo('rm -rf ${HOME%/}', U), 'casa')
  assert.equal(motivo('rm -rf "${HOME%%/}"/', U), 'casa')
  assert.equal(giudica('rm -rf {build,dist}', U), null)
  assert.equal(giudica('rm -rf ${IGNOTA:-x}', U), null)
})

test('Mutanti C02, C07, C12 — `/data/media/N/…` è la memoria condivisa; Android conta anche con la casa fuori dalla cartella dell\'app; `pwsh -Com`', () => {
  const T = { cartella: '/storage/emulated/0/Progetti/orca', home: '/data/local/tmp/codice', piattaforma: 'android', ambiente: {}, realpathFn: (p) => p }
  assert.equal(motivo('rm -rf /data/media/0/DCIM', T), 'cartella-del-telefono')
  assert.equal(motivo('rm -rf /data/media/0/Progetti/orca', T), 'progetto')
  assert.equal(motivo('rm -rf ~/chiavi', T), 'dati-dell-app', 'piattaforma android, casa fuori da /data/user')
  assert.equal(motivo('rm -rf ~/chiavi', { ...U, home: '/data/user/0/ai.talos.dev/files/codice-r4' }), 'dati-dell-app', 'casa nella cartella dell\'app anche senza «android»')
  assert.equal(motivo('pwsh -Com "Remove-Item -Recurse C:\\Users"', W), 'primo-livello')
})

test('R04 — la pipe separa i comandi: `echo x | rm -rf ..` è una cancellazione', () => {
  assert.equal(motivo('echo x | rm -rf ..', W), 'sopra-il-progetto')
  assert.equal(motivo('echo x | rm -rf ..', U), 'casa')
})

test('R05 — `#` è un commento solo a inizio parola: `echo a#b; rm -rf ..` cancella, `echo ok # ; rm -rf ..` no', () => {
  assert.equal(motivo('echo a#b; rm -rf ..', W), 'sopra-il-progetto')
  assert.equal(giudica('echo ok # ; rm -rf ..', W), null)
})

test('R14 — casa e progetto contano sia scritti sia veri (realpath che NON è l\'identità)', () => {
  const r = { ...W, realpathFn: (p) => p.replace('C:\\Users\\nino', 'D:\\Profili\\nino') }
  assert.equal(motivo('rm -rf C:\\Users\\nino', r), 'casa')
  assert.equal(motivo('rm -rf D:\\Profili\\nino', r), 'casa')
  assert.equal(motivo('rm -rf D:\\Profili\\nino\\lavoro\\progetto', r), 'progetto')
  assert.equal(motivo('rm -rf D:\\Profili\\nino\\lavoro', r), 'sopra-il-progetto')
  assert.equal(giudica('rm -rf D:\\Profili\\nino\\altro', r), null)
})

test('179 — i motivi nuovi hanno il loro nome: cartella del telefono, dati dell\'app, tutti i progetti', () => {
  const FILES = '/data/user/0/ai.talos.dev/files'
  const T = { cartella: '/storage/emulated/0/Progetti/orca', home: `${FILES}/codice-r4`, piattaforma: 'android', ambiente: { HOME: `${FILES}/codice-r4`, TALOS_HARNESS_UI_PROJECT_DIRS: `${FILES}/codice/workspace` }, realpathFn: (p) => p }
  assert.equal(motivo('rm -rf /sdcard/DCIM', T), 'cartella-del-telefono')
  assert.equal(motivo('rm -rf /storage/ABCD-1234', T), 'telefono')
  assert.equal(motivo('rm -rf /storage/ABCD-1234/DCIM', T), 'cartella-del-telefono')
  assert.equal(motivo('rm -rf ~/chiavi', T), 'dati-dell-app')
  assert.equal(motivo(`rm -rf /data/data/ai.talos.dev/files/codice-r4/state`, T), 'dati-dell-app')
  assert.equal(motivo(`rm -rf ${FILES}/codice/workspace`, T), 'tutti-i-progetti')
  assert.equal(motivo(`rm -rf ${FILES}/codice`, T), 'tutti-i-progetti')
  assert.equal(motivo('rm -rf /sdcard/Progetti', T), 'sopra-il-progetto', 'il progetto vince sulla cartella del telefono')
  // AL CONTRARIO: su un Linux qualsiasi `~/state` non è dei dati dell'app
  assert.equal(giudica('rm -rf ~/state', U), null)
})

test('I motivi nuovi arrivano alla carta con la loro frase, in inglese nel nucleo e in inglese E italiano nell\'interfaccia', async () => {
  for (const [coda, perche] of [['phoneFolder', 'cartella-del-telefono'], ['appData', 'dati-dell-app'], ['projectsFolder', 'tutti-i-progetti'], ['tooNested', 'troppo-annidato']]) {
    assert.match(fraseDiPermesso(`server.approval.criticalDelete.${coda}`, { percorso: '/x' }).frase, /Full access/u, perche)
  }
  const testi = readFileSync(new URL('../frontend/src/i18n/testi/server.js', import.meta.url), 'utf8')
  for (const coda of ['phoneFolder', 'appData', 'projectsFolder', 'tooNested']) {
    assert.equal(testi.split(`'approval.criticalDelete.${coda}'`).length - 1, 2, `${coda}: una frase italiana e una inglese`)
  }
  const carte = []
  const esito = await verificaPermessoScrittura({ tipo: 'shell', comando: 'eval eval eval eval eval eval rm -rf build' }, {
    livelloAccesso: 'accesso-pieno', cartella: process.cwd(), consensiSessione: {}, permessiPerAttrezzo: { shell: 'sempre' },
    chiediApprovazioneFn: async (carta) => { carte.push(carta); return false },
  })
  assert.equal(esito.consentito, false)
  assert.equal(carte.length, 1)
  assert.equal(carte[0].cancellazioneCritica?.perche, 'troppo-annidato')
  assert.equal(carte[0].cancellazioneCritica?.fraseChiave, 'server.approval.criticalDelete.tooNested')
})
