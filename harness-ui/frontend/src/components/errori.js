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
 *
 * ⛔⛔⛔ 09/9 — TRE GIRI VERI con `z-ai/glm-5.3-flash`: la compattazione automatica del contesto è
 * fallita e in chat è uscita la carta GENERICA («Il giro si è interrotto per un errore» · «Questa
 * forma di errore non è ancora tradotta»). Il server, invece, l'errore lo diceva benissimo e in
 * italiano — tanto che la modale «Context Manager» lo mostrava già in rosso sotto lo stato del
 * lavoro (`context-compactor.js`, `view.job.error.message`). Chi guardava la chat capiva solo che
 * il giro era «errore», e sembrava colpa della domanda appena scritta.
 *
 * Ricerca 09/09/2026, prima di scrivere:
 * - Nous Research, Hermes Agent, `docs/micro-compaction.md` (letto 09/09/2026): quando una sintesi
 *   fallisce «the transcript is left untouched and the failure is counted», e dopo tre fallimenti di
 *   fila il cursore avanza invece di ritentare all'infinito. ⇒ «gli originali restano» non è una
 *   rassicurazione di cortesia: è il fatto che descrive la macchina, e va detto per primo. ⛔ Vincolo
 *   scoperto lì e non deducibile dal nostro codice: da Hermes un fallimento di compattazione NON
 *   interrompe il turno; da noi sì, perché arriva solo quando il contesto non entra più.
 * - Nielsen Norman Group, «Error-Message Guidelines» (14/05/2023) più le euristiche collegate, lette
 *   via ctx7 il 09/09/2026: un messaggio generico come «An error occurred» «lacks context»; si
 *   descrive il problema con precisione, si offre un rimedio, e si evitano «technical jargon,
 *   obscure error codes, and abbreviations, reserving them only for technical diagnostic purposes».
 *   ⇒ il codice `CTX_*` vive SOLO nel dettaglio richiuso, mai come titolo.
 * - Nielsen Norman Group, «Hostile Patterns in Error Messages» (30/10/2022): non si usa lo stile
 *   dell'errore per ciò che non è un errore di chi legge — «Let's assist users, not admonish them».
 *   ⇒ la carta della compattazione ha badge, titolo e tono suoi (vedi `vestizioneErrore`), non il
 *   rosso di «hai sbagliato tu».
 * - Pencil & Paper, «Error Message UX, Handling & Feedback», Meganne Ohata (25/10/2024): gli errori
 *   si dividono fra quelli che nascono DAL SISTEMA e quelli che nascono da un'incomprensione di chi
 *   usa lo strumento; «Share details about what happened and what impact it might have had» e «Let
 *   the user know what they can do to move ahead», senza soluzioni-uguali-per-tutti. ⇒ ogni carta
 *   qui sotto dice anche COSA NON È SUCCESSO, e porta l'azione della sua famiglia (Context Manager),
 *   non un «riprova» buono per qualunque cosa.
 */

/*
 * ⛔ 09/9 — le tre frasi che i tre giri veri hanno prodotto, con la loro sorgente:
 *   · CTX_SUMMARY_RESPONSE_INVALID — «La sintesi non dichiara testo e stato finale.»
 *       `harness-ui/src/runtime-owner-adapter.mjs`, ramo `choice.message.content` non stringa
 *   · CTX_INVALID_SOURCE           — «Nessuna citazione corrisponde agli originali (es. «…» in …).»
 *       `context-engine/src/summary.mjs`, quando nessuna citazione si ritrova negli originali
 *   · CTX_TRUNCATED_SUMMARY        — «La sintesi non è stata completata.»
 *       `context-engine/src/summary.mjs`, `finishReason` diverso da stop/end_turn
 *
 * ⛔⛔ Il CODICE non arriva alla chat: quando `contextHooks.prepare` lancia dentro `talosLavora`,
 * `harness-ui/src/agent-service.mjs` scrive `code: 'internal-error'` FISSO, e la `ContextEngineError`
 * perde il suo `.code` per strada. Perciò ogni regola riconosce dal MESSAGGIO — che è già in
 * italiano e sopravvive — e in più dal codice, così il giorno in cui il server lo passerà (patch
 * separata: non è questo file) qui non cambia niente.
 */
const COSA_CONTESTO = 'La compattazione del contesto non è riuscita, e il giro si è fermato lì.';

/*
 * ⛔ È vero, ed è la cosa che chi legge deve sapere per prima: il motore non pubblica NIENTE finché
 * la sintesi non passa la verifica (la versione nuova si scrive solo su `committed`), quindi un
 * fallimento lascia la conversazione esattamente com'era. Stessa scelta di Hermes, citata sopra.
 */
const ORIGINALI_INTATTI = 'Nessun messaggio è stato modificato: gli originali restano tutti al loro posto — non è la tua richiesta ad aver sbagliato.';

const APRI_CONTEXT_MANAGER = 'Apri Context Manager: lì trovi lo stato della compattazione, le versioni del contesto e le fonti citate.';
const COMPATTA_A_MANO = 'Da lì «Compatta ora» rifà il tentativo da capo, sugli stessi messaggi.';

/** I rimedi della famiglia contesto: dove guardare, poi il consiglio del caso, poi cosa si può rifare. */
const rimediContesto = (proprio) => [APRI_CONTEXT_MANAGER, ...(proprio ? [proprio] : []), COMPATTA_A_MANO];

const CODICE_CONTESTO = /\bCTX_[A-Z0-9_]+/;

/**
 * Il grezzo della famiglia contesto: il codice tecnico NON si mostra a schermo (regola: niente nomi
 * tecnici nella UI) ma è quello che si incolla in una segnalazione, quindi entra nel dettaglio
 * richiuso — e non si duplica se il server l'aveva già scritto dentro il messaggio.
 */
function grezzoContesto(tecnico, codice) {
  const trovato = CODICE_CONTESTO.exec(String(codice ?? ''))?.[0];
  if (!trovato || tecnico.includes(trovato)) return tecnico;
  return tecnico ? `[${trovato}] ${tecnico}` : `[${trovato}]`;
}

/** Il codice tecnico e il messaggio grezzo, come li manda il server. */
const REGOLE = [
  {
    /*
     * Caso 1 dei tre veri: il modello della sintesi ha risposto senza il testo del riassunto o senza
     * dire se l'aveva finito. Non c'è niente da verificare, quindi il contesto scarta — e non è un
     * guasto del compito che stavi chiedendo.
     */
    id: 'contesto-sintesi-invalida',
    famiglia: 'contesto',
    riconosce: (t) => /\bCTX_SUMMARY_RESPONSE_INVALID\b/.test(t) || /sintesi non dichiara testo e stato finale|risposta di sintesi non leggibile/i.test(t),
    spiega: (t, codice) => ({
      cosa: COSA_CONTESTO,
      perche: `Il modello incaricato di riassumere la conversazione ha risposto in una forma che non si può verificare: manca il testo del riassunto, o manca il segnale che dice se l’ha finito. Il contesto l’ha scartato invece di pubblicarlo. ${ORIGINALI_INTATTI}`,
      rimedi: rimediContesto('Se succede sempre con questo modello, cambia il modello della sintesi nelle impostazioni avanzate del Context Manager: alcuni modelli spendono tutto lo spazio di risposta nel ragionamento e non ne lasciano al riassunto.'),
      tecnico: grezzoContesto(t, codice),
    }),
  },
  {
    /*
     * Caso 2: la verifica delle citazioni. È il controllo che impedisce a un riassunto di INVENTARE —
     * ogni fonte deve ritrovarsi alla lettera in un messaggio originale — e qui non ne è stata
     * ritrovata nessuna. Un rifiuto motivato, non un guasto: va detto come tale.
     */
    id: 'contesto-citazioni',
    famiglia: 'contesto',
    riconosce: (t) => /\bCTX_INVALID_SOURCE\b/.test(t) || /citazione corrisponde agli originali|non riporta fonti verificabili/i.test(t),
    spiega: (t, codice) => ({
      cosa: COSA_CONTESTO,
      perche: `Un riassunto viene accettato solo se cita alla lettera pezzi dei messaggi originali: è il controllo che gli impedisce di inventare. Qui nessuna delle citazioni proposte è stata ritrovata negli originali di questa conversazione, e il riassunto è stato respinto. ${ORIGINALI_INTATTI}`,
      rimedi: rimediContesto('Se si ripete, scegli un altro modello per la sintesi nelle impostazioni avanzate del Context Manager: copiare una citazione alla lettera è la prima cosa che sbagliano i modelli più piccoli.'),
      tecnico: grezzoContesto(t, codice),
    }),
  },
  {
    /*
     * Caso 3: la sintesi troncata. ⛔ È l'UNICO caso in cui il motore ritenta da solo, e ritenta UNA
     * volta sola, chiedendo un riassunto della metà (il `catch` che rilancia `once(true)` soltanto
     * per `CTX_TRUNCATED_SUMMARY`). Quando questa carta arriva, quel ritentativo è già stato speso:
     * prometterne un altro sarebbe una bugia.
     */
    id: 'contesto-sintesi-troncata',
    famiglia: 'contesto',
    riconosce: (t) => /\bCTX_TRUNCATED_SUMMARY\b/.test(t) || /sintesi non è stata completata|non ha lasciato spazio alla sintesi/i.test(t),
    spiega: (t, codice) => {
      // il numero dei token di ragionamento sta dentro l'errore quando c'è: si usa, non si butta
      const ragionamento = Number((/(\d+)\s*token nel ragionamento/i.exec(t) || [])[1]) || null;
      const speso = ragionamento ? ` Qui il modello ha speso ${ragionamento.toLocaleString('it-IT')} token nel ragionamento, senza lasciarne alla sintesi.` : '';
      return {
        cosa: COSA_CONTESTO,
        perche: `Il riassunto si è interrotto prima della fine: lo spazio di risposta è finito prima che il modello lo chiudesse.${speso} TALOS l’ha già chiesto una seconda volta, più corto, e neanche quella è arrivata intera; altri tentativi non ne fa. ${ORIGINALI_INTATTI}`,
        rimedi: rimediContesto('Se si ripete, scegli per la sintesi un modello con più spazio di risposta nelle impostazioni avanzate del Context Manager: la lunghezza che il riassunto può avere dipende da quello.'),
        tecnico: grezzoContesto(t, codice),
      };
    },
  },
  {
    /*
     * Tutti gli altri guasti del motore del contesto. ⛔ Riconosce SOLO dal codice `CTX_*`: una frase
     * italiana qualsiasi non diventa un guasto del contesto per il fatto di essere italiana.
     * Il messaggio del motore è già scritto per una persona — è lo stesso che la modale mostra sotto
     * lo stato del lavoro — quindi si riporta com'è, invece di dire «forma non ancora tradotta» su
     * un testo che si legge benissimo.
     */
    id: 'contesto',
    famiglia: 'contesto',
    riconosce: (t) => CODICE_CONTESTO.test(t),
    spiega: (t, codice) => {
      const detto = t.replace(CODICE_CONTESTO, '').replace(/^[\s:—-]+/u, '').trim();
      const frase = detto ? (/[.!?…]$/u.test(detto) ? detto : `${detto}.`) : 'Il motore del contesto non ha detto altro.';
      return {
        cosa: COSA_CONTESTO,
        perche: `${frase} ${ORIGINALI_INTATTI}`,
        rimedi: rimediContesto(''),
        tecnico: grezzoContesto(t, codice),
      };
    },
  },
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
    /*
     * ⛔ 06/9, trovato riaprendo una sessione VERA dell'owner (0363607d) per verificare la cura:
     * l'errore non era nessuno dei due che mi aveva mostrato, era un terzo — «llama-server non e'
     * diventato pronto entro 36 s (modello di 12 GB)». La nota lo diceva onestamente («questa forma
     * non e' ancora tradotta»), ed e' proprio il segnale che serviva una regola in piu'.
     */
    id: 'runtime-non-pronto',
    riconosce: (t) => /llama-server non è diventato pronto|non è diventato pronto entro|runtime non pronto|failed to load model/i.test(t),
    spiega: (t) => {
      const secondi = (/entro (\d+)\s*s/i.exec(t) || [])[1];
      const taglia = (/modello di ([^)]+)\)/i.exec(t) || [])[1];
      return {
        cosa: 'Il motore locale non si è acceso in tempo.',
        perche: `Caricare un modello dal disco alla memoria richiede tempo${taglia ? ` (qui ${taglia})` : ''}${secondi ? `, e l'attesa si è fermata a ${secondi} secondi` : ''}. Non è un guasto del compito: è il motore che stava ancora partendo.`,
        rimedi: [
          'Riprova: al secondo tentativo il modello è spesso già in memoria e parte subito.',
          'Apri il Laboratorio e accendi il modello prima di avviare la sessione.',
          'Se succede sempre, scegli una quantizzazione più piccola: meno gigabyte da caricare, meno attesa.',
        ],
      };
    },
  },
  {
    /*
     * ⛔⛔ 06/9, prova T05-D2: premi «Ferma», ed esce una carta ROSSA con «[internal-error] This
     * operation was aborted». Fermare un giro non è un guasto: è una cosa che hai chiesto tu, e
     * l'unica notizia è che è successa. La carta resta (serve a dire che il giro è finito lì), ma
     * dice il vero e non chiede di riprovare come se fosse andato storto qualcosa.
     */
    id: 'fermato-da-te',
    famiglia: 'fermato',
    riconosce: (t) => /operation was aborted|AbortError|aborted by user|fermato dall'utente/i.test(t),
    spiega: () => ({
      cosa: 'Hai fermato il giro.',
      perche: 'Il lavoro si è chiuso al primo punto sicuro, come chiesto. Quello che era già fatto resta: i file scritti restano scritti.',
      rimedi: ['Scrivi un altro messaggio per continuare da qui, nella stessa sessione.'],
    }),
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

/*
 * ⛔ 06/9, owner con lo screenshot: nel riquadro «Attività non riuscita» comparivano gli argomenti
 * grezzi della chiamata (`{"titolo":"GPT Tokenizer Interactive Demo","html":"<!doctype html>…`) e il
 * rifiuto del kernel in inglese: `REFUSED. Empty html: nothing was created.`
 * Il rifiuto NON è un errore: è il kernel che ha detto di no, e chi legge deve capire cosa è
 * mancato. Qui si traduce; il testo originale resta accanto, perché è quello che si incolla in una
 * segnalazione.
 */
const RIFIUTI = [
  { prova: /empty html|html vuoto/i, detto: 'L’HTML era vuoto: non è stato creato niente.' },
  { prova: /cartella is required|folder is required/i, detto: 'Manca la cartella: il sotto-agente non è partito.' },
  { prova: /must be different from your own/i, detto: 'La cartella del figlio non poteva essere la stessa del padre.' },
  { prova: /must be a string/i, detto: 'Il percorso non era scritto come testo.' },
  { prova: /no delegation channel|delegation is not configured/i, detto: 'Questa sessione non può delegare a un sotto-agente.' },
  { prova: /not configured on this harness|no generator|no saver/i, detto: 'Questa capacità non è configurata su questo TALOS.' },
  { prova: /non ha un canale di approvazione|approval channel/i, detto: 'Serviva un permesso che questa sessione non poteva chiedere.' },
  { prova: /too large|troppo grande/i, detto: 'Il contenuto era troppo grande per essere accettato.' },
];

/**
 * Un esito che comincia con REFUSED è un NO dichiarato dal kernel, non un guasto.
 * @returns {{rifiutato:boolean, detto:string, tecnico:string}}
 */
export function spiegaRifiutoAttrezzo(esito) {
  const testo = String(esito ?? '').trim();
  if (!/^REFUSED\b/i.test(testo)) return { rifiutato: false, detto: '', tecnico: testo };
  const resto = testo.replace(/^REFUSED\.?\s*/i, '');
  const trovato = RIFIUTI.find((r) => r.prova.test(resto));
  return {
    rifiutato: true,
    detto: trovato ? trovato.detto : 'L’attrezzo ha rifiutato la richiesta.',
    tecnico: testo,
  };
}

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
    /*
     * ⛔ 09/9: il codice arriva anche a `spiega`. Serve alla famiglia contesto, che deve poterlo
     * mettere nel GREZZO (dove va) senza mostrarlo a schermo — e per questo una regola può dettare
     * il proprio `tecnico` invece di ereditare il messaggio nudo.
     */
    const s = regola.spiega(tecnico, codice);
    return { id: regola.id, famiglia: regola.famiglia ?? null, ...s, tecnico: s.tecnico ?? tecnico, riconosciuto: true };
  }
  return {
    id: 'sconosciuto',
    famiglia: null,
    cosa: 'Il giro si è interrotto per un errore.',
    perche: 'Questa forma di errore non è ancora tradotta: qui sotto c’è il testo che ha mandato il server, così com’è.',
    rimedi: ['Riprova il giro.', 'Se si ripete, apri Doctor e allega il testo qui sotto.'],
    tecnico,
    riconosciuto: false,
  };
}

/*
 * ⛔ 09/9 — come si VESTE la carta. Prima questa scelta viveva in `legacy/app.js` come un confronto
 * a mano (`spiegazione?.id === 'fermato-da-te'`): ogni famiglia nuova voleva una riga in più là
 * dentro, lontana dalle regole che la producono. Ora la decide la famiglia, qui.
 *
 * ⛔ La compattazione fallita NON porta il rosso del guasto: NN/g, «Hostile Patterns in Error
 * Messages» (30/10/2022) — lo stile dell'errore non si usa per ciò che non è un errore di chi
 * legge. Il giro si è comunque fermato, e la carta lo dice nel testo; ma il colpo d'occhio deve
 * separare «il contesto non si è compattato» da «la tua richiesta è andata storta».
 */
const VESTIZIONI = {
  fermato: { badge: 'Fermato', titolo: 'TALOS · fermato', tono: 'accent' },
  contesto: { badge: 'Contesto', titolo: 'TALOS · contesto non compattato', tono: 'warning' },
};
const VESTIZIONE_ERRORE = { badge: 'Errore', titolo: 'TALOS · errore', tono: 'danger' };

/**
 * Badge, titolo e tono della nota che mostra una spiegazione.
 * @param {{famiglia?:string|null}|null} spiegazione l'esito di `spiegaErrore`
 * @returns {{badge:string, titolo:string, tono:string}}
 */
export function vestizioneErrore(spiegazione) {
  return { ...(VESTIZIONI[spiegazione?.famiglia] ?? VESTIZIONE_ERRORE) };
}

/** La stessa spiegazione in una riga sola, per i posti stretti (elenco sessioni, riepiloghi). */
export function erroreInUnaRiga(messaggio, codice = '') {
  const s = spiegaErrore(messaggio, codice);
  return s.cosa;
}
