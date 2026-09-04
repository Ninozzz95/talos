import { createConversation, createMessage } from '../../design-system/index.js';
import { selectConversation } from '../../state/selectors.js';

/*
 * La conversazione: seconda superficie dell'estrazione modulare (fase 4).
 *
 * ⛔ Qui vive la regola che ha deciso il disegno della fase 4: mentre il
 * modello scrive NON si annuncia ogni pezzo. Lo stato ha gia' il segnale
 * giusto — `conversation.streamingMessageId` passa da null a un id quando
 * comincia e torna null quando finisce — quindi la disciplina si aggancia a un
 * dato che esiste, senza inventare un secondo stato.
 *   null → id : «TALOS sta rispondendo», e la regione viva tace
 *   id → null : si annuncia il messaggio COMPLETO, una volta sola
 *
 * ⛔ Ricerca del 04/09/2026 sulle interfacce che scrivono in streaming, e ha
 * cambiato la forma di questo file: **i token arrivano piu' in fretta di
 * quanto il browser dipinga**. Ridisegnare a ogni delta produce aggiornamenti
 * per fotogrammi che nessuno vedra' mai, e ognuno costa. Qui l'ultimo stato si
 * accumula e il ridisegno si accorpa in UN fotogramma (`schedule`, iniettabile
 * perche' i test devono poterlo far girare a mano).
 * Fonti: smashingmagazine.com/2026/05/designing-stable-interfaces-streaming-content/ ·
 * sitepoint.com/streaming-backends-react-controlling-re-render-chaos/
 *
 * ⛔ Stessa ricerca: l'aggancio in fondo si corregge **nello stesso fotogramma**
 * del ridisegno, misurando l'altezza prima e dopo. Farlo dopo produce il salto
 * che tutti conoscono. E se la persona e' risalita a leggere, NON la si
 * trascina: si resta dov'e'.
 *
 * ⛔ I messaggi si RIUSANO: un delta aggiorna il testo del paragrafo gia'
 * montato, non ricostruisce il messaggio. Ricostruirlo butterebbe via la
 * selezione di chi sta leggendo, oltre a essere lavoro sprecato.
 */
const NOMI_AUTORE = new Map([['user', 'user'], ['assistant', 'assistant']]);
const SOGLIA_FONDO = 24;

function schedulerPredefinito(documentObj) {
  const finestra = documentObj?.defaultView;
  if (finestra && typeof finestra.requestAnimationFrame === 'function') {
    return (fn) => finestra.requestAnimationFrame(fn);
  }
  return (fn) => Promise.resolve().then(fn);
}

export function createConversationSurface({ documentObj, store, labels, schedule, testId }) {
  if (!documentObj || !store) throw new TypeError('dipendenze conversazione mancanti');
  if (!labels || !labels.log || !labels.you || !labels.assistant) {
    throw new TypeError('la conversazione richiede le sue etichette (log, you, assistant)');
  }
  const pianifica = typeof schedule === 'function' ? schedule : schedulerPredefinito(documentObj);

  const conversazione = createConversation({
    document: documentObj,
    label: labels.log,
    streamingWord: labels.streaming || 'TALOS sta rispondendo',
    announce: (messaggio) => { if (typeof labels.announce === 'function') labels.announce(messaggio); },
    testId,
  });
  const contenitore = conversazione.element;

  let messaggiMontati = new Map();
  let scrivevaId = null;
  let ultimaConversazione = null;
  let programmato = false;
  let ridisegni = 0;

  function eraInFondo() {
    const altezza = Number(contenitore.scrollHeight);
    const visibile = Number(contenitore.clientHeight);
    const posizione = Number(contenitore.scrollTop);
    if (!Number.isFinite(altezza) || !Number.isFinite(visibile) || !Number.isFinite(posizione)) return true;
    return posizione + visibile >= altezza - SOGLIA_FONDO;
  }

  function disegna(conversation) {
    ridisegni += 1;
    // L'aggancio si decide PRIMA di toccare il DOM e si applica nello stesso giro.
    const agganciato = eraInFondo();
    const messaggi = Array.isArray(conversation.messages) ? conversation.messages : [];

    for (const [id, montato] of messaggiMontati) {
      if (!messaggi.some((messaggio) => messaggio.id === id)) {
        montato.componente.destroy();
        messaggiMontati.delete(id);
      }
    }

    const ordinati = [];
    for (const messaggio of messaggi) {
      const ruolo = NOMI_AUTORE.get(messaggio.role) || 'assistant';
      let montato = messaggiMontati.get(messaggio.id);
      if (montato) {
        // Un delta cambia il TESTO, non il messaggio: si riusa il paragrafo.
        if (montato.testo !== messaggio.content) {
          montato.paragrafo.textContent = String(messaggio.content ?? '');
          montato.testo = messaggio.content;
        }
      } else {
        const paragrafo = documentObj.createElement('p');
        paragrafo.textContent = String(messaggio.content ?? '');
        const componente = createMessage({
          document: documentObj,
          author: ruolo,
          authorLabel: ruolo === 'user' ? labels.you : labels.assistant,
          model: messaggio.model || null,
          time: messaggio.timeLabel || null,
          content: [paragrafo],
          testId: `conversation-message-${messaggio.id}`,
        });
        montato = { componente, paragrafo, testo: messaggio.content };
        messaggiMontati.set(messaggio.id, montato);
      }
      ordinati.push(montato.componente.element);
    }

    const scriveOra = conversation.streamingMessageId || null;
    if (scriveOra && !scrivevaId) {
      conversazione.update({ content: ordinati, streaming: true });
    } else if (!scriveOra && scrivevaId) {
      // Il messaggio appena finito e' quello che l'annuncio deve leggere intero.
      const finito = messaggiMontati.get(scrivevaId);
      conversazione.update({ content: ordinati, streaming: false, completedText: finito ? finito.testo : '' });
    } else {
      conversazione.update({ content: ordinati });
    }
    scrivevaId = scriveOra;

    // ⛔ Chi e' risalito a leggere non viene trascinato in fondo.
    if (agganciato && Number.isFinite(Number(contenitore.scrollHeight))) {
      contenitore.scrollTop = contenitore.scrollHeight;
    }
  }

  function accorpa(conversation) {
    ultimaConversazione = conversation;
    if (programmato) return;
    programmato = true;
    pianifica(() => {
      programmato = false;
      if (!distrutta && ultimaConversazione) disegna(ultimaConversazione);
    });
  }

  const unsubscribe = store.subscribe(selectConversation, accorpa, { equal: Object.is });

  let distrutta = false;
  return Object.freeze({
    element: contenitore,
    /** Quante volte il DOM e' stato davvero ridisegnato: serve alle prove. */
    ridisegni: () => ridisegni,
    update() {},
    destroy() {
      if (distrutta) return false;
      distrutta = true;
      unsubscribe();
      for (const montato of messaggiMontati.values()) montato.componente.destroy();
      messaggiMontati = new Map();
      conversazione.destroy();
      return true;
    },
  });
}
