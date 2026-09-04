import { defineComponent } from '../ui/component.js';

/*
 * ResizablePane — la maniglia fra due pannelli (sidebar, colonna dei dettagli).
 *
 * ⛔ Ricerca del 04/09/2026, schema «window splitter» di WAI-ARIA:
 *  - `role="separator"` con `tabIndex = 0`: un separatore FOCALIZZABILE e' un
 *    widget, non una decorazione;
 *  - `aria-valuenow/min/max` dicono dove sta e fin dove puo' andare;
 *  - `aria-controls` deve puntare al pannello che muove — senza, chi ascolta
 *    sa che c'e' una maniglia ma non cosa ridimensiona;
 *  - il nome viene da `aria-labelledby` verso l'etichetta VISIBILE del
 *    pannello quando c'e', e solo in mancanza da un `aria-label`.
 * Fonti: w3.org/WAI/ARIA/apg/patterns/windowsplitter ·
 * telerik.com/design-system/docs/components/splitter/accessibility/
 *
 * ⛔ E il trascinamento NON usa `setPointerCapture`: la prova funzionale sul
 * mockup ha mostrato che non regge gli eventi sintetici, e che se il puntatore
 * esce dalla maniglia il movimento si perde. Gli ascoltatori vanno sulla
 * finestra, che e' anche la forma robusta.
 *
 * ⛔ La larghezza vive in un TOKEN CSS, non in uno stile in linea: cosi' il
 * tema resta la sola fonte delle misure e il pannello puo' leggerla.
 */
const VERSI = new Set(['start', 'end']);

export const createResizablePane = defineComponent('ResizablePane', (initialProps = {}) => {
  const documentObj = initialProps.document || globalThis.document;
  const maniglia = documentObj.createElement('button');
  maniglia.type = 'button';
  maniglia.setAttribute('role', 'separator');
  maniglia.setAttribute('aria-orientation', 'vertical');
  maniglia.tabIndex = 0;

  let props = { side: 'start', min: 220, max: 420, step: 8, largeStep: 32, ...initialProps };
  let larghezza = Number(initialProps.value ?? initialProps.min ?? 220);
  let trascinamento = null;

  function radice() {
    return props.root || documentObj.documentElement;
  }

  function applica(prossima, { annuncia = false } = {}) {
    const limitata = Math.max(props.min, Math.min(props.max, Math.round(prossima)));
    const cambiata = limitata !== larghezza;
    larghezza = limitata;
    const host = radice();
    if (host && host.style && typeof host.style.setProperty === 'function') {
      host.style.setProperty(props.token, `${larghezza}px`);
    }
    maniglia.setAttribute('aria-valuenow', String(larghezza));
    if (cambiata && typeof props.onResize === 'function') props.onResize(larghezza);
    if (cambiata && annuncia && typeof props.announce === 'function') {
      props.announce(`${props.label}: ${larghezza} ${props.unitWord || 'pixel'}`);
    }
    return larghezza;
  }

  function render() {
    if (!VERSI.has(props.side)) throw new TypeError(`lato della maniglia non valido: ${props.side}`);
    if (!props.token) throw new TypeError('ResizablePane richiede il token della larghezza');
    if (!props.controls) throw new TypeError('ResizablePane richiede aria-controls: una maniglia che non dice cosa muove non e\' usabile');
    if (!props.label && !props.labelledBy) throw new TypeError('ResizablePane richiede un nome (label o labelledBy)');
    if (!(props.min < props.max)) throw new TypeError(`limiti della maniglia incoerenti: ${props.min} - ${props.max}`);
    maniglia.className = `talos-resizer talos-resizer--${props.side}`;
    maniglia.setAttribute('aria-controls', String(props.controls));
    // Il nome viene dall'etichetta VISIBILE quando c'e': l'aria-label e' il ripiego.
    if (props.labelledBy) {
      maniglia.setAttribute('aria-labelledby', String(props.labelledBy));
      maniglia.removeAttribute('aria-label');
    } else {
      maniglia.setAttribute('aria-label', String(props.label));
      maniglia.removeAttribute('aria-labelledby');
    }
    maniglia.setAttribute('aria-valuemin', String(props.min));
    maniglia.setAttribute('aria-valuemax', String(props.max));
    applica(larghezza);
    if (props.testId) maniglia.dataset.testid = props.testId;
  }

  const verso = () => (props.side === 'start' ? 1 : -1);

  const onPointerDown = (event) => {
    if (typeof event.preventDefault === 'function') event.preventDefault();
    maniglia.dataset.trascina = 'si';
    trascinamento = { x0: event.clientX, w0: larghezza };
    const finestra = props.window || documentObj.defaultView || globalThis;
    const muovi = (ev) => applica(trascinamento.w0 + (ev.clientX - trascinamento.x0) * verso());
    const ferma = () => {
      delete maniglia.dataset.trascina;
      trascinamento = null;
      finestra.removeEventListener('pointermove', muovi, true);
      finestra.removeEventListener('pointerup', ferma, true);
      finestra.removeEventListener('pointercancel', ferma, true);
      if (typeof props.announce === 'function') props.announce(`${props.label}: ${larghezza} ${props.unitWord || 'pixel'}`);
    };
    finestra.addEventListener('pointermove', muovi, true);
    finestra.addEventListener('pointerup', ferma, true);
    finestra.addEventListener('pointercancel', ferma, true);
  };

  const onKeyDown = (event) => {
    const passo = event.shiftKey ? props.largeStep : props.step;
    if (event.key === 'ArrowLeft') { event.preventDefault?.(); applica(larghezza - passo * verso(), { annuncia: true }); }
    else if (event.key === 'ArrowRight') { event.preventDefault?.(); applica(larghezza + passo * verso(), { annuncia: true }); }
    else if (event.key === 'Home') { event.preventDefault?.(); applica(props.base ?? props.min, { annuncia: true }); }
    else if (event.key === 'End') { event.preventDefault?.(); applica(props.max, { annuncia: true }); }
  };

  const onDoubleClick = () => applica(props.base ?? props.min, { annuncia: true });

  maniglia.addEventListener('pointerdown', onPointerDown);
  maniglia.addEventListener('keydown', onKeyDown);
  maniglia.addEventListener('dblclick', onDoubleClick);

  render();
  return {
    element: maniglia,
    focus(options) { maniglia.focus(options); },
    update(nextProps = {}) {
      const prossima = nextProps.value;
      props = { ...props, ...nextProps };
      if (prossima !== undefined) larghezza = Number(prossima);
      render();
    },
    destroy() {
      maniglia.removeEventListener('pointerdown', onPointerDown);
      maniglia.removeEventListener('keydown', onKeyDown);
      maniglia.removeEventListener('dblclick', onDoubleClick);
      maniglia.remove();
    },
  };
});
