/*
 * Owner 29/10/2026 (domanda 2 del selettore dei modelli): Preferiti e Usati di recente stanno SUL SERVER, uguali su PC e dispositivo.
 * Contratto: `Downloads/handoff-talos-2026-09-27/in-corso/CONTRATTO-PREFERITI-MODELLI-2026-10-29.md`. Ogni prova ha il suo verso
 * contrario: ciò che si rifiuta non cambia niente.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { createPreferenzeModelli, MASSIMO_PREFERITI, MASSIMO_RECENTI } from '../src/preferenze-modelli.mjs';
import { OPERAZIONI_HTTP } from '../src/remoto/operazioni.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function archivio(t, avvisi = []) {
  const cartella = cartellaDiProva('talos-preferenze-modelli-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const file = join(cartella, '.preferenze-modelli.json');
  return { file, cartella, store: createPreferenzeModelli({ file, avvisa: (m) => avvisi.push(m) }) };
}

test('PREF-MOD-01: empty at first; a star goes at the end, twice is once, off removes it; it survives a restart', async (t) => {
  const { file, store } = archivio(t);
  assert.deepEqual(await store.leggi(), { preferiti: [], recenti: [] });
  await store.applica({ azione: 'preferito', modello: 'z-ai/glm-5.3-flash', attivo: true });
  await store.applica({ azione: 'preferito', modello: 'local:qwen3-8b', attivo: true });
  assert.deepEqual((await store.applica({ azione: 'preferito', modello: 'z-ai/glm-5.3-flash', attivo: true })).preferiti, ['z-ai/glm-5.3-flash', 'local:qwen3-8b']);
  assert.deepEqual(await createPreferenzeModelli({ file }).leggi(), { preferiti: ['z-ai/glm-5.3-flash', 'local:qwen3-8b'], recenti: [] });
  assert.deepEqual((await store.applica({ azione: 'preferito', modello: 'z-ai/glm-5.3-flash', attivo: false })).preferiti, ['local:qwen3-8b']);
  assert.deepEqual((await store.applica({ azione: 'preferito', modello: 'non-ce/questo', attivo: false })).preferiti, ['local:qwen3-8b'], 'removing a missing one is a no-op');
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).schema, 'talos.model-preferences.v1');
});

test('PREF-MOD-02: recents — newest first, no duplicates, at most five', async (t) => {
  const { store } = archivio(t);
  for (const m of ['a/1', 'a/2', 'a/3', 'a/4', 'a/5', 'a/6']) await store.applica({ azione: 'usato', modello: m });
  assert.deepEqual((await store.leggi()).recenti, ['a/6', 'a/5', 'a/4', 'a/3', 'a/2']);
  assert.equal(MASSIMO_RECENTI, 5);
  assert.deepEqual((await store.applica({ azione: 'usato', modello: 'a/4' })).recenti, ['a/4', 'a/6', 'a/5', 'a/3', 'a/2']);
});

test('PREF-MOD-03: the 51st favourite is refused and nothing changes', async (t) => {
  const { store } = archivio(t);
  assert.equal(MASSIMO_PREFERITI, 50);
  for (let i = 0; i < 50; i += 1) await store.applica({ azione: 'preferito', modello: `m/${i}`, attivo: true });
  await assert.rejects(store.applica({ azione: 'preferito', modello: 'm/50', attivo: true }), { code: 'MODEL_FAVOURITES_FULL' });
  const { preferiti } = await store.leggi();
  assert.equal(preferiti.length, 50);
  assert.equal(preferiti.includes('m/50'), false);
  // AL CONTRARIO: una stella già presente sul pieno non è un 51°
  assert.equal((await store.applica({ azione: 'preferito', modello: 'm/0', attivo: true })).preferiti.length, 50);
});

test('PREF-MOD-04: import is a union, in order, capped, and doing it twice changes nothing', async (t) => {
  const { store } = archivio(t);
  await store.applica({ azione: 'preferito', modello: 's/1', attivo: true });
  await store.applica({ azione: 'usato', modello: 's/r' });
  const una = await store.applica({ azione: 'importa', preferiti: ['l/1', 's/1', 'l/2'], recenti: ['l/r1', 's/r', 'l/r2', 'l/r3', 'l/r4', 'l/r5'] });
  assert.deepEqual(una, { preferiti: ['s/1', 'l/1', 'l/2'], recenti: ['s/r', 'l/r1', 'l/r2', 'l/r3', 'l/r4'] });
  assert.deepEqual(await store.applica({ azione: 'importa', preferiti: ['l/1', 's/1', 'l/2'], recenti: ['l/r1'] }), una, 'idempotent');
});

test('PREF-MOD-05: every malformed body is refused with QUERY_INVALID and changes nothing', async (t) => {
  const { store } = archivio(t);
  await store.applica({ azione: 'preferito', modello: 'ok/1', attivo: true });
  const prima = await store.leggi();
  const sbagliati = [
    null, [], {}, { azione: 'boh' }, { azione: 'preferito', modello: 'x/y' }, { azione: 'preferito', modello: 'x/y', attivo: 'si' },
    { azione: 'preferito', modello: 'x/y', attivo: true, altro: 1 }, { azione: 'usato' }, { azione: 'usato', modello: '' },
    { azione: 'usato', modello: ' x/y' }, { azione: 'usato', modello: 'x\u0000y' }, { azione: 'usato', modello: 'x'.repeat(201) },
    { azione: 'usato', modello: 5 }, { azione: 'importa', preferiti: [] }, { azione: 'importa', preferiti: 'a', recenti: [] },
    { azione: 'importa', preferiti: ['ok', 3], recenti: [] }, { azione: 'importa', preferiti: Array.from({ length: 201 }, (_, i) => `p/${i}`), recenti: [] },
  ];
  for (const corpo of sbagliati) await assert.rejects(store.applica(corpo), { code: 'QUERY_INVALID' }, JSON.stringify(corpo)?.slice(0, 80));
  assert.deepEqual(await store.leggi(), prima);
});

test('PREF-MOD-06: an unreadable or hand-edited file reads as empty, says so once, and the next write repairs it', async (t) => {
  const cartella = cartellaDiProva('talos-preferenze-modelli-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  mkdirSync(cartella, { recursive: true });
  for (const [i, testo] of ['{', '{"preferiti":"a","recenti":[]}', '{"preferiti":[1],"recenti":[]}', '[]'].entries()) {
    const file = join(cartella, `p-${i}.json`);
    writeFileSync(file, testo);
    const avvisi = [];
    const store = createPreferenzeModelli({ file, avvisa: (m) => avvisi.push(m) });
    assert.deepEqual(await store.leggi(), { preferiti: [], recenti: [] }, testo);
    assert.equal(avvisi.length, 1, testo);
    await store.applica({ azione: 'usato', modello: 'a/b' });
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).recenti, ['a/b']);
  }
});

test('PREF-MOD-07: writes in quick succession are queued — none is lost', async (t) => {
  const { file, store } = archivio(t);
  await Promise.all(Array.from({ length: 20 }, (_, i) => store.applica({ azione: 'preferito', modello: `q/${i}`, attivo: true })));
  assert.equal((await store.leggi()).preferiti.length, 20);
  assert.equal((await createPreferenzeModelli({ file }).leggi()).preferiti.length, 20, 'and all twenty are on disk');
});

test('PREF-MOD-08: GET and POST /api/v1/model-preferences — the contract, errors with their codes, nothing else changes', async (t) => {
  const { createHttpApp } = await import('../src/http-app.mjs');
  const http = await import('node:http');
  const { store } = archivio(t);
  const server = http.createServer(createHttpApp({ preferenzeModelli: store }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/model-preferences`;
  const posta = (corpo) => fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  assert.deepEqual((await (await fetch(base)).json()).data, { preferiti: [], recenti: [] });
  const r = await posta({ azione: 'preferito', modello: 'z-ai/glm-5.3-flash', attivo: true });
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).data, { preferiti: ['z-ai/glm-5.3-flash'], recenti: [] });
  assert.equal((await posta({ azione: 'usato', modello: 'x/y', altro: 1 })).status, 400);
  assert.equal((await (await posta({ azione: 'usato', modello: '' })).json()).error?.code, 'QUERY_INVALID');
  assert.equal((await fetch(`${base}?x=1`)).status, 400, 'no query string');
  for (let i = 0; i < 49; i += 1) await posta({ azione: 'preferito', modello: `m/${i}`, attivo: true });
  const pieno = await posta({ azione: 'preferito', modello: 'm/oltre', attivo: true });
  assert.equal(pieno.status, 409);
  assert.equal((await pieno.json()).error?.code, 'MODEL_FAVOURITES_FULL');
  assert.equal((await store.leggi()).preferiti.length, 50, 'refused bodies changed nothing');
  // da un altro sito una scrittura non passa (la guardia unica di ogni scrittura)
  const estranea = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example', 'Sec-Fetch-Site': 'cross-site' },
    body: JSON.stringify({ azione: 'usato', modello: 'evil/x' }) });
  assert.equal(estranea.status, 403);
  assert.deepEqual((await store.leggi()).recenti, []);
  const senza = http.createServer(createHttpApp({}));
  await new Promise((r) => senza.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => senza.close(r)));
  const giu = await fetch(`http://127.0.0.1:${senza.address().port}/api/v1/model-preferences`);
  assert.equal(giu.status, 503);
  assert.equal((await giu.json()).error?.code, 'MODEL_PREFERENCES_UNAVAILABLE');
});

test('PREF-MOD-09: the connected device reaches the same lists through two closed remote operations', () => {
  assert.deepEqual({ metodo: OPERAZIONI_HTTP['models.preferences'].metodo, percorso: OPERAZIONI_HTTP['models.preferences'].percorso({}) },
    { metodo: 'GET', percorso: '/api/v1/model-preferences' });
  const scrivi = OPERAZIONI_HTTP['models.preferences.update'];
  assert.equal(scrivi.metodo, 'POST');
  assert.equal(scrivi.percorso({}), '/api/v1/model-preferences');
  assert.deepEqual(scrivi.corpo({ corpo: { azione: 'usato', modello: 'a/b' } }), { azione: 'usato', modello: 'a/b' }); // il corpo lo controlla la rotta, come le altre
});
