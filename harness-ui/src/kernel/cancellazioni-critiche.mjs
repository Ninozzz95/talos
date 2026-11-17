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
 * ⛔ Non è un isolamento: un bersaglio scritto con una variabile che ha un valore che il server non sa dire, `xargs rm`,
 *   `[IO.Directory]::Delete` o un programma che cancella da sé non si vedono (0.2.3: una variabile VUOTA o IGNOTA davanti a «/» o «\»
 *   invece sì, è la radice: vedi `senzaLeVuoteInTesta`). È la rete di sicurezza di Claude Code, non un confine.
 * ⛔⛔ Sesto giro (13/11/2026, owner 18:49 «doppio controllo», giudice v1801): TALOS CHIEDE ALMENO OGNI VOLTA CHE CHIEDEVA LA 0.2.1, PER
 *   COSTRUZIONE. Quattro ROSSI di fila: una lettura più precisa del sottofondo toglieva una carta che la 0.2.1 dava. Ora la decisione
 *   della 0.2.1 viaggia FERMA dentro il prodotto: `fermo-0.2.1-5e9fdc1b9/cancellazioni-critiche.mjs` è il file del commit 5e9fdc1b9
 *   (desktop 0.2.1, SHA-256 254e06446eef4255d8ee85ead9e7e92f32be7f6bdced47d5067858ddf60c4354) con UN solo cambio del nono giro
 *   (14/11/2026, giudice v1880-v1881): l'ambiente letto una volta per chiamata invece che per ogni variabile e ogni bersaglio, solo nel
 *   modo di leggere, ogni risultato identico; SHA-256 di oggi 9484d89beaab932317aaffefe646d402242ade59c11162cc9d75a42c84ea1ea8. Importa
 *   solo `node:` (nessun modulo cambiato dalla 0.2.1). Non si tocca altro: una prova (`permessi-doppio-controllo.test.mjs`, FERMO-*) la
 *   confronta col commit, con la 0.2.1 delle prove più i cambi scritti (`tests/aiuto/cambi-della-copia-ferma.mjs`) e con l'impronta.
 *   `cancellazioneCritica` chiede se chiede la lettura nuova OPPURE la 0.2.1; il motivo è quello della lettura nuova
 *   quando chiede, altrimenti quello della 0.2.1. Come Codex (`codex-rs/shell-command/src/bash.rs:52`, `:260-272`: nel dubbio non si
 *   crede alla lettura) e Hermes (`tools/approval_detection.py:230`: ogni `rm -r` chiede), una lettura nuova non può togliere carte.
 */
import { realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
/* la decisione della 0.2.1, ferma: vedi la nota qui sopra. ⛔ Mai importarla da un altro posto né cambiarla oltre i cambi scritti del nono giro. */
import { cancellazioneCritica as decisioneDella021, dimenticaPercorsiVeri as dimenticaQuelliDella021 } from './fermo-0.2.1-5e9fdc1b9/cancellazioni-critiche.mjs'

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
  /* cura del ROSSO del revisore (giudice v1742): `wsl bash -c …`, `wsl -e sh -c …`: la shell dentro WSL parte nella cartella del
     comando (learn.microsoft.com/windows/wsl/basic-commands: `--distribution`, `--user`); `--cd` la cambia. Solo il testo, mai eseguito. */
  ['wsl', { valore: ['-d', '--distribution', '--distribution-id', '-u', '--user', '--cd', '--shell-type'], cartella: ['--cd'] }],
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
/*
 * ⛔ Settimo giro (13/11/2026, owner sì al giro breve, giudice v1823-v1824): UN TETTO UNICO DI LETTURE PER COMANDO. Ogni lettura di un
 *   testo (`giudicaUnTesto`), a ogni livello, in ogni caso e in ogni giro (`letturaNuova`), conta UNA volta in un contatore solo del
 *   comando; oltre il tetto la carta (`troppo-annidato`), mai il calcolo fino in fondo. Prima il tetto (256) valeva per livello e i casi
 *   dentro i casi si moltiplicavano: 8+8 `(cd x && npm i)` (il secondo gruppo in un `bash -c`) costava 2,8-3,8 s, 8+8+8 più di 100 s, e
 *   il cancello è sincrono (server fermo). Codex fa lo stesso con gli involucri (`is_dangerous_command.rs:35`, tetto 8; `:55-57`, oltre
 *   il tetto il comando è pericoloso). Il valore: oggi nessun comando senza carta fa più di 257 letture (misurato sulle 18.000 forme del
 *   revisore, sui gruppi, su `tetto.json` e `nuove.json`, W L A M: otto `cd` che possono non restare = 256, dentro `bash -c` 257); 300
 *   lascia posto agli involucri e alle letture in più e tiene la carta da nove `cd` (512 letture). Il caso peggiore si ferma a 301 letture.
 */
const TETTO_DELLE_LETTURE = 300
/*
 * ⛔ Ottavo giro (14/11/2026, owner «ottavo giro», giudice v1838-v1839): UN TETTO SUL LAVORO DEL COMANDO, a numero fisso (mai un tempo,
 *   mai un orologio). Il tetto delle letture conta quante volte un testo si rilegge, non quanto costa ogni lettura: ogni lettura rifà
 *   tutti i bersagli per tutti i valori del `for`, e nel cancello ogni bersaglio con la barra in coda chiede al disco il percorso vero
 *   (un percorso diverso per ogni caso: nessuna memoria lo salva). Il revisore del settimo giro ha misurato un comando onesto di 551
 *   caratteri (otto `(cd packages/x && npm ci)`, un `for` di 16 pacchetti con 6 cartelle) a 256 letture, senza carta, col cancello
 *   fermo 1,1-2,2 s; uno di 864 caratteri 10-17 s (la 0.2.1: 20-35 ms e 0,2-0,3 s). Ora ogni unità di lavoro conta in un contatore solo
 *   del comando (`ctx.conto.lavoro`), sommato su livelli, casi, giri e letture, mai azzerato (`conta`):
 *   - ogni lettura di un testo: `PESI.lettura`, più una unità ogni `PESI.caratteri` caratteri (ogni lettura scompone il testo intero);
 *   - ogni comando semplice guardato: `PESI.comando`;
 *   - ogni bersaglio guardato, dopo i valori del `for` e le graffe (un bersaglio per valore), e ogni posto di robocopy/rsync, `find`
 *     e `git clean`: `PESI.bersaglio`;
 *   - ogni percorso vero chiesto per seguire un collegamento: `PESI.realpath` (nel cancello è una lettura vera del disco, ~35 µs su
 *     Windows per un percorso che non c'è, misurato).
 *   Oltre il tetto la carta (`troppo-annidato`), subito: mai il calcolo fino in fondo, mai un errore. Codex fa lo stesso con un numero
 *   fisso (`is_dangerous_command.rs:35`, `MAX_DANGEROUS_COMMAND_WRAPPER_DEPTH = 8`; `:55-57` oltre il tetto il comando è pericoloso) e
 *   analizza solo i comandi di parole semplici (`bash.rs:25-29`); Hermes guarda ogni riga una volta (`approval_detection.py:228-231`).
 *   Il valore e i pesi sono misurati (rapporto dell'ottavo giro): sul PC un'unità costa 1-3,7 µs, quindi il lavoro della lettura nuova
 *   resta sotto ~37 ms; le forme che conosciamo senza carta (i cinque gruppi, 20 tipici, le 23.000 forme dei revisori) stanno sotto
 *   2.000 unità, otto `cd` che possono non restare con `rm -rf dist` 6.144, con `rm -rf dist/` 9.216; il comando da 551 caratteri
 *   chiede al primo caso (300.000 unità se andasse fino in fondo).
 */
const TETTO_DEL_LAVORO = 10000
const PESI = Object.freeze({ lettura: 2, caratteri: 64, comando: 1, bersaglio: 3, realpath: 12 })
/** Aggiunge il lavoro al contatore del comando: `true` se il comando è oltre il tetto (la carta). */
const conta = (ctx, unita) => (ctx.conto.lavoro += unita) > TETTO_DEL_LAVORO
/*
 * ⛔ Decimo giro (14/11/2026, owner 18:10 «strada sicura», giudice v1901-v1902): UN TETTO SUI CARATTERI ESPANSI DEL COMANDO. Le
 *   variabili assegnate nel testo si moltiplicano (`a=x…; b=$a$a…; c=$b$b…`): ogni livello moltiplica la lunghezza. Il tetto del lavoro
 *   conta le letture e i bersagli, non quanto è lunga una stringa costruita: 285 caratteri costruivano 63 milioni di caratteri (il
 *   cancello intero 1,65-4,27 s), e con qualche copia in più il valore passava la lunghezza massima di una stringa (V8: 2^30 - 25), la
 *   lettura si fermava con un errore e il cancello rispondeva «nessuna carta» (già nella 0.2.1). Ora ogni carattere che una variabile
 *   aggiunge (`espanso`, i valori del `for` nei bersagli, i pezzi `%X:a=b%` di cmd) si conta in `ctx.conto.espansi`, comune a tutto il
 *   comando come il lavoro (giri, letture, livelli), PRIMA di metterlo nella stringa: oltre il tetto la lettura si ferma e chiede
 *   (`troppo-complesso`). Il valore: 4 MiB (4.194.304), misurato (rapporto del decimo giro), con le variabili vere del processo:
 *   - le 25.644 forme dei due revisori del nono giro, i cinque gruppi onesti, i 13 comandi del telefono e i comandi di tempo
 *     dell'owner contano al massimo 43.513 caratteri;
 *   - il caso onesto più grande che abbiamo costruito, `export PATH="$PATH:…"` e otto `(cd x && npm i)`, rilegge il PATH in 256
 *     letture: 449.792 con un PATH di 1.757 caratteri. 4 MiB regge un PATH fino a 16.384 caratteri (con 1 MiB un PATH di Windows da
 *     4.100 avrebbe dato una carta in più);
 *   - sotto il tetto il cancello intero più lento che abbiamo trovato ci mette 79-98 ms (2 milioni di caratteri in un bersaglio dopo
 *     otto `cd`, su Windows); la forma da 285 caratteri ora chiede in 2-5 ms. Hermes fa lo stesso prima di leggere
 *   (`approval_detection.py:702-704`: oltre il tetto «fails closed»); Codex non dà il sì se l'albero ha un errore (`bash.rs:30-31`).
 */
const TETTO_DELL_ESPANSIONE = 1 << 22
const TRABOCCO_DELL_ESPANSIONE = Object.freeze({ trabocco: 'espansione' })
/** Aggiunge al conto del comando i caratteri che una variabile sta per mettere nella stringa; oltre il tetto ferma la lettura. */
const espande = (ctx, caratteri) => { if ((ctx.conto.espansi += caratteri) > TETTO_DELL_ESPANSIONE) throw TRABOCCO_DELL_ESPANSIONE }
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
  let nuda = true // senza apici né barre: può essere una parola riservata di bash
  const chiudiParola = () => {
    const tolta = haParola && nuda && parole.length === 0 && riservata(parola)
    if (haParola && !tolta) parole.push({ testo: parola, sostituzione: /^(?:\$\(.*\)|`.*`)$/su.test(parola) })
    parola = ''
    haParola = false
    nuda = true
  }
  /* giro unico: chi chiude col `;` lo dice (`puntoEVirgola`), perché cmd non separa lì (vedi `giudicaUnTesto`, il `cd` di cmd) */
  const chiudiComando = (puntoEVirgola = false) => {
    chiudiParola()
    if (parole.length) { if (daPipe) parole.dopoPipe = true; if (puntoEVirgola) parole.puntoEVirgola = true; if (salva) parole.salvaPrima = salva; salva = 0; comandi.push(parole) }
    parole = []
    daPipe = false
  }
  /*
   * giro piccolo dopo il controllore (13/11/2026): dove la cartella torna com'era, per chi legge con la regola di bash (vedi
   * `giudicaUnTesto`, `ctx.bash`): `( … )` è una sottoshell, e con un `&` da solo l'intera lista prima di lui gira in sottofondo
   * (gnu.org bash manual, «Lists of Commands», «Grouping Commands»). `salvaPrima`: quante cartelle si mettono da parte prima del
   * comando; `ripristinaDopo`: quante se ne riprendono dopo. Un `&` di `&&`, `>&`, `&>`, `|&` non manda niente in sottofondo.
   */
  let salva = 0
  let aperte = 0
  let inizioLista = 0
  /*
   * cura del ROSSO del revisore (13/11/2026): la PILA delle liste. Un `&` dentro `( … )` o `{ … }` manda in sottofondo solo la lista
   * di DENTRO: all'apertura si mette da parte la lista di fuori, alla chiusura si riprende (prima `(` e `{` non la azzeravano, e in
   * `cd src; cd .. && (npm run dev &) ; rm -rf *` la cartella tornava a `src`). Un gruppo fra graffe davanti a una pipe gira in una
   * sottoshell come `( … )` (gnu.org bash manual, «Pipelines», «Command Grouping»): `gruppo` è l'ultimo chiuso, [primo, ultimo].
   */
  const liste = []
  let gruppo = null
  const segna = (k, chiave) => { comandi[k][chiave] = (comandi[k][chiave] ?? 0) + 1 }
  /*
   * cura precisa del ROSSO della pila (13/11/2026; man7.org bash(1), «Compound Commands»): `if`, `case`, `while`, `until`, `for`,
   * `select` aprono una lista come `{` (chiusa da `fi`, `esac`, `done`), e la lista riparte a `then`, `do`, `else`, `elif` e alla `)` del
   * modello di un ramo di `case` (`ramo`: la prossima `)`, e una `(` davanti al modello, non sono una sottoshell; di nuovo dopo `;;`,
   * `;&`, `;;&`). Così in `cd .. && if make & then …` il sottofondo è solo `make`, e il `cd ..` resta.
   */
  const APRE = { if: 'fi', case: 'esac', while: 'done', until: 'done', for: 'done', select: 'done' }
  let ramo = false
  const riservata = (w) => {
    if (ramo && w !== 'esac') return false
    if (posix && w === '}') { confine('}'); return true } // R15: su POSIX la `}` è una parola riservata che chiude il gruppo (sotto Windows separa già)
    /* quinto giro: un composto chiuso (`fi`, `done`, `esac`) davanti a una pipe gira in una sottoshell come `( … )` («Pipelines»): `gruppo` */
    if (APRE[w]) { liste.push([APRE[w], inizioLista, comandi.length]); inizioLista = comandi.length; ramo = w === 'case' } else if (w === liste.at(-1)?.[0]) { const [, fuori, da] = liste.pop(); inizioLista = fuori; ramo = false; gruppo = comandi.length > da ? [da, comandi.length - 1] : null; return true } else if (/^(?:then|do|else|elif)$/u.test(w)) inizioLista = comandi.length
  }
  /* il carattere k è scritto se lo precedono barre in numero DISPARI (`\\&` è una barra scritta e un `&` vero; man7.org bash(1), QUOTING) */
  const scritto = (k) => { let n = 0; while (testo[k - n - 1] === '\\') n += 1; return n % 2 === 1 }
  const confine = (c, i) => {
    if (ramo && liste.at(-1)?.[0] === 'esac' && (c === '(' || c === ')')) { if (c === ')') { ramo = false; inizioLista = comandi.length } gruppo = null; return }
    if (c === ';' && liste.at(-1)?.[0] === 'esac' && /[;&]/u.test(testo[i + 1] ?? '')) ramo = true
    if (c === '(') { aperte += 1; salva += 1 } else if (c === ')' && aperte > 0) { aperte -= 1; if (salva > 0) salva -= 1; else if (comandi.length) segna(comandi.length - 1, 'ripristinaDopo') } else if (c === '&' && !/[&>|]/u.test(testo[i - 1] ?? '') && !scritto(i) && !(/[<;]/u.test(testo[i - 1] ?? '') && !scritto(i - 1)) && !/[&>]/u.test(testo[i + 1] ?? '')) {
      if (comandi.length > inizioLista) { comandi.at(-1).sfondo = true; segna(inizioLista, 'salvaPrima'); segna(comandi.length - 1, 'ripristinaDopo') }
      inizioLista = comandi.length
    } else if (c === '\n' || c === ';') inizioLista = comandi.length
    if (c === '(' || c === '{') { liste.push([c, inizioLista, comandi.length]); inizioLista = comandi.length; gruppo = null } else if ((c === ')' || c === '}') && liste.at(-1)?.[0] === (c === ')' ? '(' : '{')) {
      const [, fuori, da] = liste.pop()
      inizioLista = fuori
      gruppo = comandi.length > da ? [da, comandi.length - 1] : null
    } else gruppo = null
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
        nuda = nuda && dopo === '\n'
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
    if (c === "'" || c === '"') { apice = c; haParola = true; nuda = false; continue }
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
    /*
     * undicesimo giro: `@(…)`, `!(…)`, `+(…)`, `*(…)`, `?(…)` attaccati a un argomento sono un glob esteso di bash (extglob), non una
     * sottoshell: restano nella parola, e il confronto dei nomi, che non li sa leggere, chiede (vedi `globPrende`). In testa al comando
     * (`!(rm -rf ~)`) la parentesi resta una sottoshell.
     */
    if (c === '(' && haParola && parole.length > 0 && /[@!+*?]$/u.test(parola)) {
      let profondita = 0
      let j = i
      for (; j < testo.length; j += 1) {
        if (testo[j] === '(') profondita += 1
        else if (testo[j] === ')' && --profondita === 0) break
      }
      if (j < testo.length) { parola += testo.slice(i, j + 1); i = j; continue }
    }
    if (c === '#' && !haParola) { const a = testo.indexOf('\n', i); i = a === -1 ? testo.length : a - 1; continue }
    if (c === '|') {
      const oppure = testo[i + 1] === '|'
      const prima = comandi.length
      chiudiComando()
      if (oppure) i += 1
      else { daPipe = true; if (comandi.length > prima) comandi[prima].primaDiPipe = true; else if (gruppo) { segna(gruppo[0], 'salvaPrima'); segna(gruppo[1], 'ripristinaDopo') } }
      continue
    }
    if (c === '\n' || c === ';' || c === '&' || c === '(' || c === ')' || c === '{' && !haParola && /\s/u.test(testo[i + 1] ?? ' ')) { chiudiComando(c === ';'); confine(c, i); continue } // `{ cmd; }` è un gruppo, `{..,x}` una graffa
    if (!posix && (c === '{' || c === '}')) { chiudiComando(); confine(c, i); continue } // P: in PowerShell e cmd le graffe separano sempre (`& {Remove-Item …}`)
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
  /* dodicesimo giro (owner 13:44): macOS, dove APFS di serie non bada alle maiuscole (vedi `dove`) */
  const mac = piattaforma === 'darwin'
  const p = windows ? path.win32 : path.posix
  /* giro 2: la lettura del movimento di sempre (`X:` da solo non sposta, `cd` sposta) e la cartella ricordata di ogni disco */
  return { cartella, home, piattaforma, ambiente, windows, mac, p, progettiCritici, discoDaSolo: false, cdCambiaDisco: true, perDisco: new Map() }
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
  const trovato = ambienteDi(ctx).get(n)
  if (typeof trovato === 'string' && trovato !== '') return trovato
  /* giro piccolo dopo il controllore: `%ComSpec%` è cmd anche quando il cancello non ha la variabile (learn.microsoft.com, `cmd`) */
  return n === 'COMSPEC' && ctx.windows ? 'cmd.exe' : null
}

/**
 * Ottavo giro: l'ambiente come Map, letto UNA volta per giro (`ctx.ambiente` non si riassegna mai). Prima ogni variabile che il testo
 * non assegna rifaceva `Object.entries(process.env)`: ~160 µs a chiamata su Windows (misurato), e il cancello la pagava per ogni
 * bersaglio di ogni lettura. Come prima vale la PRIMA voce col nome giusto (su Windows senza badare alle maiuscole).
 */
function ambienteDi(ctx) {
  if (ctx.ambienteLetto) return ctx.ambienteLetto
  const voci = new Map()
  for (const [k, v] of Object.entries(ctx.ambiente ?? {})) { const n = ctx.windows ? k.toUpperCase() : k; if (!voci.has(n)) voci.set(n, v) }
  return (ctx.ambienteLetto = voci)
}

/*
 * ⛔ 0.2.3 (14/11/2026, giudice v1914-v1915): UNA VARIABILE VUOTA O IGNOTA DAVANTI A «/» O «\» È LA RADICE. La sonda del mutante K01
 *   del nono giro: `rm -rf "$VUOTA"/*` passava senza carta (qui e nella 0.2.1, `fermo-…/cancellazioni-critiche.mjs:384`: vuota = ignota =
 *   `null`, non si giudica), mentre bash legge `rm -rf /*`: una variabile non messa vale la stringa vuota (manuale di GNU Bash, «Shell
 *   Parameter Expansion»; `${X:?}` è la guardia apposta), e PowerShell dà `$null` a `$env:X` che non c'è, quindi `"$env:X\*"` è `\*`, la
 *   radice del disco. Il cancello non sa quale shell leggerà: le grafie di bash, cmd e PowerShell valgono su ogni sistema, e su POSIX la
 *   barra rovescia dopo la variabile è quella di PowerShell (che la legge come «/» anche su Linux e macOS).
 *   Quando una variabile, o più di fila, apre la parola ed è subito seguita da «/» o «\», si guarda che cosa si sa di lei:
 *   - VUOTA: il testo la assegna vuota (`V=`, `set V=`, `$v = ""`, `local v`) o l'ambiente la ha con valore vuoto, o è `$null`;
 *   - IGNOTA: il testo non le dà un valore in nessun modo e l'ambiente non la ha;
 *   - SCONOSCIUTA (NON è ignota): ha un valore che il server non sa dire. La assegna il testo con un valore calcolato (`D=$(mktemp -d)`)
 *     o con più valori (`for`), la legge un costrutto che non seguiamo (`read`, `mapfile`, `getopts`, `select`, `printf -v`, il `foreach`
 *     e i `param` di PowerShell, `-OutVariable`, `Set-Variable`: `legateNelTesto`), è un nome che la shell mette da sé (`$PWD`, `$_`,
 *     `$OSTYPE`, … `MESSE_DALLA_SHELL`), su Windows una che il sistema mette sempre (`%TEMP%`, `%SystemRoot%`: `MESSE_DA_WINDOWS`,
 *     anche quando l'ambiente passato al cancello non la ha), o l'ambiente le dà un valore che non è una stringa.
 *   Vuota o ignota: la parola si legge senza di lei, cioè dalla radice («/», o «\» che su Windows è la radice del disco), e la carta è
 *   quella di sempre (`radice`, `primo-livello`, …): nessun motivo nuovo. Sconosciuta: come prima (non si giudica). Le forme col valore di
 *   serie (`${X:-y}`, `${X:=y}`) e la guardia `${X:?}` restano come prima. Non cambia il tetto dell'espansione: togliere una variabile
 *   vuota non aggiunge caratteri, e ogni errore resta «troppo complesso». Codex chiede per ogni `rm -rf` (`is_dangerous_command.rs:141-142`);
 *   Claude Code chiede per un bersaglio calcolato (`CHANGELOG.md:2384`) e per `rm -rf` sui parametri posizionali (`:3481`).
 */
const VARIABILE_IN_TESTA = /^(?:\$\{env:([A-Za-z_]\w*)\}|\$env:([A-Za-z_]\w*)|\$\{([A-Za-z_]\w*)(?:%%?[^}]*|##?[^}]*|:\+[^}]*)?\}|\$([A-Za-z_]\w*)(?!\.)|%([A-Za-z_]\w*)%|!([A-Za-z_]\w*)!)/iu
/** I nomi che la shell mette da sé e che non sono mai vuoti (bash, PowerShell, cmd), in maiuscole. `$null` NON c'è: è vuota. */
const MESSE_DALLA_SHELL = new Set([
  'PWD', 'CD', '__CD__', 'HOME', 'USERPROFILE', 'HOMEDRIVE', 'COMSPEC', 'ERRORLEVEL', 'DATE', 'TIME', 'CMDCMDLINE', 'CMDEXTVERSION',
  'BASH', 'BASHPID', 'BASH_VERSION', 'HOSTNAME', 'HOSTTYPE', 'OSTYPE', 'MACHTYPE', 'PPID', 'UID', 'EUID', 'RANDOM', 'SECONDS', 'SHLVL',
  'LINENO', 'GROUPS', 'IFS', '_', 'PSITEM', 'ARGS', 'INPUT', 'THIS', 'MATCHES', 'PSHOME', 'PROFILE', 'HOST', 'PID', 'PSCMDLET',
  'MYINVOCATION', 'EXECUTIONCONTEXT', 'SHELLID', 'PSVERSIONTABLE', 'PSCULTURE', 'PSUICULTURE', 'ISWINDOWS', 'ISLINUX', 'ISMACOS',
  'ISCORECLR', 'TRUE', 'FALSE',
])
/** Le variabili che Windows mette sempre (anche quando l'ambiente passato al cancello non le ha): su Windows non sono mai «ignote». */
const MESSE_DA_WINDOWS = new Set([
  'SYSTEMROOT', 'WINDIR', 'SYSTEMDRIVE', 'TEMP', 'TMP', 'APPDATA', 'LOCALAPPDATA', 'PROGRAMFILES', 'PROGRAMDATA', 'PROGRAMW6432',
  'COMMONPROGRAMFILES', 'PUBLIC', 'ALLUSERSPROFILE', 'HOMEPATH', 'USERNAME', 'USERDOMAIN', 'COMPUTERNAME', 'OS', 'PATHEXT',
  'PROCESSOR_ARCHITECTURE', 'NUMBER_OF_PROCESSORS', 'PATH',
])
/** I nomi a cui il testo dà un valore con un costrutto che la lettura non segue (in maiuscole): per loro il valore non si sa. */
function legateNelTesto(testo) {
  const legate = new Set()
  const nomi = (pezzo, re = /^[A-Za-z_]\w*$/u) => { for (const w of pezzo.split(/[\s,]+/u)) if (re.test(w)) legate.add(w.replace(/^\$/u, '').toUpperCase()) }
  for (const m of testo.matchAll(/\b(?:read|mapfile|readarray)\b([^;&|<>\n(){}]*)/gu)) nomi(m[1])
  for (const m of testo.matchAll(/\b(?:getopts\s+\S+|select|printf\s+-v)\s+([A-Za-z_]\w*)/gu)) nomi(m[1])
  for (const m of testo.matchAll(/\bforeach\s*\(\s*\$([A-Za-z_]\w*)\s+in\b/giu)) nomi(m[1])
  for (const m of testo.matchAll(/\bparam\s*\(([^)]*)\)/giu)) nomi(m[1].replace(/\[[^\]]*\]/gu, ' '), /^\$[A-Za-z_]\w*$/u)
  for (const m of testo.matchAll(/(?:^|\s)-(?:outvariable|ov|pipelinevariable|pv|errorvariable|ev|warningvariable|wv|informationvariable|iv)(?::|\s+)["']?\+?([A-Za-z_]\w*)/giu)) nomi(m[1])
  for (const m of testo.matchAll(/\b(?:set-variable|new-variable|sv|nv)\s+(?:-name(?::|\s+))?["']?([A-Za-z_]\w*)/giu)) nomi(m[1])
  return legate
}
/** Vera se la variabile è VUOTA o IGNOTA (vedi sopra); falsa se ha un valore, anche uno che non si sa dire. */
function vuotaOIgnota(nome, ctx, dove) {
  const n = nome.toUpperCase()
  if (MESSE_DALLA_SHELL.has(n)) return false
  const v = valoreDi(nome, ctx, dove)
  if (v !== null) return v === ''
  const chiave = ctx.windows ? n : nome
  if (ctx.locali?.has(chiave)) return false
  const voce = ambienteDi(ctx).get(chiave)
  if (voce !== undefined) return voce === ''
  return !ctx.legate?.has(n) && !(ctx.windows && MESSE_DA_WINDOWS.has(n))
}
/** La parola senza le variabili vuote o ignote che la aprono, se subito dopo viene «/» o «\»; altrimenti la parola com'era. */
function senzaLeVuoteInTesta(parola, ctx, dove) {
  let resto = parola
  for (let m = VARIABILE_IN_TESTA.exec(resto); m; m = VARIABILE_IN_TESTA.exec(resto)) {
    if (!vuotaOIgnota(m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? m[6], ctx, dove)) return parola
    resto = resto.slice(m[0].length)
  }
  if (resto === parola || !/^[\\/]/u.test(resto)) return parola
  return ctx.windows ? resto : `/${resto.slice(1)}`
}

function espanso(parola, ctx, dove) {
  let ignoto = false
  let t = senzaLeVuoteInTesta(parola, ctx, dove)
  if (!ctx.windows) t = t.replace(/\\(.)/gsu, (_, c) => c) // su POSIX `\.\.` è `..`
  /* ⛔ decimo giro: ogni valore si conta (`espande`) PRIMA di entrare nella stringa; oltre il tetto la lettura si ferma */
  const sost = (re) => { t = t.replace(re, (tutto, nome) => { const v = valoreDi(nome, ctx, dove); if (v === null) { ignoto = true; return tutto } espande(ctx, v.length); return v }) }
  if (/^\$\((?:\s*pwd\s*)\)|^`\s*pwd\s*`/iu.test(t)) { if (dove === null) return null; espande(ctx, dove.length); t = t.replace(/^\$\((?:\s*pwd\s*)\)|^`\s*pwd\s*`/iu, () => dove) }
  if (t === '~' || /^~[\\/]/u.test(t)) { espande(ctx, ctx.home.length); t = ctx.home + t.slice(1) }
  else if (/^~[^\\/]+(?:[\\/]|$)/u.test(t)) {
    /* `~nino`: la casa di quell'utente; si sa solo se è la nostra */
    const [, utente, resto] = /^~([^\\/]+)(.*)$/su.exec(t)
    /* tredicesimo giro: su macOS come APFS (forma Unicode e maiuscole, `piegaDelMac`) */
    const piega = ctx.mac ? (x) => piegaDelMac(x.normalize('NFC')) : (x) => x.toLowerCase()
    if (ctx.home && piega(ctx.p.basename(ctx.home)) === piega(utente)) { espande(ctx, ctx.home.length); t = ctx.home + resto }
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
      const pezzo = v.slice(inizio, Math.max(inizio, fine))
      espande(ctx, pezzo.length)
      return pezzo
    })
    /* 208 ter (ALTO-1): `%CD:\progetto=%` (cmd `set /?`): ogni `da` diventa `a` senza badare alle maiuscole; `%X:*da=a%` fino al primo */
    t = t.replace(/%([A-Za-z_][\w]*):(\*?)([^%=]+)=([^%]*)%/gu, (tutto, nome, stella, da, a) => {
      const v = valoreDi(nome, ctx, dove)
      if (v === null) { ignoto = true; return tutto }
      const re = new RegExp(da.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), stella ? 'iu' : 'giu')
      /* ⛔ decimo giro: il valore e ogni `a` che entra al posto di un `da` si contano prima (`%X:a=…%` moltiplica come una variabile) */
      espande(ctx, v.length)
      if (!stella) return v.replace(re, () => { espande(ctx, a.length); return a })
      const m = re.exec(v)
      if (m) espande(ctx, a.length)
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
/*
 * ⛔ Uscita di riparazione (owner 12/11/2026): `/x/…` e `/mnt/x/…`, con UNA lettera, hanno DUE letture. Per Git Bash e WSL è il disco
 *   `x:`; per un programma nativo (PowerShell, cmd) è la cartella `\x` del disco corrente, cioè di quello della cartella della sessione:
 *   col progetto in `C:\T\lavori\progetto`, `Remove-Item -Recurse -Force /T/lavori/progetto` lo cancella, e si guardava un disco `T:`.
 *   Si giudica il comando intero nelle due letture (`cancellazioneCritica`): la prima è quella di sempre, e se il comando ha una di
 *   queste grafie (`ctx.senzaDisco`) e non è critico, lo si rilegge come lo legge il sistema (`ctx.comeIlSistema`: il percorso resta
 *   com'è, e `resolve` gli dà il disco della cartella). Critico se lo è in UNA delle due: mai una carta in meno di prima.
 */
function discoLocale(t, ctx) {
  const b = t.replace(/\//gu, '\\')
  const esteso = /^\\\\[?.]\\(?:UNC\\[^\\]+\\([A-Za-z])\$|([A-Za-z]:))(\\.*)?$/iu.exec(b)
  if (esteso) return `${esteso[1] ? `${esteso[1]}:` : esteso[2]}${esteso[3] ?? '\\'}`
  const amministrativa = /^\\\\[^\\?.][^\\]*\\([A-Za-z])\$(\\.*)?$/iu.exec(b)
  if (amministrativa) return `${amministrativa[1]}:${amministrativa[2] ?? '\\'}`
  const unix = /^\/(?:mnt\/)?([A-Za-z])(\/.*)?$/su.exec(t)
  if (unix) ctx.senzaDisco = true
  if (unix && !ctx.comeIlSistema) return `${unix[1]}:${unix[2] ?? '\\'}`
  return t
}

/*
 * ⛔ Uscita di riparazione, giro 2 (12/11/2026, revisore B: P3, P4, P5). Il DISCO su cui un comando lavora può cambiare dentro il comando,
 *   e le shell non sono d'accordo su come:
 *   - `X:` da solo cambia disco in cmd e in PowerShell; in una shell POSIX è un comando che non c'è, e non sposta niente;
 *   - `cd X:\altro` SENZA `/d` verso un altro disco in cmd NON sposta (cambia solo la cartella ricordata di quel disco: Microsoft
 *     Learn, `cd`), mentre in PowerShell e in una shell POSIX sposta.
 *   Il cancello non sa quale shell leggerà: giudica il comando nelle tre letture (`ctx.discoDaSolo`, `ctx.cdCambiaDisco`), ognuna col
 *   suo contesto nuovo, ed è critico se lo è in UNA. Le due letture in più si fanno solo se il comando ha uno dei due inneschi
 *   (`ctx.movimentoDubbio`): gli altri comandi costano come prima. Ogni disco ricorda la sua cartella (`ctx.perDisco`), come fa cmd.
 */
const discoDi = (p) => /^([A-Za-z]):/u.exec(String(p ?? ''))?.[1]?.toLowerCase() ?? null
/** La cartella dopo `X:` da solo: quella ricordata di quel disco, o la sua radice; sullo stesso disco non cambia niente. */
function dopoIlDisco(disco, cartella, ctx) {
  const lettera = disco.slice(0, 1).toLowerCase()
  const attuale = discoDi(cartella)
  if (attuale === lettera) return cartella
  if (attuale !== null) ctx.perDisco.set(attuale, cartella)
  return ctx.perDisco.get(lettera) ?? `${disco.slice(0, 1)}:\\`
}
/** Chi lascia un disco con `cd /d`, `pushd`, `popd`, `Set-Location` ne ricorda la cartella, come con `X:` da solo: cmd e PowerShell
 *  tengono una cartella corrente per disco, e `cd /d D:\x & C: & rd /s /q ..` torna dov'era, non alla radice di `C:`. Vale anche
 *  per chi va dove non si sa dire (`a` è `null`: un `popd` senza niente da riprendere, un `cd` verso una variabile ignota):
 *  dell'ultimo posto conosciuto di quel disco resta il ricordo. */
function ricordaIlDiscoLasciato(ctx, da, a) {
  const lasciato = discoDi(da)
  if (ctx.windows && lasciato !== null && discoDi(a) !== lasciato) ctx.perDisco.set(lasciato, da)
}
/** `X:rel` verso un disco che non è quello della cartella corrente: vale la cartella ricordata di quel disco, o la radice (Node
 *  guarderebbe la cartella di lavoro del PROCESSO, che il comando non eredita). Sullo stesso disco resta com'è. */
function sulSuoDisco(t, ctx, dove) {
  const m = /^([A-Za-z]):(?![\\/])(.*)$/su.exec(t)
  const qui = discoDi(dove ?? ctx.cartella)
  if (!m || qui === null || qui === m[1].toLowerCase()) return t
  return ctx.p.resolve(ctx.perDisco?.get(m[1].toLowerCase()) ?? `${m[1]}:\\`, m[2] === '' ? '.' : m[2])
}

/** Il bersaglio assoluto, a parole, senza il glob in coda («/sdcard/*» è «/sdcard»), o `null` se non si può dire. */
function bersaglioAssoluto(scritto, ctx, dove) {
  let t = espanso(scritto, ctx, dove)
  if (t === null || t === '') return null
  if (ctx.windows) t = sulSuoDisco(discoLocale(t, ctx), ctx, dove)
  /* giro 2 (revisore A, B3): su Windows una lettera sola non è uno schema: `C://Users//nino` è `C:\Users\nino` con le barre raddoppiate */
  if ((ctx.windows ? /^[a-z][a-z0-9+.-]+:\/\//iu : /^[a-z][a-z0-9+.-]*:\/\//iu).test(t)) return null
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
  /* settimo giro: l'ambiente si legge UNA volta per giro (con `process.env`, `Object.entries` costava ~1 ms a chiamata su Windows e
     si chiamava a ogni lettura: 8+8 col cancello intero 88 ms invece di 16, misurato col profilo) */
  const progetti = (ctx.progettiDellAmbiente ??= cartelleDeiProgetti(ctx.ambiente))
  const chiave = `${ctx.piattaforma}\u0000${ctx.cartella}\u0000${ctx.home}\u0000${progetti.join(';')}\u0000${ctx.progettiCritici.join(';')}`
  if (memoriaDeiVeri.has(chiave)) return memoriaDeiVeri.get(chiave)
  /* sesto giro: `noti` ricorda ogni risposta (anche `null`), per darla alla 0.2.1 ferma senza leggere il disco una seconda volta */
  const noti = new Map()
  const vero = (x) => { if (typeof x !== 'string' || x === '') return null; let v; try { v = realpathFn(x) } catch { v = null } noti.set(x, v); return v }
  const veri = { cartella: vero(ctx.cartella), home: vero(ctx.home), progetti: progetti.map((x) => [x, vero(x)]).flat().filter(Boolean),
    progettiCritici: ctx.progettiCritici.map((x) => [x, vero(x)]).flat().filter(Boolean), noti }
  if (memoriaDeiVeri.size >= TETTO_MEMORIA) memoriaDeiVeri.delete(memoriaDeiVeri.keys().next().value)
  memoriaDeiVeri.set(chiave, veri)
  return veri
}

/** Per le prove: la memoria dei percorsi veri si svuota. */
export function dimenticaPercorsiVeri() { memoriaDeiVeri.clear(); dimenticaQuelliDella021() }

/*
 * ⛔ Undicesimo giro (15/11/2026, owner «solo le stelle», giudice v1923-v1924): IL GLOB DI UN NOME SI CONFRONTA SENZA ESPRESSIONE
 *   REGOLARE. Prima le stelle diventavano `^.*.*…Z$`, che torna indietro contro il nome della cartella critica: `rm -rf ../************Z`
 *   (23 caratteri, progetto in una cartella di 19 lettere) teneva la lettura nuova oltre 1 s, e ogni stella in più costava circa ×3.
 *   Ora il confronto è a due puntatori (la stella si ricorda; quando un pezzo non prende, la stella prende un carattere in più):
 *   i passi sono al massimo (n+1)·(m+1), contati in `ctx.conto.glob`. Le stelle in fila sono una stella sola.
 *   - Lente del giudice (v1923): un glob che il confronto non sa leggere CHIEDE (`troppo-complesso`, via `GLOB_ILLEGGIBILE`), mai
 *     «nome diverso» (prima un glob che non diventava espressione tornava `null`, e `stessoNome` lo leggeva come un nome diverso).
 *   - Si legge come bash (manuale, «Pattern Matching»): `*`, `?`, `[…]` con `!` o `^` per negare, `]` per primo, gli intervalli (per
 *     punto di codice, come `globasciiranges`) e le classi POSIX (`[:alpha:]` e le altre 13), larghe come Unicode (prendere di più dà più
 *     carte, mai meno). Chiedono: un intervallo rovesciato, una classe sconosciuta, `[=c=]`, `[.c.]`, una classe in parentesi non chiuse,
 *     ogni barra rovesciata (sulle POSIX la lettura ha già tolto le fughe: quella che arriva viene dagli apici semplici) e i glob estesi
 *     (`@(…)`, `!(…)`, `+(…)`, `*(…)`, `?(…)`). Una `[` senza chiusura è un carattere, come in bash.
 *   - Né la stella né `?` né un insieme prendono una barra (su Windows anche quella rovesciata): il glob di un nome non attraversa le
 *     cartelle. Su Windows senza maiuscole, come prima (`windows`).
 *   Codex non legge mai una parola con `*?[` come letterale (`bash.rs:272`) e non dà il sì se il lettore ha un errore (`bash.rs:30`);
 *   pi confronta i glob con una libreria (`package-manager.ts:680`, `minimatch`), non con un'espressione fatta in casa.
 * ⛔ Dodicesimo giro (15/11/2026, owner 13:44, giudice v1948-v1949): LA LETTURA DEL MODELLO È LINEARE, SI FA UNA VOLTA E SI CONTA.
 *   Il revisore dell'undicesimo giro: `a=[[[…` (500 `[`) e `rm -rf ../$a$a…` (64 volte, 642 caratteri) tenevano il cancello 11,8-12,4 s
 *   (0.2.1: 27-29 ms). Ogni `[` senza chiusura riscorreva il glob fino in fondo (quadratico), il glob si rileggeva a ogni confronto, e
 *   la lettura restava fuori dal conto (`conto.glob` = 1).
 *   - Una `[` senza chiusura si decide una volta: le posizioni che una lettura dell'insieme ha già percorso fino in fondo senza chiusura,
 *     senza classi e senza errori si ricordano (`senzaFine`), e la lettura di un'altra `[` che ci arriva si ferma lì con la stessa
 *     risposta. Ogni posizione si percorre al più una volta: passi ≤ ~3 per carattere. Le risposte restano quelle dell'undicesimo giro.
 *   - Il modello si legge una volta per comando (`conto.modelli`, comune ai giri e ai confronti), anche quando chiede.
 *   - I passi della lettura e del confronto si contano in `conto.glob`; oltre `TETTO_DEL_GLOB` la lettura chiede (`troppo-complesso`,
 *     via `GLOB_ILLEGGIBILE`), mai «nome diverso». La lunghezza si conta PRIMA di costruire il modello. Come Hermes
 *     (`approval_detection.py:700-712`, il lavoro del lettore si limita prima di leggere; `:1550`, oltre il tetto si chiede).
 */
const STELLA = 0
const UNO = 1
const GLOB_ILLEGGIBILE = Object.freeze({ trabocco: 'glob' })
/*
 * Il tetto dei passi del glob di un comando (lettura dei modelli e confronti): 256 Ki passi (262.144), contati mentre si legge. Misurato
 * in questo giro: il glob più lungo delle prove e dei banchi senza carta (la forma da 642 caratteri, 32.000 `[`) ne usa 96.000; le
 * 4.000 stelle che prendono il nome della cartella ~12.000; il caso peggiore dei due puntatori contro un nome di 255 lettere con 1.000
 * stelle resta sotto. Al tetto la lettura si ferma in pochi millisecondi (vedi il rapporto del dodicesimo giro).
 */
const TETTO_DEL_GLOB = 1 << 18
const GLOB_ESTESO = /[@!+*?]\(/u
const CLASSI_POSIX = new Map(Object.entries({
  alnum: /[\p{Alphabetic}\p{Nd}]/u, alpha: /\p{Alphabetic}/u, ascii: /[\0-\x7f]/u, blank: /[\t\p{Zs}]/u, cntrl: /\p{Cc}/u, digit: /\p{Nd}/u,
  graph: /[^\p{White_Space}\p{Cc}\p{Cs}\p{Cn}]/u, lower: /\p{Lowercase}/u, print: /[^\p{Cc}\p{Cs}\p{Cn}\n\r\t\v\f]/u, punct: /[\p{P}\p{S}]/u,
  space: /\p{White_Space}/u, upper: /\p{Uppercase}/u, word: /[\p{Alphabetic}\p{Nd}_]/u, xdigit: /[0-9A-Fa-f]/u,
}))

/**
 * L'insieme `[…]` che comincia in `cs[i]`: `{ nega, voci, fine }`, o `null` se non si chiude (la `[` è un carattere). `lettura`: i passi
 * contati e `senzaFine`, le posizioni da cui (dopo il primo carattere) una lettura è già arrivata in fondo senza chiusura, classi né
 * errori: da lì la risposta è la stessa, e non si riscorre (dodicesimo giro).
 */
function insiemeDelGlob(cs, i, lettura) {
  let j = i + 1
  const nega = cs[j] === '!' || cs[j] === '^'
  if (nega) j += 1
  /* le voci si scrivono come dati (un carattere, `[da, a]`, la classe) e diventano funzioni solo se l'insieme si chiude */
  const voci = []
  let classe = false
  for (let primo = true; j < cs.length && (cs[j] !== ']' || primo); primo = false) {
    /* il segno si mette subito: se questa lettura si chiude o lancia, nessuna lettura dopo torna su queste posizioni (la prossima `[`
       comincia dopo la chiusura, e un errore ferma tutto il glob) */
    if (!primo) {
      if (lettura.senzaFine[j] === 1) { j = cs.length; break }
      lettura.senzaFine[j] = 1
    }
    if (++lettura.passi > lettura.resto) throw GLOB_ILLEGGIBILE // un passo, come `passoDellaLettura(lettura, 1)`, senza la chiamata
    const c = cs[j]
    if (c === '\\') throw GLOB_ILLEGGIBILE
    if (c === '[' && (cs[j + 1] === ':' || cs[j + 1] === '=' || cs[j + 1] === '.')) {
      const tipo = cs[j + 1]
      let k = j + 2
      while (k + 1 < cs.length && !(cs[k] === tipo && cs[k + 1] === ']')) k += 1
      passoDellaLettura(lettura, k - j)
      const nome = cs.slice(j + 2, k).join('')
      if (tipo !== ':' || k + 1 >= cs.length || !CLASSI_POSIX.has(nome)) throw GLOB_ILLEGGIBILE
      voci.push(CLASSI_POSIX.get(nome))
      classe = true
      j = k + 2
      continue
    }
    if (cs[j + 1] === '-' && j + 2 < cs.length && cs[j + 2] !== ']') {
      const fino = cs[j + 2]
      if (fino === '\\' || fino === '[') throw GLOB_ILLEGGIBILE
      const da = c.codePointAt(0)
      const a = fino.codePointAt(0)
      if (da > a) throw GLOB_ILLEGGIBILE
      voci.push([da, a])
      j += 3
      continue
    }
    voci.push(c)
    j += 1
  }
  if (j >= cs.length) {
    if (classe) throw GLOB_ILLEGGIBILE // `[[:alpha:]…` senza chiusura: chi legge come bash non è sicuro di come finisce
    return null
  }
  return insiemeChiuso(nega, voci, j, lettura)
}

/**
 * ⛔ Tredicesimo giro (16/11/2026, owner v1977, giudice v1979, lente v1952): UN INSIEME CHIUSO SI PROVA UNA VOLTA PER CARATTERE E OGNI
 *   VOCE PROVATA SI CONTA. Il revisore del dodicesimo giro: `a='*[b×4000]'` e `rm -rf ../$a` × 1.000 (cartella di 64 lettere) teneva il
 *   cancello 4,1-4,6 s su macOS e Windows (0.2.1: 0,30-0,39 s): il confronto provava le 4.000 voci per ognuna delle tre forme del
 *   carattere a ogni posizione, e il conto contava le posizioni, non le voci.
 *   - Le voci diventano dati senza doppioni: i caratteri in un `Set` (un intervallo `[b-b]` è il carattere), gli intervalli diversi in
 *     fila, le classi una volta (sono al più 14). Costruirlo costa un passo per voce, contato nella lettura.
 *   - La risposta per un carattere (nelle sue forme, con o senza maiuscole) si calcola una volta per comando (l insieme sta nel modello,
 *     in `conto.modelli`) e si ricorda in `risposte`; la prima volta costa forme × (1 + intervalli + classi) passi, contati PRIMA di
 *     provarle nello stesso tetto del glob: oltre, la lettura chiede (`troppo-complesso`), mai «nome diverso».
 *   Come Hermes, il lavoro del lettore sta sotto un tetto unico e oltre chiede (`approval_detection.py:696`, `:1548-1550`).
 */
function insiemeChiuso(nega, voci, fine, lettura) {
  passoDellaLettura(lettura, voci.length)
  const caratteri = new Set()
  const intervalli = []
  const visti = new Set()
  const classi = new Set()
  for (const v of voci) {
    if (typeof v === 'string') caratteri.add(v)
    else if (v instanceof RegExp) classi.add(v)
    else if (v[0] === v[1]) caratteri.add(String.fromCodePoint(v[0]))
    else if (!visti.has(`${v[0]}-${v[1]}`)) { visti.add(`${v[0]}-${v[1]}`); intervalli.push(v) }
  }
  return { nega, caratteri, intervalli, classi: [...classi], risposte: [new Map(), new Map()], fine }
}

/** Una forma `y` del carattere sta nell insieme? Un carattere, un intervallo per punto di codice (come `globasciiranges`), una classe. */
function nellInsieme(insieme, y) {
  if (insieme.caratteri.has(y)) return true
  const p = y.codePointAt(0)
  for (const [da, a] of insieme.intervalli) if (p >= da && p <= a) return true
  for (const classe of insieme.classi) if (classe.test(y)) return true
  return false
}

/** Conta `n` passi della lettura del modello; oltre quelli che restano sotto `TETTO_DEL_GLOB` la lettura chiede, subito. */
function passoDellaLettura(lettura, n) {
  /* tredicesimo giro: anche un conto di molti passi insieme si ferma al tetto più uno, come un passo solo */
  if (lettura.passi + n > lettura.resto) { lettura.passi = lettura.resto + 1; throw GLOB_ILLEGGIBILE }
  lettura.passi += n
}

/** Un glob di UN nome (`ni*`, `progett?`, `[pP]rog*`) in pezzi: `STELLA`, `UNO`, un carattere, un insieme. Lancia `GLOB_ILLEGGIBILE`. */
function leggiIlGlob(nome, lettura) {
  /* tredicesimo giro (lente v1952): un passo per carattere, contato tutto PRIMA di cominciare, paga il lavoro costante che ogni carattere
     costa nella preparazione (glob esteso, caratteri, segni) e nel suo giro qui sotto; le letture degli insiemi si contano a parte */
  passoDellaLettura(lettura, nome.length)
  if (GLOB_ESTESO.test(nome)) throw GLOB_ILLEGGIBILE
  const cs = Array.from(nome)
  lettura.senzaFine = new Uint8Array(cs.length + 1)
  const pezzi = []
  for (let i = 0; i < cs.length; i += 1) {
    const c = cs[i]
    if (c === '*') { if (pezzi.at(-1) !== STELLA) pezzi.push(STELLA) } else if (c === '?') pezzi.push(UNO)
    else if (c === '\\') throw GLOB_ILLEGGIBILE
    else if (c === '[') {
      /* tredicesimo giro, la prima chiamata della forma da 642 caratteri su Windows: se dalla seconda posizione dell insieme una lettura
         è già arrivata in fondo senza chiusura (`senzaFine`) e il primo carattere è una voce semplice (non `!`, `^`, `\`, una classe, un
         intervallo), `insiemeDelGlob` direbbe `null` dopo un passo: la stessa risposta, senza chiamarlo */
      const d = cs[i + 1]
      const e = cs[i + 2]
      if (lettura.senzaFine[i + 2] === 1 && d !== '!' && d !== '^' && d !== '\\' && e !== '-' && !(d === '[' && (e === ':' || e === '=' || e === '.'))) {
        passoDellaLettura(lettura, 1)
        pezzi.push(c)
        continue
      }
      const insieme = insiemeDelGlob(cs, i, lettura)
      if (insieme === null) pezzi.push(c)
      else { pezzi.push(insieme); i = insieme.fine }
    } else pezzi.push(c)
  }
  return pezzi
}

/**
 * Il modello del glob, letto UNA volta per comando (`conto.modelli`, anche la risposta «chiede») e contato in `conto.glob`: la
 * lunghezza prima di costruire, i passi veri durante; oltre `TETTO_DEL_GLOB` lancia `GLOB_ILLEGGIBILE` (la lettura chiede).
 */
function pezziDelGlob(nome, conto = null) {
  const modelli = conto ? (conto.modelli ??= new Map()) : null
  const letto = modelli?.get(nome)
  if (letto === GLOB_ILLEGGIBILE) throw GLOB_ILLEGGIBILE
  if (letto !== undefined) return letto
  const lettura = { passi: 0, senzaFine: null, resto: conto ? TETTO_DEL_GLOB - (conto.glob ?? 0) : Infinity }
  try {
    const pezzi = leggiIlGlob(nome, lettura)
    modelli?.set(nome, pezzi)
    return pezzi
  } catch (errore) {
    if (errore === GLOB_ILLEGGIBILE) modelli?.set(nome, GLOB_ILLEGGIBILE)
    throw errore
  } finally {
    if (conto) conto.glob = (conto.glob ?? 0) + lettura.passi
  }
}

/** Il carattere `x` nelle sue forme (su Windows senza maiuscole: com'è, minuscolo, maiuscolo). */
const formeDi = (x, senzaMaiuscole) => (senzaMaiuscole ? [x, x.toLowerCase(), x.toUpperCase()] : [x])

/**
 * Un pezzo che non è la stella prende il carattere `x`? Mai una barra (`barra`: anche quella rovesciata). Un insieme risponde una volta
 * per carattere (`risposte`); la prima volta `conta` i passi delle voci da provare prima di provarle (tredicesimo giro).
 */
function pezzoPrende(pezzo, x, senzaMaiuscole, barra, conta) {
  if (typeof pezzo === 'string') return formeDi(x, senzaMaiuscole).some((y) => y === pezzo || (senzaMaiuscole && y === pezzo.toLowerCase()))
  if (x === '/' || (barra && x === '\\')) return false
  if (pezzo === UNO) return true
  const risposte = pezzo.risposte[senzaMaiuscole ? 1 : 0]
  let dentro = risposte.get(x)
  if (dentro === undefined) {
    const forme = formeDi(x, senzaMaiuscole)
    conta(forme.length * (1 + pezzo.intervalli.length + pezzo.classi.length))
    /* Reviewer finding of round 13 (17/11/2026): without capitals the gate does not know which shell will read the set, so it takes
       the more careful answer. A plain set takes the character when ONE of its forms is inside; a negated set takes it when one
       of its forms is OUTSIDE (`[!W]` takes `w` in a shell that minds capitals: Git Bash, macOS, Android). Before, the negated
       set denied the answer of the plain one and let `rm -rf ../[!P]rogetto` pass with no card. */
    dentro = pezzo.nega ? !forme.every((y) => nellInsieme(pezzo, y)) : forme.some((y) => nellInsieme(pezzo, y))
    risposte.set(x, dentro)
  }
  return dentro
}

/**
 * I caratteri del nome `vero`, presi una volta per comando (`conto.nomi`) e contati la prima volta (tredicesimo giro, lente v1952: anche
 * questo è un giro sul nome).
 */
function caratteriDel(vero, conto, conta) {
  const nomi = conto ? (conto.nomi ??= new Map()) : null
  const presi = nomi?.get(vero)
  if (presi !== undefined) return presi
  conta(vero.length)
  const s = Array.from(vero)
  nomi?.set(vero, s)
  return s
}

/**
 * Il glob di UN nome prende il nome `vero`? Due puntatori, senza tornare indietro oltre l'ultima stella: al massimo (n+1)·(m+1) passi,
 * aggiunti a `conto.glob`, più le voci degli insiemi provate la prima volta e i caratteri del nome. `senzaMaiuscole`: le lettere senza
 * maiuscole (Windows, macOS, la memoria condivisa del telefono); `barra`: anche la barra rovesciata separa (Windows e macOS, come prima).
 * Lancia `GLOB_ILLEGGIBILE` (la lettura chiede).
 */
function globPrende(glob, vero, senzaMaiuscole, conto = null, barra = senzaMaiuscole) {
  const p = pezziDelGlob(glob, conto)
  let i = 0
  let j = 0
  let stella = -1
  let segno = 0
  let passi = 0
  /* dodicesimo giro: i passi del confronto stanno sotto il tetto del glob del comando, insieme alla lettura */
  const resto = conto ? TETTO_DEL_GLOB - (conto.glob ?? 0) : Infinity
  const conta = (n) => { if (passi + n > resto) { passi = resto + 1; throw GLOB_ILLEGGIBILE } passi += n }
  try {
    const s = caratteriDel(vero, conto, conta)
    while (i < s.length) {
      if ((passi += 1) > resto) throw GLOB_ILLEGGIBILE
      if (p[j] === STELLA) { stella = j; segno = i; j += 1 } else if (j < p.length && pezzoPrende(p[j], s[i], senzaMaiuscole, barra, conta)) { i += 1; j += 1 } else if (stella !== -1 && s[segno] !== '/' && !(barra && s[segno] === '\\')) {
        segno += 1
        i = segno
        j = stella + 1
      } else return false
    }
    while (p[j] === STELLA) j += 1
    return j === p.length
  } finally {
    if (conto) conto.glob = (conto.glob ?? 0) + passi
  }
}

/**
 * Due nomi della stessa cartella, a parole: uguali (su Windows senza maiuscole), il nome corto 8.3 di Windows (`NINO~1` per `nino`,
 * `PROGRA~1` per `Program Files`: le prime sei lettere senza spazi e punti, poi `~N`), o un glob che lo prende (`ni*`).
 */
function stessoNome(scritto, vero, ctx, senzaMaiuscole = ctx.windows) {
  /* tredicesimo giro (sicurezza, già nella 0.2.1): su macOS i due nomi si leggono nella stessa forma Unicode (NFC) e senza maiuscole
     come APFS (vedi `piegaDelMac`); Windows e Linux restano come prima */
  if (ctx.mac) { scritto = scritto.normalize('NFC'); vero = vero.normalize('NFC') }
  const piega = ctx.mac ? piegaDelMac : (x) => x.toLowerCase()
  const a = senzaMaiuscole ? piega(scritto) : scritto
  const c = senzaMaiuscole ? piega(vero) : vero
  if (a === c) return true
  if (ctx.windows) {
    const corto = /^([^~\s.]{1,6})~\d+$/u.exec(a)
    if (corto && c.replace(/[\s.]/gu, '').startsWith(corto[1])) return true
  }
  /* undicesimo giro: due puntatori, e un glob che non si sa leggere chiede (vedi `globPrende`); dodicesimo: su macOS senza maiuscole;
     tredicesimo (sicurezza, già nella 0.2.1): le maiuscole come il nome, così anche la memoria condivisa del telefono (prima solo
     Windows e macOS: `Documents/W*` non prendeva `w`); la barra rovesciata separa come prima, solo su Windows e macOS */
  return GLOB.test(scritto) || GLOB_ESTESO.test(scritto) ? globPrende(scritto, vero, senzaMaiuscole, ctx.conto, ctx.windows || ctx.mac) : false
}

/**
 * Tredicesimo giro (sicurezza, già nella 0.2.1; reperto del revisore del dodicesimo giro): il nome come lo confronta APFS nella variante
 * di serie, che non bada né alla forma Unicode (Apple, APFS Guide FAQ) né alle maiuscole, con il confronto completo: `ß`, `ẞ` e `SS`
 * sono lo stesso nome, come `casefold` di Python (Hermes `tools/skills_hub_models.py:336`; NFC come `tools/file_operations.py:1197`).
 * Minuscolo, maiuscolo, minuscolo: il passo in maiuscolo apre `ß` in `SS` e le legature. Prende al più qualche nome in più (`ı` e `i`):
 * una carta in più, mai una in meno.
 */
const piegaDelMac = (x) => x.toLowerCase().toUpperCase().toLowerCase().normalize('NFC')

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
  /* dodicesimo giro (owner 13:44, già nella 0.2.1): su macOS APFS di serie non bada alle maiuscole, e `rm -rf /Users/TIZIO` cancella
     la casa `/Users/tizio`; i nomi si confrontano senza maiuscole come su Windows (Hermes confronta il comando in minuscole,
     `approval_detection.py:211`). Un disco APFS con le maiuscole dà al più una carta in più, mai una in meno. */
  const condivisa = !ctx.windows && !ctx.mac && nellaMemoriaCondivisa(a.nomi) && nellaMemoriaCondivisa(C.nomi)
  const senzaMaiuscole = ctx.windows || ctx.mac || condivisa
  const volume = condivisa ? (a.nomi[1] === 'emulated' ? 3 : 2) : 0
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
  const disco = ctx.windows ? discoLocale(t, ctx) : t
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
/* ⛔ decimo giro: il comando che la lettura nuova non riesce a leggere fino in fondo (il tetto dell'espansione, un errore qualsiasi) */
const TROPPO_COMPLESSO = Object.freeze({ percorso: null, perche: 'troppo-complesso' })

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
    /* ⛔ decimo giro: ogni valore del `for` messo nel bersaglio si conta prima (`espande`), come ogni variabile */
    uscite = uscite.flatMap((u) => (u.search(re) === -1 ? [u] : valori.map((v) => u.replace(re, () => { espande(ctx, v.length); return v })))).slice(0, 16)
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
  const prende = (nome) => tutti || globPrende(maschera, nome, ctx.windows, ctx.conto)
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

/*
 * `scelte`, `eventi` (quinto giro, 13/11/2026: la regola del sottofondo può solo AGGIUNGERE carte): ogni punto dove la regola di bash
 * dice che un `cd` NON resta (una cartella ripresa dopo una sottoshell, un sottofondo o una pipe; un `cd` saltato in una pipe o in
 * sottofondo) ha un nome (`r<comando>.<k>`, `c<comando>`). Se il nome sta in `scelte` il `cd` resta; se no la regola vale e il nome
 * va in `eventi` (solo se la cartella cambia davvero). `conTuttiICasi` rilegge il testo con ogni combinazione.
 */
function giudicaUnTesto(testo, ctx, realpathFn, profondita, dove, scelte = null, eventi = null) {
  /* ⛔ settimo giro: oltre il tetto unico di letture del comando (`TETTO_DELLE_LETTURE`) la carta, a qualunque livello */
  if ((ctx.conto.letture += 1) > TETTO_DELLE_LETTURE) return TROPPO_ANNIDATO
  /* ⛔ ottavo giro: ogni lettura scompone il testo intero, e il lavoro conta nel tetto del comando (`TETTO_DEL_LAVORO`) */
  if (conta(ctx, PESI.lettura + Math.floor(testo.length / PESI.caratteri))) return TROPPO_ANNIDATO
  /* ⛔ oltre il tetto si fallisce CHIUSI (Codex `is_dangerous_command.rs:35-58`): un testo che sembra cancellare e che non si guarda fino in fondo è una carta */
  if (profondita > TETTO_ANNIDAMENTO) return sembraCancellare(testo) ? TROPPO_ANNIDATO : null
  /* P: `[IO.Directory]::Delete(…)`, `(Get-Item X).Delete($true)`: il parser non li segue, si fallisce chiusi */
  if (CANCELLAZIONE_DI_DOTNET.test(testo)) return TROPPO_ANNIDATO
  let cartella = dove
  const pila = []
  let precedente = null
  let elencoInPipe = null // P: ciò che `gci X | % { … }` dà a `$_`
  const rileggi = (t, dentro = cartella) => giudica(t, ctx, realpathFn, profondita + 1, dentro)
  /*
   * ⛔ Giro unico della riparazione (12/11/2026, revisori B e C, giudice 19:59): il testo che una shell DETTA PER NOME eseguirà si
   *   legge con la regola di QUELLA shell. In PowerShell (`cd` è `Set-Location`) e in bash `cd X:\altro` sposta anche di disco: la
   *   lettura di cmd (P4) lì dava la carta «cancella il progetto» a `powershell -Command "cd K:\build; Remove-Item -Recurse *"`, e
   *   nominava un posto che non si cancella. Il testo di `cmd /c` torna alla regola della lettura in corso (`ctx.cdDelGiro`), anche
   *   dentro PowerShell o bash: `powershell -c "cmd /c 'cd K:\x && rd /s /q .'"` cancella il progetto e resta visto.
   */
  const rileggiCon = (cdCambiaDisco, t, dentro, bash = false) => {
    const era = ctx.cdCambiaDisco
    const eraBash = ctx.bash
    ctx.cdCambiaDisco = cdCambiaDisco
    ctx.bash = bash // il testo che riceve bash per nome (R15, 13/11/2026: anche fuori da Windows)
    try { return rileggi(t, dentro) } finally { ctx.cdCambiaDisco = era; ctx.bash = eraBash }
  }
  /* giro piccolo dopo il controllore: con la regola di bash, la cartella messa da parte prima di una sottoshell o di una lista in
     sottofondo (`comandiSemplici`, `salvaPrima`) torna dopo di lei (`ripristinaDopo`) */
  const daParte = []
  let daRiprendere = 0
  /* giro unico: in cmd il `;` non separa: `cd X:\…; Remove-Item …` è un `cd` verso «X:\…; Remove-Item …», che fallisce, e ciò che
     segue fino al primo `&`, `|` o a capo non parte (misurato con cmd.exe, 12/11/2026). Vale per la lettura di cmd del `cd` qui sotto. */
  let ingoiato = false
  /* C: il corpo di un heredoc è testo; si rilegge solo quello che riceve una shell */
  const { testo: senzaCorpi, corpi } = ctx.windows ? { testo, corpi: [] } : separaHeredoc(testo)
  for (const corpo of corpi) { const trovata = rileggi(corpo); if (trovata) return trovata }
  for (const [n, comando] of comandiSemplici(senzaCorpi, !ctx.windows).entries()) {
    if (conta(ctx, PESI.comando)) return TROPPO_ANNIDATO // ottavo giro: ogni comando guardato è lavoro
    if (ctx.bash) {
      for (let k = 0; daRiprendere > 0 && daParte.length; daRiprendere -= 1, k += 1) {
        const ripresa = daParte.pop()
        if (ripresa === cartella || scelte?.has(`r${n}.${k}`)) continue // il caso «il cd resta»
        eventi?.add(`r${n}.${k}`)
        cartella = ripresa
      }
      for (let k = 0; k < (comando.salvaPrima ?? 0); k += 1) daParte.push(cartella)
      daRiprendere = comando.ripristinaDopo ?? 0
    }
    if (ingoiato) { ingoiato = comando.puntoEVirgola === true; continue }
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
    if (COMANDI_CHE_SPOSTANO.has(nome)) {
      /* giro piccolo dopo il controllore: in bash un `cd` in una pipe gira in una sottoshell («Pipelines»); e un `cd /x/…` di Git Bash
         chiuso da un `&` da solo va in sottofondo in bash (e in PowerShell 7): chi viene dopo resta dov'era */
      if (((ctx.bash && (comando.primaDiPipe || comando.dopoPipe)) || (ctx.windows && comando.sfondo && /^\/(?:mnt\/)?[A-Za-z](?:\/|$)/u.test(argomentoDelCd(parole, ctx) ?? ''))) && !scelte?.has(`c${n}`)) { eventi?.add(`c${n}`); continue }
      if (nome === 'pushd' || nome === 'push-location') pila.push(cartella)
      const nuova = cartellaDopo(argomentoScelto(argomentoDelCd(parole, ctx), ctx, n, scelte, eventi), ctx, cartella)
      /* giro 2 (P4): `cd X:\altro` senza `/d` verso un altro disco: in cmd la cartella NON cambia (`rd /s /q .` resta il progetto) */
      /* giro unico: un disco letto alla maniera di Git Bash e di WSL (`cd /c/x`, `cd /mnt/c/x`) non è un altro disco per cmd (per cmd è
         la cartella `\c\x` del disco corrente), quindi lì la regola di cmd non c'entra: `cd /c/tmp && rm -rf *` gira in Git Bash */
      if (ctx.windows && (nome === 'cd' || nome === 'chdir') && discoDi(nuova) !== null && discoDi(cartella) !== null && discoDi(nuova) !== discoDi(cartella)
        && !parole.some((w, k) => k > 0 && /^\/d$/iu.test(w.testo)) && !/^\/(?:mnt\/)?[A-Za-z](?:\/|$)/u.test(argomentoDelCd(parole, ctx) ?? '')) {
        ctx.movimentoDubbio = true
        if (!ctx.cdCambiaDisco) { if (comando.puntoEVirgola) ingoiato = true; else ctx.perDisco.set(discoDi(nuova), nuova); continue }
      }
      ricordaIlDiscoLasciato(ctx, cartella, nuova)
      cartella = nuova
      continue
    }
    /* giro 2 (P3): `X:` da solo è un cambio di disco (cmd, PowerShell): ciò che viene dopo senza disco sta lì */
    if (ctx.windows && parole.length === 1 && /^[A-Za-z]:$/u.test(parole[0].testo)) {
      ctx.movimentoDubbio = true
      if (ctx.discoDaSolo) cartella = dopoIlDisco(parole[0].testo, cartella, ctx)
      continue
    }
    if (nome === 'popd' || nome === 'pop-location') { const lasciata = cartella; cartella = pila.length ? pila.pop() : null; ricordaIlDiscoLasciato(ctx, lasciata, cartella); continue }
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
        const trovata = rileggiCon(true, conPosizionali(parole[k].testo, parole.slice(k + 1).map((w) => w.testo)), qui, true)
        if (trovata) return trovata
        continue
      }
      /* P: `bash <<< '…'` */
      const h = parole.findIndex((w, j) => j > 0 && w.testo.startsWith('<<<'))
      if (h > 0) {
        const stringa = parole[h].testo === '<<<' ? parole[h + 1]?.testo : parole[h].testo.slice(3)
        if (stringa) { const trovata = rileggiCon(true, stringa, qui, true); if (trovata) return trovata }
        continue
      }
      /* P: `echo '…' | bash`, `printf … | sh`: si rilegge il testo; un'altra fonte nella pipe di una shell non si sa → carta se il testo cancella */
      if (comando.dopoPipe && prima?.length) {
        const fonte = nomeDelComando(prima[0].testo)
        if (fonte === 'echo' || fonte === 'printf') {
          const trovata = rileggiCon(true, prima.slice(1).filter((w) => !/^-[neE]+$/u.test(w.testo)).map((w) => w.testo).join(' '), qui, true)
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
        const trovata = rileggiCon(ctx.cdDelGiro, [...(attaccato ? [attaccato[1]] : []), ...parole.slice(j + 1).map((w) => w.testo)].join(' '), qui)
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
      if (corpo) { const trovata = rileggiCon(true, corpo, dentro); if (trovata) return trovata }
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
      if (conta(ctx, PESI.bersaglio)) return TROPPO_ANNIDATO
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
        if (conta(ctx, PESI.bersaglio)) return TROPPO_ANNIDATO
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
        if (conta(ctx, PESI.bersaglio)) return TROPPO_ANNIDATO
        const daRadice = /^:(?:\/|\([^)]*\btop\b[^)]*\))(.*)$/su.exec(p)
        const assoluto = daRadice ? (daRadice[1] ? bersaglioAssoluto(daRadice[1], ctx, radice) : radice) : bersaglioAssoluto(p, ctx, dentro)
        const motivo = assoluto === null ? null : perche(assoluto, ctx, veriDi(ctx, realpathFn))
        if (motivo && (motivo !== 'progetto' || (spostato && doppia))) return { percorso: assoluto, perche: motivo }
      }
      continue
    }
    if (!COMANDI_CHE_CANCELLANO.has(nome)) continue
    /* giro 2: un `rm` con le opzioni unite alla POSIX (`-rf`, `-fr`, `--recursive`) gira in Git Bash o in WSL, non in PowerShell
       (dove `rm -rf` è un errore): serve a `cancellazioneCritica` per scegliere quale lettura di `/x/…` nominare sulla carta */
    ctx.allaPosix = nome === 'rm' && parole.some((w, k) => k > 0 && /^-(?:[A-Za-z]*[rR][A-Za-z]*f[A-Za-z]*|[A-Za-z]*f[A-Za-z]*[rR][A-Za-z]*|-recursive|-force|-no-preserve-root)$/u.test(w.testo))
      && !parole.some((w, k) => k > 0 && /^-(?:rec|fo|lit|pat|con|whatif)/iu.test(w.testo))
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
      /* ⛔ ottavo giro: ogni bersaglio, uno per valore del `for` e per scelta delle graffe, è lavoro del comando */
      if (conta(ctx, PESI.bersaglio)) return TROPPO_ANNIDATO
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
        if (scritto === null || !ctx.p.isAbsolute(ctx.windows ? discoLocale(scritto, ctx) : scritto)) return { percorso: bersaglio.testo, perche: 'sostituzione' }
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
        if (conta(ctx, PESI.realpath)) return TROPPO_ANNIDATO // ottavo giro: nel cancello è una lettura vera del disco
        try { vero = realpathFn(assoluto) } catch { /* non c'è: niente da seguire */ }
        const viaLink = typeof vero === 'string' && vero !== assoluto ? perche(vero, ctx, veriDi(ctx, realpathFn)) : null
        if (viaLink) return { percorso: vero, perche: viaLink }
      }
    }
  }
  return null
}

/*
 * ⛔ Quinto giro (13/11/2026, giudice v1776, owner 16:33 «solo domande in più»): LA REGOLA DEL SOTTOFONDO PUÒ SOLO AGGIUNGERE CARTE.
 *   Tre ROSSI di fila avevano la stessa radice: la regola di bash (un `cd` in sottofondo, in una sottoshell o in una pipe non resta)
 *   leggeva male una `&` (dentro `${…}`, `$(…)`, `$[…]`, dopo una barra, in un `case`) e TOGLIEVA una carta che la 0.2.1 dava. Ora per
 *   ogni `cd` che la regola giudica «non resta» la cartella si calcola nei DUE casi (resta / non resta), in ogni combinazione, e la carta
 *   arriva se ALMENO UNO cade in un posto critico: nessun ramo decide «niente carta» sulla sola lettura del sottofondo, e R15 resta preso.
 *   Il prezzo: dove la regola leggeva giusto e il `cd` davvero non resta (`cd .. | true; rm -rf *` da `src`), la carta c'è come nella
 *   0.2.1. Oltre `TETTO_DELLE_LETTURE` letture DEL COMANDO (settimo giro: un tetto solo, sommato su tutti i livelli, non più 256 per
 *   livello) si fallisce chiusi (carta), come Codex (`bash.rs:52`: un `&` non è mai una parola semplice).
 *   Ogni lettura riparte dalle variabili di prima (`D=…`, `for`, le cartelle dei dischi): un caso non lascia niente al caso dopo.
 *   Sostituisce la rete chiusa del giro 2 (`RETE_DEL_SOTTOFONDO`, il testo letto anche senza la regola dove compariva `case`, `if`,
 *   `while`, `until`, `\&`, `<&`): quella lettura è il caso «ogni `cd` resta», che qui c'è sempre (misurato: 0 risposte diverse con e
 *   senza la rete su 20.320 forme per tre sistemi).
 */
const fotografia = (ctx) => ({ locali: ctx.locali && new Map(ctx.locali), forIgnoti: ctx.forIgnoti && new Set(ctx.forIgnoti), perDisco: new Map(ctx.perDisco) })
const rimetti = (ctx, f) => { ctx.locali = f.locali && new Map(f.locali); ctx.forIgnoti = f.forIgnoti && new Set(f.forIgnoti); ctx.perDisco = new Map(f.perDisco) }
/*
 * ⛔ Sesto giro (13/11/2026, F1 del quarto ROSSO): dopo una lettura nei due casi le variabili tengono i valori di TUTTI i casi, non
 *   quelli della prima lettura. `cd src; eval 'cd .. & X=$PWD'; rm -rf "$X"`: in un caso X è `src`, nell'altro il progetto, e il
 *   comando dopo l'eval li guarda tutti e due (`variantiDi` per un bersaglio, `argomentoScelto` per un `cd`). Un valore che un caso non
 *   sa (`[]`) non toglie quelli che gli altri casi sanno; al più 16 valori. Le cartelle dei dischi (`perDisco`) restano quelle della
 *   prima lettura, come prima (limite: solo la lettura di cmd le usa, e lì la regola del sottofondo non c'è).
 */
function unione(fotografie) {
  if (fotografie.length === 1) return fotografie[0]
  let locali = null
  for (const f of fotografie) {
    for (const [nome, valori] of f.locali ?? []) {
      locali ??= new Map()
      const ora = locali.get(nome)
      if (ora === undefined) { locali.set(nome, [...valori]); continue }
      for (const v of valori) if (!ora.includes(v) && ora.length < 16) ora.push(v)
    }
  }
  let forIgnoti = null
  for (const f of fotografie) for (const nome of f.forIgnoti ?? []) (forIgnoti ??= new Set()).add(nome)
  return { locali, forIgnoti, perDisco: fotografie[0].perDisco }
}
/** Un `cd "$X"` con più valori (dopo `unione`): il primo, e ogni altro è un caso (`v<comando>.<i>`) che `conTuttiICasi` legge. */
function argomentoScelto(scritto, ctx, n, scelte, eventi) {
  if (typeof scritto !== 'string' || !ctx.locali?.size) return scritto
  const varianti = variantiDi(scritto, ctx)
  if (varianti.length < 2) return scritto
  for (let i = 1; i < varianti.length; i += 1) if (scelte?.has(`v${n}.${i}`)) return varianti[i]
  for (let i = 1; i < varianti.length; i += 1) if (varianti[i] !== varianti[0]) eventi?.add(`v${n}.${i}`)
  return varianti[0]
}
/*
 * ⛔ Sesto giro (F2 del quarto ROSSO): una `&` DENTRO `${…}` non spezza niente. Per bash la graffa che chiude è «the first `}` not
 *   escaped by a backslash or within a quoted string, and not within an embedded arithmetic expansion, command substitution, or
 *   parameter expansion» (bash(1), Parameter Expansion, letta il 13/11/2026). La lettura di sempre chiude `${` alla prima `}`, anche
 *   `\}`: in `echo ${x/\}/&} cd progetto && rm -rf "$PWD"` vedeva un `cd progetto` che bash non esegue (per bash è un solo `echo`).
 *   Qui si scrive il testo con quelle `&` al posto di un `_`, e `conTuttiICasi` lo legge IN PIÙ: una carta in una delle due letture è
 *   una carta (la lettura di sempre resta, e con lei la carta falsa F09). Ciò che sta in `$(…)` dentro `${…}` resta com'è.
 */
function senzaECommercialiNelleGraffe(testo) {
  if (!testo.includes('${') || !testo.includes('&')) return testo
  const n = testo.length
  let fuori = ''
  let cambiato = false
  let doppie = false
  let i = 0
  /* `$( … )` (anche `$(( … ))`) da `j`: l'indice dopo la `)` che chiude, a parole (le virgolette dentro non si contano) */
  const dopoLaParentesi = (j) => { let prof = 0; for (; j < n; j += 1) { if (testo[j] === '\\') { j += 1; continue } if (testo[j] === '(') prof += 1; else if (testo[j] === ')' && (prof -= 1) === 0) return j + 1 } return n }
  while (i < n) {
    const c = testo[i]
    if (c === '\\') { fuori += testo.slice(i, i + 2); i += 2; continue }
    if (c === "'" && !doppie) { const j = testo.indexOf("'", i + 1); const fine = j === -1 ? n : j + 1; fuori += testo.slice(i, fine); i = fine; continue }
    if (c === '"') { doppie = !doppie; fuori += c; i += 1; continue }
    if (c !== '$' || testo[i + 1] !== '{') { fuori += c; i += 1; continue }
    let prof = 1
    let virgolette = null
    let j = i + 2
    fuori += '${'
    while (j < n && prof > 0) {
      const d = testo[j]
      if (virgolette === "'") { fuori += d; j += 1; if (d === "'") virgolette = null; continue }
      if (d === '\\') { fuori += testo.slice(j, j + 2); j += 2; continue }
      if (virgolette === '"') { fuori += d; j += 1; if (d === '"') virgolette = null; continue }
      if (d === "'" || d === '"') { virgolette = d; fuori += d; j += 1; continue }
      if (d === '$' && testo[j + 1] === '(') {
        /* dentro `$( … )` una `&` da sola manda davvero in sottofondo e resta; un `${…}` lì dentro si legge con la stessa regola */
        const fine = dopoLaParentesi(j + 1)
        const corpo = testo.slice(j + 2, Math.max(j + 2, fine - 1))
        const letto = senzaECommercialiNelleGraffe(corpo)
        if (letto !== corpo) cambiato = true
        fuori += `$(${letto}${testo.slice(j + 2 + corpo.length, fine)}`
        j = fine
        continue
      }
      if (d === '$' && testo[j + 1] === '{') { prof += 1; fuori += '${'; j += 2; continue }
      if (d === '}') prof -= 1
      if (d === '&') { fuori += '_'; cambiato = true; j += 1; continue }
      fuori += d
      j += 1
    }
    i = j
  }
  return cambiato ? fuori : testo
}
/*
 * Le letture IN PIÙ di un testo per bash: quella con le `&` delle graffe tolte e, se il testo ha barre, la stessa sul testo come lo
 * riceve una shell da dentro le virgolette doppie (`sh -c "echo \${x/\\}/&} cd src; rm -rf ."`: `\$`, `\\`, `\"` e `` \` `` perdono la
 * barra, POSIX «Double-Quotes»), solo quando lì c'è una `&` dentro `${…}`. Vengono PRIMA della lettura di sempre: se una chiede, il
 * motivo è il suo, il più preciso (`echo ${x//\}/&} cd src && rm -rf ../*` cancella la madre, non il progetto).
 */
function lettureInPiu(testo) {
  const altre = []
  const senza = senzaECommercialiNelleGraffe(testo)
  if (senza !== testo) altre.push(senza)
  if (testo.includes('\\')) {
    const comeLaRiceve = testo.replace(/\\([$`"\\])/gu, (_, c) => c)
    const senzaLei = comeLaRiceve === testo ? comeLaRiceve : senzaECommercialiNelleGraffe(comeLaRiceve)
    if (senzaLei !== comeLaRiceve && !altre.includes(senzaLei)) altre.push(senzaLei)
  }
  return altre
}
function conTuttiICasi(testo, ctx, realpathFn, profondita, dove) {
  const altre = ctx.bash ? lettureInPiu(testo) : []
  if (altre.length === 0) return casiDiUnTesto(testo, ctx, realpathFn, profondita, dove)
  const prima = fotografia(ctx)
  const finali = []
  for (const t of [...altre, testo]) {
    rimetti(ctx, prima)
    const trovata = casiDiUnTesto(t, ctx, realpathFn, profondita, dove)
    if (trovata) return trovata
    finali.push(fotografia(ctx))
  }
  /* la lettura di sempre prima: i suoi valori vengono primi, e le cartelle dei dischi sono le sue */
  rimetti(ctx, unione([finali.at(-1), ...finali.slice(0, -1)]))
  return null
}
function casiDiUnTesto(testo, ctx, realpathFn, profondita, dove) {
  const prima = fotografia(ctx)
  const eventi = new Set()
  const trovata = giudicaUnTesto(testo, ctx, realpathFn, profondita, dove, null, eventi)
  if (trovata || eventi.size === 0) return trovata
  const finali = [fotografia(ctx)]
  const visti = new Set()
  const coda = [[new Set(), eventi]]
  try {
    while (coda.length) {
      const [scelte, nati] = coda.shift()
      for (const nome of nati) {
        const altre = new Set(scelte).add(nome)
        const chiave = [...altre].sort().join(' ')
        if (visti.has(chiave)) continue
        visti.add(chiave)
        rimetti(ctx, prima)
        const loro = new Set()
        const caso = giudicaUnTesto(testo, ctx, realpathFn, profondita, dove, altre, loro)
        if (caso) return caso
        finali.push(fotografia(ctx))
        coda.push([altre, loro])
      }
    }
    return null
  } finally { rimetti(ctx, unione(finali)) }
}

/** 208 bis: su Windows si giudica il testo grezzo e, se cmd lo legge diverso, anche come lo legge cmd (l'unione: mai una carta in meno). */
function giudica(testo, ctx, realpathFn, profondita, dove) {
  const grezzo = conTuttiICasi(testo, ctx, realpathFn, profondita, dove)
  if (grezzo || !ctx.windows) return grezzo
  const comeCmd = comeLoLeggeCmd(testo)
  if (comeCmd === testo) return null
  /* giro piccolo dopo il controllore: la lettura di cmd non ha le sottoshell né il sottofondo di bash (`ctx.bash`) */
  const eraBash = ctx.bash
  ctx.bash = false
  try { return conTuttiICasi(comeCmd, ctx, realpathFn, profondita, dove) } finally { ctx.bash = eraBash }
}

/**
 * La cancellazione critica che il comando farebbe: `{ percorso, perche }` (`perche`: 'radice' | 'primo-livello' | 'telefono' |
 * 'cartella-del-telefono' | 'casa' | 'dati-dell-app' | 'tutti-i-progetti' | 'progetto' | 'sopra-il-progetto' | 'sostituzione' |
 * 'troppo-annidato' | 'troppo-complesso', questi ultimi due con `percorso: null`), o `null`. Mai un'eccezione: un cancello non lancia.
 * ⛔ Decimo giro: ogni errore dentro la lettura (anche il tetto dell'espansione, `TETTO_DELL_ESPANSIONE`) è 'troppo-complesso', mai `null`.
 * ⛔ Sesto giro: questa è la lettura NUOVA. Il cancello chiama `cancellazioneCritica` (più sotto), che la mette insieme alla 0.2.1 ferma.
 */
let ultimeLetture = 0 // per le prove soltanto (`__perLeProve.letture`): le letture del comando appena giudicato
let ultimoLavoro = 0 // per le prove soltanto (`__perLeProve.lavoro`): il lavoro contato del comando appena giudicato
let ultimiEspansi = 0 // per le prove soltanto (`__perLeProve.espansi`): i caratteri espansi contati del comando appena giudicato
let ultimiPassiDelGlob = 0 // per le prove soltanto (`__perLeProve.globPassi`): i passi dei confronti dei glob del comando appena giudicato
function letturaNuova(comando, { cartella, home = homedir(), piattaforma = process.platform, ambiente = process.env, realpathFn = realpathSync.native, progettiCritici = [] } = {}) {
  /* settimo e ottavo giro: UN conto per comando, comune a tutti i giri, i livelli e i casi: le letture (`TETTO_DELLE_LETTURE`) e il
     lavoro (`TETTO_DEL_LAVORO`) */
  const conto = { letture: 0, lavoro: 0, espansi: 0, glob: 0 }
  try {
    const testo = String(comando ?? '')
    if (testo.trim() === '' || (!sembraCancellare(testo) && !(piattaforma === 'win32' && sembraCancellare(comeLoLeggeCmd(testo))))) return null
    if (typeof cartella !== 'string' || cartella === '') return null
    /* K: un elenco di stringhe; altro = ignorato. Assente = come prima */
    const critici = Array.isArray(progettiCritici) ? progettiCritici.filter((x) => typeof x === 'string' && x !== '' && x !== cartella) : []
    /* Ogni lettura ha un contesto NUOVO: un giro ci scrive le sue variabili (`D=…`), e non devono arrivare al giro dopo. */
    const visto = { grafia: false, movimento: false }
    /* 0.2.3: i nomi a cui il testo dà un valore che non seguiamo (`read d`, `foreach ($d in …)`): mai «ignoti» (vedi `vuotaOIgnota`) */
    const legate = legateNelTesto(testo)
    const giro = (comeIlSistema, shell) => {
      const ctx = contesto({ cartella, home: typeof home === 'string' && home !== '' ? home : null, piattaforma, ambiente, progettiCritici: critici })
      if (ctx.home === null) ctx.home = ''
      ctx.comeIlSistema = comeIlSistema
      ctx.discoDaSolo = shell !== 'posix'
      ctx.cdCambiaDisco = ctx.cdDelGiro = shell !== 'cmd'
      ctx.perDisco = new Map()
      ctx.conto = conto
      ctx.legate = legate
      /* R15 (13/11/2026, giudice v1757 f, owner 12:25): fuori da Windows il comando lo esegue una shell POSIX, con le sue regole del
         sottofondo, delle sottoshell e delle pipe (`cd /x & rm -rf *` cancella la cartella del comando) */
      ctx.bash = !ctx.windows
      const trovata = giudica(testo, ctx, realpathFn, 0, cartella)
      if (ctx.senzaDisco) visto.grafia = true
      if (ctx.movimentoDubbio) visto.movimento = true
      return trovata ? { trovata, allaPosix: ctx.allaPosix === true } : null
    }
    /* le letture del movimento (vedi `dopoIlDisco`): quella di sempre, e le altre due solo se il comando ha un innesco */
    const leggi = (comeIlSistema) => giro(comeIlSistema, 'posix') ?? (visto.movimento ? giro(comeIlSistema, 'cmd') ?? giro(comeIlSistema, 'powershell') : null)
    const comeGitBash = leggi(false)
    /* 12/11/2026, le due letture di `/x/…` (vedi `discoLocale`): solo se il comando ha una di quelle grafie */
    if (!visto.grafia) return comeGitBash?.trovata ?? null
    const comeSistema = leggi(true)
    /* giro 2 (limite 2 del revisore C): la carta di un'azione che non si annulla nomina il posto che verrà cancellato DAVVERO. Se
       tutte e due le letture sono critiche vale quella del sistema (`Remove-Item /T/progetto` è `C:\T\progetto`, non `T:\progetto`),
       tranne per un `rm` scritto alla POSIX (`rm -rf /c/…`), che gira in Git Bash o in WSL: lì `/c` è il disco. */
    if (comeSistema && comeGitBash) return comeGitBash.allaPosix ? comeGitBash.trovata : comeSistema.trovata
    return (comeSistema ?? comeGitBash)?.trovata ?? null
  } catch {
    /* ⛔ decimo giro: FALLISCE CHIUSA. Il tetto dell'espansione, una stringa troppo lunga, un ambiente illeggibile, qualunque errore:
       un comando che la lettura non sa leggere fino in fondo chiede (prima un errore qui era `null`, nessuna carta, e la cancellazione
       scritta dopo passava). Hermes `approval_detection.py:702-704`, Codex `bash.rs:30-31`, Claude Code `CHANGELOG.md:4699`. */
    return TROPPO_COMPLESSO
  } finally {
    ultimeLetture = conto.letture
    ultimoLavoro = conto.lavoro
    ultimiEspansi = conto.espansi
    ultimiPassiDelGlob = conto.glob
  }
}

/** Il contesto della terna come lo fa `letturaNuova` (stessi valori di serie): per chiedere a `veriDi` i percorsi veri già ricordati. */
function contestoDellaTerna({ cartella, home = homedir(), piattaforma = process.platform, ambiente = process.env, progettiCritici = [] }) {
  const critici = Array.isArray(progettiCritici) ? progettiCritici.filter((x) => typeof x === 'string' && x !== '' && x !== cartella) : []
  const ctx = contesto({ cartella, home: typeof home === 'string' && home !== '' ? home : null, piattaforma, ambiente, progettiCritici: critici })
  if (ctx.home === null) ctx.home = ''
  return ctx
}

/*
 * ⛔⛔ Sesto giro (owner 18:49 «doppio controllo», giudice v1801): la carta c'è se la dà la lettura nuova OPPURE la 0.2.1 ferma.
 *   - Il motivo: quello della lettura nuova se chiede (il più preciso), altrimenti quello della 0.2.1. La 0.2.1 si legge solo se la
 *     nuova tace: per un comando che chiede il prezzo resta quello di prima.
 *   - ⛔ Decimo giro (giudice v1901), l'ordine: la copia ferma si salta SOLO quando la lettura nuova ha già dato la carta (anche
 *     «troppo complesso»): così le carte restano almeno quelle della 0.2.1 (carte(testa) ⊇ carte(0.2.1)), e un comando che la lettura
 *     nuova ferma al tetto non paga i secondi della copia ferma. Quando la nuova tace, la ferma si consulta come prima, dopo.
 *   - Nessuna lettura del disco in più (condizione di Performance): le due letture hanno un `realpath` comune che legge ogni percorso UNA
 *     volta per comando, e la 0.2.1 riceve i percorsi veri della terna (cartella, casa, progetti) dalla memoria della lettura nuova
 *     (`veriDi`, `noti`), così il disco si legge una volta per terna come prima.
 *   - Stessa firma e stessi valori di sempre (la CLI e il telefono non cambiano niente): `{ percorso, perche }` o `null`, mai un'eccezione.
 */
function unaCartaSeUnaChiede(nuova, ferma) {
  return function cancellazioneCritica(comando, opzioni = {}) {
    try {
      const o = opzioni ?? {}
      const realpathFn = typeof o.realpathFn === 'function' ? o.realpathFn : realpathSync.native
      const letti = new Map()
      const unaVolta = (p) => {
        if (!letti.has(p)) { try { letti.set(p, { valore: realpathFn(p) }) } catch (errore) { letti.set(p, { errore }) } }
        const r = letti.get(p)
        if ('errore' in r) throw r.errore
        return r.valore
      }
      const diQuella = nuova(comando, { ...o, realpathFn: unaVolta })
      if (diQuella) return diQuella
      let noti = null
      const perLaFerma = (p) => {
        if (noti === null) { try { noti = veriDi(contestoDellaTerna(o), unaVolta).noti ?? new Map() } catch { noti = new Map() } }
        return noti.has(p) ? noti.get(p) : unaVolta(p)
      }
      return ferma(comando, { ...o, realpathFn: perLaFerma })
    } catch {
      /* ⛔ decimo giro: anche qui si fallisce chiusi, mai `null` da un errore */
      return TROPPO_COMPLESSO
    }
  }
}

export const cancellazioneCritica = unaCartaSeUnaChiede(letturaNuova, decisioneDella021)

/** Per le prove soltanto: le due letture da sole e il modo in cui si mettono insieme (nessun valore nuovo per chi chiama). */
export const __perLeProve = Object.freeze({ letturaNuova, della021: decisioneDella021, unaCartaSeUnaChiede, TETTO_DELLE_LETTURE, letture: () => ultimeLetture, TETTO_DEL_LAVORO, PESI, lavoro: () => ultimoLavoro, TETTO_DELL_ESPANSIONE, espansi: () => ultimiEspansi, globPrende, globPassi: () => ultimiPassiDelGlob, TETTO_DEL_GLOB })
