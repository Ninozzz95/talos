import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { creaFetchMultiProvider } from '../src/runtime-owner-adapter.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';
import { chiamaConRitenta } from '../src/kernel/talosHarness.mjs';
import { INDIRIZZI_ZAI, sondaIndirizziZai } from '../src/zai-indirizzo.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'; // port (bugfixer, 09/10/2026): il cricchetto BC-09 del desktop

/*
 * Owner 09/10/2026 (stress run fermo alle 09:55 con «Credit not available at the provider» pur avendo il piano GLM):
 * «deve essere dinamica, vedi come fanno Pi Hermes e gli altri»; «Prima il piano (Consigliata)»; «Riprova sull'altro e lo
 * dice (Consigliata)». Z.AI fattura il piano GLM SOLO su `api/coding/paas/v4` (docs.z.ai/devpack/tool/others: «Incorrect
 * endpoint configuration will result in inability to use GLM Coding Plan subscription quota») e TALOS chiamava sempre
 * `api/paas/v4`, il saldo a consumo. Come Hermes (`hermes_cli/auth_zai_kimi.py`: sonda in parallelo, il primo che risponde
 * 200 in ordine di priorità, ricordato per chiave, un indirizzo scelto a mano vince sempre), con il piano per primo come il
 * default di Pi (`packages/ai/src/providers/zai.ts`), Cline (`sdk/packages/llms/src/providers/builtins.ts`) e Goose.
 */
const PIANO = 'https://api.z.ai/api/coding/paas/v4';
const PIANO_CN = 'https://open.bigmodel.cn/api/coding/paas/v4';
const SALDO = 'https://api.z.ai/api/paas/v4';
const SALDO_CN = 'https://open.bigmodel.cn/api/paas/v4';
const CHIAVE = 'zai-dinamica-chiave';
const CREDITO = JSON.stringify({ error: { code: '1113', message: 'Insufficient balance or no resource package. Please recharge.' } });

const ok = () => new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Fatto.' }, finish_reason: 'stop' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
const credito = () => new Response(CREDITO, { status: 429, headers: { 'Content-Type': 'application/json' } });

function banco(risposte, { runtimeFile = null, onAvviso = null } = {}) {
  const richieste = [];
  const rete = async (url, init = {}) => {
    const corpo = JSON.parse(String(init.body ?? '{}'));
    const base = [PIANO, PIANO_CN, SALDO, SALDO_CN].find((b) => String(url).startsWith(`${b}/`));
    richieste.push({ base, sonda: corpo.max_tokens === 1 && corpo.stream === false, chiave: String(init.headers?.Authorization ?? init.headers?.authorization ?? new Headers(init.headers).get('authorization') ?? '').replace('Bearer ', '') });
    const risposta = risposte[base];
    return typeof risposta === 'function' ? risposta(corpo) : new Response('not found', { status: 404 });
  };
  const custodia = new Map();
  const store = createProviderCredentialStore({
    env: { ZAI_API_KEY: CHIAVE }, runtimeFile,
    keyring: { get: (s, k) => custodia.get(`${s}:${k}`) ?? null, set: (s, k, v) => { custodia.set(`${s}:${k}`, v); return true; }, remove: () => true },
  });
  const avvisi = [];
  const trasporto = creaFetchMultiProvider(rete, { providerStore: store, onAvviso: onAvviso ?? (async (a) => { avvisi.push(a.testo); }),
    dipendenze: { leggiChiave: (p) => store.getKey(p), leggiRuntime: (p) => store.getRuntime(p) } });
  const opzioni = { modello: 'zai:glm-5.3-flash', chiave: 'unused', messaggi: [{ role: 'user', content: 'ciao' }], attrezzi: [],
    maxOutputTokens: 50, fetchDiRete: trasporto, dormi: async () => {}, caso: () => 0 };
  return { richieste, store, avvisi, chiama: () => chiamaConRitenta(opzioni), vere: () => richieste.filter((r) => !r.sonda), sonde: () => richieste.filter((r) => r.sonda) };
}

test('ZAI-D1 prima il piano: la chiave che funziona su piano e saldo va sul piano, ricordato per chiave, senza rifare la sonda', async () => {
  const b = banco({ [PIANO]: ok, [SALDO]: ok, [PIANO_CN]: ok, [SALDO_CN]: ok });
  await b.chiama();
  assert.deepEqual(b.vere().map((r) => r.base), [PIANO], 'la richiesta vera va sul piano GLM');
  assert.ok(b.sonde().length >= 1 && b.sonde().every((r) => r.chiave === CHIAVE), 'la sonda usa la chiave della persona');
  const ricordato = b.store.indirizzoRilevato('zai');
  assert.equal(ricordato.endpoint, PIANO);
  assert.equal(ricordato.impronta.length, 16, 'solo un prefisso dell\'impronta, come Hermes');
  const sondePrima = b.sonde().length;
  await b.chiama();
  assert.deepEqual(b.vere().map((r) => r.base), [PIANO, PIANO]);
  assert.equal(b.sonde().length, sondePrima, 'la seconda richiesta non rifà la sonda');
  assert.deepEqual(b.avvisi, []);
});

test('ZAI-D2 senza piano: il piano risponde «credito», il saldo funziona ⇒ si usa il saldo', async () => {
  const b = banco({ [PIANO]: credito, [PIANO_CN]: credito, [SALDO]: ok, [SALDO_CN]: credito });
  await b.chiama();
  assert.deepEqual(b.vere().map((r) => r.base), [SALDO]);
  assert.equal(b.store.indirizzoRilevato('zai').endpoint, SALDO);
});

test('ZAI-D3 a metà lavoro: il saldo finisce ⇒ una nuova sonda senza il saldo, passa al piano, lo dice, e la richiesta va a buon fine', async () => {
  // Ricordato il saldo per questa chiave (era l'unico che funzionava); ora il saldo è finito e la persona ha il piano.
  const pianoAttivo = banco({ [PIANO]: ok, [PIANO_CN]: credito, [SALDO]: credito, [SALDO_CN]: credito });
  pianoAttivo.store.impostaIndirizzoRilevato('zai', SALDO, pianoAttivo.store.elencaPool('zai')[0].impronta.slice(0, 16));
  const esito = await pianoAttivo.chiama();
  assert.ok(esito, 'la richiesta va a buon fine');
  assert.deepEqual(pianoAttivo.vere().map((r) => r.base), [SALDO, PIANO], 'prima il saldo (credito finito), poi il piano');
  assert.ok(pianoAttivo.sonde().every((r) => r.base !== SALDO), 'la nuova sonda non riprova l\'indirizzo appena rifiutato');
  assert.equal(pianoAttivo.store.indirizzoRilevato('zai').endpoint, PIANO);
  assert.equal(pianoAttivo.avvisi.length, 1);
  assert.match(pianoAttivo.avvisi[0], /GLM Coding Plan/u);
});

test('ZAI-D4 un indirizzo scelto dalla persona vince sempre: nessuna sonda, nessun cambio', async () => {
  const b = banco({ [PIANO]: ok, [SALDO]: credito, [PIANO_CN]: ok, [SALDO_CN]: ok });
  b.store.setRuntime('zai', { endpoint: SALDO });
  await assert.rejects(b.chiama(), { code: 'PROVIDER_REQUEST_ERROR' });
  assert.equal(b.sonde().length, 0);
  assert.ok(b.vere().every((r) => r.base === SALDO));
  assert.deepEqual(b.avvisi, []);
});

test('ZAI-D5 nessun indirizzo risponde: si resta su quello di serie e la sonda non si ripete per 5 minuti', async () => {
  const b = banco({ [PIANO]: credito, [PIANO_CN]: credito, [SALDO]: credito, [SALDO_CN]: credito });
  await assert.rejects(b.chiama(), { code: 'PROVIDER_REQUEST_ERROR' });
  const sonde = b.sonde().length;
  assert.ok(sonde >= 4);
  assert.equal(b.store.indirizzoRilevato('zai'), null);
  await assert.rejects(b.chiama(), { code: 'PROVIDER_REQUEST_ERROR' });
  assert.ok(b.vere().every((r) => r.base === SALDO), 'resta l\'indirizzo di serie');
  assert.equal(b.sonde().length, sonde, 'nessuna nuova sonda dentro i 5 minuti');
});

test('ZAI-D6 l\'indirizzo ricordato sopravvive al riavvio; un indirizzo che non è di Z.AI nel file si ignora; una chiave nuova rifà la sonda', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'talos-zai-dinamico-'));
  try {
    const file = join(dir, 'providers.json');
    const b = banco({ [PIANO]: ok, [SALDO]: ok, [PIANO_CN]: ok, [SALDO_CN]: ok }, { runtimeFile: file });
    await b.chiama();
    const salvato = JSON.parse(readFileSync(file, 'utf8')).providers.zai;
    assert.deepEqual(salvato.rilevato, { endpoint: PIANO, impronta: b.store.indirizzoRilevato('zai').impronta });
    assert.equal(salvato.endpointConfigured, false, 'rilevato non è «scelto dalla persona»');
    const riavvio = banco({ [PIANO]: ok, [SALDO]: ok, [PIANO_CN]: ok, [SALDO_CN]: ok }, { runtimeFile: file });
    await riavvio.chiama();
    assert.equal(riavvio.sonde().length, 0, 'dopo il riavvio niente sonda');
    assert.deepEqual(riavvio.vere().map((r) => r.base), [PIANO]);
    writeFileSync(file, JSON.stringify({ version: 1, providers: { zai: { ...salvato, rilevato: { endpoint: 'https://evil.example/v4', impronta: salvato.rilevato.impronta } } } }));
    const manomesso = banco({ [PIANO]: ok, [SALDO]: ok, [PIANO_CN]: ok, [SALDO_CN]: ok }, { runtimeFile: file });
    assert.equal(manomesso.store.indirizzoRilevato('zai'), null, 'solo i quattro indirizzi di Z.AI');
    manomesso.store.impostaIndirizzoRilevato('zai', PIANO, 'ffffffffffffffff');
    await manomesso.chiama();
    assert.ok(manomesso.sonde().length >= 1, 'l\'indirizzo ricordato per un\'altra chiave non vale');
  } finally { rimuoviCartellaDiProva(dir); }
});

test('ZAI-D7 la sonda: in parallelo, vince il primo in ordine di priorità, 1 token, e prova più modelli', async () => {
  assert.deepEqual(INDIRIZZI_ZAI.map((i) => i.endpoint), [PIANO, PIANO_CN, SALDO, SALDO_CN]);
  const viste = [];
  const fetchFn = async (url, init) => {
    const corpo = JSON.parse(init.body);
    viste.push([String(url), corpo.model, corpo.max_tokens]);
    if (String(url).startsWith(SALDO)) return ok();
    if (String(url).startsWith(PIANO) && corpo.model === 'glm-4.7') { await new Promise((r) => setTimeout(r, 20)); return ok(); }
    return credito();
  };
  const vinto = await sondaIndirizziZai({ chiave: CHIAVE, fetchFn, modelli: ['glm-5.3-flash', 'glm-4.7'] });
  assert.equal(vinto.endpoint, PIANO, 'il saldo risponde prima, ma il piano ha la priorità');
  assert.ok(viste.every(([, , max]) => max === 1));
  assert.ok(viste.some(([url, modello]) => url.startsWith(PIANO) && modello === 'glm-4.7'), 'prova i modelli in ordine');
  assert.equal(await sondaIndirizziZai({ chiave: CHIAVE, fetchFn: async () => credito(), modelli: ['glm-5.3-flash'] }), null);
  const escluso = await sondaIndirizziZai({ chiave: CHIAVE, fetchFn, modelli: ['glm-5.3-flash', 'glm-4.7'], escludi: [PIANO] });
  assert.equal(escluso.endpoint, SALDO);
});
