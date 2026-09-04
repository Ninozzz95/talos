import { defineComponent } from '../ui/component.js';

/*
 * Composer — dove si scrive, e le tre cose che il redesign ci mette accanto:
 * la striscia di stato mentre lavora (B31), la coda a vista (B15), e le
 * pillole che dicono modello, permesso e giri (B10-B12).
 *
 * ⛔ La coda e' VISIBILE per costruzione: un messaggio accodato che non si
 * vede e' un messaggio perso, ed e' il motivo per cui la decisione B15 chiede
 * di mostrarne il numero e di poterne togliere uno.
 *
 * ⛔ La striscia di stato e' `role="status"` (annuncio educato): dice cosa sta
 * facendo senza interrompere. Non e' un `alert`: un giro che lavora non e'
 * un'emergenza, e trattarlo come tale insegna a ignorare gli allarmi veri.
 *
 * ⛔ Il pulsante di invio DIVENTA «ferma» mentre lavora (decisione B17): un
 * solo posto dove guardare. Il componente cambia etichetta e stato insieme,
 * cosi' non possono divergere.
 */
export const createComposer = defineComponent('Composer', (initialProps = {}) => {
  const documentObj = initialProps.document || globalThis.document;
  const piede = documentObj.createElement('div');
  const striscia = documentObj.createElement('div');
  const strisciaPulsazione = documentObj.createElement('span');
  const strisciaTesto = documentObj.createElement('span');
  const coda = documentObj.createElement('div');
  const codaConto = documentObj.createElement('span');
  const codaTesto = documentObj.createElement('span');
  const guscio = documentObj.createElement('div');
  const campo = documentObj.createElement('textarea');
  const barra = documentObj.createElement('div');
  const pillole = documentObj.createElement('div');
  const invia = documentObj.createElement('button');

  piede.className = 'talos-chat-foot';
  striscia.className = 'talos-status-strip';
  striscia.setAttribute('role', 'status');
  strisciaPulsazione.className = 'talos-status-strip__pulse';
  strisciaPulsazione.setAttribute('aria-hidden', 'true');
  strisciaTesto.className = 'talos-status-strip__what';
  coda.className = 'talos-queue';
  codaConto.className = 'talos-badge talos-badge--sm';
  codaTesto.className = 'talos-queue__text';
  guscio.className = 'talos-composer';
  campo.className = 'talos-composer__input';
  barra.className = 'talos-composer__bar';
  pillole.className = 'talos-composer__pills';
  invia.type = 'button';
  striscia.append(strisciaPulsazione, strisciaTesto);
  coda.append(codaConto, codaTesto);
  barra.append(pillole, invia);
  guscio.append(campo, barra);
  piede.append(striscia, coda, guscio);

  let props = { busy: false, queue: [], pills: [], ...initialProps };
  let pilloleCorrenti = [];
  const onInvia = () => {
    if (props.busy) { if (typeof props.onStop === 'function') props.onStop(); return; }
    if (typeof props.onSend === 'function') props.onSend(campo.value);
  };
  invia.addEventListener('click', onInvia);

  function render() {
    if (!props.label) throw new TypeError('Composer richiede il nome del campo');
    if (!props.sendLabel || !props.stopLabel) throw new TypeError('Composer richiede i nomi dei due stati del pulsante (invia e ferma)');
    campo.setAttribute('aria-label', String(props.label));
    if (props.placeholder) campo.placeholder = String(props.placeholder);
    if (props.value !== undefined && campo.value !== props.value) campo.value = String(props.value);

    // La striscia c'e' solo mentre lavora: uno stato vuoto non si annuncia.
    striscia.hidden = !props.busy;
    strisciaTesto.textContent = props.busy && props.statusText ? String(props.statusText) : '';

    const inCoda = Array.isArray(props.queue) ? props.queue : [];
    coda.hidden = !inCoda.length;
    codaConto.textContent = inCoda.length ? `${inCoda.length} ${props.queueWord || 'in coda'}` : '';
    codaTesto.textContent = inCoda.length ? String(inCoda[0]) : '';

    // Un solo pulsante, due stati che non possono divergere.
    invia.className = `talos-send${props.busy ? ' talos-send--stop' : ''}`;
    invia.textContent = props.busy ? String(props.stopLabel) : String(props.sendLabel);
    invia.setAttribute('aria-label', props.busy ? String(props.stopLabel) : String(props.sendLabel));

    const prossime = Array.isArray(props.pills) ? props.pills : [];
    if (prossime.length !== pilloleCorrenti.length || prossime.some((n, i) => n !== pilloleCorrenti[i])) {
      pillole.replaceChildren(...prossime);
      pilloleCorrenti = prossime;
    }
    if (props.testId) piede.dataset.testid = props.testId;
  }

  render();
  return {
    element: piede,
    focus(options) { campo.focus(options); },
    update(nextProps = {}) { props = { ...props, ...nextProps }; render(); },
    destroy() { invia.removeEventListener('click', onInvia); piede.remove(); },
  };
});
