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

import { existsSync as esisteSync, realpathSync as realpathSyncNativa } from 'node:fs';
import { homedir } from 'node:os';
import { basename as nomeBase, dirname as cartellaDi, relative as relativoA, resolve as risolvi, sep as separatore } from 'node:path';

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
  cartelleOvunque: Object.freeze(['.harness-ui-plugins', '.hooks-trust', '.mcp-trust', '.plugin-trust', '.claude', '.memory-store']),
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
  nomiFile: Object.freeze(['.netrc', '_netrc', '.npmrc', '.pypirc', '.pgpass', '.git-credentials', '.provider-runtime.json']),
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
 * I pezzi di un comando di shell che possono essere un percorso. ⛔ Non è un parser di shell e
 * non pretende di esserlo: si spezza su spazi e metacaratteri, perché quello che serve è
 * ACCORGERSI di un nome, non capire il comando. Un percorso fra virgolette CON spazi dentro si
 * spezza — dichiarato: è un innesco, e ciò che gli sfugge resta il comportamento di oggi.
 */
export function pezziDelComando(comando) {
  return String(comando ?? '').split(/[\s;|&<>()`"'=,]+/u).filter(Boolean);
}

/**
 * ⛔⛔⛔ CASO 1 — il testo NOMINA un percorso della classe dichiarata?
 * Vale sia per un comando intero (`cat ~/.ssh/id_rsa`) sia per un percorso solo
 * (`~/.aws/credentials`): un percorso è un comando di un pezzo solo.
 *
 * @returns {null | {classe: 'segreto'|'portachiavi', percorso: string}} `percorso` è il pezzo
 * COME LA PERSONA LO VEDRÀ, non risolto: chi risponde deve riconoscere ciò che ha davanti.
 */
export function nominaUnSegreto(testo, { home = homeDiSistema() } = {}) {
  const intero = String(testo ?? '');
  if (intero.trim() === '') return null;
  for (const frase of PERCORSI_SEGRETI.frasiPortachiavi) {
    if (frase.test(intero)) return { classe: 'portachiavi', percorso: intero.trim() };
  }
  for (const pezzo of pezziDelComando(intero)) {
    const classe = classeDelPezzo(pezzo, home);
    if (classe) return { classe, percorso: pezzo.replace(/^["'`]+/, '').replace(/["'`]+$/, '') };
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

/** La copia per la persona: lingua naturale, nessun nome tecnico, e DICE quale file. */
function frasePerLaPersona(segnalazione, tipo) {
  const azione = tipo === 'leggi'
    ? { soggetto: 'Questa lettura apre', coda: 'vuoi che la faccia?' }
    : { soggetto: 'Il comando tocca', coda: 'vuoi che lo esegua?' };
  if (segnalazione.classe === 'portachiavi') {
    const apre = tipo === 'leggi' ? 'Questa lettura apre' : 'Il comando apre';
    return `${apre} il portachiavi del sistema, dove sono custodite le password: ${azione.coda}`;
  }
  const cosa = segnalazione.classe === 'segreto'
    ? 'un file che può contenere chiavi o password'
    : 'una cartella nascosta fuori dalla cartella di lavoro';
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
export function motivoDaChiedere({ tipo, comando, percorso, cartella, home = homeDiSistema() } = {}) {
  const testo = tipo === 'leggi' ? percorso : comando;
  if (typeof testo !== 'string' || testo.trim() === '') return null;
  const nominato = nominaUnSegreto(testo, { home });
  if (nominato) return { ...nominato, frase: frasePerLaPersona(nominato, tipo) };
  for (const pezzo of pezziDelComando(testo)) {
    const fuori = esceDalWorkspaceVersoUnNascosto(pezzo, { cartella, home });
    if (fuori) return { ...fuori, frase: frasePerLaPersona(fuori, tipo) };
  }
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
    throw new PathPolicyError('Radice non valida', 'PATH_NOT_ALLOWED');
  }
  return resolve(root);
}

function validateCandidate(candidate) {
  if (typeof candidate !== 'string' || candidate.trim() === '' || candidate.includes('\0') || isAbsolute(candidate)) {
    throw new PathPolicyError('Percorso non valido', 'PATH_NOT_ALLOWED');
  }
  // Windows device paths, UNC e alternate data stream non sono percorsi di
  // workspace: non devono poter cambiare semantica fra API diverse.
  if (/^(?:\\\\\?\\|\\\\\.\\|\\\\)/u.test(candidate) || /(?:^|[\\/])[^\\/]+:[^\\/]*$/u.test(candidate)) {
    throw new PathPolicyError('Percorso speciale non consentito', 'PATH_NOT_ALLOWED');
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
  try { rootReal = await realpathFn(rootAbsolute); } catch { throw new PathPolicyError('Radice non leggibile', 'PATH_ROOT_UNREADABLE'); }
  const lexical = resolve(rootReal, relativeCandidate);
  if (!isPathInside(rootReal, lexical)) throw new PathPolicyError('Percorso fuori dall’area autorizzata', 'PATH_NOT_ALLOWED');
  let realCandidate;
  try {
    realCandidate = await realpathFn(lexical);
  } catch (error) {
    if (!options.allowMissing) throw new PathPolicyError('Percorso non trovato', 'PATH_NOT_FOUND');
    const parent = dirname(lexical);
    let parentReal;
    try { parentReal = await realpathFn(parent); } catch { throw new PathPolicyError('Cartella genitore non trovata', 'PATH_NOT_FOUND'); }
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
  try { handle = await openFn(realCandidate, flags); } catch { throw new PathPolicyError('File non leggibile', 'PATH_OPEN_FAILED'); }
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new PathPolicyError('Il percorso non è un file', 'PATH_NOT_FILE');
    return handle;
  } catch (error) {
    await handle.close().catch(() => {});
    if (error instanceof PathPolicyError) throw error;
    throw new PathPolicyError('File non leggibile', 'PATH_OPEN_FAILED');
  }
}
