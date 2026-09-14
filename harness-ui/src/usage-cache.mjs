/**
 * usage-cache.mjs — «quanti token sono arrivati dalla cache?», chiesto UNA volta sola.
 *
 * ## Perché esiste
 *
 * Lezione del 22/08/2026 (`la-cache-vale-sei-volte-e-non-la-contavamo`): misurato sul banco,
 * **87 token dentro per ogni 1 fuori**, cioè il **93% del costo è rileggere lo stesso prefisso**.
 * La cura non era nell'agente: era che **due lettori non conoscevano il nome**
 * `prompt_tokens_details.cached_tokens`.
 *
 * ⛔ Il 12/09/2026 l'inventario ha trovato che il difetto si era solo spostato. Ogni lettore ne
 *    conosce **uno**, e ognuno un nome diverso:
 *
 *    | lettore | nome che conosce |
 *    |---|---|
 *    | `native-provider-adapter.mjs:44` | `inputTokenDetails.cacheReadTokens` (AI SDK) |
 *    | `context-native-compaction.mjs:9` | `input_tokens_details.cached_tokens` |
 *    | il kernel (`talosHarness.mjs:6417`, `:6482`) | tre nomi, in una catena `??` scritta a mano |
 *
 *    Tre punti, tre vocabolari, nessuna fixture, e nessun posto dove aggiungere il quarto nome.
 *    Hermes, sullo stesso problema, ne conosce **sette** e li tiene in una funzione sola
 *    (`agent/usage_pricing.py:1296-1400`, `normalize_usage`).
 *
 * ⇒ Qui c'è **una** funzione, e i nomi non stanno nemmeno qui: stanno nel record del fornitore
 *   (`provider-registry.mjs`, campo `cache.letturaUsage`). Aggiungere un fornitore con una forma
 *   nuova è una riga di dato, non una riga di codice.
 *
 * ## Le due trappole, dette prima che qualcuno ci ricaschi
 *
 * ⛔⛔ **NON SI SOMMANO.** 🌐 `https://api-docs.deepseek.com/api/create-chat-completion`
 *    (letto 12/09/2026): «prompt_tokens … It equals prompt_cache_hit_tokens +
 *    prompt_cache_miss_tokens». Sommare `prompt_cache_hit_tokens` ai `prompt_tokens` conterebbe
 *    due volte lo stesso token. Si legge il **primo percorso che risponde**, mai la somma di due.
 *
 * ⛔⛔ **IL TOTALE NON SEMPRE LI INCLUDE.** Sul wire OpenAI i cached sono **dentro**
 *    `prompt_tokens`; sul wire Anthropic no — 🌐 `https://platform.claude.com/docs/en/build-with-
 *    claude/prompt-caching` (letto 12/09/2026): `total_input = cache_read + cache_creation + input`.
 *    Il record lo dichiara in `cache.inclusiNelTotale`, così il conto non dipende da chi legge.
 *
 * ⛔ **`cache_discount` NON è un conteggio di token.** 🌐
 *    `https://openrouter.ai/docs/features/prompt-caching` (letto 12/09/2026): sta **fuori** da
 *    `usage`, al livello del corpo, ed è un risparmio **in denaro** che può essere **negativo**
 *    sulle scritture Anthropic. Entra nel pannello costi, mai nei token.
 *
 * ⛔ **`null` non è `0`.** `session-registry.mjs:930` lo dice già a parole: «il consumo registrato
 *    non porta cached_tokens: il fornitore non ha dichiarato quanti token venissero dalla cache, e
 *    "non dichiarato" non è "nessuno"». Qui diventa eseguibile: nessun percorso dichiarato, o
 *    nessun percorso presente nel corpo ⇒ `null`.
 */

import { REGISTRO_FORNITORI, fornitore, WIRE } from './provider-registry.mjs';

/**
 * I percorsi che valgono per un WIRE, quando chi chiama non sa quale fornitore fosse.
 *
 * ⛔ Sono l'UNIONE delle forme note per quel trasporto, non una media: un lettore che conosce un
 *    nome in più non sbaglia mai, un lettore che ne conosce uno in meno riporta zero su una
 *    sessione che la cache l'ha usata eccome.
 *
 * Provenienza di ogni nome, perché fra un anno nessuno se lo ricordi:
 *  · `prompt_tokens_details.cached_tokens` — wire OpenAI standard, e OpenRouter 🌐;
 *  · `cache_read_input_tokens` — Anthropic, e i proxy che instradano Claude su wire OpenAI;
 *  · `prompt_cache_hit_tokens` — DeepSeek nativo 🌐;
 *  · `cached_tokens` al primo livello — Kimi/Moonshot 🌐 `https://platform.kimi.ai/docs/api/chat`
 *    («Number of tokens served from cache»), e anche la forma già appiattita dal nostro kernel;
 *  · `input_tokens_details.cached_tokens` — wire Responses (OpenAI, Meta, Router, xAI);
 *  · `usageMetadata.cachedContentTokenCount` / `total_cached_tokens` — Gemini REST / SDK.
 */
const LETTURA_PER_WIRE = Object.freeze({
  'openai-chat': Object.freeze([
    'prompt_tokens_details.cached_tokens',
    'cache_read_input_tokens',
    'prompt_cache_hit_tokens',
    'cached_tokens',
  ]),
  'openai-responses': Object.freeze([
    'input_tokens_details.cached_tokens',
    'prompt_tokens_details.cached_tokens',
    'cached_tokens',
  ]),
  'anthropic-messages': Object.freeze([
    'cache_read_input_tokens',
    'prompt_tokens_details.cached_tokens',
  ]),
  gemini: Object.freeze([
    'prompt_tokens_details.cached_tokens',
    'usageMetadata.cachedContentTokenCount',
    'total_cached_tokens',
    'cached_tokens',
  ]),
  locale: Object.freeze([]),
});

const SCRITTURA_PER_WIRE = Object.freeze({
  'openai-chat': Object.freeze(['prompt_tokens_details.cache_write_tokens']),
  'openai-responses': Object.freeze(['input_tokens_details.cache_write_tokens', 'input_tokens_details.cache_creation_tokens']),
  'anthropic-messages': Object.freeze(['cache_creation_input_tokens']),
  gemini: Object.freeze([]),
  locale: Object.freeze([]),
});

/** Legge un percorso puntato, senza mai lanciare su una forma inattesa. */
function valoreAlPercorso(oggetto, percorso) {
  let corrente = oggetto;
  for (const segmento of percorso.split('.')) {
    if (corrente === null || typeof corrente !== 'object') return undefined;
    corrente = corrente[segmento];
  }
  return corrente;
}

/** Un conteggio di token valido: intero, finito, non negativo. Tutto il resto è «non dichiarato». */
function conteggio(valore) {
  if (typeof valore !== 'number' && (typeof valore !== 'string' || valore.trim() === '')) return null;
  const numero = Number(valore);
  return Number.isFinite(numero) && numero >= 0 ? Math.trunc(numero) : null;
}

/**
 * I percorsi da provare, in ordine, per un fornitore o per un wire.
 *
 * ⛔ Il record del fornitore VINCE sul wire — è il posto dove una forma particolare si dichiara —
 *    ma i percorsi del wire restano in coda: un fornitore che un giorno cambia nome al campo non
 *    deve tornare a zero senza che nessuno se ne accorga.
 */
function percorsi(chiave, tavola) {
  if (typeof chiave !== 'string' || chiave === '') return [];
  const record = fornitore(chiave);
  if (record) {
    const propri = tavola === 'letturaUsage' ? record.cache?.letturaUsage ?? [] : record.cache?.scritturaUsage ?? [];
    const delWire = (tavola === 'letturaUsage' ? LETTURA_PER_WIRE : SCRITTURA_PER_WIRE)[record.wire] ?? [];
    return [...new Set([...propri, ...delWire])];
  }
  if (WIRE.includes(chiave)) return [...((tavola === 'letturaUsage' ? LETTURA_PER_WIRE : SCRITTURA_PER_WIRE)[chiave] ?? [])];
  return [];
}

/**
 * I token LETTI dalla cache in questa risposta.
 *
 * @param {object|null} usage il `usage` così come l'ha mandato il fornitore
 * @param {string} wire un wire (`openai-chat`, `anthropic-messages`, …) **oppure** l'id di un
 *   fornitore del registro (`deepseek`, `openrouter`, …), che è più preciso
 * @returns {number|null} il conteggio, o `null` se il fornitore non l'ha dichiarato.
 *   ⛔ `null`, mai `0`: «non dichiarato» non è «nessuno».
 */
export function tokenDaCache(usage, wire) {
  if (!usage || typeof usage !== 'object') return null;
  for (const percorso of percorsi(wire, 'letturaUsage')) {
    const valore = conteggio(valoreAlPercorso(usage, percorso));
    if (valore !== null) return valore;
  }
  return null;
}

/**
 * I token SCRITTI nella cache in questa risposta (dove il fornitore li dichiara).
 * ⛔ Costano più di un token normale — 1,25× a 5 minuti, 2× a un'ora su Anthropic 🌐 — quindi
 *    contarli come letture farebbe sembrare un risparmio una spesa.
 */
export function tokenScrittiInCache(usage, wire) {
  if (!usage || typeof usage !== 'object') return null;
  for (const percorso of percorsi(wire, 'scritturaUsage')) {
    const valore = conteggio(valoreAlPercorso(usage, percorso));
    if (valore !== null) return valore;
  }
  return null;
}

/**
 * Lo sconto **in denaro** dichiarato dal fornitore per questa generazione.
 *
 * ⛔ Non è un token e non entra in nessuna somma di token. Sta fuori da `usage` (OpenRouter lo
 *    mette al livello del corpo), quindi si passa il CORPO, non l'usage. Può essere negativo.
 */
export function scontoDaCache(corpo, wire) {
  const record = fornitore(wire);
  const campo = record?.cache?.scontoDichiarato;
  if (!campo || !corpo || typeof corpo !== 'object') return null;
  const valore = Number(valoreAlPercorso(corpo, campo) ?? valoreAlPercorso(corpo, `usage.${campo}`));
  return Number.isFinite(valore) ? valore : null;
}

/**
 * Rende un `usage` di qualunque forma leggibile da chi conosce **solo** il nome canonico
 * `prompt_tokens_details.cached_tokens`.
 *
 * ⛔ NON riscrive niente di ciò che c'era: aggiunge il nome canonico quando manca, e lascia intatti
 *    i campi nativi del fornitore. Un lettore che già li conosce continua a leggerli; uno che
 *    conosce solo il canonico smette di riportare zero. È la stessa disciplina del kernel, che
 *    somma «quello che c'è, senza inventare».
 * ⛔ Se non c'è niente da dichiarare l'oggetto torna **identico** (stessa referenza): chi chiama
 *    può usare quel confronto per non ricostruire un corpo che non è cambiato.
 *
 * @param {object|null} usage
 * @param {string} wire wire o id di fornitore
 * @returns {object|null}
 */
export function normalizzaUsage(usage, wire) {
  if (!usage || typeof usage !== 'object') return usage;
  const letti = tokenDaCache(usage, wire);
  // P-K — una scrittura Bedrock può essere dichiarata senza una lettura della cache.
  const soloScritturaCloud = fornitore(wire)?.cloud && tokenScrittiInCache(usage, wire) !== null;
  if (letti === null && !soloScritturaCloud) return usage;
  const gia = conteggio(valoreAlPercorso(usage, 'prompt_tokens_details.cached_tokens'));
  const scritti = tokenScrittiInCache(usage, wire);
  const giaScritti = conteggio(valoreAlPercorso(usage, 'prompt_tokens_details.cache_write_tokens'));
  if (gia === letti && (scritti === null || giaScritti === scritti)) return usage;
  const dettagli = { ...(usage.prompt_tokens_details && typeof usage.prompt_tokens_details === 'object' ? usage.prompt_tokens_details : {}) };
  if (letti !== null) dettagli.cached_tokens = letti;
  // P-K — fine
  if (scritti !== null) dettagli.cache_write_tokens = scritti;
  return { ...usage, prompt_tokens_details: dettagli };
}

/**
 * I token di ingresso davvero FATTURABILI a prezzo pieno, cioè quelli che non sono venuti dalla
 * cache — con la formula giusta per il wire.
 *
 * ⛔ È la riga che rende utile `cache.inclusiNelTotale`: su wire OpenAI i cached sono già dentro
 *    `prompt_tokens` e vanno SOTTRATTI; su wire Anthropic `input_tokens` è già il solo residuo e
 *    sottrarre di nuovo dimezzerebbe il conto. Sbagliare qui sbaglia del doppio, in silenzio.
 *
 * @returns {number|null} `null` se non si sa (nessun totale, o nessuna dichiarazione di cache).
 */
export function tokenNonDaCache(usage, wire) {
  if (!usage || typeof usage !== 'object') return null;
  const totale = conteggio(usage.prompt_tokens ?? usage.input_tokens);
  if (totale === null) return null;
  const letti = tokenDaCache(usage, wire);
  if (letti === null) return totale;
  const record = fornitore(wire);
  const inclusi = record ? record.cache?.inclusiNelTotale !== false : (wire !== 'anthropic-messages');
  return inclusi ? Math.max(0, totale - letti) : totale;
}

/** I percorsi dichiarati, per fornitore — serve al test di parità e a chi scrive un rapporto. */
export function percorsiDiCacheDichiarati() {
  return Object.fromEntries(Object.keys(REGISTRO_FORNITORI).map((id) => [id, percorsi(id, 'letturaUsage')]));
}

/**
 * BC-48 C — ingresso completo di UNA chiamata, comprese letture e scritture di cache.
 * Il `prompt_tokens` pubblico è già completo, anche quando arriva dall'adapter Anthropic.
 * Solo `input_tokens` sul wire nativo Anthropic esclude letture e scritture: si aggiungono
 * usando il contratto del registro, senza sommare due alias della stessa misura.
 */
export function tokenIngressoDaUsage(usage, wire) {
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) return null;
  const pubblico = conteggio(usage.prompt_tokens);
  if (pubblico !== null) return pubblico;
  const ingresso = conteggio(usage.input_tokens);
  if (ingresso === null) return null;
  const record = fornitore(wire);
  const inclusi = record ? record.cache?.inclusiNelTotale !== false : wire !== 'anthropic-messages';
  if (inclusi) return ingresso;
  const letti = tokenDaCache(usage, wire);
  const scritti = tokenScrittiInCache(usage, wire);
  if (letti === null || scritti === null) return null;
  return ingresso + letti + scritti;
}

/**
 * Proiezione additiva della sessione dai SOLI CUSTOM `consumo-fornitore` durabili (P-H).
 * `/usage` è cumulativo dentro un invio: non si somma a questi eventi per chiamata.
 * Senza P-H si dichiara assenza di misura, anche nei log storici. I giri senza ingresso
 * valido o senza letture dichiarate non entrano né al numeratore né al denominatore.
 * `_sequenza` identifica l'evento nel log di questa sessione: un replay non lo duplica.
 */
export function cacheSessioneDaEventi(eventi) {
  let tokenIngresso = 0; let letti = 0; let giriMisurati = 0; let giriNonMisurati = 0;
  const viste = new Set();
  for (const evento of Array.isArray(eventi) ? eventi : []) {
    if (evento?.type !== 'CUSTOM' || evento.name !== 'consumo-fornitore') continue;
    if (Number.isSafeInteger(evento._sequenza)) {
      if (viste.has(evento._sequenza)) continue;
      viste.add(evento._sequenza);
    }
    const { usage, provider } = evento.value && typeof evento.value === 'object' ? evento.value : {};
    const ingresso = tokenIngressoDaUsage(usage, provider);
    const cache = tokenDaCache(usage, provider);
    if (!Number.isSafeInteger(ingresso) || ingresso <= 0 || !Number.isSafeInteger(cache) || cache < 0 || cache > ingresso) {
      giriNonMisurati += 1;
      continue;
    }
    tokenIngresso += ingresso; letti += cache; giriMisurati += 1;
  }
  const misurato = giriMisurati > 0 && Number.isSafeInteger(tokenIngresso) && Number.isSafeInteger(letti);
  return {
    percentuale: misurato ? letti / tokenIngresso * 100 : null,
    tokenIngresso: misurato ? tokenIngresso : null,
    tokenDaCache: misurato ? letti : null,
    giriMisurati, giriNonMisurati, fonte: 'consumo-fornitore',
  };
}

/**
 * ⛔ 14/09 — quante chiamate al fornitore sono PARTITE e poi state fermate (`esito: 'fermato'`, runtime-owner-adapter).
 * Sono giri veri senza consumo dichiarato: il conto dei giri li include, quello dei token no, e chi mostra i token lo dice.
 * Solo gli stop: un guasto (`interrotto`, `traffico`) ha già la sua strada. `_sequenza` evita il doppio a un replay.
 * @returns {number} mai `null`: nei registri di prima del 14/09 non c'è niente da contare, e zero è la verità di quel log.
 */
export function giriFermatiDaEventi(eventi) {
  let fermati = 0;
  const viste = new Set();
  for (const evento of Array.isArray(eventi) ? eventi : []) {
    if (evento?.type !== 'CUSTOM' || evento.name !== 'consumo-fornitore' || evento.value?.esito !== 'fermato') continue;
    if (Number.isSafeInteger(evento._sequenza)) {
      if (viste.has(evento._sequenza)) continue;
      viste.add(evento._sequenza);
    }
    fermati += 1;
  }
  return fermati;
}
