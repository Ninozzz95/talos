/*
 * ⭐ L1 1.3 — la seconda porta della finestra che cresce: `local_model_window` (owner 26/10/2026, «il modello chiede di allargare con
 *   la solita carta»). «status» libero; «enlarge» con la carta e la STESSA cifra che poi si apre; i rifiuti subito, senza disturbare
 *   la persona; mai in un giro senza nessuno davanti.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { creaOspiteFornitori } from '../src/fornitori-per-il-modello.mjs';

function ospite({ stato = { modelId: 'm1', nome: 'LFM2.5 24B', finestra: 16_384, massimo: 131_072, scelta: 'allarga' }, esito = { ok: true, prima: 16_384, dopo: 24_576 } } = {}) {
  const chiamate = [];
  const finestraLocale = { statoAttuale: async () => stato, allarga: async (r) => { chiamate.push(r); return esito; } };
  const fabbrica = creaOspiteFornitori({ providerStore: { getRuntime: () => ({}) }, finestraLocale });
  return { fn: fabbrica({}), fnSenzaNessuno: fabbrica({ soloLettura: true }), chiamate };
}

test('FC-ATTR-01 status: libero, dice finestra, massimo e cosa succede quando si riempie', async () => {
  const { fn } = ospite();
  assert.deepEqual(await fn('local_model_window', { action: 'status' }, { fase: 'anteprima' }), { ok: true, carta: false });
  const r = await fn('local_model_window', { action: 'status' }, { fase: 'esegui' });
  assert.equal(r.ok, true);
  assert.match(r.testo, /LFM2\.5 24B runs with a 16384 token window; it was trained for up to 131072 tokens\. When the window fills up, it is enlarged by itself/u);
});

test('FC-ATTR-02 enlarge: carta con prima → dopo (la cifra che si apre davvero), poi l\'allargamento chiesto con `forza`', async () => {
  const { fn, chiamate } = ospite();
  const anteprima = await fn('local_model_window', { action: 'enlarge', tokens: 40_000 }, { fase: 'anteprima' });
  assert.deepEqual(anteprima, { ok: true, carta: true, azione: { modello: 'LFM2.5 24B', prima: 16_384, dopo: 61_440 } }, '40.000 × 1,5 = 60.000 → 61.440');
  const fatto = await fn('local_model_window', { action: 'enlarge', tokens: 40_000 }, { fase: 'esegui' });
  assert.equal(fatto.ok, true);
  assert.deepEqual(chiamate, [{ modelId: 'm1', servono: 40_000, forza: true }]);
});

test('FC-ATTR-03 AL CONTRARIO: oltre il massimo, nessun modello acceso, già abbastanza grande, nessuno davanti, azione sbagliata', async () => {
  const { fn, fnSenzaNessuno, chiamate } = ospite();
  assert.match((await fn('local_model_window', { action: 'enlarge', tokens: 200_000 }, { fase: 'anteprima' })).messaggio, /cannot read more than 131072 tokens/u);
  assert.deepEqual(await fn('local_model_window', { action: 'enlarge', tokens: 10_000 }, { fase: 'anteprima' }), { ok: true, carta: false }, 'ci sta già: nessuna carta');
  assert.match((await fnSenzaNessuno('local_model_window', { action: 'enlarge', tokens: 40_000 }, { fase: 'anteprima' })).messaggio, /nobody could approve it/u);
  assert.equal((await fnSenzaNessuno('local_model_window', { action: 'status' }, { fase: 'esegui' })).ok, true, 'leggere si può sempre');
  assert.match((await fn('local_model_window', { action: 'grow' }, { fase: 'anteprima' })).messaggio, /needs action "status" or "enlarge"/u);
  const spento = ospite({ stato: null });
  assert.match((await spento.fn('local_model_window', { action: 'enlarge', tokens: 40_000 }, { fase: 'anteprima' })).messaggio, /no local model is running/u);
  assert.match((await spento.fn('local_model_window', { action: 'status' }, { fase: 'esegui' })).testo, /No local model is running/u);
  assert.deepEqual(chiamate, [], 'niente si è riaperto');
});

test('FC-ATTR-04 la memoria non basta: il modello lo legge, la finestra resta quella di prima', async () => {
  const { fn } = ospite({ esito: { ok: false, motivo: 'memoria' } });
  const r = await fn('local_model_window', { action: 'enlarge', tokens: 40_000 }, { fase: 'esegui' });
  assert.equal(r.ok, false);
  assert.match(r.messaggio, /not enough memory for it, so the previous window was kept/u);
});

/* Revisione blocco 4 */
test('FC-ATTR-05 (A-2) nemmeno il ritorno a com\'era è riuscito: il modello lo legge, e sa che il motore riparte al prossimo messaggio', async () => {
  const { fn } = ospite({ esito: { ok: false, motivo: 'memoria', spento: true } });
  const r = await fn('local_model_window', { action: 'enlarge', tokens: 40_000 }, { fase: 'esegui' });
  assert.match(r.messaggio, /could not be reopened as it was: it starts again with the next message/u);
  const ignoto = ospite({ esito: { ok: false, motivo: 'massimo-ignoto' } });
  assert.match((await ignoto.fn('local_model_window', { action: 'enlarge', tokens: 40_000 }, { fase: 'esegui' })).messaggio, /not reopened blind/u);
});

test('FC-ATTR-06 (A-1) la seconda porta arriva DAVVERO al modello: è nella lista di serie del registro, e mai ai passi dei Workflow', async (t) => {
  const { STRUMENTI_ESTESI_PREDEFINITI } = await import('../src/session-registry.mjs');
  const { talosLavora } = await import('../src/kernel/talosHarness.desktop-hotfix.mjs');
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { rimuoviCartellaDiProva } = await import('./aiuto/rimuovi-cartella-di-prova.mjs');
  assert.ok(STRUMENTI_ESTESI_PREDEFINITI.includes('local_model_window'));
  const cartella = mkdtempSync(join(tmpdir(), 'fc-attr-06-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const nomi = [];
  const fetchDiRete = async (_u, o) => {
    for (const a of JSON.parse(o.body).tools ?? []) nomi.push(a.function?.name ?? a.name);
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 1 } });
  };
  await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali: [{ role: 'user', content: 'ciao' }],
    contestoDelProgetto: 'Project files:\n', fetchDiRete, permessi: 'Full access', strumentiEstesi: [...STRUMENTI_ESTESI_PREDEFINITI],
    onFornitoriFn: async () => ({ ok: true, testo: 'x' }), attrezziDifferiti: false });
  assert.ok(nomi.includes('provider_exclude'), `controllo: lo stesso canale (${nomi.length} attrezzi)`);
  assert.ok(nomi.includes('local_model_window'), 'la seconda porta è offerta al modello');
  /* AL CONTRARIO: senza il canale dei fornitori (un ospite che non lo dà) non si offre */
  nomi.length = 0;
  await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali: [{ role: 'user', content: 'ciao' }],
    contestoDelProgetto: 'Project files:\n', fetchDiRete, permessi: 'Full access', strumentiEstesi: [...STRUMENTI_ESTESI_PREDEFINITI], attrezziDifferiti: false });
  assert.ok(!nomi.includes('local_model_window'));
});
