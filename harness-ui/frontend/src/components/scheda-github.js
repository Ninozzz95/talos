/**
 * ⭐⭐⭐ F6-1 (26/09/2026) — LA SCHEDA «GitHub» DELLA BARRA DESTRA, parte LOCALE.
 *
 * Decisioni dell'owner su F6 (memoria `decisioni-owner-f6-github-26-09`, ledger `.claude/LEDGER-F6-GITHUB-2026-09-26.md`):
 * riferimento VS Code Source Control, tre parti una alla volta — questa è la prima: vedere le modifiche della cartella della
 * sessione, prepararle o toglierle, annullarle, guardarne il diff, committare ciò che è preparato.
 *
 * Letto nel codice di VS Code (`TALOS-RICERCHE/concorrenti/vscode-2026-09-23/extensions/git/src`), non a memoria:
 *   · quattro gruppi, in quest'ordine: `merge`, `index`, `workingTree`, `untracked` (`repository.ts:1011-1014`) ⇒ qui
 *     Conflitti · Preparati · Modificati · Nuovi; un file preparato e poi cambiato ancora sta in DUE gruppi, come lì;
 *   · la casella del commit in cima, sopra i gruppi; senza niente di preparato si chiede se preparare tutto
 *     (`commands.ts:2419-2445`), e il pulsante dice cosa farà (Zed, `git_panel.rs:6269-6282`);
 *   · annullare è IRREVERSIBILE e si dice coi nomi (`commands.ts:2268-2277`).
 * ⛔ Il sistema di design è quello di TALOS (regola dell'owner, 04/09): la testata e i menu della scheda File
 *   (`talos-file-head`, `apriMenuAzioni`), le card della barra, la testata del lettore di F5 per il diff, e le righe del diff
 *   della chat (`talos-diff-chat`, `talos-diff__line`). Nessun colore nuovo.
 * ⛔ Più di due azioni su una riga ⇒ «⋯» e tasto destro, con lo STESSO menu (owner 10/09 e 13/09): in riga resta l'azione
 *   principale (Prepara o Togli), nel menu le altre, senza ripetere quella in riga.
 * ⛔ Questo modulo non parla col server: riceve lo stato e chiama `api.*`. Chi lo monta (`legacy/app.js`) fa le richieste.
 *
 * ⭐ F6-1 passo 3 (stessa decisione: «F6-1 comprende anche» ultimo commit, rami, stash, storia senza grafo):
 *   · il ramo nella testata è un pulsante col menu dei rami (VS Code: il selettore dei rami, `commands.ts` checkout/branch);
 *   · modifica e annulla dell'ultimo commit nel «⋯» della testata; annullare rimette il messaggio nella casella
 *     (VS Code `commands.ts:2780-2806`, `undoCommit`); un commit già inviato non si riscrive (decisione dell'owner);
 *   · un ramo non unito si elimina solo dopo l'avviso (VS Code `commands.ts:3330-3345`);
 *   · il nome di un ramo e la nota di ciò che si mette da parte si chiedono IN RIGA, come la casella veloce di VS Code, non
 *     con un modale sopra tutto; il rifiuto del server resta scritto lì, e il nome si corregge lì.
 */
import { linguaCorrenteDiT, t, tn } from './lingua.js';
import { testoDelCampo } from './testo-server.js'; // K4a: l'errore dell'installazione e quello dell'accesso arrivano dal server con la loro chiave
import { disegnoDellaRiga, disegnoSegnaposto, righeDelGrafo, soloDelRemoto } from './grafo-storia.js';

/* Il gruppo «Pull request»: nome breve di ogni voce → CHIAVE del dizionario (`github.pullRequest.*`). I nomi brevi sono quelli del codice; il testo sta nel dizionario, in italiano e in inglese. */
const CHIAVI_PR = Object.freeze({
  "gruppo": "github.pullRequest.group.title",
  "leggo": "github.pullRequest.group.loading",
  "aggiorna": "github.pullRequest.group.refresh",
  "suGithub": "github.pullRequest.group.openOnGitHub",
  "altreAzioni": "github.pullRequest.group.moreActions",
  "azioni": "github.pullRequest.group.actions",
  "aperteNelProgetto": "github.pullRequest.list.openInProject",
  "apri": "github.pullRequest.row.openOnGitHub",
  "aperta": "github.pullRequest.state.open",
  "bozza": "github.pullRequest.state.draft",
  "unita": "github.pullRequest.state.merged",
  "chiusa": "github.pullRequest.state.closed",
  "tua": "github.pullRequest.row.yours",
  "inBozza": "github.pullRequest.row.draftTag",
  "nessunControllo": "github.pullRequest.checks.none",
  "mostraControlli": "github.pullRequest.checks.show",
  "controlliFiniti": "github.pullRequest.checks.finished",
  "nessunaPr": "github.pullRequest.list.noneForBranch",
  "crea": "github.pullRequest.create.action",
  "creo": "github.pullRequest.create.creating",
  "creata": "github.pullRequest.create.created",
  "ramoPrincipale": "github.pullRequest.create.onDefaultBranch",
  "ghAssente": "github.pullRequest.cli.missing",
  "ghVecchia": "github.pullRequest.cli.tooOld",
  "ghScarica": "github.pullRequest.cli.download",
  "ghScarico": "github.pullRequest.cli.downloading",
  "ghSpiega": "github.pullRequest.cli.explainMissing",
  "ghVecchiaSpiega": "github.pullRequest.cli.explainTooOld",
  "ghNonInstallabile": "github.pullRequest.cli.notDownloadable",
  "ghPagina": "github.pullRequest.cli.openPage",
  "ghPronta": "github.pullRequest.cli.ready",
  "scollegato": "github.pullRequest.connect.notConnected",
  "collegaSpiega": "github.pullRequest.connect.explain",
  "collega": "github.pullRequest.connect.action",
  "collegaCodice": "github.pullRequest.connect.pasteCode",
  "codice": "github.pullRequest.connect.codeLabel",
  "copiaCodice": "github.pullRequest.connect.copyCode",
  "codiceCopiato": "github.pullRequest.connect.codeCopied",
  "apriGithub": "github.pullRequest.connect.openGithub",
  "annulla": "github.pullRequest.common.cancel",
  "collegato": "github.pullRequest.connect.connected",
  "account": "github.pullRequest.connect.account",
  "codiceScaduto": "github.pullRequest.connect.codeExpired",
  "nonGithub": "github.pullRequest.error.notGithub",
  "nessunRemoto": "github.pullRequest.error.noRemote",
  "staccata": "github.pullRequest.error.detachedHead",
  "nuova": "github.pullRequest.form.title",
  "preparoBozza": "github.pullRequest.form.preparing",
  "base": "github.pullRequest.form.base",
  "scegliBase": "github.pullRequest.form.chooseBase",
  "basi": "github.pullRequest.form.baseBranches",
  "baseAssente": "github.pullRequest.form.baseMissing",
  "titolo": "github.pullRequest.form.titleField",
  "testo": "github.pullRequest.form.description",
  "bozzaCasella": "github.pullRequest.form.asDraft",
  "bozzaSpiega": "github.pullRequest.form.draftHint",
  "serveTitolo": "github.pullRequest.form.titleRequired",
  "pubblicaPrima": "github.pullRequest.form.publishFirst",
  "primaScarica": "github.pullRequest.form.pullFirst",
  "aspettaInvio": "github.pullRequest.form.waitsForPush",
  "unFallito": "github.pullRequest.checks.failedOne",
  "piuFalliti": "github.pullRequest.checks.failedMany",
  "unInCorso": "github.pullRequest.checks.runningOne",
  "piuInCorso": "github.pullRequest.checks.runningMany",
  "unAnnullato": "github.pullRequest.checks.cancelledOne",
  "piuAnnullati": "github.pullRequest.checks.cancelledMany",
  "unPassato": "github.pullRequest.checks.passedOne",
  "piuPassati": "github.pullRequest.checks.passedMany",
  "unSaltato": "github.pullRequest.checks.skippedOne",
  "piuSaltati": "github.pullRequest.checks.skippedMany",
  "unDaInviare": "github.pullRequest.form.toPushOne",
  "piuDaInviare": "github.pullRequest.form.toPushMany",
  "unCommit": "github.pullRequest.form.commitsOne",
  "piuCommit": "github.pullRequest.form.commitsMany",
  "oltreCommit": "github.pullRequest.form.commitsOrMore",
  "esitoFallito": "github.pullRequest.outcome.failed",
  "esitoInCorso": "github.pullRequest.outcome.running",
  "esitoAnnullato": "github.pullRequest.outcome.cancelled",
  "esitoPassato": "github.pullRequest.outcome.passed",
  "esitoSaltato": "github.pullRequest.outcome.skipped"
});

/** L'ordine e i nomi dei gruppi (VS Code, `repository.ts:1011-1014`). Il titolo è un getter: segue la lingua a ogni lettura. */
export const GRUPPI = Object.freeze([
  Object.freeze({ chiave: 'conflitti', get titolo() { return t('github.groups.conflicts'); } }),
  Object.freeze({ chiave: 'preparati', get titolo() { return t('github.groups.staged'); } }),
  Object.freeze({ chiave: 'modificati', get titolo() { return t('github.groups.modified'); } }),
  Object.freeze({ chiave: 'nuovi', get titolo() { return t('github.groups.new'); } }),
]);

/**
 * Le voci dello stato (`GET /git/status`) nei quattro gruppi. Un file preparato E cambiato dopo sta in Preparati e in
 * Modificati: sono due modifiche diverse, e si preparano (o si annullano) separatamente.
 */
export function raggruppaVoci(voci = []) {
  const gruppi = { conflitti: [], preparati: [], modificati: [], nuovi: [] };
  for (const v of Array.isArray(voci) ? voci : []) {
    if (!v || v.tipo === 'ignorato') continue;
    if (v.conflitto) { gruppi.conflitti.push(v); continue; }
    if (v.tipo === 'nonTracciato') { gruppi.nuovi.push(v); continue; }
    if (v.staged) gruppi.preparati.push(v);
    if (v.nonStaged) gruppi.modificati.push(v);
  }
  return gruppi;
}

/* Le parole che spiegano la lettera dello stato: voci di dizionario, risolte con t() a ogni uso. */
const PAROLA_DI = Object.freeze({ M: 'github.files.status.modified', A: 'github.files.status.added', D: 'github.files.status.deleted', R: 'github.files.status.renamed', C: 'github.files.status.copied', T: 'github.files.status.typeChanged', U: 'github.files.status.untracked', '!': 'github.files.status.conflict' });

/** La lettera che VS Code mette accanto al file, e la parola che la spiega a chi non la conosce. */
export function letteraStato(voce, gruppo) {
  if (gruppo === 'conflitti') return { lettera: '!', parola: t(PAROLA_DI['!']) };
  if (gruppo === 'nuovi') return { lettera: 'U', parola: t(PAROLA_DI.U) };
  const grezza = gruppo === 'preparati' ? voce?.x : voce?.y;
  const lettera = PAROLA_DI[grezza] ? grezza : 'M';
  return { lettera, parola: t(PAROLA_DI[lettera]) };
}

/**
 * Il testo di `git diff` (formato unificato) nella STESSA forma a pezzi che la chat disegna (`diff-hunk.js`,
 * `creaDiffInChat`): `{ daRiga, aRiga, righe:[{ tipo:'add'|'del'|'ctx', numero, testo }] }`.
 * ⛔ L'intestazione `@@ -a,b +c,d @@` non si mostra: è la sintassi di git (regola dell'owner sui nomi tecnici). Il pezzo porta
 *   le righe del file NUOVO, e chi disegna le dice a parole.
 * ⛔ Il numero di una riga tolta è quello del file VECCHIO, quello di una aggiunta o di contesto è del file nuovo.
 */
export function analizzaDiffUnificato(testo) {
  const pezzi = [];
  let aggiunte = 0;
  let rimozioni = 0;
  let pezzo = null;
  let vecchia = 0;
  let nuova = 0;
  for (const riga of String(testo ?? '').split('\n')) {
    const intestazione = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/u.exec(riga);
    if (intestazione) {
      vecchia = Number(intestazione[1]);
      nuova = Number(intestazione[3]);
      const quante = intestazione[4] === undefined ? 1 : Number(intestazione[4]);
      pezzo = { daRiga: quante === 0 ? null : nuova, aRiga: quante === 0 ? null : nuova + quante - 1, righe: [] };
      pezzi.push(pezzo);
      continue;
    }
    if (!pezzo) continue; // l'intestazione del file (diff --git, index, ---, +++): non è contenuto
    if (riga.startsWith('\\')) continue; // «\ No newline at end of file»
    const segno = riga[0];
    const corpo = riga.slice(1);
    if (segno === '+') { pezzo.righe.push({ tipo: 'add', numero: nuova, testo: corpo }); nuova += 1; aggiunte += 1; }
    else if (segno === '-') { pezzo.righe.push({ tipo: 'del', numero: vecchia, testo: corpo }); vecchia += 1; rimozioni += 1; }
    else if (segno === ' ') { pezzo.righe.push({ tipo: 'ctx', numero: nuova, testo: corpo }); vecchia += 1; nuova += 1; }
  }
  return { pezzi, aggiunte, rimozioni };
}

/**
 * ⭐ F6-1 passo 3 — «3 ore fa» nella lingua dell'interfaccia, con `Intl.RelativeTimeFormat`: nessuna frase nostra da tradurre.
 * `null` se la data non si legge — un'età non si inventa.
 */
export function tempoFa(iso, lingua = 'it', adesso = Date.now()) {
  const quando = Date.parse(iso ?? '');
  if (Number.isNaN(quando)) return null;
  const secondi = Math.round((quando - adesso) / 1000);
  const formato = new Intl.RelativeTimeFormat(lingua, { numeric: 'auto' });
  for (const [unita, durata] of [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]]) {
    if (Math.abs(secondi) >= durata) return formato.format(Math.round(secondi / durata), unita);
  }
  return formato.format(0, 'second');
}

/**
 * Il soggetto che git dà a una voce messa da parte: «On main: nota», oppure — senza nota — «WIP on main: abc1234 soggetto».
 * `automatica` = la nota l'ha scritta git, non la persona.
 */
export function leggiAccantonato(soggetto) {
  const testo = String(soggetto ?? '');
  const conNota = /^On ([^:]+): ([\s\S]*)$/u.exec(testo);
  if (conNota) return { ramo: conNota[1], nota: conNota[2], automatica: false };
  const senza = /^WIP on ([^:]+): ([\s\S]*)$/u.exec(testo);
  if (senza) return { ramo: senza[1], nota: senza[2], automatica: true };
  return { ramo: null, nota: testo, automatica: false };
}

/* ═══════════ F6-3 (27/09/2026) — le pull request: le parti pure ═══════════ */

/**
 * I cinque esiti di un controllo, come `gh pr checks` (`pkg/cmd/pr/checks/aggregate.go:72-88`), in ordine di importanza. Ognuno
 * ha la sua ICONA e la sua parola: lo stato non sta solo nel colore (i colori sono quelli del tema, `scheda-github.css`).
 */
export const ESITI_CONTROLLO = Object.freeze(['fallito', 'in-corso', 'annullato', 'passato', 'saltato']);
const ICONA_ESITO = Object.freeze({ fallito: 'i-x', 'in-corso': 'i-clock', annullato: 'i-stop', passato: 'i-check', saltato: 'i-minus' });
const CONTEGGIO_DI = Object.freeze({ fallito: 'falliti', 'in-corso': 'inCorso', annullato: 'annullati', passato: 'passati', saltato: 'saltati' });

/** Tutte le voci del gruppo «Pull request»: una sola lista, che un test di copertura legge (`i18n-copertura.test.mjs`). Sono CHIAVI del dizionario: il testo lo dà `t()` nella lingua corrente. */
export const TESTI_PR = CHIAVI_PR;

const PAROLA_ESITO = Object.freeze({ fallito: CHIAVI_PR.esitoFallito, 'in-corso': CHIAVI_PR.esitoInCorso, annullato: CHIAVI_PR.esitoAnnullato, passato: CHIAVI_PR.esitoPassato, saltato: CHIAVI_PR.esitoSaltato });
const FRASE_ESITO = Object.freeze({
  fallito: [CHIAVI_PR.unFallito, CHIAVI_PR.piuFalliti], 'in-corso': [CHIAVI_PR.unInCorso, CHIAVI_PR.piuInCorso], annullato: [CHIAVI_PR.unAnnullato, CHIAVI_PR.piuAnnullati],
  passato: [CHIAVI_PR.unPassato, CHIAVI_PR.piuPassati], saltato: [CHIAVI_PR.unSaltato, CHIAVI_PR.piuSaltati],
});

/** Gli esiti presenti, col loro numero, dal più importante: `[{ esito:'fallito', n:1 }, …]`. Nessun controllo ⇒ `[]`. */
export function riassuntoControlli(conteggi) {
  if (!conteggi || typeof conteggi !== 'object') return [];
  return ESITI_CONTROLLO.map((esito) => ({ esito, n: Number(conteggi[CONTEGGIO_DI[esito]]) || 0 })).filter((v) => v.n > 0);
}

/** «1 fallito, 1 in corso, 3 passati» nella lingua dell'interfaccia. */
export function fraseControlli(conteggi) {
  return riassuntoControlli(conteggi).map(({ esito, n }) => tn(FRASE_ESITO[esito][0], FRASE_ESITO[esito][1], n)).join(', ');
}

function el(doc, tag, classe = '', testo = null) {
  const n = doc.createElement(tag);
  if (classe) n.className = classe;
  if (testo !== null && testo !== undefined) n.textContent = testo;
  return n;
}

/* ⭐ F6-2 passo 3 — l'altezza di una riga della storia: il grafo la disegna, il CSS la impone
   (`.talos-github-storia > .talos-github-riga--commit` in `scheda-github.css`). Due numeri uguali, come i 22 px di VS Code
   (`scmHistory.ts:20` e `media/scm.css:163`); la prova GITHUB-F62-GRAFO li confronta a schermo. */
const ALTEZZA_RIGA_STORIA = 50; // ⛔ misurata: le due righe di testo chiedono 49 px; a 44 le discendenti si tagliavano (27/09)
/* F6-2 passo 4: le righe dei file sotto un commit aperto — anche loro alte quanto il segnaposto che le attraversa (`scheda-github.css`) */
const ALTEZZA_RIGA_FILE_STORIA = 32;

/**
 * Il disegno di una riga del grafo come SVG decorativo: il testo accanto dice già tutto.
 * ⛔ `larghezza` è quella della riga PIÙ larga della lista, non della riga: VS Code allarga il disegno riga per riga
 *   (`scmHistory.ts:272`) e il testo parte a x diverse; qui la lista è una colonna sola (foto del 27/09: «In uscita» e «Primo
 *   commit» 11 px più a destra di «Dal remoto…»). Il disegno resta ancorato a sinistra.
 */
function grafoDellaRiga(doc, disegno, larghezza) {
  const NS = 'http://www.w3.org/2000/svg';
  const d = disegno;
  const svg = doc.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'talos-github-grafo');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', String(larghezza));
  svg.setAttribute('height', String(d.altezza));
  svg.setAttribute('viewBox', `0 0 ${larghezza} ${d.altezza}`);
  for (const tratto of d.tratti) {
    const p = doc.createElementNS(NS, 'path');
    p.setAttribute('d', tratto.d);
    p.setAttribute('data-colore', tratto.colore);
    svg.append(p);
  }
  for (const c of d.cerchi) {
    const cerchio = doc.createElementNS(NS, 'circle');
    cerchio.setAttribute('cx', String(c.cx));
    cerchio.setAttribute('cy', String(c.cy));
    cerchio.setAttribute('r', String(c.r));
    cerchio.setAttribute('stroke-width', String(c.spessore));
    cerchio.setAttribute('data-ruolo', c.ruolo);
    if (c.colore) cerchio.setAttribute('data-colore', c.colore);
    svg.append(cerchio);
  }
  return svg;
}

function icona(doc, id) {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'i');
  svg.setAttribute('aria-hidden', 'true');
  const use = doc.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${id}`);
  svg.append(use);
  return svg;
}

function bottoneIcona(doc, id, etichetta, fai) {
  const b = el(doc, 'button', 'talos-button talos-button--ghost talos-button--sm talos-icon-button');
  b.type = 'button';
  b.setAttribute('aria-label', etichetta);
  b.title = etichetta;
  b.append(icona(doc, id));
  b.addEventListener('click', fai);
  return b;
}

function bottoneTesto(doc, testo, fai, variante = 'ghost') {
  const b = el(doc, 'button', `talos-button talos-button--${variante} talos-button--sm`, testo);
  b.type = 'button';
  b.addEventListener('click', fai);
  return b;
}

const nomeDi = (percorso) => String(percorso).replace(/\/$/u, '').split('/').pop() || percorso;
const cartellaDi = (percorso) => {
  const parti = String(percorso).replace(/\/$/u, '').split('/');
  return parti.length > 1 ? parti.slice(0, -1).join('/') : '';
};

/**
 * @param {object} p
 * @param {Document} [p.doc]
 * @param {HTMLElement} p.radice il pannello `#railGithub`
 * @param {object} p.api ogni funzione torna una Promise; un errore porta `code` e `message`
 * @param {(percorso:string, area:'preparato'|'lavoro')=>Promise<object>} p.api.diff
 * @param {(percorsi:string[])=>Promise<object>} p.api.prepara  torna lo stato nuovo in `.stato`
 * @param {(percorsi:string[])=>Promise<object>} p.api.togli
 * @param {(percorsi:string[])=>Promise<object>} p.api.annulla
 * @param {(messaggio:string, impronta:string)=>Promise<object>} p.api.committa
 * @param {()=>void} p.api.ricarica
 * @param {(percorso:string)=>void} [p.api.apriFile]
 * @param {(opzioni:object)=>Promise<boolean>} p.conferma  la finestra modale di conferma (`apriConfermaRun`)
 * @param {(voci:Array, posizione:object)=>void} p.menu  il menu condiviso (`apriMenuAzioni`)
 * @param {(titolo:string, testo?:string)=>void} [p.avvisa]
 * @param {(elemento:HTMLElement, attivo:boolean)=>void} [p.onSchermoIntero]
 */
export function creaSchedaGithub({ doc = globalThis.document, radice, api, conferma, menu, avvisa = () => {}, onSchermoIntero = null }) {
  // «Commit recenti» nasce chiuso: la storia si legge solo quando la si apre. F6-3: anche «Pull request» — GitHub si chiama
  // solo quando la persona apre il gruppo, mai a ogni rilettura della scheda (che avviene a ogni fine giro)
  const stato = { dati: null, errore: null, nonRepository: false, vista: 'elenco', diff: null, messaggio: '', occupato: false, chiusi: new Set(['storia', 'pr']), schermoIntero: false, richiesta: null, modifica: null, accantonati: [], storia: null, generando: false, storiaAperte: new Map(), pr: null, modulo: null };
  const elenco = el(doc, 'div', 'talos-github');
  elenco.dataset.c = 'SchedaGithub';
  const vistaDiff = el(doc, 'section', 'talos-lettore talos-github-diff');
  vistaDiff.hidden = true;
  radice.replaceChildren(elenco, vistaDiff);

  const voceDi = (percorso) => stato.dati?.voci?.find((v) => v.percorso === percorso) ?? null;

  /** Ogni azione passa da qui: una alla volta, e un errore diventa un avviso con le parole del server, poi si rilegge. */
  async function esegui(fai, { dopo = null, gestisci = null } = {}) {
    if (stato.occupato) return null;
    stato.occupato = true;
    radice.setAttribute('aria-busy', 'true');
    try {
      const esito = await fai();
      if (Array.isArray(esito?.accantonati)) stato.accantonati = esito.accantonati;
      if (esito?.stato) mostraStato(esito.stato);
      dopo?.(esito);
      return esito;
    } catch (errore) {
      // `gestisci` (sincrona) dice se l'errore l'ha preso chi chiama: allora niente avviso e niente rilettura
      if (gestisci?.(errore)) return null;
      avvisa(t("github.common.failed"), errore?.message || t("github.common.gitFailed"));
      api.ricarica?.();
      return null;
    } finally {
      stato.occupato = false;
      radice.removeAttribute('aria-busy');
    }
  }

  const prepara = (percorsi) => esegui(() => api.prepara(percorsi));
  const togli = (percorsi) => esegui(() => api.togli(percorsi));

  async function annulla(percorsi) {
    const nuovi = percorsi.filter((p) => voceDi(p)?.tipo === 'nonTracciato');
    const tracciati = percorsi.filter((p) => !nuovi.includes(p));
    const righe = [];
    if (tracciati.length) righe.push([tn("github.discard.revertsOne", "github.discard.revertsMany", tracciati.length), tracciati.join(', ')]);
    if (nuovi.length) righe.push([tn("github.discard.deletedOne", "github.discard.deletedMany", nuovi.length), nuovi.join(', ')]);
    const si = await conferma({
      titolo: tn("github.discard.titleOne", "github.discard.titleMany", percorsi.length),
      testo: t("github.discard.warning"),
      righe,
      conferma: t("github.discard.action"),
      pericolo: true,
    });
    if (!si) return;
    await esegui(() => api.annulla(percorsi), { dopo: () => { if (stato.vista === 'diff' && percorsi.includes(stato.diff?.percorso)) chiudiDiff(); } });
  }

  async function committa() {
    const dati = stato.dati;
    if (!dati || stato.messaggio.trim() === '') return;
    if (stato.modifica) {
      const { commit } = stato.modifica;
      const messaggio = stato.messaggio;
      await esegui(() => api.modifica(messaggio, dati.impronta, commit), {
        dopo: (esito) => {
          if (!esito) return;
          stato.modifica = null;
          stato.messaggio = '';
          disegnaElenco();
          avvisa(t("github.commit.amended"), `${String(esito.commit || '').slice(0, 7)} · ${messaggio.split('\n')[0]}`);
        },
      });
      return;
    }
    const g = raggruppaVoci(dati.voci);
    if (g.preparati.length === 0) {
      const tutti = [...g.modificati, ...g.nuovi].map((v) => v.percorso);
      if (tutti.length === 0) return;
      const si = await conferma({
        titolo: t("github.commit.nothingStaged"),
        testo: tn("github.commit.stageAllOne", "github.commit.stageAllMany", tutti.length),
        righe: [[t("github.common.files"), tutti.join(', ')]],
        conferma: t("github.commit.stageAllAndCommit"),
      });
      if (!si) return;
      const preparato = await esegui(() => api.prepara(tutti));
      if (!preparato?.stato) return;
    }
    const messaggio = stato.messaggio;
    await esegui(() => api.committa(messaggio, stato.dati.impronta), {
      dopo: (esito) => {
        if (!esito) return;
        stato.messaggio = '';
        disegnaElenco();
        avvisa(t("github.commit.done"), `${String(esito.commit || '').slice(0, 7)} · ${messaggio.split('\n')[0]}`);
      },
    });
  }

  /* ═══════════ F6-1 passo 3 — la richiesta in riga ═══════════ */

  function chiediInRiga({ titolo, etichetta, valore = '', verbo, facoltativo = false, fai }) {
    stato.richiesta = { titolo, etichetta, valore, verbo, facoltativo, fai, errore: null };
    disegnaElenco();
    const campo = elenco.querySelector('.talos-github-richiesta__campo');
    campo?.focus();
    campo?.select();
  }

  function chiudiRichiesta() {
    stato.richiesta = null;
    disegnaElenco();
    elenco.querySelector('.talos-github__ramo')?.focus({ preventScroll: true });
  }

  async function confermaRichiesta() {
    const r = stato.richiesta;
    if (!r || stato.occupato) return;
    const valore = r.valore.trim();
    if (!valore && !r.facoltativo) return;
    let rifiuto = null;
    const esito = await esegui(() => r.fai(valore), { gestisci: (errore) => { rifiuto = errore?.message || t("github.common.failed"); return true; } });
    if (stato.richiesta !== r) return;
    if (rifiuto) {
      r.errore = rifiuto;
      disegnaElenco();
      elenco.querySelector('.talos-github-richiesta__campo')?.focus();
      return;
    }
    if (esito) chiudiRichiesta();
  }

  function disegnaRichiesta() {
    const r = stato.richiesta;
    const carta = el(doc, 'form', 'talos-card talos-inspector-card talos-github-richiesta');
    carta.setAttribute('aria-label', r.titolo);
    carta.noValidate = true;
    carta.append(el(doc, 'p', 'talos-github-richiesta__titolo', r.titolo));
    const campo = el(doc, 'input', 'talos-field__input talos-github-richiesta__campo');
    campo.type = 'text';
    campo.value = r.valore;
    campo.placeholder = r.etichetta;
    campo.setAttribute('aria-label', r.etichetta);
    campo.spellcheck = false;
    campo.autocomplete = 'off';
    campo.dataset.fuoco = 'richiesta';
    const si = el(doc, 'button', 'talos-button talos-button--primary talos-button--sm', r.verbo);
    si.type = 'submit';
    const aggiorna = () => { si.disabled = !r.facoltativo && r.valore.trim() === ''; };
    campo.addEventListener('input', () => { r.valore = campo.value; aggiorna(); });
    // ⛔ Esc chiude SOLO la richiesta: non deve arrivare alla catena di Esc della app (che chiuderebbe la colonna)
    campo.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); chiudiRichiesta(); } });
    carta.append(campo);
    if (r.errore) {
      const id = 'talos-github-richiesta-errore';
      const errore = el(doc, 'p', 'talos-field__error talos-github-richiesta__errore', r.errore);
      errore.id = id;
      errore.setAttribute('role', 'alert');
      campo.setAttribute('aria-invalid', 'true');
      campo.setAttribute('aria-describedby', id);
      carta.append(errore);
    }
    const piede = el(doc, 'div', 'talos-github-richiesta__piede');
    piede.append(bottoneTesto(doc, t("github.common.cancel"), () => chiudiRichiesta()), si);
    aggiorna();
    carta.append(piede);
    carta.addEventListener('submit', (e) => { e.preventDefault(); void confermaRichiesta(); });
    return carta;
  }

  /* ═══════════ F6-1 passo 3 — i rami ═══════════ */

  async function apriMenuRami(ancora) {
    let rami;
    try { rami = (await api.rami())?.rami ?? []; } catch (errore) { avvisa(t("github.common.failed"), errore?.message || t("github.common.gitFailed")); return; }
    const corrente = rami.find((r) => r.corrente) ?? null;
    const altri = rami.filter((r) => !r.corrente);
    const voci = altri.map((r) => ({ etichetta: t("github.branch.menu.switchTo", { name: r.nome }), icona: 'i-branch', azione: () => { void cambiaRamo(r.nome); } }));
    voci.push({ etichetta: t("github.branch.menu.newBranch"), icona: 'i-plus', azione: () => nuovoRamo(corrente?.nome ?? null) });
    if (corrente) voci.push({ etichetta: t("github.branch.menu.renameBranch", { name: corrente.nome }), icona: 'i-edit', azione: () => rinominaRamo(corrente.nome) });
    if (altri.length) {
      voci.push({
        etichetta: t("github.branch.menu.deleteBranch"), icona: 'i-trash', pericoloso: true,
        azione: () => menu(altri.map((r) => ({ etichetta: r.nome, icona: 'i-trash', pericoloso: true, azione: () => { void eliminaRamo(r.nome); } })), { ancoraEl: ancora, focusElement: ancora, fuoco: true, etichetta: t("github.branch.delete.title") }),
      });
    }
    menu(voci, { ancoraEl: ancora, focusElement: ancora, etichetta: t("github.branch.menu.title") });
  }

  const dopoIlRamo = (esito) => { if (esito) api.ricarica?.(); return esito; };
  const cambiaRamo = (nome) => esegui(() => api.cambiaRamo(nome), { dopo: dopoIlRamo });

  function nuovoRamo(da) {
    chiediInRiga({
      titolo: da ? t("github.branch.create.titleFrom", { name: da }) : t("github.branch.create.title"),
      etichetta: t("github.branch.create.nameLabel"),
      verbo: t("github.branch.create.action"),
      fai: (nome) => api.creaRamo(nome).then(dopoIlRamo),
    });
  }

  function rinominaRamo(nome) {
    chiediInRiga({
      titolo: t("github.branch.rename.title", { name: nome }),
      etichetta: t("github.branch.rename.newNameLabel"),
      valore: nome,
      verbo: t("github.branch.rename.action"),
      fai: (nuovo) => api.rinominaRamo(nome, nuovo).then(dopoIlRamo),
    });
  }

  async function eliminaRamo(nome) {
    let nonUnito = false;
    const fatto = (esito) => { if (esito) { avvisa(t("github.branch.delete.done"), nome); api.ricarica?.(); } };
    await esegui(() => api.eliminaRamo(nome, false), { dopo: fatto, gestisci: (errore) => { nonUnito = errore?.code === 'GIT_BRANCH_NOT_MERGED'; return nonUnito; } });
    if (!nonUnito) return;
    const si = await conferma({
      titolo: t("github.branch.delete.unmergedTitle", { name: nome }),
      testo: t("github.branch.delete.unmergedWarning"),
      conferma: t("github.branch.delete.anyway"),
      pericolo: true,
    });
    if (si) await esegui(() => api.eliminaRamo(nome, true), { dopo: fatto });
  }

  /* ═══════════ F6-1 passo 3 — l'ultimo commit ═══════════ */

  /** L'ultimo commit, se si può riscrivere; altrimenti lo dice e torna null. Il server ricontrolla comunque (HEAD e inviato). */
  async function ultimoRiscrivibile() {
    let storia;
    try { storia = await api.storia(); } catch (errore) { avvisa(t("github.common.failed"), errore?.message || t("github.common.gitFailed")); return null; }
    /* F6-2 passo 3: la storia porta anche il remoto, e col remoto davanti il primo della lista non è il nostro: si prende HEAD.
       ⛔ Col remoto molto avanti HEAD può restare FUORI dalla finestra dei 50: allora l'ultimo commit si fa da `testa` e dal
       messaggio intero che il server manda comunque, e «già inviato» lo decide il server (`GIT_COMMIT_PUSHED`, lo ricontrolla
       sempre) — prima la voce del menu non faceva niente, in silenzio. */
    const ultimo = storia?.commit?.find((c) => c.commit === storia.testa)
      ?? (storia?.testa
        ? { commit: storia.testa, breve: storia.testa.slice(0, 7), soggetto: String(storia.ultimoMessaggio ?? '').split('\n')[0], inviato: false }
        : storia?.commit?.[0]);
    if (!ultimo) return null;
    if (ultimo.inviato) {
      avvisa(t("github.commit.amend.alreadyPushed"), t("github.commit.amend.alreadyPushedExplain"));
      return null;
    }
    return { ...ultimo, messaggio: storia.ultimoMessaggio || ultimo.soggetto };
  }

  async function avviaModifica() {
    const ultimo = await ultimoRiscrivibile();
    if (!ultimo) return;
    stato.modifica = { commit: ultimo.commit, breve: ultimo.breve, messaggioPrima: stato.messaggio };
    stato.messaggio = ultimo.messaggio;
    disegnaElenco();
    elenco.querySelector('.talos-github-commit__messaggio')?.focus();
  }

  function lasciaStareModifica() {
    if (!stato.modifica) return;
    stato.messaggio = stato.modifica.messaggioPrima;
    stato.modifica = null;
    disegnaElenco();
    elenco.querySelector('.talos-github-commit__messaggio')?.focus();
  }

  async function annullaUltimoCommit() {
    const ultimo = await ultimoRiscrivibile();
    if (!ultimo) return;
    const si = await conferma({
      titolo: t("github.commit.undo.title"),
      testo: t("github.commit.undo.warning"),
      righe: [[t("github.common.commit"), `${ultimo.breve} · ${ultimo.soggetto}`]],
      conferma: t("github.commit.undo.action"),
    });
    if (!si) return;
    await esegui(() => api.annullaCommit(ultimo.commit), {
      dopo: (esito) => {
        if (!esito) return;
        stato.modifica = null;
        stato.messaggio = esito.messaggio ?? '';
        disegnaElenco();
        avvisa(t("github.commit.undo.done"), ultimo.soggetto);
      },
    });
  }

  /* ═══════════ F6-1 passo 3 — ciò che si mette da parte ═══════════ */

  function accantona(conNuovi) {
    chiediInRiga({
      titolo: conNuovi ? t("github.stash.actionWithNew") : t("github.stash.action"),
      etichetta: t("github.stash.noteOptional"),
      verbo: t("github.stash.confirm"),
      facoltativo: true,
      fai: (nota) => api.accantona(nota, conNuovi).then((esito) => { avvisa(t("github.stash.done"), nota); return esito; }),
    });
  }

  /* ═══════════ ✨ «Genera messaggio» e «Affida all'agente» (owner 26/09, F6 punti 4, 9, 10) ═══════════ */

  /**
   * Il modello della SESSIONE scrive il messaggio dal diff preparato (o dei file). Solo su clic: costa una chiamata vera.
   * La prima riga già scritta viaggia come traccia (come Zed, `git_panel.rs:4128-4141`); il risultato prende il posto del testo.
   */
  async function generaMessaggio() {
    if (stato.generando || stato.occupato) return;
    stato.generando = true;
    ridisegnaElenco();
    try {
      const esito = await esegui(() => api.generaMessaggio(stato.messaggio.split('\n')[0] ?? '', linguaCorrenteDiT()));
      if (typeof esito?.messaggio === 'string' && esito.messaggio.trim() !== '') stato.messaggio = esito.messaggio;
    } finally {
      stato.generando = false;
      ridisegnaElenco();
      elenco.querySelector('.talos-github-commit__messaggio')?.focus({ preventScroll: true });
    }
  }

  const riprendi = (voce) => esegui(() => api.riprendi(voce.indice, voce.commit), { dopo: (esito) => { if (esito) avvisa(t("github.stash.restored"), leggiAccantonato(voce.messaggio).nota); } });

  async function scarta(voce) {
    const { nota, automatica } = leggiAccantonato(voce.messaggio);
    const si = await conferma({
      titolo: t("github.stash.drop.title"),
      testo: t("github.stash.drop.warning"),
      righe: [[t("github.stash.drop.noteLabel"), automatica ? t("github.stash.noNote") : nota]],
      conferma: t("github.stash.drop.action"),
      pericolo: true,
    });
    if (si) await esegui(() => api.scarta(voce.indice, voce.commit), { dopo: (esito) => { if (esito) avvisa(t("github.stash.drop.done"), automatica ? '' : nota); } });
  }

  /* ═══════════ F6-2 (27/09/2026) — la sincronizzazione col remoto ═══════════
   * Decisioni dell'owner (memoria `decisioni-owner-f6-github-26-09`, punti 2 e 16-23; ricerca
   * `.claude/RICERCA-F6-2-SINCRONIZZAZIONE-2026-09-27.md`):
   *   · UN pulsante che cambia, come GitHub Desktop (`app/src/ui/toolbar/push-pull-button.tsx`): Pubblica il ramo / Scarica N /
   *     Invia N / Recupera, e accanto sempre ↓N ↑M e «Recuperato …» / «Mai recuperato» (`renderLastFetched`); le altre azioni
   *     valide nel «⋯» della testata;
   *   · Invia e Pubblica passano da una conferma che scrive remoto e ramo PRIMA del clic; Pubblica, con più remoti, sceglie il
   *     remoto nella conferma stessa (preselezionato come git); mai un invio forzato (il servizio non lo sa fare);
   *   · il recupero parte solo col clic e si può fermare; scarica e invia no (VS Code `supportCancellation:false`);
   *   · Scarica bloccato da file modificati ⇒ in riga «Metti da parte e scarica», che dopo le riprende (punto 20).
   */
  function azioneSinc(s) {
    if (!s || !Array.isArray(s.remoti) || s.remoti.length === 0 || !s.ramo) return null;
    if (!s.riferimento || s.riferimentoSparito) return 'pubblica';
    if (s.indietro > 0) return 'scarica';
    if (s.avanti > 0) return 'invia';
    return 'recupera';
  }

  const IN_CORSO = { recupera: 'github.sync.progress.fetching', scarica: 'github.sync.progress.pulling', invia: 'github.sync.progress.pushing', pubblica: 'github.sync.progress.publishing' };
  const ICONA_SINC = { recupera: 'i-history', scarica: 'i-download', invia: 'i-send', pubblica: 'i-send' };

  function etichettaSinc(azione, s) {
    if (azione === 'scarica') return t("github.sync.button.pull", { n: s.indietro });
    if (azione === 'invia') return t("github.sync.button.push", { n: s.avanti });
    if (azione === 'pubblica') return t("github.sync.button.publish");
    return t("github.sync.button.fetch");
  }

  function remotoPerRecupero(s) { return s?.riferimento?.remoto ?? s?.remotoPerInvio ?? null; }

  function faiSinc(azione) {
    if (azione === 'recupera') return recupera();
    if (azione === 'scarica') return scarica();
    if (azione === 'invia') return invia();
    if (azione === 'pubblica') return pubblica();
    return null;
  }

  /** Le azioni valide che NON sono quella del pulsante: vanno nel «⋯» della testata (riga e menu: intersezione vuota). */
  function vociSinc() {
    const s = stato.sinc;
    const principale = azioneSinc(s);
    if (!principale || stato.inCorso) return [];
    const voci = [];
    const remoto = remotoPerRecupero(s);
    if (principale !== 'recupera') voci.push({ etichetta: remoto ? t("github.sync.menu.fetchFromRemote", { remote: remoto }) : t("github.sync.menu.fetchFromAll"), icona: ICONA_SINC.recupera, azione: () => { void recupera(); } });
    if (principale !== 'scarica' && s.riferimento && !s.riferimentoSparito && s.indietro > 0) voci.push({ etichetta: t("github.sync.menu.pullFrom", { ref: s.riferimento.corto }), icona: ICONA_SINC.scarica, azione: () => { void scarica(); } });
    if (principale !== 'invia' && s.riferimento && !s.riferimentoSparito && s.avanti > 0 && s.indietro === 0) voci.push({ etichetta: t("github.sync.menu.pushTo", { ref: s.riferimento.corto }), icona: ICONA_SINC.invia, azione: () => { void invia(); } });
    return voci;
  }

  /** Esegue un'azione di rete: una alla volta, col pulsante che dice cosa sta facendo. */
  async function inRete(azione, fai, opzioni = {}) {
    if (stato.occupato || stato.inCorso) return null;
    stato.inCorso = azione;
    ridisegnaElenco();
    try {
      return await esegui(fai, opzioni);
    } finally {
      stato.inCorso = null;
      ridisegnaElenco();
    }
  }

  const prendiSinc = (esito) => { if (esito?.sincronizzazione) stato.sinc = esito.sincronizzazione; };
  /* F6-2 passo 3: un recupero sposta la punta del remoto senza toccare HEAD — la storia aperta si rilegge, chiusa si butta */
  function rileggiStoria() {
    if (!stato.storia) return;
    if (stato.chiusi.has('storia')) stato.storia = null;
    else void caricaStoria();
  }

  async function recupera() {
    let fermato = false;
    await inRete('recupera', () => api.recupera(stato.sinc?.riferimento ? null : remotoPerRecupero(stato.sinc)), {
      dopo: (esito) => { prendiSinc(esito); rileggiStoria(); },
      gestisci: (errore) => { if (errore?.code === 'GIT_ABORTED') { fermato = true; return true; } return false; },
    });
    if (fermato) avvisa(t("github.sync.fetchStopped"), '');
  }

  async function fermaRecupero() {
    try { await api.fermaRecupero(); } catch (errore) { avvisa(t("github.common.failed"), errore?.message || t("github.common.gitFailed")); }
  }

  function dopoScarica(esito) {
    if (!esito) return;
    prendiSinc(esito);
    if (esito.conflitti > 0) {
      stato.chiusi.delete('conflitti');
      avvisa(t("github.sync.pull.withConflicts"), tn("github.sync.pull.conflictsOne", "github.sync.pull.conflictsMany", esito.conflitti));
    } else if (esito.commitDopo && esito.commitDopo === esito.commitPrima) {
      avvisa(t("github.sync.pull.upToDate"), stato.sinc?.riferimento?.corto ?? '');
    } else {
      avvisa(t("github.sync.pull.done"), stato.sinc?.riferimento?.corto ?? '');
    }
  }

  async function scarica() {
    let bloccato = null;
    await inRete('scarica', () => api.scarica(), {
      dopo: dopoScarica,
      gestisci: (errore) => { if (errore?.code === 'GIT_WORKTREE_DIRTY') { bloccato = errore.message || ''; return true; } return false; },
    });
    if (bloccato !== null) {
      stato.bloccoScarica = { messaggio: bloccato };
      ridisegnaElenco();
      elenco.querySelector('.talos-github-blocco [data-fuoco="blocco-scarica"]')?.focus({ preventScroll: true });
    }
  }

  /** «Metti da parte e scarica»: lo stash di F6-1 (anche i file nuovi), lo scarica, e poi le modifiche tornano al loro posto. */
  async function accantonaEScarica() {
    stato.bloccoScarica = null;
    const rif = stato.sinc?.riferimento?.corto ?? '';
    const messo = await inRete('scarica', () => api.accantona(t("github.sync.pull.autoStashNote", { ref: rif }), true));
    const voce = messo?.accantonati?.[0];
    if (!voce) { ridisegnaElenco(); return; }
    const scaricato = await inRete('scarica', () => api.scarica(), { dopo: dopoScarica });
    if (!scaricato || scaricato.conflitti > 0) {
      avvisa(t("github.stash.notice.savedInStashes"), t("github.stash.notice.restoreLater"));
      return;
    }
    let ripreso = false;
    await esegui(() => api.riprendi(voce.indice, voce.commit), { dopo: (esito) => { ripreso = Boolean(esito); }, gestisci: () => true });
    if (ripreso) avvisa(t("github.stash.notice.restoredInPlace"), '');
    else { avvisa(t("github.stash.notice.savedInStashes"), t("github.stash.notice.restoreWouldConflict")); api.ricarica?.(); }
  }

  const urlDi = (s, nome) => { const r = s?.remoti?.find((x) => x.nome === nome); return r ? (r.urlInvio ?? r.url ?? '') : ''; };

  async function invia() {
    const s = stato.sinc;
    if (!s?.riferimento || s.riferimentoSparito) return pubblica();
    const remoto = s.riferimento.remoto;
    const si = await conferma({
      titolo: tn("github.sync.push.titleOne", "github.sync.push.titleMany", s.avanti, { remote: remoto }),
      testo: t("github.sync.push.warning", { branch: s.ramo, ref: s.riferimento.corto }),
      righe: [[t("github.common.remote"), [remoto, urlDi(s, remoto)].filter(Boolean).join(' — ')], [t("github.common.branch"), `${s.ramo} → ${s.riferimento.corto}`]],
      conferma: t("github.sync.push.confirm", { remote: remoto }), // il pulsante dice dove va (e una chiave generica «Invia» è del composer)
    });
    if (!si) return;
    await inRete('invia', () => api.invia(remoto), {
      dopo: (esito) => {
        if (!esito) return;
        prendiSinc(esito);
        if (stato.storia && !stato.chiusi.has('storia')) void caricaStoria(); // «solo qui» diventa «inviato»
        else stato.storia = null;
        avvisa(t("github.sync.push.done"), `${esito.ramo} → ${stato.sinc?.riferimento?.corto ?? esito.remoto}`);
      },
    });
  }

  async function pubblica() {
    const s = stato.sinc;
    if (!s?.ramo) return;
    const scelte = {
      etichetta: t("github.common.remote"),
      voci: s.remoti.map((r) => ({ valore: r.nome, testo: r.nome, dettaglio: r.urlInvio ?? r.url ?? '' })),
      valore: s.remotoPerInvio ?? null,
    };
    const si = await conferma({
      titolo: t("github.sync.publish.title", { branch: s.ramo }),
      testo: t("github.sync.publish.explain"),
      righe: [[t("github.common.branch"), s.ramo]],
      scelte,
      conferma: t("github.sync.publish.confirm"),
    });
    if (!si || !scelte.valore) return;
    await inRete('pubblica', () => api.invia(scelte.valore), {
      dopo: (esito) => {
        if (!esito) return;
        prendiSinc(esito);
        if (stato.storia && !stato.chiusi.has('storia')) void caricaStoria();
        else stato.storia = null;
        avvisa(t("github.sync.publish.done"), `${esito.ramo} → ${stato.sinc?.riferimento?.corto ?? esito.remoto}`);
      },
    });
  }

  function disegnaSincronizzazione() {
    const s = stato.sinc;
    if (!s) return null;
    const riga = el(doc, 'div', 'talos-github-sinc');
    riga.dataset.c = 'SincronizzazioneGithub';
    if (!Array.isArray(s.remoti) || s.remoti.length === 0) {
      riga.append(el(doc, 'p', 'talos-inspector__hint talos-github-sinc__nota', t("github.sync.status.noRemote")));
      return riga;
    }
    if (!s.ramo) {
      riga.append(el(doc, 'p', 'talos-inspector__hint talos-github-sinc__nota', t("github.sync.status.detachedHead")));
      return riga;
    }
    const azione = azioneSinc(s);
    const inCorso = stato.inCorso;
    const bottone = el(doc, 'button', 'talos-button talos-button--secondary talos-button--sm talos-github-sinc__azione');
    bottone.type = 'button';
    bottone.dataset.azione = inCorso ?? azione;
    bottone.dataset.fuoco = 'sinc';
    bottone.append(icona(doc, ICONA_SINC[inCorso ?? azione]), el(doc, 'span', '', inCorso ? t(IN_CORSO[inCorso]) : etichettaSinc(azione, s)));
    if (inCorso) {
      bottone.disabled = true;
      bottone.setAttribute('aria-busy', 'true');
    } else {
      bottone.title = azione === 'recupera' && remotoPerRecupero(s) ? t("github.sync.menu.fetchFromRemote", { remote: remotoPerRecupero(s) })
        : azione === 'scarica' ? t("github.sync.menu.pullFrom", { ref: s.riferimento.corto })
          : azione === 'invia' ? t("github.sync.menu.pushTo", { ref: s.riferimento.corto }) : etichettaSinc(azione, s);
      bottone.addEventListener('click', () => { void faiSinc(azione); });
    }
    riga.append(bottone);
    if (inCorso === 'recupera') {
      const ferma = bottoneTesto(doc, t("github.sync.stop"), () => { void fermaRecupero(); });
      ferma.classList.add('talos-github-sinc__ferma');
      riga.append(ferma);
    }
    if (s.riferimento && !s.riferimentoSparito && Number.isInteger(s.indietro) && Number.isInteger(s.avanti)) {
      const conti = el(doc, 'span', 'talos-github-sinc__conti');
      conti.setAttribute('role', 'img');
      conti.setAttribute('aria-label', t("github.sync.status.behindAhead", { behind: s.indietro, ahead: s.avanti }));
      conti.title = conti.getAttribute('aria-label');
      conti.append(el(doc, 'span', 'talos-github-sinc__conto', `↓${s.indietro}`), el(doc, 'span', 'talos-github-sinc__conto', `↑${s.avanti}`));
      riga.append(conti);
    }
    const quando = s.ultimoRecupero ? tempoFa(s.ultimoRecupero, linguaCorrenteDiT()) : null;
    const recupero = el(doc, 'span', 'talos-github-sinc__recupero', quando ? t("github.sync.status.fetched", { when: quando }) : t("github.sync.status.neverFetched"));
    if (s.ultimoRecupero) recupero.title = new Date(s.ultimoRecupero).toLocaleString(linguaCorrenteDiT());
    riga.append(recupero);
    if (s.riferimentoSparito) {
      riga.append(el(doc, 'p', 'talos-inspector__hint talos-github-sinc__nota', t("github.sync.status.remoteGone", { ref: s.riferimento?.corto ?? '' })));
    }
    return riga;
  }

  /** Scarica fermato dai file che il download sovrascriverebbe: le parole del server (coi nomi) e le due uscite. */
  function disegnaBloccoScarica() {
    const b = stato.bloccoScarica;
    const carta = el(doc, 'div', 'talos-card talos-inspector-card talos-github-richiesta talos-github-blocco');
    carta.setAttribute('role', 'group');
    /* il titolo dice l'esito, il testo del server il perché coi nomi dei file (foto 27/09: due volte «Scaricare sovrascriverebbe») */
    carta.setAttribute('aria-label', t("github.sync.pull.notStarted"));
    carta.append(el(doc, 'p', 'talos-github-richiesta__titolo', t("github.sync.pull.notStarted")));
    carta.append(el(doc, 'p', 'talos-inspector__hint talos-github-blocco__testo', b.messaggio));
    const piede = el(doc, 'div', 'talos-github-richiesta__piede');
    const lascia = bottoneTesto(doc, t("github.common.cancel"), () => { stato.bloccoScarica = null; ridisegnaElenco(); elenco.querySelector('[data-fuoco="sinc"]')?.focus({ preventScroll: true }); });
    const si = el(doc, 'button', 'talos-button talos-button--primary talos-button--sm', t("github.sync.pull.stashAndPull"));
    si.type = 'button';
    si.dataset.fuoco = 'blocco-scarica';
    si.addEventListener('click', () => { void accantonaEScarica(); });
    carta.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); lascia.click(); } });
    piede.append(lascia, si);
    carta.append(piede);
    return carta;
  }

  /* ═══════════ F6-1 passo 3 — la storia ═══════════ */

  let letturaStoria = 0;
  let letturaFile = 0;

  /* ═══════════ F6-2 passo 4 — i file di una riga del grafo ═══════════ */

  /** Apre (e legge i file) o chiude una riga del grafo. Più righe possono stare aperte, come nell'albero di VS Code. */
  async function apriChiudiRiga(chiave, confronto) {
    if (stato.storiaAperte.has(chiave)) {
      stato.storiaAperte.delete(chiave);
      ridisegnaElenco();
      return;
    }
    const mia = ++letturaFile;
    stato.storiaAperte.set(chiave, { ...confronto, caricando: true, errore: null, file: [], fuori: 0, altri: false, daVuoto: false, lettura: mia });
    ridisegnaElenco();
    let voce;
    try {
      const esito = await api.modifiche(confronto.da, confronto.a);
      voce = {
        ...confronto, caricando: false, errore: null,
        file: Array.isArray(esito?.file) ? esito.file : [], fuori: Number(esito?.fuori) || 0, altri: esito?.altri === true,
        da: esito?.da ?? confronto.da, a: esito?.a ?? confronto.a, daVuoto: esito?.daVuoto === true,
      };
    } catch (errore) {
      voce = { ...confronto, caricando: false, errore: errore?.message || t("github.common.failed"), file: [], fuori: 0, altri: false, daVuoto: false };
    }
    if (stato.storiaAperte.get(chiave)?.lettura !== mia) return; // chiusa, riaperta o storia riletta nel frattempo
    stato.storiaAperte.set(chiave, { ...voce, lettura: mia });
    ridisegnaElenco();
  }

  /**
   * Le righe dei file sotto una riga aperta: a sinistra le corsie che proseguono (il segnaposto di VS Code, `scmHistory.ts:277-290`),
   * poi la lettera, il nome e la cartella come nelle righe delle modifiche. Il clic apre il diff in sola lettura.
   */
  function righeDeiFile(aperta, riga, larghezza) {
    const figlia = (contenuto, nota = false) => {
      const li = el(doc, 'li', `talos-github-riga talos-github-riga--file-commit${nota ? ' talos-github-riga--nota' : ''}`);
      li.dataset.gruppo = 'storia';
      const corsie = grafoDellaRiga(doc, disegnoSegnaposto(riga.uscita, ALTEZZA_RIGA_FILE_STORIA), larghezza);
      // una nota va a capo e la riga cresce: il segnaposto (solo tratti verticali, nessun cerchio) si allunga con lei senza deformarsi
      if (nota) corsie.setAttribute('preserveAspectRatio', 'none');
      li.append(corsie, contenuto);
      return li;
    };
    if (aperta.caricando) return [figlia(el(doc, 'p', 'talos-inspector__hint', t("github.files.loading")), true)];
    if (aperta.errore) return [figlia(el(doc, 'p', 'talos-inspector__hint', aperta.errore), true)];
    const righe = aperta.file.map((f) => {
      const apri = el(doc, 'button', 'talos-github-riga__apri');
      apri.type = 'button';
      apri.dataset.fuoco = `storia-file:${aperta.a}:${f.percorso}`;
      const lettera = el(doc, 'span', `talos-github-riga__lettera talos-github-riga__lettera--${f.stato}`, f.stato);
      lettera.title = PAROLA_DI[f.stato] ? t(PAROLA_DI[f.stato]) : f.stato;
      apri.append(lettera, el(doc, 'span', 'talos-github-riga__nome', nomeDi(f.percorso)), el(doc, 'span', 'talos-github-riga__cartella', f.prima ? t("github.files.row.renamedFrom", { before: f.prima }) : cartellaDi(f.percorso)));
      apri.title = f.prima ? `${f.prima} → ${f.percorso}` : f.percorso;
      apri.addEventListener('click', () => { void apriDiff(f.percorso, 'commit', { da: aperta.da, a: aperta.a, prima: f.prima ?? null, titolo: aperta.titolo, daVuoto: aperta.daVuoto }); });
      const li = figlia(apri);
      li.dataset.percorso = f.percorso;
      li.dataset.stato = f.stato;
      return li;
    });
    const note = [];
    if (!aperta.file.length) note.push(t("github.files.empty"));
    if (aperta.altri) note.push(t("github.files.truncated", { n: aperta.file.length }));
    if (aperta.fuori > 0) note.push(tn("github.files.outsideOne", "github.files.outsideMany", aperta.fuori));
    for (const n of note) righe.push(figlia(el(doc, 'p', 'talos-inspector__hint', n), true));
    return righe;
  }
  async function caricaStoria() {
    const mia = ++letturaStoria;
    if (!stato.storia) { stato.storia = { commit: [], altri: false, caricando: true, errore: null }; ridisegnaElenco(); }
    try {
      const s = await api.storia();
      if (mia !== letturaStoria) return;
      stato.storia = {
        commit: Array.isArray(s?.commit) ? s.commit : [], altri: s?.altri === true, caricando: false, errore: null,
        testa: s?.testa ?? null, remoto: s?.remoto ?? null, nomeRemoto: s?.nomeRemoto ?? null, baseComune: s?.baseComune ?? null,
      };
      /* F6-2 passo 4: una storia riletta (un recupero, un commit, un cambio di ramo) chiude le righe aperte — «In arrivo» di prima non è
         più quello di adesso, e una lettura dei file ancora in volo non scrive più */
      stato.storiaAperte = new Map();
      letturaFile += 1;
    } catch (errore) {
      if (mia !== letturaStoria) return;
      stato.storia = { commit: [], altri: false, caricando: false, errore: errore?.message || t("github.common.failed") };
    }
    ridisegnaElenco();
  }

  /** L'elenco si ridisegna solo se è a schermo (col diff nel rail l'elenco è nascosto e si ridisegna quando torna). */
  function ridisegnaElenco() { if (stato.vista !== 'diff' || stato.schermoIntero) disegnaElenco(); }

  function vociMenuRiga(voce, gruppo) {
    const voci = [];
    if (gruppo !== 'preparati' && gruppo !== 'conflitti') {
      voci.push({ etichetta: t("github.discard.action"), icona: 'i-trash', pericoloso: true, azione: () => annulla([voce.percorso]) });
    }
    if (voce.tipo !== 'eliminato' && !voce.cartella && typeof api.apriFile === 'function') {
      voci.push({ etichetta: t("github.files.row.open"), icona: 'i-doc', azione: () => api.apriFile(voce.percorso) });
    }
    return voci;
  }

  function azionePrincipale(gruppo) {
    if (gruppo === 'preparati') return { etichetta: t("github.files.row.unstage"), fai: (voce) => togli([voce.percorso]) };
    if (gruppo === 'conflitti') return null;
    return { etichetta: t("github.files.row.stage"), fai: (voce) => prepara([voce.percorso]) };
  }

  function disegnaRiga(voce, gruppo) {
    const riga = el(doc, 'li', 'talos-github-riga');
    riga.dataset.percorso = voce.percorso;
    riga.dataset.gruppo = gruppo;
    const { lettera, parola } = letteraStato(voce, gruppo);
    const apri = el(doc, 'button', 'talos-github-riga__apri');
    apri.type = 'button';
    const segno = el(doc, 'span', `talos-github-riga__lettera talos-github-riga__lettera--${lettera === '!' ? 'conflitto' : lettera}`, lettera);
    segno.setAttribute('aria-hidden', 'true');
    const nome = el(doc, 'span', 'talos-github-riga__nome', nomeDi(voce.percorso));
    const dove = el(doc, 'span', 'talos-github-riga__cartella', voce.da ? `${cartellaDi(voce.percorso)} ← ${voce.da}`.replace(/^ ← /u, '← ') : cartellaDi(voce.percorso));
    apri.append(segno, nome, dove);
    apri.setAttribute('aria-label', `${voce.percorso}, ${parola}`);
    /* C34 (review del desktop, R1): la scheda ora si ridisegna da sola mentre il modello scrive; senza una chiave il fuoco della
       tastiera tornava a <body> a ogni ridisegno. La chiave è riga + gruppo + controllo: la stessa riga ritrova il suo controllo. */
    apri.dataset.fuoco = `riga:${gruppo}:${voce.percorso}:apri`;
    apri.title = `${voce.percorso} · ${parola}`;
    if (!voce.cartella) apri.addEventListener('click', () => apriDiff(voce.percorso, gruppo === 'preparati' ? 'preparato' : 'lavoro'));
    else apri.disabled = true;
    riga.append(apri);
    const principale = azionePrincipale(gruppo);
    if (principale) {
      const azione = bottoneTesto(doc, principale.etichetta, () => principale.fai(voce));
      azione.dataset.fuoco = `riga:${gruppo}:${voce.percorso}:azione`;
      riga.append(azione);
    }
    const voci = vociMenuRiga(voce, gruppo);
    if (voci.length) {
      const altro = bottoneIcona(doc, 'i-more', t("github.common.moreActionsOn", { name: nomeDi(voce.percorso) }), (e) => menu(voci, { ancoraEl: e.currentTarget, focusElement: e.currentTarget }));
      altro.setAttribute('aria-haspopup', 'menu');
      altro.dataset.fuoco = `riga:${gruppo}:${voce.percorso}:altro`;
      riga.append(altro);
      riga.addEventListener('contextmenu', (e) => { e.preventDefault(); menu(voci, { x: e.clientX, y: e.clientY, focusElement: altro }); });
    }
    return riga;
  }

  /** Il titolo di un gruppo: apre e chiude, col conteggio. `suApertura` gira quando lo si apre (la storia si legge lì). */
  function interruttoreGruppo(chiave, titolo, conto, suApertura = null) {
    const interruttore = el(doc, 'button', 'talos-github-gruppo__titolo');
    interruttore.type = 'button';
    interruttore.dataset.fuoco = `gruppo:${chiave}`;
    const aperto = !stato.chiusi.has(chiave);
    interruttore.setAttribute('aria-expanded', String(aperto));
    interruttore.append(icona(doc, 'i-chevron'), el(doc, 'span', '', titolo));
    if (conto !== null) interruttore.append(el(doc, 'span', 'talos-github-gruppo__conto', conto));
    interruttore.addEventListener('click', () => {
      const apre = stato.chiusi.has(chiave);
      if (apre) stato.chiusi.delete(chiave); else stato.chiusi.add(chiave);
      disegnaElenco();
      if (apre) suApertura?.();
    });
    return interruttore;
  }

  function disegnaGruppo(chiave, titolo, voci) {
    const sezione = el(doc, 'section', 'talos-github-gruppo');
    sezione.dataset.gruppo = chiave;
    const testa = el(doc, 'div', 'talos-github-gruppo__testa');
    const aperto = !stato.chiusi.has(chiave);
    testa.append(interruttoreGruppo(chiave, titolo, String(voci.length)));
    const percorsi = voci.map((v) => v.percorso);
    if (chiave === 'preparati') testa.append(bottoneTesto(doc, t("github.files.group.unstageAll"), () => togli(percorsi)));
    else if (chiave !== 'conflitti') testa.append(bottoneTesto(doc, t("github.files.group.stageAll"), () => prepara(percorsi)));
    sezione.append(testa);
    if (aperto) {
      const lista = el(doc, 'ul', 'talos-github-gruppo__righe');
      for (const v of voci) lista.append(disegnaRiga(v, chiave));
      sezione.append(lista);
    }
    return sezione;
  }

  function disegnaAccantonati() {
    const voci = stato.accantonati;
    const sezione = el(doc, 'section', 'talos-github-gruppo');
    sezione.dataset.gruppo = 'accantonati';
    const testa = el(doc, 'div', 'talos-github-gruppo__testa');
    testa.append(interruttoreGruppo('accantonati', t("github.stash.group.title"), String(voci.length)));
    sezione.append(testa);
    if (stato.chiusi.has('accantonati')) return sezione;
    const lingua = linguaCorrenteDiT();
    const lista = el(doc, 'ul', 'talos-github-gruppo__righe');
    for (const v of voci) {
      const { ramo, nota, automatica } = leggiAccantonato(v.messaggio);
      const riga = el(doc, 'li', 'talos-github-riga');
      riga.dataset.gruppo = 'accantonati';
      riga.dataset.commit = v.commit;
      const corpo = el(doc, 'div', 'talos-github-riga__apri talos-github-riga__apri--fermo');
      const segno = el(doc, 'span', 'talos-github-riga__lettera');
      segno.append(icona(doc, 'i-layers'));
      const nome = el(doc, 'span', 'talos-github-riga__nome', automatica ? t("github.stash.noNote") : nota);
      const dove = el(doc, 'span', 'talos-github-riga__cartella', [ramo ? t("github.stash.row.onBranch", { branch: ramo }) : null, tempoFa(v.data, lingua)].filter(Boolean).join(' · '));
      // su due righe, come i commit: a 1024 una riga sola tagliava «su lavor…» e l'ora spariva (visto in foto, 26/09)
      const testi = el(doc, 'span', 'talos-github-riga__testi');
      testi.append(nome, dove);
      corpo.append(segno, testi);
      corpo.title = v.messaggio;
      riga.append(corpo, bottoneTesto(doc, t("github.stash.row.restore"), () => { void riprendi(v); }));
      const voci = [{ etichetta: t("github.stash.drop.action"), icona: 'i-trash', pericoloso: true, azione: () => { void scarta(v); } }];
      const altro = bottoneIcona(doc, 'i-more', t("github.stash.row.moreActions"), (e) => menu(voci, { ancoraEl: e.currentTarget, focusElement: e.currentTarget, etichetta: t("github.stash.row.actions") }));
      altro.setAttribute('aria-haspopup', 'menu');
      altro.dataset.fuoco = `accantonato:${v.commit}:altro`; // C34 R1: il fuoco sopravvive al ridisegno automatico
      riga.append(altro);
      riga.addEventListener('contextmenu', (e) => { e.preventDefault(); menu(voci, { x: e.clientX, y: e.clientY, focusElement: altro, etichetta: t("github.stash.row.actions") }); });
      lista.append(riga);
    }
    sezione.append(lista);
    return sezione;
  }

  function disegnaStoria() {
    const s = stato.storia;
    const sezione = el(doc, 'section', 'talos-github-gruppo');
    sezione.dataset.gruppo = 'storia';
    const testa = el(doc, 'div', 'talos-github-gruppo__testa');
    const conto = s && !s.caricando && !s.errore ? `${s.commit.length}${s.altri ? '+' : ''}` : null;
    testa.append(interruttoreGruppo('storia', t("github.history.title"), conto, () => { void caricaStoria(); }));
    sezione.append(testa);
    if (stato.chiusi.has('storia')) return sezione;
    if (!s || s.caricando) { sezione.append(el(doc, 'p', 'talos-inspector__hint', t("github.history.loading"))); return sezione; }
    if (s.errore) { sezione.append(el(doc, 'p', 'talos-inspector__hint', s.errore)); return sezione; }
    if (!s.commit.length) { sezione.append(el(doc, 'p', 'talos-inspector__hint', t("github.history.empty"))); return sezione; }
    const lingua = linguaCorrenteDiT();
    /* ⭐ F6-2 passo 3 (decisione 21): il grafo del ramo e del suo remoto, con «In arrivo» sopra la base comune e «In uscita»
       sopra HEAD — la forma di VS Code (`grafo-storia.js`). I conteggi sono quelli di ↓ ↑ quando ci sono (tutta la storia), se
       no quelli della finestra. */
    const righe = righeDelGrafo(s.commit, { testa: s.testa, remoto: s.remoto, base: s.baseComune });
    const daScaricare = soloDelRemoto(s.commit, { testa: s.testa, remoto: s.remoto });
    const rif = s.nomeRemoto ?? stato.sinc?.riferimento?.corto ?? '';
    const quanti = (tipo) => {
      const dalServer = tipo === 'in-arrivo' ? stato.sinc?.indietro : stato.sinc?.avanti;
      if (Number.isInteger(dalServer) && dalServer > 0) return dalServer;
      return tipo === 'in-arrivo' ? daScaricare.size : s.commit.filter((c) => !daScaricare.has(c.commit) && !c.inviato).length;
    };
    const disegni = righe.map((r) => disegnoDellaRiga(r, ALTEZZA_RIGA_STORIA));
    const larghezzaGrafo = Math.max(...disegni.map((d) => d.larghezza));
    const lista = el(doc, 'ul', 'talos-github-gruppo__righe talos-github-storia');
    for (const [i, r] of righe.entries()) {
      const riga = el(doc, 'li', 'talos-github-riga talos-github-riga--commit');
      riga.dataset.gruppo = 'storia';
      riga.dataset.tipo = r.tipo;
      /* ⭐ F6-2 passo 4 (decisione 24, «come VS Code»): la riga si apre nei file cambiati — un commit contro il suo primo genitore
         (lo risolve il server, `da` assente), «In arrivo» e «In uscita» dalla base comune alla punta (`scmHistoryViewPane.ts:323-340`) */
      const corpo = el(doc, 'button', 'talos-github-riga__apri talos-github-riga__apri--due-righe');
      corpo.type = 'button';
      const chiave = r.tipo === 'in-arrivo' || r.tipo === 'in-uscita' ? r.tipo : r.id;
      const confronto = r.tipo === 'in-arrivo' ? { da: s.baseComune, a: s.remoto, titolo: t("github.history.incomingRef", { ref: rif }) }
        : r.tipo === 'in-uscita' ? { da: s.baseComune, a: s.testa, titolo: t("github.history.outgoingRef", { ref: rif }) }
          : { da: null, a: r.id, titolo: `${r.voce.breve} · ${r.voce.soggetto}` };
      const aperta = stato.storiaAperte.get(chiave) ?? null;
      corpo.setAttribute('aria-expanded', String(Boolean(aperta)));
      corpo.dataset.fuoco = `storia:${chiave}`;
      corpo.addEventListener('click', () => { void apriChiudiRiga(chiave, confronto); });
      if (r.tipo === 'in-arrivo' || r.tipo === 'in-uscita') {
        const n = quanti(r.tipo);
        corpo.append(
          el(doc, 'span', 'talos-github-riga__nome', r.tipo === 'in-arrivo' ? t("github.history.incoming") : t("github.history.outgoing")),
          el(doc, 'span', 'talos-github-riga__cartella', r.tipo === 'in-arrivo'
            ? tn("github.history.toPullOne", "github.history.toPullMany", n, { ref: rif })
            : tn("github.history.toPushOne", "github.history.toPushMany", n, { ref: rif })),
        );
      } else {
        const c = r.voce;
        riga.dataset.commit = c.commit;
        riga.dataset.inviato = String(c.inviato === true);
        const remoto = daScaricare.has(c.commit);
        if (remoto) riga.dataset.lato = 'in-arrivo';
        if (r.tipo === 'testa') riga.setAttribute('aria-current', 'true');
        corpo.append(
          el(doc, 'span', 'talos-github-riga__nome', c.soggetto),
          el(doc, 'span', 'talos-github-riga__cartella', [c.breve, c.autore, tempoFa(c.data, lingua), remoto ? t("github.history.row.toPull") : c.inviato ? t("github.history.row.pushed") : t("github.history.row.localOnly")].filter(Boolean).join(' · ')),
        );
        corpo.title = `${c.breve} · ${c.soggetto}`;
      }
      riga.append(grafoDellaRiga(doc, disegni[i], larghezzaGrafo), corpo);
      lista.append(riga);
      if (aperta) lista.append(...righeDeiFile(aperta, r, larghezzaGrafo));
    }
    sezione.append(lista);
    if (s.altri) sezione.append(el(doc, 'p', 'talos-inspector__hint', t("github.history.truncated", { n: s.commit.length })));
    return sezione;
  }

  function testoBase(base) {
    return base
      ? t("github.diff.comparedWithLastCommit", { hash: base.breve, subject: base.soggetto })
      : t("github.diff.noCommitYet");
  }

  function disegnaElenco() {
    const dati = stato.dati;
    /* ⛔ Il fuoco sopravvive al ridisegno. Un giro dell'agente che finisce rilegge lo stato e ridisegna l'elenco: senza questo,
       chi sta scrivendo il messaggio del commit o il nome di un ramo si ritrova senza cursore a metà parola. */
    const attivo = doc.activeElement;
    const fuoco = attivo && elenco.contains(attivo) ? attivo.dataset?.fuoco ?? null : null;
    const selezione = fuoco && typeof attivo.selectionStart === 'number' ? [attivo.selectionStart, attivo.selectionEnd] : null;
    elenco.replaceChildren();
    try { disegnaContenutoElenco(dati); } finally {
      if (fuoco) {
        const nuovo = [...elenco.querySelectorAll('[data-fuoco]')].find((n) => n.dataset.fuoco === fuoco);
        nuovo?.focus({ preventScroll: true });
        if (nuovo && selezione) { try { nuovo.setSelectionRange(selezione[0], selezione[1]); } catch { /* non è un campo di testo */ } }
      }
    }
  }

  /**
   * ⭐ 28/09/2026 (owner: «un pulsante come fa esattamente VS Code, inizializza repository anche se non hai effettuato accesso
   * a GitHub») — la vista vuota di Source Control di VS Code (`extensions/git/package.nls.json:407`, «The folder currently open
   * doesn't have a Git repository… [Initialize Repository]»): una frase che dice cosa manca, e un pulsante che lo fa. Solo
   * locale: nessun account, nessuna rete. La conferma arriva solo se il server la chiede (cartella che contiene quella utente).
   */
  function disegnaNonRepository() {
    const c = el(doc, 'div', 'talos-card talos-inspector-card talos-github-richiesta talos-github-init');
    c.dataset.c = 'InizializzaRepository';
    c.setAttribute('role', 'group');
    c.setAttribute('aria-label', t("github.repo.none.title"));
    c.append(
      el(doc, 'p', 'talos-github-richiesta__titolo', t("github.repo.none.title")),
      el(doc, 'p', 'talos-inspector__hint talos-github-blocco__testo', t("github.repo.none.explain")),
    );
    const inCorso = stato.inCorso === 'inizializza';
    const fai = bottoneTesto(doc, inCorso ? t("github.repo.init.progress") : t("github.repo.init.action"), () => { void inizializza(); }, 'primary');
    fai.dataset.fuoco = 'inizializza';
    fai.disabled = inCorso || stato.occupato;
    if (inCorso) c.setAttribute('aria-busy', 'true');
    const piede = el(doc, 'div', 'talos-github-richiesta__piede');
    piede.append(fai);
    c.append(piede);
    return c;
  }

  const dopoInizializza = (esito) => {
    if (!esito) return;
    stato.nonRepository = false;
    // la risposta porta lo stato ma non il ramo nella forma della rotta `branch`: lo si mette, poi si rilegge tutto (ramo, remoti)
    if (stato.dati) stato.dati = { ...stato.dati, ramo: esito.ramo ?? null, staccata: !esito.ramo };
    avvisa(t("github.repo.init.done"), esito.ramo ? t("github.repo.header.branch", { name: esito.ramo }) : '');
    api.ricarica?.();
  };

  async function inizializza() {
    let chiedi = false;
    await inRete('inizializza', () => api.inizializza(false), {
      dopo: dopoInizializza,
      gestisci: (errore) => { if (errore?.code === 'GIT_INIT_NEEDS_CONFIRM') { chiedi = true; return true; } return false; },
    });
    if (!chiedi) return;
    // come VS Code (`commands.ts:1159-1166`): la cartella utente, o una che la contiene, si inizializza solo dopo un sì
    const si = await conferma({
      titolo: t("github.repo.init.confirmTitle"),
      testo: t("github.repo.init.userFolderWarning"),
      conferma: t("github.repo.init.action"),
    });
    if (!si) return;
    await inRete('inizializza', () => api.inizializza(true), { dopo: dopoInizializza });
  }

  function disegnaContenutoElenco(dati) {
    if (stato.nonRepository) {
      elenco.append(disegnaNonRepository());
      return;
    }
    if (stato.errore) {
      const carta = el(doc, 'div', 'talos-card talos-inspector-card');
      carta.append(el(doc, 'p', 'talos-inspector__hint', stato.errore));
      elenco.append(carta);
      return;
    }
    if (!dati) {
      elenco.append(el(doc, 'p', 'talos-inspector__hint', t("github.repo.loading")));
      return;
    }
    const g = raggruppaVoci(dati.voci);
    const quanteModifiche = g.conflitti.length + g.preparati.length + g.modificati.length + g.nuovi.length;
    const testa = el(doc, 'div', 'talos-file-head talos-github__testa');
    const nomeRamo = dati.ramo ?? (dati.staccata ? t("github.repo.header.detachedHead") : t("github.repo.header.noBranch"));
    /* ⭐ Passo 3: il ramo è un pulsante — passa a un altro ramo, creane uno, rinominalo, eliminane uno */
    const ramo = el(doc, 'button', 'talos-github__ramo');
    ramo.type = 'button';
    ramo.dataset.fuoco = 'ramo';
    ramo.setAttribute('aria-haspopup', 'menu');
    ramo.setAttribute('aria-label', t("github.repo.header.branch", { name: nomeRamo }));
    ramo.title = t("github.repo.header.branch", { name: nomeRamo });
    ramo.append(icona(doc, 'i-branch'), el(doc, 'b', 'talos-file-head__nome', nomeRamo), icona(doc, 'i-chevron'));
    ramo.addEventListener('click', (e) => { void apriMenuRami(e.currentTarget); });
    const vociRepo = [{ etichetta: t("github.repo.menu.refresh"), icona: 'i-clock', azione: () => api.ricarica() }, ...vociSinc()];
    if (dati.base) {
      vociRepo.push({ etichetta: t("github.commit.amend.menu"), icona: 'i-edit', azione: () => { void avviaModifica(); } });
      vociRepo.push({ etichetta: t("github.commit.undo.menu"), icona: 'i-arrow-left', azione: () => { void annullaUltimoCommit(); } });
    }
    if (g.conflitti.length === 0 && g.preparati.length + g.modificati.length > 0) vociRepo.push({ etichetta: t("github.stash.action"), icona: 'i-layers', azione: () => accantona(false) });
    if (g.conflitti.length === 0 && g.nuovi.length > 0) vociRepo.push({ etichetta: t("github.stash.actionWithNew"), icona: 'i-layers', azione: () => accantona(true) });
    /* ⭐ «Affida all'agente» (owner 26/09, punto 10): scrive la richiesta nel composer e la persona la manda lei — non parte da sola */
    if (quanteModifiche > 0 && typeof api.affidaAllAgente === 'function') {
      const richiesta = g.preparati.length > 0
        ? t("github.commit.agent.promptStaged")
        : t("github.commit.agent.promptUnstaged");
      vociRepo.push({ etichetta: t("github.commit.agent.action"), icona: 'i-robot', azione: () => api.affidaAllAgente(richiesta) });
    }
    const altro = bottoneIcona(doc, 'i-more', t("github.repo.menu.moreActions"), (e) => menu(vociRepo, { ancoraEl: e.currentTarget, focusElement: e.currentTarget, etichetta: t("github.repo.menu.actions") }));
    altro.setAttribute('aria-haspopup', 'menu');
    altro.dataset.fuoco = 'repository';
    testa.append(ramo, altro);
    elenco.append(testa);
    /* ⭐ F6-2: sotto la testata, la sincronizzazione col remoto (il pulsante che cambia, ↓ ↑, l'ultimo recupero) */
    const sinc = disegnaSincronizzazione();
    if (sinc) elenco.append(sinc);
    if (stato.bloccoScarica) elenco.append(disegnaBloccoScarica());
    elenco.append(el(doc, 'p', 'talos-inspector__hint talos-github__base', testoBase(dati.base)));
    if (stato.richiesta) elenco.append(disegnaRichiesta());
    if (dati.preparatiFuori > 0) {
      const avviso = el(doc, 'div', 'talos-callout talos-github__fuori', tn(
        "github.commit.blocked.outsideOne",
        "github.commit.blocked.outsideMany",
        dati.preparatiFuori,
      ));
      avviso.dataset.c = 'Callout';
      avviso.setAttribute('role', 'status');
      elenco.append(avviso);
    }
    const carta = el(doc, 'div', 'talos-card talos-inspector-card talos-github-commit');
    if (stato.modifica) {
      /* ⭐ Passo 3: la casella dichiara che cosa sta facendo — modifica QUEL commit, non ne fa uno nuovo */
      const modo = el(doc, 'div', 'talos-github-commit__modo');
      modo.setAttribute('role', 'status');
      modo.append(el(doc, 'span', '', t("github.commit.amend.banner", { hash: stato.modifica.breve })), bottoneTesto(doc, t("github.common.cancel"), () => lasciaStareModifica()));
      carta.append(modo);
    }
    const campo = el(doc, 'textarea', 'talos-textarea talos-github-commit__messaggio');
    campo.dataset.fuoco = 'messaggio';
    campo.rows = 3;
    campo.placeholder = t("github.commit.messageLabel");
    campo.setAttribute('aria-label', t("github.commit.messageLabel"));
    campo.value = stato.messaggio;
    const pulsante = el(doc, 'button', 'talos-button talos-button--primary talos-button--sm talos-github-commit__fai');
    pulsante.type = 'button';
    const aggiornaPulsante = () => {
      let testo;
      let spento = stato.messaggio.trim() === '' || g.conflitti.length > 0 || dati.preparatiFuori > 0;
      if (stato.modifica) testo = g.preparati.length > 0 ? tn("github.commit.amend.actionWithFileOne", "github.commit.amend.actionWithFilesMany", g.preparati.length) : t("github.commit.amend.action");
      else if (g.preparati.length > 0) testo = tn("github.commit.actionOne", "github.commit.actionMany", g.preparati.length);
      else if (quanteModifiche > 0) testo = t("github.commit.stageAllAndCommit");
      else { testo = t("github.commit.nothingToCommit"); spento = true; }
      pulsante.textContent = testo;
      pulsante.disabled = spento;
    };
    campo.addEventListener('input', () => { stato.messaggio = campo.value; aggiornaPulsante(); });
    campo.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !pulsante.disabled) { e.preventDefault(); void committa(); } });
    pulsante.addEventListener('click', () => { void committa(); });
    aggiornaPulsante();
    /* ⭐ ✨ nell'angolo della casella, come la stellina di VS Code nella casella del commit: la casella resta con UN'azione
       principale (il commit), e il ✨ è un aiuto del campo, non un secondo pulsante accanto. */
    const campoBox = el(doc, 'div', 'talos-github-commit__campo');
    campoBox.append(campo);
    if (typeof api.generaMessaggio === 'function') {
      const genera = bottoneIcona(doc, 'i-sparkles', stato.generando ? t("github.commit.generate.writing") : t("github.commit.generate.action"), () => { void generaMessaggio(); });
      genera.classList.add('talos-github-commit__genera');
      genera.dataset.fuoco = 'genera';
      genera.disabled = stato.generando || quanteModifiche === 0 || g.conflitti.length > 0;
      if (stato.generando) genera.setAttribute('aria-busy', 'true');
      campoBox.append(genera);
    }
    carta.append(campoBox, pulsante);
    if (g.conflitti.length > 0) carta.append(el(doc, 'p', 'talos-inspector__hint', t("github.commit.blocked.conflicts")));
    elenco.append(carta);
    if (quanteModifiche === 0) elenco.append(el(doc, 'p', 'talos-inspector__hint talos-github__vuoto', t("github.commit.blocked.noChanges")));
    for (const { chiave, titolo } of GRUPPI) {
      if (g[chiave].length) elenco.append(disegnaGruppo(chiave, titolo, g[chiave]));
    }
    if (stato.accantonati.length) elenco.append(disegnaAccantonati());
    /* F6-3: le pull request, solo dove c'è un remoto (senza, non c'è niente da proporre a GitHub) */
    if (typeof api.statoGithub === 'function' && Array.isArray(stato.sinc?.remoti) && stato.sinc.remoti.length > 0) elenco.append(disegnaPr());
    if (dati.base) elenco.append(disegnaStoria());
  }

  /* ═══════════ F6-3 (27/09/2026) — le pull request con `gh` ═══════════
   *
   * Decisioni dell'owner 25-28 (memoria `decisioni-owner-f6-github-26-09`), ricerca `.claude/RICERCA-F6-3-PR-2026-09-27.md`:
   *   · un gruppo «Pull request», chiuso di serie: GitHub si chiama solo quando lo si apre;
   *   · in testa la PR del ramo (i suoi controlli si aprono sotto, come i file di un commit), poi le PR aperte del progetto, le
   *     proprie prima; un clic apre la PR nel browser del SISTEMA (decisione 28), che ha già l'accesso a GitHub;
   *   · il modulo «Nuova pull request» in riga, come VS Code (decisione 25): ramo → base, titolo e testo come `--fill`, «Bozza»;
   *     un ramo non inviato passa PRIMA dalla conferma di Pubblica/Invia (decisioni 2 e 22) — `gh` non spinge mai;
   *   · i controlli si rileggono da soli mentre corrono, ogni 15 s, solo con la scheda a schermo, e a fine corsa un avviso
   *     (decisione 27; `gh pr checks --watch` rilegge ogni 10 s);
   *   · GitHub CLI assente ⇒ «Scarica GitHub CLI» (decisione 6); non collegato ⇒ «Collega GitHub» col codice del device flow
   *     (decisione 7). Il token non passa mai dalla scheda.
   */
  const INTERVALLO_CONTROLLI_MS = 15_000;
  const INTERVALLO_COLLEGAMENTO_MS = 3_000;
  const ATTESA_MASSIMA_COLLEGAMENTO_MS = 17 * 60_000;
  let inizioAttesaCollegamento = 0;
  let letturaPr = 0;
  let letturaBozza = 0;
  let timerControlli = null;
  let timerCollegamento = null;

  const apriFuori = (url) => { if (url) api.apriFuori?.(url); };
  const schedaVisibile = () => !doc.hidden && radice.isConnected && !elenco.hidden && radice.getClientRects().length > 0;

  async function caricaPr() {
    const mia = ++letturaPr;
    stato.pr = { ...(stato.pr ?? {}), caricando: true };
    ridisegnaElenco();
    let gh = null; let dati = null; let errore = null;
    try {
      gh = await api.statoGithub();
      if (mia !== letturaPr) return;
      if (gh?.gh?.trovato && gh?.accesso?.collegato) dati = await api.pullRequest();
    } catch (e) { errore = { code: e?.code ?? null, message: e?.message || t("github.common.failed") }; }
    if (mia !== letturaPr) return;
    stato.pr = { ...(stato.pr ?? {}), caricando: false, gh, dati, errore };
    seguiControlli();
    ridisegnaElenco();
  }

  function fermaControlli() { clearTimeout(timerControlli); timerControlli = null; }

  /** Mentre almeno un controllo della PR del ramo corre: si rilegge ogni 15 s, e a fine corsa lo si dice una volta. */
  function seguiControlli() {
    fermaControlli();
    const pr = stato.pr?.dati?.prDelRamo;
    if (!pr || pr.stato !== 'open' || !((pr.controlli?.conteggi?.inCorso ?? 0) > 0) || stato.chiusi.has('pr')) return;
    const mia = letturaPr;
    timerControlli = setTimeout(async () => {
      timerControlli = null;
      if (mia !== letturaPr || stato.chiusi.has('pr')) return;
      if (!schedaVisibile()) { seguiControlli(); return; }
      try {
        const c = await api.controlliPr(pr.numero);
        const ora = stato.pr?.dati?.prDelRamo;
        if (mia !== letturaPr || ora?.numero !== pr.numero) return;
        const primaInCorso = ora.controlli?.conteggi?.inCorso ?? 0;
        stato.pr.dati.prDelRamo = { ...ora, controlli: c?.controlli ?? ora.controlli, stato: c?.stato ?? ora.stato };
        const dopo = stato.pr.dati.prDelRamo.controlli?.conteggi;
        if (primaInCorso > 0 && (dopo?.inCorso ?? 0) === 0) avvisa(t(CHIAVI_PR.controlliFiniti), `#${pr.numero} · ${fraseControlli(dopo)}`);
        ridisegnaElenco();
      } catch { /* un giro mancato non ferma il seguito: si riprova al prossimo */ }
      seguiControlli();
    }, INTERVALLO_CONTROLLI_MS);
  }

  async function installaGh() {
    if (stato.pr?.installando) return;
    stato.pr = { ...(stato.pr ?? {}), installando: true };
    ridisegnaElenco();
    try {
      const esito = await api.installaGh();
      avvisa(t(CHIAVI_PR.ghPronta), esito?.gh?.versione ?? '');
    } catch (errore) {
      avvisa(t("github.common.failed"), errore?.message || t("github.common.failed"));
    } finally {
      stato.pr = { ...(stato.pr ?? {}), installando: false };
    }
    await caricaPr();
  }

  async function collegaGithub() {
    if (stato.pr?.collegando) return; // un secondo clic mentre parte non ne lancia un altro
    stato.pr = { ...(stato.pr ?? {}), collegando: true };
    let esito;
    try { esito = await api.collegaGithub(); } catch (errore) {
      stato.pr = { ...(stato.pr ?? {}), collegando: false };
      avvisa(t("github.common.failed"), errore?.message || t("github.common.failed"));
      return;
    }
    stato.pr = { ...(stato.pr ?? {}), collegando: false, collegamento: esito };
    inizioAttesaCollegamento = Date.now();
    ridisegnaElenco();
    elenco.querySelector('[data-fuoco="pr-apri-github"]')?.focus({ preventScroll: true });
    aspettaCollegamento();
  }

  /**
   * Il login finisce su github.com: la scheda chiede ogni 3 s come va, e quando ha finito rilegge le PR. ⛔ Non all'infinito
   * (revisione del 27/09): il codice di GitHub scade in 15 minuti e `gh` si ferma a 16; oltre i 17 la scheda smette e lo dice.
   */
  function aspettaCollegamento() {
    clearTimeout(timerCollegamento);
    timerCollegamento = setTimeout(async () => {
      timerCollegamento = null;
      if (!stato.pr?.collegamento) return; // annullato nel frattempo
      if (Date.now() - inizioAttesaCollegamento > ATTESA_MASSIMA_COLLEGAMENTO_MS) {
        stato.pr = { ...stato.pr, collegamento: null };
        avvisa(t(CHIAVI_PR.scollegato), t(CHIAVI_PR.codiceScaduto));
        await caricaPr();
        return;
      }
      let s = null;
      try { s = await api.statoGithub(); } catch { s = null; }
      if (!stato.pr?.collegamento) return; // annullato nel frattempo
      if (s?.collegamento?.stato === 'in-attesa' || s === null) { aspettaCollegamento(); return; }
      stato.pr = { ...stato.pr, collegamento: null };
      if (s?.accesso?.collegato) avvisa(t(CHIAVI_PR.collegato), s.accesso.account ? t(CHIAVI_PR.account, { account: s.accesso.account }) : '');
      else avvisa(t(CHIAVI_PR.scollegato), testoDelCampo(s?.collegamento, 'errore') ?? '');
      await caricaPr();
    }, INTERVALLO_COLLEGAMENTO_MS);
  }

  async function annullaCollegamento() {
    clearTimeout(timerCollegamento);
    timerCollegamento = null;
    stato.pr = { ...(stato.pr ?? {}), collegamento: null };
    try { await api.annullaCollegamento(); } catch { /* già finito da sé */ }
    await caricaPr();
  }

  async function copiaCodice(codice) {
    try { await globalThis.navigator?.clipboard?.writeText(codice); avvisa(t(CHIAVI_PR.codiceCopiato), codice); } catch { avvisa(t("github.common.failed"), codice); }
  }

  /* ─────────── il modulo «Nuova pull request» ─────────── */

  async function caricaBozza(base) {
    const mia = ++letturaBozza;
    const prima = stato.modulo;
    try {
      const b = await api.bozzaPr(base);
      if (mia !== letturaBozza || !stato.modulo) return;
      /* ciò che la persona ha già scritto resta suo: la bozza nuova (cambio di base) riempie solo i campi che non ha toccato */
      stato.modulo = {
        caricando: false, errore: null, creando: false,
        ramo: b.ramoRemoto ?? b.ramo, base: b.base, basi: Array.isArray(b.basi) ? b.basi : [], remoto: b.remoto ?? null,
        baseTrovata: b.baseTrovata === true, commit: Number(b.commit) || 0, commitOltre: b.commitOltre === true,
        titolo: prima?.toccato?.titolo ? prima.titolo : (b.titolo ?? ''), testo: prima?.toccato?.testo ? prima.testo : (b.testo ?? ''),
        bozza: prima?.bozza === true, toccato: prima?.toccato ?? { titolo: false, testo: false },
      };
    } catch (errore) {
      if (mia !== letturaBozza || !stato.modulo) return;
      stato.modulo = { ...(prima ?? {}), caricando: false, errore: errore?.message || t("github.common.failed") };
    }
    ridisegnaElenco();
  }

  async function apriModuloPr() {
    stato.modulo = { caricando: true, errore: null };
    ridisegnaElenco();
    await caricaBozza(null);
    const campo = elenco.querySelector('[data-fuoco="pr-titolo"]');
    campo?.focus();
    campo?.select?.();
  }

  function chiudiModuloPr() {
    letturaBozza += 1;
    stato.modulo = null;
    ridisegnaElenco();
    elenco.querySelector('[data-fuoco="pr-crea"]')?.focus({ preventScroll: true });
  }

  function scegliBase(ancora) {
    const m = stato.modulo;
    if (!m?.basi?.length) return;
    const voci = m.basi.map((b) => ({ etichetta: b, icona: b === m.base ? 'i-check' : 'i-branch', azione: () => { if (b !== m.base) { stato.modulo = { ...m, base: b, caricando: true }; ridisegnaElenco(); void caricaBozza(b); } } }));
    menu(voci, { ancoraEl: ancora, focusElement: ancora, etichetta: t(CHIAVI_PR.basi) });
  }

  async function creaPr() {
    const m = stato.modulo;
    if (!m || m.caricando || m.creando || stato.occupato || stato.inCorso) return;
    const titolo = String(m.titolo ?? '').trim();
    if (!titolo) {
      m.errore = t(CHIAVI_PR.serveTitolo);
      ridisegnaElenco();
      elenco.querySelector('[data-fuoco="pr-titolo"]')?.focus();
      return;
    }
    /* ⛔ Prima il ramo su GitHub, con la conferma che dice remoto e ramo (decisioni 2 e 22): `gh` non spinge mai al posto nostro */
    const azione = azioneSinc(stato.sinc);
    if (azione === 'scarica') { m.errore = t(CHIAVI_PR.primaScarica); ridisegnaElenco(); return; }
    if (azione === 'pubblica') await pubblica();
    else if (azione === 'invia') await invia();
    if (stato.modulo !== m) return;
    const s = stato.sinc;
    if (!s?.riferimento || s.riferimentoSparito || (s.avanti ?? 0) > 0) { m.errore = t(CHIAVI_PR.aspettaInvio); ridisegnaElenco(); return; }
    m.creando = true;
    m.errore = null;
    ridisegnaElenco();
    let rifiuto = null;
    const esito = await esegui(() => api.creaPr({ titolo, testo: m.testo ?? '', base: m.base, bozza: m.bozza === true }), { gestisci: (errore) => { rifiuto = errore?.message || t("github.common.failed"); return true; } });
    if (stato.modulo !== m) return;
    m.creando = false;
    if (rifiuto || !esito) { m.errore = rifiuto ?? t("github.common.failed"); ridisegnaElenco(); return; }
    stato.modulo = null;
    letturaBozza += 1;
    avvisa(t(CHIAVI_PR.creata), `#${esito.numero} · ${titolo}`);
    await caricaPr();
  }

  /* ─────────── il disegno ─────────── */

  function testoErrorePr(errore) {
    if (errore?.code === 'GH_NOT_GITHUB') return t(CHIAVI_PR.nonGithub);
    if (errore?.code === 'GIT_NO_REMOTE') return t(CHIAVI_PR.nessunRemoto);
    if (errore?.code === 'GIT_DETACHED') return t(CHIAVI_PR.staccata);
    return errore?.message || t("github.common.failed");
  }

  /** Gli esiti dei controlli in cifre, ognuno con la sua icona — la stessa grammatica di ↓N ↑M. */
  function esitiInCifre(conteggi) {
    const esiti = el(doc, 'span', 'talos-github-pr__esiti');
    const frase = fraseControlli(conteggi);
    esiti.setAttribute('role', 'img');
    esiti.setAttribute('aria-label', frase || t(CHIAVI_PR.nessunControllo));
    esiti.title = esiti.getAttribute('aria-label');
    for (const { esito, n } of riassuntoControlli(conteggi)) {
      const voce = el(doc, 'span', 'talos-github-pr__esito');
      voce.dataset.esito = esito;
      voce.append(icona(doc, ICONA_ESITO[esito]), el(doc, 'span', '', String(n)));
      esiti.append(voce);
    }
    return esiti;
  }

  function parolaStatoPr(pr) {
    if (pr.stato === 'merged') return t(CHIAVI_PR.unita);
    if (pr.stato === 'closed') return t(CHIAVI_PR.chiusa);
    return pr.bozza ? t(CHIAVI_PR.bozza) : t(CHIAVI_PR.aperta);
  }

  function rigaPrDelRamo(pr) {
    const riga = el(doc, 'li', 'talos-github-riga talos-github-riga--pr');
    riga.dataset.gruppo = 'pr';
    riga.dataset.numero = String(pr.numero);
    riga.dataset.stato = pr.stato;
    riga.dataset.bozza = String(pr.bozza === true);
    const conControlli = (pr.controlli?.totale ?? 0) > 0;
    const corpo = el(doc, 'button', 'talos-github-riga__apri');
    corpo.type = 'button';
    corpo.dataset.fuoco = 'pr-ramo';
    const segno = el(doc, 'span', 'talos-github-riga__lettera');
    segno.append(icona(doc, 'i-git'));
    const testi = el(doc, 'span', 'talos-github-riga__testi');
    const seconda = el(doc, 'span', 'talos-github-riga__cartella talos-github-pr__seconda');
    seconda.append(el(doc, 'span', '', parolaStatoPr(pr)));
    if (conControlli) seconda.append(esitiInCifre(pr.controlli.conteggi));
    testi.append(el(doc, 'span', 'talos-github-riga__nome', `#${pr.numero} ${pr.titolo}`), seconda);
    corpo.append(segno, testi);
    corpo.title = `#${pr.numero} · ${pr.titolo}`;
    if (conControlli) {
      /* il clic apre i controlli sotto (come i file sotto un commit); la PR si apre col suo pulsante */
      corpo.setAttribute('aria-expanded', String(stato.pr?.controlliAperti === true));
      corpo.setAttribute('aria-label', `#${pr.numero} ${pr.titolo} · ${parolaStatoPr(pr)} · ${fraseControlli(pr.controlli.conteggi)}. ${t(CHIAVI_PR.mostraControlli)}`);
      corpo.addEventListener('click', () => { stato.pr = { ...stato.pr, controlliAperti: !(stato.pr?.controlliAperti === true) }; disegnaElenco(); });
    } else {
      corpo.addEventListener('click', () => apriFuori(pr.url));
    }
    riga.append(corpo);
    /* a icona: un pulsante testuale, anche invisibile, prende il posto degli esiti e taglia l'ultimo (foto del 27/09) */
    const apri = bottoneIcona(doc, 'i-link', t(CHIAVI_PR.apri), () => apriFuori(pr.url));
    apri.dataset.fuoco = 'pr-apri';
    riga.append(apri);
    return riga;
  }

  function righeControlli(pr) {
    return pr.controlli.voci.map((c) => {
      const riga = el(doc, 'li', 'talos-github-riga talos-github-riga--controllo');
      riga.dataset.gruppo = 'pr';
      riga.dataset.esito = c.stato;
      const corpo = el(doc, 'button', 'talos-github-riga__apri');
      corpo.type = 'button';
      const segno = el(doc, 'span', 'talos-github-riga__lettera');
      segno.dataset.esito = c.stato;
      segno.append(icona(doc, ICONA_ESITO[c.stato] ?? 'i-ignoto'));
      corpo.append(segno, el(doc, 'span', 'talos-github-riga__nome', c.nome), el(doc, 'span', 'talos-github-riga__cartella', [t(PAROLA_ESITO[c.stato] ?? c.stato), c.flusso].filter(Boolean).join(' · ')));
      corpo.setAttribute('aria-label', `${c.nome}: ${t(PAROLA_ESITO[c.stato] ?? c.stato)}${c.flusso ? ` · ${c.flusso}` : ''}`);
      if (c.indirizzo) { corpo.addEventListener('click', () => apriFuori(c.indirizzo)); corpo.title = c.indirizzo; }
      else corpo.disabled = true;
      riga.append(corpo);
      return riga;
    });
  }

  function rigaPrAperta(pr, account) {
    const riga = el(doc, 'li', 'talos-github-riga talos-github-riga--pr-aperta');
    riga.dataset.gruppo = 'pr';
    riga.dataset.numero = String(pr.numero);
    const corpo = el(doc, 'button', 'talos-github-riga__apri talos-github-riga__apri--due-righe');
    corpo.type = 'button';
    corpo.dataset.fuoco = `pr:${pr.numero}`;
    const quando = tempoFa(pr.aggiornata, linguaCorrenteDiT());
    corpo.append(
      el(doc, 'span', 'talos-github-riga__nome', `#${pr.numero} ${pr.titolo}`),
      el(doc, 'span', 'talos-github-riga__cartella', [`${pr.ramo} → ${pr.base}`, pr.autore && pr.autore === account ? t(CHIAVI_PR.tua) : pr.autore, pr.bozza ? t(CHIAVI_PR.inBozza) : null, quando].filter(Boolean).join(' · ')),
    );
    corpo.title = `#${pr.numero} · ${pr.titolo} — ${t(CHIAVI_PR.apri)}`;
    corpo.addEventListener('click', () => apriFuori(pr.url));
    riga.append(corpo);
    return riga;
  }

  /** Una carta di stato di GitHub CLI, o `null` quando è pronta e collegata. */
  function cartaStatoGh(p) {
    const gh = p.gh;
    const carta = (titolo, testo) => {
      const c = el(doc, 'div', 'talos-card talos-inspector-card talos-github-richiesta talos-github-pr__stato');
      c.setAttribute('role', 'group');
      c.setAttribute('aria-label', titolo);
      c.append(el(doc, 'p', 'talos-github-richiesta__titolo', titolo));
      if (testo) c.append(el(doc, 'p', 'talos-inspector__hint talos-github-blocco__testo', testo));
      return c;
    };
    const piede = (...bottoni) => { const d = el(doc, 'div', 'talos-github-richiesta__piede'); d.append(...bottoni); return d; };
    if (p.installando) {
      const c = carta(t(CHIAVI_PR.ghScarico), null);
      c.setAttribute('aria-busy', 'true');
      return c;
    }
    if (p.collegamento?.codice) {
      const c = carta(t(CHIAVI_PR.collega), t(CHIAVI_PR.collegaCodice));
      const riga = el(doc, 'div', 'talos-github-pr__codice-riga');
      const codice = el(doc, 'output', 'talos-github-pr__codice', p.collegamento.codice);
      codice.setAttribute('aria-label', `${t(CHIAVI_PR.codice)}: ${p.collegamento.codice.split('').join(' ')}`);
      const copia = bottoneIcona(doc, 'i-copy', t(CHIAVI_PR.copiaCodice), () => { void copiaCodice(p.collegamento.codice); });
      riga.append(codice, copia);
      c.append(riga);
      const apri = bottoneTesto(doc, t(CHIAVI_PR.apriGithub), () => apriFuori(p.collegamento.indirizzo), 'primary');
      apri.dataset.fuoco = 'pr-apri-github';
      c.append(piede(bottoneTesto(doc, t(CHIAVI_PR.annulla), () => { void annullaCollegamento(); }), apri));
      return c;
    }
    if (!gh?.gh?.trovato) {
      const vecchia = gh?.gh?.sistemaTroppoVecchio;
      const c = carta(t(vecchia ? CHIAVI_PR.ghVecchia : CHIAVI_PR.ghAssente), gh?.installabile === false
        ? t(CHIAVI_PR.ghNonInstallabile)
        : vecchia ? t(CHIAVI_PR.ghVecchiaSpiega, { installed: vecchia, official: gh?.versioneTalos ?? '' }) : t(CHIAVI_PR.ghSpiega, { official: gh?.versioneTalos ?? '' }));
      if (gh?.installazione?.errore) c.append(el(doc, 'p', 'talos-github-richiesta__errore', testoDelCampo(gh.installazione, 'errore')));
      const azione = gh?.installabile === false
        ? bottoneTesto(doc, t(CHIAVI_PR.ghPagina), () => apriFuori('https://github.com/cli/cli#installation'), 'primary')
        : bottoneTesto(doc, t(CHIAVI_PR.ghScarica), () => { void installaGh(); }, 'primary');
      azione.dataset.fuoco = 'pr-gh';
      c.append(piede(azione));
      return c;
    }
    if (!gh?.accesso?.collegato) {
      const c = carta(t(CHIAVI_PR.scollegato), t(CHIAVI_PR.collegaSpiega));
      const collega = bottoneTesto(doc, t(CHIAVI_PR.collega), () => { void collegaGithub(); }, 'primary');
      collega.dataset.fuoco = 'pr-collega';
      c.append(piede(collega));
      return c;
    }
    return null;
  }

  function disegnaModuloPr() {
    const m = stato.modulo;
    const carta = el(doc, 'form', 'talos-card talos-inspector-card talos-github-richiesta talos-github-pr__modulo');
    carta.setAttribute('aria-label', t(CHIAVI_PR.nuova));
    carta.noValidate = true;
    carta.append(el(doc, 'p', 'talos-github-richiesta__titolo', t(CHIAVI_PR.nuova)));
    const esc = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); chiudiModuloPr(); } };
    const piede = el(doc, 'div', 'talos-github-richiesta__piede');
    const lasciaStare = bottoneTesto(doc, t(CHIAVI_PR.annulla), () => chiudiModuloPr());
    if (m.caricando && !m.ramo) {
      carta.append(el(doc, 'p', 'talos-inspector__hint', t(CHIAVI_PR.preparoBozza)));
      piede.append(lasciaStare);
      carta.append(piede);
      return carta;
    }
    if (!m.ramo) {
      carta.append(el(doc, 'p', 'talos-github-richiesta__errore', m.errore || t("github.common.failed")));
      piede.append(lasciaStare);
      carta.append(piede);
      return carta;
    }
    /* ramo → base: la base si sceglie dal menu dei rami del remoto, come il ramo nella testata (niente controlli nativi) */
    const rami = el(doc, 'div', 'talos-github-pr__rami');
    const base = el(doc, 'button', 'talos-github__ramo talos-github-pr__base');
    base.type = 'button';
    base.dataset.fuoco = 'pr-base';
    base.setAttribute('aria-haspopup', 'menu');
    base.setAttribute('aria-label', `${t(CHIAVI_PR.base, { base: m.base ?? '—' })}. ${t(CHIAVI_PR.scegliBase)}`);
    base.title = t(CHIAVI_PR.scegliBase);
    base.append(icona(doc, 'i-branch'), el(doc, 'b', 'talos-file-head__nome', m.base ?? '—'), icona(doc, 'i-chevron'));
    base.addEventListener('click', (e) => scegliBase(e.currentTarget));
    const ramo = el(doc, 'span', 'talos-github-pr__ramo', m.ramo);
    ramo.title = m.ramo;
    rami.append(ramo, el(doc, 'span', 'talos-github-pr__freccia', '→'), base);
    carta.append(rami);
    if (m.caricando) carta.append(el(doc, 'p', 'talos-inspector__hint', t(CHIAVI_PR.preparoBozza)));
    else if (!m.baseTrovata) carta.append(el(doc, 'p', 'talos-inspector__hint', t(CHIAVI_PR.baseAssente, { base: m.base ?? '—', remote: m.remoto ?? '' })));
    else carta.append(el(doc, 'p', 'talos-inspector__hint', m.commitOltre ? t(CHIAVI_PR.oltreCommit, { n: m.commit, base: m.base }) : tn(CHIAVI_PR.unCommit, CHIAVI_PR.piuCommit, m.commit, { base: m.base })));
    const titolo = el(doc, 'input', 'talos-field__input talos-github-richiesta__campo');
    titolo.type = 'text';
    titolo.value = m.titolo ?? '';
    titolo.placeholder = t(CHIAVI_PR.titolo);
    titolo.setAttribute('aria-label', t(CHIAVI_PR.titolo));
    titolo.maxLength = 256;
    titolo.autocomplete = 'off';
    titolo.dataset.fuoco = 'pr-titolo';
    const testo = el(doc, 'textarea', 'talos-textarea talos-github-pr__testo');
    testo.rows = 5;
    testo.value = m.testo ?? '';
    testo.placeholder = t(CHIAVI_PR.testo);
    testo.setAttribute('aria-label', t(CHIAVI_PR.testo));
    testo.dataset.fuoco = 'pr-testo';
    const casella = el(doc, 'label', 'talos-github-pr__bozza');
    const spunta = el(doc, 'input', 'talos-checkbox');
    spunta.type = 'checkbox';
    spunta.checked = m.bozza === true;
    spunta.dataset.fuoco = 'pr-bozza';
    spunta.addEventListener('change', () => { m.bozza = spunta.checked; });
    const parole = el(doc, 'span', 'talos-github-pr__bozza-testi');
    parole.append(el(doc, 'span', '', t(CHIAVI_PR.bozzaCasella)), el(doc, 'span', 'talos-github-riga__cartella', t(CHIAVI_PR.bozzaSpiega)));
    casella.append(spunta, parole);
    carta.append(titolo, testo, casella);
    const azione = azioneSinc(stato.sinc);
    if (azione === 'pubblica') carta.append(el(doc, 'p', 'talos-inspector__hint', t(CHIAVI_PR.pubblicaPrima)));
    else if (azione === 'invia') carta.append(el(doc, 'p', 'talos-inspector__hint', tn(CHIAVI_PR.unDaInviare, CHIAVI_PR.piuDaInviare, stato.sinc.avanti)));
    if (m.errore) {
      const errore = el(doc, 'p', 'talos-field__error talos-github-richiesta__errore', m.errore);
      errore.id = 'talos-github-pr-errore';
      errore.setAttribute('role', 'alert');
      titolo.setAttribute('aria-describedby', errore.id);
      if (!String(m.titolo ?? '').trim()) titolo.setAttribute('aria-invalid', 'true');
      carta.append(errore);
    }
    const crea = el(doc, 'button', 'talos-button talos-button--primary talos-button--sm', m.creando ? t(CHIAVI_PR.creo) : t(CHIAVI_PR.crea));
    crea.type = 'submit';
    crea.dataset.fuoco = 'pr-invia';
    const aggiorna = () => { crea.disabled = m.creando === true || m.caricando === true || !String(m.titolo ?? '').trim(); };
    if (m.creando) crea.setAttribute('aria-busy', 'true');
    titolo.addEventListener('input', () => { m.titolo = titolo.value; m.toccato = { ...m.toccato, titolo: true }; if (m.errore === t(CHIAVI_PR.serveTitolo)) m.errore = null; aggiorna(); });
    testo.addEventListener('input', () => { m.testo = testo.value; m.toccato = { ...m.toccato, testo: true }; });
    for (const campo of [titolo, testo, spunta]) campo.addEventListener('keydown', esc);
    aggiorna();
    piede.append(lasciaStare, crea);
    carta.append(piede);
    carta.addEventListener('submit', (e) => { e.preventDefault(); void creaPr(); });
    return carta;
  }

  function disegnaPr() {
    const p = stato.pr;
    const sezione = el(doc, 'section', 'talos-github-gruppo talos-github-pr');
    sezione.dataset.gruppo = 'pr';
    const testa = el(doc, 'div', 'talos-github-gruppo__testa');
    testa.append(interruttoreGruppo('pr', t(CHIAVI_PR.gruppo), p?.dati ? String(p.dati.aperte.length) : null, () => { void caricaPr(); }));
    const aperto = !stato.chiusi.has('pr');
    if (aperto && p?.dati) {
      const voci = [
        { etichetta: t(CHIAVI_PR.aggiorna), icona: 'i-clock', azione: () => { void caricaPr(); } },
        { etichetta: t(CHIAVI_PR.suGithub), icona: 'i-link', azione: () => apriFuori(`https://github.com/${p.dati.repo}/pulls`) },
      ];
      const altro = bottoneIcona(doc, 'i-more', t(CHIAVI_PR.altreAzioni), (e) => menu(voci, { ancoraEl: e.currentTarget, focusElement: e.currentTarget, etichetta: t(CHIAVI_PR.azioni) }));
      altro.setAttribute('aria-haspopup', 'menu');
      altro.dataset.fuoco = 'pr-altro';
      testa.append(altro);
      testa.addEventListener('contextmenu', (e) => { e.preventDefault(); menu(voci, { x: e.clientX, y: e.clientY, focusElement: altro, etichetta: t(CHIAVI_PR.azioni) }); });
    }
    sezione.append(testa);
    if (!aperto) { fermaControlli(); return sezione; }
    if (!p || (p.caricando && !p.gh && !p.errore)) { sezione.append(el(doc, 'p', 'talos-inspector__hint', t(CHIAVI_PR.leggo))); return sezione; }
    if (p.gh || p.installando || p.collegamento) {
      const stato_ = cartaStatoGh(p);
      if (stato_) { sezione.append(stato_); return sezione; }
    }
    if (p.errore) { sezione.append(el(doc, 'p', 'talos-inspector__hint', testoErrorePr(p.errore))); return sezione; }
    if (!p.dati) { sezione.append(el(doc, 'p', 'talos-inspector__hint', t(CHIAVI_PR.leggo))); return sezione; }
    const d = p.dati;
    if (d.prDelRamo) {
      const lista = el(doc, 'ul', 'talos-github-gruppo__righe talos-github-pr__righe');
      lista.append(rigaPrDelRamo(d.prDelRamo));
      if (stato.pr.controlliAperti && (d.prDelRamo.controlli?.totale ?? 0) > 0) lista.append(...righeControlli(d.prDelRamo));
      sezione.append(lista);
    } else if (stato.modulo) {
      sezione.append(disegnaModuloPr());
    } else if (d.ramoPredefinito && d.ramo === d.ramoPredefinito) {
      sezione.append(el(doc, 'p', 'talos-inspector__hint', t(CHIAVI_PR.ramoPrincipale)));
    } else {
      const vuota = el(doc, 'div', 'talos-github-pr__vuota');
      const crea = bottoneTesto(doc, t(CHIAVI_PR.crea), () => { void apriModuloPr(); }, 'secondary');
      crea.dataset.fuoco = 'pr-crea';
      vuota.append(el(doc, 'p', 'talos-inspector__hint', t(CHIAVI_PR.nessunaPr)), crea);
      sezione.append(vuota);
    }
    const altre = d.aperte.filter((x) => x.numero !== d.prDelRamo?.numero);
    if (altre.length) {
      sezione.append(el(doc, 'p', 'talos-inspector__hint talos-github-pr__sotto', t(CHIAVI_PR.aperteNelProgetto)));
      const lista = el(doc, 'ul', 'talos-github-gruppo__righe talos-github-pr__aperte');
      for (const x of altre) lista.append(rigaPrAperta(x, d.account));
      sezione.append(lista);
    }
    return sezione;
  }

  /* ═══════════ I pezzi del diff ═══════════ */

  /**
   * Prepara, togli o annulla UN pezzo del diff aperto. Il server riceve l'impronta del diff che la scheda ha mostrato: se il
   * file è cambiato, rifiuta per nome invece di applicare il pezzo sbagliato. Dopo, il diff si rilegge (i pezzi si
   * rinumerano); se in quell'area non resta niente, la scheda torna all'elenco da sola (`mostraStato`).
   */
  async function azionePezzo(indice, azione, dove) {
    const d = stato.diff;
    if (!d?.dati) return;
    const { percorso, area } = d;
    if (azione === 'annulla') {
      const si = await conferma({
        titolo: t("github.diff.hunk.discardTitle"),
        testo: t("github.diff.hunk.discardWarning"),
        righe: [[t("github.common.files"), percorso], [t("github.diff.hunk.label"), dove]],
        conferma: t("github.diff.hunk.discard"),
        pericolo: true,
      });
      if (!si) return;
    }
    await esegui(() => api.pezzo(percorso, area, indice, d.dati.impronta, azione), {
      dopo: (esito) => { if (esito && stato.vista === 'diff' && stato.diff?.percorso === percorso && stato.diff?.area === area) void apriDiff(percorso, area); },
    });
  }

  /** Nella testa del pezzo: l'azione principale in riga, e per le righe nell'albero «⋯» (e tasto destro) con «Annulla il pezzo». */
  function comandiPezzo(indice, dove) {
    const comandi = el(doc, 'span', 'talos-github-pezzo__comandi');
    const area = stato.diff.area;
    const principale = area === 'preparato'
      ? bottoneTesto(doc, t("github.diff.hunk.unstage"), () => { void azionePezzo(indice, 'togli', dove); })
      : bottoneTesto(doc, t("github.diff.hunk.stage"), () => { void azionePezzo(indice, 'prepara', dove); });
    principale.setAttribute('aria-label', `${principale.textContent}: ${dove}`);
    comandi.append(principale);
    if (area === 'lavoro') {
      const voci = [{ etichetta: t("github.diff.hunk.discard"), icona: 'i-trash', pericoloso: true, azione: () => { void azionePezzo(indice, 'annulla', dove); } }];
      const altro = bottoneIcona(doc, 'i-more', t("github.diff.hunk.moreActions", { where: dove }), (e) => menu(voci, { ancoraEl: e.currentTarget, focusElement: e.currentTarget, etichetta: t("github.diff.hunk.actions") }));
      altro.setAttribute('aria-haspopup', 'menu');
      comandi.append(altro);
      comandi.dataset.menu = 'si';
      comandi.addEventListener('contextmenu', (e) => { e.preventDefault(); menu(voci, { x: e.clientX, y: e.clientY, focusElement: altro, etichetta: t("github.diff.hunk.actions") }); });
    }
    return comandi;
  }

  function disegnaDiff() {
    const { percorso, area, dati, errore, caricando, confronto } = stato.diff;
    const diCommit = area === 'commit'; // F6-2 passo 4: la storia si legge e basta — niente azioni sul file né sui pezzi
    vistaDiff.replaceChildren();
    vistaDiff.setAttribute('aria-label', t("github.diff.title", { path: percorso }));
    const testata = el(doc, 'header', 'talos-lettore__testata');
    const indietro = bottoneIcona(doc, 'i-chevron', t("github.diff.back"), () => chiudiDiff());
    indietro.classList.add('talos-github-diff__indietro');
    const titoli = el(doc, 'div', 'talos-lettore__titoli');
    const nome = el(doc, 'h3', 'talos-lettore__nome', nomeDi(percorso));
    nome.title = percorso;
    nome.tabIndex = -1;
    const meta = el(doc, 'p', 'talos-lettore__meta', [diCommit ? confronto?.titolo : area === 'preparato' ? t("github.diff.staged") : t("github.diff.notStaged"), cartellaDi(percorso)].filter(Boolean).join(' · '));
    titoli.append(nome, meta);
    const comandi = el(doc, 'div', 'talos-lettore__comandi');
    if (typeof onSchermoIntero === 'function') {
      const schermo = bottoneIcona(doc, 'i-layout', stato.schermoIntero ? t("github.diff.fullScreen.exit") : t("github.diff.fullScreen.enter"), () => { stato.schermoIntero = !stato.schermoIntero; disegnaDiff(); onSchermoIntero(vistaDiff, stato.schermoIntero); allinea(); });
      schermo.setAttribute('aria-pressed', String(stato.schermoIntero));
      comandi.append(schermo);
    }
    const voce = diCommit ? null : voceDi(percorso);
    const gruppo = area === 'preparato' ? 'preparati' : (voce?.tipo === 'nonTracciato' ? 'nuovi' : 'modificati');
    const principale = voce ? azionePrincipale(gruppo) : null;
    if (principale) comandi.append(bottoneTesto(doc, principale.etichetta, () => principale.fai(voce)));
    const voci = voce ? vociMenuRiga(voce, gruppo) : [];
    if (voci.length) {
      const altro = bottoneIcona(doc, 'i-more', t("github.common.moreActionsOn", { name: nomeDi(percorso) }), (e) => menu(voci, { ancoraEl: e.currentTarget, focusElement: e.currentTarget }));
      altro.setAttribute('aria-haspopup', 'menu');
      comandi.append(altro);
    }
    testata.append(indietro, titoli, comandi);
    const corpo = el(doc, 'div', 'talos-lettore__corpo talos-github-diff__corpo');
    corpo.setAttribute('role', 'region');
    corpo.setAttribute('aria-label', t("github.diff.title", { path: percorso }));
    corpo.tabIndex = 0;
    if (caricando) corpo.append(el(doc, 'p', 'talos-inspector__hint', t("github.diff.loading")));
    else if (errore) corpo.append(el(doc, 'p', 'talos-inspector__hint', errore));
    else if (dati) {
      corpo.append(el(doc, 'p', 'talos-inspector__hint talos-github__base', diCommit
        ? (dati.daVuoto ? t("github.diff.firstCommit") : t("github.diff.comparing", { from: String(dati.da ?? '').slice(0, 7), to: String(dati.a ?? '').slice(0, 7) }))
        : testoBase(dati.base)));
      if (dati.binario) corpo.append(el(doc, 'p', 'talos-inspector__hint', t("github.diff.binary")));
      else {
        const { pezzi, aggiunte, rimozioni } = analizzaDiffUnificato(dati.testo);
        const blocco = el(doc, 'div', 'talos-diff-chat talos-github-diff__pezzi');
        const conti = el(doc, 'div', 'talos-diff-chat__pezzo');
        conti.append(el(doc, 'span', 'talos-diff-num talos-diff-num--plus', `+${aggiunte}`), el(doc, 'span', 'talos-diff-num talos-diff-num--minus', `−${rimozioni}`));
        blocco.append(conti);
        /* ⭐ Pezzi (decisione dell'owner: «prepara/togli/annulla per file, gruppo e pezzo»): solo su un file tracciato, di testo,
           intero, senza conflitti — per gli altri il server risponde «si prepara intero», e un pulsante che non può riuscire
           non si mostra. L'indice del pezzo è lo stesso del server: entrambi contano le righe «@@ » dello stesso testo. */
        const conPezzi = typeof dati.impronta === 'string' && !dati.troncato && voce && voce.tipo !== 'nonTracciato' && !voce.conflitto;
        pezzi.forEach((pezzo, indice) => {
          const testaPezzo = el(doc, 'div', 'talos-diff-chat__pezzo');
          const dove = pezzo.daRiga === null ? t("github.diff.lines.removed") : (pezzo.daRiga === pezzo.aRiga ? t("github.diff.lines.one", { n: pezzo.daRiga }) : t("github.diff.lines.range", { from: pezzo.daRiga, to: pezzo.aRiga }));
          testaPezzo.append(el(doc, 'span', 'talos-diff-chat__righe', dove));
          if (conPezzi) testaPezzo.append(comandiPezzo(indice, dove));
          const righe = el(doc, 'div', 'talos-diff');
          righe.dataset.c = 'DiffView';
          for (const r of pezzo.righe) {
            const riga = el(doc, 'div', `talos-diff__line talos-diff__line--${r.tipo}`, undefined);
            riga.append(el(doc, 'span', 'talos-diff-chat__num', String(r.numero)), el(doc, 'span', 'talos-diff-chat__segno', r.tipo === 'add' ? '+' : r.tipo === 'del' ? '−' : ' '));
            riga.append(doc.createTextNode(r.testo));
            righe.append(riga);
          }
          blocco.append(testaPezzo, righe);
        });
        if (!pezzi.length) blocco.append(el(doc, 'div', 'talos-diff-chat__resto', t("github.diff.textUnchanged")));
        if (dati.troncato) blocco.append(el(doc, 'div', 'talos-diff-chat__resto', t("github.diff.tooLong")));
        corpo.append(blocco);
      }
    }
    vistaDiff.append(testata, corpo);
  }

  /* Una risposta arrivata tardi vale solo se il lettore mostra ANCORA lo stesso diff: stesso file, stessa area e — per un commit —
     stessi DUE estremi. ⛔ La sola punta non basta (revisione del 27/09): «In arrivo» e il commit in cima al remoto hanno la stessa
     punta e basi diverse, e aprendo in fretta lo stesso file dai due la risposta vecchia avrebbe preso il posto di quella nuova. */
  function ancoraQuesto(percorso, area, confronto) {
    const d = stato.diff;
    return Boolean(d) && d.percorso === percorso && d.area === area
      && (d.confronto?.a ?? null) === (confronto?.a ?? null) && (d.confronto?.da ?? null) === (confronto?.da ?? null);
  }

  async function apriDiff(percorso, area, confronto = null) {
    stato.vista = 'diff';
    stato.diff = { percorso, area, confronto, dati: null, errore: null, caricando: true };
    vistaDiff.hidden = false;
    allinea();
    disegnaDiff();
    vistaDiff.querySelector('.talos-lettore__nome')?.focus({ preventScroll: true });
    try {
      const dati = area === 'commit'
        ? await api.diffFra({ da: confronto?.da ?? null, a: confronto?.a, percorso, prima: confronto?.prima ?? null })
        : await api.diff(percorso, area);
      if (!ancoraQuesto(percorso, area, confronto)) return;
      stato.diff = { percorso, area, confronto, dati, errore: null, caricando: false };
    } catch (errore) {
      if (!ancoraQuesto(percorso, area, confronto)) return;
      stato.diff = { percorso, area, confronto, dati: null, errore: errore?.message || t("github.common.failed"), caricando: false };
    }
    disegnaDiff();
  }

  /*
   * Dove sta cosa. Il diff nel rail prende il posto dell'elenco; a schermo intero il diff sta nell'area della chat e il rail
   * rimette l'elenco — come il lettore di F5 rimette l'albero (`legacy/app.js`, `mettiLettoreASchermoIntero`) — così un clic
   * su un altro file apre il suo diff nello stesso posto.
   */
  function allinea() {
    const elencoNelRail = stato.vista !== 'diff' || stato.schermoIntero;
    elenco.hidden = !elencoNelRail;
    if (stato.vista === 'diff' && !stato.schermoIntero) radice.dataset.vista = 'diff';
    else delete radice.dataset.vista;
    if (elencoNelRail) disegnaElenco();
  }

  function chiudiDiff() {
    const percorso = stato.diff?.percorso;
    if (stato.schermoIntero) { stato.schermoIntero = false; onSchermoIntero?.(vistaDiff, false); }
    stato.vista = 'elenco';
    stato.diff = null;
    vistaDiff.hidden = true;
    vistaDiff.replaceChildren();
    elenco.hidden = false;
    delete radice.dataset.vista;
    disegnaElenco();
    if (percorso) {
      const riga = [...elenco.querySelectorAll('.talos-github-riga')].find((r) => r.dataset.percorso === percorso);
      riga?.querySelector('.talos-github-riga__apri')?.focus({ preventScroll: true });
    }
  }

  function mostraStato(dati) {
    /* Le risposte di prepara/togli/annulla/commit portano lo stato ma non il ramo (è un'altra rotta): si tiene quello di prima. */
    const ramoPrima = stato.dati ? { ramo: stato.dati.ramo, staccata: stato.dati.staccata } : {};
    const { accantonati, sincronizzazione, ...resto } = dati;
    if (Array.isArray(accantonati)) stato.accantonati = accantonati;
    if (sincronizzazione && typeof sincronizzazione === 'object') stato.sinc = sincronizzazione; // F6-2: arriva col caricamento
    const basePrima = stato.dati?.base?.commit ?? null;
    stato.dati = { ...ramoPrima, ...resto };
    stato.errore = null;
    stato.nonRepository = false;
    // HEAD non è più il commit che si stava modificando (un commit nuovo, un cambio di ramo): la modalità decade, il testo resta
    if (stato.modifica && stato.dati.base?.commit !== stato.modifica.commit) stato.modifica = null;
    // la storia aperta segue HEAD; chiusa, si butta e si rilegge quando la si apre
    if ((stato.dati.base?.commit ?? null) !== basePrima && stato.storia) {
      if (stato.chiusi.has('storia')) stato.storia = null;
      else void caricaStoria();
    }
    if (stato.vista === 'diff' && stato.diff) {
      /* Il file del diff aperto non ha più modifiche in quell'area (committato, tolto, annullato): si torna all'elenco. */
      const v = voceDi(stato.diff.percorso);
      const ancora = v && (stato.diff.area === 'preparato' ? v.staged : (v.nonStaged || v.conflitto));
      // F6-2 passo 4: il diff di un commit non dipende da ciò che c'è da committare
      if (!ancora && stato.diff.area !== 'commit') { chiudiDiff(); return; }
      disegnaDiff();
      if (stato.schermoIntero) disegnaElenco();
      return;
    }
    disegnaElenco();
  }

  function mostraErrore(testo) {
    stato.dati = null;
    stato.errore = testo;
    stato.nonRepository = false;
    if (stato.vista === 'diff') chiudiDiff();
    else disegnaElenco();
  }

  /** ⭐ 28/09 — la cartella non è un repository: al posto dell'elenco, la carta con «Inizializza repository». */
  function mostraNonRepository() {
    stato.dati = null;
    stato.errore = null;
    stato.nonRepository = true;
    if (stato.vista === 'diff') chiudiDiff();
    else disegnaElenco();
  }

  disegnaElenco();
  return Object.freeze({
    mostraStato,
    mostraErrore,
    mostraNonRepository,
    apriDiff,
    chiudiDiff,
    get vista() { return stato.vista; },
    get elementoDiff() { return vistaDiff; },
    get schermoIntero() { return stato.schermoIntero; },
    /** Un altro (il diagramma, il lettore) prende l'area della chat: il diff torna nel rail. */
    esciDalloSchermoIntero() {
      if (!stato.schermoIntero) return;
      stato.schermoIntero = false;
      onSchermoIntero?.(vistaDiff, false);
      if (stato.vista === 'diff') disegnaDiff();
      allinea();
    },
    ridisegna() { if (stato.vista === 'diff') disegnaDiff(); else disegnaElenco(); },
    /**
     * La sessione a schermo è cambiata. La scheda è una sola per tutta l'app, e ciò che era della sessione di prima — il
     * messaggio del commit, una richiesta in riga («Nuovo ramo da …»), la modalità modifica, la storia, i messi da parte, il
     * diff aperto — non passa all'altra: una richiesta rimasta aperta avrebbe creato il ramo nella sessione nuova.
     */
    cambiaSessione() {
      Object.assign(stato, { dati: null, errore: null, nonRepository: false, messaggio: '', richiesta: null, modifica: null, storia: null, accantonati: [], sinc: null, bloccoScarica: null, inCorso: null, storiaAperte: new Map(), pr: null, modulo: null });
      letturaStoria += 1; // una lettura della storia ancora in volo, della sessione di prima, non scrive più
      /* F6-3: le PR, i controlli che si rileggevano e la bozza del modulo erano della sessione di prima (il login no: è di GitHub) */
      letturaPr += 1;
      letturaBozza += 1;
      fermaControlli();
      if (!stato.chiusi.has('pr')) void caricaPr();
      if (stato.vista === 'diff') chiudiDiff();
      else disegnaElenco();
    },
  });
}
