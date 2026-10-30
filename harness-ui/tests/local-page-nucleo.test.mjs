/*
 * Owner 27/10/2026 (server locali nella scheda Browser, terza scelta) — `local_page` nel NUCLEO vero (`talosLavora`), con una rete finta
 * che registra i corpi spediti. Forma concordata con la CLI il 29/10/2026: si offre solo con l'aggancio dell'ospite; qui si controlla la
 * FORMA (porta, percorso senza host, che cosa guardare), il confine delle porte lo tiene l'ospite; testo e console tornano nella busta
 * dei dati; la foto solo ai modelli che vedono.
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

import { percorsoDiPaginaLocale, talosLavora } from '../src/kernel/talosHarness.mjs';

const TASK = { consegna: 'apri la pagina del server di sviluppo e dimmi cosa vedi' };
const CONCLUSO = { role: 'assistant', content: 'vista', tool_calls: [] };
const chiama = (argomenti, id = 'call_1') => ({ role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: 'local_page', arguments: JSON.stringify(argomenti) } }] });

function cartella(t) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-lp-'));
  t.after(() => rimuoviCartellaDiProva(radice));
  return radice;
}
function rete(...risposte) {
  const chiamate = [];
  return {
    chiamate,
    fetch: async (_url, opzioni) => {
      const i = chiamate.length;
      chiamate.push({ corpo: JSON.parse(opzioni.body) });
      const corpo = { choices: [{ message: risposte[Math.min(i, risposte.length - 1)] }], usage: { prompt_tokens: 10, completion_tokens: 5 } };
      return { ok: true, status: 200, json: async () => corpo, text: async () => JSON.stringify(corpo) };
    },
  };
}
const nomiAttrezzi = (corpo) => (corpo.tools ?? []).map((a) => a.function?.name ?? a.name);
const esitoDelTool = (r) => r.chiamate[1].corpo.messages.find((m) => m.role === 'tool')?.content ?? '';
const ospite = (visti, risposta) => async (richiesta) => { visti.push(richiesta); return risposta; };

test('LP-PERCORSO-01 — solo un percorso sul server che comincia con «/», anche dopo una decodifica', () => {
  for (const [dentro, fuori] of [[undefined, '/'], ['', '/'], ['/', '/'], ['/app?x=1', '/app?x=1'], ['/a/b#c', '/a/b#c'], ['/caf%C3%A8', '/caf%C3%A8']]) {
    assert.equal(percorsoDiPaginaLocale(dentro), fuori, JSON.stringify(dentro));
  }
  /* AL CONTRARIO (note a della CLI, 29/10): ognuna di queste porterebbe il browser su un altro host o su un percorso ambiguo */
  for (const rifiutato of ['//evil.com', '/%2F%2Fevil.com', '%2F%2Fevil.com', '\\evil', '/a\\b', '/ok/%5Cx', '/a@b', '/%40evil', 'http://x', 'javascript:alert(1)', 'app', '/a\u0000b', '/a%0ab', '/%E0%A4%A', 42, 'x'.repeat(3000)]) {
    assert.equal(percorsoDiPaginaLocale(rifiutato), null, JSON.stringify(rifiutato).slice(0, 40));
  }
});

test('LP-NUCLEO-01 — si offre SOLO quando l\'ospite lo nomina fra gli attrezzi estesi E passa l\'aggancio (come view_image)', async (t) => {
  const casi = [
    [{ strumentiEstesi: ['local_page'], apriPaginaLocaleFn: ospite([], { ok: true }) }, true],
    [{ strumentiEstesi: ['local_page'] }, false], // nominato ma senza chi sappia aprirla: non si offre
    [{ apriPaginaLocaleFn: ospite([], { ok: true }) }, false], // l'aggancio senza il nome
    [{}, false],
  ];
  for (const [opzioni, atteso] of casi) {
    const r = rete(CONCLUSO);
    await talosLavora({ cartella: cartella(t), task: TASK, modello: 'm', chiave: 'k', fetchDiRete: r.fetch, ...opzioni });
    assert.equal(nomiAttrezzi(r.chiamate[0].corpo).includes('local_page'), atteso, JSON.stringify(Object.keys(opzioni)));
  }
});

test('LP-NUCLEO-02 — il testo della pagina arriva con la testa di TALOS e DENTRO la busta dei dati; l\'ospite riceve porta, percorso e «text»', async (t) => {
  const visti = [];
  const r = rete(chiama({ port: 5173, path: '/about' }), CONCLUSO);
  await talosLavora({ cartella: cartella(t), task: TASK, modello: 'm', chiave: 'k', fetchDiRete: r.fetch,
    apriPaginaLocaleFn: ospite(visti, { ok: true, url: 'http://127.0.0.1:5173/about', testo: 'Benvenuto nella pagina About' }) });
  assert.equal(visti.length, 1);
  assert.deepEqual({ porta: visti[0].porta, percorso: visti[0].percorso, guarda: visti[0].guarda }, { porta: 5173, percorso: '/about', guarda: 'text' });
  const esito = esitoDelTool(r);
  assert.match(esito, /^LOCAL PAGE :5173\/about · http:\/\/127\.0\.0\.1:5173\/about\n/u);
  const dopoLaTesta = esito.slice(esito.indexOf('\n') + 1);
  assert.ok(dopoLaTesta.includes('Benvenuto nella pagina About'));
  assert.notEqual(dopoLaTesta.trim(), 'Benvenuto nella pagina About', 'il testo della pagina deve stare nella busta dei dati, non nudo');
});

test('LP-NUCLEO-03 — AL CONTRARIO: una forma sbagliata non arriva mai all\'ospite', async (t) => {
  for (const argomenti of [{ port: 0 }, { port: 70000 }, { port: '5173x' }, { port: 5173, path: '//evil.com' }, { port: 5173, look: 'dom' }]) {
    const visti = [];
    const r = rete(chiama(argomenti), CONCLUSO);
    await talosLavora({ cartella: cartella(t), task: TASK, modello: 'm', chiave: 'k', fetchDiRete: r.fetch, apriPaginaLocaleFn: ospite(visti, { ok: true, testo: 'no' }) });
    assert.equal(visti.length, 0, JSON.stringify(argomenti));
    assert.match(esitoDelTool(r), /^INVALID\./u, JSON.stringify(argomenti));
  }
});

test('LP-NUCLEO-04 — il rifiuto dell\'ospite (porta non della conversazione) arriva al modello col suo motivo', async (t) => {
  const r = rete(chiama({ port: 4174 }), CONCLUSO);
  await talosLavora({ cartella: cartella(t), task: TASK, modello: 'm', chiave: 'k', fetchDiRete: r.fetch,
    apriPaginaLocaleFn: async () => ({ ok: false, motivo: 'Port 4174 is not a development server of this conversation. Ready ones: 5173.' }) });
  assert.match(esitoDelTool(r), /^REFUSED\. Port 4174 is not a development server of this conversation\. Ready ones: 5173\./u);
});

test('LP-NUCLEO-05 — la foto solo a un modello che vede immagini; senza, un rifiuto che suggerisce il testo e l\'ospite non è chiamato', async (t) => {
  const visti = [];
  const r = rete(chiama({ port: 5173, look: 'screenshot' }), CONCLUSO);
  await talosLavora({ cartella: cartella(t), task: TASK, modello: 'm', chiave: 'k', fetchDiRete: r.fetch, apriPaginaLocaleFn: ospite(visti, { ok: true }), vedeImmaginiFn: async () => false });
  assert.equal(visti.length, 0);
  assert.match(esitoDelTool(r), /cannot see images\. Use look: "text"/u);
});
