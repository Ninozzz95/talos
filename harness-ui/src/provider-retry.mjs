// Shared by the adapter and independently bundled kernel. Never transported as an HTTP header.
const RIFIUTO_PROVIDER = Symbol.for('talos.provider-rejection.v1');

export function marcaRifiutoProvider(risposta, motivo) {
  /*
   * ⛔ BUG-25 (06/10/2026) — il canale interno accetta anche `credito`: Z.AI fattura il credito
   * come 429 + codice business (tabella ufficiale docs.z.ai/api-reference/api-code), OpenRouter
   * come 402 — il marker non può legarsi al solo 402. Il motivo è messo SOLO dall'adapter quando
   * il fornitore dichiara una scadenza: senza dichiarazione nessun marker, nessun retry a vuoto.
   */
  if ((risposta?.status === 402 && motivo === 'budget-occupato') || motivo === 'credito') {
    Object.defineProperty(risposta, RIFIUTO_PROVIDER, { value: Object.freeze({
      schema: 'talos.provider-rejection.v1', motivo,
    }) });
  }
  return risposta;
}

export function leggiRifiutoProvider(risposta) {
  const rifiuto = risposta?.[RIFIUTO_PROVIDER];
  if (rifiuto?.schema !== 'talos.provider-rejection.v1') return null;
  if (rifiuto.motivo === 'credito') return rifiuto;
  return risposta?.status === 402 && rifiuto.motivo === 'budget-occupato' ? rifiuto : null;
}

/**
 * ⛔ BUG-25 (06/10/2026) — grammatiche di reset DICHIARATE NEL CORPO del rifiuto, stessa tabella
 * di Hermes (`agent/retry_utils.py:64-76`, clone 65ad529): `quotaResetDelay: 30s|500ms|2m|1h`,
 * `resets_in_seconds: 90`, `resets in 4hr 5min`, `retry after 12 s`. La precedenza è INVARIATA:
 * gli header (`retry-after-ms` > `retry-after`) vincono sempre; la grammatica vale solo quando
 * gli header non dicono nulla. Z.AI dichiara i propri limiti nel corpo (codici business 1310 e
 * 1316-1321, tabella ufficiale 06/10): un reset DICHIARATO è un fatto del fornitore, non una
 * stima nostra — alimenta panchina, marcatura e messaggio. I tempi ASSOLUTI («Resets at …»)
 * restano fuori dalla tranche 1: il formato esatto va confermato dal vivo prima di parsarlo.
 * @param {string|null} testo corpo del rifiuto già letto (limitato, come `leggiDettaglioRifiuto`)
 * @returns {number|null} millisecondi dichiarati, o null
 */
export function leggiAttesaResetDalCorpo(testo) {
  if (typeof testo !== 'string' || !testo || testo.length > 16_384) return null;
  const UNITA = { ms: 1, s: 1000, sec: 1000, secs: 1000, second: 1000, seconds: 1000, m: 60_000, min: 60_000, mins: 60_000, minute: 60_000, minutes: 60_000, h: 3_600_000, hr: 3_600_000, hrs: 3_600_000, hour: 3_600_000, hours: 3_600_000 };
  const componi = (elenco) => {
    if (!elenco.length) return null;
    const totale = elenco.reduce((somma, [valore, unita]) => somma + Number(valore) * (UNITA[unita.toLowerCase()] ?? 0), 0);
    return totale > 0 ? Math.round(totale) : null;
  };
  let m = /\bquotaResetDelay\s*[:=]\s*(\d+(?:\.\d+)?)\s*(ms|s|m|h)\b/i.exec(testo);
  if (m) return componi([[m[1], m[2]]]);
  m = /\bresets_in_seconds\s*["']?\s*[:=]\s*(\d+(?:\.\d+)?)/i.exec(testo);
  if (m) return componi([[m[1], 's']]);
  m = /\bresets\s+in\s+((?:\d+(?:\.\d+)?\s*(?:ms|hrs?|hours?|mins?|minutes?|secs?|seconds?|s|m|h)\b[,\s]*){1,4})/i.exec(testo);
  if (m) {
    const parti = [...m[1].matchAll(/(\d+(?:\.\d+)?)\s*(ms|hrs?|hours?|mins?|minutes?|secs?|seconds?|s|m|h)\b/gi)].map(x => [x[1], x[2]]);
    const attesa = componi(parti);
    if (attesa !== null) return attesa;
  }
  m = /\bretry\s+after\s+(\d+(?:\.\d+)?)\s*(ms|secs?|seconds?|mins?|minutes?|s|m|h)\b/i.exec(testo);
  if (m) return componi([[m[1], m[2]]]);
  return null;
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
  const silenzio = causaDiTrasporto === 'PROVIDER_SILENCE';
  const errore = new Error(silenzio ? "The provider response was interrupted by prolonged silence and the outcome of the request is uncertain. Resume explicitly when you want to continue: a new request may incur another cost." : "The provider response was interrupted and the outcome of the request is uncertain. Resume explicitly when you want to continue: a new request may incur another cost.");
  errore.chiave = silenzio ? 'server.providerOutcome.silence' : 'server.providerOutcome.interrupted';
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

/**
 * BUG-16 (05/10/2026, owner: auto-retry NON negoziabile) — l'esito incerto è SOPRAVVISSUTO al suo
 * budget di reinvii sicuri: la scheda manuale diventa l'ultima spiaggia ONESTA, non la prima strada.
 * Porta `ritentabile: true` (il giro può riprendersi) e il conto dei reinvii già provati, così la
 * carta può dire la verità: «ritentato automaticamente N volte senza effetti intermedi».
 */
export function erroreEsitoProviderIncertoEsaurito(causa, esitiRitentati) {
  const errore = erroreEsitoProviderIncerto(causa);
  /* ⛔ K4b (07/10/2026, riserva F1 del bugfixer) — la base mette la chiave del caso NON esaurito (`interrupted` o
     `silence`): senza sovrascriverla, la carta e la trascrizione dicevano la frase senza «dopo N reinvii automatici».
     La chiave ha le forme One/Many (`testoDelServer` sceglie con `tn` sul numero). */
  return Object.assign(errore, {
    code: 'PROVIDER_OUTCOME_UNKNOWN_ESAURITO',
    message: 'The provider response was interrupted and its outcome remained uncertain even after '
      + `${esitiRitentati} automatic ${esitiRitentati === 1 ? 'resend' : 'resends'} with no intermediate effects. `
      + 'The request may have been produced and paid for: resume explicitly when you want to continue.',
    chiave: 'server.providerOutcome.exhausted',
    params: { n: esitiRitentati },
    ritentabile: true,
    esitiIncertiRitentati: esitiRitentati,
  });
}
