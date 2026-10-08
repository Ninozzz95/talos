import { open, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

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

import { existsSync as esisteSync, readdirSync as elencaSync, realpathSync as realpathSyncNativa, lstatSync as lstatSyncNativa, readlinkSync as readlinkSyncNativa } from 'node:fs';
import { homedir } from 'node:os';
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
  file: Object.freeze(['.harness-ui-hooks.json', '.harness-ui-mcp.json', '.provider-runtime.json', 'CLAUDE.md', 'AGENTS.md']),
  // ⛔ 14/09 (F01/F02 della review, verificato): `.mcp-trust` e `.plugin-trust` sono i registri dove vivono i consensi ai
  //   server MCP e ai plugin (session-registry.mjs), esattamente come `.hooks-trust`. Mancavano da questo elenco: senza,
  //   un attrezzo di scrittura del modello poteva scriverci dentro e AUTO-CONCEDERSI la fiducia. `ePercorsoDiControllo`
  //   risolve già il realpath, quindi la classificazione vale anche per un alias/symlink verso queste cartelle.
  // ⭐ PO-26, parte 2 (24/09/2026): `.talos/` è la cartella della configurazione del progetto (hook, MCP, plugin, skill),
  //   quindi è controllo per intero, come `.claude/`.
  cartelleOvunque: Object.freeze(['.harness-ui-plugins', '.hooks-trust', '.mcp-trust', '.plugin-trust', '.claude', '.memory-store', '.talos']),
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
 * True se `percorso` (relativo al workspace o assoluto) tocca un file di
 * controllo. ⛔ Confronto sul percorso REALE: `../`, symlink e junction
 * che puntano a uno di quei file non lo aggirano. Mai un'eccezione: un
 * percorso che non si riesce a risolvere torna `true` (fallisce chiuso —
 * meglio una card di troppo che una regola riscritta in silenzio).
 */
export function ePercorsoDiControllo(cartella, percorso, { realpathFn = realpathSyncNativa } = {}) {
  if (typeof cartella !== 'string' || cartella.length === 0 || typeof percorso !== 'string' || percorso.length === 0) return false;
  let radice;
  let reale;
  try {
    radice = percorsoRealeAncheSeManca(risolvi(cartella), realpathFn);
    reale = percorsoRealeAncheSeManca(risolvi(cartella, percorso), realpathFn);
  } catch {
    return true;
  }
  if (FILE_DI_CONTROLLO.file.includes(nomeBase(reale))) return true;
  const relativo = relativoA(radice, reale);
  const dentro = relativo !== '' && !relativo.startsWith('..') && !relativo.includes(`..${separatore}`);
  const segmenti = (dentro ? relativo : reale).split(/[\\/]+/).filter(Boolean);
  const cartelle = segmenti.slice(0, -1);
  if (cartelle.some((s) => FILE_DI_CONTROLLO.cartelleOvunque.includes(s))) return true;
  if (dentro && cartelle.length > 0 && FILE_DI_CONTROLLO.cartelleAllaRadice.includes(cartelle[0])) return true;
  return false;
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
  nomiFile: Object.freeze(['.netrc', '_netrc', '.npmrc', '.pypirc', '.pgpass', '.git-credentials', '.provider-runtime.json', '.envrc']),
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
function segmentiDi(normalizzato) {
  return normalizzato.split('/').filter((s) => s !== '' && s !== '.' && s !== '..');
}

function eEsente(base) {
  return PERCORSI_SEGRETI.esenzioni.some((e) => base.endsWith(e));
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
  return false;
}

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
export function eUnFileSegreto(percorso, { home = homeDiSistema() } = {}) {
  return typeof percorso === 'string' && classeDelPezzo(percorso, home) !== null;
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

/** Il testo fra doppi apici a partire da `da` (dopo l'apice): toglie gli escape che bash toglie lì, `$..` e apici inversi diventano il jolly. */
function dentroDoppie(t, da) {
  let fuori = '';
  for (let i = da; i < t.length; i += 1) {
    const c = t[i];
    if (c === '"') return { testo: fuori, fine: i };
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
function paroleDellaShell(testo) {
  const t = String(testo ?? '');
  const parole = [];
  let corrente = '';
  let graffe = 0;
  let tonde = 0;
  const chiudi = (separatore) => {
    if (corrente !== '') parole.push({ testo: corrente, chiamata: separatore === '(' && /[A-Za-z0-9_]$/u.test(corrente) });
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
    if (c === '\\') {
      const n = t[i + 1];
      if (n === undefined) continue;
      if (n === '\n') { i += 1; continue; }
      if (n === '\r' && t[i + 2] === '\n') { i += 2; continue; }
      corrente += n; i += 1; continue;
    }
    if (c === "'") { const fine = t.indexOf("'", i + 1); if (fine === -1) { corrente += t.slice(i + 1); break; } corrente += t.slice(i + 1, fine); i = fine; continue; }
    if (c === '"') { const r = dentroDoppie(t, i + 1); corrente += r.testo; i = r.fine; continue; }
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
function senzaCorpiDiHeredoc(testo) {
  const righe = String(testo ?? '').split('\n');
  const fuori = [];
  for (let i = 0; i < righe.length; i += 1) {
    const riga = righe[i];
    fuori.push(riga);
    const heredoc = riga.match(/<<-?\s*(['"]?)([A-Za-z_][\w-]*)\1/u);
    if (!heredoc || /\b(?:ba|z|da|k|c|fi|a)?sh\b|\bpwsh\b|\bpowershell\b|\bcmd\b/iu.test(riga.slice(0, heredoc.index))) continue;
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

/** Il passo delle parole della shell: stessa risposta di `nominaUnSegreto`, o null. */
function nominaUnSegretoPerGlob(testo, { home, cartella, elenca, puntiNascosti, orologio, bilancio: ereditato, profondita = 0 }) {
  const bilancio = ereditato ?? { cartelle: 0, nomi: 0, cache: new Map(), orologio, scadenza: orologio() + TETTI_GLOB_SEGRETI.millisecondi };
  /* v5: prima i comandi dentro le sostituzioni (al massimo quattro livelli: oltre, si chiede) */
  for (const interno of sostituzioniDiComando(senzaCorpiDiHeredoc(testo))) {
    if (profondita >= 4) return { classe: 'segreto', percorso: interno.slice(0, 120) };
    const trovato = nominaUnSegreto(interno, { home }) ?? nominaUnSegretoPerGlob(interno, { home, cartella, elenca, puntiNascosti, orologio, bilancio, profondita: profondita + 1 });
    if (trovato) return trovato;
  }
  /* il jolly non si mostra a una persona: al suo posto `…` */
  const prudente = (parola) => ({ classe: 'segreto', percorso: parola.split(JOLLY).join('…') });
  for (const { testo: parola, chiamata } of paroleDellaShell(senzaCorpiDiHeredoc(testo))) {
    if (chiamata) continue;
    /* una parola che è SOLO una sostituzione (`$FILE`, `"$X"`) può valere qualunque cosa: non si chiede per lei (dichiarato), solo per quelle che
       hanno almeno due caratteri scritti di loro (`.e${X}nv`, `${X}env`) */
    if (parola.includes(JOLLY) && parola.split(JOLLY).join('').replace(/[*?[\]/]/gu, '').length < 2) continue;
    const { parole, troppe } = espandiGraffe(parola);
    if (troppe) return prudente(parola);
    for (const p of parole) {
      if (!eUnGlob(p)) {
        /* v5: la parola dopo la rimozione delle virgolette (`.e""nv` = `.env`) passa dalla stessa grammatica di un nome scritto per intero */
        const classe = classeDelPezzo(p, home);
        if (classe) return { classe, percorso: p };
        continue;
      }
      const trovati = candidatiDelGlob(p, { home, cartella, elenca, puntiNascosti, bilancio });
      for (const candidato of trovati.candidati) {
        const classe = classeDelPezzo(candidato, home);
        if (classe) return { classe, percorso: candidato };
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
  home = homeDiSistema(), cartella, espandi = false, elenca = elencaDalDisco, puntiNascosti = process.platform === 'win32', orologio = () => performance.now(),
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
  if (espandi && /[*?[{'"\\$`^]|[@+!]\(/u.test(intero)) {
    /* Un modulo dentro un cancello di sicurezza non lancia: se il passo dei glob si rompe per un motivo che non so, CHIEDE (mai in silenzio). */
    try { return nominaUnSegretoPerGlob(intero, { home, cartella, elenca, puntiNascosti, orologio }); } catch { return { classe: 'segreto', percorso: intero.trim().slice(0, 120) }; }
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
 * Un pezzo che non esiste chiude il cammino (il resto si tiene com'è scritto). `null` = un salto porta in rete, o troppi salti.
 */
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
  return null;
}

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
    const stesso = process.platform === 'win32' ? reale.toLowerCase() === assoluto.toLowerCase() : reale === assoluto;
    if (stesso) return null;
    const radiceReale = conCartella ? percorsoVeroAParole(risolvi(cartella), fsSync) : null;
    if (conCartella && radiceReale === null) return null;
    const dentro = radiceReale !== null && isPathInside(radiceReale, reale);
    const daClassificare = dentro ? relativoA(radiceReale, reale) : reale;
    if (daClassificare === '') return null;
    const classe = classeDelPezzo(daClassificare, home);
    return classe ? { classe, percorso: `${grezzo} → ${reale}` } : null;
  } catch {
    return null;
  }
}

const LETTURE = new Set(['leggi', 'elenca']);

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
  'fuori-workspace|leggi': 'server.approval.read.outside',
  'fuori-workspace|elenca': 'server.approval.list.outside',
  'fuori-workspace-nascosto|leggi': 'server.approval.read.hiddenOutside',
  'fuori-workspace-nascosto|elenca': 'server.approval.list.hiddenOutside',
  'fuori-workspace-nascosto|shell': 'server.approval.command.hiddenOutside',
});
const FRASI_INGLESI = Object.freeze({
  'server.approval.read.keychain': "This read opens the system keychain, where passwords are kept: do you want me to do it?",
  'server.approval.list.keychain': "This listing opens the system keychain, where passwords are kept: do you want me to do it?",
  'server.approval.command.keychain': "The command opens the system keychain, where passwords are kept: do you want me to run it?",
  'server.approval.read.secret': "This read opens a file that may contain keys or passwords ({percorso}): do you want me to do it?",
  'server.approval.list.secret': "This listing opens a file that may contain keys or passwords ({percorso}): do you want me to do it?",
  'server.approval.command.secret': "The command touches a file that may contain keys or passwords ({percorso}): do you want me to run it?",
  'server.approval.read.outside': "This read opens a file outside the working folder ({percorso}): do you want me to do it?",
  'server.approval.list.outside': "This listing opens a folder outside the working folder ({percorso}): do you want me to do it?",
  'server.approval.read.hiddenOutside': "This read opens a hidden folder outside the working folder ({percorso}): do you want me to do it?",
  'server.approval.list.hiddenOutside': "This listing opens a hidden folder outside the working folder ({percorso}): do you want me to do it?",
  'server.approval.command.hiddenOutside': "The command touches a hidden folder outside the working folder ({percorso}): do you want me to run it?",
});

/** La copia per la persona: lingua naturale, nessun nome tecnico, e DICE quale file. Inglese + chiave + valori (K4b). */
function frasePerLaPersona(segnalazione, tipo) {
  const tipoDellaFrase = tipo === 'leggi' || tipo === 'elenca' ? tipo : 'shell';
  const fraseChiave = CHIAVI_DELLA_FRASE[`${segnalazione.classe}|${tipoDellaFrase}`];
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
    : tipo === 'elenca'
      ? { soggetto: 'This listing opens', coda: 'do you want me to do it?' }
      : { soggetto: 'The command touches', coda: 'do you want me to run it?' };
  if (segnalazione.classe === 'portachiavi') {
    const apre = tipo === 'leggi' ? 'This read opens' : tipo === 'elenca' ? 'This listing opens' : 'The command opens';
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
export function motivoDaChiedere({ tipo, comando, percorso, cartella, home = homeDiSistema(), accessoPieno = false, elenca, puntiNascosti, orologio, fsSync } = {}) {
  const lettura = LETTURE.has(tipo);
  const testo = lettura ? percorso : comando;
  if (typeof testo !== 'string' || testo.trim() === '') return null;
  /* `elenca`, `puntiNascosti` e `fsSync` (lstat/readlink) sono per le prove: in produzione valgono il disco vero e la regola del sistema operativo. */
  const nominato = nominaUnSegreto(testo, { home, cartella, espandi: !lettura, ...(elenca ? { elenca } : {}), ...(puntiNascosti === undefined ? {} : { puntiNascosti }), ...(orologio ? { orologio } : {}) });
  if (nominato) return { ...nominato, ...frasePerLaPersona(nominato, tipo) };
  /* LINK-SEGRETO: il nome è innocuo, il file vero dietro un collegamento no (vedi `bersaglioSegretoDiUnCollegamento`). */
  const collegato = lettura ? bersaglioSegretoDiUnCollegamento(testo, { cartella, home, ...(fsSync ? { fsSync } : {}) }) : null;
  if (collegato) return { ...collegato, ...frasePerLaPersona(collegato, tipo) };
  for (const pezzo of pezziDelComando(testo)) {
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
