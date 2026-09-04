import { defineComponent } from '../ui/component.js';

/*
 * ActivityBundle — gli attrezzi di un giro, raccolti (decisione B19).
 *
 * ⛔ La testata dice quanti sono E quanti sono falliti PRIMA di aprirsi: e' la
 * ragione per cui il blocco esiste. Un riassunto che dice solo «7 attrezzi»
 * costringe ad aprire ogni giro per sapere se e' andato bene, e allora tanto
 * vale non raccoglierli.
 *
 * ⛔ Disclosure vera: `aria-expanded` sul pulsante e `aria-controls` verso il
 * corpo, che resta `hidden` finche' non si apre. Non un `display:none` deciso
 * dal CSS senza che nessuno lo dichiari.
 */
export const createActivityBundle = defineComponent('ActivityBundle', (initialProps = {}) => {
  const documentObj = initialProps.document || globalThis.document;
  const blocco = documentObj.createElement('div');
  const testa = documentObj.createElement('button');
  const riassunto = documentObj.createElement('span');
  const corpo = documentObj.createElement('div');
  let contatore = 0;
  contatore += 1;
  blocco.className = 'talos-card talos-activity';
  testa.type = 'button';
  testa.className = 'talos-activity__head';
  riassunto.className = 'talos-activity__summary';
  corpo.className = 'talos-activity__body';
  corpo.id = initialProps.id || `talos-activity-body-${Math.random().toString(36).slice(2, 8)}`;
  testa.setAttribute('aria-controls', corpo.id);
  testa.append(riassunto);
  blocco.append(testa, corpo);

  let props = { open: false, failed: 0, ...initialProps };
  let contenutoCorrente = [];
  let asideCorrenti = [];
  const onClick = () => {
    props = { ...props, open: !props.open };
    render();
    if (typeof props.onToggle === 'function') props.onToggle(props.open);
  };
  testa.addEventListener('click', onClick);

  function render() {
    if (!Number.isInteger(props.count) || props.count < 0) throw new TypeError('ActivityBundle richiede quanti attrezzi (un intero)');
    if (!props.summaryWord) throw new TypeError('ActivityBundle richiede le parole del riassunto');
    const falliti = Number(props.failed || 0);
    // «7 attrezzi usati in questo giro · 1 fallito» — l'esito sta nella testata.
    riassunto.textContent = falliti > 0
      ? `${props.count} ${props.summaryWord} · ${falliti} ${props.failedWord || 'falliti'}`
      : `${props.count} ${props.summaryWord}`;
    testa.setAttribute('aria-expanded', String(Boolean(props.open)));
    corpo.hidden = !props.open;

    const contenuto = Array.isArray(props.content) ? props.content : [];
    if (contenuto.length !== contenutoCorrente.length || contenuto.some((n, i) => n !== contenutoCorrente[i])) {
      corpo.replaceChildren(...contenuto);
      contenutoCorrente = contenuto;
    }
    const aside = Array.isArray(props.aside) ? props.aside : [];
    if (aside.length !== asideCorrenti.length || aside.some((n, i) => n !== asideCorrenti[i])) {
      for (const nodo of asideCorrenti) nodo.remove?.();
      testa.append(...aside);
      asideCorrenti = aside;
    }
    if (props.testId) blocco.dataset.testid = props.testId;
  }

  render();
  return {
    element: blocco,
    update(nextProps = {}) { props = { ...props, ...nextProps }; render(); },
    destroy() { testa.removeEventListener('click', onClick); blocco.remove(); },
  };
});
