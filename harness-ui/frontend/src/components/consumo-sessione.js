/*
 * CONSUMO DI SESSIONE — un posto solo che sa distinguere «questo invio» da
 * «tutta la conversazione».
 *
 * ⛔⛔⛔ 06/9, difetto CB-04 della seconda caccia: la Board dichiarava «2 giri ·
 * 22,3k token · cache 0%» su una sessione in cui il registro aveva
 * `cached_tokens: 10112` misurati e poi persi, e i giri veri erano 5.
 * Riprodotto e misurato su tre invii veri (sonda `.gravi/sonde/01-consumo.mjs`,
 * sessione 53ea52d1-4ead-4bcd-9eef-837d37e3d534): totale vero {23.060 dentro,
 * 121 fuori, 15.232 in cache, 3 giri}, totale mostrato {7.716, 25, 7.616, 1} —
 * cioè il solo ultimo invio.
 *
 * CAUSA: il kernel dichiara il suo contatore DENTRO il ciclo di una singola
 * esecuzione (`talosHarness.mjs:4560`) e lo azzera a ogni invio; l'evento
 * `/usage` è quindi cumulativo dentro un invio e non fra invii. Chi teneva
 * solo l'ultimo teneva il totale di un turno.
 *
 * RICERCA WEB 06/09/2026, PRIMA di scrivere — i vincoli:
 *  · OpenAI, «Counting tokens» (developers.openai.com/api/docs/guides/
 *    token-counting): `usage` è riportato PER RICHIESTA, e sommare i turni è
 *    compito di chi chiama — nessun campo lo fa per noi;
 *  · OpenRouter, «Prompt Caching» (openrouter.ai/docs/guides/best-practices/
 *    prompt-caching): il tasso di cache di una sessione è
 *    «sum all cached_tokens / sum total prompt_tokens» — pesato sui token, non
 *    la media delle percentuali dei singoli invii;
 *  · LangSmith, «Cost tracking» (docs.langchain.com/langsmith/cost-tracking):
 *    «A trace covers one turn. A session covers a whole conversation» — mostrare
 *    l'uno dove è promesso l'altro è un guasto noto, non una sfumatura.
 *
 * ⇒ DUE numeri diversi, e ognuno al suo posto:
 *   · il TURNO (`usage`) — lo vuole il tetto dei giri («9 su 24») e la
 *     «Finestra del contesto», che misura quanto è pieno il contesto ADESSO;
 *   · la SESSIONE (`usageSessione`) — la vogliono la Board, il piede della
 *     chat, la pagina Costi e il nodo «Main» dell'albero, che promettono tutti
 *     il consumo della conversazione.
 */

const numero = (valore) => (Number.isFinite(Number(valore)) ? Number(valore) : null);

/**
 * Somma due totali di consumo. `null` + `null` resta `null` (⛔ «non misurato»
 * non è «zero»); un campo assente da una sola parte non azzera l'altra.
 * @param {object|null} a totale accumulato finora
 * @param {object|null} b totale di un'altra esecuzione
 */
export function sommaUsage(a, b) {
  if (!a || typeof a !== 'object') return b && typeof b === 'object' ? { ...b } : null;
  if (!b || typeof b !== 'object') return { ...a };
  const somma = (chiave) => {
    const x = numero(a[chiave]); const y = numero(b[chiave]);
    if (x === null && y === null) return null;
    return (x ?? 0) + (y ?? 0);
  };
  const risultato = { ...a, ...b };
  for (const chiave of ['prompt_tokens', 'completion_tokens', 'cached_tokens', 'giri']) {
    const valore = somma(chiave);
    if (valore === null) delete risultato[chiave]; else risultato[chiave] = valore;
  }
  // ⛔ La velocità NON si somma: è un tasso. Resta quella dell'ultimo invio.
  if (numero(b.tokens_per_second) === null && numero(a.tokens_per_second) !== null) risultato.tokens_per_second = a.tokens_per_second;
  return risultato;
}

/**
 * Il consumo dell'intera sessione da una riga di `GET /api/v1/sessions`.
 * ⛔ Ripiego su `usage` (il solo ultimo invio) unicamente quando il server non
 * dichiara `usageSessione`: una sessione con un invio solo dà lo stesso numero,
 * e una vecchia registrazione è meglio letta al ribasso che non letta affatto.
 */
export function usageDellaSessione(sessione) {
  if (!sessione || typeof sessione !== 'object') return null;
  if (sessione.usageSessione && typeof sessione.usageSessione === 'object') return sessione.usageSessione;
  return sessione.usage && typeof sessione.usage === 'object' ? sessione.usage : null;
}

/** Quanti INVII ci sono dietro un totale di sessione (`null` quando non è dichiarato). */
export function esecuzioniDellaSessione(sessione) {
  const u = sessione?.usageSessione;
  return u && Number.isFinite(Number(u.esecuzioni)) ? Number(u.esecuzioni) : null;
}

/** BC-48 C — stessa misura e stesse parole nell'inspector e nei costi. Mai null → 0. */
export function testoRiusoCache(misura) {
  const p = misura?.percentuale; const giri = misura?.giriMisurati;
  if (!Number.isFinite(p) || p < 0 || p > 100 || !Number.isSafeInteger(giri) || giri <= 0) return 'non misurato';
  const numero = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 });
  return `${numero.format(p)} % · su ${numero.format(giri)} ${giri === 1 ? 'giro' : 'giri'}`;
}
