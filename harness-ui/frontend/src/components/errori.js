/*
 * Gli errori del giro, detti a una persona.
 *
 * ⛔ 06/9, owner con due screenshot: «con un modello locale ogni tanto spunta questo» —
 * `[internal-error] flusso SSE senza contenuto ne tool_calls` — e, subito dopo,
 * `[internal-error] HTTP 400 dopo 4 tentativi: {"error":{"code":400,"message":"request (17993 tokens)
 * exceeds the available context size (16384 tokens), try increasing it","type":"exceed_context_size_error",
 * "n_prompt_tokens":17993,"n_ctx":16384}}`. Cioè: gergo e JSON crudo, davanti a chi sta lavorando.
 *
 * Il secondo non è nemmeno un guasto: è un limite dichiarato. La finestra del modello locale è più
 * piccola di ciò che gli abbiamo mandato, e il numero esatto sta dentro l'errore — buttarlo via e
 * mostrare la graffa è il modo peggiore di usarlo.
 *
 * Qui vive UNA mappa sola: da ciò che dice il server a «cosa è successo · perché · cosa puoi fare».
 * Il testo tecnico non sparisce mai — resta come dettaglio secondario, perché è quello che si incolla
 * in una segnalazione. Nessuna riga inventa un rimedio che TALOS non ha: se non sappiamo cosa fare,
 * lo diciamo.
 *
 * Ricerca 06/09/2026, prima di scrivere:
 * - llama.cpp `--ctx-size`/`-c` è la finestra del server locale; con `--parallel N` viene DIVISA per N
 *   (ggml-org/llama.cpp #11681), e alcuni modelli tappano comunque lo slot alla loro finestra di
 *   addestramento: si verifica il runtime caricato, non il flag di avvio (ggml-org/llama.cpp #18376).
 * - Il contesto non azzerato fra un messaggio e l'altro produce lo stesso 400 anche su prompt corti
 *   (continuedev/continue #9797): per questo il primo rimedio è compattare, non alzare la finestra.
 */

/** Il codice tecnico e il messaggio grezzo, come li manda il server. */
const REGOLE = [
  {
    id: 'contesto-pieno',
    riconosce: (t) => /exceed_context_size|exceeds the available context size|context (?:size|length) exceeded/i.test(t),
    spiega: (t) => {
      const numeri = /\((\d+)\s*tokens?\)[^(]*\((\d+)\s*tokens?\)/i.exec(t) || [];
      const chiesti = Number(numeri[1]) || null;
      const finestra = Number(numeri[2]) || Number((/n_ctx"?\s*:\s*(\d+)/i.exec(t) || [])[1]) || null;
      const misura = chiesti && finestra ? ` Servivano ${chiesti.toLocaleString('it-IT')} token, la finestra ne tiene ${finestra.toLocaleString('it-IT')}.` : '';
      return {
        cosa: 'La conversazione non entra nella finestra del modello.',
        perche: `Questo modello legge una quantità di testo limitata, e la sessione l'ha superata.${misura}`,
        rimedi: [
          'Compatta il contesto: il riassunto sostituisce la storia e il giro riparte più leggero.',
          'Scegli un modello con una finestra più grande, o riavvia quello locale con una finestra maggiore (in llama.cpp è «--ctx-size»; attenzione: con «--parallel» viene divisa fra gli slot).',
          'Restringi la cartella della sessione: un albero grande entra nel contesto a ogni giro.',
        ],
      };
    },
  },
  {
    id: 'risposta-vuota',
    riconosce: (t) => /flusso SSE senza contenuto|senza contenuto ne tool_calls|empty (?:response|stream)/i.test(t),
    spiega: () => ({
      cosa: 'Il modello ha chiuso il turno senza dire niente e senza chiamare nessun attrezzo.',
      perche: 'Capita soprattutto con i modelli locali: la generazione finisce subito, per un modello di chat servito senza il suo formato di conversazione, per una finestra già piena, o per un campionamento che tronca al primo token.',
      rimedi: [
        'Riprova il giro: se succede una volta sola, era la generazione.',
        'Se si ripete, guarda il modello nel Laboratorio: formato della conversazione e finestra dichiarata.',
        'Prova lo stesso messaggio con un modello di rete: se lì funziona, il problema è nel runtime locale, non nella sessione.',
      ],
    }),
  },
  {
    id: 'giri-esauriti',
    riconosce: (t, codice) => codice === 'giri-esauriti',
    spiega: () => ({
      cosa: 'Il giro ha finito i passi che aveva a disposizione senza chiudere il compito.',
      perche: 'Ogni sessione ha un tetto di passi: serve a non lasciare un agente a girare all’infinito.',
      rimedi: [
        'Il prossimo messaggio continua lo stesso compito nella stessa sessione.',
        'Premi «Nuova» per iniziare un compito separato, con il suo tetto.',
      ],
    }),
  },
  {
    id: 'senza-canale-approvazione',
    riconosce: (t) => /canale di approvazione|approvazione non disponibile/i.test(t),
    spiega: () => ({
      cosa: 'L’agente ha chiesto un permesso che questa sessione non è in grado di chiedere a te.',
      perche: 'Il permesso dell’attrezzo dice «chiedi conferma», ma la sessione è partita senza un canale per farlo.',
      rimedi: ['Riapri il foglio dei permessi e scegli di nuovo, poi riavvia il giro.'],
    }),
  },
  {
    id: 'rete',
    riconosce: (t) => /ECONNREFUSED|ETIMEDOUT|fetch failed|network error|socket hang up/i.test(t),
    spiega: () => ({
      cosa: 'La richiesta non è arrivata al modello.',
      perche: 'Il servizio non ha risposto: può essere la rete, il fornitore, o il runtime locale spento.',
      rimedi: ['Controlla la connessione e riprova.', 'Se il modello è locale, verifica che il runtime sia acceso nel Laboratorio.'],
    }),
  },
  {
    id: 'quota',
    riconosce: (t) => /\b429\b|rate.?limit|quota|insufficient (?:credit|balance)/i.test(t),
    spiega: () => ({
      cosa: 'Il fornitore ha rifiutato la richiesta per limiti di traffico o di credito.',
      perche: 'Non è un errore del compito: è il conto o la soglia di chiamate al minuto.',
      rimedi: ['Aspetta qualche istante e riprova.', 'Oppure scegli un altro modello o un altro fornitore.'],
    }),
  },
];

/**
 * Traduce l'errore di un giro. Torna sempre qualcosa: se non riconosciamo la forma, lo diciamo
 * invece di inventare una causa.
 * @param {string} messaggio il testo del server
 * @param {string} [codice] il codice del server (`internal-error`, `giri-esauriti`, …)
 * @returns {{id:string, cosa:string, perche:string, rimedi:string[], tecnico:string, riconosciuto:boolean}}
 */
export function spiegaErrore(messaggio, codice = '') {
  const tecnico = String(messaggio ?? '').trim();
  const testo = `${codice} ${tecnico}`;
  for (const regola of REGOLE) {
    if (!regola.riconosce(testo, codice)) continue;
    const s = regola.spiega(tecnico);
    return { id: regola.id, ...s, tecnico, riconosciuto: true };
  }
  return {
    id: 'sconosciuto',
    cosa: 'Il giro si è interrotto per un errore.',
    perche: 'Questa forma di errore non è ancora tradotta: qui sotto c’è il testo che ha mandato il server, così com’è.',
    rimedi: ['Riprova il giro.', 'Se si ripete, apri Doctor e allega il testo qui sotto.'],
    tecnico,
    riconosciuto: false,
  };
}

/** La stessa spiegazione in una riga sola, per i posti stretti (elenco sessioni, riepiloghi). */
export function erroreInUnaRiga(messaggio, codice = '') {
  const s = spiegaErrore(messaggio, codice);
  return s.cosa;
}
