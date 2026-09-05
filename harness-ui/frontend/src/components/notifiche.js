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
  // via tutto ciò che sta dopo la toolbar (le righe demo del mockup o il giro precedente)
  const toolbar = pannello.querySelector('.talos-toolbar');
  for (const n of [...pannello.children]) if (n !== toolbar) n.remove();
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
