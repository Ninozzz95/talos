/*
 * modale-td.js — la modale del mockup (`modalShow`/`modalClose`, righe 6039-6040), lotto G.
 *
 * ⛔ COSA FA IL MOCKUP, e dove l'ho CORRETTO invece di copiarlo.
 *   Il mockup costruisce un `<div class="td-modal-host">`, mette `inert` sulla shell, si ricorda
 *   `document.activeElement` e lo rimette a mano alla chiusura (`lastFocus`). Tre meccanismi
 *   scritti a mano che un `<dialog>` aperto con `showModal()` fa da solo — e che la app HA GIA':
 *   `#commandDialog` e `#sheetDialog` in `legacy/frammenti.html` sono due `<dialog>` nativi.
 *   Ricerca fatta PRIMA di scrivere (11/09/2026):
 *     · MDN «<dialog>»: `showModal()` rende il resto della pagina inerte, intrappola il fuoco,
 *       chiude con Esc e ridà il fuoco a chi ha aperto;
 *     · dfm2html «The Modern Modal in 2026: Using the HTML <dialog> Element Without Accessibility
 *       Traps» e a11y-collective «Mastering Accessible Modals with ARIA and Keyboard Navigation»:
 *       il `<dialog>` nativo è la forma consigliata, `inert` esplicito serve solo dove il fuoco
 *       scappa davvero (iframe, shadow DOM);
 *     · accessibility.build «Accessible Dialog & Modal Guide»: all'apertura il fuoco va sul primo
 *       controllo utile, non sul contenitore.
 *   ⇒ qui la modale È un `<dialog class="td-modal">`, il fondo scuro è `::backdrop`, e delle tre
 *   righe di regia del mockup non ne resta nessuna da mantenere allineata.
 *
 * ⛔ ESC NON DEVE ARRIVARE ALLA APP. `legacy/app.js` ha una catena di Esc (chiudi palette → chiudi
 *   foglio → chiudi pannelli → «fermo il giro?»). Il `<dialog>` si chiude da solo sull'evento
 *   `cancel`, ma il `keydown` continuerebbe a salire fino a `ROOT()`: qui si ferma sulla modale,
 *   così chiudere una modale non fa partire la domanda sul giro in corso.
 *
 * ⛔ UNA ALLA VOLTA. `modalShow` del mockup chiude quella aperta prima di aprirne un'altra
 *   (`modalClose(true)`): stessa cosa qui, perché due `showModal()` impilati lasciano il fuoco
 *   nella prima quando si chiude la seconda.
 */

/** Nessuna `innerHTML`: i titoli e i testi arrivano da dati veri (nomi di file, note scritte da un modello). */
function nodo(doc, tag, classe, testo) {
  const el = doc.createElement(tag);
  if (classe) el.className = classe;
  if (testo !== undefined && testo !== null) el.textContent = String(testo);
  return el;
}

function icona(doc, nome) {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = doc.createElementNS('http://www.w3.org/2000/svg', 'use');
  svg.setAttribute('class', 'i');
  svg.setAttribute('aria-hidden', 'true');
  use.setAttribute('href', `#i-${nome}`);
  svg.append(use);
  return svg;
}

/** La modale viva, se c'è. Esportata perché il test possa provare «una alla volta» senza il DOM vero. */
let aperta = null;
export function modaleAperta() { return aperta; }

/**
 * Apre la modale del mockup.
 * @param {string} titolo intestazione (`<h2 id>` collegato con `aria-labelledby`)
 * @param {Node|Node[]} contenuto nodi già costruiti: qui non entra mai una stringa di markup
 * @param {{document?:Document, ampia?:boolean, suChiusura?:Function}} [opzioni]
 * @returns {{dialogo:HTMLElement, contenuto:HTMLElement, chiudi:Function}|null}
 */
export function apriModale(titolo, contenuto, { document: doc = globalThis.document, ampia = false, suChiusura = null } = {}) {
  if (!doc?.body) return null;
  chiudiModale();
  const dialogo = nodo(doc, 'dialog', 'td-modal');
  if (ampia) dialogo.dataset.ampia = 'si';
  const idTitolo = `td-modal-title-${Math.random().toString(36).slice(2, 8)}`;
  dialogo.setAttribute('aria-labelledby', idTitolo);

  const testa = nodo(doc, 'div', 'td-modal-head');
  const h2 = nodo(doc, 'h2', '', titolo);
  h2.id = idTitolo;
  const chiudiBtn = nodo(doc, 'button', 'talos-button talos-button--ghost talos-icon-button');
  chiudiBtn.type = 'button';
  chiudiBtn.setAttribute('aria-label', 'Chiudi');
  chiudiBtn.append(icona(doc, 'x'));
  chiudiBtn.addEventListener('click', () => chiudiModale());
  testa.append(h2, chiudiBtn);

  const corpo = nodo(doc, 'div', 'td-modal-content');
  for (const pezzo of [contenuto].flat().filter(Boolean)) corpo.append(pezzo);
  dialogo.append(testa, corpo);

  // Il clic sul fondo chiude: il `::backdrop` non è un elemento, quindi l'evento arriva al dialogo
  // stesso con il bersaglio uguale al dialogo — è il modo canonico di distinguerlo dal contenuto.
  dialogo.addEventListener('click', (e) => { if (e.target === dialogo) chiudiModale(); });
  dialogo.addEventListener('keydown', (e) => { if (e.key === 'Escape') e.stopPropagation(); });
  dialogo.addEventListener('close', () => {
    if (aperta?.dialogo === dialogo) aperta = null;
    dialogo.remove();
    suChiusura?.();
  });

  doc.body.append(dialogo);
  if (typeof dialogo.showModal === 'function') dialogo.showModal();
  else dialogo.setAttribute('open', ''); // ripiego: un ambiente senza `showModal` vede comunque il contenuto
  aperta = { dialogo, contenuto: corpo, suChiusura, chiudi: () => chiudiModale() };
  // Il primo controllo utile, non il contenitore: chi ascolta sente «Elimina» invece del silenzio.
  const primo = corpo.querySelector('input:not([type=hidden]), textarea, select, button') || chiudiBtn;
  primo.focus?.({ preventScroll: true });
  return aperta;
}

export function chiudiModale() {
  const viva = aperta;
  if (!viva) return false;
  aperta = null;
  const { dialogo } = viva;
  if (typeof dialogo.close === 'function' && dialogo.open) dialogo.close();
  else { dialogo.remove(); viva.suChiusura?.(); }
  return true;
}

/**
 * La conferma distruttiva del mockup (`deleteItem`, riga 6130), con la CONSEGUENZA scritta.
 *
 * ⛔ La scala dell'attrito è già una regola di questo repo (libreria.js, 10/09: saasui.design
 *   «SaaS Destructive Actions» + NN/g «Confirmation Dialogs Can Prevent User Errors»): si chiede
 *   SOLO per ciò che non si rifà, e si dice cosa succede. La ricerca dell'11/09 aggiunge il rovescio
 *   (Joel Pascual, «A UX guide to destructive actions»; NN/g): se l'azione è reversibile la
 *   conferma va SOSTITUITA da un annullamento nel toast — ed è esattamente ciò che fa la rinomina
 *   in `sezione-elenco-dettaglio.js`. Qui dentro entra solo l'irreversibile.
 * ⛔ Il fuoco parte dalla via d'uscita: «Annulla» è il primo controllo del corpo, quindi un Invio
 *   di troppo non cancella niente (stessa scelta della riga della Libreria).
 */
export function confermaModale({
  titolo = 'Confermi?',
  domanda,
  conseguenza = '',
  etichettaConferma = 'Elimina',
  onConferma,
  document: doc = globalThis.document,
} = {}) {
  const testo = nodo(doc, 'p', 'td-prose', domanda);
  const pezzi = [testo];
  if (conseguenza) pezzi.push(nodo(doc, 'p', 'td-subtle', conseguenza));
  const piede = nodo(doc, 'div', 'td-detail-footer');
  const annulla = nodo(doc, 'button', 'talos-button talos-button--secondary talos-button--sm', 'Annulla');
  annulla.type = 'button';
  annulla.addEventListener('click', () => chiudiModale());
  /* `--secondary` prima di `--danger`: senza la variante il bottone resta testo rosso senza
     bordo, e la scelta distruttiva pesava MENO della via d'uscita (visto nella foto). */
  const conferma = nodo(doc, 'button', 'talos-button talos-button--secondary talos-button--danger talos-button--sm', etichettaConferma);
  conferma.type = 'button';
  conferma.addEventListener('click', () => { chiudiModale(); onConferma?.(); });
  piede.append(annulla, conferma);
  pezzi.push(piede);
  return apriModale(titolo, pezzi, { document: doc });
}
