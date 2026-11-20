#!/usr/bin/env node
/*
 * S6 della 0.2.4 (decisione 2026-11-18-0858, registro 158): l'elenco dei modelli di riserva rigenerato da models.dev.
 *
 * Perché: i modelli di riserva del registro (`modelliDiRiserva`, `modelloAusiliario` in `src/provider-registry.mjs`) sono scritti a mano il
 *   12/09/2026 e nessuno li ricontrollava. Il 18/11 `liquid/lfm-2.5-2.6b:free` non esisteva più (404 su OpenRouter), MiniMax-M2.5 e Llama 3.3
 *   70B di Together erano «deprecated» su models.dev, gpt-5-nano e gpt-5-mini si spengono l'11/12. Come pi, che rigenera il suo elenco a ogni
 *   versione da models.dev (`pi-mono-2026-10-15/packages/ai/scripts/generate-models.ts:1835` legge api.json, `:1584` salta i «deprecated»,
 *   `:1494` tiene solo `tool_call`, `:317-318` tiene a mano gli id ritirati che il catalogo pubblico mostra ancora). Hermes tiene
 *   un elenco statico di riserva copiato dalla cache di models.dev (`hermes_cli/models_catalog_static.py:95-97`).
 *
 * Cosa fa: per ogni fornitore del registro con riserve, proietta da api.json i fatti di ogni modello di riserva e dell'ausiliario (nome,
 *   attrezzi, prezzo per milione, stato) e propone i `candidati` (i più economici vivi con gli attrezzi): i modelli NUOVI si vedono nel diff.
 *   Le correzioni strette a mano (ritiri annunciati che models.dev non segna, eccezioni motivate) stanno in
 *   `scripts/modelli-di-riserva/correzioni.json`. L'uscita sta nel deposito (`scripts/modelli-di-riserva/elenco-generato.json`) e la legge il
 *   cancello `tests/modelli-scritti-a-mano-cancello.test.mjs`.
 *
 * ⛔ La rete è SPENTA di serie: in build e nelle prove si legge solo il file dato con `--da`. `--rete` legge https://models.dev/api.json,
 *   solo lettura, nessuna chiave, e solo se lo chiede una persona.
 *
 * Uso:
 *   node scripts/genera-elenco-modelli.mjs --da <api.json> [--letto AAAA-MM-GG]   rigenera l'elenco dal file
 *   node scripts/genera-elenco-modelli.mjs --rete                                 rigenera leggendo models.dev (solo a mano)
 *   node scripts/genera-elenco-modelli.mjs --controlla                            nessuna rete: l'elenco nel deposito copre il registro di oggi?
 */
import { createHash } from 'node:crypto';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const QUI = dirname(fileURLToPath(import.meta.url));
export const PERCORSO_CORREZIONI = join(QUI, 'modelli-di-riserva', 'correzioni.json');
export const PERCORSO_ELENCO = join(QUI, 'modelli-di-riserva', 'elenco-generato.json');
export const URL_MODELS_DEV = 'https://models.dev/api.json';

const numero = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const chiave = (fornitore, id) => `${fornitore}\u0000${id}`;

/** Lo stato di un modello per TALOS: vivo, in spegnimento (data annunciata futura), ritirato, senza attrezzi, sconosciuto. */
export function statoDelModello(m, ritiro, letto) {
  if (!m) return 'sconosciuto';
  if (m.status === 'deprecated') return 'ritirato';
  if (ritiro) return ritiro.data <= letto ? 'ritirato' : 'in-spegnimento';
  if (m.tool_call !== true) return 'senza-attrezzi';
  return 'vivo';
}

function voce(ruolo, id, m, ritiro, letto) {
  const v = { ruolo, id, nome: m?.name ?? null, stato: statoDelModello(m, ritiro, letto), attrezzi: m?.tool_call === true,
    ingresso: numero(m?.cost?.input), uscita: numero(m?.cost?.output), cacheLettura: numero(m?.cost?.cache_read) };
  if (ritiro) v.ritiroAnnunciato = ritiro.data;
  return v;
}

/**
 * Funzione PURA: (api.json, registro, correzioni, data di lettura) → elenco generato. Nessuna rete, nessun disco.
 * @param {Record<string, {models: Record<string, object>}>} api
 * @param {Record<string, object>} registro  REGISTRO_FORNITORI
 * @param {{ritiriAnnunciati?: {fornitore:string,id:string,data:string,fonte:string}[], candidatiPerFornitore?: number, esclusiDaiCandidati?: string[]}} correzioni
 */
export function generaElenco(api, registro, correzioni, { letto, sha256 = null } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(String(letto))) throw new Error('A read date (YYYY-MM-DD) is required.');
  const ritiri = new Map((correzioni.ritiriAnnunciati ?? []).map((r) => [chiave(r.fornitore, r.id), r]));
  const esclusi = new Set(correzioni.esclusiDaiCandidati ?? []);
  const quanti = Number.isSafeInteger(correzioni.candidatiPerFornitore) ? correzioni.candidatiPerFornitore : 3;
  const fornitori = {};
  for (const r of Object.values(registro)) {
    if (!Array.isArray(r.modelliDiRiserva) || r.modelliDiRiserva.length === 0 || !r.modelsDevId) continue;
    const modelli = api?.[r.modelsDevId]?.models ?? {};
    const daMd = (id) => (Object.hasOwn(modelli, id) ? modelli[id] : null);
    const riserve = r.modelliDiRiserva.map((m) => voce('riserva', m.id, daMd(m.id), ritiri.get(chiave(r.id, m.id)), letto));
    const ausiliario = r.modelloAusiliario ?? null;
    /* il registro vuole l'ausiliario dentro le riserve (`verificaRegistro`); se un giorno non lo fosse, la sua voce c'è lo stesso */
    if (ausiliario && !riserve.some((v) => v.id === ausiliario)) riserve.push(voce('ausiliario', ausiliario, daMd(ausiliario), ritiri.get(chiave(r.id, ausiliario)), letto));
    const giaDentro = new Set(riserve.map((v) => v.id));
    const candidati = Object.values(modelli)
      .filter((m) => typeof m?.id === 'string' && !giaDentro.has(m.id) && !esclusi.has(`${r.id}/${m.id}`)
        && statoDelModello(m, ritiri.get(chiave(r.id, m.id)), letto) === 'vivo' && numero(m.cost?.input) !== null && numero(m.cost?.output) !== null)
      .sort((a, b) => (a.cost.input + a.cost.output) - (b.cost.input + b.cost.output) || a.id.localeCompare(b.id))
      .slice(0, quanti)
      .map((m) => voce('candidato', m.id, m, null, letto));
    fornitori[r.id] = { modelsDevId: r.modelsDevId, presenteSuModelsDev: Object.hasOwn(api ?? {}, r.modelsDevId), ausiliario, voci: [...riserve, ...candidati] };
  }
  return { fonte: URL_MODELS_DEV, letto, sha256, fornitori };
}

/** JSON con un modello per riga: il diff dice esattamente quali modelli entrano ed escono. */
export function serializza(elenco) {
  const blocchi = Object.entries(elenco.fornitori).map(([id, f]) => {
    const testa = `    ${JSON.stringify(id)}: { "modelsDevId": ${JSON.stringify(f.modelsDevId)}, "presenteSuModelsDev": ${f.presenteSuModelsDev}, "ausiliario": ${JSON.stringify(f.ausiliario)}, "voci": [`;
    return `${testa}${f.voci.length ? `\n${f.voci.map((v) => `      ${JSON.stringify(v)}`).join(',\n')}` : ''} ] }`;
  });
  return `{\n  "fonte": ${JSON.stringify(elenco.fonte)},\n  "letto": ${JSON.stringify(elenco.letto)},\n  "sha256": ${JSON.stringify(elenco.sha256)},\n  "fornitori": {\n${blocchi.join(',\n')}\n  }\n}\n`;
}

/** Le voci del registro (riserve e ausiliario) di un fornitore dell'elenco. */
export const vociDelRegistro = (f) => (f?.voci ?? []).filter((v) => v.ruolo === 'riserva' || v.ruolo === 'ausiliario');

/** Ciò che il registro di oggi scrive a mano e l'elenco nel deposito non copre (per `--controlla` e per il cancello). */
export function differenzeDalRegistro(elenco, registro) {
  const problemi = [];
  for (const r of Object.values(registro)) {
    if (!Array.isArray(r.modelliDiRiserva) || r.modelliDiRiserva.length === 0 || !r.modelsDevId) continue;
    const f = elenco.fornitori?.[r.id];
    if (!f) { problemi.push(`${r.id}: missing from the generated list`); continue; }
    const scritti = r.modelliDiRiserva.map((m) => m.id).join(',');
    const generati = f.voci.filter((v) => v.ruolo === 'riserva').map((v) => v.id).join(',');
    if (scritti !== generati) problemi.push(`${r.id}: registry fallbacks [${scritti}] differ from the generated list [${generati}]`);
    if ((r.modelloAusiliario ?? null) !== (f.ausiliario ?? null)) problemi.push(`${r.id}: auxiliary ${r.modelloAusiliario} differs from the generated list ${f.ausiliario ?? null}`);
  }
  for (const id of Object.keys(elenco.fornitori ?? {})) if (!registro[id]?.modelliDiRiserva?.length) problemi.push(`${id}: in the generated list but without fallbacks in the registry`);
  return problemi;
}

function scriviAtomico(percorso, testo) {
  const temporaneo = `${percorso}.${process.pid}.tmp`;
  writeFileSync(temporaneo, testo, { encoding: 'utf8', flag: 'w' });
  renameSync(temporaneo, percorso);
}

async function principale(argomenti) {
  const { REGISTRO_FORNITORI } = await import(pathToFileURL(join(QUI, '..', 'src', 'provider-registry.mjs')).href);
  const correzioni = JSON.parse(readFileSync(PERCORSO_CORREZIONI, 'utf8'));
  if (argomenti.includes('--controlla')) {
    const problemi = differenzeDalRegistro(JSON.parse(readFileSync(PERCORSO_ELENCO, 'utf8')), REGISTRO_FORNITORI);
    for (const p of problemi) console.log(`- ${p}`);
    console.log(problemi.length ? `${problemi.length} differences: regenerate the list.` : 'The generated list covers the registry.');
    return problemi.length ? 1 : 0;
  }
  const i = argomenti.indexOf('--da');
  let testo;
  if (i >= 0 && argomenti[i + 1]) testo = readFileSync(argomenti[i + 1], 'utf8');
  else if (argomenti.includes('--rete')) {
    const risposta = await fetch(URL_MODELS_DEV, { headers: { Accept: 'application/json' }, credentials: 'omit', signal: AbortSignal.timeout(60_000) });
    if (!risposta.ok) throw new Error(`models.dev answered ${risposta.status}`);
    testo = await risposta.text();
  } else {
    console.log('Nothing done: pass --da <api.json>, --rete (reads models.dev) or --controlla.');
    return 2;
  }
  const j = argomenti.indexOf('--letto');
  const letto = j >= 0 ? argomenti[j + 1] : new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());
  const elenco = generaElenco(JSON.parse(testo), REGISTRO_FORNITORI, correzioni, { letto, sha256: createHash('sha256').update(testo).digest('hex') });
  scriviAtomico(PERCORSO_ELENCO, serializza(elenco));
  const fuori = Object.entries(elenco.fornitori).flatMap(([id, f]) => vociDelRegistro(f).filter((v) => v.stato !== 'vivo').map((v) => `${id}/${v.id}: ${v.stato}`));
  console.log(`Written ${PERCORSO_ELENCO} (${Object.keys(elenco.fornitori).length} providers).`);
  for (const f of fuori) console.log(`- not alive: ${f}`);
  return 0;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  principale(process.argv.slice(2)).then((codice) => { process.exitCode = codice; }, (errore) => { console.error(errore?.message ?? errore); process.exitCode = 1; });
}
