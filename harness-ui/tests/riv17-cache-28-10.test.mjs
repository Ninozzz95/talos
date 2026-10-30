/*
 * Revisione avversaria del blocco 17 (28/10/2026), la cache dei prompt: R17-3 e R17-4 (rapporto `REVISIONE-BLOCCO-17-2026-10-28.md`), dalle
 * prove del revisore (`zz-durata`, `zz-registro-sicuro`) portate qui.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { talosLavora, motivoDellaCacheRicominciata, improntaDellaRichiesta, puntiSuiMessaggiOnorati, VIE_DIRETTE_CON_PUNTI_SUI_MESSAGGI } from '../src/kernel/talosHarness.mjs';
import { talosLavora as talosLavoraDesktop } from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import { VARIABILE_TETTO_TOKEN } from '../src/kernel/compattazione-desktop.mjs';
import { REGISTRO_FORNITORI } from '../src/provider-registry.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

/* R17-3 — su una via diretta il server toglie `cache_control` se il registro non lo dichiara: lì nessun punto e nessuna ora */
test('RIV17-CACHE-01 — la via decide: le dirette dal registro, OpenRouter (o nessuna via) dal nome del modello', () => {
  for (const m of ['anthropic:claude-haiku-5-5', 'qwen:qwen3.8-flash', 'minimax-anthropic:minimax-m3', 'openrouter:anthropic/claude-haiku-5', 'anthropic/claude-haiku-5', 'moonshotai/kimi-k3']) {
    assert.equal(puntiSuiMessaggiOnorati(m), true, m);
  }
  for (const m of ['zai-anthropic:glm-5.3', 'kimi:kimi-k3', 'vertex:claude-sonnet-5', 'local:qwen3-8b-q4_k_m', 'chatgpt:gpt-5.5', 'z-ai/glm-5.3-flash']) {
    assert.equal(puntiSuiMessaggiOnorati(m), false, m);
  }
});

test('RIV17-CACHE-02 — l\'elenco delle vie dirette con i punti sui messaggi è QUELLO del registro (cache.marcatore = cache_control)', () => {
  const dalRegistro = Object.entries(REGISTRO_FORNITORI).filter(([id, r]) => id !== 'openrouter' && r?.cache?.marcatore === 'cache_control').map(([id]) => id).sort();
  assert.deepEqual([...VIE_DIRETTE_CON_PUNTI_SUI_MESSAGGI].sort(), dalRegistro);
});

for (const modello of ['zai-anthropic:glm-5.3', 'kimi:kimi-k3', 'vertex:claude-sonnet-5']) {
  test(`RIV17-CACHE-03 — ${modello}: nessun punto onorato ⇒ cinque minuti, e 10 minuti di pausa si leggono «pausa»`, async () => {
    const cartella = mkdtempSync(join(tmpdir(), 'riv17-durata-'));
    let esito;
    try {
      esito = await talosLavora({ cartella, task: { consegna: 'ciao' }, modello, chiave: 'k', _giriMassimiInterno: 2,
        messaggiIniziali: [{ role: 'system', content: 'Istruzioni. '.repeat(1_500) }, { role: 'user', content: 'ciao' }],
        fetchDiRete: async () => Response.json({ choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 9_000, completion_tokens: 1, prompt_tokens_details: { cached_tokens: 8_000 } } }) });
    } finally { rimuoviCartellaDiProva(cartella); }
    const p = esito.statoCache;
    assert.equal(p.durataMs, 300_000);
    const ora = { ...improntaDellaRichiesta({ modello: p.modello }), attrezzi: p.attrezzi, nomiAttrezzi: p.nomiAttrezzi, sistema: p.sistema, messaggi: p.messaggi };
    assert.equal(motivoDellaCacheRicominciata(p, ora, { tokenDaCache: 0, ora: p.at + 10 * 60_000 }), 'pausa');
  });
}

/* R17-4 — il riassunto sicuro per la cache sulla strada del REGISTRO: la nota di sistema a metà storia resta al suo posto (il prefisso come
   inviato) e il ragionamento è quello della conversazione. Prima solo la strada del giro aveva una prova che mordesse. */
const CL = 'anthropic/claude-sonnet-4.6';
const NOTA = { role: 'system', content: 'Project context update: the folder map changed. ' + 'm'.repeat(1_000) };
test('RIV17-CACHE-04 — registro: nota di sistema a metà storia al suo posto, ragionamento della conversazione', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'riv17-reg-')); writeFileSync(join(dir, 'a.txt'), 'x');
  let n = 0;
  const esito = await talosLavoraDesktop({ cartella: dir, task: { consegna: 'leggi' }, modello: CL, chiave: 'k', reasoning: { effort: 'high' },
    fetchDiRete: async () => { n += 1; return Response.json({ choices: [{ message: n < 3 ? { role: 'assistant', content: '', tool_calls: [{ id: 'c' + n, type: 'function', function: { name: 'leggi', arguments: '{"percorso":"a.txt"}' } }] } : { role: 'assistant', content: 'ok' }, finish_reason: n < 3 ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 1 } }); } });
  rimuoviCartellaDiProva(dir);
  assert.deepEqual(esito.statoCache?.reasoningInviato, { effort: 'high' }, 'premessa: il nucleo ha mandato high');
  const prima = process.env[VARIABILE_TETTO_TOKEN]; process.env[VARIABILE_TETTO_TOKEN] = '2000';
  const cartellaStore = mkdtempSync(join(tmpdir(), 'riv17-reg-store-'));
  const chiamate = []; const giri = [];
  const registro = createSessionRegistry({ guardaWorkspaceFn: () => () => {}, cartellaStore, modello: CL, chiave: 'k', riassuntoSicuroPerCache: true,
    riassumiPerCompattazioneFn: async (input) => { chiamate.push(input); return { scelta: { role: 'assistant', content: '## R ok' }, finishReason: 'stop', usage: null }; },
    preparaEsecuzioneFn: (taskId) => { if (taskId !== 'task-vero') throw new TaskCatalogError(taskId); return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } }; },
    avviaSessioneFn: async (input) => { let r; const p = new Promise((x) => { r = x; }); giri.push({ input, concludi(storia, extra) { input.onEvento({ type: 'RunFinished' }); r({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: storia, recordDiCompattazione: [], scartoMisurato: 0, ...extra } }); } }); input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r1' }); return p; } });
  t.after(async () => { if (prima === undefined) delete process.env[VARIABILE_TETTO_TOKEN]; else process.env[VARIABILE_TETTO_TOKEN] = prima; await attendiScritture({ cartellaStore }); rimuoviCartellaDiProva(cartellaStore); });
  registro.avvia('task-vero', { modelloScelto: CL, reasoningScelto: { effort: 'high' } });
  const storia = [{ role: 'system', content: 'You are a coding agent' }, { role: 'user', content: 'Consegna: analizza tutto' }];
  for (let i = 0; i < 3; i += 1) storia.push({ role: 'assistant', content: '', tool_calls: [{ id: 'a' + i, type: 'function', function: { name: 'leggi', arguments: '{}' } }] }, { role: 'tool', tool_call_id: 'a' + i, content: 'x'.repeat(3_000) });
  storia.push(NOTA);
  for (let i = 3; i < 6; i += 1) storia.push({ role: 'assistant', content: '', tool_calls: [{ id: 'a' + i, type: 'function', function: { name: 'leggi', arguments: '{}' } }] }, { role: 'tool', tool_call_id: 'a' + i, content: 'x'.repeat(3_000) });
  storia.push({ role: 'user', content: 'Seconda richiesta' }, { role: 'assistant', content: 'Fatto.' });
  giri[0].concludi(storia, { statoCache: esito.statoCache });
  for (let i = 0; i < 400 && chiamate.length === 0; i += 1) await new Promise((r) => setTimeout(r, 10));
  const c = chiamate[0];
  assert.ok(c?.attrezzi?.length > 0, 'premessa: forma sicura');
  assert.deepEqual(c.reasoning, { effort: 'high' }, 'il ragionamento mandato dalla conversazione');
  assert.deepEqual(c.messaggi[storia.indexOf(NOTA)], NOTA, 'la nota a metà storia al suo posto, come inviata');
});
