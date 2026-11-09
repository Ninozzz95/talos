/*
 * D3 (collaudo del treno, 02/11/2026; forma con OK di Performance, CLI e Mobile): `talos_help` resta dietro il ponte, una riga nel sistema manda lì le
 * domande su TALOS. Solo dove l'attrezzo c'è davvero; il modello locale del telefono non cambia; senza pagine l'attrezzo non si offre.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { creaAiutoTalos } from '../src/kernel/aiuto-talos.mjs';
import { RIGA_AIUTO, talosLavora } from '../src/kernel/talosHarness.mjs';

const aiuto = () => ({ rispondi: async () => ({ testo: 'ok', errore: false }) });
async function primaRichiesta(t, opzioni) {
  const cartella = mkdtempSync(join(tmpdir(), 'd3-'));
  t.after(() => { try { rimuoviCartellaDiProva(cartella); } catch { /* già sparita */ } });
  let corpo = null;
  const fetchDiRete = async (_u, o) => { corpo ??= JSON.parse(o.body); return { ok: true, status: 200, json: async () => ({ choices: [{ message: { role: 'assistant', content: 'ok' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), text: async () => '' }; };
  await talosLavora({ cartella, task: { consegna: 'x' }, modello: 'f', chiave: 'k', fetchDiRete, strumentiEstesi: ['talos_help'], ...opzioni });
  return { sistema: String(corpo.messages[0].content), attrezzi: JSON.stringify(corpo.tools ?? []) };
}

test('D3-1 la riga c\'è solo dove talos_help sta davvero dietro il ponte, e pesa meno del tetto', async (t) => {
  assert.ok((await primaRichiesta(t, { attrezziDifferiti: true, aiutoTalos: aiuto() })).sistema.includes(RIGA_AIUTO));
  assert.equal((await primaRichiesta(t, { attrezziDifferiti: true })).sistema.includes(RIGA_AIUTO), false, 'senza guida niente riga');
  assert.equal((await primaRichiesta(t, { attrezziDifferiti: false, aiutoTalos: aiuto() })).sistema.includes(RIGA_AIUTO), false, 'senza ponte niente riga');
  assert.equal((await primaRichiesta(t, { attrezziDifferiti: true, aiutoTalos: aiuto(), modello: 'locale-ospite:m' })).sistema.includes(RIGA_AIUTO), false, 'il modello locale non cambia');
  assert.ok(Math.ceil(RIGA_AIUTO.length / 4) <= 50, 'tetto di Performance: +50 token');
});

test('D3-2 talos_help resta dietro il ponte: fra gli attrezzi davanti non c\'è, nel catalogo sì', async (t) => {
  const { attrezzi } = await primaRichiesta(t, { attrezziDifferiti: true, aiutoTalos: aiuto() });
  const lista = JSON.parse(attrezzi).map((a) => a.function?.name ?? a.name);
  assert.equal(lista.includes('talos_help'), false);
  assert.match(attrezzi, /talos_help/u, 'il nome sta nel catalogo del ponte');
});

test('D3-3 senza l\'indice delle pagine l\'attrezzo non si offre e la riga non c\'è: mai un errore al modello', async (t) => {
  const vuota = mkdtempSync(join(tmpdir(), 'd3-vuota-'));
  t.after(() => { try { rimuoviCartellaDiProva(vuota); } catch { /* già sparita */ } });
  const senza = creaAiutoTalos({ cartella: vuota, prodotto: 'cli' });
  assert.equal(senza.disponibile(), false);
  const r = await primaRichiesta(t, { attrezziDifferiti: true, aiutoTalos: senza });
  assert.equal(r.sistema.includes(RIGA_AIUTO), false);
  assert.equal(r.attrezzi.includes('talos_help'), false);
  writeFileSync(join(vuota, 'index.json'), '{}');
  assert.equal(senza.disponibile(), true, 'si guarda se c\'è, non si legge');
  /* il telefono legge dagli asset e lo dice lui */
  assert.equal(creaAiutoTalos({ leggiIndice: async () => ({}), disponibileFn: () => false, prodotto: 'android' }).disponibile(), false);
  assert.equal(creaAiutoTalos({ leggiIndice: async () => ({}), prodotto: 'android' }).disponibile(), true);
});

test('R22 disponibile non lancia mai: senza cartella o con un ospite rotto l\'attrezzo resta nascosto e il giro va avanti', async (t) => {
  assert.equal(creaAiutoTalos({ prodotto: 'cli' }).disponibile(), false);
  const rotto = creaAiutoTalos({ leggiIndice: async () => ({}), disponibileFn: () => { throw new Error('asset'); }, prodotto: 'android' });
  assert.equal(rotto.disponibile(), false);
  const estraneo = { rispondi: async () => ({ testo: 'ok', errore: false }), disponibile: () => { throw new Error('ospite'); } };
  const r = await primaRichiesta(t, { attrezziDifferiti: true, aiutoTalos: estraneo });
  assert.equal(r.attrezzi.includes('talos_help'), false);
});
