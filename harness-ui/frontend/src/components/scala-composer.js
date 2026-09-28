/*
 * ⛔⛔ 26/09/2026 — LA SCALA DEL COMPOSER SI SCEGLIE MISURANDO, NON CON UNA SOGLIA FISSA. Difetto (3) delle foto di Ask e
 *   del Piano, riverificato sul 4174 il 26/09 in sola lettura: a 1024 (composer 614 px) tre etichette tagliate coi puntini —
 *   «glm-5.3-fl…», «Scrive nel prog…», «Termin…». Le regole a soglia (`index.css`, D2 del 17/09) scattano solo con la
 *   pillola della spesa accesa, e la misura di una sonda ha mostrato perché una soglia sola non basta: il primo taglio va
 *   da 552 px (niente acceso) a 828 px («Giri 24/24» + «Reindirizza» durante un giro). Una soglia fissa o comprime quando
 *   lo spazio c'è — il difetto del 17/09 — o taglia.
 * ⭐ Letto nel codice il 26/09: Hermes collassa per STADI («Progressive collapse: full pill → icon pill → stacked»,
 *   `apps/desktop/src/app/chat/composer/composer-utils.ts:13-25`, clone 65ad529) con soglie misurate sul costo dei
 *   controlli; Pi misura il contenuto VERO e toglie prima le parti facoltative, troncando solo come ultima risorsa
 *   (`packages/coding-agent/src/modes/interactive/components/footer.ts:192-217`, clone bf8e4b9). Qui le due cose insieme:
 *   gli stadi sono quelli della nostra scala, e si sceglie il primo in cui NIENTE è tagliato.
 * ⛔ La regola del 17/09 resta: una parola cede solo se nella pillola resta qualcosa che dice di che cosa si tratta — il
 *   terminale ha la sua icona, il permesso lo scudo, «Sessione» il `~$`. Il nome del modello NON cede mai (è l'informazione):
 *   si stringe fino ai sei caratteri, come prima.
 * ⛔ Nessun `setTimeout`: la misura si rifà una volta per fotogramma quando la barra cambia (contenuto o larghezza), e
 *   non si rifà se niente è cambiato.
 */

/** Gli stadi: 0 tutto intero · 1 «Terminale» solo icona · 2 anche il permesso e «Sessione» solo icona. */
export const STADIO_MASSIMO = 2;

const ETICHETTE_MISURATE = ['[data-open-sheet="model"] .talos-chip__label', '[data-open-sheet="permissions"] .talos-chip__label', '#pillTerminale .talos-chip__label'];

/** Vero se l'etichetta si vede ma non ci sta intera. Un'etichetta ceduta (resa per la sola voce) non è tagliata. */
export function etichettaTagliata(el, win = globalThis) {
  if (!el || !el.isConnected || el.getClientRects().length === 0) return false;
  if (win.getComputedStyle(el).position === 'absolute') return false;
  return el.scrollWidth > el.clientWidth + 1;
}

/** Porta la barra al primo stadio in cui nessuna etichetta è tagliata; torna lo stadio scelto. */
export function adattaScala(barra, win = globalThis) {
  if (!barra) return 0;
  for (let stadio = 0; stadio <= STADIO_MASSIMO; stadio += 1) {
    if (stadio === 0) delete barra.dataset.scala; else barra.dataset.scala = String(stadio);
    const tagliata = ETICHETTE_MISURATE.some((sel) => etichettaTagliata(barra.querySelector(sel), win));
    if (!tagliata) return stadio;
  }
  return STADIO_MASSIMO;
}

/**
 * Collega la scala alla barra: si riadatta quando cambia la larghezza del composer o il contenuto della barra (testi,
 * pillole che compaiono e spariscono). Torna la funzione che scollega.
 */
export function collegaScalaComposer(barra, { win = globalThis, contenitore = barra?.closest?.('.talos-composer') ?? barra } = {}) {
  if (!barra || typeof win.requestAnimationFrame !== 'function') return () => {};
  let fotogramma = null;
  let firma = null;
  /* ⛔ La larghezza viene dall'osservatore, non dal layout: una lettura in meno a ogni fotogramma (Hermes decide dalla
     larghezza del suo ResizeObserver, `use-composer-metrics.ts`). */
  let larghezza = null;
  const firmaAttuale = () => {
    const nascosti = [...barra.children].map((c) => (c.hidden ? '0' : '1')).join('');
    return `${larghezza ?? '?'}|${nascosti}|${barra.textContent}`;
  };
  /* ⛔ 26/09 — trovato dalla suite intera (RESIZE-COMPOSER): mentre la persona TRASCINA la maniglia del composer, misurare
     a ogni fotogramma leggeva il layout 7,4 volte per movimento contro un tetto di 2 — il «layout thrashing» che quella
     prova esiste per impedire. Durante il gesto (`composer-resizing`) la scala aspetta; si rifà UNA volta al rilascio. */
  const inTrascinamento = () => Boolean(contenitore.classList?.contains('composer-resizing'));
  const adatta = () => {
    fotogramma = null;
    if (inTrascinamento()) return;
    const ora = firmaAttuale();
    if (ora === firma) return;
    adattaScala(barra, win);
    firma = firmaAttuale();
  };
  const programma = () => { if (fotogramma === null) fotogramma = win.requestAnimationFrame(adatta); };
  const ro = typeof win.ResizeObserver === 'function'
    ? new win.ResizeObserver((voci) => { for (const v of voci) larghezza = Math.round(v.contentRect.width); programma(); })
    : null;
  ro?.observe(contenitore);
  const mo = typeof win.MutationObserver === 'function' ? new win.MutationObserver(programma) : null;
  mo?.observe(barra, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden'] });
  // la fine del trascinamento (la classe che se ne va) è il momento di rifarla
  mo?.observe(contenitore, { attributes: true, attributeFilter: ['class'] });
  programma();
  return () => { ro?.disconnect(); mo?.disconnect(); if (fotogramma !== null) win.cancelAnimationFrame?.(fotogramma); };
}
