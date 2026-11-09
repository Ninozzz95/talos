/*
 * Modalità veloce sul piano ChatGPT (owner 31/10/2026, forma con Desktop, CLI e Mobile: `in-corso/PROPOSTA-MODALITA-VELOCE-2026-10-31.md`).
 * Opzione del composer, spenta di serie. Ogni sessione nuova parte spenta, e anche biforcazione, riavvio e figlie. Chi la spegne è il nucleo.
 * Ogni regola ha il suo verso contrario.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { creaFetchMultiProvider } from '../src/runtime-owner-adapter.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';
import { chiamaConRitenta } from '../src/kernel/talosHarness.mjs';
import { adattaCorpoAlPiano, creaFetchDelPiano } from '../src/chatgpt-richiesta.mjs';
import { calcolaContinuazione, statoDopoRisposta } from '../src/chatgpt-collegamento.mjs';
import { avviaSessione } from '../src/agent-service.mjs';
import { creaFasciaVeloceDelModello, modelloDelPiano } from '../src/chatgpt-rotte.mjs';
import { createHttpApp } from '../src/http-app.mjs';
import { creaChiamataInterna } from '../src/remoto/chiamata-interna.mjs';
import { createSessionRegistry as createSessionRegistryReale } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';

const CON_FASCIA = 'chatgpt:gpt-6-luna';
const SENZA_FASCIA = 'chatgpt:gpt-6-vecchio';
const fasciaVeloceDelModelloFn = async (modello) => (modello === CON_FASCIA ? { id: 'priority', descrizione: '1.5x speed' } : null);

function createSessionRegistry(opzioni) {
  return createSessionRegistryReale({ guardaWorkspaceFn: () => () => {}, modello: CON_FASCIA, chiave: 'k', fasciaVeloceDelModelloFn,
    preparaEsecuzioneFn: (taskId) => {
      if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
      return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'fai il lavoro' } };
    },
    cartellaEsisteFn: () => true, ...opzioni });
}

function giriFinti() {
  const giri = [];
  return {
    avviaSessioneFn(input) {
      let risolvi;
      const promessa = new Promise((resolve) => { risolvi = resolve; });
      giri.push({ input, risolvi });
      input.onEvento({ type: 'RunStarted', threadId: `t${giri.length}`, runId: `r${giri.length}` });
      return promessa;
    },
    giro(i) { return giri[i]; },
    concludi(i) { giri[i].input.onEvento({ type: 'RunFinished' }); giri[i].risolvi({ ok: true, esito: { comeFinita: 'concluso', detto: 'ok', messaggiFinali: [{ role: 'user', content: 'x' }] } }); },
  };
}
const unTick = () => new Promise((r) => setImmediate(r));

test('VELOCE-CATALOGO: la fascia la dice il catalogo, modello per modello', () => {
  assert.deepEqual(modelloDelPiano({ slug: 'a', service_tiers: [{ id: 'priority', name: 'Fast', description: '1.5x speed' }] }).fasciaVeloce, { id: 'priority', descrizione: '1.5x speed' });
  assert.deepEqual(modelloDelPiano({ slug: 'a', service_tiers: [{ id: 'priority' }] }).fasciaVeloce, { id: 'priority', descrizione: null });
  for (const service_tiers of [undefined, [], 'priority', [{ id: 'default' }], [{ id: '' }], [null], [{ name: 'Fast' }]]) {
    assert.equal('fasciaVeloce' in modelloDelPiano({ slug: 'a', service_tiers }), false, JSON.stringify(service_tiers));
  }
});

test('VELOCE-CORPO: il campo parte solo se chiesto', async () => {
  assert.equal(adattaCorpoAlPiano({ model: 'm', input: [] }, { fasciaDiServizio: 'priority' }).corpo.service_tier, 'priority');
  assert.equal('service_tier' in adattaCorpoAlPiano({ model: 'm', input: [] }).corpo, false);
  assert.equal('service_tier' in adattaCorpoAlPiano({ model: 'm', input: [] }, { fasciaDiServizio: null }).corpo, false);
  const corpi = [];
  const rete = async (_u, o) => { corpi.push(JSON.parse(o.body)); return new Response('data: {}\n\n', { status: 200 }); };
  let fascia = 'priority';
  const f = creaFetchDelPiano(rete, { fasciaDiServizioFn: async () => fascia });
  const manda = () => f('https://api.openai.com/v1/responses', { method: 'POST', body: JSON.stringify({ model: 'm', stream: true, input: [] }) });
  await manda();
  fascia = null;
  await manda();
  assert.equal(corpi[0].service_tier, 'priority');
  assert.equal('service_tier' in corpi[1], false, 'si legge a ogni richiesta: spenta a metà giro non parte più');
});

test('VELOCE-COLLEGAMENTO: cambiarla a metà conversazione manda l’input intero', () => {
  const U = { role: 'user', content: 'a' };
  const chiamata = { type: 'function_call', call_id: 'c1', name: 'f', arguments: '{}' };
  const esito = { type: 'function_call_output', call_id: 'c1', output: 'ok' };
  const corpo = (input, altro = {}) => ({ model: 'm', input, ...altro });
  const stato = statoDopoRisposta(corpo([U]), 'r1', [chiamata]);
  assert.ok(calcolaContinuazione(stato, corpo([U, chiamata, esito])), 'senza cambi continua');
  assert.equal(calcolaContinuazione(stato, corpo([U, chiamata, esito], { service_tier: 'priority' })), null);
  const veloce = statoDopoRisposta(corpo([U], { service_tier: 'priority' }), 'r1', [chiamata]);
  assert.ok(calcolaContinuazione(veloce, corpo([U, chiamata, esito], { service_tier: 'priority' })), 'accesa e rimasta accesa continua');
});

/* Il motore vero delle richieste, con una rete finta al posto di OpenAI (come `chatgpt-instradamento.test.mjs`). */
function bancoDelFilo(fasciaDiServizioFn) {
  const risposta = { id: 'resp_1', object: 'response', created_at: 1791700000, status: 'completed', model: 'gpt-6-luna', output: [{ id: 'msg_1', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'ok', annotations: [] }] }], usage: { input_tokens: 3, input_tokens_details: { cached_tokens: 0 }, output_tokens: 2, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 5 } };
  const sse = (...eventi) => eventi.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
  const richieste = [];
  const rete = async (url, opzioni = {}) => {
    richieste.push({ url: String(url), corpo: typeof opzioni.body === 'string' ? JSON.parse(opzioni.body) : null });
    return new Response(sse({ type: 'response.created', response: { id: 'resp_1', created_at: 1791700000, model: 'gpt-6-luna' } }, { type: 'response.output_item.done', output_index: 0, item: risposta.output[0] }, { type: 'response.completed', response: risposta }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };
  const custodia = new Map();
  const store = createProviderCredentialStore({ env: {}, keyring: { get: (s, k) => custodia.get(`${s}:${k}`) ?? null, set: (s, k, v) => { custodia.set(`${s}:${k}`, v); return true; }, remove: (s, k) => { custodia.delete(`${s}:${k}`); return true; } } });
  const dipendenze = { leggiChiave: () => null, leggiRuntime: () => ({}), leggiTokenDelPiano: async () => 'TOKEN', registraUsoDelPiano: async () => {}, registraLimitiDelPiano: () => {} };
  const trasporto = creaFetchMultiProvider(rete, { providerStore: store, dipendenze, fasciaDiServizioFn });
  const senzaNegozio = creaFetchMultiProvider(rete, { dipendenze, fasciaDiServizioFn });
  const opzioni = { modello: CON_FASCIA, chiave: 'x', messaggi: [{ role: 'user', content: 'ciao' }], attrezzi: [], maxOutputTokens: 77, dormi: async () => {}, caso: () => 0 };
  return { richieste, gira: (fetchDiRete = trasporto, extra = {}) => chiamaConRitenta({ ...opzioni, fetchDiRete, ...extra }), senzaNegozio };
}

test('VELOCE-FILO: dal motore vero la fascia arriva nel corpo del piano', async () => {
  const b = bancoDelFilo(async () => 'priority');
  await b.gira();
  assert.equal(b.richieste[0].url, 'https://api.openai.com/v1/responses');
  assert.equal(b.richieste[0].corpo.service_tier, 'priority');
  await b.gira(b.senzaNegozio);
  assert.equal(b.richieste[1].corpo.service_tier, 'priority', 'anche senza negozio delle chiavi');
});

test('VELOCE-SERVIZIO: una chiamata di servizio del giro resta al consumo normale', async () => {
  const b = bancoDelFilo(async () => 'priority');
  await b.gira(undefined, { servizio: { scopo: 'riassunto' } });
  assert.equal('service_tier' in b.richieste[0].corpo, false);
});

test('VELOCE-SPENTA: di serie nessun campo sul filo', async () => {
  const b = bancoDelFilo(async () => null);
  await b.gira();
  assert.equal('service_tier' in b.richieste[0].corpo, false);
});

test('VELOCE-SESSIONE: di serie spenta; si accende, si legge dalla fotografia con la versione che avanza, e arriva al giro', async () => {
  const giri = giriFinti();
  const registro = createSessionRegistry({ avviaSessioneFn: giri.avviaSessioneFn });
  const { sessionId } = registro.avvia('task-vero', { modelloScelto: CON_FASCIA });
  assert.equal(registro.impostazioniCorrenti(sessionId).fasciaVeloce, false);
  assert.equal(await giri.giro(0).input.fasciaDiServizioFn(), null);
  const prima = registro.impostazioniCorrenti(sessionId).versione;
  await registro.aggiornaImpostazioni(sessionId, { fasciaVeloce: true });
  assert.equal(registro.impostazioniCorrenti(sessionId).fasciaVeloce, true);
  assert.ok(registro.impostazioniCorrenti(sessionId).versione > prima);
  assert.equal(await giri.giro(0).input.fasciaDiServizioFn(), 'priority');
  await registro.aggiornaImpostazioni(sessionId, { fasciaVeloce: false });
  assert.equal(registro.impostazioniCorrenti(sessionId).fasciaVeloce, false);
  assert.equal(await giri.giro(0).input.fasciaDiServizioFn(), null);
});

test('VELOCE-AVVIO: chiesta all’avvio vale; con un modello senza fascia si spegne da sola', async () => {
  const giri = giriFinti();
  const registro = createSessionRegistry({ avviaSessioneFn: giri.avviaSessioneFn });
  const accesa = registro.avvia('task-vero', { modelloScelto: CON_FASCIA, fasciaVeloceScelta: true });
  await unTick();
  assert.equal(registro.impostazioniCorrenti(accesa.sessionId).fasciaVeloce, true);
  const senza = registro.avvia('task-vero', { modelloScelto: SENZA_FASCIA, fasciaVeloceScelta: true });
  await unTick(); await unTick();
  assert.equal(registro.impostazioniCorrenti(senza.sessionId).fasciaVeloce, false);
  assert.equal(await giri.giro(1).input.fasciaDiServizioFn(), null);
});

test('VELOCE-MODELLO: un modello senza fascia la spegne, tornando indietro non si riaccende, e la versione lo dice', async () => {
  const giri = giriFinti();
  const registro = createSessionRegistry({ avviaSessioneFn: giri.avviaSessioneFn });
  const { sessionId } = registro.avvia('task-vero', { modelloScelto: CON_FASCIA });
  await registro.aggiornaImpostazioni(sessionId, { fasciaVeloce: true });
  const prima = registro.impostazioniCorrenti(sessionId).versione;
  await registro.aggiornaImpostazioni(sessionId, { modello: SENZA_FASCIA });
  assert.equal(registro.impostazioniCorrenti(sessionId).fasciaVeloce, false);
  assert.ok(registro.impostazioniCorrenti(sessionId).versione > prima);
  await registro.aggiornaImpostazioni(sessionId, { modello: CON_FASCIA });
  assert.equal(registro.impostazioniCorrenti(sessionId).fasciaVeloce, false);
  await registro.aggiornaImpostazioni(sessionId, { modello: SENZA_FASCIA });
  await registro.aggiornaImpostazioni(sessionId, { fasciaVeloce: true });
  assert.equal(registro.impostazioniCorrenti(sessionId).fasciaVeloce, false, 'accenderla su un modello senza fascia non fa niente');
});

test('VELOCE-MODELLO-UGUALE: cambiare modello verso uno che ce l’ha la lascia accesa', async () => {
  const giri = giriFinti();
  const registro = createSessionRegistry({ avviaSessioneFn: giri.avviaSessioneFn, fasciaVeloceDelModelloFn: async () => ({ id: 'priority' }) });
  const { sessionId } = registro.avvia('task-vero', { modelloScelto: CON_FASCIA });
  await registro.aggiornaImpostazioni(sessionId, { fasciaVeloce: true });
  await registro.aggiornaImpostazioni(sessionId, { modello: 'chatgpt:gpt-6-sol' });
  assert.equal(registro.impostazioniCorrenti(sessionId).fasciaVeloce, true);
});

test('VELOCE-CATALOGO-GUASTO: un catalogo che non risponde vale «niente fascia», mai un errore del giro', async () => {
  const giri = giriFinti();
  let rotto = false;
  const registro = createSessionRegistry({ avviaSessioneFn: giri.avviaSessioneFn, fasciaVeloceDelModelloFn: async () => { if (rotto) throw new Error('giù'); return { id: 'priority' }; } });
  const { sessionId } = registro.avvia('task-vero', { modelloScelto: CON_FASCIA });
  await registro.aggiornaImpostazioni(sessionId, { fasciaVeloce: true });
  rotto = true;
  assert.equal(await giri.giro(0).input.fasciaDiServizioFn(), null);
});

test('VELOCE-OSPITE: chi non passa il catalogo non ha la fascia', async () => {
  const giri = giriFinti();
  const registro = createSessionRegistry({ avviaSessioneFn: giri.avviaSessioneFn, fasciaVeloceDelModelloFn: null });
  const { sessionId } = registro.avvia('task-vero', { modelloScelto: CON_FASCIA });
  assert.equal('fasciaDiServizioFn' in giri.giro(0).input, false);
  await registro.aggiornaImpostazioni(sessionId, { fasciaVeloce: true });
  assert.equal(registro.impostazioniCorrenti(sessionId).fasciaVeloce, false);
});

test('VELOCE-BIFORCAZIONE: una biforcazione parte spenta', async () => {
  const giri = giriFinti();
  const registro = createSessionRegistry({ avviaSessioneFn: giri.avviaSessioneFn });
  const { sessionId } = registro.avvia('task-vero', { modelloScelto: CON_FASCIA });
  await registro.aggiornaImpostazioni(sessionId, { fasciaVeloce: true });
  giri.concludi(0);
  await unTick();
  const { sessionId: ramo } = registro.forka(sessionId);
  assert.equal(registro.impostazioniCorrenti(ramo).fasciaVeloce, false);
  assert.equal(await giri.giro(1).input.fasciaDiServizioFn(), null);
});

test('VELOCE-RIPRESA: dentro la sessione resta accesa da un giro all’altro', async () => {
  const giri = giriFinti();
  const registro = createSessionRegistry({ avviaSessioneFn: giri.avviaSessioneFn });
  const { sessionId } = registro.avvia('task-vero', { modelloScelto: CON_FASCIA });
  await registro.aggiornaImpostazioni(sessionId, { fasciaVeloce: true });
  giri.concludi(0);
  await unTick();
  registro.resume(sessionId, 'altro lavoro', []);
  assert.equal(registro.impostazioniCorrenti(sessionId).fasciaVeloce, true);
  assert.equal(await giri.giro(1).input.fasciaDiServizioFn(), 'priority');
});

test('VELOCE-RIAVVIO: una sessione riaperta dopo un riavvio parte spenta: non sta né nel timbro né nel giornale', async () => {
  const cartellaStore = cartellaDiProva('talos-veloce-riavvio-');
  const giri = giriFinti();
  const registro = createSessionRegistry({ cartellaStore, avviaSessioneFn: giri.avviaSessioneFn });
  const { sessionId } = registro.avvia('task-vero', { modelloScelto: CON_FASCIA });
  await registro.aggiornaImpostazioni(sessionId, { fasciaVeloce: true });
  giri.concludi(0);
  await unTick();
  for (let i = 0; i < 3; i += 1) { try { await attendiScritture({ cartellaStore }); } catch { /* il resto lo dicono le prove */ } await unTick(); }
  const riavviato = createSessionRegistry({ cartellaStore, avviaSessioneFn: giriFinti().avviaSessioneFn });
  await riavviato.ripristina();
  assert.equal(riavviato.impostazioniCorrenti(sessionId).fasciaVeloce, false);
  const righe = readFileSync(join(cartellaStore, `${sessionId}.jsonl`), 'utf8').split('\n').filter(Boolean).map((riga) => JSON.parse(riga));
  const impostazioni = righe.filter((riga) => riga.tipo === 'impostazioni-sessione');
  assert.ok(impostazioni.length > 0, 'la riga del cambio c\'è');
  assert.equal(impostazioni.some((riga) => 'fasciaVeloce' in riga), false, 'nessuna riga delle impostazioni la porta');
});

test('VELOCE-HTTP: un vero o falso, nient’altro; la rotta delle impostazioni e quella d’avvio la portano al registro', async () => {
  const giri = giriFinti();
  const registro = createSessionRegistry({ avviaSessioneFn: giri.avviaSessioneFn });
  const { sessionId } = registro.avvia('task-vero', { modelloScelto: CON_FASCIA });
  const httpApp = createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, sessionRegistry: registro });
  const chiama = creaChiamataInterna({ httpApp, porta: 4999 });
  const patch = (corpo) => chiama({ metodo: 'POST', percorso: `/api/v1/sessions/${sessionId}/settings`, corpo });
  await assert.rejects(() => patch({ fasciaVeloce: 'si' }), /Invalid query/u);
  assert.equal(registro.impostazioniCorrenti(sessionId).fasciaVeloce, false);
  assert.equal((await patch({ fasciaVeloce: true })).stato, 200);
  assert.equal(registro.impostazioniCorrenti(sessionId).fasciaVeloce, true);
  const nuova = await chiama({ metodo: 'POST', percorso: '/api/v1/sessions', corpo: { taskId: 'task-vero', fasciaVeloce: true } });
  assert.equal(registro.impostazioniCorrenti(nuova.dati.sessionId).fasciaVeloce, true);
  await assert.rejects(() => chiama({ metodo: 'POST', percorso: '/api/v1/sessions', corpo: { taskId: 'task-vero', fasciaVeloce: 1 } }), /Invalid query/u);
});

test('VELOCE-CATALOGO-PIANO: la fascia di un modello del piano si legge dal catalogo del piano', async () => {
  const luna = modelloDelPiano({ slug: 'gpt-6-luna', visibility: 'list', service_tiers: [{ id: 'priority', description: '1.5x' }] });
  const fascia = creaFasciaVeloceDelModello({ catalogo: { elenca: async () => [luna] } });
  assert.equal((await fascia(luna.id))?.id, 'priority');
  assert.equal(await fascia('chatgpt:altro'), null);
  assert.equal(await fascia('openrouter:x'), null);
  assert.equal(await creaFasciaVeloceDelModello()(luna.id), null, 'senza accesso al piano');
  await assert.rejects(creaFasciaVeloceDelModello({ catalogo: { elenca: async () => { throw new Error('rete'); } } })(luna.id), /rete/u, 'un guasto non dice che il modello non ce l\'ha');
});

test('VELOCE-FILO-INTERO: dal registro, col catalogo del piano, attraverso il servizio vero fino al motore', async () => {
  const luna = modelloDelPiano({ slug: 'gpt-6-luna', visibility: 'list', service_tiers: [{ id: 'priority', description: '1.5x' }] });
  const visti = [];
  const registro = createSessionRegistry({
    fasciaVeloceDelModelloFn: creaFasciaVeloceDelModello({ catalogo: { elenca: async () => [luna] } }),
    avviaSessioneFn: (input) => avviaSessione({ ...input, cartella: cartellaDiProva('talos-veloce-filo-'), talosLavoraFn: async (dati) => { visti.push(dati); return { comeFinita: 'concluso', risposta: 'ok', messaggi: [] }; } }).catch(() => null),
  });
  const accesa = registro.avvia('task-vero', { modelloScelto: luna.id, fasciaVeloceScelta: true });
  for (let i = 0; i < 20 && !visti.length; i += 1) await new Promise((r) => setTimeout(r, 25));
  assert.equal(registro.impostazioniCorrenti(accesa.sessionId).fasciaVeloce, true, 'il modello del piano la tiene accesa');
  assert.equal(await visti[0].fasciaDiServizioFn(), 'priority');
});

test('VELOCE-GUASTO-AVVIO: un catalogo in guasto all\'avvio non la spegne, e tornata la rete la fascia parte', async () => {
  const giri = giriFinti();
  let rotto = true;
  const registro = createSessionRegistry({ avviaSessioneFn: giri.avviaSessioneFn, fasciaVeloceDelModelloFn: async () => { if (rotto) throw new Error('giù'); return { id: 'priority' }; } });
  const { sessionId } = registro.avvia('task-vero', { modelloScelto: CON_FASCIA, fasciaVeloceScelta: true });
  await unTick(); await unTick();
  assert.equal(registro.impostazioniCorrenti(sessionId).fasciaVeloce, true);
  assert.equal(await giri.giro(0).input.fasciaDiServizioFn(), null, 'durante il guasto niente sul filo');
  rotto = false;
  assert.equal(await giri.giro(0).input.fasciaDiServizioFn(), 'priority');
});

test('VELOCE-GUASTO-CAMBIO: un guasto mentre cambiano le impostazioni non la spegne; un modello senza fascia sì', async () => {
  const giri = giriFinti();
  let rotto = false;
  const registro = createSessionRegistry({ avviaSessioneFn: giri.avviaSessioneFn, fasciaVeloceDelModelloFn: async (m) => { if (rotto) throw new Error('giù'); return m === CON_FASCIA ? { id: 'priority' } : null; } });
  const { sessionId } = registro.avvia('task-vero', { modelloScelto: CON_FASCIA });
  await registro.aggiornaImpostazioni(sessionId, { fasciaVeloce: true });
  rotto = true;
  await registro.aggiornaImpostazioni(sessionId, { reasoning: 'high' });
  assert.equal(registro.impostazioniCorrenti(sessionId).fasciaVeloce, true);
  rotto = false;
  await registro.aggiornaImpostazioni(sessionId, { modello: SENZA_FASCIA });
  assert.equal(registro.impostazioniCorrenti(sessionId).fasciaVeloce, false);
});

test('VELOCE-AVVIO-VERSIONE: quando il nucleo la spegne all\'avvio la versione avanza, così chi guarda lo sa', async () => {
  const giri = giriFinti();
  const registro = createSessionRegistry({ avviaSessioneFn: giri.avviaSessioneFn });
  const { sessionId } = registro.avvia('task-vero', { modelloScelto: SENZA_FASCIA, fasciaVeloceScelta: true });
  const prima = registro.impostazioniCorrenti(sessionId).versione ?? 0;
  await unTick(); await unTick();
  assert.equal(registro.impostazioniCorrenti(sessionId).fasciaVeloce, false);
  assert.ok(registro.impostazioniCorrenti(sessionId).versione > prima);
});

/* Blocco 21 (01/11/2026, trovato prima del codice dell'interruttore del PC): l'elenco non la portava, e chi riapriva una conversazione la vedeva spenta
   mentre il server mandava `priority`: si consumava il piano senza segno a schermo. I due versi, perché quello che conta è il contrario. */
test('VELOCE-ELENCO: la riga dell\'elenco dice se è chiesta, e sparisce quando la si spegne', async () => {
  const giri = giriFinti();
  const registro = createSessionRegistry({ avviaSessioneFn: giri.avviaSessioneFn });
  const { sessionId } = registro.avvia('task-vero', { modelloScelto: CON_FASCIA });
  const riga = () => registro.elenca().find((voce) => voce.sessionId === sessionId);
  assert.equal(riga().fasciaVeloce, false, 'di serie spenta');
  await registro.aggiornaImpostazioni(sessionId, { fasciaVeloce: true });
  assert.equal(riga().fasciaVeloce, true, 'accesa, chi riapre deve vederla');
  await registro.aggiornaImpostazioni(sessionId, { fasciaVeloce: false });
  assert.equal(riga().fasciaVeloce, false, 'spenta, il campo e il motore dicono la stessa cosa');
  assert.equal(registro.impostazioniCorrenti(sessionId).fasciaVeloce, false);
});

test('VELOCE-CAVO: il server vero legge la fascia dal catalogo del piano, non da quello di OpenRouter', () => {
  const server = readFileSync(join(import.meta.dirname, '..', 'server.mjs'), 'utf8');
  assert.match(server, /fasciaVeloceDelModelloFn: creaFasciaVeloceDelModello\(\{ catalogo: catalogoChatgpt \}\)/u);
});

