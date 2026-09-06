/*
 * NotificationPanel — «Aspetta te»: il pannello del mockup (`#pannelloNotifiche`)
 * riempito dalle notifiche vere del monolite (`state.notifiche`: sessioni che
 * aspettano un'approvazione, hanno finito o si sono interrotte).
 *
 * 06/09, confronto con Hermes (T-17): il campanello apriva un menu legacy
 * `.notifications-menu` che nessun CSS disegnava più — esisteva nel DOM e non
 * si vedeva. Qui il markup è quello del mockup: toolbar con titolo e chiusura,
 * riga muta col conteggio, una `ListRow` per notifica, «Segna tutte come viste».
 *
 * Ricerca 06/09/2026: pannello NON modale (W3C APG dialog-modal è per i modali;
 * Carbon «Notification» accessibility: le notifiche persistenti si raccolgono in
 * un'area raggiungibile, il fuoco vi salta quando la si apre) — `role="dialog"`
 * senza `aria-modal`, Esc chiude e riporta il fuoco al campanello, all'apertura
 * il fuoco va alla prima riga (o alla chiusura se non ce ne sono).
 */

export const ETICHETTE_NOTIFICA = Object.freeze({
  approvazione: 'aspetta la tua approvazione',
  conclusa: 'ha finito',
  interrotta: 'si è interrotta',
});
export const GLIFI_NOTIFICA = Object.freeze({ approvazione: 'i-shield', conclusa: 'i-check', interrotta: 'i-stop' });

export function titoloNotifiche(quante) {
  return quante > 0 ? 'Aspetta te' : 'Notifiche';
}
export function sommarioNotifiche(quante) {
  if (quante === 0) return 'Nessuna notifica: nessun\'altra sessione chiede attenzione.';
  if (quante === 1) return 'Una richiesta da decidere.';
  return `${quante} cose aspettano te.`;
}
/** Il nome accessibile del campanello: dice QUANTE, come nel mockup («Notifiche: 1 cosa aspetta te»). */
export function nomeCampanella(quante) {
  if (quante === 0) return 'Notifiche: nessuna';
  return `Notifiche: ${quante === 1 ? '1 cosa aspetta' : `${quante} cose aspettano`} te`;
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

/**
 * Riempie il pannello del mockup. `notifiche` = [{ sessione, stato }] come nel monolite.
 * @returns {{ righe: HTMLButtonElement[], tutte: HTMLButtonElement|null }}
 */
export function aggiornaPannelloNotifiche(pannello, notifiche = [], { ora = () => '', document: documentObj = globalThis.document } = {}) {
  if (!pannello) return { righe: [], tutte: null };
  const titolo = pannello.querySelector('#titoloNotifiche, h2');
  if (titolo) titolo.textContent = titoloNotifiche(notifiche.length);
  /*
   * Via tutto ciò che sta dopo la toolbar (le righe demo del mockup o il giro
   * precedente) — ⛔ TRANNE il blocco del consenso alle notifiche di sistema,
   * che è un piede fisso e non una notifica. Trovato dal vivo il 06/09: senza
   * questa eccezione il pulsante «Avvisami anche fuori dalla finestra» spariva
   * al primo ridisegno, cioè sempre, perché il pannello si ridisegna a ogni
   * aggiornamento dell'elenco sessioni.
   */
  const toolbar = pannello.querySelector('.talos-toolbar');
  const sistema = pannello.querySelector('.talos-notification-panel__sistema');
  for (const n of [...pannello.children]) if (n !== toolbar && n !== sistema) n.remove();
  pannello.append(el(documentObj, 'p', 'talos-muted', sommarioNotifiche(notifiche.length)));
  const righe = [];
  for (const { sessione, stato } of notifiche) {
    const b = el(documentObj, 'button', 'talos-list-row');
    b.type = 'button'; b.dataset.c = 'ListRow'; b.dataset.notifica = stato;
    if (sessione?.sessionId) b.dataset.sessionId = sessione.sessionId;
    const ic = el(documentObj, 'span', 'talos-list-row__icon'); ic.appendChild(icona(documentObj, GLIFI_NOTIFICA[stato] || 'i-bell'));
    const testo = el(documentObj, 'span', 'talos-list-row__text');
    testo.append(
      el(documentObj, 'span', 'talos-list-row__title', sessione?.nome || sessione?.taskId || 'Sessione'),
      el(documentObj, 'span', 'talos-list-row__sub', [ETICHETTE_NOTIFICA[stato] || stato, ora(sessione)].filter(Boolean).join(' · ')),
    );
    b.append(ic, testo);
    pannello.appendChild(b);
    righe.push(b);
  }
  let tutte = null;
  if (notifiche.length > 0) {
    tutte = el(documentObj, 'button', 'talos-button talos-button--ghost talos-button--sm');
    tutte.type = 'button'; tutte.dataset.azione = 'segna-tutte';
    tutte.append(icona(documentObj, 'i-check'), documentObj.createTextNode(' Segna tutte come viste'));
    pannello.appendChild(tutte);
  }
  // il piede del consenso resta l'ULTIMA cosa del pannello, sotto le righe e sotto «Segna tutte»
  if (sistema) pannello.appendChild(sistema);
  return { righe, tutte };
}

/** Apre il pannello sotto il campanello; chiude con Esc, clic fuori, pulsante. Torna la funzione che chiude. */
export function apriPannelloNotifiche(pannello, campanella, { document: documentObj = globalThis.document } = {}) {
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
  };
  const suTasto = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); chiudi(true); } };
  const suPuntatore = (e) => { if (!pannello.contains(e.target) && !campanella.contains(e.target)) chiudi(false); };
  documentObj.addEventListener('keydown', suTasto, true);
  documentObj.addEventListener('pointerdown', suPuntatore, true);
  pannello.querySelector('#chiudiNotifiche, [aria-label="Chiudi notifiche"]')?.addEventListener('click', () => chiudi(true), { once: true });
  (pannello.querySelector('.talos-list-row') || pannello.querySelector('#chiudiNotifiche'))?.focus();
  return chiudi;
}

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * G29 — LA NOTIFICA DI SISTEMA.
 *
 * Decisione G22/G29: «Ciò che aspetta te si vede in TUTTI E TRE i modi:
 * contrassegno sulla sessione · pannello notifiche · **notifica di sistema**».
 * Dei tre, i primi due c'erano già (la riga della sessione dice «aspetta te»,
 * il pannello è quello qui sopra); la terza no.
 *
 * ── Ricerca 06/09/2026, e i vincoli che ne sono usciti ──
 * · MDN, «Using the Notifications API» e `Notification.requestPermission()`:
 *   il permesso **si chiede solo da un gesto della persona** — «browsers will
 *   explicitly disallow notification permission requests not triggered in
 *   response to a user gesture» (Firefox dalla 72). ⇒ NON si può chiedere
 *   all'avvio: il pulsante sta dentro il pannello, e lo preme chi vuole.
 * · Pushpad, «The notification prompt can only be triggered by a user gesture»:
 *   il doppio consenso — prima un controllo nostro, poi quello del browser —
 *   è la forma che non brucia il permesso (una volta negato, non si richiede).
 * · ⛔ E non si avvisa mai mentre la persona sta GUARDANDO la finestra: una
 *   notifica di sistema per una cosa già a schermo è solo rumore.
 */

/**
 * Se mandare o no la notifica di sistema. Pura: decide, non manda.
 * @param {{permesso:string, visibile:boolean, quante:number, giaAvvisate:Set|Array}} stato
 */
export function deveAvvisareFuoriDallaFinestra({ permesso, visibile, notifiche = [], giaAvvisate = [] } = {}) {
  if (permesso !== 'granted') return [];
  // ⛔ la finestra è sotto gli occhi: quello che aspetta si vede già nel pannello e sulla riga.
  if (visibile) return [];
  const viste = giaAvvisate instanceof Set ? giaAvvisate : new Set(giaAvvisate || []);
  return notifiche.filter((n) => n?.sessione?.sessionId && !viste.has(`${n.sessione.sessionId}:${n.stato}`));
}

/** Il testo di una notifica di sistema: titolo corto, corpo che dice cosa aspetta. */
export function testoNotificaSistema(notifica) {
  const nome = notifica?.sessione?.nome || notifica?.sessione?.taskId || 'Una sessione';
  const cosa = ETICHETTE_NOTIFICA?.[notifica?.stato] || 'chiede attenzione';
  return { titolo: 'TALOS · aspetta te', corpo: `${nome} — ${cosa}`, tag: `${notifica?.sessione?.sessionId}:${notifica?.stato}` };
}

/** Cosa scrivere sotto il pulsante, secondo lo stato del permesso. */
export function statoConsensoNotifiche(permesso, supportato = true) {
  if (!supportato) return { testo: 'Questo browser non manda notifiche di sistema.', chiedibile: false };
  if (permesso === 'granted') return { testo: 'Attive: TALOS avvisa solo quando non è in primo piano.', chiedibile: false };
  if (permesso === 'denied') return { testo: 'Negate nelle impostazioni del browser. Si riattivano da lì, non da qui.', chiedibile: false };
  return { testo: 'Solo quando TALOS non è in primo piano.', chiedibile: true };
}
