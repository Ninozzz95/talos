import { defineComponent } from '../ui/component.js';

/*
 * Conversation — il contenitore dei giri, e la regola su COSA si annuncia.
 *
 * ⛔ Ricerca del 04/09/2026, ed e' il vincolo che cambia tutto: annunciare
 * ogni token mentre il modello scrive **annega** chi ascolta. La forma giusta
 * e' tre momenti distinti:
 *   1. parte la risposta  → un annuncio breve, «TALOS sta rispondendo»;
 *   2. mentre scrive      → la regione viva TACE (`aria-busy="true"`), il
 *                           testo compare ma non viene letto un pezzo alla volta;
 *   3. la risposta finisce→ si annuncia il messaggio COMPLETO, una volta sola.
 * Il contenitore e' `role="log"`, che porta con se' `aria-live="polite"` e
 * `aria-atomic="false"`: le voci nuove si annunciano senza rileggere tutto.
 * Fonti: w3.org/WAI/WCAG21/Techniques/aria/ARIA23 ·
 * callsphere.ai/blog/accessibility-ai-agent-interfaces-screen-readers-keyboard-inclusive-design
 *
 * ⛔ Le richieste di permesso NON passano da qui: bloccano il lavoro e vanno
 * annunciate a parte, subito. Vedi `approval-card.js`.
 */
export const createConversation = defineComponent('Conversation', (initialProps = {}) => {
  const documentObj = initialProps.document || globalThis.document;
  const log = documentObj.createElement('div');
  const colonna = documentObj.createElement('div');
  log.className = 'talos-conversation';
  colonna.className = 'talos-conversation__column';
  log.append(colonna);
  log.setAttribute('role', 'log');

  let props = {
    streamingWord: 'TALOS sta rispondendo',
    streaming: false,
    content: [],
    ...initialProps,
  };
  let scriveva = false;
  let contenutoCorrente = [];

  function annuncia(messaggio) {
    if (typeof props.announce === 'function') props.announce(messaggio);
  }

  function render() {
    if (!props.label) throw new TypeError('Conversation richiede un nome: un log senza nome non si distingue dagli altri');
    log.setAttribute('aria-label', String(props.label));
    const scrive = Boolean(props.streaming);
    log.setAttribute('aria-busy', String(scrive));

    const contenuto = Array.isArray(props.content) ? props.content : [];
    if (contenuto.length !== contenutoCorrente.length || contenuto.some((n, i) => n !== contenutoCorrente[i])) {
      colonna.replaceChildren(...contenuto);
      contenutoCorrente = contenuto;
    }

    // I due soli momenti in cui si parla: l'inizio, e la fine col testo intero.
    if (scrive && !scriveva) annuncia(props.streamingWord);
    if (!scrive && scriveva && props.completedText) annuncia(String(props.completedText));
    scriveva = scrive;

    if (props.testId) log.dataset.testid = props.testId;
  }

  render();
  return {
    element: log,
    update(nextProps = {}) { props = { ...props, ...nextProps }; render(); },
    destroy() { log.remove(); },
  };
});
