import { defineComponent } from '../ui/component.js';
import { applicaScorciatoia } from './kbd.js';

/*
 * NavItem e NavGroup — la sidebar a tre blocchi (decisione A1) fatta con la
 * struttura che le tecnologie assistive sanno leggere.
 *
 * ⛔ Ricerca del 04/09/2026: una navigazione e' `<nav>` + `<ul>`/`<li>`, non
 * una fila di bottoni dentro un div. La differenza si sente: con la lista il
 * lettore di schermo annuncia «elenco, 5 voci» e permette di saltarlo; senza,
 * le voci arrivano una a una senza sapere quante sono ne' dove finiscono.
 * ⛔ E quando le regioni di navigazione sono piu' d'una vanno NOMINATE. Qui il
 * nome non e' un `aria-label` (che le traduzioni del browser saltano) ma
 * `aria-labelledby` che punta all'etichetta VISIBILE del blocco: una cosa
 * sola, tradotta una volta, che serve sia a chi guarda sia a chi ascolta.
 * Fonti: a11y-guidelines.orange.com/en/articles/landmarks/ ·
 * developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/navigation_role ·
 * a11y-collective.com/blog/aria-current/
 *
 * ⛔ `aria-current` ha valori diversi e non sono sinonimi: `page` per un luogo
 * dove si va (Capability, Board), `true` per l'elemento corrente di un insieme
 * che pagina non e' (la sessione aperta). Vedi `session-item.js`.
 */
let contatoreGruppi = 0;

export const createNavItem = defineComponent('NavItem', (initialProps = {}) => {
  const documentObj = initialProps.document || globalThis.document;
  const li = documentObj.createElement('li');
  const button = documentObj.createElement('button');
  const etichetta = documentObj.createElement('span');
  const conto = documentObj.createElement('span');
  const contoValore = documentObj.createElement('span');
  const contoUnita = documentObj.createElement('span');
  button.type = 'button';
  etichetta.className = 'talos-nav-item__label';
  conto.className = 'talos-nav-item__count';
  contoUnita.className = 'sr-only';
  // ⛔ Valore e unita' sono due nodi distinti: scrivere `conto.textContent` e
  // poi ri-appendere l'unita' funzionerebbe solo perche' textContent cancella
  // i figli. Dipendere da quell'effetto e' fragile e illeggibile.
  conto.append(contoValore, contoUnita);
  li.append(button);

  let props = { current: false, ...initialProps };
  let iconaCorrente = null;
  let kbdCorrente = null;
  const onClick = (event) => { if (typeof props.onPress === 'function') props.onPress(event); };
  button.addEventListener('click', onClick);

  function render() {
    if (!props.label) throw new TypeError('NavItem richiede una label');
    li.className = 'talos-nav-item-wrap';
    button.className = 'talos-nav-item';
    etichetta.textContent = String(props.label);
    if (props.current) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');

    if (props.icon && props.icon !== iconaCorrente) {
      if (iconaCorrente && typeof iconaCorrente.remove === 'function') iconaCorrente.remove();
      props.icon.setAttribute?.('aria-hidden', 'true');
      button.insertBefore(props.icon, etichetta);
      iconaCorrente = props.icon;
    }
    if (!button.contains?.(etichetta)) button.append(etichetta);

    if (props.count !== undefined && props.count !== null) {
      // Il numero resta visibile da solo; l'unita' e' per chi ascolta:
      // «Capability, 43 attrezzi» invece di «Capability 43».
      contoValore.textContent = String(props.count);
      contoUnita.textContent = props.countUnit ? ` ${props.countUnit}` : '';
      if (!button.contains?.(conto)) button.append(conto);
    } else if (button.contains?.(conto)) {
      conto.remove();
    }

    if (props.shortcut && props.shortcut !== kbdCorrente) {
      applicaScorciatoia(button, props.shortcut.keys || props.shortcut);
      if (props.shortcut.element) {
        button.append(props.shortcut.element);
        kbdCorrente = props.shortcut;
      }
    }
    if (props.testId) button.dataset.testid = props.testId;
  }

  render();
  return {
    element: li,
    focus(options) { button.focus(options); },
    update(nextProps = {}) { props = { ...props, ...nextProps }; render(); },
    destroy() { button.removeEventListener('click', onClick); li.remove(); },
  };
});

/**
 * Un blocco della sidebar: etichetta visibile + elenco vero, legati fra loro.
 * Le voci si passano gia' montate (elementi `<li>`), perche' il gruppo non
 * decide cosa contiene: decide solo come si chiama e come si annuncia.
 */
export const createNavGroup = defineComponent('NavGroup', (initialProps = {}) => {
  const documentObj = initialProps.document || globalThis.document;
  const section = documentObj.createElement('section');
  const testa = documentObj.createElement('div');
  const titolo = documentObj.createElement('span');
  const ul = documentObj.createElement('ul');
  contatoreGruppi += 1;
  titolo.id = initialProps.id || `talos-nav-group-${contatoreGruppi}`;
  titolo.className = 'talos-eyebrow';
  testa.className = 'talos-sidebar__block-head';
  testa.append(titolo);
  ul.className = 'talos-nav-list';
  // Il nome dell'elenco e' l'etichetta VISIBILE, non un attributo duplicato.
  ul.setAttribute('aria-labelledby', titolo.id);
  section.append(testa, ul);

  let props = { items: [], ...initialProps };
  let vociCorrenti = [];

  function render() {
    if (!props.label) throw new TypeError('NavGroup richiede una label visibile');
    section.className = 'talos-sidebar__block';
    titolo.textContent = String(props.label);
    const prossime = Array.isArray(props.items) ? props.items : [];
    if (prossime.length !== vociCorrenti.length || prossime.some((n, i) => n !== vociCorrenti[i])) {
      ul.replaceChildren(...prossime);
      vociCorrenti = prossime;
    }
    if (props.testId) section.dataset.testid = props.testId;
  }

  render();
  return {
    element: section,
    update(nextProps = {}) { props = { ...props, ...nextProps }; render(); },
    destroy() { section.remove(); },
  };
});
