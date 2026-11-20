/*
 * ⛔⛔ 0.2.4, BLOCCO 3 (decisione dell'owner 17/11/2026 13:40, richiesta 154; forma `desktop/in-corso/FORMA-024-B3-SCRIVE-NEL-PROGETTO-
 *   2026-11-18.md`): IN «SCRIVE NEL PROGETTO» CHIEDONO ANCHE I COMANDI CHE SCRIVONO O CANCELLANO FUORI DAL PROGETTO.
 *
 * Questo modulo dice DOVE un comando della shell scrive, a parole: i bersagli che il testo nomina (redirezioni, `rm`, `cp`, `mv`, `tee`,
 * `sed -i`, `tar -x -C`, `curl -o`, `git -C`, i cmdlet di PowerShell, i comandi di cmd…), dopo involucri, variabili note, `cd` e i testi
 * dati a un'altra shell (`bash -c`, `cmd /c`, `powershell -Command`/`-EncodedCommand`, `eval`). Non legge il disco: il dentro/fuori lo
 * misura il cancello (`talosHarness.mjs`, `scritturaDellaShellFuori`) con la stessa `posizioneFn` di `scrivi` (percorso vero, collegamenti
 * e giunzioni, la casa Linux misurata dal servente).
 * Le parole le legge il lettore di `cancellazioni-critiche.mjs` (`__lettoreDeiComandi`), prestato e non copiato: una shell letta in un
 * modo solo.
 *
 * Esito: `{ bersagli: [{ percorso, scritto, cartella, come }], illeggibili: [{ scritto, come }], globali: [{ comando, come }] }`.
 *   - `bersagli`: percorsi assoluti (a parole) dove il comando scrive o cancella; `cartella` vera se il bersaglio è una cartella (allora
 *     «Consenti in questa cartella» ricorda lei, non la madre).
 *   - `illeggibili`: un bersaglio in posizione di scrittura che non si sa dire (variabile ignota, `$(…)`, `cd -`, `xargs rm`, troppo
 *     annidato, errore del lettore): il cancello CHIEDE «non so dove» (come Codex `codex-rs/shell-command/src/bash.rs:30-31` e Claude Code
 *     `CHANGELOG.md:4699`: si fallisce chiusi).
 *   - `globali`: un'installazione fuori per natura (`npm i -g`, `pip install` senza un ambiente del progetto, `cargo install`, `apt
 *     install`…): carta «non so dove», col comando a parole.
 * Eccezioni (forma §3, una per una, giudice v2188): la cartella temporanea per NOME (`$TMPDIR`, `%TEMP%`, `$env:TMP`, `/tmp`,
 *   `$(mktemp)`) se il testo non la riassegna; i dispositivi (`/dev/null`, `NUL`, `$null`, `/dev/stdout`…). Il percorso vero della
 *   temporanea lo confronta il cancello. Le cache degli strumenti (`~/.npm`, `~/.cache/pip`) non sono nel testo: qui non si guardano.
 * Fonti (19/11/2026): Codex `codex-rs/protocol/src/permissions.rs:837-852` (progetto + `/tmp` + `$TMPDIR` scrivibili di serie),
 *   `sandboxing/src/seatbelt_base_policy.sbpl:18-21` (`/dev/null`); Hermes `tools/approval_detection.py:62-68` (per `cp`/`mv` il bersaglio
 *   è l'ultimo argomento, per `>`/`tee` sempre) e `:352-355` (le redirezioni e `tee` verso i posti delicati); Claude Code doc permission-
 *   modes (acceptEdits: `mkdir touch rm rmdir mv cp sed` e `Set-Content Add-Content Clear-Content Remove-Item` solo dentro) e
 *   `CHANGELOG.md:3172` (la destinazione di `tee`), `:4932` (`/dev/null`).
 * ⛔ NON È UN ISOLAMENTO: un programma che scrive da sé (`node script.mjs`, `python -c "open(…)"`, `make`) non si vede. È la rete del
 *   testo, come acceptEdits di Claude Code; il confine vero è la sandbox del sistema (Codex, Cursor). Detto anche nella scheda.
 */
import { homedir, tmpdir } from 'node:os'
import { __lettoreDeiComandi as L } from './cancellazioni-critiche.mjs'

const { comandiSemplici, separaHeredoc, senzaInvolucri, cartellaDopo, argomentoDelCd, bersaglioAssoluto, contesto, ricordaAssegnazioni,
  sostituzioniDi, nomeDelComando, decodificaPowerShell, legateNelTesto, SHELL_POSIX, SHELL_POWERSHELL, COMANDI_CHE_SPOSTANO,
  OPZIONE_COMANDO_PS, OPZIONE_CODIFICATA_PS, OPZIONI_PS_CON_VALORE } = L

const TETTO_ANNIDAMENTO = 4
const TETTO_COMANDI = 2000
const GLOB = /[*?[]/u

/** Un testo che PUÒ scrivere: senza nessuno di questi segni un errore del lettore non dà carta (rumore), con uno sì (sicurezza). */
const SEMBRA_SCRIVERE = /[>]|\b(?:rm|rmdir|unlink|shred|mkdir|md|touch|truncate|chmod|chown|chgrp|chattr|mv|move|cp|copy|xcopy|robocopy|install|ln|mklink|rsync|scp|dd|tee|sed|perl|tar|unzip|7z|7za|curl|wget|find|xargs|git|npm|pnpm|yarn|bun|pip\d*(?:\.\d+)?|pipx|uv|cargo|go|gem|dotnet|brew|apt|apt-get|dnf|yum|pacman|apk|zypper|snap|choco|winget|scoop|make|del|erase|rd|ren|rename|set-content|add-content|clear-content|out-file|new-item|remove-item|copy-item|move-item|rename-item|expand-archive|compress-archive|export-csv|export-clixml|start-transcript|tee-object|invoke-webrequest|invoke-restmethod|iwr|irm|start-bitstransfer|sc|ac|clc|ni|ri|cpi|mi|rni|epcsv|eval|iex|invoke-expression|bash|sh|zsh|cmd|powershell|pwsh)\b/iu

/** I dispositivi che non sono file: scriverci non tocca il disco (Codex `seatbelt_base_policy.sbpl:18-21`, gemini-cli `.sb:84-86`). */
const DISPOSITIVO = /^(?:\/dev\/(?:null|stdout|stderr|tty|fd\/\d+)|(?:\\\\\.\\)?nul:?|con:?|\$null)$/iu
/** La cartella temporanea scritta per NOME (forma §3, E1): `$TMPDIR/…`, `${TEMP}`, `%TMP%\…`, `$env:TEMP\…`, `/tmp/…`, `/var/tmp/…`. */
const TEMPORANEA_PER_NOME = /^(?:\$\{?(TMPDIR|TEMP|TMP)\}?|%(TEMP|TMP)%|\$env:(TEMP|TMP|TMPDIR))(?=$|[\\/])/iu
const TEMPORANEA_DI_POSIX = /^\/(?:var\/)?tmp(?=$|\/)/u
/*
 * Giro 2 (revisore B3, S1): la temporanea per nome vale solo se il RESTO non può risalire: nessun pezzo `..` e niente che la shell
 *   espande ancora (`$X`, `%X%`, apici inversi, glob, graffe: `X=..; > $TEMP/$X/…`, `/tmp/.?/…`). Altrimenti il bersaglio si
 *   risolve e si misura come ogni altro (`%TEMP%\..\Roaming\…\Startup\a.bat` chiede), come Hermes che esenta la temporanea solo dopo
 *   `realpath` (`tools/approval_detection.py:1519-1525`). Windows risolve solo i pezzi fatti di `.` o `..` (Microsoft Learn, «File path
 *   formats on Windows», «Evaluate relative components»): `..a`, `a..b` e `...` sono nomi, e restano nella temporanea.
 */
const RESTO_CHE_ESPANDE = /[$%`*?[{]/u
/*
 * Giro 3 (owner 19/11/2026 08:23, giudice v2229): esenti SOLO le espansioni che non possono dare `..`: `$RANDOM`, `${RANDOM}`, `%RANDOM%`
 *   (un numero; non se il testo nomina RANDOM in altro modo o il servente lo ha nell'ambiente: `unset RANDOM` le toglie il senso,
 *   manuale di bash «Bash Variables», e in cmd `set RANDOM=…` vince), `$$` (fuori da `$env:`, dove è l'ultima parola della riga prima)
 *   e un glob `*`/`?` nell'ULTIMO pezzo con almeno un segno che non è un punto (`out-*.log` non prende mai `..`; `.?`, `*` sì).
 */
const RANDOM_ESPANSO = /\$\{RANDOM\}|\$RANDOM(?!\w)|%RANDOM%/giu
/* in PowerShell `$RANDOM` è una variabile qualsiasi: `$RANDOM = '..'`, `$RANDOM += …` la riassegnano */
const randomFermo = (ctx) => (ctx.randomNelTesto ??= (ctx.testo.match(/RANDOM/giu) ?? []).length === (ctx.testo.match(RANDOM_ESPANSO) ?? []).length
  && !/\$\{?RANDOM\}?\s*(?:[-+*/%]|\?\?)?=(?!=)/iu.test(ctx.testo) && !Object.keys(ctx.ambiente ?? {}).some((k) => k.toUpperCase() === 'RANDOM'))
function restoFermo(resto, ctx, conDollari = true) {
  let r = randomFermo(ctx) ? resto.replace(RANDOM_ESPANSO, 'N') : resto
  if (conDollari) r = r.replace(/\$\$/gu, 'N')
  const pezzi = r.split(/[\\/]/u)
  const ultimo = pezzi.pop()
  if (pezzi.includes('..') || ultimo === '..' || RESTO_CHE_ESPANDE.test(pezzi.join('/')) || /[$%`[{]/u.test(ultimo)) return false
  return !/[*?]/u.test(ultimo) || /[^.*?]/u.test(ultimo)
}
const MKTEMP = /^\$\(\s*mktemp\b([^)]*)\)$/u

/*
 * Giro 3, le graffe di bash (revisore B3: `cp k $TEMP/{..,..}/x`, `"$TEMP"/{.,..}/{.,..}/Roaming/x/` uscivano senza carta, già nella
 *   0.2.3): oltre al testo com'è si leggono i testi con le graffe aperte, la più interna per prima (manuale di bash «Brace Expansion»:
 *   una virgola fuori dalle virgolette, mai `${…}`). Sul testo e non sulle parole: su Windows il lettore spezza le graffe come blocchi di
 *   PowerShell. Più di TETTO_GRAFFE testi: `null` (chiede «non so dove»). Le parti con spazi o virgolette non si aprono (`'{"a":1,"b":2}'`).
 */
const TETTO_GRAFFE = 32
const GRAFFA = /(?<!\$)\{([^{}\s'"]*,[^{}\s'"]*)\}/u
function testiConLeGraffeAperte(testo) {
  if (!GRAFFA.test(testo)) return []
  let testi = [testo]
  for (let giri = 0; testi.some((t) => GRAFFA.test(t)); giri += 1) {
    testi = [...new Set(testi.flatMap((t) => { const m = GRAFFA.exec(t); return m ? m[1].split(',').map((x) => t.slice(0, m.index) + x + t.slice(m.index + m[0].length)) : [t] }))]
    if (testi.length > TETTO_GRAFFE || giri > TETTO_GRAFFE) return null
  }
  return testi
}

/*
 * Giro 3, il collegamento creato e usato nello stesso comando (revisore B3: `ln -s .. $TEMP/su && echo x > $TEMP/su/x`, `mklink /J g
 *   ..\fuori && echo x > g\a`, già nella 0.2.3): il disco non lo ha ancora, quindi il cancello non lo vede. Si ricorda il nome e dove porta;
 *   ogni bersaglio DOPO, sotto quel nome, si misura anche lì (in più, mai al posto: se il nome era già una cartella vera, vale lei).
 *   Dove porta: `ln -s` e `mklink`/`mklink /D` dalla cartella del collegamento, `ln` senza `-s`, `ln -sr`, `mklink /J` e `/H` dalla
 *   cartella del comando; `New-Item` in tutte e due. Come Hermes, che misura il bersaglio dopo `realpath` (`tools/approval_detection.py:1519-1525`).
 */
function ricordaCollegamento(nome, verso, ctx, qui, daDove) {
  const n = bersaglioAssoluto(nome, ctx, qui)
  if (!n || verso === undefined) return
  const versi = verso === null ? [null] : daDove.map((d) => bersaglioAssoluto(verso, ctx, d === 'madre' ? ctx.p.dirname(n) : qui))
  for (const v of versi) (ctx.collegamenti ??= []).push({ nome: n, verso: v ?? null })
  ctx.versione += 1
}
function viaICollegamenti(s, opzioni, ctx, qui, esito) {
  if ((ctx.viaCollegamento ?? 0) >= TETTO_ANNIDAMENTO) return
  const a = bersaglioAssoluto(s, ctx, qui)
  if (!a) return
  const confronta = (x) => (ctx.windows ? x.toLowerCase() : x)
  for (const { nome, verso } of [...ctx.collegamenti]) {
    const sotto = confronta(a) === confronta(nome) ? '' : confronta(a).startsWith(confronta(nome).replace(/[\\/]?$/u, ctx.windows ? '\\' : '/')) ? a.slice(nome.length) : null
    if (sotto === null) continue
    if (verso === null) { esito.illeggibili.push({ scritto: s, come: 'collegamento' }); continue }
    ctx.viaCollegamento = (ctx.viaCollegamento ?? 0) + 1
    aggiungi(ctx.p.join(verso, sotto), opzioni, ctx, qui, esito)
    ctx.viaCollegamento -= 1
  }
}

/* ── i comandi che scrivono ─────────────────────────────────────────────────────────────────────────────────────────────── */

/*
 * Su Windows `/x/…` e `/mnt/x/…` hanno due letture (vedi `discoLocale` in `cancellazioni-critiche.mjs`): per un programma POSIX (il
 * `rm` di Git, che il servente trova sul PATH: i comandi partono in cmd, `shellDeiComandi`) è il disco `x:`; per un cmdlet di PowerShell
 * e per i comandi di cmd è la cartella `\x\…` del disco corrente. Ogni comando si legge con la regola del suo programma; un `cd` con la
 * regola di PowerShell/cmd se il testo ne usa uno.
 */
const DEL_SISTEMA_WINDOWS = new Set(['set-content', 'sc', 'add-content', 'ac', 'clear-content', 'clc', 'out-file', 'new-item', 'ni', 'remove-item', 'ri',
  'copy-item', 'cpi', 'move-item', 'mi', 'rename-item', 'rni', 'expand-archive', 'compress-archive', 'export-csv', 'epcsv', 'export-clixml', 'start-transcript',
  'tee-object', 'invoke-webrequest', 'iwr', 'invoke-restmethod', 'irm', 'start-bitstransfer', 'set-location', 'sl', 'push-location', 'pop-location',
  'del', 'erase', 'rd', 'md', 'ren', 'rename', 'copy', 'xcopy', 'robocopy', 'move', 'mklink'])
/** Gli argomenti alla PowerShell (`-Path`, `-Recurse`…): `rm`, `cp`, `mv`, `mkdir` scritti così sono gli alias dei cmdlet. */
const STILE_PS = /^-(?:path|literalpath|lp|destination|filepath|force|recurse|itemtype|value|outfile|pspath)\b/iu
const CANCELLA_TUTTI = new Set(['rm', 'rmdir', 'unlink', 'shred', 'srm'])
const DI_CMD = new Set(['del', 'erase', 'rd', 'md', 'ren', 'rename', 'copy', 'xcopy', 'robocopy', 'move', 'mklink'])
/* Cura $TEMP di PowerShell: un comando è di PowerShell se è un suo cmdlet o alias (quelli di DEL_SISTEMA_WINDOWS che non sono di cmd), un
   Verbo-Nome con uno dei verbi di PowerShell più usati per scrivere, o se sta nel testo dato a powershell/pwsh/iex. Le variabili
   d'ambiente lì si scrivono `$Env:<nome>` (Microsoft Learn «about_Environment_Variables», letto il 19/11/2026). */
const DI_POWERSHELL = new Set([...DEL_SISTEMA_WINDOWS].filter((n) => !DI_CMD.has(n)))
const VERBO_NOME_PS = /^(?:add|clear|copy|export|import|invoke|move|new|out|remove|rename|set|start|tee|write|expand|compress|get|push|pop|select|format|convertto|send|save)-[a-z]+$/u
/** Le opzioni che prendono un valore (che NON è il bersaglio), per comando POSIX. */
const VALORI = {
  mkdir: ['-m', '--mode', '--context'], touch: ['-r', '--reference', '-d', '--date', '-t'], truncate: ['-s', '--size', '-r', '--reference'],
  cp: ['-S', '--suffix'], mv: ['-S', '--suffix'], ln: ['-S', '--suffix'], install: ['-m', '--mode', '-o', '--owner', '-g', '--group', '-S', '--suffix'],
  rsync: ['-e', '--rsh', '-f', '--filter', '--exclude', '--include', '--exclude-from', '--include-from', '--files-from', '--chmod', '--chown', '-B', '--block-size', '--port', '--timeout', '--rsync-path', '--password-file', '--bwlimit', '--max-size', '--min-size'],
  scp: ['-P', '-i', '-F', '-o', '-l', '-S', '-c', '-J'], chmod: ['--reference'], chown: ['--reference', '--from'], chgrp: ['--reference'],
  tee: [], sed: ['-l', '--line-length'], tar: ['-T', '--files-from', '-X', '--exclude-from', '-b', '--blocking-factor', '-H', '--format', '-I', '--use-compress-program', '--exclude', '--owner', '--group', '--mode', '--mtime', '--transform', '--strip-components'],
}
/** Le opzioni corte di curl che prendono un valore (`-sSLo f`: la `o` è l'ultima del gruppo e prende la parola dopo). */
const CURL_CORTE_CON_VALORE = new Set([...'oDcHdXuAebFTxwmKErYyzCUPQt'])
/** I sotto-comandi di git che non scrivono niente: con `-C fuori` non chiedono. */
const GIT_CHE_LEGGE = new Set(['status', 'log', 'diff', 'show', 'rev-parse', 'ls-files', 'ls-tree', 'ls-remote', 'blame', 'grep', 'describe', 'shortlog', 'cat-file', 'help', 'version', 'whatchanged', 'rev-list', 'name-rev', 'for-each-ref', 'show-ref', 'check-ignore', 'count-objects', 'var'])
const INSTALLA = new Set(['install', 'i', 'add', 'uninstall', 'un', 'remove', 'rm', 'r', 'link', 'ln', 'update', 'up', 'upgrade', 'unlink'])
/** Gestori di pacchetti del sistema: ogni installazione o rimozione scrive fuori per natura. */
const DEL_SISTEMA = new Map([
  ['brew', ['install', 'uninstall', 'remove', 'rm', 'upgrade', 'reinstall', 'link', 'unlink', 'tap', 'untap']],
  ['apt', ['install', 'remove', 'purge', 'upgrade', 'full-upgrade', 'dist-upgrade', 'autoremove']], ['apt-get', ['install', 'remove', 'purge', 'upgrade', 'dist-upgrade', 'autoremove']],
  ['dnf', ['install', 'remove', 'erase', 'upgrade', 'update', 'reinstall']], ['yum', ['install', 'remove', 'erase', 'upgrade', 'update', 'reinstall']],
  ['zypper', ['install', 'in', 'remove', 'rm', 'update', 'up']], ['apk', ['add', 'del', 'upgrade']], ['snap', ['install', 'remove', 'refresh']],
  ['choco', ['install', 'uninstall', 'upgrade']], ['winget', ['install', 'uninstall', 'upgrade']], ['scoop', ['install', 'uninstall', 'update']],
  ['pipx', ['install', 'uninstall', 'upgrade', 'inject', 'reinstall']], ['gem', ['install', 'uninstall', 'update']],
  ['go', ['install']], ['cargo', ['install', 'uninstall']],
])

/* ── le parole ──────────────────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Le duplicazioni di canale non aprono file (`2>&1`, `>&2`, `1>&-`): via. `&>`/`&>>` (bash) e `*>` (PowerShell) mandano tutto a un file:
 * diventano `>`/`>>`. `|&` è una pipe. Fatto sul testo intero: fra virgolette si perde al più una carta in meno su un testo che non è un
 * comando, mai un bersaglio (il pezzo dopo `>` resta).
 */
function senzaDuplicazioni(testo) {
  return testo.replace(/\d*>&(?:\d+|-)(?![\w./\\~$])/gu, ' ').replace(/\d*<&(?:\d+|-)/gu, ' ').replace(/&>>/gu, ' >> ').replace(/&>/gu, ' > ')
    .replace(/\*>>/gu, ' >> ').replace(/\*>/gu, ' > ').replace(/\|&/gu, '|').replace(/>&(?=[^\s\d-])/gu, '> ')
}

const REDIREZIONE_SOLA = /^\d*(?:>>|>\||>|<>)$/u
const REDIREZIONE_ATTACCATA = /^\d*(?:>>|>\||>|<>)(.+)$/su
/**
 * Le redirezioni di un comando: le parole tolte e i bersagli. `> f`, `>>f`, `2>f`, `>|f`, `<>f`; una `>` dentro una parola senza spazi
 * (`echo hi>out.txt`) è una redirezione. Una parola con spazi era fra virgolette: è testo, non si guarda (un messaggio «a -> b»).
 */
function staccaRedirezioni(comando) {
  const parole = []
  const bersagli = []
  for (let i = 0; i < comando.length; i += 1) {
    const w = comando[i]
    const t = w.testo
    if (w.gruppo !== undefined || w.sostituzione) { parole.push(w); continue }
    if (REDIREZIONE_SOLA.test(t)) { if (comando[i + 1]) { bersagli.push(comando[i + 1].testo); i += 1 } continue }
    const attaccata = REDIREZIONE_ATTACCATA.exec(t)
    if (attaccata) { bersagli.push(attaccata[1]); continue }
    if (!/\s/u.test(t) && /[^<>]>/u.test(t) && !/^<|^-/u.test(t)) {
      const k = t.search(/>/u)
      const resto = t.slice(k).replace(/^>>?\|?/u, '')
      parole.push({ ...w, testo: t.slice(0, k).replace(/\d+$/u, '') })
      if (resto) bersagli.push(resto)
      else if (comando[i + 1]) { bersagli.push(comando[i + 1].testo); i += 1 }
      continue
    }
    parole.push(w)
  }
  return { parole: parole.filter((w) => w.testo !== ''), bersagli }
}

/** Gli operandi POSIX: le parole senza trattino, saltando il valore delle opzioni che lo prendono; dopo `--` tutto è operando. */
function operandiPosix(argomenti, conValore = []) {
  const valori = new Set(conValore)
  const fuori = []
  let opzioni = true
  for (let i = 0; i < argomenti.length; i += 1) {
    const a = argomenti[i]
    if (opzioni && a === '--') { opzioni = false; continue }
    if (opzioni && a.startsWith('-') && a.length > 1) {
      const nome = a.startsWith('--') ? a.split('=')[0] : a
      if (valori.has(nome) && !a.includes('=') && (a.startsWith('--') || a.length === 2)) i += 1
      continue
    }
    fuori.push(a)
  }
  return fuori
}
/** Il valore di un'opzione (`-t X`, `-tX`, `--target-directory=X`, `--target-directory X`), o `undefined`. */
function valoreDi(argomenti, corte, lunghe) {
  for (let i = 0; i < argomenti.length; i += 1) {
    const a = argomenti[i]
    if (a === '--') break
    for (const l of lunghe) { if (a === l) return argomenti[i + 1] ?? null; if (a.startsWith(`${l}=`)) return a.slice(l.length + 1) }
    for (const c of corte) { if (a === c) return argomenti[i + 1] ?? null; if (a.startsWith(c) && !a.startsWith('--') && a.length > c.length) return a.slice(c.length) }
  }
  return undefined
}
const haOpzione = (argomenti, re) => argomenti.some((a) => re.test(a))

/**
 * I parametri di un cmdlet: `-Nome valore`, `-Nome:valore`; i nomi si abbreviano (PowerShell accetta ogni prefisso univoco): `nomi` dà i
 * nomi interi, e vale ogni prefisso di almeno due lettere. Le parole senza trattino che non sono il valore di un parametro noto sono
 * posizionali. Un parametro ignoto davanti a una parola: la parola conta anche come posizionale (una carta in più, mai in meno).
 */
const PS_PERCORSO = ['path', 'literalpath', 'pspath', 'filepath', 'destination', 'destinationpath', 'outfile', 'lp']
const PS_VALORE_NON_PERCORSO = ['value', 'itemtype', 'type', 'encoding', 'filter', 'include', 'exclude', 'erroraction', 'credential', 'stream', 'delimiter', 'inputobject', 'uri', 'method', 'body', 'headers', 'contenttype', 'useragent', 'compressionlevel', 'newname', 'name', 'source', 'width']
function parametriPs(argomenti) {
  const nominati = new Map()
  const posizionali = []
  const prende = (nome, elenco) => elenco.find((n) => n === nome || (nome.length >= 2 && n.startsWith(nome)))
  for (let i = 0; i < argomenti.length; i += 1) {
    const a = argomenti[i]
    const m = /^-([A-Za-z]+)(?::(.*))?$/su.exec(a)
    if (!m) { posizionali.push(a); continue }
    const nome = m[1].toLowerCase()
    const intero = prende(nome, PS_PERCORSO) ?? prende(nome, PS_VALORE_NON_PERCORSO)
    const valore = m[2] !== undefined ? m[2] : (argomenti[i + 1] !== undefined && !/^-[A-Za-z]/u.test(argomenti[i + 1]) ? argomenti[i + 1] : undefined)
    if (intero) {
      if (m[2] === undefined && valore !== undefined) i += 1
      if (valore !== undefined) nominati.set(intero, [...(nominati.get(intero) ?? []), valore])
    }
  }
  return { nominati, posizionali, percorsi: (nomi) => nomi.flatMap((n) => nominati.get(n) ?? []) }
}

/* ── la lettura ─────────────────────────────────────────────────────────────────────────────────────────────────────────── */

/** Dove scrive un comando della shell, a parole. Mai un'eccezione: un errore è un bersaglio illeggibile, se il testo può scrivere. */
export function scrittureDelComando(comando, { cartella, home = homedir(), piattaforma = process.platform, ambiente = process.env } = {}) {
  const esito = { bersagli: [], illeggibili: [], globali: [] }
  const testo = String(comando ?? '')
  if (testo.trim() === '' || typeof cartella !== 'string' || cartella === '') return esito
  try {
    const ctx = contesto({ cartella, home: typeof home === 'string' ? home : '', piattaforma, ambiente, progettiCritici: [] })
    ctx.conto = { letture: 0, lavoro: 0, espansi: 0, glob: 0 }
    ctx.perDisco = new Map()
    ctx.legate = legateNelTesto(testo)
    ctx.bash = !ctx.windows
    ctx.cdCambiaDisco = true
    ctx.comandiLetti = 0
    ctx.visti = new Set()
    ctx.versione = 0 // cresce a ogni comando che può dare un valore a una variabile: un bersaglio uguale dopo può valere un altro posto
    ctx.temporanea = temporaneaDi(ambiente, ctx)
    ctx.testo = testo
    leggiTesto(testo, ctx, cartella, 0, esito)
    const aperti = testiConLeGraffeAperte(testo)
    if (aperti === null) { if (SEMBRA_SCRIVERE.test(testo)) esito.illeggibili.push({ scritto: testo.slice(0, 120), come: 'troppo-complesso' }) }
    else for (const t of aperti) {
      Object.assign(ctx, { locali: undefined, forIgnoti: undefined, collegamenti: undefined, perDisco: new Map(), versione: ctx.versione + 1 })
      leggiTesto(t, ctx, cartella, 0, esito)
    }
  } catch {
    if (SEMBRA_SCRIVERE.test(testo)) esito.illeggibili.push({ scritto: testo.slice(0, 120), come: 'troppo-complesso' })
  }
  return esito
}

function temporaneaDi(ambiente, ctx) {
  const da = (n) => { const v = Object.entries(ambiente ?? {}).find(([k]) => (ctx.windows ? k.toUpperCase() : k) === n)?.[1]; return typeof v === 'string' && v !== '' ? v : null }
  return da('TMPDIR') ?? da('TEMP') ?? da('TMP') ?? (ctx.windows ? tmpdir() : '/tmp')
}

/*
 * 0.2.4, giro dopo i revisori (giudice v2311): il testo si legge ANCHE con gli apici del guscio che lo esegue, come le cancellazioni
 * (`cancellazioni-critiche.mjs`, `conGliApiciDelGuscio`): `x=$'\''; echo hi > ~/.bashrc` (bash), `echo it's & echo hi > Q:\fuori\x.txt`
 * (cmd) davano 0 bersagli. La lettura di sempre resta e viene prima; un'altra si fa solo se le parole cambiano: mai un bersaglio in meno.
 */
const PROVA_DEL_GUSCIO = { posix: /\$['"]/u, cmd: /['^]/u, powershell: /''|`/u }
function leggiTesto(testo, ctx, dove, profondita, esito) {
  leggiTestoCon(testo, ctx, dove, profondita, esito, null)
  if (profondita > TETTO_ANNIDAMENTO) return
  const daLeggere = senzaDuplicazioni(separaHeredoc(testo).testo)
  const gusci = (!ctx.windows ? ['posix'] : ctx.dentroPowerShell ? ['powershell'] : ['cmd', 'posix']).filter((g) => PROVA_DEL_GUSCIO[g].test(daLeggere))
  const firma = (apici) => JSON.stringify(comandiSemplici(daLeggere, apici).map((c) => ({ ...c })))
  const diSempre = gusci.length ? firma(!ctx.windows) : ''
  for (const g of gusci) if (firma(g) !== diSempre) leggiTestoCon(testo, ctx, dove, profondita, esito, g)
}
function leggiTestoCon(testo, ctx, dove, profondita, esito, apici) {
  if (profondita > TETTO_ANNIDAMENTO) { if (SEMBRA_SCRIVERE.test(testo)) esito.illeggibili.push({ scritto: testo.slice(0, 120), come: 'troppo-annidato' }); return }
  const { testo: senzaCorpi, corpi } = separaHeredoc(testo)
  if (apici === null) for (const corpo of corpi) leggiTesto(corpo, ctx, dove, profondita + 1, esito)
  let cartella = dove
  const pila = []
  const daParte = []
  let daRiprendere = 0
  let precedente = null
  const comandi = comandiSemplici(senzaDuplicazioni(senzaCorpi), apici ?? !ctx.windows)
  const conIlSistema = ctx.windows && comandi.some((c) => DEL_SISTEMA_WINDOWS.has(nomeDelComando(c[0]?.testo ?? '')))
  for (const comando of comandi) {
    ctx.comeIlSistema = false
    if ((ctx.comandiLetti += 1) > TETTO_COMANDI) { esito.illeggibili.push({ scritto: testo.slice(0, 120), come: 'troppo-complesso' }); return }
    /* la regola di bash: la cartella messa da parte prima di una sottoshell o di una lista in sottofondo torna dopo di lei */
    for (; daRiprendere > 0 && daParte.length; daRiprendere -= 1) cartella = daParte.pop()
    for (let k = 0; k < (comando.salvaPrima ?? 0); k += 1) daParte.push(cartella)
    daRiprendere = comando.ripristinaDopo ?? 0
    for (const w of comando) for (const dentro of sostituzioniDi(w.testo)) leggiTesto(dentro, ctx, cartella, profondita + 1, esito)
    for (const w of comando) if (w.gruppo !== undefined) leggiTesto(w.gruppo, ctx, cartella, profondita + 1, esito)
    if (comando.some((w) => w.testo.includes('=')) || /^(?:for|do|read|set|export)$/iu.test(comando[0]?.testo ?? '')) ctx.versione += 1
    ricordaAssegnazioni(comando, ctx, cartella)
    ricordaMktemp(comando, ctx)
    ctx.diPowerShell = (ctx.dentroPowerShell ?? 0) > 0 || DI_POWERSHELL.has(nomeDelComando(comando[0]?.testo ?? '')) || VERBO_NOME_PS.test(nomeDelComando(comando[0]?.testo ?? ''))
    const { parole: senzaRedirezioni, bersagli: redirezioni } = staccaRedirezioni(comando)
    for (const r of redirezioni) aggiungi(r, { come: 'redirezione' }, ctx, cartella, esito)
    const tolti = senzaInvolucri(senzaRedirezioni, ctx, cartella)
    if (tolti.testo !== undefined) { leggiTesto(tolti.testo, ctx, tolti.cartella, profondita + 1, esito); precedente = null; continue }
    const parole = tolti.parole
    const qui = tolti.cartella
    const sopra = precedente
    precedente = parole
    if (parole.length === 0) continue
    const nome = nomeDelComando(parole[0].testo)
    const argomenti = parole.slice(1).map((w) => w.testo)
    if (COMANDI_CHE_SPOSTANO.has(nome) || nome === 'popd' || nome === 'pop-location') {
      if (ctx.bash && (comando.primaDiPipe || comando.dopoPipe)) continue // in bash un `cd` in una pipe gira in una sottoshell
      if (nome === 'popd' || nome === 'pop-location') { cartella = pila.length ? pila.pop() : null; continue }
      if (nome === 'pushd' || nome === 'push-location') pila.push(cartella)
      ctx.comeIlSistema = conIlSistema
      cartella = cartellaDopo(argomentoDelCd(parole, ctx), ctx, cartella)
      ctx.comeIlSistema = false
      continue
    }
    if (/^(?:source|\.)$/u.test(parole[0].testo) || /[\\/]activate(?:\.bat|\.ps1|\.fish|\.csh)?$/iu.test(parole[0].testo)) {
      ricordaAmbientePython(parole, ctx, qui)
      continue
    }
    ctx.comeIlSistema = ctx.windows && (DEL_SISTEMA_WINDOWS.has(nome) || argomenti.some((a) => STILE_PS.test(a)))
    leggiComando(nome, parole, argomenti, { ctx, qui, profondita, esito, comando, sopra })
    ctx.comeIlSistema = false
  }
}

/** `D=$(mktemp -d)`: la variabile vale una cartella nuova nella temporanea (senza `-p`/`--tmpdir`/un modello con la barra). */
function ricordaMktemp(comando, ctx) {
  for (const w of comando) {
    const m = /^([A-Za-z_][\w]*)=(.*)$/su.exec(w.testo)
    const t = m ? MKTEMP.exec(m[2]) : null
    if (t && !/(?:^|\s)(?:-p|--tmpdir)|[\\/]/u.test(t[1])) (ctx.locali ??= new Map()).set(ctx.windows ? m[1].toUpperCase() : m[1], [ctx.p.join(ctx.temporanea, 'mktemp.nuova')])
  }
}

/** `source .venv/bin/activate`, `.venv\Scripts\activate`, `& venv\Scripts\Activate.ps1`: l'ambiente Python dei comandi dopo. */
function ricordaAmbientePython(parole, ctx, qui) {
  const script = parole.map((w) => w.testo).find((t) => /[\\/]activate(?:\.bat|\.ps1|\.fish|\.csh)?$/iu.test(t))
  if (!script) return
  const assoluto = bersaglioAssoluto(script, ctx, qui)
  ctx.ambientePython = assoluto ? ctx.p.dirname(ctx.p.dirname(assoluto)) : null
}

/**
 * Un bersaglio scritto: i dispositivi e la temporanea per nome non contano; il resto diventa un percorso assoluto, o illeggibile. Un glob
 * si giudica sulla cartella prima del primo pezzo con jolly, e sulla madre se il pezzo può prendere `..` (`.*`, `.?`, `[.]…`).
 */
function aggiungi(scritto, { cartella = false, come }, ctx, qui, esito) {
  if (scritto === null || scritto === undefined || scritto === '') { esito.illeggibili.push({ scritto: '?', come }); return }
  const s = String(scritto)
  /* lo stesso bersaglio scritto più volte dallo stesso posto si legge una volta (`rm -rf ../$a ../$a …`: mille parole, un posto) */
  const chiave = `${qui}\u0000${s}\u0000${cartella}\u0000${ctx.comeIlSistema === true}\u0000${ctx.versione}\u0000${ctx.diPowerShell === true}`
  if (ctx.visti.has(chiave)) return
  ctx.visti.add(chiave)
  if (DISPOSITIVO.test(s)) return
  if (ctx.collegamenti) viaICollegamenti(s, { cartella, come }, ctx, qui, esito)
  const perNome = TEMPORANEA_PER_NOME.exec(s)
  /* cura $TEMP di PowerShell (owner 09:33, giudice v2239): lì `$TEMP`, `${TEMP}`, `$TMP` sono variabili di PowerShell, non l'ambiente:
     non sono la temporanea e, se il testo non le assegna, non si sa dove portano. Vale solo `$env:TEMP`. */
  if (perNome?.[1] !== undefined && ctx.diPowerShell && ![...(ctx.locali?.keys() ?? [])].some((k) => k.toUpperCase() === perNome[1].toUpperCase())) {
    esito.illeggibili.push({ scritto: s, come })
    return
  }
  if (perNome && restoFermo(s.slice(perNome[0].length), ctx, perNome[3] === undefined)) {
    const nome = (perNome[1] ?? perNome[2] ?? perNome[3]).toUpperCase()
    const riassegnata = [...(ctx.locali?.keys() ?? [])].some((k) => k.toUpperCase() === nome) || ctx.legate?.has(nome)
    if (!riassegnata) return
  }
  const diPosix = TEMPORANEA_DI_POSIX.exec(s)
  if (diPosix && restoFermo(s.slice(diPosix[0].length), ctx)) return
  if (MKTEMP.test(s) && !/(?:^|\s)(?:-p|--tmpdir)|[\\/]/u.test(MKTEMP.exec(s)[1])) return
  let assoluto = bersaglioAssoluto(s, ctx, qui)
  if (assoluto === null) { esito.illeggibili.push({ scritto: s, come }); return }
  let suCartella = cartella || /[\\/]$/u.test(s)
  const pezzi = assoluto.split(/[\\/]/u)
  const k = pezzi.findIndex((p, i) => i > 0 && GLOB.test(p))
  if (k > 0) {
    let base = pezzi.slice(0, k).join(ctx.windows ? '\\' : '/') || (ctx.windows ? '\\' : '/')
    if (/^[.[?]/u.test(pezzi[k])) base = ctx.p.dirname(base)
    if (/^[A-Za-z]:$/u.test(base)) base += '\\'
    assoluto = base
    suCartella = true
  } else if (GLOB.test(ctx.p.basename(s)) && !GLOB.test(ctx.p.basename(assoluto))) {
    /* `bersaglioAssoluto` ha tolto la coda fatta di jolly e punti (`*`, `.*`): resta la cartella, o la madre se la coda prende `..` */
    suCartella = true
    if (/^[.[?]/u.test(s.split(/[\\/]/u).pop())) assoluto = ctx.p.dirname(assoluto)
  }
  esito.bersagli.push({ percorso: assoluto, scritto: s, cartella: suCartella, come })
}
const globale = (esito, comando, come) => { esito.globali.push({ comando, come }) }

function leggiComando(nome, parole, argomenti, { ctx, qui, profondita, esito, comando, sopra }) {
  const metti = (s, opzioni = {}) => aggiungi(s, { come: nome, ...opzioni }, ctx, qui, esito)
  const rileggi = (t, dentro = qui, powershell = 0) => {
    const prima = ctx.dentroPowerShell ?? 0
    ctx.dentroPowerShell = powershell // bash e cmd dentro PowerShell sono bash e cmd; PowerShell dentro tutto è PowerShell
    try { leggiTesto(t, ctx, dentro, profondita + 1, esito) } finally { ctx.dentroPowerShell = prima }
  }
  const ps = parametriPs(argomenti)
  const stilePs = argomenti.some((a) => STILE_PS.test(a))

  /* il testo che un'altra shell eseguirà */
  if (SHELL_POSIX.has(nome)) {
    const i = argomenti.findIndex((a) => /^-[A-Za-z]*c[A-Za-z]*$/u.test(a))
    if (i >= 0 && argomenti[i + 1] !== undefined) rileggi(argomenti[i + 1] === '--' ? argomenti[i + 2] ?? '' : argomenti[i + 1])
    return
  }
  if (nome === 'cmd') {
    const i = argomenti.findIndex((a) => /^\/[ckr]$/iu.test(a))
    if (i >= 0) rileggi(argomenti.slice(i + 1).join(' '))
    return
  }
  if (SHELL_POWERSHELL.has(nome)) {
    for (let i = 0; i < argomenti.length; i += 1) {
      const a = argomenti[i]
      if (OPZIONE_CODIFICATA_PS.test(a)) { const t = decodificaPowerShell(argomenti[i + 1]); if (t === null) esito.illeggibili.push({ scritto: a, come: nome }); else rileggi(t, qui, 1); return }
      if (OPZIONE_COMANDO_PS.test(a)) { rileggi(argomenti.slice(i + 1).join(' '), qui, 1); return }
      if (/^[-/]f(?:i(?:l(?:e)?)?)?$/iu.test(a)) return // `-File script.ps1`: lo script scrive da sé (limite dichiarato)
      if (OPZIONI_PS_CON_VALORE.test(a)) { i += 1; continue }
      if (/^[-/]/u.test(a)) continue
      rileggi(argomenti.slice(i).join(' '), qui, 1) // `powershell.exe` senza nome esegue il primo argomento come -Command
      return
    }
    return
  }
  if (nome === 'eval' || nome === 'iex' || nome === 'invoke-expression') { rileggi(argomenti.join(' '), qui, nome === 'eval' ? 0 : 1); return }

  /* POSIX e alias di PowerShell e di cmd */
  if (CANCELLA_TUTTI.has(nome) || (nome === 'ri' || nome === 'remove-item' || nome === 'del' || nome === 'erase' || nome === 'rd')) {
    const ricorsivo = nome === 'rmdir' || nome === 'rd' || haOpzione(argomenti, /^-(?:[a-zA-Z]*[rR][a-zA-Z]*|-recursive|recurse)$|^\/s$/iu)
    if (stilePs || nome === 'ri' || nome === 'remove-item') { for (const p of [...ps.percorsi(['path', 'literalpath', 'pspath', 'lp']), ...ps.posizionali]) metti(p, { cartella: ricorsivo }); return }
    if (DI_CMD.has(nome)) { for (const a of argomenti) if (!/^\/[A-Za-z]{1,3}(?::\S*)?$/u.test(a)) metti(a, { cartella: ricorsivo }); return }
    for (const a of operandiPosix(argomenti)) metti(a, { cartella: ricorsivo })
    return
  }
  if (nome === 'mkdir' || nome === 'md') {
    if (stilePs) { for (const p of [...ps.percorsi(['path', 'literalpath']), ...ps.posizionali]) metti(p, { cartella: true }); return }
    for (const a of nome === 'md' ? argomenti.filter((x) => !/^\/[A-Za-z]$/u.test(x)) : operandiPosix(argomenti, VALORI.mkdir)) metti(a, { cartella: true })
    return
  }
  if (nome === 'touch' || nome === 'truncate') { for (const a of operandiPosix(argomenti, VALORI[nome])) metti(a); return }
  if (nome === 'chmod' || nome === 'chown' || nome === 'chgrp' || nome === 'chattr') {
    const ricorsivo = haOpzione(argomenti, /^-[a-zA-Z]*R[a-zA-Z]*$|^--recursive$/u)
    const operandi = operandiPosix(argomenti.filter((a) => !/^[-+=][rwxXstugoa]+$/u.test(a)), VALORI[nome] ?? [])
    const conRiferimento = argomenti.some((a) => a.startsWith('--reference'))
    for (const a of conRiferimento ? operandi : operandi.slice(1)) metti(a, { cartella: ricorsivo })
    return
  }
  if (nome === 'mv' || nome === 'move' || nome === 'mi' || nome === 'move-item') {
    if (stilePs || nome === 'mi' || nome === 'move-item') { for (const p of [...ps.percorsi(['path', 'literalpath', 'destination']), ...ps.posizionali]) metti(p); return }
    if (nome === 'move') { for (const a of argomenti) if (!/^\/-?[A-Za-z]$/u.test(a)) metti(a); return }
    const t = valoreDi(argomenti, ['-t'], ['--target-directory'])
    if (t !== undefined) metti(t, { cartella: true })
    for (const a of operandiPosix(argomenti, ['-t', '--target-directory', ...VALORI.mv])) metti(a) // chi sposta via toglie: anche le sorgenti
    return
  }
  if (nome === 'cp' || nome === 'copy' || nome === 'cpi' || nome === 'copy-item' || nome === 'install' || nome === 'ln' || nome === 'xcopy' || nome === 'robocopy' || nome === 'mklink') {
    if (stilePs || nome === 'cpi' || nome === 'copy-item') { const d = ps.percorsi(['destination']); if (d.length) d.forEach((x) => metti(x)); else if (ps.posizionali[1] !== undefined) metti(ps.posizionali[1]); else metti('.', { cartella: true }); return }
    if (nome === 'copy' || nome === 'xcopy' || nome === 'robocopy') {
      const operandi = argomenti.filter((a) => !/^\/[A-Za-z]+(?::\S*)?$/u.test(a) && a !== '+')
      const dest = nome === 'copy' ? (operandi.length > 1 ? operandi.at(-1) : '.') : (operandi[1] ?? '.')
      metti(dest, { cartella: nome !== 'copy' })
      if (nome === 'robocopy' && haOpzione(argomenti, /^\/(?:move|mov|purge|mir)$/iu)) metti(operandi[0] ?? '.', { cartella: true })
      return
    }
    if (nome === 'mklink') {
      const operandi = argomenti.filter((a) => !/^\/[A-Za-z]$/u.test(a))
      metti(operandi[0])
      if (operandi[0] !== undefined) ricordaCollegamento(operandi[0], operandi[1], ctx, qui, [argomenti.some((a) => /^\/[jh]$/iu.test(a)) ? 'qui' : 'madre'])
      return
    }
    const t = valoreDi(argomenti, ['-t'], ['--target-directory'])
    const operandi = operandiPosix(argomenti, ['-t', '--target-directory', ...(VALORI[nome] ?? [])])
    if (nome === 'ln') { // il nome si mette PRIMA di ricordarlo: creare un collegamento che porta fuori non scrive fuori
      if (t === undefined && operandi.length === 0) return
      metti(t !== undefined ? t : operandi.length === 1 ? '.' : operandi.at(-1), { cartella: t !== undefined || operandi.length !== 2 || haOpzione(argomenti, /^-[a-zA-Z]*[rR][a-zA-Z]*$|^--recursive$/u) })
      const daDove = [haOpzione(argomenti, /^-[a-zA-Z]*s[a-zA-Z]*$|^--symbolic$/u) && !haOpzione(argomenti, /^-[a-zA-Z]*r[a-zA-Z]*$|^--relative$/u) ? 'madre' : 'qui']
      const nomeIn = (d, v) => ctx.p.join(d, ctx.p.basename(v.replace(/[\\/]+$/u, '')))
      if (t) operandi.forEach((v) => ricordaCollegamento(nomeIn(t, v), v, ctx, qui, daDove))
      else if (operandi.length === 1) ricordaCollegamento(nomeIn('.', operandi[0]), operandi[0], ctx, qui, daDove)
      else if (operandi.length === 2) ricordaCollegamento(operandi[1], operandi[0], ctx, qui, daDove)
      else operandi.slice(0, -1).forEach((v) => ricordaCollegamento(nomeIn(operandi.at(-1), v), v, ctx, qui, daDove))
      return
    }
    if (t !== undefined) { metti(t, { cartella: true }); return }
    if (nome === 'install' && haOpzione(argomenti, /^-[a-zA-Z]*d[a-zA-Z]*$|^--directory$/u)) { operandi.forEach((a) => metti(a, { cartella: true })); return }
    if (operandi.length === 0) return
    if (nome === 'ln' && operandi.length === 1) { metti('.', { cartella: true }); return }
    metti(operandi.at(-1), { cartella: operandi.length > 2 || haOpzione(argomenti, /^-[a-zA-Z]*[rR][a-zA-Z]*$|^--recursive$/u) })
    return
  }
  if (nome === 'rsync' || nome === 'scp') {
    const operandi = operandiPosix(argomenti, VALORI[nome])
    const remoto = (x) => /^[^\\/]{2,}:/u.test(x) || /^[^\\/:]+@/u.test(x) || /^rsync:\/\//u.test(x)
    if (operandi.length && !remoto(operandi.at(-1))) metti(operandi.at(-1), { cartella: true })
    if (nome === 'rsync' && argomenti.includes('--remove-source-files')) operandi.slice(0, -1).filter((x) => !remoto(x)).forEach((x) => metti(x))
    for (const a of argomenti) { const m = /^--(?:log-file|backup-dir|partial-dir|temp-dir)=(.+)$/su.exec(a); if (m) metti(m[1]) }
    return
  }
  if (nome === 'dd') { for (const a of argomenti) if (a.startsWith('of=')) metti(a.slice(3)); return }
  if (nome === 'tee') { for (const a of operandiPosix(argomenti)) metti(a); return }
  if (nome === 'tee-object') { for (const p of [...ps.percorsi(['filepath', 'literalpath', 'path']), ...ps.posizionali.slice(0, 1)]) metti(p); return }
  if (nome === 'sed' || nome === 'perl') {
    const inPosto = argomenti.some((a) => /^--in-place(?:=|$)/u.test(a) || (/^-[A-Za-z]*i/u.test(a) && !a.startsWith('--')))
    if (!inPosto) return
    const conScript = argomenti.some((a) => /^-[A-Za-z]*[ef]$|^--(?:expression|file)(?:=|$)/u.test(a) || (nome === 'perl' && /^-[A-Za-z]*e/u.test(a)))
    const operandi = operandiPosix(argomenti, nome === 'sed' ? ['-e', '--expression', '-f', '--file', ...VALORI.sed] : ['-e', '-E', '-M', '-m', '-I'])
    for (const a of conScript ? operandi : operandi.slice(1)) metti(a)
    return
  }
  if (nome === 'tar' || nome === 'bsdtar') {
    const primo = argomenti[0] ?? ''
    const gruppi = argomenti.filter((a) => /^-[A-Za-z]+$/u.test(a)).join('') + (/^[A-Za-z]+$/u.test(primo) ? primo : '')
    const estrae = /x/u.test(gruppi) || argomenti.some((a) => a === '--extract' || a === '--get')
    const crea = /[cru]/u.test(gruppi) || argomenti.some((a) => a === '--create' || a === '--append' || a === '--update')
    let archivio = valoreDi(argomenti, ['-f'], ['--file'])
    let dove = valoreDi(argomenti, ['-C'], ['--directory'])
    /* `-xzf a.tar`, `xvf a.tar`, `-cfC out.tar dir`: le lettere con valore prendono le parole dopo il gruppo, nell'ordine */
    const gruppo = argomenti.findIndex((a) => /^-?[A-Za-z]*[fC][A-Za-z]*$/u.test(a) && !a.startsWith('--') && (a.startsWith('-') || a === primo))
    if (gruppo >= 0) {
      const lettere = [...argomenti[gruppo].replace(/^-/u, '')].filter((c) => c === 'f' || c === 'C')
      lettere.forEach((c, j) => { const v = argomenti[gruppo + 1 + j]; if (c === 'f' && archivio === undefined) archivio = v; if (c === 'C' && dove === undefined) dove = v })
    }
    if (estrae) metti(dove ?? '.', { cartella: true })
    if (crea && archivio !== undefined && archivio !== '-') metti(archivio)
    return
  }
  if (nome === 'unzip') { const d = valoreDi(argomenti, ['-d'], []); metti(d ?? '.', { cartella: true }); return }
  if ((nome === '7z' || nome === '7za' || nome === '7zr') && /^[xe]$/u.test(argomenti[0] ?? '')) { const o = argomenti.find((a) => /^-o/u.test(a)); metti(o ? o.slice(2) : '.', { cartella: true }); return }
  if (nome === 'expand-archive' || nome === 'compress-archive') { const d = ps.percorsi(['destinationpath', 'destination']); if (d.length) d.forEach((x) => metti(x, { cartella: nome === 'expand-archive' })); else metti(ps.posizionali[1] ?? '.', { cartella: nome === 'expand-archive' }); return }
  if (['set-content', 'sc', 'add-content', 'ac', 'clear-content', 'clc', 'out-file', 'export-csv', 'epcsv', 'export-clixml', 'rename-item', 'ren', 'rni', 'rename'].includes(nome)) {
    if ((nome === 'ren' || nome === 'rename') && !stilePs) { const operandi = argomenti.filter((a) => !/^\/[A-Za-z]$/u.test(a)); if (operandi[0] !== undefined) metti(operandi[0]); return }
    const p = ps.percorsi(['path', 'literalpath', 'filepath', 'pspath', 'lp'])
    for (const x of p.length ? p : ps.posizionali.slice(0, 1)) metti(x)
    return
  }
  if (nome === 'new-item' || nome === 'ni') {
    const p = ps.percorsi(['path', 'literalpath'])
    const base = p.length ? p : ps.posizionali.slice(0, 1)
    const nomi = ps.nominati.get('name') ?? []
    if (!base.length && nomi.length) nomi.forEach((n) => metti(n))
    for (const b of base) { metti(b, { cartella: nomi.length > 0 }); for (const n of nomi) metti(ctx.p.join(b, n)) }
    if (/^(?:symboliclink|junction|hardlink)$/iu.test((ps.nominati.get('itemtype') ?? ps.nominati.get('type') ?? [''])[0])) {
      const i = argomenti.findIndex((a) => /^-target(?::|$)/iu.test(a))
      const verso = i >= 0 ? (/:/u.test(argomenti[i]) ? argomenti[i].slice(argomenti[i].indexOf(':') + 1) : argomenti[i + 1]) : (ps.nominati.get('value') ?? [])[0]
      for (const b of base) ricordaCollegamento(nomi.length ? ctx.p.join(b, nomi[0]) : b, verso ?? null, ctx, qui, ['qui', 'madre'])
    }
    return
  }
  if (nome === 'start-transcript') { const p = [...ps.percorsi(['path', 'literalpath', 'outputdirectory']), ...ps.posizionali.slice(0, 1)]; if (p.length) p.forEach((x) => metti(x)); else metti(ctx.p.join(ctx.home || '~', 'Documents'), { cartella: true }); return }
  if (['invoke-webrequest', 'iwr', 'invoke-restmethod', 'irm', 'start-bitstransfer'].includes(nome) || ((nome === 'curl' || nome === 'wget') && argomenti.some((a) => /^-outf/iu.test(a)))) {
    for (const x of ps.percorsi(['outfile', 'destination'])) metti(x)
    return
  }
  if (nome === 'curl') {
    const dirUscita = valoreDi(argomenti, [], ['--output-dir'])
    const base = dirUscita ?? '.'
    for (let i = 0; i < argomenti.length; i += 1) {
      const a = argomenti[i]
      if (a === '--') break
      const lunga = /^--(output|dump-header|cookie-jar|trace|trace-ascii|stderr|libcurl|etag-save|hsts|alt-svc)(?:=(.*))?$/su.exec(a)
      if (lunga) { const v = lunga[2] ?? argomenti[++i]; if (v !== undefined && v !== '-') metti(lunga[1] === 'output' && dirUscita !== undefined ? ctx.p.join(dirUscita, v) : v); continue }
      if (a === '--remote-name' || a === '--remote-name-all') { metti(base, { cartella: true }); continue }
      if (/^-[A-Za-z0-9#]+$/u.test(a) && !a.startsWith('--')) {
        const lettere = a.slice(1)
        for (let j = 0; j < lettere.length; j += 1) {
          const c = lettere[j]
          if (c === 'O' || c === 'J') { metti(base, { cartella: true }); continue }
          if (CURL_CORTE_CON_VALORE.has(c)) {
            const v = j < lettere.length - 1 ? lettere.slice(j + 1) : argomenti[++i]
            if ((c === 'o' || c === 'D' || c === 'c') && v !== undefined && v !== '-') metti(c === 'o' && dirUscita !== undefined ? ctx.p.join(dirUscita, v) : v)
            break
          }
        }
      } else if (/^--[a-z-]+$/u.test(a) && /^--(?:header|data|request|user|user-agent|referer|form|upload-file|proxy|max-time|config|cert|range|retry|connect-timeout|url|data-binary|data-raw|data-urlencode|cacert|key|resolve|limit-rate|max-filesize|write-out)$/u.test(a)) i += 1
    }
    return
  }
  if (nome === 'wget') {
    const o = valoreDi(argomenti, ['-O'], ['--output-document'])
    const p = valoreDi(argomenti, ['-P'], ['--directory-prefix'])
    const log = valoreDi(argomenti, ['-o', '-a'], ['--output-file', '--append-output'])
    if (o !== undefined && o !== '-') metti(p !== undefined && o !== null && !ctx.p.isAbsolute(o) ? ctx.p.join(p, o) : o)
    else if (o === undefined) metti(p ?? '.', { cartella: true })
    if (log !== undefined) metti(log)
    return
  }
  if (nome === 'find') {
    const percorsi = []
    for (const a of argomenti) { if (/^[-(!]/u.test(a)) break; percorsi.push(a) }
    const scrive = argomenti.some((a, i) => a === '-delete' || /^-f(?:print0?|printf|ls)$/u.test(a)
      || (/^-(?:exec|execdir|ok|okdir)$/u.test(a) && SEMBRA_SCRIVERE.test(argomenti[i + 1] ?? '') && !/^(?:grep|cat|ls|echo|head|tail|wc|stat|file)$/u.test(argomenti[i + 1] ?? '')))
    if (scrive) for (const p of percorsi.length ? percorsi : ['.']) metti(p, { cartella: true })
    argomenti.forEach((a, i) => { if (/^-f(?:print0?|printf|ls)$/u.test(a)) metti(argomenti[i + 1]) })
    return
  }
  if (nome === 'xargs') {
    let i = 0
    for (; i < argomenti.length; i += 1) { const a = argomenti[i]; if (!a.startsWith('-')) break; if (/^-(?:[IiLlnPsdEa]|-(?:replace|max-lines|max-args|max-procs|max-chars|delimiter|eof|arg-file))$/u.test(a)) i += 1 }
    const dentro = argomenti.slice(i)
    if (!dentro.length) return
    const interno = nomeDelComando(dentro[0])
    leggiComando(interno, dentro.map((testo) => ({ testo })), dentro.slice(1), { ctx, qui, profondita, esito, comando, sopra })
    if (!SEMBRA_SCRIVERE.test(interno) || /^(?:grep|cat|ls|echo|head|tail|wc|stat|file|git)$/u.test(interno)) return
    if ((interno === 'cp' || interno === 'ln' || interno === 'install') && dentro.some((a) => a === '-t' || a.startsWith('--target-directory'))) return
    /* `find D … | xargs rm`: i nomi vengono da sotto D */
    if (comando.dopoPipe && sopra && nomeDelComando(sopra[0]?.testo ?? '') === 'find') {
      const percorsi = []
      for (const w of sopra.slice(1)) { if (/^[-(!]/u.test(w.testo)) break; percorsi.push(w.testo) }
      for (const p of percorsi.length ? percorsi : ['.']) metti(p, { cartella: true })
      return
    }
    esito.illeggibili.push({ scritto: `xargs ${dentro.join(' ')}`.slice(0, 120), come: 'xargs' })
    return
  }
  if (nome === 'git') { leggiGit(argomenti, metti, ctx, qui, esito); return }
  if (['npm', 'pnpm', 'yarn', 'bun', 'npx'].includes(nome)) { leggiNpm(nome, argomenti, metti, esito); return }
  if (/^pip\d*(?:\.\d+)?$/u.test(nome) || ((/^python\d*(?:\.\d+)?$/u.test(nome) || nome === 'py') && argomenti.includes('-m') && /^pip\d*$/u.test(argomenti[argomenti.indexOf('-m') + 1] ?? ''))) {
    leggiPip(parole[0].testo, /^pip/u.test(nome) ? argomenti : argomenti.slice(argomenti.indexOf('-m') + 2), metti, ctx, qui, esito)
    return
  }
  if (nome === 'uv') {
    if (argomenti[0] === 'tool' && /^(?:install|uninstall|upgrade)$/u.test(argomenti[1] ?? '')) globale(esito, `uv tool ${argomenti[1]}`, 'uv')
    else if (argomenti[0] === 'pip' && /^(?:install|uninstall|sync)$/u.test(argomenti[1] ?? '') && argomenti.includes('--system')) globale(esito, 'uv pip --system', 'uv')
    return
  }
  if (nome === 'dotnet' && argomenti[0] === 'tool' && /^(?:install|uninstall|update)$/u.test(argomenti[1] ?? '')) {
    const percorso = valoreDi(argomenti, [], ['--tool-path'])
    if (percorso !== undefined) metti(percorso, { cartella: true })
    else if (argomenti.some((a) => a === '-g' || a === '--global')) globale(esito, `dotnet tool ${argomenti[1]} -g`, 'dotnet')
    return
  }
  if (nome === 'make' && argomenti.includes('install')) {
    const dentroDi = argomenti.map((a) => /^(?:DESTDIR|PREFIX|prefix)=(.+)$/su.exec(a)?.[1]).filter(Boolean)
    if (dentroDi.length) dentroDi.forEach((d) => metti(d, { cartella: true }))
    else globale(esito, 'make install', 'make')
    return
  }
  if (DEL_SISTEMA.has(nome)) {
    const sotto = argomenti.find((a) => !a.startsWith('-'))
    const azioni = DEL_SISTEMA.get(nome)
    if (azioni.includes(sotto)) {
      if (nome === 'cargo') { const r = valoreDi(argomenti, [], ['--root']); if (r !== undefined) { metti(r, { cartella: true }); return } }
      if (nome === 'gem') { const r = valoreDi(argomenti, ['-i'], ['--install-dir']); if (r !== undefined) { metti(r, { cartella: true }); return } }
      globale(esito, `${nome} ${sotto ?? ''}`.trim(), nome)
    }
  }
  if (nome === 'pacman' && argomenti.some((a) => /^-[A-Za-z]*[SRU]/u.test(a))) globale(esito, 'pacman', 'pacman')
}

/** git: `-C D`, `--git-dir`, `--work-tree` con un sotto-comando che scrive; `clone`, `init`, `worktree add`, `config --global`. */
function leggiGit(argomenti, metti, ctx, qui, esito) {
  let i = 0
  const cartelle = []
  for (; i < argomenti.length; i += 1) {
    const a = argomenti[i]
    if (a === '-C') { cartelle.push(argomenti[++i]); continue }
    if (a === '-c' || a === '--namespace' || a === '--exec-path' || a === '--config-env') { i += 1; continue }
    const dir = /^--(?:git-dir|work-tree)(?:=(.*))?$/su.exec(a)
    if (dir) { cartelle.push(dir[1] ?? argomenti[++i]); continue }
    if (a.startsWith('-')) continue
    break
  }
  /* `git -C a -C b`: ogni -C relativo si legge dal precedente */
  let base = qui
  const assolute = []
  for (const c of cartelle) {
    if (c === undefined || c === null) { assolute.push(null); continue }
    const nuova = base === null ? null : cartellaDopo(c, ctx, base)
    assolute.push(nuova)
    base = nuova
  }
  const sotto = argomenti[i]
  const resto = argomenti.slice(i + 1)
  if (sotto === undefined) return
  const dove = cartelle.length ? base : qui
  const mettiDa = (s, opzioni) => { if (dove === null) { esito.illeggibili.push({ scritto: `git -C ${cartelle.join(' ')}`, come: 'git' }); return } aggiungi(s, { come: 'git', ...opzioni }, ctx, dove, esito) }
  if (sotto === 'config') {
    const legge = resto.some((a) => /^--(?:get|get-all|get-regexp|get-urlmatch|list|show-origin|show-scope|name-only)$|^-l$/u.test(a)) || resto.filter((a) => !a.startsWith('-')).length < 2 && !resto.some((a) => /^--(?:unset|unset-all|remove-section|rename-section|add|replace-all|edit)$|^-e$/u.test(a))
    if (legge) return
    const file = valoreDi(resto, ['-f'], ['--file'])
    if (file !== undefined) { mettiDa(file); return }
    if (resto.includes('--global')) { metti(ctx.p.join(ctx.home || '~', '.gitconfig')); return }
    if (resto.includes('--system')) { globale(esito, 'git config --system', 'git'); return }
    if (cartelle.length) mettiDa('.', { cartella: true })
    return
  }
  if (sotto === 'clone') {
    const operandi = operandiPosix(resto, ['-o', '--origin', '-b', '--branch', '-u', '--upload-pack', '--reference', '--reference-if-able', '--separate-git-dir', '--depth', '--shallow-since', '--shallow-exclude', '-j', '--jobs', '-c', '--config', '--filter', '--template', '--server-option', '--bundle-uri'])
    const destinazione = operandi[1] ?? (operandi[0] ? operandi[0].replace(/[\\/]+$/u, '').split(/[\\/:]/u).pop().replace(/\.git$/u, '') : null)
    if (destinazione) mettiDa(destinazione, { cartella: true })
    const separata = valoreDi(resto, [], ['--separate-git-dir'])
    if (separata !== undefined) mettiDa(separata, { cartella: true })
    return
  }
  if (sotto === 'init') { const operandi = operandiPosix(resto, ['-b', '--initial-branch', '--template', '--separate-git-dir', '--object-format', '--shared']); mettiDa(operandi[0] ?? '.', { cartella: true }); return }
  if (sotto === 'worktree' && resto[0] === 'add') { const operandi = operandiPosix(resto.slice(1), ['-b', '-B', '--reason']); if (operandi[0]) mettiDa(operandi[0], { cartella: true }) }
  if (sotto === 'archive' || sotto === 'format-patch' || sotto === 'bundle' || sotto === 'diff') {
    const o = valoreDi(resto, ['-o'], ['--output', '--output-directory'])
    if (o !== undefined) mettiDa(o, { cartella: sotto === 'format-patch' })
    if (sotto === 'bundle' && resto[0] === 'create' && resto[1]) mettiDa(resto[1])
    if (sotto !== 'worktree') return
  }
  if (GIT_CHE_LEGGE.has(sotto)) return
  if ((sotto === 'branch' || sotto === 'tag' || sotto === 'remote' || sotto === 'stash' && resto[0] === 'list') && resto.every((a) => /^-(?:a|r|l|v|vv|-list|-all|-remotes|-verbose)$/u.test(a))) return
  if (cartelle.length) mettiDa('.', { cartella: true })
}

/** npm, pnpm, yarn, bun: le installazioni globali scrivono fuori; `--prefix D`, `-C D`, `--cwd D` portano il lavoro in D. */
function leggiNpm(nome, argomenti, metti, esito) {
  const altrove = valoreDi(argomenti, nome === 'pnpm' ? ['-C'] : [], ['--prefix', '--cwd', '--dir'])
  const sotto = argomenti.find((a) => !a.startsWith('-') && a !== altrove)
  const globaleScritto = argomenti.some((a) => a === '-g' || a === '--global' || a === '--location=global' || a === '--global=true')
  if (nome === 'yarn' && sotto === 'global' && /^(?:add|remove|upgrade)$/u.test(argomenti[argomenti.indexOf('global') + 1] ?? '')) { globale(esito, 'yarn global', nome); return }
  if (nome === 'npm' && sotto === 'config' && /^(?:set|delete|edit|fix)$/u.test(argomenti[argomenti.indexOf('config') + 1] ?? '')) {
    if (!argomenti.some((a) => a === '--location=project' || a === '-L=project')) metti('~/.npmrc')
    return
  }
  if (!INSTALLA.has(sotto ?? '')) return
  if (altrove !== undefined) { metti(altrove, { cartella: true }); return }
  if (globaleScritto || (nome === 'npm' && (sotto === 'link' || sotto === 'ln') && argomenti.filter((a) => !a.startsWith('-')).length === 1)) globale(esito, `${nome} ${sotto} -g`, nome)
}

/**
 * pip: dentro un ambiente del progetto (l'eseguibile scritto con il suo percorso, un `activate` nello stesso testo, `VIRTUAL_ENV` del
 * servente) scrive lì; `-t/--target`, `--prefix`, `--root` dove dicono; `--user` e un pip del sistema scrivono fuori (forma §3: nessuna
 * fonte lo esenta, quindi chiede).
 */
function leggiPip(eseguibile, argomenti, metti, ctx, qui, esito) {
  const sotto = argomenti.find((a) => !a.startsWith('-'))
  if (sotto === 'download' || sotto === 'wheel') { const d = valoreDi(argomenti, sotto === 'download' ? ['-d'] : ['-w'], sotto === 'download' ? ['--dest'] : ['--wheel-dir']); metti(d ?? '.', { cartella: true }); return }
  if (sotto !== 'install' && sotto !== 'uninstall') return
  if (argomenti.includes('--dry-run')) return
  const dove = valoreDi(argomenti, ['-t'], ['--target', '--prefix', '--root'])
  if (dove !== undefined) { metti(dove, { cartella: true }); return }
  if (argomenti.includes('--user')) { globale(esito, 'pip install --user', 'pip'); return }
  if (/[\\/]/u.test(eseguibile)) { const e = bersaglioAssoluto(eseguibile, ctx, qui); if (e) { metti(ctx.p.dirname(ctx.p.dirname(e)), { cartella: true }); return } }
  if (typeof ctx.ambientePython === 'string') { metti(ctx.ambientePython, { cartella: true }); return }
  const daServente = Object.entries(ctx.ambiente ?? {}).find(([k]) => k === 'VIRTUAL_ENV')?.[1]
  if (typeof daServente === 'string' && daServente !== '') { metti(daServente, { cartella: true }); return }
  globale(esito, `pip ${sotto}`, 'pip')
}
