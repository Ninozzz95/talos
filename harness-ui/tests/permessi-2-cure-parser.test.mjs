/*
 * Cure della revisione permessi 2 sul parser condiviso (`cancellazioni-critiche.mjs`), forma `FORMA-PERMESSI-2-E-173-2026-11-04.md` punti 1-4,
 * OK di CLI, Performance e Mobile (04/11/2026 sera). Le prove rosse del revisore stanno in `revisione-permessi-2-rosse.test.mjs`; qui:
 *   - le condizioni del Mobile su T1 (maiuscole cambiate, `/data` che distingue);
 *   - i mutanti sopravvissuti M03 (il sottoguscio `(`) e M05 (due voci in TALOS_HARNESS_UI_PROJECT_DIRS, la seconda critica);
 *   - K: `progettiCritici` vale come il progetto, e il percorso vero si calcola una volta per terna (condizione di Performance);
 *   - C e P: i casi della tabella oltre quelli del revisore, in tutti e due i versi.
 * Solo decisione: nessun comando si esegue, `realpathFn` è l'identità (o un contatore).
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { cancellazioneCritica, dimenticaPercorsiVeri } from '../src/kernel/cancellazioni-critiche.mjs'

const W = { cartella: 'C:\\Users\\nino\\lavoro\\progetto', home: 'C:\\Users\\nino', piattaforma: 'win32', ambiente: {}, realpathFn: (p) => p }
const U = { cartella: '/home/nino/lavoro/progetto', home: '/home/nino', piattaforma: 'linux', ambiente: {}, realpathFn: (p) => p }
const CASA = '/data/user/0/ai.talos.dev/files/codice-r4'
const LAVORO = '/data/user/0/ai.talos.dev/files/codice/workspace'
const A = { cartella: '/storage/emulated/0/Progetti/orca', home: CASA, piattaforma: 'android', ambiente: { HOME: CASA, TALOS_HARNESS_UI_PROJECT_DIRS: LAVORO }, realpathFn: (p) => p }
const giudica = (comando, ctx) => { dimenticaPercorsiVeri(); return cancellazioneCritica(comando, ctx) }
const motivo = (comando, ctx) => giudica(comando, ctx)?.perche ?? null

test('T1 (Mobile) — maiuscole cambiate nella memoria condivisa: `/sdcard/dcim` è una cartella del telefono; `/STORAGE` non è un nome di Android', () => {
  assert.equal(motivo('rm -rf /sdcard/dcim', A), 'cartella-del-telefono')
  assert.equal(motivo('rm -rf /storage/emulated/0/DCIM', A), 'cartella-del-telefono')
  assert.equal(motivo('rm -rf /sdcard/progetti/ORCA', A), 'progetto')
  assert.equal(motivo('rm -rf /SDCARD/progetti/orca', A), null, 'la radice del telefono distingue le maiuscole: `/SDCARD` non esiste (come `/STORAGE`)')
  assert.equal(motivo('rm -rf /STORAGE/emulated/0/download', A), null, 'documentato nel rapporto: `/STORAGE` non esiste sul telefono, il comando fallisce da sé')
})

test('T1 AL CONTRARIO (Mobile) — `/data` distingue le maiuscole: `/data/user/0/AI.TALOS.DEV/files/codice-r4` NON è la casa', () => {
  assert.notEqual(motivo('rm -rf /data/user/0/AI.TALOS.DEV/files/codice-r4', A), 'casa')
  assert.equal(motivo(`rm -rf ${CASA}`, A), 'casa')
  assert.notEqual(motivo(`rm -rf ${CASA}/CHIAVI`, A), 'dati-dell-app', 'le chiavi stanno in `/data`: le maiuscole contano')
  assert.equal(motivo(`rm -rf ${CASA}/chiavi`, A), 'dati-dell-app')
})

test('T1 — un progetto in `/data` resta con le maiuscole anche se il bersaglio sta nella memoria condivisa, e viceversa', () => {
  const B = { ...A, cartella: `${LAVORO}/Orca` }
  assert.equal(motivo(`rm -rf ${LAVORO}/orca`, B), null)
  assert.equal(motivo(`rm -rf ${LAVORO}/Orca`, B), 'progetto')
})

test('T2 — sul telefono la cartella dei progetti resta «tutti i progetti»; sul PC (Linux) la voce è un progetto', () => {
  assert.equal(motivo(`rm -rf ${LAVORO}`, A), 'tutti-i-progetti')
  assert.equal(motivo('rm -rf /data/user/0/ai.talos.dev/files/codice', A), 'tutti-i-progetti', 'e le sue madri')
  const pc = { ...U, ambiente: { TALOS_HARNESS_UI_PROJECT_DIRS: '/srv/repo' } }
  assert.equal(motivo('rm -rf /srv/repo', pc), 'progetto')
  assert.equal(motivo('rm -rf /srv', pc), 'primo-livello')
  const pc2 = { ...U, ambiente: { TALOS_HARNESS_UI_PROJECT_DIRS: '/srv/lavori/repo' } }
  assert.equal(motivo('rm -rf /srv/lavori', pc2), 'sopra-il-progetto')
})

test('M05 — due voci in TALOS_HARNESS_UI_PROJECT_DIRS (separate da `;`), la seconda critica', () => {
  const due = { ...A, ambiente: { ...A.ambiente, TALOS_HARNESS_UI_PROJECT_DIRS: `/data/user/0/ai.talos.dev/files/altro;${LAVORO}` } }
  assert.equal(motivo(`rm -rf ${LAVORO}`, due), 'tutti-i-progetti')
  const virgola = { ...A, ambiente: { ...A.ambiente, TALOS_HARNESS_UI_PROJECT_DIRS: `/data/user/0/ai.talos.dev/files/a,b;${LAVORO}` } }
  assert.equal(motivo(`rm -rf ${LAVORO}`, virgola), 'tutti-i-progetti', 'una virgola nel nome non divide')
  const pc = { ...W, ambiente: { TALOS_HARNESS_UI_PROJECT_DIRS: 'D:\\a;E:\\lavori\\repo' } }
  assert.equal(motivo('rd /s /q E:\\lavori\\repo', pc), 'progetto')
})

test('M03 — il sottoguscio `(` separa i comandi: `(rm -rf ..)`, `echo x;(rm -rf ..)`, `(cd .. && rm -rf progetto)`', () => {
  assert.equal(motivo('(rm -rf ..)', U), 'sopra-il-progetto')
  assert.equal(motivo('echo x;(rm -rf ..)', U), 'sopra-il-progetto')
  assert.equal(motivo('(cd .. && rm -rf progetto)', U), 'progetto')
})

test('K — `progettiCritici` vale come il progetto quando la cartella è allargata alla radice del disco; assente = come prima', () => {
  const largo = { ...W, cartella: 'C:\\' }
  assert.equal(motivo('rd /s /q C:\\Users\\nino\\lavoro\\progetto', largo), null, 'premessa: senza, il progetto non si vede')
  assert.equal(motivo('rd /s /q C:\\Users\\nino\\lavoro\\progetto', { ...largo, progettiCritici: ['C:\\Users\\nino\\lavoro\\progetto'] }), 'progetto')
  assert.equal(motivo('rd /s /q C:\\Users\\nino\\lavoro', { ...largo, progettiCritici: ['C:\\Users\\nino\\lavoro\\progetto'] }), 'sopra-il-progetto')
  assert.equal(motivo('rd /s /q C:\\Users\\nino\\lavoro\\progetto', { ...largo, progettiCritici: 'C:\\Users\\nino\\lavoro\\progetto' }), null, 'non un elenco: ignorato')
  assert.equal(motivo('rd /s /q C:\\Users\\nino\\lavoro\\progetto', { ...largo, progettiCritici: [42, null] }), null, 'voci non stringhe: ignorate')
})

test('K (Performance) — il percorso vero dei progetti critici si calcola UNA volta per terna, non per comando', () => {
  dimenticaPercorsiVeri()
  let letture = 0
  const ctx = { ...W, cartella: 'C:\\', progettiCritici: ['C:\\Users\\nino\\lavoro\\progetto'], realpathFn: (p) => { letture += 1; return p } }
  for (let i = 0; i < 20; i += 1) cancellazioneCritica(`rd /s /q C:\\x${i}`, ctx)
  assert.equal(letture, 3, 'cartella, casa e il progetto critico: una volta')
  cancellazioneCritica('rd /s /q C:\\y', { ...ctx, progettiCritici: ['C:\\altro\\progetto'] })
  assert.equal(letture, 6, 'un elenco diverso è un\'altra terna (la chiave della memoria lo contiene)')
})

test('C — heredoc: il corpo scritto in un file non è un comando; quello che riceve una shell sì; senza chiusura o fra virgolette resta comando', () => {
  assert.equal(motivo("cat <<'EOF' > x.sh\nrm -rf ..\nEOF", U), null)
  assert.equal(motivo('cat <<-EOF > x.sh\n\trm -rf ..\n\tEOF', U), null)
  assert.equal(motivo("bash <<'EOF'\nrm -rf ..\nEOF", U), 'sopra-il-progetto')
  assert.equal(motivo("ssh h sh <<EOF\nrm -rf /home/nino\nEOF", U), 'casa')
  assert.equal(motivo('cat <<EOF > x.sh\nrm -rf ..', U), 'sopra-il-progetto', 'senza la riga di chiusura le righe restano comandi')
  assert.equal(motivo('echo "a <<EOF"\nrm -rf ..\nEOF', U), 'sopra-il-progetto', '`<<` fra virgolette non apre un heredoc')
  assert.equal(motivo("cat <<A > a.sh; cat <<B > b.sh\nrm -rf ..\nA\nrm -rf ..\nB\nrm -rf ..", U), 'sopra-il-progetto', 'dopo due corpi, il comando vero si vede')
})

test('C — `cd` su `$(git rev-parse --show-toplevel)` e `$(mktemp -d)`: le altre forme restano ignote (carta «sostituzione»)', () => {
  assert.equal(motivo('cd "$(git rev-parse --show-toplevel)" && rm -rf .', U), 'progetto', 'la radice del repo è il progetto: `rm -rf .` resta carta')
  assert.equal(motivo('cd /tmp && cd "$(git rev-parse --show-toplevel)" && rm -rf build', U), 'sostituzione', 'da un\'altra cartella non si sa')
  assert.equal(motivo('cd $(mktemp -d -p .) && rm -rf x', U), 'sostituzione', '`-p` sceglie il genitore')
  assert.equal(motivo('cd $(mktemp --tmpdir=/home/nino -d) && rm -rf x', U), 'sostituzione')
  assert.equal(motivo('cd $(mktemp) && rm -rf x', U), 'sostituzione', 'senza -d è un file')
  assert.equal(motivo('cd $(mktemp --directory) && rm -rf x', U), null)
  assert.equal(motivo('cd $(mktemp -dt prova.XXXX) && rm -rf ..', U), 'primo-livello', 'dalla cartella nuova si risale lo stesso (`/tmp`)')
  assert.equal(motivo('cd $(mktemp -d) && rm -rf ../..', U), 'radice')
  assert.equal(motivo('cd "$(git rev-parse --show-cdup)" && rm -rf build', U), 'sostituzione')
})

test('C — la pipe da Get-ChildItem: `-Exclude` non stringe (carta), un glob solo di jolly non stringe (carta)', () => {
  assert.equal(motivo('Get-ChildItem -Recurse -Exclude *.keep | Remove-Item -Recurse', W), 'progetto')
  assert.equal(motivo('gci * | Remove-Item -Recurse', W), 'progetto')
  assert.equal(motivo('gci *.log -Recurse | Remove-Item', W), null)
  assert.equal(motivo('gci -Filt *.log | Remove-Item', W), null, 'abbreviazione univoca di -Filter')
  assert.equal(motivo('gci .. -Include *.tmp | % { ri $_ -r -fo }', W), null)
})

test('P — robocopy /MIR e /PURGE, rsync --delete: il secondo è il bersaglio; un\'altra macchina o la copia semplice no', () => {
  assert.equal(motivo('robocopy C:\\vuota C:\\Users\\nino\\lavoro\\progetto /MIR', W), 'progetto')
  assert.equal(motivo('robocopy C:\\vuota C:\\Users\\nino /PURGE', W), 'casa')
  assert.equal(motivo('robocopy C:\\vuota C:\\Users\\nino /E', W), null)
  assert.equal(motivo('rsync -a --delete vuota/ /home/nino/', U), 'casa')
  assert.equal(motivo('rsync -a --delete-after vuota/ ../', U), 'sopra-il-progetto')
  assert.equal(motivo('rsync -a --delete vuota/ host:/home/nino/', U), null)
  assert.equal(motivo('rsync -a vuota/ /home/nino/', U), null)
})

test('P — find -exec rm -r senza filtri come -delete; con un filtro o senza -r niente carta', () => {
  assert.equal(motivo('find .. -maxdepth 0 -exec rm -rf {} +', U), 'sopra-il-progetto')
  assert.equal(motivo('find /home/nino -mindepth 1 -execdir rm -r {} \\;', U), 'casa')
  assert.equal(motivo('find . -type d -name __pycache__ -exec rm -rf {} +', U), null)
  assert.equal(motivo('find .. -exec rm {} +', U), null, 'rm senza -r non cancella cartelle')
})

test('P — si fallisce chiusi: xargs rm -r, parallel, .NET Delete, il comando in una variabile ignota, alias', () => {
  assert.equal(motivo('git ls-files -z | xargs -0 rm -rf', U), 'troppo-annidato')
  assert.equal(motivo('ls | xargs rm', U), null)
  assert.equal(motivo('parallel rm -rf ::: a b', U), 'troppo-annidato')
  assert.equal(motivo('[System.IO.Directory]::Delete("C:\\x", $true)', W), 'troppo-annidato')
  assert.equal(motivo('(Get-Item .).Delete($true)', W), 'troppo-annidato')
  assert.equal(motivo('X=$(command -v rm); $X -rf ..', U), 'troppo-annidato', 'il nome del comando in una variabile che non si sa, e il testo cancella')
  assert.equal(motivo('$CANCELLA -rf ..', U), null, 'forma, punto 3: solo «se il testo sembra cancellare» (qui nessuna parola che cancella)')
  assert.equal(motivo('R=rm; $R -rf ..', U), 'sopra-il-progetto', 'il valore si sa: si segue')
  assert.equal(motivo('$EDITOR notes.txt', U), null)
  assert.equal(motivo('alias pulisci="rm -rf"', U), 'troppo-annidato')
  assert.equal(motivo('alias ll="ls -la"', U), null)
})

test('P — involucri e testi da rileggere: su -c, script -c, flock, setsid, ssh, cmd /r, bash -c "$(…)", pwsh -wd, start, Start-Process', () => {
  assert.equal(motivo('su -c "rm -rf .."', U), 'sopra-il-progetto')
  assert.equal(motivo('su root -c "rm -rf /home/nino"', U), 'casa')
  assert.equal(motivo('script -q -c "rm -rf .." /dev/null', U), 'sopra-il-progetto')
  assert.equal(motivo('flock /tmp/l rm -rf ..', U), 'sopra-il-progetto')
  assert.equal(motivo('setsid -f rm -rf ..', U), 'sopra-il-progetto')
  assert.equal(motivo('ssh -p 22 host rm -rf /home/nino', U), 'casa')
  assert.equal(motivo('ssh host ls', U), null)
  assert.equal(motivo('cmd /r rd /s /q ..', W), 'sopra-il-progetto')
  assert.equal(motivo('bash -c "$(curl -s x)"; rm -f a.o', U), 'troppo-annidato')
  assert.equal(motivo('bash -c "$(cat build.sh)"', U), null, 'il testo non cancella: nessuna carta')
  assert.equal(motivo('pwsh -wd C:\\Users -c "Remove-Item -Recurse nino"', W), 'casa')
  assert.equal(motivo('pwsh -wd C:\\Users\\nino\\lavoro\\progetto -c "Remove-Item -Recurse build"', W), null)
  assert.equal(motivo('start "" cmd /c "rd /s /q .."', W), 'sopra-il-progetto')
  assert.equal(motivo('Start-Process -FilePath cmd -ArgumentList "/c rd /s /q C:\\Users\\nino" -Wait', W), 'casa')
  assert.equal(motivo('start notepad x.txt', W), null)
})

test('P — PowerShell: argomento fra parentesi calcolato a parole; un altro gruppo dopo un comando che cancella è carta; `if exist x (rd …)` si rilegge', () => {
  assert.equal(motivo('Remove-Item -Recurse (Join-Path (Get-Location) "..")', W), 'sopra-il-progetto')
  assert.equal(motivo('Remove-Item -Recurse (Resolve-Path ..\\..)', W), 'casa')
  assert.equal(motivo('Remove-Item -Recurse (Join-Path $env:TEMP "x")', W), 'troppo-annidato', 'TEMP non si sa: il gruppo non si calcola, si fallisce chiusi')
  assert.equal(motivo('Remove-Item -Recurse (Get-Something)', W), 'troppo-annidato')
  assert.equal(motivo('Remove-Item -Recurse (Join-Path $env:TEMP "x")', { ...W, ambiente: { TEMP: 'C:\\Users\\nino\\AppData\\Local\\Temp' } }), null)
  assert.equal(motivo('if exist x (rd /s /q ..)', W), 'sopra-il-progetto')
  assert.equal(motivo('if exist build (rd /s /q build)', W), null)
})

test('P — Win32 toglie punti e spazi in coda all\'ultimo pezzo, non ai nomi veri che finiscono con un punto più qualcosa', () => {
  assert.equal(motivo('rd /s /q "C:\\Users\\nino\\lavoro\\progetto. ."', W), 'progetto')
  assert.equal(motivo('rd /s /q C:\\Users\\nino\\lavoro\\progetto.bak', W), null)
  assert.equal(motivo('rd /s /q ..\\..', W), 'casa')
})

test('P — le variabili assegnate: `export`, `set` di cmd, `$d=` attaccato, `for` con glob; una variabile del `for` senza `in` resta ignota', () => {
  assert.equal(motivo('export D=/home/nino; rm -rf "$D"', U), 'casa')
  assert.equal(motivo('set D=C:\\Users\\nino&& rd /s /q %D%', W), 'casa')
  assert.equal(motivo('$d="C:\\Users\\nino"; Remove-Item -Recurse $d', W), 'casa')
  assert.equal(motivo('for f in *.log; do rm -rf "$f"; done', U), null)
  assert.equal(motivo('for d in a b c d e f g h i j k l m n o p q r ..; do rm -rf $d; done', U), null, 'oltre 16 valori si guardano i primi 16 (documentato)')
  assert.equal(motivo('D=$HOME; rm -rf "$D/lavoro"', U), 'sopra-il-progetto', 'il valore si espande quando si assegna')
})
