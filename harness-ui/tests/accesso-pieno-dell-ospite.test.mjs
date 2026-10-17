/*
 * Richiesta della CLI, 16/10/2026 notte — IL FULL ACCESS DELL'OSPITE. La CLI manda al kernel sempre «On request» e applica Full access
 * da sé (F-P-001), e il modo cambia a sessione aperta (Shift+Tab). La cura di SEG-DOC-REV-01 (`document_create` non scrive un segreto
 * fuori da Full access) guardava solo `livelloAccesso`: nella CLI in Full access avrebbe rifiutato, contro la regola dell'owner
 * («Full access non chiede mai», 12/10). `accessoPienoDellOspite: (voce) => boolean` del registro, chiesta nel momento in cui
 * `onDocumento` decide, con `{ sessionId, radiceId }`. Ogni caso anche AL CONTRARIO.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { avviaSessione } from '../src/agent-service.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function kernelFinto(documenti) {
  return async (input) => {
    for (const d of documenti) d.esito = await input.onDocumento?.(d.argomenti);
    return { comeFinita: 'concluso', detto: 'fatto', messaggiFinali: [], usage: {} };
  };
}

async function accoda(t, opzioni) {
  const cartella = mkdtempSync(join(tmpdir(), 'ospite-pieno-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  writeFileSync(join(cartella, 'credentials.json'), '{"a":1}\n');
  const documenti = [{ argomenti: { format: 'json', title: 'credentials', body: '{"b":2}', mode: 'append' } }];
  await avviaSessione({ cartella, task: { consegna: 'prova' }, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn: kernelFinto(documenti),
    salvaVoceLibreriaFn: async () => ({ id: 'lib-finto' }), livelloAccesso: 'su-richiesta', ...opzioni });
  return { esito: documenti[0].esito, file: readFileSync(join(cartella, 'credentials.json'), 'utf8') };
}

test('OSPITE-PIENO-01 — the host in Full access: a document on a secret is written with no question, even though the kernel level is «On request»', async (t) => {
  let chiamate = 0;
  const { esito, file } = await accoda(t, { accessoPienoDellOspite: () => { chiamate += 1; return true; } });
  assert.equal(esito?.ok, true, JSON.stringify(esito)?.slice(0, 200));
  assert.match(file, /"b":2/u);
  assert.equal(chiamate, 1, 'asked when onDocumento decides');
});

test('OSPITE-PIENO-02 — AL CONTRARIO: the host says no (or there is no host function) ⇒ refused, as before', async (t) => {
  for (const opzioni of [{ accessoPienoDellOspite: () => false }, {}]) {
    const { esito, file } = await accoda(t, opzioni);
    assert.equal(esito?.ok, false, JSON.stringify(opzioni));
    assert.equal(file, '{"a":1}\n');
  }
});

/* Il registro: la funzione dell'ospite riceve { sessionId, radiceId }, una figlia la radice della madre, e una funzione che lancia vale «no». */
function giriFinti() {
  const giri = [];
  return {
    avviaSessioneFn(input) {
      let risolvi;
      const promessa = new Promise((resolve) => { risolvi = resolve; });
      giri.push({ input, risolvi });
      input.onEvento({ type: 'RunStarted', threadId: `t${giri.length}`, runId: `r${giri.length}` });
      return promessa;
    },
    giri,
  };
}

test('OSPITE-PIENO-03 — the registry asks the host with { sessionId, radiceId }; a child gets its root; a throwing host means no', async (t) => {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'ospite-pieno-registro-'));
  const visti = [];
  let lancia = false;
  const finti = giriFinti();
  const registro = createSessionRegistry({
    cartellaStore, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true, guardaWorkspaceFn: () => () => {},
    preparaEsecuzioneFn: () => ({ cartella: cartellaStore, comandoProva: 'npm test', task: { id: 'task', consegna: 'delega' } }),
    avviaSessioneFn: finti.avviaSessioneFn,
    accessoPienoDellOspite: (voce) => { if (lancia) throw new Error('ospite rotto'); visti.push(voce); return voce.radiceId === radice; },
  });
  let radice = null;
  t.after(async () => {
    for (const g of finti.giri) { g.input.onEvento({ type: 'RunFinished' }); g.risolvi({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'ok' }] } }); }
    await registro.chiudi?.({ attesaMassimaMs: 1_000 });
    try { await attendiScritture({ cartellaStore }); } catch { /* pulizia comunque */ }
    rimuoviCartellaDiProva(cartellaStore);
  });
  const { sessionId } = registro.avvia('task', { permessiScelto: 'Workspace write', modalitaOperativaScelta: 'normale' });
  radice = sessionId;
  const madre = finti.giri[0].input;
  assert.equal(madre.accessoPienoDellOspite(), true);
  assert.deepEqual(visti.at(-1), { sessionId, radiceId: sessionId });
  await madre.onDelega('figlia: scrivi un file', cartellaStore);
  const figliaId = registro.elenca().find((s) => s.padreId === sessionId)?.sessionId;
  assert.ok(figliaId, 'premessa: la figlia esiste');
  const figlia = finti.giri.find((g) => g !== finti.giri[0])?.input;
  assert.equal(figlia.accessoPienoDellOspite(), true, 'a child has the mode of its root');
  assert.deepEqual(visti.at(-1), { sessionId: figliaId, radiceId: sessionId });
  lancia = true;
  assert.equal(madre.accessoPienoDellOspite(), false, 'a host function that throws means no');
});

test('OSPITE-PIENO-04 — AL CONTRARIO: without the option the registry passes nothing (the Desktop rule, unchanged)', async (t) => {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'ospite-pieno-assente-'));
  const finti = giriFinti();
  const registro = createSessionRegistry({
    cartellaStore, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true, guardaWorkspaceFn: () => () => {},
    preparaEsecuzioneFn: () => ({ cartella: cartellaStore, comandoProva: 'npm test', task: { id: 'task', consegna: 'prova' } }),
    avviaSessioneFn: finti.avviaSessioneFn,
  });
  t.after(async () => {
    for (const g of finti.giri) { g.input.onEvento({ type: 'RunFinished' }); g.risolvi({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [] } }); }
    await registro.chiudi?.({ attesaMassimaMs: 1_000 });
    try { await attendiScritture({ cartellaStore }); } catch { /* pulizia comunque */ }
    rimuoviCartellaDiProva(cartellaStore);
  });
  registro.avvia('task', { permessiScelto: 'Workspace write', modalitaOperativaScelta: 'normale' });
  assert.equal(finti.giri[0].input.accessoPienoDellOspite, undefined);
});
