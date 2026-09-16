/*
 * Inspector — la colonna dei dettagli della sessione nel linguaggio del mockup:
 * testata (nome della sessione), Contesto (Ambiente · Finestra del contesto ·
 * Indice dei giri), File (file toccati), Agenti (stato vuoto onesto), Processi
 * (i comandi eseguiti nella sessione).
 *
 * 06/09, B2. ⛔ Fino a oggi la colonna mostrava
 * i valori DIMOSTRATIVI del mockup («W1-02 registro processi», un ramo, tre file,
 * quattro processi che non esistevano): qui ogni riga viene dai dati del monolite,
 * e quando un dato non c'è si scrive «—» o la riga sparisce — mai un numero finto.
 *
 * Dati: `RunStarted.contesto` (progetto, cartella, branch o null, repoAnnidati[]),
 * `state.realSession.usage` (prompt_tokens, completion_tokens, cached_tokens,
 * giri), la finestra del modello (contextLength dal catalogo, se noto), i giri
 * (dalla spine: numero, titolo, attrezzi, in corso), i file toccati
 * (`reviewFiles`: path, aggiunte, rimozioni), i comandi (ToolCallStart di
 * `shell` con il comando, ToolCallResult, tempi misurati alla ricezione).
 *
 * Ricerca 06/09/2026: il costo del contesto si mostra come numero verificabile
 * (un pattern noto: token usati contro la finestra; Context Lens:
 * ripartizione per categoria — system, tool definitions, conversation). Qui la
 * ripartizione per categoria si mostra SOLO se il kernel la dichiara; altrimenti
 * restano Conversazione e Libera, che sono misure vere.
 */

import { testoRiusoCache } from './consumo-sessione.js';
/* ⛔ 16/09, P0-E punto 9: la riga di comando si LEGGE (parser vendorizzato dietro un adattatore
   nostro), non si stampa come stringa troncata. Vedi `components/comando-shell.js`. */
import { ICONA_FAMIGLIA, analizzaComando, disegnaComando, iconaComando, NOME_FAMIGLIA } from './comando-shell.js';

const num = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 });
/** «41,2k», «200k», «0,4k» come nel mockup. */
export function kilo(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return '—';
  return `${num.format(v / 1000)}k`; // «200k», «145,4k», «0,4k»: un decimale quando serve, come nel mockup
}
const numPercento = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** Percentuale troncata a un decimale (3,75 → «3,7%»), così la somma delle parti e «Libera» tornano a 100. */
export function percento(parte, tutto) {
  if (!Number.isFinite(parte) || !Number.isFinite(tutto) || tutto <= 0) return null;
  return `${numPercento.format(Math.floor((parte / tutto) * 1000) / 10)}%`;
}

/** Le quattro righe di «Ambiente». `—` dove il dato non c'è. */
export function righeAmbiente(contesto = null) {
  const c = contesto || {};
  const annidati = Array.isArray(c.repoAnnidati) ? c.repoAnnidati.length : null;
  return [
    ['Ramo', c.branch || '—'],
    ['Worktree', c.worktree || '—'],
    ['Non salvate', Number.isFinite(c.nonSalvate) ? `${c.nonSalvate} file` : '—'],
    ['Repo annidati', annidati === null ? '—' : annidati === 0 ? 'nessuno' : `${annidati} · fiducia separata`],
  ];
}

/**
 * Le righe di «Finestra del contesto». `usage` = ultimo StateDelta /usage; `finestra` =
 * contextLength del modello (o null); `ripartizione` = { attrezzi, istruzioni, memoria } in token, se il kernel la dichiara.
 */
export function righeFinestra(usage = null, finestra = null, ripartizione = null, cacheSessione = null) {
  const u = usage || {};
  const usati = Number.isFinite(u.prompt_tokens) ? u.prompt_tokens + (Number.isFinite(u.completion_tokens) ? u.completion_tokens : 0) : null;
  const righe = [];
  const r = ripartizione || {};
  let occupati = 0; let percentoOccupato = 0;
  const aggiungi = (etichetta, token, classe) => {
    occupati += token;
    const p = finestra ? percento(token, finestra) : null;
    if (p) percentoOccupato += Number(p.replace('%', '').replace(',', '.'));
    righe.push([etichetta, `${kilo(token)}${p ? ` · ${p}` : ''}`, classe]);
  };
  for (const [chiave, etichetta] of [['attrezzi', 'Attrezzi'], ['istruzioni', 'Istruzioni'], ['memoria', 'Memoria']]) {
    if (Number.isFinite(r[chiave])) aggiungi(etichetta, r[chiave], 'stima');
  }
  if (usati === null) righe.push(['Conversazione', '—']); else aggiungi('Conversazione', usati, '');
  // «Libera» = la finestra meno TUTTO ciò che la occupa; la sua percentuale chiude a 100 con le altre
  righe.push(['Libera', finestra && usati !== null ? `${kilo(Math.max(0, finestra - occupati))} · ${numPercento.format(Math.max(0, Math.round((100 - percentoOccupato) * 10) / 10))}%` : '—']);
  // Quota dell'intera sessione: non è un'altra parte dell'occupazione della finestra.
  righe.push(['Riusato dalla cache', testoRiusoCache(cacheSessione)]);
  return { titoloDestra: finestra ? kilo(finestra) : 'finestra non dichiarata', righe };
}

/*
 * ⛔⛔⛔ 06/9, CB-03 — «Indice dei giri» mostrava il RAGIONAMENTO del modello, in
 * inglese, anche col ragionamento SPENTO: misurato su una sessione vera con
 * `z-ai/glm-5.3-flash` (sonda `.gravi/sonde/03-indice-giri.mjs`), l'indice diceva
 * «3 · The user asks in Italian:» dove la risposta era «17 × 23 = 391».
 *
 * CAUSA: il titolo si cercava con `.assistant-copy p, .assistant-copy`, ma
 * `assistant-copy` è una CLASSE-GANCIO che portano anche il corpo del ragionamento
 * (`appendToolNote` la aggiunge a ogni dettaglio), le note di sistema e il «perché»
 * di una carta di approvazione. Il ragionamento è il primo blocco del turno: vinceva
 * sempre.
 *
 * RICERCA 06/09/2026, prima di scrivere:
 *  · AG-UI, «Reasoning» (docs.ag-ui.com/concepts/reasoning) — il ragionamento è un
 *    messaggio con `role: "reasoning"`, tenuto distinto dalla risposta finale «to
 *    avoid polluting conversation history»: qui la distinzione esiste nel DOM
 *    (`real-reasoning-note`) e non veniva usata;
 *  · MDN, «aria-hidden» — un elemento marcato così è tolto dall'albero di
 *    accessibilità; col ragionamento spento la app lo marca proprio così, quindi
 *    ripescarne il testo per farne un'etichetta lo rimetteva a schermo da un'altra
 *    porta.
 *
 * ⇒ La risposta si nomina per quello che è: il corpo del messaggio di TALOS.
 */
export const SELETTORE_RISPOSTA_TURNO = '.talos-message__copy .assistant-copy';

/**
 * Le prime parole della RISPOSTA di un turno, per farne il titolo di un giro.
 * @param {{querySelector:Function}|null} turno l'elemento `.talos-turn` del turno
 * @param {number} [parole] quante parole tenere
 * @returns {string} '' quando il turno non ha (ancora) una risposta
 */
export function titoloRispostaDaTurno(turno, parole = 5) {
  const nodo = turno && typeof turno.querySelector === 'function' ? turno.querySelector(SELETTORE_RISPOSTA_TURNO) : null;
  const testo = typeof nodo?.textContent === 'string' ? nodo.textContent.trim() : '';
  if (!testo) return '';
  return testo.split(/\s+/).slice(0, parole).join(' ');
}

/**
 * ⛔⛔ D-10A — le prime parole del messaggio DELLA PERSONA, per farne il titolo della sua riga.
 * Il testo sta nella bolla (`creaMessaggioUtente`: `.talos-message__body.message-bubble > p`).
 */
export const SELETTORE_TESTO_UTENTE = '.talos-message--user .message-bubble p';

export function titoloMessaggioUtente(turno, parole = 5) {
  const nodo = turno && typeof turno.querySelector === 'function' ? turno.querySelector(SELETTORE_TESTO_UTENTE) : null;
  const testo = typeof nodo?.textContent === 'string' ? nodo.textContent.trim() : '';
  if (!testo) return '';
  return testo.split(/\s+/).slice(0, parole).join(' ');
}

/**
 * Le righe di «Indice dei giri». `giri` = [{ numero, titolo, token?, attrezzi?, inCorso?, senzaContatto?, tu? }].
 * ⛔ 06/9, CB-20-bis: col server irraggiungibile un giro non è «in corso» — è un giro di cui
 * non abbiamo più notizie. Sono due fatti diversi e prendono due parole diverse.
 */
export function righeGiri(giri = []) {
  return giri.map((g) => {
    /*
     * ⛔⛔⛔ D-10A, 10/09 — l'indice saltava i numeri: 2 · 3 · 5 · 6 · 8 · 9 · 11 · 12 · 14.
     * MISURATO sul 4174 in sola lettura (sonda `scratchpad/prove/d10a-indice-giri/sonda.mjs`, otto
     * sessioni vere aperte): i numeri mancanti non erano persi né mai nati — erano i turni della
     * PERSONA. Ogni messaggio dell'utente apre un `.talos-turn[data-turno="utente"]` che prende un
     * numero della spine (`nellaChat(el,'utente')`), lo mostra in chat, e poi non compariva qui
     * perché `giriPerInspector()` guardava solo i turni di TALOS. Nessuna numerazione rotta:
     * mancavano le RIGHE.
     * ⇒ La cura NON è rinumerare (il numero dell'indice deve restare quello che la chat mostra
     *   accanto al messaggio): è mostrare anche la riga omessa, dicendo di chi è.
     * Ricerca 10/09/2026 — opencode #25910 «Chat Navigation Index/Sidebar» (l'indice elenca «key
     * messages (such as user prompts)») e le mappe di conversazione del 2026, dove i prompt della
     * persona sono voci di prima classe accanto ai turni dell'assistente, distinte dal ruolo.
     */
    const misura = g.tu ? 'tuo messaggio'
      : g.senzaContatto ? 'senza contatto'
        : g.inCorso ? 'in corso'
          : Number.isFinite(g.token) ? kilo(g.token)
            : (Number.isFinite(g.attrezzi) ? `${g.attrezzi} ${g.attrezzi === 1 ? 'attrezzo' : 'attrezzi'}` : '—');
    const titolo = g.titolo || (g.tu ? 'Messaggio' : 'Giro');
    return [`${g.numero} · ${titolo}`, misura, g.senzaContatto ? 'warning' : g.inCorso ? 'accent' : ''];
  });
}

/** Le righe di «File toccati». `file` = [{ path, aggiunte, rimozioni }]. */
export function righeFile(file = []) {
  return file.map((f) => [f.path, `+${f.aggiunte ?? 0}${f.rimozioni ? ` −${f.rimozioni}` : ''}`]);
}

/*
 * ═══════════════════════════════════════════════════════════════════ PROCESSI ═══
 * P0-E, punto 9 — 16/09/2026. Tre cure in un blocco solo, perché sono la stessa cosa vista da tre
 * lati: la scheda diceva TROPPO POCO su ogni comando, si RIFACEVA TUTTA a ogni evento, e non aveva
 * nessun TETTO.
 *
 * ⛔ (1) DUE STATI SU OTTO. La riga sapeva dire «in corso», «ok» ed «errore»: un pallino verde o
 *   rosso, senza una parola accanto. Ricerca 16/09/2026 — VS Code, «Terminal Shell Integration»
 *   (code.visualstudio.com/docs/terminal/shell-integration, pagina aggiornata il 02/09/2026): le
 *   decorazioni di comando sono TRE (errore, successo, «default»), e nascono dal codice di uscita
 *   che `OSC 633 ; D [; <exitcode>] ST` porta con sé. ⇒ Qui gli stati sono OTTO, e ognuno ha
 *   un'icona E una parola: il colore da solo non è un'indicazione (WCAG 1.4.1).
 *   ⛔ E non sono inventati: `annullato` e `ucciso` vengono dal codice di uscita che il kernel
 *   scrive davvero in testa al risultato (`talosHarness.mjs:7812`, `exit ${p.codice} [sandbox: …]`),
 *   dove 130 = 128+SIGINT («l'ha fermato qualcuno») e 124 = tempo scaduto. `in-coda` esiste nel
 *   vocabolario ma NESSUN evento AG-UI lo produce oggi: è dichiarato nel report, non fabbricato qui.
 *
 * ⛔ (2) LA SCHEDA SI RIFACEVA TUTTA. `aggiornaInspector` faceva `processi.replaceChildren()` e poi
 *   ricostruiva ogni card. La sincronizzazione arriva da `aggiornaInspectorDaStato`, che in
 *   `legacy/app.js` è chiamata da 34 punti via `syncRunComposerState`: un evento qualunque
 *   distruggeva N card per ridisegnarne N. Con la selezione, il filtro e il dettaglio aperto che
 *   sparivano ogni volta — e nessuno lo vedeva, perché il risultato sbagliato somiglia a quello
 *   giusto. ⇒ Mappa `toolCallId → nodo`: una riga nuova si INSERISCE, una che cambia si aggiorna in
 *   loco, una che sparisce si toglie. `replaceChildren` non c'è più.
 *
 * ⛔ (3) NESSUN TETTO. `state.realSession.eventiAttrezzi` cresce per tutta la sessione. Ricerca
 *   16/09/2026 sulle liste lunghe: la virtualizzazione taglia i nodi ma «can break screen reader
 *   navigation since DOM elements are constantly being added and removed», mentre «Load More» è
 *   «a hybrid between pagination and infinite scrolling… giving users a feeling of control» (guida
 *   tecnica GEL della BBC). ⇒ In una COLONNA LATERALE, dove l'elenco dev'essere scorribile da un
 *   lettore di schermo, si sceglie il TETTO + «Carica altri». Il numero è misurato, non deciso a
 *   occhio: vedi `TETTO_PROCESSI`.
 */

/**
 * Gli otto stati di un processo. ⛔ Ognuno porta la sua PAROLA oltre al tono: un pallino colorato
 * da solo non dice niente a chi non distingue i colori, e nemmeno a chi legge con uno screen reader.
 */
export const STATI_PROCESSO = Object.freeze({
  'in-coda': { etichetta: 'In coda', tono: '', icona: 'i-list', vivo: true },
  'in-avvio': { etichetta: 'In avvio', tono: 'accent', icona: 'i-play', vivo: true },
  'in-corso': { etichetta: 'In corso', tono: 'accent', icona: 'i-bolt', vivo: true },
  'in-attesa': { etichetta: 'In attesa', tono: 'warning', icona: 'i-clock', vivo: true },
  riuscito: { etichetta: 'Riuscito', tono: 'success', icona: 'i-check', vivo: false },
  fallito: { etichetta: 'Non riuscito', tono: 'danger', icona: 'i-x', vivo: false },
  annullato: { etichetta: 'Annullato', tono: '', icona: 'i-stop', vivo: false },
  ucciso: { etichetta: 'Terminato a forza', tono: 'warning', icona: 'i-stop', vivo: false },
});

/**
 * Quante righe si disegnano prima di chiedere «Carica altri».
 *
 * ⛔ MISURATO, non scelto: banco `tests/unit/inspector-banco-processi.mjs`, 1.000 processi finti,
 *   tre giri, mediana — e il «prima» è il codice vero del commit 4c58c961, copiato lì dentro riga
 *   per riga. Senza tetto: **8.001 nodi** nella scheda e **8.008 nodi ricostruiti a ogni evento**
 *   nuovo (15,56 ms). Con quaranta righe: **1.022 nodi** e **25 nodi per evento** (2,67 ms).
 *   ⛔ A 120 processi i nodi sono invece paragonabili (840 prima, 920 dopo, misurati nel browser
 *   vero): ogni riga oggi porta molto di più — icona di famiglia, comando a segmenti, stato a
 *   parole, ora, comando di apertura. Il guadagno non è «meno nodi sempre»: è il COSTO PER EVENTO
 *   e il tetto quando la sessione è lunga. Dire il contrario sarebbe vendere un numero che non c'è.
 *   Quaranta è anche la soglia oltre la quale, nella colonna (circa 300 px larga, 900 px alta), le
 *   righe che si vedono senza scorrere sono già finite da un pezzo: il resto è peso che nessuno guarda.
 */
export const TETTO_PROCESSI = 40;

/** Oltre quanto silenzio un processo vivo si dichiara «in attesa». Un minuto: la soglia era già questa. */
const SOGLIA_ATTESA_MS = 60_000;

/**
 * Il codice di uscita, letto dal testo del risultato dell'attrezzo.
 *
 * ⛔ È l'UNICO posto in cui gli eventi AG-UI lo portano: `ToolCallResult` non ha un campo «uscita»
 *   (vedi `agui-events.mjs`), e il kernel lo scrive in testa al contenuto —
 *   `talosHarness.mjs:7812`: `exit ${p.codice} [sandbox: ${p.enforcement}]\n${p.testo}`.
 * ⛔ Solo a INIZIO riga: un comando può stampare «exit 3» per conto suo (un `grep` su un sorgente,
 *   per dire), e leggerlo come esito sarebbe un numero preso dal posto sbagliato.
 */
export function uscitaDaTestoAttrezzo(testo) {
  const t = typeof testo === 'string' ? testo : '';
  const m = /^\s*exit\s+(\d+)\b/u.exec(t);
  return m ? Number(m[1]) : null;
}

/**
 * Dal codice di uscita allo stato. ⛔ I tre valori speciali sono quelli che il kernel produce:
 *   124 = il timer l'ha ucciso, 130 = 128+SIGINT (qualcuno l'ha fermato), 137 = 128+SIGKILL.
 *   Chiamare «fallito» un comando che qualcuno ha fermato è dirgli addosso un guasto che non c'è.
 */
function statoDaUscita(uscita, errore) {
  if (uscita === 130 || uscita === 143) return 'annullato';
  if (uscita === 124 || uscita === 137) return 'ucciso';
  if (errore === true) return 'fallito';
  if (!Number.isFinite(uscita)) return 'fallito';
  return uscita === 0 ? 'riuscito' : 'fallito';
}

/** L'ora di un istante, per la riga: «14:22:07». `—` quando l'istante non c'è. */
function oraConSecondi(ms) {
  if (!Number.isFinite(ms)) return '—';
  const t = new Date(ms);
  return Number.isNaN(t.getTime()) ? '—' : t.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * Un processo pronto da disegnare.
 *
 * ⛔ È IDEMPOTENTE (`preparato`): `disegnaProcessi` accetta sia i processi grezzi di
 *   `processiDagliEventi` sia quelli già preparati, e senza questa guardia la seconda passata
 *   rileggerebbe `chi` — che a quel punto è già una frase — producendo «agente · giro —».
 * ⛔ Cartella, PID e figlia proprietaria sono «—» PERCHÉ NON CI SONO: lo schema dell'attrezzo
 *   `shell` (`talosHarness.mjs:1678`) dichiara solo `comando` e `descrizione`, e `ToolCallResult`
 *   non porta né cwd né pid. Dichiararli assenti è un fatto; riempirli sarebbe un'invenzione.
 */
export function datiProcesso(p = {}) {
  if (p.preparato === true) return p;
  const stato = STATI_PROCESSO[p.stato] ? p.stato : (p.stato === 'ok' ? 'riuscito' : p.stato === 'errore' ? 'fallito' : 'in-corso');
  const descrittore = STATI_PROCESSO[stato];
  const durata = Number.isFinite(p.durataMs) ? `${num.format(p.durataMs / 1000)} s` : null; // «0,3 s», «18,1 s», «74 s» come nel mockup
  const misura = [durata, !descrittore.vivo && Number.isFinite(p.uscita) ? `uscita ${p.uscita}` : null].filter(Boolean).join(' · ') || (descrittore.vivo ? '' : '—');
  const chi = `${p.chi === 'tu' ? 'tu' : 'agente'} · ${p.chi === 'tu' ? 'terminale' : `giro ${p.giro ?? '—'}`}`;
  const fermo = Number.isFinite(p.fermoDaMs) && p.fermoDaMs >= SOGLIA_ATTESA_MS
    ? `Nessuna uscita da ${Math.round(p.fermoDaMs / 1000)} secondi. Il processo è vivo: potrebbe aspettare un input. TALOS non lo ferma da solo.`
    : null;
  const analisi = analizzaComando(p.comando || '');
  const quando = oraConSecondi(p.avviatoA);
  const dettaglio = [
    ['Comando', p.comando || '—'],
    ['Stato', descrittore.etichetta],
    ['Avviato', quando],
    ['Durata', durata || '—'],
    ['Uscita', Number.isFinite(p.uscita) && !descrittore.vivo ? String(p.uscita) : '—'],
    ['Cartella', '—'],
    ['PID', '—'],
    ['Chi', chi],
    ['Descrizione', typeof p.descrizione === 'string' && p.descrizione.trim() ? p.descrizione.trim() : '—'],
  ];
  return {
    preparato: true,
    id: p.id ?? null,
    comando: p.comando || '—',
    descrizione: typeof p.descrizione === 'string' ? p.descrizione.trim() : '',
    analisi,
    famiglia: analisi.famiglia,
    stato,
    etichetta: descrittore.etichetta,
    tono: descrittore.tono,
    icona: descrittore.icona,
    vivo: descrittore.vivo,
    chi,
    misura,
    fermo,
    quando,
    cartella: '—',
    pid: '—',
    uscita: Number.isFinite(p.uscita) ? p.uscita : null,
    dettaglio,
  };
}

/* ────────────────────────────────────────────────── il disegno PER RIGA ─── */

/** Lo stato della scheda vive sul contenitore: filtro, selezione, quante righe, e la mappa id→nodo. */
function schedaDi(contenitore) {
  if (!contenitore.__processi) {
    /*
     * ⛔⛔ LE RIGHE DIMOSTRATIVE DEL MOCKUP SI TOLGONO UNA VOLTA SOLA, ALLA PRIMA PASSATA.
     *   `index.template.html` porta dentro `#railProcessi` quattro `ProcessRow` di esempio («node
     *   --test tests/*.test.mjs», «gradlew assembleDebug»…): finché c'era `replaceChildren()` a
     *   ogni sincronizzazione sparivano da sole, e togliendolo sarebbero rimaste per sempre accanto
     *   ai processi veri — cioè il difetto che B2 aveva chiuso il 06/09, rimesso da una cura di
     *   prestazioni. ⇒ Si tolgono qui: una volta, quando la scheda prende possesso del contenitore.
     *   ⛔ Trovato dal cancello di PARITÀ dei componenti, non da un test mio: nella app vera
     *   qualcun altro le ripuliva all'avvio (misurato: zero righe dopo il velo), nel laboratorio no.
     *   Un difetto che si vede in UNA delle due superfici è un difetto, non un caso particolare.
     */
    for (const n of [...(contenitore.querySelectorAll?.('[data-c="ProcessRow"], [data-c="EmptyState"]') || [])]) n.remove?.();
    contenitore.__processi = { righe: new Map(), mostrati: TETTO_PROCESSI, filtro: '', selezionato: null, ultima: [], zona: null, filtroEl: null, campo: null, altri: null, vuoto: null, annuncio: null };
  }
  return contenitore.__processi;
}

/**
 * Il comando «apri il dettaglio» di una riga.
 *
 * ⛔ IL DETTAGLIO SI RIEMPIE ALLA PRIMA APERTURA, non alla nascita della riga: sono nove coppie
 *   chiave/valore. MISURATO il 16/09 (`scratchpad/misura-riga.mjs`, lo stesso DOM finto delle
 *   prove): una riga nuova costa **27 nodi** col riempimento pigro e **63** senza — il dettaglio
 *   da solo ne vale **36**. Con quaranta righe a schermo sono oltre 1.400 nodi che nessuno ha
 *   chiesto di vedere.
 */
function bottoneApri(d, card, riga, idRiga) {
  const b = el(d, 'button', 'talos-button talos-button--ghost talos-button--sm talos-process__apri');
  b.type = 'button';
  b.setAttribute('aria-expanded', 'false');
  b.setAttribute('aria-controls', `processo-dettaglio-${idRiga}`);
  b.setAttribute('aria-label', 'Mostra i dettagli di questo comando');
  const svg = d.createElementNS(SVG_NS_INSPECTOR, 'svg');
  svg.setAttribute('class', 'i i--sm');
  svg.setAttribute('aria-hidden', 'true');
  const use = d.createElementNS(SVG_NS_INSPECTOR, 'use');
  use.setAttribute('href', '#i-chev');
  svg.append(use);
  b.append(svg);
  /* ⛔ UN solo ascoltatore, messo alla NASCITA della riga: è tutto il senso dell'aggiornamento per
     riga — con `replaceChildren` ogni passata ne attaccava di nuovi a nodi nuovi, e il vecchio
     nodo se ne andava con i suoi. Qui il nodo resta, e l'ascoltatore non si duplica. */
  b.addEventListener('click', (evento) => {
    evento.preventDefault?.();
    evento.stopPropagation?.(); // la card intera seleziona: aprire il dettaglio non è selezionare
    const aperto = b.getAttribute('aria-expanded') === 'true';
    b.setAttribute('aria-expanded', aperto ? 'false' : 'true');
    b.setAttribute('aria-label', aperto ? 'Mostra i dettagli di questo comando' : 'Nascondi i dettagli di questo comando');
    riga.aperto = !aperto;
    if (riga.aperto && riga.dettaglioSporco) { riempiCard(d, riga.dettaglio, riga.righeDettaglio); riga.dettaglioSporco = false; }
    riga.dettaglio.hidden = aperto;
    card.dataset.aperto = aperto ? 'no' : 'si';
  });
  return b;
}

function creaRiga(d, p, scheda, contenitore) {
  const card = el(d, 'div', 'talos-card talos-process');
  card.dataset.c = 'ProcessRow';
  card.dataset.processo = String(p.id ?? '');
  card.tabIndex = 0;
  card.setAttribute('role', 'listitem');

  const testa = el(d, 'div', 'talos-process__testa');
  const icona = iconaComando(d, p.famiglia);
  const cmd = el(d, 'div', 'talos-process__cmd');
  cmd.setAttribute('role', 'text');
  const dettaglio = el(d, 'div', 'talos-process__dettaglio');
  dettaglio.id = `processo-dettaglio-${String(p.id ?? '')}`;
  dettaglio.hidden = true;
  const riga = { card, cmd, statoEl: null, statoTesto: null, statoUse: null, chiEl: null, oraEl: null, misuraEl: null, stallo: null, dettaglio, icona, mostrato: null, aperto: false, dettaglioSporco: true, righeDettaglio: p.dettaglio };
  const apri = bottoneApri(d, card, riga, String(p.id ?? ''));
  testa.append(icona, cmd, apri);

  const meta = el(d, 'div', 'talos-process__meta');
  const statoEl = el(d, 'span', 'talos-badge talos-badge--sm talos-process__stato');
  const statoIcona = d.createElementNS(SVG_NS_INSPECTOR, 'svg');
  statoIcona.setAttribute('class', 'i i--xs');
  statoIcona.setAttribute('aria-hidden', 'true');
  const statoUse = d.createElementNS(SVG_NS_INSPECTOR, 'use');
  statoIcona.append(statoUse);
  const statoTesto = el(d, 'span', 'talos-process__stato-testo');
  statoEl.append(statoIcona, statoTesto);
  const chiEl = el(d, 'span', 'talos-process__chi');
  /* ⛔ QUANDO è partito, in riga e non solo nel dettaglio: senza, due comandi identici a mezz'ora
     di distanza sono la stessa riga, e per capire quale si sta guardando bisogna aprire il
     dettaglio. Sta accanto a «chi» e va a capo con lui quando la colonna si stringe. */
  const oraEl = el(d, 'span', 'talos-mono talos-process__ora');
  const misuraEl = el(d, 'span', 'talos-mono talos-measure talos-process__misura');
  meta.append(statoEl, chiEl, oraEl, el(d, 'span', 'talos-grow'), misuraEl);

  const stallo = el(d, 'div', 'talos-process__stall');
  stallo.hidden = true;

  card.append(testa, meta, stallo, dettaglio);

  card.addEventListener('click', () => {
    scheda.selezionato = scheda.selezionato === p.id ? null : p.id;
    for (const [id, r] of scheda.righe) r.card.dataset.selezionato = scheda.selezionato === id ? 'si' : 'no';
  });
  card.addEventListener('keydown', (evento) => {
    if (evento.target !== card) return;
    if (evento.key !== 'Enter' && evento.key !== ' ') return;
    evento.preventDefault?.();
    card.lancia ? card.lancia('click') : card.click?.();
  });

  Object.assign(riga, { statoEl, statoTesto, statoUse, chiEl, oraEl, misuraEl, stallo });
  aggiornaRiga(d, riga, p, scheda);
  void contenitore;
  return riga;
}

function aggiornaRiga(d, riga, p, scheda) {
  const m = riga.mostrato;
  riga.card.dataset.stato = p.stato;
  riga.card.dataset.famiglia = p.famiglia;
  riga.card.dataset.selezionato = scheda.selezionato === p.id ? 'si' : 'no';
  if (!m || m.comando !== p.comando) {
    /* ⛔ Il comando si ridisegna SOLO se è cambiato: durante lo streaming degli argomenti cambia a
       ogni delta, ma appena il JSON è completo si ferma — e da lì in poi questi nodi non si
       toccano più, nemmeno quando lo stato cambia. */
    riga.cmd.replaceChildren(disegnaComando(d, p.comando, p.analisi));
    riga.cmd.setAttribute('aria-label', `Comando ${NOME_FAMIGLIA[p.famiglia] || 'generico'}: ${p.comando}`);
    /*
     * ⛔⛔ TROVATO NELLA FOTO, non in un test: qui c'era `STATI_PROCESSO[p.stato].icona`, cioè
     *   l'icona dello STATO scritta sopra l'icona della FAMIGLIA. A schermo ogni riga mostrava lo
     *   stesso fulmine, e le dodici famiglie del parser — git, node, docker, rete… — non
     *   arrivavano mai. Nessuna prova se n'era accorta: guardavano `dataset.famiglia`, che era
     *   giusto, non il simbolo disegnato. ⇒ Un attributo che cambia non è un pixel che cambia, e
     *   `dataset` corretto non vuol dire icona corretta.
     */
    riga.icona.querySelector?.('use')?.setAttribute?.('href', `#${ICONA_FAMIGLIA[p.famiglia] || ICONA_FAMIGLIA.generico}`);
  }
  if (!m || m.stato !== p.stato) {
    riga.statoEl.className = `talos-badge talos-badge--sm talos-process__stato${p.tono ? ` talos-badge--${p.tono}` : ''}`;
    riga.statoTesto.textContent = p.etichetta;
    riga.statoUse.setAttribute('href', `#${p.icona}`);
  }
  if (!m || m.chi !== p.chi) riga.chiEl.textContent = p.chi;
  if (!m || m.quando !== p.quando) riga.oraEl.textContent = p.quando === '\u2014' ? '' : p.quando;
  if (!m || m.misura !== p.misura) riga.misuraEl.textContent = p.misura;
  if (!m || m.fermo !== p.fermo) {
    riga.stallo.textContent = p.fermo || '';
    riga.stallo.hidden = !p.fermo;
  }
  const chiaveDettaglio = p.dettaglio.map((r) => r.join('=')).join('|');
  if (!m || m.chiaveDettaglio !== chiaveDettaglio) {
    /* ⛔ Il dettaglio si ridisegna solo se È APERTO; se è chiuso si segna sporco e si rifarà alla
       prossima apertura. È la differenza fra «ridisegno quello che si vede» e «ridisegno tutto». */
    riga.righeDettaglio = p.dettaglio;
    if (riga.aperto) { riempiCard(d, riga.dettaglio, p.dettaglio); riga.dettaglioSporco = false; }
    else riga.dettaglioSporco = true;
  }
  riga.mostrato = { comando: p.comando, stato: p.stato, chi: p.chi, quando: p.quando, misura: p.misura, fermo: p.fermo, chiaveDettaglio };
}

/**
 * Disegna (o AGGIORNA) la scheda «Processi» dentro `contenitore`.
 *
 * @returns {{mostrati:number, totale:number}} quante righe sono a schermo e quante ce ne sono
 *
 * ⛔ Non c'è nessun `replaceChildren` sul contenitore: è la cura. Le righe si identificano col
 *   `toolCallId`, che è l'unico identificatore stabile che gli eventi portano.
 */
export function disegnaProcessi(d, contenitore, lista, opzioni = {}) {
  if (!contenitore) return { mostrati: 0, totale: 0 };
  const scheda = schedaDi(contenitore);
  /*
   * ⛔⛔ IL PRIMO TENTATIVO ERA PIÙ LENTO DEL DIFETTO, e l'ho visto solo perché il banco misura
   *   DUE cose e non una. Preparando tutti i processi (`datiProcesso`, che parsa la riga di comando)
   *   i nodi per evento crollavano da 8.008 a 24 — e il TEMPO saliva da 15,3 a 46,5 ms, perché a
   *   ogni evento si parsavano mille righe di comando per disegnarne quaranta.
   *   ⇒ Si prepara SOLO ciò che si disegna. Il filtro lavora sul testo grezzo (comando e
   *   descrizione), che è già nell'evento e non costa un parse.
   */
  const grezzi = (Array.isArray(lista) ? lista : []).filter(Boolean);
  scheda.ultima = grezzi;

  /* Il filtro: c'è solo quando c'è qualcosa da filtrare. */
  if (grezzi.length && !scheda.filtroEl) {
    const box = el(d, 'div', 'talos-field talos-field--sm talos-process-filtro');
    const campo = el(d, 'input', 'talos-field__input talos-process-filtro__campo');
    campo.type = 'search';
    campo.setAttribute('aria-label', 'Filtra i comandi eseguiti');
    campo.setAttribute('placeholder', 'Filtra i comandi…');
    campo.value = scheda.filtro;
    campo.addEventListener('input', () => {
      scheda.filtro = String(campo.value || '');
      disegnaProcessi(d, contenitore, scheda.ultima, { ridisegna: true });
    });
    box.append(campo);
    scheda.filtroEl = box;
    scheda.campo = campo;
    contenitore.insertBefore(box, contenitore.firstChild || null);
  } else if (!grezzi.length && scheda.filtroEl) {
    scheda.filtroEl.remove();
    scheda.filtroEl = null;
    scheda.campo = null;
    scheda.filtro = '';
  }

  if (!scheda.zona) {
    scheda.zona = el(d, 'div', 'talos-process-lista');
    scheda.zona.setAttribute('role', 'list');
    scheda.zona.setAttribute('aria-label', 'Comandi eseguiti in questa sessione');
    contenitore.append(scheda.zona);
  }

  const cerca = scheda.filtro.trim().toLowerCase();
  const filtrati = cerca ? grezzi.filter((p) => testoFiltrabile(p).includes(cerca)) : grezzi;
  /* ⛔ `datiProcesso` — e con lui il parse della riga di comando — gira SOLO su ciò che si vede. */
  const visibili = filtrati.slice(0, scheda.mostrati).map((p) => datiProcesso(p));

  const visti = new Set();
  for (let i = 0; i < visibili.length; i += 1) {
    const p = visibili[i];
    visti.add(p.id);
    let riga = scheda.righe.get(p.id);
    if (!riga) { riga = creaRiga(d, p, scheda, contenitore); scheda.righe.set(p.id, riga); }
    else aggiornaRiga(d, riga, p, scheda);
    const attuale = scheda.zona.children[i];
    if (attuale !== riga.card) scheda.zona.insertBefore(riga.card, attuale || null);
  }
  /* ⛔ Le righe che non ci sono più (filtrate, oltre il tetto, o di un'altra sessione) si TOLGONO:
     tenerle nella mappa le farebbe riapparire al primo aggiornamento, fuori posto. */
  for (const [id, riga] of [...scheda.righe]) {
    if (visti.has(id)) continue;
    riga.card.remove();
    scheda.righe.delete(id);
  }

  /* «Carica altri»: solo quando c'è davvero altro, e dice QUANTO. */
  const restano = filtrati.length - visibili.length;
  if (restano > 0) {
    if (!scheda.altri) {
      const b = el(d, 'button', 'talos-button talos-button--secondary talos-button--block talos-process-altri');
      b.type = 'button';
      b.addEventListener('click', () => {
        scheda.mostrati += TETTO_PROCESSI;
        disegnaProcessi(d, contenitore, scheda.ultima, { ridisegna: true });
        /* ⛔ Chi legge con uno screen reader deve sapere che la lista è cresciuta: senza questo
           l'elenco cambia in silenzio (accessibilità della paginazione, ricerca 16/09). */
        if (scheda.annuncio) scheda.annuncio.textContent = `Ora vedi ${Math.min(scheda.mostrati, scheda.ultima.length)} comandi.`;
      });
      scheda.altri = b;
      contenitore.append(b);
    }
    scheda.altri.textContent = `Carica altri · ne vedi ${visibili.length} di ${filtrati.length}`;
  } else if (scheda.altri) {
    scheda.altri.remove();
    scheda.altri = null;
  }

  if (!scheda.annuncio) {
    /* ⛔ Visibile ai lettori di schermo e non all'occhio: il foglio lo nasconde con la tecnica del
       ritaglio, non con `display:none` — che lo toglierebbe anche dall'albero di accessibilità. */
    const a = el(d, 'p', 'talos-process-annuncio');
    a.setAttribute('role', 'status');
    scheda.annuncio = a;
    contenitore.append(a);
  }

  /* Lo stato vuoto: si TOGLIE e si rimette, non si nasconde — una frase nascosta resta nel testo
     della pagina, e per chi legge con uno screen reader «vuoto» e «pieno» diventano la stessa cosa. */
  const serveVuoto = filtrati.length === 0;
  const tutti = grezzi;
  if (serveVuoto && !scheda.vuoto) {
    const vuoto = el(d, 'div', 'talos-card talos-inspector-card');
    vuoto.dataset.c = 'EmptyState';
    const head = el(d, 'div', 'talos-inspector-card__head');
    head.appendChild(el(d, 'b', '', 'Processi'));
    vuoto.append(head, el(d, 'p', 'talos-inspector__hint', tutti.length
      ? 'Nessun comando corrisponde al filtro.'
      : 'Nessun comando eseguito in questa sessione. Quando l\'agente o tu lanciate un comando, qui compaiono comando, durata e uscita.'));
    scheda.vuoto = vuoto;
    contenitore.append(vuoto);
  } else if (serveVuoto && scheda.vuoto) {
    const frase = scheda.vuoto.querySelector?.('.talos-inspector__hint');
    if (frase) {
      frase.textContent = tutti.length
        ? 'Nessun comando corrisponde al filtro.'
        : 'Nessun comando eseguito in questa sessione. Quando l\'agente o tu lanciate un comando, qui compaiono comando, durata e uscita.';
    }
  } else if (!serveVuoto && scheda.vuoto) {
    scheda.vuoto.remove();
    scheda.vuoto = null;
  }

  return { mostrati: visibili.length, totale: grezzi.length };
}

/**
 * Il testo su cui morde il filtro. ⛔ Si legge dal processo GREZZO (comando e descrizione, che
 * l'evento porta già) e non dal processo preparato: filtrare sulla famiglia vorrebbe dire parsare
 * mille righe di comando a ogni battuta di tastiera, ed è esattamente il costo che la cura toglie.
 * Su un processo già preparato la famiglia c'è e si usa: non si butta un dato che c'è già.
 */
function testoFiltrabile(p) {
  return `${p.comando || ''} ${p.descrizione || ''} ${p.famiglia || ''}`.toLowerCase();
}

function el(d, tag, classe, testo) { const n = d.createElement(tag); if (classe) n.className = classe; if (testo != null) n.textContent = testo; return n; }
function kv(d, k, v, classeV = '') { const r = el(d, 'div', 'talos-kv'); r.append(el(d, 'span', 'talos-kv__k', k), el(d, 'span', `talos-kv__v${classeV ? ` ${classeV}` : ''}`, v)); return r; }
/**
 * La scheda «Agenti» della colonna: le deleghe VERE della sessione (`GET /api/v1/sessions/:id/children`).
 * ⛔ 06/9, owner: «ho spawnato un sottoagente ma non si vede nulla in tab agenti». Era vero: qui c'era un
 * ramo vuoto con un commento («per ora il kernel non emette sotto-agenti») mentre la rotta esisteva già ed
 * era usata solo dal foglio «Albero sessione». Il dato e il disegno c'erano: mancava il filo.
 * Ogni riga porta il compito, lo stato della delega e il modello; senza deleghe resta lo stato vuoto del
 * mockup, che è una frase onesta, non un buco.
 */
/*
 * Il segno «questa card porta da un'altra parte».
 * ⛔ `i-chevron-right` e non `i-chev`: nello sprite sono due icone diverse e il progetto le usa
 *   con due significati — `i-chev` è il chevron che ruota per aprire qualcosa SUL POSTO (le card
 *   dell'attività), `i-chevron-right` è «vai a». Qui si cambia vista, quindi è il secondo.
 * ⛔ Verificata nello sprite prima di usarla: stamattina ne avevo scelta una che non esisteva
 *   affatto, e ad accorgersene è stato un test, non l'occhio.
 * Costruita a mano perché questo file non ha import: `el` sotto è locale per la stessa ragione.
 */
/* ⛔ L'unico import di questo file, e vale la pena: `plurale.js` è il posto in cui vive il plurale
   italiano (nato il 06/09 per il difetto BH-12, nove componenti che scrivevano «1 ricordi»). Qui
   si leggeva «1 scritture»: la decima occorrenza dello stesso difetto. */
import { plurale } from './plurale.js';

const SVG_NS_INSPECTOR = 'http://www.w3.org/2000/svg';
function chevron(d) {
  const svg = d.createElementNS(SVG_NS_INSPECTOR, 'svg');
  svg.setAttribute('class', 'i talos-inspector-card__vai');
  svg.setAttribute('aria-hidden', 'true');
  const use = d.createElementNS(SVG_NS_INSPECTOR, 'use');
  use.setAttribute('href', '#i-chevron-right');
  svg.append(use);
  return svg;
}

/** Il «…» della card di una delega: apre lo STESSO menu del tasto destro, ancorato al bottone. */
function bottoneAzioni(d, a, azioni) {
  const nome = a.taskCorto || a.task || 'delega senza compito';
  /* ⛔ Le classi sono ESATTAMENTE quelle del «…» della Libreria (`libreria.js`), non un secondo
     vestito per lo stesso oggetto: zero CSS nuovo, e se il tema cambia cambiano insieme. */
  const b = el(d, 'button', 'talos-button talos-button--ghost talos-button--sm');
  b.type = 'button';
  b.dataset.azione = 'menu';
  b.setAttribute('aria-haspopup', 'menu');
  b.setAttribute('aria-label', `Azioni su: ${nome}`);
  b.title = 'Azioni su questa delega';
  const svg = d.createElementNS(SVG_NS_INSPECTOR, 'svg');
  svg.setAttribute('class', 'i');
  svg.setAttribute('aria-hidden', 'true');
  const use = d.createElementNS(SVG_NS_INSPECTOR, 'use');
  use.setAttribute('href', '#i-more');
  svg.append(use);
  b.append(svg);
  /* ⛔ `stopPropagation`: la card intera è cliccabile e apre la conversazione — senza questo, il
     «…» apriva il menu E la figlia insieme, cioè due risposte a un gesto solo. */
  b.addEventListener('click', (evento) => {
    evento.preventDefault();
    evento.stopPropagation();
    /* ⛔ Solo `ancora`: il menu si apre ATTACCATO al bottone, non dove stava il puntatore — chi
       arriva da tastiera non ha un puntatore, e un menu che compare a 0,0 è un menu perduto. */
    azioni.onMenu(a, { ancora: b });
  });
  return b;
}

export function disegnaAgenti(d, contenitore, agenti, azioni = {}) {
  const lista = Array.isArray(agenti) ? agenti : [];
  contenitore.replaceChildren();
  if (!lista.length) {
    const vuoto = el(d, 'div', 'talos-card talos-inspector-card'); vuoto.dataset.c = 'EmptyState';
    const head = el(d, 'div', 'talos-inspector-card__head'); head.appendChild(el(d, 'b', '', 'Sotto-agenti'));
    /*
     * ⛔⛔ BC-03 (11/09) — lo stato vuoto prometteva TRE cose che la scheda piena non dà: «i suoi
     *   giri», «le sue richieste di permesso» e «il pulsante per fermarlo». Misurato sulla scheda
     *   vera, con due deleghe a schermo: la card mostra il compito, lo stato, l'ora di avvio e le
     *   chiamate/scritture — i giri stanno un clic più in là (nella conversazione della figlia), le
     *   richieste di permesso non le mostra nessuno, e fermare era solo sul tasto destro.
     * ⇒ Due cure, non una: qui le parole dicono quello che si vedrà davvero, e più sotto il
     *   «pulsante per fermarlo» esiste per davvero (il «…» della card). Una promessa si mantiene o
     *   si toglie: riscrivere solo la frase avrebbe nascosto il buco invece di chiuderlo.
     */
    vuoto.append(head, el(d, 'p', 'talos-inspector__hint', 'Nessun sotto-agente in questa sessione. Quando una delega parte, qui compare con il suo compito, lo stato e quello che ha fatto; da lì si apre la sua conversazione o si ferma.'));
    contenitore.appendChild(vuoto);
    return 0;
  }
  for (const a of lista) {
    const card = el(d, 'div', 'talos-card talos-inspector-card');
    card.dataset.c = 'AgentRow';
    card.dataset.stato = statoDelega(a);
    if (a.sessionId) card.dataset.sessioneFiglia = a.sessionId;
    /*
     * ⛔⛔ PO-08 (10/09) — la card si apre, e lo si vede PRIMA di cliccarla.
     * `role="button"` + `tabindex` perché una card che si apre col mouse e non con Invio è una
     * card che metà delle persone non può aprire.
     * ⛔ Solo se c'è davvero un ascoltatore E la figlia ha un id: senza uno dei due la card resta
     *   esattamente com'era, statica. Una promessa a schermo che non porta da nessuna parte è il
     *   difetto peggiore di tutti, perché non fa rumore.
     */
    const apribile = typeof azioni.onApri === 'function' && Boolean(a.sessionId);
    if (apribile) {
      card.classList.add('talos-inspector-card--apribile');
      card.setAttribute('role', 'button');
      card.tabIndex = 0;
      card.setAttribute('aria-label', `Apri la conversazione di: ${a.taskCorto || a.task || 'delega senza compito'}`);
      const apri = () => azioni.onApri(a);
      card.addEventListener('click', apri);
      card.addEventListener('keydown', (evento) => {
        /* ⛔ Solo la card: da quando nella testata c'è il «…», un Invio sul bottone del menu
           arrivava fin qui e apriva ANCHE la conversazione — due cose per un tasto solo. */
        if (evento.target && evento.target !== card) return;
        if (evento.key !== 'Enter' && evento.key !== ' ') return;
        evento.preventDefault();
        apri();
      });
      if (typeof azioni.onMenu === 'function') {
        card.addEventListener('contextmenu', (evento) => {
          evento.preventDefault();
          azioni.onMenu(a, { x: evento.clientX, y: evento.clientY, ancora: card });
        });
      }
    }
    const head = el(d, 'div', 'talos-inspector-card__head');
    /* ⛔ 09/09: `taskCorto` prima di `task` — la consegna intera comincia col preambolo del kernel,
       uguale per ogni figlia, e a 52 caratteri due deleghe diverse diventano la stessa riga (visto
       nella foto della scheda «Agenti» del giro D2). Il ripiego su `task` regge le figlie vecchie. */
    head.append(el(d, 'b', '', tronca(a.taskCorto || a.task || 'Delega senza compito registrato', 52)), el(d, 'span', `talos-badge talos-badge--sm${statoDelega(a) === 'fallita' ? ' talos-badge--danger' : statoDelega(a) === 'conclusa' ? ' talos-badge--success' : ''}`, etichettaDelega(a)));
    /*
     * ⛔⛔ 10/09, owner, regola generale e non un caso: «non mettere i pulsanti uno accanto
     *   all'altro, usa i tre puntini + dropdown… e anche azioni tasto destro mouse, ragiona sempre
     *   in questo modo». Qui le azioni sono TRE (apri la conversazione · apri come sessione intera ·
     *   ferma), e fino a oggi vivevano SOLO sul tasto destro: una scorciatoia che si scopre solo se
     *   già la conosci non può essere l'unica via — è la stessa frase scritta in `libreria.js`, dove
     *   la regola è nata.
     * ⛔ Stesso mattone del resto del progetto, non un secondo linguaggio: bottone ghost piccolo,
     *   icona `#i-more` dello sprite (mai tre punti tipografici), `aria-haspopup="menu"`, e lo
     *   STESSO `azioni.onMenu` del tasto destro — una lista sola, due strade per arrivarci.
     */
    if (typeof azioni.onMenu === 'function' && a.sessionId) head.append(bottoneAzioni(d, a, azioni));
    if (apribile) head.append(chevron(d));
    card.append(head);
    // ⛔ il server manda `avviataAlle` ed `evidenzaDelega` (scritture, artefatti, chiamate ad attrezzi):
    // si mostra quello che c'e' davvero, mai una riga «Modello —» che non ha dietro nessun dato.
    const ev = a.evidenzaDelega && typeof a.evidenzaDelega === 'object' ? a.evidenzaDelega : null;
    const righe = [];
    if (a.avviataAlle) righe.push(['Avviata', oraBreve(a.avviataAlle)]);
    if (ev) righe.push(['Ha fatto', `${plurale(Number(ev.toolCalls || 0), 'chiamata')} · ${plurale(Number(ev.scritture || 0), 'scrittura', 'scritture')}`]);
    for (const [k, v] of righe) {
      const kv = el(d, 'div', 'talos-kv');
      kv.append(el(d, 'span', 'talos-kv__k', k), el(d, 'span', 'talos-kv__v talos-mono', v));
      card.append(kv);
    }
    /*
     * ⛔ D3 — due deleghe che hanno scritto lo STESSO file. Finora succedeva in silenzio: l'ultima
     *   che salva vince e il lavoro dell'altra sparisce, senza un errore da nessuna parte, e tutte e
     *   due dicono «fatto». Il server ora se ne accorge mentre passa l'evento; qui si dice.
     * ⛔ Si nomina il FILE, non un conteggio: «attenzione, 2 collisioni» non è azionabile, il nome
     *   del file sì — è quello che chi legge deve andare a riaprire.
     */
    const collisioni = Array.isArray(a.collisioni) ? a.collisioni : [];
    if (collisioni.length) {
      const nota = el(d, 'p', 'talos-inspector__hint talos-inspector__hint--danger');
      const file = [...new Set(collisioni.map((c) => c.percorso))];
      nota.textContent = file.length === 1
        ? `Anche un'altra delega ha scritto ${file[0]}: l'ultima scrittura ha coperto la precedente. Riaprilo prima di fidarti.`
        : `Anche altre deleghe hanno scritto questi file: ${file.join(', ')}. L'ultima scrittura ha coperto le precedenti.`;
      card.append(nota);
    }
    contenitore.appendChild(card);
  }
  return lista.length;
}
/*
 * ⛔⛔⛔ BC-18 (owner, 11/09/2026) — «la scheda AGENTI resta VUOTA mentre la sotto-attività è VIVA».
 * Nella foto dell'owner: la chat dice «1 attività in corso — Sotto-attività: Devi assemblare e
 * validare un file HTML…», la barra a sinistra mostra la figlia annidata sotto la madre con «in
 * corso · qwen3.8-flash», e questa colonna scrive «Nessun sotto-agente in questa sessione».
 *
 * RIPRODOTTO sul banco l'11/09 (porta 4178 — NON la 4174 — con una COPIA dello store dell'owner):
 * sessione madre `8dde6bff…` aperta, la barra disegna 13 righe e fra queste la figlia `37e10d21…`;
 * dopo un giro dell'elenco la scheda Agenti mostra **0 card**. Due viste della stessa verità, e una
 * delle due è ferma su una risposta scaduta.
 *
 * CAUSA — non è il DATO, è la CADENZA. Il server dice il vero: sul banco
 * `GET /api/v1/sessions/8dde6bff…/children` risponde con **una** figlia (e `…/37e10d21…/children`
 * risponde `[]` perché quella è la FIGLIA, non la madre — chiedere l'id sbagliato fa sembrare rotto
 * il server che funziona). Le due viste però leggono con due orologi diversi:
 *   · la barra rilegge `GET /api/v1/sessions` (che porta `padreId`) OGNI 15 SECONDI
 *     (`legacy/app.js`: `window.setInterval(… 15_000)` finché la pagina è visibile);
 *   · questa scheda rilegge `…/children` in TRE momenti soli: apertura della sessione,
 *     `ToolCallStart` di `delega_sottotask`, `ToolCallResult` della stessa.
 *   ⛔ E il `ToolCallStart` è l'istante in cui la figlia NON PUÒ ANCORA ESISTERE. Misurato sul
 *     disco della sessione vera dell'owner (`8dde6bff….jsonl`): `ToolCallStart` è la riga
 *     `_sequenza: 33590`, e SOLO DOPO arrivano i `ToolCallArgs` che compitano a pezzi il task da
 *     4.776 caratteri (`{"task": `, `"Devi assembl`, `are e valid`, …). Il kernel può chiamare
 *     `delegaSottoTask` — cioè creare la sessione figlia — solo quando l'ultimo pezzo è arrivato.
 *   ⇒ La scheda chiede «hai figlie?» un istante PRIMA che la figlia nasca, si sente rispondere
 *     «no» — che in quel momento è la verità — e non lo richiede più finché la delega non è
 *     FINITA. Tutto il tempo in cui la figlia è viva, cioè esattamente quando la si guarda, la
 *     colonna è ferma su una risposta scaduta.
 *
 * RICERCA 11/09/2026, prima di scrivere (regola zero):
 *  · è un difetto di CLASSE, e dai concorrenti è APERTO: openai/codex #38478 («completed subagents
 *    remain shown as running/processing in the summary panel», per ore), #23931 e #23930 (card di
 *    sotto-agenti che restano in una vista e non nell'altra, senza modo di riconciliarle), #38408
 *    (sotto-agenti «stuck as running» dopo un riavvio). In tutti e quattro il pannello e l'albero
 *    vivo non sono d'accordo, esattamente come qui.
 *  · La regola generale, dalla letteratura sulle viste derivate (Tacnode, «Incremental Materialized
 *    View: How to Keep Derived State Fresh in Real Time», letto l'11/09/2026): «multiple
 *    materialized views refreshed independently produce inconsistent snapshots when read
 *    concurrently». Due viste della stessa verità con due aggiornamenti indipendenti DEVONO
 *    divergere: è una proprietà del disegno, non una sfortuna.
 *  ⇒ La cura non è un terzo canale né un timer nuovo: è togliere il SECONDO OROLOGIO. L'elenco che
 *    la barra già rilegge diventa il TRIGGER; `…/children` resta la FONTE, perché porta quello che
 *    l'elenco non ha (`taskCorto` pulito, `collisioni` fra sorelle, `evidenzaDelega`). Costa una
 *    fetch solo quando le due viste non sono d'accordo, zero quando lo sono.
 */

/**
 * L'impronta di una delega per confrontare le due viste: CHI è, e se ha smesso di lavorare.
 * ⛔ Lo stato entra nell'impronta e non solo l'id: il difetto gemello dei concorrenti (codex
 *   #38478) è una card che resta «In corso» per ore su una delega già finita — stessa divergenza,
 *   verso opposto. `conclusa` e `interrotta` sono gli stessi due campi in tutt'e due le rotte
 *   (verificato sul banco l'11/09: per `37e10d21…` entrambe dicono `conclusa:false,
 *   interrotta:true`), quindi il confronto non può rilevare una differenza che non c'è — che
 *   sarebbe una rilettura a vuoto ogni 15 secondi, per sempre.
 */
function improntaDelega(riga) {
  return `${riga?.sessionId ?? ''}|${riga?.conclusa === true ? 1 : 0}|${riga?.interrotta === true ? 1 : 0}`;
}

/**
 * Le due viste sono d'accordo sulle deleghe della sessione aperta?
 *
 * @param {object} dati
 * @param {Array<object>} dati.elenco lo snapshot di `GET /api/v1/sessions` che la barra ha appena letto
 * @param {string|null} dati.sessioneCorrente la sessione aperta in chat
 * @param {Array<object>} dati.figli le deleghe che la scheda sta mostrando (ultima risposta di `…/children`)
 * @returns {boolean} true quando la scheda va riletta: lo snapshot la smentisce
 */
export function schedaAgentiDaRileggere({ elenco = [], sessioneCorrente = null, figli = [] } = {}) {
  if (!sessioneCorrente) return false; // senza una sessione aperta non c'è una scheda di cui dire niente
  const righe = Array.isArray(elenco) ? elenco.filter(Boolean) : [];
  /*
   * ⛔ AL CONTRARIO, la guardia che conta: se lo snapshot non nomina nemmeno la sessione APERTA,
   *   quello snapshot non sa niente di lei (elenco filtrato, risposta parziale, sessione appena
   *   creata e non ancora nell'indice). Senza questa riga un elenco incompleto farebbe rileggere
   *   `/children` per far sparire card VERE: cioè BC-18 al rovescio, e a pagarlo sarebbe la foto
   *   giusta invece di quella sbagliata.
   */
  if (!righe.some((s) => s.sessionId === sessioneCorrente)) return false;
  const dallaBarra = new Set(righe.filter((s) => s.padreId === sessioneCorrente).map(improntaDelega));
  const dallaScheda = new Set((Array.isArray(figli) ? figli.filter(Boolean) : []).map(improntaDelega));
  if (dallaBarra.size !== dallaScheda.size) return true;
  for (const impronta of dallaBarra) if (!dallaScheda.has(impronta)) return true;
  return false;
}

// ⛔ 06/9, T05-D3: «interrotta» PRIMA di «in corso» — un figlio che nessuno sta più eseguendo non è vivo.
function statoDelega(a) { if (a?.interrotta === true) return 'interrotta'; if (!a?.conclusa) return 'in-corso'; return a.esitoDelega === 'fallito' ? 'fallita' : 'conclusa'; }
function etichettaDelega(a) { const s = statoDelega(a); return s === 'interrotta' ? 'Interrotta' : s === 'in-corso' ? 'In corso' : s === 'fallita' ? 'Non riuscita' : 'Conclusa'; }
function oraBreve(iso) {
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? '—' : t.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}
function tronca(t, n) { const s = String(t || '').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; }

function riempiCard(d, card, righe, { classiValore = () => '' } = {}) {
  if (!card) return;
  for (const n of [...card.querySelectorAll('.talos-kv')]) n.remove();
  // gli a-capo fra le righe sono quelli del sorgente del mockup: le PAROLE del cancello li vedono come spazi
  for (const r of righe) { card.appendChild(d.createTextNode('\n')); card.appendChild(kv(d, r[0], r[1], classiValore(r))); }
}

/**
 * Riscrive tutta la colonna. `dati` = { titolo, contesto, usage, finestra, ripartizione, giri, file, processi, agenti }.
 * Le card si trovano per ordine nel pannello Contesto: Ambiente · Finestra · Indice dei giri (come nel mockup).
 */
/**
 * ⛔⛔ 16/09, P0-E — UNA SCHEDA NASCOSTA NON SI DISEGNA, si segna SPORCA.
 *
 * Le quattro schede della colonna esistono tutte nel DOM e tre su quattro sono `hidden`: fino a
 * oggi si ridisegnavano tutte e quattro a ogni sincronizzazione, cioè tre quarti del lavoro
 * finivano dietro un `hidden`. Qui si salta quella nascosta e si ricorda che è rimasta indietro;
 * quando si apre, si ridisegna con gli ultimi dati.
 *
 * ⛔ LA PRIMA VOLTA SI DISEGNA COMUNQUE, anche se nascosta: nel `index.template.html` le schede
 *   nascono coi valori DIMOSTRATIVI del mockup («node --test tests/*.test.mjs», quattro processi
 *   che non esistono). Saltare anche la prima passata li lascerebbe a schermo fino al primo clic:
 *   sarebbe la cura che rimette il difetto che B2 aveva tolto il 06/09.
 */
function schedaDaSaltare(inspector, rail, chiave) {
  /*
   * ⛔ Una scheda che NON ESISTE non si «salta»: non c'è niente da saltare, e chi chiama ha già le
   *   sue guardie sui nodi mancanti (`riempiCard` esce se la card è nulla, `disegnaProcessi` pure).
   *   La prima stesura rispondeva `true` qui, e ha fatto cadere `BC48-UI-DOM` — un inspector finto
   *   senza `#railContesto` ma CON le sue card smetteva di essere riempito. Il finto era legittimo:
   *   ero io a far dipendere il disegno delle card dalla presenza del loro contenitore.
   */
  if (!rail) return false;
  if (!inspector.__schedeDisegnate) inspector.__schedeDisegnate = new Set();
  if (!inspector.__schedeSporche) inspector.__schedeSporche = new Set();
  if (rail.hidden === true && inspector.__schedeDisegnate.has(chiave)) { inspector.__schedeSporche.add(chiave); return true; }
  inspector.__schedeDisegnate.add(chiave);
  inspector.__schedeSporche.delete(chiave);
  return false;
}

/**
 * Un solo ascoltatore sulla barra delle schede: quando se ne apre una rimasta indietro, si
 * ridisegna con gli ultimi dati. ⛔ Si aggancia UNA VOLTA SOLA (`__gancioSchede`): questa funzione
 * gira a ogni sincronizzazione, e senza la guardia accumulerebbe un ascoltatore per evento.
 */
function collegaRidisegnoSchede(inspector, d) {
  if (inspector.__gancioSchede) return;
  const tabs = inspector.querySelector('#railTabs');
  if (!tabs || typeof tabs.addEventListener !== 'function') return;
  inspector.__gancioSchede = true;
  const risveglia = () => {
    if (!inspector.__schedeSporche?.size) return;
    /* Il cambio di scheda scrive `hidden` DOPO il gesto: si guarda al giro seguente. */
    const ora = () => aggiornaInspector(inspector, inspector.__ultimiDati || {}, { document: d });
    if (typeof globalThis.requestAnimationFrame === 'function') globalThis.requestAnimationFrame(ora);
    else ora();
  };
  tabs.addEventListener('click', risveglia);
  tabs.addEventListener('keyup', risveglia);
}

export function aggiornaInspector(inspector, dati = {}, { document: d = globalThis.document } = {}) {
  if (!inspector) return;
  inspector.__ultimiDati = dati;
  collegaRidisegnoSchede(inspector, d);
  const h2 = inspector.querySelector('.talos-inspector__head h2');
  if (h2) h2.textContent = dati.titolo || 'Nessuna sessione aperta';
  if (!schedaDaSaltare(inspector, inspector.querySelector('#railContesto'), 'contesto')) {
    const cards = inspector.querySelectorAll('#railContesto [data-c="InspectorCard"], #railContesto [data-c="TurnIndex"]');
    const [ambiente, finestra, indice] = cards;
    riempiCard(d, ambiente, righeAmbiente(dati.contesto));
    const f = righeFinestra(dati.usage, dati.finestra, dati.ripartizione, dati.cacheSessione);
    if (finestra) { const testa = finestra.querySelector('.talos-inspector-card__head span'); if (testa) testa.textContent = f.titoloDestra; }
    riempiCard(d, finestra, f.righe, { classiValore: (r) => (r[2] === 'stima' ? 'talos-measure--estimate' : '') });
    const giri = righeGiri(dati.giri);
    riempiCard(d, indice, giri.length ? giri : [['Nessun giro ancora', '—']], { classiValore: (r) => (r[2] === 'accent' ? 'talos-kv__v--accent' : '') });
  }
  if (!schedaDaSaltare(inspector, inspector.querySelector('#railFile'), 'file')) {
    const fileCard = inspector.querySelector('#railFile [data-c="InspectorCard"]');
    const file = righeFile(dati.file);
    riempiCard(d, fileCard, file.length ? file : [['Nessun file scritto finora', '—']], { classiValore: (r) => (r[1].startsWith('+') ? 'talos-diff-num--plus' : '') });
  }
  const agenti = inspector.querySelector('#railAgenti');
  /* ⛔ Quando una conversazione figlia è aperta, `#railAgenti` è `hidden` per scelta di chi l'ha
     aperta (il pannello vive come suo FRATELLO): la scheda resta sporca, e `chiudiConversazioneFiglia`
     rimette `hidden = false` e richiama la sincronizzazione — l'elenco si ridisegna lì. */
  if (agenti && !schedaDaSaltare(inspector, agenti, 'agenti')) disegnaAgenti(d, agenti, dati.agenti, dati.azioniAgenti || {});
  const processi = inspector.querySelector('#railProcessi');
  if (schedaDaSaltare(inspector, processi, 'processi')) return;
  /*
   * ⛔ 16/09, P0-E punto 9 — qui c'erano un `replaceChildren()` e un `for` che ricostruiva TUTTE
   *   le card a ogni sincronizzazione (e la sincronizzazione arriva da 34 punti di `legacy/app.js`).
   *   Ora la scheda si aggiorna PER RIGA: `disegnaProcessi` tiene la mappa `toolCallId → nodo`,
   *   inserisce le righe nuove, aggiorna in loco quelle che cambiano e toglie quelle sparite.
   *   Selezione, filtro, dettaglio aperto e scorrimento sopravvivono a un evento nuovo.
   */
  if (processi) disegnaProcessi(d, processi, Array.isArray(dati.processi) ? dati.processi : []);
}

/** I processi dagli eventi degli attrezzi del monolite (`eventiAttrezzi`), con i tempi misurati alla ricezione. */
export function comandoDagliArgomenti(testo = '') {
  try { const a = JSON.parse(testo); return String(a.command ?? a.comando ?? a.cmd ?? a.script ?? '').trim(); } catch { return String(testo || '').trim(); }
}
/**
 * La descrizione in parole che il modello è tenuto a mandare insieme al comando.
 *
 * ⛔ Non è un'invenzione: lo schema dell'attrezzo `shell` (`talosHarness.mjs:1692`) chiede
 *   `descrizione` — «a short, active-voice description of what this command does, shown to the
 *   user in place of the raw command» — e il dispatcher non la legge mai: passa intera dentro
 *   `argomenti` fino a `ToolCallArgs`, «dove chi consuma decide se e come mostrarla». Fino a oggi
 *   nessuno la consumava. È opzionale: quando non arriva, la riga del dettaglio dice «—».
 * ⛔ Finché il JSON è a metà `JSON.parse` lancia: si risponde stringa vuota, mai un pezzo di
 *   JSON a schermo (regola owner 04/09, niente testo tecnico nella UI).
 */
export function descrizioneDagliArgomenti(testo = '') {
  try { const a = JSON.parse(testo); return String(a.descrizione ?? a.description ?? '').trim(); } catch { return ''; }
}
export function processiDagliEventi(eventi = [], { adesso = Date.now(), nomiComando = ['shell', 'bash', 'esegui', 'comando', 'terminal'] } = {}) {
  const avviati = new Map();
  const argomenti = new Map();
  const lista = [];
  for (const e of eventi) {
    if (e.type === 'ToolCallStart' && nomiComando.includes(e.toolCallName)) {
      /*
       * ⛔ 16/09 — lo stato di partenza è `in-avvio`, non `in-corso`: fra il `ToolCallStart` e
       *   l'ultimo `ToolCallArgs` il comando NON ESISTE ancora (gli argomenti arrivano a pezzi, e
       *   su una consegna lunga sono decine di eventi — misurato sul disco della sessione
       *   `8dde6bff…`, vedi la nota BC-18 sotto). Dire «in corso» di un comando che non si sa
       *   ancora quale sia è la stessa bugia di una riga vuota che sembra piena.
       */
      const p = { id: e.toolCallId, comando: '', descrizione: '', stato: 'in-avvio', chi: 'agente', giro: e.giro ?? null, avviatoA: e.ricevutoA ?? null, durataMs: null, uscita: null };
      avviati.set(e.toolCallId, p); argomenti.set(e.toolCallId, ''); lista.push(p);
    } else if (e.type === 'ToolCallArgs' && avviati.has(e.toolCallId)) {
      argomenti.set(e.toolCallId, (argomenti.get(e.toolCallId) || '') + String(e.delta ?? ''));
      const p = avviati.get(e.toolCallId);
      p.comando = comandoDagliArgomenti(argomenti.get(e.toolCallId));
      p.descrizione = descrizioneDagliArgomenti(argomenti.get(e.toolCallId));
      /* Il comando c'è: da qui in poi il processo è davvero in corso — se non è già finito. */
      if (p.stato === 'in-avvio' && p.comando) p.stato = 'in-corso';
    } else if (e.type === 'ToolCallResult' && avviati.has(e.toolCallId)) {
      const p = avviati.get(e.toolCallId);
      p.uscita = Number.isFinite(e.uscita) ? e.uscita : (e.errore ? 1 : 0);
      p.stato = statoDaUscita(p.uscita, Boolean(e.errore));
      if (Number.isFinite(p.avviatoA) && Number.isFinite(e.ricevutoA)) p.durataMs = e.ricevutoA - p.avviatoA;
    }
  }
  for (const p of lista) {
    if (!STATI_PROCESSO[p.stato]?.vivo || !Number.isFinite(p.avviatoA)) continue;
    p.fermoDaMs = adesso - p.avviatoA;
    /*
     * ⛔ Solo chi era già «in corso» passa a «in attesa»: un processo fermo a `in-avvio` non sta
     *   aspettando un input — è la CONSEGNA che sta ancora arrivando a pezzi. Due fatti diversi
     *   prendono due parole diverse (è la stessa regola di CB-20-bis sui giri senza contatto).
     */
    if (p.stato === 'in-corso' && p.fermoDaMs >= SOGLIA_ATTESA_MS) p.stato = 'in-attesa';
  }
  return lista.reverse();
}
