/*
 * ⛔ 02/10/2026 — contratto unico dell'ELICITATION MCP (owner: «patch del kernel al desktop, poi la CLI»; mockup step-17
 * «server MCP che chiedono»). Spec MCP «Elicitation»: un server chiede alla persona dati con un modulo (`form`, schema
 * PIATTO di primitivi: string con formati, number/integer, boolean, enum singolo o multiplo) o di aprire una pagina (`url`,
 * solo per segreti, OAuth, pagamenti: i dati non passano dal client). La risposta è `accept` (col contenuto del modulo),
 * `decline` o `cancel`. Ricerca nel registro 12 (Claude Code 2.1.281, Codex PR #17043 e #45621, Gemini #22249, SDK v2 via
 * ctx7). Kernel, registro e rotta HTTP accettano la STESSA forma: la semantica vive qui una volta sola.
 */
export const LIMITI_ELICITAZIONE = Object.freeze({ messaggioMax: 2_000, campiMax: 20, testoMax: 4_000, urlMax: 8_000 });
export const AZIONI_ELICITAZIONE = Object.freeze(['accept', 'decline', 'cancel']);

export class ContrattoElicitazioneError extends Error {
  constructor(message, code) { super(message); this.name = 'ContrattoElicitazioneError'; this.code = code; }
}
const rifiutaRichiesta = (motivo) => { throw new ContrattoElicitazioneError(motivo, 'ELICITATION_INVALID'); };
const rifiutaRisposta = (motivo) => { throw new ContrattoElicitazioneError(motivo, 'ELICITATION_ANSWER_INVALID'); };
const oggetto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/* Un campo del modulo: solo i primitivi che la spec ammette, niente annidamenti. */
function campo(nome, schema) {
  if (!oggetto(schema)) rifiutaRichiesta(`campo ${nome}: schema non valido`);
  const titolo = typeof schema.title === 'string' ? { title: schema.title } : {};
  const descrizione = typeof schema.description === 'string' ? { description: schema.description } : {};
  if (schema.type === 'string') {
    if (schema.enum !== undefined && (!Array.isArray(schema.enum) || !schema.enum.length || schema.enum.some((x) => typeof x !== 'string'))) rifiutaRichiesta(`campo ${nome}: enum non valido`);
    return { type: 'string', ...titolo, ...descrizione,
      ...(schema.enum ? { enum: [...schema.enum] } : {}), ...(Array.isArray(schema.enumNames) ? { enumNames: schema.enumNames.map(String) } : {}),
      ...(typeof schema.format === 'string' ? { format: schema.format } : {}),
      ...(Number.isSafeInteger(schema.minLength) ? { minLength: schema.minLength } : {}), ...(Number.isSafeInteger(schema.maxLength) ? { maxLength: schema.maxLength } : {}),
      ...(typeof schema.default === 'string' ? { default: schema.default } : {}) };
  }
  if (schema.type === 'number' || schema.type === 'integer') {
    return { type: schema.type, ...titolo, ...descrizione,
      ...(typeof schema.minimum === 'number' ? { minimum: schema.minimum } : {}), ...(typeof schema.maximum === 'number' ? { maximum: schema.maximum } : {}),
      ...(typeof schema.default === 'number' ? { default: schema.default } : {}) };
  }
  if (schema.type === 'boolean') return { type: 'boolean', ...titolo, ...descrizione, ...(typeof schema.default === 'boolean' ? { default: schema.default } : {}) };
  if (schema.type === 'array') {
    const voci = oggetto(schema.items) ? schema.items : null;
    const scelte = voci?.type === 'string' && Array.isArray(voci.enum) && voci.enum.length && voci.enum.every((x) => typeof x === 'string') ? voci.enum : null;
    if (!scelte) rifiutaRichiesta(`campo ${nome}: una lista è ammessa solo come scelta multipla di testi`);
    return { type: 'array', ...titolo, ...descrizione, items: { type: 'string', enum: [...scelte] },
      ...(Number.isSafeInteger(schema.minItems) ? { minItems: schema.minItems } : {}), ...(Number.isSafeInteger(schema.maxItems) ? { maxItems: schema.maxItems } : {}),
      ...(Array.isArray(schema.default) ? { default: schema.default.filter((x) => scelte.includes(x)) } : {}) };
  }
  return rifiutaRichiesta(`campo ${nome}: tipo ${String(schema.type)} non ammesso (solo primitivi)`);
}

/** La richiesta del server, ripulita: `{mode, message, requestedSchema}` o `{mode, message, url, dominio, elicitationId}`. */
export function validaRichiestaElicitazione(parametri) {
  if (!oggetto(parametri)) rifiutaRichiesta('richiesta non valida');
  const message = typeof parametri.message === 'string' ? parametri.message.trim() : '';
  if (!message) rifiutaRichiesta('message obbligatorio');
  if (message.length > LIMITI_ELICITAZIONE.messaggioMax) rifiutaRichiesta('message troppo lungo');
  const mode = parametri.mode ?? 'form';
  if (mode === 'url') {
    if (typeof parametri.url !== 'string' || parametri.url.length > LIMITI_ELICITAZIONE.urlMax) rifiutaRichiesta('url obbligatorio');
    let indirizzo;
    try { indirizzo = new URL(parametri.url); } catch { rifiutaRichiesta('url non valido'); }
    if (indirizzo.protocol !== 'https:' || !indirizzo.hostname) rifiutaRichiesta('url: solo https');
    if (typeof parametri.elicitationId !== 'string' || !parametri.elicitationId) rifiutaRichiesta('elicitationId obbligatorio nel modo url');
    return { mode: 'url', message, url: indirizzo.href, dominio: indirizzo.hostname, elicitationId: parametri.elicitationId };
  }
  if (mode !== 'form') rifiutaRichiesta(`mode ${String(mode)} sconosciuto`);
  const schema = parametri.requestedSchema;
  if (!oggetto(schema) || schema.type !== 'object' || !oggetto(schema.properties)) rifiutaRichiesta('requestedSchema obbligatorio (object con properties)');
  const nomi = Object.keys(schema.properties);
  if (nomi.length > LIMITI_ELICITAZIONE.campiMax) rifiutaRichiesta('troppi campi');
  const properties = Object.fromEntries(nomi.map((nome) => [nome, campo(nome, schema.properties[nome])]));
  const required = Array.isArray(schema.required) ? schema.required.filter((n) => nomi.includes(n)) : [];
  return { mode: 'form', message, requestedSchema: { type: 'object', properties, ...(required.length ? { required } : {}) } };
}

function valoreValido(schema, valore) {
  if (schema.type === 'string') return typeof valore === 'string' && valore.length <= LIMITI_ELICITAZIONE.testoMax && (!schema.enum || schema.enum.includes(valore))
    && (schema.minLength === undefined || valore.length >= schema.minLength) && (schema.maxLength === undefined || valore.length <= schema.maxLength);
  if (schema.type === 'integer' || schema.type === 'number') return typeof valore === 'number' && Number.isFinite(valore) && (schema.type === 'number' || Number.isInteger(valore))
    && (schema.minimum === undefined || valore >= schema.minimum) && (schema.maximum === undefined || valore <= schema.maximum);
  if (schema.type === 'boolean') return typeof valore === 'boolean';
  if (schema.type === 'array') return Array.isArray(valore) && valore.every((x) => schema.items.enum.includes(x)) && new Set(valore).size === valore.length
    && (schema.minItems === undefined || valore.length >= schema.minItems) && (schema.maxItems === undefined || valore.length <= schema.maxItems);
  return false;
}

/** La risposta della persona a una richiesta GIÀ validata: accept col contenuto conforme (solo form), decline o cancel. */
export function validaRispostaElicitazione(risposta, richiesta) {
  if (!oggetto(risposta) || !AZIONI_ELICITAZIONE.includes(risposta.action)) rifiutaRisposta('action deve essere accept, decline o cancel');
  if (risposta.action !== 'accept' || richiesta.mode === 'url') {
    if (risposta.content !== undefined) rifiutaRisposta('il contenuto accompagna solo accept di un modulo');
    return { action: risposta.action };
  }
  const contenuto = risposta.content ?? {};
  if (!oggetto(contenuto)) rifiutaRisposta('content deve essere un oggetto');
  const campi = richiesta.requestedSchema.properties;
  for (const nome of Object.keys(contenuto)) if (!Object.hasOwn(campi, nome)) rifiutaRisposta(`campo sconosciuto: ${nome}`);
  for (const nome of richiesta.requestedSchema.required ?? []) if (contenuto[nome] === undefined) rifiutaRisposta(`campo obbligatorio mancante: ${nome}`);
  for (const [nome, valore] of Object.entries(contenuto)) if (!valoreValido(campi[nome], valore)) rifiutaRisposta(`valore non valido per ${nome}`);
  return { action: 'accept', content: { ...contenuto } };
}
