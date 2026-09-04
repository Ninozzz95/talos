import { defineComponent } from '../ui/component.js';

/*
 * SignedReceipt — la prova che l'azione e' avvenuta come dichiarato.
 *
 * E' il nostro differenziatore e oggi non si vede da nessuna parte (decisione
 * E14). Il componente esiste perche' una ricevuta senza impronta non e' una
 * ricevuta: `hash` e' obbligatorio, e non si monta senza.
 *
 * ⛔ L'impronta e' abbreviata a schermo («a1f4…9c02») ma INTERA nel titolo e
 * copiabile: un'impronta che non si puo' confrontare non prova niente.
 */
export const createSignedReceipt = defineComponent('SignedReceipt', (initialProps = {}) => {
  const documentObj = initialProps.document || globalThis.document;
  const riga = documentObj.createElement('div');
  const etichetta = documentObj.createElement('span');
  const testo = documentObj.createElement('span');
  const impronta = documentObj.createElement('code');
  riga.className = 'talos-receipt';
  etichetta.className = 'talos-badge talos-badge--success talos-badge--sm';
  testo.className = 'talos-receipt__text';
  impronta.className = 'talos-receipt__hash';
  riga.append(etichetta, testo, impronta);

  let props = { label: 'Ricevuta firmata', ...initialProps };

  function accorcia(valore) {
    const v = String(valore);
    return v.length <= 12 ? v : `${v.slice(0, 4)}…${v.slice(-4)}`;
  }

  function render() {
    if (!props.hash) throw new TypeError('SignedReceipt richiede un\'impronta: una ricevuta senza impronta non prova niente');
    if (!props.text) throw new TypeError('SignedReceipt richiede il testo di cosa è stato fatto');
    etichetta.textContent = String(props.label);
    testo.textContent = String(props.text);
    impronta.textContent = accorcia(props.hash);
    // Abbreviata a schermo, intera dove si può confrontare e copiare.
    impronta.setAttribute('title', String(props.hash));
    impronta.dataset.hash = String(props.hash);
    if (props.testId) riga.dataset.testid = props.testId;
  }

  render();
  return {
    element: riga,
    update(nextProps = {}) { props = { ...props, ...nextProps }; render(); },
    destroy() { riga.remove(); },
  };
});
