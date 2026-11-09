/*
 * NotificationPanel — il pannello delle notifiche del PC (`#pannelloNotifiche`).
 *
 * ⭐ 31/10/2026 (FE-002, FE-042, FE-043; consegna della Frontend `CONSEGNA-NOTIFICHE-PC-2026-10-31.md`, decisioni dell'owner del
 *   30/10 e del 31/10): le voci arrivano dal REGISTRO del server (`GET /api/v1/notifications`, avviso `talos.notifica`), non più
 *   ricalcolate dall'elenco delle sessioni; il «visto» sta nel server e vale ovunque (`POST /seen`, `/seen-all`).
 *   · due schede, «Da fare» (approvazione e domanda non risolte) e «Tutto» (ogni voce, per giorno); si apre sempre su «Da fare»;
 *   · la riga dice prima LA COSA (il nome della sessione o dell'automazione), sotto cosa è successo e il dato, a destra l'ora;
 *   · il numero sulla campanella è solo `totaleDaFare`; le azioni della persona e i giri delle automazioni stanno solo in «Tutto»;
 *   · «Da fare» vuoto: «Niente da fare», la frase sotto e le ultime tre voci.
 *
 * Ricerca 06/09/2026 (resta): pannello NON modale (W3C APG dialog-modal è per i modali; Carbon «Notification»), `role="dialog"`
 * senza `aria-modal`, Esc chiude e riporta il fuoco al campanello, all'apertura il fuoco va alla prima riga.
 * ⛔ Nodi costruiti a mano e testo sempre come `textContent`: il `dato` viene da un comando, un percorso o una risposta del modello.
 */

import { t as traduci, linguaCorrenteDiT } from './lingua.js';
import { parolaEsitoGiro } from './automazioni-v2.js';
import { oraCompatta } from './session-item.js';
import { scriviNomeConNumero } from './nome-con-numero.js';
import { testoErroreServer } from './errori.js';
import { fraseDellaNotificaImpostazioni } from './impostazioni-dalla-chat.js'; // fase 8 (02/11/2026): la riga del fatto `impostazioni`

/** I fatti che aspettano la persona: solo loro entrano in «Da fare» e nel numero (contratto, `FATTI_CHE_ASPETTANO` del server). */
export const FATTI_DA_FARE = Object.freeze(new Set(['approvazione', 'domanda']));
/** I fatti che fanno partire la notifica di sistema (contratto, «Avviso di sistema»): mai `azione-persona`. */
export const FATTI_CHE_AVVISANO = Object.freeze(new Set(['approvazione', 'domanda', 'fine', 'interrotta', 'errore', 'giro-finito', 'giro-fallito', 'giro-saltato']));
/* Revisione avversaria della fase 8, REV8-07 (01/11/2026 notte): i fatti che il registro scrive già ma la cui riga non è ancora disegnata.
   Senza, cadevano nella riga generica «sconosciuto» col campanello, una per ogni cambio. Restano fuori dall'elenco finché la riga non c'è.
   02/11/2026: `impostazioni` (D6) ha la sua riga dal bozzetto chiuso (FE-055) ed esce di qui: entra in «Tutto», mai in «Da fare» né nel
   numero della campanella (`FATTI_DA_FARE`), e non fa partire la notifica di sistema (`FATTI_CHE_AVVISANO`). */
export const FATTI_SENZA_RIGA = Object.freeze(new Set());

/* L'`azione` di un permesso → la frase che la carta della chat dice già (consegna, sezione 2). Un'azione nuova cade sulla frase
   generica, mai sul codice. */
const FRASI_DEL_PERMESSO = Object.freeze({
  scrivi: 'app.approval.wantsWriteFile',
  file_edit: 'app.approval.wantsEditFile',
  leggi: 'app.approval.wantsReadFile',
  elenca: 'app.approval.wantsListFolder',
  shell: 'app.approval.wantsRunCommand',
  document_create: 'sezioni.notifications.fact.createDocument', // revisione 31/10: quella della carta vuole {formato}, che il registro non porta
  prova: 'app.approval.wantsRunTests',
});
const ESITO_DEL_GIRO = Object.freeze({ 'giro-finito': 'finita', 'giro-fallito': 'fallita', 'giro-saltato': 'saltata' });
const GENERI_A_SPAZIATURA_FISSA = new Set(['file', 'comando', 'indirizzo', 'percorso']);
const maiuscola = (testo) => (testo ? testo.charAt(0).toUpperCase() + testo.slice(1) : testo);
const testoDel = (dato) => (dato && typeof dato.valore === 'string' && dato.valore.trim() ? dato.valore : '');
/* revisione 31/10, ritocco 5: «Ha una domanda:» senza niente dopo finisce con i due punti a vuoto */
const senzaDuePunti = (frase) => String(frase ?? '').replace(/\s*:\s*$/u, '');

/**
 * Cosa dice la riga di una voce, senza toccare il DOM: la frase, il dato da mostrare sotto (o null), il glifo, il tono.
 * `traccia`: una riga più chiara, senza pallino (le azioni della persona). Un fatto sconosciuto ha la riga generica: mai il codice.
 */
export function fraseDellaVoce(voce) {
  const dato = voce?.dato && typeof voce.dato === 'object' ? voce.dato : null;
  const conDato = (frase, glifo, extra = {}) => (testoDel(dato) ? { frase, dato, glifo, tono: null, traccia: false, ...extra }
    : { frase: senzaDuePunti(frase), dato: null, glifo, tono: null, traccia: false, ...extra });
  const daVedere = voce?.stato?.visto !== true;
  switch (voce?.fatto) {
    case 'approvazione': {
      if (voce.azione === 'research_start') {
        /* il segnaposto della frase si riempie col dato, che non si ripete sotto (Frontend 31/10) */
        const frase = testoDel(dato) ? traduci('app.approval.wantsDeepResearchOf', { domanda: testoDel(dato) }) : senzaDuePunti(traduci('app.approval.wantsDeepResearch')).replace(/\.$/u, '');
        return { frase, dato: null, glifo: 'i-shield-question', tono: daVedere ? 'accento' : null, traccia: false };
      }
      const chiave = Object.hasOwn(FRASI_DEL_PERMESSO, voce.azione) ? FRASI_DEL_PERMESSO[voce.azione] : null; // D-7: `constructor` non è una frase
      return conDato(chiave ? traduci(chiave) : maiuscola(traduci('sezioni.notifications.state.approval')), 'i-shield-question', { tono: daVedere ? 'accento' : null });
    }
    case 'domanda':
      return conDato(traduci('sezioni.notifications.fact.question'), 'i-question', { tono: daVedere ? 'accento' : null });
    case 'fine':
      return { frase: traduci('sezioni.notifications.fact.finished'), dato: null, glifo: 'i-circle-check', tono: null, traccia: false };
    case 'interrotta':
      return { frase: traduci('sezioni.board.state.error'), dato: null, glifo: 'i-play', tono: null, traccia: false };
    case 'errore': {
      /* il codice mai nella frase: la frase del dizionario per quel codice, se c'è */
      const codice = dato?.genere === 'codice-errore' ? testoDel(dato) : '';
      const spiegato = codice ? testoErroreServer({ code: codice }) : null;
      const perche = spiegato?.title || spiegato?.message || '';
      const frase = perche ? `${traduci('sezioni.board.state.error')}: ${perche}` : traduci('sezioni.board.state.error');
      return { frase, dato: null, glifo: 'i-alert', tono: 'pericolo', traccia: false };
    }
    case 'giro-finito':
    case 'giro-fallito':
    case 'giro-saltato': {
      const motivo = dato?.genere === 'codice-errore' ? testoDel(dato) : null;
      const esito = parolaEsitoGiro({ esito: ESITO_DEL_GIRO[voce.fatto], motivo });
      const riassunto = dato?.genere === 'testo' && testoDel(dato) ? dato : null;
      /* foto dal vivo 31/10: «Fatto Ho controllato…» si leggeva come una frase sola; col riassunto l'esito prende i due punti */
      const frase = riassunto && !/:\s*$/u.test(esito) ? `${esito}:` : esito;
      return { frase, dato: riassunto, glifo: voce.fatto === 'giro-finito' ? 'i-check' : voce.fatto === 'giro-fallito' ? 'i-alert' : 'i-quadrato', tono: null, traccia: false };
    }
    case 'azione-persona': {
      /* `modificato` (CLI e Frontend 31/10): la tua modifica di una carta; il server non porta il dato (era la proposta del modello) */
      const chiavi = { consentito: 'allowed', negato: 'denied', risposto: 'replied', saltato: 'skipped', modificato: 'changed' };
      const chiave = Object.hasOwn(chiavi, voce.azione) ? chiavi[voce.azione] : null;
      if (!chiave) return conDato(traduci('sezioni.notifications.fact.unknown'), 'i-bell', { traccia: true });
      return conDato(traduci(`sezioni.notifications.fact.${chiave}`), voce.azione === 'negato' ? 'i-ban' : 'i-check', { traccia: true });
    }
    case 'impostazioni': {
      /* Fase 8, D6 (bozzetto chiuso FE-055): «Ha cambiato N impostazioni:» e i NOMI delle voci (mai le chiavi né il dato grezzo del
         registro, che porta `chiave: "prima" → "dopo"` per chi non ha il catalogo); glifo delle Impostazioni, nessun tono */
      const detta = fraseDellaNotificaImpostazioni(voce);
      if (!detta) return { frase: traduci('sezioni.notifications.fact.unknown'), dato: null, glifo: 'i-bell', tono: null, traccia: false };
      return detta.nomi ? { frase: detta.frase, dato: { genere: 'testo', valore: detta.nomi }, glifo: 'i-settings', tono: null, traccia: false }
        : { frase: senzaDuePunti(detta.frase), dato: null, glifo: 'i-settings', tono: null, traccia: false };
    }
    default:
      return { frase: traduci('sezioni.notifications.fact.unknown'), dato: null, glifo: 'i-bell', tono: null, traccia: false };
  }
}

/** Il nome accessibile del campanello: dice QUANTE cose aspettano la persona. */
export function nomeCampanella(quante) {
  if (quante === 0) return traduci('sezioni.notifications.bell.none');
  return quante === 1 ? traduci('sezioni.notifications.bell.one') : traduci('sezioni.notifications.bell.many', { n: quante });
}

function el(documentObj, tag, classe, testo) {
  const n = documentObj.createElement(tag);
  if (classe) n.className = classe;
  if (testo != null) n.textContent = testo;
  return n;
}
function icona(documentObj, nome) {
  const svg = documentObj.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'i'); svg.setAttribute('aria-hidden', 'true');
  const use = documentObj.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${nome}`); svg.appendChild(use);
  return svg;
}

/* Revisione dei blocchi 10-12, D-2: `seq` è il cursore del registro e avanza a ogni «visto»; la persona legge il tempo. A parità d'istante decide
   `seq`; un istante rotto va in fondo. */
const quando = (v) => { const t = Date.parse(v?.istante); return Number.isNaN(t) ? -Infinity : t; };
const dallaPiuRecente = (a, b) => (quando(a) === quando(b) ? b.seq - a.seq : quando(b) - quando(a));

/** Le voci di «Da fare», dalla più recente. */
export function vociDaFare(voci) {
  return (voci || []).filter((v) => FATTI_DA_FARE.has(v?.fatto) && v?.stato?.risolto !== true).sort(dallaPiuRecente);
}
/** Tutte le voci, dalla più recente (il server le manda dalla più vecchia). */
export function vociInOrdine(voci) {
  const ordinate = (voci || []).filter((v) => !FATTI_SENZA_RIGA.has(v?.fatto)).sort(dallaPiuRecente); // REV8-07
  /*
   * D23 del collaudo del 02/11 (foto `n1-campanella`): due «Finished» alle 20:59 della stessa chat. Erano due giri veri, chiusi a 7 s (registro del 4174, righe 47-48),
   *   e le due righe si leggevano uguali: stessa chat, stessa parola, stesso minuto. Gemelle così diventano una riga, la più recente, come una notifica del browser
   *   con lo stesso `tag` sostituisce la vecchia (MDN «Notification: tag»). Decisione 62 (03/11): la stessa chat è una riga a qualsiasi distanza; un'altra chat o un altro tipo restano righe a sé (NOTIF-PC-D23).
   */
  /* N9 della seconda revisione: la riga tenuta porta con sé le gemelle (`gemelle`, i loro id) e resta «non vista» finché una di loro lo è. È una copia: il registro non cambia */
  const tenute = new Map();
  const risultato = [];
  for (const v of ordinate) {
    const istante = quando(v);
    /* G1 della quarta revisione: senza l'id della cosa non c'è «la stessa chat» (la chiave sarebbe `sessione\0undefined` per tutte): la voce tiene la sua riga */
    const senzaId = v?.cosa?.id === undefined || v.cosa.id === null || v.cosa.id === '';
    if (v?.fatto !== 'fine' || !Number.isFinite(istante) || senzaId) { risultato.push(v); continue; }
    /* Decisione 62 dell'owner (03/11/2026): una sola «Finished» per chat, la più recente, a qualsiasi distanza di tempo (prima solo nello stesso minuto) */
    const gemella = `${v.cosa?.tipo}\u0000${v.cosa?.id}`;
    if (!tenute.has(gemella)) { tenute.set(gemella, risultato.length); risultato.push(v); continue; }
    const tenuta = tenute.get(gemella);
    const prima = risultato[tenuta];
    risultato[tenuta] = { ...prima, gemelle: [...(prima.gemelle ?? []), v.id],
      stato: { ...prima.stato, visto: prima.stato?.visto === true && v.stato?.visto === true } };
  }
  return risultato;
}

/** Gli id da segnare «visti» toccando una riga: la sua voce e le gemelle che nasconde (N9). */
export function daSegnareViste(voce) {
  return [voce.id, ...(Array.isArray(voce.gemelle) ? voce.gemelle : [])];
}

/** Se c'è ancora qualcosa da segnare «visto», guardando TUTTE le voci con una riga e non solo quelle che si vedono dopo l'unione delle gemelle (N9). */
export function ceAncoraDaSegnare(voci) {
  return (voci || []).some((v) => !FATTI_SENZA_RIGA.has(v?.fatto) && v?.stato?.visto !== true);
}

/** L'etichetta del giorno di un istante: «Oggi», «Ieri», poi la data. */
export function giornoDi(istante, adesso = new Date()) {
  const d = new Date(istante);
  if (Number.isNaN(d.getTime())) return '';
  const giorno = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const differenza = Math.round((giorno(adesso) - giorno(d)) / 86_400_000);
  if (differenza <= 0) return traduci('sezioni.notifications.day.today');
  if (differenza === 1) return traduci('sezioni.notifications.day.yesterday');
  return d.toLocaleDateString(linguaCorrenteDiT() === 'en' ? 'en-GB' : 'it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
}

/*
 * Giro 4 (02/11/2026, parole del Frontend): la COSA di una voce `impostazioni` senza conversazione (un cambio arrivato dal dispositivo:
 *   `cosa: { tipo: 'impostazioni', nome: '' }`, notifiche-scrittori.mjs) è l'app, quindi il titolo dice «Impostazioni» / «Settings» (la
 *   parola che l'area ha già, `appSettings.command.settings`), non «Sessione». «Sessione» resta per una voce che ha una conversazione.
 */
const senzaConversazione = (voce) => voce?.fatto === 'impostazioni' && voce?.cosa?.tipo !== 'sessione';
const titoloDellaVoce = (voce, ripiego) => (senzaConversazione(voce) ? traduci('appSettings.command.settings') : voce?.cosa?.nome || traduci(ripiego));

/** Una riga «Prima la cosa»: un `button` che apre la cosa; titolo, frase e dato come testo, l'ora come nella barra di sinistra. */
export function creaRigaNotifica(voce, { document: documentObj = globalThis.document, adesso = new Date() } = {}) {
  const detto = fraseDellaVoce(voce);
  const riga = el(documentObj, 'button', `talos-list-row${detto.traccia ? ' talos-list-row--traccia' : ''}`);
  riga.type = 'button'; riga.dataset.c = 'ListRow';
  riga.dataset.notifica = String(voce?.fatto ?? '');
  riga.dataset.notificaId = String(voce?.id ?? '');
  if (detto.tono) riga.dataset.tono = detto.tono;
  const ic = el(documentObj, 'span', 'talos-list-row__icon'); ic.appendChild(icona(documentObj, detto.glifo));
  const testo = el(documentObj, 'span', 'talos-list-row__text');
  const titolo = el(documentObj, 'span', 'talos-list-row__title');
  scriviNomeConNumero(titolo, titoloDellaVoce(voce, 'sezioni.notifications.sessionFallback'), documentObj);
  const sotto = el(documentObj, 'span', 'talos-list-row__sub talos-notifica__sotto');
  sotto.append(el(documentObj, 'span', 'talos-notifica__frase', detto.frase));
  if (detto.dato) {
    const dato = el(documentObj, 'span', `talos-notifica__dato${GENERI_A_SPAZIATURA_FISSA.has(detto.dato.genere) ? ' talos-mono' : ''}`, detto.dato.valore);
    dato.dataset.notificaDato = detto.dato.genere;
    sotto.append(documentObj.createTextNode(' '), dato);
  }
  testo.append(titolo, sotto);
  const ora = el(documentObj, 'span', 'talos-list-row__aside talos-muted', oraCompatta(voce?.istante, adesso));
  riga.append(ic, testo, ora);
  return riga;
}

/**
 * D-8 (31/10/2026): «Segna tutte» manda un avviso per voce, e ogni avviso ridisegnava il pannello. Il primo si disegna subito, così una
 * notifica sola non aspetta; quelli dentro la finestra diventano un solo ridisegno alla sua fine, che ne apre un'altra.
 * @param {() => void} ridisegna
 * @returns {() => void}
 */
export function ridisegnoARaffica(ridisegna, { attesa = 100, aspetta = globalThis.setTimeout } = {}) {
  let aperta = false;
  let ancora = false;
  const apri = () => {
    aperta = true;
    aspetta(() => {
      aperta = false;
      if (!ancora) return;
      ancora = false;
      apri();
      ridisegna();
    }, attesa);
  };
  return () => {
    if (aperta) { ancora = true; return; }
    apri();
    ridisegna();
  };
}

/**
 * Riempie il pannello. `scheda`: 'da-fare' | 'tutto'. Torna i nodi a cui chi lo monta aggancia i gesti.
 * @returns {{ righe: Array<{nodo: HTMLButtonElement, voce: object}>, tutte: HTMLButtonElement|null, altre: HTMLButtonElement|null,
 *   linguette: HTMLButtonElement[] }}
 */
export function aggiornaPannelloNotifiche(pannello, { voci = [], totaleDaFare = 0, scheda = 'da-fare', mostrate = 50 } = {}, { document: documentObj = globalThis.document, adesso = new Date() } = {}) {
  if (!pannello) return { righe: [], tutte: null, altre: null, linguette: [] };
  const titolo = pannello.querySelector('#titoloNotifiche, h2');
  if (titolo) titolo.textContent = traduci('sezioni.notifications.title.none');
  /* ⛔ via tutto ciò che sta dopo la toolbar TRANNE il piede del consenso, che è fisso (trovato dal vivo il 06/09: senza questa
     eccezione «Avvisami anche fuori dalla finestra» spariva al primo ridisegno) */
  const toolbar = pannello.querySelector('.talos-toolbar');
  const sistema = pannello.querySelector('.talos-notification-panel__sistema');
  for (const n of [...pannello.children]) if (n !== toolbar && n !== sistema) n.remove();

  /* le due schede, coi pezzi delle altre schede dell'app (`talos-tabs`) */
  const schede = el(documentObj, 'div', 'talos-tabs talos-tabs--underline talos-notifica__schede');
  const lista = el(documentObj, 'div', 'talos-tabs__list');
  lista.setAttribute('role', 'tablist');
  lista.setAttribute('aria-label', traduci('sezioni.notifications.title.none'));
  const linguette = [['da-fare', totaleDaFare > 0 ? traduci('sezioni.notifications.tab.toDoCount', { n: totaleDaFare }) : traduci('sezioni.notifications.tab.toDo')],
    ['tutto', traduci('sezioni.notifications.tab.all')]].map(([id, etichetta]) => {
    const b = el(documentObj, 'button', 'talos-tabs__tab', etichetta);
    b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.notificaScheda = id;
    b.id = `notifiche-scheda-${id}`;
    b.setAttribute('aria-controls', 'notifiche-elenco');
    b.setAttribute('aria-selected', String(id === scheda));
    b.tabIndex = id === scheda ? 0 : -1;
    return b;
  });
  lista.append(...linguette);
  schede.append(lista);
  const elenco = el(documentObj, 'div', 'talos-notifica__elenco');
  elenco.id = 'notifiche-elenco';
  elenco.setAttribute('role', 'tabpanel');
  elenco.setAttribute('aria-labelledby', `notifiche-scheda-${scheda}`);
  pannello.append(schede, elenco);

  const righe = [];
  const metti = (voce) => { const nodo = creaRigaNotifica(voce, { document: documentObj, adesso }); elenco.append(nodo); righe.push({ nodo, voce }); };
  let tutte = null;
  let altre = null;
  if (scheda === 'da-fare') {
    const daFare = vociDaFare(voci);
    for (const voce of daFare) metti(voce);
    if (daFare.length === 0) {
      const vuoto = el(documentObj, 'div', 'talos-notifica__vuoto');
      vuoto.dataset.notificaVuoto = '';
      vuoto.append(el(documentObj, 'p', 'talos-notifica__vuoto-titolo', traduci('sezioni.notifications.fact.nothingToDo')),
        el(documentObj, 'p', 'talos-muted', traduci('sezioni.notifications.fact.nothingToDoSub')));
      elenco.append(vuoto);
      const ultime = vociInOrdine(voci).slice(0, 3);
      if (ultime.length > 0) {
        elenco.append(el(documentObj, 'p', 'talos-label talos-notifica__gruppo', traduci('sezioni.notifications.fact.lastThings')));
        for (const voce of ultime) metti(voce);
      }
    }
  } else {
    const ordinate = vociInOrdine(voci);
    let giornoPrima = null;
    for (const voce of ordinate.slice(0, mostrate)) {
      const giorno = giornoDi(voce.istante, adesso);
      /* un istante non valido non apre un gruppo con l'etichetta vuota: la voce resta nel gruppo di prima */
      if (giorno && giorno !== giornoPrima) { elenco.append(el(documentObj, 'p', 'talos-label talos-notifica__gruppo', giorno)); giornoPrima = giorno; }
      metti(voce);
    }
    if (ordinate.length > mostrate) {
      altre = el(documentObj, 'button', 'talos-button talos-button--ghost talos-button--sm', traduci('sezioni.notifications.showMore'));
      altre.type = 'button'; altre.dataset.azione = 'mostra-altre';
      elenco.append(altre);
    }
    if (ceAncoraDaSegnare(voci)) {
      tutte = el(documentObj, 'button', 'talos-button talos-button--ghost talos-button--sm');
      tutte.type = 'button'; tutte.dataset.azione = 'segna-tutte';
      tutte.append(icona(documentObj, 'i-check'), documentObj.createTextNode(` ${traduci('sezioni.notifications.markAllSeen')}`));
      pannello.append(tutte);
    }
    if (ordinate.length === 0) elenco.append(el(documentObj, 'p', 'talos-muted', traduci('sezioni.notifications.fact.nothingToDoSub')));
  }
  // il piede del consenso resta l'ULTIMA cosa del pannello
  if (sistema) pannello.append(sistema);
  return { righe, tutte, altre, linguette };
}

/**
 * «Altro» dopo le righe il cui testo non sta in due righe (consegna, FE-042): si misura dopo il disegno, e apre il testo nella riga.
 * Un `button` accanto alla riga, non dentro: la riga è già un `button`, e un bottone dentro un bottone non è HTML valido.
 */
export function mostraAltroDoveServe(righe, { document: documentObj = globalThis.document } = {}) {
  for (const { nodo } of righe) {
    const sotto = nodo.querySelector('.talos-notifica__sotto');
    if (!sotto || nodo.dataset.aperta === 'true' || sotto.scrollHeight <= sotto.clientHeight + 1) continue;
    const altro = el(documentObj, 'button', 'talos-button talos-button--ghost talos-button--sm talos-notifica__altro', traduci('sezioni.notifications.more'));
    altro.type = 'button'; altro.dataset.azione = 'altro';
    altro.setAttribute('aria-expanded', 'false');
    altro.addEventListener('click', () => { nodo.dataset.aperta = 'true'; nodo.focus(); altro.remove(); });
    nodo.after(altro);
  }
}

/** Le frecce sulle linguette, come le altre schede dell'app: ←/→ spostano e scelgono, Home/Fine vanno agli estremi. */
export function tastieraDelleLinguette(linguette, scegli) {
  linguette.forEach((b, i) => {
    b.addEventListener('keydown', (e) => {
      let j = null;
      if (e.key === 'ArrowRight') j = (i + 1) % linguette.length;
      else if (e.key === 'ArrowLeft') j = (i - 1 + linguette.length) % linguette.length;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = linguette.length - 1;
      if (j === null) return;
      e.preventDefault();
      scegli(linguette[j].dataset.notificaScheda, { fuoco: true });
    });
  });
}

/** Apre il pannello sotto il campanello; chiude con Esc, clic fuori, pulsante. Torna la funzione che chiude. */
export function apriPannelloNotifiche(pannello, campanella, { document: documentObj = globalThis.document, alChiuso = null } = {}) {
  if (!pannello || !campanella) return () => {};
  const r = campanella.getBoundingClientRect();
  pannello.hidden = false;
  const larghezza = pannello.getBoundingClientRect().width || 320;
  pannello.style.top = `${Math.round(r.bottom + 6)}px`;
  pannello.style.left = `${Math.round(Math.max(8, Math.min(r.left, (documentObj.defaultView?.innerWidth || 1440) - larghezza - 8)))}px`;
  campanella.setAttribute('aria-expanded', 'true');
  let chiuso = false;
  const chiudi = (fuoco = true) => {
    if (chiuso) return; chiuso = true;
    pannello.hidden = true;
    campanella.setAttribute('aria-expanded', 'false');
    documentObj.removeEventListener('keydown', suTasto, true);
    documentObj.removeEventListener('pointerdown', suPuntatore, true);
    if (fuoco) campanella.focus();
    alChiuso?.(); // D-9: chi ha aperto lo sa anche con Esc, clic fuori o X
  };
  const suTasto = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); chiudi(true); } };
  const suPuntatore = (e) => { if (!pannello.contains(e.target) && !campanella.contains(e.target)) chiudi(false); };
  documentObj.addEventListener('keydown', suTasto, true);
  documentObj.addEventListener('pointerdown', suPuntatore, true);
  pannello.querySelector('#chiudiNotifiche, [aria-label="Chiudi notifiche"]')?.addEventListener('click', () => chiudi(true), { once: true });
  (pannello.querySelector('.talos-notifica__elenco .talos-list-row') || pannello.querySelector('.talos-tabs__tab[aria-selected="true"]') || pannello.querySelector('#chiudiNotifiche'))?.focus();
  return chiudi;
}

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * G29 — LA NOTIFICA DI SISTEMA.
 *
 * ── Ricerca 06/09/2026, e i vincoli che ne sono usciti ──
 * · MDN, «Using the Notifications API» e `Notification.requestPermission()`: il permesso **si chiede solo da un gesto della
 *   persona** ⇒ il pulsante sta dentro il pannello, e lo preme chi vuole.
 * · Pushpad: il doppio consenso — prima un controllo nostro, poi quello del browser — non brucia il permesso.
 * ⭐ 31/10/2026 (consegna, sezione 3, corretta dalla revisione della Frontend): una voce del registro, una notifica sola per `id`.
 *   Finestra NASCOSTA: tutti i fatti che avvisano (prima la sessione aperta taceva anche così: il difetto di `app.js:9362`).
 *   Finestra VISIBILE: solo ciò che aspetta te (permessi e domande), e mai per la sessione che stai guardando. Mai `azione-persona`.
 */

/**
 * Le voci per cui mandare la notifica di sistema. Pura: decide, non manda.
 * @param {{permesso:string, visibile:boolean, sessioneGuardata?:string|null, voci?:object[], giaAvvisate?:Set|Array}} stato
 */
export function deveAvvisareFuoriDallaFinestra({ permesso, visibile, sessioneGuardata = null, voci = [], giaAvvisate = [] } = {}) {
  if (permesso !== 'granted') return [];
  const viste = giaAvvisate instanceof Set ? giaAvvisate : new Set(giaAvvisate || []);
  return (voci || []).filter((v) => typeof v?.id === 'string' && FATTI_CHE_AVVISANO.has(v.fatto) && v.stato?.risolto !== true && !viste.has(v.id)
    && (visibile !== true || (FATTI_DA_FARE.has(v.fatto) && !(sessioneGuardata && v.porta?.tipo === 'sessione' && v.porta.id === sessioneGuardata))));
}

/** Il testo di una notifica di sistema: titolo = il nome della cosa, corpo = la riga del pannello, `tag` = l'id della voce. */
export function testoNotificaSistema(voce) {
  const detto = fraseDellaVoce(voce);
  const corpo = detto.dato ? `${detto.frase} ${detto.dato.valore}` : senzaDuePunti(detto.frase);
  return { titolo: titoloDellaVoce(voce, 'sezioni.notifications.system.aSession'), corpo, tag: String(voce?.id ?? '') };
}

/** Cosa scrivere sotto il pulsante, secondo lo stato del permesso. */
export function statoConsensoNotifiche(permesso, supportato = true) {
  if (!supportato) return { testo: traduci('sezioni.notifications.consent.unsupported'), chiedibile: false };
  if (permesso === 'granted') return { testo: traduci('sezioni.notifications.consent.granted'), chiedibile: false };
  if (permesso === 'denied') return { testo: traduci('sezioni.notifications.consent.denied'), chiedibile: false };
  return { testo: traduci('sezioni.notifications.consent.askable'), chiedibile: true };
}
