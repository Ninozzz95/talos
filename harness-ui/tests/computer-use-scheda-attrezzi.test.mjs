/*
 * La scheda degli attrezzi e il computer use spento (revisione unica del 03/11/2026, reperto 2; decisioni dell'owner 79 e 80).
 * Il kernel offre `computer_use_places_*` solo se riceve `onLuoghiFn`, e in questa release il registro delle sessioni non glielo passa:
 * il modello non li vede. La scheda però si costruiva da `STRUMENTI_ESTESI_PREDEFINITI` e li mostrava lo stesso: una funzione
 * invisibile che compariva nell'elenco, con una promessa falsa («il modello può farlo»).
 * Si prova nei due versi: i due attrezzi spariscono, e gli altri estesi che il kernel dichiara restano tutti (il filtro è quello, non
 * un elenco vuoto). Il kernel finto li dichiara apposta, come fa quello vero.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionRegistry, STRUMENTI_ESTESI_PREDEFINITI } from '../src/session-registry.mjs';
import { ATTREZZI_ESTESI_OPENAI, ATTREZZI_LUOGHI } from '../src/kernel/talosHarness.mjs';

const LUOGHI = ['computer_use_places_list', 'computer_use_places_remove'];
const ALTRI = ['goal_status', 'file_changes_undo'];
const voce = (nome) => ({ nome, descrizione: `descrizione di ${nome}`, tokenSchemaStimati: 40 });
const KERNEL = { base: [voce('shell')], estesi: [...LUOGHI, ...ALTRI].map(voce) };
const registro = () => createSessionRegistry({ modello: 'm', chiave: 'k', attrezziKernelFn: async () => KERNEL, ricercaWebFn: () => ({ ricercaWeb: null }) });

test('SCHEDA-LUOGHI-01: spento, la scheda degli attrezzi non elenca i due attrezzi dei luoghi', async () => {
  const { attrezzi } = await registro().elencaAttrezziPredefiniti();
  const nomi = attrezzi.map((a) => a.nome);
  for (const nome of LUOGHI) assert.equal(nomi.includes(nome), false, `${nome} non è offerto al modello e non deve comparire`);
});

test('SCHEDA-LUOGHI-02: AL CONTRARIO — gli altri attrezzi estesi dichiarati dal kernel restano, e la premessa della prova è vera', async () => {
  const { attrezzi } = await registro().elencaAttrezziPredefiniti();
  const nomi = attrezzi.map((a) => a.nome);
  assert.ok(nomi.includes('shell'), 'la parte base resta');
  for (const nome of ALTRI) assert.ok(nomi.includes(nome), `${nome} resta nella scheda`);
  // la prova morde solo se i due nomi arrivano davvero alla scheda: sono fra i predefiniti e fra gli estesi del kernel vero
  for (const nome of LUOGHI) {
    assert.ok(STRUMENTI_ESTESI_PREDEFINITI.includes(nome), `${nome} fra i predefiniti`);
    assert.ok(ATTREZZI_ESTESI_OPENAI.some((a) => (a.function?.name ?? a.name) === nome), `${nome} dichiarato dal kernel`);
  }
  assert.deepEqual([...ATTREZZI_LUOGHI].sort(), [...LUOGHI].sort(), 'il filtro guarda lo stesso insieme del kernel');
});
