/**
 * P-E, 12/09/2026: API models.dev dietro un contratto AVM.
 * Ricerca, pin, licenza e collegamenti non applicati nel rapporto P-E in harness-ui/.claude/.
 * I prezzi sono dichiarazioni per la stima; questo modulo non calcola la spesa di una sessione.
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { fornitore } from './provider-registry.mjs';

export const MODELS_DEV_SCHEMA_REVISION = 'e7a74d6dc7ce56d1a9dda94c18fcf185248d77b4';
const URL_PREDEFINITO = 'https://models.dev/api.json';
// Politica applicativa ripresa da Hermes; non è una promessa di aggiornamento della fonte.
const TTL_MS = 4 * 60 * 60 * 1000;
const RINVIO_MS = 5 * 60 * 1000;
const LICENZA_DATI = `MIT License

Copyright (c) 2025 models.dev

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

export class ModelsDevCatalogError extends Error {
  constructor(message, code = 'CATALOG_UNAVAILABLE') {
    super(message);
    this.name = 'ModelsDevCatalogError';
    this.code = code;
  }
}

// Nessuna coercizione: false, stringa vuota e null non sono il numero zero.
const Numero = z.number().finite().nonnegative();
const Prezzi = z.object({
  input: Numero.nullish(), output: Numero.nullish(),
  cache_read: Numero.nullish(), cache_write: Numero.nullish(),
  reasoning: Numero.nullish(), input_audio: Numero.nullish(), output_audio: Numero.nullish(),
});
const Fascia = Prezzi.extend({ tier: z.object({ type: z.literal('context'), size: Numero.int() }) });
const Costi = Prezzi.extend({ tiers: z.array(Fascia).optional(), context_over_200k: Prezzi.optional() });
const Identificatore = z.string().min(1).max(1024);
const Modello = z.object({
  id: Identificatore, name: z.string().min(1).optional(),
  limit: z.object({ context: Numero.nullish(), input: Numero.nullish(), output: Numero.nullish() }).nullish(),
  cost: Costi.nullish(), tool_call: z.boolean().nullish(), reasoning: z.boolean().nullish(),
  modalities: z.object({ input: z.array(z.string()).optional(), output: z.array(z.string()).optional() }).nullish(),
  release_date: z.string().optional(), last_updated: z.string().optional(),
});
const Catalogo = z.record(Identificatore, z.object({
  id: Identificatore, name: z.string().min(1), models: z.record(Identificatore, Modello),
})).superRefine((dati, ctx) => {
  if (!Object.keys(dati).length) ctx.addIssue({ code: 'custom', message: 'Catalogo vuoto' });
  for (const [id, p] of Object.entries(dati)) {
    if (p.id !== id) ctx.addIssue({ code: 'custom', message: 'Identità fornitore incoerente' });
    for (const [modelloId, m] of Object.entries(p.models)) {
      if (m.id !== modelloId) ctx.addIssue({ code: 'custom', message: 'Identità modello incoerente' });
    }
  }
});
const Etag = z.string().regex(/^(W\/)?"[^"\r\n]*"$/u).max(1024).nullable();
const Busta = z.object({
  versione: z.literal(1), schemaRevision: z.literal(MODELS_DEV_SCHEMA_REVISION),
  url: z.string(), etag: Etag,
  acquisitoAlle: z.number().int().nonnegative(), verificatoAlle: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u), dati: Catalogo,
});
const impronta = testo => createHash('sha256').update(testo).digest('hex');
const numeroOppureNull = valore => typeof valore === 'number' && Number.isFinite(valore) && valore >= 0 ? valore : null;
const perToken = valore => valore == null ? null : valore / 1_000_000;
const eta = (ora, acquisitoAlle) => ora >= acquisitoAlle ? ora - acquisitoAlle : null;

function prezziPerMilione(costi) {
  return {
    valuta: 'USD', unita: 'milione-token',
    ...Object.fromEntries(['input', 'output', 'cache_read', 'cache_write', 'reasoning', 'input_audio', 'output_audio'].map(k => [k, numeroOppureNull(costi?.[k])])),
    tiers: structuredClone(costi?.tiers ?? []),
    context_over_200k: structuredClone(costi?.context_over_200k ?? null),
  };
}

function normalizza(m, record, metadati) {
  const prezzi = prezziPerMilione(m.cost);
  return {
    // Solo OpenRouter usa gli id senza prefisso di destinazione; gli id upstream restano intatti.
    id: record.id === 'openrouter' ? m.id : `${record.id}:${m.id}`,
    modelId: m.id, provider: record.id, nome: m.name || 'Nome non disponibile', alias: false,
    contextLength: m.limit?.context > 0 ? m.limit.context : null,
    maxOutputTokens: m.limit?.output > 0 ? m.limit.output : null,
    maxInputTokens: m.limit?.input > 0 ? m.limit.input : null,
    contestoVerificato: false,
    prezzoPrompt: perToken(prezzi.input), prezzoCompletion: perToken(prezzi.output),
    prezzoCacheRead: perToken(prezzi.cache_read), prezzoCacheWrite: perToken(prezzi.cache_write),
    prezziPerMilione: prezzi,
    capacita: { toolCall: m.tool_call ?? null, reasoning: m.reasoning ?? null },
    inputModalities: m.modalities?.input ? [...m.modalities.input] : null,
    outputModalities: m.modalities?.output ? [...m.modalities.output] : null,
    // Il selettore storico legge qui livelli/configurazione, non un booleano di supporto.
    reasoning: null,
    dataRilascio: m.release_date ?? null, ultimoAggiornamentoFonte: m.last_updated ?? null,
    catalogo: structuredClone(metadati),
  };
}

/**
 * Cache unica per URL, sotto la cartella dati ricevuta da loadConfig().
 * fetchFn, clock e fsImpl sono iniettabili: nessuna rete necessaria nei test.
 * ottieni(id, opzioni) espone soltanto i modelli del record richiesto, non i campi di trasporto upstream.
 */
export function createModelsDevCatalog({
  cartellaStore, url = URL_PREDEFINITO, fetchFn = globalThis.fetch, clock = () => new Date(),
  ttlMs = TTL_MS, retryMs = RINVIO_MS, timeoutMs = 15_000, fsImpl = {},
} = {}) {
  let indirizzo;
  try { indirizzo = new URL(url); } catch { throw new ModelsDevCatalogError('Indirizzo del catalogo non valido.', 'CONFIG_INVALID'); }
  if (!['http:', 'https:'].includes(indirizzo.protocol) || indirizzo.username || indirizzo.password || indirizzo.hash || !cartellaStore) {
    throw new ModelsDevCatalogError('Configurazione del catalogo non valida.', 'CONFIG_INVALID');
  }
  url = indirizzo.href;
  const fs = { mkdir, readFile, rename, rm, writeFile, ...fsImpl };
  const cartellaCache = join(cartellaStore, 'cache');
  const percorsoCache = join(cartellaCache, `models-dev-${impronta(url).slice(0, 16)}.json`);
  let copia = null, discoLetto = false, inVolo = null, riprovaAlle = 0, fallbackRete = false;
  const avvisi = new Map();
  const avvisa = (codice, messaggio) => avvisi.set(codice, { codice, messaggio });

  function erroreSenzaCopia() {
    return avvisi.has('CATALOG_CACHE_CORRUPT')
      ? new ModelsDevCatalogError('Copia del catalogo danneggiata: rifiutata. La fonte non è disponibile per recuperarla.', 'CATALOG_CACHE_CORRUPT')
      : new ModelsDevCatalogError('Catalogo non disponibile: impossibile leggere la fonte e nessuna copia salvata utilizzabile.');
  }

  async function leggiDisco() {
    if (discoLetto) return;
    discoLetto = true;
    let testo;
    try { testo = await fs.readFile(percorsoCache, 'utf8'); }
    catch (e) {
      if (e.code !== 'ENOENT') avvisa('CATALOG_CACHE_READ_FAILED', 'La copia salvata non è leggibile.');
      return;
    }
    try {
      const busta = JSON.parse(testo);
      if (!Busta.safeParse(busta).success || busta.url !== url || busta.verificatoAlle < busta.acquisitoAlle || impronta(JSON.stringify(busta.dati)) !== busta.sha256) throw new Error('Copia non valida');
      copia = busta;
    } catch {
      // Nessun ETag viene caricato separatamente: non può sopravvivere ai dati che garantisce.
      avvisa('CATALOG_CACHE_CORRUPT', 'Copia del catalogo danneggiata: rifiutata.');
    }
  }

  async function salvaDisco() {
    const temporaneo = `${percorsoCache}.${randomUUID()}.tmp`;
    try {
      await fs.mkdir(cartellaCache, { recursive: true });
      await fs.writeFile(temporaneo, JSON.stringify(copia), { encoding: 'utf8', flag: 'wx' });
      await fs.rename(temporaneo, percorsoCache);
      avvisi.delete('CATALOG_CACHE_WRITE_FAILED');
    } catch {
      avvisa('CATALOG_CACHE_WRITE_FAILED', 'Catalogo letto, ma non è stato possibile salvare la copia.');
    } finally {
      await fs.rm(temporaneo, { force: true }).catch(() => {});
    }
  }

  async function aggiorna(forza) {
    await leggiDisco();
    const ora = clock().getTime();
    const etaVerifica = copia ? eta(ora, copia.verificatoAlle) : null;
    if (!forza && !copia && ora < riprovaAlle) throw erroreSenzaCopia();
    if (!forza && copia && ((etaVerifica !== null && etaVerifica < ttlMs) || ora < riprovaAlle)) return true;
    try {
      const headers = { Accept: 'application/json' };
      if (copia?.etag) headers['If-None-Match'] = copia.etag;
      const risposta = await fetchFn(url, { method: 'GET', headers, credentials: 'omit', signal: AbortSignal.timeout(timeoutMs) });
      const ricevutoEtag = risposta.headers?.get('etag') ?? null;
      const nuovoEtag = Etag.safeParse(ricevutoEtag).success ? ricevutoEtag : null;
      const invariato = risposta.status === 304;
      if (invariato) {
        if (!copia) throw new ModelsDevCatalogError('Il catalogo non ha restituito dati utilizzabili.');
        copia = { ...copia, verificatoAlle: clock().getTime(), etag: nuovoEtag ?? copia.etag };
      } else {
        if (!risposta.ok) {
          await risposta.body?.cancel?.();
          throw new ModelsDevCatalogError('La fonte del catalogo non è disponibile.');
        }
        const dati = await risposta.json();
        if (!Catalogo.safeParse(dati).success) throw new ModelsDevCatalogError('La fonte ha restituito un catalogo non valido.');
        const acquisitoAlle = clock().getTime();
        copia = { versione: 1, schemaRevision: MODELS_DEV_SCHEMA_REVISION, url,
          etag: nuovoEtag, acquisitoAlle, verificatoAlle: acquisitoAlle,
          sha256: impronta(JSON.stringify(dati)), dati, licenza: LICENZA_DATI };
      }
      fallbackRete = false;
      riprovaAlle = 0;
      avvisi.delete('CATALOG_REFRESH_FAILED');
      await salvaDisco();
      return invariato;
    } catch {
      riprovaAlle = clock().getTime() + retryMs;
      if (!copia) {
        throw erroreSenzaCopia();
      }
      fallbackRete = true;
      avvisa('CATALOG_REFRESH_FAILED', 'Aggiornamento non disponibile: viene usata la copia salvata.');
      return true;
    }
  }

  async function ottieni(id, { forzaAggiornamento = false } = {}) {
    const record = fornitore(id);
    const modelsDevId = record?.modelsDevId ?? null;
    const indisponibile = { provider: id, modelsDevId, disponibile: false, modelli: [],
      motivo: `Catalogo${record ? ` ${record.etichetta}` : ''} non disponibile.`, fonte: 'models.dev',
      aggiornatoAlle: null, verificatoAlle: null, etaCacheMs: null, daCache: false, fallbackRete: false, avvisi: [] };
    if (!modelsDevId) return indisponibile;
    // Una promessa condivisa comprende lettura disco, download e scrittura atomica.
    if (!inVolo) inVolo = aggiorna(forzaAggiornamento).finally(() => { inVolo = null; });
    const daCache = await inVolo;
    const metadati = { fonte: 'models.dev', aggiornatoAlle: new Date(copia.acquisitoAlle).toISOString(),
      verificatoAlle: new Date(copia.verificatoAlle).toISOString(), etaCacheMs: eta(clock().getTime(), copia.acquisitoAlle),
      daCache, fallbackRete, avvisi: structuredClone([...avvisi.values()]) };
    if (!Object.hasOwn(copia.dati, modelsDevId)) return { ...indisponibile, ...metadati };
    const modelli = Object.values(copia.dati[modelsDevId].models)
      .map(m => normalizza(m, record, metadati))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'it') || a.id.localeCompare(b.id));
    return { provider: id, modelsDevId, disponibile: true, modelli, motivo: null, ...metadati };
  }

  return Object.freeze({ ottieni, percorsoCache });
}

/** Porta per GET /api/v1/providers/:id/models. Nessuna chiave transita nel catalogo. */
export function createProviderModelCatalog({ catalogo, chiaveConfigurata } = {}) {
  async function ottieni(id, opzioni) {
    const record = fornitore(id);
    if (!record?.destinazioneChat || record.catalogo.fonte === 'runtime-locale' || id === 'openrouter') {
      throw new ModelsDevCatalogError('Catalogo non disponibile per questa destinazione.', 'REPORT_UNAVAILABLE');
    }
    if (record.chiaveObbligatoria && (typeof chiaveConfigurata !== 'function' || await chiaveConfigurata(id) !== true)) {
      throw new ModelsDevCatalogError(`Collega la chiave ${record.etichetta} dal pannello Provider.`, 'PROVIDER_KEY_REQUIRED');
    }
    try {
      const dati = await catalogo.ottieni(id, opzioni);
      if (!dati.disponibile) throw new ModelsDevCatalogError(dati.motivo);
      return { ...dati, credenzialeVerificata: false };
    } catch (errore) {
      throw new ModelsDevCatalogError(errore instanceof ModelsDevCatalogError ? errore.message : 'Catalogo non disponibile.', 'CATALOG_UPSTREAM_ERROR');
    }
  }
  return Object.freeze({ ottieni });
}
