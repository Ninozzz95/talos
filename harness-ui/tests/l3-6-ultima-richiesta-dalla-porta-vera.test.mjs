/*
 * L3-6 (13/10/2026, bugfixer) — «l'ultima richiesta» della scheda Contesto, provata DALLA PORTA VERA.
 *
 * Il difetto: il registro passa `onRichiestaSpedita` ad `avviaSessioneFn` (C1, 10/10), l'adattatore lo chiama se lo trova
 * nell'input di `talosLavora` — ma in mezzo `agent-service.mjs` non lo inoltrava. `tests/c1-ultima-richiesta.test.mjs` restava
 * verde perché i suoi stub chiamano `input.onRichiestaSpedita` a mano: una prova che non passa dal servizio.
 *
 * Qui la catena è quella di `server.mjs`: registro VERO → `avviaSessione` VERO → adattatore VERO → un kernel finto che fa UNA
 * richiesta di chat a un fornitore finto. Nessuna rete, nessun modello.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { avviaSessione } from '../src/agent-service.mjs';
import { createOwnerRuntimeAdapter } from '../src/runtime-owner-adapter.mjs';
import { createSessionRegistry as createSessionRegistryReale, EVENTO_RICHIESTA_DEL_GIRO } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const URL_CHAT = 'https://openrouter.ai/api/v1/chat/completions';
const corpo = { model: 'z-ai/glm-5.3-flash', messages: [{ role: 'system', content: 'sistema' }, { role: 'user', content: 'ciao' }], tools: [{ type: 'function', function: { name: 'leggi', parameters: {} } }], stream: true };

function preparaEsecuzioneFinta(taskId) {
  if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
  return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } };
}

/** La catena di `server.mjs:638`, col solo fornitore sostituito. `kernel` è il `talosLavora` finto. */
function catena({ cartellaStore, kernel, richieste }) {
  const adattatore = createOwnerRuntimeAdapter({ importFn: async () => ({ talosLavora: kernel, SUPPORTA_AMBIENTE_COMANDI: 1, SUPPORTA_OUTPUT_PROCESSI: 1, SUPPORTA_METADATA_OUTPUT_PROCESSI: 1 }) });
  const fornitoreFinto = async (url, init) => { richieste.push({ url: String(url), body: init?.body }); return Response.json({}); };
  return createSessionRegistryReale({
    guardaWorkspaceFn: () => () => {},
    cartellaStore, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k',
    avviaSessioneFn: (input) => avviaSessione({
      ...input,
      talosLavoraFn: (runtimeInput) => adattatore.talosLavora({ ...runtimeInput, fetchDiRete: fornitoreFinto }),
    }),
  });
}

async function fino(condizione, { ms = 5000 } = {}) {
  const fine = Date.now() + ms;
  while (Date.now() < fine) { if (condizione()) return true; await new Promise((r) => setTimeout(r, 10)); }
  return condizione();
}

test('L3-6-01: registry → agent-service → adapter → provider: the request that leaves reaches the Context tab', async () => {
  const cartellaStore = cartellaDiProva('talos-l3-6-');
  try {
    const richieste = []; const visti = [];
    const registro = catena({
      cartellaStore, richieste,
      kernel: async (input) => {
        await new Promise((r) => setTimeout(r, 20)); // dopo che la prova si è iscritta
        await input.fetchDiRete(URL_CHAT, { body: JSON.stringify(corpo) });
        return { comeFinita: 'concluso', detto: 'fatto', messaggiFinali: [] };
      },
    });
    const { sessionId } = registro.avvia('task-vero');
    const via = registro.iscriviti(sessionId, (evento) => visti.push(evento));
    await fino(() => richieste.length > 0);
    // il controllo positivo: la richiesta È partita verso il fornitore finto (senza questo, un «niente» qui sotto non direbbe nulla)
    assert.equal(richieste.length, 1, 'il kernel finto ha fatto la sua richiesta');
    await fino(() => registro.leggiUltimaRichiesta(sessionId) != null);
    const ultima = registro.leggiUltimaRichiesta(sessionId);
    assert.ok(ultima, 'il registro ha ricevuto la richiesta spedita');
    assert.equal(ultima.model, corpo.model);
    assert.deepEqual(ultima.messages, corpo.messages);
    assert.deepEqual(ultima.ripartizione.categorie.map((c) => c.id), ['system', 'tools', 'conversation']);
    await fino(() => visti.some((e) => e.type === 'CUSTOM' && e.name === EVENTO_RICHIESTA_DEL_GIRO));
    assert.equal(visti.filter((e) => e.type === 'CUSTOM' && e.name === EVENTO_RICHIESTA_DEL_GIRO).length, 1, 'chi è connesso lo vede dal vivo, una volta');
    via?.();
    await attendiScritture({ cartellaStore, sessionId });
  } finally { await rimuoviCartellaDiProva(cartellaStore); }
});

test('L3-6-02: the other way round — a giro that sends nothing leaves nothing; a caller without the callback changes nothing', async () => {
  const cartellaStore = cartellaDiProva('talos-l3-6-');
  try {
    const richieste = [];
    const registro = catena({ cartellaStore, richieste, kernel: async () => ({ comeFinita: 'concluso', detto: 'fatto', messaggiFinali: [] }) });
    const { sessionId } = registro.avvia('task-vero');
    await attendiScritture({ cartellaStore, sessionId });
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(richieste.length, 0);
    assert.equal(registro.leggiUltimaRichiesta(sessionId) ?? null, null, 'nessuna richiesta spedita ⇒ niente da mostrare');
  } finally { await rimuoviCartellaDiProva(cartellaStore); }
  /* chi chiama il servizio SENZA il callback (la CLI di ieri, il banco): al kernel non arriva nessuna chiave nuova */
  let visto = null;
  await avviaSessione({ cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k', onEvento: () => {},
    talosLavoraFn: async (input) => { visto = input; return { comeFinita: 'concluso', detto: 'fatto' }; } });
  assert.equal(Object.hasOwn(visto, 'onRichiestaSpedita'), false);
  /* e chi lo passa lo ritrova IDENTICO (nessuna logica in mezzo) */
  const mio = () => {};
  await avviaSessione({ cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k', onEvento: () => {}, onRichiestaSpedita: mio,
    talosLavoraFn: async (input) => { visto = input; return { comeFinita: 'concluso', detto: 'fatto' }; } });
  assert.strictEqual(visto.onRichiestaSpedita, mio);
});
