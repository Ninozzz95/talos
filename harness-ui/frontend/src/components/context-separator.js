import { t, tn, linguaCorrenteDiT } from './lingua.js';
import { percheRipiego } from './compattazione-legacy.js';

/*
 * 25/09/2026 — la riga sorella «Riassunto automatico non riuscito», dall'evento `context.compaction.cooling` del motore
 * (ticket della CLI: un riassunto rifiutato veniva richiesto a ogni passo, pagato, e a schermo non c'era niente). Una
 * riga per lavoro fallito (chiave `cooling` + jobId: la rigiocata non la raddoppia). L'orario è ASSOLUTO («dopo le
 * 14:32»), non «fra 1 min»: la riga resta nella storia e una durata relativa mentirebbe alla prima ricarica.
 */
const COOLING = 'context.compaction.cooling';
function identity(event) {
  if (event?.kind === COOLING) return event.sessionId && event.jobId ? JSON.stringify([event.sessionId, 'cooling', event.jobId]) : null;
  if (!event?.sessionId || !event.versionId || (event.state && event.state !== 'committed')) return null;
  return JSON.stringify([event.sessionId, event.versionId]);
}
function testoPausa(event, english) {
  const volte = Number.isSafeInteger(event.payload?.attempts) && event.payload.attempts > 1 ? event.payload.attempts : 1;
  const quando = Date.parse(event.payload?.retryAfter);
  const ora = Number.isFinite(quando) ? new Date(quando).toLocaleTimeString(english ? 'en-GB' : 'it-IT', { hour: '2-digit', minute: '2-digit' }) : null;
  return t('chat.context.separator.summaryFailed', { tentativi: volte > 1 ? t('chat.context.separator.timesInARow', { n: volte }) : '', riprova: ora ? t('chat.context.separator.nextTry', { ora }) : '' });
}

/**
 * The separator's words, without the DOM: `null` when the event draws no separator (a usage measurement, a version that is not
 * committed). R-04 (17/10/2026): the transcript export says the same words as the chat, from here.
 */
export function etichettaSeparatoreContesto(event) {
  if (!identity(event)) return null;
  if (event.kind === COOLING) return testoPausa(event, linguaCorrenteDiT() === 'en');
  return event.kind?.includes('restor') ? t('chat.context.separator.restored') : t('chat.context.separator.compacted');
}

/** Persistence belongs to the event/version archive. Replaying it reconstructs the separator. */
export function creaSeparatoreContesto(event, { document: doc = globalThis.document, onOpen } = {}) {
  const key = identity(event); if (!key) return null;
  const cooling = event.kind === COOLING;
  const row = doc.createElement('div'); row.className = cooling ? 'talos-context-separator talos-context-separator--cooling' : 'talos-context-separator';
  row.dataset.contextSeparator = key; row.dataset.contextSession = event.sessionId;
  if (event.versionId) row.dataset.contextVersion = event.versionId;
  row.setAttribute('role', 'group');
  const label = etichettaSeparatoreContesto(event);
  row.setAttribute('aria-label', label);
  const text = doc.createElement('span'); text.textContent = label; row.append(text);
  if (onOpen) { const button = doc.createElement('button'); button.type = 'button'; button.className = 'talos-button talos-button--ghost talos-button--sm'; button.textContent = t('chat.context.separator.view'); button.addEventListener('click', () => onOpen(event)); row.append(button); }
  return row;
}

/*
 * B1 parte 3, review della sessione desktop (10/10/2026): nelle chat lunghe la finestra della rigiocata STACCA i turni vecchi, e
 * con loro i separatori che li precedono o che stanno dentro. Un evento successivo della stessa compattazione (l'annullo, la
 * fine) non trovava il separatore nella colonna e ne creava un DOPPIONE in fondo. `staccato(chiave)` (lo passa `app.js`) dà il
 * separatore staccato: si aggiorna sul posto e torna da solo col suo turno, senza essere riappeso.
 */
export function aggiornaSeparatoreContesto(container, events = [], { sessionId, staccato = null, ...options } = {}) {
  if (!container || !sessionId) return [];
  const current = new Map();
  for (const node of container.querySelectorAll('[data-context-separator]')) {
    if (node.dataset.contextSession !== sessionId) node.remove();
    else current.set(node.dataset.contextSeparator, node);
  }
  const nodes = [];
  for (const event of events) {
    if (event.sessionId !== sessionId) continue;
    const key = identity(event); if (!key) continue;
    let node = current.get(key);
    if (!node && typeof staccato === 'function') { const altrove = staccato(key); if (altrove?.dataset.contextSession === sessionId) { node = altrove; current.set(key, node); } }
    if (!node) { node = creaSeparatoreContesto(event, options); container.append(node); current.set(key, node); }
    if (!nodes.includes(node)) nodes.push(node);
  }
  return nodes;
}

/*
 * ⭐ F5 (onda 2), 24/09/2026 — LA RIGA PERSISTENTE PER IL LEGACY: «Conversazione riassunta · X → Y token».
 * Stesso separatore del trial, ricostruito dagli eventi persistiti alla rigiocata (decisione 3: la storia
 * grezza resta, il record «compattazione» si proietta) — e per questo la chiave è l'`at` del record: la
 * stessa compattazione rigiocata due volte (riconnessione SSE, ricarica) resta UNA riga.
 * Tre stati: `riassunta` (con menu «⋯»: Annulla · Mostra cosa è stato riassunto), `annullata` (niente
 * più azioni: non c'è più niente da disfare), `non-riuscita` (col motivo del kernel).
 * ⛔ Le azioni stanno SOLO nel menu, nessun pulsante «Annulla» in riga (owner 13/09: riga e menu, intersezione
 *   vuota); il menu si apre dal «⋯» e col tasto destro sulla riga. Chi apre il menu è `app.js`
 *   (`apriMenuAzioni`, lo stesso delle sessioni): qui si passa `onMenu({ voce, ancoraEl, x, y })`.
 * Una riga «provvisoria» (`at` nullo) è quella disegnata dalla risposta della rotta manuale, che oggi non
 * porta né numeri né record: quando arriva l'evento `fase:'fine'` con il record, la riga si COMPLETA invece
 * di raddoppiare.
 */
const chiaveLegacy = (sessionId, at) => JSON.stringify(['legacy', sessionId, at]);

export function aggiornaSeparatoreLegacy(container, voce, { sessionId, document: doc = container?.ownerDocument ?? globalThis.document, onMenu, testo, inserisci = null, staccato = null } = {}) {
  if (!container || !sessionId || !voce) return null;
  const at = typeof voce.at === 'string' && voce.at ? voce.at : null;
  const chiave = at ? chiaveLegacy(sessionId, at) : null;
  let row = null;
  // ⛔ Attributo SUO (`data-compattazione-riga`), non `data-context-separator`: `aggiornaSeparatoreContesto` qui sopra
  //   cerca quell'attributo e tocca ciò che trova (stessa trappola della barra, `context-progress.js`).
  for (const nodo of container.querySelectorAll('[data-compattazione-riga]')) {
    if (nodo.dataset.contextSession !== sessionId) { nodo.remove(); continue; }
    if (chiave && nodo.dataset.compattazioneRiga === chiave) row = nodo;
  }
  // B1 parte 3 (vedi sopra `aggiornaSeparatoreContesto`): la riga staccata con un turno vecchio si aggiorna dov'è, senza doppione
  if (!row && chiave && typeof staccato === 'function') { const altrove = staccato(chiave); if (altrove?.dataset.contextSession === sessionId) row = altrove; }
  // la riga provvisoria della rotta manuale si completa con il primo record che arriva
  const provvisorie = () => [...container.querySelectorAll('[data-compattazione-riga][data-compattazione-provvisoria]')].filter((n) => n.dataset.contextSession === sessionId);
  if (!row && at) row = provvisorie().at(-1) ?? null;
  if (!row && !at && voce.nodo?.isConnected) row = voce.nodo;
  if (!row) {
    row = doc.createElement('div'); row.className = 'talos-context-separator talos-context-separator--legacy';
    row.dataset.contextSession = sessionId; row.setAttribute('role', 'group');
    const span = doc.createElement('span'); span.dataset.compattazioneTesto = ''; span.setAttribute('role', 'status');
    row.append(span);
    row.addEventListener('contextmenu', (event) => {
      if (row.dataset.compattazioneLegacy !== 'riassunta' || !row.dataset.compattazioneAt || typeof onMenu !== 'function') return;
      if (row.dataset.compattazioneAnnullabile === 'no' && !row.dataset.compattazioneRiassunto) return; // niente da fare: il menu nativo resta
      event.preventDefault(); event.stopPropagation();
      onMenu({ voce: leggiVoceLegacy(row), ancoraEl: null, x: event.clientX, y: event.clientY, focusElement: row.querySelector('[data-compattazione-menu]') });
    });
    // `inserisci` decide dove va la prima volta (dentro il turno aperto, o in coda alla colonna); i doppioni si cercano sulla colonna intera
    if (typeof inserisci === 'function') inserisci(row); else container.append(row);
  }
  row.dataset.compattazioneRiga = chiave ?? `provvisoria:${sessionId}`;
  if (at) { row.dataset.compattazioneAt = at; delete row.dataset.compattazioneProvvisoria; } else { row.dataset.compattazioneProvvisoria = ''; delete row.dataset.compattazioneAt; }
  row.dataset.compattazioneLegacy = voce.stato ?? 'riassunta';
  row.dataset.compattazioneAperta = voce.inVolo ? '1' : '';
  if (typeof voce.riassunto === 'string' && voce.riassunto) row.dataset.compattazioneRiassunto = voce.riassunto; else if (voce.riassunto === null) delete row.dataset.compattazioneRiassunto;
  if (voce.tokenPrima != null) row.dataset.compattazioneTokenPrima = String(voce.tokenPrima);
  if (voce.tokenDopo != null) row.dataset.compattazioneTokenDopo = String(voce.tokenDopo);
  /* 26/09: la compattazione manuale non ha un record da riavvolgere — un «Annulla» che non può funzionare non si offre. */
  if (voce.annullabile === false) row.dataset.compattazioneAnnullabile = 'no'; else if (voce.annullabile === true) delete row.dataset.compattazioneAnnullabile;
  /* B1 (owner 21/10/2026): un riassunto fatto SENZA il modello lo ricorda la riga stessa (la ragione, o vuoto se ignota), così l'annullo e
     la rigiocata ridicono le stesse parole; `ripiego:false` lo toglie, assente lo lascia com'era. */
  if (voce.ripiego === true) row.dataset.compattazioneRipiego = typeof voce.ragione === 'string' ? voce.ragione : ''; else if (voce.ripiego === false) delete row.dataset.compattazioneRipiego;
  const frase = typeof testo === 'string' ? testo : '';
  const span = row.querySelector('[data-compattazione-testo]');
  if (span.textContent !== frase) span.textContent = frase;
  row.setAttribute('aria-label', frase);
  // il perché per esteso del ripiego sta nel `title` (mockup B1: la riga resta una), solo finché il riassunto è vivo
  const perche = row.dataset.compattazioneLegacy === 'riassunta' && row.dataset.compattazioneRipiego !== undefined ? percheRipiego(row.dataset.compattazioneRipiego) : '';
  if (perche) { if (span.title !== perche) span.title = perche; } else span.removeAttribute('title');
  // il menu esiste solo finché c'è qualcosa da fare: un riassunto vivo, col suo record
  const conMenu = row.dataset.compattazioneLegacy === 'riassunta' && Boolean(at) && typeof onMenu === 'function'
    && (row.dataset.compattazioneAnnullabile !== 'no' || Boolean(row.dataset.compattazioneRiassunto));
  let menu = row.querySelector('[data-compattazione-menu]');
  if (conMenu && !menu) {
    menu = doc.createElement('button'); menu.type = 'button'; menu.className = 'talos-icon-button'; menu.dataset.compattazioneMenu = '';
    menu.setAttribute('aria-haspopup', 'menu'); menu.setAttribute('aria-expanded', 'false'); menu.title = t('chat.context.separator.menu');
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'i'); svg.setAttribute('aria-hidden', 'true');
    const use = doc.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', '#i-more'); svg.append(use); menu.append(svg);
    menu.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); onMenu({ voce: leggiVoceLegacy(row), ancoraEl: menu, focusElement: menu, fuoco: event.detail === 0 }); });
    row.append(menu);
  } else if (!conMenu && menu) { menu.remove(); menu = null; row.querySelector('[data-compattazione-riassunto]')?.remove(); }
  if (menu) menu.setAttribute('aria-label', t('chat.context.separator.menuLabel'));
  return row;
}

/** Ciò che il menu deve sapere della riga, letto dal DOM: la riga è la fonte, non una copia in memoria. */
export function leggiVoceLegacy(row) {
  return {
    at: row.dataset.compattazioneAt || null, stato: row.dataset.compattazioneLegacy || null, inVolo: row.dataset.compattazioneAperta === '1',
    riassunto: row.dataset.compattazioneRiassunto || null, nodo: row, annullabile: row.dataset.compattazioneAnnullabile !== 'no',
    ripiego: row.dataset.compattazioneRipiego !== undefined, ragione: row.dataset.compattazioneRipiego || null,
    tokenPrima: row.dataset.compattazioneTokenPrima ? Number(row.dataset.compattazioneTokenPrima) : null,
    tokenDopo: row.dataset.compattazioneTokenDopo ? Number(row.dataset.compattazioneTokenDopo) : null,
  };
}

/** «Mostra cosa è stato riassunto»: il riassunto si apre SOTTO la riga (Claude Code: la sintesi non invade la chat), e si richiude. */
export function alternaRiassuntoLegacy(row, { document: doc = row?.ownerDocument ?? globalThis.document } = {}) {
  if (!row) return false;
  const aperto = row.querySelector('[data-compattazione-riassunto]');
  if (aperto) { aperto.remove(); return false; }
  const testo = row.dataset.compattazioneRiassunto;
  if (!testo) return false;
  const blocco = doc.createElement('div'); blocco.dataset.compattazioneRiassunto = ''; blocco.setAttribute('role', 'region');
  blocco.setAttribute('aria-label', t('chat.context.separator.summaryLabel'));
  blocco.textContent = testo;
  row.append(blocco);
  return true;
}

/*
 * ⭐ L1 1.3 (owner 26/10/2026: «più user friendly, che non blocca il flusso», bozzetto approvato «Sì, così») — LA FINESTRA CHE CRESCE.
 *   Dall'evento durevole `talos.finestra-locale` (`agent-service.mjs`): il motore locale di questo PC è stato riaperto con una
 *   finestra più grande e la conversazione è andata avanti. Una riga sola, lo STESSO separatore di «Contesto compattato», e un
 *   «Dettagli» che apre UNA riga sotto (modello, da quanto a quanto, memoria in più, «la scelta resta»): semplice a primo sguardo,
 *   il resto a richiesta. Chiave = `at` dell'evento: la rigiocata della storia non la raddoppia.
 */
export const EVENTO_FINESTRA_LOCALE = 'talos.finestra-locale';

const conNumeri = (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString(linguaCorrenteDiT() === 'en' ? 'en-US' : 'it-IT') : '?');
/** «24,576 tokens» / «24.576 token»: il numero con la sua unità, al plurale giusto (LINGUA-7). */
export const conToken = (n) => tn('chat.context.separator.tokensOne', 'chat.context.separator.tokensMany', Number(n), { n: conNumeri(n) });

/** Le parole della riga e dei dettagli, senza DOM (anche per l'esportazione della conversazione). */
export function testiFinestraLocale(valore) {
  const gb = Number(valore?.memoriaInPiu) > 0 ? Math.max(0.1, Math.round(Number(valore.memoriaInPiu) / 1e8) / 10) : null;
  return {
    riga: t('chat.context.separator.windowEnlarged', { finestra: conToken(valore?.dopo) }),
    dettagli: t('chat.context.separator.windowDetails', {
      modello: typeof valore?.modello === 'string' && valore.modello ? valore.modello : '?',
      dopo: conToken(valore?.dopo), prima: conToken(valore?.prima),
      memoria: gb === null ? '' : t('chat.context.separator.windowMemory', { gb: gb.toLocaleString(linguaCorrenteDiT() === 'en' ? 'en-US' : 'it-IT') }),
    }),
  };
}

export function aggiornaRigaFinestraLocale(container, valore, { sessionId, document: doc = container?.ownerDocument ?? globalThis.document, inserisci = null } = {}) {
  if (!container || !sessionId || !valore || !Number.isFinite(Number(valore.dopo))) return null;
  const chiave = `${sessionId}|${typeof valore.at === 'string' ? valore.at : String(valore.dopo)}`;
  for (const nodo of container.querySelectorAll('[data-finestra-locale]')) if (nodo.dataset.finestraLocale === chiave) return nodo;
  const testi = testiFinestraLocale(valore);
  const gruppo = doc.createElement('div');
  gruppo.className = 'talos-window-note';
  gruppo.dataset.finestraLocale = chiave; gruppo.dataset.contextSession = sessionId;
  const row = doc.createElement('div');
  row.className = 'talos-context-separator talos-context-separator--window';
  row.setAttribute('role', 'group'); row.setAttribute('aria-label', testi.riga);
  const span = doc.createElement('span'); span.textContent = testi.riga;
  const dettagli = doc.createElement('p');
  dettagli.className = 'talos-window-note__details'; dettagli.textContent = testi.dettagli; dettagli.hidden = true;
  dettagli.id = `finestra-${Math.abs([...chiave].reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)).toString(36)}`;
  const button = doc.createElement('button');
  button.type = 'button'; button.className = 'talos-button talos-button--ghost talos-button--sm';
  button.textContent = t('chat.context.separator.details');
  button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-controls', dettagli.id);
  button.addEventListener('click', () => {
    const apri = dettagli.hidden;
    dettagli.hidden = !apri;
    button.setAttribute('aria-expanded', String(apri));
    button.textContent = t(apri ? 'chat.context.separator.hide' : 'chat.context.separator.details');
  });
  row.append(span, button);
  gruppo.append(row, dettagli);
  if (typeof inserisci === 'function') inserisci(gruppo); else container.append(gruppo);
  return gruppo;
}
