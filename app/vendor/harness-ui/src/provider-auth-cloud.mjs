// P-K — adattatore REST cloud, contratti ufficiali fissati al 12/09/2026.
// Fonti e alternative: .claude/RAPPORTO-PK-AZURE-BEDROCK-VERTEX-2026-09-12.md.
import { REGISTRO_FORNITORI } from './provider-registry.mjs';

export class ProviderCloudError extends Error {
  constructor(message, code = 'PROVIDER_RUNTIME_INVALID') {
    super(message); this.name = 'ProviderCloudError'; this.code = code;
  }
}

/** Il formato su disco resta un indirizzo ufficiale, senza query private o segrete. */
export function normalizzaRuntimeCloud(provider, { endpoint } = {}) {
  const record = REGISTRO_FORNITORI[provider];
  if (!record?.cloud) return null;
  const invalido = () => { throw new ProviderCloudError(`Controlla l'indirizzo e la configurazione di ${record.etichetta}.`); };
  let url;
  try { url = new URL(endpoint); } catch { invalido(); }
  const locale = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(locale && url.protocol === 'http:')) invalido();
  if (url.username || url.password || url.hash || [...url.searchParams.keys()].some(k => provider !== 'azure' || k !== 'api-version')) invalido();
  let path = url.pathname.replace(/\/+$/u, '');
  let regione = null, progetto = null, versioneApi = 'v1', endpointRisorsa = null;
  if (provider === 'azure') {
    const versioni = url.searchParams.getAll('api-version');
    if (versioni.length > 1 || versioni.some(v => !['v1', '2024-10-21'].includes(v))) invalido();
    versioneApi = versioni[0] ?? 'v1';
    if (!['', '/openai', '/openai/v1'].includes(path)) invalido();
    if (versioneApi === '2024-10-21' && path === '/openai/v1') invalido();
    path = versioneApi === 'v1' ? '/openai/v1' : '/openai';
    endpointRisorsa = url.origin;
    if (versioneApi === 'v1') url.search = '';
  } else if (provider === 'bedrock') {
    const runtime = /^bedrock-runtime\.([a-z0-9-]+)\.amazonaws\.com$/u.exec(url.hostname);
    const mantle = /^bedrock-mantle\.([a-z0-9-]+)\.api\.aws$/u.exec(url.hostname);
    regione = runtime?.[1] ?? mantle?.[1] ?? null;
    if (!path) path = mantle ? '/v1' : '/openai/v1';
    if (!['/v1', '/openai/v1'].includes(path)) invalido();
    // Una regione esplicita nel nome resta la regione della destinazione.
  } else if (provider === 'vertex') {
    const parti = /^\/v1\/projects\/([a-zA-Z0-9][a-zA-Z0-9-]{0,62})\/locations\/([a-z0-9-]+)\/endpoints\/openapi$/u.exec(path);
    if (!parti) invalido();
    [, progetto, regione] = parti;
    if (url.hostname.endsWith('aiplatform.googleapis.com')) {
      const host = regione === 'global' ? 'aiplatform.googleapis.com' : `${regione}-aiplatform.googleapis.com`;
      if (url.hostname !== host) invalido();
    }
  } else invalido();
  url.pathname = path;
  return { endpoint: url.toString(), regione, progetto, versioneApi, endpointRisorsa };
}

/** Stringa legacy oppure involucro v1, custodito interamente come UNA chiave del pool. */
export function intestazioniCloud(provider, chiave, { ora = Date.now() } = {}) {
  const record = REGISTRO_FORNITORI[provider];
  const invalida = () => { throw new ProviderCloudError(`Controlla la credenziale di ${record.etichetta}.`, 'PROVIDER_CLOUD_CREDENTIAL_INVALID'); };
  if (typeof chiave !== 'string' || !chiave.trim()) throw new ProviderCloudError(`Manca la chiave per ${record.etichetta}.`, 'PROVIDER_KEY_MISSING');
  let valore = chiave.trim(), tipo = record.auth.tipo;
  if (valore.startsWith('{')) {
    let dati;
    try { dati = JSON.parse(valore); } catch { invalida(); }
    if (!dati || dati.versione !== 1 || !['bearer', ...(provider === 'azure' ? ['header'] : [])].includes(dati.tipo)
      || Object.keys(dati).some(k => !['versione', 'tipo', 'valore', 'scadeAlle'].includes(k))) invalida();
    valore = dati.valore; tipo = dati.tipo;
    if (dati.scadeAlle !== undefined) {
      if (typeof dati.scadeAlle !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/u.test(dati.scadeAlle) || !Number.isFinite(Date.parse(dati.scadeAlle))) invalida();
      if (Date.parse(dati.scadeAlle) <= ora) throw new ProviderCloudError(`L'accesso a ${record.etichetta} è scaduto: inserisci una credenziale aggiornata.`, 'PROVIDER_CLOUD_TOKEN_EXPIRED');
    }
  }
  if (typeof valore !== 'string' || !/^[\x21-\x7e]+$/u.test(valore) || valore.length > 4096) invalida();
  return tipo === 'header' ? { 'api-key': valore } : { Authorization: `Bearer ${valore}` };
}

export function destinazioneCloud(provider, runtime, chiave, modelloRemoto, { catalogo = false } = {}) {
  const config = normalizzaRuntimeCloud(provider, runtime);
  const headers = { 'Content-Type': 'application/json', ...intestazioniCloud(provider, chiave) };
  const url = new URL(config.endpoint);
  if (catalogo) {
    // Il catalogo Azure è authoring v1 anche quando l'inferenza usa la versione precedente.
    if (provider === 'azure') { url.pathname = '/openai/v1/models'; url.search = ''; }
    else url.pathname += '/models';
  }
  else {
    // Il deployment Azure è scelto dall'owner, mai dedotto dal nome del modello base.
    if (provider === 'azure') {
      if (typeof modelloRemoto !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/u.test(modelloRemoto) || modelloRemoto.includes('..')) {
        throw new ProviderCloudError('Controlla il nome della distribuzione di Azure AI Foundry.', 'MODEL_DESTINATION_INVALID');
      }
      if (config.versioneApi !== 'v1') url.pathname += `/deployments/${encodeURIComponent(modelloRemoto)}`;
    }
    url.pathname += '/chat/completions';
  }
  // Il segreto è disponibile al trasporto, ma non alla serializzazione diagnostica.
  return Object.defineProperty({ fonte: provider, modelloRemoto, url: url.toString(), cloud: true }, 'headers', { value: headers });
}
// P-K — fine
