/*
 * SessionItem — la riga di sessione della sidebar, come nel mockup.
 *
 * Primo componente della Fase 2 del piano «il mockup diventa la app». Il
 * markup è quello del blocco `data-c="SessionItem"` del mockup, byte per
 * byte; i dati sono quelli VERI di `GET /api/v1/sessions`. Il monolite
 * (`legacy/app.js`, `aggiornaElencoSessioniReali`) chiama `creaSessionItem`
 * al posto del suo vecchio `div.session-item`, e conserva tutto il resto:
 * l'apertura, la selezione multipla, il menu con il tasto destro.
 *
 * ⛔ Convenzioni di onestà del mockup, ereditate dal monolite (02/9):
 *   · l'ORDINE degli stati conta — «aspetta te» viene prima di «in corso»,
 *     perché è lo stato che chiede qualcosa alla persona; «interrotta» prima
 *     di «conclusa», perché una sessione fermata a metà è chiusa ma non finita;
 *   · nessun esito registrato ≠ successo: le sessioni vecchie non lo hanno, e
 *     chiamarle riuscite sarebbe inventare un fatto — niente pallino colorato;
 *   · giri e modello SOLO se il server li ha contati/dichiarati; ciò che
 *     manca non si scrive, mai uno zero finto;
 *   · il modello senza il prefisso del fornitore: misurato dal vivo, con il
 *     prefisso il nome si troncava.
 *
 * Elemento a Light DOM: markup normale, CSS globale del mockup, gli id
 * restano globali per il monolite (blog.master.dev/light-dom-only, letto il
 * 05/09/2026). Nessuno shadow DOM.
 */
import { usageDellaSessione } from './consumo-sessione.js'; // 06/9 CB-04: i giri della sessione, non dell'ultimo invio

/** Tono del pallino per ogni stato: le classi `talos-dot--*` del mockup. */
const TONI = Object.freeze({
  attesa: 'warning',
  vivo: 'live',
  errore: 'danger',
  successo: 'success',
  // interrotta / ignoto / pendente: pallino senza tono, come «interrotta» nel mockup.
});

/** Le parole del mockup per ogni stato. */
const ETICHETTE = Object.freeze({
  attesa: 'aspetta te',
  vivo: 'in corso',
  interrotto: 'interrotta',
  errore: 'errore',
  /*
   * ⛔⛔ 07/9, misurato: premi «ferma», il giro si chiude come chiedevi, e la riga diceva
   * **«errore»** — perche il giro finisce con un `RunError` di codice `fermato` e l'elenco
   * conosceva solo l'esito, non il motivo. Fermare non e sbagliare, e nemmeno concludere.
   * Ricerca 07/09/2026 — opencode #25899/#28453: un annullamento chiesto dalla persona non e ne
   * `end_turn` (fa sembrare completamento uno stop) ne `agent_error` (fa sembrare guasto un gesto
   * voluto): e un terzo esito. Qui si chiama «fermata».
   */
  fermata: 'fermata',
  successo: 'conclusa',
  ignoto: 'conclusa · esito non registrato',
  pendente: 'in attesa del primo messaggio',
});

/**
 * Lo stato di una sessione dai campi che il server manda già.
 * @param {object} sessione una riga di `GET /api/v1/sessions`
 * @returns {{classe:string, testo:string, tono:string|null}}
 */
export function statoSessione(sessione) {
  let classe;
  if (sessione.inAttesaApprovazione) classe = 'attesa';
  /*
   * ⛔ 06/9, prova T05-D3 — l'ordine era invertito rispetto alla convenzione dichiarata in cima a
   * questo file, e il difetto si vedeva a schermo: quattro sessioni delle 16:02-16:08 dicevano
   * ancora «in corso» alle 18:32. Il server manda `conclusa:false` E `interrotta:true` per una
   * sessione uccisa dalla morte del processo (session-registry, ripristino: `interrotta: !conclusa`),
   * e `!conclusa` intercettava il caso prima che `interrotta` potesse parlare. Risultato: una
   * sessione che NESSUNO sta eseguendo restava «in corso» per sempre, col pallino vivo.
   * ⛔ `interrotta` si azzera quando un giro riparte (session-registry, `voce.interrotta = false`):
   *    metterla per prima non può quindi spegnere una sessione davvero viva.
   * Stesso difetto in opencode #17680 e #19023 (letti 06/09/2026): «Web UI shows permanent Thinking
   * spinner after stream interruption or server restart» — e la conclusione è la stessa, l'interfaccia
   * deve dichiarare il giro interrotto perché il worker non riprende dopo la morte del processo.
   */
  else if (sessione.interrotta) classe = 'interrotto';
  else if (!sessione.conclusa) classe = 'vivo';
  // ⛔ il motivo VINCE sull'esito: «fermata» e «giri finiti» sono chiusure previste, non guasti.
  else if (sessione.ultimoEsito === 'errore' && sessione.motivoChiusura === 'fermata') classe = 'fermata';
  else if (sessione.ultimoEsito === 'errore') classe = 'errore';
  else if (sessione.ultimoEsito === 'successo') classe = 'successo';
  else classe = 'ignoto';
  /*
   * Il MOTIVO di chiusura, quando è noto (dalla rotta /metrics: «giri-finiti»,
   * «errore», «fermata»), è più utile della sola parola «errore»: è quello che
   * il mockup mostra («giri finiti»). Se non c'è, non si inventa.
   */
  const testo = classe === 'errore' && sessione.motivoChiusura === 'giri-finiti' ? 'giri finiti' : ETICHETTE[classe];
  /*
   * ⛔ 06/9, misurato sullo screenshot: «interrotta · scrivi per riprenderla» TRONCAVA la riga e si
   * mangiava il nome del modello — il consiglio rubava l'informazione. In 180 px l'etichetta resta
   * corta come le sorelle («conclusa», «in corso»); il come-si-riparte vive nel titolo della riga,
   * dove non costa niente a nessuno (claude-code #69456, letto 06/09/2026: offrire la ripresa,
   * non gridarla).
   */
  let aiuto = null;
  if (classe === 'interrotto') aiuto = 'Interrotta dalla morte del processo: nessuno la sta eseguendo. Scrivi un messaggio per riprenderla.';
  else if (classe === 'fermata') aiuto = 'L’hai fermata tu: il giro si e chiuso al primo punto sicuro. Scrivi un messaggio per continuare da qui.';
  return { classe, testo, tono: TONI[classe] ?? null, aiuto };
}

/**
 * L'ora come nel mockup: «18:09» se oggi, «ieri», poi «2 g»…, e la data
 * corta oltre la settimana. Il momento di riferimento si passa da fuori, così
 * la prova non dipende dall'orologio della macchina.
 */
export function oraCompatta(iso, adesso = new Date()) {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '';
  const giorno = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const differenza = Math.round((giorno(adesso) - giorno(data)) / 86_400_000);
  if (differenza <= 0) return data.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  if (differenza === 1) return 'ieri';
  if (differenza < 7) return `${differenza} g`;
  return data.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
}

/** Solo il nome del modello, senza il fornitore davanti. */
export function nomeModello(modello) {
  if (typeof modello !== 'string' || modello.trim() === '') return null;
  return modello.split('/').pop();
}

function el(documentObj, tag, className, testo) {
  const nodo = documentObj.createElement(tag);
  if (className) nodo.className = className;
  if (testo !== undefined && testo !== null) nodo.textContent = String(testo);
  return nodo;
}

/**
 * Crea la riga. Il markup è ESATTAMENTE quello del mockup:
 *
 *   <button class="talos-session-item" data-c="SessionItem" [aria-current="true"]>
 *     <span><span class="talos-session-item__title">…</span>
 *           <span class="talos-session-item__sub"><span class="talos-dot talos-dot--sm [talos-dot--tono]"></span><span class="talos-session-item__state">stato · modello</span></span></span>
 *     <span class="talos-session-item__aside"><span>ora</span><span>N giri</span></span>
 *   </button>
 *
 * @param {object} sessione riga dell'API (+ `motivoChiusura` se noto)
 * @param {object} opzioni
 * @param {Document} [opzioni.document]
 * @param {boolean} [opzioni.corrente] è la sessione aperta
 * @param {Date} [opzioni.adesso]
 * @param {boolean} [opzioni.pendente] riga «Nuova · cartella» in attesa del primo messaggio
 * @param {{attiva:boolean, selezionata:boolean, onToggle:(checked:boolean)=>void}} [opzioni.selezione]
 * @param {(event:Event)=>void} [opzioni.onApri]
 * @param {(event:MouseEvent)=>void} [opzioni.onMenu]
 */
export function creaSessionItem(sessione, opzioni = {}) {
  const documentObj = opzioni.document || globalThis.document;
  const riga = el(documentObj, 'button', 'talos-session-item');
  riga.type = 'button';
  riga.setAttribute('data-c', 'SessionItem');
  if (opzioni.corrente) riga.setAttribute('aria-current', 'true');
  if (sessione.sessionId) riga.dataset.realSessionId = sessione.sessionId;

  const etichetta = opzioni.pendente
    ? `Nuova · ${sessione.nomeCartella || ''}`
    : `${sessione.nome || sessione.taskId || ''}${sessione.forkDa ? ' · fork' : ''}`;
  const stato = opzioni.pendente ? { classe: 'pendente', testo: ETICHETTE.pendente, tono: null } : statoSessione(sessione);
  riga.dataset.sessionState = stato.classe;
  if (stato.aiuto) riga.title = stato.aiuto; // il consiglio dove non ruba spazio alla riga

  const testo = el(documentObj, 'span');
  const titolo = el(documentObj, 'span', 'talos-session-item__title', etichetta);
  const sotto = el(documentObj, 'span', 'talos-session-item__sub');
  const pallino = el(documentObj, 'span', `talos-dot talos-dot--sm${stato.tono ? ` talos-dot--${stato.tono}` : ''}`);
  const modello = opzioni.pendente ? null : nomeModello(sessione.modello);
  sotto.append(pallino, el(documentObj, 'span', 'talos-session-item__state', modello ? `${stato.testo} · ${modello}` : stato.testo));
  testo.append(titolo, sotto);

  const aside = el(documentObj, 'span', 'talos-session-item__aside');
  if (!opzioni.pendente) {
    aside.append(el(documentObj, 'span', null, oraCompatta(sessione.avviataAlle, opzioni.adesso)));
    // ⛔ 06/9, CB-04: la riga dell'elenco parla della SESSIONE, quindi i giri sono quelli di
    //    tutta la conversazione: `usage` è il solo ultimo invio, e diceva «1 giro» su tre.
    const giri = usageDellaSessione(sessione)?.giri;
    if (Number.isFinite(giri) && giri > 0) aside.append(el(documentObj, 'span', null, `${giri} gir${giri === 1 ? 'o' : 'i'}`));
  }

  if (opzioni.selezione?.attiva) {
    /* La selezione multipla del monolite: una casella per riga, nel vocabolario del mockup (.talos-checkbox). */
    const casella = el(documentObj, 'input', 'talos-checkbox');
    casella.type = 'checkbox';
    casella.checked = Boolean(opzioni.selezione.selezionata);
    casella.dataset.sessionSelect = sessione.sessionId || '';
    casella.setAttribute('aria-label', `Seleziona ${etichetta}`);
    casella.addEventListener('click', (event) => event.stopPropagation());
    casella.addEventListener('change', () => opzioni.selezione.onToggle?.(casella.checked));
    riga.append(casella);
    riga.classList.add('is-selection-mode');
    if (casella.checked) riga.classList.add('is-selected');
  }

  riga.append(testo, aside);
  if (typeof opzioni.onApri === 'function') riga.addEventListener('click', opzioni.onApri);
  if (typeof opzioni.onMenu === 'function') {
    riga.addEventListener('contextmenu', (event) => { event.preventDefault(); event.stopPropagation(); opzioni.onMenu(event); });
  }
  return riga;
}
