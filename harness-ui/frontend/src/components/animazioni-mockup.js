/*
 * animazioni-mockup.js — le animazioni del mockup che rispondono a un CLIC.
 *
 * Fonte: `Talos_Desktop_Final_Mockup_Interattivo.html`, script `talos-desktop-study`. Il mockup le
 * fa tutte da un ascoltatore solo sul documento; qui idem, per la stessa ragione per cui l'ha fatto
 * lui: sono superfici disegnate da file diversi (il monolite, `impostazioni.js`, il template), e
 * infilare cinque `motion(...)` in cinque posti vorrebbe dire tenerli allineati per sempre.
 *
 * ⛔ PERCHÉ QUI E NON IN UN FOGLIO CSS, che sarebbe stato più corto.
 *   Una `animation` CSS su `[hidden]` riparte ogni volta che l'elemento torna da `display:none`.
 *   Un pannello di schede o un gruppo della barra tornano visibili anche quando si NAVIGA verso la
 *   pagina che li contiene: il foglio avrebbe animato all'arrivo su una pagina, cosa che il mockup
 *   NON fa (anima solo il pannello che hai appena scelto). Portare «alla perfezione» vuol dire
 *   anche non aggiungere movimento che là non c'è.
 *
 * ⛔ L'ORDINE DEGLI ASCOLTATORI È UNA MISURA, non un'opinione. Il monolite ascolta su
 *   `document.documentElement`; un ascoltatore su `document` in fase di BOLLA arriva dopo il suo
 *   (l'evento sale bersaglio → … → html → document), quindi qui si legge lo stato GIÀ cambiato.
 *   L'unico che ha bisogno del PRIMA — il collasso della barra, che interpola due griglie — usa la
 *   fase di CATTURA, che arriva prima di tutti.
 *
 * ⛔ MAI DUE ANIMAZIONI SULLO STESSO ELEMENTO. Le schede delle viste (`[data-vistetab]`) puntano con
 *   `aria-controls` alle sezioni intere, e su quelle il monolite fa già il suo cambio pagina
 *   (`animaCambioPagina`, app.js ~1140). Prima di animare si guarda se l'elemento ha già qualcosa
 *   in volo: due animazioni sulla stessa proprietà si sovrappongono e il risultato non è nessuna
 *   delle due.
 */
import { motion } from './motion-mockup.js';

const NAV = 'motion-navigation-off';
const SUPERFICI = 'motion-surfaces-off';
const RISCONTRI = 'motion-feedback-off';

/** `#id` con l'escape giusto: un id con un punto o una cifra iniziale rompe un selettore ingenuo. */
function perId(doc, id) {
  if (!id) return null;
  try { return doc.getElementById(id); } catch { return null; }
}

/** Vero se qualcosa è già in volo su questo elemento (il cambio pagina del monolite, per esempio). */
function giaInMovimento(el) {
  try { return typeof el.getAnimations === 'function' && el.getAnimations().length > 0; }
  catch { return false; }
}

function visibile(el) {
  return Boolean(el) && !el.hidden && el.offsetParent !== null;
}

/**
 * Monta gli ascoltatori. Idempotente: montarlo due volte non raddoppia le animazioni.
 * @param {Document} [doc]
 * @returns {() => void} la funzione che li smonta (serve ai test)
 */
export function montaAnimazioniMockup(doc = globalThis.document) {
  if (!doc?.addEventListener) return () => {};
  if (doc.documentElement?.dataset?.tamMontato === 'si') return () => {};
  if (doc.documentElement?.dataset) doc.documentElement.dataset.tamMontato = 'si';

  /* ── IL PRIMA del collasso della barra ────────────────────────────────────────────────────
   * Mockup, `toggleSidebar()`: legge `getComputedStyle(shell).gridTemplateColumns` PRIMA di
   * cambiare `data-sidebar`, poi il DOPO, e interpola fra i due elenchi di pixel.
   * ⛔ Non è un vezzo: `grid-template-columns` si interpola solo fra liste di lunghezze con la
   *   stessa forma (MDN «grid-template-columns», tipo di animazione: «simple list of length,
   *   percentage, or calc, provided the only differences are in the values»). La forma dichiarata
   *   nella app è `var(--talos-sidebar-w) minmax(0,1fr) …` contro `64px minmax(0,1fr) …`: leggere i
   *   valori RISOLTI in pixel è l'unico modo che funziona sempre. */
  let grigliaPrima = null;
  const suCattura = (e) => {
    const b = e.target?.closest?.('[data-azione="barra"]');
    grigliaPrima = null;
    if (!b) return;
    const shell = doc.querySelector('.talos-shell');
    if (!shell) return;
    try { grigliaPrima = { shell, valore: (doc.defaultView || globalThis).getComputedStyle(shell).gridTemplateColumns }; }
    catch { grigliaPrima = null; }
  };

  const suBolla = (e) => {
    const b = e.target?.closest?.('button, [role="tab"]');

    /* ── 1. LA PRESSIONE DI UN PULSANTE ──────────────────────────────────────────────────
     * Mockup: `motion(b,[{scale:'1'},{scale:'.985'},{scale:'1'}],'control',1)` su OGNI pulsante
     * che non sia disabilitato, una maniglia di ridimensionamento o il divisorio.
     * ⛔ Le due esclusioni sono del mockup e hanno una ragione: quelle due si TRASCINANO, e un
     *   rimbalzo sotto il dito durante un trascinamento è rumore, non risposta. */
    if (b && !b.disabled
      && !b.classList.contains('talos-resizer')
      && !b.classList.contains('td-divider')
      && !b.closest('.talos-resizer')) {
      motion(b, [{ scale: '1' }, { scale: '.985' }, { scale: '1' }], { token: 'control', leva: RISCONTRI, document: doc });
    }

    /* ── 2. IL COLLASSO DELLA BARRA ─────────────────────────────────────────────────────
     * Mockup: `motion(shell,[{gridTemplateColumns:start},{gridTemplateColumns:end}],'disclosure',1.2)`. */
    if (grigliaPrima && b?.closest?.('[data-azione="barra"]')) {
      const { shell, valore } = grigliaPrima;
      grigliaPrima = null;
      const anima = () => {
        let dopo = '';
        try { dopo = (doc.defaultView || globalThis).getComputedStyle(shell).gridTemplateColumns; } catch { return; }
        if (!dopo || dopo === valore) return; // niente è cambiato: niente da raccontare
        motion(shell, [{ gridTemplateColumns: valore }, { gridTemplateColumns: dopo }], {
          token: 'disclosure', fattore: 1.2, leva: NAV, document: doc,
        });
      };
      anima();
    }

    if (!b) return;

    /* ── 3. IL GRUPPO DELLA BARRA CHE SI APRE ───────────────────────────────────────────
     * Mockup, `case'group'`: `motion(body,[{opacity:.3,transform:'translateY(-4px)'},
     * {opacity:1,transform:'none'}])` — token di default, cioè `surface-enter`.
     * ⛔ Solo in APERTURA: il mockup anima `if(!body.hidden)`. Chiudere è già raccontato dalla
     *   freccia che ruota (`.td-nav-head .i`, mockup-sidebar.css:61). */
    const testata = b.closest('.td-nav-head[data-gruppo], .td-nav-head[aria-controls]');
    if (testata) {
      const corpo = perId(doc, testata.getAttribute('aria-controls'));
      if (visibile(corpo)) {
        motion(corpo, [{ opacity: 0.3, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { leva: NAV, document: doc });
      }
      return;
    }

    /* ── 4. IL PANNELLO DELLE IMPOSTAZIONI ──────────────────────────────────────────────
     * Mockup, `settingsSelect`: `motion($('[data-settings-panel="'+k+'"]'),
     * [{opacity:.3,transform:'translateX(5px)'},{opacity:1,transform:'none'}],'tab-change')`. */
    const scheda = b.closest('[data-settings-tab]');
    if (scheda) {
      const chiave = scheda.dataset.settingsTab;
      const pannello = doc.querySelector(`[data-settings-panel="${CSS.escape(String(chiave))}"]`);
      if (visibile(pannello) && !giaInMovimento(pannello)) {
        motion(pannello, [{ opacity: 0.3, transform: 'translateX(5px)' }, { opacity: 1, transform: 'none' }], { token: 'tab-change', leva: NAV, document: doc });
      }
      return;
    }

    /* ── 5. LA SCHEDA (TAB) CHE CAMBIA PANNELLO ─────────────────────────────────────────
     * Mockup: `if($('#'+CSS.escape(id)))motion($('#'+CSS.escape(id)),
     * [{opacity:.4,transform:'translateY(4px)'},{opacity:1,transform:'none'}],'tab-change')`. */
    const tab = b.closest('[role="tab"][aria-controls]');
    if (tab) {
      const pannello = perId(doc, tab.getAttribute('aria-controls'));
      if (visibile(pannello) && !giaInMovimento(pannello)) {
        motion(pannello, [{ opacity: 0.4, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { token: 'tab-change', leva: NAV, document: doc });
      }
      return;
    }

    /* ── 6. UN PANNELLO CHE SI APRE (disclosure) ────────────────────────────────────────
     * Mockup: `if(show)motion(panel,[{opacity:0,transform:'translateY(-3px)'},
     * {opacity:1,transform:'none'}],'disclosure')`. */
    const apribile = b.closest('[aria-expanded][aria-controls]');
    if (apribile && apribile.getAttribute('aria-expanded') === 'true') {
      const pannello = perId(doc, apribile.getAttribute('aria-controls'));
      if (visibile(pannello) && !giaInMovimento(pannello)) {
        motion(pannello, [{ opacity: 0, transform: 'translateY(-3px)' }, { opacity: 1, transform: 'none' }], { token: 'disclosure', leva: SUPERFICI, document: doc });
      }
    }
  };

  doc.addEventListener('click', suCattura, true);
  doc.addEventListener('click', suBolla, false);
  return () => {
    doc.removeEventListener('click', suCattura, true);
    doc.removeEventListener('click', suBolla, false);
    if (doc.documentElement?.dataset) delete doc.documentElement.dataset.tamMontato;
  };
}
