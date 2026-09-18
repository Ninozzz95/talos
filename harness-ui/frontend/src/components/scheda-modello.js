/*
 * scheda-modello.js — LA PAGINA DEL MODELLO (corsia 4, 18/09/2026).
 *
 * La pagina a schermo intero di un modello locale: tre schede — la scheda di Hugging Face col
 * README, i FILE del modello con la verifica dell'impronta, la COMPATIBILITÀ con la memoria di
 * questa macchina. Nasce dal disegno del prototipo `prototypes/calm-lab/src/model-page.mjs:1-92`,
 * ADATTATO al design system che il prodotto ha già: la struttura è quella del prototipo, il
 * linguaggio visivo è `talos-*`. Nessun foglio nuovo, nessuna classe nuova, nessun `<style>`
 * iniettato (il cancello statico `scripts/cancello/statico.mjs` legge solo `index.css` e
 * `foglio-monolite.css`: ogni classe nuova comparirebbe come sospetta, e non c'è precedente di
 * componenti che si portano dietro il proprio CSS).
 *
 * ⛔ NON È UN SECONDO MOTORE DI NIENTE — qui si RIUSA quello che il progetto ha già:
 *   · le linguette: `creaSchede` di `./schede.js` (roving tabindex, frecce che ciclano, Home/End,
 *     `aria-selected`, `aria-controls` + `role=tabpanel`). BC-63/BC-68 hanno unificato TRE
 *     implementazioni di schede in una: scriverne una quarta sarebbe la stessa malattia.
 *   · il Markdown: `renderizzaMarkdown` di `./markdown.js` (BC-29);
 *   · i recinti di codice: `creaBloccoCodice` di `./conversazione.js` (barra del linguaggio,
 *     «Copia», evidenziazione se Prism c'è — e senza Prism degrada da solo: `globalThis.Prism?.`);
 *   · le icone: `icona` di `./sezione-elenco-dettaglio.js`;
 *   · i numeri: `gb`/`contestoK`/`STATI_INSTALLATO`/`datiModelloInstallato` di
 *     `./modelli-installati.js` — le stesse parole e le stesse cifre della lista «Installati»;   · la misura della macchina: `datiMemoria` di `./misura-memoria.js` (la card della memoria del
 *     Model Lab legge gli stessi campi: una sola lettura di `/api/v1/model-lab/capacity`). ⛔ Le sue
 *     righe NON ripetono quelle del verdetto: nella stessa schermata due righe con lo stesso nome e
 *     due numeri diversi sono la trappola delle «due misure che non tornano». E i byte si scrivono
 *     sempre con `gb` — un secondo formattatore in GB sarebbe una seconda unità di misura. Per la
 *     stessa ragione i conteggi di token dei FATTI passano da `contestoK`: `32768` accanto a
 *     `32k token` nella stessa card è la stessa grandezza scritta in due modi.
 *   · i fatti dell'ispezione si mostrano con la loro PROVENIENZA (`osservato` dal runtime,
 *     `dichiarato` dal file): un fatto che il runtime non ha visto resta «Sconosciuto», non diventa
 *     un «No». Se ne occupano `testoFatto` e `provenienzaFatto` di questo file.
 *
 * ⛔ DA DOVE VENGONO I DATI (misurati il 18/09/2026, non dedotti):
 *   · `GET /api/v1/local-models` → `{items:[manifest]}`; il manifest porta
 *     `id/repo/revision/files[]/bytes/sha256/license/path/state` (+`name` se rinominato) e
 *     `files:[{path,bytes,sha256}]`. È la verità LOCALE (cosa c'è sul disco).
 *   · `GET /api/v1/local-models/:id/fit?profile=agent[&contextTokens=N]` → verdetto + misure.
 *     Accetta SOLO `profile` e `contextTokens`: qualunque altro parametro è `QUERY_INVALID`.
 *     Contesto 65536 di serie per `profile='agent'` (`local-runtime-probe.mjs:239`).
 *     `state ∈ unknown|blocked|chat-only|compatible|tight`, `reason ∈ measurement|storage|memory|
 *     context|capabilities|template|fits`. Attorno al verdetto c'è `inspection` — i fatti osservati
 *     (contesto, template, capacità, backend) con la loro provenienza `declared|observed|unknown`.
 *   · `GET /api/v1/huggingface/repo?repo=…&revision=…` → README, licenza, revisione, immagini e
 *     `files:[{path,sizeBytes,sha256}]`. È la verità del REPOSITORY. ⛔ `files[]` arriva solo se si
 *     passa `revision` (`app.js:3800` fa esattamente così): senza, la verifica dei file sarebbe
 *     «non confrontabile» per colpa nostra.
 *   · `GET /api/v1/model-lab/capacity` → RAM e disco della macchina.
 *
 * ⛔ LE DUE GRANDEZZE CHE SI CHIAMANO UGUALI E NON LO SONO (trappola documentata del progetto):
 *   `fit.memory.availableBytes` è la **RAM libera** (`machine.memory.freeBytes`), mentre
 *   `fit.storage.availableBytes` è lo **spazio allocabile sul disco**
 *   (`machine.storage.allocatableBytes` — `local-runtime-probe.mjs:251-252`). In pagina le due
 *   righe si chiamano «RAM libera» e «Spazio allocabile sul disco», e c'è una nota che lo dice:
 *   un verdetto di memoria non si legge col disco.
 *
 * Ricerca fatta PRIMA di scrivere (regola zero), 18/09/2026:
 *   · `developer.mozilla.org` + W3C APG «Meter Pattern» — `<meter>` per una grandezza dentro un
 *     intervallo noto (RAM, disco), `<progress>` per il completamento di un compito: scambiarli è
 *     l'errore più comune di questo pattern, e sugli screen reader si sente. ⇒ si usa `<meter>`,
 *     come fa già `misura-memoria.js:18`; **non** si ridichiara `aria-valuenow` su un `<meter>`
 *     nativo (seconda fonte di verità), ma l'`aria-label` è obbligatorio, e il valore deve esistere
 *     anche come TESTO visibile (in modalità a contrasto forzato il disegno della barra sparisce).
 *   · in-page TOC: `scroll-margin-top` sui bersagli, `scroll-behavior: smooth` solo sotto
 *     `@media (prefers-reduced-motion: no-preference)`, e fuoco sul titolo di destinazione per chi
 *     naviga da tastiera — è la pratica chiesta da MDN e ripresa dalle guide di accessibilità
 *     (letto 18/09/2026).
 *   · impronta troncata: si mostrano TESTA e CODA (`abcdef12…34567890`) e il valore intero resta
 *     nel `title` e dietro il pulsante di copia; una troncatura a una sola estremità è la forma che
 *     le librerie di componenti hanno abbandonato (Dataverse #5210 / PR #7312, Firefox bug
 *     1340265, Spectrum Web Components `<sp-truncated>` — letti il 18/09/2026).
 *   · verdetto di memoria: la barra richiesto/disponibile con la soglia d'allarme al 90% è la forma
 *     con cui il banco di misura confronta pesi e cache KV con la memoria della macchina (Unsloth
 *     PR #7880; KolosalAI model-memory-calculator; letti il 18/09/2026). Qui NON si stima niente:
 *     i numeri arrivano dal server, la barra li rende leggibili.
 *
 * ⛔ QUELLO CHE QUESTA PAGINA NON FA, E PERCHÉ (elenco secco, referto alla mano):
 *   · il pulsante «preferito» del prototipo, «Banco prova», «Scarica», «Usa per le nuove chat»:
 *     nessuna sorgente vera in questa corsia ⇒ non disegnati;
 *   · `parametersB`/`family`/`architecture`/`activities` del prototipo (`MODEL_SOURCES` è una
 *     fixture) ⇒ non esistono in nessuna risposta del server;
 *   · la GPU/VRAM: `/api/v1/model-lab/capacity` non ha un campo GPU (verificato
 *     `machine-capacity.mjs:57-65`) ⇒ il pannello «Compatibilità» non la nomina;
 *   · le immagini del repository: arrivano in `images[]`, ma il prototipo non ha una superficie per
 *     immagini e il lettore Markdown condiviso non rende `![](…)` (né i collegamenti) ⇒ si
 *     riferiscono, non si inventa una galleria.
 */

import { creaSchede } from './schede.js';
import { creaBloccoCodice } from './conversazione.js';
import { renderizzaMarkdown } from './markdown.js';
import { icona } from './sezione-elenco-dettaglio.js';
import { contestoK, datiModelloInstallato, gb, STATI_INSTALLATO } from './modelli-installati.js';
import { datiMemoria } from './misura-memoria.js';

/** Le tre schede del prototipo (`DETAIL_TABS`), nell'ordine in cui le disegna. */
export const SCHEDE = Object.freeze(['card', 'files', 'compatibility']);

/** Le parole a schermo delle tre schede. Mai il nome tecnico (`NIENTE NOMI TECNICI NELLA UI`). */
export const ETICHETTE_SCHEDE = Object.freeze({
  card: 'Scheda Hugging Face',
  files: 'File del modello',
  compatibility: 'Compatibilità',
});

/*
 * ⛔ Il prototipo chiedeva l'icona `cpu` per la compatibilità: nel foglio delle icone di TALOS
 *   `cpu` NON esiste (misurato il 18/09/2026 sullo sprite). Si usa `robot`, che c'è.
 */
const ICONE_SCHEDE = Object.freeze({ card: 'doc', files: 'folder', compatibility: 'robot' });

/** Il `repo` che `hf-direct-transfer.mjs:139` scrive per un file importato dal computer. */
export const REPO_IMPORTATO = 'local-upload';

/** Quanti file dell'impronta si mostrano per lato (`abcdef12…34567890`). */
export const CARATTERI_IMPRONTA = 8;

/** Sotto questa quota di memoria libera il verdetto «entra» è stretto (Unsloth #7880, 18/09/2026). */
const QUOTA_STRETTA = 0.9;

let contatore = 0; // id unici per montaggio: due pagine nella stessa schermata non devono collidere

const numero = new Intl.NumberFormat('it-IT');

/* ═══════════════════════════ le funzioni pure (provate dai test) ═══════════════════════════ */

/**
 * Toglie la testata YAML del README di Hugging Face.
 *
 * ⛔ Senza questo, i model card si aprono con `license: apache-2.0` e `base_model: …` a schermo,
 *   come se fossero prosa. La testata è riconosciuta solo se è DAVVERO una testata: primo rigo
 *   `---`, una riga di chiusura `---` da sola, e almeno una chiave `qualcosa: valore` in mezzo —
 *   così un README che comincia con un separatore orizzontale resta intatto.
 */
export function senzaFrontMatter(testo) {
  const grezzo = String(testo ?? '').replace(/\r\n?/g, '\n');
  if (!grezzo.startsWith('---\n')) return grezzo;
  const righe = grezzo.split('\n');
  let chiusura = -1;
  for (let i = 1; i < righe.length; i += 1) {
    if (righe[i].trim() === '---') { chiusura = i; break; }
    if (righe[i].trim() === '') continue; // una testata può avere righe vuote, non le chiude
  }
  if (chiusura < 2) return grezzo; // nessuna chiave prima della chiusura: non è una testata
  const dentro = righe.slice(1, chiusura);
  if (!dentro.some((r) => /^[A-Za-z0-9_.-]+\s*:/.test(r))) return grezzo;
  return righe.slice(chiusura + 1).join('\n').replace(/^\n+/, '');
}

/**
 * L'impronta come si legge a schermo: testa e coda, puntini in mezzo, e NIENTE puntini quando non
 * si sta accorciando niente.
 */
export function improntaBreve(valore, { primi = CARATTERI_IMPRONTA, ultimi = CARATTERI_IMPRONTA } = {}) {
  const testo = String(valore ?? '').trim();
  if (!testo) return '';
  if (testo.length <= primi + ultimi + 1) return testo;
  return `${testo.slice(0, primi)}…${testo.slice(-ultimi)}`;
}

/** Gli esiti del confronto fra il file sul disco e quello dichiarato dal repository. */
export const ESITI_FILE = Object.freeze({
  coincide: { etichetta: 'Coincide col repository', tono: 'success' },
  diverso: { etichetta: 'Diverso dal repository', tono: 'danger' },
  'non-confrontabile': { etichetta: 'Non confrontabile', tono: 'warning' },
  'solo-locale': { etichetta: 'Il repository non lo elenca', tono: 'warning' },
});

/**
 * Confronta i file del disco (manifest) con quelli del repository, PER PERCORSO.
 *
 * ⛔ I due lati si chiamano diversamente — `bytes`/`sha256` sul disco, `sizeBytes`/`sha256` nel
 *   repository — quindi il confronto è sul solo `sha256`, che è l'unica cosa che i due lati
 *   dichiarano con lo stesso nome e lo stesso significato. Un lato che non dichiara l'impronta
 *   rende il file «non confrontabile»: dirlo è più onesto che darlo per buono.
 * ⛔ Un modello scaricato contiene di norma UNA quantizzazione: i file che il repository elenca e
 *   il disco non ha NON sono un difetto, e il chiamante li mostra a parte.
 */
export function confrontaFile(locali = [], remoti = []) {
  const perPercorso = new Map();
  for (const file of Array.isArray(remoti) ? remoti : []) {
    const percorso = String(file?.path ?? '');
    if (percorso) perPercorso.set(percorso, file);
  }
  const impronta = (valore) => String(valore ?? '').trim().toLowerCase();
  const file = (Array.isArray(locali) ? locali : []).map((locale) => {
    const percorso = String(locale?.path ?? '');
    const remoto = perPercorso.get(percorso) || null;
    if (remoto) perPercorso.delete(percorso);
    let esito = 'solo-locale';
    if (remoto) {
      const a = impronta(locale?.sha256);
      const b = impronta(remoto?.sha256);
      esito = !a || !b ? 'non-confrontabile' : a === b ? 'coincide' : 'diverso';
    }
    return { percorso, locale, remoto, esito };
  });
  return { file, soloRepository: [...perPercorso.values()] };
}

const MOTIVI = Object.freeze({
  measurement: 'Il server non ha potuto misurare la macchina.',
  capabilities: 'Il runtime non ha osservato le capacità di questo modello (attrezzi, chiamate di attrezzo, ruolo di sistema).',
  template: 'Il modello non dichiara il supporto agli attrezzi: la chat sì, l’agente no.',
  fits: '',
});

/** Il contesto efficace contro quello chiesto: le due cifre che spiegano un rifiuto per contesto. */
function motivoContesto(fit) {
  const efficace = contestoK(fit?.inspection?.context?.effectiveTokens?.value);
  const chiesto = contestoK(fit?.context?.requestedTokens);
  if (!efficace || !chiesto) return 'Il contesto del modello è più corto di quello richiesto.';
  return `Il contesto efficace è ${efficace}, ne servono ${chiesto}.`;
}

/**
 * Il verdetto di compatibilità, con le parole che il prodotto usa già (`verdettoEntra`,
 * `modelli-installati.js:39`) e i due stati che quello non conosce.
 *
 * ⛔ Non si riusa `verdettoEntra` per due ragioni misurate: vuole la forma del monolite
 *   (`fit.esito`, non la risposta di `/fit`), manda ogni stato diverso da `compatible` in
 *   «Non entra» — e quindi non sa dire `chat-only` — e quando `memory.availableBytes` manca ripiega
 *   su `runtime.allocabiliBytes`, che è **RAM** (`app.js:3386`) mescolando le due grandezze.
 *   La pagina non fa quel ripiego: se un numero manca, dice «—».
 */
export function verdettoMemoria(fit) {
  if (!fit || typeof fit !== 'object') return null;
  const stato = String(fit.state || 'unknown');
  const richiesti = fit.memory?.requiredBytes;
  const liberi = fit.memory?.availableBytes;
  const stretto = stato === 'tight'
    || (Number.isFinite(richiesti) && Number.isFinite(liberi) && liberi > 0 && richiesti / liberi >= QUOTA_STRETTA);
  if (stato === 'compatible' || stato === 'tight') {
    const cifre = Number.isFinite(richiesti) && Number.isFinite(liberi)
      ? `${byte(richiesti)} richiesti su ${byte(liberi)} liberi`
      : 'Misure incomplete.';
    return stretto
      ? { chiave: 'stretto', etichetta: 'Entra stretto', tono: 'warning', dettaglio: cifre }
      : { chiave: 'entra', etichetta: 'Entra', tono: 'success', dettaglio: cifre };
  }
  if (stato === 'chat-only') {
    const perContesto = String(fit.reason || '') === 'context';
    return {
      chiave: 'solo-chat',
      etichetta: 'Entra solo senza l’agente',
      tono: 'warning',
      dettaglio: perContesto ? motivoContesto(fit) : MOTIVI.template,
    };
  }
  if (stato === 'blocked') {
    const motivo = String(fit.reason || '');
    if (motivo === 'storage') {
      return { chiave: 'non-entra', etichetta: 'Non entra', tono: 'danger', dettaglio: `Sul disco servono ${byte(fit.storage?.requiredBytes)}, restano ${byte(fit.storage?.availableBytes)}.` };
    }
    if (motivo === 'memory') {
      return { chiave: 'non-entra', etichetta: 'Non entra', tono: 'danger', dettaglio: `In memoria servono ${byte(fit.memory?.requiredBytes)}, liberi ${byte(fit.memory?.availableBytes)}.` };
    }
    if (motivo === 'context') {
      return { chiave: 'non-entra', etichetta: 'Non entra', tono: 'danger', dettaglio: motivoContesto(fit) };
    }
    return { chiave: 'non-entra', etichetta: 'Non entra', tono: 'danger', dettaglio: MOTIVI[motivo] || '' };
  }
  return { chiave: 'ignoto', etichetta: 'Non verificato', tono: '', dettaglio: MOTIVI[String(fit.reason || '')] || '' };
}

/**
 * Un fatto dell'ispezione (`{state:'observed'|'declared'|'unknown', value}`) come testo leggibile.
 *
 * ⛔ `numeri` è il formattatore della grandezza, e serve: un conteggio di token scritto `32768` in
 *   una riga e `32k token` in quella accanto è la stessa malattia delle due unità di misura — nella
 *   stessa card due numeri della stessa specie non si scrivono in due modi. I valori `NaN`/`Infinity`
 *   restano «Sconosciuto»: un numero che non c'è non diventa uno zero.
 */
export function testoFatto(fatto, { numeri = null } = {}) {
  if (fatto === null || fatto === undefined) return 'Sconosciuto';
  if (typeof fatto === 'object') {
    if (String(fatto.state || '') === 'unknown') return 'Sconosciuto';
    const valore = fatto.value;
    if (valore === null || valore === undefined) return 'Sconosciuto';
    if (typeof valore === 'boolean') return valore ? 'Sì' : 'No';
    if (typeof valore === 'number') {
      if (!Number.isFinite(valore)) return 'Sconosciuto';
      return (numeri ? numeri(valore) : null) || String(valore);
    }
    return String(valore);
  }
  return typeof fatto === 'boolean' ? (fatto ? 'Sì' : 'No') : String(fatto);
}

/** Da dove viene un fatto: `osservato` dal runtime, `dichiarato` dal file, niente se non si sa. */
export function provenienzaFatto(fatto) {
  const stato = typeof fatto === 'object' && fatto ? String(fatto.state || '') : '';
  return stato === 'observed' ? 'osservato' : stato === 'declared' ? 'dichiarato' : '';
}

function slug(testo) {
  return String(testo ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/**
 * Dà un `id` ai titoli del README reso e torna l'indice della scheda.
 *
 * ⛔ Il Markdown non genera ancore: senza questo, «Salta a…» non ha dove saltare. Ogni titolo
 *   riceve `id` (prefissato col montaggio, così due pagine non si rubano l'ancora), `tabindex="-1"`
 *   per poter ricevere il fuoco dopo il salto, e `scroll-margin-top` — la distanza dal bordo che
 *   l'ancora deve lasciare, misurata in pixel perché il contenitore di scorrimento non è nostro.
 */
export function indiceDelReadme(frammento, doc, { prefisso = 'readme', margine = 12 } = {}) {
  const titoli = [...(frammento?.querySelectorAll?.('h2, h3, h4') || [])];
  return titoli.map((titolo, i) => {
    const testo = String(titolo.textContent || '').trim();
    const id = `${prefisso}-${slug(testo) || 'sezione'}-${i}`;
    titolo.id = id;
    titolo.tabIndex = -1;
    titolo.style.scrollMarginTop = `${margine}px`;
    return { id, testo, livello: Number(String(titolo.tagName).slice(1)) || 2 };
  });
}

/* ---------------------------------- i percorsi delle richieste ---------------------------------- */

export function percorsoModelli() { return '/api/v1/local-models'; }

export function percorsoFit(id, { profilo = 'agent', contextTokens = null } = {}) {
  const parametri = new URLSearchParams({ profile: String(profilo) });
  // ⛔ Solo `profile` e `contextTokens`: qualsiasi altro parametro fa rispondere `QUERY_INVALID`.
  if (Number.isInteger(contextTokens) && contextTokens > 0) parametri.set('contextTokens', String(contextTokens));
  return `/api/v1/local-models/${encodeURIComponent(String(id ?? ''))}/fit?${parametri.toString()}`;
}

/** `null` quando il modello non ha un repository vero (importato dal computer). */
export function percorsoRepo(modello) {
  const repo = String(modello?.repo ?? '').trim();
  if (!repo || repo === REPO_IMPORTATO) return null;
  const revisione = String(modello?.revision ?? '').trim() || 'main';
  return `/api/v1/huggingface/repo?repo=${encodeURIComponent(repo)}&revision=${encodeURIComponent(revisione)}`;
}

/* ----------------------------------- aiuti di disegno ----------------------------------- */

function nodo(doc, tag, classe, testo) {
  const n = doc.createElement(tag);
  if (classe) n.className = classe;
  if (testo !== undefined && testo !== null) n.textContent = String(testo);
  return n;
}

/**
 * I byte a schermo — SEMPRE da qui, mai `gb` diretta.
 *
 * ⛔ `gb(null)` non dice «—»: `Number(null)` è **0**, quindi un campo che il server non manda
 *   diventerebbe «0 GB», cioè una cifra inventata da un valore assente. La pagina promette il
 *   contrario («se un numero manca, dice —»), e senza questa guardia la promessa sarebbe falsa per
 *   `null` — che in JSON è la forma più comune di «non c'è». Restituisce la stessa stringa di `gb`
 *   quando il numero c'è davvero: non è un secondo formattatore, è il cancello davanti a quello.
 */
function byte(valore) {
  if (valore === null || valore === undefined || valore === '' || typeof valore === 'boolean') return '—';
  const n = Number(valore);
  return Number.isFinite(n) ? gb(n) : '—';
}

function paragrafo(doc, classe, testo) { return nodo(doc, 'p', classe, testo); }

function badge(doc, testo, tono) {
  const b = nodo(doc, 'span', `talos-badge talos-badge--sm${tono ? ` talos-badge--${tono}` : ''}`, testo);
  b.dataset.c = 'Badge';
  return b;
}

function riga(doc, etichetta, valore, { chiave = '', tono = '' } = {}) {
  const riga = nodo(doc, 'div', 'talos-kv');
  const val = nodo(doc, 'span', `talos-kv__v${tono === 'accent' ? ' talos-kv__v--accent' : ''}`, valore);
  if (chiave) val.dataset.modelloValore = chiave;
  riga.append(nodo(doc, 'span', 'talos-kv__k', etichetta), val);
  return riga;
}

/**
 * Una riga di FATTO osservato: il valore, e da dove viene.
 *
 * ⛔ La provenienza va a schermo, non buttata via: `osservato` dal runtime e `dichiarato` dal file
 *   non sono la stessa cosa, e un fatto che il runtime non ha visto resta `Sconosciuto` invece di
 *   diventare un «No» (è la lezione di P-13: una risposta sbagliata SICURA non è una «non lo so»).
 *   Se ne occupa `testoFatto`; qui si dice anche CHI lo dice.
 */
function rigaFatto(doc, etichetta, fatto, opzioni) {
  const r = riga(doc, etichetta, testoFatto(fatto, opzioni));
  const daDove = provenienzaFatto(fatto);
  if (daDove) {
    /*
     * ⛔ IL VALORE RESTA L'ULTIMO FIGLIO DELLA RIGA, e il badge va PRIMA di lui.
     *   `.talos-kv` e' `display:flex; justify-content:space-between` (`index.css:1563`): lo spazio
     *   libero si divide fra i figli, quindi conta CHI sta per ultimo. Appendendo il badge dopo il
     *   valore, il valore finiva a META' riga — misurato in foto il 18/09/2026 nella card «Contesto e
     *   capacita'»: «32k token» a x≈730 contro «64k token» a x≈1360, nella stessa card.
     *   ⛔ E raggruppare valore+badge NON basta, misurato con la guardia di SCHEDA-06: le righe con
     *   la provenienza si allineavano fra loro (bordo destro 1160/1161 su sei righe) ma quella SENZA
     *   finiva a 1237 — **77 px** di scarto, cioe' la larghezza del badge. La colonna si tiene solo
     *   col valore per ultimo: cosi' il suo bordo destro e' il bordo destro della riga, sempre.
     *   ⇒ Non c'era un precedente da seguire, ed e' misurato: i tre costruttori `kv()` del prodotto
     *   (`automazioni.js:21`, `catalogo-modelli.js:38`, `inspector.js:696`) fanno tutti e tre DUE
     *   figli, e nessun componente appende un badge a una riga `talos-kv`.
     */
    r.insertBefore(badge(doc, daDove, ''), r.querySelector('.talos-kv__v'));
  }
  return r;
}

/** Un pulsante di copia con esito a schermo — l'idioma del progetto (`app.js:3853`, `conversazione.js:637`). */
function copia(doc, valore, { etichetta = 'Copia', suggerimento = '' } = {}) {
  const b = nodo(doc, 'button', 'talos-button talos-button--ghost talos-button--sm');
  b.type = 'button';
  b.dataset.modelloCopia = '';
  const scritta = nodo(doc, 'span', '', etichetta);
  b.append(icona(doc, 'copy', 'i i--sm'), scritta);
  if (suggerimento) { b.title = suggerimento; b.setAttribute('aria-label', suggerimento); }
  b.addEventListener('click', async () => {
    let esito = 'Copiato';
    try {
      const appunti = globalThis.navigator?.clipboard;
      if (typeof appunti?.writeText !== 'function') throw new Error('appunti non disponibili');
      await appunti.writeText(String(valore));
    } catch { esito = 'Copia non riuscita'; }
    scritta.textContent = esito;
    globalThis.setTimeout?.(() => {
      // ⛔ Il pulsante può essere già stato buttato da un ridisegno: si riporta l'etichetta solo se è ancora vivo.
      if (b.isConnected) scritta.textContent = etichetta;
    }, 1500)?.unref?.();
  });
  return b;
}

function accorciaMovimento() {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
}

/* ═══════════════════════════════ il componente ═══════════════════════════════ */

/**
 * Monta la pagina del modello dentro `contenitore`. Non decide NIENTE del contenitore: non ci mette
 * padding né scorrimento, non assume di stare in Impostazioni, non tocca la rotta.
 *
 * @param {HTMLElement} contenitore dove disegnare (il contenitore scorrevole lo mette chi chiama)
 * @param {object} opzioni
 * @param {(percorso:string)=>Promise<any>} opzioni.apiGet la lettura: torna i dati già srotolati
 *   (`envelope.data`) e lancia con un `.message` leggibile quando la richiesta fallisce
 * @param {string} opzioni.id l'id del modello locale
 * @param {object} [opzioni.modello] il manifest, se chi chiama ce l'ha già (risparmia la lista)
 * @param {'card'|'files'|'compatibility'} [opzioni.scheda] la scheda aperta all'avvio
 * @param {number} [opzioni.contextTokens] il contesto per cui stimare la memoria (di serie 65536)
 * @param {'agent'|'chat'} [opzioni.profilo] il profilo della verifica
 * @param {Function} [opzioni.indietro] se c'è, compare «Tutti i modelli»
 * @param {(scheda:string)=>void} [opzioni.onScheda] che cosa fare quando cambia scheda (la rotta)
 * @param {Object} [opzioni.runtime] il motore locale (`{caricato}`) per lo stato della riga
 * @param {Document} [opzioni.document] il documento su cui creare i nodi (per le prove)
 * @returns {{vaiA:Function, ricarica:Function, distruggi:Function, elemento:HTMLElement, stato:object}}
 */
export function montaSchedaModello(contenitore, {
  apiGet,
  id,
  modello = null,
  scheda = 'card',
  contextTokens = null,
  profilo = 'agent',
  indietro = null,
  onScheda = null,
  runtime = {},
  inizio = null,
  document: documento = null,
} = {}) {
  const doc = documento || contenitore?.ownerDocument || globalThis.document;
  if (!contenitore || !doc) throw new Error('La pagina del modello vuole un contenitore.');
  if (typeof apiGet !== 'function') throw new Error('La pagina del modello vuole un lettore (`apiGet`).');
  if (!id) throw new Error('La pagina del modello vuole un id.');

  const suffisso = `sm${(contatore += 1)}`;
  const idPannello = `${suffisso}-pannello`;
  const stato = {
    id,
    scheda: SCHEDE.includes(scheda) ? scheda : 'card',
    modello: modello && typeof modello === 'object' ? modello : null,
    fit: null,
    capacita: null,
    repo: null,
    caricamento: { modello: false, fit: false, capacita: false, repo: false },
    errori: { modello: '', fit: '', capacita: '', repo: '' },
    distrutto: false,
  };
  void inizio; // riservato: chi chiama può passare uno stato iniziale senza rompere la firma

  /* ------------------------------- lo scheletro ------------------------------- */

  const radice = nodo(doc, 'div', 'talos-stack');
  radice.dataset.schedaModello = '';
  radice.dataset.modelloId = String(id);

  const barra = nodo(doc, 'div', 'talos-toolbar');
  const testata = nodo(doc, 'header', 'talos-stack');
  testata.dataset.modelloTestata = '';
  const rigaSchede = nodo(doc, 'div', 'talos-cluster');
  const listaSchede = nodo(doc, 'div', 'talos-tabs__list');
  listaSchede.setAttribute('role', 'tablist');
  listaSchede.setAttribute('aria-label', 'Sezioni della pagina del modello');
  const notaSchede = badge(doc, 'Nessun avvio automatico', '');
  rigaSchede.append(listaSchede, notaSchede);
  const pannello = nodo(doc, 'section', 'talos-tabs__panel');
  pannello.id = idPannello;
  pannello.dataset.modelloPannello = stato.scheda;
  const chiusura = paragrafo(doc, 'talos-page__note', 'Leggere questa pagina non scarica file, non carica il modello e non cambia le nuove chat.');

  const gruppoPannello = nodo(doc, 'div', 'talos-tabs__panels');
  gruppoPannello.append(pannello);
  radice.append(barra, testata, rigaSchede, gruppoPannello, chiusura);
  contenitore.replaceChildren(radice);

  const schede = creaSchede(listaSchede, {
    idMenu: `${suffisso}-scheda`,
    classe: 'talos-tabs__tab',
    identifica: (voce) => voce.id,
    etichetta: (voce) => voce.etichetta,
    // ⛔ Nessun `title`: ripeterebbe parola per parola ciò che la linguetta già dice a schermo.
    suggerimento: () => '',
    contenuto: (bottone, voce) => {
      bottone.append(icona(doc, voce.icona, 'i i--sm'), doc.createTextNode(voce.etichetta));
    },
    controlla: () => idPannello,
    azioni: { seleziona: (scelta) => vaiA(scelta) },
  });
  const VOCI = SCHEDE.map((chiave) => ({
    id: chiave,
    etichetta: ETICHETTE_SCHEDE[chiave],
    icona: ICONE_SCHEDE[chiave],
    suggerimento: ETICHETTE_SCHEDE[chiave],
  }));
  schede.aggiorna(VOCI, stato.scheda);

  /* ------------------------------- i dati ------------------------------- */

  async function leggi(chiave, percorso, applica) {
    if (stato.distrutto) return;
    stato.caricamento[chiave] = true;
    stato.errori[chiave] = '';
    try {
      const dati = await apiGet(percorso);
      if (stato.distrutto) return;
      applica(dati);
    } catch (errore) {
      if (stato.distrutto) return;
      stato.errori[chiave] = String(errore?.message || errore || 'Richiesta non riuscita');
    } finally {
      if (!stato.distrutto) {
        stato.caricamento[chiave] = false;
        disegna();
      }
    }
  }

  function caricaModello() {
    if (stato.modello) { disegna(); return Promise.resolve(); }
    return leggi('modello', percorsoModelli(), (dati) => {
      const elenco = Array.isArray(dati?.items) ? dati.items : [];
      stato.modello = elenco.find((voce) => String(voce?.id) === String(id)) || null;
      if (!stato.modello) stato.errori.modello = 'Questo modello non è fra quelli installati.';
    });
  }

  function caricaRepo() {
    const percorso = percorsoRepo(stato.modello);
    if (!percorso) { disegna(); return Promise.resolve(); }
    return leggi('repo', percorso, (dati) => { stato.repo = dati && typeof dati === 'object' ? dati : null; });
  }

  function caricaFit() {
    return leggi('fit', percorsoFit(id, { profilo, contextTokens }), (dati) => {
      stato.fit = dati && typeof dati === 'object' ? dati : null;
    });
  }

  function caricaCapacita() {
    return leggi('capacita', '/api/v1/model-lab/capacity', (dati) => {
      stato.capacita = dati && typeof dati === 'object' ? dati : null;
    });
  }

  /* ------------------------------- il disegno ------------------------------- */

  function bottoneIndietro() {
    const b = nodo(doc, 'button', 'talos-button talos-button--ghost talos-button--sm');
    b.type = 'button';
    b.dataset.modelloIndietro = '';
    b.append(icona(doc, 'arrow-left', 'i i--sm'), doc.createTextNode('Tutti i modelli'));
    b.addEventListener('click', () => indietro?.());
    return b;
  }

  function azioniDellaTestata() {
    const gruppo = nodo(doc, 'div', 'talos-cluster');
    gruppo.dataset.modelloAzioni = '';
    const hu = !percorsoRepo(stato.modello) ? null : `https://huggingface.co/${String(stato.modello.repo)}`;
    if (hu) {
      const link = nodo(doc, 'a', 'talos-button talos-button--secondary talos-button--sm');
      link.href = hu;
      link.target = '_blank';
      link.rel = 'noopener noreferrer'; // `app.js:3850` usa esattamente questa forma
      link.append(icona(doc, 'link', 'i i--sm'), doc.createTextNode('Apri su Hugging Face'));
      gruppo.append(link);
      gruppo.append(copia(doc, hu, { etichetta: 'Copia link', suggerimento: 'Copia il link del repository' }));
    }
    return gruppo;
  }

  function disegnaBarra() {
    barra.replaceChildren();
    if (typeof indietro === 'function') barra.append(bottoneIndietro());
    barra.append(nodo(doc, 'span', 'talos-grow'));
    barra.append(azioniDellaTestata());
  }

  function disegnaTestata() {
    testata.replaceChildren();
    const dati = stato.modello ? datiModelloInstallato(stato.modello, { runtime, fit: null }) : null;
    const identita = nodo(doc, 'div', 'talos-cluster');

    const nome = nodo(doc, 'h2', '', dati?.nome || stato.modello?.id || id);
    nome.dataset.modelloNome = '';
    const daDove = nodo(doc, 'div', 'talos-stack');
    daDove.append(
      nodo(doc, 'span', 'talos-eyebrow', 'Modello locale'),
      nome,
      paragrafo(doc, 'talos-muted', stato.modello?.path || 'Percorso non dichiarato dal manifest.'),
    );
    identita.append(icona(doc, 'robot', 'i'), daDove);
    testata.append(identita);

    /* La riga del repository: repo, revisione, licenza, accesso, e i due conti pubblici. */
    const rigaRepo = nodo(doc, 'p', 'talos-muted');
    rigaRepo.dataset.modelloRepo = '';
    const repo = stato.repo;
    const pezzi = [];
    if (stato.modello?.repo && stato.modello.repo !== REPO_IMPORTATO) pezzi.push(stato.modello.repo);
    else pezzi.push('Importato dal computer: non ha un repository');
    if (repo?.revision) pezzi.push(`revisione ${String(repo.revision).slice(0, 12)}`);
    if (dati?.licenza) pezzi.push(dati.licenza);
    if (repo?.gated) pezzi.push('accesso limitato');
    if (repo?.pipelineTag) pezzi.push(repo.pipelineTag);
    if (Number.isFinite(repo?.downloads)) pezzi.push(`${numero.format(repo.downloads)} download`);
    if (Number.isFinite(repo?.likes)) pezzi.push(`${numero.format(repo.likes)} like`);
    rigaRepo.append(nodo(doc, 'span', 'talos-mono', pezzi.join(' · ')));
    testata.append(rigaRepo);

    /*
     * ⛔ Il modello che NON c'è si dice in testata, e non solo nella scheda «File»: la corsia ha
     *   trovato che senza questa riga una pagina montata su un id inesistente mostrava, nella
     *   scheda «card», la spiegazione dell'importazione dal computer — cioè una spiegazione
     *   INVENTATA al posto dell'errore vero («questo modello non è fra quelli installati»), che
     *   in quella scheda non aveva nessun altro posto dove comparire. La testata è l'unica
     *   superficie che si vede da tutte e tre le schede.
     */
    if (stato.errori.modello) {
      const avviso = paragrafo(doc, 'talos-muted', stato.errori.modello);
      avviso.dataset.modelloErrore = 'modello';
      avviso.setAttribute('role', 'alert');
      testata.append(avviso);
    }

    testata.append(disegnaStriscia(dati));
  }

  /** La striscia del prototipo (`model-context-strip`): quattro caselle, tutte con un dato vero. */
  function disegnaStriscia(dati) {
    const striscia = nodo(doc, 'div', 'talos-cluster');
    striscia.dataset.modelloStriscia = '';
    const cella = (etichetta, contenuto) => {
      const c = nodo(doc, 'div', 'talos-stack');
      c.append(nodo(doc, 'span', 'talos-eyebrow', etichetta));
      if (typeof contenuto === 'string') c.append(nodo(doc, 'span', 'talos-mono', contenuto));
      else c.append(contenuto);
      return c;
    };
    const statoInstallato = STATI_INSTALLATO[dati?.stato] || STATI_INSTALLATO.disco;
    /*
     * ⛔ Le parole delle caselle sono quelle che il prodotto usa già, non parole nuove:
     *   «File sul disco» è l'etichetta della lista Installati (`modelli-installati.js:147`), e «Stato»
     *   è quella delle colonne del board (`board.js:115`). Prima la seconda casella si chiamava
     *   «Stato sul disco» e la terza «Sul disco»: due caselle di fila con la stessa parola, e la
     *   prima che si rispondeva da sola («Stato sul disco: Sul disco», il valore era l'etichetta).
     */
    striscia.append(
      cella('Origine', dati?.origine || '—'),
      cella('Stato', badge(doc, statoInstallato.etichetta, statoInstallato.tono)),
      cella('File sul disco', byte(stato.modello?.bytes)),
      cella('Formato', dati?.formato || '—'),
    );
    if (stato.fit) {
      const verdetto = verdettoMemoria(stato.fit);
      const contenuto = badge(doc, verdetto.etichetta, verdetto.tono);
      contenuto.dataset.modelloVerdetto = verdetto.chiave;
      striscia.append(cella('Verifica', contenuto));
      striscia.append(cella('Contesto richiesto', contestoK(stato.fit.context?.requestedTokens) || '—'));
    } else if (stato.caricamento.fit) {
      striscia.append(cella('Verifica', 'In corso…'));
    }
    return striscia;
  }

  /* ---- scheda «card»: il README ---- */

  function disegnaCard() {
    const scatola = nodo(doc, 'section', 'talos-card');
    scatola.dataset.modelloCard = '';
    const testa = nodo(doc, 'div', 'talos-cluster');
    testa.style.padding = '12px 14px';
    testa.append(icona(doc, 'doc', 'i i--sm'), nodo(doc, 'span', 'talos-mono', 'README.md'), nodo(doc, 'span', 'talos-label', 'Markdown'));
    if (stato.repo?.revision) testa.append(badge(doc, String(stato.repo.revision).slice(0, 12), ''));
    scatola.append(testa);

    if (stato.caricamento.repo) return conTesta(scatola, paragrafo(doc, 'talos-muted', 'Lettura della scheda…'));
    if (stato.errori.repo) {
      const errore = paragrafo(doc, 'talos-muted', `La scheda non è stata letta: ${stato.errori.repo}`);
      errore.dataset.modelloErrore = 'repo';
      errore.setAttribute('role', 'alert');
      // ⛔ Col «Riprova» anche qui: senza, la scheda che non si è letta non aveva NESSUNA via
      //    d'uscita dentro la sua linguetta — il pulsante viveva solo nelle altre due schede.
      return conTesta(scatola, errore, pulsanteRicarica());
    }
    if (stato.errori.modello) {
      return conTesta(scatola,
        nodo(doc, 'h3', '', 'Il modello non è fra quelli installati'),
        paragrafo(doc, 'talos-muted', stato.errori.modello));
    }
    if (!percorsoRepo(stato.modello)) {
      return conTesta(scatola,
        nodo(doc, 'h3', '', 'Questo modello non ha una scheda Hugging Face'),
        paragrafo(doc, 'talos-muted', 'Il file è stato importato dal computer: non c’è un repository da cui leggere README, revisione e impronte. I file e la compatibilità qui accanto restano quelli veri, letti dal disco e dal motore locale.'));
    }
    const readme = senzaFrontMatter(stato.repo?.readme);
    if (!readme.trim()) {
      return conTesta(scatola,
        nodo(doc, 'h3', '', 'Il repository non ha un README'),
        paragrafo(doc, 'talos-muted', `Il repository ${stato.modello.repo} non dichiara una scheda: restano la revisione, i file e la compatibilità.`));
    }

    const frammento = renderizzaMarkdown(readme, {
      document: doc,
      // ⛔ Il recinto di codice è quello della chat: barra del linguaggio, «Copia», evidenziazione.
      //   La firma del renderer è `(testo, linguaggio, chiuso)` (`markdown.js:137`).
      bloccoCodice: (testo, linguaggio, chiuso) => creaBloccoCodice({ testo, linguaggio, chiuso }, { document: doc }),
      /*
       * ⛔ QUESTE DUE RIGHE SONO LA CURA, e si accendono SOLO QUI — owner, 18/09/2026: «la scheda
       *   del modello di Hugging Face deve essere formattata in HTML».
       *   Misurato in foto (`pagina-modello-card_1080p_real.png`, 18/09): il README di
       *   `unsloth/GLM-4.7-Flash-GGUF` usciva col SORGENTE a schermo — `<div>`, `<p style=…>`,
       *   `<em><a href=…>` — e i link restavano `[Unsloth Dynamic 2.0](https://…)`, cioè sintassi.
       * ⛔ Il renderer resta quello di sempre e la CHAT NON CAMBIA: sono due opzioni spente per
       *   default, e questa scheda è l'unica che le accende. La lista di ciò che è ammesso, e il
       *   perché, stanno in `html-fidato.js`.
       */
      htmlFidato: true,
      linkMarkdown: true,
    });
    const indice = indiceDelReadme(frammento, doc, { prefisso: `${suffisso}-readme` });
    if (indice.length) {
      const rigaIndice = nodo(doc, 'div', 'talos-cluster');
      rigaIndice.dataset.modelloIndice = '';
      rigaIndice.style.padding = '12px 14px';
      rigaIndice.append(nodo(doc, 'span', 'talos-label', 'Nella scheda'));
      for (const voce of indice) {
        const b = nodo(doc, 'button', 'talos-button talos-button--ghost talos-button--sm', voce.testo);
        b.type = 'button';
        b.dataset.modelloIndiceVoce = voce.id;
        b.addEventListener('click', () => {
          const bersaglio = pannello.querySelector(`#${voce.id}`);
          if (!bersaglio) return;
          bersaglio.scrollIntoView?.({ block: 'start', behavior: accorciaMovimento() ? 'auto' : 'smooth' });
          // Il fuoco segue il salto: chi naviga da tastiera deve ripartire da lì, non dal pulsante.
          bersaglio.focus?.({ preventScroll: true });
        });
        rigaIndice.append(b);
      }
      scatola.append(rigaIndice);
    }
    // `.td-prosa-rapporto` è la superficie di prosa condivisa: il README non si veste da solo.
    const prosa = nodo(doc, 'div', 'td-prosa-rapporto');
    prosa.style.padding = '0 14px 14px';
    prosa.append(frammento);
    scatola.append(prosa);
    return scatola;
  }

  function conTesta(scatola, ...figli) {
    const corpo = nodo(doc, 'div', 'talos-stack');
    corpo.style.padding = '12px 14px';
    corpo.append(...figli);
    scatola.append(corpo);
    return scatola;
  }

  /* ---- scheda «files»: i file e la verifica ---- */

  function disegnaFiles() {
    const scatola = nodo(doc, 'section', 'talos-stack');
    scatola.dataset.modelloFiles = '';
    if (stato.caricamento.modello) return conParagrafo(scatola, 'Lettura dei file…');
    if (stato.errori.modello) return conParagrafo(scatola, stato.errori.modello, { errore: true });

    const locali = Array.isArray(stato.modello?.files) ? stato.modello.files : [];
    const confronto = confrontaFile(locali, stato.repo?.files || []);
    const testa = nodo(doc, 'div', 'talos-cluster');
    testa.append(nodo(doc, 'h3', 'talos-lab__heading', 'File del modello'));
    testa.append(badge(doc, `${confronto.file.length} sul disco`, ''));
    if (Array.isArray(stato.repo?.files)) testa.append(badge(doc, `${stato.repo.files.length} nel repository`, ''));
    scatola.append(testa);
    scatola.append(paragrafo(doc, 'talos-label',
      percorsoRepo(stato.modello)
        ? 'L’impronta del file sul disco confrontata con quella dichiarata dal repository.'
        : 'Il modello è importato dal computer: non c’è un repository con cui confrontare l’impronta.'));

    if (!locali.length) {
      scatola.append(paragrafo(doc, 'talos-muted', 'Il manifest non elenca file.'));
      return scatola;
    }
    for (const voce of confronto.file) scatola.append(disegnaFile(voce));

    if (stato.modello?.sha256) {
      const rigaModello = nodo(doc, 'div', 'talos-cluster talos-lab__space');
      rigaModello.append(
        nodo(doc, 'span', 'talos-label', 'Impronta dell’intero modello'),
        nodo(doc, 'span', 'talos-mono', improntaBreve(stato.modello.sha256)),
        copia(doc, stato.modello.sha256, { etichetta: 'Copia', suggerimento: 'Copia l’impronta SHA-256 dell’intero modello' }),
      );
      rigaModello.title = String(stato.modello.sha256);
      scatola.append(rigaModello);
    }
    if (confronto.soloRepository.length) {
      const dettagli = nodo(doc, 'details', 'talos-lab__space');
      dettagli.dataset.modelloSoloRepo = '';
      dettagli.append(nodo(doc, 'summary', '', `Altri ${confronto.soloRepository.length} file nel repository, non scaricati`));
      for (const file of confronto.soloRepository) {
        dettagli.append(riga(doc, String(file.path), byte(file.sizeBytes), { chiave: 'solo-repository' }));
      }
      scatola.append(dettagli);
    }
    return scatola;
  }

  function disegnaFile(voce) {
    const file = nodo(doc, 'article', 'talos-card talos-card--pad');
    file.dataset.modelloFile = voce.percorso;
    const esito = ESITI_FILE[voce.esito] || ESITI_FILE['non-confrontabile'];

    const identita = nodo(doc, 'div', 'talos-cluster');
    identita.append(icona(doc, 'file', 'i i--sm'), nodo(doc, 'h4', 'talos-mono talos-grow', voce.percorso));
    const etichettaEsito = badge(doc, esito.etichetta, esito.tono);
    etichettaEsito.dataset.modelloEsito = voce.esito;
    identita.append(etichettaEsito);

    const impronta = String(voce.locale?.sha256 || '');
    const rigaImpronta = nodo(doc, 'div', 'talos-kv');
    const valoreImpronta = nodo(doc, 'span', 'talos-kv__v', impronta ? improntaBreve(impronta) : 'non dichiarata');
    valoreImpronta.dataset.modelloImpronta = '';
    if (impronta) {
      valoreImpronta.title = impronta;
      /*
       * ⛔ Il valore per ULTIMO, e il pulsante PRIMA di lui — la stessa forma della provenienza in
       *   `rigaFatto`, e per la stessa ragione misurata: `.talos-kv` e' `justify-content:space-between`
       *   (`index.css:1563`), quindi un terzo figlio dopo il valore lo spinge a META' riga. In foto
       *   il 18/09/2026 il valore di questa riga finiva a x≈620 mentre «Revisione del repository» e
       *   «Impronta nel repository» — che mostrano lo STESSO numero — finivano a x≈937: due righe
       *   con la stessa impronta e la colonna spezzata.
       * ⛔ E il pulsante sta ATTACCATO all'etichetta, non sospeso a meta' riga: con tre figli il
       *   `space-between` divide lo spazio libero e il «Copia» finisce al centro (stessa foto:
       *   etichetta a x≈36, «Copia» a x≈730, valore a x≈1300). Etichetta e pulsante in un
       *   `.talos-cluster` (`index.css:252`, 32 usi nel prodotto) riportano i figli a DUE: primo a
       *   sinistra, valore a destra, e niente in mezzo.
       */
      const testaImpronta = nodo(doc, 'div', 'talos-cluster');
      testaImpronta.append(nodo(doc, 'span', 'talos-kv__k', 'Checksum SHA-256 sul disco'),
        copia(doc, impronta, { etichetta: 'Copia', suggerimento: 'Copia l’impronta SHA-256 intera' }));
      rigaImpronta.append(testaImpronta, valoreImpronta);
    } else {
      rigaImpronta.append(nodo(doc, 'span', 'talos-kv__k', 'Checksum SHA-256 sul disco'), valoreImpronta);
    }

    file.append(
      identita,
      /*
       * ⛔ La dimensione e' una RIGA come le sue compagne, non un'etichetta col valore incollato
       *   dentro. Prima era `paragrafo(doc,'talos-label','Dimensione 4,4 GB')` — misurato nella foto
       *   del 18/09/2026: nella stessa card tre righe avevano il valore a DESTRA (`riga()`) e questa
       *   ce l'aveva attaccato all'etichetta, perche' il valore non stava in una cella `.talos-kv__v`.
       *   ⇒ Oltre a disallinearsi, quel numero era invisibile a ogni lettura che passa dalle celle
       *   (il test leggeva `.talos-label`, cioe' un'etichetta): era l'unico numero della card fuori
       *   da ogni elenco di valori. Il prodotto la dimensione la dice cosi' — `kv('File sul disco',
       *   dati.dimensione, 'modelloDimensione')`, `modelli-installati.js:147` — quindi la forma giusta
       *   era gia' in casa e non una nuova.
       */
      riga(doc, 'Dimensione', byte(voce.locale?.bytes), { chiave: 'dimensione' }),
      rigaImpronta,
      riga(doc, 'Revisione del repository', voce.remoto?.revision || String(stato.repo?.revision || '').slice(0, 12) || (voce.remoto ? 'non dichiarata' : '—'), { chiave: 'revisione' }),
      riga(doc, 'Impronta nel repository', voce.remoto?.sha256 ? improntaBreve(voce.remoto.sha256) : (voce.remoto ? 'non dichiarata' : 'il file non è elencato'), { chiave: 'impronta-repository' }),
    );
    if (voce.esito === 'diverso') {
      const avviso = paragrafo(doc, 'talos-muted',
        'Le due impronte non coincidono: il file sul disco non è quello che il repository dichiara per questo percorso.');
      avviso.setAttribute('role', 'alert');
      file.append(avviso);
    }
    if (voce.locale?.security) {
      file.append(riga(doc, 'Esito della scansione', String(voce.locale.security), { chiave: 'security' }));
    }
    return file;
  }

  /* ---- scheda «compatibility»: memoria, contesto, capacità ---- */

  function disegnaCompatibilita() {
    const scatola = nodo(doc, 'section', 'talos-stack');
    scatola.dataset.modelloCompatibilita = '';
    if (stato.caricamento.fit) {
      conParagrafo(scatola, 'Verifica della memoria in corso…');
      scatola.append(disegnaMacchina());
      return scatola;
    }
    if (stato.errori.fit) {
      /*
       * ⛔ Se il VERDETTO non riesce, la MACCHINA si mostra lo stesso: sono due letture diverse, e
       *   la misura della macchina non dipende dal modello. Insieme all'errore arriva il «Riprova».
       */
      conParagrafo(scatola, `La verifica non è riuscita: ${stato.errori.fit}`, { errore: true });
      scatola.append(disegnaMacchina());
      return scatola;
    }
    if (!stato.fit) return conParagrafo(scatola, 'Verifica non ancora richiesta.');

    const verdetto = verdettoMemoria(stato.fit);
    const card = nodo(doc, 'section', 'talos-card talos-card--pad');
    const testa = nodo(doc, 'div', 'talos-cluster');
    testa.append(nodo(doc, 'h3', 'talos-lab__heading', 'Memoria e spazio'));
    const etichettaVerdetto = badge(doc, verdetto.etichetta, verdetto.tono);
    etichettaVerdetto.dataset.modelloVerdetto = verdetto.chiave;
    testa.append(etichettaVerdetto);
    card.append(testa);
    if (verdetto.dettaglio) card.append(paragrafo(doc, 'talos-muted', verdetto.dettaglio));

    /*
     * ⛔ `<meter>` e non `<progress>`: è una grandezza dentro un intervallo, non un compito che
     *   avanza (MDN + W3C APG «Meter Pattern», letti il 18/09/2026 — scambiarli è l'errore più
     *   comune del pattern). Niente `aria-valuenow`: su un `<meter>` nativo sarebbe una seconda
     *   fonte di verità. L'etichetta accessibile è invece obbligatoria, e il valore resta scritto
     *   anche come testo (qui sotto, riga per riga) — in contrasto forzato la barra sparisce.
     */
    const richiesti = stato.fit.memory?.requiredBytes;
    const liberi = stato.fit.memory?.availableBytes;
    /*
     * ⛔ La barra NON si disegna accanto a «Non verificato»: se il server dichiara di non aver
     *   potuto misurare la macchina, una percentuale richiesto/libero lì sotto sarebbe una cifra
     *   che nessuno ha misurato — e per giunta colorata d'allarme. La barra vive solo dove il
     *   verdetto poggia su quei due numeri (o li accompagna: `chat-only` e «Non entra»).
     */
    if (verdetto.chiave !== 'ignoto' && Number.isFinite(richiesti) && Number.isFinite(liberi) && liberi > 0) {
      const percento = Math.min(100, Math.round((richiesti / liberi) * 100));
      const meter = nodo(doc, 'meter', 'talos-lab__meter');
      meter.dataset.modelloMeter = '';
      meter.min = 0; meter.max = 100; meter.low = 75; meter.high = 90; meter.optimum = 0;
      meter.value = percento;
      meter.setAttribute('aria-label', `Memoria richiesta ${byte(richiesti)} su ${byte(liberi)} liberi: ${percento} per cento`);
      card.append(meter);
    }
    // ⛔ «Memoria» è la RAM, «spazio» è il disco: due grandezze diverse che il server chiama
    //    entrambe `availableBytes` (`local-runtime-probe.mjs:251-252`). Le etichette lo dicono.
    card.append(
      riga(doc, 'Memoria richiesta', byte(richiesti), { chiave: 'memoria-richiesta' }),
      riga(doc, 'RAM libera', byte(liberi), { chiave: 'ram-libera' }),
      riga(doc, 'Spazio richiesto sul disco', byte(stato.fit.storage?.requiredBytes), { chiave: 'spazio-richiesto' }),
      riga(doc, 'Spazio allocabile sul disco', byte(stato.fit.storage?.availableBytes), { chiave: 'spazio-allocabile' }),
    );
    card.append(paragrafo(doc, 'talos-label', 'La memoria è la RAM; lo spazio è il disco. Non sono la stessa grandezza, anche quando il server le chiama uguale.'));
    scatola.append(card);

    const contesto = nodo(doc, 'section', 'talos-card talos-card--pad talos-lab__space');
    contesto.append(nodo(doc, 'h3', 'talos-lab__heading', 'Contesto e capacità'));
    contesto.append(paragrafo(doc, 'talos-label', `Verifica per il profilo «${String(stato.fit.profile || profilo)}».`));
    const ispezione = stato.fit.inspection || {};
    // ⛔ Ogni fatto porta con sé la sua provenienza, e si vede: `osservato` e `dichiarato` non
    //    valgono uguale, e ciò che il runtime non ha visto resta «Sconosciuto».
    // ⛔ I conteggi di token passano da `contestoK`: `32768` e `32k token` nella stessa card
    //    sarebbero due modi di scrivere la stessa grandezza.
    const TOKEN = { numeri: contestoK };
    const fatti = [
      ['Contesto richiesto dalla verifica', { value: contestoK(stato.fit.context?.requestedTokens) || '—' }],
      ['Contesto addestrato', ispezione.context?.trainedTokens, TOKEN],
      ['Contesto del runtime', ispezione.context?.runtimeTokens, TOKEN],
      ['Contesto efficace', ispezione.context?.effectiveTokens, TOKEN],
      ['Template di chat', ispezione.template],
      ['Attrezzi', ispezione.capabilities?.tools],
      ['Chiamate di attrezzo', ispezione.capabilities?.toolCalls],
      ['Ruolo di sistema', ispezione.capabilities?.systemRole],
      ['Modello servito dal runtime', { value: ispezione.runtime?.servingModelId || (ispezione.runtime?.reachable ? 'nessuno' : 'runtime non raggiungibile') }],
    ];
    for (const [etichetta, fatto, opzioni] of fatti) contesto.append(rigaFatto(doc, etichetta, fatto, opzioni));
    /*
     * ⛔ `backend` e `build` sono FATTI TIPIZZATI (`{ state, value }` — `local-runtime-probe.mjs:21`),
     *   non stringhe. `filter(Boolean)` non li scarta (un oggetto e' *truthy*) e `join(' · ')` su
     *   due oggetti stampa **`[object Object] · [object Object]`**: e' quello che si leggeva nella
     *   scheda Compatibilita', misurato il 18/09/2026 sul 4174 (referto della ricognizione).
     * ⛔ La cura NON e' a monte: il server manda la forma giusta. Si legge il **valore** con
     *   `testoFatto`, la stessa funzione che usano le righe sorelle qui sopra (`:988-991`), che
     *   passano i fatti a `rigaFatto` e li sanno leggere. Solo questa riga li concatenava a mano.
     */
    const backend = [ispezione.backend, ispezione.build]
      .map((fatto) => testoFatto(fatto))
      .filter((testo) => testo && testo !== '—')
      .join(' · ');
    contesto.append(paragrafo(doc, 'talos-muted talos-mono talos-lab__space', backend || 'Backend non dichiarato dal runtime.'));
    if (ispezione.observedAt) {
      const quando = new Date(ispezione.observedAt);
      contesto.append(paragrafo(doc, 'talos-label', Number.isNaN(quando.getTime()) ? 'Misura senza data.' : `Misurato ${quando.toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}.`));
    }
    scatola.append(contesto);

    scatola.append(disegnaMacchina());
    return scatola;
  }

  function disegnaMacchina() {
    const card = nodo(doc, 'section', 'talos-card talos-card--pad talos-lab__space');
    card.append(nodo(doc, 'h3', 'talos-lab__heading', 'Questa macchina'));
    if (stato.caricamento.capacita) { card.append(paragrafo(doc, 'talos-muted', 'Misurazione…')); return card; }
    if (stato.errori.capacita) {
      const errore = paragrafo(doc, 'talos-muted', `Capacità non misurata: ${stato.errori.capacita}`);
      errore.setAttribute('role', 'alert');
      card.append(errore);
      card.append(pulsanteRicarica());
      return card;
    }
    let misura = null;
    try { misura = datiMemoria(stato.capacita, [], {}); } catch { misura = null; }
    if (!misura) { card.append(paragrafo(doc, 'talos-muted', 'La misura della capacità non è disponibile.')); return card; }
    /*
     * ⛔ Le etichette sono quelle della card della memoria del Model Lab (`misura-memoria.js:13`),
     *   ma qui NON si ripetono le righe che il verdetto ha già scritto con le sue parole: nella
     *   stessa schermata due righe col medesimo nome e due numeri diversi — o due unità diverse —
     *   sono la trappola delle «due misure che non tornano». Il verdetto dice quanto serve e quanto
     *   ce n'è; questa card dice com'è fatta la macchina.
     */
    card.append(
      riga(doc, 'RAM totale', byte(misura.totale), { chiave: 'ram-totale' }),
      riga(doc, 'RAM in uso', `${byte(misura.usata)} (${numero.format(Math.round(misura.percentuale))}%)`, { chiave: 'ram-in-uso' }),
      riga(doc, 'Disponibile sul disco', byte(misura.discoDisponibile), { chiave: 'disco-disponibile' }),
      riga(doc, 'Riserva sul disco', byte(misura.discoRiserva), { chiave: 'disco-riserva' }),
      riga(doc, 'Allocabile sul disco', byte(misura.discoAllocabile), { chiave: 'disco-allocabile' }),
    );
    const contestoMacchina = [stato.capacita?.platform, stato.capacita?.arch].filter(Boolean).join(' · ');
    if (contestoMacchina) card.append(paragrafo(doc, 'talos-muted talos-mono', contestoMacchina));
    return card;
  }

  function pulsanteRicarica() {
    const b = nodo(doc, 'button', 'talos-button talos-button--ghost talos-button--sm', 'Riprova');
    b.type = 'button';
    b.dataset.modelloRicarica = '';
    b.addEventListener('click', () => ricarica());
    return b;
  }

  function conParagrafo(scatola, testo, { errore = false } = {}) {
    const p = paragrafo(doc, 'talos-card talos-card--pad talos-muted', testo);
    p.setAttribute('role', errore ? 'alert' : 'status');
    if (errore) p.dataset.modelloErrore = '';
    scatola.append(p);
    if (errore) scatola.append(pulsanteRicarica());
    return scatola;
  }

  function disegnaPannello() {
    let contenuto;
    if (stato.scheda === 'files') contenuto = disegnaFiles();
    else if (stato.scheda === 'compatibility') contenuto = disegnaCompatibilita();
    else contenuto = disegnaCard();
    pannello.replaceChildren(contenuto);
    pannello.dataset.modelloPannello = stato.scheda;
    /*
     * APG «Tabs»: un pannello senza niente da focalizzare vuole `tabindex="0"`, così la tastiera
     * può raggiungerne il contenuto; se dentro c'è già roba focalizzabile, un secondo punto di
     * tabulazione è solo un intoppo. I titoli del README hanno `tabindex="-1"` e non contano.
     */
    pannello.tabIndex = pannello.querySelector('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])') ? -1 : 0;
  }

  function disegna() {
    if (stato.distrutto) return;
    disegnaBarra();
    disegnaTestata();
    disegnaPannello();
  }

  function vaiA(scelta) {
    if (!SCHEDE.includes(scelta) || stato.distrutto) return;
    stato.scheda = scelta;
    schede.seleziona(scelta);
    disegnaPannello();
    onScheda?.(scelta);
  }

  function ricarica() {
    if (stato.distrutto) return Promise.resolve();
    stato.errori = { modello: '', fit: '', capacita: '', repo: '' };
    stato.repo = null;
    /*
     * ⛔ Anche il REPOSITORY si rilegge, e dopo la lista: `percorsoRepo` vuole il modello, e senza
     *   questa seconda lettura una scheda che non era stata letta resterebbe nell'errore per
     *   sempre — un «Riprova» che promette una cosa e ne fa un'altra.
     */
    return caricaModello().then(() => Promise.all([caricaRepo(), caricaFit(), caricaCapacita()]));
  }

  function distruggi() {
    stato.distrutto = true;
    radice.remove?.();
  }

  /* ------------------------------- l'avvio ------------------------------- */

  disegna();
  const avvio = [];
  avvio.push(caricaFit());
  avvio.push(caricaCapacita());
  if (stato.modello) {
    // Il repository si legge dal manifest che ci hanno dato: niente lista da chiedere.
    avvio.push(caricaRepo());
  } else {
    avvio.push(caricaModello().then(() => caricaRepo()));
  }
  Promise.all(avvio).catch(() => {}); // gli errori sono già raccolti e disegnati da `leggi`

  return {
    vaiA,
    ricarica,
    distruggi,
    elemento: radice,
    get stato() { return stato; },
  };
}
