/*
 * Owner 27/10/2026 — «guarda immagine» (`view_image`) nel NUCLEO vero (`talosLavora`), con una rete finta che registra i corpi spediti.
 * Si prova: quando si offre, il cancello di `leggi`, il campo interno nella storia e la sua traduzione all'invio, il tetto delle
 * ripetizioni. Contratto in handoff `CONTRATTO-GUARDA-IMMAGINE-2026-10-27.md`.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { CAMPO_IMMAGINI } from '../src/kernel/immagine-da-guardare.mjs';

const RIF = 'c'.repeat(64);
const TASK = { consegna: 'guarda la foto e dimmi cosa vedi' };
const CONCLUSO = { role: 'assistant', content: 'vista', tool_calls: [] };
const chiama = (percorso, id = 'call_1') => ({ role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: 'view_image', arguments: JSON.stringify({ path: percorso }) } }] });

function cartella(t) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-vi-'));
  t.after(() => rimuoviCartellaDiProva(radice));
  writeFileSync(join(radice, 'foto.png'), 'finto: i byte li legge l\'ospite');
  return radice;
}
function rete(...risposte) {
  const chiamate = [];
  return {
    chiamate,
    fetch: async (_url, opzioni) => {
      const i = chiamate.length;
      chiamate.push({ corpo: JSON.parse(opzioni.body) });
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: risposte[Math.min(i, risposte.length - 1)] }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), text: async () => '' };
    },
  };
}
const nomiAttrezzi = (corpo) => (corpo.tools ?? []).map((a) => a.function?.name ?? a.name);
const ospiteCheRiesce = (visti = []) => async (richiesta) => {
  visti.push(richiesta);
  return { ok: true, esito: 'Image "foto.png" (640×480) is attached below.', immagine: { riferimento: RIF, mime: 'image/png', larghezza: 640, altezza: 480 } };
};

test('VI-NUCLEO-01 si offre SOLO con l\'ospite, il nome in strumentiEstesi e un modello che vede (true); null/false/assente ⇒ no', async (t) => {
  const casi = [
    [{ onGuardaImmagine: ospiteCheRiesce(), vedeImmaginiFn: async () => true }, true],
    [{ onGuardaImmagine: ospiteCheRiesce(), vedeImmaginiFn: async () => null }, false],
    [{ onGuardaImmagine: ospiteCheRiesce(), vedeImmaginiFn: async () => false }, false],
    [{ onGuardaImmagine: ospiteCheRiesce(), vedeImmaginiFn: async () => { throw new Error('catalogo giù'); } }, false],
    [{ vedeImmaginiFn: async () => true }, false],
    [{ onGuardaImmagine: ospiteCheRiesce() }, false],
  ];
  for (const [ospite, atteso] of casi) {
    const r = rete(CONCLUSO);
    await talosLavora({ cartella: cartella(t), task: TASK, modello: 'm', chiave: 'k', fetchDiRete: r.fetch, strumentiEstesi: ['view_image'], ...ospite });
    assert.equal(nomiAttrezzi(r.chiamate[0].corpo).includes('view_image'), atteso, JSON.stringify(Object.keys(ospite)));
  }
  const senzaNome = rete(CONCLUSO);
  await talosLavora({ cartella: cartella(t), task: TASK, modello: 'm', chiave: 'k', fetchDiRete: senzaNome.fetch, strumentiEstesi: [], onGuardaImmagine: ospiteCheRiesce(), vedeImmaginiFn: async () => true });
  assert.equal(nomiAttrezzi(senzaNome.chiamate[0].corpo).includes('view_image'), false);
});

test('VI-NUCLEO-02 il giro intero: l\'ospite riceve il percorso ASSOLUTO; nel corpo spedito niente campo interno e, dopo l\'esito, l\'immagine', async (t) => {
  const radice = cartella(t);
  const visti = [];
  const r = rete(chiama('foto.png'), CONCLUSO);
  const esito = await talosLavora({ cartella: radice, task: TASK, modello: 'm', chiave: 'k', fetchDiRete: r.fetch, strumentiEstesi: ['view_image'], onGuardaImmagine: ospiteCheRiesce(visti), vedeImmaginiFn: async () => true });
  assert.equal(esito.comeFinita, 'concluso');
  assert.equal(visti.length, 1);
  assert.equal(visti[0].percorso, join(radice, 'foto.png'));
  assert.equal(visti[0].percorsoMostrato, 'foto.png');
  const spediti = r.chiamate[1].corpo.messages;
  assert.ok(spediti.every((m) => !Object.hasOwn(m, CAMPO_IMMAGINI)), 'il campo interno non parte mai');
  const iTool = spediti.findIndex((m) => m.role === 'tool');
  assert.equal(spediti[iTool].content.includes('attached below'), true);
  const dopo = spediti[iTool + 1];
  assert.equal(dopo.role, 'user');
  assert.ok(Array.isArray(dopo.content) && dopo.content.some((p) => p.type === 'image_url' && p.image_url.url === `/api/v1/chat-images/${RIF}`), JSON.stringify(dopo));
});

test('VI-NUCLEO-03 AL CONTRARIO: fuori dal progetto senza nessuno che confermi ⇒ rifiutato e l\'ospite non è mai chiamato', async (t) => {
  const altrove = cartella(t);
  const visti = [];
  const r = rete(chiama(join(altrove, 'foto.png')), CONCLUSO);
  await talosLavora({ cartella: cartella(t), task: TASK, modello: 'm', chiave: 'k', fetchDiRete: r.fetch, strumentiEstesi: ['view_image'], onGuardaImmagine: ospiteCheRiesce(visti), vedeImmaginiFn: async () => true });
  assert.equal(visti.length, 0);
  const tool = r.chiamate[1].corpo.messages.find((m) => m.role === 'tool');
  assert.match(tool.content, /REFUSED/u);
  assert.ok(!r.chiamate[1].corpo.messages.some((m) => m.role === 'user' && Array.isArray(m.content)), 'nessuna immagine spedita');
});

test('VI-NUCLEO-04 lo stesso file al massimo 3 volte per giro: la quarta dice «già guardata» e l\'ospite non è chiamato', async (t) => {
  const visti = [];
  const r = rete(chiama('foto.png', 'c1'), chiama('foto.png', 'c2'), chiama('foto.png', 'c3'), chiama('foto.png', 'c4'), CONCLUSO);
  await talosLavora({ cartella: cartella(t), task: TASK, modello: 'm', chiave: 'k', fetchDiRete: r.fetch, strumentiEstesi: ['view_image'], onGuardaImmagine: ospiteCheRiesce(visti), vedeImmaginiFn: async () => true });
  assert.equal(visti.length, 3);
  const ultimoTool = r.chiamate[4].corpo.messages.filter((m) => m.role === 'tool').at(-1);
  assert.match(ultimoTool.content, /already viewed 3 times/u);
});

test('VI-NUCLEO-05 un ospite che rifiuta (non è un\'immagine): la sua frase arriva al modello, niente immagine spedita', async (t) => {
  const r = rete(chiama('foto.png'), CONCLUSO);
  await talosLavora({ cartella: cartella(t), task: TASK, modello: 'm', chiave: 'k', fetchDiRete: r.fetch, strumentiEstesi: ['view_image'],
    onGuardaImmagine: async () => ({ ok: false, esito: '"foto.png" is not a PNG, JPEG, WebP or GIF image. Use "leggi" for text files.' }), vedeImmaginiFn: async () => true });
  const spediti = r.chiamate[1].corpo.messages;
  assert.match(spediti.find((m) => m.role === 'tool').content, /is not a PNG/u);
  assert.ok(!spediti.some((m) => m.role === 'user' && Array.isArray(m.content)));
});

/* Revisione mia (27/10/2026 notte): le strade che costruiscono un corpo dalla storia FUORI dal nucleo — la compattazione nativa e i
   conteggi (`buildPreparedProviderRequest`) e il riassuntore locale (`chiamaConRitentaLocale`). Il campo interno non parte da nessuna. */
test('VI-STRADE-01 buildPreparedProviderRequest (compattazione nativa, conteggi): il campo interno non arriva nel corpo', async () => {
  const { buildPreparedProviderRequest } = await import('../src/context-provider-adapter.mjs');
  const storia = [
    { role: 'user', content: 'guarda' },
    { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'view_image', arguments: '{"path":"a.png"}' } }] },
    { role: 'tool', tool_call_id: 'c1', content: 'Image attached below.', [CAMPO_IMMAGINI]: [{ riferimento: RIF, percorso: 'a.png' }] },
  ];
  const compilato = await buildPreparedProviderRequest({ messages: storia, model: { provider: 'openrouter', model: 'p/m', windowTokens: 16384, responseReserve: 1024 } });
  assert.ok(!JSON.stringify(compilato.body).includes(CAMPO_IMMAGINI), JSON.stringify(compilato.body).slice(0, 300));
  assert.ok(Object.hasOwn(storia[2], CAMPO_IMMAGINI), 'la storia non si tocca');
});

test('VI-STRADE-02 il riassuntore locale (chiamaConRitentaLocale): il campo interno non arriva nel corpo', async () => {
  const { chiamaConRitentaLocale } = await import('../src/runtime-owner-adapter.mjs');
  let corpo = null;
  await chiamaConRitentaLocale({
    modello: 'm', chiave: 'k', attrezzi: [], tentativiMassimi: 1,
    messaggi: [{ role: 'tool', tool_call_id: 'c1', content: 'x', [CAMPO_IMMAGINI]: [{ riferimento: RIF }] }],
    fetchDiRete: async (_url, opzioni) => { corpo = opzioni.body; return { ok: true, status: 200, json: async () => ({ choices: [{ message: { role: 'assistant', content: 'ok' } }] }), text: async () => '' }; },
  }).catch(() => {});
  assert.ok(typeof corpo === 'string' && corpo.length > 0, 'premessa: il corpo è partito');
  assert.ok(!corpo.includes(CAMPO_IMMAGINI), corpo.slice(0, 200));
});
