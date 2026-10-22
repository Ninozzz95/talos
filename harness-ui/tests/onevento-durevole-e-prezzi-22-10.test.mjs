/*
 * 22/10/2026 — due difetti dalla suite intera della CLI (0.6.13), stesso giro della cura del /compact.
 *  1. L'involucro di `onEvento` nel registro (B1, «Skip the summary») chiamava `broadcast` senza `return`: `broadcast` torna la promessa
 *     della scrittura durevole, quindi ogni `await onEvento(…, { durable: true })` di agent-service non aspettava più il disco, e una
 *     scrittura fallita diventava un rifiuto non gestito. Misurato dalla CLI: col motore del contesto che rifiuta un riassunto, il
 *     RunFinished arrivava dopo la prima richiesta e il secondo tentativo, pagato, cadeva fra due giri senza essere contato.
 *  2. I prezzi del fornitore DeepSeek dicevano `fonte: 'nessuna'` mentre le righe hanno la loro fonte: la CLI mostrava «fonte nessuna».
 * Registro VERO, giro finto, TEMP privata.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { REGISTRO_FORNITORI } from '../src/provider-registry.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture, registraRiga } from '../src/session-store.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function preparaEsecuzioneFinta(taskId) {
  if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
  return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } };
}

function ambiente(t, { fallisci = false } = {}) {
  const cartellaStore = cartellaDiProva('talos-onevento-durevole-');
  let rilascia;
  const trattenuta = new Promise((ok) => { rilascia = ok; });
  /* la scrittura dell'evento di prova resta trattenuta finché la prova non la rilascia (o fallisce); le altre passano */
  const registraRigaFn = async (argomenti, ...resto) => {
    if (argomenti?.record?.name === 'talos.prova-durevole') {
      await trattenuta;
      if (fallisci) throw Object.assign(new Error('disco pieno'), { code: 'ENOSPC' });
    }
    return registraRiga(argomenti, ...resto);
  };
  let dentroIlGiro = null;
  const avviaSessioneFn = async (input) => {
    input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r1' });
    dentroIlGiro = input.onEvento({ type: 'CUSTOM', name: 'talos.prova-durevole', value: { n: 1 } }, { durable: true });
    return new Promise(() => {});
  };
  const registro = createSessionRegistry({ guardaWorkspaceFn: () => () => {}, cartellaStore, avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta,
    modello: 'z-ai/glm-5.3-flash', chiave: 'k', registraRigaFn });
  t.after(async () => { rilascia(); await attendiScritture({ cartellaStore }).catch(() => {}); rimuoviCartellaDiProva(cartellaStore); });
  return { registro, rilascia, prende: () => dentroIlGiro };
}

test('ONEVENTO-01 — `onEvento(…, { durable: true })` torna la promessa della scrittura: chi la aspetta aspetta il disco', async (t) => {
  const { registro, rilascia, prende } = ambiente(t);
  registro.avvia('task-vero');
  await new Promise((ok) => setImmediate(ok));
  const promessa = prende();
  assert.equal(typeof promessa?.then, 'function', `onEvento torna ${String(promessa)}: senza la promessa nessuno aspetta il disco`);
  let fatta = false;
  promessa.then(() => { fatta = true; }, () => { fatta = true; });
  await new Promise((ok) => setTimeout(ok, 30));
  assert.equal(fatta, false, 'la scrittura è trattenuta: l\'attesa non è finita');
  rilascia();
  await promessa;
});

test('ONEVENTO-02 — AL CONTRARIO: una scrittura durevole che fallisce arriva a chi aspetta (non un rifiuto non gestito)', async (t) => {
  const { registro, rilascia, prende } = ambiente(t, { fallisci: true });
  const nonGestiti = [];
  const ascolta = (motivo) => { nonGestiti.push(motivo); };
  process.on('unhandledRejection', ascolta);
  t.after(() => process.off('unhandledRejection', ascolta));
  registro.avvia('task-vero');
  await new Promise((ok) => setImmediate(ok));
  const promessa = prende();
  rilascia();
  const esito = await Promise.resolve(promessa).then(() => 'riuscita', (e) => e);
  assert.notEqual(esito, 'riuscita', 'la scrittura è fallita: chi aspetta lo sa');
  await new Promise((ok) => setTimeout(ok, 30));
  assert.deepEqual(nonGestiti.filter((m) => String(m?.message ?? m).includes('disco pieno')), [], 'e non resta un rifiuto non gestito');
});

test('PREZZI-DEEPSEEK-01 — la fonte dei prezzi del fornitore DeepSeek è quella delle sue righe, con la data, non «nessuna»', () => {
  const deepseek = REGISTRO_FORNITORI.deepseek;
  assert.match(deepseek.prezzi.fonte, /^https:\/\/api-docs\.deepseek\.com\//u);
  assert.match(deepseek.prezzi.data, /^\d{4}-\d\d-\d\d$/u);
  const righe = deepseek.modelliNoti.filter((m) => m.prezzi);
  assert.ok(righe.length > 0);
  for (const r of righe) assert.equal(r.fonte, deepseek.prezzi.fonte, r.id);
});
