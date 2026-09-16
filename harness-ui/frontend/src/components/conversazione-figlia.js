/*
 * PO-08 — LA CONVERSAZIONE DI UN SOTTO-AGENTE, DENTRO IL PANNELLO.
 *
 * ⛔ Il difetto che questo file toglie: oggi l'unico modo di vedere cosa sta
 * facendo una figlia è il foglio «Albero sessione», dove la riga chiama
 * `passaASessione` — e la chat principale DIVENTA quella della figlia. Cioè per
 * guardare il figlio si perde il posto, e al ritorno bisogna ritrovarselo. Qui
 * la conversazione della figlia si apre DENTRO la scheda «Agenti» del pannello
 * di destra, con un «Indietro» che riporta all'elenco: la chat del padre non si
 * muove di un pixel.
 *
 * ⛔ Nessuna rotta nuova, e nessun dato inventato: una figlia è una sessione
 * come le altre, e `GET /api/v1/sessions/:id/events` è un EventSource che
 * RIGIOCA l'intera storia a chi si collega (`sessionRegistry.iscriviti()`
 * rimanda tutti gli eventi già accaduti). Quindi lo stesso identico flusso
 * serve sia la figlia che sta girando ADESSO sia quella finita ieri, e questo
 * componente non deve sapere quale delle due sta guardando.
 *
 * ⛔ Il flusso NON si apre qui dentro. `apriFlusso(sessionId, onEvento)` arriva
 * dalle opzioni: senza questa iniezione il componente sarebbe legato alla rete
 * e non si potrebbe provare senza un server acceso — ed è proprio la parte
 * («arriva un evento nuovo dopo il montaggio», «distruggi chiude davvero»)
 * dove i difetti si nascondono.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RICERCA — 10/09/2026, prima di scrivere (regola zero dell'owner).
 *
 * Codex è il riferimento indicato dall'owner. Fonti primarie lette oggi:
 *  - OpenAI, «Subagents» (developers.openai.com/codex/subagents): `/agent`
 *    ispeziona e passa fra i thread degli agenti MENTRE girano;
 *  - openai/codex #23594: la loro vista dei sotto-agenti mostra l'ID di
 *    sessione/thread invece del TASK e del MODELLO — difetto loro APERTO.
 *    ⇒ Qui la testata porta il COMPITO (`input.consegnaCorta`) e il MODELLO
 *    (`RunStarted.contesto.modello`); l'id di sessione resta in
 *    `elemento.dataset.sessioneFiglia`, per chi programma, e NON a schermo;
 *  - openai/codex #33519: `/agent` non apre il selettore mentre ci sono agenti
 *    in esecuzione; #16358: la UI dei sotto-agenti non compare sui thread
 *    ripresi dalla storia.
 *    ⇒ Il nostro +1: funzionare MENTRE la figlia gira **e** a sessione ripresa.
 *    È gratis, perché il replay e il vivo sono lo stesso flusso (vedi sopra).
 *
 *  - W3C APG, «Dialog (Modal) Pattern» (w3.org/WAI/ARIA/apg/patterns/
 *    dialog-modal, letto 10/09/2026): quando una vista che si è sovrapposta si
 *    chiude, il fuoco torna all'elemento che l'ha aperta, «unless the invoking
 *    element no longer exists». ⇒ `montaConversazioneFiglia` si segna chi aveva
 *    il fuoco al montaggio e glielo ridà alla distruzione, ma SOLO se quel nodo
 *    è ancora attaccato al documento: rimettere il fuoco su un nodo staccato lo
 *    manda su `<body>`, che è peggio del non farlo.
 *  - Sul testo che scorre: un vincolo che non conoscevo e che avrei sbagliato.
 *    «Per-token announcements should be avoided: streaming text is a visual
 *    progress channel, not a speech channel» (thefrontkit.com, «AI Chat UI Best
 *    Practices for 2026», letto 10/09/2026), e la cura consigliata è
 *    debounce/batch, non una regione più rumorosa (dev.to/babycat, «Agent
 *    Clarifying Questions Need a Focus Handoff, Not a Noisier Live Region»).
 *    ⇒ Il corpo della conversazione NON è una live region. L'unica cosa che si
 *    annuncia è il CAMBIO DI STATO della figlia (`role="status"` sul badge):
 *    succede quattro volte in tutta la vita di una figlia, non a ogni delta.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  aggiornaBloccoCodice,
  creaAttivita,
  creaBloccoCodice,
  creaMessaggioTalos,
  creaMessaggioUtente,
  creaRigaAttrezzo,
  impostaEsitoRiga,
} from './conversazione.js';
/*
 * ⛔⛔ 16/09, P0-E punto 10 — IL MARKDOWN ARRIVA, E ARRIVA DAL RENDERER CONDIVISO.
 *   Fino a ieri questo file scriveva `textContent` e lo dichiarava: «Testo NUDO, non markdown: il
 *   renderer incrementale vive nel monolite». Era vero quando è stato scritto; dal 12/09 non lo è
 *   più: BC-29 ha estratto `renderizzaMarkdown` in `components/markdown.js` proprio «perché la cura
 *   stia in UN posto solo e SI POSSA PROVARE», e `creaBloccoCodice` era già uscito dal monolite il
 *   09/09. ⇒ Qui si IMPORTA quello, non se ne scrive un secondo: un titolo, un elenco o una tabella
 *   non possono avere due rese diverse nella stessa app.
 * ⛔ Il renderer INCREMENTALE della chat (`renderizzaMarkdownIncrementale`, ancora in
 *   `legacy/app.js`) resta dov'è: non è questa la corsia che lo estrae. Qui si usa la strategia
 *   semplice e misurata: si ri-rende SOLO il blocco vivo, e solo quando il suo testo è cambiato.
 */
import { renderizzaMarkdown } from './markdown.js';
import { nomeUmanoAttrezzo } from './nomi-attrezzi.js';
import { parola, plurale } from './plurale.js';

/* ═══════════════════════════════════════════════════ La riduzione (pura) ═══ */

/**
 * Le parole degli stati, in un posto solo. Sono le STESSE di
 * `inspector.js` (`etichettaDelega`): la riga dell'elenco e la testata della
 * conversazione che si apre da quella riga non possono chiamare lo stesso
 * stato con due nomi diversi.
 */
export const ETICHETTA_STATO_FIGLIA = Object.freeze({
  'in-corso': 'In corso',
  conclusa: 'Conclusa',
  fallita: 'Non riuscita',
  interrotta: 'Interrotta',
});

/**
 * Il tono del badge per ogni stato. `null` = badge neutro, come in
 * `inspector.js`, dove «in corso» e «interrotta» non hanno un colore proprio:
 * il verde e il rosso restano riservati a un esito VERO.
 */
const TONO_STATO = Object.freeze({ 'in-corso': 'accent', conclusa: 'success', fallita: 'danger', interrotta: null });

/**
 * `RunError.code` e `RunFinished.outcome` non sono inventati qui: sono i valori
 * CONTATI sul disco delle sessioni vere e documentati in
 * `harness-ui/src/session-registry.mjs` («RunError.code sul disco vale
 * giri-esauriti (8), internal-error (5), fermato (2)»; chiusure: `fine-lavoro`
 * 65, `giri-finiti` 6, `errore` 2). ⛔ `fermato` è l'UNICO segno, negli eventi,
 * che qualcuno ha fermato la figlia: senza questa riga una fermata voluta si
 * leggerebbe «Non riuscita», cioè un guasto che non c'è stato.
 */
const CODICI_FERMATA = new Set(['fermato']);
const ESITI_FERMATA = new Set(['fermato']);
const ESITI_FALLITI = new Set(['errore']);

/** Il testo di un evento che arriva a pezzi, sempre come stringa e mai `undefined`. */
const pezzo = (v) => (typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v));

/**
 * L'esito di una chiamata ad attrezzo letto dal suo contenuto.
 *
 * ⛔ `ToolCallResult` non porta un campo «è andata male» (vedi
 * `agui-events.mjs`: `{messageId, toolCallId, content, role}`), quindi l'esito
 * si legge dal testo — con gli STESSI criteri della chat (`legacy/app.js:9221`,
 * `esitoAttrezzoFallito`), non con criteri nuovi: la stessa chiamata non può
 * essere verde nel pannello e rossa in conversazione.
 * Se il chiamante ha già arricchito l'evento con `errore: true` (lo fa il
 * monolite), quello VINCE: è un fatto, il testo è un indizio.
 */
export function esitoDaContenuto(attrezzo, contenuto) {
  const testo = pezzo(contenuto);
  if (attrezzo === 'prova') return /ℹ?\s*fail\s+([1-9]\d*)/i.test(testo) ? 'error' : 'success';
  if (attrezzo === 'shell') return /(?:^|\n)exit\s+([1-9]\d*)\b/i.test(testo) ? 'error' : 'success';
  return /^(?:REFUSED\.|ERROR\b|ERRORE\b|FAILED\b|FALLITO\b|NON RIUSCITO\b)/i.test(testo.trim()) ? 'error' : 'success';
}

/**
 * Il bersaglio di una chiamata, dagli argomenti JSON che arrivano a PEZZI.
 *
 * ⛔ Un JSON incompleto è la norma, non un errore: `ToolCallArgs` manda delta, e
 * finché non sono arrivati tutti `JSON.parse` lancia. Qui si risponde stringa
 * vuota e la riga resta senza dettaglio finché il dettaglio non esiste — mai
 * un pezzo di JSON a schermo, che sarebbe testo tecnico (regola owner 04/09).
 */
export function bersaglioAttrezzo(argomenti) {
  let a = null;
  try { a = JSON.parse(pezzo(argomenti)); } catch { return ''; }
  if (!a || typeof a !== 'object') return '';
  for (const chiave of ['percorso', 'path', 'file', 'query', 'pattern', 'comando', 'command', 'url', 'titolo', 'nome']) {
    const v = a[chiave];
    if (typeof v === 'string' && v.trim()) return v.trim().length > 72 ? `${v.trim().slice(0, 71)}…` : v.trim();
  }
  return '';
}

/** Il nome da mostrare per un attrezzo. ⛔ Mai l'id tecnico: se non lo conosciamo, lo si dice. */
function nomeAttrezzoAschermo(id) {
  return nomeUmanoAttrezzo(id) ?? 'attrezzo non ancora registrato';
}

/** La consegna di un giro, dalle tre forme che `RunStarted.input` può avere. */
function consegnaDaInput(input) {
  if (!input || typeof input !== 'object') return { testo: '', meta: '' };
  /* ⛔ `consegnaCorta` PRIMA di `consegna`: la consegna intera di una figlia comincia col preambolo
     del kernel, uguale per ogni delega — è la stessa ragione per cui `inspector.js` legge `taskCorto`
     prima di `task` (09/09: a 52 caratteri due deleghe diverse diventavano la stessa riga). */
  if (typeof input.comandoDiretto === 'string' && input.comandoDiretto.trim()) return { testo: input.comandoDiretto.trim(), meta: 'Comando' };
  const testo = [input.consegnaCorta, input.consegna].find((v) => typeof v === 'string' && v.trim());
  return { testo: testo ? testo.trim() : '', meta: input.seguito === true ? 'Follow-up' : '' };
}

/**
 * Riduce una sequenza di eventi AG-UI alla conversazione disegnabile di una figlia.
 * PURA: nessun DOM, nessuna rete, nessun orologio. Si può chiamare mille volte
 * sullo stesso array e dà sempre lo stesso risultato.
 *
 * @param {Array<object>} eventi gli eventi così come arrivano dal flusso
 * @returns {{
 *   turni: Array<{giro:number, consegna:string, meta:string, blocchi:Array<object>}>,
 *   stato: 'in-corso'|'conclusa'|'fallita'|'interrotta',
 *   giri: number, modello: string|null, attrezzi: number, scartati: number, motivo: string
 * }}
 *
 * Un `blocco` è una di tre forme, e l'ORDINE è quello di arrivo:
 *   { tipo:'testo',    id:messageId,  testo }
 *   { tipo:'attrezzo', id:toolCallId, attrezzo, argomenti, esito:'running'|'success'|'error', contenuto }
 *   { tipo:'errore',   id,            codice, messaggio }
 *
 * ⛔ `giri` è il numero di `RunStarted`, cioè quante volte la figlia è stata
 * messa in moto — NON i giri interni dell'agente, che li dichiara `/usage` e in
 * questo flusso non arrivano. Due misure diverse non prendono lo stesso nome.
 * ⛔ `scartati` non è cosmetico: è il conto degli eventi che non si è potuto
 * attaccare a niente (un `ToolCallArgs` il cui `Start` non è mai arrivato). Un
 * riduttore che li ingoia in silenzio non si distingue da uno che funziona.
 */
export function riduciEventiFiglia(eventi) {
  const r = creaRiduttoreFiglia();
  for (const e of Array.isArray(eventi) ? eventi : []) digerisciEventoFiglia(r, e);
  return istantaneaFiglia(r);
}

/**
 * ⛔⛔⛔ 16/09, P0-E punto 10 — LA RIDUZIONE ERA O(n²) IN REPLAY.
 *
 * `disegna()` girava a OGNI evento e chiamava `riduciEventiFiglia(eventi)` sull'INTERO array. In
 * replay — cioè ogni volta che si apre una figlia, perché `sessionRegistry.iscriviti()` rigioca
 * tutta la storia — n eventi costavano 1+2+3+…+n passaggi: su una figlia vera da 3.000 eventi sono
 * ~4,5 milioni di iterazioni per aprire un pannello. E lo stesso difetto è documentato, aperto,
 * nel visore di trascritti di Claude Code (luglio 2026): «full transcript re-parsing on every
 * content change… O(n) work per append for long-running/large transcripts» (letto il 16/09/2026).
 *
 * ⇒ Lo stato della riduzione VIVE fra una chiamata e l'altra: ogni evento si digerisce UNA volta.
 *   La funzione pura qui sopra resta identica per chi la usa come funzione pura (e per le sue
 *   prove): crea un riduttore, digerisce tutto, e ne restituisce l'istantanea.
 */
export function creaRiduttoreFiglia() {
  return {
    turni: [],
    /* Le chiavi vivono per TUTTA la sequenza, non per turno: un `ToolCallResult` può arrivare dopo che
       un nuovo `RunStarted` ha aperto il turno successivo, e la sua riga sta nel turno di prima. */
    perAttrezzo: new Map(),
    perMessaggio: new Map(),
    perRagionamento: new Map(),
    giri: 0,
    modello: null,
    attrezzi: 0,
    scartati: 0,
    stato: 'in-corso',
    motivo: '',
    digeriti: 0,
  };
}

/** L'istantanea disegnabile: gli stessi campi che la funzione pura ha sempre restituito. */
export function istantaneaFiglia(r) {
  return { turni: r.turni, stato: r.stato, giri: r.giri, modello: r.modello, attrezzi: r.attrezzi, scartati: r.scartati, motivo: r.motivo };
}

/** Quanto è grande questa conversazione: turni più blocchi. Serve a decidere se vale la pena tenerla in cache. */
export function pesoIstantanea(ist) {
  return (ist?.turni?.length || 0) + (ist?.turni || []).reduce((n, t) => n + (t.blocchi?.length || 0), 0);
}

/**
 * Digerisce UN evento. È il vecchio corpo dello `switch`, riga per riga: cambia solo dove tiene lo
 * stato (un oggetto che vive fra una chiamata e l'altra, invece di variabili locali del ciclo).
 */
export function digerisciEventoFiglia(r, e) {
  r.digeriti += 1;
  /* ⛔ Un turno implicito per il testo che arriva senza un `RunStarted` davanti: succede quando ci si
     collega a metà e il replay comincia da un punto qualunque. Meglio un turno senza consegna, detto
     tale, che buttare via il testo di una figlia. */
  const turnoCorrente = () => {
    if (r.turni.length === 0) r.turni.push({ giro: 0, consegna: '', meta: '', blocchi: [] });
    return r.turni[r.turni.length - 1];
  };

  if (!e || typeof e !== 'object') { r.scartati += 1; return; }
  switch (e.type) {
    case 'RunStarted': {
      r.giri += 1;
      const { testo, meta } = consegnaDaInput(e.input);
      r.turni.push({ giro: r.giri, consegna: testo, meta, blocchi: [] });
      const m = e.contesto && typeof e.contesto.modello === 'string' ? e.contesto.modello.trim() : '';
      if (m) r.modello = m;
      /* Un giro nuovo riapre la figlia: un `RunError` di ieri non deve tingere di rosso il turno di oggi. */
      r.stato = 'in-corso';
      r.motivo = '';
      break;
    }
    case 'TextMessageContent': {
      const id = pezzo(e.messageId) || 'senza-id';
      let blocco = r.perMessaggio.get(id);
      if (!blocco) {
        blocco = { tipo: 'testo', id, testo: '' };
        r.perMessaggio.set(id, blocco);
        turnoCorrente().blocchi.push(blocco);
      }
      /* ⛔ Il testo arriva a PEZZI: si concatena per messageId. Un turno per delta darebbe una
         conversazione fatta di sillabe — ed è esattamente l'errore che una vista «piccola» invita
         a fare, perché a occhio, su tre parole, non si vede. */
      blocco.testo += pezzo(e.delta);
      break;
    }
    case 'ReasoningMessageContent': {
      /*
       * ⛔ 16/09 — IL RAGIONAMENTO C'ERA E FINIVA NEL `default`. Il flusso della figlia porta
       *   `ReasoningMessageStart/Content/End` (`src/agui-events.mjs:104-112`) e questo riduttore li
       *   contava fra i «conosciuti e non usati»: a schermo, di tutto il ragionamento di una figlia,
       *   non arrivava niente. ⇒ Diventa un blocco suo, COLLASSABILE e chiuso di serie — come in
       *   chat, dove il ragionamento sta in una card richiudibile e non nel corpo della risposta
       *   (AG-UI, «Reasoning»: è tenuto distinto «to avoid polluting conversation history»).
       */
      const id = pezzo(e.messageId) || 'ragionamento-senza-id';
      let blocco = r.perRagionamento.get(id);
      if (!blocco) {
        blocco = { tipo: 'ragionamento', id, testo: '' };
        r.perRagionamento.set(id, blocco);
        turnoCorrente().blocchi.push(blocco);
      }
      blocco.testo += pezzo(e.delta);
      break;
    }
    case 'ToolCallStart': {
      const id = pezzo(e.toolCallId);
      if (!id || r.perAttrezzo.has(id)) { r.scartati += 1; break; }
      const blocco = { tipo: 'attrezzo', id, attrezzo: pezzo(e.toolCallName), argomenti: '', esito: 'running', contenuto: '' };
      r.perAttrezzo.set(id, blocco);
      turnoCorrente().blocchi.push(blocco);
      r.attrezzi += 1;
      break;
    }
    case 'ToolCallArgs': {
      const blocco = r.perAttrezzo.get(pezzo(e.toolCallId));
      /* ⛔ AL CONTRARIO: argomenti di una chiamata che non è mai cominciata. Non si crea una riga
         fantasma «attrezzo sconosciuto» — non sapremmo nemmeno come chiamarla — e non si crepa:
         si scarta, e il conto lo dice. */
      if (!blocco) { r.scartati += 1; break; }
      blocco.argomenti += pezzo(e.delta);
      break;
    }
    case 'ToolCallResult': {
      const blocco = r.perAttrezzo.get(pezzo(e.toolCallId));
      if (!blocco) { r.scartati += 1; break; }
      blocco.contenuto = pezzo(e.content);
      blocco.esito = e.errore === true ? 'error' : esitoDaContenuto(blocco.attrezzo, blocco.contenuto);
      break;
    }
    case 'RunFinished': {
      const esito = pezzo(e.outcome);
      r.stato = ESITI_FERMATA.has(esito) ? 'interrotta' : ESITI_FALLITI.has(esito) ? 'fallita' : 'conclusa';
      r.motivo = r.stato === 'interrotta' ? 'La figlia è stata fermata prima di concludere.' : '';
      break;
    }
    case 'RunError': {
      const codice = pezzo(e.code);
      r.stato = CODICI_FERMATA.has(codice) ? 'interrotta' : 'fallita';
      /* ⛔ Il motivo è il messaggio del server, non una frase nostra: se dice «24 su 24 giri usati»
         quella è l'unica cosa che permette a chi legge di fare qualcosa. Quando il server non dice
         niente si dice che non l'ha detto, invece di riempire il buco. */
      r.motivo = pezzo(e.message).trim() || 'Il server non ha detto perché.';
      turnoCorrente().blocchi.push({ tipo: 'errore', id: `errore-${turnoCorrente().blocchi.length}`, codice, messaggio: r.motivo });
      break;
    }
    default:
      /* TextMessageStart/End, ReasoningMessageStart/End, StateDelta, WorkspaceChanged…: conosciuti e
         non usati qui. ⛔ NON si contano fra gli scartati — «scartato» deve voler dire «non ho
         saputo dove metterlo», altrimenti il numero non è un allarme di niente. */
      break;
  }
}

/* ═══════════════════════════════════════════════════════════ La vista ═══ */

function el(d, tag, classe, testo) {
  const nodo = d.createElement(tag);
  if (classe) nodo.className = classe;
  if (testo !== undefined && testo !== null) nodo.textContent = String(testo);
  return nodo;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function simbolo(d, classe, nome) {
  const svg = d.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', classe);
  const use = d.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#${nome}`);
  svg.append(use);
  return svg;
}

/*
 * ⛔⛔ 16/09, P0-E punto 10 — DUE MEMORIE DI MODULO, ENTRAMBE CON UN TETTO DICHIARATO.
 *
 * Fino a ieri passare da una figlia all'altra e tornare indietro voleva dire: smontare, rimontare,
 * riaprire il flusso e RIGIOCARE tutta la storia da capo — con il pannello vuoto nel frattempo e lo
 * scorrimento perso. Sono due dimenticanze diverse e prendono due memorie diverse:
 *  · `SCORRIMENTI`: dove stava a leggere, per sessione. ⛔ Per SESSIONE e non una sola globale:
 *    una posizione condivisa fra figlie diverse porterebbe la B dove stava la A, che è peggio che
 *    ripartire dall'inizio.
 *  · `ISTANTANEE`: l'ultima riduzione, per dipingere SUBITO invece di un pannello bianco mentre il
 *    replay ricomincia.
 * ⛔ Tutte e due sono LIMITATE, e il limite è scritto qui: una cache senza tetto in una app che
 *   resta aperta per ore è una perdita di memoria lenta — la specie che non si vede mai.
 */
const TETTO_SCORRIMENTI = 24;   // sono numeri: costano niente, ma non infiniti
const TETTO_ISTANTANEE = 3;     // sono conversazioni intere: se ne tengono poche
const PESO_MASSIMO_ISTANTANEA = 400; // turni + blocchi: oltre, non si tiene in cache (si rigioca, ed è giusto così)
const SCORRIMENTI = new Map();
const ISTANTANEE = new Map();

/** Una mappa che non cresce: la voce più vecchia esce quando ne entra una di troppo. */
function ricorda(mappa, chiave, valore, tetto) {
  if (!chiave) return;
  mappa.delete(chiave);
  mappa.set(chiave, valore);
  while (mappa.size > tetto) mappa.delete(mappa.keys().next().value);
}

/** Il riassunto di un gruppo di attrezzi: «3 attrezzi usati», «1 attrezzo usato». */
function riassuntoGruppo(quanti) {
  return `${plurale(quanti, 'attrezzo')} ${parola(quanti, 'usato', 'usati')}`;
}

/**
 * Monta la conversazione di una figlia dentro `contenitore`.
 *
 * @param {Element} contenitore dove vive la vista (la scheda «Agenti» del pannello)
 * @param {object} opzioni
 * @param {string} opzioni.sessionId la sessione della figlia
 * @param {string} [opzioni.nome] il compito, come lo mostra la riga dell'elenco (`taskCorto`)
 * @param {(sessionId:string, onEvento:(e:object)=>void, ganci:{onAperto:()=>void}) => (()=>void)} opzioni.apriFlusso
 *        apre il flusso e RITORNA la funzione che lo chiude. ⛔ `onAperto` è nuovo (16/09): finché
 *        nessuno lo chiama, questa vista NON sa se il collegamento c'è — e fino a ieri lo diceva
 *        lo stesso («Il collegamento è aperto», scritto senza saperlo).
 * @param {() => void} [opzioni.onIndietro] torna all'elenco
 * @param {Document} [opzioni.document]
 * @returns {{aggiorna:(eventi:Array<object>)=>void, distruggi:()=>void, elemento:Element}}
 */
export function montaConversazioneFiglia(contenitore, {
  sessionId, nome = '', apriFlusso, onIndietro, document: documentObj,
} = {}) {
  const d = documentObj || globalThis.document;
  const eventi = [];
  /* ⛔ La riduzione VIVE fra un evento e l'altro: ogni evento si digerisce una volta sola. Prima
     `disegna()` richiamava `riduciEventiFiglia(eventi)` sull'intero array a OGNI evento — O(n²). */
  let riduttore = creaRiduttoreFiglia();
  let chiudiFlusso = null;
  let distrutto = false;
  let flussoAperto = false;
  let eventiNonDisegnati = 0;
  let disegnoProgrammato = 0;
  let scorrimentoDaRimettere = SCORRIMENTI.has(sessionId) ? SCORRIMENTI.get(sessionId) : null;
  /* L'ultima riduzione di QUESTA figlia, se l'abbiamo già guardata: serve a dipingere subito. */
  let istantaneaDaCache = ISTANTANEE.get(sessionId) || null;

  /* ⛔ Chi aveva il fuoco PRIMA: la riga della scheda «Agenti» che è stata premuta. Glielo si ridà
     alla chiusura — W3C APG, dialog-modal — ma solo se quel nodo esiste ancora (vedi `distruggi`). */
  const fuocoPrecedente = d.activeElement ?? null;

  /* ---------------------------------------------------------------- testata */
  const elemento = el(d, 'div', 'talos-card talos-inspector-card talos-figlia');
  elemento.dataset.c = 'ConversazioneFiglia';
  /* ⛔ L'id di sessione sta QUI e non a schermo: è il difetto aperto di Codex (#23594, «shows the
     session/thread id instead of the task and the model»). A chi guarda serve il compito; l'id
     serve a chi programma, e lo trova nel dataset. */
  if (sessionId) elemento.dataset.sessioneFiglia = String(sessionId);
  elemento.tabIndex = -1;
  elemento.setAttribute('role', 'region');

  const testata = el(d, 'div', 'talos-inspector-card__head talos-figlia__head');
  /* ⛔ WCAG 2.5.3 «Label in Name» (W3C, letto il 10/09/2026): un `aria-label` SOSTITUISCE il testo
     visibile, non lo aggiunge — quindi deve CONTENERLO, o chi guida col comando vocale dice
     «clicca Indietro» e non succede niente. Trovato dal vivo il 10/09: la sonda cercava il
     pulsante per nome e non lo trovava. Aveva ragione lei. */
  const indietro = el(d, 'button', 'talos-button talos-button--ghost talos-button--sm talos-figlia__indietro');
  indietro.type = 'button';
  indietro.append(simbolo(d, 'i i--sm', 'i-arrow-left'), d.createTextNode('Indietro'));
  indietro.setAttribute('aria-label', 'Indietro: torna all’elenco dei sotto-agenti');
  const titolo = el(d, 'b', 'talos-figlia__titolo talos-truncate', nome || 'Delega senza compito registrato');
  const badge = el(d, 'span', 'talos-badge talos-badge--sm');
  /* ⛔ L'UNICA cosa annunciata da sola: il cambio di stato. Il testo che scorre NON è una live
     region — per-token announcements vanno evitati (ricerca 10/09, in testa al file). */
  badge.setAttribute('role', 'status');
  testata.append(indietro, titolo, badge);
  elemento.append(testata);

  const misure = el(d, 'div', 'talos-kv talos-figlia__misure');
  const misureChiave = el(d, 'span', 'talos-kv__k', 'Modello');
  const misureValore = el(d, 'span', 'talos-kv__v talos-mono', '—');
  misure.append(misureChiave, misureValore);
  const conteggi = el(d, 'div', 'talos-kv talos-figlia__misure');
  const conteggiChiave = el(d, 'span', 'talos-kv__k', 'Ha fatto');
  const conteggiValore = el(d, 'span', 'talos-kv__v talos-mono', '—');
  conteggi.append(conteggiChiave, conteggiValore);
  elemento.append(misure, conteggi);

  const nota = el(d, 'p', 'talos-inspector__hint talos-figlia__nota');
  nota.hidden = true;
  elemento.append(nota);

  /*
   * ⛔⛔⛔ IL PANNELLO NON SCORREVA — owner, 11/09/2026: «falla scrollare la barra conversazione
   *   agenti». Misurato sul banco (porta 4178, copia dello store dell'owner, Chrome 1440×900, la
   *   figlia vera da 100 righe attrezzo): `.talos-figlia` alta **8.688 px** dentro una colonna alta
   *   **900 px**, il suo fondo **7.921 px sotto il bordo della finestra**, e `overflow-y: visible`
   *   su OGNI antenato fino a `body` (che è `hidden`). `scrollTop = 99999` lasciava `scrollTop` a
   *   **0**: non era scomodo da scorrere, era impossibile — 7.921 px di conversazione disegnati
   *   fuori dallo schermo e irraggiungibili.
   *
   * CAUSA: l'unico contenitore che scorre, in questa colonna, è `.talos-inspector__body`
   *   (`overflow-y:auto`), cioè `#railAgenti` — e chi apre questa vista lo mette `hidden` e infila
   *   il pannello come SUO FRATELLO, in un `div` senza classe. Un `div` senza classe dentro un
   *   flex-column non ha né `overflow` né `min-height:0`: spegnere l'unico scorrevole e metterci
   *   accanto qualcosa che non lo è lascia la colonna senza nessuno che scorra.
   *
   * RICERCA 11/09/2026, prima di scrivere:
   *  · la regola di flexbox che rende inerte un `overflow:auto` annidato è `min-width/height:auto`
   *    (W3C css-flexbox, «the `auto` minimum size applies only when overflow is visible»; philipwalton/
   *    flexbugs #241 la elenca come caso speciale dei contenitori annidati) ⇒ `min-height:0` serve a
   *    OGNI livello della catena, non solo a quello che scorre. Qui: `.talos-figlia-ospite`,
   *    `.talos-figlia`, `.talos-figlia__corpo`.
   *  · un contenitore che scorre dev'essere raggiungibile da tastiera — axe `scrollable-region-focusable`,
   *    WCAG 2.1.1: «ensure it is programmatically focusable using tabindex=0», altrimenti frecce e
   *    PagGiù non hanno dove agire. Il `tabindex` sta QUI, sul corpo che scorre, e non sulla card
   *    (che ha già `tabIndex = -1` per ricevere il fuoco al montaggio: -1 non entra nel giro del Tab).
   *  · `overscroll-behavior: contain` (MDN): arrivati in fondo, la rotella NON prosegue sul pannello
   *    dietro — lo «scroll chaining» qui farebbe scorrere la chat della madre mentre si legge la figlia.
   */
  const corpo = el(d, 'div', 'talos-figlia__corpo');
  corpo.tabIndex = 0;
  elemento.append(corpo);

  const vuoto = el(d, 'p', 'talos-inspector__hint talos-figlia__vuoto', 'Nessun evento ancora da questo sotto-agente. Il collegamento è aperto: appena la figlia dice o fa qualcosa, compare qui.');
  /*
   * ⛔⛔ 16/09 — LO STATO VUOTO DICEVA UNA COSA CHE NON SAPEVA. «Il collegamento è aperto» compariva
   *   nell'istante del montaggio, prima che l'EventSource avesse aperto qualunque cosa: se il server
   *   non rispondeva, quella frase restava a schermo a garantire un collegamento che non c'era.
   * ⇒ Prima dell'apertura si dice quello che sta succedendo davvero, e lo stato vuoto compare solo
   *   quando il collegamento è confermato (`onAperto`). Due fatti diversi, due frasi diverse.
   * ⛔ `role="status"` e non `aria-live="assertive"`: è un'attesa, non un allarme.
   */
  const scheletro = el(d, 'p', 'talos-inspector__hint talos-figlia__scheletro', 'Mi collego a questo sotto-agente…');
  scheletro.setAttribute('role', 'status');
  corpo.append(scheletro, vuoto);

  /* ------------------------------------------------------------ ricostruzione
   * ⛔ La vista si AGGIORNA, non si rifà: un evento nuovo dopo il montaggio deve comparire senza
   * ricostruire ciò che c'era: rifare tutto perderebbe lo scorrimento e la selezione di chi sta
   * leggendo, e chiuderebbe i gruppi che aveva aperto. Queste mappe sono la memoria di cosa è già
   * disegnato: chiave del turno → { elemento, blocchi: Map }.
   */
  const disegnati = new Map();

  const chiaveBlocco = (b) => (b.tipo === 'attrezzo' ? `a:${b.id}` : b.tipo === 'testo' ? `t:${b.id}` : `e:${b.id}`);

  function creaVistaTurno(turno) {
    const nodo = el(d, 'div', 'talos-figlia__turno');
    if (turno.consegna) nodo.append(creaMessaggioUtente({ testo: turno.consegna, meta: turno.meta }, { document: d }));
    corpo.append(nodo);
    return { elemento: nodo, blocchi: new Map() };
  }

  /**
   * Il recinto di codice, col vestito della chat: barra del linguaggio, «Copia», evidenziazione.
   * ⛔ È `creaBloccoCodice` di `conversazione.js` — lo STESSO che usa la chat — non una seconda
   *   copia: il 09/09 è uscito dal monolite proprio per poter essere usato da più superfici.
   * ⛔ `chiuso` arriva dal renderer: un recinto ancora aperto (lo streaming è a metà) non si
   *   evidenzia e non si lascia copiare, perché sarebbe codice a metà.
   */
  const recinto = (testoCodice, linguaggio, chiuso) => creaBloccoCodice({ testo: testoCodice, linguaggio, chiuso: chiuso !== false }, { document: d });

  /**
   * Rende il markdown DENTRO un contenitore che resta lo stesso nodo.
   * ⛔ Il nodo non si sostituisce: chi lo sta leggendo (e le prove che ne tengono il riferimento)
   *   deve ritrovarlo. Si sostituiscono solo i suoi figli, e solo quando il testo è CAMBIATO.
   */
  function rendiMarkdown(contenitore, testoGrezzo) {
    contenitore.replaceChildren(renderizzaMarkdown(testoGrezzo, { document: d, bloccoCodice: recinto }));
  }

  function creaVistaBlocco(vistaTurno, blocco, gruppo, modello) {
    if (blocco.tipo === 'testo') {
      const messaggio = creaMessaggioTalos({ modello: modello || '', paragrafi: [] }, { document: d });
      /*
       * ⛔ 16/09 — QUI C'ERA `textContent`, e il commento diceva perché: «il renderer incrementale
       *   vive nel monolite». Non è più vero dal 12/09 (BC-29): `renderizzaMarkdown` è un componente,
       *   e `creaBloccoCodice` lo è dal 09/09. Il limite era dichiarato ed è stato tolto, non
       *   aggirato: si usa il renderer CONDIVISO, non se ne scrive un secondo.
       * ⛔ Resta un `div` e non un `p`: il markdown produce titoli, elenchi e tabelle, e un `<p>`
       *   che contiene un `<ul>` è HTML non valido — il browser lo spezza e il layout salta.
       *   La classe `assistant-copy` non cambia: è il gancio che il resto della app conosce.
       */
      const p = el(d, 'div', 'assistant-copy');
      rendiMarkdown(p, blocco.testo);
      messaggio.append(p);
      vistaTurno.elemento.append(messaggio);
      return { tipo: 'testo', p, testoMostrato: blocco.testo };
    }
    if (blocco.tipo === 'ragionamento') {
      /*
       * ⛔ Il ragionamento nasce CHIUSO, al contrario del gruppo di attrezzi (che nasce aperto
       *   perché è ciò che la figlia sta facendo). È la stessa scelta della chat: il ragionamento è
       *   disponibile, non imposto — AG-UI lo tiene distinto dalla risposta «to avoid polluting
       *   conversation history», e a schermo la traduzione di quella frase è «collassato».
       */
      const creato = creaAttivita({ riassunto: 'Ragionamento', aperto: false }, { document: d });
      creato.card.dataset.c = 'ReasoningBundle';
      const corpoTesto = el(d, 'div', 'assistant-copy talos-figlia__ragionamento');
      rendiMarkdown(corpoTesto, blocco.testo);
      creato.contenitore.append(corpoTesto);
      vistaTurno.elemento.append(creato.card);
      return { tipo: 'ragionamento', p: corpoTesto, testoMostrato: blocco.testo };
    }
    if (blocco.tipo === 'errore') {
      const box = el(d, 'p', 'talos-inspector__hint talos-inspector__hint--danger talos-figlia__errore', blocco.messaggio);
      vistaTurno.elemento.append(box);
      return { tipo: 'errore', box };
    }
    const { riga, summaryText, dettaglio } = creaRigaAttrezzo({
      attrezzo: blocco.attrezzo,
      nome: nomeAttrezzoAschermo(blocco.attrezzo),
      dettaglio: bersaglioAttrezzo(blocco.argomenti),
      esito: blocco.esito,
    }, { document: d });
    gruppo.contenitore.append(riga);
    return { tipo: 'attrezzo', riga, summaryText, dettaglio };
  }

  function aggiornaVistaBlocco(vista, blocco) {
    if (vista.tipo === 'testo' || vista.tipo === 'ragionamento') {
      /*
       * ⛔ SOLO IL BLOCCO VIVO si ri-rende, e solo quando il suo testo è cambiato. È la strategia
       *   «semplice e misurata»: un blocco concluso non cambia più, quindi il suo markdown si rende
       *   UNA volta e non si tocca più — il costo per frame è quello dell'ultimo blocco, non quello
       *   di tutta la conversazione. Il confronto è sul testo GREZZO e non sul DOM: `textContent`
       *   dopo il render non è più uguale al markdown di partenza (i `#` dei titoli spariscono), e
       *   confrontarlo lì vorrebbe dire ridisegnare a ogni frame per sempre.
       */
      if (vista.testoMostrato !== blocco.testo) { rendiMarkdown(vista.p, blocco.testo); vista.testoMostrato = blocco.testo; }
      return;
    }
    if (vista.tipo === 'errore') { if (vista.box.textContent !== blocco.messaggio) vista.box.textContent = blocco.messaggio; return; }
    const bersaglio = bersaglioAttrezzo(blocco.argomenti);
    if (vista.dettaglio.textContent !== bersaglio) vista.dettaglio.textContent = bersaglio;
    if (vista.esitoMostrato !== blocco.esito) { impostaEsitoRiga(vista.riga, blocco.esito); vista.esitoMostrato = blocco.esito; }
  }

  /*
   * ⛔ Quanto vicino al fondo conta come «in fondo». 24 px: meno di una riga di testo, abbastanza
   *   da assorbire l'arrotondamento sub-pixel di un contenitore che cresce mentre si legge.
   */
  const VICINO_AL_FONDO_PX = 24;
  /**
   * ⛔⛔ Il pannello che scorre apre una domanda che prima non esisteva: dove guarda mentre la
   *   figlia LAVORA? Ricerca 11/09/2026 (stackblitz-labs/use-stick-to-bottom; CSS-Tricks, «Pin
   *   Scrolling to Bottom»; «Intuitive Scrolling for Chatbot Message Streaming»): la vista segue il
   *   fondo finché chi legge È al fondo, e **si fa da parte nell'istante in cui risale**. Un
   *   pannello che riporta in fondo mentre si rilegge un comando di dieci righe fa perdere il posto
   *   a ogni evento — e questa figlia ne emette centinaia.
   * ⛔ Geometria sconosciuta (vista non ancora attaccata al documento, DOM finto di una prova) =
   *   non si tocca lo scorrimento di nessuno: muovere `scrollTop` alla cieca è peggio che non farlo.
   */
  function seguivaIlFondo() {
    const altezza = corpo.scrollHeight; const visibile = corpo.clientHeight; const dove = corpo.scrollTop;
    if (!Number.isFinite(altezza) || !Number.isFinite(visibile) || !Number.isFinite(dove)) return false;
    return altezza - dove - visibile <= VICINO_AL_FONDO_PX;
  }

  /**
   * Coalesce i disegni su UN frame.
   * ⛔ Prima `disegna()` girava a ogni singolo evento (`conversazione-figlia.js:580-581`): in replay
   *   sono centinaia di disegni per un frame solo, tutti buttati via tranne l'ultimo.
   * ⛔ Senza `requestAnimationFrame` (banchi Node, prove unitarie) si disegna SUBITO: un ripiego
   *   che rimanda a un battito che non esiste è una funzione che non fa niente.
   */
  function programmaDisegno() {
    if (distrutto) return;
    if (typeof globalThis.requestAnimationFrame !== 'function') { disegna(); return; }
    if (disegnoProgrammato) return;
    disegnoProgrammato = globalThis.requestAnimationFrame(() => {
      disegnoProgrammato = 0;
      if (!distrutto) disegna();
    });
  }

  function disegna() {
    const seguiva = seguivaIlFondo(); // ⛔ PRIMA di mutare: dopo, l'altezza è già cambiata e la domanda non ha più senso
    const vivo = istantaneaFiglia(riduttore);
    /*
     * ⛔ La cache serve al PRIMO COLPO D'OCCHIO e non un istante di più: appena la riduzione VIVA ha
     *   raggiunto il peso di quella in cache si passa alla viva e la cache si butta. Senza questa
     *   soglia il replay (che riparte da zero) farebbe lampeggiare il pannello: tre turni, poi uno,
     *   poi di nuovo tre.
     * ⛔ Limite dichiarato: se la storia della figlia è cambiata sul server fra una visita e
     *   l'altra, per quei pochi frame si legge la versione di prima. È il prezzo di non mostrare un
     *   pannello bianco, ed è scritto qui perché nessuno debba scoprirlo dal vivo.
     */
    let ridotto = vivo;
    if (istantaneaDaCache) {
      if (pesoIstantanea(vivo) >= pesoIstantanea(istantaneaDaCache)) istantaneaDaCache = null;
      else ridotto = istantaneaDaCache;
    }

    badge.textContent = ETICHETTA_STATO_FIGLIA[ridotto.stato];
    const tono = TONO_STATO[ridotto.stato];
    badge.className = `talos-badge talos-badge--sm${tono ? ` talos-badge--${tono}` : ''}`;
    elemento.dataset.stato = ridotto.stato;
    elemento.setAttribute('aria-label', `Conversazione del sotto-agente: ${titolo.textContent} — ${ETICHETTA_STATO_FIGLIA[ridotto.stato]}`);
    /* ⛔ «—» e non «(default)»: il modello lo dichiara `RunStarted.contesto`, e finché quell'evento
       non è arrivato non lo sappiamo. Un nome di ripiego qui sarebbe un modello inventato. */
    misureValore.textContent = ridotto.modello || '—';
    conteggiValore.textContent = `${plurale(ridotto.giri, 'giro')} · ${plurale(ridotto.attrezzi, 'chiamata')}`;
    /* ⛔ L'accordo si flette col numero: «1 evento non collegabili» è la firma di una frase
       incollata, e chi la legge smette di fidarsi del resto della riga. */
    const notaTesto = (eventiNonDisegnati > 0 ? nota.textContent : '') || ridotto.motivo || (ridotto.scartati > 0
      ? `${plurale(ridotto.scartati, 'evento', 'eventi')} che non ${parola(ridotto.scartati, 'si è potuto', 'si sono potuti')} collegare a niente: ${parola(ridotto.scartati, 'scartato', 'scartati')}.`
      : '');
    nota.textContent = notaTesto;
    nota.hidden = notaTesto === '';

    /*
     * Tre fasi, e ognuna dice la verità di quel momento:
     *   · «mi collego»  — il flusso non ha ancora confermato l'apertura e non è arrivato niente;
     *   · «ricostruisco» — stanno arrivando eventi ma non c'è ancora un turno da mostrare;
     *   · lo stato vuoto — il collegamento c'è e la figlia non ha (ancora) detto niente.
     */
    const conTurni = ridotto.turni.length > 0;
    const fase = conTurni ? null : (riduttore.digeriti > 0 ? 'ricostruisco' : (flussoAperto ? null : 'collego'));
    if (fase) scheletro.textContent = fase === 'collego' ? 'Mi collego a questo sotto-agente…' : 'Ricostruisco la conversazione…';
    scheletro.hidden = fase === null;
    vuoto.hidden = conTurni || fase !== null;

    /* ⛔ Meno turni di quanti ne sono disegnati vuol dire che si sta guardando un'ALTRA storia (un
       `aggiorna()` con un'altra figlia, o una cronologia riscritta): lì si rifà, perché aggiornare
       sopra mescolerebbe due conversazioni. */
    if (ridotto.turni.length < disegnati.size) { corpo.replaceChildren(vuoto); disegnati.clear(); }

    for (const [i, turno] of ridotto.turni.entries()) {
      let vistaTurno = disegnati.get(i);
      if (!vistaTurno) { vistaTurno = creaVistaTurno(turno); disegnati.set(i, vistaTurno); }
      /* Il raggruppamento degli attrezzi segue la chat: le chiamate CONSECUTIVE stanno in un'unica
         card richiudibile, e un testo in mezzo chiude il gruppo e ne apre uno nuovo dopo. */
      let gruppo = null;
      for (const blocco of turno.blocchi) {
        if (blocco.tipo !== 'attrezzo') { gruppo = null; }
        else if (!gruppo) {
          const chiaveGruppo = `g:${blocco.id}`;
          gruppo = vistaTurno.blocchi.get(chiaveGruppo);
          if (!gruppo) {
            /* ⛔ Il gruppo nasce APERTO. Chiuso direbbe «3 attrezzi usati» e nient'altro — cioè
               esattamente il difetto di Codex #23594: una vista che nomina, invece di mostrare.
               Il clic per chiuderlo lo gestisce la regia dei disclosure di app.js
               (`[aria-expanded][aria-controls]`): qui non serve un secondo ascoltatore. */
            const creato = creaAttivita({ riassunto: riassuntoGruppo(0), aperto: true }, { document: d });
            gruppo = { ...creato, quanti: 0 };
            vistaTurno.blocchi.set(chiaveGruppo, gruppo);
            vistaTurno.elemento.append(creato.card);
          }
          gruppo.quanti = 0;
        }
        if (blocco.tipo === 'attrezzo' && gruppo) { gruppo.quanti += 1; gruppo.summaryText.textContent = riassuntoGruppo(gruppo.quanti); }
        const chiave = chiaveBlocco(blocco);
        let vista = vistaTurno.blocchi.get(chiave);
        if (!vista) { vista = creaVistaBlocco(vistaTurno, blocco, gruppo, ridotto.modello); vistaTurno.blocchi.set(chiave, vista); }
        aggiornaVistaBlocco(vista, blocco);
      }
    }

    /*
     * ⛔ DOVE STAVA A LEGGERE, e solo la prima volta che c'è qualcosa da leggere: rimettere la
     *   posizione su un corpo ancora vuoto vuol dire scrivere `scrollTop` su un contenitore alto
     *   zero, cioè non fare niente e credere di averlo fatto.
     * ⛔ E vince sul «torna in fondo»: chi riapre una figlia che stava rileggendo a metà non deve
     *   ritrovarsi in coda.
     */
    /*
     * ⛔ Si aspetta che la geometria ESISTA: al montaggio la vista non è ancora attaccata al
     *   documento, `scrollHeight` è 0, e scrivere `scrollTop` lì vuol dire non fare niente e credere
     *   di averlo fatto. ⛔ E la finestra del ripristino la chiude LA PERSONA, non un conteggio: al
     *   primo `scroll` suo la posizione salvata si butta (vedi l'ascoltatore sotto), così un
     *   ripristino tardivo non può strapparla via da dove stava leggendo.
     */
    if (scorrimentoDaRimettere !== null && conTurni && corpo.scrollHeight > 0) {
      corpo.scrollTop = scorrimentoDaRimettere;
      scorrimentoDaRimettere = null;
      return;
    }
    /* ⛔ Solo se ci si era: chi è risalito a rileggere resta dov'è (vedi `seguivaIlFondo`). */
    if (seguiva) corpo.scrollTop = corpo.scrollHeight;
  }

  disegna();
  /*
   * ⛔⛔ L'OSPITE SI MARCA, e la marca non è cosmetica: dentro la colonna il pannello è un figlio
   *   di un flex-column ALTO QUANTO LA FINESTRA, e senza `flex:1 1 auto; min-height:0` su QUESTO
   *   nodo la catena si spezza al primo anello e il corpo non può scorrere (vedi la misura in testa
   *   a `corpo`: 8.688 px in 900, `scrollTop` bloccato a 0).
   * ⛔ La classe la mette il componente e non chi lo monta: il pannello si apre da `legacy/app.js`,
   *   ma anche dal laboratorio e dalle prove — un contratto che vive in UNO dei tre chiamanti è un
   *   contratto che gli altri due rompono senza accorgersene. `distruggi()` la toglie: l'ospite non
   *   è nostro, si restituisce com'era.
   */
  contenitore?.classList?.add?.('talos-figlia-ospite');
  contenitore?.append(elemento);
  elemento.focus?.();

  const torna = () => { if (typeof onIndietro === 'function') onIndietro(); };
  indietro.addEventListener('click', torna);
  /* ⛔ Esc fa la STESSA cosa di «Indietro», non una cosa simile: due uscite che si comportano
     diversamente sono due modi di perdersi. L'ascoltatore sta sull'elemento (il fuoco è dentro, e
     keydown risale), così non resta appeso al documento dopo `distruggi()`. */
  const suTasto = (evento) => {
    if (evento?.key !== 'Escape' || evento.defaultPrevented) return;
    evento.preventDefault();
    torna();
  };
  elemento.addEventListener('keydown', suTasto);

  /* ⛔ Chi scorre comanda: al primo gesto suo la posizione salvata non si rimette più. Senza questo,
     un ripristino che arriva tardi (la geometria si conosce solo dopo il primo disegno attaccato)
     strapperebbe via chi ha già cominciato a leggere. L'ascoltatore si toglie in `distruggi`. */
  const suScorrimento = () => { scorrimentoDaRimettere = null; };
  corpo.addEventListener('scroll', suScorrimento);

  /* ⛔ Il flusso si apre DOPO che la vista esiste: `iscriviti()` rigioca l'intera storia, e la
     rigioca SUBITO — se il DOM non fosse pronto i primi eventi arriverebbero nel vuoto. */
  if (typeof apriFlusso === 'function') {
    try {
      chiudiFlusso = apriFlusso(sessionId, (evento) => {
        if (distrutto) return; // un evento in ritardo non ridisegna una vista già smontata
        /*
         * ⛔⛔ 16/09 — TROVATO GIRANDO, ed è un difetto che c'era già: il replay di `iscriviti()`
         *   arriva DENTRO la chiamata ad `apriFlusso`, cioè dentro il `try` qui sotto. Un'eccezione
         *   nel DISEGNO finiva quindi nel `catch` messo lì per «il flusso non si apre», e a schermo
         *   compariva «Non riesco a seguire questo sotto-agente» — col collegamento apertissimo. E
         *   il replay si interrompeva a metà, in silenzio.
         *   ⇒ Un `catch` che degrada dice QUALE guasto copre: questo copre il disegno di UN evento,
         *   lo dice con parole sue, e lascia proseguire il replay. È la lezione del 10/09
         *   ([[il-catch-giusto-nasconde-il-bug-sbagliato]]) applicata qui.
         */
        try {
          eventi.push(evento);
          /* ⛔ UNA digestione per evento, e UN disegno per frame: sono le due metà della stessa cura. */
          digerisciEventoFiglia(riduttore, evento);
          programmaDisegno();
        } catch (errore) {
          eventiNonDisegnati += 1;
          nota.textContent = `${plurale(eventiNonDisegnati, 'evento', 'eventi')} di questo sotto-agente non ${parola(eventiNonDisegnati, 'si è potuto', 'si sono potuti')} disegnare: ${errore instanceof Error ? errore.message : String(errore)}`;
          nota.hidden = false;
        }
      }, {
        /* ⛔ È l'unico modo che questa vista ha di SAPERE che il collegamento c'è. Chi monta il
           componente senza passarlo non rompe niente: resta la fase «mi collego» finché non arriva
           il primo evento, che è comunque una prova che il flusso funziona. */
        onAperto: () => { if (distrutto) return; flussoAperto = true; programmaDisegno(); },
      });
    } catch (errore) {
      /* ⛔ Un flusso che non si apre non è un pannello bianco: si dice, e si dice PERCHÉ. */
      nota.textContent = `Non riesco a seguire questo sotto-agente: ${errore instanceof Error ? errore.message : String(errore)}`;
      nota.hidden = false;
      vuoto.textContent = 'Nessun evento: il collegamento con questo sotto-agente non si è aperto.';
    }
  }

  return {
    elemento,
    aggiorna(nuovi) {
      if (distrutto) return;
      /* ⛔ Qui la storia viene SOSTITUITA, non estesa: il riduttore incrementale si butta e se ne fa
         uno nuovo. Digerire i nuovi eventi sopra i vecchi mescolerebbe due conversazioni — è lo
         stesso motivo per cui `disegna()` rifà la vista quando i turni diminuiscono. */
      eventi.length = 0;
      riduttore = creaRiduttoreFiglia();
      istantaneaDaCache = null;
      for (const e of Array.isArray(nuovi) ? nuovi : []) { eventi.push(e); digerisciEventoFiglia(riduttore, e); }
      disegna();
    },
    distruggi() {
      if (distrutto) return;
      distrutto = true;
      if (disegnoProgrammato && typeof globalThis.cancelAnimationFrame === 'function') globalThis.cancelAnimationFrame(disegnoProgrammato);
      disegnoProgrammato = 0;
      /*
       * ⛔ Si RICORDA dove stava a leggere e cosa stava leggendo, prima di staccare tutto: è l'unico
       *   istante in cui questi due dati esistono ancora. Tutt'e due con un tetto (vedi in testa al
       *   file); l'istantanea si tiene solo se non è enorme — una conversazione da mille blocchi
       *   tenuta in memoria per comodità è una perdita, non una cache.
       */
      if (sessionId && Number.isFinite(corpo.scrollTop)) ricorda(SCORRIMENTI, sessionId, corpo.scrollTop, TETTO_SCORRIMENTI);
      const ultima = istantaneaFiglia(riduttore);
      if (sessionId && ultima.turni.length && pesoIstantanea(ultima) <= PESO_MASSIMO_ISTANTANEA) ricorda(ISTANTANEE, sessionId, ultima, TETTO_ISTANTANEE);
      /* ⛔⛔ QUI sta la perdita che nessuno vede: una figlia viva resta collegata dopo che l'utente è
         tornato indietro, e continua a ricevere per sempre. Il `try` non è pigrizia — se la chiusura
         lancia, il resto dello smontaggio deve avvenire lo stesso. */
      try { chiudiFlusso?.(); } catch { /* un flusso già chiuso non è un errore da propagare */ }
      chiudiFlusso = null;
      elemento.removeEventListener?.('keydown', suTasto);
      corpo.removeEventListener?.('scroll', suScorrimento);
      elemento.remove?.();
      contenitore?.classList?.remove?.('talos-figlia-ospite'); // l'ospite torna com'era: la classe è nostra solo finché siamo montati
      disegnati.clear();
      /* W3C APG: il fuoco torna a chi ha aperto, «unless the invoking element no longer exists».
         Un nodo staccato manderebbe il fuoco su <body>, che è peggio del non fare niente. */
      if (fuocoPrecedente && fuocoPrecedente.isConnected !== false) fuocoPrecedente.focus?.();
    },
  };
}
