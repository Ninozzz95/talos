import { defineComponent } from '../ui/component.js';

/*
 * Measure — il numero che dichiara da dove viene.
 *
 * Decisione H25 del redesign: «le stime dicono di essere stime». Non e' una
 * convenzione da ricordare mentre si scrive l'interfaccia: e' un componente.
 * Chi passa `provenance: 'estimated'` ottiene la tilde, la sottolineatura
 * punteggiata E la dichiarazione per chi non vede; chi non lo passa ottiene un
 * numero misurato e non puo' sbagliarsi per distrazione.
 *
 * ⛔ La tilde la mette il CSS (`::before`), non il testo: un valore copiato
 * dallo schermo resta un numero, non «~7,5k».
 *
 * ⛔ E la parola «stima» NON sta in un `aria-label`. Ricerca del 04/09/2026:
 * Chrome, Edge e Firefox **saltano `aria-label` quando traducono la pagina**,
 * e la decisione H21 rende l'interfaccia bilingue — un `aria-label` italiano
 * resterebbe italiano in inglese. Sta quindi in uno `<span class="sr-only">`
 * con testo vero, che la traduzione raggiunge e che il catalogo i18n governa.
 * Fonti: web-accessibility-checker.com/en/blog/aria-labels-best-practices ·
 * ratedwithai.com/blog/aria-labels-accessibility-guide-2026
 */
const PROVENANCES = new Set(['measured', 'estimated']);

export const createMeasure = defineComponent('Measure', (initialProps = {}) => {
  const documentObj = initialProps.document || globalThis.document;
  const measure = documentObj.createElement('span');
  const qualificatore = documentObj.createElement('span');
  const valore = documentObj.createElement('span');
  qualificatore.className = 'sr-only';
  measure.append(qualificatore, valore);

  let props = { provenance: 'measured', value: '', unit: '', estimateWord: 'stima:', ...initialProps };

  function testo() {
    const v = String(props.value ?? '');
    return props.unit ? `${v} ${props.unit}` : v;
  }

  function render() {
    if (!PROVENANCES.has(props.provenance)) {
      throw new TypeError(`provenienza misura non valida: ${props.provenance}`);
    }
    const stima = props.provenance === 'estimated';
    measure.className = `talos-mono talos-measure${stima ? ' talos-measure--estimate' : ''}`;
    measure.dataset.provenance = props.provenance;
    // Testo vero, non attributo: la traduzione lo raggiunge.
    qualificatore.textContent = stima ? `${props.estimateWord} ` : '';
    valore.textContent = testo();
    if (props.title) measure.setAttribute('title', props.title);
    else measure.removeAttribute('title');
    if (props.testId) measure.dataset.testid = props.testId;
  }

  render();
  return {
    element: measure,
    update(nextProps = {}) { props = { ...props, ...nextProps }; render(); },
    destroy() { measure.remove(); },
  };
});
