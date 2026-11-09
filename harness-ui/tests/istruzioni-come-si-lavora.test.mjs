/*
 * I due blocchi del prompt di base (`in-corso/PROPOSTA-COME-SI-LAVORA-2026-10-31.md`, sì di Desktop, CLI e Mobile, owner 1/11/2026).
 * Testo uguale coi modelli in cloud; coi modelli locali del telefono niente, finché non sono misurati.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';

const enc = new TextEncoder();
const FINE = 'Finish the job\n- Stay on the task until what was asked is actually done.';
const COME = 'How to work\n- Each reply costs a full round trip.';
const CONTROLLI = '- Never weaken, skip or delete a check to make it pass, and never report a result you did not get.';

async function primaRichiesta(modello, extra = {}) {
  let corpo = null;
  const fetchDiRete = async (_u, o) => {
    corpo ??= JSON.parse(o.body);
    return new Response(new ReadableStream({ start(c) {
      c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Fatto.' } }] })}\n\n`));
      c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`));
      c.enqueue(enc.encode('data: [DONE]\n\n'));
      c.close();
    } }));
  };
  await talosLavora({ cartella: cartellaDiProva('talos-come-'), task: { consegna: 'fai' }, modello, chiave: 'y', onDelta: () => {}, fetchDiRete, ...extra });
  return corpo.messages[0].content;
}

test('COME-01 coi modelli in cloud i due blocchi ci sono, dopo le istruzioni di base', async () => {
  const sistema = await primaRichiesta('openrouter:z-ai/glm-5.3-flash');
  assert.ok(sistema.includes(FINE));
  assert.ok(sistema.includes(COME));
  assert.ok(sistema.includes(CONTROLLI), 'la frase contro i risultati finti è la condizione del Desktop e della CLI');
  assert.ok(sistema.indexOf('You are a coding agent') < sistema.indexOf('Finish the job'));
  assert.ok(sistema.indexOf('Finish the job') < sistema.indexOf('How to work'));
});

test('COME-02 AL CONTRARIO: coi modelli locali del telefono niente', async () => {
  const sistema = await primaRichiesta('locale-ospite:qwen');
  assert.ok(sistema.includes('You are a coding agent'));
  assert.equal(sistema.includes('Finish the job'), false);
  assert.equal(sistema.includes('How to work'), false);
});

test('COME-03 il testo non cambia fra un modello e l\'altro in cloud: il prefisso resta uguale', async () => {
  const a = await primaRichiesta('openrouter:z-ai/glm-5.3-flash');
  const b = await primaRichiesta('chatgpt:gpt-6-luna');
  const blocchi = (t) => t.slice(t.indexOf('Finish the job'), t.indexOf('- Prove the change'));
  assert.equal(blocchi(a), blocchi(b));
});

test('COME-04 l\'eccezione dei file adottati non toglie i blocchi', async () => {
  const sistema = await primaRichiesta('openrouter:z-ai/glm-5.3-flash', { fileAdottatiDallaPersona: true });
  assert.ok(sistema.includes(FINE));
  assert.ok(sistema.includes(COME));
});

/* 05/11/2026, voce M3 della cura per Luna 6 (forma `FORMA-CURA-COMPATTAZIONE-LUNA-2026-11-05.md` §2b; OK di CLI, Performance e Mobile §8):
   al banco del 04/11 Luna vedeva una lettura accorciata e, per la riga «Do not read again what you can still see», non la rileggeva. */
test('COME-05 (M3, red before the cure): "do not read again" holds only for what is visible in full', async () => {
  const sistema = await primaRichiesta('chatgpt:gpt-6-luna');
  assert.ok(sistema.includes('- Do not read again what you can still see in full; a result marked as shortened is not fully visible.'));
  assert.equal(sistema.includes('- Do not read again what you can still see.'), false);
});
