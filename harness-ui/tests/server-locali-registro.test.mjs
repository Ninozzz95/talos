/*
 * ⭐ Owner 27/10/2026, server locali — il filo intero nel REGISTRO: un comando vivo della conversazione (registrato dal giro come per lo
 *   Stop per riga) ha una porta in ascolto ⇒ evento durevole `talos.server-locale` «pronto» e la rotta della striscia lo elenca; il comando
 *   finisce ⇒ «fermato». Lettore delle porte e sonda finti; la rotta è quella vera. Al contrario: senza lettore, niente.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { creaChiamataInterna } from '../src/remoto/chiamata-interna.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';

function banco({ conLettore = true } = {}) {
  const porte = new Map();
  const rispondono = new Set();
  const giri = [];
  const registro = createSessionRegistry({
    guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
    preparaEsecuzioneFn: (taskId) => {
      if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
      return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'avvia il server' } };
    },
    avviaSessioneFn: (input) => {
      let risolvi;
      const fine = new Promise((r) => { risolvi = r; });
      giri.push({ input, risolvi });
      input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${giri.length}` });
      return fine;
    },
    ...(conLettore ? {
      lettorePorteServerLocali: { leggi: async ({ pid }) => ({ perPid: new Map(pid.map((p) => [p, porte.has(p) ? porte.get(p) : null])), perMarcatore: new Map() }) },
      sondaServerLocaliFn: async (porta) => (rispondono.has(porta) ? `http://127.0.0.1:${porta}` : null),
      intervalloServerLocaliMs: 60_000,
    } : {}),
  });
  const { sessionId } = registro.avvia('task-vero', { permessiScelto: 'Workspace write' });
  const chiama = creaChiamataInterna({ httpApp: createHttpApp({ staticHandler: async () => null, sessionRegistry: registro }), porta: 4999 });
  return { registro, sessionId, giri, porte, rispondono, chiama };
}
const eventi = (b) => b.registro.esporta(b.sessionId).eventi.filter((e) => e.name === 'talos.server-locale').map((e) => e.value);
const calma = () => new Promise((r) => setTimeout(r, 10));

test('SL-REG-01 un comando vivo con una porta in ascolto: «pronto» nella storia e nella rotta; finito il comando, «fermato»', async () => {
  const b = banco();
  const togli = b.giri[0].input.registraComandoFermabile({ toolCallId: 'call-dev', ferma: () => {}, pid: () => 4242 });
  b.porte.set(4242, [5173]);
  b.rispondono.add(5173);
  await b.registro.campionaServerLocaliOra();
  await calma();
  assert.deepEqual(eventi(b).map((e) => [e.porta, e.stato, e.toolCallId]), [[5173, 'pronto', 'call-dev']]);
  const r = await b.chiama({ metodo: 'GET', percorso: `/api/v1/sessions/${b.sessionId}/local-servers` });
  assert.equal(r.stato, 200);
  assert.deepEqual(r.dati.server.map((s) => [s.porta, s.stato, s.origine]), [[5173, 'pronto', 'http://127.0.0.1:5173']]);
  togli(); // il comando è finito
  b.porte.delete(4242);
  b.rispondono.delete(5173);
  await b.registro.campionaServerLocaliOra();
  await calma();
  assert.deepEqual(eventi(b).map((e) => e.stato), ['pronto', 'fermato']);
});

test('SL-REG-02 AL CONTRARIO: senza lettore delle porte non si sorveglia niente, e la rotta dice una lista vuota', async () => {
  const b = banco({ conLettore: false });
  b.giri[0].input.registraComandoFermabile({ toolCallId: 'call-dev', ferma: () => {}, pid: () => 4242 });
  await b.registro.campionaServerLocaliOra();
  assert.deepEqual(eventi(b), []);
  const r = await b.chiama({ metodo: 'GET', percorso: `/api/v1/sessions/${b.sessionId}/local-servers` });
  assert.deepEqual(r.dati.server, []);
  await assert.rejects(b.chiama({ metodo: 'GET', percorso: '/api/v1/sessions/non-esiste/local-servers' }), { code: 'NOT_FOUND' });
});
