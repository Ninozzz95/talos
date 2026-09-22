/*
 * L6 — IL BUDGET DETERMINISTICO PER PAGINA.
 *
 * ## Il difetto che chiude
 *
 * Una pagina web è lunga quanto le pare. Il modello riceve tutto, e la finestra
 * di contesto è la prima cosa che finisce: `naviga` nel kernel taglia già a
 * 4.000 caratteri (`talosHarness.mjs:1296`, `uscitaUtile`) e la sintesi ne
 * prende 4.000 in testa per fonte (`synthesis.mjs:59`). Nessuno dei due dice
 * dove sia finito il resto, e la sintesi non guarda nemmeno la coda.
 *
 * ⛔ Il punto NON è tagliare — quello lo facciamo già. Il punto è che oggi il
 * resto **sparisce**: non è da nessuna parte, quindi non si può né sfogliare né
 * ri-verificare. Questo modulo separa tre cose che oggi sono una sola:
 *
 *   1. il testo INTERO, che si conserva (è il dossier: `collector.mjs`);
 *   2. la FINESTRA, cioè quanto ne vede il modello adesso;
 *   3. il RIFERIMENTO, cioè come arrivare al resto.
 *
 * ⛔ La (1) resta la fonte della verità per `talosResearchLocate`
 * (`verification.mjs:201`): un passaggio citato si cerca nel testo intero, MAI
 * nella finestra — altrimenti tagliare una pagina trasformerebbe una citazione
 * vera in una citazione «non trovata», che è il verso peggiore in cui si possa
 * sbagliare (una fonte onesta marcata come inventata).
 *
 * ## Perché 15.000, misurato invece che copiato
 *
 * Hermes v0.21 usa 15.000 caratteri per pagina, testa 75% / coda 25%, il resto
 * su disco col percorso e la chiamata esatta per sfogliarlo, tetto 2 MB
 * (`website/docs/user-guide/features/web-search.md:47-57` nel clone
 * `%LOCALAPPDATA%\Temp\talos-competitor\hermes-agent-v21`, letto l'11/09/2026).
 * Il numero è il loro, la ragione doveva essere nostra.
 *
 * MISURATO l'11/09/2026 su 430 pagine di documentazione vera (le `.md`/`.mdx`
 * di `website/docs` dello stesso clone: sono pagine web pubblicate, non un
 * campione inventato), con gli spazi compattati come fa il collettore:
 *
 *     mediana 10.688 · p75 15.752 · p90 27.983 · p95 43.899 · max 187.135
 *
 *     tetto      pagine intere        caratteri coperti
 *     4.000       30/430  ( 7,0%)          26,1%
 *     8.000      130/430  (30,2%)          47,9%
 *     15.000     313/430  (72,8%)          69,4%
 *     20.000     357/430  (83,0%)          76,3%
 *     40.000     403/430  (93,7%)          89,3%
 *
 * ⇒ I 4.000 di oggi consegnano al modello il 26% dei caratteri e fanno arrivare
 * intera UNA PAGINA SU QUATTORDICI: non è un budget, è un troncone. I 15.000 di
 * Hermes cadono quasi esattamente sul 75° percentile (15.752): tre pagine su
 * quattro arrivano intere e il taglio smette di essere la regola.
 *
 * ⛔ E la ragione per cui NON prendo i 20.000 del mobile (`collector.mjs:79`,
 * `MAX_CHARS_PER_SOURCE`) è strutturale, non di gusto: quello è il tetto di ciò
 * che si CONSERVA. Se il tetto mostrato fosse uguale a quello conservato, il
 * riferimento «il resto è in …» punterebbe sempre a zero caratteri residui, e
 * questo modulo sarebbe una bugia cortese. Il tetto mostrato deve stare
 * STRETTAMENTE sotto quello conservato. 15.000 < 20.000.
 *
 * ## Perché testa 75% / coda 25%, al contrario di `uscitaUtile`
 *
 * `uscitaUtile` tiene un quarto in testa e tre quarti in coda, e ha ragione:
 * misura l'uscita di una SUITE DI TEST, dove la diagnosi sta in fondo
 * (`talosHarness.mjs:1282-1295`). Una pagina web è l'opposto — titolo, apertura
 * e tesi stanno in cima, e la coda è note, footer, commenti. ⇒ stesso
 * meccanismo, quote invertite, e la ragione scritta accanto a tutte e due.
 *
 * ## Deterministico, e la parola conta
 *
 * Nessun modello, nessuna sintesi, nessuna data, nessun `toLocaleString`: la
 * stessa pagina produce la stessa identica finestra, byte per byte. Serve
 * perché la cache del prompt dei fornitori funziona su PREFISSO ESATTO — «If
 * your breakpoint is on content that changes every request, cache hits never
 * occur» (platform.claude.com/docs/en/build-with-claude/prompt-caching, letta
 * l'11/09/2026). Una finestra che cambia fra due giri identici brucia la cache
 * di tutto ciò che le sta dopo.
 */

/**
 * Quanti caratteri di una pagina vede il modello.
 * Vedi la misura qui sopra: è il 75° percentile di 430 pagine vere.
 */
export const TALOS_RESEARCH_PAGE_BUDGET = 15_000;

/** Quanta parte della finestra è la testa. Una pagina dice la sua tesi in cima. */
export const TALOS_RESEARCH_HEAD_SHARE = 0.75;

/**
 * Quanto testo si CONSERVA di una pagina. Stesso tetto di Hermes (2 MB): oltre,
 * un solo documento patologico si mangerebbe il dossier.
 */
export const TALOS_RESEARCH_KEPT_CAP = 2 * 1024 * 1024;

/**
 * @typedef {object} TalosResearchPageReference
 * @property {string} percorso Dove il testo intero è stato depositato.
 * @property {string} [chiamata]
 *   La chiamata ESATTA per sfogliare il mezzo, se esiste davvero un attrezzo che
 *   la accetta. ⛔ Non si inventa: oggi `leggi` non ha né offset né lunghezza
 *   (`talosHarness.mjs:1446-1451`), quindi chi non può scriverne una vera non la
 *   passa, e il marcatore tace invece di mentire.
 */

/**
 * @typedef {object} TalosResearchPageWindow
 * @property {string} window Ciò che il modello vede: testa + marcatore + coda.
 * @property {number} total Caratteri della pagina intera.
 * @property {number} shown Caratteri davvero mostrati (marcatore escluso).
 * @property {number} omitted `total - shown`. Contato, mai stimato.
 * @property {boolean} truncated
 * @property {string | null} marker Il marcatore, per chi lo vuole altrove.
 */

/**
 * Il taglio della testa, portato indietro fino a un confine di riga se ce n'è
 * uno vicino — Hermes taglia «on markdown line boundaries», e mezza riga di
 * markdown letta a metà è rumore. Se non c'è una riga si ripiega su uno spazio;
 * se non c'è nemmeno quello (testo compattato, o una lingua senza spazi) si
 * taglia netto: meglio un taglio netto che una regola che non si applica.
 *
 * @param {string} testo
 * @param {number} tetto
 * @returns {number}
 */
function tagliaInTesta(testo, tetto) {
  if (tetto <= 0) return 0;
  const finestra = testo.slice(0, tetto);
  const riga = finestra.lastIndexOf('\n');
  if (riga >= Math.floor(tetto * 0.8)) return riga;
  const spazio = finestra.lastIndexOf(' ');
  if (spazio >= tetto - 200) return spazio;
  return tetto;
}

/**
 * L'inizio della coda, portato AVANTI (mai indietro: allargherebbe la finestra
 * oltre il tetto) fino al primo confine di riga vicino.
 *
 * @param {string} testo
 * @param {number} tetto
 * @returns {number}
 */
function tagliaInCoda(testo, tetto) {
  if (tetto <= 0) return testo.length;
  const da = testo.length - tetto;
  const finestra = testo.slice(da);
  const riga = finestra.indexOf('\n');
  if (riga >= 0 && riga <= Math.floor(tetto * 0.2)) return da + riga + 1;
  const spazio = finestra.indexOf(' ');
  if (spazio >= 0 && spazio <= 200) return da + spazio + 1;
  return da;
}

/**
 * @param {number} valore
 * @param {number} minimo
 * @param {number} massimo
 * @returns {number}
 */
function stretto(valore, minimo, massimo) {
  if (!Number.isFinite(valore)) return minimo;
  return Math.min(massimo, Math.max(minimo, valore));
}

/**
 * La finestra che il modello vede, e il conto esatto di ciò che non vede.
 *
 * @param {string} testo
 * @param {{cap?: number, headShare?: number, reference?: TalosResearchPageReference | null}} [opzioni]
 * @returns {TalosResearchPageWindow}
 */
export function talosResearchPageBudget(testo, opzioni = {}) {
  const pagina = typeof testo === 'string' ? testo : String(testo ?? '');
  const tetto = Math.trunc(stretto(opzioni.cap ?? TALOS_RESEARCH_PAGE_BUDGET, 1, TALOS_RESEARCH_KEPT_CAP));
  const quotaTesta = stretto(opzioni.headShare ?? TALOS_RESEARCH_HEAD_SHARE, 0, 1);
  const riferimento = opzioni.reference ?? null;
  const totali = pagina.length;

  if (totali <= tetto) {
    return { window: pagina, total: totali, shown: totali, omitted: 0, truncated: false, marker: null };
  }

  const tettoTesta = Math.round(tetto * quotaTesta);
  const testa = pagina.slice(0, tagliaInTesta(pagina, tettoTesta));
  const coda = pagina.slice(tagliaInCoda(pagina, tetto - tettoTesta));
  const mostrati = testa.length + coda.length;
  const tolti = totali - mostrati;

  /*
   * ⛔ D-10G, 10/09 — la lezione già pagata su questa stessa riga di codice: il
   * marcatore di `uscitaUtile` diceva «l'elenco completo dei test» su QUALUNQUE
   * troncamento, ed è stato visto dall'owner su una PAGINA WEB. Un marcatore che
   * dice COSA ha tagliato mente appena il contenuto non è quello; questo dice
   * solo QUANTO, e dove trovare il resto quando il resto ha davvero un posto.
   */
  const dove = riferimento?.percorso
    ? `Il testo intero è in ${riferimento.percorso}.${riferimento.chiamata ? ` Per sfogliare il mezzo: ${riferimento.chiamata}` : ''}`
    : 'Il testo intero è conservato nel dossier di questa ricerca.';

  const marcatore = `… [visti ${mostrati} caratteri su ${totali}: ${testa.length} in testa, ${coda.length} in coda; ${tolti} tolti dal mezzo. ${dove}] …`;

  return {
    window: `${testa}\n\n${marcatore}\n\n${coda}`,
    total: totali,
    shown: mostrati,
    omitted: tolti,
    truncated: true,
    marker: marcatore,
  };
}
