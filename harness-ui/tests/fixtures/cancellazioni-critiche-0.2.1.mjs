/*
 * ⛔⛔ 04/11/2026 — DECISIONE 155 DELL'OWNER: IN ACCESSO PIENO NIENTE OSTACOLA IL FLUSSO, TRANNE LE CANCELLAZIONI CHE NON SI RECUPERANO.
 *   Owner 16:47: «se in accesso pieno NIENTE DEVE OSTACOLARE IL FLUSSO, guarda come fa Claude Code». Owner 16:51: in Accesso pieno nessuna
 *   carta, tranne la cancellazione della radice, della cartella utente o della cartella del progetto, e le regole «chiedi» della persona.
 *
 * Questo modulo dice SE un comando della shell cancella uno di quei posti. Il kernel (`verificaPermessoScrittura`) ne fa una carta, solo
 * in Accesso pieno (anche quello dell'ospite, forma A); nelle altre modalità ogni comando della shell passa già dalla sua carta. Il
 * pavimento (`pavimento-comandi.mjs`) resta prima, e resta un RIFIUTO per «/», le cartelle di sistema e la casa scritta come `~`/`$HOME`:
 * qui arriva solo ciò che il pavimento lascia.
 *
 * Fonti (04/11/2026):
 *   - code.claude.com/docs/en/permission-modes, «bypassPermissions» e «Critical paths» (riletta 04/11 sera): la radice, ogni figlia diretta
 *     della radice, la casa («On Windows, its 8.3 short name counts too»), la radice di ogni disco di Windows e le sue figlie
 *     («`\\?\C:\` and `\\localhost\C$` count as `C:\`»), la cartella di lavoro e le sue madri; una cartella di lavoro aggiunta solo
 *     con un glob sotto di lei.
 *   - Claude Code, `CHANGELOG.md` (clone 01/11): `:6395` (bypass: «catastrophic removal commands still prompt as a safety net»), `:2384`
 *     (`rm -rf "$(pwd)"`), `:1684` (rm dentro `bash -c`), `:1319` (nome corto 8.3 della casa), `:2978`/`:3244` (`eval`, `env -C`).
 *   - Codex, `codex-rs/shell-command/src/command_safety/is_dangerous_command.rs:35-58` (oltre il tetto degli involucri il comando è
 *     pericoloso: si FALLISCE CHIUSO) e `:38-50` (rm con -f/-rf); `windows_dangerous_commands.rs:22-40` (Remove-Item, rd, del) e
 *     `:158-185` (il testo dopo `cmd /c` si rilegge).
 *   - Hermes, `tools/approval_detection.py:88-116` (il rm della radice, del sistema e della casa è un pavimento, anche in yolo) e
 *     `:229-257` (`cmd /c del`, `powershell Remove-Item`, `del /s`); `agent/file_safety.py:251-262` (protegge cartelle precise).
 *   - Microsoft Learn, «about_pwsh» / «powershell.exe» (letti 04/11): `-EncodedCommand` (`-e`, `-ec`) prende Base64 di UTF-16LE; ogni
 *     parametro si può abbreviare finché è univoco (`-Com`); `powershell.exe` senza nome esegue il primo argomento come `-Command`.
 *   - Telefono (decisione 179, radici del Mobile prese dal codice Android della lane, 04/11 18:28): HOME del Codice = `<filesDir>/codice-r4`
 *     (`TalosR4Avvio.kt:92,125`), chiavi e conversazioni in `<HOME>/chiavi` e `<HOME>/state` (`:48-51`, `:86-87`), progetti in
 *     `TALOS_HARNESS_UI_PROJECT_DIRS` (`:88`, `:149`); la memoria condivisa e i suoi altri nomi (`gettone.mjs:135`, `/mnt/user/N/emulated/N`).
 *
 * ⛔ Condizione di Performance sulla forma: nessuna lettura del disco in più per comando. Il bersaglio si giudica A PAROLE (mai
 *   `realpath`, mai `exists`); solo il percorso vero della cartella del progetto, della casa e delle cartelle dei progetti si calcola,
 *   UNA volta per terna, e si ricorda (`memoriaDeiVeri`). Prova: `tests/accesso-pieno-155.test.mjs`, «nessuna lettura del disco per comando».
 * ⛔ Oltre il tetto di annidamento (`TETTO_ANNIDAMENTO`) la funzione FALLISCE CHIUSA, come Codex: un testo che sembra cancellare e che
 *   non si riesce a guardare fino in fondo è una carta (`troppo-annidato`), mai un sì muto.
 * ⛔ Non è un isolamento: un bersaglio scritto con una variabile che il server non conosce, `xargs rm`, `[IO.Directory]::Delete` o un
 *   programma che cancella da sé non si vedono. È la rete di sicurezza di Claude Code, non un confine.
 */
import { realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

const COMANDI_CHE_CANCELLANO = new Set(['rm', 'rmdir', 'rd', 'del', 'erase', 'remove-item', 'ri'])
const INTERRUTTORI_DI_CMD = new Set(['rd', 'del', 'erase'])
const SHELL_POSIX = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'ash', 'fish'])
const SHELL_POWERSHELL = new Set(['powershell', 'pwsh'])
/** I comandi che elencano: davanti a una pipe danno i bersagli a un Remove-Item senza percorso (`gci X | Remove-Item`). */
const COMANDI_CHE_ELENCANO = new Set(['get-childitem', 'gci', 'ls', 'dir', 'get-item', 'gi'])
/** I comandi che cambiano la cartella per i comandi dopo (`cd C:\Users && rm -rf nino`). */
const COMANDI_CHE_SPOSTANO = new Set(['cd', 'chdir', 'set-location', 'sl', 'pushd', 'push-location'])
/** Le opzioni di Remove-Item (e di chi elenca) che prendono un valore che NON è un bersaglio */
const OPZIONI_CON_VALORE = new Set(['-exclude', '-include', '-filter', '-credential', '-stream', '-erroraction', '-ea', '-warningaction', '-wa', '-informationaction', '-errorvariable', '-ev', '-outvariable', '-ov', '-depth'])
/** `-Path:x`, `-LiteralPath:x`, `-lp:x`, `-PSPath:x`: il valore attaccato è il bersaglio (ogni abbreviazione univoca di PowerShell) */
const OPZIONE_PERCORSO = /^-(?:p(?:a(?:t(?:h)?)?)?|l(?:i(?:t(?:e(?:r(?:a(?:l(?:p(?:a(?:t(?:h)?)?)?)?)?)?)?)?)?)?|lp|pspath)$/iu
/** `-Command` di PowerShell e le sue abbreviazioni (`-c`, `-Com`…) */
const OPZIONE_COMANDO_PS = /^[-/]c(?:o(?:m(?:m(?:a(?:n(?:d)?)?)?)?)?)?$/iu
/** `-EncodedCommand` di PowerShell e le sue abbreviazioni (`-e`, `-ec`, `-enc`…) */
const OPZIONE_CODIFICATA_PS = /^[-/](?:e|ec|en(?:c(?:o(?:d(?:e(?:d(?:c(?:o(?:m(?:m(?:a(?:n(?:d)?)?)?)?)?)?)?)?)?)?)?)?)$/iu
/** Le opzioni di powershell/pwsh che prendono un valore (non sono il comando) */
const OPZIONI_PS_CON_VALORE = /^[-/](?:ex|ep|executionpolicy|version|v|psconsolefile|windowstyle|w|outputformat|o|of|inputformat|if|configurationname|config|workingdirectory|wd|settingsfile|custompipename)$/iu
/**
 * Gli involucri: si tolgono davanti al comando vero. `valore`: le opzioni che si mangiano la parola dopo (`sudo -u root`);
 * `cartella`: quelle che cambiano la cartella (`env -C`, `sudo -D`); `testo`: quelle il cui valore è un comando (`env -S`);
 * `posizionali`: quante parole senza trattino vanno saltate prima del comando (`timeout 5`).
 */
const INVOLUCRI = new Map([
  ['sudo', { valore: ['-u', '-g', '-h', '-p', '-C', '-D', '-R', '-r', '-t', '-T', '-U', '--user', '--group', '--host', '--prompt', '--close-from', '--chdir', '--chroot', '--role', '--type', '--command-timeout', '--other-user'], cartella: ['-D', '--chdir'] }],
  ['doas', { valore: ['-u', '-C'] }],
  ['env', { valore: ['-u', '--unset', '-C', '--chdir', '-S', '--split-string'], cartella: ['-C', '--chdir'], testo: ['-S', '--split-string'] }],
  ['nice', { valore: ['-n', '--adjustment'] }],
  ['ionice', { valore: ['-c', '--class', '-n', '--classdata', '-p', '--pid', '-P', '--pgid', '-u', '--uid'] }],
  ['timeout', { valore: ['-s', '--signal', '-k', '--kill-after'], posizionali: 1 }],
  ['time', { valore: ['-f', '--format', '-o', '--output'] }],
  ['stdbuf', { valore: ['-i', '-o', '-e', '--input', '--output', '--error'] }],
  ['exec', { valore: ['-a'] }],
  ['taskset', { posizionali: 1 }], ['chrt', { posizionali: 1 }],
  ['command', {}], ['builtin', {}], ['nohup', {}], ['busybox', {}], ['toybox', {}], ['call', {}], ['unbuffer', {}],
  /* P (forma permessi 2, punto 3): le parole chiave della shell davanti a un comando (`then rm …`, `do rm …`, `! rm …`) */
  ['then', {}], ['do', {}], ['else', {}], ['elif', {}], ['if', {}], ['while', {}], ['until', {}], ['!', {}], ['{', {}],
  /* P: altri involucri. `su -c`, `script -c`, `flock -c`: il testo si rilegge come se girasse qui (una carta in più, mai in meno) */
  ['setsid', {}], ['unshare', {}], ['fakeroot', {}],
  ['flock', { valore: ['-w', '--timeout', '-E', '--conflict-exit-code', '-c', '--command'], testo: ['-c', '--command'], posizionali: 1 }],
  ['watch', { valore: ['-n', '--interval'] }],
  ['strace', { valore: ['-o', '-e', '-p', '-s', '-u', '-E', '-a', '-b', '-I', '-O', '-P', '-S', '-X'] }],
  ['nsenter', { valore: ['-t', '--target', '-S', '--setuid', '-G', '--setgid', '-r', '-w'] }],
  ['chroot', { valore: ['--userspec', '--groups'], posizionali: 1 }],
  ['su', { valore: ['-c', '--command', '-s', '--shell', '-g', '--group', '-G', '--supp-group', '-w', '--whitelist-environment'], testo: ['-c', '--command'], posizionali: 1 }],
  ['script', { valore: ['-c', '--command', '-t', '--timing', '-O', '--log-out', '-I', '--log-in', '-B', '--log-io', '-E', '--echo', '-T', '--log-timing', '-m', '--logging-format'], testo: ['-c', '--command'] }],
].map(([nome, { valore = [], cartella = [], testo = [], posizionali = 0 }]) => [nome, { valore: new Set(valore), cartella: new Set(cartella), testo: new Set(testo), posizionali }]))
const SEMBRA_CANCELLARE = /(?:^|[^\p{L}\p{N}_.-])(?:rm|rmdir|rd|del|erase|remove-item|ri)(?:\.exe)?(?=$|[^\p{L}\p{N}_-])/iu
/** Il prefiltro guarda anche ciò che la shell ricompone (`r''m`, `\rm`), PowerShell codificato e `find -delete`. */
const SEMBRA_CANCELLARE_ANCHE = /\b(?:powershell|pwsh)\b|\bfind\b[^\n]*\s-delete\b|\brobocopy\b[^\n]*\/(?:mir|purge)\b|\brsync\b[^\n]*\s--del|\bgit\b[^\n]*\sclean\b|\bforfiles\b[^\n]*0x[0-9a-f]{2}|::Delete\s*\(|\.Delete\s*\(\s*\$true/iu
/** P: le cancellazioni che il parser non segue (il metodo di .NET, `.Delete($true)` di un oggetto): carta se il testo le contiene */
const CANCELLAZIONE_DI_DOTNET = /::Delete\s*\(|\.Delete\s*\(\s*\$true/iu
/** C: le opzioni che stringono ciò che elenca `Get-ChildItem` o cancella `Remove-Item` (abbreviazioni univoche; `-Exclude` NON stringe) */
const OPZIONE_FILTRO = /^-(?:filt(?:e(?:r)?)?|inc(?:l(?:u(?:d(?:e)?)?)?)?)(?::.*)?$/iu
/** P: i comandi di PowerShell che si calcolano a parole quando sono l'argomento fra parentesi di un comando che cancella */
const CALCOLABILI_PS = new Set(['join-path', 'get-location', 'gl', 'pwd', 'resolve-path', 'rvpa', 'convert-path', 'cvpa', 'get-item', 'gi'])
const sembraCancellare = (testo) => SEMBRA_CANCELLARE.test(testo) || SEMBRA_CANCELLARE.test(testo.replace(/['"\\]/gu, '')) || SEMBRA_CANCELLARE_ANCHE.test(testo)

/*
 * 208 bis (ALTO-1): il testo come lo legge cmd.exe prima di eseguirlo, misurato in un cmd vero (05/11/2026; `cmd /?`, `rd /?`; jeb e
 * dbenham, Stack Overflow 4094699): `^` si toglie, `@` in testa non conta, `,` `;` `=` separano come lo spazio, un interruttore o un
 * percorso si attacca al nome (`rd/s/q`, `cd..`, `cd\`, `cd/d..`), `if <condizione> <comando>`, `for [/d] %X in (…) do …`. Si giudica
 * in più del testo grezzo (una carta in più, mai una in meno). Hermes `approval_detection.py:257` vuole lo spazio dopo `rd`; Codex
 * `windows_dangerous_commands.rs:256` stacca solo `&` e `|`.
 */
const NOMI_DI_CMD = 'rd|rmdir|del|erase|cd|chdir|pushd'
const CONDIZIONE_DI_IF = /(^|[\s&|(])if\s+(?:\/i\s+)?(?:not\s+)?(?:(?:exist|defined|errorlevel|cmdextversion)\s+(?:"[^"]*"|[^\s"]+)|(?:"[^"]*"|[^\s"=]+)\s*==\s*(?:"[^"]*"|[^\s"]+)|(?:"[^"]*"|[^\s"]+)\s+(?:equ|neq|lss|leq|gtr|geq)\s+(?:"[^"]*"|[^\s"]+))\s+/iu
/* 208 ter (ALTO-2): ogni forma del `for` di cmd (`/d`, `/r [radice]`, `/l`, `/f ["opzioni"]`, anche insieme), Microsoft Learn `for` */
const FOR_DI_CMD = /(^|[\s&|(])for\s+((?:\/[A-Za-z](?:\s+(?:"[^"]*"|[^\s"/%][^\s"]*))?\s+)*)%%?([A-Za-z])\s+in\s*\(([^()]*)\)\s*do\s+(.*)$/isu
const TETTO_DEI_FOR = 4
/**
 * 208 ter (ALTO-2): i valori che prende la variabile del `for`, o `null` se si sanno solo mentre gira (`/f` con opzioni, su un comando o
 * su un file). `/r X`: ogni valore è `X\elemento` (le cartelle sotto X hanno lo stesso nome in coda: si giudica la radice); `/l (a,p,b)`:
 * i numeri, fino a 16; `/f` su una stringa senza opzioni: la prima parola (Microsoft Learn `for`, letta il 05/11/2026; misurato in un
 * cmd vero lo stesso giorno).
 */
function valoriDelFor(opzioni, insieme) {
  const via = (x) => x.replace(/^"(.*)"$/su, '$1')
  const scelte = [...opzioni.matchAll(/\/([A-Za-z])(?:\s+("[^"]*"|[^\s"/%][^\s"]*))?/gu)].map((m) => ({ o: m[1].toLowerCase(), v: m[2] }))
  const elementi = (insieme.match(/"[^"]*"|[^\s,;=]+/gu) ?? []).map(via)
  /* un insieme che cmd calcola mentre gira (`(%~dp0..)`, `(%X:a=b%)`): i valori non si sanno */
  if (scelte.some((x) => !'drlf'.includes(x.o)) || CMD_CALCOLATO.test(insieme) || scelte.some((x) => x.v !== undefined && CMD_CALCOLATO.test(x.v))) return null
  if (scelte.some((x) => x.o === 'f')) {
    const stringa = /^\s*"([^"]*)"\s*$/u.exec(insieme)
    if (scelte.length > 1 || scelte[0].v !== undefined || !stringa) return null
    const prima = stringa[1].trim().split(/[ \t]+/u)[0]
    return prima ? [prima] : []
  }
  if (scelte.some((x) => x.o === 'l')) {
    const n = insieme.split(/[\s,;=]+/u).filter(Boolean).map(Number)
    if (n.length === 0 || n.length > 3 || n.some((x) => !Number.isInteger(x))) return null
    const [a, passo = 0, b = 0] = n
    const numeri = []
    for (let x = a; numeri.length < 16 && (passo < 0 ? x >= b : x <= b); x += passo) { numeri.push(String(x)); if (passo === 0) break }
    return numeri
  }
  const r = scelte.find((x) => x.o === 'r')
  if (r) { const radice = via(r.v ?? '.'); return elementi.map((e) => `${radice}\\${e}`) }
  return elementi
}
function comeLoLeggeCmd(testo) {
  let t = testo.replace(/\^\r?\n/gu, '').replace(/\^(.)/gsu, (_, c) => c)
  t = t.replace(/(^|[\s&|()])@+/gu, (_, a) => a)
  t = t.replace(new RegExp(`(^|[\\s&|()])(${NOMI_DI_CMD})(?=[/\\\\.+"])`, 'giu'), (_, a, n) => `${a}${n} `)
  /* nei pezzi che cominciano con uno di quei nomi: `,` `;` `=` fuori da virgolette e da `%…%` sono spazi; `/s/q` e `/d..` si staccano */
  t = t.replace(new RegExp(`(^|[&|()\\n]\\s*|\\bdo\\s+|\\s)((?:${NOMI_DI_CMD})[\\s,;=][^&|()\\n]*)`, 'giu'), (_, prima, pezzo) => {
    let p = pezzo.replace(/"[^"]*"|%[^%\s]+%|[,;=]/gu, (x) => (x.length === 1 ? ' ' : x))
    for (let prec = ''; prec !== p;) { prec = p; p = p.replace(/(\s\/[A-Za-z?])(?=[/.\\"])/gu, (_, s) => `${s} `) }
    return prima + p
  })
  for (let prec = ''; prec !== t;) { prec = t; t = t.replace(CONDIZIONE_DI_IF, (_, a) => a) }
  /* `for /d %i in (a ..) do rd /s /q %i` diventa il `for` che il giudice sa già leggere: `for i in "a" ".."; do rd /s /q $i`. 208 ter: ogni
     forma, anche annidata; se i valori si sanno solo mentre gira resta il corpo con `%i` (CMD_CALCOLATO: carta se cancella ricorsivo) */
  for (let n = 0; n < TETTO_DEI_FOR; n += 1) {
    const f = FOR_DI_CMD.exec(t)
    if (!f) break
    const [, prima, opzioni, x, insieme, corpo] = f
    const valori = valoriDelFor(opzioni, insieme)
    t = valori === null ? `${t.slice(0, f.index)}${prima}${corpo}`
      : `${t.slice(0, f.index)}${prima}for ${x} in ${valori.map((v) => `"${v}"`).join(' ')}; do ${corpo.replace(new RegExp(`%%?${x}(?![A-Za-z0-9])`, 'gu'), () => `$${x}`)}`
  }
  return t
}
/** 208 bis: i pezzi di cmd che si calcolano mentre gira (`%~dp0`, `%%i`, `%X:~a,b%`, `!X!`): se restano dopo l'espansione, il posto non si sa */
/* 208 ter (ALTO-1): anche ogni `%NOME:…` (sostituzione `%X:a=b%`, `%X:*a=b%`, anche con spazi), le variabili nascoste `%=C:%` e le
   dinamiche che cmd calcola e l'ambiente non ha (`%__CD__%`, `%RANDOM%`…): misurate in un cmd vero il 05/11/2026 */
const CMD_CALCOLATO = /%~|%[^%\s:]*:|%=|%(?:__\w+__|random|date|time|errorlevel|cmdcmdline|cmdextversion|highestnumanodenumber)%|%%?[A-Za-z](?![\w%])|![A-Za-z_][\w]*!/iu
const TETTO_ANNIDAMENTO = 4
const TETTO_MEMORIA = 64
const GLOB = /[*?[]/u

/*
 * Le radici del telefono (forma 155 punto 13, decisione 179). Ogni altro nome della memoria condivisa si riporta a `/storage/emulated/N`,
 * e `/data/data/<pacchetto>` a `/data/user/0/<pacchetto>` (lo stesso posto): sul bersaglio E su casa, progetto e cartelle dei progetti.
 */
const SINONIMI_DEL_TELEFONO = [
  [/^\/(?:sdcard|mnt\/sdcard|storage\/self\/primary)(?=\/|$)/u, () => '/storage/emulated/0'],
  [/^\/mnt\/user\/\d+\/emulated\/(\d+)(?=\/|$)/u, (_, n) => `/storage/emulated/${n}`],
  [/^\/data\/media\/(\d+)(?=\/|$)/u, (_, n) => `/storage/emulated/${n}`],
  [/^\/data\/data(?=\/[^/])/u, () => '/data/user/0'],
]
/** Dopo i sinonimi: la radice di un profilo, i suoi genitori, le schede esterne (`/storage/ABCD-1234`), i dati di tutte le app */
const RADICE_DEL_TELEFONO = /^\/(?:storage\/emulated(?:\/\d+)?|storage\/[0-9A-F]{4}-[0-9A-F]{4}|mnt\/user(?:\/\d+(?:\/emulated)?)?|data\/(?:media|user)(?:\/\d+)?)$/u
/** Una memoria condivisa: le sue figlie dirette (DCIM, Download, Documents, Android…) contano come le cartelle di primo livello di un disco */
const MEMORIA_CONDIVISA = /^\/storage\/(?:emulated\/\d+|[0-9A-F]{4}-[0-9A-F]{4})$/u
/** La casa del Codice sul telefono sta nella cartella privata dell'app: lì `chiavi` e `state` sono i dati dell'app */
const CASA_NELLA_CARTELLA_DELL_APP = /^\/data\/user\/\d+\/[^/]+\//u
const DATI_DELL_APP = ['chiavi', 'state']

function comeSulTelefono(x) {
  if (typeof x !== 'string') return x
  for (const [re, verso] of SINONIMI_DEL_TELEFONO) if (re.test(x)) return x.replace(re, verso)
  return x
}

/* ── le parole, come le legge la shell, quanto basta ─────────────────────────────────────────────────────────────────────── */

/**
 * I comandi semplici del testo, ognuno come elenco di parole senza virgolette. Separano `\n`, `;`, `&&`, `||`, `|`, `&` fuori dalle
 * virgolette; un comando che riceve una pipe porta `dopoPipe`. La barra rovescia NON è un carattere di fuga (sono percorsi di Windows);
 * `$(..)` e gli apici inversi restano dentro la parola e la parola si segna come «fatta di sostituzioni» se non ha altro. `$'..'` è
 * un apice (ANSI-C di bash).
 */
function comandiSemplici(testo, posix = false) {
  const comandi = []
  let parole = []
  let parola = ''
  let haParola = false
  let apice = ''
  let daPipe = false
  const chiudiParola = () => {
    if (haParola) parole.push({ testo: parola, sostituzione: /^(?:\$\(.*\)|`.*`)$/su.test(parola) })
    parola = ''
    haParola = false
  }
  const chiudiComando = () => {
    chiudiParola()
    if (parole.length) { if (daPipe) parole.dopoPipe = true; comandi.push(parole) }
    parole = []
    daPipe = false
  }
  for (let i = 0; i < testo.length; i += 1) {
    const c = testo[i]
    /*
     * Su POSIX la barra rovescia è una fuga: fuori dagli apici prende il carattere dopo (`\rm`, `\.\.`), dentro le doppie virgolette
     * `\"` e `\\` (così `bash -c "… \"…\" …"` resta UNA parola). `\$` e `` \` `` restano scritti: il server non li espande.
     */
    if (posix && c === '\\' && i + 1 < testo.length && apice !== "'") {
      const dopo = testo[i + 1]
      if (!apice || dopo === '"' || dopo === '\\' || dopo === '$' || dopo === '`') {
        parola += dopo === '$' || dopo === '`' ? `\\${dopo}` : dopo === '\n' ? '' : dopo
        haParola = haParola || dopo !== '\n'
        i += 1
        continue
      }
    }
    if (apice) {
      if (c === apice) apice = ''
      else parola += c
      continue
    }
    if (c === '$' && testo[i + 1] === "'") continue
    if (c === "'" || c === '"') { apice = c; haParola = true; continue }
    /* `${NOME}`, `${env:NOME}`: una parola sola anche dove le graffe separano (PowerShell) */
    if (c === '$' && testo[i + 1] === '{') {
      const j = testo.indexOf('}', i + 2)
      if (j !== -1) { parola += testo.slice(i, j + 1); haParola = true; i = j; continue }
    }
    /*
     * P (forma permessi 2, punto 3): su Windows l'argomento fra parentesi di un comando (`Remove-Item (Join-Path A B)`, `if exist x (rd …)`)
     * è UNA parola, segnata `gruppo`: chi giudica la calcola o la rilegge. In testa al comando la parentesi resta un separatore.
     */
    if (!posix && c === '(' && !haParola && parole.length > 0) {
      let profondita = 0
      let j = i
      for (; j < testo.length; j += 1) {
        if (testo[j] === '(') profondita += 1
        else if (testo[j] === ')' && --profondita === 0) break
      }
      parole.push({ testo: testo.slice(i, j + 1), sostituzione: false, gruppo: testo.slice(i + 1, j) })
      i = j
      continue
    }
    if (c === '$' && testo[i + 1] === '(') {
      let profondita = 0
      let j = i + 1
      for (; j < testo.length; j += 1) {
        if (testo[j] === '(') profondita += 1
        else if (testo[j] === ')' && --profondita === 0) break
      }
      parola += testo.slice(i, j + 1)
      haParola = true
      i = j
      continue
    }
    if (c === '`') {
      const j = testo.indexOf('`', i + 1)
      const fine = j === -1 ? testo.length - 1 : j
      parola += testo.slice(i, fine + 1)
      haParola = true
      i = fine
      continue
    }
    if (c === '#' && !haParola) { const a = testo.indexOf('\n', i); i = a === -1 ? testo.length : a - 1; continue }
    if (c === '|') {
      const oppure = testo[i + 1] === '|'
      chiudiComando()
      if (oppure) i += 1
      else daPipe = true
      continue
    }
    if (c === '\n' || c === ';' || c === '&' || c === '(' || c === ')' || c === '{' && !haParola && /\s/u.test(testo[i + 1] ?? ' ')) { chiudiComando(); continue } // `{ cmd; }` è un gruppo, `{..,x}` una graffa
    if (!posix && (c === '{' || c === '}')) { chiudiComando(); continue } // P: in PowerShell e cmd le graffe separano sempre (`& {Remove-Item …}`)
    if (c === ' ' || c === '\t' || c === '\r') { chiudiParola(); continue }
    parola += c
    haParola = true
  }
  chiudiComando()
  return comandi
}

/**
 * C (forma permessi 2, punto 2): il corpo di un heredoc POSIX (`cat <<'EOF' > x.sh … EOF`) è testo, non comandi: si toglie. Si rilegge
 * solo se lo riceve una shell (`bash <<'EOF'`, `ssh h sh <<EOF`): `corpi` sono quei testi. Un heredoc senza la riga di chiusura arriva
 * fino in fondo (come in bash).
 */
function separaHeredoc(testo) {
  if (!/<</u.test(testo)) return { testo, corpi: [] }
  const righe = testo.split('\n')
  const fuori = []
  const corpi = []
  for (let i = 0; i < righe.length; i += 1) {
    const riga = righe[i]
    fuori.push(riga)
    const re = /(?<!<)<<(?!<)(-?)\s*(['"]?)([A-Za-z_][\w]*)\2/gu
    let m
    let prossima = i + 1 // due heredoc sulla stessa riga: i corpi vengono uno dopo l'altro
    while ((m = re.exec(riga)) !== null) {
      const [, togliTab, , fine] = m
      const prima = riga.slice(0, m.index)
      if ((prima.split('"').length - 1) % 2 === 1 || (prima.split("'").length - 1) % 2 === 1) continue // `<<` fra virgolette: non è un heredoc
      const corpo = []
      let j = prossima
      for (; j < righe.length; j += 1) {
        if ((togliTab ? righe[j].replace(/^\t+/u, '') : righe[j]) === fine) break
        corpo.push(righe[j])
      }
      if (j >= righe.length) break // senza la riga di chiusura non si toglie niente: le righe restano comandi (una carta in più, mai in meno)
      const davanti = prima.split(/[;&|]/u).pop()
      if (davanti.split(/\s+/u).some((w) => SHELL_POSIX.has(nomeDelComando(w)) || nomeDelComando(w) === 'ssh')) corpi.push(corpo.join('\n'))
      prossima = j + 1
    }
    i = prossima - 1
  }
  return { testo: fuori.join('\n'), corpi }
}

/** I testi delle sostituzioni `$(..)` e `` `..` `` di una parola: la shell li esegue, quindi si guardano come comandi a sé. */
function sostituzioniDi(parola) {
  const dentro = []
  for (let i = 0; i < parola.length; i += 1) {
    if (parola[i] === '$' && parola[i + 1] === '(') {
      let profondita = 0
      let j = i + 1
      for (; j < parola.length; j += 1) {
        if (parola[j] === '(') profondita += 1
        else if (parola[j] === ')' && --profondita === 0) break
      }
      dentro.push(parola.slice(i + 2, j))
      i = j
    } else if (parola[i] === '`') {
      const j = parola.indexOf('`', i + 1)
      if (j === -1) break
      dentro.push(parola.slice(i + 1, j))
      i = j
    }
  }
  return dentro
}

const nomeDelComando = (parola) => parola.split(/[\\/]/u).pop().toLowerCase().replace(/\.(?:exe|cmd|bat|com)$/u, '')

/* ── il bersaglio, a parole ─────────────────────────────────────────────────────────────────────────────────────────────── */

function contesto({ cartella, home, piattaforma, ambiente, progettiCritici = [] }) {
  const windows = piattaforma === 'win32'
  const p = windows ? path.win32 : path.posix
  return { cartella, home, piattaforma, ambiente, windows, p, progettiCritici }
}

/** `$NOME`, `${NOME}`, `$env:NOME`, `${env:NOME}`, `%NOME%`: il valore, o `null` se il server non lo sa (allora non si giudica). */
function valoreDi(nome, ctx, dove) {
  const n = ctx.windows ? nome.toUpperCase() : nome
  if (n === 'HOME' || n === 'USERPROFILE') return ctx.home
  if (n === 'PWD' || n === 'CD') return dove
  if (n === 'HOMEDRIVE' && ctx.windows) return ctx.p.parse(ctx.home).root.replace(/[\\/]$/u, '')
  /* 208 ter (ALTO-1): `%__CD__%` è la cartella con la barra in coda; `%=C:%` la cartella di quel disco (si sa solo se è il disco di adesso) */
  if (n === '__CD__' && ctx.windows) return dove === null ? null : dove.replace(/\\?$/u, '\\')
  if (/^=[A-Z]:$/u.test(n) && ctx.windows) return dove !== null && dove.slice(0, 2).toUpperCase() === n.slice(1) ? dove : null
  /* P: una variabile assegnata nello stesso testo (`D=..; rm -rf $D`, `$d = "…"`, `set D=…`); con più valori (`for`) se ne occupa chi giudica */
  const locale = ctx.locali?.get(n)
  if (locale) return locale.length === 1 ? locale[0] : null
  const trovato = Object.entries(ctx.ambiente ?? {}).find(([k]) => (ctx.windows ? k.toUpperCase() === n : k === n))
  return typeof trovato?.[1] === 'string' && trovato[1] !== '' ? trovato[1] : null
}

function espanso(parola, ctx, dove) {
  let ignoto = false
  let t = ctx.windows ? parola : parola.replace(/\\(.)/gsu, (_, c) => c) // su POSIX `\.\.` è `..`
  const sost = (re) => { t = t.replace(re, (tutto, nome) => { const v = valoreDi(nome, ctx, dove); if (v === null) { ignoto = true; return tutto } return v }) }
  if (/^\$\((?:\s*pwd\s*)\)|^`\s*pwd\s*`/iu.test(t)) { if (dove === null) return null; t = t.replace(/^\$\((?:\s*pwd\s*)\)|^`\s*pwd\s*`/iu, () => dove) }
  if (t === '~' || /^~[\\/]/u.test(t)) t = ctx.home + t.slice(1)
  else if (/^~[^\\/]+(?:[\\/]|$)/u.test(t)) {
    /* `~nino`: la casa di quell'utente; si sa solo se è la nostra */
    const [, utente, resto] = /^~([^\\/]+)(.*)$/su.exec(t)
    if (ctx.home && ctx.p.basename(ctx.home).toLowerCase() === utente.toLowerCase()) t = ctx.home + resto
    else return null
  }
  sost(/\$\{env:([A-Za-z_][\w]*)\}/giu)
  sost(/\$env:([A-Za-z_][\w]*)/giu)
  sost(/\$\{([A-Za-z_][\w]*)\}/gu)
  /* `${HOME%/}`, `${HOME#x}`, `${X:-y}`: la variabile col suo taglio; per un percorso il taglio di una barra in coda non cambia il posto, gli altri si leggono come la variabile intera (una carta in più, mai una in meno) */
  sost(/\$\{([A-Za-z_][\w]*)(?:%%?|##?|:[-=?+])[^}]*\}/gu)
  /* 208 bis (MEDIA-2): in PowerShell `$PWD.ProviderPath`, `$pwd.Path`, `$d.FullName` sono il percorso della variabile */
  if (ctx.windows) t = t.replace(/(\$[A-Za-z_][\w]*)\.(?:ProviderPath|Path|FullName)(?![\w.])/giu, (_, v) => v)
  sost(/\$([A-Za-z_][\w]*)/gu)
  if (ctx.windows) {
    /* 208 bis: `%CD:~0,3%` (un pezzo del valore, cmd `set /?`): inizio e lunghezza, negativi contano dalla fine */
    t = t.replace(/%([A-Za-z_][\w]*):~(-?\d+)(?:,(-?\d+))?%/gu, (tutto, nome, a, b) => {
      const v = valoreDi(nome, ctx, dove)
      if (v === null) { ignoto = true; return tutto }
      const inizio = Number(a) < 0 ? Math.max(0, v.length + Number(a)) : Math.min(Number(a), v.length)
      const fine = b === undefined ? v.length : Number(b) < 0 ? v.length + Number(b) : inizio + Number(b)
      return v.slice(inizio, Math.max(inizio, fine))
    })
    /* 208 ter (ALTO-1): `%CD:\progetto=%` (cmd `set /?`): ogni `da` diventa `a` senza badare alle maiuscole; `%X:*da=a%` fino al primo */
    t = t.replace(/%([A-Za-z_][\w]*):(\*?)([^%=]+)=([^%]*)%/gu, (tutto, nome, stella, da, a) => {
      const v = valoreDi(nome, ctx, dove)
      if (v === null) { ignoto = true; return tutto }
      const re = new RegExp(da.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), stella ? 'iu' : 'giu')
      if (!stella) return v.replace(re, () => a)
      const m = re.exec(v)
      return m ? a + v.slice(m.index + da.length) : v
    })
    sost(/%(=[A-Za-z]:)%/gu)
    sost(/%([A-Za-z_][\w()]*)%/gu)
    sost(/!([A-Za-z_][\w]*)!/gu) // 208 bis: l'espansione ritardata di `cmd /v:on`
  }
  if (ignoto || /\$\(|`/u.test(t)) return null
  return t
}

/**
 * Le grafie dello stesso disco locale di Windows riportate a `C:\…`: `\\?\C:\`, `\\.\C:\`, `\\?\UNC\<macchina>\C$\` e la condivisione
 * amministrativa `\\<macchina>\C$\` (la doc di Claude Code: `\\localhost\C$` è `C:\`). Il nome della macchina NON si controlla: la
 * radice `C$` di un'altra macchina è una cancellazione critica lo stesso, e il nostro nome può essere scritto in mille modi.
 */
function discoLocale(t) {
  const b = t.replace(/\//gu, '\\')
  const esteso = /^\\\\[?.]\\(?:UNC\\[^\\]+\\([A-Za-z])\$|([A-Za-z]:))(\\.*)?$/iu.exec(b)
  if (esteso) return `${esteso[1] ? `${esteso[1]}:` : esteso[2]}${esteso[3] ?? '\\'}`
  const amministrativa = /^\\\\[^\\?.][^\\]*\\([A-Za-z])\$(\\.*)?$/iu.exec(b)
  if (amministrativa) return `${amministrativa[1]}:${amministrativa[2] ?? '\\'}`
  const unix = /^\/(?:mnt\/)?([A-Za-z])(\/.*)?$/su.exec(t)
  if (unix) return `${unix[1]}:${unix[2] ?? '\\'}`
  return t
}

/** Il bersaglio assoluto, a parole, senza il glob in coda («/sdcard/*» è «/sdcard»), o `null` se non si può dire. */
function bersaglioAssoluto(scritto, ctx, dove) {
  let t = espanso(scritto, ctx, dove)
  if (t === null || t === '') return null
  if (ctx.windows) t = discoLocale(t)
  if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(t)) return null
  if (dove === null && !ctx.p.isAbsolute(t)) return null // dopo un `cd` che non si sa dove porta, un bersaglio relativo non si giudica
  let assoluto = ctx.p.resolve(dove ?? ctx.cartella, t)
  /* P: Win32 toglie punti e spazi in coda all'ultimo pezzo (`progetto.`, `"progetto "`; Python issue 41509, PathCchCanonicalizeEx) */
  if (ctx.windows) assoluto = assoluto.replace(/(?<=[^\\/.])[. ]+$/u, '')
  /* un glob sulla radice È la radice: si tolgono le code fatte solo di jolly e punti (`*`, `.*`, `*.*`, `**`, `?*`) */
  for (;;) {
    const coda = ctx.p.basename(assoluto)
    if (coda === '' || !/^[*?.]+$/u.test(coda) || !/[*?]/u.test(coda)) break
    const sopra = ctx.p.dirname(assoluto)
    if (sopra === assoluto) break
    assoluto = sopra
  }
  return ctx.windows ? assoluto : comeSulTelefono(assoluto)
}

/* ── i posti critici ────────────────────────────────────────────────────────────────────────────────────────────────────── */

const cartelleDeiProgetti = (ambiente) => {
  const grezzo = Object.entries(ambiente ?? {}).find(([k]) => k === 'TALOS_HARNESS_UI_PROJECT_DIRS')?.[1]
  return typeof grezzo === 'string' ? grezzo.split(';').map((x) => x.trim()).filter(Boolean) : []
}

const memoriaDeiVeri = new Map()
/** Il percorso vero (giunzioni, collegamenti) di cartella, casa e cartelle dei progetti: UNA volta per terna, poi dalla memoria. */
function veriDi(ctx, realpathFn) {
  const progetti = cartelleDeiProgetti(ctx.ambiente)
  const chiave = `${ctx.piattaforma}\u0000${ctx.cartella}\u0000${ctx.home}\u0000${progetti.join(';')}\u0000${ctx.progettiCritici.join(';')}`
  if (memoriaDeiVeri.has(chiave)) return memoriaDeiVeri.get(chiave)
  const vero = (x) => { if (typeof x !== 'string' || x === '') return null; try { return realpathFn(x) } catch { return null } }
  const veri = { cartella: vero(ctx.cartella), home: vero(ctx.home), progetti: progetti.map((x) => [x, vero(x)]).flat().filter(Boolean),
    progettiCritici: ctx.progettiCritici.map((x) => [x, vero(x)]).flat().filter(Boolean) }
  if (memoriaDeiVeri.size >= TETTO_MEMORIA) memoriaDeiVeri.delete(memoriaDeiVeri.keys().next().value)
  memoriaDeiVeri.set(chiave, veri)
  return veri
}

/** Per le prove: la memoria dei percorsi veri si svuota. */
export function dimenticaPercorsiVeri() { memoriaDeiVeri.clear() }

/** Un glob di UN nome (`ni*`, `progett?`, `[pP]rog*`) come espressione, o `null` se non si legge. */
function globDiUnNome(nome, windows) {
  let re = ''
  for (let i = 0; i < nome.length; i += 1) {
    const c = nome[i]
    if (c === '*') re += '.*'
    else if (c === '?') re += '.'
    else if (c === '[') {
      const j = nome.indexOf(']', i + 2)
      if (j === -1) { re += '\\['; continue }
      const dentro = nome.slice(i + 1, j).replace(/^!/u, '^').replace(/\\/gu, '\\\\')
      re += `[${dentro}]`
      i = j
    } else re += c.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  }
  try { return new RegExp(`^${re}$`, windows ? 'iu' : 'u') } catch { return null }
}

/**
 * Due nomi della stessa cartella, a parole: uguali (su Windows senza maiuscole), il nome corto 8.3 di Windows (`NINO~1` per `nino`,
 * `PROGRA~1` per `Program Files`: le prime sei lettere senza spazi e punti, poi `~N`), o un glob che lo prende (`ni*`).
 */
function stessoNome(scritto, vero, ctx, senzaMaiuscole = ctx.windows) {
  const a = senzaMaiuscole ? scritto.toLowerCase() : scritto
  const c = senzaMaiuscole ? vero.toLowerCase() : vero
  if (a === c) return true
  if (ctx.windows) {
    const corto = /^([^~\s.]{1,6})~\d+$/u.exec(a)
    if (corto && c.replace(/[\s.]/gu, '').startsWith(corto[1])) return true
  }
  return GLOB.test(scritto) ? Boolean(globDiUnNome(scritto, ctx.windows)?.test(vero)) : false
}

function pezzi(x, ctx) {
  const r = ctx.p.resolve(x)
  const radice = ctx.p.parse(r).root
  return { radice: ctx.windows ? radice.replace(/\//gu, '\\').toLowerCase() : radice, nomi: r.slice(radice.length).split(/[\\/]+/u).filter(Boolean) }
}

/**
 * T1 (forma permessi 2, punto 4, OK del Mobile): la memoria condivisa del telefono emula il FAT (AOSP `jni/FuseUtils.cpp`, LWN 718640): i
 * nomi non badano alle maiuscole quando bersaglio e cartella critica stanno tutti e due lì. Il volume (`storage/emulated/N`, una scheda
 * `storage/XXXX-XXXX`) si confronta com'è; `/data` resta con le maiuscole.
 */
const nellaMemoriaCondivisa = (nomi) => nomi[0] === 'storage' && (nomi[1] === 'emulated' && /^\d+$/u.test(nomi[2] ?? '') || /^[0-9A-F]{4}-[0-9A-F]{4}$/u.test(nomi[1] ?? ''))

/** `quale`: 'uguale' se `a` nomina la cartella `c`, 'sopra' se ne nomina una madre, `null` altrimenti. */
function dove(a, c, ctx) {
  if (typeof c !== 'string' || c === '') return null
  const C = pezzi(ctx.windows ? c : comeSulTelefono(c), ctx)
  if (a.radice !== C.radice || a.nomi.length > C.nomi.length) return null
  const senzaMaiuscole = ctx.windows || (nellaMemoriaCondivisa(a.nomi) && nellaMemoriaCondivisa(C.nomi))
  const volume = !ctx.windows && senzaMaiuscole ? (a.nomi[1] === 'emulated' ? 3 : 2) : 0
  for (let i = 0; i < a.nomi.length; i += 1) if (!stessoNome(a.nomi[i], C.nomi[i], ctx, senzaMaiuscole && i >= volume)) return null
  return a.nomi.length === C.nomi.length ? 'uguale' : 'sopra'
}

function perche(assoluto, ctx, veri) {
  const a = pezzi(assoluto, ctx)
  if (a.nomi.length === 0) return 'radice'
  if (a.nomi.length === 1) return 'primo-livello'
  const forma = ctx.windows ? null : ctx.p.resolve(assoluto).replace(/\/+$/u, '')
  if (!ctx.windows && RADICE_DEL_TELEFONO.test(forma)) return 'telefono'
  const case_ = [ctx.home, veri.home]
  for (const casa of case_) if (dove(a, casa, ctx) === 'uguale') return 'casa'
  /* decisione 179: dentro la casa del Codice sul telefono, chiavi e conversazioni */
  const casaDelTelefono = ctx.piattaforma === 'android' || case_.some((c) => typeof c === 'string' && CASA_NELLA_CARTELLA_DELL_APP.test(comeSulTelefono(c)))
  if (!ctx.windows && casaDelTelefono) {
    for (const casa of case_) for (const nome of DATI_DELL_APP) if (casa && dove(a, ctx.p.join(casa, nome), ctx) === 'uguale') return 'dati-dell-app'
  }
  /*
   * decisione 179: la cartella di TUTTI i progetti (`TALOS_HARNESS_UI_PROJECT_DIRS`) è critica di suo, e lo sono le sue madri. T2 (forma
   * permessi 2, punto 4): «tutti i progetti» solo sul telefono, dove la voce è la cartella che li contiene; sul PC ogni voce è UN progetto.
   */
  for (const progetti of veri.progetti) {
    const d = dove(a, progetti, ctx)
    if (d) return casaDelTelefono ? 'tutti-i-progetti' : d === 'uguale' ? 'progetto' : 'sopra-il-progetto'
  }
  /* K (forma permessi 2, 04/11): ogni voce di `progettiCritici` vale come la cartella del progetto (Accesso pieno con la cartella allargata al disco) */
  for (const progetto of [ctx.cartella, veri.cartella, ...veri.progettiCritici]) {
    const d = dove(a, progetto, ctx)
    if (d === 'uguale') return 'progetto'
    if (d === 'sopra') return 'sopra-il-progetto'
  }
  if (!ctx.windows && MEMORIA_CONDIVISA.test(ctx.p.dirname(forma))) return 'cartella-del-telefono'
  return null
}

/* ── il giudizio ─────────────────────────────────────────────────────────────────────────────────────────────────────────── */

const DI_POWERSHELL = new Set(['remove-item', 'ri', 'get-childitem', 'gci', 'get-item', 'gi'])

function* bersagliDel(parole, ctx) {
  const nome = nomeDelComando(parole[0].testo)
  const conVirgole = DI_POWERSHELL.has(nome)
  let opzioniFinite = false
  let salta = false
  for (const w of parole.slice(1)) {
    if (salta) { salta = false; continue }
    const t = w.testo
    if (!opzioniFinite && t === '--') { opzioniFinite = true; continue }
    if (!opzioniFinite && t.startsWith('-') && t.length > 1) {
      /* `-Path:C:\x` di PowerShell: il valore attaccato è il bersaglio; un'altra opzione col valore attaccato no */
      const attaccato = /^(-[A-Za-z]+):(.+)$/su.exec(t)
      if (attaccato) {
        if (OPZIONE_PERCORSO.test(attaccato[1])) for (const pezzo of conVirgole ? attaccato[2].split(',') : [attaccato[2]]) if (pezzo !== '') yield { testo: pezzo, sostituzione: false }
        continue
      }
      if (OPZIONI_CON_VALORE.has(t.toLowerCase())) salta = true
      continue
    }
    if ((INTERRUTTORI_DI_CMD.has(nome) || (ctx.windows && nome === 'rmdir')) && /^(?:\/[A-Za-z?])+(?::\S*)?$/u.test(t)) continue // 208 bis: `/s/q` sono due interruttori
    /* una redirezione non è un bersaglio: `>x`, `2>&1`, e la parola dopo un `>` da solo */
    if (/^\d*(?:>>?|<)/u.test(t)) { if (/^\d*(?:>>?|<)$/u.test(t)) salta = true; continue }
    if (w.gruppo !== undefined) { yield { testo: t, sostituzione: false, gruppo: w.gruppo }; continue } // P: `(Join-Path A B)`, si calcola dopo
    for (const pezzo of conVirgole ? t.split(',') : [t]) if (pezzo !== '') yield { testo: pezzo, sostituzione: w.sostituzione }
  }
}

/** P: il valore a parole di `(Join-Path A B)`, `(Get-Location)`, `(Resolve-Path X)`, `(Convert-Path X)`; `null` per ogni altro gruppo. */
function calcolaGruppo(dentro, ctx, dove) {
  const comandi = comandiSemplici(dentro, false)
  if (comandi.length !== 1) return null
  const [primo, ...resto] = comandi[0]
  const nome = nomeDelComando(primo.testo)
  if (!CALCOLABILI_PS.has(nome)) return null
  if (nome === 'get-location' || nome === 'gl' || nome === 'pwd') return dove
  const valori = []
  for (const w of resto) {
    if (/^-/u.test(w.testo)) continue // `-Path`, `-ChildPath`, `-Resolve`: i valori restano nell'ordine
    const v = w.gruppo !== undefined ? calcolaGruppo(w.gruppo, ctx, dove) : espanso(w.testo, ctx, dove)
    if (v === null) return null
    valori.push(v)
  }
  if (valori.length === 0) return null
  if (nome === 'join-path') return valori.length >= 2 ? ctx.p.join(...valori) : null
  return dove === null && !ctx.p.isAbsolute(valori[0]) ? null : ctx.p.resolve(dove ?? ctx.cartella, valori[0])
}

/** 208 bis (MEDIA-2): il valore a parole di `Get-Location`, `(Get-Item .).Parent.FullName`, `(Resolve-Path X).Path`; `null` se non si sa. */
function valoreCalcolatoPs(parole, ctx, dove) {
  const [testa, ...dopo] = parole
  let v = testa.gruppo !== undefined ? calcolaGruppo(testa.gruppo, ctx, dove)
    : CALCOLABILI_PS.has(nomeDelComando(testa.testo)) ? calcolaGruppo(parole.map((w) => w.testo).join(' '), ctx, dove) : null
  const coda = testa.gruppo !== undefined ? dopo.map((w) => w.testo).join('') : ''
  if (v === null || !/^(?:\.parent)*(?:\.(?:fullname|path|providerpath))?$/iu.test(coda)) return null
  for (let k = (coda.match(/\.parent/giu) ?? []).length; k > 0; k -= 1) v = ctx.p.dirname(v)
  return v
}

/** P: `sh -c '… "$1"' _ X`: i parametri posizionali messi nel testo prima di rileggerlo (`$0`… `$9`, `$@`, `$*`). */
function conPosizionali(corpo, valori) {
  if (valori.length === 0) return corpo
  return corpo
    .replace(/\$@|\$\*/gu, () => valori.slice(1).join(' '))
    .replace(/\$\{(\d)\}|\$(\d)/gu, (_, a, b) => valori[Number(a ?? b)] ?? '')
}

/** P: `start` di cmd, `Start-Process`/`saps` di PowerShell: il programma con i suoi argomenti, come testo da rileggere (o `null`). */
function testoDiStart(parole) {
  const fuori = []
  let programma = false
  for (let j = 1; j < parole.length; j += 1) {
    const t = parole[j].testo
    if (/^-a(?:r(?:g\w*)?)?$/iu.test(t) || /^-(?:f\w*|pspath|path)$/iu.test(t)) continue // -ArgumentList, -FilePath: resta il valore
    if (/^-(?:wo\w*|verb|wi\w*|cr\w*|redirect\w*|rs\w*|ro\w*|re\w*)$/iu.test(t)) { j += 1; continue }
    if (/^-(?:wait|passthru|nonewwindow|loaduserprofile|usenewenvironment)$/iu.test(t)) continue
    if (!programma) {
      if (t === '') continue // il titolo vuoto di `start "" …`
      if (/^\/d$/iu.test(t)) { j += 1; continue }
      if (/^\//u.test(t)) continue // `/b`, `/min`, `/wait`…
      programma = true
    }
    fuori.push(t)
  }
  return fuori.length ? fuori.join(' ') : null
}

const ricorsivo = (parole) => parole.slice(1).some(({ testo }) => /^-(?:[A-Za-z]*[rR][A-Za-z]*|-recursive|recurse)$/u.test(testo) || /^\/s$/iu.test(testo))

/** Toglie gli involucri (`sudo -u root`, `timeout 5`, `env -C x`, `X=1`): le parole del comando vero, la cartella, o un testo da rileggere. */
function senzaInvolucri(parole, ctx, dove) {
  let k = 0
  let cartella = dove
  while (k < parole.length) {
    const t = parole[k].testo
    if (/^[A-Za-z_][\w]*=/u.test(t)) { k += 1; continue }
    const involucro = INVOLUCRI.get(nomeDelComando(t))
    if (!involucro) break
    k += 1
    let posizionali = involucro.posizionali
    while (k < parole.length) {
      const w = parole[k].testo
      if (w === '--') { k += 1; break }
      if (w.startsWith('-') && w.length > 1) {
        const lunga = w.startsWith('--')
        const [opzione, attaccato] = lunga ? [w.split('=')[0], w.includes('=') ? w.slice(w.indexOf('=') + 1) : null] : [w.slice(0, 2), w.length > 2 ? w.slice(2) : null]
        k += 1
        if (!involucro.valore.has(opzione)) continue
        const valore = attaccato ?? parole[k]?.testo ?? null
        if (attaccato === null) k += 1
        if (involucro.testo.has(opzione) && valore !== null) return { testo: valore, cartella }
        if (involucro.cartella.has(opzione)) cartella = cartellaDopo(valore, ctx, cartella)
        continue
      }
      if (/^[A-Za-z_][\w]*=/u.test(w)) { k += 1; continue }
      if (posizionali > 0) { posizionali -= 1; k += 1; continue }
      break
    }
  }
  return { parole: parole.slice(k), cartella }
}

/** La cartella dopo `cd <scritto>`: `null` se non si sa (una variabile ignota, `cd -`). */
function cartellaDopo(scritto, ctx, dove) {
  if (scritto === null || scritto === undefined) return ctx.windows ? dove : ctx.home || null
  if (scritto === '-') return null
  const sostituzione = /^\$\(\s*(.*?)\s*\)$|^`\s*(.*?)\s*`$/su.exec(scritto)
  if (sostituzione) return cartellaDellaSostituzione(sostituzione[1] ?? sostituzione[2], ctx, dove)
  const t = espanso(scritto, ctx, dove)
  if (t === null || t === '') return null
  const disco = ctx.windows ? discoLocale(t) : t
  if (dove === null && !ctx.p.isAbsolute(disco)) return null
  return ctx.p.resolve(dove ?? ctx.cartella, disco)
}

/**
 * C (forma permessi 2, punto 2, regola 17): `cd` su due sostituzioni del lavoro di ogni giorno. `$(git rev-parse --show-toplevel)` dal
 * progetto vale il progetto (la radice del repo è lui o una madre: la carta resta per `rm -rf .`); `$(mktemp -d)` vale una cartella nuova e
 * vuota nella cartella temporanea (`-p`/`--tmpdir` NO: il genitore può essere il progetto). Ogni altra sostituzione resta ignota (`null`),
 * come Codex: si fallisce chiusi.
 */
function cartellaDellaSostituzione(dentro, ctx, dove) {
  const comandi = comandiSemplici(dentro, !ctx.windows)
  if (comandi.length !== 1) return null
  const parole = comandi[0].map((w) => w.testo)
  if (parole.length === 3 && nomeDelComando(parole[0]) === 'git' && parole[1] === 'rev-parse' && parole[2] === '--show-toplevel') {
    return dove !== null && ctx.p.resolve(dove) === ctx.p.resolve(ctx.cartella) ? ctx.cartella : null
  }
  if (nomeDelComando(parole[0]) !== 'mktemp') return null
  let cartella = false
  for (const w of parole.slice(1)) {
    if (w === '--directory') cartella = true
    else if (/^-[dqtu]+$/u.test(w)) cartella = cartella || w.includes('d')
    else if (w === '--quiet' || w === '--dry-run' || /^--suffix=/u.test(w)) continue
    else if (w.startsWith('-')) return null // `-p X`, `--tmpdir=X` e ogni altra opzione: il posto non si sa
    else if (/[\\/]/u.test(w)) return null // un modello con una barra è relativo alla cartella di adesso
  }
  if (!cartella) return null
  const temporanea = valoreDi('TMPDIR', ctx, dove) ?? (ctx.windows ? valoreDi('TEMP', ctx, dove) ?? valoreDi('TMP', ctx, dove) : '/tmp')
  return temporanea ? ctx.p.join(temporanea, 'mktemp.nuova') : null
}

/** Il primo argomento di un `cd`/`Set-Location`, saltando le opzioni (`-P`, `/d`), con `-Path x` e `-Path:x`. */
function argomentoDelCd(parole, ctx) {
  for (let i = 1; i < parole.length; i += 1) {
    const t = parole[i].testo
    const attaccato = /^(-[A-Za-z]+):(.+)$/su.exec(t)
    if (attaccato) { if (OPZIONE_PERCORSO.test(attaccato[1])) return t.slice(attaccato[1].length + 1); continue }
    if (OPZIONE_PERCORSO.test(t)) return parole[i + 1]?.testo ?? null
    if (ctx.windows && /^-s(?:t(?:a(?:c(?:k(?:n(?:a(?:m(?:e)?)?)?)?)?)?)?)?$/iu.test(t)) { i += 1; continue } // 208 ter: `-StackName X` prende un valore
    if (/^-/u.test(t) && t !== '-') continue
    if (ctx.windows && /^\/[A-Za-z]$/u.test(t)) continue
    return t
  }
  return null
}

function decodificaPowerShell(b64) {
  if (typeof b64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/u.test(b64)) return null
  try { return Buffer.from(b64, 'base64').toString('utf16le') } catch { return null }
}

const TROPPO_ANNIDATO = Object.freeze({ percorso: null, perche: 'troppo-annidato' })

/** C: ciò che arriva alla pipe è scelto da un filtro (`-Filter`, `-Include`, un glob nel nome come `*.log`): niente carta per la pipe. */
function filtrata(parole, ctx) {
  if (parole.slice(1).some((w) => OPZIONE_FILTRO.test(w.testo))) return true
  return [...bersagliDel(parole, ctx)].some((b) => {
    const coda = b.testo.split(/[\\/]/u).pop()
    return GLOB.test(coda) && !/^[*?.]+$/u.test(coda)
  })
}

/** P: un bersaglio scritto con una variabile del `for` (`for d in a ..; do rm -rf "$d"`): un testo per ogni valore (fino a 16). */
function variantiDi(testo, ctx) {
  let uscite = [testo]
  for (const [nome, valori] of ctx.locali ?? []) {
    if (valori.length < 2) continue
    const re = new RegExp(`\\$\\{${nome}\\}|\\$${nome}(?![\\w])`, ctx.windows ? 'giu' : 'gu')
    uscite = uscite.flatMap((u) => (u.search(re) === -1 ? [u] : valori.map((v) => u.replace(re, () => v)))).slice(0, 16)
  }
  return uscite
}

/** P: le variabili assegnate nello stesso testo: `D=..`, `export D=..`, `set D=..` (cmd), `$d = "…"` (PowerShell), `for X in A B`. */
function ricordaAssegnazioni(comando, ctx, cartella) {
  const parole = comando.map((w) => w.testo)
  const assegna = (nome, scritti) => {
    const valori = []
    for (const s of scritti.slice(0, 16)) { const v = espanso(s, ctx, cartella); if (v === null) { valori.length = 0; break } valori.push(v) }
    ctx.locali ??= new Map()
    ctx.locali.set(ctx.windows ? nome.toUpperCase() : nome, valori) // vuoto = il valore non si sa
  }
  const coppia = (t) => /^([A-Za-z_][\w]*)=(.*)$/su.exec(t)
  if (parole.length === 0) return
  if (parole.every((t) => coppia(t))) { for (const t of parole) { const [, n, v] = coppia(t); assegna(n, [v]) } return }
  if (/^(?:export|declare|local|readonly|typeset|set)$/iu.test(parole[0])) { for (const t of parole.slice(1)) { const c = coppia(t); if (c) assegna(c[1], [c[2]]) } return }
  /* 208 ter (MEDIA-2): `$env:GIT_WORK_TREE = '..'`, `$env:X='..'` di PowerShell: la variabile d'ambiente vale per i comandi dopo */
  const ambientePs = ctx.windows ? /^\$env:([A-Za-z_][\w]*)(?:=(.*))?$/isu.exec(parole[0]) : null
  if (ambientePs && ambientePs[2] !== undefined && parole.length === 1) { assegna(ambientePs[1], [ambientePs[2]]); return }
  if (ambientePs && ambientePs[2] === undefined && parole[1] === '=') { assegna(ambientePs[1], parole.length === 3 && comando[2].gruppo === undefined ? [parole[2]] : []); return }
  if (ctx.windows && parole.length >= 3 && /^\$[A-Za-z_][\w]*$/u.test(parole[0]) && parole[1] === '=') {
    if (parole.length === 3 && comando[2].gruppo === undefined && !CALCOLABILI_PS.has(nomeDelComando(parole[2]))) { assegna(parole[0].slice(1), [parole[2]]); return }
    const v = valoreCalcolatoPs(comando.slice(2), ctx, cartella) // 208 bis (MEDIA-2): `$d = Get-Location`, `$d = (Get-Item .).Parent.FullName`
    ctx.locali ??= new Map()
    ctx.locali.set(parole[0].slice(1).toUpperCase(), v === null ? [] : [v])
    return
  }
  if (ctx.windows && parole.length === 1 && /^\$[A-Za-z_][\w]*=/u.test(parole[0])) { const c = coppia(parole[0].slice(1)); if (c) assegna(c[1], [c[2]]); return }
  /* 208 ter (ALTO-2): un `for` annidato arriva dopo il `do` di quello fuori (`for a in "1"; do for b in ".."; do rd … $b`) */
  const f = parole[0] === 'do' ? parole.slice(1) : parole
  if (f[0] === 'for' && /^[A-Za-z_][\w]*$/u.test(f[1] ?? '') && f[2] === 'in') {
    assegna(f[1], f.slice(3))
    /* 208 ter (ALTO-2): un valore del `for` che non si sa (`for /d %i in (%~dp0..)`): su Windows la cancellazione ricorsiva con quella variabile è una carta */
    const nome = ctx.windows ? f[1].toUpperCase() : f[1]
    ctx.forIgnoti ??= new Set()
    if (f.length > 3 && ctx.locali.get(nome).length === 0) ctx.forIgnoti.add(nome)
    else ctx.forIgnoti.delete(nome)
  }
}

/**
 * 208 ter (ALTO-2): `forfiles [/p X] [/m M] [/s] /c "cmd /c … @path …"` (Microsoft Learn `forfiles`, letta il 05/11/2026): il comando gira
 * su ogni nome sotto X (con `/s` a ogni livello) e `@path`/`@file`/`@fname`/`@relpath` sono quel nome; `0xHH` è un carattere. Il corpo si
 * rilegge una volta con un nome neutro, e una per ogni posto critico che sta SOTTO X (casa, progetto, progetti) col nome che lo prende.
 */
function giudicaForfiles(parole, ctx, realpathFn, qui, rileggi) {
  let cartella = '.'
  let maschera = '*'
  let sotto = false
  let corpo = 'cmd /c echo @file'
  for (let j = 1; j < parole.length; j += 1) {
    const t = parole[j].testo
    if (/^[-/]s$/iu.test(t)) { sotto = true; continue }
    const o = /^[-/]([pmcd])(.*)$/isu.exec(t)
    if (!o) continue
    const valore = o[2] !== '' ? o[2] : parole[(j += 1)]?.testo
    if (valore === undefined) break
    const k = o[1].toLowerCase()
    if (k === 'p') cartella = valore
    else if (k === 'm') maschera = valore
    else if (k === 'c') corpo = valore
  }
  corpo = corpo.replace(/0x([0-9A-Fa-f]{2})/gu, (_, h) => String.fromCharCode(Number.parseInt(h, 16)))
  if (!sembraCancellare(corpo) && !(ctx.windows && sembraCancellare(comeLoLeggeCmd(corpo)))) return null
  const usaIlNome = /@(?:path|file|fname|relpath)\b/iu.test(corpo)
  const conIlNome = (x) => corpo.replace(/@(?:path|file|fname|relpath)\b/giu, () => `"${x}"`).replace(/@isdir\b/giu, 'TRUE').replace(/@(?:ext|fsize|fdate|ftime)\b/giu, 'x')
  const radice = cartellaDopo(cartella, ctx, qui)
  if (radice === null) return usaIlNome ? { percorso: parole.map((w) => w.testo).join(' '), perche: 'sostituzione' } : rileggi(conIlNome('x'), null)
  const neutra = rileggi(conIlNome(ctx.p.join(radice, 'talos-forfiles')), radice)
  if (neutra || !usaIlNome) return neutra
  const tutti = /^\*(?:\.\*)?$/u.test(maschera)
  const prende = (nome) => tutti || Boolean(globDiUnNome(maschera, ctx.windows)?.test(nome))
  const r = pezzi(radice, ctx)
  if (r.nomi.length === 0 && tutti) return { percorso: ctx.p.join(radice, '*'), perche: 'primo-livello' }
  const veri = veriDi(ctx, realpathFn)
  for (const critico of [ctx.home, veri.home, ctx.cartella, veri.cartella, ...veri.progetti, ...veri.progettiCritici]) {
    if (dove(r, critico, ctx) !== 'sopra') continue
    const nomi = pezzi(critico, ctx).nomi
    for (let i = r.nomi.length; i < (sotto ? nomi.length : r.nomi.length + 1); i += 1) {
      if (!prende(nomi[i])) continue
      const candidato = ctx.p.join(radice, ...nomi.slice(r.nomi.length, i + 1))
      const trovata = rileggi(conIlNome(candidato), ctx.p.dirname(candidato))
      if (trovata) return trovata
    }
  }
  return null
}

function giudicaUnTesto(testo, ctx, realpathFn, profondita, dove) {
  /* ⛔ oltre il tetto si fallisce CHIUSI (Codex `is_dangerous_command.rs:35-58`): un testo che sembra cancellare e che non si guarda fino in fondo è una carta */
  if (profondita > TETTO_ANNIDAMENTO) return sembraCancellare(testo) ? TROPPO_ANNIDATO : null
  /* P: `[IO.Directory]::Delete(…)`, `(Get-Item X).Delete($true)`: il parser non li segue, si fallisce chiusi */
  if (CANCELLAZIONE_DI_DOTNET.test(testo)) return TROPPO_ANNIDATO
  let cartella = dove
  const pila = []
  let precedente = null
  let elencoInPipe = null // P: ciò che `gci X | % { … }` dà a `$_`
  const rileggi = (t, dentro = cartella) => giudica(t, ctx, realpathFn, profondita + 1, dentro)
  /* C: il corpo di un heredoc è testo; si rilegge solo quello che riceve una shell */
  const { testo: senzaCorpi, corpi } = ctx.windows ? { testo, corpi: [] } : separaHeredoc(testo)
  for (const corpo of corpi) { const trovata = rileggi(corpo); if (trovata) return trovata }
  for (const comando of comandiSemplici(senzaCorpi, !ctx.windows)) {
    /* le sostituzioni si eseguono: si guardano come comandi a sé; un gruppo fra parentesi che non si calcola si rilegge (`if exist x (rd …)`) */
    for (const w of comando) for (const dentro of sostituzioniDi(w.testo)) {
      const trovata = rileggi(dentro)
      if (trovata) return trovata
    }
    for (const w of comando) {
      if (w.gruppo === undefined || CALCOLABILI_PS.has(nomeDelComando(comandiSemplici(w.gruppo, false)[0]?.[0]?.testo ?? ''))) continue
      const trovata = rileggi(w.gruppo)
      if (trovata) return trovata
    }
    ricordaAssegnazioni(comando, ctx, cartella)
    const tolti = senzaInvolucri(comando, ctx, cartella)
    if (tolti.testo !== undefined) { const trovata = rileggi(tolti.testo, tolti.cartella); if (trovata) return trovata; continue }
    let parole = tolti.parole
    const prima = precedente
    precedente = parole
    if (parole.length === 0) continue
    /* P: il nome del comando scritto con una variabile (`R=rm; $R -rf ..`): il valore se si sa, altrimenti carta se cancella ricorsivo */
    if (/^[$%]/u.test(parole[0].testo)) {
      const vero = espanso(parole[0].testo, ctx, tolti.cartella)
      if (vero === null || vero === '') { if (ricorsivo(parole) && sembraCancellare(testo)) return TROPPO_ANNIDATO; continue }
      parole = [{ ...parole[0], testo: vero }, ...parole.slice(1)]
    }
    const nome = nomeDelComando(parole[0].testo)
    const qui = tolti.cartella
    const resto = () => parole.slice(1).map((w) => w.testo).join(' ')
    /* `cd C:\Users && rm -rf nino`: la cartella cambia per i comandi dopo */
    /* 208 ter (MEDIA-3): `Push-Location`/`Pop-Location` di PowerShell come `pushd`/`popd` (about_Locations) */
    if (COMANDI_CHE_SPOSTANO.has(nome)) { if (nome === 'pushd' || nome === 'push-location') pila.push(cartella); cartella = cartellaDopo(argomentoDelCd(parole, ctx), ctx, cartella); continue }
    if (nome === 'popd' || nome === 'pop-location') { cartella = pila.length ? pila.pop() : null; continue }
    if (nome === 'forfiles') { const trovata = giudicaForfiles(parole, ctx, realpathFn, qui, rileggi); if (trovata) return trovata; continue }
    /* `eval`, e in PowerShell `iex`/`Invoke-Expression` (P): il testo si rilegge, con le variabili assegnate prima */
    if (nome === 'eval' || nome === 'iex' || nome === 'invoke-expression') {
      const corpo = parole.slice(1).map((w) => (/^[$%]/u.test(w.testo) ? espanso(w.testo, ctx, qui) ?? w.testo : w.testo)).join(' ')
      const trovata = rileggi(corpo, qui)
      if (trovata) return trovata
      continue
    }
    /* P: `alias x=rm`, `Set-Alias`: il nome nuovo non si segue; carta se il testo cancella */
    if (['alias', 'set-alias', 'sal', 'new-alias', 'nal'].includes(nome)) { if (sembraCancellare(parole.map((w) => w.testo).join(' '))) return TROPPO_ANNIDATO; continue }
    /* il testo che un'altra shell eseguirà: `bash -c "…"`, `cmd /c …`, `powershell -Command …` (anche `-Com`, `-EncodedCommand`) */
    if (SHELL_POSIX.has(nome)) {
      const i = parole.findIndex((w, j) => j > 0 && /^-[A-Za-z]*c[A-Za-z]*$/u.test(w.testo))
      const k = i > 0 ? (parole[i + 1]?.testo === '--' ? i + 2 : i + 1) : -1
      if (k > 0 && parole[k]) {
        /* P: `bash -c "$(printf …)"`: il testo lo scrive un comando, non si sa → carta se il testo cancella */
        if (parole[k].sostituzione && sembraCancellare(testo)) return TROPPO_ANNIDATO
        /* P: `sh -c '… "$1"' _ X`: i posizionali entrano nel testo */
        const trovata = rileggi(conPosizionali(parole[k].testo, parole.slice(k + 1).map((w) => w.testo)), qui)
        if (trovata) return trovata
        continue
      }
      /* P: `bash <<< '…'` */
      const h = parole.findIndex((w, j) => j > 0 && w.testo.startsWith('<<<'))
      if (h > 0) {
        const stringa = parole[h].testo === '<<<' ? parole[h + 1]?.testo : parole[h].testo.slice(3)
        if (stringa) { const trovata = rileggi(stringa, qui); if (trovata) return trovata }
        continue
      }
      /* P: `echo '…' | bash`, `printf … | sh`: si rilegge il testo; un'altra fonte nella pipe di una shell non si sa → carta se il testo cancella */
      if (comando.dopoPipe && prima?.length) {
        const fonte = nomeDelComando(prima[0].testo)
        if (fonte === 'echo' || fonte === 'printf') {
          const trovata = rileggi(prima.slice(1).filter((w) => !/^-[neE]+$/u.test(w.testo)).map((w) => w.testo).join(' '), qui)
          if (trovata) return trovata
        } else if (sembraCancellare(testo)) return TROPPO_ANNIDATO
      }
      continue
    }
    if (nome === 'cmd') {
      for (let j = 1; j < parole.length; j += 1) {
        const t = parole[j].testo
        const attaccato = /^\/[ck](?!:)(.+)$/isu.exec(t) // P: `cmd /c"rd /s /q …"`
        if (!/^\/[ckr]$/iu.test(t) && !attaccato) continue // `/r` è un altro nome di `/c`
        const trovata = rileggi([...(attaccato ? [attaccato[1]] : []), ...parole.slice(j + 1).map((w) => w.testo)].join(' '), qui)
        if (trovata) return trovata
        break
      }
      continue
    }
    /* P: `start /b cmd /c …`, `start "" …`, `Start-Process cmd -ArgumentList '/c …'` */
    if (nome === 'start' || nome === 'start-process' || nome === 'saps') {
      const corpo = testoDiStart(parole)
      if (corpo) { const trovata = rileggi(corpo, qui); if (trovata) return trovata }
      continue
    }
    /* P: `ssh H '…'`: il testo si rilegge come se girasse qui (una carta in più, mai in meno) */
    if (nome === 'ssh') {
      let j = 1
      for (; j < parole.length; j += 1) { const t = parole[j].testo; if (/^-[bcDEeFIiJLlmOopQRSWw]$/u.test(t)) { j += 1; continue } if (t.startsWith('-')) continue; break }
      const corpo = parole.slice(j + 1).map((w) => w.testo).join(' ')
      if (corpo) { const trovata = rileggi(corpo, qui); if (trovata) return trovata }
      continue
    }
    /* P: `xargs rm -r…` e `parallel rm …`: il bersaglio arriva da fuori, non si sa (`xargs rm` senza -r resta senza carta) */
    if (nome === 'xargs') {
      const k = parole.findIndex((w, j) => j > 0 && COMANDI_CHE_CANCELLANO.has(nomeDelComando(w.testo)))
      if (k > 0 && ricorsivo(parole.slice(k))) return TROPPO_ANNIDATO
      continue
    }
    if (nome === 'parallel') { if (sembraCancellare(resto())) return TROPPO_ANNIDATO; continue }
    if (SHELL_POWERSHELL.has(nome)) {
      let corpo = null
      let dentro = qui
      for (let j = 1; j < parole.length; j += 1) {
        const t = parole[j].testo
        if (OPZIONE_COMANDO_PS.test(t)) { corpo = parole.slice(j + 1).map((w) => w.testo).join(' '); break }
        if (OPZIONE_CODIFICATA_PS.test(t)) { corpo = decodificaPowerShell(parole[j + 1]?.testo); if (corpo === null) return TROPPO_ANNIDATO; break }
        if (/^[-/]f(?:i(?:l(?:e)?)?)?$/iu.test(t)) break // `-File`: uno script, non si legge
        if (/^[-/](?:workingdirectory|wd)$/iu.test(t)) { dentro = cartellaDopo(parole[j + 1]?.testo, ctx, qui); j += 1; continue } // P: `-wd X`
        if (OPZIONI_PS_CON_VALORE.test(t)) { j += 1; continue }
        if (/^[-/]/u.test(t)) continue
        if (nome === 'powershell') corpo = parole.slice(j).map((w) => w.testo).join(' ') // powershell.exe: il primo argomento è -Command
        break
      }
      if (corpo) { const trovata = rileggi(corpo, dentro); if (trovata) return trovata }
      continue
    }
    /* P: `gci X | % { ri $_ … }`, `ForEach-Object { Remove-Item $_.FullName … }`: `$_` vale ciò che elenca chi sta prima della pipe */
    if ((nome === '%' || nome === 'foreach-object' || nome === 'foreach') && comando.dopoPipe && prima && COMANDI_CHE_ELENCANO.has(nomeDelComando(prima[0]?.testo ?? ''))) {
      const elencati = [...bersagliDel(prima, ctx)]
      elencoInPipe = { filtrata: filtrata(prima, ctx), bersagli: elencati.length ? elencati : [{ testo: '.', sostituzione: false }], qui }
      continue
    }
    /* P: `robocopy A B /MIR` (o `/PURGE`) e `rsync --delete A B`: B perde ciò che A non ha */
    const specchio = nome === 'robocopy' && parole.some((w) => /^\/(?:mir|purge)$/iu.test(w.testo)) ? parole.slice(1).filter((w) => !w.testo.startsWith('/'))[1]
      : nome === 'rsync' && parole.some((w) => /^--del/u.test(w.testo)) ? parole.slice(1).filter((w) => !w.testo.startsWith('-')).at(-1) : null
    if (specchio) {
      if (nome === 'rsync' && /^[^/]*:/u.test(specchio.testo) && !/^[A-Za-z]:[\\/]/u.test(specchio.testo)) continue // un'altra macchina
      const assoluto = bersaglioAssoluto(specchio.testo, ctx, qui)
      const motivo = assoluto === null ? null : perche(assoluto, ctx, veriDi(ctx, realpathFn))
      if (motivo) return { percorso: assoluto, perche: motivo }
      continue
    }
    /* `find X -delete` (e P: `-exec rm -r… {} +`) senza filtri cancella X e tutto ciò che ha dentro; con un filtro (`-name "*.o"`) solo ciò che lo passa: niente carta */
    if (nome === 'find') {
      const iExec = parole.findIndex((w) => /^-(?:exec|execdir|ok|okdir)$/u.test(w.testo))
      let senzaExec = parole
      let execCancella = false
      if (iExec > 0) {
        let fine = parole.findIndex((w, j) => j > iExec && (w.testo === ';' || w.testo === '+'))
        if (fine === -1) fine = parole.length
        const dentroExec = parole.slice(iExec + 1, fine)
        execCancella = dentroExec.length > 0 && COMANDI_CHE_CANCELLANO.has(nomeDelComando(dentroExec[0].testo)) && ricorsivo(dentroExec)
        senzaExec = [...parole.slice(0, iExec), ...parole.slice(fine + 1)]
      }
      if (!execCancella && !parole.some((w) => w.testo === '-delete')) continue
      const radici = []
      let i = 1
      for (; i < senzaExec.length; i += 1) { if (radici.length === 0 && /^-[HLP]$/u.test(senzaExec[i].testo)) continue; if (/^[-(!]/u.test(senzaExec[i].testo)) break; radici.push(senzaExec[i]) }
      const filtri = senzaExec.slice(i).map((w) => w.testo)
      const senzaFiltri = filtri.every((t, j) => /^-(?:delete|depth|xdev|mount|noleaf|ignore_readdir_race|d)$/u.test(t) || /^-(?:min|max)depth$/u.test(t) || /^\d+$/u.test(t) && /^-(?:min|max)depth$/u.test(filtri[j - 1] ?? ''))
      if (!senzaFiltri) continue
      for (const w of radici.length ? radici : [{ testo: '.', sostituzione: false }]) {
        const assoluto = bersaglioAssoluto(w.testo, ctx, qui)
        const motivo = assoluto === null ? null : perche(assoluto, ctx, veriDi(ctx, realpathFn))
        if (motivo) return { percorso: assoluto, perche: motivo }
      }
      continue
    }
    /* 208 bis (MEDIA-3): `git [-C X] clean -f… [percorso]` cancella ciò che non è tracciato in X (con `-ff` anche i repository dentro, git
       `git-clean` docs): carta se il posto è critico e non è il progetto stesso. Hermes `approval_detection.py:449` vuole `git clean` vicini. */
    /* 208 ter (MEDIA-2): `--work-tree X`, `GIT_WORK_TREE=X` (anche `set` e `$env:`), `--git-dir`/`GIT_DIR` spostano l'albero di lavoro
       (git(1)): con `-ff` il progetto stesso perde `.git` e tutto (misurato); `:/` e `:(top)` sono la radice dell'albero */
    if (nome === 'git') {
      let dentro = qui
      let albero = null
      let altroRepo = false
      for (const w of comando) {
        const a = /^(GIT_WORK_TREE|GIT_DIR)=(.*)$/su.exec(w.testo)
        if (!a) break
        if (a[1] === 'GIT_DIR') altroRepo = true
        else albero = a[2]
      }
      let j = 1
      for (; j < parole.length && parole[j].testo.startsWith('-'); j += 1) {
        const t = parole[j].testo
        if (t === '-C') { dentro = cartellaDopo(parole[j + 1]?.testo, ctx, dentro); j += 1 } else if (/^--work-tree=/u.test(t)) albero = t.slice('--work-tree='.length)
        else if (t === '--work-tree') { albero = parole[j + 1]?.testo ?? null; j += 1 } else if (/^--git-dir(?:=|$)/u.test(t)) { altroRepo = true; if (t === '--git-dir') j += 1 } else if (/^(?:-c|--namespace)$/u.test(t)) j += 1
      }
      const opzioni = parole.slice(j + 1).map((w) => w.testo)
      if (parole[j]?.testo !== 'clean' || !opzioni.some((t) => /^-[A-Za-z]*f/u.test(t) || t === '--force') || opzioni.some((t) => /^-[A-Za-z]*[ni]|^--(?:dry-run|interactive)$/u.test(t))) continue
      if (dentro === null) return { percorso: parole.map((w) => w.testo).join(' '), perche: 'sostituzione' }
      if (albero === null) albero = valoreDi('GIT_WORK_TREE', ctx, dentro)
      altroRepo = altroRepo || valoreDi('GIT_DIR', ctx, dentro) !== null
      const radice = albero === null ? dentro : bersaglioAssoluto(albero, ctx, dentro)
      if (radice === null) return { percorso: albero, perche: 'sostituzione' }
      const doppia = opzioni.reduce((n, t) => n + (t === '--force' ? 1 : /^-[A-Za-z]+$/u.test(t) ? t.split('f').length - 1 : 0), 0) >= 2
      const spostato = albero !== null || altroRepo
      const percorsi = opzioni.filter((t, k) => !t.startsWith('-') && !/^(?:-e|--exclude)$/u.test(opzioni[k - 1] ?? ''))
      for (const p of percorsi.length ? percorsi : ['.']) {
        const daRadice = /^:(?:\/|\([^)]*\btop\b[^)]*\))(.*)$/su.exec(p)
        const assoluto = daRadice ? (daRadice[1] ? bersaglioAssoluto(daRadice[1], ctx, radice) : radice) : bersaglioAssoluto(p, ctx, dentro)
        const motivo = assoluto === null ? null : perche(assoluto, ctx, veriDi(ctx, realpathFn))
        if (motivo && (motivo !== 'progetto' || (spostato && doppia))) return { percorso: assoluto, perche: motivo }
      }
      continue
    }
    if (!COMANDI_CHE_CANCELLANO.has(nome)) continue
    let bersagli = [...bersagliDel(parole, ctx)]
    let dove2 = qui
    /* `gci C:\Users\nino -Recurse | Remove-Item`: senza percorso, Remove-Item cancella ciò che la pipe gli porta (C: se un filtro sceglie, niente carta) */
    if (bersagli.length === 0 && comando.dopoPipe && prima && COMANDI_CHE_ELENCANO.has(nomeDelComando(prima[0]?.testo ?? ''))) {
      if (filtrata(prima, ctx) || filtrata(parole, ctx)) continue
      bersagli = [...bersagliDel(prima, ctx)]
      if (bersagli.length === 0) bersagli = [{ testo: '.', sostituzione: false }]
    }
    /* P: `$_`, `$_.FullName`, `$PSItem` dentro il blocco di ForEach-Object */
    if (elencoInPipe && bersagli.some((b) => /^\$(?:_|psitem)(?:\.(?:fullname|pspath|name))?$/iu.test(b.testo))) {
      bersagli = bersagli.flatMap((b) => (/^\$(?:_|psitem)(?:\.(?:fullname|pspath|name))?$/iu.test(b.testo) ? (elencoInPipe.filtrata ? [] : elencoInPipe.bersagli) : [b]))
      dove2 = elencoInPipe.qui
    }
    /* P: le variabili del `for` con più valori: un bersaglio per valore */
    if (ctx.locali?.size) bersagli = bersagli.flatMap((b) => (b.sostituzione || b.gruppo !== undefined ? [b] : variantiDi(b.testo, ctx).map((t) => ({ ...b, testo: t }))))
    /* le graffe di POSIX (`rm -rf {..,x}`, `/home/{nino,altro}`): ogni scelta è un bersaglio (un livello, fino a 16 scelte) */
    if (!ctx.windows) bersagli = bersagli.flatMap((b) => {
      const g = /^([^{]*)\{([^{}]*,[^{}]*)\}(.*)$/su.exec(b.testo)
      return g && !b.sostituzione ? g[2].split(',').slice(0, 16).map((scelta) => ({ testo: `${g[1]}${scelta}${g[3]}`, sostituzione: false })) : [b]
    })
    for (const bersaglio of bersagli) {
      /* P: `Remove-Item (Join-Path A B)`: il gruppo si calcola a parole; ogni altro gruppo non si sa → carta */
      if (bersaglio.gruppo !== undefined) {
        const valore = calcolaGruppo(bersaglio.gruppo, ctx, dove2)
        if (valore === null) return TROPPO_ANNIDATO
        const motivo = perche(ctx.p.resolve(dove2 ?? ctx.cartella, valore), ctx, veriDi(ctx, realpathFn))
        if (motivo) return { percorso: ctx.p.resolve(dove2 ?? ctx.cartella, valore), perche: motivo }
        continue
      }
      /* `rm -rf "$(pwd)"` e simili: un bersaglio fatto solo di una sostituzione non si sa dove porta (Claude Code `CHANGELOG.md:2384`) */
      if (bersaglio.sostituzione && !/^\$\(\s*pwd\s*\)$|^`\s*pwd\s*`$/iu.test(bersaglio.testo)) {
        if (ricorsivo(parole)) return { percorso: bersaglio.testo, perche: 'sostituzione' }
        continue
      }
      /* dopo un `cd` che non si sa dove porta (`cd "$(mktemp -d)/../.."`, `cd $X`, `cd -`), un `rm -r` relativo cancella un posto che si
         sa solo mentre gira: carta, come per la sostituzione (si fallisce chiusi, mai un sì muto) */
      if (dove2 === null && ricorsivo(parole)) {
        const scritto = espanso(bersaglio.testo, ctx, null)
        if (scritto === null || !ctx.p.isAbsolute(ctx.windows ? discoLocale(scritto) : scritto)) return { percorso: bersaglio.testo, perche: 'sostituzione' }
      }
      /* 208 bis: `%~dp0`, `!X!` ignota, `%X:~a,b%` ignota in un comando ricorsivo di Windows: il posto si sa solo mentre gira → carta */
      if (ctx.windows && ricorsivo(parole) && CMD_CALCOLATO.test(bersaglio.testo)) {
        const scritto = espanso(bersaglio.testo, ctx, dove2)
        if (scritto === null || CMD_CALCOLATO.test(scritto)) return { percorso: bersaglio.testo, perche: 'sostituzione' }
      }
      /* 208 ter (ALTO-2): la variabile di un `for` di cmd i cui valori non si sanno */
      if (ctx.windows && ctx.forIgnoti?.size && ricorsivo(parole) && [...ctx.forIgnoti].some((n) => new RegExp(`\\$\\{?${n}(?![\\w])`, 'iu').test(bersaglio.testo))) {
        return { percorso: bersaglio.testo, perche: 'sostituzione' }
      }
      const assoluto = bersaglioAssoluto(bersaglio.testo, ctx, dove2)
      if (assoluto === null) continue
      const motivo = perche(assoluto, ctx, veriDi(ctx, realpathFn))
      if (motivo) return { percorso: assoluto, perche: motivo }
      /* 208 bis (MEDIA-4): un collegamento o una giunzione verso un posto critico, cancellato ATTRAVERSO il collegamento (`link/`, `link/.`,
         e `Remove-Item -Recurse link`, che in PowerShell 5.1 svuota la destinazione); `rm -rf link` toglie solo il collegamento */
      /* 208 ter (MEDIA-1): `del /s link`, `del /s link\*` svuotano la destinazione della giunzione (Microsoft Learn `del`, misurato):
         si segue il collegamento; con un glob in coda (`*.pyc`) no, e nessuna lettura del disco in più */
      const delRicorsivo = ctx.windows && (nome === 'del' || nome === 'erase') && ricorsivo(parole) && !GLOB.test(assoluto)
      if (/[\\/]\.?["']?$/u.test(bersaglio.testo) || nome === 'remove-item' || nome === 'ri' || delRicorsivo) {
        let vero = null
        try { vero = realpathFn(assoluto) } catch { /* non c'è: niente da seguire */ }
        const viaLink = typeof vero === 'string' && vero !== assoluto ? perche(vero, ctx, veriDi(ctx, realpathFn)) : null
        if (viaLink) return { percorso: vero, perche: viaLink }
      }
    }
  }
  return null
}

/** 208 bis: su Windows si giudica il testo grezzo e, se cmd lo legge diverso, anche come lo legge cmd (l'unione: mai una carta in meno). */
function giudica(testo, ctx, realpathFn, profondita, dove) {
  const grezzo = giudicaUnTesto(testo, ctx, realpathFn, profondita, dove)
  if (grezzo || !ctx.windows) return grezzo
  const comeCmd = comeLoLeggeCmd(testo)
  return comeCmd === testo ? null : giudicaUnTesto(comeCmd, ctx, realpathFn, profondita, dove)
}

/**
 * La cancellazione critica che il comando farebbe: `{ percorso, perche }` (`perche`: 'radice' | 'primo-livello' | 'telefono' |
 * 'cartella-del-telefono' | 'casa' | 'dati-dell-app' | 'tutti-i-progetti' | 'progetto' | 'sopra-il-progetto' | 'sostituzione' |
 * 'troppo-annidato', quest'ultimo con `percorso: null`), o `null`. Mai un'eccezione: un cancello non lancia.
 */
export function cancellazioneCritica(comando, { cartella, home = homedir(), piattaforma = process.platform, ambiente = process.env, realpathFn = realpathSync.native, progettiCritici = [] } = {}) {
  try {
    const testo = String(comando ?? '')
    if (testo.trim() === '' || (!sembraCancellare(testo) && !(piattaforma === 'win32' && sembraCancellare(comeLoLeggeCmd(testo))))) return null
    if (typeof cartella !== 'string' || cartella === '') return null
    /* K: un elenco di stringhe; altro = ignorato. Assente = come prima */
    const critici = Array.isArray(progettiCritici) ? progettiCritici.filter((x) => typeof x === 'string' && x !== '' && x !== cartella) : []
    const ctx = contesto({ cartella, home: typeof home === 'string' && home !== '' ? home : null, piattaforma, ambiente, progettiCritici: critici })
    if (ctx.home === null) ctx.home = ''
    return giudica(testo, ctx, realpathFn, 0, cartella)
  } catch {
    return null
  }
}
