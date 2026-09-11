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
export function righeFinestra(usage = null, finestra = null, ripartizione = null) {
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

/** Un processo: { comando, stato: 'in-corso'|'ok'|'errore', chi: 'agente'|'tu', giro, durataMs, uscita, fermoDaMs }. */
export function datiProcesso(p = {}) {
  const durata = Number.isFinite(p.durataMs) ? `${num.format(p.durataMs / 1000)} s` : null; // «0,3 s», «18,1 s», «74 s» come nel mockup
  const misura = [durata, p.stato !== 'in-corso' && Number.isFinite(p.uscita) ? `uscita ${p.uscita}` : null].filter(Boolean).join(' · ') || (p.stato === 'in-corso' ? '' : '—');
  const chi = `${p.chi === 'tu' ? 'tu' : 'agente'} · ${p.chi === 'tu' ? 'terminale' : `giro ${p.giro ?? '—'}`}`;
  const fermo = Number.isFinite(p.fermoDaMs) && p.fermoDaMs >= 60_000 ? `Nessuna uscita da ${Math.round(p.fermoDaMs / 1000)} secondi. Il processo è vivo: potrebbe aspettare un input. TALOS non lo ferma da solo.` : null;
  return { comando: p.comando || '—', stato: p.stato || 'ok', chi, misura, fermo };
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
export function aggiornaInspector(inspector, dati = {}, { document: d = globalThis.document } = {}) {
  if (!inspector) return;
  const h2 = inspector.querySelector('.talos-inspector__head h2');
  if (h2) h2.textContent = dati.titolo || 'Nessuna sessione aperta';
  const cards = inspector.querySelectorAll('#railContesto [data-c="InspectorCard"], #railContesto [data-c="TurnIndex"]');
  const [ambiente, finestra, indice] = cards;
  riempiCard(d, ambiente, righeAmbiente(dati.contesto));
  const f = righeFinestra(dati.usage, dati.finestra, dati.ripartizione);
  if (finestra) { const testa = finestra.querySelector('.talos-inspector-card__head span'); if (testa) testa.textContent = f.titoloDestra; }
  riempiCard(d, finestra, f.righe, { classiValore: (r) => (r[2] === 'stima' ? 'talos-measure--estimate' : '') });
  const giri = righeGiri(dati.giri);
  riempiCard(d, indice, giri.length ? giri : [['Nessun giro ancora', '—']], { classiValore: (r) => (r[2] === 'accent' ? 'talos-kv__v--accent' : '') });
  const fileCard = inspector.querySelector('#railFile [data-c="InspectorCard"]');
  const file = righeFile(dati.file);
  riempiCard(d, fileCard, file.length ? file : [['Nessun file scritto finora', '—']], { classiValore: (r) => (r[1].startsWith('+') ? 'talos-diff-num--plus' : '') });
  const agenti = inspector.querySelector('#railAgenti');
  if (agenti) disegnaAgenti(d, agenti, dati.agenti, dati.azioniAgenti || {});
  const processi = inspector.querySelector('#railProcessi');
  if (processi) {
    processi.replaceChildren();
    const lista = Array.isArray(dati.processi) ? dati.processi : [];
    if (!lista.length) {
      const vuoto = el(d, 'div', 'talos-card talos-inspector-card'); vuoto.dataset.c = 'EmptyState';
      const head = el(d, 'div', 'talos-inspector-card__head'); head.appendChild(el(d, 'b', '', 'Processi'));
      vuoto.append(head, el(d, 'p', 'talos-inspector__hint', 'Nessun comando eseguito in questa sessione. Quando l\'agente o tu lanciate un comando, qui compaiono comando, durata e uscita.'));
      processi.appendChild(vuoto);
    }
    for (const p of lista) {
      const dp = datiProcesso(p);
      const card = el(d, 'div', 'talos-card talos-process'); card.dataset.c = 'ProcessRow'; card.dataset.stato = dp.stato;
      card.appendChild(el(d, 'div', 'talos-process__cmd', dp.comando));
      const meta = el(d, 'div', 'talos-process__meta');
      if (dp.stato === 'in-corso') meta.appendChild(el(d, 'span', 'talos-badge talos-badge--accent talos-badge--sm', 'In corso'));
      else meta.appendChild(el(d, 'span', `talos-dot talos-dot--${dp.stato === 'errore' ? 'danger' : 'success'}`));
      meta.append(el(d, 'span', '', dp.chi), el(d, 'span', 'talos-grow'), el(d, 'span', 'talos-mono talos-measure', dp.misura));
      card.appendChild(meta);
      if (dp.fermo) card.appendChild(el(d, 'div', 'talos-process__stall', dp.fermo));
      processi.appendChild(d.createTextNode('\n')); // come nel sorgente del mockup: uno spazio fra una scheda e l'altra
      processi.appendChild(card);
    }
  }
}

/** I processi dagli eventi degli attrezzi del monolite (`eventiAttrezzi`), con i tempi misurati alla ricezione. */
export function comandoDagliArgomenti(testo = '') {
  try { const a = JSON.parse(testo); return String(a.command ?? a.comando ?? a.cmd ?? a.script ?? '').trim(); } catch { return String(testo || '').trim(); }
}
export function processiDagliEventi(eventi = [], { adesso = Date.now(), nomiComando = ['shell', 'bash', 'esegui', 'comando', 'terminal'] } = {}) {
  const avviati = new Map();
  const argomenti = new Map();
  const lista = [];
  for (const e of eventi) {
    if (e.type === 'ToolCallStart' && nomiComando.includes(e.toolCallName)) {
      const p = { id: e.toolCallId, comando: '', stato: 'in-corso', chi: 'agente', giro: e.giro ?? null, avviatoA: e.ricevutoA ?? null, durataMs: null, uscita: null };
      avviati.set(e.toolCallId, p); argomenti.set(e.toolCallId, ''); lista.push(p);
    } else if (e.type === 'ToolCallArgs' && avviati.has(e.toolCallId)) {
      argomenti.set(e.toolCallId, (argomenti.get(e.toolCallId) || '') + String(e.delta ?? ''));
      avviati.get(e.toolCallId).comando = comandoDagliArgomenti(argomenti.get(e.toolCallId));
    } else if (e.type === 'ToolCallResult' && avviati.has(e.toolCallId)) {
      const p = avviati.get(e.toolCallId);
      p.stato = e.errore ? 'errore' : 'ok';
      p.uscita = Number.isFinite(e.uscita) ? e.uscita : (e.errore ? 1 : 0);
      if (Number.isFinite(p.avviatoA) && Number.isFinite(e.ricevutoA)) p.durataMs = e.ricevutoA - p.avviatoA;
    }
  }
  for (const p of lista) if (p.stato === 'in-corso' && Number.isFinite(p.avviatoA)) p.fermoDaMs = adesso - p.avviatoA;
  return lista.reverse();
}
