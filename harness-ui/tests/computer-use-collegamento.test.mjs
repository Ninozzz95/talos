/*
 * Il filo del computer use dal server al nucleo (passo 5, 04/11/2026; lezione del 17/10: un'opzione nuova si prova lungo tutto il filo).
 * agent-service inoltra `onLuoghiFn` e `onComputerUseFn` com'è, e con l'ospite del computer use porta anche `vedeImmaginiFn` (il nucleo
 * offre l'attrezzo solo a un modello che vede). `chiediAlModelloUnaVolta` accetta le parti del messaggio (`contenuto`) al posto del testo.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { avviaSessione, chiediAlModelloUnaVolta } from '../src/agent-service.mjs';

function cattura() {
  let visto = null;
  const talosLavoraFn = async (input) => { visto = input; return { comeFinita: 'concluso', detto: 'fatto' }; };
  return { talosLavoraFn, visto: () => visto };
}
const base = { cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k', onEvento: () => {} };

test('CU-FILO-01: agent-service inoltra onLuoghiFn e onComputerUseFn com\'è, e con l\'ospite anche vedeImmaginiFn', async () => {
  const c = cattura();
  const onLuoghiFn = async () => ({ ok: true, testo: 'x' });
  const onComputerUseFn = async () => ({ ok: true, testo: 'y' });
  const vedeImmaginiFn = async () => true;
  await avviaSessione({ ...base, onLuoghiFn, onComputerUseFn, vedeImmaginiFn, talosLavoraFn: c.talosLavoraFn });
  assert.strictEqual(c.visto().onLuoghiFn, onLuoghiFn);
  assert.strictEqual(c.visto().onComputerUseFn, onComputerUseFn);
  assert.strictEqual(c.visto().vedeImmaginiFn, vedeImmaginiFn, 'senza vedeImmaginiFn il nucleo non offrirebbe mai computer_use');
});

test('CU-FILO-02: AL CONTRARIO — senza gli ospiti il nucleo non li riceve, e vedeImmaginiFn da sola non basta a nulla', async () => {
  const c = cattura();
  await avviaSessione({ ...base, vedeImmaginiFn: async () => true, talosLavoraFn: c.talosLavoraFn });
  assert.equal(typeof c.visto().onLuoghiFn, 'undefined');
  assert.equal(typeof c.visto().onComputerUseFn, 'undefined');
});

test('CU-FILO-03: chiediAlModelloUnaVolta manda le parti del messaggio (testo + immagine) quando arriva «contenuto»; senza, il testo', async () => {
  const corpi = [];
  const fetchDiRete = async (_url, init) => {
    corpi.push(JSON.parse(init.body));
    return { ok: true, status: 200, text: async () => '', json: async () => ({ choices: [{ message: { role: 'assistant', content: ' {"action":"done"} ' } }], usage: { prompt_tokens: 7, completion_tokens: 3 } }) };
  };
  const contenuto = [{ type: 'text', text: 'what next?' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgo=' } }];
  let uso = null;
  const testo = await chiediAlModelloUnaVolta({ modello: 'openai/gpt-x', chiave: 'k', contenuto, fetchDiRete, onConsumo: (u) => { uso = u; } });
  assert.equal(testo, '{"action":"done"}');
  assert.deepEqual(corpi[0].messages.at(-1).content, contenuto);
  assert.deepEqual(uso, { prompt_tokens: 7, completion_tokens: 3 });
  await chiediAlModelloUnaVolta({ modello: 'openai/gpt-x', chiave: 'k', prompt: 'ciao', contenuto: [], fetchDiRete });
  assert.equal(corpi[1].messages.at(-1).content, 'ciao', 'un contenuto vuoto non sostituisce il testo');
});
