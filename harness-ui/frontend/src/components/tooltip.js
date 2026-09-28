/*
 * I suggerimenti (tooltip) sono nostri — O-40.
 *
 * ⛔ 06/9, owner: «fare in modo che tutti i tooltip siano custom e stilizzati secondo il tema».
 * Misurato prima di scrivere: **220 suggerimenti** in tutta la app (156 `title=` nel template, 64
 * assegnati dal codice) e **zero** `role="tooltip"`. Erano tutti il riquadro giallino del sistema
 * operativo: ritardo di circa un secondo che non si può cambiare, nessun colore del tema, sparizione
 * automatica mentre stai ancora leggendo, e niente da tastiera né su touch.
 *
 * Ricerca 06/09/2026, e ha cambiato il disegno più di quanto pensassi:
 * · MDN «ARIA: tooltip role» e Sarah Higley «Tooltips in the time of WCAG 2.1»: il `title` nativo è
 *   GIÀ inaccessibile — non si attiva col fuoco da tastiera e non esiste al tocco. Toglierlo non
 *   peggiora niente: è il contrario di quello che temevo.
 * · WCAG 1.4.13 «Content on Hover or Focus» impone TRE cose che un tooltip fatto a occhio non ha:
 *   si chiude con Esc senza muovere il puntatore (dismissible), ci si può passare sopra col mouse
 *   senza farlo sparire (hoverable), e resta finché non sposti fuoco o puntatore (persistent).
 *   L'«hoverable» è quello che si dimentica sempre, ed è quello che serve a chi ingrandisce lo
 *   schermo e deve inseguire il testo col mouse.
 * · HTML Standard e Smashing «Getting Started With The Popover API»: per un suggerimento si usa
 *   `popover="hint"`, non `auto` — un `auto` CHIUDEREBBE il menu che hai aperto, e un suggerimento
 *   non deve mai far sparire il lavoro di qualcun altro.
 * · Il collegamento con chi lo apre si dichiara con `aria-describedby`: senza, si sostituirebbe un
 *   riquadro che qualche lettore di schermo annuncia con uno che per lui NON ESISTE.
 *
 * Il posizionamento è dell'ancoraggio CSS (`position-anchor`, `position-area`,
 * `position-try-fallbacks`): nessuna libreria e nessun calcolo a mano: se sopra non c'è spazio, il
 * browser lo ribalta sotto da solo. Verificato sul Chrome vero dell'owner (152): Popover API,
 * ancoraggio e `popover="hint"` tutti presenti.
 */

/** L'attributo che porta il testo del suggerimento, dopo la migrazione dal `title` nativo. */
export const ATTRIBUTO = 'data-tip';

/** Quanto si aspetta prima di mostrarlo: sotto i 250 ms lampeggia mentre attraversi lo schermo. */
export const RITARDO_MS = 350;

/**
 * Il `title` nativo diventa il nostro attributo. Si toglie DAVVERO dall'elemento: lasciarlo
 * significherebbe vedere due riquadri, il nostro e quello del sistema.
 * ⛔ Non tocca `<iframe title>` né i `title` dentro un SVG: là non è un suggerimento, è il nome
 *    accessibile dell'oggetto, e portarlo via toglierebbe informazione invece di darne.
 * @returns {string} il testo del suggerimento, o '' se non ne ha
 */
export function migraTitle(elemento) {
  if (!elemento || typeof elemento.getAttribute !== 'function') return '';
  const tag = String(elemento.tagName || '').toLowerCase();
  if (tag === 'iframe' || elemento.ownerSVGElement || tag === 'svg') return '';
  /* ⛔ 26/09: un `title` scritto DOPO la migrazione è il testo nuovo (il piede della chat li riscrive a ogni ridisegno):
     prima vinceva il nostro attributo, e il suggerimento restava fermo al primo testo mentre ricompariva quello nativo. */
  const titolo = elemento.getAttribute('title');
  if (titolo && titolo.trim()) {
    elemento.setAttribute(ATTRIBUTO, titolo.trim());
    elemento.removeAttribute('title');
    return titolo.trim();
  }
  return elemento.getAttribute(ATTRIBUTO) || '';
}

/** Il bersaglio più vicino che ha qualcosa da dire — `title` da migrare o il nostro attributo. */
export function bersaglioDi(nodo) {
  let corrente = nodo;
  while (corrente && corrente.nodeType === 1) {
    if (corrente.hasAttribute?.(ATTRIBUTO) || corrente.hasAttribute?.('title')) return corrente;
    corrente = corrente.parentElement;
  }
  return null;
}

/**
 * Da che parte aprirlo. Un suggerimento sulla barra in alto non può aprirsi verso l'alto, e uno
 * nella colonna di sinistra non può uscire dallo schermo a sinistra: si sceglie il lato con più
 * spazio, e all'ancoraggio CSS resta il ribaltamento fine.
 * @returns {'block-start'|'block-end'|'inline-end'|'inline-start'}
 */
export function latoPreferito(rettangolo, finestra) {
  const r = rettangolo || {};
  const w = Number(finestra?.width) || 0;
  const h = Number(finestra?.height) || 0;
  const sopra = Number(r.top) || 0;
  const sotto = h - (Number(r.bottom) || 0);
  if (sopra < 64 && sotto > sopra) return 'block-end';
  if (sotto < 64 && sopra > sotto) return 'block-start';
  const destra = w - (Number(r.right) || 0);
  if (sopra < 64 && sotto < 64) return destra > (Number(r.left) || 0) ? 'inline-end' : 'inline-start';
  return 'block-start';
}

/**
 * Accende i suggerimenti su tutta la pagina. Un ascoltatore solo, delegato: così vale anche per
 * quello che nasce dopo — e la app ne crea in continuazione — senza doversene ricordare.
 * @param {Document} documentObj
 * @param {{ritardo?:number}} [opzioni]
 * @returns {() => void} per spegnerli (serve alle prove)
 */
export function collegaTooltip(documentObj = globalThis.document, { ritardo = RITARDO_MS } = {}) {
  if (!documentObj || documentObj.__talosTooltipCollegato) return () => {};
  documentObj.__talosTooltipCollegato = true;
  const bolla = documentObj.getElementById('talosTip');
  if (!bolla) return () => {};
  const testo = bolla.querySelector('[data-tip-testo]') || bolla;

  let bersaglio = null;
  let timer = null;
  let dentroLaBolla = false;
  /*
   * ⛔⛔ 26/09/2026, difetti (6) e (7) delle foto di Ask e del Piano: dopo lo Stop «Interrompi adesso» restava sul bottone
   *   diventato «Invia», e «Context Manager» restava disegnato SOPRA la finestra appena aperta — tutti e due finché il
   *   puntatore non si spostava. Il meccanismo, uno solo: il clic chiude il suggerimento (`pointerdown`), ma dà anche il
   *   fuoco al bottone, e `focusin` faceva ripartire il timer; 350 ms dopo il suggerimento si riapriva col testo di prima.
   * ⭐ Hermes l'ha trovato e curato uguale (`apps/desktop/src/components/ui/tooltip.tsx:64-92`, clone 65ad529): «Menus and
   *   dialogs return focus to their trigger… left the trigger's tip stuck open… Gate focus-opens to KEYBOARD focus», e
   *   `:focus-visible` da solo non basta — serve anche il dispositivo dell'ultima interazione vera.
   * ⇒ (1) al fuoco si apre solo se l'ultima interazione è stata la tastiera E l'elemento è `:focus-visible`;
   *   (2) il fuoco che va su un ALTRO elemento — anche senza suggerimento, come il titolo di una finestra — chiude quello
   *   aperto; (3) se il testo del bersaglio cambia mentre è aperto (Stop → Invia), il suggerimento si chiude: è vecchio.
   */
  let modalita = 'pointer';
  const daTastiera = (el) => { if (modalita !== 'keyboard') return false; try { return el.matches(':focus-visible'); } catch { return true; } };
  const Osservatore = documentObj.defaultView?.MutationObserver ?? globalThis.MutationObserver;
  let testoMostrato = '';
  // (3) si chiude solo se il testo CAMBIA: una riscrittura identica (il piede ridisegna a ogni evento) non è una notizia
  const osservaTesto = typeof Osservatore === 'function'
    ? new Osservatore(() => { if (bersaglio && migraTitle(bersaglio) !== testoMostrato) chiudi(); })
    : null;

  const chiudi = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    osservaTesto?.disconnect();
    if (bersaglio) {
      bersaglio.removeAttribute('aria-describedby');
      bersaglio.style.anchorName = '';
      bersaglio = null;
    }
    try { bolla.hidePopover?.(); } catch { /* già chiusa */ }
    bolla.hidden = true;
  };

  const apri = (elemento, frase) => {
    bersaglio = elemento;
    testoMostrato = frase;
    testo.textContent = frase;
    // il legame che un lettore di schermo può seguire: senza questo avremmo tolto e non dato
    elemento.setAttribute('aria-describedby', 'talosTip');
    elemento.style.anchorName = '--talos-tip';
    /*
     * ⛔ 07/9, visto negli screenshot della prova del curioso: il fumetto di una scheda del Browser
     *   si apriva SOPRA e copriva la barra delle viste (Chat / Terminale / Review / Browser), che sta
     *   a 60px dal bordo. `latoPreferito` sceglie «sopra» ogni volta che c'è spazio, e lo spazio c'era:
     *   solo che lì sopra non c'è il vuoto, c'è la navigazione della sessione.
     * ⇒ Chi ha qualcosa sopra di sé può dirlo con `data-tip-lato`, e il fumetto lo rispetta. La
     *   scelta automatica resta per tutti gli altri, che sono la maggioranza.
     */
    const latoChiesto = elemento.getAttribute?.('data-tip-lato');
    const lato = latoChiesto === 'sotto' ? 'block-end'
      : latoChiesto === 'sopra' ? 'block-start'
        : latoPreferito(elemento.getBoundingClientRect(), { width: globalThis.innerWidth, height: globalThis.innerHeight });
    bolla.style.positionArea = lato;
    bolla.hidden = false;
    try { bolla.showPopover?.(); } catch { /* il fallback è `hidden`, già tolto */ }
    osservaTesto?.observe(elemento, { attributes: true, attributeFilter: [ATTRIBUTO, 'title'] }); // (3)
  };

  const suEntrata = (evento) => {
    const alFuoco = evento.type === 'focusin';
    const elemento = bersaglioDi(evento.target);
    // (2) il fuoco è andato altrove — anche su qualcosa che non ha niente da dire: quello aperto non vale più
    if (alFuoco && bersaglio && elemento !== bersaglio && !bolla.contains(evento.target)) chiudi();
    if (!elemento || elemento === bersaglio) return;
    if (alFuoco && !daTastiera(evento.target)) return; // (1) il fuoco restituito da un clic non apre niente
    const frase = migraTitle(elemento);
    if (!frase) return;
    chiudi();
    timer = setTimeout(() => apri(elemento, frase), ritardo);
  };

  const suUscita = (evento) => {
    if (!bersaglio) return;
    // WCAG 1.4.13, «hoverable»: passare col mouse SOPRA il suggerimento non lo fa sparire —
    // serve a chi ingrandisce lo schermo e deve inseguire il testo per leggerlo tutto.
    const verso = evento.relatedTarget;
    if (verso && (bolla.contains(verso) || bersaglio.contains(verso))) return;
    if (dentroLaBolla) return;
    chiudi();
  };

  bolla.addEventListener('pointerenter', () => { dentroLaBolla = true; });
  bolla.addEventListener('pointerleave', () => { dentroLaBolla = false; chiudi(); });
  documentObj.addEventListener('pointerover', suEntrata, true);
  documentObj.addEventListener('pointerout', suUscita, true);
  documentObj.addEventListener('focusin', suEntrata, true);
  documentObj.addEventListener('focusout', suUscita, true);
  // WCAG 1.4.13, «dismissible»: Esc lo chiude senza dover spostare il puntatore
  documentObj.addEventListener('keydown', (evento) => { modalita = 'keyboard'; if (evento.key === 'Escape') chiudi(); }, true);
  // un clic sta già facendo qualcos'altro: il suggerimento non deve restare lì sopra
  documentObj.addEventListener('pointerdown', () => { modalita = 'pointer'; chiudi(); }, true);
  documentObj.defaultView?.addEventListener?.('scroll', chiudi, { capture: true, passive: true });

  return () => {
    chiudi();
    documentObj.__talosTooltipCollegato = false;
    documentObj.removeEventListener('pointerover', suEntrata, true);
    documentObj.removeEventListener('pointerout', suUscita, true);
    documentObj.removeEventListener('focusin', suEntrata, true);
    documentObj.removeEventListener('focusout', suUscita, true);
  };
}
