import { defineComponent } from '../ui/component.js';

/*
 * ListRow — la riga di lavoro del redesign: attrezzi, ricordi, attivita',
 * documenti, rapporti, cartelle, permessi per attrezzo. Sette schermate, una
 * forma sola: icona, titolo, sottotitolo su una riga a se' (decisione E6 — oggi
 * nome e descrizione sono incollati), e una zona di destra per stato e azioni.
 *
 * ⛔ La riga cambia ELEMENTO secondo cosa fa, invece di fingere:
 *   - `interactive: 'select'` dentro un elenco a scelta singola → `<button
 *     role="option">` con `aria-selected` (Capability, Officina, cartelle);
 *   - `interactive: 'press'` → `<button>` normale (suggerimenti, rapporti);
 *   - niente → un `<div>`, che non finisce nel giro della tastiera.
 * Una riga non premibile che sembra premibile e' la bugia piu' comune degli
 * elenchi: qui non e' rappresentabile.
 */
const INTERAZIONI = new Set(['none', 'press', 'select']);

export const createListRow = defineComponent('ListRow', (initialProps = {}) => {
  const documentObj = initialProps.document || globalThis.document;
  const interattivo = initialProps.interactive && initialProps.interactive !== 'none';
  const row = documentObj.createElement(interattivo ? 'button' : 'div');
  const testo = documentObj.createElement('span');
  const titolo = documentObj.createElement('span');
  const sotto = documentObj.createElement('span');
  const aside = documentObj.createElement('span');
  testo.className = 'talos-list-row__text';
  titolo.className = 'talos-list-row__title';
  sotto.className = 'talos-list-row__sub';
  aside.className = 'talos-list-row__aside';
  testo.append(titolo, sotto);

  let props = { interactive: 'none', selected: false, ...initialProps };
  let iconaCorrente = null;
  let asideCorrenti = [];
  const onClick = (event) => { if (typeof props.onPress === 'function') props.onPress(event); };
  if (interattivo) { row.type = 'button'; row.addEventListener('click', onClick); }

  function render() {
    if (!INTERAZIONI.has(props.interactive)) throw new TypeError(`interazione riga non valida: ${props.interactive}`);
    if (props.interactive !== initialProps.interactive && (props.interactive === 'none') !== !interattivo) {
      throw new TypeError('l\'interazione di una riga non cambia dopo il montaggio: cambia l\'elemento');
    }
    if (!props.title) throw new TypeError('ListRow richiede un titolo');
    const classi = ['talos-list-row'];
    if (props.muted) classi.push('talos-list-row--muted');
    if (props.done) classi.push('talos-list-row--done');
    row.className = classi.join(' ');
    titolo.textContent = String(props.title);
    sotto.textContent = props.subtitle ? String(props.subtitle) : '';
    sotto.hidden = !props.subtitle;

    if (props.icon && props.icon !== iconaCorrente) {
      if (iconaCorrente && typeof iconaCorrente.remove === 'function') iconaCorrente.remove();
      props.icon.classList?.add('talos-list-row__icon');
      props.icon.setAttribute?.('aria-hidden', 'true');
      row.insertBefore(props.icon, testo);
      iconaCorrente = props.icon;
    }
    const prossimi = Array.isArray(props.aside) ? props.aside : [];
    if (prossimi.length !== asideCorrenti.length || prossimi.some((n, i) => n !== asideCorrenti[i])) {
      aside.replaceChildren(...prossimi);
      asideCorrenti = prossimi;
    }
    aside.hidden = !prossimi.length;

    if (props.interactive === 'select') {
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(Boolean(props.selected)));
    } else {
      row.removeAttribute('role');
      row.removeAttribute('aria-selected');
    }
    if (props.disabled) row.setAttribute('disabled', '');
    else row.removeAttribute('disabled');
    if (props.testId) row.dataset.testid = props.testId;
  }

  if (!row.contains?.(testo)) row.append(testo, aside);
  render();
  return {
    element: row,
    focus(options) { if (interattivo) row.focus(options); },
    update(nextProps = {}) { props = { ...props, ...nextProps }; render(); },
    destroy() { if (interattivo) row.removeEventListener('click', onClick); row.remove(); },
  };
});
