/**
 * git-service.mjs — W1-05 (05/09). Lo stato Git di una sessione: **status,
 * stage, unstage, commit, ramo**. Ledger: `.claude/LEDGER-W1-05-GIT-SERVICE-2026-09-05.md`.
 *
 * Serve a W1-06, la Review a **due sorgenti dichiarate**: «Ultimo giro
 * agente» viene dagli eventi, «Non committato» viene da qui. Le due non si
 * mescolano mai, e questo file risponde solo della seconda.
 *
 * ⛔⛔⛔ IL REMOTO — F6-2 (27/09/2026), che RISCRIVE il PIN del 05/09 («`push` non esiste in questo file»). Owner, 26-27/09
 * (memoria `decisioni-owner-f6-github-26-09`, punti 2 e 16-23): recupera, scarica e invia esistono, e valgono queste regole,
 * che `tests/git-service.test.mjs` pinna leggendo il sorgente:
 *   · `push` compare in UN solo posto (`invia`), sempre con `--porcelain`, MAI `--force`/`-f`/`--force-with-lease`/`--mirror`/
 *     `--delete`: un ramo indietro rispetto al remoto si RIFIUTA per nome (`GIT_BEHIND`), non si spinge; il remoto e il ramo si
 *     scrivono nella risposta, e la conferma (remoto + ramo) sta nella scheda, prima del clic — mai dall'agente;
 *   · nessuna richiesta nel terminale (`GIT_TERMINAL_PROMPT=0`, GitHub Desktop `lib/git/authentication.ts:5-9`): le credenziali
 *     le dà il gestore del sistema (su Windows Git Credential Manager, che se serve apre la SUA finestra — punto 17);
 *   · il recupero parte solo col clic (punto 18) e si può FERMARE (punto 23); scarica e invia no: hanno un tempo massimo
 *     (`TIMEOUT_RETE_MS`) oltre il quale si fermano da sole e lo dicono, e i lock che il nostro processo ucciso ha lasciato si
 *     tolgono (Hermes `apps/desktop/electron/gitlock.ts:1-20`: git non li ripulisce mai da solo);
 *   · scarica come GitHub Desktop (`lib/git/pull.ts:115-135`): se `pull.ff` tace si passa `--ff`; `pull.rebase` vale sempre;
 *     niente `--autostash` (punto 20): i file che il download sovrascriverebbe si dicono per nome (`GIT_WORKTREE_DIRTY`) e la
 *     scheda offre «Metti da parte e scarica»;
 *   · l'esito si legge da un formato per macchine — `push --porcelain` (flag ` `/`+`/`-`/`*`/`!`/`=`, git-push(1) 2.55),
 *     `rev-list --left-right --count` — mai dall'inglese di git (regola di F6-1);
 *   · `--` davanti al remoto e al ramo, e un remoto che comincia per `-` non esiste (GitHub Desktop `pull.ts:47-51`).
 *
 * ═══════════════════════════════════════════════════════════════════════
 * LA RICERCA CHE HA CAMBIATO IL DISEGNO (fonti + data, tutte del 05/09/2026)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 1. ⛔ `git status` si legge SEMPRE con `-z` — git-scm.com/docs/git-status,
 *    letto il 05/09/2026: «Without the `-z` option, pathnames with "unusual"
 *    characters are quoted as explained for the configuration variable
 *    `core.quotePath`». MISURATO su git 2.55.0.windows.3: senza `-z`
 *    `àccento.txt` arriva come `"\303\240ccento.txt"` (ottale, fra
 *    virgolette) e `con spazio.txt` fra virgolette. Con `-z`: byte grezzi,
 *    nessun escape da disfare. Su un progetto italiano non è un caso limite.
 *
 * 2. ⛔ Nel formato `-z` una RINOMINA cambia forma e **ordine** — stessa
 *    pagina: «the `->` is omitted from rename entries and the field order is
 *    reversed (e.g. `from -> to` becomes `to` `from`)». MISURATO: senza `-z`
 *    → `R  vecchio.txt -> nuovo.txt`; con `-z` → `R  nuovo.txt<NUL>vecchio.txt`.
 *    Un parser che non lo sa mostra ogni rinomina AL CONTRARIO.
 *
 * 3. ⭐ Perché **v1** e non `--porcelain=v2` (la domanda era aperta nel brief).
 *    Stessa pagina: «Version 1 porcelain format is similar to the short
 *    format, but is **guaranteed not to change in a backwards-incompatible
 *    way** between Git versions or based on user configuration. This makes it
 *    ideal for parsing by scripts.» Per v2 la stessa garanzia NON è scritta;
 *    dice solo che gli header sono estensibili e che «Parsers should ignore
 *    headers they don't recognize». ⇒ v1 è la scelta con la promessa scritta,
 *    e v2 non porterebbe niente che ci serva: i suoi campi in più sono modi,
 *    oggetti e punteggio di somiglianza, che la Review non mostra.
 *    ⛔ E v2 NON risolve la rinomina: MISURATO, anche lì l'ordine è
 *    `<path><sep><origPath>`, cioè di nuovo «prima il DOVE, poi il DA».
 *
 * 4. ⛔⛔⛔ **`git commit -- <percorsi>` NON committa quello che è in STAGE.**
 *    git-scm.com/docs/git-commit, `--only`, letto il 05/09/2026: «Make a
 *    commit by taking the **updated working tree contents** of the paths
 *    specified on the command line, disregarding any contents that have been
 *    staged for other paths. This is the default mode of operation of git
 *    commit if any paths are given on the command line». MISURATO: messo in
 *    stage `v1-STAGED`, poi cambiato il file in `v2-WORKTREE`, poi
 *    `git commit -F msg -- a.txt` ⇒ nel commit c'è **`v2-WORKTREE`**.
 *    ⇒ Due conseguenze opposte, ed entrambe contano:
 *      ⭐ BUONA — un percorso esplicito **non trascina** ciò che un'altra
 *        sessione ha messo in stage: MISURATO, `altro.txt` è rimasto in stage
 *        e fuori dal commit. È la cura vera del difetto «due sessioni, stessa
 *        cartella, intrecciano i commit», ed è git stesso a garantirla.
 *      ⛔ CATTIVA — se il file è cambiato DOPO lo stage, finisce nel commit
 *        la versione nuova, cioè **non quella che la Review ha mostrato**.
 *        Silenziosa. Per questo `commit()` **rifiuta** quel caso per nome
 *        (`GIT_WORKTREE_DIFFERS`) invece di committare la cosa sbagliata.
 *
 * 5. ⛔⛔ La magia dei pathspec **sopravvive a `--`**, e scavalca lo scoping.
 *    MISURATO: da una sottocartella, `git add -- :/` ha messo in stage
 *    **l'intero repository** (`:/` = "dalla radice del repo"), e
 *    `:(exclude)…` filtra a piacere. La cura è `--literal-pathspecs` —
 *    git-scm.com/docs/git, letto il 05/09/2026: «Treat pathspecs literally
 *    (i.e. no globbing, no pathspec magic)». MISURATO: con quel flag `:/`
 *    diventa un nome di file letterale che non esiste e git rifiuta.
 *    ⇒ Ogni comando di questo file lo porta, SEMPRE, anche in lettura.
 *
 * 6. ⛔⛔ L'indice è CONDIVISO con l'owner e con le altre sessioni, e
 *    `git status` di suo **scrive**: git-scm.com/docs/git, letto il
 *    05/09/2026 — «this will prevent `git status` from refreshing the index
 *    as a side effect. This is useful for processes running in the background
 *    which do not want to cause lock contention». ⇒ tutto ciò che LEGGE porta
 *    `--no-optional-locks`: un pannello Review che si aggiorna non deve
 *    prendersi `index.lock` sotto le mani di chi sta lavorando.
 *
 * 7. ⛔ `git branch --show-current`, non `rev-parse --abbrev-ref HEAD`.
 *    MISURATO, due casi in cui il secondo mente o muore:
 *      · repo appena creato, nessun commit ⇒ `rev-parse` esce **128**
 *        («ambiguous argument 'HEAD'»), `--show-current` risponde `master`;
 *      · HEAD staccata ⇒ `rev-parse` risponde la **stringa `HEAD`**, che
 *        sembra un nome di ramo; `--show-current` risponde `''`, cioè la
 *        verità: nessun ramo.
 *    ⛔ `src/workspace-context.mjs` usa ancora la prima forma: è un rilievo
 *    REGISTRATO nel ledger, non corretto qui — non è la mia riga.
 *
 * 8. ⛔ Su Windows `spawn`/`execFile` con argomenti non fidati è stato una
 *    RCE quando l'eseguibile è un `.bat`/`.cmd`: CVE-2024-27980, e il suo
 *    bypass CVE-2024-36138 (nodejs.org/en/blog/vulnerability/april-2024-security-releases-2,
 *    letto il 05/09/2026) — «command injection … even if the shell option is
 *    not enabled». Qui l'eseguibile è `git` (che risolve a `git.exe`) e
 *    `process-policy` impone `shell:false`; in più nessun argomento è mai
 *    concatenato in una stringa, i percorsi vanno dopo `--`, e i nomi che
 *    cominciano per `-` o `:` sono rifiutati a monte da `normalizzaPercorso`.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * I CONFINI — misurati su questo repository, non presunti
 * ═══════════════════════════════════════════════════════════════════════
 *
 * ⛔ **Questa cartella è un WORKTREE**: `.git` è un FILE
 * (`gitdir: …/AVM/.git/worktrees/AVM-harness-desktop`), non una directory.
 * Per questo NIENTE qui dentro cerca `.git` come cartella per decidere se
 * un posto è un repository: la domanda si fa a git, con
 * `rev-parse --show-toplevel --show-prefix`. VERIFICATO: da qui
 * `--show-toplevel` risponde `…/AVM-harness-desktop`, cioè la radice del
 * worktree, non quella del clone originale.
 *
 * ⛔ **La cartella della sessione può essere una SOTTOCARTELLA del repo.**
 * MISURATO: da una sottocartella, `git status` **senza** pathspec elenca
 * TUTTO il repository padre — cioè file che il workspace non contiene. Per
 * questo ogni lettura è ristretta con `-- .`, e i percorsi che git restituisce
 * (sempre relativi alla RADICE del repo: «paths shown will always be relative
 * to the repository root») vengono riportati al vocabolario della sessione
 * togliendo `--show-prefix`. ⇒ Fuori di qui esiste **un solo vocabolario**:
 * percorsi relativi alla cartella della sessione.
 *
 * ⛔ **Repo annidati — W1-13**: un repository dentro il workspace ha fiducia
 * PROPRIA e non si attraversa (`src/workspace-context.mjs`, che li elenca
 * fermandosi su `existsSync(join(sotto,'.git'))`). Qui il confine lo tiene
 * git stesso, ed è MISURATO: il padre vede `?? annidato/` — la cartella, mai
 * i file dentro — **anche con `-uall`**. Questo file non fa niente per
 * scavalcarlo; si limita a **dirlo**, marcando quella voce `repoAnnidato:true`
 * con lo stesso identico test del modulo di W1-13, così la Review non
 * presenta come «file da aggiungere» il contenuto di un altro repository.
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { isPathInside } from './path-policy.mjs';
import { createProcessPolicy } from './process-policy.mjs';
import { cartellaScratchAttesa } from './scratch.mjs';

/**
 * ⛔ Le chiavi d'ambiente che git può vedere. `HOME`/`USERPROFILE` NON sono
 * di comodo: senza, git non trova `~/.gitconfig` e quindi non trova
 * `user.name`/`user.email` — cioè `commit()` fallirebbe sull'identità.
 * ⛔ Nessuna variabile `GIT_*`: le due che ci servono (`GIT_OPTIONAL_LOCKS`,
 * `GIT_LITERAL_PATHSPECS`) sono passate come FLAG sulla riga di comando, dove
 * si vedono in un test e in un log, invece che come ambiente invisibile.
 */
const AMBIENTE_GIT = Object.freeze([
  'PATH', 'Path', 'PATHEXT', 'SystemRoot', 'WINDIR', 'COMSPEC',
  'HOME', 'USERPROFILE', 'TMP', 'TEMP', 'LANG', 'LC_ALL',
]);

/**
 * ⛔ Davanti a OGNI sottocomando, con UNA eccezione nominata (`percorsiCostanti`, solo lo stash di F6-1: vedi `git()`). Il primo tiene le mani
 * lontane da `index.lock` su un indice condiviso (ricerca 6), il secondo
 * toglie ai percorsi del client ogni potere di pathspec (ricerca 5).
 */
const FLAG_SEMPRE = Object.freeze(['--no-optional-locks', '--literal-pathspecs']);

const TIMEOUT_LETTURA_MS = 15_000;
const TIMEOUT_SCRITTURA_MS = 60_000;
/**
 * F6-2 — parlare col remoto. Le chiavi in PIÙ servono a chi git lancia per le credenziali: Git Credential Manager su Windows
 * (config e tracce sotto `LOCALAPPDATA`/`APPDATA`, l'utente per il Credential Manager di Windows), OpenSSH (`SSH_AUTH_SOCK` per un
 * agente su Linux/macOS). `GIT_TERMINAL_PROMPT` la impostiamo noi a `0`; `GCM_INTERACTIVE` passa se l'owner l'ha impostata.
 * ⛔ Il tempo massimo di un'operazione di rete: oltre, si ferma da sola e lo dice (owner, punto 23).
 */
const AMBIENTE_REMOTO = Object.freeze([...AMBIENTE_GIT, 'LOCALAPPDATA', 'APPDATA', 'USERNAME', 'ProgramData', 'PROGRAMDATA', 'SSH_AUTH_SOCK', 'GIT_TERMINAL_PROMPT', 'GCM_INTERACTIVE']);
const TIMEOUT_RETE_MS = 5 * 60_000;
/** I lock che un `git fetch`/`pull`/`push` ucciso a metà può lasciare (Hermes `gitlock.ts:20`): si tolgono solo se sono NOSTRI (nati dopo il nostro avvio). */
const LOCK_DI_RETE = Object.freeze(['FETCH_HEAD.lock', 'shallow.lock', 'index.lock', 'HEAD.lock', 'ORIG_HEAD.lock']);
/** Un `git status` di un monorepo enorme non deve diventare un errore misterioso: oltre questo si dice PERCHÉ. */
const TETTO_USCITA_BYTE = 32 * 1024 * 1024;
const TETTO_MESSAGGIO_BYTE = 64 * 1024;
/** F6-3: i commit che la bozza di una PR legge (dal più recente); oltre, `commitOltre:true`. */
const TETTO_COMMIT_PR = 250;
/** F6-1: il diff di un file che la scheda mostra; oltre, torna troncato e lo dice. */
const TETTO_DIFF_BYTE = 2 * 1024 * 1024;
/** Le combinazioni XY che git documenta come "unmerged": un conflitto non è né staged né non-staged, è una terza cosa. */
const CONFLITTO = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU']);

export class GitServiceError extends Error {
  constructor(message, code = 'GIT_COMMAND_FAILED') {
    super(message);
    this.name = 'GitServiceError';
    this.code = code;
  }
}

/**
 * Un percorso arrivato dal client è **testo non fidato**. Qui si decide, in
 * un posto solo, cosa può essere — e ogni rifiuto è per nome.
 *
 * ⛔ AL CONTRARIO, esplicitamente: assoluto no (porterebbe fuori dalla
 * sessione), `..` no (stessa cosa per un'altra strada), iniziale `-` no (un
 * argomento che sembra un'opzione), iniziale `:` no (è la magia di pathspec
 * MISURATA alla ricerca 5 — `--literal-pathspecs` la disinnesca già, e questa
 * è la seconda serratura sulla stessa porta), NUL no.
 *
 * @returns {string} il percorso normalizzato con `/`, relativo alla cartella
 */
export function normalizzaPercorso(cartella, percorso) {
  if (typeof percorso !== 'string' || percorso.trim() === '' || percorso.includes('\0')) {
    throw new GitServiceError('Invalid path', 'GIT_PATH_INVALID');
  }
  if (isAbsolute(percorso) || /^[a-zA-Z]:/u.test(percorso)) {
    throw new GitServiceError('The path must be relative to the session folder', 'GIT_PATH_INVALID');
  }
  if (percorso.startsWith('-')) {
    throw new GitServiceError('A path cannot start with “-”', 'GIT_PATH_INVALID');
  }
  if (percorso.startsWith(':')) {
    throw new GitServiceError('A path cannot start with “:”', 'GIT_PATH_INVALID');
  }
  const pezzi = percorso.split(/[\\/]+/u);
  if (pezzi.some((p) => p === '..')) {
    throw new GitServiceError('The path leaves the session folder', 'GIT_PATH_INVALID');
  }
  const pulito = pezzi.filter((p) => p !== '' && p !== '.').join('/');
  if (pulito === '') throw new GitServiceError('Invalid path', 'GIT_PATH_INVALID');
  /* ⛔ Terza serratura: il controllo lessicale di containment che usa già il resto del server (`path-policy.isPathInside`), su percorsi REALI — così un giorno in cui una delle due regole sopra cambiasse, questa continuerebbe a mordere. */
  if (!isPathInside(cartella, resolve(cartella, pulito))) {
    throw new GitServiceError('The path leaves the session folder', 'GIT_PATH_INVALID');
  }
  return pulito;
}

/**
 * Analizza l'uscita di `git status --porcelain=v1 -z`.
 *
 * ⛔ La forma è: `XY<spazio><percorso><NUL>`, e per una rinomina/copia
 * **due** campi — `XY<spazio><DOVE><NUL><DA><NUL>` — con l'ordine INVERTITO
 * rispetto alla forma leggibile (ricerca 2, misurata). Chi legge questa
 * funzione deve sapere che `da` viene DOPO nel flusso ma è il PRIMA nel tempo.
 *
 * @param {string} testo uscita grezza, già decodificata una volta sola
 * @returns {Array<{x:string,y:string,percorsoRepo:string,daRepo:string|null}>}
 */
export function analizzaStatoPorcelain(testo) {
  if (typeof testo !== 'string') throw new GitServiceError('git output not readable', 'GIT_COMMAND_FAILED');
  const campi = testo.split('\0');
  const voci = [];
  let i = 0;
  while (i < campi.length) {
    const riga = campi[i];
    i += 1;
    if (riga === '') continue; // la coda dopo l'ultimo NUL, e nient'altro
    if (riga.length < 4 || riga[2] !== ' ') {
      throw new GitServiceError('git status line not recognized', 'GIT_COMMAND_FAILED');
    }
    const x = riga[0];
    const y = riga[1];
    const percorsoRepo = riga.slice(3);
    let daRepo = null;
    if (x === 'R' || x === 'C' || y === 'R' || y === 'C') {
      /* ⛔ Il campo in più c'è SOLO qui. Consumarlo sempre spezzerebbe l'allineamento di tutte le voci successive. */
      if (i >= campi.length) throw new GitServiceError('Rename without a source path', 'GIT_COMMAND_FAILED');
      daRepo = campi[i];
      i += 1;
    }
    voci.push({ x, y, percorsoRepo, daRepo });
  }
  return voci;
}

/** Dalla coppia XY al vocabolario che la Review mostra. `X` = indice, `Y` = albero di lavoro (git-status(1)). */
function descrivi(x, y) {
  const xy = `${x}${y}`;
  if (CONFLITTO.has(xy)) return { tipo: 'conflitto', staged: false, nonStaged: false, conflitto: true };
  if (x === '?' && y === '?') return { tipo: 'nonTracciato', staged: false, nonStaged: true, conflitto: false };
  if (x === '!' && y === '!') return { tipo: 'ignorato', staged: false, nonStaged: false, conflitto: false };
  const lettera = x !== ' ' && x !== '?' && x !== '!' ? x : y;
  const tipo = { M: 'modificato', A: 'aggiunto', D: 'eliminato', R: 'rinominato', C: 'copiato', T: 'tipoCambiato' }[lettera] ?? 'modificato';
  return {
    tipo,
    staged: x !== ' ' && x !== '?' && x !== '!',
    nonStaged: y !== ' ' && y !== '?' && y !== '!',
    conflitto: false,
  };
}

/**
 * @param {object} deps
 * @param {(sessionId:string)=>string|null} deps.cartellaDiSessione ⛔ L'UNICA
 *   autorità sulla cartella, esattamente come in `terminal-registry.mjs`: il
 *   client NOMINA una sessione, non sceglie mai un percorso di lavoro. Un id
 *   sconosciuto torna `null` e qui non succede niente — nessun ripiego sul
 *   primo progetto configurato (era il difetto di `server.mjs:589`, W1-01).
 * @param {Function} [deps.eseguiGitFn] SOLO per i test: sostituisce l'esecuzione vera.
 */
export function creaServizioGit({
  cartellaDiSessione,
  eseguiGitFn = null,
  timeoutLetturaMs = TIMEOUT_LETTURA_MS,
  timeoutScritturaMs = TIMEOUT_SCRITTURA_MS,
  esisteFn = existsSync,
  cartellaUtenteFn = homedir,
} = {}) {
  if (typeof cartellaDiSessione !== 'function') {
    throw new GitServiceError('Authority over the session folder is required', 'GIT_STORE_UNAVAILABLE');
  }

  /**
   * ⛔⛔ Perché `policy.execFile` e non `runApprovedProcess`, che è la porta
   * che usano gli altri: `runApprovedProcess` accumula l'uscita decodificando
   * **ogni pezzo separatamente** (`process-policy.mjs`, `appendBounded`:
   * `chunk.toString('utf8')`). Un carattere UTF-8 multibyte che cade a
   * cavallo di due pezzi si spezza, e `àccento.txt` tornerebbe corrotto —
   * cioè esattamente la garanzia che `-z` esiste per dare. Qui l'uscita si
   * prende in **Buffer** e si decodifica UNA volta sola, alla fine.
   * ⛔ Resta tutto dentro `process-policy`: eseguibile in elenco, `shell:false`
   * imposto, ambiente filtrato, e `cwdRoot` = la cartella della sessione,
   * quindi la cartella di lavoro non può nemmeno essere un'altra.
   */
  async function eseguiVero(cartella, argomenti, timeoutMs, { ambiente = null, segnale = null } = {}) {
    /* F6-2: un comando di RETE porta le chiavi in più e `GIT_TERMINAL_PROMPT=0`; gli altri restano com'erano. */
    const policy = createProcessPolicy({
      allowedExecutables: ['git'],
      cwdRoot: cartella,
      envAllowlist: ambiente ? AMBIENTE_REMOTO : AMBIENTE_GIT,
    });
    return new Promise((esci) => {
      policy.execFile('git', argomenti, {
        cwd: cartella,
        encoding: 'buffer',
        timeout: timeoutMs,
        maxBuffer: TETTO_USCITA_BYTE,
        windowsHide: true,
        ...(ambiente ? { env: ambiente } : {}),
        ...(segnale ? { signal: segnale } : {}),
      }, (errore, stdout, stderr) => {
        const fuori = Buffer.isBuffer(stdout) ? stdout.toString('utf8') : String(stdout ?? '');
        const errori = Buffer.isBuffer(stderr) ? stderr.toString('utf8') : String(stderr ?? '');
        if (!errore) { esci({ codice: 0, stdout: fuori, stderr: errori }); return; }
        esci({
          codice: typeof errore.code === 'number' ? errore.code : null,
          stdout: fuori,
          stderr: errori,
          /* fermato da noi (il «Ferma» del recupero) prima che scaduto: la distinzione la fa il segnale, non il messaggio */
          annullato: segnale?.aborted === true,
          scaduto: segnale?.aborted !== true && (errore.killed === true || errore.signal != null),
          troppoGrande: errore.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',
          avvioFallito: errore.code === 'ENOENT',
        });
      });
    });
  }

  const eseguiGit = eseguiGitFn ?? eseguiVero;
  /** F6-2 — il recupero in corso per cartella (uno alla volta), con il suo «Ferma». */
  const recuperiInCorso = new Map();

  /** Lancia con i flag obbligatori davanti, e traduce ogni fallimento in un codice NOMINATO. */
  async function git(cartella, argomenti, { timeoutMs = timeoutLetturaMs, tollera = false, percorsiCostanti = false, rete = false, segnale = null } = {}) {
    /* ⛔ `percorsiCostanti` è l'UNICA eccezione a FLAG_SEMPRE, e vale solo per `stash` con il pathspec COSTANTE `.` (nessun percorso
       del client). Misurato il 26/09 su git 2.55: con `--literal-pathspecs`, `git stash -- .` lanciato da una sottocartella mette
       da parte TUTTO il repository, e `-- m` non trova il file — il flag arriva ai figli di stash come `GIT_LITERAL_PATHSPECS=1` e il
       prefisso `:(prefix:N)` che stash aggiunge smette di essere magia (org2AI/ORG2 PR #1737, letto il 26/09/2026). */
    const flag = percorsiCostanti ? FLAG_SEMPRE.filter((f) => f !== '--literal-pathspecs') : FLAG_SEMPRE;
    /* F6-2: un comando di rete non chiede MAI nel terminale, ha il suo tempo massimo, e può portare il segnale di «Ferma» */
    const esito = await eseguiGit(cartella, [...flag, ...argomenti], rete && timeoutMs === timeoutLetturaMs ? TIMEOUT_RETE_MS : timeoutMs, rete ? { ambiente: { GIT_TERMINAL_PROMPT: '0' }, segnale } : {});
    if (esito.codice === 0) return esito;
    if (esito.annullato) throw new GitServiceError('Fermato', 'GIT_ABORTED');
    if (tollera) return esito;
    if (esito.troppoGrande) throw new GitServiceError('The git output exceeds the allowed limit', 'GIT_OUTPUT_TOO_LARGE');
    if (esito.scaduto) throw new GitServiceError('git did not respond within the maximum time', 'GIT_TIMEOUT');
    if (esito.avvioFallito) throw new GitServiceError('git is not installed or not reachable', 'GIT_COMMAND_FAILED');
    const detto = String(esito.stderr || '').trim();
    if (/not a git repository/iu.test(detto)) {
      throw new GitServiceError('This folder is not a git repository', 'GIT_NOT_A_REPOSITORY');
    }
    throw new GitServiceError(detto || 'git answered with an error', 'GIT_COMMAND_FAILED');
  }

  /** La cartella della sessione, o un rifiuto. ⛔ Mai un ripiego: un id ignoto non prende NIENTE. */
  function cartellaDi(sessionId) {
    if (typeof sessionId !== 'string' || sessionId === '') {
      throw new GitServiceError('Invalid session', 'QUERY_INVALID');
    }
    const cartella = cartellaDiSessione(sessionId);
    if (typeof cartella !== 'string' || cartella === '') {
      throw new GitServiceError('Session not found', 'NOT_FOUND');
    }
    return resolve(cartella);
  }

  /**
   * Dove comincia il repository, e quanto è profonda la cartella della
   * sessione al suo interno. ⛔ Una sola domanda a git per entrambe le cose:
   * `rev-parse` stampa una riga per ciascun argomento, in ordine. Alla radice
   * `--show-prefix` è la riga VUOTA, e va bene così.
   */
  async function collocazione(cartella) {
    const esito = await git(cartella, ['rev-parse', '--show-toplevel', '--show-prefix']);
    const righe = esito.stdout.split('\n');
    const radiceRepo = (righe[0] ?? '').trim();
    if (radiceRepo === '') throw new GitServiceError('This folder is not a git repository', 'GIT_NOT_A_REPOSITORY');
    const prefisso = (righe[1] ?? '').trim();
    return {
      radiceRepo,
      prefisso,
      /* ⛔ Un'informazione onesta, non un giudizio: la sessione è la radice del repo, oppure ci sta dentro. Il pannello lo deve poter dire a chi guarda. */
      cartellaEradiceRepo: prefisso === '',
    };
  }

  /** Dal vocabolario di git (relativo alla RADICE del repo) a quello di questo servizio (relativo alla cartella della sessione). */
  function versoLaSessione(prefisso, percorsoRepo) {
    if (prefisso === '') return percorsoRepo;
    if (!percorsoRepo.startsWith(prefisso)) return null; // fuori dalla cartella della sessione: non esiste, per chi ci parla
    return percorsoRepo.slice(prefisso.length);
  }

  /**
   * ⭐ F6-1 (26/09/2026) — LA BASE SI DICHIARA SEMPRE (ledger F6, scelta 5; Claude Code #65852): la scheda dice rispetto a
   * QUALE commit mostra le modifiche. `null` in un repository senza commit — la verità, non un hash inventato.
   * ⛔ `rev-parse --verify -q HEAD` e non `rev-parse HEAD`: sul ramo appena nato il secondo esce 128 con un errore, il primo
   *   esce 1 in silenzio (git-rev-parse(1), `--verify`/`-q`), e qui «nessun commit» è uno stato, non un guasto.
   */
  async function baseInterna(cartella) {
    const testa = await git(cartella, ['rev-parse', '--verify', '-q', 'HEAD'], { tollera: true });
    const commit = testa.codice === 0 ? testa.stdout.trim() : '';
    if (!commit) return null;
    const log = await git(cartella, ['log', '-1', '--no-color', '--format=%h%x00%s', commit]);
    const [breve, ...resto] = log.stdout.replace(/\n$/u, '').split('\0');
    return { commit, breve, soggetto: resto.join('\0') };
  }

  /*
   * ⭐ F6-2 passo 4 (decisione 24 dell'owner, 27/09) — GLI ESTREMI DI UN CONFRONTO FRA COMMIT, come VS Code
   *   `provideHistoryItemChanges` (`extensions/git/src/historyProvider.ts:339-369`): un commit contro il suo PRIMO genitore, e la
   *   radice contro l'albero VUOTO (`repository.ts:2210-2217`, `hash-object -t tree`); oppure due estremi dati («In arrivo»: base
   *   comune → punta del remoto; «In uscita»: base comune → HEAD).
   * ⛔ Solo HASH INTERI (40 o 64 cifre esadecimali), mai nomi: niente `HEAD~1`, rami o opzioni dalla richiesta. E devono essere
   *   commit che il repository ha davvero (`cat-file -e <hash>^{commit}`).
   * ⭐ L'albero vuoto si prende per costante e non da `hash-object` (l'helper non passa stdin): misurato con git 2.55.0 il 27/09,
   *   `4b825dc6…` in SHA-1 e `6ef19b41…` in SHA-256 — si sceglie dalla lunghezza dell'hash del commit.
   */
  const HASH_INTERO = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
  const ALBERO_VUOTO = Object.freeze({ 40: '4b825dc642cb6eb9a060e54bf8d69288fbee4904', 64: '6ef19b41225c5369f1c104d45d8d85efa9b057b53b14b4b9b939dd74decc5321' });
  const TETTO_FILE_CONFRONTO = 500;

  async function estremiDelConfronto(cartella, da, a) {
    const conDa = da !== null && da !== undefined && da !== '';
    if (typeof a !== 'string' || !HASH_INTERO.test(a) || (conDa && (typeof da !== 'string' || !HASH_INTERO.test(da)))) {
      throw new GitServiceError('A commit is given by its full hash', 'GIT_COMMIT_INVALID');
    }
    const esiste = async (h) => (await git(cartella, ['cat-file', '-e', `${h}^{commit}`], { tollera: true })).codice === 0;
    if (!(await esiste(a)) || (conDa && !(await esiste(da)))) throw new GitServiceError('This commit is not in the repository', 'GIT_COMMIT_UNKNOWN');
    if (conDa) return { base: da, punta: a };
    const padre = await git(cartella, ['rev-parse', '--verify', '--quiet', `${a}^1`], { tollera: true });
    const primo = padre.codice === 0 ? padre.stdout.trim() : '';
    return { base: HASH_INTERO.test(primo) ? primo : ALBERO_VUOTO[a.length], punta: a };
  }

  /** `diff --name-status -z`: «X\0percorso\0», e per rinominati e copiati «R<punteggio>\0prima\0dopo\0». */
  function vociNameStatus(testo) {
    const pezzi = String(testo ?? '').split('\0');
    const voci = [];
    for (let i = 0; i < pezzi.length;) {
      const stato = pezzi[i];
      if (!stato) break;
      if (stato.startsWith('R') || stato.startsWith('C')) {
        voci.push({ stato: stato.charAt(0), prima: pezzi[i + 1], percorso: pezzi[i + 2] });
        i += 3;
      } else {
        voci.push({ stato: stato.charAt(0), prima: null, percorso: pezzi[i + 1] });
        i += 2;
      }
    }
    return voci.filter((v) => typeof v.percorso === 'string' && v.percorso !== '');
  }

  /**
   * ⭐ F6-1 — L'AREA PREPARATA DELL'INTERO REPOSITORY, e la sua impronta (ledger F6, scelta 1).
   * ⛔⛔ Il commit di F6-1 prende l'INDICE, come VS Code (`extensions/git/src/git.ts:2071`, `commit` senza percorsi), perché
   *   è l'unico modo di rendere possibile «prepara per pezzo». Ma l'indice è CONDIVISO: con l'owner, con le altre sessioni, e —
   *   quando la sessione è una sottocartella — con file FUORI dalla sessione. Il difetto già pagato una volta («due sessioni,
   *   stessa cartella, intrecciano i commit») torna se il commit fotografa ciò che la persona non ha visto. Due guardie:
   *   · l'impronta (HEAD + `diff --cached --raw -z` di TUTTO il repository) viaggia con lo stato e torna col commit: se nel
   *     frattempo l'area preparata o HEAD sono cambiati, il commit si rifiuta per nome (`GIT_STAGED_CHANGED`);
   *   · un file preparato FUORI dalla cartella della sessione ferma il commit (`GIT_STAGED_OUTSIDE`): la scheda non lo mostra,
   *     quindi non può chiedere di committarlo.
   * ⛔ `--no-renames`: una voce, un percorso — il formato `--raw -z` con le rinomine ha due percorsi e cambia allineamento
   *   (git-diff(1), «--raw»). Per l'impronta e per il «fuori» basta sapere QUALI percorsi, non se sono rinomine.
   * ⛔ Senza pathspec, apposta: da una sottocartella `git diff` guarda tutto il repository (i percorsi sono relativi alla radice).
   */
  async function areaPreparata(cartella, dove, base) {
    const esito = await git(cartella, ['diff', '--cached', '--raw', '-z', '--no-renames', '--no-color', '--no-ext-diff']);
    const campi = esito.stdout.split('\0');
    const percorsiRepo = [];
    for (let i = 0; i + 1 < campi.length; i += 2) {
      if (!campi[i].startsWith(':')) break;
      percorsiRepo.push(campi[i + 1]);
    }
    const fuori = dove.prefisso === '' ? [] : percorsiRepo.filter((p) => !p.startsWith(dove.prefisso));
    const impronta = createHash('sha256').update(`${base?.commit ?? 'nessun-commit'}\n`).update(esito.stdout).digest('hex');
    return { impronta, percorsiRepo, fuori };
  }

  async function statoInterno(cartella) {
    const dove = await collocazione(cartella);
    /*
     * ⛔⛔ ONESTÀ SU CHI FA COSA — scoperto SABOTANDO, non ragionando.
     * Tolto `-- .`, i test restavano tutti verdi: la mia prima stesura
     * diceva in un commento che era `-- .` a impedire la fuga di file del
     * repository padre, e NON È VERO. Il containment lo fa il **filtro sul
     * prefisso** in `versoLaSessione()`, che scarta ogni percorso che non
     * comincia per `--show-prefix`. Quello è il lucchetto, ed è provato
     * dal test della sottocartella.
     * ⇒ `-- .` resta, ma per la ragione VERA: MISURATO, senza pathspec da
     * una sottocartella git percorre e riporta l'INTERO repository padre,
     * che poi noi buttiamo. Su un monorepo è lavoro (e pressione sui lock
     * dell'indice condiviso) pagato a ogni aggiornamento della Review per
     * niente, ed è anche il modo più facile di sbattere contro il tetto di
     * uscita. È una cura di COSTO, non di sicurezza, e il test che la pinna
     * guarda gli argomenti passati a git, non l'elenco che ne esce.
     */
    let esito = await git(cartella, ['status', '--porcelain=v1', '-z', '--', '.']);
    let grezze = analizzaStatoPorcelain(esito.stdout);
    /*
     * ⛔⛔⛔ LA CARTELLA COLLASSATA. git riassume una cartella interamente
     * non tracciata con la sola cartella (`?? sessione/`): se quella cartella
     * è proprio la sessione, il percorso coincide con il prefisso e togliendo
     * il prefisso resta la STRINGA VUOTA — una riga senza nome, che non si
     * può né mostrare né mettere in stage. Succede tutte le volte che si apre
     * una sessione su una cartella nuova dentro un repo che esiste già.
     * ⇒ Solo in quel caso si richiede con `-uall`, che apre il riassunto.
     * ⛔ MISURATO: `-uall` NON scavalca il confine di W1-13 — un repository
     * annidato resta una cartella sola anche così, il suo contenuto non esce.
     */
    if (dove.prefisso !== '' && grezze.some((r) => r.percorsoRepo === dove.prefisso)) {
      esito = await git(cartella, ['status', '--porcelain=v1', '-z', '-uall', '--', '.']);
      grezze = analizzaStatoPorcelain(esito.stdout);
    }
    const voci = [];
    for (const riga of grezze) {
      const percorso = versoLaSessione(dove.prefisso, riga.percorsoRepo);
      if (percorso === null) continue;
      const da = riga.daRepo === null ? null : versoLaSessione(dove.prefisso, riga.daRepo);
      const forma = descrivi(riga.x, riga.y);
      const cartellaVoce = percorso.endsWith('/');
      voci.push({
        percorso,
        percorsoRepo: riga.percorsoRepo,
        /* ⛔ Ricerca 2: `da` è il nome VECCHIO, e nel flusso `-z` arriva DOPO quello nuovo. Qui è già nel verso giusto. */
        da,
        x: riga.x,
        y: riga.y,
        ...forma,
        cartella: cartellaVoce,
        /*
         * ⭐ W1-13 — un repository dentro il workspace ha fiducia PROPRIA.
         * git lo mostra come una cartella non tracciata e non ne elenca il
         * contenuto (MISURATO, anche con `-uall`): qui lo si DICE, con lo
         * stesso identico test di `workspace-context.repoAnnidati()`, così la
         * Review non lo presenta come «una cartella di file da aggiungere».
         */
        repoAnnidato: cartellaVoce && forma.tipo === 'nonTracciato'
          ? esisteFn(join(cartella, percorso, '.git'))
          : false,
      });
    }
    const riepilogo = {
      totale: voci.length,
      staged: voci.filter((v) => v.staged).length,
      nonStaged: voci.filter((v) => v.nonStaged && v.tipo !== 'nonTracciato').length,
      nonTracciati: voci.filter((v) => v.tipo === 'nonTracciato').length,
      conflitti: voci.filter((v) => v.conflitto).length,
    };
    const base = await baseInterna(cartella);
    const area = await areaPreparata(cartella, dove, base);
    /* ⭐ F6-1: la base dichiarata, l'impronta da rimandare col commit, e QUANTI file preparati stanno fuori dalla sessione (i nomi
       no: sono fuori dal vocabolario della sessione, e la scheda non li deve mostrare — deve solo sapere che il commit è fermo). */
    return { ...dove, voci, riepilogo, base, impronta: area.impronta, preparatiFuori: area.fuori.length };
  }

  /** `git branch --show-current`, mai `rev-parse --abbrev-ref HEAD` — ricerca 7, due bugie misurate. */
  async function ramoInterno(cartella) {
    const dove = await collocazione(cartella);
    const esito = await git(cartella, ['branch', '--show-current']);
    const ramo = esito.stdout.trim();
    return {
      ...dove,
      ramo: ramo === '' ? null : ramo,
      /* ⛔ `null` + `staccata:true` è la verità; la stringa «HEAD» che dà `rev-parse` sembrerebbe un ramo che si chiama così. */
      staccata: ramo === '',
    };
  }

  /** Ogni percorso passa dalla stessa serratura, e l'elenco non può essere vuoto o furbo. */
  function normalizzaElenco(cartella, percorsi) {
    if (!Array.isArray(percorsi) || percorsi.length === 0) {
      throw new GitServiceError('At least one explicit path is required', 'GIT_PATHS_REQUIRED');
    }
    if (percorsi.length > 1000) {
      throw new GitServiceError('Too many paths in a single request', 'GIT_PATHS_REQUIRED');
    }
    const puliti = percorsi.map((p) => normalizzaPercorso(cartella, p));
    return [...new Set(puliti)];
  }

  /**
   * ⭐ F6-1 — Il diff di UN file, nell'area chiesta: `preparato` (indice contro HEAD) o `lavoro` (albero contro indice). Lo usano
   * la rotta del diff e i pezzi: la scheda vede lo stesso testo su cui poi si prepara un pezzo, e la sua IMPRONTA (sha256 del
   * testo intero, anche oltre il tetto) dice se nel frattempo è cambiato.
   * ⛔ `--no-ext-diff` e `--no-textconv`: un repository può configurare driver di diff e di conversione che ESEGUONO programmi
   *   (gitattributes(5), «textconv»); un pannello che guarda non deve lanciare niente di nessuno.
   * ⛔ Un file nuovo non è nell'indice: il suo diff è contro il vuoto, con `diff --no-index`, che esce 1 quando ci sono
   *   differenze (git-diff(1) 2.55.0: «This form implies --exit-code») — 1 qui è il caso normale, non un errore.
   * ⛔ Un testo oltre il tetto torna TRONCATO e lo dice, invece di diventare un errore misterioso o riempire la memoria.
   */
  async function diffInterno(cartella, percorso, area) {
    if (area !== 'preparato' && area !== 'lavoro') throw new GitServiceError('Invalid diff area', 'GIT_DIFF_AREA_INVALID');
    const p = normalizzaPercorso(cartella, percorso);
    const stato = await statoInterno(cartella);
    const voce = stato.voci.find((v) => v.percorso === p);
    const inArea = voce && (area === 'preparato' ? voce.staged : (voce.nonStaged || voce.conflitto));
    if (!inArea) throw new GitServiceError(`No ${area === 'preparato' ? 'staged' : 'unstaged'} changes for: ${p}`, 'GIT_PATH_UNCHANGED');
    let esito;
    if (area === 'lavoro' && voce.tipo === 'nonTracciato') {
      if (voce.cartella) throw new GitServiceError(`“${p}” is a folder: open the file`, 'GIT_PATH_UNCHANGED');
      esito = await git(cartella, ['diff', '--no-index', '--no-color', '--no-ext-diff', '--no-textconv', '--', '/dev/null', p], { tollera: true });
      if (esito.codice !== 0 && esito.codice !== 1) throw new GitServiceError(String(esito.stderr || '').trim() || 'git diff non è riuscito', 'GIT_COMMAND_FAILED');
    } else {
      esito = await git(cartella, ['diff', ...(area === 'preparato' ? ['--cached'] : []), '--no-color', '--no-ext-diff', '--no-textconv', '-U3', '--', p]);
    }
    const troncato = Buffer.byteLength(esito.stdout, 'utf8') > TETTO_DIFF_BYTE;
    const testo = troncato ? Buffer.from(esito.stdout, 'utf8').subarray(0, TETTO_DIFF_BYTE).toString('utf8') : esito.stdout;
    return {
      percorso: p, area, base: stato.base, testo, troncato,
      binario: /^Binary files .* differ$/mu.test(testo),
      impronta: createHash('sha256').update(esito.stdout).digest('hex'),
      voce,
    };
  }

  return Object.freeze({
    /** Lo stato «Non committato» della Review: una voce per file, nel vocabolario della sessione. */
    async stato({ sessionId } = {}) {
      try {
        const cartella = cartellaDi(sessionId);
        return await statoInterno(cartella);
      } catch (errore) { return rifiuto(errore); }
    },

    /** Il ramo corrente. `ramo:null` + `staccata:true` quando HEAD è staccata. */
    async ramo({ sessionId } = {}) {
      try {
        const cartella = cartellaDi(sessionId);
        return await ramoInterno(cartella);
      } catch (errore) { return rifiuto(errore); }
    },

    /**
     * Mette in stage percorsi ESPLICITI.
     * ⛔ Non esiste una forma «tutto»: niente `-A`, niente `.`, niente
     * `--update`. L'indice è condiviso con l'owner e con le altre sessioni, e
     * una scrittura larga da qui raccoglierebbe lavoro non nostro — è il
     * difetto già pagato una volta («git add -A raccoglie lavoro NON MIO»).
     */
    async stage({ sessionId, percorsi } = {}) {
      try {
        const cartella = cartellaDi(sessionId);
        const puliti = normalizzaElenco(cartella, percorsi);
        await git(cartella, ['add', '--', ...puliti], { timeoutMs: timeoutScritturaMs });
        return { ok: true, percorsi: puliti, stato: await statoInterno(cartella) };
      } catch (errore) { return rifiuto(errore); }
    },

    /**
     * Toglie dallo stage percorsi ESPLICITI.
     * ⛔ `git reset -- <percorsi>` e non `git restore --staged`: MISURATO, su
     * un repository senza nemmeno un commit `reset` funziona e `restore`
     * fallisce (non c'è un HEAD da cui ripristinare). Il primo `git add` di un
     * progetto nuovo è esattamente il momento in cui uno vuole poter tornare
     * indietro.
     */
    async unstage({ sessionId, percorsi } = {}) {
      try {
        const cartella = cartellaDi(sessionId);
        const puliti = normalizzaElenco(cartella, percorsi);
        /* ⛔ `-q`: senza, `git reset` scrive su stdout l'elenco delle differenze residue ed esce comunque 0 — rumore, non un esito. */
        await git(cartella, ['reset', '-q', '--', ...puliti], { timeoutMs: timeoutScritturaMs });
        return { ok: true, percorsi: puliti, stato: await statoInterno(cartella) };
      } catch (errore) { return rifiuto(errore); }
    },

    /**
     * Commit di percorsi ESPLICITI, con il messaggio letto da un FILE.
     *
     * ⛔⛔ I percorsi espliciti sono la cura del difetto «due sessioni, stessa
     * cartella, intrecciano i commit»: MISURATO alla ricerca 4, ciò che
     * un'altra sessione ha messo in stage su un ALTRO percorso resta fuori dal
     * commit e resta in stage. Un `git commit` senza percorsi fotograferebbe
     * l'intero indice condiviso — per questo qui non è nemmeno rappresentabile.
     *
     * ⛔⛔ E il prezzo di quella scelta è dichiarato invece che subìto: con i
     * percorsi git prende il contenuto dell'ALBERO DI LAVORO, non quello in
     * stage. Se il file è cambiato dopo lo stage, quello che finisce nel
     * commit **non è quello che la Review ha mostrato** ⇒ si rifiuta per nome
     * (`GIT_WORKTREE_DIFFERS`), dicendo quali file rimettere in stage.
     *
     * ⛔ Il messaggio non passa MAI dalla riga di comando: va su un file
     * temporaneo e si passa `-F`. Motivi misurati, non estetici: su Windows la
     * riga di comando ha un tetto duro, e un messaggio lungo o multilinea è
     * normale. `--cleanup=whitespace` è esplicito perché il default (`default`)
     * cambia comportamento a seconda che git creda di dover aprire un editor —
     * qui non lo apre mai, ma il comportamento non deve dipendere da una
     * deduzione di git (git-commit(1), letto il 05/09/2026).
     */
    async commit({ sessionId, percorsi, messaggio } = {}) {
      let cartellaMessaggio = null;
      try {
        const cartella = cartellaDi(sessionId);
        const puliti = normalizzaElenco(cartella, percorsi);
        if (typeof messaggio !== 'string' || messaggio.trim() === '') {
          throw new GitServiceError('The commit needs a message', 'GIT_MESSAGE_REQUIRED');
        }
        if (Buffer.byteLength(messaggio, 'utf8') > TETTO_MESSAGGIO_BYTE) {
          throw new GitServiceError('Commit message too long', 'GIT_MESSAGE_REQUIRED');
        }

        const prima = await statoInterno(cartella);
        const perPercorso = new Map(prima.voci.map((v) => [v.percorso, v]));
        /* ⛔ Un percorso che git non ha niente da committare: lo diciamo NOI, invece di lasciare a git un «pathspec did not match any file(s)» che nessuno sa leggere. */
        const senzaNiente = puliti.filter((p) => !perPercorso.has(p));
        if (senzaNiente.length > 0) {
          throw new GitServiceError(`Nothing to commit for: ${senzaNiente.join(', ')}`, 'GIT_NOTHING_TO_COMMIT');
        }
        /* ⛔⛔ La guardia della ricerca 4: staged E modificato dopo ⇒ il commit prenderebbe la versione nuova, in silenzio. */
        const divergenti = puliti.filter((p) => {
          const v = perPercorso.get(p);
          return v && v.staged && v.nonStaged;
        });
        if (divergenti.length > 0) {
          throw new GitServiceError(
            `These files changed after being staged, and the commit would take the new version: ${divergenti.join(', ')}. Stage them again and try again.`,
            'GIT_WORKTREE_DIFFERS',
          );
        }
        const conflitti = puliti.filter((p) => perPercorso.get(p)?.conflitto);
        if (conflitti.length > 0) {
          throw new GitServiceError(`Conflicts must be resolved first in: ${conflitti.join(', ')}`, 'GIT_NOTHING_TO_COMMIT');
        }

        /* Corsia SCRATCH, 24/09/2026: il file del messaggio vive sotto la radice dei temporanei di TALOS
           (src/scratch.mjs), mai nella TEMP di sistema; se il processo muore prima del `finally`, la
           pulizia all'avvio lo toglie dopo 24 ore di silenzio. */
        cartellaMessaggio = await cartellaScratchAttesa('talos-git-msg-');
        const fileMessaggio = join(cartellaMessaggio, 'messaggio.txt');
        await writeFile(fileMessaggio, messaggio, 'utf8');
        await git(
          cartella,
          ['commit', '--cleanup=whitespace', '-F', fileMessaggio, '--', ...puliti],
          { timeoutMs: timeoutScritturaMs },
        );
        const dopo = await statoInterno(cartella);
        const testa = await git(cartella, ['rev-parse', 'HEAD']);
        return { ok: true, percorsi: puliti, commit: testa.stdout.trim(), stato: dopo };
      } catch (errore) {
        return rifiuto(errore);
      } finally {
        if (cartellaMessaggio) await rm(cartellaMessaggio, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }).catch(() => {});
      }
    },

    /** ⭐ F6-1 — Il diff di UN file nell'area chiesta, con la sua impronta: le regole stanno in `diffInterno`. */
    async diff({ sessionId, percorso, area } = {}) {
      try {
        const cartella = cartellaDi(sessionId);
        const { voce, ...visto } = await diffInterno(cartella, percorso, area);
        return visto;
      } catch (errore) { return rifiuto(errore); }
    },

    /**
     * ⭐ F6-1 ✨ — Il testo da cui il modello scrive il messaggio del commit: il diff PREPARATO della cartella della sessione
     * o, se non c'è niente di preparato, quello dei file tracciati modificati (come Zed, `git_ui/src/git_panel.rs:4062-4068`:
     * HeadToIndex se ci sono preparati, altrimenti HeadToWorktree). Più gli ultimi dieci soggetti del repository, perché il
     * messaggio segua la lingua e lo stile del progetto. La compressione e la richiesta stanno in `messaggio-commit.mjs`.
     * ⛔ Stessi divieti di ogni diff qui: niente textconv né diff esterno del repository.
     */
    async diffPerMessaggio({ sessionId } = {}) {
      try {
        const cartella = cartellaDi(sessionId);
        const stato = await statoInterno(cartella);
        const preparato = stato.voci.some((v) => v.staged);
        const esito = await git(cartella, ['diff', ...(preparato ? ['--cached'] : []), '--no-color', '--no-ext-diff', '--no-textconv', '-U3', '--', '.']);
        if (esito.stdout.trim() === '') throw new GitServiceError('Non ci sono modifiche da descrivere', 'GIT_NOTHING_TO_COMMIT');
        const soggetti = stato.base
          ? (await git(cartella, ['log', '-10', '--no-color', '--format=%s', 'HEAD'])).stdout.split('\n').map((s) => s.trim()).filter(Boolean)
          : [];
        return { testo: esito.stdout, area: preparato ? 'preparato' : 'lavoro', soggetti };
      } catch (errore) { return rifiuto(errore); }
    },

    /**
     * ⭐ F6-1 — Prepara, togli o annulla UN pezzo del diff di un file (decisione dell'owner su F6: «prepara/togli/annulla per
     * file, gruppo e pezzo»; ledger F6, scelta 3). Il pezzo è quello di git, a contesto pieno: la patch è l'intestazione del
     * diff più quel pezzo, e si applica con `git apply` come GitHub Desktop (`app/src/lib/git/apply.ts:53-56`) — `--cached`
     * per preparare, `--cached --reverse` per togliere, `--reverse` sull'albero per annullare.
     * ⛔ Misurato il 26/09 su git 2.55, DALLA SOTTOCARTELLA della sessione: `--cached` funziona coi percorsi del diff (che partono
     *   dalla radice); `--reverse` sull'albero rimette il file byte per byte con LF, con CRLF + `core.autocrlf=true` e con CRLF
     *   senza conversione (un file LF sotto autocrlf=true esce CRLF, come da un checkout); `apply.whitespace=error` FERMA un
     *   pezzo con spazi in coda (uscita 128) — da qui sempre `--whitespace=nowarn`, come GitHub Desktop.
     * ⛔ La scheda rimanda l'impronta del diff che ha visto: se il file è cambiato, il pezzo N è un altro (`GIT_DIFF_CHANGED`).
     *   Prima `--check`, poi l'applicazione: un pezzo che non si applica non lascia niente a metà.
     * ⛔ Solo file tracciati e di testo: un file nuovo o binario si prepara intero (`GIT_HUNK_UNSUPPORTED`).
     */
    async pezzo({ sessionId, percorso, area, indice, impronta, azione } = {}) {
      let cartellaPatch = null;
      try {
        const cartella = cartellaDi(sessionId);
        const verso = { prepara: ['lavoro', ['--cached']], togli: ['preparato', ['--cached', '--reverse']], annulla: ['lavoro', ['--reverse']] }[azione];
        if (!verso || verso[0] !== area) throw new GitServiceError('Invalid hunk action', 'GIT_HUNK_INVALID');
        const d = await diffInterno(cartella, percorso, area);
        if (typeof impronta !== 'string' || impronta !== d.impronta) {
          throw new GitServiceError('The file has changed since the tab showed the differences: look again', 'GIT_DIFF_CHANGED');
        }
        if (d.voce.conflitto) throw new GitServiceError('Conflicts must be resolved first', 'GIT_CONFLICTS');
        if (d.voce.tipo === 'nonTracciato' || d.binario || d.troncato) throw new GitServiceError('This file is staged whole: it has no hunks', 'GIT_HUNK_UNSUPPORTED');
        const righe = d.testo.split('\n');
        const primo = righe.findIndex((r) => r.startsWith('@@ '));
        if (primo < 0) throw new GitServiceError('This file is staged whole: it has no hunks', 'GIT_HUNK_UNSUPPORTED');
        /* L'intestazione tiene solo `diff --git`, `---` e `+++`: un cambio di modo («old mode/new mode») nella patch verrebbe
           applicato insieme al pezzo, e la persona ha scelto le righe, non il modo del file. */
        const intestazione = righe.slice(0, primo).filter((r) => /^(diff --git |--- |\+\+\+ )/u.test(r));
        const pezzi = [];
        for (const r of righe.slice(primo)) {
          if (r.startsWith('@@ ')) pezzi.push([r]);
          else pezzi[pezzi.length - 1].push(r);
        }
        if (!Number.isInteger(indice) || indice < 0 || indice >= pezzi.length) throw new GitServiceError('Invalid hunk', 'GIT_HUNK_INVALID');
        const scelto = pezzi[indice];
        while (scelto.length > 1 && scelto[scelto.length - 1] === '') scelto.pop(); // la riga vuota dopo l'ultimo «\n» del diff
        cartellaPatch = await cartellaScratchAttesa('talos-git-patch-');
        const file = join(cartellaPatch, 'pezzo.patch');
        await writeFile(file, `${[...intestazione, ...scelto].join('\n')}\n`, 'utf8');
        const argomenti = ['apply', ...verso[1], '--whitespace=nowarn'];
        const prova = await git(cartella, [...argomenti, '--check', file], { tollera: true });
        if (prova.codice !== 0) {
          throw new GitServiceError(String(prova.stderr || '').trim() || 'git non riesce ad applicare questo pezzo', 'GIT_HUNK_FAILED');
        }
        await git(cartella, [...argomenti, file], { timeoutMs: timeoutScritturaMs });
        return { ok: true, stato: await statoInterno(cartella) };
      } catch (errore) {
        return rifiuto(errore);
      } finally {
        if (cartellaPatch) await rm(cartellaPatch, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }).catch(() => {});
      }
    },

    /**
     * ⭐ F6-1 — Annulla le modifiche NON preparate di percorsi espliciti (ledger F6, scelta 4). Come VS Code
     * (`extensions/git/src/git.ts:2290-2330`, `clean`/`checkout`): un file tracciato torna com'è nell'INDICE
     * (`checkout -- <percorsi>`: senza albero di riferimento il contenuto viene dall'indice, git-checkout(1) 2.55.0), un file
     * nuovo si elimina (`clean -f -q`). Ciò che è già preparato NON si tocca: quello si toglie prima, con «Togli».
     * ⛔ Irreversibile, e la scheda lo dice coi nomi (VS Code `commands.ts:2277`: «This is IRREVERSIBLE!»): qui torna l'elenco
     *   di ciò che è stato riportato e di ciò che è stato ELIMINATO.
     * ⛔ Un repository annidato non si elimina mai da qui (W1-13), un conflitto nemmeno (git rifiuterebbe comunque).
     * ⛔ `clean -d` solo per una cartella nuova intera: git non entra in un repository annidato senza un secondo `-f`
     *   (git-clean(1)), e noi quel secondo `-f` non lo passiamo mai.
     */
    async annulla({ sessionId, percorsi } = {}) {
      try {
        const cartella = cartellaDi(sessionId);
        const prima = await statoInterno(cartella);
        /* ⛔ git scrive una cartella nuova CON la barra finale (`cartella-nuova/`), e `normalizzaPercorso` la toglie: il
           confronto si fa senza barra, e si torna al nome di git — che dice anche se è una cartella. */
        const perPercorso = new Map(prima.voci.map((v) => [v.percorso.replace(/\/$/u, ''), v]));
        const puliti = normalizzaElenco(cartella, percorsi).map((p) => perPercorso.get(p)?.percorso ?? p);
        const perNome = new Map(prima.voci.map((v) => [v.percorso, v]));
        const senzaNiente = puliti.filter((p) => {
          const v = perNome.get(p);
          return !v || (!v.nonStaged && !v.conflitto);
        });
        if (senzaNiente.length > 0) throw new GitServiceError(`Nothing to discard for: ${senzaNiente.join(', ')}`, 'GIT_NOTHING_TO_DISCARD');
        const conflitti = puliti.filter((p) => perNome.get(p).conflitto);
        if (conflitti.length > 0) throw new GitServiceError(`Conflicts must be resolved first in: ${conflitti.join(', ')}`, 'GIT_CONFLICTS');
        const annidati = puliti.filter((p) => perNome.get(p).repoAnnidato);
        if (annidati.length > 0) throw new GitServiceError(`It is another repository, it cannot be deleted from here: ${annidati.join(', ')}`, 'GIT_NESTED_REPO');
        const nuovi = puliti.filter((p) => perNome.get(p).tipo === 'nonTracciato');
        const tracciati = puliti.filter((p) => perNome.get(p).tipo !== 'nonTracciato');
        if (tracciati.length > 0) await git(cartella, ['checkout', '-q', '--', ...tracciati], { timeoutMs: timeoutScritturaMs });
        if (nuovi.length > 0) await git(cartella, ['clean', '-f', '-q', ...(nuovi.some((p) => p.endsWith('/')) ? ['-d'] : []), '--', ...nuovi], { timeoutMs: timeoutScritturaMs });
        return { ok: true, riportati: tracciati, eliminati: nuovi, stato: await statoInterno(cartella) };
      } catch (errore) { return rifiuto(errore); }
    },

    /**
     * ⭐ F6-1 — Commit di ciò che è PREPARATO (ledger F6, scelta 1), con l'impronta che la scheda ha visto.
     * ⛔ Le guardie, in quest'ordine, ognuna per nome: l'impronta è cambiata (`GIT_STAGED_CHANGED`), niente di preparato
     *   (`GIT_NOTHING_STAGED`: la scheda chiede se preparare tutto, come VS Code `commands.ts:2419-2445`), file preparati fuori
     *   dalla sessione (`GIT_STAGED_OUTSIDE`), conflitti aperti (`GIT_CONFLICTS`).
     * ⛔ Gli hook del repository girano (niente `--no-verify`): un hook che rifiuta è una risposta del progetto, e torna col
     *   suo testo. Il messaggio passa da un file, come nel commit per percorsi.
     */
    async commitPreparato({ sessionId, messaggio, impronta } = {}) {
      let cartellaMessaggio = null;
      try {
        const cartella = cartellaDi(sessionId);
        if (typeof messaggio !== 'string' || messaggio.trim() === '') throw new GitServiceError('The commit needs a message', 'GIT_MESSAGE_REQUIRED');
        if (Buffer.byteLength(messaggio, 'utf8') > TETTO_MESSAGGIO_BYTE) throw new GitServiceError('Commit message too long', 'GIT_MESSAGE_REQUIRED');
        const prima = await statoInterno(cartella);
        if (typeof impronta !== 'string' || impronta !== prima.impronta) {
          throw new GitServiceError('What is staged has changed since the tab showed it: look again and try again', 'GIT_STAGED_CHANGED');
        }
        const dove = await collocazione(cartella);
        const area = await areaPreparata(cartella, dove, prima.base);
        if (area.percorsiRepo.length === 0) throw new GitServiceError('There is nothing staged to commit', 'GIT_NOTHING_STAGED');
        if (area.fuori.length > 0) {
          throw new GitServiceError(`There are ${area.fuori.length} staged files outside the session folder: the commit would take them without you having seen them`, 'GIT_STAGED_OUTSIDE');
        }
        if (prima.riepilogo.conflitti > 0) throw new GitServiceError('Conflicts must be resolved first', 'GIT_CONFLICTS');
        cartellaMessaggio = await cartellaScratchAttesa('talos-git-msg-');
        const fileMessaggio = join(cartellaMessaggio, 'messaggio.txt');
        await writeFile(fileMessaggio, messaggio, 'utf8');
        await git(cartella, ['commit', '--cleanup=whitespace', '-F', fileMessaggio], { timeoutMs: timeoutScritturaMs });
        const testa = await git(cartella, ['rev-parse', 'HEAD']);
        return { ok: true, commit: testa.stdout.trim(), stato: await statoInterno(cartella) };
      } catch (errore) {
        return rifiuto(errore);
      } finally {
        if (cartellaMessaggio) await rm(cartellaMessaggio, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }).catch(() => {});
      }
    },

    /**
     * ⭐ F6-1 passo 3 — La storia dei commit di HEAD. `inviato` = il commit sta in un ramo remoto che questo repository conosce:
     * da lì non si riscrive (modifica/annulla).
     * ⭐ F6-2 passo 3 (decisione 21 dell'owner, 27/09): il ramo attuale E il suo remoto, per il grafo con «In arrivo» e «In uscita».
     *   Come VS Code: `git log --topo-order` sui due riferimenti (`extensions/git/src/git.ts:1493-1500`) e la base comune
     *   (`historyProvider.ts:458-461`, `getMergeBase`). `--topo-order` garantisce che nessun genitore compaia prima di
     *   tutti i suoi figli: la finestra è chiusa verso l'alto, e la scheda può dire da sola quali commit sono solo del remoto.
     *   La punta del remoto passa per hash, mai per nome, sulla riga di comando. `testa` è HEAD: con il remoto davanti il primo
     *   commit della lista può non essere il nostro.
     */
    async storia({ sessionId, limite = 50 } = {}) {
      try {
        const cartella = cartellaDi(sessionId);
        const n = Number.isInteger(limite) && limite > 0 && limite <= 200 ? limite : 50;
        const base = await baseInterna(cartella);
        if (!base) return { commit: [], altri: false };
        const punta = await git(cartella, ['rev-parse', '--verify', '--quiet', '@{u}'], { tollera: true });
        const remoto = punta.codice === 0 && /^[0-9a-f]{40,64}$/u.test(punta.stdout.trim()) ? punta.stdout.trim() : null;
        const nomeRemoto = remoto ? (await git(cartella, ['rev-parse', '--abbrev-ref', '@{u}'], { tollera: true })).stdout.trim() || null : null;
        const comune = remoto ? await git(cartella, ['merge-base', 'HEAD', remoto], { tollera: true }) : null;
        const baseComune = comune?.codice === 0 && /^[0-9a-f]{40,64}$/u.test(comune.stdout.trim()) ? comune.stdout.trim() : null;
        const esito = await git(cartella, ['log', '--topo-order', `--max-count=${n + 1}`, '--no-color', '--format=%H%x1f%h%x1f%an%x1f%aI%x1f%P%x1f%s%x1e', 'HEAD', ...(remoto && remoto !== base.commit ? [remoto] : [])]);
        const record = esito.stdout.split('\x1e').map((r) => r.replace(/^\n/u, '')).filter(Boolean);
        const locali = await nonInviati(cartella, n + 1);
        const commit = record.slice(0, n).map((r) => {
          const [hash, breve, autore, data, genitori, soggetto] = r.split('\x1f');
          const padri = genitori ? genitori.split(' ') : [];
          return { commit: hash, breve, autore, data, genitori: padri.length, padri, soggetto, inviato: !locali.has(hash) };
        });
        // il messaggio INTERO dell'ultimo commit (soggetto e corpo): è quello che la casella rimette quando lo si modifica
        const ultimo = await git(cartella, ['log', '-1', '--no-color', '--format=%B', 'HEAD']);
        return { commit, altri: record.length > n, ultimoMessaggio: ultimo.stdout.replace(/\n+$/u, ''), testa: base.commit, remoto, nomeRemoto, baseComune };
      } catch (errore) { return rifiuto(errore); }
    },

    /**
     * ⭐ F6-2 passo 4 (decisione 24) — I FILE CAMBIATI fra due commit: il clic su un commit del grafo (contro il suo primo
     *   genitore) o su «In arrivo»/«In uscita» (dalla base comune alla punta). Come VS Code `diffBetweenWithStats`
     *   (`extensions/git/src/git.ts:1844-1861`: `diff … --diff-filter=ADMR -z`, rinomine riconosciute).
     * ⛔ `--relative`: i percorsi sono quelli della cartella della sessione, come nel resto della scheda (git-diff(1): «exclude
     *   changes outside the directory and show pathnames relative to it»); ciò che cambia FUORI si CONTA (`fuori`), non si tace.
     *   `--no-relative` per il totale, che scavalca anche un `diff.relative` del repository.
     * ⛔ Tetto di 500 file, dichiarato (`altri`).
     */
    async modificheFra({ sessionId, da = null, a } = {}) {
      try {
        const cartella = cartellaDi(sessionId);
        const { base, punta } = await estremiDelConfronto(cartella, da, a);
        const comune = ['diff', '--no-color', '--no-ext-diff', '-z', '--find-renames', '--diff-filter=ADMR'];
        const dentro = vociNameStatus((await git(cartella, [...comune, '--name-status', '--relative', base, punta])).stdout);
        const tutti = (await git(cartella, [...comune, '--name-only', '--no-relative', base, punta])).stdout.split('\0').filter(Boolean).length;
        return {
          da: base, a: punta, daVuoto: base === ALBERO_VUOTO[punta.length],
          file: dentro.slice(0, TETTO_FILE_CONFRONTO),
          altri: dentro.length > TETTO_FILE_CONFRONTO,
          fuori: Math.max(0, tutti - dentro.length),
        };
      } catch (errore) { return rifiuto(errore); }
    },

    /**
     * ⭐ F6-2 passo 4 — IL DIFF DI UN FILE fra due commit, in sola lettura (niente pezzi da preparare: la storia non si prepara).
     *   Stessi divieti di ogni diff qui (niente textconv né diff esterno) e stesso tetto. Un rinominato porta anche il nome di
     *   PRIMA (`prima`): col solo nome nuovo nel pathspec git lo mostrerebbe come un file aggiunto.
     */
    async diffFra({ sessionId, da = null, a, percorso, prima = null } = {}) {
      try {
        const cartella = cartellaDi(sessionId);
        const p = normalizzaPercorso(cartella, percorso);
        const vecchio = prima === null || prima === undefined || prima === '' ? null : normalizzaPercorso(cartella, prima);
        const { base, punta } = await estremiDelConfronto(cartella, da, a);
        const esito = await git(cartella, ['diff', '--no-color', '--no-ext-diff', '--no-textconv', '-U3', '--find-renames', '--relative', base, punta, '--', ...(vecchio && vecchio !== p ? [vecchio] : []), p]);
        const troncato = Buffer.byteLength(esito.stdout, 'utf8') > TETTO_DIFF_BYTE;
        const testo = troncato ? Buffer.from(esito.stdout, 'utf8').subarray(0, TETTO_DIFF_BYTE).toString('utf8') : esito.stdout;
        return {
          percorso: p, prima: vecchio, da: base, a: punta, daVuoto: base === ALBERO_VUOTO[punta.length], testo, troncato,
          binario: /^Binary files .* differ$/mu.test(testo),
          impronta: createHash('sha256').update(esito.stdout).digest('hex'),
        };
      } catch (errore) { return rifiuto(errore); }
    },

    /**
     * ⭐ F6-1 passo 3 — Modifica l'ultimo commit: il messaggio nuovo, più ciò che è preparato (`commit --amend`).
     * ⛔ Guardie per nome: HEAD non è più quello che la scheda ha visto (`GIT_HEAD_CHANGED`), il commit è già in un ramo remoto
     *   (`GIT_COMMIT_PUSHED`, decisione dell'owner: solo se non ancora inviato), l'area preparata è cambiata o ha file fuori dalla
     *   sessione (le stesse del commit), conflitti aperti.
     */
    async modificaUltimoCommit({ sessionId, messaggio, impronta, commit } = {}) {
      let cartellaMessaggio = null;
      try {
        const cartella = cartellaDi(sessionId);
        if (typeof messaggio !== 'string' || messaggio.trim() === '') throw new GitServiceError('The commit needs a message', 'GIT_MESSAGE_REQUIRED');
        if (Buffer.byteLength(messaggio, 'utf8') > TETTO_MESSAGGIO_BYTE) throw new GitServiceError('Commit message too long', 'GIT_MESSAGE_REQUIRED');
        const prima = await statoInterno(cartella);
        await ultimoCommitRiscrivibile(cartella, prima.base, commit);
        if (typeof impronta !== 'string' || impronta !== prima.impronta) {
          throw new GitServiceError('What is staged has changed since the tab showed it: look again and try again', 'GIT_STAGED_CHANGED');
        }
        const dove = await collocazione(cartella);
        const area = await areaPreparata(cartella, dove, prima.base);
        if (area.fuori.length > 0) {
          throw new GitServiceError(`There are ${area.fuori.length} staged files outside the session folder: the commit would take them without you having seen them`, 'GIT_STAGED_OUTSIDE');
        }
        if (prima.riepilogo.conflitti > 0) throw new GitServiceError('Conflicts must be resolved first', 'GIT_CONFLICTS');
        cartellaMessaggio = await cartellaScratchAttesa('talos-git-msg-');
        const fileMessaggio = join(cartellaMessaggio, 'messaggio.txt');
        await writeFile(fileMessaggio, messaggio, 'utf8');
        await git(cartella, ['commit', '--amend', '--cleanup=whitespace', '-F', fileMessaggio], { timeoutMs: timeoutScritturaMs });
        const testa = await git(cartella, ['rev-parse', 'HEAD']);
        return { ok: true, commit: testa.stdout.trim(), stato: await statoInterno(cartella) };
      } catch (errore) {
        return rifiuto(errore);
      } finally {
        if (cartellaMessaggio) await rm(cartellaMessaggio, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }).catch(() => {});
      }
    },

    /**
     * ⭐ F6-1 passo 3 — Annulla l'ultimo commit, come VS Code (`commands.ts:2780-2806`): le sue modifiche tornano PREPARATE
     * (`reset --soft`), e il suo messaggio torna a chi lo chiede per rimetterlo nella casella. Sul primo commit del repository
     * non c'è un genitore: si toglie il riferimento (`update-ref -d HEAD`) e l'indice resta com'è, cioè tutto preparato.
     * ⛔ Un commit di unione non si annulla da qui (`GIT_MERGE_COMMIT`): due genitori, e «tornare indietro» ha due significati.
     */
    async annullaUltimoCommit({ sessionId, commit } = {}) {
      try {
        const cartella = cartellaDi(sessionId);
        const prima = await statoInterno(cartella);
        if (prima.riepilogo.conflitti > 0) throw new GitServiceError('Conflicts must be resolved first', 'GIT_CONFLICTS');
        const genitori = await ultimoCommitRiscrivibile(cartella, prima.base, commit);
        if (genitori > 1) throw new GitServiceError('The last commit is a merge: it cannot be undone from here', 'GIT_MERGE_COMMIT');
        // ⛔ Da una sottocartella, un commit che tocca file FUORI dalla sessione non si annulla da qui: le sue modifiche
        //   tornerebbero preparate in un posto che la scheda non mostra (è la stessa regola del commit, al contrario).
        const dove = await collocazione(cartella);
        if (dove.prefisso !== '') {
          const nomi = await git(cartella, ['diff-tree', '--no-commit-id', '--name-only', '-r', '-z', '--root', '--no-renames', commit]);
          const fuori = nomi.stdout.split('\0').filter((p) => p && !p.startsWith(dove.prefisso));
          if (fuori.length > 0) throw new GitServiceError(`The last commit touches ${fuori.length} files outside the session folder: it cannot be undone from here`, 'GIT_COMMIT_OUTSIDE');
        }
        const corpo = await git(cartella, ['log', '-1', '--no-color', '--format=%B', commit]);
        if (genitori === 0) await git(cartella, ['update-ref', '-d', 'HEAD', commit], { timeoutMs: timeoutScritturaMs });
        else await git(cartella, ['reset', '-q', '--soft', `${commit}~1`], { timeoutMs: timeoutScritturaMs });
        return { ok: true, messaggio: corpo.stdout.replace(/\n+$/u, ''), stato: await statoInterno(cartella) };
      } catch (errore) { return rifiuto(errore); }
    },

    /** ⭐ F6-1 passo 3 — I rami locali, con quello corrente e il suo ramo di riferimento (se c'è). */
    async rami({ sessionId } = {}) {
      try {
        const cartella = cartellaDi(sessionId);
        return { rami: await ramiInterni(cartella) };
      } catch (errore) { return rifiuto(errore); }
    },

    /**
     * ⭐ F6-1 passo 3 — Passa a un ramo che esiste. `--no-guess`: un nome che esiste solo su un ramo remoto non crea di nascosto
     * un ramo locale che lo segue (quella è F6-2). Modifiche che il cambio sovrascriverebbe: git rifiuta, e si dice per nome.
     */
    async cambiaRamo({ sessionId, ramo } = {}) {
      try {
        const cartella = cartellaDi(sessionId);
        const nome = await nomeRamoValido(cartella, ramo);
        const esistenti = await ramiInterni(cartella);
        if (!esistenti.some((r) => r.nome === nome)) throw new GitServiceError(`The branch “${nome}” does not exist`, 'GIT_BRANCH_NOT_FOUND');
        const esito = await git(cartella, ['switch', '--no-guess', nome], { timeoutMs: timeoutScritturaMs, tollera: true });
        if (esito.codice !== 0) throw erroreDelCambio(esito);
        return { ok: true, ramo: nome, stato: await statoInterno(cartella) };
      } catch (errore) { return rifiuto(errore); }
    },

    /**
     * ⭐ 28/09/2026 (owner: «un pulsante come fa esattamente VS Code, inizializza repository anche se non hai effettuato
     * accesso a GitHub») — `git init` nella cartella della sessione. Solo locale: nessun remoto, nessuna rete, nessun account.
     * Come VS Code (`extensions/git/src/commands.ts:1113-1188`, commit del clone 23/09): il pulsante della vista vuota
     * inizializza la cartella aperta senza chiedere quale (`skipFolderPrompt`), col ramo `main` (`git.defaultBranchName`,
     * `git.ts:426-434` → `init -b`), e chiede conferma SOLO se la cartella è la home dell'utente o una che la contiene
     * (`commands.ts:1159-1166`).
     * ⛔ Due differenze, dette: il ramo iniziale lo sceglie PRIMA la configurazione di chi usa l'app (`init.defaultBranch`), e
     *   `main` vale solo se non ne ha una — VS Code la scavalca col suo default. E si passa come `-c init.defaultBranch=main`,
     *   non come `-b`: un git più vecchio della 2.28 ignora la chiave e resta su `master` invece di fallire (VS Code lo evita
     *   confrontando la versione).
     * ⛔ Una cartella che è GIÀ in un repository (anche come sottocartella di un altro) si rifiuta: un `git init` lì
     *   creerebbe un repository annidato dentro quello di qualcun altro, che la scheda poi mostrerebbe al posto del vero.
     */
    async inizializza({ sessionId, conferma = false } = {}) {
      try {
        const cartella = cartellaDi(sessionId);
        /* `--git-dir` e non `--show-toplevel`: risponde anche dentro un repository bare e dentro `.git`, dove l'altro fallisce.
           ⛔ Si procede SOLO se git dice «not a git repository»: qualunque altro rifiuto (una cartella di un altro utente, «dubious
           ownership») vuol dire che git non ha potuto guardare, e un `init` lì reinizializzerebbe un repository che c'è. */
        const dentro = await git(cartella, ['rev-parse', '--git-dir'], { tollera: true });
        if (dentro.codice === 0 || esisteFn(join(cartella, '.git'))) throw new GitServiceError('This folder is already in a git repository', 'GIT_ALREADY_A_REPOSITORY');
        if (dentro.avvioFallito) throw new GitServiceError('git is not installed or not reachable', 'GIT_COMMAND_FAILED');
        if (dentro.scaduto) throw new GitServiceError('git did not respond within the maximum time', 'GIT_TIMEOUT');
        if (!/not a git repository/iu.test(String(dentro.stderr || ''))) {
          throw new GitServiceError(String(dentro.stderr || '').trim() || 'git non ha potuto guardare questa cartella', 'GIT_COMMAND_FAILED');
        }
        const casa = resolve(cartellaUtenteFn());
        const versoCasa = relative(cartella, casa);
        const contieneCasa = versoCasa === '' || (!versoCasa.startsWith('..') && !isAbsolute(versoCasa));
        if (contieneCasa && conferma !== true) {
          throw new GitServiceError(`A git repository would be created in “${cartella}”, which contains your user folder`, 'GIT_INIT_NEEDS_CONFIRM');
        }
        const configurato = await git(cartella, ['config', '--get', 'init.defaultBranch'], { tollera: true });
        const ramoIniziale = configurato.codice === 0 && configurato.stdout.trim() !== '' ? [] : ['-c', 'init.defaultBranch=main'];
        await git(cartella, [...ramoIniziale, 'init', '-q'], { timeoutMs: timeoutScritturaMs });
        const { ramo } = await ramoInterno(cartella);
        return { ok: true, ramo, stato: await statoInterno(cartella) };
      } catch (errore) { return rifiuto(errore); }
    },

    /** ⭐ F6-1 passo 3 — Crea un ramo da HEAD e ci passa (`switch -c`): le modifiche non committate vengono con lui. */
    async creaRamo({ sessionId, ramo } = {}) {
      try {
        const cartella = cartellaDi(sessionId);
        const nome = await nomeRamoValido(cartella, ramo);
        const esistenti = await ramiInterni(cartella);
        if (esistenti.some((r) => r.nome === nome)) throw new GitServiceError(`The branch “${nome}” already exists`, 'GIT_BRANCH_EXISTS');
        const esito = await git(cartella, ['switch', '-c', nome], { timeoutMs: timeoutScritturaMs, tollera: true });
        if (esito.codice !== 0) throw erroreDelCambio(esito);
        return { ok: true, ramo: nome, stato: await statoInterno(cartella) };
      } catch (errore) { return rifiuto(errore); }
    },

    /** ⭐ F6-1 passo 3 — Rinomina un ramo locale (`branch -m`). */
    async rinominaRamo({ sessionId, da, a } = {}) {
      try {
        const cartella = cartellaDi(sessionId);
        const vecchio = await nomeRamoValido(cartella, da);
        const nuovo = await nomeRamoValido(cartella, a);
        const esistenti = await ramiInterni(cartella);
        if (!esistenti.some((r) => r.nome === vecchio)) throw new GitServiceError(`The branch “${vecchio}” does not exist`, 'GIT_BRANCH_NOT_FOUND');
        if (esistenti.some((r) => r.nome === nuovo)) throw new GitServiceError(`The branch “${nuovo}” already exists`, 'GIT_BRANCH_EXISTS');
        await git(cartella, ['branch', '-m', vecchio, nuovo], { timeoutMs: timeoutScritturaMs });
        return { ok: true, rami: await ramiInterni(cartella) };
      } catch (errore) { return rifiuto(errore); }
    },

    /**
     * ⭐ F6-1 passo 3 — Elimina un ramo locale. ⛔ Mai quello corrente; un ramo con commit non uniti si elimina SOLO con `forza`
     * esplicita, dopo che la scheda l'ha chiesto (VS Code `commands.ts:3330-3345`; decisione dell'owner: «mai un non-unito senza
     * avviso»). Senza `forza` si chiede a git se il ramo è unito PRIMA di eliminarlo, con la stessa regola di `git branch -d`
     * («fully merged in its upstream branch, or in HEAD if no upstream was set», git-branch(1)): `merge-base --is-ancestor`.
     * ⛔ Non si legge il messaggio di git: `LANG`/`LC_ALL` passano a git, e con un git in italiano «not fully merged» non c'è —
     *   la scheda smetterebbe di offrire «Elimina lo stesso». Il messaggio inglese resta solo come seconda rete.
     */
    async eliminaRamo({ sessionId, ramo, forza = false } = {}) {
      try {
        const cartella = cartellaDi(sessionId);
        const nome = await nomeRamoValido(cartella, ramo);
        const esistenti = await ramiInterni(cartella);
        const trovato = esistenti.find((r) => r.nome === nome);
        if (!trovato) throw new GitServiceError(`The branch “${nome}” does not exist`, 'GIT_BRANCH_NOT_FOUND');
        if (trovato.corrente) throw new GitServiceError('The current branch cannot be deleted: switch to another one first', 'GIT_BRANCH_CURRENT');
        if (forza !== true) {
          const monte = await git(cartella, ['rev-parse', '--verify', '-q', `refs/heads/${nome}@{upstream}`], { tollera: true });
          const verso = monte.codice === 0 && monte.stdout.trim() !== '' ? monte.stdout.trim() : 'HEAD';
          const unito = await git(cartella, ['merge-base', '--is-ancestor', `refs/heads/${nome}`, verso], { tollera: true });
          if (unito.codice === 1) throw new GitServiceError(`The branch “${nome}” has commits that are in no other branch`, 'GIT_BRANCH_NOT_MERGED');
          if (unito.codice !== 0) throw new GitServiceError(String(unito.stderr || '').trim() || 'git non sa dire se il ramo è unito', 'GIT_COMMAND_FAILED');
        }
        const esito = await git(cartella, ['branch', forza === true ? '-D' : '-d', nome], { timeoutMs: timeoutScritturaMs, tollera: true });
        if (esito.codice !== 0) {
          if (/not fully merged/iu.test(esito.stderr)) throw new GitServiceError(`The branch “${nome}” has commits that are in no other branch`, 'GIT_BRANCH_NOT_MERGED');
          throw new GitServiceError(String(esito.stderr || '').trim() || 'git non ha eliminato il ramo', 'GIT_COMMAND_FAILED');
        }
        return { ok: true, rami: await ramiInterni(cartella) };
      } catch (errore) { return rifiuto(errore); }
    },

    /**
     * ⭐ F6-1 passo 3 — Mette da parte le modifiche della cartella della sessione (`git stash -m … -- .`).
     * ⛔ Senza la parola del sottocomando: «For quickly making a snapshot, you can omit push… pathspec elements are only allowed
     *   after a double hyphen» (git-stash(1) 2.55.0). `-- .` limita lo stash alla cartella della sessione: da una sottocartella,
     *   senza, finirebbero messe da parte anche le modifiche di chi lavora nel resto del repository.
     */
    async accantona({ sessionId, messaggio = '', conNuovi = false } = {}) {
      try {
        const cartella = cartellaDi(sessionId);
        const testo = typeof messaggio === 'string' ? messaggio.replace(/\s+/gu, ' ').trim().slice(0, 200) : '';
        const prima = await statoInterno(cartella);
        if (prima.riepilogo.conflitti > 0) throw new GitServiceError('Conflicts must be resolved first', 'GIT_CONFLICTS');
        /* ⛔ «C'è qualcosa da mettere da parte?» si legge dallo STATO della sessione, non dal messaggio di git: senza modifiche
             git esce 0 con «No local changes to save» e, in una cartella senza file tracciati, 1 con «pathspec … did not match»
             (misurato su git 2.55) — ma con un git in italiano quelle frasi non ci sono. E dopo si controlla che in cima alla
             pila ci sia davvero una voce nuova. */
        const daMettere = prima.voci.filter((v) => v.tipo !== 'ignorato' && (v.tipo === 'nonTracciato' ? conNuovi === true : (v.staged || v.nonStaged)));
        if (daMettere.length === 0) throw new GitServiceError('There are no changes to stash', 'GIT_NOTHING_TO_STASH');
        const cima = async () => (await git(cartella, ['rev-parse', '-q', '--verify', 'refs/stash'], { tollera: true })).stdout.trim();
        const cimaPrima = await cima();
        const esito = await git(cartella, ['stash', ...(testo ? ['-m', testo] : []), ...(conNuovi === true ? ['-u'] : []), '--', '.'], { timeoutMs: timeoutScritturaMs, tollera: true, percorsiCostanti: true });
        const nuova = (await cima()) !== cimaPrima;
        if (!nuova && (esito.codice === 0 || /No local changes to save|did not match any file/iu.test(`${esito.stdout}${esito.stderr}`))) {
          throw new GitServiceError('There are no changes to stash', 'GIT_NOTHING_TO_STASH');
        }
        if (esito.codice !== 0 || !nuova) throw new GitServiceError(String(esito.stderr || '').trim() || 'git non ha messo da parte le modifiche', 'GIT_COMMAND_FAILED');
        return { ok: true, accantonati: await accantonatiInterni(cartella), stato: await statoInterno(cartella) };
      } catch (errore) { return rifiuto(errore); }
    },

    /** ⭐ F6-1 passo 3 — Ciò che è stato messo da parte in questo repository. */
    async accantonati({ sessionId } = {}) {
      try {
        const cartella = cartellaDi(sessionId);
        return { accantonati: await accantonatiInterni(cartella) };
      } catch (errore) { return rifiuto(errore); }
    },

    /**
     * ⭐ F6-1 passo 3 — Riprende (applica e toglie) o scarta una voce messa da parte. La scheda manda l'indice E l'hash che ha
     * visto: lo stash è una pila, e un indice da solo cambia significato appena qualcuno ne aggiunge una (`GIT_STASH_CHANGED`).
     * ⛔ Una voce che tocca file fuori dalla cartella della sessione non si riprende da qui (`GIT_STASH_OUTSIDE`).
     */
    async riprendiAccantonato({ sessionId, indice, commit } = {}) {
      try {
        const cartella = cartellaDi(sessionId);
        const rif = await voceAccantonata(cartella, indice, commit);
        const dove = await collocazione(cartella);
        const nomi = await git(cartella, ['stash', 'show', '--name-only', '--include-untracked', '--no-color', rif]);
        const fuori = dove.prefisso === '' ? [] : nomi.stdout.split('\n').map((s) => s.trim()).filter((p) => p && !p.startsWith(dove.prefisso));
        if (fuori.length > 0) throw new GitServiceError(`This entry touches ${fuori.length} files outside the session folder`, 'GIT_STASH_OUTSIDE');
        const esito = await git(cartella, ['stash', 'pop', rif], { timeoutMs: timeoutScritturaMs, tollera: true });
        if (esito.codice !== 0) {
          // il conflitto si legge dallo stato (file non uniti), non dal messaggio di git, che può essere in un'altra lingua
          const dopo = await statoInterno(cartella).catch(() => null);
          if ((dopo?.riepilogo?.conflitti ?? 0) > 0 || /CONFLICT/u.test(`${esito.stdout}${esito.stderr}`)) throw new GitServiceError('Restoring created conflicts: the entry stays stashed', 'GIT_STASH_CONFLICT');
          throw new GitServiceError(String(esito.stderr || '').trim() || 'git non ha ripreso la voce', 'GIT_COMMAND_FAILED');
        }
        return { ok: true, accantonati: await accantonatiInterni(cartella), stato: await statoInterno(cartella) };
      } catch (errore) { return rifiuto(errore); }
    },

    async scartaAccantonato({ sessionId, indice, commit } = {}) {
      try {
        const cartella = cartellaDi(sessionId);
        const rif = await voceAccantonata(cartella, indice, commit);
        await git(cartella, ['stash', 'drop', '-q', rif], { timeoutMs: timeoutScritturaMs });
        return { ok: true, accantonati: await accantonatiInterni(cartella) };
      } catch (errore) { return rifiuto(errore); }
    },

    /* ═══════════ F6-2 (27/09/2026) — il remoto: le regole stanno in testa al file ═══════════ */

    /** I remoti del repository (nome e indirizzo di recupero), sola lettura. */
    async remoti({ sessionId } = {}) {
      try {
        const cartella = cartellaDi(sessionId);
        return { remoti: await remotiInterni(cartella) };
      } catch (errore) { return rifiuto(errore); }
    },

    /** Lo stato di sincronizzazione del ramo corrente: riferimento, avanti/indietro, ultimo recupero, remoto per l'invio. */
    async sincronizzazione({ sessionId } = {}) {
      try {
        const cartella = cartellaDi(sessionId);
        return await sincronizzazioneInterna(cartella);
      } catch (errore) { return rifiuto(errore); }
    },

    /**
     * Recupera (fetch) dal remoto: quello del riferimento, o quello chiesto, o l'unico; con più remoti e nessun riferimento, tutti.
     * Solo col clic (owner, punto 18); si può fermare con `fermaRecupero` (punto 23); un recupero già in corso sulla stessa
     * cartella non se ne affianca un altro.
     */
    async recupera({ sessionId, remoto = null } = {}) {
      let cartella = null;
      const inizio = Date.now();
      try {
        cartella = cartellaDi(sessionId);
        const sinc = await sincronizzazioneInterna(cartella);
        if (sinc.remoti.length === 0) throw new GitServiceError('This repository has no remote', 'GIT_NO_REMOTE');
        if (recuperiInCorso.has(cartella)) throw new GitServiceError('A fetch is already running', 'GIT_FETCH_RUNNING');
        const nome = remoto == null ? (sinc.riferimento?.remoto ?? sinc.remotoPerInvio ?? null) : remotoConosciuto(remoto, sinc.remoti);
        const controllo = new AbortController();
        recuperiInCorso.set(cartella, controllo);
        try {
          await git(cartella, nome ? ['fetch', '--', nome] : ['fetch', '--all'], { rete: true, segnale: controllo.signal });
        } catch (errore) {
          if (errore?.code === 'GIT_ABORTED' || errore?.code === 'GIT_TIMEOUT') await ripulisciLock(cartella, inizio);
          throw errore;
        } finally {
          recuperiInCorso.delete(cartella);
        }
        return { ok: true, remoto: nome ?? 'tutti', sincronizzazione: await sincronizzazioneInterna(cartella) };
      } catch (errore) { return rifiuto(errore); }
    },

    /** Ferma il recupero in corso di questa sessione, se c'è. `fermato:false` quando non c'era niente da fermare. */
    async fermaRecupero({ sessionId } = {}) {
      try {
        const cartella = cartellaDi(sessionId);
        const controllo = recuperiInCorso.get(cartella);
        if (!controllo) return { ok: true, fermato: false };
        controllo.abort();
        return { ok: true, fermato: true };
      } catch (errore) { return rifiuto(errore); }
    },

    /**
     * Scarica (pull) dal riferimento del ramo corrente, come GitHub Desktop: `--ff` se `pull.ff` tace; `pull.rebase` vale sempre.
     * ⛔ Prima di lanciarlo si guarda cosa il download SOVRASCRIVEREBBE — i file modificati qui che i commit in arrivo toccano —
     *   e si rifiuta per nome (`GIT_WORKTREE_DIRTY`): niente `--autostash` (punto 20), la scheda offre di metterli da parte.
     * ⛔ `--no-edit`: senza un terminale, l'editor del messaggio di unione resterebbe appeso fino al tempo massimo.
     * I conflitti non sono un errore: sono lo stato che torna (`conflitti > 0`), e la scheda li mostra nel gruppo Conflitti.
     */
    async scarica({ sessionId } = {}) {
      const inizio = Date.now();
      try {
        const cartella = cartellaDi(sessionId);
        const prima = await statoInterno(cartella);
        if (prima.riepilogo.conflitti > 0) throw new GitServiceError('Conflicts must be resolved first', 'GIT_CONFLICTS');
        const sinc = await sincronizzazioneInterna(cartella);
        if (!sinc.ramo) throw new GitServiceError('No branch: HEAD is detached', 'GIT_DETACHED');
        if (!sinc.riferimento) throw new GitServiceError(`The branch “${sinc.ramo}” does not track any remote branch: publish it first`, 'GIT_NO_UPSTREAM');
        if (sinc.riferimentoSparito) throw new GitServiceError(`The remote branch “${sinc.riferimento.corto}” no longer exists`, 'GIT_UPSTREAM_GONE');
        const toccati = await git(cartella, ['diff', '--name-only', '-z', '--no-renames', 'HEAD...@{u}'], { tollera: true });
        const inArrivo = new Set(toccati.codice === 0 ? toccati.stdout.split('\0').filter(Boolean) : []);
        const bloccanti = prima.voci.filter((v) => inArrivo.has(v.percorsoRepo)).map((v) => v.percorso);
        if (bloccanti.length > 0) {
          throw new GitServiceError(`Pulling would overwrite ${bloccanti.length} files with uncommitted changes: ${bloccanti.join(', ')}. Stash or commit them, then try again`, 'GIT_WORKTREE_DIRTY');
        }
        /* GitHub Desktop `getDefaultPullDivergentBranchArguments` (`pull.ts:115-135`): se `pull.ff` tace si passa `--ff` (avanti
           veloce, altrimenti unione); `pull.rebase` del progetto vale sempre, git lo legge da sé. */
        const ff = await configDi(cartella, 'pull.ff');
        const argomenti = ['pull', '--no-edit', ...(ff === null ? ['--ff'] : []), '--', sinc.riferimento.remoto];
        let esito;
        try {
          esito = await git(cartella, argomenti, { rete: true, tollera: true });
        } catch (errore) {
          if (errore?.code === 'GIT_TIMEOUT') await ripulisciLock(cartella, inizio);
          throw errore;
        }
        const dopo = await statoInterno(cartella);
        if (esito.codice !== 0 && dopo.riepilogo.conflitti === 0) {
          throw new GitServiceError(String(esito.stderr || '').trim() || 'git pull non è riuscito', 'GIT_PULL_FAILED');
        }
        return {
          ok: esito.codice === 0,
          conflitti: dopo.riepilogo.conflitti,
          commitPrima: prima.base?.commit ?? null,
          commitDopo: dopo.base?.commit ?? null,
          stato: dopo,
          sincronizzazione: await sincronizzazioneInterna(cartella),
        };
      } catch (errore) { return rifiuto(errore); }
    },

    /**
     * Invia (push) il ramo corrente. Con un riferimento: a quel remoto, `ramo:ramoRemoto`, e MAI se il ramo è indietro (`GIT_BEHIND`:
     * prima si scarica — un push forzato qui non esiste). Senza: si PUBBLICA (`--set-upstream`) sul remoto scelto nella conferma
     * (punto 22), che deve essere uno dei remoti del repository. L'esito lo dicono i flag di `--porcelain`, non l'inglese.
     * ⛔ Il remoto che arriva dalla scheda deve coincidere con quello che si userà: la conferma ha detto un nome, e si va lì.
     */
    async invia({ sessionId, remoto = null } = {}) {
      const inizio = Date.now();
      try {
        const cartella = cartellaDi(sessionId);
        const sinc = await sincronizzazioneInterna(cartella);
        if (!sinc.ramo) throw new GitServiceError('No branch: HEAD is detached', 'GIT_DETACHED');
        if (!(await baseInterna(cartella))) throw new GitServiceError('There is no commit yet', 'GIT_NOTHING_TO_COMMIT');
        if (sinc.remoti.length === 0) throw new GitServiceError('This repository has no remote', 'GIT_NO_REMOTE');
        let nome; let refspec; let pubblica = false;
        if (sinc.riferimento && !sinc.riferimentoSparito) {
          nome = sinc.riferimento.remoto;
          refspec = `${sinc.ramo}:${sinc.riferimento.ramo}`;
          if (remoto != null && remoto !== nome) throw new GitServiceError(`The branch “${sinc.ramo}” tracks “${sinc.riferimento.corto}”: push to “${nome}”`, 'GIT_REMOTE_MISMATCH');
          if (sinc.indietro > 0) throw new GitServiceError(`The remote branch has ${sinc.indietro} commits that are not here: pull first`, 'GIT_BEHIND');
          if (sinc.avanti === 0) return { ok: true, nienteDaInviare: true, remoto: nome, ramo: sinc.ramo, sincronizzazione: sinc };
        } else {
          pubblica = true;
          nome = remoto == null ? sinc.remotoPerInvio : remotoConosciuto(remoto, sinc.remoti);
          if (!nome) throw new GitServiceError('Choose the remote to publish the branch to', 'GIT_REMOTE_REQUIRED');
          refspec = sinc.ramo;
        }
        const argomenti = ['push', '--porcelain', ...(pubblica ? ['--set-upstream'] : []), '--', nome, refspec];
        let esito;
        try {
          esito = await git(cartella, argomenti, { rete: true, tollera: true });
        } catch (errore) {
          if (errore?.code === 'GIT_TIMEOUT') await ripulisciLock(cartella, inizio);
          throw errore;
        }
        const righe = righePorcelainPush(esito.stdout);
        const rifiutata = righe.find((r) => r.flag === '!');
        if (esito.codice !== 0 || rifiutata) {
          const perche = rifiutata ? rifiutata.riepilogo : String(esito.stderr || '').trim();
          throw new GitServiceError(perche ? `The remote did not accept the push: ${perche}` : 'git push failed', 'GIT_PUSH_REJECTED');
        }
        return { ok: true, remoto: nome, ramo: sinc.ramo, pubblicato: pubblica, esiti: righe, sincronizzazione: await sincronizzazioneInterna(cartella) };
      } catch (errore) { return rifiuto(errore); }
    },

    /**
     * ⭐ F6-3 (decisione 25 dell'owner, 27/09) — ciò che serve alla BOZZA di una pull request, in sola lettura:
     *   · la base: quella scritta per il ramo (`branch.<ramo>.gh-merge-base`, la stessa che legge `gh pr create`,
     *     `pkg/cmd/pr/create/create.go:855-889`), altrimenti `basePredefinita` (il ramo predefinito del repository, che dice `gh`);
     *   · i rami del remoto, per la scelta della base nel modulo;
     *   · i commit del ramo che la base non ha (`<remoto>/<base>..HEAD`, più recenti prima, al massimo 250), da cui la scheda
     *     compone titolo e testo come `--fill` (`create.go:709-737`).
     * ⛔ Il remoto deve essere uno del repository e la base un nome di ramo valido (`check-ref-format --branch`): niente opzioni,
     *   niente riferimenti arbitrari. Una base che il remoto non ha (o non ancora recuperata) torna `baseTrovata:false`, non un errore.
     */
    async perLaPr({ sessionId, remoto, base = null, basePredefinita = null } = {}) {
      try {
        const cartella = cartellaDi(sessionId);
        const sinc = await sincronizzazioneInterna(cartella);
        if (!sinc.ramo) throw new GitServiceError('No branch: HEAD is detached', 'GIT_DETACHED');
        const nome = remotoConosciuto(remoto, sinc.remoti);
        const baseConfigurata = await configDi(cartella, `branch.${sinc.ramo}.gh-merge-base`);
        const scelta = base ?? baseConfigurata ?? basePredefinita;
        const elenco = await git(cartella, ['for-each-ref', '--format=%(refname)', `refs/remotes/${nome}/`]);
        const prefisso = `refs/remotes/${nome}/`;
        const ramiRemoti = elenco.stdout.split('\n').map((r) => r.trim()).filter((r) => r.startsWith(prefisso))
          .map((r) => r.slice(prefisso.length)).filter((r) => r !== 'HEAD').sort((a, b) => a.localeCompare(b));
        if (scelta == null) return { ramo: sinc.ramo, remoto: nome, base: null, baseConfigurata, ramiRemoti, baseTrovata: false, commit: [], commitOltre: false };
        if (typeof scelta !== 'string' || scelta === '' || scelta.startsWith('-')) throw new GitServiceError('Invalid base branch', 'GIT_BRANCH_INVALID');
        const valido = await git(cartella, ['check-ref-format', '--branch', scelta], { tollera: true });
        if (valido.codice !== 0) throw new GitServiceError('Invalid base branch', 'GIT_BRANCH_INVALID');
        const rif = `${prefisso}${scelta}`;
        const esiste = await git(cartella, ['rev-parse', '--verify', '-q', `${rif}^{commit}`], { tollera: true });
        if (esiste.codice !== 0) return { ramo: sinc.ramo, remoto: nome, base: scelta, baseConfigurata, ramiRemoti, baseTrovata: false, commit: [], commitOltre: false };
        /* uno in più del tetto: così si sa se la lista è tagliata, senza contarli tutti */
        const log = await git(cartella, ['log', '--no-color', `--max-count=${TETTO_COMMIT_PR + 1}`, '--format=%H%x00%s%x00%b%x1e', `${rif}..HEAD`]);
        const tutti = log.stdout.split('\x1e').map((r) => r.replace(/^\n/u, '')).filter(Boolean).map((r) => {
          const [hash, soggetto, ...corpo] = r.split('\0');
          return { hash, soggetto, corpo: corpo.join('\0').trim() };
        });
        return { ramo: sinc.ramo, remoto: nome, base: scelta, baseConfigurata, ramiRemoti, baseTrovata: true, commit: tutti.slice(0, TETTO_COMMIT_PR), commitOltre: tutti.length > TETTO_COMMIT_PR };
      } catch (errore) { return rifiuto(errore); }
    },
  });

  /* ═══════════ F6-2 — gli aiuti del remoto ═══════════ */

  /** Un remoto chiesto dal client deve essere uno di quelli del repository, per nome esatto: mai un'opzione, mai un indirizzo. */
  function remotoConosciuto(nome, remoti) {
    if (typeof nome !== 'string' || nome === '' || nome.startsWith('-') || !remoti.some((r) => r.nome === nome)) {
      throw new GitServiceError('Remoto sconosciuto', 'GIT_REMOTE_UNKNOWN');
    }
    return nome;
  }

  /** `git remote -v`: una riga «nome<TAB>url (fetch|push)»; si tiene l'indirizzo di recupero, e quello d'invio se diverso. */
  async function remotiInterni(cartella) {
    const esito = await git(cartella, ['remote', '-v']);
    const remoti = new Map();
    for (const riga of esito.stdout.split('\n')) {
      const m = /^(\S+)\t(.*?) \((fetch|push)\)$/u.exec(riga.trim());
      if (!m || m[1].startsWith('-')) continue;
      const voce = remoti.get(m[1]) ?? { nome: m[1], url: null, urlInvio: null };
      if (m[3] === 'fetch') voce.url = m[2]; else voce.urlInvio = m[2];
      remoti.set(m[1], voce);
    }
    return [...remoti.values()].map((r) => ({ nome: r.nome, url: r.url ?? r.urlInvio, urlInvio: r.urlInvio && r.urlInvio !== r.url ? r.urlInvio : null }));
  }

  /** Una chiave di configurazione, o `null` se non è impostata (uscita 1, che qui non è un errore). */
  async function configDi(cartella, chiave) {
    const esito = await git(cartella, ['config', '--get', chiave], { tollera: true });
    if (esito.codice !== 0) return null;
    const valore = esito.stdout.trim();
    return valore === '' ? null : valore;
  }

  /**
   * Il remoto su cui git manderebbe il ramo, nell'ordine di git-push(1): `branch.<ramo>.pushRemote`, `remote.pushDefault`,
   * `branch.<ramo>.remote`, poi `origin` se esiste, poi l'unico remoto; altrimenti `null` — e la conferma lo chiede (punto 22).
   */
  async function remotoPredefinito(cartella, ramo, remoti) {
    const nomi = new Set(remoti.map((r) => r.nome));
    const candidati = [];
    if (ramo) candidati.push(await configDi(cartella, `branch.${ramo}.pushRemote`));
    candidati.push(await configDi(cartella, 'remote.pushDefault'));
    if (ramo) candidati.push(await configDi(cartella, `branch.${ramo}.remote`));
    candidati.push('origin');
    for (const c of candidati) if (c && nomi.has(c)) return c;
    return remoti.length === 1 ? remoti[0].nome : null;
  }

  /** Quando è stato l'ultimo recupero: la data di `FETCH_HEAD` (dove git la scrive a ogni fetch/pull), o `null` se mai. */
  async function ultimoRecuperoInterno(cartella) {
    const esito = await git(cartella, ['rev-parse', '--git-path', 'FETCH_HEAD'], { tollera: true });
    if (esito.codice !== 0) return null;
    try { return (await stat(resolve(cartella, esito.stdout.trim()))).mtime.toISOString(); } catch { return null; }
  }

  /** Lo stato di sincronizzazione del ramo corrente. `avanti`/`indietro` sono `null` senza un riferimento. */
  async function sincronizzazioneInterna(cartella) {
    const testa = await ramoInterno(cartella);
    const remoti = await remotiInterni(cartella);
    let riferimento = null; let avanti = null; let indietro = null; let riferimentoSparito = false;
    if (testa.ramo) {
      const r = await git(cartella, ['for-each-ref', '--format=%(upstream:short)%1f%(upstream:remotename)%1f%(upstream:remoteref)', `refs/heads/${testa.ramo}`]);
      const [corto, remoto, rifRemoto] = r.stdout.trim().split('\x1f');
      if (corto) {
        riferimento = { corto, remoto, ramo: String(rifRemoto ?? '').replace(/^refs\/heads\//u, '') };
        const conta = await git(cartella, ['rev-list', '--left-right', '--count', 'HEAD...@{u}'], { tollera: true });
        if (conta.codice === 0) {
          const [a, i] = conta.stdout.trim().split(/\s+/u).map(Number);
          avanti = Number.isInteger(a) ? a : null;
          indietro = Number.isInteger(i) ? i : null;
        } else {
          riferimentoSparito = true;
        }
      }
    }
    return {
      ramo: testa.ramo,
      staccata: testa.staccata,
      remoti,
      riferimento,
      avanti,
      indietro,
      riferimentoSparito,
      remotoPerInvio: await remotoPredefinito(cartella, testa.ramo, remoti),
      ultimoRecupero: await ultimoRecuperoInterno(cartella),
      recuperoInCorso: recuperiInCorso.has(cartella),
    };
  }

  /**
   * Dopo un comando di rete ucciso da noi (fermato o scaduto): i lock nati DOPO il nostro avvio sono nostri e si tolgono, così il
   * prossimo comando non muore su «Unable to create '.git/…lock': File exists» (Hermes `gitlock.ts:1-20`). Un lock più vecchio
   * del nostro avvio è di qualcun altro e resta.
   */
  async function ripulisciLock(cartella, inizioMs) {
    const tolti = [];
    for (const nome of LOCK_DI_RETE) {
      const dove = await git(cartella, ['rev-parse', '--git-path', nome], { tollera: true });
      if (dove.codice !== 0) continue;
      const percorso = resolve(cartella, dove.stdout.trim());
      try {
        const info = await stat(percorso);
        if (info.mtimeMs >= inizioMs) { await rm(percorso, { force: true }); tolti.push(nome); }
      } catch { /* non c'è: niente da togliere */ }
    }
    return tolti;
  }

  /** `push --porcelain`: «<flag>TAB<da>:<a>TAB<riepilogo> (<motivo>)». Il flag decide; il riepilogo si riporta com'è. */
  function righePorcelainPush(testo) {
    const righe = [];
    for (const riga of String(testo ?? '').split('\n')) {
      if (!riga.includes('\t')) continue;
      const [flag, daA, ...resto] = riga.split('\t');
      const [da, a] = String(daA ?? '').split(':');
      righe.push({ flag: flag === '' ? ' ' : flag.charAt(0), da: da ?? '', a: a ?? '', riepilogo: resto.join('\t').trim() });
    }
    return righe;
  }

  /**
   * F6-1 passo 3 — un nome di ramo arrivato dal client è testo non fidato. Lo decide git (`check-ref-format --branch`, che vieta
   * il trattino iniziale), ma quel comando ESPANDE `@{-1}` nel ramo di prima (git-check-ref-format(1)): un nome che lo contiene
   * si rifiuta, e l'uscita deve essere identica all'ingresso.
   */
  async function nomeRamoValido(cartella, nome) {
    if (typeof nome !== 'string' || nome === '' || nome.length > 250 || nome.startsWith('-') || nome.includes('@{') || /[\0\s]/u.test(nome)) {
      throw new GitServiceError('Invalid branch name', 'GIT_BRANCH_INVALID');
    }
    const esito = await git(cartella, ['check-ref-format', '--branch', nome], { tollera: true });
    if (esito.codice !== 0 || esito.stdout.trim() !== nome) throw new GitServiceError(`“${nome}” is not a valid branch name`, 'GIT_BRANCH_INVALID');
    return nome;
  }

  /** I commit di HEAD che non stanno in nessun ramo remoto conosciuto (`rev-list HEAD --not --remotes`). */
  async function nonInviati(cartella, limite) {
    const esito = await git(cartella, ['rev-list', `--max-count=${limite}`, 'HEAD', '--not', '--remotes'], { tollera: true });
    if (esito.codice !== 0) return new Set();
    return new Set(esito.stdout.split('\n').map((s) => s.trim()).filter(Boolean));
  }

  /** L'ultimo commit si può riscrivere se è quello che la scheda ha visto e se non è in un ramo remoto. Torna i suoi genitori. */
  async function ultimoCommitRiscrivibile(cartella, base, commit) {
    if (!base) throw new GitServiceError('There is no commit yet', 'GIT_NOTHING_TO_COMMIT');
    if (typeof commit !== 'string' || commit !== base.commit) {
      throw new GitServiceError('The last commit has changed since the tab showed it: look again and try again', 'GIT_HEAD_CHANGED');
    }
    const locali = await nonInviati(cartella, 1);
    if (!locali.has(commit)) throw new GitServiceError('The last commit has already been pushed: rewriting it would change other people’s history', 'GIT_COMMIT_PUSHED');
    const genitori = await git(cartella, ['log', '-1', '--no-color', '--format=%P', commit]);
    const elenco = genitori.stdout.trim();
    return elenco === '' ? 0 : elenco.split(/\s+/u).length;
  }

  async function ramiInterni(cartella) {
    const esito = await git(cartella, ['for-each-ref', '--format=%(refname:short)%1f%(objectname:short)%1f%(upstream:short)%1f%(HEAD)', 'refs/heads']);
    return esito.stdout.split('\n').filter(Boolean).map((riga) => {
      const [nome, commit, riferimento, testa] = riga.split('\x1f');
      return { nome, commit, riferimento: riferimento || null, corrente: testa === '*' };
    });
  }

  async function accantonatiInterni(cartella) {
    const esito = await git(cartella, ['stash', 'list', '--no-color', '--format=%gd%x1f%H%x1f%cI%x1f%s']);
    return esito.stdout.split('\n').filter(Boolean).map((riga) => {
      const [rif, commit, data, messaggio] = riga.split('\x1f');
      const indice = Number(/\{(\d+)\}/u.exec(rif)?.[1] ?? NaN);
      return { indice, commit, data, messaggio };
    });
  }

  async function voceAccantonata(cartella, indice, commit) {
    if (!Number.isInteger(indice) || indice < 0 || indice > 10_000) throw new GitServiceError('Invalid stash entry', 'GIT_STASH_CHANGED');
    const elenco = await accantonatiInterni(cartella);
    const voce = elenco.find((v) => v.indice === indice);
    if (!voce || typeof commit !== 'string' || voce.commit !== commit) {
      throw new GitServiceError('What is stashed has changed since the tab showed it: look again', 'GIT_STASH_CHANGED');
    }
    return `stash@{${indice}}`;
  }

  /** Il rifiuto di un cambio di ramo, per nome: modifiche che si perderebbero, o altro. */
  function erroreDelCambio(esito) {
    const detto = `${esito.stdout}${esito.stderr}`;
    if (/would be overwritten|Please commit your changes or stash them/iu.test(detto)) {
      return new GitServiceError('There are changes that switching branch would overwrite: commit or stash them first', 'GIT_SWITCH_BLOCKED');
    }
    return new GitServiceError(String(esito.stderr || '').trim() || 'git non ha cambiato ramo', 'GIT_COMMAND_FAILED');
  }
}

/**
 * Ogni porta risponde nella stessa forma del resto del server
 * (`{erroreAvvio, code}`, come `terminal-registry.mjs`), così `http-app.mjs`
 * la traduce senza sapere niente di git.
 * ⛔ Un errore che NON è nostro non diventa un codice inventato: resta
 * `GIT_COMMAND_FAILED`, che http-app mappa a 500 — mai un 200 con un esito
 * finto.
 */
function rifiuto(errore) {
  if (errore instanceof GitServiceError) return { erroreAvvio: errore.message, code: errore.code };
  if (typeof errore?.code === 'string' && errore.code.startsWith('PROCESS_POLICY')) {
    return { erroreAvvio: 'git command refused by the process policy', code: 'GIT_COMMAND_FAILED' };
  }
  if (typeof errore?.code === 'string' && (errore.code === 'CWD_NOT_ALLOWED' || errore.code === 'CWD_REQUIRED' || errore.code === 'CWD_NOT_FOUND' || errore.code === 'EXECUTABLE_NOT_ALLOWED')) {
    return { erroreAvvio: 'Working folder not authorized for git', code: 'GIT_COMMAND_FAILED' };
  }
  return { erroreAvvio: errore?.message || 'git failed', code: 'GIT_COMMAND_FAILED' };
}
