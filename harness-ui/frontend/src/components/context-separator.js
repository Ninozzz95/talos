import { t, tn, linguaCorrenteDiT } from './lingua.js';
import { percheDellaCatena, percheRipiego, testoRigaCompattazione } from './compattazione-legacy.js';
import { chiaveDelPerche, nomeCortoDelModello, oraDelLimite } from './motivi-compattazione.js';
import { fraseDelLavoro } from './frase-lavoro-contesto.js';

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
  const pausa = t('chat.context.separator.summaryFailed', { tentativi: volte > 1 ? t('chat.context.separator.timesInARow', { n: volte }) : '', riprova: ora ? t('chat.context.separator.nextTry', { ora }) : '' });
  return `${pausa}. ${cosaFareDopoLaPausa(event)}`;
}
/*
 * Pannello calmo, parte 2 (owner 06/11/2026 14:50): con la compattazione automatica accesa l'unico segno di un riassunto che non riesce
 * è questa riga, e deve dire cosa fare, mai numeri di token. Il codice è quello che il motore mette nell'evento (`engine.mjs:328`,
 * `payload.code`); la frase è quella della finestra del contesto (`fraseDelLavoro`), così chat e finestra dicono le stesse parole.
 * Un guasto generico non ripete «non riuscita»: resta «la conversazione è intera» e il rimedio. Hermes dice il guasto nella chat con la
 * sua causa (`run_agent.py:506`, `_emit_warning(f"⚠ Auxiliary {task} failed: {detail}")`), senza numeri.
 */
function fraseDellaPausa(event) {
  const code = typeof event.payload?.code === 'string' && event.payload.code ? event.payload.code : 'CTX_COMPACTION_FAILED';
  return { code, frase: fraseDelLavoro({ state: 'failed', error: { code } }) };
}
/* Revisore 06/11 (punto 5): la scheda Contesto dice la pausa con LA STESSA frase della chat (causa e rimedio compresi) e offre lo stesso
   «Scegli un altro modello» quando la frase lo chiede. `pausa` è quella che app.js tiene (`{ code, attempts, retryAfter }`). */
export function pausaComeInChat(pausa) {
  const event = { kind: COOLING, payload: { code: pausa?.code, attempts: pausa?.attempts, retryAfter: pausa?.retryAfter } };
  return { testo: testoPausa(event, linguaCorrenteDiT() === 'en'), scegli: fraseDellaPausa(event).frase?.scegli === true };
}
function cosaFareDopoLaPausa(event) {
  const { code, frase } = fraseDellaPausa(event);
  if (code === 'CTX_COMPACTION_FAILED' || !frase) return `${t('chat.context.jobError.intact')} ${t('chat.context.jobError.retry')}`;
  return frase.testo;
}

/**
 * The separator's words, without the DOM: `null` when the event draws no separator (a usage measurement, a version that is not
 * committed). R-04 (17/10/2026): the transcript export says the same words as the chat, from here.
 */
export function etichettaSeparatoreContesto(event) {
  if (!identity(event)) return null;
  if (event.kind === COOLING) return testoPausa(event, linguaCorrenteDiT() === 'en');
  if (event.kind?.includes('restor')) return t('chat.context.separator.restored');
  return firmaDellaRiserva(event) ?? t('chat.context.separator.compacted');
}
/* FE-053: la riga della riserva è la stessa sulle due strade. La firma c'è solo quando la riserva ha scritto (`payload.provenienza`); un nome vuoto non firma (revisione del Blocco 22, F11) */
function firmaDellaRiserva(event, nomi = nomeCortoDelModello) {
  const firma = event.payload?.provenienza;
  const nome = firma?.dallaRiserva === true && typeof firma.riassuntoDi === 'string' ? nomi(firma.riassuntoDi) : '';
  return nome ? t('chat.context.row.byBackup', { modello: nome }) : null;
}
/** Il `title` della riga firmata: perché lo scelto non ha potuto, e chi ha scritto. */
const percheDellaFirma = (event, nomi = nomeCortoDelModello) => percheDellaCatena({ nonDisponibile: event.payload?.provenienza?.nonDisponibile ?? null, dallaRiserva: event.payload?.provenienza?.dallaRiserva === true, nomi });

/*
 * Revisione del Blocco 22, F13: l'avviso «il modello non si può usare» parte dentro il tentativo (`talosHarness.desktop-hotfix.mjs:1323`, `session-registry.mjs:6383`) e la riga
 * coi numeri dopo, a compattazione finita: arrivando in quest'ordine l'avviso finiva sopra. Il bozzetto lo vuole sotto (`pc.js:112`, «Riga a parte, sotto quella dei numeri»).
 * Il kernel non si tocca: l'avviso deve restare durevole anche se la compattazione muore. Qui, appena la riga nasce, gli avvisi attaccati sopra di lei le passano sotto, nel loro
 * ordine. Solo quelli attaccati: un altro blocco in mezzo vuol dire un'altra storia. Limite dichiarato: un separatore del motore va in coda alla colonna, e un avviso rimasto
 * dentro un turno aperto non gli è attaccato.
 */
function avvisiSottoLaRiga(riga) {
  const sopra = [];
  for (let nodo = riga.previousElementSibling; nodo?.dataset?.compattazioneInutilizzabile !== undefined; nodo = nodo.previousElementSibling) sopra.push(nodo);
  for (const avviso of sopra) riga.after(avviso);
}

/** Persistence belongs to the event/version archive. Replaying it reconstructs the separator. */
export function creaSeparatoreContesto(event, { document: doc = globalThis.document, onOpen, onChoose } = {}) {
  const key = identity(event); if (!key) return null;
  const cooling = event.kind === COOLING;
  const row = doc.createElement('div'); row.className = cooling ? 'talos-context-separator talos-context-separator--cooling' : 'talos-context-separator';
  row.dataset.contextSeparator = key; row.dataset.contextSession = event.sessionId;
  if (event.versionId) row.dataset.contextVersion = event.versionId;
  row.setAttribute('role', 'group');
  const label = etichettaSeparatoreContesto(event);
  row.setAttribute('aria-label', label);
  const text = doc.createElement('span'); text.textContent = label; row.append(text);
  const percheFirma = percheDellaFirma(event);
  if (percheFirma) text.title = percheFirma;
  if (onOpen) { const button = doc.createElement('button'); button.type = 'button'; button.className = 'talos-button talos-button--ghost talos-button--sm'; button.textContent = t('chat.context.separator.view'); button.addEventListener('click', () => onOpen(event)); row.append(button); }
  /* parte 2: quando il rimedio è un altro modello per i riassunti, un tasto «Scegli un altro modello» (coordinatore 06/11: «Scegli un altro» da solo era ambiguo) */
  if (cooling && typeof onChoose === 'function' && fraseDellaPausa(event).frase?.scegli === true) {
    const scegli = doc.createElement('button'); scegli.type = 'button'; scegli.className = 'talos-button talos-button--ghost talos-button--sm';
    scegli.dataset.contextChoose = ''; scegli.textContent = t('chat.context.separator.chooseModel');
    scegli.addEventListener('click', () => onChoose(event)); row.append(scegli);
  }
  return row;
}

/*
 * B1 parte 3, review della sessione desktop (10/10/2026): nelle chat lunghe la finestra della rigiocata STACCA i turni vecchi, e
 * con loro i separatori che li precedono o che stanno dentro. Un evento successivo della stessa compattazione (l'annullo, la
 * fine) non trovava il separatore nella colonna e ne creava un DOPPIONE in fondo. `staccato(chiave)` (lo passa `app.js`) dà il
 * separatore staccato: si aggiorna sul posto e torna da solo col suo turno, senza essere riappeso.
 */
/*
 * Contratto C5 «mai aspettare» (CLI e desktop, 27/10/2026: «one line per compaction… when the model's version replaces it, the same
 *   separator updates»), sulla strada del MOTORE del contesto — quella di serie delle conversazioni nuove. Il rapido nasce dalla
 *   compattazione semplice dopo «non pronto» (riga legacy, ragione 'in-arrivo'); il riassunto del motore arriva dopo come VERSIONE sua.
 * Correlazione per LAVORO (concordata con la CLI il 28/10/2026): il «non pronto» nomina il lavoro che scrive il riassunto
 *   (`details.jobId`) e la riga del rapido nato da lì lo ricorda (`data-compattazione-lavoro`). Un evento che chiude un lavoro del
 *   motore — la sua versione compattata, o la sua pausa (`context.compaction.cooling`) — decide le righe che aspettano:
 *   · la versione di QUEL lavoro migliora la riga che lo aspetta: «Summary improved by the model» (il motore non dà i numeri), col «Vedi»
 *     del motore e senza l'annullo della compattazione semplice, che qui non varrebbe. Più righe sullo stesso lavoro: si migliora
 *     l'ultima, le altre smettono di promettere;
 *   · la pausa di quel lavoro: il riassunto non arriverà, le sue righe smettono di promettere;
 *   · la VERSIONE di un lavoro diverso, committata dopo che la riga è nata: il motore non tiene mai due lavori in volo, quindi quello
 *     atteso è finito senza versione e la riga smette di promettere. Un evento più vecchio della riga (consegnato in ritardo dalla coda
 *     del motore) non la tocca: un'ora mancante o uguale nemmeno — una riga lasciata in attesa costa meno di una chiusa per sbaglio.
 *     ⛔ Solo un COMMIT, mai la pausa di un altro lavoro (CLI, 28/10/2026, condizione 1 dell'aggancio): la riga può essere passata a un
 *     lavoro nuovo (il primo ha ceduto a un giro, il secondo tentativo ha un altro id), e il fallimento di quello vecchio non la riguarda.
 *   Una riga senza lavoro (la compattazione semplice da sola, che si migliora con `migliora`), un ripristino, una riga di un'altra
 *   ragione o già decisa non si toccano. Senza la riga del rapido (né in pagina né staccata con un turno vecchio) non si unisce niente.
 *   Limite dichiarato: un lavoro annullato alla chiusura del servizio non manda un evento suo, e la riga resta in attesa finché un altro
 *   lavoro non si chiude. L'ordine è quello del giornale: lo stesso dal vivo e alla rigiocata.
 */
const VERSIONE_COMPATTATA = 'context.version.committed';
const ora = (x) => { const n = Date.parse(x); return Number.isFinite(n) ? n : null; };
function rapidiInAttesa(container, sessionId, staccati) {
  const righe = new Set(container.querySelectorAll('[data-compattazione-riga]'));
  if (typeof staccati === 'function') for (const n of staccati() ?? []) if (n?.dataset?.compattazioneRiga !== undefined) righe.add(n);
  return [...righe].filter((n) => n.dataset.contextSession === sessionId && n.dataset.compattazioneRipiego === 'in-arrivo' && Boolean(n.dataset.compattazioneLavoro)
    && n.dataset.compattazioneMigliorata === undefined && n.dataset.contextSeparator === undefined)
    .sort((a, b) => (ora(a.dataset.compattazioneAt) ?? 0) - (ora(b.dataset.compattazioneAt) ?? 0));
}
function promuoviRapido(row, event, key, { document: doc = row.ownerDocument ?? globalThis.document, onOpen, nomi } = {}) {
  row.dataset.contextSeparator = key;
  row.dataset.contextVersion = event.versionId;
  row.dataset.compattazioneMigliorata = '';
  delete row.dataset.compattazioneRipiego;
  row.dataset.compattazioneAnnullabile = 'no';
  delete row.dataset.compattazioneRiassunto;
  row.querySelector('[data-compattazione-menu]')?.remove();
  /* Revisione del Blocco 22, F2: quando ha scritto la riserva la riga lo dice col suo perché, come sulla strada semplice e nel trascritto. «Migliorata dal modello» sarebbe falso */
  const frase = firmaDellaRiserva(event, nomi) ?? testoRigaCompattazione({ stato: 'riassunta', migliorata: true });
  const perche = percheDellaFirma(event, nomi);
  const span = row.querySelector('[data-compattazione-testo]');
  if (span) { span.textContent = frase; if (perche) span.title = perche; else span.removeAttribute('title'); }
  row.setAttribute('aria-label', frase);
  if (typeof onOpen === 'function' && !row.querySelector('[data-context-apri]')) {
    const button = doc.createElement('button'); button.type = 'button'; button.className = 'talos-button talos-button--ghost talos-button--sm';
    button.dataset.contextApri = ''; button.textContent = t('chat.context.separator.view');
    button.addEventListener('click', () => onOpen(event));
    row.append(button);
  }
  return row;
}

export function aggiornaSeparatoreContesto(container, events = [], { sessionId, staccato = null, staccati = null, legacy = null, ...options } = {}) {
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
    const lavoro = (event.kind === VERSIONE_COMPATTATA || event.kind === COOLING) && typeof event.jobId === 'string' && event.jobId ? event.jobId : null;
    if (lavoro) {
      const attese = rapidiInAttesa(container, sessionId, staccati);
      // una riconnessione rimanda la versione già unita: la riga c'è (`node`), le altre righe dello stesso lavoro si richiudono e basta
      const migliorata = !node && event.kind === VERSIONE_COMPATTATA ? attese.filter((r) => r.dataset.compattazioneLavoro === lavoro).at(-1) ?? null : null;
      const quando = ora(event.createdAt);
      for (const r of attese) {
        if (r === migliorata) continue;
        const nata = ora(r.dataset.compattazioneAt);
        const versioneDiUnAltro = event.kind === VERSIONE_COMPATTATA && quando !== null && nata !== null && quando > nata;
        if (r.dataset.compattazioneLavoro === lavoro || versioneDiUnAltro) smettiDiPromettere(container, r, { ...(legacy ?? {}), sessionId });
      }
      if (migliorata) { node = promuoviRapido(migliorata, event, key, options); current.set(key, node); }
    }
    if (!node) { node = creaSeparatoreContesto(event, options); container.append(node); avvisiSottoLaRiga(node); current.set(key, node); }
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

export function aggiornaSeparatoreLegacy(container, voce, { sessionId, document: doc = container?.ownerDocument ?? globalThis.document, onMenu, testo, inserisci = null, staccato = null, nomi = nomeCortoDelModello } = {}) {
  if (!container || !sessionId || !voce) return null;
  const at = typeof voce.at === 'string' && voce.at ? voce.at : null;
  const chiave = at ? chiaveLegacy(sessionId, at) : null;
  let row = null, giaSostituita = null;
  // ⛔ Attributo SUO (`data-compattazione-riga`), non `data-context-separator`: `aggiornaSeparatoreContesto` qui sopra
  //   cerca quell'attributo e tocca ciò che trova (stessa trappola della barra, `context-progress.js`).
  for (const nodo of container.querySelectorAll('[data-compattazione-riga]')) {
    if (nodo.dataset.contextSession !== sessionId) { nodo.remove(); continue; }
    if (chiave && nodo.dataset.compattazioneRiga === chiave) row = nodo;
    else if (at && !voce.migliora && nodo.dataset.compattazioneSostituita === at) giaSostituita = nodo;
  }
  /* un evento VECCHIO del rapido (una riconnessione che rimanda tutto) quando la sua riga è già diventata quella del modello: la riga
     resta com'è, niente doppione e niente ritorno a «rapido» */
  if (!row && giaSostituita) return giaSostituita;
  // B1 parte 3 (vedi sopra `aggiornaSeparatoreContesto`): la riga staccata con un turno vecchio si aggiorna dov'è, senza doppione
  if (!row && chiave && typeof staccato === 'function') { const altrove = staccato(chiave); if (altrove?.dataset.contextSession === sessionId) row = altrove; }
  /* «Mai aspettare» (owner 27/10/2026 notte, contratto C5): il riassunto del modello che prende il posto del rapido porta l'`at` del
     rapido (`voce.migliora`). La riga è la STESSA: si riprende quella del rapido e le si dà la chiave nuova, così l'annullo riguarda il
     riassunto del modello e la rigiocata (rapido, poi migliorato) lascia una riga sola. Un `migliora` che non trova la sua riga ne
     disegna una nuova, come sempre. */
  if (!row && chiave && typeof voce.migliora === 'string' && voce.migliora) {
    const vecchia = chiaveLegacy(sessionId, voce.migliora);
    row = [...container.querySelectorAll('[data-compattazione-riga]')].find((n) => n.dataset.compattazioneRiga === vecchia) ?? null;
    if (!row && typeof staccato === 'function') { const altrove = staccato(vecchia); if (altrove?.dataset.contextSession === sessionId) row = altrove; }
  }
  if (row && row.dataset.contextSeparator !== undefined) return row; // è diventata la riga del motore (vedi `promuoviRapido`)
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
    avvisiSottoLaRiga(row);
  }
  if (typeof voce.migliora === 'string' && voce.migliora && row.dataset.compattazioneAt === voce.migliora) row.dataset.compattazioneSostituita = voce.migliora;
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
  /* il lavoro del motore che scrive il riassunto atteso (contratto con la CLI, 28/10/2026, vedi `rapidiInAttesa`): assente lo lascia com'era */
  if (typeof voce.lavoroDelMotore === 'string' && voce.lavoroDelMotore) row.dataset.compattazioneLavoro = voce.lavoroDelMotore;
  // il riassunto del modello che ha preso il posto del rapido: lo ricorda la riga, così annullo e rigiocata ridicono «migliorato»
  if ((typeof voce.migliora === 'string' && voce.migliora) || voce.migliorata === true) row.dataset.compattazioneMigliorata = ''; else if (voce.migliorata === false) delete row.dataset.compattazioneMigliorata;
  /* FE-053: chi non ha potuto scrivere e chi ha scritto: li ricorda la riga, così annullo e rigiocata ridicono le stesse parole */
  if (voce.nonDisponibile || voce.dallaRiserva === true) row.dataset.compattazioneCatena = JSON.stringify({ nonDisponibile: voce.nonDisponibile ?? null, dallaRiserva: voce.dallaRiserva === true, riassuntoDi: voce.riassuntoDi ?? null });
  const frase = typeof testo === 'string' ? testo : '';
  const span = row.querySelector('[data-compattazione-testo]');
  if (span.textContent !== frase) span.textContent = frase;
  row.setAttribute('aria-label', frase);
  // il perché per esteso del ripiego sta nel `title` (mockup B1: la riga resta una), solo finché il riassunto è vivo
  const catena = catenaDellaRiga(row);
  const inArrivo = row.dataset.compattazioneRipiego === 'in-arrivo';
  const vivaOFallita = row.dataset.compattazioneLegacy === 'riassunta' || row.dataset.compattazioneLegacy === 'non-riuscita';
  const percheCatena = vivaOFallita && !inArrivo ? percheDellaCatena({ ...catena, compattata: row.dataset.compattazioneLegacy === 'riassunta', nomi }) : null;
  const perche = percheCatena ?? (row.dataset.compattazioneLegacy === 'riassunta' && row.dataset.compattazioneRipiego !== undefined ? percheRipiego(row.dataset.compattazioneRipiego) : '');
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

/**
 * «Non arriva» (contratto con la CLI, 28/10/2026): la riga del rapido diceva che il riassunto del modello avrebbe preso il suo posto; non
 * arriverà. Smette di promettere: «Compacted without the model · …» col perché generico — le parole della riga del ripiego, già esistenti.
 * Solo la riga del rapido ancora in attesa: una già migliorata, o di un'altra ragione, non si tocca. Torna la riga cambiata, o `null`.
 */
export function rapidoNonArriva(container, at, opzioni = {}) {
  const { sessionId } = opzioni;
  if (!container || !sessionId || typeof at !== 'string' || !at) return null;
  const chiave = chiaveLegacy(sessionId, at);
  let row = [...container.querySelectorAll('[data-compattazione-riga]')].find((n) => n.dataset.compattazioneRiga === chiave) ?? null;
  if (!row && typeof opzioni.staccato === 'function') { const altrove = opzioni.staccato(chiave); if (altrove?.dataset.contextSession === sessionId) row = altrove; }
  return smettiDiPromettere(container, row, opzioni);
}
/**
 * P4 (owner 28/10/2026; condizioni della CLI): la riga del rapido si lega al lavoro del motore che scrive il suo riassunto a fine giro.
 * Vince l'ULTIMO legame (il primo tentativo può aver ceduto a un giro, il secondo ha un altro id); una riga che non aspetta più (chiusa,
 * migliorata, diventata separatore del motore) resta com'è; senza la riga — in pagina o staccata con un turno vecchio — niente.
 */
export function legaRapidoAlLavoro(container, at, jobId, opzioni = {}) {
  const { sessionId } = opzioni;
  if (!container || !sessionId || typeof at !== 'string' || !at || typeof jobId !== 'string' || !jobId) return null;
  const chiave = chiaveLegacy(sessionId, at);
  let row = [...container.querySelectorAll('[data-compattazione-riga]')].find((n) => n.dataset.compattazioneRiga === chiave) ?? null;
  if (!row && typeof opzioni.staccato === 'function') { const altrove = opzioni.staccato(chiave); if (altrove?.dataset.contextSession === sessionId) row = altrove; }
  // solo una riga che aspetta ancora: chiusa o migliorata (`promuoviRapido`, `smettiDiPromettere`) non è più «in arrivo»
  if (!row || row.dataset.contextSession !== sessionId || row.dataset.compattazioneRipiego !== 'in-arrivo') return null;
  row.dataset.compattazioneLavoro = jobId;
  return row;
}
function smettiDiPromettere(container, row, opzioni) {
  const at = row?.dataset.compattazioneAt;
  if (!row || !at || row.dataset.compattazioneRipiego !== 'in-arrivo' || row.dataset.compattazioneMigliorata !== undefined) return null;
  const numero = (v) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
  const voce = { at, stato: row.dataset.compattazioneLegacy || 'riassunta', ripiego: true, ragione: null,
    tokenPrima: numero(row.dataset.compattazioneTokenPrima), tokenDopo: numero(row.dataset.compattazioneTokenDopo) };
  // la riga è già in mano: anche staccata con un turno vecchio si aggiorna dov'è, senza un doppione in fondo
  const proprio = row.dataset.compattazioneRiga;
  const staccato = (chiave) => (chiave === proprio ? row : typeof opzioni.staccato === 'function' ? opzioni.staccato(chiave) : null);
  return aggiornaSeparatoreLegacy(container, voce, { ...opzioni, staccato, testo: testoRigaCompattazione({ stato: voce.stato, tokenPrima: voce.tokenPrima, tokenDopo: voce.tokenDopo, ripiego: true, ragione: null }) });
}

/**
 * «Gli originali restano disponibili» è vero solo se l'ultima compattazione riuscita di questa conversazione si può annullare (revisione del 30/10, con Mobile e
 * Frontend): le righe della via manuale prima del 22/10 portano `annullabile:false` e i messaggi che hanno riassunto non tornano. Senza compattazioni non è stato
 * tolto niente: vero. Si legge dalle righe, come il menu.
 */
export function originaliRecuperabili(container, sessionId) {
  if (!container?.querySelectorAll || !sessionId) return true;
  const ultima = [...container.querySelectorAll('[data-compattazione-riga]')].filter((n) => n.dataset.contextSession === sessionId && n.dataset.compattazioneLegacy === 'riassunta').at(-1);
  return !ultima || ultima.dataset.compattazioneAnnullabile !== 'no';
}

function catenaDellaRiga(row) {
  try { return JSON.parse(row.dataset.compattazioneCatena ?? '{}'); } catch { return {}; }
}

/** Ciò che il menu deve sapere della riga, letto dal DOM: la riga è la fonte, non una copia in memoria. */
export function leggiVoceLegacy(row) {
  return {
    ...catenaDellaRiga(row),
    at: row.dataset.compattazioneAt || null, stato: row.dataset.compattazioneLegacy || null, inVolo: row.dataset.compattazioneAperta === '1',
    riassunto: row.dataset.compattazioneRiassunto || null, nodo: row, annullabile: row.dataset.compattazioneAnnullabile !== 'no',
    ripiego: row.dataset.compattazioneRipiego !== undefined, ragione: row.dataset.compattazioneRipiego || null,
    migliorata: row.dataset.compattazioneMigliorata !== undefined,
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

/*
 * FE-053 (owner 01/11/2026): la riga fissa quando il modello dei riassunti non si può usare, una per evento: «Scegli un altro» solo se l'aveva scelto la persona, e con
 * `ruolo: 'riserva'` porta alla scelta della riserva. Stessa riga delle compattazioni, a parte, senza numeri. Il perché sta nel `title`.
 */
/** Le parole della riga e il suo perché, senza DOM: le stesse nel trascritto (revisione del Blocco 22, F9). */
export function testiModelloInutilizzabile(valore, nomi = nomeCortoDelModello) {
  const nome = nomi(valore.modello);
  return { riga: t('chat.context.row.modelNotAvailable', { modello: nome }), perche: t(chiaveDelPerche(valore), { modello: nome, ora: oraDelLimite(valore.finoAlle) }) };
}

export function aggiornaRigaModelloInutilizzabile(container, valore, { sessionId, document: doc = container?.ownerDocument ?? globalThis.document, inserisci = null, nomi = nomeCortoDelModello, onScegli = null } = {}) {
  if (!container || !sessionId || typeof valore?.modello !== 'string' || !valore.modello) return null;
  const chiave = `${sessionId}|${valore.at ?? ''}|${valore.modello}`;
  for (const nodo of container.querySelectorAll('[data-compattazione-inutilizzabile]')) if (nodo.dataset.compattazioneInutilizzabile === chiave) return nodo;
  const row = doc.createElement('div');
  row.className = 'talos-context-separator talos-context-separator--legacy';
  row.setAttribute('role', 'group');
  row.dataset.compattazioneInutilizzabile = chiave; row.dataset.contextSession = sessionId;
  const testi = testiModelloInutilizzabile(valore, nomi);
  const span = doc.createElement('span');
  span.textContent = testi.riga;
  span.title = testi.perche;
  row.setAttribute('aria-label', span.textContent);
  row.append(span);
  if (valore.scelto === 'persona' && typeof onScegli === 'function') {
    const tasto = doc.createElement('button');
    tasto.type = 'button'; tasto.className = 'talos-button talos-button--ghost talos-button--sm';
    tasto.textContent = t('varie.compaction.card.chooseAnother');
    tasto.addEventListener('click', () => onScegli(valore.ruolo === 'riserva' ? 'riserva' : 'modello'));
    row.append(tasto);
  }
  if (typeof inserisci === 'function') inserisci(row); else container.append(row);
  return row;
}

/*
 * FE-050 (disegno approvato dall'owner, 01/11/2026): il router non ha caricato il modello e l'ha preso il motore di oggi. Lo STESSO
 *   separatore, una riga sola e nessun dettaglio. Chiave = `at` dell'evento: la rigiocata della storia non la raddoppia.
 */
export const EVENTO_RIPIEGO_LOCALE = 'talos.ripiego-locale';

export function aggiornaRigaRipiegoLocale(container, valore, { sessionId, document: doc = container?.ownerDocument ?? globalThis.document, inserisci = null } = {}) {
  if (!container || !sessionId || !valore) return null;
  const chiave = `${sessionId}|${typeof valore.at === 'string' ? valore.at : ''}`;
  for (const nodo of container.querySelectorAll('[data-ripiego-locale]')) if (nodo.dataset.ripiegoLocale === chiave) return nodo;
  const gruppo = doc.createElement('div');
  gruppo.className = 'talos-window-note';
  gruppo.dataset.ripiegoLocale = chiave; gruppo.dataset.contextSession = sessionId;
  const row = doc.createElement('div');
  row.className = 'talos-context-separator talos-context-separator--window';
  row.setAttribute('role', 'status');
  const span = doc.createElement('span');
  span.textContent = t('server.runtime.notice.routerFallback');
  row.append(span);
  gruppo.append(row);
  if (typeof inserisci === 'function') inserisci(gruppo); else container.append(gruppo);
  return gruppo;
}

/*
 * Decisione 116 C (owner 04/11/2026): la riga QUIETA dell'accesso a ChatGPT (`talos.accesso-chatgpt`, durevole) — rinnovato in silenzio,
 *   ripreso dopo un rifiuto, accesso rifatto, ChatGPT di nuovo raggiungibile. Lo STESSO separatore del ripiego, una riga sola, nessun
 *   tasto; la frase dice se manda il messaggio della persona (`allInvio`). Chiave = `at`: la rigiocata della storia non la raddoppia.
 */
export const EVENTO_ACCESSO_CHATGPT = 'talos.accesso-chatgpt';

const FRASI_ACCESSO_CHATGPT = Object.freeze({
  rinnovato: ['chat.chatgptAccess.renewed', 'chat.chatgptAccess.renewed'],
  ripreso: ['chat.chatgptAccess.resumed', 'chat.chatgptAccess.resumed'],
  rientrato: ['chat.chatgptAccess.signedInAgain', 'chat.chatgptAccess.signedInAgainSending'],
  raggiunto: ['chat.chatgptAccess.reachedAgain', 'chat.chatgptAccess.reachedAgainSending'],
});

/** La frase della riga quieta, o `null` per un esito che questa versione non conosce (un lettore vecchio ignora ciò che non sa). */
export function testoRigaAccessoChatgpt(valore) {
  const frasi = Object.hasOwn(FRASI_ACCESSO_CHATGPT, valore?.esito ?? '') ? FRASI_ACCESSO_CHATGPT[valore.esito] : null;
  return frasi ? t(frasi[valore.allInvio === true ? 1 : 0]) : null;
}

export function aggiornaRigaAccessoChatgpt(container, valore, { sessionId, document: doc = container?.ownerDocument ?? globalThis.document, inserisci = null } = {}) {
  if (!container || !sessionId || !valore) return null;
  const testo = testoRigaAccessoChatgpt(valore);
  if (!testo) return null;
  const chiave = `${sessionId}|${typeof valore.at === 'string' ? valore.at : ''}`;
  for (const nodo of container.querySelectorAll('[data-accesso-chatgpt]')) if (nodo.dataset.accessoChatgpt === chiave) return nodo;
  const gruppo = doc.createElement('div');
  gruppo.className = 'talos-window-note';
  gruppo.dataset.accessoChatgpt = chiave; gruppo.dataset.contextSession = sessionId;
  const row = doc.createElement('div');
  row.className = 'talos-context-separator talos-context-separator--window';
  row.setAttribute('role', 'status');
  const span = doc.createElement('span');
  span.textContent = testo;
  row.append(span);
  gruppo.append(row);
  if (typeof inserisci === 'function') inserisci(gruppo); else container.append(gruppo);
  return gruppo;
}

/*
 * 01/11/2026, la scheda che rallenta da sola (#26663; forma `FORMA-PC-SVEGLIO-E-SCHEDA-LENTA`, frasi e posto del Frontend): lo STESSO
 *   separatore della finestra allargata, sotto la risposta che l'ha fatta scattare; nessun avviso a comparsa e nessun tasto, perché TALOS
 *   non può riavviare il PC. Il resto nel `title`. Numeri interi, in token al secondo. Chiave = `dalle`: la rigiocata non la raddoppia.
 */
export const EVENTO_SCHEDA_LENTA = 'talos.scheda-lenta';

export function testiSchedaLenta(valore) {
  const intero = (n) => (Number.isFinite(Number(n)) ? Math.round(Number(n)) : '?');
  return {
    /* LINGUA-7 (rossa del blocco 24, 01/11/2026): il plurale segue il numero — «1 token per second», mai «1 tokens» */
    riga: tn('chat.context.separator.cardSlowOne', 'chat.context.separator.cardSlowMany', intero(valore?.adesso), { adesso: intero(valore?.adesso), migliore: intero(valore?.migliore) }),
    dettagli: tn('chat.context.separator.cardSlowDetailsOne', 'chat.context.separator.cardSlowDetailsMany', intero(valore?.migliore), { modello: valore?.modello || '?', scheda: valore?.scheda || '?', versione: valore?.versione || '?', migliore: intero(valore?.migliore) }),
  };
}

export function aggiornaRigaSchedaLenta(container, valore, { sessionId, document: doc = container?.ownerDocument ?? globalThis.document, inserisci = null } = {}) {
  if (!container || !sessionId || !valore || !Number.isFinite(Number(valore.adesso)) || !Number.isFinite(Number(valore.migliore))) return null;
  const chiave = `${sessionId}|${typeof valore.dalle === 'string' ? valore.dalle : ''}`;
  for (const nodo of container.querySelectorAll('[data-scheda-lenta]')) if (nodo.dataset.schedaLenta === chiave) return nodo;
  const testi = testiSchedaLenta(valore);
  const gruppo = doc.createElement('div');
  gruppo.className = 'talos-window-note';
  gruppo.dataset.schedaLenta = chiave; gruppo.dataset.contextSession = sessionId;
  const row = doc.createElement('div');
  row.className = 'talos-context-separator talos-context-separator--window';
  row.setAttribute('role', 'status');
  row.title = testi.dettagli;
  const span = doc.createElement('span');
  span.textContent = testi.riga;
  row.append(span);
  gruppo.append(row);
  if (typeof inserisci === 'function') inserisci(gruppo); else container.append(gruppo);
  return gruppo;
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
