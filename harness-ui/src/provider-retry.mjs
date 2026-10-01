// Shared by the adapter and independently bundled kernel. Never transported as an HTTP header.
const RIFIUTO_PROVIDER = Symbol.for('talos.provider-rejection.v1');

export function marcaRifiutoProvider(risposta, motivo) {
  if (risposta?.status === 402 && motivo === 'budget-occupato') {
    Object.defineProperty(risposta, RIFIUTO_PROVIDER, { value: Object.freeze({
      schema: 'talos.provider-rejection.v1', motivo,
    }) });
  }
  return risposta;
}

export function leggiRifiutoProvider(risposta) {
  const rifiuto = risposta?.[RIFIUTO_PROVIDER];
  return risposta?.status === 402 && rifiuto?.schema === 'talos.provider-rejection.v1'
    && rifiuto.motivo === 'budget-occupato' ? rifiuto : null;
}

/** RFC 9110 §10.2.3: milliseconds to wait, null for an invalid/missing field.
 * Infinity deliberately survives parsing: callers must stop, never overflow a Node timer.
 */
export function leggiAttesaRetryAfter(value, now = Date.now()) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (/^\d+$/.test(text)) return Number(text) * 1000;
  // Only HTTP date grammars, not Date.parse's permissive numeric/local-date syntax.
  const day = '(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)';
  const month = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)';
  const imf = new RegExp(`^${day}, \\d{2} ${month} \\d{4} \\d{2}:\\d{2}:\\d{2} GMT$`);
  const rfc850 = new RegExp(`^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), (\\d{2}-${month}-)(\\d{2})( \\d{2}:\\d{2}:\\d{2} GMT)$`).exec(text);
  const asctime = new RegExp(`^${day} ${month} [ \\d]\\d \\d{2}:\\d{2}:\\d{2} \\d{4}$`);
  let deadline;
  if (imf.test(text)) deadline = Date.parse(text);
  else if (rfc850) {
    const limit = new Date(now);
    limit.setUTCFullYear(limit.getUTCFullYear() + 50);
    let year = Math.floor(limit.getUTCFullYear() / 100) * 100 + Number(rfc850[2]);
    deadline = Date.parse(`${rfc850[1]}${year}${rfc850[3]}`);
    if (deadline > limit.getTime()) {
      year -= 100;
      deadline = Date.parse(`${rfc850[1]}${year}${rfc850[3]}`);
    }
  } else if (asctime.test(text)) deadline = Date.parse(`${text} GMT`);
  else return null;
  return Number.isFinite(deadline) ? Math.max(0, deadline - now) : null;
}

/**
 * G02-10 (lane R della CLI, accordo desktop 30/09/2026 punto 3): l'attesa CHIESTA dal fornitore, in ms, o null.
 * `retry-after-ms` vince su `retry-after` quando c'è (pi-mono packages/ai/src/utils/provider-retry.ts `getRetryDelayMs`,
 * bf8e4b9: prima retry-after-ms, poi retry-after); un valore malformato non è una risposta e si passa a `retry-after`,
 * letto con le regole rigorose di leggiAttesaRetryAfter. Un solo punto per il ciclo del kernel e per l'adapter.
 */
export function leggiAttesaRichiestaDalFornitore(headers, now = Date.now()) {
  const leggi = (nome) => { try { return typeof headers?.get === 'function' ? headers.get(nome) : null; } catch { return null; } };
  const ms = leggi('retry-after-ms');
  if (typeof ms === 'string' && /^\d+(?:\.\d+)?$/u.test(ms.trim())) return Math.round(Number(ms.trim()));
  return leggiAttesaRetryAfter(leggi('retry-after'), now);
}

/** A lost response cannot establish that a generation (or its cost) never happened. */
export function erroreEsitoProviderIncerto(causa) {
  const causaDiTrasporto = ['PROVIDER_SILENCE', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'PROVIDER_FIRST_RESPONSE_TIMEOUT', 'PROVIDER_STREAM_ERROR', 'PROVIDER_STREAM_INCOMPLETE', 'PROVIDER_STREAM_INVALID']
    .find(codice => codice === causa?.causaDiTrasporto || codice === causa?.code);
  const motivo = causaDiTrasporto === 'PROVIDER_SILENCE'
    ? 'La risposta del fornitore si è interrotta per silenzio prolungato'
    : 'La risposta del fornitore si è interrotta';
  const errore = new Error(motivo + ' e l’esito della richiesta è incerto. '
    + 'Riprendi esplicitamente quando vuoi continuare: una nuova richiesta può comportare un altro costo.');
  return Object.assign(errore, {
    code: 'PROVIDER_OUTCOME_UNKNOWN', esitoIncerto: true, transitorio: false,
    classe: typeof causa?.classe === 'string' ? causa.classe : 'esito-incerto',
    ...(causaDiTrasporto ? { causaDiTrasporto } : {}),
    ...(causa?.parziale ? { parziale: causa.parziale } : {}),
    ...(consumoPubblico(causa?.usage) ? { usage: consumoPubblico(causa.usage) } : {}),
  });
}

/** Preserve only declared numeric usage; missing counters and cost stay unknown. */
export function consumoPubblico(usage) {
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) return null;
  const risultato = {};
  const copiaNumeri = (da, campi) => Object.fromEntries(campi.filter(k => typeof da?.[k] === 'number' && Number.isFinite(da[k]) && da[k] >= 0).map(k => [k, da[k]]));
  Object.assign(risultato, copiaNumeri(usage, ['prompt_tokens','completion_tokens','total_tokens','input_tokens','output_tokens','cost','cache_read_input_tokens','cache_creation_input_tokens','prompt_cache_hit_tokens','prompt_cache_miss_tokens']));
  for (const [campo, campi] of Object.entries({prompt_tokens_details:['cached_tokens','cache_write_tokens'],completion_tokens_details:['reasoning_tokens']})) {
    const v = copiaNumeri(usage[campo], campi); if (Object.keys(v).length) risultato[campo] = v;
  }
  if (typeof usage.cache_discount === 'number' && Number.isFinite(usage.cache_discount)) risultato.cache_discount = usage.cache_discount;
  return Object.keys(risultato).length ? risultato : null;
}
