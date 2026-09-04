import { defineComponent } from '../ui/component.js';

/*
 * Kbd — la scorciatoia disegnata accanto al comando (decisione A7).
 *
 * ⛔ Ricerca del 04/09/2026: `<kbd>` e' TESTO D'AIUTO, non semantica. La cosa
 * che le tecnologie assistive leggono davvero e' `aria-keyshortcuts`, e va
 * messo **sul controllo** che la scorciatoia attiva, non sull'etichetta. Le
 * due cose si usano insieme: `aria-keyshortcuts` sul pulsante, `<kbd>` accanto
 * per chi guarda. Per questo il modulo esporta anche `applicaScorciatoia()`:
 * chi disegna la riga non deve ricordarsi di fare la meta' invisibile.
 * Fonti: developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-keyshortcuts ·
 * boia.org/blog/aria-keyboard-shortcuts-what-to-know
 *
 * ⛔ Stessa ricerca: niente scorciatoie di UNA lettera sola e niente
 * combinazioni che i lettori di schermo si tengono per se'. `validaScorciatoia`
 * lo impone, invece di lasciarlo alla buona volonta'.
 */
const NOMI_ARIA = new Map([
  ['⇧', 'Shift'], ['⌘', 'Meta'], ['⌥', 'Alt'], ['⌃', 'Control'], ['Ctrl', 'Control'],
  ['↵', 'Enter'], ['⌫', 'Backspace'], ['Esc', 'Escape'], ['␣', 'Space'],
]);
const MODIFICATORI = new Set(['Shift', 'Meta', 'Alt', 'Control']);

/** I tasti come li vuole `aria-keyshortcuts`: «Control+Shift+M». */
export function scorciatoiaAria(keys) {
  const tasti = (Array.isArray(keys) ? keys : [keys]).map((t) => NOMI_ARIA.get(t) || String(t));
  return tasti.join('+');
}

/** Una scorciatoia senza modificatori e' una lettera sola: la ricerca dice di non usarla. */
export function validaScorciatoia(keys) {
  const tasti = (Array.isArray(keys) ? keys : [keys]).map((t) => NOMI_ARIA.get(t) || String(t));
  const soloUno = tasti.length === 1 && tasti[0].length === 1;
  return { valida: !soloUno, motivo: soloUno ? 'scorciatoia di una lettera sola: la intercetta il lettore di schermo' : '' };
}

/** Mette la scorciatoia dove le tecnologie assistive la leggono: sul controllo. */
export function applicaScorciatoia(control, keys) {
  if (!control || typeof control.setAttribute !== 'function') throw new TypeError('controllo non valido');
  const { valida, motivo } = validaScorciatoia(keys);
  if (!valida) throw new TypeError(motivo);
  control.setAttribute('aria-keyshortcuts', scorciatoiaAria(keys));
  return control;
}

export const createKbd = defineComponent('Kbd', (initialProps = {}) => {
  const documentObj = initialProps.document || globalThis.document;
  const kbd = documentObj.createElement('kbd');
  let props = { keys: [], ...initialProps };

  function render() {
    const tasti = Array.isArray(props.keys) ? props.keys : [props.keys];
    if (!tasti.length || tasti.some((t) => !String(t).trim())) throw new TypeError('Kbd richiede almeno un tasto');
    kbd.className = 'talos-kbd';
    kbd.textContent = tasti.join(' ');
    // I simboli non si pronunciano: chi ascolta sente i nomi per esteso.
    kbd.setAttribute('aria-label', scorciatoiaAria(tasti).split('+').join(' '));
    if (props.control) applicaScorciatoia(props.control, tasti);
    if (props.testId) kbd.dataset.testid = props.testId;
  }

  render();
  return {
    element: kbd,
    update(nextProps = {}) { props = { ...props, ...nextProps }; render(); },
    destroy() { kbd.remove(); },
  };
});

export const MODIFICATORI_SCORCIATOIA = MODIFICATORI;
