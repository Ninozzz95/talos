/**
 * openrouter-fornitori.mjs — dal NOME di un fornitore a valle («DeepInfra», come lo dice ogni risposta di OpenRouter) al suo
 * SLUG («deepinfra», come lo vuole `provider.ignore`).
 *
 * ⛔ Decisione 14 dell'owner (08/10/2026 sera): «Escludi questo fornitore» dal menu della risposta, con conferma; lo slug lo
 *   trova TALOS. La fonte è l'elenco degli endpoint del modello (docs OpenRouter, `GET /api/v1/models/{model}/endpoints`, schema
 *   `PublicEndpoint`: `provider_name` e `tag`, «provider slug identifiers», lette l'08/10). Si esclude lo slug di BASE (la parte
 *   prima di `/`): «a base provider slug … matches all endpoints for that provider, including any variants or regions».
 * ⛔ Mai indovinare: un nome che fra gli endpoint del modello non c'è, o che porta a due slug diversi, è un errore col suo codice
 *   — la persona lo può sempre scrivere a mano nelle impostazioni.
 */
const BASE = 'https://openrouter.ai/api/v1/models';
const ATTESA_MASSIMA_MS = 10_000;

export class FornitoreNonTrovatoError extends Error {
  constructor(message, code) { super(message); this.name = 'FornitoreNonTrovatoError'; this.code = code; }
}

/* `vendor/nome:variante` → ogni pezzo codificato, le barre restano barre (è il percorso della rotta) */
function percorsoDelModello(grezzo) {
  // la fonte davanti (`openrouter:vendor/nome`, `provider-registry.mjs`: «la fonte si separa con `:`») non fa parte dell'id
  const modello = typeof grezzo === 'string' ? grezzo.replace(/^openrouter:/u, '') : grezzo;
  if (typeof modello !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:@-]*\/[a-zA-Z0-9][a-zA-Z0-9._:@/-]*$/u.test(modello) || modello.includes('..')) return null;
  return modello.split('/').map(encodeURIComponent).join('/');
}

/** Gli endpoint della risposta, in tutte e due le forme note (`data.endpoints` oppure `data` come elenco). */
function endpointDi(corpo) {
  if (Array.isArray(corpo?.data?.endpoints)) return corpo.data.endpoints;
  if (Array.isArray(corpo?.data)) return corpo.data;
  return [];
}

const normale = (s) => String(s ?? '').trim().toLowerCase();

/**
 * @param {{fornitore:string, modello:string, fetchFn?:typeof fetch, chiave?:string|null}} richiesta
 * @returns {Promise<string>} lo slug di base
 */
export async function slugDelFornitore({ fornitore, modello, fetchFn = globalThis.fetch, chiave = null } = {}) {
  const nome = normale(fornitore);
  const percorso = percorsoDelModello(modello);
  if (!nome || nome.length > 80) throw new FornitoreNonTrovatoError('The provider name is missing or too long', 'QUERY_INVALID');
  if (!percorso) throw new FornitoreNonTrovatoError('The model id is not an OpenRouter model id', 'QUERY_INVALID');
  let risposta;
  try {
    risposta = await fetchFn(`${BASE}/${percorso}/endpoints`, {
      headers: { Accept: 'application/json', ...(chiave ? { Authorization: `Bearer ${chiave}` } : {}) },
      signal: AbortSignal.timeout(ATTESA_MASSIMA_MS),
    });
  } catch {
    throw new FornitoreNonTrovatoError('OpenRouter did not answer with the providers of this model', 'OPENROUTER_ENDPOINTS_UNAVAILABLE');
  }
  if (!risposta?.ok) throw new FornitoreNonTrovatoError('OpenRouter did not answer with the providers of this model', 'OPENROUTER_ENDPOINTS_UNAVAILABLE');
  let corpo;
  try { corpo = await risposta.json(); } catch { throw new FornitoreNonTrovatoError('OpenRouter did not answer with the providers of this model', 'OPENROUTER_ENDPOINTS_UNAVAILABLE'); }
  const slug = new Set();
  for (const e of endpointDi(corpo)) {
    if (normale(e?.provider_name) !== nome || typeof e?.tag !== 'string') continue;
    const base = normale(e.tag).split('/')[0];
    if (/^[a-z0-9][a-z0-9._-]{0,47}$/u.test(base)) slug.add(base);
  }
  if (slug.size !== 1) {
    throw new FornitoreNonTrovatoError(slug.size === 0
      ? 'This provider is not among the providers of this model on OpenRouter: add it by hand in the OpenRouter settings'
      : 'This name matches more than one provider: add the right one by hand in the OpenRouter settings', 'OPENROUTER_PROVIDER_NOT_FOUND');
  }
  return [...slug][0];
}
