/*
 * Quanto costa mettere un elenco di file in testa al prompt — DETTO CON IL METODO IN CHIARO.
 *
 * ⛔ Perché questo modulo esiste (09/09/2026, Context Manager): in `context-token-counters.mjs`
 *    i BYTE erano contati come token e la misura sbagliava di 3,9 volte — un corpo di 39.513 byte,
 *    che il fornitore ha misurato in 10.073 token, valeva 70.903. Effetto: overflow apparente a
 *    ogni giro. La cura non è una costante migliore: è che il numero dica SEMPRE se è stato
 *    contato o stimato, e come. Qui una stima non può travestirsi da misura: `metodo` è un campo
 *    del risultato, non un commento.
 *
 * ⛔ Un solo contatore in tutto il repo. Questo modulo NON tokenizza: riceve `contatore` come
 *    porta. L'adattatore `contatoreDaContextEngine()` in fondo prende il contatore che c'è già
 *    (`createContextTokenCounter` in `src/context-token-counters.mjs`) e ne fa una porta sincrona.
 *    Due contatori che danno due numeri diversi per la stessa cosa sono peggio di nessun contatore.
 *
 * RICERCA WEB (letta il 10/09/2026, prima di scrivere una riga):
 *  1. «1 token ≈ 4 caratteri» è la REGOLA D'ORO di OpenAI per l'INGLESE, e sta entro ~10% solo lì;
 *     il rapporto cambia molto con lingua, dominio e tokenizer.
 *     — OpenAI Developer Community, "Rules of Thumb for number of source code characters to tokens"
 *       <https://community.openai.com/t/rules-of-thumb-for-number-of-source-code-characters-to-tokens/622947>
 *  2. Il BPE a livello di byte parte da un alfabeto Σ={0..255} e fonde BYTE UTF-8, non caratteri
 *     Unicode: «penalizza le lingue con grafemi multibyte (tamil, hindi, cinese), fino a 3 volte
 *     più token dell'inglese» (parità tamil 4,54 con GPT-2). ⇒ per il testo non latino la stima si
 *     fa sui BYTE, mai sui caratteri.
 *     — EmergentMind, "Byte-level BPE Tokenizers" <https://www.emergentmind.com/topics/byte-level-bpe-tokenizers>
 *  3. Misura citabile: 8 caratteri cinesi costano 11 token in cl100k_base, contro 5 token per 16
 *     caratteri inglesi. La regola dei 4 caratteri predirebbe 2 token per quegli 8 ideogrammi:
 *     sbaglia di 5,5 volte. (Vedi la prova COSTO-ELENCO-08.)
 *     — Token Optimization Guide, "Language Comparison"
 *       <https://olivomarco.github.io/github-copilot-token-optimization/03-language-comparison/>
 *  4. Anche un conteggio del fornitore è dichiarato dal fornitore stesso come STIMA a meno di uno
 *     scarto piccolo, e un tokenizer nuovo cambia i numeri (Claude 4.7+: ~30% token in più sullo
 *     stesso testo). ⇒ `'contato'` qui vuol dire «un tokenizer ha guardato QUESTO testo», non
 *     «verità eterna»; la confidenza lo dice.
 *     — Claude Platform Docs, "Token counting" <https://platform.claude.com/docs/en/build-with-claude/token-counting>
 *
 * ⛔ Nessuna dipendenza nuova: in `node_modules` non c'è nessun tokenizer BPE (verificato il
 *    10/09/2026, cercando tiktoken/cl100k/o200k/vocab). Un conteggio VERO offline oggi non è
 *    possibile in questo repo — e questo modulo lo dice invece di fingerlo.
 */

const fallisci = (codice, messaggio) => { throw Object.assign(new Error(messaggio), { code: codice }); };

/**
 * Taratura della stima. ⛔ È la STESSA di `src/context-token-counters.mjs:70` — di proposito: due
 * stime diverse per lo stesso testo rifarebbero il difetto del 09/09 in forma nuova.
 * Misurata quel giorno su z-ai/glm-5.3-flash (italiano + JSON di strumenti): 3,92 byte/token e
 * 3,64 caratteri/token reali; dividere per 3,5 tiene la stima ~12% SOPRA il vero, cioè prudente
 * nel verso giusto, con il margine dichiarato a parte invece che nascosto nel numero.
 */
export const TARATURA_STIMA = Object.freeze({
  bytePerToken: 3.5,
  margine: 0.15,
  margineMinimoToken: 8,
  misurata: '09/09/2026 on z-ai/glm-5.3-flash (3.92 bytes/token, 3.64 characters/token)',
});

/**
 * Listino e comportamento della cache — MISURATI il 22/08/2026, non stimati qui.
 * Tre chiamate ravvicinate sullo stesso prefisso da 16.811 token: la TERZA ne legge 16.768 dalla
 * cache e costa $0,000172 contro $0,001011, cioè 5,9 volte meno. Il fattore di listino è 6,0
 * esatto ($0,06/M contro $0,01/M); il 5,9 misurato è più basso perché 43 token dei 16.811 non
 * erano in cache — i conti tornano: 16.768×$0,01/M + 43×$0,06/M = $0,00017026.
 * ⛔ La cache PRENDE DALLA TERZA CHIAMATA: le prime due si pagano piene. Chi prova due volte sole
 *    conclude «non funziona», ed è l'unico esito sbagliato possibile.
 * Z.AI cacheggia da sé, senza configurazione.
 */
export const LISTINO_22_08 = Object.freeze({
  promptDollariPerMilione: 0.06,
  cacheReadDollariPerMilione: 0.01,
  giriPagatiPieni: 2,
  misurato: '22/08/2026 — 16.811 token, terza chiamata $0,000172 contro $0,001011',
});

const METODI = ['auto', 'contato', 'stimato'];
const arrotonda = (valore, cifre) => Number(valore.toFixed(cifre));
const dollari = (token, perMilione) => arrotonda(token * perMilione / 1_000_000, 10);
// ⛔ Non ASCII = il BPE a livello di byte spezza il carattere in 2-4 byte: la confidenza deve dirlo.
const haNonLatino = testo => [...testo].some(carattere => carattere.codePointAt(0) > 127);

/* ⛔ Un elenco di percorsi NON è prosa: `src/context-token-counters.mjs` è pieno di `/ - .`, e il BPE
   spezza a ogni separatore («nomi, codice o caratteri non inglesi vengono tagliati in più pezzi» —
   OpenAI Developer Community, letto 10/09/2026). Qui NON correggiamo il numero con un coefficiente
   inventato: alziamo una BANDIERA, perché su testo così la stima è un pavimento e non un tetto.
   La soglia 0,10 è una soglia di SEGNALAZIONE, non una taratura: la prosa italiana sta molto sotto,
   un elenco di percorsi molto sopra. */
const SOGLIA_PUNTEGGIATURA_DENSA = 0.10;
const quotaPunteggiatura = testo => {
  const caratteri = [...testo];
  if (!caratteri.length) return 0;
  return caratteri.filter(carattere => !/[\p{L}\p{N}\s]/u.test(carattere)).length / caratteri.length;
};

/**
 * La regola d'oro «1 token ogni 4 caratteri». ⛔ NON è una misura, e non è usata da nessun
 * risultato di questo modulo: esiste solo perché le prove possano mostrare DI QUANTO sbaglia.
 * Vedi ricerca (1) e (3) in testa al file.
 */
export function stimaRegolaQuattroCaratteri(testo) {
  if (typeof testo !== 'string') fallisci('COSTO_TESTO_INVALIDO', 'The text to estimate must be a string.');
  return Math.ceil([...testo].length / 4);
}

/** Quanto costa questo testo, con il metodo dichiarato. */
export function costoDelTesto(testo, { metodo = 'auto', contatore } = {}) {
  if (typeof testo !== 'string') fallisci('COSTO_TESTO_INVALIDO', 'The text to measure must be a string.');
  if (!METODI.includes(metodo)) fallisci('COSTO_METODO_IGNOTO', `Metodo sconosciuto: ${metodo}. Ammessi: ${METODI.join(', ')}.`);
  if (contatore !== undefined && typeof contatore !== 'function') fallisci('COSTO_CONTATORE_INVALIDO', 'The counter must be a function (text) => number of tokens.');
  // ⛔ Chiedere `'contato'` senza avere un contatore non produce una stima battezzata misura: si ferma.
  if (metodo === 'contato' && !contatore) fallisci('COSTO_CONTATORE_ASSENTE', 'The "contato" method needs a real counter: without one, the number would be an estimate dressed up as a measurement.');

  const byte = Buffer.byteLength(testo, 'utf8');
  const caratteri = [...testo].length;
  const nonLatino = haNonLatino(testo);
  const quotaSeparatori = quotaPunteggiatura(testo);
  const punteggiaturaDensa = quotaSeparatori > SOGLIA_PUNTEGGIATURA_DENSA;
  const base = { byte, caratteri, unitaDiCodice: testo.length, nonLatino, punteggiaturaDensa, quotaSeparatori: Number(quotaSeparatori.toFixed(4)) };

  if (contatore && metodo !== 'stimato') {
    const conteggio = contatore(testo);
    if (typeof conteggio?.then === 'function') fallisci('COSTO_CONTATORE_ASINCRONO', 'The counter must be synchronous: use contatoreDaContextEngine() to pre-measure the texts and get a synchronous port.');
    if (!Number.isSafeInteger(conteggio) || conteggio < 0) fallisci('COSTO_CONTEGGIO_INVALIDO', 'The counter did not return a valid token count; no silent fallback to an estimate.');
    // ⛔ Un contatore che dichiara di aver stimato NON diventa «contato» passando di qui.
    const suoMetodo = contatore.metodo === 'stimato' ? 'stimato' : 'contato';
    const fonte = contatore.fonte ?? 'injected counter (source not declared)';
    return {
      ...base,
      token: conteggio,
      metodo: suoMetodo,
      fonte,
      margineToken: suoMetodo === 'contato' ? 0 : Math.max(TARATURA_STIMA.margineMinimoToken, Math.ceil(conteggio * TARATURA_STIMA.margine)),
      confidenza: suoMetodo === 'contato'
        ? `counted: ${fonte} tokenized this text. ⛔ The provider declares its own measurement as an estimate within a small margin, and a new tokenizer changes the numbers (Claude 4.7+: ~30% more tokens on the same text — Claude Platform Docs, token-counting, read 10/09/2026).`
        : `estimated by the injected counter (${fonte}): it declared method "stimato", and going through here does not turn it into a measurement.`,
    };
  }

  /* Stima sui BYTE UTF-8, non sui caratteri: il BPE a livello di byte fonde byte, quindi un
     carattere accentato (2 byte), un ideogramma (3) o un'emoji (4) costano di più di una lettera
     ASCII, e la regola dei 4 caratteri li conta uguali. Vedi ricerca (2) e (3). */
  const token = Math.ceil(byte / TARATURA_STIMA.bytePerToken);
  const margineToken = token === 0 ? 0 : Math.max(TARATURA_STIMA.margineMinimoToken, Math.ceil(token * TARATURA_STIMA.margine));
  const avvisoNonLatino = nonLatino
    ? ' ⛔ The text contains non-ASCII characters: for non-Latin scripts byte-level BPE reaches up to 3 times English and this estimate is a FLOOR, not a ceiling (8 ideograms = 11 tokens measured in cl100k_base, where bytes/3.5 predicts 7 and characters/4 only 2).'
    : '';
  const avvisoDenso = punteggiaturaDensa
    ? ` ⛔ Text dense with separators (${Math.round(quotaSeparatori * 100)}% non-alphanumeric characters: the shape of a list of paths, not of prose): BPE splits at every "/", "-" and ".", so here too the estimate is a FLOOR.`
    : '';
  return {
    ...base,
    token,
    metodo: 'stimato',
    fonte: 'no injected counter',
    margineToken,
    confidenza: `estimated: UTF-8 bytes (${byte}) ÷ ${TARATURA_STIMA.bytePerToken}, calibration ${TARATURA_STIMA.misurata}; declared margin ±${Math.round(TARATURA_STIMA.margine * 100)}% (${margineToken} tokens). ⛔ This is not a count: no tokenizer looked at this text.${avvisoNonLatino}${avvisoDenso}`,
  };
}

/** Il costo di un elenco, e quanto ne resta nella finestra. */
export function costoElenco(testoElenco, { finestra, giri = 1, contatore, metodo = 'auto', listino = LISTINO_22_08 } = {}) {
  if (!Number.isSafeInteger(giri) || giri < 1) fallisci('COSTO_GIRI_INVALIDI', 'Rounds must be an integer greater than or equal to 1.');
  const misura = costoDelTesto(testoElenco, { metodo, contatore });
  const token = misura.token;

  /* ⛔ Finestra assente, zero o non intera: nessuna percentuale inventata. Non «100%», non «0%»:
     ASSENTE. Un 0% su finestra ignota è la bugia più comoda che ci sia. */
  const finestraNota = Number.isSafeInteger(finestra) && finestra > 0;
  const percentualeFinestra = finestraNota ? arrotonda(token / finestra * 100, 2) : null;

  const costoSuNGiri = token * giri;
  const giriPieni = Math.min(giri, listino.giriPagatiPieni);
  const giriScontati = Math.max(0, giri - listino.giriPagatiPieni);
  const tokenPieni = token * giriPieni;
  const tokenInCache = token * giriScontati;
  const dollariSenzaCache = dollari(costoSuNGiri, listino.promptDollariPerMilione);
  const dollariConCache = arrotonda(dollari(tokenPieni, listino.promptDollariPerMilione) + dollari(tokenInCache, listino.cacheReadDollariPerMilione), 10);
  const cacheAttiva = giriScontati > 0 && token > 0;

  return {
    token,
    metodo: misura.metodo,
    confidenza: misura.confidenza,
    fonte: misura.fonte,
    margineToken: misura.margineToken,
    byte: misura.byte,
    caratteri: misura.caratteri,
    nonLatino: misura.nonLatino,
    finestraNota,
    percentualeFinestra,
    tokenLiberiNellaFinestra: finestraNota ? finestra - token : null,
    oltreLaFinestra: finestraNota ? token > finestra : null,
    costoSuNGiri,
    conCache: {
      attiva: cacheAttiva,
      giri,
      giriPieni,
      giriScontati,
      tokenPieni,
      tokenInCache,
      dollari: dollariConCache,
      dollariSenzaCache,
      risparmioDollari: arrotonda(dollariSenzaCache - dollariConCache, 10),
      fattoreRisparmio: dollariConCache > 0 ? arrotonda(dollariSenzaCache / dollariConCache, 3) : null,
      listino: `prompt $${listino.promptDollariPerMilione}/M, input_cache_read $${listino.cacheReadDollariPerMilione}/M (${listino.misurato})`,
      avvertenza: cacheAttiva
        ? `⛔ The first ${listino.giriPagatiPieni} turns are paid in FULL (${tokenPieni} tokens at $${listino.promptDollariPerMilione}/M): the cache kicks in from the THIRD call. The saving here only holds because there are ${giri} turns.`
        : `⛔ With ${giri} turn${giri === 1 ? '' : 's'} the cache has not kicked in yet: everything is paid in full, exactly as without a cache. Anyone who tries it only twice concludes "it does not work" — that is the only wrong outcome possible, not a defect of the cache.`,
    },
  };
}

/**
 * Adattatore: prende il contatore che c'è GIÀ (`createContextTokenCounter`, `src/context-token-counters.mjs:40`)
 * e ne ricava una porta sincrona per `costoDelTesto`/`costoElenco`.
 *
 * ⛔ Pre-misura i testi che gli passi e basta: sui testi che non ha visto la porta SI FERMA invece
 *    di ripiegare su una stima — un ripiego silenzioso è esattamente il modo in cui una stima
 *    diventa una misura per sbaglio.
 * ⛔ `sottraiInvolucro`: `countPreparedContext` conta l'INTERA richiesta (nome del modello, ruoli,
 *    scaffolding JSON), non il testo nudo. Misurando anche la richiesta vuota e sottraendo si
 *    ottiene il costo MARGINALE dell'elenco — che è la domanda vera: «quanto costa AGGIUNGERLO».
 * ⛔ Se il contatore risponde con il suo ripiego euristico (`method === 'heuristic'`), la porta si
 *    dichiara `metodo: 'stimato'` e il risultato lo eredita: nessun travestimento.
 */
export async function contatoreDaContextEngine({ counter, model, testi, signal, sottraiInvolucro = true } = {}) {
  if (typeof counter?.countPreparedContext !== 'function') fallisci('COSTO_CONTATORE_ASSENTE', 'A counter with countPreparedContext (createContextTokenCounter) is required.');
  if (!Array.isArray(testi) || testi.some(testo => typeof testo !== 'string')) fallisci('COSTO_TESTI_INVALIDI', 'The texts to pre-measure must be a list of strings.');
  const conta = async testo => {
    const esito = await counter.countPreparedContext({ messages: [{ role: 'user', content: testo }], tools: [], model, signal });
    if (!Number.isSafeInteger(esito?.inputTokens) || esito.inputTokens < 0) fallisci('COSTO_CONTEGGIO_INVALIDO', 'The Context Engine counter did not return a valid count.');
    return esito;
  };
  const involucro = sottraiInvolucro ? (await conta('')).inputTokens : 0;
  const misurati = new Map();
  let stimato = false;
  const metodiVisti = new Set();
  for (const testo of testi) {
    const esito = await conta(testo);
    if (esito.method === 'heuristic') stimato = true;
    metodiVisti.add(esito.method);
    misurati.set(testo, Math.max(0, esito.inputTokens - involucro));
  }
  const fonte = `context-token-counters (${model?.provider ?? 'unknown provider'}/${model?.model ?? 'unknown model'}, method=${[...metodiVisti].join('+') || 'none'}${sottraiInvolucro ? `, wrapper of ${involucro} tokens subtracted` : ''})`;
  const porta = testo => {
    if (!misurati.has(testo)) fallisci('COSTO_TESTO_NON_MISURATO', 'This text was not pre-measured: the port does not estimate behind the scenes. Pass it to contatoreDaContextEngine().');
    return misurati.get(testo);
  };
  porta.fonte = fonte;
  porta.metodo = stimato ? 'stimato' : 'contato';
  porta.involucroToken = involucro;
  return porta;
}
