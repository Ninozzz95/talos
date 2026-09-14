/*
 * ⭐⭐ LA CODA DEI MESSAGGI, a parole — 14/09/2026. Owner: «i competitor lo fanno, lo facciamo anche noi».
 *
 * Trovato col giro vero del 13/09: dopo uno stop il banner diceva ancora «parte alla fine di questo giro», e la coda non si
 * vedeva in un'altra finestra né dopo una ricarica. Da oggi la coda la tiene il server (`talos.coda`, GET .../queue), e
 * questo modulo dice soltanto COSA mostrare per lo stato che arriva.
 *
 * Chi l'ha già pensato, letto nei cloni il 14/09/2026:
 *   · Hermes desktop, `i18n/en.ts`: «N Queued», «N Queued — paused», «Paused by Stop — resume sending the queued turns»;
 *     e per ogni voce Edit, Steer («redirect the live turn now»), Send, Delete (`queue-panel.tsx`).
 *   · Codex TUI, `pending_input_preview.rs`: «Queued follow-up inputs».
 *   · Da noi il kernel consegna un messaggio in coda quando il modello FINISCE DI RISPONDERE (`talosHarness.mjs`, zero
 *     chiamate): «parte alla fine di questo giro» era vero solo a giro vivo, e falso dopo uno stop.
 *
 * ⛔ Le parole seguono il vocabolario che la persona ha già visto: «Indirizza ora» è il pulsante del bivio dell'Invio
 *   (stesso gesto: il messaggio entra nel giro vivo come correzione); «Invia ora» è il gesto a giro fermo; «Togli» resta.
 * ⛔ Due azioni, non di più: oltre due si va in un menu (regola di casa, 10/09).
 */

/*
 * ⛔ 14/09, giro vero a 1440 px: con un tetto di 60 caratteri la riga si fermava a «…che dica quan…» con spazio libero accanto,
 *   e il titolo ripeteva lo stesso testo tagliato — il messaggio intero non si leggeva da nessuna parte. La riga si accorcia da
 *   sola (ellissi del foglio di stile) alla larghezza che ha; qui restano solo due tetti contro un messaggio lunghissimo nel DOM.
 */
const LUNGHEZZA_ANTEPRIMA = 200;
const LUNGHEZZA_TITOLO = 1000;

function accorcia(testo, massimo) {
  const pulito = String(testo ?? '').replace(/\s+/g, ' ').trim();
  return pulito.length > massimo ? `${pulito.slice(0, massimo - 1).trimEnd()}…` : pulito;
}

/**
 * Lo stato della coda come arriva dal server, reso sicuro: voci con un testo, pausa solo se c'è qualcosa da mettere in pausa.
 * @param {unknown} valore
 * @returns {{voci:Array<{id:string|null, testo:string, immagini:number}>, inPausa:boolean}}
 */
export function normalizzaStatoCoda(valore) {
  const voci = (Array.isArray(valore?.voci) ? valore.voci : [])
    .map((v) => (typeof v === 'string' ? { id: null, testo: v, immagini: 0 } : {
      id: typeof v?.id === 'string' ? v.id : null,
      testo: typeof v?.testo === 'string' ? v.testo : '',
      immagini: Number.isFinite(v?.immagini) ? v.immagini : 0,
    }))
    .filter((v) => v.testo.trim() !== '');
  return { voci, inPausa: Boolean(valore?.inPausa) && voci.length > 0 };
}

/**
 * Cosa dice il banner per uno stato della coda. `null` quando non c'è niente in coda: il banner non si mostra.
 * @param {{voci?:Array, inPausa?:boolean}} stato
 * ⛔ 14/09, dalle foto del banner: a 1440×900 con la colonna destra aperta la spiegazione dopo il trattino non si vedeva MAI,
 *   tagliata dai puntini. Un lavoro per elemento: il badge dice lo STATO, il testo mostra il MESSAGGIO, il pulsante dice
 *   l'AZIONE, e la spiegazione (quando parte) va nel titolo — non in una riga che non la può contenere.
 * ⛔ 14/09, seconda foto (1280 px, colonna destra aperta): anche «(+1 altro)» in coda al testo finiva nei puntini, cioè si
 *   perdeva proprio QUANTI messaggi aspettano. Il numero sta nel badge, che non si accorcia, come fa Hermes («N Queued —
 *   paused»); il testo può accorciarsi, perché intero sta nel titolo (`titoloTesto`).
 * @returns {null|{conteggio:string, tono:'neutro'|'attenzione', testo:string, spiegazione:string, titoloTesto:string, azione:string, titoloAzione:string}}
 */
export function descriviCoda(stato, { giroVivo = false } = {}) {
  const { voci, inPausa } = normalizzaStatoCoda(stato);
  if (voci.length === 0) return null;
  const anteprima = `«${accorcia(voci[0].testo, LUNGHEZZA_ANTEPRIMA)}»`;
  const intero = `«${accorcia(voci[0].testo, LUNGHEZZA_TITOLO)}»`;
  /*
   * ⛔ 14/09, giro vero (banco 5475): la PAUSA la decide lo stop, l'AZIONE la decide il giro — due fatti diversi. Ripreso il
   *   giro con «Invia ora», la voce rimasta in pausa diceva «Invia ora» e «Il giro è fermo» mentre il modello lavorava, e
   *   premerla indirizzava il giro vivo. Hermes mostra «Steer» solo con un turno vivo (`const canSteer = busy && …`) e cambia
   *   le parole di «Send» con lo stesso `busy` (apps/desktop/src/app/chat/composer/queue-panel.tsx:79 e :118, clone 365e283
   *   del 02/09/2026, letto il 14/09/2026).
   */
  const azione = giroVivo
    ? { azione: 'Indirizza ora', titoloAzione: 'Lo porta dentro il giro in corso, come correzione' }
    : { azione: 'Invia ora', titoloAzione: 'Riprende la conversazione con questo messaggio' };
  if (inPausa) {
    const spiegazione = 'In pausa dallo stop: parte solo se lo invii tu';
    return { conteggio: `${voci.length} in pausa`, tono: 'attenzione', testo: anteprima, spiegazione, titoloTesto: `${intero} — ${spiegazione}`, ...azione };
  }
  const spiegazione = 'Parte quando TALOS finisce di rispondere';
  return { conteggio: `${voci.length} in coda`, tono: 'neutro', testo: anteprima, spiegazione, titoloTesto: `${intero} — ${spiegazione}`, ...azione };
}
