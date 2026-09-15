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
  creaAttivita,
  creaMessaggioTalos,
  creaMessaggioUtente,
  creaRigaAttrezzo,
  impostaEsitoRiga,
} from './conversazione.js';
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
  const lista = Array.isArray(eventi) ? eventi : [];
  const turni = [];
  /* Le chiavi vivono per TUTTA la sequenza, non per turno: un `ToolCallResult` può arrivare dopo che
     un nuovo `RunStarted` ha aperto il turno successivo, e la sua riga sta nel turno di prima. */
  const perAttrezzo = new Map();
  const perMessaggio = new Map();
  let giri = 0;
  let modello = null;
  let attrezzi = 0;
  let scartati = 0;
  let stato = 'in-corso';
  let motivo = '';

  /* ⛔ Un turno implicito per il testo che arriva senza un `RunStarted` davanti: succede quando ci si
     collega a metà e il replay comincia da un punto qualunque. Meglio un turno senza consegna, detto
     tale, che buttare via il testo di una figlia. */
  const turnoCorrente = () => {
    if (turni.length === 0) turni.push({ giro: 0, consegna: '', meta: '', blocchi: [] });
    return turni[turni.length - 1];
  };

  for (const e of lista) {
    if (!e || typeof e !== 'object') { scartati += 1; continue; }
    switch (e.type) {
      case 'RunStarted': {
        giri += 1;
        const { testo, meta } = consegnaDaInput(e.input);
        turni.push({ giro: giri, consegna: testo, meta, blocchi: [] });
        const m = e.contesto && typeof e.contesto.modello === 'string' ? e.contesto.modello.trim() : '';
        if (m) modello = m;
        /* Un giro nuovo riapre la figlia: un `RunError` di ieri non deve tingere di rosso il turno di oggi. */
        stato = 'in-corso';
        motivo = '';
        break;
      }
      case 'TextMessageContent': {
        const id = pezzo(e.messageId) || 'senza-id';
        let blocco = perMessaggio.get(id);
        if (!blocco) {
          blocco = { tipo: 'testo', id, testo: '' };
          perMessaggio.set(id, blocco);
          turnoCorrente().blocchi.push(blocco);
        }
        /* ⛔ Il testo arriva a PEZZI: si concatena per messageId. Un turno per delta darebbe una
           conversazione fatta di sillabe — ed è esattamente l'errore che una vista «piccola» invita
           a fare, perché a occhio, su tre parole, non si vede. */
        blocco.testo += pezzo(e.delta);
        break;
      }
      case 'ToolCallStart': {
        const id = pezzo(e.toolCallId);
        if (!id || perAttrezzo.has(id)) { scartati += 1; break; }
        const blocco = { tipo: 'attrezzo', id, attrezzo: pezzo(e.toolCallName), argomenti: '', esito: 'running', contenuto: '' };
        perAttrezzo.set(id, blocco);
        turnoCorrente().blocchi.push(blocco);
        attrezzi += 1;
        break;
      }
      case 'ToolCallArgs': {
        const blocco = perAttrezzo.get(pezzo(e.toolCallId));
        /* ⛔ AL CONTRARIO: argomenti di una chiamata che non è mai cominciata. Non si crea una riga
           fantasma «attrezzo sconosciuto» — non sapremmo nemmeno come chiamarla — e non si crepa:
           si scarta, e il conto lo dice. */
        if (!blocco) { scartati += 1; break; }
        blocco.argomenti += pezzo(e.delta);
        break;
      }
      case 'ToolCallResult': {
        const blocco = perAttrezzo.get(pezzo(e.toolCallId));
        if (!blocco) { scartati += 1; break; }
        blocco.contenuto = pezzo(e.content);
        blocco.esito = e.errore === true ? 'error' : esitoDaContenuto(blocco.attrezzo, blocco.contenuto);
        break;
      }
      case 'RunFinished': {
        const esito = pezzo(e.outcome);
        stato = ESITI_FERMATA.has(esito) ? 'interrotta' : ESITI_FALLITI.has(esito) ? 'fallita' : 'conclusa';
        motivo = stato === 'interrotta' ? 'La figlia è stata fermata prima di concludere.' : '';
        break;
      }
      case 'RunError': {
        const codice = pezzo(e.code);
        stato = CODICI_FERMATA.has(codice) ? 'interrotta' : 'fallita';
        /* ⛔ Il motivo è il messaggio del server, non una frase nostra: se dice «24 su 24 giri usati»
           quella è l'unica cosa che permette a chi legge di fare qualcosa. Quando il server non dice
           niente si dice che non l'ha detto, invece di riempire il buco. */
        motivo = pezzo(e.message).trim() || 'Il server non ha detto perché.';
        turnoCorrente().blocchi.push({ tipo: 'errore', id: `errore-${turnoCorrente().blocchi.length}`, codice, messaggio: motivo });
        break;
      }
      default:
        /* TextMessageStart/End, ReasoningMessage*, StateDelta, WorkspaceChanged…: conosciuti e non
           usati qui. ⛔ NON si contano fra gli scartati — «scartato» deve voler dire «non ho saputo
           dove metterlo», altrimenti il numero non è un allarme di niente. */
        break;
    }
  }
  return { turni, stato, giri, modello, attrezzi, scartati, motivo };
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
 * @param {(sessionId:string, onEvento:(e:object)=>void) => (()=>void)} opzioni.apriFlusso
 *        apre il flusso e RITORNA la funzione che lo chiude
 * @param {() => void} [opzioni.onIndietro] torna all'elenco
 * @param {Document} [opzioni.document]
 * @returns {{aggiorna:(eventi:Array<object>)=>void, distruggi:()=>void, elemento:Element}}
 */
export function montaConversazioneFiglia(contenitore, {
  sessionId, nome = '', apriFlusso, onIndietro, document: documentObj,
} = {}) {
  const d = documentObj || globalThis.document;
  const eventi = [];
  let chiudiFlusso = null;
  let distrutto = false;

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
  corpo.append(vuoto);

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

  function creaVistaBlocco(vistaTurno, blocco, gruppo, modello) {
    if (blocco.tipo === 'testo') {
      const messaggio = creaMessaggioTalos({ modello: modello || '', paragrafi: [] }, { document: d });
      /* ⛔ Testo NUDO, non markdown: il renderer incrementale vive nel monolite e qui servirebbe
         trascinarselo dietro. Il pannello mostra cosa la figlia sta dicendo; per leggerlo formattato
         c'è la chat. È un limite dichiarato, non una dimenticanza. */
      const p = el(d, 'p', 'assistant-copy', blocco.testo);
      messaggio.append(p);
      vistaTurno.elemento.append(messaggio);
      return { tipo: 'testo', p };
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
    if (vista.tipo === 'testo') { if (vista.p.textContent !== blocco.testo) vista.p.textContent = blocco.testo; return; }
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

  function disegna() {
    const seguiva = seguivaIlFondo(); // ⛔ PRIMA di mutare: dopo, l'altezza è già cambiata e la domanda non ha più senso
    const ridotto = riduciEventiFiglia(eventi);

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
    const notaTesto = ridotto.motivo || (ridotto.scartati > 0
      ? `${plurale(ridotto.scartati, 'evento', 'eventi')} che non ${parola(ridotto.scartati, 'si è potuto', 'si sono potuti')} collegare a niente: ${parola(ridotto.scartati, 'scartato', 'scartati')}.`
      : '');
    nota.textContent = notaTesto;
    nota.hidden = notaTesto === '';

    vuoto.hidden = ridotto.turni.length > 0;

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

  /* ⛔ Il flusso si apre DOPO che la vista esiste: `iscriviti()` rigioca l'intera storia, e la
     rigioca SUBITO — se il DOM non fosse pronto i primi eventi arriverebbero nel vuoto. */
  if (typeof apriFlusso === 'function') {
    try {
      chiudiFlusso = apriFlusso(sessionId, (evento) => {
        if (distrutto) return; // un evento in ritardo non ridisegna una vista già smontata
        eventi.push(evento);
        disegna();
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
      eventi.length = 0;
      for (const e of Array.isArray(nuovi) ? nuovi : []) eventi.push(e);
      disegna();
    },
    distruggi() {
      if (distrutto) return;
      distrutto = true;
      /* ⛔⛔ QUI sta la perdita che nessuno vede: una figlia viva resta collegata dopo che l'utente è
         tornato indietro, e continua a ricevere per sempre. Il `try` non è pigrizia — se la chiusura
         lancia, il resto dello smontaggio deve avvenire lo stesso. */
      try { chiudiFlusso?.(); } catch { /* un flusso già chiuso non è un errore da propagare */ }
      chiudiFlusso = null;
      elemento.removeEventListener?.('keydown', suTasto);
      elemento.remove?.();
      contenitore?.classList?.remove?.('talos-figlia-ospite'); // l'ospite torna com'era: la classe è nostra solo finché siamo montati
      disegnati.clear();
      /* W3C APG: il fuoco torna a chi ha aperto, «unless the invoking element no longer exists».
         Un nodo staccato manderebbe il fuoco su <body>, che è peggio del non fare niente. */
      if (fuocoPrecedente && fuocoPrecedente.isConnected !== false) fuocoPrecedente.focus?.();
    },
  };
}
