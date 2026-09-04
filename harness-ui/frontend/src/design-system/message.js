import { defineComponent } from '../ui/component.js';

/*
 * Message — un messaggio della conversazione.
 *
 * ⛔ E' un `<article>` con un nome accessibile («Tu, 18:04», «TALOS,
 * claude-opus-5, 18:04»): dentro un `role="log"` le voci senza nome arrivano
 * come un muro di testo, e non si capisce dove finisce una e comincia l'altra.
 * Il nome viene da `aria-labelledby` che punta alla TESTATA VISIBILE — non da
 * un `aria-label`, che i browser non traducono.
 *
 * ⛔ L'autore non e' un colore ne' un avatar: e' testo. Un avatar senza nome
 * accanto e' una decorazione che chi ascolta non riceve, e chi guarda deve
 * imparare a memoria.
 */
const AUTORI = new Set(['user', 'assistant']);
let contatore = 0;

export const createMessage = defineComponent('Message', (initialProps = {}) => {
  const documentObj = initialProps.document || globalThis.document;
  const article = documentObj.createElement('article');
  const testa = documentObj.createElement('div');
  const chi = documentObj.createElement('span');
  const meta = documentObj.createElement('span');
  const corpo = documentObj.createElement('div');
  contatore += 1;
  testa.id = initialProps.id || `talos-message-head-${contatore}`;
  testa.className = 'talos-message__head';
  chi.className = 'talos-message__who';
  meta.className = 'talos-message__meta';
  corpo.className = 'talos-message__body';
  testa.append(chi, meta);
  article.append(testa, corpo);
  article.setAttribute('aria-labelledby', testa.id);

  let props = { author: 'assistant', ...initialProps };
  let avatarCorrente = null;
  let contenutoCorrente = [];

  function render() {
    if (!AUTORI.has(props.author)) throw new TypeError(`autore del messaggio non valido: ${props.author}`);
    if (!props.authorLabel) throw new TypeError('Message richiede il nome dell\'autore, non solo il suo ruolo');
    article.className = `talos-message${props.author === 'user' ? ' talos-message--user' : ''}`;
    chi.textContent = String(props.authorLabel);
    chi.className = `talos-message__who${props.author === 'assistant' ? ' talos-message__who--talos' : ''}`;
    const dettagli = [props.model, props.time].filter(Boolean).join(' · ');
    meta.textContent = dettagli;
    meta.hidden = !dettagli;

    if (props.avatar && props.avatar !== avatarCorrente) {
      if (avatarCorrente && typeof avatarCorrente.remove === 'function') avatarCorrente.remove();
      props.avatar.setAttribute?.('aria-hidden', 'true');
      testa.insertBefore(props.avatar, chi);
      avatarCorrente = props.avatar;
    }

    const contenuto = Array.isArray(props.content) ? props.content : [props.content].filter(Boolean);
    if (contenuto.length !== contenutoCorrente.length || contenuto.some((n, i) => n !== contenutoCorrente[i])) {
      corpo.replaceChildren(...contenuto);
      contenutoCorrente = contenuto;
    }
    if (props.testId) article.dataset.testid = props.testId;
  }

  render();
  return {
    element: article,
    update(nextProps = {}) { props = { ...props, ...nextProps }; render(); },
    destroy() { article.remove(); },
  };
});
