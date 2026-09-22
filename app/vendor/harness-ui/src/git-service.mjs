/**
 * git-service.mjs — W1-05 (05/09). Lo stato Git di una sessione: **status,
 * stage, unstage, commit, ramo**. Ledger: `.claude/LEDGER-W1-05-GIT-SERVICE-2026-09-05.md`.
 *
 * Serve a W1-06, la Review a **due sorgenti dichiarate**: «Ultimo giro
 * agente» viene dagli eventi, «Non committato» viene da qui. Le due non si
 * mescolano mai, e questo file risponde solo della seconda.
 *
 * ⛔⛔⛔ `push` NON ESISTE IN QUESTO FILE, in nessuna forma, e nemmeno
 * `remote`. Non è una precauzione: è una regola dell'owner — il push si
 * chiede a lui ogni volta. `tests/git-service.test.mjs` la **pinna** leggendo
 * il sorgente: se qualcuno aggiungesse la parola, quel test diventa rosso.
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
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

import { isPathInside } from './path-policy.mjs';
import { createProcessPolicy } from './process-policy.mjs';

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
 * ⛔ Davanti a OGNI sottocomando, senza eccezioni. Il primo tiene le mani
 * lontane da `index.lock` su un indice condiviso (ricerca 6), il secondo
 * toglie ai percorsi del client ogni potere di pathspec (ricerca 5).
 */
const FLAG_SEMPRE = Object.freeze(['--no-optional-locks', '--literal-pathspecs']);

const TIMEOUT_LETTURA_MS = 15_000;
const TIMEOUT_SCRITTURA_MS = 60_000;
/** Un `git status` di un monorepo enorme non deve diventare un errore misterioso: oltre questo si dice PERCHÉ. */
const TETTO_USCITA_BYTE = 32 * 1024 * 1024;
const TETTO_MESSAGGIO_BYTE = 64 * 1024;
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
    throw new GitServiceError('Percorso non valido', 'GIT_PATH_INVALID');
  }
  if (isAbsolute(percorso) || /^[a-zA-Z]:/u.test(percorso)) {
    throw new GitServiceError('Il percorso deve essere relativo alla cartella della sessione', 'GIT_PATH_INVALID');
  }
  if (percorso.startsWith('-')) {
    throw new GitServiceError('Un percorso non può cominciare con «-»', 'GIT_PATH_INVALID');
  }
  if (percorso.startsWith(':')) {
    throw new GitServiceError('Un percorso non può cominciare con «:»', 'GIT_PATH_INVALID');
  }
  const pezzi = percorso.split(/[\\/]+/u);
  if (pezzi.some((p) => p === '..')) {
    throw new GitServiceError('Il percorso esce dalla cartella della sessione', 'GIT_PATH_INVALID');
  }
  const pulito = pezzi.filter((p) => p !== '' && p !== '.').join('/');
  if (pulito === '') throw new GitServiceError('Percorso non valido', 'GIT_PATH_INVALID');
  /* ⛔ Terza serratura: il controllo lessicale di containment che usa già il resto del server (`path-policy.isPathInside`), su percorsi REALI — così un giorno in cui una delle due regole sopra cambiasse, questa continuerebbe a mordere. */
  if (!isPathInside(cartella, resolve(cartella, pulito))) {
    throw new GitServiceError('Il percorso esce dalla cartella della sessione', 'GIT_PATH_INVALID');
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
  if (typeof testo !== 'string') throw new GitServiceError('Uscita di git non leggibile', 'GIT_COMMAND_FAILED');
  const campi = testo.split('\0');
  const voci = [];
  let i = 0;
  while (i < campi.length) {
    const riga = campi[i];
    i += 1;
    if (riga === '') continue; // la coda dopo l'ultimo NUL, e nient'altro
    if (riga.length < 4 || riga[2] !== ' ') {
      throw new GitServiceError('Riga di stato git non riconosciuta', 'GIT_COMMAND_FAILED');
    }
    const x = riga[0];
    const y = riga[1];
    const percorsoRepo = riga.slice(3);
    let daRepo = null;
    if (x === 'R' || x === 'C' || y === 'R' || y === 'C') {
      /* ⛔ Il campo in più c'è SOLO qui. Consumarlo sempre spezzerebbe l'allineamento di tutte le voci successive. */
      if (i >= campi.length) throw new GitServiceError('Rinomina senza percorso di origine', 'GIT_COMMAND_FAILED');
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
} = {}) {
  if (typeof cartellaDiSessione !== 'function') {
    throw new GitServiceError('Serve l’autorità sulla cartella di sessione', 'GIT_STORE_UNAVAILABLE');
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
  async function eseguiVero(cartella, argomenti, timeoutMs) {
    const policy = createProcessPolicy({
      allowedExecutables: ['git'],
      cwdRoot: cartella,
      envAllowlist: AMBIENTE_GIT,
    });
    return new Promise((esci) => {
      policy.execFile('git', argomenti, {
        cwd: cartella,
        encoding: 'buffer',
        timeout: timeoutMs,
        maxBuffer: TETTO_USCITA_BYTE,
        windowsHide: true,
      }, (errore, stdout, stderr) => {
        const fuori = Buffer.isBuffer(stdout) ? stdout.toString('utf8') : String(stdout ?? '');
        const errori = Buffer.isBuffer(stderr) ? stderr.toString('utf8') : String(stderr ?? '');
        if (!errore) { esci({ codice: 0, stdout: fuori, stderr: errori }); return; }
        esci({
          codice: typeof errore.code === 'number' ? errore.code : null,
          stdout: fuori,
          stderr: errori,
          scaduto: errore.killed === true || errore.signal != null,
          troppoGrande: errore.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',
          avvioFallito: errore.code === 'ENOENT',
        });
      });
    });
  }

  const eseguiGit = eseguiGitFn ?? eseguiVero;

  /** Lancia con i flag obbligatori davanti, e traduce ogni fallimento in un codice NOMINATO. */
  async function git(cartella, argomenti, { timeoutMs = timeoutLetturaMs, tollera = false } = {}) {
    const esito = await eseguiGit(cartella, [...FLAG_SEMPRE, ...argomenti], timeoutMs);
    if (esito.codice === 0) return esito;
    if (tollera) return esito;
    if (esito.troppoGrande) throw new GitServiceError('L’uscita di git supera il limite consentito', 'GIT_OUTPUT_TOO_LARGE');
    if (esito.scaduto) throw new GitServiceError('git non ha risposto entro il tempo massimo', 'GIT_TIMEOUT');
    if (esito.avvioFallito) throw new GitServiceError('git non è installato o non è raggiungibile', 'GIT_COMMAND_FAILED');
    const detto = String(esito.stderr || '').trim();
    if (/not a git repository/iu.test(detto)) {
      throw new GitServiceError('Questa cartella non è un repository git', 'GIT_NOT_A_REPOSITORY');
    }
    throw new GitServiceError(detto || 'git ha risposto con un errore', 'GIT_COMMAND_FAILED');
  }

  /** La cartella della sessione, o un rifiuto. ⛔ Mai un ripiego: un id ignoto non prende NIENTE. */
  function cartellaDi(sessionId) {
    if (typeof sessionId !== 'string' || sessionId === '') {
      throw new GitServiceError('Sessione non valida', 'QUERY_INVALID');
    }
    const cartella = cartellaDiSessione(sessionId);
    if (typeof cartella !== 'string' || cartella === '') {
      throw new GitServiceError('Sessione non trovata', 'NOT_FOUND');
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
    if (radiceRepo === '') throw new GitServiceError('Questa cartella non è un repository git', 'GIT_NOT_A_REPOSITORY');
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
    return { ...dove, voci, riepilogo };
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
      throw new GitServiceError('Serve almeno un percorso esplicito', 'GIT_PATHS_REQUIRED');
    }
    if (percorsi.length > 1000) {
      throw new GitServiceError('Troppi percorsi in una sola richiesta', 'GIT_PATHS_REQUIRED');
    }
    const puliti = percorsi.map((p) => normalizzaPercorso(cartella, p));
    return [...new Set(puliti)];
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
          throw new GitServiceError('Il commit vuole un messaggio', 'GIT_MESSAGE_REQUIRED');
        }
        if (Buffer.byteLength(messaggio, 'utf8') > TETTO_MESSAGGIO_BYTE) {
          throw new GitServiceError('Messaggio di commit troppo lungo', 'GIT_MESSAGE_REQUIRED');
        }

        const prima = await statoInterno(cartella);
        const perPercorso = new Map(prima.voci.map((v) => [v.percorso, v]));
        /* ⛔ Un percorso che git non ha niente da committare: lo diciamo NOI, invece di lasciare a git un «pathspec did not match any file(s)» che nessuno sa leggere. */
        const senzaNiente = puliti.filter((p) => !perPercorso.has(p));
        if (senzaNiente.length > 0) {
          throw new GitServiceError(`Niente da committare per: ${senzaNiente.join(', ')}`, 'GIT_NOTHING_TO_COMMIT');
        }
        /* ⛔⛔ La guardia della ricerca 4: staged E modificato dopo ⇒ il commit prenderebbe la versione nuova, in silenzio. */
        const divergenti = puliti.filter((p) => {
          const v = perPercorso.get(p);
          return v && v.staged && v.nonStaged;
        });
        if (divergenti.length > 0) {
          throw new GitServiceError(
            `Questi file sono cambiati dopo essere stati messi in stage, e il commit prenderebbe la versione nuova: ${divergenti.join(', ')}. Rimettili in stage e riprova.`,
            'GIT_WORKTREE_DIFFERS',
          );
        }
        const conflitti = puliti.filter((p) => perPercorso.get(p)?.conflitto);
        if (conflitti.length > 0) {
          throw new GitServiceError(`Prima vanno risolti i conflitti su: ${conflitti.join(', ')}`, 'GIT_NOTHING_TO_COMMIT');
        }

        cartellaMessaggio = await mkdtemp(join(tmpdir(), 'talos-git-msg-'));
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
        if (cartellaMessaggio) await rm(cartellaMessaggio, { recursive: true, force: true }).catch(() => {});
      }
    },
  });
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
    return { erroreAvvio: 'Comando git rifiutato dalla policy di processo', code: 'GIT_COMMAND_FAILED' };
  }
  if (typeof errore?.code === 'string' && (errore.code === 'CWD_NOT_ALLOWED' || errore.code === 'CWD_REQUIRED' || errore.code === 'CWD_NOT_FOUND' || errore.code === 'EXECUTABLE_NOT_ALLOWED')) {
    return { erroreAvvio: 'Cartella di lavoro non autorizzata per git', code: 'GIT_COMMAND_FAILED' };
  }
  return { erroreAvvio: errore?.message || 'git non è riuscito', code: 'GIT_COMMAND_FAILED' };
}
