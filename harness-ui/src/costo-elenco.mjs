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
  misurata: '09/09/2026 su z-ai/glm-5.3-flash (3,92 byte/token, 3,64 caratteri/token)',
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
  if (typeof testo !== 'string') fallisci('COSTO_TESTO_INVALIDO', 'Il testo da stimare deve essere una stringa.');
  return Math.ceil([...testo].length / 4);
}

/** Quanto costa questo testo, con il metodo dichiarato. */
export function costoDelTesto(testo, { metodo = 'auto', contatore } = {}) {
  if (typeof testo !== 'string') fallisci('COSTO_TESTO_INVALIDO', 'Il testo da misurare deve essere una stringa.');
  if (!METODI.includes(metodo)) fallisci('COSTO_METODO_IGNOTO', `Metodo sconosciuto: ${metodo}. Ammessi: ${METODI.join(', ')}.`);
  if (contatore !== undefined && typeof contatore !== 'function') fallisci('COSTO_CONTATORE_INVALIDO', 'Il contatore deve essere una funzione (testo) => numero di token.');
  // ⛔ Chiedere `'contato'` senza avere un contatore non produce una stima battezzata misura: si ferma.
  if (metodo === 'contato' && !contatore) fallisci('COSTO_CONTATORE_ASSENTE', 'Il metodo "contato" richiede un contatore vero: senza, il numero sarebbe una stima travestita da misura.');

  const byte = Buffer.byteLength(testo, 'utf8');
  const caratteri = [...testo].length;
  const nonLatino = haNonLatino(testo);
  const quotaSeparatori = quotaPunteggiatura(testo);
  const punteggiaturaDensa = quotaSeparatori > SOGLIA_PUNTEGGIATURA_DENSA;
  const base = { byte, caratteri, unitaDiCodice: testo.length, nonLatino, punteggiaturaDensa, quotaSeparatori: Number(quotaSeparatori.toFixed(4)) };

  if (contatore && metodo !== 'stimato') {
    const conteggio = contatore(testo);
    if (typeof conteggio?.then === 'function') fallisci('COSTO_CONTATORE_ASINCRONO', 'Il contatore deve essere sincrono: usa contatoreDaContextEngine() per pre-misurare i testi e ottenere una porta sincrona.');
    if (!Number.isSafeInteger(conteggio) || conteggio < 0) fallisci('COSTO_CONTEGGIO_INVALIDO', 'Il contatore non ha restituito un numero di token valido; nessun ripiego silenzioso su una stima.');
    // ⛔ Un contatore che dichiara di aver stimato NON diventa «contato» passando di qui.
    const suoMetodo = contatore.metodo === 'stimato' ? 'stimato' : 'contato';
    const fonte = contatore.fonte ?? 'contatore iniettato (fonte non dichiarata)';
    return {
      ...base,
      token: conteggio,
      metodo: suoMetodo,
      fonte,
      margineToken: suoMetodo === 'contato' ? 0 : Math.max(TARATURA_STIMA.margineMinimoToken, Math.ceil(conteggio * TARATURA_STIMA.margine)),
      confidenza: suoMetodo === 'contato'
        ? `contato: ${fonte} ha tokenizzato questo testo. ⛔ Il fornitore dichiara la propria misura come stima a meno di uno scarto piccolo, e un tokenizer nuovo cambia i numeri (Claude 4.7+: ~30% token in più sullo stesso testo — Claude Platform Docs, token-counting, letto 10/09/2026).`
        : `stimato dal contatore iniettato (${fonte}): ha dichiarato metodo "stimato", e passare di qui non lo trasforma in una misura.`,
    };
  }

  /* Stima sui BYTE UTF-8, non sui caratteri: il BPE a livello di byte fonde byte, quindi un
     carattere accentato (2 byte), un ideogramma (3) o un'emoji (4) costano di più di una lettera
     ASCII, e la regola dei 4 caratteri li conta uguali. Vedi ricerca (2) e (3). */
  const token = Math.ceil(byte / TARATURA_STIMA.bytePerToken);
  const margineToken = token === 0 ? 0 : Math.max(TARATURA_STIMA.margineMinimoToken, Math.ceil(token * TARATURA_STIMA.margine));
  const avvisoNonLatino = nonLatino
    ? ' ⛔ Il testo contiene caratteri non ASCII: per gli script non latini il BPE a livello di byte arriva fino a 3 volte l\'inglese e questa stima è un PAVIMENTO, non un tetto (8 ideogrammi = 11 token misurati in cl100k_base, dove byte/3,5 ne predice 7 e caratteri/4 solo 2).'
    : '';
  const avvisoDenso = punteggiaturaDensa
    ? ` ⛔ Testo fitto di separatori (${Math.round(quotaSeparatori * 100)}% di caratteri non alfanumerici: è la forma di un elenco di percorsi, non di prosa): il BPE spezza a ogni "/", "-" e ".", quindi anche qui la stima è un PAVIMENTO.`
    : '';
  return {
    ...base,
    token,
    metodo: 'stimato',
    fonte: 'nessun contatore iniettato',
    margineToken,
    confidenza: `stimato: byte UTF-8 (${byte}) ÷ ${TARATURA_STIMA.bytePerToken}, taratura ${TARATURA_STIMA.misurata}; margine dichiarato ±${Math.round(TARATURA_STIMA.margine * 100)}% (${margineToken} token). ⛔ Non è un conteggio: nessun tokenizer ha guardato questo testo.${avvisoNonLatino}${avvisoDenso}`,
  };
}

/** Il costo di un elenco, e quanto ne resta nella finestra. */
export function costoElenco(testoElenco, { finestra, giri = 1, contatore, metodo = 'auto', listino = LISTINO_22_08 } = {}) {
  if (!Number.isSafeInteger(giri) || giri < 1) fallisci('COSTO_GIRI_INVALIDI', 'I giri devono essere un intero maggiore o uguale a 1.');
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
        ? `⛔ I primi ${listino.giriPagatiPieni} giri si pagano PIENI (${tokenPieni} token a $${listino.promptDollariPerMilione}/M): la cache prende dalla TERZA chiamata. Il risparmio qui vale solo perché i giri sono ${giri}.`
        : `⛔ Con ${giri} gir${giri === 1 ? 'o' : 'i'} la cache non ha ancora preso: si paga tutto pieno, esattamente come senza cache. Chi prova due volte sole conclude «non funziona» — è l'unico esito sbagliato possibile, non un difetto della cache.`,
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
  if (typeof counter?.countPreparedContext !== 'function') fallisci('COSTO_CONTATORE_ASSENTE', 'Serve un contatore con countPreparedContext (createContextTokenCounter).');
  if (!Array.isArray(testi) || testi.some(testo => typeof testo !== 'string')) fallisci('COSTO_TESTI_INVALIDI', 'I testi da pre-misurare devono essere un elenco di stringhe.');
  const conta = async testo => {
    const esito = await counter.countPreparedContext({ messages: [{ role: 'user', content: testo }], tools: [], model, signal });
    if (!Number.isSafeInteger(esito?.inputTokens) || esito.inputTokens < 0) fallisci('COSTO_CONTEGGIO_INVALIDO', 'Il contatore del Context Engine non ha restituito un conteggio valido.');
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
  const fonte = `context-token-counters (${model?.provider ?? 'provider ignoto'}/${model?.model ?? 'modello ignoto'}, method=${[...metodiVisti].join('+') || 'nessuno'}${sottraiInvolucro ? `, involucro ${involucro} token sottratto` : ''})`;
  const porta = testo => {
    if (!misurati.has(testo)) fallisci('COSTO_TESTO_NON_MISURATO', 'Questo testo non è stato pre-misurato: la porta non stima di nascosto. Passalo a contatoreDaContextEngine().');
    return misurati.get(testo);
  };
  porta.fonte = fonte;
  porta.metodo = stimato ? 'stimato' : 'contato';
  porta.involucroToken = involucro;
  return porta;
}
