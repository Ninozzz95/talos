/*
 * Conversazione — i blocchi della chat, come nel mockup.
 *
 * Quinto componente della Fase 2 (il modello per tutte le altre schermate).
 * Qui stanno le FABBRICHE dei blocchi che il monolite (`legacy/app.js`,
 * handleRealEvent e i suoi append*) monta nella conversazione a partire dagli
 * eventi veri dello stream: Turn, TurnSpine, Message (utente e TALOS),
 * ActivityBundle, ToolRow, ToolFailure, SystemNote, ApprovalCard, DiffView,
 * SignedReceipt, TouchedFiles, ArtifactCard e lo scheletro dell'attesa. Il
 * markup è quello del mockup, byte per byte; il cervello resta nel monolite.
 *
 * ⛔ Convenzione: gli elementi che il monolite continua a toccare dopo la
 * creazione (il testo che scorre, la riga di riassunto del bundle, il
 * dettaglio di un attrezzo, il piede dell'approvazione) portano ANCHE le
 * classi-gancio del monolite (`assistant-copy`, `sheet-actions`,
 * `run-activity-label`…) accanto a quelle `talos-*`: sono senza stile (il CSS
 * legacy non è caricato) e invisibili al cancello di parità, che confronta
 * solo `data-c` e `talos-*`. Così handleRealEvent non cambia.
 *
 * Ricerca 05/09/2026: separare il filo della conversazione (obiettivi e
 * risposte) dall'attività autonoma dell'agente, con gli attrezzi raggruppati
 * in un pannello richiudibile e stati aggiornabili nel tempo (AG-UI «Messages»,
 * docs.ag-ui.com/concepts/messages; LangChain «From Token Streams to Agent
 * Streams»; fuselabcreative.com «UI Design for AI Agents 2026»). È la forma
 * del mockup: testo di TALOS in chiaro, ActivityBundle per gli attrezzi,
 * SystemNote per gli eventi di ciclo, ApprovalCard per il consenso.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

function el(documentObj, tag, className, testo) {
  const nodo = documentObj.createElement(tag);
  if (className) nodo.className = className;
  if (testo !== undefined && testo !== null) nodo.textContent = String(testo);
  return nodo;
}

function simbolo(documentObj, classe, nome) {
  const svg = documentObj.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', classe);
  const use = documentObj.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#${nome}`);
  svg.append(use);
  return svg;
}

function avatar(documentObj) {
  const span = el(documentObj, 'span', 'talos-avatar talos-avatar--sm');
  span.append(simbolo(documentObj, 'glyph', 'glifo'));
  return span;
}

/** L'ora come la scrive il mockup nella meta di un messaggio («18:04»). */
export function oraMessaggio(quando = new Date()) {
  const data = quando instanceof Date ? quando : new Date(quando);
  if (Number.isNaN(data.getTime())) return '';
  return data.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

/* ------------------------------------------------------------------ Turn */

/**
 * Un turno: la colonna di sinistra (spine) con i numeri dei giri e i tick,
 * e il messaggio. `numeri` = [{ n, tick, tono }], tick 1-5 (larghezza), tono
 * null | 'info' | 'warning' | 'danger' | 'current'.
 */
export function creaTurno({ numeri = [] } = {}, opzioni = {}) {
  const documentObj = opzioni.document || globalThis.document;
  const turno = el(documentObj, 'div', 'talos-turn');
  turno.setAttribute('data-c', 'Turn');
  const spine = el(documentObj, 'div', 'talos-turn-spine');
  spine.setAttribute('data-c', 'TurnSpine');
  for (const voce of numeri) aggiungiGiroAllaSpine(spine, voce);
  turno.append(spine);
  return turno;
}

/** Aggiunge un giro (numero + tick) alla spine di un turno già montato. */
export function aggiungiGiroAllaSpine(spine, { n, tick = 1, tono = null } = {}) {
  if (!spine) return;
  const documentObj = spine.ownerDocument;
  spine.append(el(documentObj, 'span', 'talos-turn-spine__n', n));
  /*
   * ⭐ 06/9, owner: «che navighi un po' come fa ChatGPT, conversation history bar». Il tick non è più un
   * segno muto: è un bottone che porta al suo giro. Resta identico a vedersi (stessa classe, stessa misura),
   * quindi nessuna regressione nella parità col mockup; cambia solo che si può premere, anche da tastiera.
   */
  const segno = el(documentObj, 'button', `talos-turn-spine__tick${tono ? ` talos-turn-spine__tick--${tono}` : ''}`);
  segno.type = 'button';
  segno.dataset.tick = String(Math.min(5, Math.max(1, Math.trunc(tick) || 1)));
  segno.dataset.giro = String(n ?? '');
  segno.setAttribute('aria-label', 'Vai al giro'); // il numero sta gia' accanto: l'etichetta resta uguale a quella del mockup
  segno.title = `Giro ${n ?? ''}`.trim();
  spine.append(segno);
}

/**
 * Collega la navigazione della spina: un clic su un tick porta al suo giro, e il tick del giro che si sta
 * guardando resta acceso mentre si scorre — la stessa cosa che fa la barra della cronologia di ChatGPT.
 * Idempotente: si può chiamare a ogni disegno.
 * @param {Element} conversazione il contenitore che scorre (`#conversation`)
 * @returns {() => void} per staccare l'osservatore
 */
export function collegaNavigazioneSpina(conversazione) {
  if (!conversazione || conversazione.dataset.spinaCollegata === 'si') return () => {};
  conversazione.dataset.spinaCollegata = 'si';
  const documentObj = conversazione.ownerDocument;
  const finestra = documentObj.defaultView || globalThis;
  conversazione.addEventListener('click', (evento) => {
    const tick = evento.target.closest?.('.talos-turn-spine__tick');
    if (!tick) return;
    const turno = tick.closest('.talos-turn');
    if (!turno) return;
    const ridotto = finestra.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    turno.scrollIntoView({ behavior: ridotto ? 'auto' : 'smooth', block: 'start' });
  });
  if (typeof finestra.IntersectionObserver !== 'function') return () => {};
  const osservatore = new finestra.IntersectionObserver((voci) => {
    for (const voce of voci) {
      const spina = voce.target.querySelector('.talos-turn-spine');
      if (!spina) continue;
      for (const t of spina.querySelectorAll('.talos-turn-spine__tick')) t.classList.toggle('talos-turn-spine__tick--visibile', voce.isIntersecting);
    }
  }, { root: conversazione, threshold: 0.35 });
  const guarda = () => { for (const turno of conversazione.querySelectorAll('.talos-turn')) osservatore.observe(turno); };
  guarda();
  const mutazioni = new finestra.MutationObserver(guarda);
  mutazioni.observe(conversazione, { childList: true, subtree: true });
  return () => { osservatore.disconnect(); mutazioni.disconnect(); delete conversazione.dataset.spinaCollegata; };
}

/** Cambia il tono dell'ULTIMO tick di una spine (es. «current» → null a giro finito, «danger» su errore). */
export function impostaTonoUltimoTick(spine, tono) {
  const ultimo = spine?.querySelector('.talos-turn-spine__tick:last-of-type');
  if (!ultimo) return;
  ultimo.className = `talos-turn-spine__tick${tono ? ` talos-turn-spine__tick--${tono}` : ''}`;
}

/* --------------------------------------------------------------- Message */

/**
 * Il messaggio della persona: testata «Tu · 18:04 · <meta>» e corpo.
 * `meta` è ciò che l'originale scriveva sotto la bolla (Task reale · id,
 * Follow-up, i permessi del giro): resta, dopo l'ora.
 */
export function creaMessaggioUtente({ testo = '', ora = '', meta = '' } = {}, opzioni = {}) {
  const documentObj = opzioni.document || globalThis.document;
  const messaggio = el(documentObj, 'div', 'talos-message talos-message--user');
  messaggio.setAttribute('data-c', 'Message');
  const testata = el(documentObj, 'div', 'talos-message__head');
  testata.append(el(documentObj, 'span', 'talos-message__who', 'Tu'), el(documentObj, 'span', 'talos-message__meta', [ora, meta].filter(Boolean).join(' · ')));
  const corpo = el(documentObj, 'div', 'talos-message__body message-bubble');
  const p = el(documentObj, 'p', null, testo);
  corpo.append(p);
  messaggio.append(testata, corpo);
  return messaggio;
}

/**
 * Il messaggio di TALOS: testata (avatar, TALOS, «modello · ora») e uno spazio
 * in cui il monolite fa scorrere il testo (`.assistant-copy`, il suo gancio).
 * I paragrafi vanno direttamente nel messaggio, come nel mockup.
 */
export function creaMessaggioTalos({ modello = '', ora = '', paragrafi = [] } = {}, opzioni = {}) {
  const documentObj = opzioni.document || globalThis.document;
  const messaggio = el(documentObj, 'div', 'talos-message');
  messaggio.setAttribute('data-c', 'Message');
  const testata = el(documentObj, 'div', 'talos-message__head');
  testata.append(avatar(documentObj), el(documentObj, 'span', 'talos-message__who talos-message__who--talos', 'TALOS'), el(documentObj, 'span', 'talos-message__meta', [modello, ora].filter(Boolean).join(' · ')));
  messaggio.append(testata);
  for (const testo of paragrafi) messaggio.append(el(documentObj, 'p', null, testo));
  return messaggio;
}

/** Le azioni sulla risposta (copia · ascolta · chiedi di nuovo), come nel mockup: si vedono al passaggio del mouse. */
export function creaAzioniMessaggio({ ascolta = true } = {}, opzioni = {}) {
  const documentObj = opzioni.document || globalThis.document;
  const gruppo = el(documentObj, 'div', 'talos-message__actions message-actions');
  gruppo.setAttribute('role', 'group');
  gruppo.setAttribute('aria-label', 'Azioni sulla risposta');
  const bottone = (nome, titolo, icona) => {
    const b = el(documentObj, 'button', 'talos-button talos-button--ghost talos-icon-button talos-button--sm');
    b.type = 'button';
    b.title = titolo;
    b.setAttribute('aria-label', titolo); // 05/09 confronto Hermes: il solo `title` è un nome di ultima risorsa (W3C APG names-and-descriptions, ARIA14)
    b.dataset.messageAction = nome;
    b.append(simbolo(documentObj, 'i i--sm', icona));
    return b;
  };
  gruppo.append(bottone('copy', 'Copia la risposta', 'i-copy'));
  if (ascolta) {
    const b = bottone('listen', 'Ascolta la risposta', 'i-play');
    b.setAttribute('aria-pressed', 'false');
    b.classList.add('assistant-listen-btn');
    gruppo.append(b);
  }
  gruppo.append(bottone('ask-again', 'Chiedi di nuovo', 'i-history'));
  return gruppo;
}

/* ---------------------------------------------------------- Activity/Tool */

/** Le icone dello sprite per ogni attrezzo del kernel (i nomi che riceve il modello NON cambiano: qui si sceglie solo il simbolo). */
export const ICONA_ATTREZZO = Object.freeze({
  leggi: 'i-eye', cerca: 'i-search', elenca: 'i-search', shell: 'i-terminal', prova: 'i-terminal',
  scrivi: 'i-code', naviga: 'i-globe', web_search: 'i-globe', delega_sottotask: 'i-user',
  memory_write: 'i-brain', artifact_create: 'i-doc', document_create: 'i-doc', generate_image: 'i-doc',
  time_now: 'i-clock', research_start: 'i-globe',
});

export function iconaAttrezzo(nome) {
  return ICONA_ATTREZZO[nome] || 'i-bolt';
}

/**
 * Il raggruppamento degli attrezzi di un giro. Ritorna gli elementi che il
 * monolite aggiorna: `contenitore` (le righe), `summaryText` (la frase in
 * testa), `misure` (tempo/token/diff a destra).
 */
export function creaAttivita({ riassunto = 'Attività…', id, aperto = false, tempo = null, token = null } = {}, opzioni = {}) {
  const documentObj = opzioni.document || globalThis.document;
  const card = el(documentObj, 'div', 'talos-card talos-activity');
  card.setAttribute('data-c', 'ActivityBundle');
  const idCorpo = id || `attivita-${Math.random().toString(36).slice(2, 8)}`;
  const testa = el(documentObj, 'button', 'talos-activity__head');
  testa.type = 'button';
  testa.setAttribute('aria-expanded', String(Boolean(aperto)));
  testa.setAttribute('aria-controls', idCorpo);
  testa.append(simbolo(documentObj, 'i talos-activity__chev', 'i-chev'));
  const summaryText = el(documentObj, 'span', 'talos-grow tool-note-summary-text', riassunto);
  testa.append(summaryText);
  if (tempo) testa.append(el(documentObj, 'span', 'talos-mono talos-measure', tempo));
  if (token) testa.append(el(documentObj, 'span', 'talos-mono talos-measure--estimate', token));
  const contenitore = el(documentObj, 'div', 'talos-activity__body tool-batch-items');
  contenitore.id = idCorpo;
  contenitore.hidden = !aperto;
  // Il clic lo gestisce la regia del mockup (portata in app.js): ogni `[aria-expanded][aria-controls]` è un disclosure.
  card.append(testa, contenitore);
  return { card, testa, summaryText, contenitore };
}

/** Il badge «+18 −2» nella testa di un bundle che ha scritto qualcosa. */
export function impostaDiffAttivita(testa, aggiunte, rimozioni) {
  if (!testa) return;
  const documentObj = testa.ownerDocument;
  let piu = testa.querySelector('.talos-diff-num--plus');
  let meno = testa.querySelector('.talos-diff-num--minus');
  if (!piu) { piu = el(documentObj, 'span', 'talos-diff-num talos-diff-num--plus'); testa.append(piu); }
  if (!meno) { meno = el(documentObj, 'span', 'talos-diff-num talos-diff-num--minus'); testa.append(meno); }
  piu.textContent = `+${aggiunte}`;
  meno.textContent = `−${rimozioni}`;
}

/**
 * Una riga di attrezzo: icona, nome umano, dettaglio (percorso/comando) e il
 * pallino dell'esito. `esito` = 'running' | 'success' | 'error' | null.
 * Con `conDettaglio` la riga apre/chiude un corpo (`pre`) con argomenti ed
 * esito — il dettaglio espandibile dell'originale, nel linguaggio del mockup.
 */
export function creaRigaAttrezzo({ attrezzo = '', nome = '', dettaglio = '', esito = null, conDettaglio = false, id } = {}, opzioni = {}) {
  const documentObj = opzioni.document || globalThis.document;
  const riga = el(documentObj, 'div', 'talos-tool-row');
  riga.setAttribute('data-c', 'ToolRow');
  const icona = el(documentObj, 'span', 'talos-tool-row__icon');
  icona.append(simbolo(documentObj, 'i', iconaAttrezzo(attrezzo)));
  const summaryText = el(documentObj, 'span', 'talos-tool-row__name tool-note-summary-text', nome);
  const dettaglioEl = el(documentObj, 'span', 'talos-tool-row__detail', dettaglio);
  const pallino = el(documentObj, 'span', 'talos-dot');
  riga.append(icona, summaryText, dettaglioEl, pallino);
  impostaEsitoRiga(riga, esito);
  let corpo = null;
  if (conDettaglio) {
    const idCorpo = id || `riga-${Math.random().toString(36).slice(2, 8)}`;
    riga.setAttribute('role', 'button');
    riga.tabIndex = 0;
    riga.setAttribute('aria-expanded', 'false');
    riga.setAttribute('aria-controls', idCorpo);
    corpo = el(documentObj, 'pre', 'talos-tool-row__body tool-note-detail');
    corpo.id = idCorpo;
    // Il clic lo gestisce la regia del mockup (disclosure generico); da tastiera, Invio e Spazio fanno lo stesso.
    riga.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      const era = riga.getAttribute('aria-expanded') === 'true';
      riga.setAttribute('aria-expanded', String(!era));
      corpo.hidden = era;
    });
  }
  return { riga, summaryText, dettaglio: dettaglioEl, corpo };
}

/** Il pallino della riga: in corso (live), riuscito (success), fallito (danger); null = nessun tono. */
export function impostaEsitoRiga(riga, esito) {
  const pallino = riga?.querySelector('.talos-dot');
  if (!pallino) return;
  const tono = esito === 'running' ? 'live' : esito === 'success' ? 'success' : esito === 'error' ? 'danger' : null;
  pallino.className = `talos-dot${tono ? ` talos-dot--${tono}` : ''}`;
  riga.dataset.toolState = esito === 'running' ? 'running' : esito === 'error' ? 'error' : esito === 'success' ? 'complete' : '';
  if (!riga.dataset.toolState) delete riga.dataset.toolState;
}

/** Il fallimento di un attrezzo, spiegato: titolo, testo, azioni e codice. */
export function creaFallimentoAttrezzo({ titolo = '', testo = '', codice = '', azioni = [] } = {}, opzioni = {}) {
  const documentObj = opzioni.document || globalThis.document;
  const box = el(documentObj, 'div', 'talos-tool-failure');
  box.setAttribute('data-c', 'ToolFailure');
  box.append(el(documentObj, 'div', 'talos-tool-failure__title', titolo));
  if (testo) box.append(el(documentObj, 'p', null, testo));
  const riga = el(documentObj, 'div', 'talos-tool-failure__actions');
  for (const [i, azione] of azioni.entries()) {
    const b = el(documentObj, 'button', `talos-button ${i === 0 ? 'talos-button--secondary' : 'talos-button--ghost'} talos-button--sm`, azione.etichetta);
    b.type = 'button';
    if (typeof azione.onClick === 'function') b.addEventListener('click', azione.onClick);
    riga.append(b);
  }
  if (codice) riga.append(el(documentObj, 'span', 'talos-code', codice));
  box.append(riga);
  return box;
}

/* -------------------------------------------------------------- SystemNote */

/** Una nota di sistema: badge (Nota / Errore), titolo e testo. */
export function creaNotaSistema({ tipo = 'info', badge = 'Nota', titolo = '', testo = '' } = {}, opzioni = {}) {
  const documentObj = opzioni.document || globalThis.document;
  const nota = el(documentObj, 'div', 'talos-system-note');
  nota.setAttribute('data-c', 'SystemNote');
  nota.append(el(documentObj, 'span', `talos-badge talos-badge--${tipo} talos-badge--sm`, badge));
  const corpo = el(documentObj, 'div');
  if (titolo) corpo.append(el(documentObj, 'div', 'talos-system-note__title', titolo));
  corpo.append(el(documentObj, 'p', 'assistant-copy', testo));
  nota.append(corpo);
  return nota;
}

/* ---------------------------------------------------------- Approval/Diff */

/** Le righe di un diff: [{ tipo: 'add'|'del'|'ctx', testo }]. */
export function creaDiff(righe = [], opzioni = {}) {
  const documentObj = opzioni.document || globalThis.document;
  const diff = el(documentObj, 'div', 'talos-diff');
  diff.setAttribute('data-c', 'DiffView');
  for (const r of righe) diff.append(el(documentObj, 'div', `talos-diff__line talos-diff__line--${r.tipo || 'ctx'}`, r.testo));
  return diff;
}

/**
 * La scheda di approvazione: cosa chiede (badge), il bersaglio, il perché, il
 * diff se c'è, e le tre risposte (una volta · per questa sessione · nega).
 * `pulsanti` riceve i tre handler; `piede` porta la classe-gancio
 * `sheet-actions` che ApprovalResolved rimuove; `perche` porta `assistant-copy`.
 */
export function creaApprovazione({ badge = 'Chiede di scrivere', bersaglio = '', aggiunte = null, rimozioni = null, perche = '', diff = null, nota = 'Scade a fine sessione', onUnaVolta, onSessione, onNega } = {}, opzioni = {}) {
  const documentObj = opzioni.document || globalThis.document;
  const scheda = el(documentObj, 'div', 'talos-approval');
  scheda.setAttribute('data-c', 'ApprovalCard');
  const testa = el(documentObj, 'div', 'talos-approval__head');
  const etichetta = el(documentObj, 'span', 'talos-badge talos-badge--accent');
  etichetta.append(simbolo(documentObj, 'i i--sm', 'i-shield'), documentObj.createTextNode(badge));
  testa.append(etichetta, el(documentObj, 'span', 'talos-mono talos-measure talos-grow talos-truncate', bersaglio));
  if (Number.isFinite(aggiunte)) testa.append(el(documentObj, 'span', 'talos-diff-num talos-diff-num--plus', `+${aggiunte}`));
  if (Number.isFinite(rimozioni)) testa.append(el(documentObj, 'span', 'talos-diff-num talos-diff-num--minus', `−${rimozioni}`));
  scheda.append(testa);
  const perchéEl = el(documentObj, 'p', 'talos-approval__why assistant-copy', perche);
  scheda.append(perchéEl);
  if (Array.isArray(diff) && diff.length > 0) scheda.append(creaDiff(diff, opzioni));
  const piede = el(documentObj, 'div', 'talos-approval__foot sheet-actions');
  const bottone = (classi, testo, onClick) => {
    const b = el(documentObj, 'button', classi, testo);
    b.type = 'button';
    if (typeof onClick === 'function') b.addEventListener('click', onClick);
    return b;
  };
  const unaVolta = bottone('talos-button talos-button--primary talos-button--md', 'Consenti una volta', onUnaVolta);
  const sessione = bottone('talos-button talos-button--secondary', 'Per questa sessione', onSessione);
  const nega = bottone('talos-button talos-button--ghost talos-button--danger', 'Nega', onNega);
  piede.append(unaVolta, sessione, nega, el(documentObj, 'span', 'talos-grow'), el(documentObj, 'span', 'talos-approval__foot-note', nota));
  scheda.append(piede);
  return { scheda, perche: perchéEl, piede, pulsanti: { unaVolta, sessione, nega } };
}

/** La ricevuta firmata di una scrittura. */
export function creaRicevuta({ testo = '', hash = '' } = {}, opzioni = {}) {
  const documentObj = opzioni.document || globalThis.document;
  const ricevuta = el(documentObj, 'div', 'talos-receipt');
  ricevuta.setAttribute('data-c', 'SignedReceipt');
  ricevuta.append(el(documentObj, 'span', 'talos-badge talos-badge--success talos-badge--sm', 'Ricevuta firmata'), el(documentObj, 'span', 'talos-receipt__text', testo), el(documentObj, 'span', 'talos-receipt__hash', hash));
  return ricevuta;
}

/** I file toccati in un giro: [{ percorso, aggiunte, rimozioni, onApri, onDiff }]. */
export function creaFileToccati(file = [], opzioni = {}) {
  const documentObj = opzioni.document || globalThis.document;
  const card = el(documentObj, 'div', 'talos-card talos-touched');
  card.setAttribute('data-c', 'TouchedFiles');
  const testa = el(documentObj, 'div', 'talos-touched__head');
  testa.append(el(documentObj, 'span', 'talos-eyebrow', 'File toccati in questo giro'));
  card.append(testa);
  for (const f of file) card.append(rigaFileToccato(f, opzioni));
  return card;
}

export function rigaFileToccato({ percorso = '', aggiunte = 0, rimozioni = 0, onApri, onDiff } = {}, opzioni = {}) {
  const documentObj = opzioni.document || globalThis.document;
  const riga = el(documentObj, 'div', 'talos-touched__row');
  riga.dataset.percorso = percorso;
  riga.append(el(documentObj, 'span', 'talos-touched__name', percorso), el(documentObj, 'span', 'talos-diff-num talos-diff-num--plus', `+${aggiunte}`), el(documentObj, 'span', 'talos-diff-num talos-diff-num--minus', `−${rimozioni}`));
  const apri = el(documentObj, 'button', 'talos-button talos-button--ghost talos-button--sm', 'Apri');
  apri.type = 'button';
  if (typeof onApri === 'function') apri.addEventListener('click', onApri);
  const diff = el(documentObj, 'button', 'talos-button talos-button--secondary talos-button--sm', 'Differenza');
  diff.type = 'button';
  diff.dataset.vaia = 'review'; // come nel mockup: porta alla Review (la regia portata in app.js instrada data-vaia)
  if (typeof onDiff === 'function') diff.addEventListener('click', onDiff);
  riga.append(apri, diff);
  return riga;
}

/* ---------------------------------------------------------------- Artifact */

/** La scheda di un artefatto creato dal modello: titolo, formato, «Apri» e l'anteprima in un iframe isolato. */
export function creaArtefatto({ titolo = 'Artefatto', formato = '', src = '', onApri } = {}, opzioni = {}) {
  const documentObj = opzioni.document || globalThis.document;
  const card = el(documentObj, 'div', 'talos-card talos-artifact');
  card.setAttribute('data-c', 'ArtifactCard');
  const testa = el(documentObj, 'div', 'talos-artifact__head');
  testa.append(el(documentObj, 'span', 'talos-badge talos-badge--accent talos-badge--sm', 'Artefatto'), el(documentObj, 'span', 'talos-artifact__title talos-grow talos-truncate', titolo));
  if (formato) testa.append(el(documentObj, 'span', 'talos-mono talos-muted', formato));
  const apri = el(documentObj, 'button', 'talos-button talos-button--ghost talos-button--sm', 'Apri');
  apri.type = 'button';
  if (typeof onApri === 'function') apri.addEventListener('click', onApri);
  testa.append(apri);
  const frame = documentObj.createElement('iframe');
  frame.className = 'talos-artifact__frame artifact-card-frame';
  frame.setAttribute('title', titolo);
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.setAttribute('referrerpolicy', 'no-referrer');
  if (src) frame.src = src;
  card.append(testa, frame);
  return { card, frame, apri };
}

/* ------------------------------------------------------------------ Attesa */

/**
 * L'attesa della risposta: lo scheletro del mockup (tre barre) preceduto dalla
 * riga animata del marchio — la STESSA immagine del mobile (owner 02/9:
 * TalosLineLoader, viewBox 96×16, tre nodi che si riempiono) — con l'etichetta
 * che il monolite aggiorna (`run-activity-label`) e i secondi trascorsi.
 */
export function creaAttesa({ etichetta = 'Sto pensando…' } = {}, opzioni = {}) {
  const documentObj = opzioni.document || globalThis.document;
  const blocco = el(documentObj, 'div', 'talos-stack talos-waiting');
  blocco.setAttribute('role', 'status');
  blocco.setAttribute('aria-live', 'polite');
  blocco.setAttribute('aria-atomic', 'true');
  const riga = el(documentObj, 'div', 'talos-waiting__row');
  const svg = documentObj.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'talos-line-loader');
  svg.setAttribute('viewBox', '0 0 96 16');
  svg.setAttribute('width', '48');
  svg.setAttribute('height', '8');
  svg.setAttribute('aria-hidden', 'true');
  for (const classe of ['talos-line-loader-track', 'talos-line-loader-sweep']) {
    const linea = documentObj.createElementNS(SVG_NS, 'line');
    linea.setAttribute('class', classe);
    linea.setAttribute('x1', '4'); linea.setAttribute('y1', '8'); linea.setAttribute('x2', '92'); linea.setAttribute('y2', '8');
    svg.append(linea);
  }
  for (const cx of [16, 48, 80]) {
    const nodo = documentObj.createElementNS(SVG_NS, 'circle');
    nodo.setAttribute('class', 'talos-line-loader-node');
    nodo.setAttribute('cx', String(cx)); nodo.setAttribute('cy', '8'); nodo.setAttribute('r', '4');
    svg.append(nodo);
  }
  const label = el(documentObj, 'span', 'talos-waiting__label run-activity-label', etichetta);
  const elapsed = el(documentObj, 'span', 'talos-mono talos-muted run-activity-elapsed', '0s');
  elapsed.setAttribute('aria-hidden', 'true');
  riga.append(svg, label, elapsed);
  /*
   * ⛔ 06/9, owner: «skeleton loader non ci deve essere». Le tre barre grigie promettevano una forma
   * (tre righe di testo) che la risposta vera non ha, e con «riduci le animazioni» acceso non luccicavano
   * nemmeno: erano tre rettangoli fermi. Resta la riga onesta: segnavia, cosa sta facendo, da quanto.
   */
  blocco.append(riga);
  return { blocco, label, elapsed };
}
